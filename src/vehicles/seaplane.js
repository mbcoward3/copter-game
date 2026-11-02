// The seaplane: its numbers, its flight model (updatePlane, run every frame for each seaplane pilot) and its autopilot
// (seaplane-autopilot.js). Moved out of main.js unchanged. createSeaplane takes the game state and helpers it uses,
// none of which it assigns to, and returns updatePlane and the autopilot's planners the rest of the game calls.
//
// Always-forward flight. Hold go to take off and cruise; let go and it glides down and lands on the
// water by itself. It lines up on friends and on the dock, skims past and they hop aboard.
// Everything is driven through smoothed rates (turn rate, speed, climb rate) so nothing ever snaps.
import * as THREE from 'three';
import { WORLD_R, canopyAt, waveHeight } from '../world.js';
import { PLANE_FLOAT } from '../models.js';
import { sfx } from '../audio.js';
import { predictDrop, WATER } from '../firefighting.mjs';
import { angDiff, clamp, damp } from '../math.mjs';
import { createSeaplaneAutopilot } from './seaplane-autopilot.js';

const lerp = THREE.MathUtils.lerp;

export function createSeaplane({
  game, nav, BERTH_RUN, berthLine, berthing, chooseBerth, follow, waterReady, updateFireJob, DOCK, MAX_CARGO,
  SLOTS, waiting, nearestFor, outOfReach, blockedAt, aground, fendOff, pierFend, berthState, deckGap,
  surfaceAt, SURF, SURF2, V, WIND, fx, rate, board, feel, waterAboard, dump, deliverOne, bump, updateCamera
}) {
  const PL = { max: 36, fly: 16, cruise: 30 };      // (cruising at 30 m it is over every hill and tree but the three mountains, which it goes round)
  function landWithin(p, fx_, fz_, dist, t) { const x = p.pos.x + fx_ * dist, z = p.pos.z + fz_ * dist; surfaceAt(x, z, t, SURF2); return SURF2.land ? SURF2.y + canopyAt(x, z) * 0.9 : -1e9; }
  // (in src/vehicles/seaplane-autopilot.js; see the comment at its top)
  const { LANE, APP, glideAlt, landingFor, planeCanReach, planePilot, approachPath, tallAhead, roofAhead } =
    createSeaplaneAutopilot({ game, nav, PL, BERTH_RUN, berthLine, berthing, chooseBerth, follow, waterReady });
  function updatePlane(p, dt, t) {
    const inp = p.input, m = p.plane;
    updateFireJob(p);
    const busy = inp.f !== 0 || inp.t !== 0 || inp.l !== 0;
    // the pilot's own height: up/down keys move the cruising height; the autopilot's descents wait while they are in use
    // once the pilot touches the height keys, height stays theirs until the plane next comes to rest on the water
    if (inp.l !== 0) p.manualT = 1;
    if (p.parked || (p.afloat && Math.abs(p.fs) < 2 && inp.l === 0)) { p.altOff = 0; p.manualT = 0; }
    if (busy) { p.idleT = 0; if (p.parked) { p.parked = false; } } else p.idleT += dt;
    if (p.parked) p.spin = Math.max(0, p.spin - dt * (0.09 + p.spin * 0.28));
    else p.spin = Math.min(1, p.spin + dt * (0.18 + p.spin * 0.5));
    const ready = !p.parked && p.spin > 0.9;

    const fx_ = Math.sin(p.yaw), fz_ = Math.cos(p.yaw);
    const alt = p.pos.y - PLANE_FLOAT;                       // height of the floats above the calm sea
    const dockD = Math.hypot(p.pos.x - DOCK.x, p.pos.z - DOCK.z);
    const room = p.cargo.length + p.incoming < MAX_CARGO;

    // who to fetch: the nearest friend it can, kept until they are aboard (no changing its mind half way through a landing)
    if (p.target && p.target.state !== 'waiting') { if (p.target.claimed === p) p.target.claimed = null; p.target = null; }
    if (!p.pro && !p.target && !p.fireJob && room && !p.unloading) {
      const g = nearestFor(p);
      // (not once it is on its way in to land at home)
      if (g && !g.an.fire && (!p.cargo.length || (dockD > 200 && !(p.ap && p.ap.key === 'dock' && (p.ap.path || p.afloat)) && (g.d < 180 || g.d < dockD * 0.6)))) { p.target = g.an; g.an.claimed = p; }      // (with friends aboard, one more if they are much nearer than home, and home is not just here)
    }
    // ---- the autopilot: where to steer, how fast and how high (see planePilot)
    const ap = p.pro ? null : planePilot(p, t, dt, ready, room);
    const cap = ap ? ap.cap : PL.max;

    // ---- turning: one smoothed turn rate; the bank comes from it. The pilot's own steering always wins outright.
    const maxRate = p.afloat ? (p.pro ? 1.15 : ap && ap.pivot ? 0.85 : 0.3 + 0.85 * clamp(Math.abs(p.fs) / 6, 0, 1)) : p.pro ? 1.5 : p.fireJob && waterReady(p) ? 1.3 : 0.9;      // (the easy one turns on the water by its rudder and engines, so slowly when barely moving: no spinning on the spot)
    let turnCmd = p.pro ? clamp(inp.t - inp.s, -1, 1) : inp.t !== 0 ? inp.t
      : ap && ap.rate !== undefined && !p.afloat ? clamp(ap.rate / maxRate, -1, 1)      // (on a planned curve: its own turn rate)
      : ap && ap.aim ? clamp(angDiff(Math.atan2(ap.aim.x - p.pos.x, ap.aim.z - p.pos.z), p.yaw) * 1.7 - p.yawVel * 0.35, -1, 1) : 0;
    // far out to sea: lean back toward the islands
    const rr = Math.hypot(p.pos.x, p.pos.z);
    if (rr > WORLD_R - 50) { const home = angDiff(Math.atan2(-p.pos.x, -p.pos.z), p.yaw), k2 = clamp((rr - (WORLD_R - 50)) / 45, 0, 1); turnCmd = lerp(turnCmd, clamp(home * 1.5, -1, 1), k2); }
    p.yawVel += (clamp(turnCmd, -1, 1) * (ready ? maxRate : 0) - p.yawVel) * damp(2.6, dt);
    p.yaw += p.yawVel * dt;

    // ---- speed: eased toward what the pilot (and the situation) asks for
    const atDock = (!p.pro && p.berthed && (p.cargo.length > 0 || p.unloading > 0)) || (p.afloat && p.incoming > 0);      // (moored, it waits while everyone gets off; and it waits while someone climbs aboard)
    // on the water, ease to a stop before a beach instead of bumping into it
    let shore = 1;
    if (alt < 3) { if (blockedAt(p, fx_, fz_, 7, 6)) shore = 0; else if (blockedAt(p, fx_, fz_, 16, 6)) shore = 0.35; }
    let want = 0;
    if (ready && !atDock) {
      if (inp.f < 0) want = p.afloat ? -5 : PL.fly;
      else if (inp.f > 0 || !p.afloat) want = cap;          // (let go in the air: the autopilot finds a lane and lands)
    }
    // (a beach right ahead on the water: ease off; the routes keep it rare. Not on a take-off run, which has a clear lane)
    if (p.afloat && want > 0 && shore < 1 && p.fs < PL.fly && !(ap && ap.run) && !p.berthing) want *= Math.max(shore, ap && ap.near ? 0 : 0.15);
    // eased near the target speed, and never harder than a gentle push or a firm-but-soft brake
    if (!p.pro) p.fs += clamp((want - p.fs) * 1.6, p.afloat ? -9 : -5, 6.5) * dt;

    const flying = p.fs > PL.fly - 1;
    if (p.pro) {
      // ---- flown by hand, arcade style. In the air it cruises by itself at 32 m/s: W boosts, S eases off, and it settles
      // back to cruise when you let go; diving picks up speed and climbing costs some. It never stalls, so landing is just
      // flying down onto the water, where it settles and slows to a taxi. On the water W drives it along, and held long
      // enough it lifts off by itself.
      let vyT = 0;
      if (p.afloat) {
        // (with a friend close by and room aboard, W taxis up to them; otherwise it is take-off power)
        const taxi = room && waiting.some(an => !an.fire && !outOfReach(an, p) && Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z) < 45);
        const want = !ready || p.incoming ? 0 : inp.f > 0 ? (taxi ? 6 : 30) * inp.f : inp.f < 0 ? 3 * inp.f : 0;
        p.fs += clamp(want - p.fs, -7 * dt, 7 * dt);
        if (inp.f > 0 && !taxi && p.fs > 19) vyT = 7;                             // rotate and climb away
        else if (inp.l > 0 && p.fs > 15) vyT = 6;
      } else {
        vyT = inp.l * (inp.l > 0 ? 11 : 10);
        if (inp.l === 0 && alt < 12) vyT = 4;                                       // hands off, it climbs back to a safe height
        const want = 32 + (inp.f > 0 ? 18 * inp.f : 12 * inp.f) - p.vel.y * 1.4;       // (a dive speeds it up, a climb slows it)
        p.fs += clamp(want - p.fs, -6 * dt, 8 * dt);
        p.fs = Math.max(p.fs, 18);
        let ahead = -1e9;
        for (const sec of [0.6, 1.4, 2.4]) ahead = Math.max(ahead, landWithin(p, fx_, fz_, p.fs * sec, t));
        if (ahead > 2.5) vyT = Math.max(vyT, (ahead + 5 - alt) * 1.6);             // never fly into a hill (beaches and sandbars do not count)
        if (alt < 3 && vyT < 0) vyT = Math.max(vyT, -2.2);                          // a gentle last few metres onto the water
      }
      p.vel.y += (vyT - p.vel.y) * damp(3, dt);
      p.descent = p.vel.y;
    } else {
    // ---- height: cruise when flying, follow the glide slope when landing or scooping, always clear of land
    let landAhead = -1e9;
    // (on a lined-up final, only as far as where it stops: the beach of a friend's sandbar beyond is not a hill to climb)
    // (and down on the water, settling after a touchdown or taxiing, it does not look at all: only a take-off run climbs)
    const look = p.afloat && !(ap && ap.run) ? 0 : ap && ap.look !== undefined ? ap.look : 1e9;
    for (const sec of [0, 0.8, 1.6, 2.6]) landAhead = Math.max(landAhead, landWithin(p, fx_, fz_, Math.min(p.fs * sec, look), t));
    let wantAlt = 0, vyT = 0, steepClimb = false;
    if (flying) {
      const mine = clamp(PL.cruise + p.altOff, 0, 76);
      wantAlt = p.manualT > 0 ? mine : ap ? Math.min(mine, ap.alt) : mine;
      if (landAhead > -1e8) wantAlt = Math.max(wantAlt, landAhead + 9);        // never let a hill come to us
      // nor a tower or a stack: wherever the plane will be in the next few seconds, turning as it is turning,
      // anything standing taller than it within reach of a wingtip has it climb over the top
      // (not on a lined-up final either: the approach to a landing spot is checked clear when the spot is chosen)
      const tall = (p.afloat && !(ap && ap.run)) || (ap && ap.final) ? -1e9 : tallAhead(p, 5);
      if (tall > -1e8) wantAlt = Math.max(wantAlt, tall + 7 - PLANE_FLOAT);
      steepClimb = tall + 7 - PLANE_FLOAT > alt || landAhead + 9 > alt;      // (high ground coming: climb hard)
      // and above everything under where it is going over the next few seconds, by the ceiling chart: straight on, and
      // toward where the autopilot is steering (not on a lined-up final, whose glide is over open water checked clear)
      if (!(ap && ap.final) && !(p.afloat && !(ap && ap.run)) && !(p.afloat && ap && ap.alt <= 0)) {
        const roof = ap && ap.roof !== undefined ? ap.roof : roofAhead(p, ap && ap.aim);
        if (roof + 10 > wantAlt) { wantAlt = roof + 10; if (roof + 10 > alt + 2) steepClimb = true; }
      }
      if (ap && ap.over !== undefined) wantAlt = Math.max(wantAlt, ap.over);     // (over a fire's treetops to drop on it)
    }
    vyT = p.manualT > 0 ? clamp((wantAlt - alt) * 2.2, -9, 9) : clamp((wantAlt - alt) * 2.2, ap && ap.final ? -8 : -6.5, steepClimb ? 12 : 7);
    if (flying && inp.l !== 0) {
      // while a height key is held the plane climbs or dives right away, and levels off where you let go
      vyT = inp.l * 9;
      if (landAhead > -1e8) vyT = Math.max(vyT, (landAhead + 9 - alt) * 2.2);
      p.altOff = clamp(alt + p.vel.y * 0.35 - PL.cruise, -PL.cruise, 60);
    }
    p.vel.y += (vyT - p.vel.y) * damp(inp.l !== 0 ? 3.2 : wantAlt > alt ? 1.8 : 2.6, dt);
    }

    // ---- move
    const px = p.pos.x, pz = p.pos.z;
    const nfx = Math.sin(p.yaw), nfz = Math.cos(p.yaw);
    p.vel.x = nfx * p.fs; p.vel.z = nfz * p.fs;
    p.pos.addScaledVector(p.vel, dt);
    // on the water the floats, bow to stern, stay off the shallows; and, last resort only (the steering above normally keeps
    // us clear), the wingtips stay off anything tall and the floats off the boulders
    const low = p.pos.y - PLANE_FLOAT;
    if (!flying && low < 1.5 && aground(p.pos, px, pz, nfx, nfz, p.fs >= 0 ? 5 : -5)) { p.fs *= Math.max(0, 1 - dt * 3); bump(p, 'shallows'); }
    const tips = fendOff(p.pos, p.yaw, 0, 7.4, low, false), floats = low < 1.5 && fendOff(p.pos, p.yaw, 3.4, 1.8, low, true, false);
    if (tips || floats) bump(p, 'rock');
    if (tips || floats) p.fs *= 1 - damp(2, dt);
    // (and off the piers: hull, floats and wingtips, which are lower than the posts)
    if (low < 1.5 && pierFend(p)) { p.fs *= 1 - damp(2, dt); if (!p.berthing) bump(p, 'pier'); }
    berthState(p);
    surfaceAt(p.pos.x, p.pos.z, t, SURF);
    if (SURF.land && !flying && p.pos.y - SURF.y < PLANE_FLOAT + 1.2) { p.pos.x = px; p.pos.z = pz; p.fs *= Math.max(0, 1 - dt * 3); surfaceAt(px, pz, t, SURF); }
    const floor = (SURF.land ? SURF.y + 1.6 : 0) + PLANE_FLOAT;
    const wasAfloat = p.afloat;
    const wave = waveHeight(p.pos.x, p.pos.z, t);
    if (p.pos.y <= floor) {
      if (!wasAfloat && !SURF.land && p.fs > 7) {
        // splashdown
        for (const sx of [-1.8, 1.8]) fx.splash(p.pos.x - nfz * sx, wave, p.pos.z + nfx * sx, 34, 1.3);
        sfx.splash(1, true); p.shake = 0.6; p.squash = 1;
        if (p.pro) { if (p.descent > -1.5) rate(p, 3, 'Greased it'); else if (p.descent > -3.2) rate(p, 2, 'Good landing', 'Descend below 1.5 m/s'); else rate(p, 1, 'Firm splashdown!', 'Descend below 1.5 m/s'); }
      }
      p.pos.y = floor; p.vel.y = Math.max(p.vel.y, 0);
    }
    p.afloat = !SURF.land && p.pos.y - floor < 0.25;
    if (!p.afloat) p.wetT = 0; else if (!p.incoming && !p.unloading && !p.berthed) p.wetT = (p.wetT || 0) + dt;
    if (wasAfloat && !p.afloat && p.fs > PL.fly - 2) { fx.splash(p.pos.x, wave, p.pos.z, 26, 1.1); }
    p.surfaceY = SURF.y; p.overLand = SURF.land; p.clearance = p.pos.y - floor;
    p.grounded = p.afloat && Math.abs(p.fs) < 8;
    p.landed = p.parked; p.ropeLen = 0.6;

    // ---- taxied up close and slow: the friend swims across and climbs up the float
    if (p.target) {
      const an = p.target, d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
      if ((d < (an.kind === 'islet' ? 30 : an.kind === 'deck' ? 16 : 13) || (p.ap && p.ap.arrived && d < 30)) && p.afloat && Math.abs(p.fs) < 5.5) { board(an, p); p.target = null; }
    }
    // (a pilot taxis right up to them and stops; they swim over)
    if (p.pro && p.afloat && Math.abs(p.fs) < 7.5 && room) for (const an of waiting) {
      if (an.fire || outOfReach(an, p)) continue;
      const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
      if (d < (an.kind === 'islet' ? 24 : 12)) { board(an, p); if (an.kind === 'islet' || d < 7) rate(p, 3, 'Right alongside'); else if (d < 10) rate(p, 2, 'Nice taxiing', 'Come within 7 m'); else rate(p, 1, 'A long swim!', 'Come within 7 m'); break; }
    }
    // ---- the water bomber: skimming fast along the sea fills the tank; passing low over the fire empties it onto them
    if (p.fireJob && !p.attack && p.water < 1 && p.afloat && p.fs > 6 && (p.scoopOpen || 0) > .7) {
      p.water = Math.min(1, p.water + dt / 2.2);
      p.scoopSprayAcc = (p.scoopSprayAcc || 0) + dt * 35;
      while (p.scoopSprayAcc >= 1) {
        p.scoopSprayAcc--;
        for (const side of [-1, 1]) fx.emit(p.pos.x + Math.cos(p.yaw)*side*1.5, wave+.1, p.pos.z-Math.sin(p.yaw)*side*1.5,
          -nfx*5+side*Math.cos(p.yaw)*2, 2+Math.random()*2, -nfz*5-side*Math.sin(p.yaw)*2, .8,.94,1,.7,.4,.7,9,0,2);
      }
      if (p.water >= 1) waterAboard(p);
    }
    if (p.water >= 0.99 && !p.attack && !p.afloat && p.fireJob) {
      const F = p.fireJob.fire, aim = p.fireAim;
      const hit = predictDrop({ x: p.pos.x, y: p.pos.y - 1.3, z: p.pos.z }, p.vel, aim.y, 'plane', WIND);
      // Start early: the tank lays a continuous strip across the front, rather than a single magic hit.
      const ahead = Math.max(0, p.fs) * WATER.plane.duration * 0.45;
      if ((Math.hypot(hit.x + nfx * ahead - aim.x, hit.z + nfz * ahead - aim.z) < 9 && p.pos.y > aim.y + 1) || (p.pro && inp.w)) dump(p, p.fireJob);
    }
    // ---- home: friends hop out along the pier
    p.dropCd -= dt;
    // (moored: out of the door, across the wing float and up onto the pier, one by one. A pilot brings it alongside and
    // stops, the door side to the pier for the shortest hop)
    if (p.cargo.length && p.afloat && p.dropCd <= 0 && (p.pro ? Math.abs(p.fs) < 3 && deckGap(p) < 3 : p.berthed)) { if (p.pro && !p.unloading) { const g = deckGap(p); rate(p, g < 1.2 ? 3 : 2, g < 1.2 ? 'Neat mooring' : 'Moored', 'Pier gap below 1.2 m'); } deliverOne(p); p.dropCd = 0.45; }
    if (!p.parked && p.afloat && Math.abs(p.fs) < 1 && p.idleT > 3 && !p.cargo.length && !p.incoming && dockD < 70) { p.parked = true; }
    p.mode = p.target || p.incoming ? 'pickup' : (p.cargo.length && dockD < 130 ? 'deliver' : 'idle');

    // ---- how it looks: coordinated bank, nose follows the flight path, floats ride the swell
    for (const pr of m.props) pr.rotation.z += p.spin * 46 * dt;
    m.discMat.opacity = 0.3 * p.spin * p.spin; m.bladeMat.opacity = m.tipMat.opacity = 1 - 0.82 * p.spin * p.spin;
    const air = clamp(p.clearance / 2.5, 0, 1);
    p.sea += ((1 - air) - p.sea) * damp(3, dt);                               // 1 = sitting on the water, 0 = airborne
    const planing = clamp(p.fs / PL.fly, 0, 1);
    const pt = -Math.atan2(p.vel.y, Math.max(p.fs, 10)) * 0.85 - p.sea * planing * 0.075;
    const rt = clamp(-Math.atan(p.yawVel * Math.max(p.fs, 0) / 9.8) * lerp(0.9, 0.12, p.sea), p.pro ? -1.05 : -0.6, p.pro ? 1.05 : 0.6);
    p.pitch += (pt - p.pitch) * damp(2.2, dt); p.roll += (rt - p.roll) * damp(2.0, dt);
    // (the tail surfaces show what the pilot asks: rudder into the turn, elevators up for a climb; small and smooth)
    m.rudder.rotation.y += (clamp(-p.yawVel * 0.45, -0.32, 0.32) - m.rudder.rotation.y) * damp(6, dt);
    m.elevator.rotation.x += (clamp(-pt * 1.1 + (p.pitch - pt) * 1.5, -0.3, 0.3) - m.elevator.rotation.x) * damp(5, dt);
    p.shake = Math.max(0, p.shake - dt * 2.4); p.squash = Math.max(0, p.squash - dt * 1.7);
    const rumble = p.sea * p.spin * (1.15 - 0.75 * p.spin) * 0.05;
    const J = () => (Math.random() - 0.5) * rumble;
    const sq = -0.25 * p.squash * Math.sin((1 - p.squash) * 8.5);
    const calm = p.sea * (1 - 0.7 * planing);                                 // bob and rock fade as it gets up on the step
    const rock = Math.sin(t * 1.4 + p.idx) * 0.035 * calm;
    // (on the water the floats lie along the swell: bow up a crest, one float lifted as a wave runs under it)
    let swellP = 0, swellR = 0;
    if (calm > 0.01) {
      const wf = waveHeight(p.pos.x + nfx * 3.4, p.pos.z + nfz * 3.4, t), wb = waveHeight(p.pos.x - nfx * 3.4, p.pos.z - nfz * 3.4, t);
      const ws = waveHeight(p.pos.x - nfz * 1.8, p.pos.z + nfx * 1.8, t), wo = waveHeight(p.pos.x + nfz * 1.8, p.pos.z - nfx * 1.8, t);
      swellP = -(wf - wb) / 6.8 * 0.8 * calm; swellR = (ws - wo) / 3.6 * 0.6 * calm;
    }
    m.group.position.set(p.pos.x + J(), p.pos.y + wave * 0.55 * calm + sq + J() * 0.5, p.pos.z + J());
    m.group.rotation.set(p.pitch + swellP + Math.cos(t * 1.1 + p.idx) * 0.01 * calm + J() * 0.3, p.yaw, p.roll + swellR + rock * 0.5 + J() * 0.4);

    // drips off the hull and the drop doors in the air, after a scoop and after a water drop (the bucket does the same)
    p.dripT = Math.max(0, (p.dripT || 0) - dt);
    if (p.dripT > 0 && !p.afloat) {
      p.dripAcc = (p.dripAcc || 0) + dt * 16 * Math.min(1, p.dripT);
      if (p.dripAcc >= 1) m.group.updateWorldMatrix(true, false);
      while (p.dripAcc >= 1) { p.dripAcc--; V.set((Math.random() - 0.5) * 0.9, -1.85, (Math.random() - 0.5) * 3).applyMatrix4(m.group.matrixWorld); fx.emit(V.x, V.y, V.z, p.vel.x * 0.85, -1, p.vel.z * 0.85, 0.8, 0.92, 1, 0.75, 0.16 + Math.random() * 0.1, 0.9, 9.8, 0.3); }
    }
    // spray off the floats while on the water
    if (p.afloat && Math.abs(p.fs) > 2) {
      p.washAcc += dt * Math.abs(p.fs) * 6;
      while (p.washAcc > 1) {
        p.washAcc -= 1;
        const sx = Math.random() < 0.5 ? -1.8 : 1.8, back = 1 + Math.random() * 3, out = (Math.random() - 0.3) * Math.sign(sx);
        fx.emit(p.pos.x - nfz * sx - nfx * back, wave + 0.1, p.pos.z + nfx * sx - nfz * back, -nfz * out * 4 + nfx * p.fs * 0.25, 1.5 + Math.random() * p.fs * 0.14, nfx * out * 4 + nfz * p.fs * 0.25, 0.92, 0.97, 1, 0.55, 0.3 + Math.random() * 0.45, 0.6 + Math.random() * 0.6, 9, 1.2);
      }
    }
    // lights
    const blink = (t * 1.2 + p.idx * 0.5) % 1, on = p.spin > 0.03 ? 1 : 0;
    m.strobe.material.emissiveIntensity = blink < 0.08 ? 14 * on : 0;
    m.beacon.material.emissiveIntensity = blink > 0.5 && blink < 0.62 ? 9 * on : 0.3;
    // riders jiggle
    p.cargo.forEach((an, i) => { if (an.state !== 'riding') return; an.model.position.y = SLOTS[i][1] + Math.abs(Math.sin(t * 5 + an.phase)) * 0.12; an.model.rotation.z = Math.sin(t * 4 + an.phase) * 0.08; feel(an, 1, 0, dt); });
    // horn
    p.hornCd -= dt;
    if (inp.horn && p.hornCd <= 0) {
      p.hornCd = 0.45; sfx.honk(p.vehicle, p.idx);
      fx.emoji('\u{1F3B5}', p.pos.x, p.pos.y + 4, p.pos.z, 2.2);
      for (const an of waiting) if (an.pos.distanceTo(p.pos) < 90) an.excite = 2.5;
    }
    updateCamera(p, dt, t);
  }
  return { updatePlane, LANE, APP, glideAlt, landingFor, planeCanReach, approachPath };
}

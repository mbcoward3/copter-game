// The fast rescue boat: how it drives (updateBoat, run every frame for each boat pilot), assisted steering included.
// Moved out of main.js unchanged. createBoat takes the game state and helpers it uses, none of which it assigns to.
//
// Stays on the water. Go, turn, back. It slows by itself beside a friend so they can hop in,
// and noses up to the pier to let them out. Same smoothed rates as the seaplane.
import * as THREE from 'three';
import { WORLD_R, waveHeight } from '../world.js';
import { sfx } from '../audio.js';
import { attackPoint, WATER } from '../firefighting.mjs';
import { angDiff, clamp, damp } from '../math.mjs';

const lerp = THREE.MathUtils.lerp;

export function createBoat({
  nav, berthLine, berthStart, berthing, chooseBerth, follow, followWater, updateFireJob, DOCK, MAX_CARGO,
  SLOTS, waiting, nearestFor, outOfReach, inland, burning, blockedAt, aground, fendOff, pierFend, berthState,
  deckGap, fx, rate, board, feel, launchWater, deliverOne, bump, updateCamera
}) {
  const BT = { max: 30 };
  function updateBoat(p, dt, t) {
    const inp = p.input, m = p.boat;
    updateFireJob(p);
    const busy = inp.f !== 0 || inp.t !== 0;
    if (busy) { p.idleT = 0; if (p.parked) { p.parked = false; } } else p.idleT += dt;
    if (p.parked) p.spin = Math.max(0, p.spin - dt * (0.15 + p.spin * 0.5));
    else p.spin = Math.min(1, p.spin + dt * (0.3 + p.spin * 0.8));
    const ready = !p.parked && p.spin > 0.9;
    const fx_ = Math.sin(p.yaw), fz_ = Math.cos(p.yaw);
    const dockD = Math.hypot(p.pos.x - DOCK.x, p.pos.z - DOCK.z);
    const room = p.cargo.length + p.incoming < MAX_CARGO;

    if (p.target && (p.target.state !== 'waiting' || Math.hypot(p.target.pos.x - p.pos.x, p.target.pos.z - p.pos.z) > 160)) { if (p.target.claimed === p) p.target.claimed = null; p.target = null; }
    if (!p.pro && !p.target && !p.fireJob && ready && room && !p.unloading) {
      let bd = 110;
      for (const an of waiting) {
        if (an.fire || outOfReach(an, p) || (an.claimed && an.claimed !== p)) continue;
        const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
        const off = Math.abs(angDiff(Math.atan2(an.pos.x - p.pos.x, an.pos.z - p.pos.z), p.yaw));
        if (d < bd && (off < 1.1 || d < 40)) { bd = d; p.target = an; }
      }
      if (p.target) p.target.claimed = p;
    }
    const guide = !p.pro && !p.target && room ? nearestFor(p) : null;
    // (a fire by the shore: in close to the water's edge below it, for the cannon)
    const fj = !p.pro && p.fireJob;
    // (home with friends aboard: round to the start of its berth's line, then in along it to lie alongside the pier, and
    // there it waits until everyone is off)
    const home = !p.pro && !fj && !p.target && !!p.berth && ((p.cargo.length > 0 && (!room || !guide || guide.d > 160)) || p.unloading > 0);
    p.rescueDestination = home ? 'home' : !fj && (p.target || guide) ? 'friend' : '';
    if (home) chooseBerth(p);
    const Bk = home ? berthing(p) : null;
    if (!home) p.berthing = false;
    const goal = p.pro ? null : fj ? fj.fire.shore : p.target ? p.target.pos : home ? berthStart(p.berth) : guide ? guide.an.pos : null;
    let assist = 0, gd = 1e9, cap = BT.max, routed = false;
    if (Bk && ready) {
      const off = angDiff(Math.atan2(Bk.aim.x - p.pos.x, Bk.aim.z - p.pos.z), p.yaw);
      assist = clamp(off * 1.8, -1, 1); cap = Bk.cap; routed = true; gd = Bk.left;
    } else if (goal && ready) {
      // the way there by water, planned round every island, rock and shoal and through the reef's channel (nav.js); the
      // boat cuts smoothly onto it and round its corners, and eases off for the sharp ones
      const R = home ? follow(p, 'berth', nav.water, goal, 5.5, Math.max(14, Math.abs(p.fs) * 1.3), berthLine(p.berth)) : followWater(p, goal, 5.5, Math.max(14, Math.abs(p.fs) * 1.3));
      const aim = R ? R.aim : goal;
      routed = !!R;
      gd = R ? R.left : Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
      const off = angDiff(Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z), p.yaw);
      if (gd > 7 && (routed || Math.abs(off) < 1.9 || gd > 35)) assist = clamp(off * 1.8, -1, 1);
      cap = Math.min(BT.max, p.target || fj ? 5 + Math.max(0, gd - 9) * 0.5 : 2 + Math.max(0, gd - 15) * 0.4);
      if (routed) cap = Math.min(cap, 7 + 23 * clamp(1.2 - Math.abs(off) * 1.1, 0, 1));
    }

    // steering bites harder once the boat has some way on
    let turnCmd = p.pro ? clamp(inp.t - inp.s, -1, 1) : inp.t !== 0 ? inp.t + assist * 0.35 : (inp.f > 0 ? assist : 0);
    const rr = Math.hypot(p.pos.x, p.pos.z);
    if (rr > WORLD_R - 50) { const home = angDiff(Math.atan2(-p.pos.x, -p.pos.z), p.yaw), k2 = clamp((rr - (WORLD_R - 50)) / 45, 0, 1); turnCmd = lerp(turnCmd, clamp(home * 1.5, -1, 1), k2); }
    // a coast in the way: swing toward open water and follow the shore round, instead of nosing into the beach
    const ownIslet = p.target && p.target.kind === 'islet' && gd < 48;
    p.avoidT = Math.max(0, (p.avoidT || 0) - dt);
    // (only when there is no planned route to follow: a route already goes round all of it)
    if (!p.pro && !routed && ready && p.fs > -0.5 && !ownIslet) {
      // (looking further ahead the faster it goes, so it has room to turn)
      const look = Math.max(16, p.fs * 0.8);
      const blocked = blockedAt(p, fx_, fz_, look) || blockedAt(p, fx_, fz_, 8);
      if (blocked && p.avoidT <= 0) {
        const l = blockedAt(p, Math.sin(p.yaw + 0.9), Math.cos(p.yaw + 0.9), 16), r = blockedAt(p, Math.sin(p.yaw - 0.9), Math.cos(p.yaw - 0.9), 16);
        p.avoidDir = l && !r ? -1 : r && !l ? 1 : (turnCmd >= 0 ? 1 : -1);
      }
      if (blocked) p.avoidT = 1.1;
      if (p.avoidT > 0 && inp.t === 0) turnCmd = blocked ? p.avoidDir : 0;      // turn until clear, then run straight for a moment
    }
    // Holding station for the cannon is intentional, not a cove to reverse out of.
    const fireHolding = !!fj && (gd < 12 || !!p.spray);
    if (fireHolding) p.backT = 0;
    // wedged in a cove with go held and getting nowhere: back out for a moment, turning, then carry on
    p.wedgeT = (p.wedgeT || 0) + dt;
    if (p.wedgeT > 2.5) {
      if (!p.pro && !fireHolding && ready && inp.f > 0 && !p.incoming && p.wedgeAt && Math.hypot(p.pos.x - p.wedgeAt.x, p.pos.z - p.wedgeAt.z) < 2) p.backT = 1.8;
      p.wedgeT = 0; (p.wedgeAt || (p.wedgeAt = new THREE.Vector3())).copy(p.pos);
    }
    if (p.backT > 0) { p.backT -= dt; turnCmd = p.avoidDir || 1; }
    // (setting off from its berth: across the end of the pier, straight on until its stern is clear of it; alongside, nose
    // to the shore, astern, straight out along the berth's line until it has room to swing round without its stern
    // catching the pier)
    const B0 = p.berth, out0 = B0 ? (p.pos.x - B0.x) * Math.sin(B0.h) + (p.pos.z - B0.z) * Math.cos(B0.h) : 0;
    if (B0 && p.berthed && !p.pro && !home && ready && inp.f > 0) p.unberth = true;
    // (and once its stern is past the end of the pier, still going astern, it swings its bow round toward where it is
    // going: going ahead while it turned would carry it back alongside)
    const offGoal = goal ? angDiff(Math.atan2(goal.x - p.pos.x, goal.z - p.pos.z), p.yaw) : 0, pastPier = B0 && out0 <= -B0.clear;
    if (p.unberth && ((B0.through ? out0 >= 10 : out0 <= -(B0.clear + 14) || (pastPier && Math.abs(offGoal) < 0.9)) || home || inp.f <= 0 || p.pro)) p.unberth = false;
    if (p.unberth) turnCmd = !B0.through && pastPier ? -clamp(offGoal * 1.5, -1, 1) : 0;
    // (while the cannon is going, it swings its bow round to face the fire, so the fire is in the picture)
    if (!p.pro && p.spray && inp.t === 0) { const F = p.spray.fire; turnCmd = clamp(angDiff(Math.atan2(F.x - p.pos.x, F.z - p.pos.z), p.yaw) * 1.6, -1, 1); }
    const bite = clamp(Math.abs(p.fs) / 9, 0.45, 1) * (p.fs < -0.5 && !fireHolding ? -1 : 1) * (p.pro ? 1.15 - clamp((Math.abs(p.fs) - 20) / 40, 0, 0.35) : 1);
    p.yawVel += (clamp(turnCmd, -1, 1) * (ready ? 1.35 * bite : 0) - p.yawVel) * damp(2.5, dt);
    p.yaw += p.yawVel * dt;

    // ease off before a beach instead of running aground
    const dir = p.fs >= 0 ? 1 : -1;
    let shore = 1;
    if (p.pro || Bk) shore = 1;      // (the berth's line is clear water, right up to the berth)
    else if (blockedAt(p, fx_ * dir, fz_ * dir, 7, 1.5)) shore = 0; else if (blockedAt(p, fx_ * dir, fz_ * dir, 15, 1.5) || blockedAt(p, fx_ * dir, fz_ * dir, Math.abs(p.fs) * 1.6, 1.5)) shore = 0.3;      // (further ahead the faster it goes)
    const atDock = (!p.pro && p.berthed && (p.cargo.length > 0 || p.unloading > 0)) || p.incoming > 0 || (fj && gd < 12) || !!p.spray;      // (and it lies stopped while someone comes aboard, or while the cannon is going)
    let want = 0;
    if (ready && !atDock) want = inp.f > 0 ? cap : inp.f < 0 ? -7 : 0;
    if (p.backT > 0) want = -6;
    if (p.unberth) want = p.berth.through ? 8 : -5;
    if (shore < 1 && Math.sign(want) === dir && !(p.backT > 0)) want *= Math.max(shore, ownIslet ? 0 : 0.12);   // creep while turning away, so it never just sits there
    if (p.pro) {
      // a throttle and a hull: full power runs it up to 34 m/s, letting go it coasts down on the water's drag, back is astern
      const thrust = !ready || atDock ? 0 : inp.f > 0 ? 7.5 * inp.f : inp.f < 0 ? 6 * inp.f : 0;
      p.fs += (thrust - p.fs * (0.05 + Math.abs(p.fs) * 0.004) - (inp.f === 0 ? p.fs * 0.32 : 0)) * dt;
      if (atDock) p.fs *= 1 - damp(2, dt);
    } else p.fs += clamp((want - p.fs) * 1.8, -11, 8.5) * dt;

    const px = p.pos.x, pz = p.pos.z;
    const nfx = Math.sin(p.yaw), nfz = Math.cos(p.yaw);
    p.vel.set(nfx * p.fs, 0, nfz * p.fs);
    p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
    // the whole hull, bow to stern, slides along any rock it meets; and touching the shallows it slides along whichever way
    // is still deep enough rather than stopping dead
    if (aground(p.pos, px, pz, nfx, nfz, p.fs >= 0 ? 4.8 : -4.6)) { p.fs += clamp(3 - p.fs, -14 * dt, 0); bump(p, 'shallows'); }
    if (fendOff(p.pos, p.yaw, 3.2, 1.6, 0)) { p.fs *= 1 - damp(4, dt); bump(p, 'rock'); }
    if (pierFend(p)) { p.fs *= 1 - damp(3, dt); if (!p.berthing) bump(p, 'pier'); }
    berthState(p);
    const wave = waveHeight(p.pos.x, p.pos.z, t);
    // the hull rides the swell; going fast enough over a big one it leaves the water for a moment
    const rideY = wave * 0.75;
    p.bvy = p.bvy || 0;
    if (p.pos.y <= rideY + 0.02) {
      if (p.air > 0.5 && Math.abs(p.fs) > 12) { fx.splash(p.pos.x, wave, p.pos.z, 30, 1.2); sfx.splash(0.8, true); p.squash = 1; p.shake = 0.6; if (p.pro) rate(p, p.air > 0.8 ? 3 : 2, p.air > 0.8 ? 'Big air!' : 'Airborne!'); }
      p.bvy = (rideY - p.pos.y) / Math.max(dt, 1e-3) * 0.5 + Math.max(0, (waveHeight(p.pos.x + Math.sin(p.yaw) * p.fs * 0.05, p.pos.z + Math.cos(p.yaw) * p.fs * 0.05, t) * 0.75 - rideY) / 0.05) * 0.35;
      p.pos.y = rideY; p.air = 0;
    } else { p.bvy -= 9.8 * dt; p.pos.y += p.bvy * dt; p.air += dt; if (p.pos.y < rideY) p.pos.y = rideY - 0.001; }
    p.afloat = true; p.surfaceY = wave; p.overLand = false; p.clearance = 0; p.ropeLen = 0.6;
    p.grounded = Math.abs(p.fs) < 6; p.landed = p.parked;

    if (p.target) {
      const an = p.target, d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
      if (d < (an.kind === 'islet' ? 26 : an.kind === 'deck' ? 15 : 13) && Math.abs(p.fs) < 6.5) { board(an, p); p.target = null; }
    }
    // (a pilot comes alongside, stops and throws the ring)
    p.throwCd = Math.max(0, (p.throwCd || 0) - dt);
    // (stopped right beside someone, the crew throws without being asked)
    const autoThrow = p.pro && Math.abs(p.fs) < 2 && waiting.some(an => !an.fire && !outOfReach(an, p) && Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z) < 11);
    if (p.pro && (inp.w || autoThrow) && p.throwCd <= 0 && room) {
      p.throwCd = 0.8;
      let best = null, bd = 1e9;
      for (const an of waiting) { if (inland(an) || an.fire) continue; const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z); if (d < bd) { bd = d; best = an; } }
      if (best && bd < (best.kind === 'islet' ? 26 : 17) && Math.abs(p.fs) < 4) { board(best, p); if (bd < 8) rate(p, 3, 'Right alongside'); else if (bd < 12) rate(p, 2, 'Good throw', 'Come within 8 m'); else rate(p, 1, 'Long throw!', 'Come within 8 m'); }
    }
    // ---- the water cannon: stopped (or nearly) close enough to a fire, the crew plays it on the flames until it is out
    const was = p.spray;
    p.spray = null;
    if (ready && Math.abs(p.fs) < 4.5 && !p.cargo.length && !p.incoming) for (const an of waiting) {
      if (burning(an) && an.fire.shore && Math.hypot(an.fire.x - p.pos.x, an.fire.z - p.pos.z) < 52) { p.spray = an; break; }
    }
    if (p.spray) {
      const F = p.spray.fire;
      if (!was) sfx.splash();
      const target = attackPoint(F, p.idx, p.pos);
      if (!was || !p.cannonAim) p.cannonAim = { ...target };
      for (const k of ['x','y','z']) p.cannonAim[k] += (target[k] - p.cannonAim[k]) * damp(2.5, dt);
      const aim = p.cannonAim, src = { x: p.pos.x + nfx * 2.6, y: p.pos.y + 2.6, z: p.pos.z + nfz * 2.6 };
      const distance = Math.hypot(aim.x - src.x, aim.z - src.z), tau = clamp(distance / 30, 0.45, 1.6);
      const direction = Math.atan2(aim.x - src.x, aim.z - src.z), elevation = Math.atan2(aim.y - src.y + 4.905 * tau * tau, distance);
      src.x += Math.sin(direction) * Math.cos(elevation) * 1.28; src.z += Math.cos(direction) * Math.cos(elevation) * 1.28; src.y += Math.sin(elevation) * 1.28;
      p.pumpPressure = Math.min(1, (p.pumpPressure || 0) + dt / 1.2);
      if (F.active > 0 && p.pumpPressure > .15) p.waterStream.update(src, { ...aim, time: tau }, .11 * p.pumpPressure, .28 * p.pumpPressure, p.pumpPressure); else p.waterStream.hide();
      p.jetAcc = (p.jetAcc || 0) + dt;
      if (F.active > 0 && p.pumpPressure >= .95 && p.jetAcc >= 0.08) {
        const dose = Math.min(p.jetAcc, 0.16); p.jetAcc = 0;
        launchWater(p, p.spray, src, { ...aim, time: tau, radius: WATER.boat.radius }, WATER.boat.capacity * dose, 'jet');
      }
      p.boat.monitor.rotation.y = angDiff(Math.atan2(aim.x - src.x, aim.z - src.z), p.yaw);
      p.boat.barrel.rotation.x = -Math.atan2(aim.y - src.y + 4.905 * tau * tau, distance);
      p.sprayT = (p.sprayT || 0) - dt;
      if (p.sprayT <= 0) { p.sprayT = 1.2; sfx.hiss(0.35); }
    }
    if (!p.spray) { p.waterStream.hide(); p.pumpPressure = Math.max(0, (p.pumpPressure || 0) - dt * 2); }
    p.boat.needle.rotation.x = 1.1 - (p.pumpPressure || 0) * 2.2;
    p.boat.crew.rotation.y += angDiff(p.boat.monitor.rotation.y, p.boat.crew.rotation.y) * damp(3, dt);
    p.boat.crew.rotation.x = p.spray ? -.13 + Math.sin(t * 12) * .015 : 0;
    p.dropCd -= dt;
    // ---- home: lying alongside the pier, the friends hop up onto it one by one and walk home (a pilot brings it in
    // alongside and stops; the easy boat ties up at its berth)
    if (p.cargo.length && p.dropCd <= 0 && (p.pro ? Math.abs(p.fs) < 2.5 && deckGap(p) < 2.5 : p.berthed)) { if (p.pro && !p.unloading) { const g = deckGap(p); rate(p, g < 1 ? 3 : 2, g < 1 ? 'Neat docking' : 'Docked', 'Pier gap below 1 m'); } deliverOne(p); p.dropCd = 0.45; }
    if (!p.parked && Math.abs(p.fs) < 1 && p.idleT > 3 && !p.cargo.length && !p.incoming && dockD < 70) { p.parked = true; }
    p.mode = p.target || p.incoming ? 'pickup' : (p.cargo.length && dockD < 120 ? 'deliver' : 'idle');

    // how it sits: bow lifts as it gets on the plane, leans into turns, rides the swell fore-and-aft and side-to-side
    const planing = clamp(Math.abs(p.fs) / 16, 0, 1);
    const wf = waveHeight(p.pos.x + nfx * 3, p.pos.z + nfz * 3, t), wb = waveHeight(p.pos.x - nfx * 3, p.pos.z - nfz * 3, t);
    const ws = waveHeight(p.pos.x - nfz * 1.5, p.pos.z + nfx * 1.5, t), wo = waveHeight(p.pos.x + nfz * 1.5, p.pos.z - nfx * 1.5, t);
    const pt = -(wf - wb) / 6 * 0.7 - planing * 0.1 - clamp((want - p.fs) * 0.006, -0.05, 0.07);
    const rt = clamp(-p.yawVel * Math.abs(p.fs) * 0.014, -0.4, 0.4) + (ws - wo) / 3 * 0.6;
    p.pitch += (pt - p.pitch) * damp(4, dt); p.roll += (rt - p.roll) * damp(3, dt);
    const rumble = p.spin * (1.1 - 0.8 * p.spin) * 0.03;
    const J = () => (Math.random() - 0.5) * rumble;
    m.group.position.set(p.pos.x + J(), p.pos.y + planing * 0.18 + J(), p.pos.z + J());
    m.group.rotation.set(p.pitch + J(), p.yaw, p.roll + J());
    for (const mo of m.motors) mo.rotation.y += (-p.yawVel * 0.35 - mo.rotation.y) * damp(6, dt);

    // rooster tail off the stern and spray from the bow
    const sp = Math.abs(p.fs);
    if (sp > 1.5) {
      p.washAcc += dt * sp * 7;
      while (p.washAcc > 1) {
        p.washAcc -= 1;
        const side = (Math.random() - 0.5) * 2;
        fx.emit(p.pos.x - nfx * 4 - nfz * side * 0.8, wave + 0.15, p.pos.z - nfz * 4 + nfx * side * 0.8, -nfx * sp * 0.3 - nfz * side * 2.5, 1 + Math.random() * sp * 0.2, -nfz * sp * 0.3 + nfx * side * 2.5, 0.92, 0.97, 1, 0.6, 0.3 + Math.random() * 0.5, 0.6 + Math.random() * 0.7, 9, 1.1);
        if (planing > 0.5 && Math.random() < 0.5) { const sd = Math.random() < 0.5 ? -1 : 1; fx.emit(p.pos.x + nfx * 2.2 - nfz * sd * 1.2, wave + 0.2, p.pos.z + nfz * 2.2 + nfx * sd * 1.2, -nfz * sd * (3 + Math.random() * 3) + nfx * sp * 0.4, 1.5 + Math.random() * 2.5, nfx * sd * (3 + Math.random() * 3) + nfz * sp * 0.4, 0.95, 0.98, 1, 0.5, 0.25 + Math.random() * 0.35, 0.5 + Math.random() * 0.5, 10, 1.2); }
      }
    }
    // blue and red flashers
    const blink = (t * 2.2 + p.idx * 0.5) % 1, on = p.spin > 0.03 ? 1 : 0;
    m.strobe.material.emissiveIntensity = blink < 0.5 ? 9 * on : 0.2;
    m.beacon.material.emissiveIntensity = blink >= 0.5 ? 9 * on : 0.2;
    p.cargo.forEach((an, i) => { if (an.state !== 'riding') return; an.model.position.y = SLOTS[i][1] + Math.abs(Math.sin(t * 5 + an.phase)) * 0.12; an.model.rotation.z = Math.sin(t * 4 + an.phase) * 0.08; feel(an, 1, 0, dt); });
    p.hornCd -= dt;
    if (inp.horn && p.hornCd <= 0) {
      p.hornCd = 0.45; sfx.honk(p.vehicle, p.idx);
      fx.emoji('\u{1F3B5}', p.pos.x, p.pos.y + 4, p.pos.z, 2.2);
      for (const an of waiting) if (an.pos.distanceTo(p.pos) < 90) an.excite = 2.5;
    }
    updateCamera(p, dt, t);
  }
  return { updateBoat };
}

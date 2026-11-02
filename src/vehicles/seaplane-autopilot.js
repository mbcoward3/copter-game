// The easy seaplane's autopilot, moved out of main.js unchanged. createSeaplaneAutopilot takes the game state it reads
// (nothing here assigns to it) and returns what the rest of the game calls: planePilot each frame for an assisted
// seaplane, and the planners the radar, fire eligibility and debug hooks use.
//
// What it should visibly do is written down, as numbers, in docs/design/vehicles.md ("Seaplane acceptance"), and checked by
// npm run check and npm run play-check. In short: it comes down on open water as near as it safely can to whoever (or
// whatever fire) it is going to, flown in from a lead-in point well back so it is lined up before it descends (if not,
// it goes round, and after twice round it picks another spot). Then it taxis the rest. It takes off from where it is,
// down whichever clear run of water points most nearly the way it is going. In the air it follows routes round anything
// tall and any high ground (nav.js), climbs straight out after take-off, and climbs over anything coming up.
// The way in: a smooth curve from wherever it is onto a short straight final, then down onto the water. It touches down
// `roll` metres short of where it stops, flies the last `final` metres before that straight and lined up, and comes
// down a steady glide (1 in 6) all the way from cruising height, starting in the turn, so it never levels off and dives.
// Turns are `R` metres round: a gentle bank a small passenger can follow.
import { OBSTACLES, WORLD_R, canopyAt, terrainHeight } from '../world.js';
import { PLANE_FLOAT } from '../models.js';
import { lookAhead } from '../nav.js';
import { dubins, dubinsLength, samplePath, track, pursuitRate } from '../flightpath.mjs';
import { bombingRun } from '../firefighting.mjs';
import { angDiff, clamp } from '../math.mjs';

export function createSeaplaneAutopilot({ game, nav, PL, BERTH_RUN, berthLine, berthing, chooseBerth, follow, waterReady }) {
  const LANE = { roll: 50 };
  const APP = { R: 60, final: 90, glide: 0.16 };
  // how high it is on the way in, `s` metres before touching down
  const glideAlt = s => Math.min(PL.cruise, APP.glide * Math.max(0, s));
  const AIR = { top: 26, need: 22, tight: 12, look: 45 };      // (round anything standing near cruising height or over it; lower hills it flies over)
  const LAND = { room: 12, reach: 250, near: 6, taxi: 140, hop: 140 };       // (water room either side of a landing; how far from the goal it may come down; how near a spot for a friend; how far it will taxi rather than fly)
  // nothing high under the way in, by the ceiling chart: over the final the glide stays well over everything, and for a
  // stretch before it (where the curve onto it may come from straight behind) so does the glide with a bigger margin.
  // (x, z) is the stopping point, (ux, uz) the way it lands.
  function approachClear(x, z, ux, uz) {
    for (let d = LANE.roll; d <= LANE.roll + APP.final + 140; d += 10) {
      const px = x - ux * d, pz = z - uz * d, s = d - LANE.roll;
      if (Math.hypot(px, pz) > WORLD_R - 20) return false;
      const may = s <= APP.final ? Math.max(1.5, glideAlt(s) - 4) : glideAlt(s) - 9;
      if (nav.ceiling(px, pz) > may) return false;
    }
    return true;
  }
  // Where to come down for goal S, and on what heading: the open water nearest S (out to LAND.reach) with a clear run on
  // the water for the final and the roll-out (and, for a scoop, a take-off run ahead of it too), a clear approach before
  // that, and a clear straight taxi on to S. Of those, the one quickest to fly to from `from` ({ x, z }, and h if it is
  // flying: then by the curve it would really fly), and least taxiing after. Returns { x, z, h } (stop by x, z having
  // landed along heading h) or null. `skip` holds spots already tried and given up on. `fly`, if given, says how far
  // it really is to fly in to a spot (or Infinity): the few best by the quick reckoning are then compared by that.
  function landingFor(S, ahead, from, skip, fly) {
    const wet = nav.water.at(S.x, S.z) >= LAND.near ? S : nav.water.open(S.x, S.z, LAND.near, 30);
    if (!wet) return null;
    let best = null, bs = 1e9;
    const back = LANE.roll + APP.final, near = [];
    // (for a friend, near enough to taxi the rest comfortably; for a fire's water, anywhere near it)
    const reach = ahead > 0 ? LAND.reach : LAND.taxi - 20;
    for (let r = 0; r <= reach; r += 20) for (let k = 0; k < (r ? 16 : 1); k++) {
      const a = k * Math.PI / 8 + r * 0.01, qx = wet.x + Math.cos(a) * r, qz = wet.z + Math.sin(a) * r;
      if (nav.water.at(qx, qz) < LAND.room || terrainHeight(qx, qz) > -3) continue;
      if (skip && skip.some(q => Math.hypot(q.x - qx, q.z - qz) < 40)) continue;
      if (r && !nav.water.clear(qx, qz, wet.x, wet.z, LAND.near)) continue;
      for (let hk = 0; hk < 16; hk++) {
        const h = hk * Math.PI / 8, ux = Math.sin(h), uz = Math.cos(h);
        const ex = qx - ux * back, ez = qz - uz * back;
        // (the cheap part of the cost first: it cannot beat the best so far if even a straight line there costs more)
        const crow = Math.hypot(ex - from.x, ez - from.z) + 4 * r;
        if (crow >= bs && !fly) continue;
        if (!nav.water.clear(ex, ez, qx + ux * (ahead + 15), qz + uz * (ahead + 15), LAND.room)) continue;
        if (!approachClear(qx, qz, ux, uz)) continue;
        // (and nothing standing over the run on the water beyond)
        if (ahead > 0 && nav.ceiling(qx + ux * ahead * 0.5, qz + uz * ahead * 0.5) > 2) continue;
        if (ahead > 0 && !clearClimb({ x: qx + ux * (ahead - RUN_FREE), z: qz + uz * (ahead - RUN_FREE) }, h)) continue;      // (and climbing away after a scoop)
        // (flying: the curve round onto the final; still on the water: the way there, and some for turning to it)
        const far = from.h !== undefined ? dubinsLength(from.x, from.z, from.h, ex, ez, h, APP.R) : Math.hypot(ex - from.x, ez - from.z) + 60 * Math.abs(angDiff(Math.atan2(qx - from.x, qz - from.z), h));
        // (and facing the way it will taxi on, so it does not land and then have to turn about on the water)
        const cost = far + 4 * r + (r > 10 ? 25 * Math.abs(angDiff(h, Math.atan2(wet.x - qx, wet.z - qz))) : 0);
        // The actual approach may need a long detour over terrain. Do not let a fixed shortlist of cheap-looking
        // lanes hide a slightly further landing with a much shorter safe flight. The bound includes the final and
        // allows the 15% preference for the lane chosen before takeoff; terrain can only lengthen that flight.
        if (fly) near.push({ x: qx, z: qz, h, r, cost, lower: 0.85 * (far + APP.final) + 4 * r });
        if (cost < bs) { bs = cost; best = { x: qx, z: qz, h }; }
      }
    }
    if (fly && near.length) {
      near.sort((a, b) => a.lower - b.lower);
      let fb = 1e9;
      for (const q of near) {
        if (q.lower >= fb) break;
        const c = fly(q) + 4 * q.r;
        if (c < fb) { fb = c; best = { x: q.x, z: q.z, h: q.h }; }
      }
    }
    return best;
  }
  // can the seaplane get to a friend at (x, z)? (worked out once per place: a landing spot near it exists)
  const planeReach = new Map();
  function planeCanReach(x, z) {
    const key = Math.round(x / 10) + ',' + Math.round(z / 10);
    if (!planeReach.has(key)) planeReach.set(key, !!landingFor({ x, z }, 0, { x, z }));
    return planeReach.get(key);
  }
  function planePilot(p, t, dt, ready, room) {
    const A = p.ap || (p.ap = { key: null, land: null, t: -9, final: false, run: null, air: null, airT: -9, manual: 0, park: null });
    const out = { aim: A.aimPt || (A.aimPt = { x: 0, z: 0 }), cap: PL.max, alt: PL.cruise, look: undefined, over: undefined, run: false, near: false };
    const alt = p.pos.y - PLANE_FLOAT;
    // the pilot steering for themselves: it holds its height and speed and leaves the turning to them, then picks up again
    if (p.input.t !== 0) { A.manual = 1.2; A.final = false; A.run = null; }
    if (A.manual > 0) { A.manual -= dt; out.aim = null; out.cap = p.afloat ? 9 : PL.max * 0.8; out.alt = Math.max(alt, PL.cruise); return out; }
    if (!ready) { out.cap = 0; return out; }

    // ---- what it is doing: a friend, the pier, a fire (scoop or drop), or, let go in the air, just landing
    const F = p.fireJob && p.fireJob.fire;
    A.skim = false; A.taxi = false;
    let kind, goal, key;
    if (F) { kind = waterReady(p) ? 'drop' : 'scoop'; goal = waterReady(p) ? p.fireAim : F.scoop; key = kind + F.x; }
    else if (p.target) { kind = 'pickup'; goal = p.target.pos; key = 'f' + p.target.id; }
    // (home: it lands on the berth's own line where it can, so the roll-out runs on into lying alongside)
    else if ((p.cargo.length || p.unloading) && p.berth) { chooseBerth(p); kind = 'dock'; goal = berthLine(p.berth)[0]; key = 'dock'; }
    else if (p.input.f <= 0 && (A.park || !p.afloat)) {
      // (and it stays a landing through the touchdown and roll-out, bounces and all, until it has slowed on the water)
      // (let go in the air: land on the nearest good lane ahead)
      if (!A.park) { const ahead = { x: p.pos.x + Math.sin(p.yaw) * 220, z: p.pos.z + Math.cos(p.yaw) * 220 }; A.park = nav.water.open(ahead.x, ahead.z, 22, 260) || nav.water.open(p.pos.x, p.pos.z, 22, 400) || { x: p.pos.x, z: p.pos.z }; }
      kind = 'park'; goal = A.park; key = 'park';
    } else { kind = 'free'; goal = null; key = 'free'; }
    p.rescueDestination = kind === 'dock' ? 'home' : kind === 'pickup' ? 'friend' : '';
    if (p.input.f > 0 || (p.afloat && p.fs < 6)) A.park = null;          // (kept through the splash and roll-out)
    // A new rescue or homeward leg gets its own taxi allowance; boarding time on the previous
    // trip must not force a short safe water hop into a takeoff-and-landing circuit.
    if (key !== A.key && (kind === 'pickup' || kind === 'dock')) p.wetT = 0;
    if (key !== A.key) { A.key = key; A.land = null; A.final = false; A.air = null; A.path = null; A.bomb = null; A.arrived = false; A.stallT = null; A.stallAt = null; A.reverseUntil = 0; A.tried = null; A.goes = 0; A.tkSpot = null; A.pre = undefined; }
    // (setting off from its berth: first round, slowly and nearly on the spot, to face away from the pier, so the wing
    // and its float swing clear of the deck)
    if (p.afloat && p.berth && p.berthed && !p.leftBerth && kind !== 'dock' && p.input.f > 0) { A.unberth = true; p.leftBerth = true; }
    if (A.unberth && p.berth.through) {
      // (across the end of the pier: straight on until the wing is well clear of it)
      const B = p.berth, on = (p.pos.x - B.x) * Math.sin(B.h) + (p.pos.z - B.z) * Math.cos(B.h);
      if (kind === 'dock' || on > 18 || !p.afloat) A.unberth = false;
      else { out.aim = { x: p.pos.x + Math.sin(B.h) * 40, z: p.pos.z + Math.cos(B.h) * 40 }; out.cap = 6; out.alt = 0; out.near = true; return out; }
    }
    if (A.unberth) {
      const away = p.berth.leave;
      if (kind === 'dock' || Math.abs(angDiff(p.yaw, away)) < 0.35 || Math.hypot(p.pos.x - p.berth.x, p.pos.z - p.berth.z) > 14 || !p.afloat) A.unberth = false;
      else { out.aim = { x: p.pos.x + Math.sin(away) * 30, z: p.pos.z + Math.cos(away) * 30 }; out.cap = 1.4; out.alt = 0; out.near = true; out.pivot = true; return out; }      // (round on its two engines, one ahead and one astern)
    }
    if (!goal) {
      // nothing to fetch: go held, it takes off down a clear lane the way it is pointing and flies on wherever the pilot
      // steers it (the world's edge turns it back); let go on the water, it waits
      if (p.afloat) { if (p.input.f <= 0) { out.aim = null; out.cap = 0; return out; } out.alt = 0; return takeoff(p, A, out, null); }
      A.run = null; out.aim = null;
      // (straight on, unless something tall stands in the way: then round it)
      const ax = p.pos.x + Math.sin(p.yaw) * 220, az = p.pos.z + Math.cos(p.yaw) * 220;
      if (!nav.air(AIR.top).clear(p.pos.x, p.pos.z, ax, az, AIR.need)) { out.aim = A.aimPt; airRoute(p, A, { x: ax, z: az }, out, AIR.look); }
      return out;
    }

    // A scoop interrupted by a float catching a rock, or a taxi out stopped short by a rock ahead, must not leave it
    // sitting there with power on forever: astern for a moment, and choose again (not that take-off spot again).
    if (p.afloat && p.input.f > 0 && !p.incoming && !p.unloading && !p.berthed && !A.unberth && (kind === 'scoop' || A.tk || A.run !== null)) {
      if (game.t < A.reverseUntil) { out.aim = null; out.cap = -4; out.alt = 0; return out; }
      if (!A.stallAt || Math.hypot(p.pos.x - A.stallAt.x, p.pos.z - A.stallAt.z) > 6) {
        A.stallAt = { x: p.pos.x, z: p.pos.z }; A.stallT = game.t;
      }
      if (game.t - A.stallT > 5) {
        A.reverseUntil = game.t + 2.5; A.stallT = null; A.stallAt = null;
        // tkSpot is cleared once the run begins; retain its origin so recovery avoids that run too.
        const failed = A.tkSpot || A.runSpot;
        if (failed) (A.badSpots ||= []).push({ x: failed.x, z: failed.z });
        A.runSpot = null;
        A.run = null; A.final = false; A.land = null; A.air = null; A.tkSpot = null;
        out.aim = null; out.cap = -4; out.alt = 0; return out;
      }
    } else { A.stallT = null; A.stallAt = null; }

    // ---- a fire with water aboard: by an air route over it, low enough to drop (the drop itself is in updatePlane)
    if (kind === 'drop') {
      if (p.afloat) return takeoff(p, A, out, goal);
      if (!A.bomb) {
        const aim = { ...p.fireAim };
        const from = Math.hypot(p.pos.x - aim.x, p.pos.z - aim.z) > 130 ? p.pos : F.scoop;
        A.bomb = bombingRun(aim, from, WORLD_R); A.bomb.since = t;
        A.air = null;
      }
      const B = A.bomb; p.fireAim = B.aim;
      const dx = B.aim.x - p.pos.x, dz = B.aim.z - p.pos.z, distance = Math.hypot(dx, dz);
      if (B.stage === 'line-up') {
        airRoute(p, A, B.entry, out, 50);
        const entryD = Math.hypot(p.pos.x - B.entry.x, p.pos.z - B.entry.z);
        if (entryD < 180) out.aim = B.entry;
        out.cap = 25;
        if (entryD < 42) { B.stage = 'run'; B.since = t; A.air = null; }
      } else {
        out.cap = 22; out.aim = B.lock || B.aim;
        const error = Math.abs(angDiff(Math.atan2(dx, dz), p.yaw));
        if (!B.lock && distance < 85 && error < 0.28) {
          const h = Math.atan2(dx, dz);
          B.lock = { x: B.aim.x + Math.sin(h) * 160, z: B.aim.z + Math.cos(h) * 160 };
        }
        if (!p.attack && ((B.lock && distance > 95 && (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) < 0) || t - B.since > 24)) {
          A.bomb = null; A.air = null;
        }
      }
      out.over = F.y + 12 - PLANE_FLOAT;
      return out;
    }
    // ---- on the water: taxi to it if it is near enough by water, or else take off (it stays down unless on a take-off run)
    if (p.afloat) {
      out.alt = 0;
      if (kind === 'scoop' && A.final && A.land) {
        // skimming the run: keep straight along it, fill up, and (full) carry on into the take-off
        const h = A.land.h; A.run = h; A.skim = true;
        out.aim = { x: p.pos.x + Math.sin(h) * 80, z: p.pos.z + Math.cos(h) * 80 };
        out.cap = p.water >= 1 ? PL.max : 12; out.run = true;
        if (p.water >= 1) out.alt = PL.cruise; else { out.final = true; out.look = 20; }      // (still skimming: it stays down on the water)
        return out;
      }
      // (home: in along its berth's line, slowing to lie alongside the pier with its door to it)
      const Bk = kind === 'dock' ? berthing(p) : null;
      if (kind !== 'dock') p.berthing = false;
      if (Bk) { A.final = false; A.tk = false; A.taxi = true; A.arrived = false; out.aim = Bk.aim; out.cap = Bk.cap; out.near = true; return out; }
      if (A.run === null && kind !== 'scoop' && kind !== 'park') {
        const R = follow(p, 'taxi', nav.water, goal, 7.5, 16, kind === 'dock' ? [berthLine(p.berth)[1]] : undefined);
        // (taxi only when it is close: further than this, flying there is quicker and nicer to watch, and it is a flying boat)
        // (home, the berth's own way in on top; and a friend just across a point, where a take-off would be a loop round
        // and straight back down, by water too)
        // (but once it has been on the water a while since it last flew, it flies: it is a flying boat, and a small pilot
        // holding go wants to see it in the air)
        // (a friend so close (under 140 m) that a flight would only be a loop round and back down it always taxis to)
        const crow = Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
        const near = R && ((crow < 140 && R.left < 220) || (kind === 'pickup' && p.wetT < 8 && crow < 200 && R.left < 320));
        if (R && (near || R.left < (p.wetT < 15 ? LAND.hop : 60) + (kind === 'dock' ? (p.berth.run || BERTH_RUN) : 0))) {
          A.final = false; A.tk = false; A.taxi = true;
          out.aim = R.aim; out.near = R.left < 40;
          out.cap = clamp(1.5 + (R.left - (kind === 'dock' ? 6 : 10)) * 0.3, 0, 14);      // (up on the step, spray flying, when there is a way to go)
          out.cap = Math.min(out.cap, 4 + 10 * clamp(1.2 - Math.abs(angDiff(Math.atan2(R.aim.x - p.pos.x, R.aim.z - p.pos.z), p.yaw)) * 1.3, 0, 1));      // (and easing off round the corners)
          A.arrived = R.left < 6 || (R.left < 25 && Math.abs(p.fs) < 1);      // (or as near as the water lets it get: they swim the rest)
          return out;
        }
      }
      if (kind === 'park') { out.cap = 0; return out; }
      // (landed for it but it is too far by water after all: that spot is not tried again for this one)
      if (A.land && kind !== 'scoop') { (A.tried ||= []).push({ x: A.land.x, z: A.land.z }); A.land = null; }
      // (the tank fills only on the scoop run chosen by the fire, which holds it down until full: see the skim above)
      // Where it will come down is chosen before it goes, so it takes off down the run that leads most directly onto
      // that landing's final, rather than whichever points at the friend and then a loop round in the air.
      if (A.pre === undefined) A.pre = landingFor(kind === 'scoop' ? F : goal, kind === 'scoop' ? 100 : 0, { x: p.pos.x, z: p.pos.z }, A.tried);
      if (A.pre) { const back = LANE.roll + APP.final; return takeoff(p, A, out, { x: A.pre.x - Math.sin(A.pre.h) * back, z: A.pre.z - Math.cos(A.pre.h) * back, h: A.pre.h }); }
      return takeoff(p, A, out, goal);
    }
    // (just off the water: straight on along the take-off run until it has some height, and only then turn for where it is
    // going; a low turn just after lifting off is how a plane meets the trees on the shore)
    // (a skim that bounces off a wave for a moment is still the skim, not a take-off)
    if (A.run !== null && !(kind === 'scoop' && A.final && !waterReady(p))) { A.climbH = A.run; A.runSpot = null; }
    A.run = null;
    if (A.climbH != null) {
      if (alt < 14) { out.aim = { x: p.pos.x + Math.sin(A.climbH) * 80, z: p.pos.z + Math.cos(A.climbH) * 80 }; out.alt = PL.cruise; return out; }
      A.climbH = null;
    }

    // ---- in the air, to land: a spot chosen once and kept (a pilot who keeps changing their mind never lands), chosen
    // again only if the friend drifts well away from it; then the curve onto its final, and the final
    if (A.land && Math.hypot(goal.x - A.land.gx, goal.z - A.land.gz) > 30) A.land = null;
    // A lane chosen during climb-out may have no flyable approach yet. Once the terrain-avoiding climb has changed
    // our position and height, compare lanes again instead of committing to the first one and an extra circuit.
    const retryApproach = game.t - (A.pathFail ?? -9) > 1 || (kind === 'dock' && alt > (A.pathFailAlt ?? Infinity) + 4);
    if (A.land && !A.path && !A.final && retryApproach) A.land = null;
    if (!A.land) {
      const ahead = kind === 'scoop' ? 100 : 0;      // (skim, fill and lift off: about 100 m of water beyond touching down)
      // (by the length of the path it would really fly; the spot it chose before taking off a little favoured, so it does
      // not change its mind for nothing)
      const pre = A.pre, fly = q => { const P = planApproach(p, alt, q); return P ? P.sTD * (pre && Math.hypot(pre.x - q.x, pre.z - q.z) < 1 && pre.h === q.h ? 0.85 : 1) : Infinity; };
      const L = landingFor(kind === 'scoop' ? F : goal, ahead, { x: p.pos.x, z: p.pos.z, h: p.yaw }, A.tried, fly);
      A.pre = undefined;
      if (L) {
        L.gx = goal.x; L.gz = goal.z;
        A.land = L; A.t = t; A.air = null; A.path = null;
      }
    }
    const L = A.land;
    if (!L) {
      // (nowhere left to land for this friend: let them go for now, for someone else or for later, and fly on)
      if (kind === 'pickup' && p.target) { p.target.claimed = null; p.target.noPlaneUntil = game.t + 30; p.target = null; }
      airRoute(p, A, goal, out, AIR.look); return out;
    }
    const fx = Math.sin(L.h), fz = Math.cos(L.h);
    const TD = { x: L.x - fx * LANE.roll, z: L.z - fz * LANE.roll }, E = { x: TD.x - fx * APP.final, z: TD.z - fz * APP.final };
    // (the path: planned once from here, and again only if it strays well off it or it was blocked)
    // (too high to get down off the curve as it is, it tries joining the final's line further back, for more room to
    // come down; and if nothing works from here, it tries again in a second)
    if (!A.path && retryApproach) {
      A.path = planApproach(p, alt, L);
      if (!A.path) { A.pathFail = game.t; A.pathFailAlt = alt; }
    }
    const Tk = A.trk || (A.trk = {});
    if (A.path) {
      const pts = A.path.pts;
      track(pts, p.pos.x, p.pos.z, A.path.i, clamp(p.fs * 1.1, 22, 40), Tk);
      A.path.i = Tk.i;
      const toTouch = A.path.sTD - Tk.s, lined = Math.abs(angDiff(p.yaw, L.h));
      // (on the final: past its start, near the line and pointing along it)
      if (!A.final && toTouch < APP.final + 5 && Tk.off < 12 && lined < 0.35) A.final = true;
      if (A.final && (Tk.off > 30 || lined > 0.8 || toTouch < -LANE.roll + 10 && p.fs > PL.fly)) {
        // (not lined up after all: round again by a new curve; twice round for the same spot and it picks another)
        A.final = false; A.path = null;
        if ((A.goes = (A.goes || 0) + 1) >= 2) { (A.tried ||= []).push({ x: L.x, z: L.z }); A.land = null; A.goes = 0; }
        return out;
      }
      if (!A.final && (Tk.off > 25 || toTouch < APP.final - 25)) { A.path = null; return out; }      // (blown off it, or past the final unlined: a new curve)
      out.aim.x = Tk.x; out.aim.z = Tk.z;
      out.rate = pursuitRate(p.pos.x, p.pos.z, p.yaw, Math.max(p.fs, 12), Tk);
      // (the height for where it is on the path, or higher for what is coming in the next couple of seconds)
      if (A.final) out.alt = glideAlt(toTouch);
      else { let a = -1e9; for (let j = Tk.i; j < pts.length && pts[j].s - Tk.s < Math.max(p.fs, 16) * 2; j++) a = Math.max(a, pts[j].alt); out.alt = a; }
      if (A.final) {
        out.alt -= 1.5 * (1 - clamp(toTouch / 30, 0, 1));          // (the last bit aimed just under the surface, so it settles rather than floats along)
        out.cap = 20; out.look = Math.max(0, toTouch + LANE.roll - 8); out.final = true;
      } else {
        // (quick while far, and easing to approach speed for the turn in; what stands under the path just ahead, for the
        // height keeping in updatePlane, instead of looking off along the heading, which on a curve points off the path)
        out.cap = toTouch > 700 ? PL.max : toTouch > 320 ? 30 : 24;
        out.look = 30; out.roof = pathRoof(pts, Tk.i, Math.max(p.fs, 16) * 7);
      }
      return out;
    }
    // (no clear curve from here, with a mountain in the way: round it by the air route to a point well back along the
    // final's line and in along it, trying for a curve again every second as it goes)
    airRoute(p, A, { x: E.x - fx * 80, z: E.z - fz * 80 }, out, AIR.look, [E, TD, { x: L.x, z: L.z }]);
    if (Math.hypot(p.pos.x - L.x, p.pos.z - L.z) < 300) out.cap = 30;
    return out;
  }
  // The way in to landing spot L: the curve onto its final; or, too high to get down off that, the curve onto the final's
  // line further back, for more room to come down
  function planApproach(p, alt, L) {
    const fx = Math.sin(L.h), fz = Math.cos(L.h);
    const TD = { x: L.x - fx * LANE.roll, z: L.z - fz * LANE.roll }, E = { x: TD.x - fx * APP.final, z: TD.z - fz * APP.final };
    for (const more of [0, 120, 240]) {
      const P = approachPath(p, alt, { x: E.x - fx * more, z: E.z - fz * more }, L.h, more ? [{ ...E }, { ...TD }, { x: L.x, z: L.z }] : [{ ...TD }, { x: L.x, z: L.z }]);
      if (P) return P;
    }
    return null;
  }
  // The curve from the plane onto a final that starts at E on heading h, then on through `then`, sampled, with the height
  // to fly at each point of it: down the glide toward touching down, but over anything standing under the curve by 10 m
  // (climbing to it in time, well within its climb, and coming down after it no steeper than 1 in 4). Null when that would leave
  // it too high to land off the final, or need it to climb far over cruising height (a mountain: it goes round those).
  // Returns { pts, i, sTD } (sTD: metres along it to touching down); each point has `alt`.
  function approachPath(p, alt, E, h, then) {
    // (the shortest curve first; if that runs over high ground, the next, which may go round the other side of it)
    const shapes = dubins(p.pos.x, p.pos.z, p.yaw, E.x, E.z, h, APP.R, true);
    for (const d of shapes) {
      // (low, just off the water: not one that circles round over the base to gain height, much longer than the
      // shortest; round the high ground instead, trying again for a curve every second as it climbs)
      if (alt < 25 && d.len > shapes[0].len * 1.4 + 120) break;
      const th = then.map(q => ({ ...q })), pts = samplePath(d, 6, th), n = pts.length, sTD = th[th.length - 2].s;
      // (what it must be over: 10 m above anything under the curve before the final, climbing to it in time...)
      for (const q of pts) q.need = sTD - q.s > APP.final ? nav.ceiling(q.x, q.z) + 12 : 0;      // (10 m clear, and a little for the plane lagging the height it is asked for)
      for (let j = n - 2; j >= 0; j--) pts[j].need = Math.max(pts[j].need, pts[j + 1].need - 0.18 * (pts[j + 1].s - pts[j].s));      // (it climbs at about 1 in 4 at most)
      // (...which it must be able to climb to from here, and not too far over cruising height: a mountain it goes round)
      if (pts.some(q => q.need > PL.cruise + 25 || q.need > alt + 4 + 0.2 * q.s)) continue;
      // (and the height to fly at: down the glide, but over all that, coming down after it no steeper than 1 in 4)
      for (const q of pts) q.alt = Math.max(glideAlt(sTD - q.s), q.need);
      for (let j = 1; j < n; j++) pts[j].alt = Math.max(pts[j].alt, Math.min(pts[j - 1].alt, PL.cruise + 25) - 0.25 * (pts[j].s - pts[j - 1].s));
      if (pts.some(q => sTD - q.s <= APP.final && q.alt > glideAlt(sTD - q.s) + 3)) continue;      // (too high to land off the final)
      return { pts, i: 0, sTD };
    }
    return null;
  }
  // the highest thing under a path from point i, `ahead` metres on (by the ceiling chart)
  function pathRoof(pts, i, ahead) {
    let top = -1e9;
    for (let j = i; j < pts.length && pts[j].s - pts[i].s <= ahead; j += 2) top = Math.max(top, nav.ceiling(pts[j].x, pts[j].z));
    return top;
  }
  // the air route to `to` (round anything tall), then on along `then`; steer for a point `look` metres along it
  function airRoute(p, A, to, out, look, then) {
    if (!A.air || game.t - A.airT > 3 || Math.hypot(A.airTo.x - to.x, A.airTo.z - to.z) > 5) {
      // (with room to spare round high ground, so cutting the corners of the route does not cut across a hillside; only
      // where that cannot be found, a tighter one)
      const air = nav.air(AIR.top), r = air.route(p.pos, to, AIR.need, 60) || air.route(p.pos, to, AIR.tight, 60) || [{ x: p.pos.x, z: p.pos.z }, { x: to.x, z: to.z }];
      A.air = then ? r.concat(then) : r; A.airT = game.t; A.airTo = { x: to.x, z: to.z };
    }
    lookAhead(A.air, p.pos.x, p.pos.z, look, out.aim);
  }
  // the top of the tallest thing in the plane's way over the next `secs` seconds, following its turn: a tower, a stack,
  // a hill or the trees on it (or -1e9)
  function tallAhead(p, secs) {
    let top = -1e9;
    for (let s = 0.5; s <= secs; s += 0.5) {
      const h = p.yaw + p.yawVel * s * 0.8, d = Math.max(p.fs, 10) * s;
      // (along the arc it is turning on, roughly)
      const x = p.pos.x + Math.sin(p.yaw + p.yawVel * s * 0.4) * d, z = p.pos.z + Math.cos(p.yaw + p.yawVel * s * 0.4) * d;
      for (const o of OBSTACLES) if (o.top > p.pos.y - PLANE_FLOAT - 6 && (x - o.x) ** 2 + (z - o.z) ** 2 < (Math.max(o.r, o.wr || 0) + 9) ** 2) top = Math.max(top, o.top);
      // (and the hills and treetops under that arc: landAhead only looks dead ahead)
      const gr = terrainHeight(x, z);
      if (gr > 0.5) top = Math.max(top, gr + canopyAt(x, z) + 2);
    }
    return top;
  }
  // the highest the ceiling chart says anything stands under the plane's way over the next 7 seconds, along its heading
  // and toward its aim point
  function roofAhead(p, aim) {
    let top = nav.ceiling(p.pos.x, p.pos.z);
    const v = Math.max(p.fs, 16), ah = aim ? Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z) : p.yaw;
    for (let s = 0.5; s <= 7; s += 0.5) for (const h of [p.yaw, ah, p.yaw + p.yawVel * s * 0.5]) top = Math.max(top, nav.ceiling(p.pos.x + Math.sin(h) * v * s, p.pos.z + Math.cos(h) * v * s));
    return top;
  }
  // is the climb-out beyond a take-off run clear of high ground and trees?
  const RUN_FREE = 130;
  function clearClimb(P, h) {
    const ux = Math.sin(h), uz = Math.cos(h);
    // (it lifts off by the end of the run and climbs at about 1 in 3, over anything the ceiling chart knows of, by 10 m)
    for (let d = RUN_FREE; d <= RUN_FREE + 240; d += 10) if (nav.ceiling(P.x + ux * d, P.z + uz * d) > Math.max(0.5, (d - RUN_FREE) * 0.3 - 10)) return false;
    return true;
  }
  // Where to take off from, heading for `to`: the nearest point on the water (by a straight taxi, out to 300 m) with a
  // clear run of open water and a clear climb beyond it, along whichever heading needs least turning now and afterwards.
  // Returns { x, z, h, r } (r: how far away it is) or null.
  function takeoffSpot(p, to, skip) {
    const dir = to ? Math.atan2(to.x - p.pos.x, to.z - p.pos.z) : p.yaw;
    let best = null, bs = 1e9, foundAt = -1;
    for (let r = 0; r <= 300; r += 25) {
      if (foundAt >= 0 && r > foundAt + 25) break;          // (the first ring with one, and the next, for a better way round)
      for (let k = 0; k < (r ? 16 : 1); k++) {
        const a = k * Math.PI / 8, qx = p.pos.x + Math.sin(a) * r, qz = p.pos.z + Math.cos(a) * r;
        if (r && (nav.water.at(qx, qz) < 10 || !nav.water.clear(p.pos.x, p.pos.z, qx, qz, 5))) continue;
        if (skip && skip.some(q => Math.hypot(q.x - qx, q.z - qz) < 20)) continue;
        for (let hk = 0; hk < 16; hk++) {
          const h = hk * Math.PI / 8;
          // (with a landing's final to fly onto: taxiing, and the curve from the top of the climb-out round onto it)
          const sc = to && to.h !== undefined ? 2 * r + dubinsLength(qx + Math.sin(h) * (RUN_FREE + 70), qz + Math.cos(h) * (RUN_FREE + 70), h, to.x, to.z, to.h, APP.R) + (r ? 0 : 12 * Math.abs(angDiff(h, p.yaw)))
            : r + 30 * Math.abs(angDiff(h, dir)) + (r ? 0 : 12 * Math.abs(angDiff(h, p.yaw)));
          if (sc >= bs) continue;
          if (!nav.water.clear(qx, qz, qx + Math.sin(h) * RUN_FREE, qz + Math.cos(h) * RUN_FREE, 10) || !clearClimb({ x: qx, z: qz }, h)) continue;
          bs = sc; best = { x: qx, z: qz, h, r }; if (foundAt < 0) foundAt = r;
        }
      }
    }
    return best;
  }
  // a take-off: from the take-off spot (taxiing there first if it is not right here), turning to face along its run, then
  // full power down it
  function takeoff(p, A, out, to) {
    if (A.run === null) {
      if (!A.tkSpot || game.t - A.tkSpot.t > 20) { A.tkSpot = takeoffSpot(p, to, A.badSpots); if (A.tkSpot) A.tkSpot.t = game.t; }
      const S = A.tkSpot;
      if (S && (S.r === 0 || Math.hypot(S.x - p.pos.x, S.z - p.pos.z) < 8)) { A.run = S.h; A.runT = game.t; A.runSpot = { x: S.x, z: S.z }; A.tkSpot = null; }
      else {
        // (taxi out to it; with nowhere to go at all, wait)
        A.tk = !!S;
        out.aim = S ? { x: S.x, z: S.z } : null;
        out.cap = S ? clamp(3 + Math.hypot(S.x - p.pos.x, S.z - p.pos.z) * 0.5, 3, 12) : 0; out.near = true;
        return out;
      }
    }
    A.tk = false;
    const h = A.run, off = Math.abs(angDiff(p.yaw, h));
    out.aim = { x: p.pos.x + Math.sin(h) * 80, z: p.pos.z + Math.cos(h) * 80 };
    // (turning to face the run, slowly; then the run)
    // (still swinging round onto it, it slows and turns first, whatever speed it arrived at: power on mid-turn is how
    // the run starts off its line and into the shallows)
    out.cap = off > 0.2 && p.fs < PL.fly - 2 ? 3.5 : PL.max; out.run = true;
    out.alt = out.cap > 4 ? PL.cruise : 0;
    if (game.t - A.runT > 25) A.run = null;          // (and should it ever not get away, choose again)
    return out;
  }
  return { LANE, APP, glideAlt, landingFor, planeCanReach, planePilot, approachPath, tallAhead, roofAhead };
}

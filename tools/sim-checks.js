// The game's own checks, run inside a test page (rescue-squad-3d.html?test&seed=N) by tools/check.mjs.
// simCheck plays one mission the way a small pilot does (hold go, nothing else) and watches, every tenth of a second,
// for things that must never happen, while measuring how well it went:
//   rules  - seconds spent breaking each rule: a hull on land, a plane flown into a hill, a helicopter inside a tower,
//            the patrol boat or a sailing boat over water too shallow for it, anything flung off at absurd speed
//   scores - rescues, time to finish, metres and degrees of turning per rescue, changes of mind, go-arounds, stuck time
// worldLint checks things about the map itself that need no play: every spawn point is where it should be.
(() => {
  const G = window.__game, D = G.debug, p = G.players[0];
  const T = (x, z) => G.terrainHeight(x, z);

  window.simCheck = ({ vehicle, zone, fire = false, seconds = 360, frame = 1 / 30 }) => {
    if (!G.game.started) document.querySelector('#start1').click();
    D.vehicle(vehicle);
    D.zone(zone, fire);
    G.game.spawnT = 0; G.game.celebrate = 0;
    D.bumps[0] = { last: {} };
    const rules = {}, worst = {};
    // (what the autopilot was doing, so a failure says why, not just where)
    const doing = () => { const A = p.ap || {}; return [A.key, A.final ? 'final' : '', A.land ? 'land@' + Math.round(A.land.x) + ',' + Math.round(A.land.z) : '', A.climbH != null ? 'climbOut' : '', A.run != null ? 'run' : '', A.tk ? 'taxiOut' : '', A.bomb ? 'bomb:' + A.bomb.stage : '', p.afloat ? 'water' : 'air', 'alt' + Math.round(p.pos.y - (G.PLANE_FLOAT || 0)), 'w' + (p.water || 0).toFixed(1)].filter(Boolean).join(' '); };
    const broke = (rule, at) => { rules[rule] = +((rules[rule] || 0) + 0.1).toFixed(1); if (!worst[rule]) worst[rule] = { t: Math.round(G.game.t), at: at.map(Math.round), doing: vehicle === 'plane' ? doing() : undefined }; };
    const m0 = G.game.mission, r0 = p.rescued;
    const legs = { flown: 0, straight: 0 };
    let dist = 0, turn = 0, flips = 0, lastSign = 0, overs = 0, overNear = false, stuck = 0, still = 0, landings = 0, wasAfloat = p.afloat, firstAt = null, done = null;
    let lastYaw = p.yaw;
    const last = p.pos.clone(), sec0 = p.pos.clone();
    // the seaplane's acceptance checks (AIRPLANE-SPEC.md): where it is going now, and how it is getting on
    const goalOf = () => {
      const F = p.fireJob && p.fireJob.fire;
      if (F) return F;      // (scooping or dropping, it works near the fire)
      if (p.target) return p.target.pos;
      if (p.cargo.length) return G.DOCK;
      return null;
    };
    const P = { airT: null, away: 0, airborne: 0, lastGoalD: null, lastProgress: 0, cargo: p.cargo.length, rescued: p.rescued, water: p.water, liftT: -99 };
    const ambient = [...G.scene.children.filter(o => o.userData.farHide === 600), ...((G.traffic && G.traffic.boats) || []).map(b => b.m)];
    for (let k = 0; k < seconds * 10; k++) {
      // (a test page has no focus: keep it playing, go held)
      G.game.state = 'play'; G.game.paused = false; G.keys.clear(); G.keys.add('KeyW');
      D.run(0.1, frame);
      const t = k / 10;
      // ---- rules
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      if (!isFinite(p.pos.x + p.pos.y + p.pos.z) || Math.hypot(p.vel.x, p.vel.z) > 80 || (p.bvel && p.bvel.length() > 70)) broke('flungOff', p.pos.toArray());
      // (the basket or bucket winds in and out at winch speed: anything much faster is a jump the eye sees)
      if (vehicle === 'heli' && p.basket.visible && Math.hypot(p.bvel.x - p.vel.x, p.bvel.y - p.vel.y, p.bvel.z - p.vel.z) > 15) broke('basketYanked', p.bpos.toArray());
      if (vehicle === 'boat') {
        const keel = Math.max(T(p.pos.x, p.pos.z), T(p.pos.x + fx * 3.5, p.pos.z + fz * 3.5), T(p.pos.x - fx * 3.5, p.pos.z - fz * 3.5));
        if (keel > 0.1) broke('boatOnLand', p.pos.toArray());
      } else if (vehicle === 'plane') {
        const g = T(p.pos.x, p.pos.z);
        if (p.afloat && g > 0.1) broke('planeOnLand', p.pos.toArray());
        const A = p.ap || {}, alt = p.pos.y - G.PLANE_FLOAT;
        if (!p.afloat && P.airT === null) P.airT = t;
        // (counted from the start, or from the last friend aboard: one near enough to taxi to is fetched by water first)
        const boarding = p.cargo.length + p.incoming > (P.aboard ?? 0);
        if (boarding || (p.ap && p.ap.taxi)) P.boardT = t;
        P.aboard = p.cargo.length + p.incoming;
        if (P.airT === null && t - (P.boardT || 0) > 15) broke('slowTakeoff', p.pos.toArray());
        // (and it is a flying boat: holding go it gets into the air, not round and round the bay on the water. Waiting
        // while friends climb in or get off is not counted)
        // Nearby rescues legitimately use water: taking friends aboard or delivering them starts a new trip.
        // Otherwise several successful short taxi trips can accumulate into a fictitious 40-second stall.
        if (!p.afloat || G.game.celebrate > 0 || boarding || p.rescued > P.rescued) P.wetT = 0;
        else if (!p.incoming && !p.unloading && !(p.berthed && p.cargo.length)) P.wetT = (P.wetT || 0) + 0.1;
        if (P.wetT > 40) { broke('neverFlies', p.pos.toArray()); P.wetT = 0; }
        if (p.afloat) P.liftT = t;
        // clear of the ground, the trees and anything standing, whenever it is up and not coming in to land or just off
        if (!p.afloat && alt > 2 && !A.final && t - P.liftT > 5) {
          let top = Math.max(g, 0) + (g > 0.5 ? G.canopyAt(p.pos.x, p.pos.z) : 0);
          for (const o of G.OBSTACLES) if (Math.hypot(p.pos.x - o.x, p.pos.z - o.z) < Math.max(o.r, o.wr || 0) + 8) top = Math.max(top, o.top);
          if (alt < top + 8 - 0.01 && top > 0.5) broke('planeIntoHill', p.pos.toArray());
        }
        // flying away from where it is going (after the climb-out, and not on the way round onto a landing)
        const goal = goalOf();
        // (only while still far off: circling within a few hundred metres to line up a landing is how a plane lands)
        const gd = goal ? Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z) : 0;
        // (nor flying the circuit onto its landing spot: out past it and back round to line up. That spot must itself be
        // near the goal, which landsFarAway checks)
        const LS = p.ap && p.ap.land, circuit = LS && Math.hypot(LS.x - p.pos.x, LS.z - p.pos.z) < 450;
        if (goal && !p.afloat && t - P.liftT > 6 && gd > 400 && !circuit) {
          const d = gd;
          P.airborne++;
          if (P.lastGoalD !== null && d > P.lastGoalD + 0.8) { P.away++; const w = doing().split(' ').slice(0, 3).join(' ').replace(/[-\d.,@]+/g, ''); (P.why ||= {})[w] = (P.why[w] || 0) + 1; }
          P.lastGoalD = d;
        } else P.lastGoalD = null;
        // progress: someone aboard, someone home, water taken on, water dropped
        // (and lining up at the home pier with friends aboard: from the far zones the flight home and the berthing take a while)
        if (p.cargo.length > P.cargo || p.rescued > P.rescued || (p.water >= 1 && P.water < 1) || (p.water < 0.1 && P.water > 0.9) || (p.berthing && !P.berthing && p.cargo.length)) P.lastProgress = t;
        P.berthing = p.berthing;
        if (p.water > 0 && P.water === 0 && p.fireJob) { const F = p.fireJob.fire; if (Math.hypot(F.x - p.pos.x, F.z - p.pos.z) > 400) broke('scoopsFarAway', p.pos.toArray()); }
        P.cargo = p.cargo.length; P.rescued = p.rescued; P.water = p.water;
        if (t - P.lastProgress > 60 && !G.game.celebrate) { broke('noProgress', p.pos.toArray()); P.lastProgress = t; }
      } else {
        for (const o of G.OBSTACLES) if (!o.easy && p.pos.y - 1.9 < o.top - 1 && Math.hypot(p.pos.x - o.x, p.pos.z - o.z) < o.r * 0.8) broke('heliInObstacle', p.pos.toArray());
        if (p.pos.y < T(p.pos.x, p.pos.z) + 0.5) broke('heliUnderground', p.pos.toArray());
      }
      // (a hull, boat or flying boat, never through a pier or a jetty: its middle stays off every deck)
      if (vehicle !== 'heli') for (const Q of G.world.piers || []) {
        const L = Math.hypot(Q.b.x - Q.a.x, Q.b.z - Q.a.z), ax = (Q.b.x - Q.a.x) / L, az = (Q.b.z - Q.a.z) / L;
        const tt = (p.pos.x - Q.a.x) * ax + (p.pos.z - Q.a.z) * az, nn = -(p.pos.x - Q.a.x) * az + (p.pos.z - Q.a.z) * ax;
        if (tt > 0 && tt < L && Math.abs(nn) < Q.w && p.pos.y < 3) broke('hullInPier', p.pos.toArray());
      }
      // (friends brought home walk to the pen: nobody still on their way after 30 s)
      for (const h of G.hoppers || []) if (h.state === 'home' && G.game.t - h.homeT > 30) { broke('walkHomeStuck', h.model.position.toArray()); h.homeT = G.game.t; }
      for (const o of ambient) if (o.visible !== false && T(o.position.x, o.position.z) > -1.2) broke('ambientBoatAground', o.position.toArray());
      // (and never through a pier or a jetty)
      for (const o of ambient) for (const Q of G.world.piers || []) { const ux = Q.b.x - Q.a.x, uz = Q.b.z - Q.a.z, tt = Math.max(0, Math.min(1, ((o.position.x - Q.a.x) * ux + (o.position.z - Q.a.z) * uz) / (ux * ux + uz * uz))); if (Math.hypot(o.position.x - Q.a.x - ux * tt, o.position.z - Q.a.z - uz * tt) < Q.w + 2.5) broke('boatInPier', o.position.toArray()); }
      // ---- scores
      let dy = p.yaw - lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); lastYaw = p.yaw; turn += Math.abs(dy);
      const sg = Math.abs(p.yawVel) > 0.25 ? Math.sign(p.yawVel) : 0;
      if (sg && lastSign && sg !== lastSign) flips++;
      if (sg) lastSign = sg;
      if (vehicle === 'plane') {
        // (a jump of many metres in a tenth of a second is the game placing the plane, as a new fire does: not a landing)
        if (!p.afloat && wasAfloat) { P.leg = { x: p.pos.x, z: p.pos.z, flown: 0, drop: false }; }
        if (P.leg && !p.afloat) { P.leg.flown += Math.hypot(p.pos.x - last.x, p.pos.z - last.z); if (p.attack) P.leg.drop = true; }
        if (p.afloat && !wasAfloat && p.pos.distanceTo(last) < 15) {
          landings++;
          // (a hop from one stretch of water to the next flies a smooth curve, not a loop out and back: at most half as far
          // again as the straight line, plus a turn about. A leg that flew a water drop is a bombing run, not a hop)
          if (P.leg && !P.leg.drop) {
            // (measured against the shortest way it could fly, round anything standing at cruising height, which is
            // the straight line unless an island's hills are in the way. A turn about is one circle at its turn radius,
            // 400 m; or, when the water it lands on faces back the way it came (the home berth's bay, from the south),
            // out past the spot by the length of its final, one circle, and back: 650 m)
            const straight = Math.hypot(p.pos.x - P.leg.x, p.pos.z - P.leg.z);
            const way = G.nav.air(26).route({ x: P.leg.x, z: P.leg.z }, { x: p.pos.x, z: p.pos.z }, 12, 60);
            let round = straight;
            if (way) { round = 0; for (let i = 1; i < way.length; i++) round += Math.hypot(way[i].x - way[i - 1].x, way[i].z - way[i - 1].z); round = Math.max(round, straight); }
            legs.flown += P.leg.flown; legs.straight += straight;
            const back = Math.abs(Math.atan2(Math.sin(p.yaw - Math.atan2(p.pos.x - P.leg.x, p.pos.z - P.leg.z)), Math.cos(p.yaw - Math.atan2(p.pos.x - P.leg.x, p.pos.z - P.leg.z)))) > 2.1;
            if (P.leg.flown > round * 1.5 + (back ? 650 : 400)) { rules.roundabout = (rules.roundabout || 0) + 1; worst.roundabout ||= { t: Math.round(G.game.t), at: [Math.round(P.leg.x), Math.round(P.leg.z), Math.round(p.pos.x), Math.round(p.pos.z)], doing: `flew ${Math.round(P.leg.flown)} m for ${Math.round(straight)} m (${Math.round(round)} m round) ` + doing() }; }
          }
          P.leg = null;
          // (on deep water, and near whoever or whatever it came down for)
          if (T(p.pos.x, p.pos.z) > -3) broke('planeOnLand', p.pos.toArray());
          const goal = goalOf();
          if (goal && Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z) > 250 && goal !== G.DOCK) broke('landsFarAway', p.pos.toArray());
        }
        wasAfloat = p.afloat;
        const near = !p.afloat && p.cargo.length + p.incoming < 3 && G.waiting.some(a => !a.fire && Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 30);
        if (overNear && !near && !p.afloat) overs++;
        overNear = near;
      }
      dist += p.pos.distanceTo(last); last.copy(p.pos);
      if (k % 10 === 9) {
        const moved = p.pos.distanceTo(sec0); sec0.copy(p.pos);
        // (lying at the pier while friends climb off, or swinging round on the spot to leave it, is not being stuck)
        const busy = p.incoming || p.pickup || p.parked || p.spray || p.unloading || (p.berthed && p.cargo.length) || p.unberth || (p.ap && p.ap.unberth) || (vehicle === 'heli' && (p.mode === 'pickup' || p.mode === 'deliver' || p.mode === 'dip' || p.grounded)) || G.game.celebrate > 0 || G.game.switchT > 0;
        if (moved < 2 && !busy) { if (++still >= 3) stuck++; } else still = 0;
      }
      if (firstAt === null && p.rescued > r0) firstAt = t;
      if (G.game.mission !== m0) { done = t; break; }
    }
    G.keys.clear();
    if (vehicle === 'plane' && P.airborne > 100 && P.away / P.airborne > 0.15) { rules.fliesAway = Math.round(P.away / P.airborne * 100); worst.fliesAway = { t: 0, at: [], doing: Object.entries(P.why || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ':' + v).join(' | ') }; }
    const rescued = p.rescued - r0, b = { ...D.bumps[0] }; delete b.last;
    return {
      rules, worst,
      scores: {
        done: done !== null, finishS: done, firstRescueS: firstAt, rescued,
        metresPerRescue: Math.round(dist / Math.max(1, rescued)), turnDegPerRescue: Math.round(turn * 57.3 / Math.max(1, rescued)),
        flipsPerMin: +(flips / ((done || seconds) / 60)).toFixed(1), stuckS: stuck, goArounds: vehicle === 'plane' ? overs : undefined,
        landings: vehicle === 'plane' ? landings : undefined, awayPct: vehicle === 'plane' ? Math.round(P.away / Math.max(1, P.airborne) * 100) : undefined, detourPct: vehicle === 'plane' && legs.straight ? Math.round(legs.flown / legs.straight * 100) : undefined, bumps: Object.values(b).reduce((n, v) => n + v, 0),
      },
    };
  };

  window.volcanoLint = () => {
    const G = __game, V = G.world.volcano, bad = [];
    const check = (ok, doing) => { if (!ok) bad.push(doing); };
    check(!!V, 'doing: inspecting the volcano field station; missing authored zone');
    if (!V) return bad;
    check(V.columns >= 36, 'doing: approaching the coast; fewer than 36 basalt columns');
    check(V.seams.length === 3, 'doing: circling the cone; expected three glowing upper-slope seams');
    for (const s of V.seams) for (const p of s) check(Math.abs(p.y - G.terrainHeight(p.x, p.z) - 0.16) < 0.02, 'doing: inspecting a lava seam; it floats above or clips into terrain');
    check(V.sites.length === 2, 'doing: visiting named rescue sites; one has no field equipment');
    for (const site of V.sites) {
      const pad = G.SITES.find(s => s.name === site.name);
      for (const o of site.props) check(Math.hypot(o.x-pad.x,o.z-pad.z) - o.r >= pad.r, 'doing: landing at '+pad.name+'; equipment obstructs the rescue clearing');
    }
    check(V.group.children.length < 32, 'doing: drawing the volcano; authored detail exceeds 31 draw objects');
    check(G.world.crater.y > 20, 'doing: approaching the summit; plume emitter is below the crater');
    return bad;
  };

  window.worldLint = () => {
    const issues = window.volcanoLint();
    const deep = (pt, d, what) => { const h = T(pt.x, pt.z); if (h > d) issues.push(`${what} at ${Math.round(pt.x)},${Math.round(pt.z)} is only ${(-h).toFixed(1)} m deep`); };
    for (const s of G.world.spawn.sea) deep(s, -3, 'open-sea spawn');
    for (const id in G.world.spawn.zoneSea) for (const s of G.world.spawn.zoneSea[id]) deep(s, -2, id + ' sea spawn');
    for (const s of G.world.spawn.stacks) deep(s, -2, 'sea-stack spawn');
    for (const s of G.ISLETS) { const h = T(s.x, s.z); if (h < 1) issues.push(`sandbar ${s.x},${s.z} middle is under water (${h.toFixed(1)} m)`); }
    for (const s of G.SITES) { const h = T(s.x, s.z); if (Math.abs(h - s.y) > 0.6 && !s.pad) issues.push(`landing site ${s.name} ground ${h.toFixed(1)} m, expected ${s.y}`); }
    for (const B of (G.traffic && G.traffic.boats) || []) for (const q of B.path) deep(q, -2, 'sailing route point');
    return issues;
  };
  // With a seaplane and a boat flying together, each new fire should be one they can both fight: otherwise one of them
  // spends the mission flying about with nothing to do (October 2026: the seaplane idled through a boat's shore fire).
  // Run on its own page: it starts a two-player outing.
  window.crewLint = (crew = ['plane', 'boat'], fires = 12) => {
    const issues = [];
    crew.forEach((v, i) => D.vehicle(v, i));
    document.querySelector('#start2').click();
    for (const Z of G.ZONES) {
      D.zone(Z.id, true);
      let idle = 0, made = 0;
      for (let k = 0; k < fires; k++) {
        for (const an of G.waiting.filter(a => a.fire)) D.retire(an);
        if (!D.fire(Z.id)) continue;
        const an = G.waiting.filter(a => a.fire).pop();
        made++;
        if (crew.some((v, i) => !D.canFight(i, an.fire))) idle++;
      }
      if (made && idle / made > 0.2) issues.push(`${Z.id}: ${idle} of ${made} fires leave the ${crew.join(' or ')} with nothing to do`);
      else if (idle) issues.push(`note: ${Z.id}: ${idle} of ${made} fires only some of the ${crew.join(' and ')} can fight`);
    }
    return issues;
  };
  return 'checks ready';
})();

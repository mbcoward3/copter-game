// Vehicle benchmark: plays one machine through one mission the way a small pilot does (hold go, nothing else) with
// nothing drawn, and reports how well it got on. Load it into the running game (fetch + eval, as with soak.js), then:
//   bench('plane', 'reef', 240)          -> { rescued, metresPerRescue, stuckS, bumps, landings, ... }
//   bench('boat', 'volcano', 240, true)  -> the volcano's fire mission
//   benchAll(['heli','plane','boat'], 240) runs every mission for each (in several calls: the browser tool has a time limit)
// "stuck" is a second in which it moved under 2 m with go held and nothing happening (nobody boarding, no basket or
// bucket at work, not delivering); "bumps" count each time it touched rock, the shallows or an obstacle.
window.bench = (veh, zone, seconds = 240, fire = false) => {
  const G = window.__game, p = G.players[0], D = G.debug;
  D.noDraw = true;
  if (!G.game.started) document.querySelector('#start1').click();
  D.vehicle(veh);
  for (const a of [...G.waiting]) { G.scene.remove(a.model); a.beam && G.scene.remove(a.beam); a.prop && G.scene.remove(a.prop); if (a.site) a.site.busy = false; G.waiting.splice(G.waiting.indexOf(a), 1); }
  D.zone(zone, fire);
  G.game.spawnT = 0; G.game.celebrate = 0;
  // (the game pauses into its menu when the window loses focus, which a hidden test window always has)
  G.game.state = 'play'; G.game.paused = false;
  D.bumps[0] = { last: {} };
  G.keys.clear(); G.keys.add('KeyW');
  const r0 = p.rescued, m0 = G.game.mission;
  let dist = 0, stuck = 0, still = 0, landings = 0, wasAfloat = p.afloat, firstAt = null, last = p.pos.clone(), worst = null;
  const marks = [];
  let turn = 0, flips = 0, lastSign = 0, overs = 0, overT = null, lastYaw = p.yaw, elapsed = 0;
  for (let s = 0; s < seconds; s++) {
    // (ten steps a second for the turning measures: how much it turns, and how often it changes its mind)
    for (let k = 0; k < 10; k++) {
      // (losing focus pauses the game and lets go of every key: keep it playing, go held)
      G.game.state = 'play'; G.game.paused = false; G.keys.add('KeyW');
      D.run(0.1);
      let dy = p.yaw - lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); lastYaw = p.yaw; turn += Math.abs(dy);
      const sg = Math.abs(p.yawVel) > 0.25 ? Math.sign(p.yawVel) : 0;
      if (sg && lastSign && sg !== lastSign) flips++;
      if (sg) lastSign = sg;
      // a go-around: in the air, over a friend it could fetch, and on past without landing (seaplane)
      if (p.vehicle === 'plane' && !p.afloat && p.cargo.length + p.incoming < 3) {
        const near = G.waiting.some(a => !a.fire && Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 30);
        if (near && overT === null) overT = s; if (!near && overT !== null) { overs++; overT = null; }
      } else overT = null;
    }
    elapsed++;
    const moved = p.pos.distanceTo(last); dist += moved; last.copy(p.pos);
    const busy = p.incoming || p.pickup || p.parked || p.spray || (p.vehicle === 'heli' && (p.mode === 'pickup' || p.mode === 'deliver' || p.mode === 'dip' || p.grounded)) || G.game.celebrate > 0 || G.game.switchT > 0;
    if (moved < 2 && !busy) { still++; if (still >= 3) { stuck++; if (!worst || still > worst.s) worst = { s: still, t: s, pos: p.pos.toArray().map(Math.round), fs: +(p.fs || 0).toFixed(1), mode: p.mode, target: p.target && p.target.kind, job: !!p.fireJob, cargo: p.cargo.length }; } }
    else still = 0;
    if (p.vehicle === 'plane') { if (p.afloat && !wasAfloat) landings++; wasAfloat = p.afloat; }
    if (firstAt === null && p.rescued > r0) firstAt = s;
    if (G.game.mission !== m0) { marks.push('mission done at ' + s + ' s'); break; }
  }
  D.noDraw = false; G.keys.clear();
  const rescued = p.rescued - r0, b = { ...D.bumps[0] }; delete b.last;
  return { veh, zone: zone + (fire ? ' fire' : ''), rescued, firstRescueS: firstAt, metresPerRescue: rescued ? Math.round(dist / rescued) : Math.round(dist) + ' (none)', stuckS: stuck, worst, bumps: b, landings: p.vehicle === 'plane' ? landings : undefined, goArounds: p.vehicle === 'plane' ? overs : undefined, turnDegPerRescue: Math.round(turn * 57.3 / Math.max(1, rescued)), turnFlipsPerMin: +(flips / (elapsed / 60)).toFixed(1), secondsPerRescue: rescued ? Math.round(elapsed / rescued) : null, marks };
};
'bench ready';

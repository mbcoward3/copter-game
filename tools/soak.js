// Soak test: plays the game the way a small pilot would (hold go, turn now and then; the helicopter is steered toward the
// nearest friend and home when full) without drawing it, and reports how it went. Paste into the page's console, or
// run through the browser tools, after the game has loaded:
//   soak('boat', 60)   -> { rescued, stuckPct, ... } after 60 simulated seconds (call again to keep going)
window.soak = (veh, seconds, opts = {}) => {
  const G = window.__game, p = G.players[0];
  G.debug.noDraw = true;
  if (!G.game.started) {
    G.debug.run(0.3);
    document.querySelector('.veh[data-p="0"][data-v="' + veh + '"]').click();
    if (opts.pro) document.querySelector('.flt[data-p="0"][data-m="pro"]').click();
    document.querySelector('#start1').click();
  }
  const s = window.soak.stats || (window.soak.stats = { stuck: 0, steps: 0 });
  G.keys.add('KeyW');
  for (let i = 0; i < seconds * 2; i++) {
    G.keys.delete('KeyA'); G.keys.delete('KeyD');
    if (veh === 'heli') {
      const home = p.cargo.length >= 3 || (p.cargo.length && !G.waiting.length);
      let best = home ? { x: 0, z: 0 } : null, bd = 1e9;
      if (!home) for (const a of G.waiting) { const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z); if (d < bd) { bd = d; best = a.pos; } }
      if (best) {
        let d = (Math.atan2(best.x - p.pos.x, best.z - p.pos.z) - p.yaw) % (2 * Math.PI);
        if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
        if (d > 0.15) G.keys.add('KeyA'); else if (d < -0.15) G.keys.add('KeyD');
        if (home && Math.hypot(p.pos.x, p.pos.z) < 14) G.keys.delete('KeyW'); else G.keys.add('KeyW');
      }
    } else if (Math.random() < 0.08) G.keys.add('KeyA');
    G.debug.run(0.5);
    s.steps++;
    // stuck: hardly moved in the last five seconds although go is held and nobody is climbing aboard
    s.trail = s.trail || [];
    s.trail.push(p.pos.clone());
    if (s.trail.length > 10) s.trail.shift();
    if (s.trail.length === 10 && s.trail[0].distanceTo(p.pos) < 4 && !p.incoming && G.keys.has('KeyW') && !p.parked && !p.pickup && !(veh === 'heli' && p.grounded)) {
      s.stuck++;
      if (!s.why) s.why = { t: Math.round(G.game.t), fs: p.fs, inc: p.incoming, target: p.target && p.target.kind, cargo: p.cargo.length, mode: p.mode, avoidT: p.avoidT, yaw: p.yaw, pos: p.pos.toArray().map(v => Math.round(v)) };
    }
  }
  G.debug.noDraw = false;
  return {
    veh, simT: Math.round(G.game.t), rescued: p.rescued, mission: G.game.mission, cargo: p.cargo.length, stuckPct: Math.round(100 * s.stuck / s.steps),
    why: s.why, pos: p.pos.toArray().map(v => Math.round(v)), waiting: G.waiting.map(w => w.kind).join(','),
  };
};
'soak ready';

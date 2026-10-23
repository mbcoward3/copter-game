// Paste into the game's console, then run soak('heli', 300). By default this holds ONLY go:
// no steering, altitude keys, winch input, or release near home. Call again to continue the outing.
// For optional exploratory steering use { steer: true }; manual controls use { pro: true }.
window.soak = (veh, seconds, opts = {}) => {
  const G = window.__game, p = G.players[0];
  if (!['heli', 'plane', 'boat'].includes(veh) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) throw new Error('Choose a vehicle and 0–3600 simulated seconds.');
  if (G.game.started && p.vehicle !== veh) throw new Error('Start a fresh game to test another vehicle.');
  const priorDraw = G.debug.noDraw, priorKeys = [...G.keys];
  G.debug.noDraw = true;
  try {
    if (!G.game.started) {
      document.querySelector('.veh[data-p="0"][data-v="' + veh + '"]').click();
      document.querySelector('.flt[data-p="0"][data-m="' + (opts.pro ? 'pro' : 'easy') + '"]').click();
      document.querySelector('#start1').click();
      if (opts.zone) G.debug.zone(opts.zone, !!opts.fire);
    }
    const startMission = G.game.mission, startRescued = p.rescued;
    const s = { stuck: 0, steps: 0, trail: [] };
    G.keys.clear(); G.keys.add('KeyW');
    for (let i = 0; i < Math.ceil(seconds * 2); i++) {
      if (opts.steer) {
        G.keys.delete('KeyA'); G.keys.delete('KeyD');
        if (Math.random() < 0.08) G.keys.add('KeyA');
      }
      G.debug.run(Math.min(0.5, seconds - i * 0.5));
      s.steps++;
      s.trail.push(p.pos.clone()); if (s.trail.length > 10) s.trail.shift();
      if (s.trail.length === 10 && s.trail[0].distanceTo(p.pos) < 4 && !p.incoming && !p.parked && !p.pickup && !p.fireJob && !G.game.celebrate && p.mode !== 'deliver') {
        s.stuck++;
        if (!s.why) s.why = { t: Math.round(G.game.t), fs: p.fs, target: p.target?.kind, cargo: p.cargo.length, mode: p.mode, pos: p.pos.toArray().map(Math.round) };
      }
    }
    return { veh, heldGoOnly: !opts.steer && !opts.pro, simT: Math.round(G.game.t), rescued: p.rescued - startRescued,
      missions: G.game.mission - startMission, mission: G.game.mission, cargo: p.cargo.length,
      stuckPct: Math.round(100 * s.stuck / s.steps), why: s.why, pos: p.pos.toArray().map(Math.round), waiting: G.waiting.map(w => w.kind).join(',') };
  } finally {
    G.debug.noDraw = priorDraw; G.keys.clear(); for (const key of priorKeys) G.keys.add(key);
  }
};
'soak ready';

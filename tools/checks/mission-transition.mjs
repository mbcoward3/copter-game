// Runs inside the rendered page. Consecutive animation frames avoid counting the time spent waiting for a
// DevTools round trip as a vehicle teleport. Kept self-contained so the same observer can be exercised in Node.
export function observeMissionTransition(G, frame = requestAnimationFrame) {
  return new Promise(resolve => {
    const mission = G.game.mission;
    const positions = () => G.players.filter(p => p.active).map(p => p.pos.toArray());
    let prev = positions(), frames = 0;
    const watch = () => {
      const pos = positions();
      if (G.game.mission !== mission) { resolve({ prev, pos }); return; }
      if (++frames >= 180) { resolve(null); return; }
      prev = pos;
      frame(watch);
    };
    frame(watch);
    G.debug.next();
  });
}

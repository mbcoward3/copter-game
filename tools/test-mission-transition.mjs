import assert from 'node:assert/strict';
import { observeMissionTransition } from './mission-transition.mjs';

async function transition(jump) {
  let x = 0, queued, scheduled = false, ticks = 0;
  const G = { game: { mission: 1 }, players: [{ active: true, pos: { toArray: () => [x, 0, 0] } }],
    debug: { next: () => { scheduled = true; } } };
  const result = observeMissionTransition(G, callback => { queued = callback; });
  // Simulate many rendered frames passing before the caller gets the result. A vehicle has travelled 40 m,
  // but only its movement in the frame spanning the mission change should be measured.
  while (ticks++ < 20) { x += 2; if (scheduled && ticks === 20) { G.game.mission++; x += jump; } queued(); }
  return result;
}
const normal = await transition(0);
assert.equal(normal.pos[0][0] - normal.prev[0][0], 2, 'normal travel must not be counted across browser latency');
const teleported = await transition(30);
assert.ok(teleported.pos[0][0] - teleported.prev[0][0] > 15, 'a real mission-change teleport must still fail');
const noChange = { game: { mission: 1 }, players: [], debug: { next() {} } };
let pending;
const timedOut = observeMissionTransition(noChange, callback => { pending = callback; });
for (let i = 0; i < 180; i++) pending();
assert.equal(await timedOut, null, 'an absent transition must fail rather than silently passing');
console.log('Mission transition continuity and teleport detection passed');

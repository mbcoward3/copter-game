// The seaplane's smooth paths (src/flightpath.mjs): every path starts where the plane is, on its heading, ends at the
// goal on the goal's heading, with no breaks or kinks along it, and is never longer than the obvious alternatives.
import assert from 'node:assert/strict';
import { dubins, samplePath, track, pursuitRate } from '../src/flightpath.mjs';

const R = 55, ang = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let n = 0; n < 2000; n++) {
  const x0 = rnd() * 800 - 400, z0 = rnd() * 800 - 400, h0 = rnd() * 7 - 3.5, x1 = rnd() * 800 - 400, z1 = rnd() * 800 - 400, h1 = rnd() * 7 - 3.5;
  const d = dubins(x0, z0, h0, x1, z1, h1, R);
  assert.ok(d, 'a path always exists');
  const pts = samplePath(d, 5);
  const a = pts[0], b = pts[pts.length - 1];
  assert.ok(Math.hypot(a.x - x0, a.z - z0) < 1e-6 && ang(a.h, h0) < 1e-6, 'starts at the plane');
  assert.ok(Math.hypot(b.x - x1, b.z - z1) < 1e-3 && ang(b.h, h1) < 1e-3, `ends at the goal (${b.x},${b.z} vs ${x1},${z1})`);
  for (let i = 1; i < pts.length; i++) {
    const step = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    assert.ok(step < 5.01, 'no breaks');
    if (step > 0.5) assert.ok(ang(Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z), (pts[i].h + pts[i - 1].h) / 2 + (Math.abs(pts[i].h - pts[i - 1].h) > Math.PI ? Math.PI : 0)) < 0.1, 'moves along its heading');
  }
  assert.ok(Math.abs(pts[pts.length - 1].s - d.len) < 0.5, 'length adds up');
  assert.ok(d.len >= Math.hypot(x1 - x0, z1 - z0) - 1e-6, 'never shorter than a straight line');
}
// straight ahead is a straight line
{ const d = dubins(0, 0, 0, 0, 300, 0, R); assert.ok(Math.abs(d.len - 300) < 1e-6); }
// following a path with pure pursuit stays on it
{
  const d = dubins(0, 0, 0, 200, -100, Math.PI, R), pts = samplePath(d, 5), T = {};
  let x = 0, z = 0, h = 0, yr = 0, worst = 0, i = 0;
  for (let k = 0; k < 2000 && (i < pts.length - 2); k++) {
    track(pts, x, z, i, 28, T); i = T.i; worst = Math.max(worst, T.off);
    yr += (Math.max(-0.9, Math.min(0.9, pursuitRate(x, z, h, 24, T))) - yr) * (1 - Math.exp(-2.6 / 30));
    h += yr / 30; x += Math.sin(h) * 24 / 30; z += Math.cos(h) * 24 / 30;
  }
  assert.ok(worst < 6, `pure pursuit keeps within 6 m of the path (was ${worst.toFixed(1)} m off)`);
}
console.log('flight paths ok');
// close by, a turn-turn-turn path beats any turn-straight-turn: the goal just behind and facing back the way it came
{
  const d = dubins(0, 0, 0, 20, -20, Math.PI, R);
  const pts = samplePath(d, 5), b = pts[pts.length - 1];
  assert.ok(Math.hypot(b.x - 20, b.z + 20) < 1e-3 && ang(b.h, Math.PI) < 1e-3, 'turn-turn-turn ends at the goal');
  assert.ok(d.len < 2.2 * Math.PI * R && d.segs.every(g => g.arc), `a turn about close by is three turns, little more than one full circle (${d.len.toFixed(0)} m)`);
}
console.log('turn-turn-turn ok');

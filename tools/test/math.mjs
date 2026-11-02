import assert from 'node:assert/strict';
import { MathUtils } from 'three';
import { angDiff, clamp, damp } from '../../src/math.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
close(angDiff(0.5, 0.2), 0.3);
close(angDiff(0.1, Math.PI * 2 - 0.1), 0.2);          // across north, the short way round
close(angDiff(-3, 3), Math.PI * 2 - 6);
close(angDiff(Math.PI * 7, 0), Math.PI);               // whole turns are dropped
for (let a = -10; a <= 10; a += 0.37) for (let b = -10; b <= 10; b += 0.53) {
  const d = angDiff(a, b);
  assert.ok(d >= -Math.PI && d <= Math.PI, 'angDiff stays within -PI..PI');
  close(Math.cos(d), Math.cos(a - b));
}
for (const [v, lo, hi] of [[5, 0, 1], [-5, 0, 1], [0.5, 0, 1], [3, 3, 3], [NaN, 0, 1]]) {
  assert.ok(Object.is(clamp(v, lo, hi), MathUtils.clamp(v, lo, hi)), `clamp(${v}, ${lo}, ${hi}) matches three.js`);
}
for (const [r, dt] of [[3, 1 / 30], [0.5, 0.1], [12, 0], [5, 2]]) assert.equal(damp(r, dt), 1 - Math.exp(-r * dt));
close(damp(4, 0.25) + damp(4, 0.25) * (1 - damp(4, 0.25)), damp(4, 0.5));    // two half steps close the same gap as one whole one
console.log('Heading difference wrapping, clamp (identical to three.js) and frame-rate independent damping passed');

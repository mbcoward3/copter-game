import assert from 'node:assert/strict';
import { flightClearance } from '../src/flight-safety.mjs';

const arch = { x: -59, z: 54, r: 19, top: 25, easy: true };
const pos = { x: -80.125, y: 14.95, z: 43.705 };
const yaw = Math.atan2(32 - pos.x, 93 - pos.z);
const blocked = flightClearance(pos, yaw, 0, [arch], 1.95);
assert.equal(blocked.height, 29.95, 'A stopped helicopter must still find clearance over the arch');
assert.ok(blocked.speed < 2, 'Brake while below safe clearance');
assert.equal(flightClearance({ ...pos, y: 31 }, yaw, 20, [arch], 1.95).speed, Infinity, 'Resume cruise above the arch');
assert.equal(flightClearance(pos, yaw + Math.PI, 20, [{ ...arch, x: 10, z: 90 }], 1.95).height, -Infinity, 'Ignore obstacles behind the flight corridor');
assert.equal(flightClearance(pos, yaw, 20, [{ x: -130, z: 150, r: 6, top: 90 }], 1.95).height, -Infinity, 'Ignore tall objects away from the route');
assert.equal(flightClearance({ x: 0, y: 10, z: 0 }, 0, 20, [{ x: 10, z: 20, r: 2, wr: 8, top: 15 }], 1.95).height, 19.95, 'Use the wider rock footprint');
console.log('Flight clearance regressions passed');

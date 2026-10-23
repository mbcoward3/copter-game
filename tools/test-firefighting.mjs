import assert from 'node:assert/strict';
import { chooseMission, LOCATIONS } from '../src/missions.mjs';
import { createFireField, advanceFire, waterImpact, predictDrop, attackPoint, bombingRun, WATER } from '../src/firefighting.mjs';
for (const id of LOCATIONS) {
  for (const mode of ['rescue', 'fire']) assert.deepEqual(chooseMission(mode, id), { id, fire: mode === 'fire' });
  const first = chooseMission('mixed', id, null, () => 0);
  assert.notEqual(chooseMission('mixed', id, first, () => 0).fire, first.fire);
}
const terrain = () => ({ y: 3, canopy: 7 });
const field = () => createFireField({ x: 0, z: 0, y: 3, sample: terrain });
const step = (f, seconds, dt = 0.1, wind) => { for (let t = 0; t < seconds - 0.0001; t += dt) advanceFire(f, dt, wind); };
const growing = field(), dormant = field();
const initial = growing.active;
step(dormant, 60); assert.equal(dormant.active, initial, 'A distant, unengaged incident waits for its crew');
growing.engaged = true; step(growing, 45);
assert.ok(growing.active > initial, 'Flames spread into neighbouring fuel');
assert.ok(growing.active <= growing.cells.length, 'A fire stays inside its authored incident');
const a = field(), b = field(); a.engaged = b.engaged = true;
step(a, 30, 0.1); step(b, 30, 0.2);
assert.ok(Math.abs(a.heat - b.heat) < 0.03, 'Fire behavior does not depend on frame rate');
const hit = field(), untouched = hit.heat;
assert.deepEqual(waterImpact(hit, { x: 100, z: 100, radius: 4, amount: 10 }), { cooled: 0, touched: 0 });
assert.equal(hit.heat, untouched, 'A missed drop cannot magically damage its nominated fire');
assert.equal(waterImpact(hit, { x: 0, z: 0, radius: 8, amount: -1 }).cooled, 0);
const aim = attackPoint(hit);
const result = waterImpact(hit, { ...aim, radius: 7, amount: 2 });
assert.ok(result.cooled > 0 && result.cooled <= 2 + 1e-10, 'Suppression is bounded by the delivered water');
assert.ok(hit.cells.some(c => c.wet > 0), 'A water footprint leaves wet ground');
// A wet line in unburnt fuel blocks the front, rather than simply subtracting from a shared health total.
const protectedField = field(); protectedField.engaged = true;
for (const c of protectedField.cells.filter(c => !c.everBurned)) waterImpact(protectedField, { x: c.x, z: c.z, radius: 1, amount: 1 });
step(protectedField, 40);
assert.equal(protectedField.active, initial, 'Wetted unburnt fuel cannot catch from its neighbours');
for (const c of hit.cells) waterImpact(hit, { x: c.x, z: c.z, radius: 1, amount: 2 });
hit.engaged = true; step(hit, 4);
assert.equal(hit.active, 0); assert.ok(hit.quiet >= 2, 'The crew checks for embers before completion');
assert.ok(hit.cells.every(c => !c.everBurned || c.secured));
step(hit, 90); assert.equal(hit.active, 0, 'Secured patches never relight behind the child');
const source = { x: 0, y: 30, z: 0 }, velocity = { x: 20, z: 0 };
const bucket = predictDrop(source, velocity, 0, 'heli'), bomber = predictDrop(source, velocity, 0, 'plane');
assert.ok(bomber.x > bucket.x * 3, 'A bomber carries water forward while a bucket drops more vertically');
assert.ok(predictDrop(source, velocity, 0, 'plane', { x: 10, z: 0 }).x > bomber.x, 'Wind displaces the footprint');
assert.ok(WATER.plane.capacity > WATER.heli.capacity && WATER.plane.duration > 1, 'The bomber lays a substantial water strip');
const clipped = createFireField({ x: 0, z: 0, y: 3, sample: (x, z) => ({ y: x > 0 ? -5 : 3, canopy: 0 }) });
assert.ok(clipped.cells.every(c => c.x <= 0), 'A shore fire cannot put burning cells into the sea');


for (const aim of [{x:525,z:-120},{x:100,z:-550},{x:350,z:430}]) {
  const run=bombingRun(aim,{x:aim.x+80,z:aim.z},620);
  assert.ok(Math.hypot(run.entry.x,run.entry.z)<555,'A bomber approach must fit inside the world steering boundary');
}
const safe=createFireField({x:0,z:0,y:3,sample:terrain,protectedAreas:[{x:-7,z:0,r:6}]});
assert.ok(safe.cells.every(c=>Math.hypot(c.x+7,c.z)>6),'Burning areas leave protected friends and landing pads clear');

console.log('Mission selection, spread, wet firebreaks, mopping up, protected areas, bomber approaches and ballistic water regressions passed');

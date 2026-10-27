import assert from 'node:assert/strict';
import { showRescueFor } from '../src/rescue-guidance.mjs';
for (const kind of ['camp','ledge','perch','wreck']) {
  const friend=Object.freeze({kind});
  assert.ok(showRescueFor('heli',friend));
  for(const vehicle of ['boat','plane'])assert.equal(showRescueFor(vehicle,friend),false,vehicle+' cannot rescue '+kind);
}
assert.ok(showRescueFor('boat',{kind:'hut'}));
assert.equal(showRescueFor('plane',{kind:'hut'}),false);
for(const vehicle of ['boat','plane'])assert.equal(showRescueFor(vehicle,{kind:'kayak',landlocked:true}),false);
assert.equal(showRescueFor('plane',{kind:'ring',noPlaneUntil:20},19),false);
assert.ok(showRescueFor('plane',{kind:'ring',noPlaneUntil:20},20),'existing retry expiry must restore the marker without a HUD navigation query');
const fire=Object.freeze({out:false,shore:false,scoop:Object.freeze({x:0,z:0})});
assert.ok(showRescueFor('heli',{fire}));assert.ok(showRescueFor('plane',{fire}));assert.equal(showRescueFor('boat',{fire}),false);
assert.equal(showRescueFor('plane',{fire:{...fire,scoopOk:false}}),false,'honor a scoop already rejected by navigation');
assert.equal(showRescueFor('plane',{fire:{...fire,scoop:null}}),false);
for(const vehicle of ['heli','plane','boat'])assert.equal(showRescueFor(vehicle,{fire:{...fire,out:true}}),false,'safe fires no longer need a task marker');
console.log('Vehicle rescue markers, equipment compatibility and read-only retry state passed');

import assert from 'node:assert/strict';
import {manualAxis} from '../src/manual-controls.mjs';
for(const value of [-.18,-.1,0,.1,.18])assert.equal(manualAxis(value),0,'stick drift stays inside the existing dead zone');
assert.ok(manualAxis(.1801)>0&&manualAxis(.1801)<.001,'motion starts continuously at the dead-zone edge');
assert.equal(manualAxis(1),1);assert.equal(manualAxis(-1),-1);
assert.equal(manualAxis(2),1);assert.equal(manualAxis(-2),-1);
for(const value of [NaN,Infinity,-Infinity,undefined])assert.equal(manualAxis(value),0,'invalid device values cannot poison vehicle state');
let previous=0;
for(let i=0;i<=1000;i++){
 const value=i/1000,output=manualAxis(value);
 assert.ok(output>=previous&&output-previous<.0013,'all remaining travel is monotonic and has no second jump');
 assert.equal(manualAxis(-value),output===0?0:-output,'steering directions share the same precision');
 previous=output;
}
console.log('Continuous manual stick range, full travel, symmetry and neutral device safety passed');

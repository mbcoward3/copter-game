import assert from 'node:assert/strict';
import {manualRescueHint} from '../src/rescue-guidance.mjs';
const pilot=vehicle=>({vehicle,cargo:[],incoming:0,unloading:0,grounded:false,afloat:true});
for(const vehicle of ['heli','boat','plane']){
 const p=pilot(vehicle),home=vehicle==='heli'?/home|base|paddock/:/jetty/;
 assert.match(manualRescueHint({...p,incoming:1}),/Hold position.*aboard/,'boarding should explain the wait');
 assert.match(manualRescueHint({...p,unloading:1}),/Hold position.*ashore/,'unloading remains visible after cargo becomes empty');
 assert.match(manualRescueHint({...p,cargo:[{}]},{nearHome:true}),home,'partial crews near home need delivery instructions');
 const last=manualRescueHint({...p,cargo:[{}]},{hasFriends:false});assert.match(last,home);assert.doesNotMatch(last,/Full/,'a final partial crew is not full');
 assert.match(manualRescueHint({...p,cargo:[{},{},{}]}),home,'full crews receive return guidance');
 const choice=manualRescueHint({...p,cargo:[{}]});assert.match(choice,/1 aboard/);assert.match(choice,/another|more/);assert.match(choice,/home|jetty/,'partial crews keep the choice of rescue or return');
}
assert.match(manualRescueHint(pilot('plane'),{nearFriend:true}),/Taxi/);
assert.doesNotMatch(manualRescueHint(pilot('plane'),{nearFriend:true}),/descend|lift off|Fly down/,'afloat pilots should not be told to land again');
assert.match(manualRescueHint({...pilot('plane'),afloat:false},{descendKey:'Right Shift'}),/Right Shift/);
assert.match(manualRescueHint({...pilot('heli'),grounded:true,cargo:[{}]},{hasFriends:false,liftKey:'Enter'}),/Enter.*lift off.*home/,'a remote grounded crew must leave before returning');
assert.match(manualRescueHint({...pilot('heli'),grounded:true,cargo:[{}]},{nearHome:true,atBase:true}),/Hold position.*getting out/);
assert.match(manualRescueHint(pilot('heli'),{winchKey:'Right Ctrl'}),/Right Ctrl/);
console.log('Manual boarding, taxiing, partial/final crews, home delivery and pilot-specific keys passed');

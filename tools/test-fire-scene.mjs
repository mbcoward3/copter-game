import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { createFireField, advanceFire, waterImpact } from '../src/firefighting.mjs';

// Exercise the actual scene builder without a GPU; resolve Three for the in-memory module.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/fire-scene.js', import.meta.url), 'utf8')
  .replace("from 'three'", `from '${pathToFileURL(require.resolve('three')).href}'`);
const { buildFireScene } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const scene = new THREE.Scene();
const fire = createFireField({x:0,z:0,y:3,sample:()=>({y:3,canopy:0})});
fire.engaged = true;
const view = buildFireScene(scene, fire), wind = {x:2,z:0};
const burning = view.fuel.find(f=>f.cell.heat>.2), untouched = view.fuel.find(f=>!f.cell.everBurned);
assert.ok(burning && untouched, 'Incidents contain both burning and threatened objects');
const originalY = burning.pieces.map(p=>p.mesh.position.y);
for(let i=0;i<100;i++) advanceFire(fire,.2,wind);
view.update(20,wind);
const damage = burning.damage;
assert.ok(damage>.3, 'Sustained cell heat chars the actual objects');
assert.ok(burning.pieces.some((p,i)=>p.mesh.position.y<originalY[i]), 'Burned supports settle');
const touched = waterImpact(fire,{x:burning.cell.x,z:burning.cell.z,radius:1,amount:3});
assert.ok(touched.cooled>0);
view.update(21,wind);
assert.equal(burning.damage,damage,'Water cannot restore burned timber');
assert.equal(burning.mat.emissive.r,0,'Cooled objects stop glowing');
assert.equal(burning.mat.roughness,.32,'Soaked material has a wet surface');
assert.equal(untouched.damage,0,'Objects outside the burning front remain intact');
for(let t=22;t<30;t++) view.update(t,wind);
assert.equal(burning.damage,damage,'Repeated rendering preserves the aftermath');
let disposals=0; burning.mat.addEventListener('dispose',()=>disposals++);
view.dispose(); assert.equal(scene.children.length,0,'Incident cleanup removes the complete effect');
assert.equal(disposals,1,'Shared fuel materials are released once');
console.log('Fuel damage, settling, local water response, lasting aftermath and scene cleanup regressions passed');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {celebrationBurst} from '../src/celebration.mjs';
for(const aspect of [1280/720,300/720])for(const [eye,target,height] of [
 [[0,8,-25],[0,1.2,7],0], [[900,90,-420],[900,60,-390],30], [[-200,35,200],[-200,20,240],10], [[0,35,-20],[0,0,0],0]
])for(let i=0;i<=10;i++){
 const camera=new THREE.PerspectiveCamera(58,aspect,.1,3000);camera.position.fromArray(eye);camera.lookAt(...target);
 let n=0;const random=()=>((i*3+n++*7)%11)/10;
 const {position,scale}=celebrationBurst(camera,new THREE.Vector3(...target),()=>height,random),ndc=position.clone().project(camera);
 assert.ok(position.y>=height+8,'celebration stays above terrain/water');
 assert.ok(Math.abs(ndc.x)<=.7&&Math.abs(ndc.y)<=.7&&ndc.z>-1&&ndc.z<1,'burst remains inside the actual view, including a narrow pane and steep downward camera');
 assert.ok(scale>0&&scale<=1,'close effects cannot grow to fill the screen');
}
const camera=new THREE.PerspectiveCamera(58,1280/720,.1,3000);camera.position.set(0,8,-25);camera.lookAt(0,1.2,7);
const ridge=(x,z)=>z>10&&z<30?40:0;
const local=celebrationBurst(camera,new THREE.Vector3(0,1.2,7),ridge,()=>.5);
assert.ok(local.position.z<10,'choose a nearer burst rather than hide it beyond the foreground ridge');
// Construct the real particle system without WebGL; inspect emitted geometry rather than a copied budget formula.
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>({fillText(){}})})};
const source=readFileSync(new URL('../src/fx.js',import.meta.url),'utf8').replace("'three'",JSON.stringify(new URL('../node_modules/three/build/three.module.js',import.meta.url).href));
const {createFx}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const count=scene=>{const colors=scene.children.find(o=>o.isPoints).geometry.getAttribute('aColor');let n=0;for(let i=0;i<colors.count;i++)if(colors.getW(i)>0)n++;return n;};
for(const crew of [1,2]){
 const scene=new THREE.Scene(),fx=createFx(scene);
 for(let i=0;i<crew;i++)fx.firework(i*200,30,0,1,1/crew);
 assert.ok(count(scene)<=176,'two crews share the original particle budget');
 assert.ok(count(scene)>=170,'retain a full celebration across the crew');
 const confettiScene=new THREE.Scene(),confetti=createFx(confettiScene);
 for(let i=0;i<crew;i++)confetti.confetti(i*200,30,0,160/crew);
 assert.equal(count(confettiScene),160,'initial confetti also shares its budget');
}
const scene=new THREE.Scene(),fx=createFx(scene);fx.firework(10,20,30,.3,.5);fx.update(.1);
const geometry=scene.children.find(o=>o.isPoints).geometry,positions=geometry.getAttribute('position'),colors=geometry.getAttribute('aColor');
for(let i=0;i<positions.count;i++)if(colors.getW(i)>0)assert.ok(Math.hypot(positions.getX(i)-10,positions.getY(i)-20,positions.getZ(i)-30)<.7,'close burst expansion scales with its viewing distance');
console.log('Celebration projection, terrain visibility, bounded particle budgets and close-view scale passed');

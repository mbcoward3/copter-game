import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './cdp.mjs';
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1]};
const out=resolve(opt('out','build/manual-guidance')),game=pathToFileURL(resolve(opt('game','rescue-squad-3d.html'))).href;
mkdirSync(out,{recursive:true});const browser=launch(['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']),page=await openPage(browser),results=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{for(const vehicle of ['heli','plane','boat'])for(const crew of [1,2]){
 const target=crew===2?1:0,name=vehicle+'-'+crew,notes=[],samples=[];
 await browser.send('Emulation.setDeviceMetricsOverride',{width:crew===2?600:1280,height:720,deviceScaleFactor:1,mobile:false},page.sessionId);
 await page.goto(game+'?seed=2',"!!(window.__game&&document.querySelector('canvas.ready'))");
 await page.click('#setup > summary');await page.click('[data-mode="rescue"]');
 for(let i=0;i<crew;i++){await page.click(`.veh[data-p="${i}"][data-v="${vehicle}"]`);await page.click(`.flt[data-p="${i}"][data-m="${i===target?'pro':'easy'}"]`);}
 const setup=await page.evaluate(`(() => {const c=document.querySelector('.card[data-pilot="${target}"]');return {text:c.textContent,width:c.clientWidth,tableWidth:Math.max(...[...c.querySelectorAll('.keysPro')].filter(t=>getComputedStyle(t).display!=='none').map(t=>t.scrollWidth))};})()`);
 if(setup.tableWidth>setup.width)notes.push('doing manual setup: controls table exceeds its card');
 if(target&&vehicle!=='boat'&&(!setup.text.includes('Right Shift')||(vehicle==='heli'&&!setup.text.includes('Right Ctrl'))))notes.push('doing Blue setup: side-specific control keys are missing');
 await page.click(`.card[data-pilot="${target}"] h3`);writeFileSync(resolve(out,name+'-setup.jpg'),await page.screenshot());
 await page.click(crew===1?'#start1':'#start2');
 await page.evaluate(`window.fixtureOffset=__game.players[${target}].pos.y-__game.terrainHeight(__game.players[${target}].pos.x,__game.players[${target}].pos.z)`);
 for(const phase of ['taxi','boarding','unloading','home','lastCrew','groundedReturn','airborneApproach','fullCrew','choice']){
  if(phase==='taxi'&&vehicle!=='plane')continue;
  if(phase==='groundedReturn'&&vehicle!=='heli')continue;
  if(phase==='airborneApproach'&&vehicle==='boat')continue;
  await page.evaluate(`(() => {
   const G=__game,p=G.players[${target}];G.game.paused=true;G.game.fire=false;
   for(const a of [...G.waiting])G.debug.retire(a);
   for(const a of p.cargo)a.model.removeFromParent();
   p.cargo.length=0;p.incoming=0;p.unloading=0;p.flashT=0;p.fs=5;p.afloat=true;p.grounded=false;p.fireJob=p.spray=null;
   const phase=${JSON.stringify(phase)},home=phase==='home';
   const q=phase==='groundedReturn'?G.SITES.find(s=>Math.hypot(s.x,s.z)>150):home?(p.vehicle==='heli'?{x:0,z:-3}:{x:G.DOCK.x+20,z:G.DOCK.z+10}):G.world.spawn.zoneSea.forest[0];
   p.pos.set(q.x,p.vehicle==='heli'?30:p.vehicle==='plane'?G.PLANE_FLOAT:0,q.z);p.vel.set(0,0,0);
   if(phase==='groundedReturn'){p.grounded=true;p.pos.y=G.terrainHeight(q.x,q.z)+window.fixtureOffset;}
   if(phase==='airborneApproach'){p.afloat=false;p.pos.y=30;}
   p.clearance=p.vehicle==='plane'?p.pos.y-G.PLANE_FLOAT:p.vehicle==='heli'?Math.max(0,p.pos.y-G.terrainHeight(q.x,q.z)-window.fixtureOffset):0;
   if(phase==='boarding')p.incoming=1;
   if(phase==='unloading')p.unloading=1;
   const cargoCount=phase==='fullCrew'?3:['home','lastCrew','groundedReturn','choice'].includes(phase)?1:0;
   for(let i=0;i<cargoCount;i++){
    const a=G.debug.add('ring');G.waiting.splice(G.waiting.indexOf(a),1);a.state='riding';p.basket.attach(a.model);a.model.position.set((i-1)*1.5,0,0);p.cargo.push(a);
   }
   if(phase!=='lastCrew'){
    const a=G.debug.add('ring');a.pos.set(p.pos.x+30,1,p.pos.z+20);a.model.position.copy(a.pos);
   }
   // Refresh the HUD from the normal selection listener after the fixture is staged.
   document.querySelector('.flt[data-p="${target}"][data-m="pro"]').click();
   document.querySelector('#banner').classList.remove('show');
   p.yaw=0;const model=p.vehicle==='heli'?p.heli.group:p[p.vehicle].group;model.position.copy(p.pos);model.rotation.y=0;
   p.cam.position.set(p.pos.x,p.pos.y+8,p.pos.z-20);p.cam.lookAt(p.pos.x,p.pos.y+2,p.pos.z+5);
   for(const other of G.players.filter(o=>o.active&&o!==p)){
    const s=G.world.spawn.zoneSea.reef[0];other.pos.set(s.x,other.vehicle==='heli'?30:other.vehicle==='plane'?G.PLANE_FLOAT:0,s.z);
    const m=other.vehicle==='heli'?other.heli.group:other[other.vehicle].group;m.position.copy(other.pos);
    other.cam.position.set(other.pos.x,other.pos.y+8,other.pos.z-20);other.cam.lookAt(other.pos.x,other.pos.y+2,other.pos.z+5);
   }
  })()`);await wait(350);
  const hint=await page.evaluate(`__game.players[${target}].ui.hint.textContent`),text=hint.toLowerCase();
  const homeWord=vehicle==='heli'?/home|base|paddock/:/jetty/;
  if(phase==='taxi'&&(!text.includes('taxi')||/fly down|lift off/.test(text)))notes.push('doing afloat approach: hint does not describe taxiing');
  if(phase==='boarding'&&(!text.includes('hold position')||!text.includes('aboard')))notes.push('doing boarding: missing wait guidance');
  if(phase==='unloading'&&(!text.includes('hold position')||!text.includes('ashore')))notes.push('doing unloading: missing phase guidance');
  if((phase==='home'||phase==='lastCrew')&&(!homeWord.test(text)||/full/i.test(text)))notes.push('doing partial-load return: missing delivery guidance or falsely Full');
  if(phase==='groundedReturn'&&(!text.includes(target?'enter':'space')||!homeWord.test(text)))notes.push('doing remote grounded departure: missing lift-off key and return guidance');
  if(phase==='airborneApproach'&&!hint.includes(vehicle==='heli'?(target?'Right Ctrl':'R'):(target?'Right Shift':'Left Shift')))notes.push('doing airborne approach: incorrect pilot-specific action key');
  if(phase==='fullCrew'&&!homeWord.test(text))notes.push('doing full crew return: missing home instruction');
  if(phase==='choice'&&(!text.includes('1 aboard')||!homeWord.test(text)||!text.includes('another')))notes.push('doing partial remote crew: rescue/return choice is missing');
  const layout=await page.evaluate(`(() => {const p=__game.players[${target}],r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};};return {pane:r(p.pane),hint:r(p.ui.hint),radar:r(p.pane.querySelector('.radar')),instruments:r(p.ui.alt)};})()`);
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  if(layout.hint.x<layout.pane.x||layout.hint.x+layout.hint.w>layout.pane.x+layout.pane.w+1||layout.hint.y<0||layout.hint.y+layout.hint.h>720||overlap(layout.hint,layout.radar)||overlap(layout.hint,layout.instruments))notes.push('doing '+phase+': guidance leaves its pane or overlaps instruments/radar');
  samples.push({phase,hint,layout});
  writeFileSync(resolve(out,name+'-'+phase+'.jpg'),await page.screenshot());
 }
 if(await page.evaluate('(window.__gameProblems||[]).length')||page.errors.length)notes.push('runtime problem in staged guidance');
 results.push({name,ok:!notes.length,notes,samples});console.log((notes.length?'FAIL ':'ok ')+name+' '+notes.join('; '));
}}finally{browser.close();}writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.ok))process.exitCode=1;

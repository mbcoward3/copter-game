// Short rendered inspections of every machine and crew, using both control modes.
// These check rendering/input stability, not a person's ability to finish a manual mission.
import { launch, openPage } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const out = resolve('build/volcano-controls'); mkdirSync(out,{recursive:true});
const browser=launch(['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']);
const results=[];
try {
  const page=await openPage(browser);
  for(const crew of [['heli'],['plane'],['boat'],['heli','plane'],['heli','boat'],['plane','boat']]) for(const controls of ['easy','pro']) for(const mode of ['rescue','fire']) {
    const name=crew.join('+')+'-'+controls+'-'+mode;
    await page.goto(pathToFileURL(resolve('rescue-squad-3d.html')).href+'?seed=1',"!!document.querySelector('canvas.ready')");
    await page.click('#setup > summary'); await page.click('[data-mode="'+mode+'"]');
    await page.evaluate("(()=>{const s=document.querySelector('#location');s.value='volcano';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    for(let i=0;i<crew.length;i++){await page.click('.veh[data-p="'+i+'"][data-v="'+crew[i]+'"]');await page.click('.flt[data-p="'+i+'"][data-m="'+controls+'"]');}
    await page.click(crew.length===1?'#start1':'#start2');
    // Inspection placement only; the ordinary play-check separately watches the real home-to-mission trip.
    await page.evaluate(`(()=>{const G=__game;G.debug.goto('volcano',15);const anchor=G.players[0].pos.clone();G.players.filter(p=>p.active).forEach((p,i)=>{p.pos.copy(anchor);p.pos.x-=i*18;p.pos.z-=i*18;p.pos.y=p.vehicle==='heli'?32:p.vehicle==='plane'?16: G.waveHeight(p.pos.x,p.pos.z,G.game.t);p.vel.set(0,0,0);p.camPos.set(p.pos.x-18, p.pos.y+12,p.pos.z-24);});})()`);
    await page.key('KeyW',true); if(crew.length>1)await page.key('ArrowUp',true);
    await new Promise(r=>setTimeout(r,4300));
    const state=await page.evaluate(`(()=>{const G=__game;return {zone:G.game.zone.id,fire:G.game.fire,panes:G.players.filter(p=>p.active).map(p=>({vehicle:p.vehicle,pro:p.pro,pos:p.pos.toArray(),hint:p.pane.querySelector('.hint').textContent,width:p.pane.getBoundingClientRect().width})),problems:window.__gameProblems||[]};})()`);
    await page.key('KeyW',false); if(crew.length>1)await page.key('ArrowUp',false);
    const bad=[];
    if(state.zone!=='volcano'||state.fire!==(mode==='fire'))bad.push('doing: selecting an outing; wrong zone or mission');
    for(const p of state.panes){if(!p.pos.every(Number.isFinite)||p.width<300)bad.push('doing: inspecting '+p.vehicle+'; invalid position or collapsed viewport');if(p.pro!==(controls==='pro'))bad.push('doing: selecting '+controls+'; wrong control mode');}
    bad.push(...page.errors.splice(0),...page.logs.splice(0).filter(l=>l.startsWith('error')),...state.problems.map(p=>p.message||p.what));
    writeFileSync(resolve(out,name+'.jpg'),await page.screenshot());results.push({name,bad,state});console.log(bad.length?'FAIL '+name+': '+bad.join('; '):'ok '+name);
  }
}finally{browser.close();writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));}
if(results.some(r=>r.bad.length))process.exitCode=1;

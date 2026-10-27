import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './cdp.mjs';
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1]};
const out=resolve(opt('out','build/celebration')),game=pathToFileURL(resolve(opt('game','rescue-squad-3d.html'))).href;
mkdirSync(out,{recursive:true});
const browser=launch(['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']),page=await openPage(browser),results=[];
try {for(const vehicle of ['heli','plane','boat'])for(const mode of ['rescue','fire'])for(const manual of [false,true])for(const crew of [1,2]){
 const name=vehicle+'-'+mode+'-'+(manual?'manual':'assisted')+'-'+crew,notes=[];
 if(opt('only','')&&!name.includes(opt('only','')))continue;
 await browser.send('Emulation.setDeviceMetricsOverride',{width:crew===1?1280:600,height:720,deviceScaleFactor:1,mobile:false},page.sessionId);
 await page.goto(game+'?seed=2',"!!(window.__game&&document.querySelector('canvas.ready'))");
 await page.click('#setup > summary');await page.click('[data-mode="'+mode+'"]');
 for(let i=0;i<crew;i++){await page.click(`.veh[data-p="${i}"][data-v="${vehicle}"]`);await page.click(`.flt[data-p="${i}"][data-m="${(i===0?manual:!manual)?'pro':'easy'}"]`);}
 await page.click(crew===1?'#start1':'#start2');
 // Stage completed-mission visual state without pretending this is a manual firefighting completion test.
 await page.evaluate(`(() => {
  const G=__game;G.game.paused=true;
  for(const p of G.players.filter(p=>p.active)){
    const q=G.world.spawn.zoneSea[p.idx?'reef':'forest'][0];
    p.pos.set(q.x,p.vehicle==='heli'?30:0,q.z);p.vel.set(0,0,0);p.parked=false;
    p.camPos.copy(p.pos);p.camPos.z-=20;p.camPos.y+=8;p.camLook.copy(p.pos);p.camLook.y+=2;
  }
  window.celebrationSamples=[];const original=G.fx.firework;
  G.fx.firework=function(x,y,z,...rest){window.celebrationSamples.push({point:[x,y,z],views:G.players.filter(p=>p.active).map(p=>{const q=p.pos.clone().set(x,y,z).project(p.cam);return {id:p.idx,ndc:q.toArray(),floor:G.terrainHeight(x,z),distance:p.pos.distanceTo(p.pos.clone().set(x,y,z))};})});return original.call(this,x,y,z,...rest);};
  G.game.celebrate=0;document.querySelector('#banner').classList.remove('show');
 })()`);
 await new Promise(r=>setTimeout(r,500));
 await page.evaluate(`(() => {
  const G=__game;G.game.celebrate=5;G.game.fireT=0;G.game.stickerBursts=0;G.game.paused=false;
  const started=G.game.t;window.celebrationHintTime=null;
  const watch=()=>{if(G.players.filter(p=>p.active).every(p=>p.ui.hint.textContent.includes('safe')))window.celebrationHintTime=G.game.t-started;else if(G.game.celebrate>0)requestAnimationFrame(watch);};
  requestAnimationFrame(watch);
 })()`);
 await new Promise(r=>setTimeout(r,3000));
 const samples=await page.evaluate('window.celebrationSamples');
 const hints=await page.evaluate("__game.players.filter(p=>p.active).map(p=>p.ui.hint.textContent)");
 if(hints.some(h=>!h.includes('safe')))notes.push('doing mission celebration: crew guidance still asks for another task');
 const hintTime=await page.evaluate('window.celebrationHintTime');
 if(hintTime===null||hintTime>.3)notes.push('doing mission celebration: success guidance was delayed beyond 0.3 game seconds');
 for(let id=0;id<crew;id++){
  const visible=samples.filter(s=>{const v=s.views.find(v=>v.id===id),[x,y,z]=v.ndc;return Math.abs(x)<=.85&&Math.abs(y)<=.85&&z>=-1&&z<=1;});
  if(visible.length<3)notes.push('doing distant completion for pilot '+id+': only '+visible.length+' burst centres visible');
 }
 for(const s of samples)if(s.point[1]<Math.max(0,s.views[0].floor)+7.9)notes.push('doing celebration: burst below terrain/water clearance');
 if(await page.evaluate('(window.__gameProblems||[]).length')||page.errors.length)notes.push('runtime error during celebration');
 writeFileSync(resolve(out,name+'.jpg'),await page.screenshot());results.push({name,ok:!notes.length,notes,samples});console.log((notes.length?'FAIL ':'ok ')+name+' '+notes.join('; '));
 }}finally{browser.close();}
writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.ok))process.exitCode=1;

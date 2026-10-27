// Real menus/keys and rendered HUD bounds for manual, assisted and mixed-control crews.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './cdp.mjs';
const args = process.argv.slice(2), opt = (key, fallback) => { const at = args.indexOf('--' + key); return at < 0 ? fallback : args[at + 1]; };
const quick = args.includes('--quick'), out = resolve(opt('out', 'build/pilot'));
const game = pathToFileURL(resolve(opt('game', 'rescue-squad-3d.html'))).href;
mkdirSync(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const jobs = [];
for (const vehicle of ['heli', 'plane', 'boat']) for (const mode of (quick ? ['rescue'] : ['rescue', 'fire']))
  for (const width of (quick ? [1280] : [1280, 600])) for (const crew of (quick ? [1] : [1, 2]))
    jobs.push({ vehicle, mode, width, crew, name: `${vehicle}-${mode}-${width}-${crew}` });
const sample = `(() => {
 const G=__game,rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
 return G.players.filter(p=>p.active).map(p=>({vehicle:p.vehicle,pro:p.pro,forward:p.fs,speed:Math.hypot(p.vel.x,p.vel.z)*3.6,
  height:Math.max(0,p.clearance),vertical:p.grounded?0:p.vel.y,grounded:p.grounded,flash:p.flash,style:p.style,
  visible:!p.ui.alt.hidden&&getComputedStyle(p.ui.alt).display!=='none',instrumentName:p.ui.alt.getAttribute('aria-label'),rows:[...p.ui.alt.querySelectorAll('[data-instrument]')].map(e=>({
   key:e.dataset.instrument,label:e.querySelector('.instrument-label')?.textContent,value:Number(e.querySelector('.instrument-value')?.dataset.value),unit:e.querySelector('small')?.textContent.trim()})),
  pane:rect(p.pane),panel:rect(p.ui.alt),hint:rect(p.ui.hint),radar:rect(p.pane.querySelector('.radar'))}));
})()`;
const overlap = (a, b) => a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function inspect(rows) {
 const notes=[];
 for(const p of rows) {
  const doing=`doing ${p.pro?'manual':'assisted'} ${p.vehicle}`;
  if(p.visible!==p.pro) notes.push(`${doing}: instruments ${p.visible?'visible':'hidden'} for wrong controls`);
  if(!p.pro) continue;
  const speed=p.rows.find(r=>r.key==='speed'),height=p.rows.find(r=>r.key==='height'),vertical=p.rows.find(r=>r.key==='vertical');
  if(!speed||!Number.isFinite(speed.value)||speed.unit!=='km/h'||Math.abs(speed.value-p.speed)>1) notes.push(`${doing}: missing or stale speed`);
  const name=p.vehicle==='heli'?'Helicopter':p.vehicle==='plane'?'Seaplane':'Boat';
  if(p.instrumentName!==name+' instruments')notes.push(`${doing}: instruments named for the wrong vehicle`);
  if(p.vehicle==='boat') {if(height||vertical)notes.push(`${doing}: boat has aircraft instruments`);if(p.forward < -0.2&&speed?.label!=='Astern')notes.push(`${doing}: reverse motion is not labelled Astern`);}
  else {
   if(!height||!Number.isFinite(height.value)||height.unit!=='m'||Math.abs(height.value-p.height)>1)notes.push(`${doing}: missing or stale height`);
   if(!vertical||!Number.isFinite(vertical.value)||vertical.unit!=='m/s'||Math.abs(vertical.value-Math.abs(p.vertical))>0.2)notes.push(`${doing}: missing or stale vertical rate`);
  }
  if(p.panel.w<=0||p.panel.h<=0||p.panel.h>112||p.panel.x<p.pane.x||p.panel.x+p.panel.w>p.pane.x+p.pane.w+1||p.panel.y<0||p.panel.y+p.panel.h>720)notes.push(`${doing}: instrument panel outside its compact bounds`);
  if(overlap(p.panel,p.hint)||overlap(p.panel,p.radar)||overlap(p.hint,p.radar))notes.push(`${doing}: instruments, guidance or radar overlap`);
 }
 return notes;
}
const results=[],queue=[...jobs];
await Promise.all(Array.from({length:2},async()=>{
 const browser=launch(['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']);
 const page=await openPage(browser);
 try {while(queue.length) {
  const job=queue.shift(),notes=[];
  try {
   await browser.send('Emulation.setDeviceMetricsOverride',{width:job.width,height:720,deviceScaleFactor:1,mobile:false},page.sessionId);
   if(!await page.goto(game+'?seed=2',"!!(window.__game&&document.querySelector('canvas.ready'))"))throw Error('game did not become ready');
   page.errors.length=page.logs.length=0;
   await page.click('#setup > summary');await page.click(`[data-mode="${job.mode}"]`);
   await page.evaluate("document.querySelector('#location').value='home';document.querySelector('#location').dispatchEvent(new Event('change'))");
   for(let i=0;i<job.crew;i++){await page.click(`.veh[data-p="${i}"][data-v="${job.vehicle}"]`);await page.click(`.flt[data-p="${i}"][data-m="${i===0?'pro':'easy'}"]`);}
   await page.click(job.crew===1?'#start1':'#start2');await wait(300);
   notes.push(...inspect(await page.evaluate(sample)));
   // One real vertical takeoff/landing, otherwise real throttle and steering.
   const landing=job.vehicle==='heli'&&job.mode==='rescue'&&job.width===1280&&job.crew===1&&!quick;
   if(job.vehicle==='heli')await page.key('Space',true);
   if(!landing)await page.key('KeyW',true);
   if(job.crew===2)await page.key('ArrowUp',true);
   await wait(6500);
   if(job.vehicle==='heli')await page.key('Space',false);
   if(landing){await page.key('ShiftLeft',true);await wait(5500);await page.key('ShiftLeft',false);}
   else {await page.key('KeyA',true);await wait(800);await page.key('KeyA',false);}
   await page.key('KeyW',false);if(job.crew===2)await page.key('ArrowUp',false);await wait(250);
   let state=await page.evaluate(sample);notes.push(...inspect(state));
   if(!quick&&job.vehicle==='boat'&&job.mode==='rescue'&&job.width===1280&&job.crew===1){
    await page.key('KeyS',true);await wait(3500);await page.key('KeyS',false);await wait(100);
    state=await page.evaluate(sample);notes.push(...inspect(state));
    if(state[0].forward>=-0.2)notes.push('doing boat astern input: hull did not reverse');
   }
   if(landing){const p=state[0];if(!p.grounded||!p.style)notes.push('doing manual vertical landing: no rated touchdown');if(p.flash.startsWith('★★ ')&&!p.flash.includes('m/s'))notes.push('doing two-star landing: no useful descent advice');}
   writeFileSync(resolve(out,job.name+'.jpg'),await page.screenshot());
   const toggles=[];
   if(!quick&&job.width===1280&&job.crew===1&&job.mode==='rescue')for(const controls of ['easy','pro']) {
    await page.key('Escape',true);await page.key('Escape',false);
    await page.click(`.flt[data-p="0"][data-m="${controls}"]`);await page.click('#resume');await wait(300);
    const toggled=await page.evaluate(sample);notes.push(...inspect(toggled));toggles.push({controls,state:toggled});
    if(toggled[0].style<state[0].style)notes.push('doing control change: earned stars were lost');
   }
   if(page.errors.length)notes.push(...page.errors);
   if(page.logs.some(l=>l.startsWith('error:')))notes.push(...page.logs.filter(l=>l.startsWith('error:')));
   results.push({...job,ok:!notes.length,notes:[...new Set(notes)],state,toggles});
  } catch(e){results.push({...job,ok:false,notes:[e.message]});}
  const r=results.at(-1);console.log(`${r.ok?'ok':'FAIL'} ${job.name}${r.notes.length?': '+r.notes.join('; '):''}`);
 }}finally{browser.close();}
}));
writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));
if(results.some(r=>!r.ok))process.exitCode=1;

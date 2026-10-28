import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,openPage} from './cdp.mjs';
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1]};
const out=resolve(opt('out','build/assisted-hint-layout')),game=pathToFileURL(resolve(opt('game','rescue-squad-3d.html'))).href;
mkdirSync(out,{recursive:true});const browser=launch(['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']),page=await openPage(browser),results=[];
const overlap=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
try {for(const width of [614,1280])for(const crew of [1,2])for(const vehicle of ['heli','plane','boat'])for(const mode of ['rescue','fire']) {
 const name=[width,crew,vehicle,mode].join('-'),notes=[],samples=[];if(opt('only','')&&!name.includes(opt('only','')))continue;
 await browser.send('Emulation.setDeviceMetricsOverride',{width,height:720,deviceScaleFactor:1,mobile:false},page.sessionId);
 await page.goto(game+'?seed=29',"!!(window.__game&&document.querySelector('canvas.ready'))");
 await page.click('#setup > summary');await page.click(`[data-mode="${mode}"]`);
 for(let i=0;i<crew;i++){await page.click(`.veh[data-p="${i}"][data-v="${vehicle}"]`);await page.click(`.flt[data-p="${i}"][data-m="easy"]`);}
 await page.click(crew===1?'#start1':'#start2');await page.evaluate('__game.game.paused=true');await page.evaluate('new Promise((resolve,reject)=>{const end=performance.now()+3000;function step(){if(__game.players.filter(p=>p.active).every(p=>p.ui.hint.textContent.trim()))return resolve(true);if(performance.now()>end)return reject(new Error("Startup guidance timed out"));requestAnimationFrame(step)}step()})');
 for(const stage of ['startup','wrapping']) {
  // Deliberately long, real assisted copy isolates layout from rescue state decisions.
  if(stage==='wrapping')await page.evaluate(`__game.players.filter(p=>p.active).forEach(p=>p.ui.hint.textContent=${JSON.stringify(mode==='rescue'?'🏡 Hold go · bringing our friends home':'Hold go · Checking the ground · nearly safe')})`);
  const layouts=await page.evaluate(`(() => {const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return __game.players.filter(p=>p.active).map(p=>({pilot:p.idx,hint:p.ui.hint.textContent,pane:rect(p.pane),pill:rect(p.ui.hint),radar:rect(p.pane.querySelector('.radar')),water:rect(p.ui.water),mission:rect(document.querySelector('#mission'))}));})()`);
  for(const l of layouts){if(mode==='fire'&&overlap(l.water,l.mission))notes.push(`${stage} pilot ${l.pilot}: fire gauge overlaps mission progress`);if(stage==='wrapping'&&l.pane.right-l.pane.left<=800&&l.pill.right-l.pill.left<Math.min(240,l.pane.right-l.pane.left-28)-1)notes.push(`${stage} pilot ${l.pilot}: hint wraps before using available width`);if(!l.hint.trim())notes.push(`${stage} pilot ${l.pilot}: missing hint`);if(overlap(l.pill,l.radar))notes.push(`${stage} pilot ${l.pilot}: hint overlaps radar`);if(l.pill.left<l.pane.left-1||l.pill.right>l.pane.right+1||l.pill.top<0||l.pill.bottom>720)notes.push(`${stage} pilot ${l.pilot}: hint outside view`);}
  samples.push({stage,layouts});writeFileSync(resolve(out,name+'-'+stage+'.jpg'),await page.screenshot());
 }
 if(page.errors.length)notes.push(...page.errors.splice(0));results.push({name,ok:!notes.length,notes,samples});console.log((notes.length?'FAIL ':'ok ')+name+' '+notes.join('; '));
}}finally{browser.close();}
writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.ok))process.exitCode=1;

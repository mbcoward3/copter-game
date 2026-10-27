import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './cdp.mjs';
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1]};
const game=pathToFileURL(resolve(opt('game','rescue-squad-3d.html'))).href,out=resolve(opt('out','build/menu'));
mkdirSync(out,{recursive:true});
const browser=launch(['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']),page=await openPage(browser),results=[];
const sample=`(() => {const el=document.querySelector('.go-tip'),blue=document.querySelector('#togetherGuide'),tip=document.querySelector('#menu .tip');return {red:el.textContent,blue:blue?.textContent||'',tip:tip.textContent,closed:!document.querySelector('#setup').open,canvas:document.querySelector('#gl').getAttribute('aria-label'),bounds:[el,blue,document.querySelector('#start1'),document.querySelector('#start2')].filter(Boolean).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:innerWidth,height:r.height};}),errors:window.__gameProblems||[]};})()`;
function inspect(s,v,pro,bv,bpro){const n=[],doing='doing '+(pro?'manual':'assisted')+' '+v+' with '+(bpro?'manual':'assisted')+' Blue '+bv;
 const vehicle={heli:'helicopter',plane:'seaplane',boat:'boat'};
 if(!s.red.toLowerCase().includes(vehicle[v]))n.push(doing+': Red vehicle missing');
 if(pro){if(!s.red.includes('Manual'))n.push(doing+': Manual setting hidden');if(v!=='boat'&&!s.red.includes('Space'))n.push(doing+': missing lift-off key');if(v==='heli'&&s.red.indexOf('Space')>s.red.indexOf('W'))n.push(doing+': wrong helicopter launch order');if(v==='plane'&&s.red.indexOf('W')>s.red.indexOf('Space'))n.push(doing+': wrong seaplane launch order');if(v==='boat'&&!s.red.includes('steer'))n.push(doing+': missing steering');if(s.red.includes('crew helps with the rest'))n.push(doing+': promises autopilot');}
 else if(!s.red.includes('W')||!s.red.includes('↑')||!s.red.includes('crew helps'))n.push(doing+': assisted instructions missing');
 if(!s.blue.includes('Blue')||!s.blue.toLowerCase().includes(vehicle[bv])||!s.blue.includes(bpro?'Manual':'Assisted')||!s.blue.includes('↑')||(bpro&&bv!=='boat'&&!s.blue.includes('Enter')))n.push(doing+': incorrect independent Blue guide');
 if(s.bounds.some(r=>r.x<0||r.right>r.width+1||r.height<=0))n.push(doing+': guide or start button outside viewport');
 if(s.errors.length)n.push(doing+': runtime problem');return n;}
try {for(const width of [1280,600])for(const v of ['heli','plane','boat'])for(const pro of [false,true])for(const bpro of [false,true]){
 const name=v+'-'+(pro?'manual':'assisted')+'-blue-'+(bpro?'manual':'assisted')+'-'+width,bv={heli:'plane',plane:'boat',boat:'heli'}[v],notes=[];
 if(opt('only','')&&!name.includes(opt('only','')))continue;
 await browser.send('Emulation.setDeviceMetricsOverride',{width,height:720,deviceScaleFactor:1,mobile:false},page.sessionId);
 await page.goto(game+'?seed=2',"!!(window.__game&&document.querySelector('canvas.ready'))");
 await page.click('#setup > summary');
 for(const [i,vehicle,manual]of [[0,v,pro],[1,bv,bpro]]){await page.click(`.veh[data-p="${i}"][data-v="${vehicle}"]`);await page.click(`.flt[data-p="${i}"][data-m="${manual?'pro':'easy'}"]`);}
 notes.push(...inspect(await page.evaluate(sample),v,pro,bv,bpro));
 await page.goto(game+'?seed=2&returning=1',"!!(window.__game&&document.querySelector('canvas.ready'))");
 const returning=await page.evaluate(sample);notes.push(...inspect(returning,v,pro,bv,bpro));if(!returning.closed)notes.push('setup unexpectedly open after reload');
 writeFileSync(resolve(out,name+'.jpg'),await page.screenshot());
 await page.click('#start2');
 const description=await page.evaluate("document.querySelector('#gl').getAttribute('aria-label')");
 if(!description.includes('Red:')||!description.includes('Blue:')||(pro&&v!=='boat'&&!description.includes('Space'))||(bpro&&bv!=='boat'&&!description.includes('Enter')))notes.push('doing two-player launch: accessible game instructions disagree with controls');
 if(v==='heli'&&pro&&bpro&&width===600){
  await page.click('#settings > summary');await page.click('#bP2');
  if((await page.evaluate("document.querySelector('#gl').getAttribute('aria-label')")).includes('Blue:'))notes.push('doing Blue departure: stale accessible instructions');
  await page.click('#bP2');
  if(!(await page.evaluate("document.querySelector('#gl').getAttribute('aria-label')")).includes('Blue:'))notes.push('doing Blue arrival: missing accessible instructions');
 }
 await page.click('#bPause');notes.push(...inspect(await page.evaluate(sample),v,pro,bv,bpro));
 for(const e of page.errors.splice(0))notes.push(e);
 results.push({name,ok:!notes.length,notes});console.log((notes.length?'FAIL ':'ok ')+name+(notes.length?' '+notes.join('; '):''));
 }}finally{browser.close();}
writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.ok))process.exitCode=1;

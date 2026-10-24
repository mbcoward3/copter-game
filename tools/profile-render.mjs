// Serial live-page profiling. Never run alongside other GPU checks when comparing results.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './cdp.mjs';
const args = process.argv.slice(2), option = (key, fallback) => {const i=args.indexOf('--'+key);return i<0?fallback:args[i+1]};
const seconds=Number(option('seconds',20)), only=option('only',''), dpr=Number(option('dpr',1)), quality=Number(option('quality',0));
const hotspot=args.includes('--hotspot'), automatic=args.includes('--auto');
const out=resolve(option('out','build/profile')); mkdirSync(out,{recursive:true});
const cases=[];
for(const vehicle of ['heli','plane','boat']) for(const control of ['easy','pro']) for(const mode of ['rescue','fire']) cases.push({name:`${vehicle}-${control}-${mode}`,vehicles:[vehicle],control,mode});
for(const control of ['easy','pro']) for(const mode of ['rescue','fire']) cases.push({name:`split-${control}-${mode}`,vehicles:mode==='fire'?['plane','boat']:['heli','plane'],control,mode});
const browser=launch(['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']);
const results=[];
try {
  const page=await openPage(browser,{width:1440,height:900});
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:dpr,mobile:false},page.sessionId);
  for(const job of cases.filter(j=>!only||j.name.includes(only))) {
    const errors=page.errors.length, logs=page.logs.length, t0=Date.now();
    if(!await page.goto(pathToFileURL(resolve('rescue-squad-3d.html')).href+'?seed=20261024',"!!document.querySelector('canvas.ready')")) throw Error('Startup timed out');
    const startupMs=Date.now()-t0;
    await page.click('#setup > summary'); await page.click(`[data-mode="${job.mode}"]`);
    for(let i=0;i<job.vehicles.length;i++){await page.click(`.veh[data-p="${i}"][data-v="${job.vehicles[i]}"]`);await page.click(`.flt[data-p="${i}"][data-m="${job.control}"]`)}
    await page.click(job.vehicles.length===2?'#start2':'#start1');
    await page.evaluate(`__game.quality.mode='${automatic?'auto':'best'}';__game.setQuality(${quality});__game.setWeather(${job.mode==='fire'?2:0});__game.setPreset(${job.control==='pro'?1:0})`);
    if(hotspot && job.mode==='fire')await page.evaluate(`(() => {const G=__game;G.debug.zone('forest',true);G.debug.fire('forest');const F=G.waiting.find(a=>a.fire)?.fire;if(!F)throw Error('No fire to profile');for(const p of G.players.filter(p=>p.active)){const at=p.vehicle==='boat'?F.shore:p.vehicle==='plane'?F.scoop:F.dip;p.pos.set(at.x,p.vehicle==='heli'?Math.max(35,F.y+18):p.vehicle==='plane'?G.PLANE_FLOAT:0,at.z);p.vel.set(0,0,0);p.parked=false;p.grounded=p.landed=false;p.afloat=p.vehicle!=='heli';p.camPos.set(p.pos.x+18,p.pos.y+12,p.pos.z-24);p.camLook.copy(p.pos);p.spin=1;}F.engaged=true})()`);
    await page.key('KeyW',true);if(job.vehicles.length===2)await page.key('ArrowUp',true);
    await new Promise(r=>setTimeout(r,2500));
    const before=await page.evaluate('(__game.metrics.stop(),__game.metrics.start(),__game.metrics.snapshot())');
    await new Promise(r=>setTimeout(r,seconds*1000));
    const capture=await page.evaluate(`(() => {const G=__game,g=G.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {metrics:G.metrics.snapshot(),hardware:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null,navBuildMs:G.navMs,finalQuality:{level:G.quality.level,scale:G.quality.scale},fire:G.waiting.filter(a=>a.fire).map(a=>({active:a.fire.active,drops:a.fire.drops,waterUsed:a.fire.waterUsed})),players:G.players.filter(p=>p.active).map(p=>({vehicle:p.vehicle,pos:p.pos.toArray(),cargo:p.cargo.length,rescued:p.rescued})),problems:window.__gameProblems||[]}})()`);
    await page.key('KeyW',false);if(job.vehicles.length===2)await page.key('ArrowUp',false);
    writeFileSync(resolve(out,job.name+'.jpg'),await page.screenshot());
    const result={...job,seconds,dpr,quality,hotspot,automatic,startupMs,before,...capture,errors:page.errors.slice(errors),logs:page.logs.slice(logs)};results.push(result);
    writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));
    console.log(`${job.name}: GPU p95=${capture.metrics.gpu.p95?.toFixed(2)??'unavailable'} ms; frame p95=${capture.metrics.frame.p95?.toFixed(2)} ms; calls=${capture.metrics.calls.p50}`);
  }
} finally {browser.close()}
if(results.some(r=>r.errors.length||r.problems.length||r.logs.some(s=>s.startsWith('error:'))))process.exitCode=1;

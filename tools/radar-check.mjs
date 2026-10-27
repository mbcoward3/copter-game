import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './cdp.mjs';
const args = process.argv.slice(2), opt = (key, fallback) => { const i = args.indexOf('--' + key); return i < 0 ? fallback : args[i + 1]; };
const out = resolve(opt('out', 'build/radar')), game = pathToFileURL(resolve(opt('game', 'rescue-squad-3d.html'))).href;
mkdirSync(out, { recursive: true });
const browser = launch(['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']), page = await openPage(browser), results = [];
try {
  for (const vehicle of ['heli', 'plane', 'boat']) for (const manual of [false, true]) for (const crew of [1, 2]) {
    const name = vehicle + '-' + (manual ? 'manual' : 'assisted') + '-' + crew, notes = [];
    await browser.send('Emulation.setDeviceMetricsOverride', { width: crew === 1 ? 1280 : 600, height: 720, deviceScaleFactor: 1, mobile: false }, page.sessionId);
    await page.goto(game + '?seed=2', "!!(window.__game&&document.querySelector('canvas.ready'))");
    await page.click('#setup > summary'); await page.click('[data-mode="rescue"]');
    await page.click(`.veh[data-p="0"][data-v="${vehicle}"]`);
    await page.click(`.flt[data-p="0"][data-m="${manual ? 'pro' : 'easy'}"]`);
    if (crew === 2) { await page.click('.veh[data-p="1"][data-v="heli"]'); await page.click(`.flt[data-p="1"][data-m="${manual ? 'easy' : 'pro'}"]`); }
    await page.click(crew === 1 ? '#start1' : '#start2');
    // Staged scenes isolate marker accuracy. Regular play-check covers movement and real mission progression.
    await page.evaluate(`(() => {
      const G=__game; G.game.paused=true; for(const a of [...G.waiting]) G.debug.retire(a);
      const p=G.players[0]; p.pos.set(130,30,140); p.vel.set(0,0,0); p.yaw=0; p.cargo.length=0;
      const cases=[['ring',-80,['heli','boat','plane']],['ledge',-40,['heli']],['hut',0,['heli','boat']],['lake',40,['heli']],['ring',80,['heli','boat','plane']]];
      window.radarCases=cases.map(([kind,x,vehicles])=>{
        const a=G.debug.add(kind); a.pos.set(p.pos.x+x,1,p.pos.z+70); a.model.position.copy(a.pos); return {a,vehicles};
      });
      for(const [x,shore,scoop,scoopOk,vehicles] of [[-70,true,false,undefined,['heli','boat']],[0,false,true,undefined,['heli','plane']],[70,true,true,false,['heli','boat']]]) {
        const a=G.debug.add('ring'); a.pos.set(p.pos.x+x,1,p.pos.z-70); a.model.position.copy(a.pos);
        a.fire={x:a.pos.x,z:a.pos.z,out:false,shore,scoop:scoop?{x:a.pos.x,z:a.pos.z}:null,scoopOk};
        window.radarCases.push({a,vehicles});
      }
    })()`);
    await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const sample = await page.evaluate(`(() => {
      const G=__game,p=G.players[0],c=p.pane.querySelector('.radar'),g=c.getContext('2d'),home=p.vehicle==='heli'?{x:0,z:-3}:G.DOCK;
      const point=(x,z)=>({x:168-(x-p.pos.x)/210*154,y:168-(z-p.pos.z)/210*154});
      const pixel=(x,y)=>[...g.getImageData(Math.round(x),Math.round(y),1,1).data]; let sx=0,sy=0,n=0;
      const image=g.getImageData(0,0,336,336).data;
      for(let y=0;y<336;y++)for(let x=0;x<336;x++){const i=(y*336+x)*4;if(image[i]===93&&image[i+1]===255&&image[i+2]===143){sx+=x;sy+=y;n++;}}
      const markers=window.radarCases.map(({a,vehicles})=>{const q=point(a.pos.x,a.pos.z);return {kind:a.kind,fire:!!a.fire,vehicles,distance:Math.hypot(a.pos.x-p.pos.x,a.pos.z-p.pos.z),rgba:pixel(q.x,q.y)};});
      return {home:point(home.x,home.z),green:n?{x:sx/n,y:sy/n}:null,label:c.getAttribute('aria-label'),markers,
        range:Number(p.ui.alt.querySelector('[data-instrument="range"] .instrument-value')?.dataset.value),problems:window.__gameProblems||[]};
    })()`);
    if (!sample.green || Math.hypot(sample.green.x - sample.home.x, sample.green.y - sample.home.y) > 2) notes.push('doing return home: green marker points away from the delivery area');
    if (!sample.label?.includes(vehicle === 'heli' ? 'landing' : 'jetty')) notes.push('doing return home: radar does not name the delivery area');
    for (const m of sample.markers) {
      const expected = m.vehicles.includes(vehicle), color = m.fire ? [255, 90, 42] : [255, 210, 60];
      const shown = color.every((v, i) => m.rgba[i] === v);
      if (shown !== expected) notes.push('doing ' + (m.fire ? 'fire' : m.kind) + ' rescue: ' + (shown ? 'incompatible work shown' : 'compatible work hidden'));
    }
    const nearest = Math.min(...sample.markers.filter(m => !m.fire && m.vehicles.includes(vehicle)).map(m => m.distance));
    if (manual && (!Number.isFinite(sample.range) || Math.abs(sample.range - nearest) > 1)) notes.push('doing precision approach: friend range disagrees with compatible radar markers');
    if (sample.problems.length || page.errors.length) notes.push('runtime error while drawing staged radar');
    writeFileSync(resolve(out, name + '.jpg'), await page.screenshot());
    results.push({ name, ok: !notes.length, notes, sample }); console.log((notes.length ? 'FAIL ' : 'ok ') + name + ' ' + notes.join('; '));
  }
} finally { browser.close(); }
writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
if (results.some(r => !r.ok)) process.exitCode = 1;

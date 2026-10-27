import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,openPage} from './cdp.mjs';
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1]},out=resolve(opt('out','build/analog'));
const game=pathToFileURL(resolve(opt('game','rescue-squad-3d.html'))).href;
mkdirSync(out,{recursive:true});const browser=launch(['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']),page=await openPage(browser),results=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try {for(const vehicle of ['heli','plane','boat']){
 const notes=[];await page.goto(game+'?seed=2',"!!(window.__game&&document.querySelector('canvas.ready'))");
 await page.click('#setup > summary');await page.click('[data-mode="rescue"]');
 await page.evaluate("document.querySelector('#location').value='home';document.querySelector('#location').dispatchEvent(new Event('change'))");
 await page.click(`.veh[data-p="0"][data-v="${vehicle}"]`);await page.click('.flt[data-p="0"][data-m="pro"]');await page.click('#start1');
 await page.evaluate(`(() => {window.analogPad={connected:true,index:0,mapping:'standard',axes:[.1801,-.1801,.1801,0],buttons:Array.from({length:16},()=>({value:0,pressed:false}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.analogPad]});})()`);
 await wait(300);
 const fine=await page.evaluate('({f:__game.players[0].input.f,s:__game.players[0].input.s,t:__game.players[0].input.t})');
 if(Object.values(fine).some(v=>!Number.isFinite(v)||Math.abs(v)>.001)||fine.f<=0||fine.s<=0||fine.t>=0)notes.push('doing fine stick movement: tilt/slide/yaw jumps above 0.001 or has the wrong direction');
 await page.evaluate('window.analogPad.axes.fill(0)');
 // Start the existing engine through real keys; this is a mapping/physics test, not a real-device test.
 await page.key(vehicle==='heli'?'Space':'KeyW',true);await wait(3500);await page.key(vehicle==='heli'?'Space':'KeyW',false);await wait(1000);
 await page.evaluate('window.analogPad.axes[1]=-.35');await wait(6000);
 const slow=await page.evaluate('({input:__game.players[0].input.f,speed:__game.players[0].fs,afloat:__game.players[0].afloat})');
 if(!Number.isFinite(slow.input)||slow.input<.19||slow.input>.22)notes.push('doing partial manual throttle: continuous stick range is not used');
 if(vehicle==='plane'&&(!slow.afloat||slow.speed>7||slow.speed<.5))notes.push('doing gentle water taxi: partial throttle failed to taxi, caused takeoff or exceeded 7 m/s');
 writeFileSync(resolve(out,vehicle+'-partial.jpg'),await page.screenshot());
 if(vehicle==='plane'){
  await page.evaluate('window.analogPad.axes[1]=.35');await wait(7000);
  const reverse=await page.evaluate('__game.players[0].fs');
  if(!Number.isFinite(reverse)||reverse>=0||reverse< -1)notes.push('doing reverse taxi: partial throttle is not a slow astern speed');
  await page.evaluate('window.analogPad.axes[1]=0');await page.key('KeyW',true);await wait(7500);await page.key('KeyW',false);
  if(await page.evaluate('__game.players[0].afloat'))notes.push('doing full keyboard takeoff: seaplane failed to leave the water');
 }
 await page.evaluate('window.analogPad.axes[1]=0');await page.click('#bPause');await page.click('.flt[data-p="0"][data-m="easy"]');await page.click('#resume');
 await page.evaluate('window.analogPad.axes[1]=-.35');await wait(300);
 const assisted=await page.evaluate('__game.players[0].input.f');
 if(Math.abs(assisted-.35)>.0001)notes.push('doing assisted hold-go: established stick mapping changed');
 await page.click('#bPause');await page.click(`.veh[data-p="1"][data-v="${vehicle}"]`);await page.click('.flt[data-p="1"][data-m="pro"]');await page.click('#start2');
 await page.evaluate(`(() => {window.analogPad2={...window.analogPad,index:1,axes:[0,-.35,0,0]};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.analogPad,window.analogPad2]});})()`);await wait(300);
 const mixed=await page.evaluate('__game.players.map(p=>p.input.f)');
 if(Math.abs(mixed[0]-.35)>.0001||mixed[1]<.19||mixed[1]>.22)notes.push('doing mixed-control crew: independent gamepad mappings disagree with each pilot');
 await page.evaluate("Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.analogPad]})");await wait(300);
 if(await page.evaluate('__game.players[1].input.f')!==0)notes.push('doing Blue controller disconnect: stale throttle remains active');
 if(await page.evaluate('(window.__gameProblems||[]).length')||page.errors.length)notes.push('runtime error during analog play');
 results.push({vehicle,ok:!notes.length,notes,fine,slow,assisted,mixed});console.log((notes.length?'FAIL ':'ok ')+vehicle+' '+notes.join('; '));
 }}finally{browser.close();}writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.ok))process.exitCode=1;

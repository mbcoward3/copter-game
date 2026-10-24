// Real renderer regressions; run serially on the GPU. No FPS threshold depends on the test machine.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './cdp.mjs';
mkdirSync('build/render', { recursive: true });
const browser = launch(['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']);
try {
  const page = await openPage(browser);
  assert.ok(await page.goto(pathToFileURL(resolve('rescue-squad-3d.html')).href + '?seed=42', '!!window.__game'), 'Game loads');
  await new Promise(r => setTimeout(r, 2000));
  assert.deepEqual(page.errors, [], 'Startup errors');
  assert.deepEqual(page.logs.filter(s=>s.startsWith('error:')), [], 'Shader errors');
  assert.ok(await page.evaluate("!!document.querySelector('canvas.ready')"), 'Shaders finish warming');
  await page.click('#start1');
  await page.evaluate('__game.game.paused=true; __game.quality.mode="best"; __game.setQuality(0)');
  const shadows = [];
  for (const reflections of [true, false]) shadows.push(await page.evaluate(`new Promise(resolve => {
    const G=__game, old=G.composer.render, calls=[], hooks=[]; G.gfx.reflections=${reflections};
    G.scene.traverse(o=>{if(o.isMesh&&o.castShadow){const h=o.onBeforeShadow; hooks.push([o,h]);o.onBeforeShadow=function(...a){calls.push(this.uuid+':'+(a[6]?.start||0));h.apply(this,a)}}});
    G.composer.render=function(...a){old.apply(this,a);this.render=old;for(const [o,h] of hooks)o.onBeforeShadow=h;resolve(calls.sort())};
  })`));
  const lifetime = await page.evaluate(`(() => {const G=__game,a=G.debug.add('ring'),resources=new Set(),materials=new Set();a.prop.traverse(o=>{if(o.geometry)resources.add(o.geometry)});a.model.traverse(o=>{for(const m of [o.material,o.customDepthMaterial].flat())if(m)materials.add(m)});let disposed=0,materialDisposals=0;for(const r of resources)r.addEventListener('dispose',()=>disposed++);for(const m of materials)m.addEventListener('dispose',()=>materialDisposals++);G.game.paused=false;G.game.spawnT=1e9;G.debug.retire(a);G.debug.noDraw=true;G.debug.run(5);G.debug.noDraw=false;G.game.paused=true;return {resources:resources.size,disposed,materials:materials.size,materialDisposals};})()`);
  const stress = await page.evaluate(`(async()=>{
    const G=__game,frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),retire=list=>{for(const a of list)G.debug.retire(a);G.game.paused=false;G.debug.noDraw=true;G.debug.run(5);G.debug.noDraw=false;G.game.paused=true};
    // Warm every animal's shared geometry/texture; then repeatedly allocate and render private poses.
    const warm=Array.from({length:10},()=>G.debug.add('ring'));for(const a of warm){a.model.position.copy(G.players[0].pos);a.prop.position.copy(G.players[0].pos)}await frames();retire(warm);await new Promise(r=>setTimeout(r,500));await frames();
    const counts=[];
    for(let cycle=0;cycle<12;cycle++){const list=Array.from({length:8},()=>G.debug.add('ring'));for(const a of list){a.model.position.copy(G.players[0].pos);a.prop.position.copy(G.players[0].pos)}await frames();retire(list);await frames();counts.push({...G.renderer.info.memory,programs:G.renderer.info.programs.length})}
    return {cycles:12,entities:96,counts};
  })()`);
  const scaling = await page.evaluate(`(async()=>{const G=__game,before={map:G.world.sun.shadow.map.texture.uuid,samples:G.composer.renderTarget1.samples};G.setRenderScale(.8);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const after={map:G.world.sun.shadow.map.texture.uuid,samples:G.composer.renderTarget1.samples};G.setRenderScale(1);return {before,after}})()`);
  const report = { shadowParity: JSON.stringify(shadows[0]) === JSON.stringify(shadows[1]), shadowCounts: shadows.map(s=>s.length), lifetime, stress, scaling, errors: page.errors, logs: page.logs };
  writeFileSync('build/render/check.json', JSON.stringify(report,null,2));
  console.log(report);
  assert.ok(report.shadowParity, 'Reflection toggle preserves shadow casters');
  // Cached ring geometry deliberately survives retirement; any per-entity geometry must be released.
  assert.ok(lifetime.resources === 1 || lifetime.disposed === lifetime.resources, 'Ring uses shared geometry or releases its private segments');
  assert.equal(lifetime.materialDisposals,lifetime.materials,'Animal private surface/depth materials retire');
  const tail=stress.counts.slice(-6);
  assert.ok(Math.max(...tail.map(c=>c.geometries))-Math.min(...tail.map(c=>c.geometries))<=1,'Geometry allocation reaches a plateau');
  assert.ok(Math.max(...tail.map(c=>c.programs))-Math.min(...tail.map(c=>c.programs))<=1,'Shader allocation reaches a plateau');
  assert.deepEqual(scaling.before,scaling.after,'Resolution adjustment preserves shadow map and MSAA configuration');
  assert.deepEqual(page.errors, []);
  assert.deepEqual(page.logs.filter(s=>s.startsWith('error:')), []);
} finally { browser.close(); }

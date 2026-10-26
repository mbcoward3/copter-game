// Pictures of the scenery for art review: each zone from above, at mid range and close in at the shore, plus the home
// base up close, in the real renderer with the menu hidden.
//   node tools/scene-shots.mjs [--out build/shots/scene] [--light day,dusk] [--only forest,home]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './cdp.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const out = resolve(opt('out', 'build/shots/scene')), lights = opt('light', 'day').split(','), only = opt('only', '');
mkdirSync(out, { recursive: true });
const browser = launch(['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']);
try {
  const page = await openPage(browser, { width: 1280, height: 720 });
  if (!await page.goto(pathToFileURL(resolve('rescue-squad-3d.html')).href + '?seed=1', "!!document.querySelector('canvas.ready')")) throw Error('Game did not load');
  if (args.includes('--active')) { await page.click('#start1'); await page.evaluate("__game.debug.zone('volcano'); __game.game.spawnT = 1e9; __game.debug.run(3); __game.game.state = 'menu'"); }
  await page.evaluate(`(() => { const G = __game; G.quality.mode = 'best'; G.setQuality(0);
    for (const e of document.querySelectorAll('#menu, .pane, #hud, .hud')) e.style.visibility = 'hidden'; })()`);
  const frames = n => page.evaluate(`new Promise(r => { let k = ${n}; const f = () => --k ? requestAnimationFrame(f) : r(); requestAnimationFrame(f); })`);
  // every view: [name, camera x, z, height above the ground or sea there, look x, z, look height]
  const views = await page.evaluate(`(() => {
    const G = __game, v = [];
    for (const Z of G.ZONES) {
      const a = 0.7;
      v.push([Z.id + '-overview', Z.x + Math.sin(a) * Z.r * 1.6, Z.z + Math.cos(a) * Z.r * 1.6, Z.r * 0.75, Z.x, Z.z, 0]);
      v.push([Z.id + '-mid', Z.x + Math.sin(a + 2.2) * Z.r * 0.75, Z.z + Math.cos(a + 2.2) * Z.r * 0.75, 22, Z.x, Z.z, 4]);
      // close in at the shore: the first point out from the middle where the ground meets the sea
      let sx = Z.x, sz = Z.z;
      for (let d = 0; d < Z.r * 1.4; d += 2) { const x = Z.x + Math.sin(a - 1) * d, z = Z.z + Math.cos(a - 1) * d; if (G.terrainHeight(x, z) < 0) { sx = x; sz = z; break; } }
      v.push([Z.id + '-shore', sx + Math.sin(a - 1) * 18, sz + Math.cos(a - 1) * 18, 3, sx - Math.sin(a - 1) * 25, sz - Math.cos(a - 1) * 25, 2]);
    }
    v.push(['base-hangar', 30, 40, 6, 20, -10, 6], ['base-pier', -14, 82, 3, 0, 40, 1], ['base-pads', -30, -40, 12, 0, 0, 2]);
    // the made things, up close: the harbour's street and quay, the fire tower, the stilt huts, the wreck
    v.push(['prop-street', 472, -142, 2.5, 448, -170, 3], ['prop-quay', 405, -132, 4, 435, -160, 2]);
    const T = G.world.towerDeck; if (T) v.push(['prop-tower', T.x + 14, T.z + 12, 3, T.x, T.z, 8]);
    const H = G.HUTS[0]; if (H) v.push(['prop-huts', H.x + 16, H.z + 14, 3, H.x, H.z, 3]);
    const W = G.world.wreck; if (W) v.push(['prop-wreck', W.x + 16, W.z + 14, 4, W.x, W.z, 2]);
    // the snowy peaks: the lodge from its pad, the glacier's foot over the cove, an iceberg, the penguins
    const L = G.world.lodge; if (L) v.push(['prop-lodge', L.x + Math.sin(L.yaw) * 15 + Math.cos(L.yaw) * 7, L.z + Math.cos(L.yaw) * 15 - Math.sin(L.yaw) * 7, 4, L.x, L.z, 3]);
    v.push(['prop-glacier', 120, -400, 14, 96, -450, 3]);
    const B = (G.world.bergs || []).find(b => !b.small); if (B) v.push(['prop-berg', B.x + 30, B.z + 25, 6, B.x, B.z, 4]);
    const P = G.icy && G.icy.penguins[0]; if (P) v.push(['prop-penguins', P.x + 5, P.z + 6, 2.5, P.x, P.z, 0.4]);
    if (G.world.volcano) {
      const V = G.world.volcano, C = G.world.crater;
      v.push(['volcano-crater', C.x+17,C.z+22,35,C.x,C.z,2], ['volcano-west', C.x-145,C.z-100,65,C.x,C.z,14]);
      for (const S of V.sites) { const p=S.props[0]; v.push(['volcano-'+(S.name.startsWith('Lava')?'lookout':'camp'),p.x+10,p.z+16,5,p.x,p.z,2]); }
      const p=V.columnData[0]; if(p) v.push(['volcano-basalt',p.x+14,p.z+18,4,p.x,p.z,1]);
    }
    return v; })()`);
  for (const light of lights) {
    await page.evaluate(`(() => { const G = __game; G.setPreset(${light === 'dusk' ? 1 : light === 'night' ? 2 : 0}); G.setWeather(${light === 'storm' ? 2 : 0}); G.weather.now = ${light === 'storm' ? 1 : 0.1}; })()`);
    await frames(30);
    for (const [name, cx, cz, ch, lx, lz, lh] of views) {
      if (only && !only.split(',').some(o => name.startsWith(o))) continue;
      await page.evaluate(`(() => { const G = __game, g = (x, z) => Math.max(0, G.terrainHeight(x, z));
        G.debug.view = [${cx}, g(${cx}, ${cz}) + ${ch}, ${cz}, ${lx}, g(${lx}, ${lz}) + ${lh}, ${lz}]; })()`);
      await frames(20);
      writeFileSync(resolve(out, `${name}-${light}.jpg`), await page.screenshot());
    }
  }
  if (page.errors.length) { console.error(page.errors); process.exitCode = 1; }
  console.log('shots in', out);
} finally { browser.close(); }

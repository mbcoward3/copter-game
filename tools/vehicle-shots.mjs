// Close-up and play-distance pictures of one vehicle, in the real renderer, for art review.
//   node tools/vehicle-shots.mjs [--vehicle plane] [--out build/shots/plane] [--light day,dusk,storm] [--views a,b]
// The vehicle sits at its mooring behind the (hidden) menu; the camera holds still at each view.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './cdp.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const vehicle = opt('vehicle', 'plane'), out = resolve(opt('out', 'build/shots/' + vehicle));
const lights = opt('light', 'day,dusk,storm').split(','), only = opt('views', '');
// [camera offset, look offset] from the vehicle, in its own axes: +z forward (nose), +x port, +y up
const VIEWS = {
  plane: {
    front34: [[7, 3, 11], [0, 0.3, 0.5]], port: [[7.5, 1.2, -0.5], [0, -0.2, -0.3]], door: [[3.4, 0.3, -0.6], [0.5, -0.6, -0.5]],
    cockpit: [[2.6, 1.8, 7.6], [0, 0.1, 4.2]], rear34: [[-8, 4, -12], [0, 0.5, 0]], waterline: [[-9, 0.25, 3], [0, -0.6, 0.5]],
    top: [[0.5, 17, -5], [0, 0, 0]], play: [[0, 12, -24], [0, 0, 0]],
  },
  boat: {
    front34: [[-7, 3.5, 10], [0, 1, 0.5]], starboard: [[-8, 1.8, 0], [0, 1, 0]], cabin: [[-3.5, 2.2, 4], [0, 1.6, 0.5]], deck: [[-2.5, 3.2, -6.5], [0, 0.8, -1.5]],
    rear34: [[-6, 4, -10], [0, 1, -1]], waterline: [[-8, 0.3, 4], [0, 0.4, 0.5]], top: [[0.5, 16, -4], [0, 0, 0]], play: [[0, 12, -24], [0, 0, 0]],
  },
  heli: {
    front34: [[8, 2, 11], [0, 0, 0.5]], port: [[9, 0.5, 0], [0, 0, -0.5]], door: [[4.5, 0, 1], [0, -0.2, 0.4]],
    cockpit: [[2.5, 1, 7.5], [0, 0, 3.2]], rear34: [[-8, 3.5, -14], [0, 0.5, -2]], top: [[0.5, 18, -5], [0, 0, -1]], play: [[0, 12, -24], [0, 0, 0]],
  },
}[vehicle];
mkdirSync(out, { recursive: true });
const browser = launch(['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']);
try {
  const page = await openPage(browser, { width: 1280, height: 720 });
  if (!await page.goto(pathToFileURL(resolve('rescue-squad-3d.html')).href + '?seed=1', "!!document.querySelector('canvas.ready')")) throw Error('Game did not load');
  await page.evaluate(`(() => { const G = __game; G.quality.mode = 'best'; G.setQuality(0); G.debug.vehicle(${JSON.stringify(vehicle)});
    for (const e of document.querySelectorAll('#menu, .pane, #hud, .hud')) e.style.visibility = 'hidden'; })()`);
  const frames = n => page.evaluate(`new Promise(r => { let k = ${n}; const f = () => --k ? requestAnimationFrame(f) : r(); requestAnimationFrame(f); })`);
  for (const light of lights) {
    await page.evaluate(`(() => { const G = __game; G.setPreset(${light === 'dusk' ? 1 : 0}); G.setWeather(${light === 'storm' ? 2 : 0}); G.weather.now = ${light === 'storm' ? 1 : 0.1}; })()`);
    await frames(30);
    for (const [name, [c, l]] of Object.entries(VIEWS)) {
      if (only && !only.split(',').includes(name)) continue;
      await page.evaluate(`(() => { const p = __game.players[0], s = Math.sin(p.yaw), k = Math.cos(p.yaw);
        const at = ([x, y, z]) => [p.pos.x + x * k + z * s, p.pos.y + y, p.pos.z - x * s + z * k];
        __game.debug.view = [...at(${JSON.stringify(c)}), ...at(${JSON.stringify(l)})]; })()`);
      await frames(12);
      writeFileSync(resolve(out, `${name}-${light}.jpg`), await page.screenshot());
    }
  }
  if (page.errors.length) { console.error(page.errors); process.exitCode = 1; }
  console.log('shots in', out);
} finally { browser.close(); }

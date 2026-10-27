// Plays the real game the way a person does, and says what went wrong. Unlike tools/check.mjs (a fast simulation with
// nothing drawn), this loads the ordinary page in headless Chrome with drawing and sound on, clicks through the start
// menu, holds W with real key presses in real time, and watches:
//   - errors of any kind: thrown in the page, logged to the console, or recorded by the game (window.__gameProblems)
//   - every number in each pilot's state stays a number (one NaN freezes a vehicle, or the screen)
//   - a fresh outing starts at the home base
//   - holding go gets somewhere: a friend aboard or home within the time, or on a fire, water taken on and dropped
//   - the helicopter's cable really joins the hook to the basket or bucket, and only one of them is out
//   - no boat sails through the home pier or the harbour's jetties
//   - moving on to the next mission leaves everyone where they are (only a fresh outing starts at home)
//   - the snowy peaks' scenery is in place (__game.debug.icyCheck: icebergs charted and clear of rescue spots, penguins
//     and the lodge on the ground), and in its own outing at night the easy helicopter, holding only go, fetches the
//     climber off the summit without any new shaders being built on the way (see ICY-PEAKS.md)
// and saves screenshots along the way (build/play/) to look at.
//
//   npm run play-check                      every machine x Rescue / Firefighting / Surprise me, solo, plus two together
//   npm run play-check -- --only plane      one machine;  --seconds 90  how long each plays (real seconds)
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHROME, launch, openPage } from './cdp.mjs';
import { observeMissionTransition } from './mission-transition.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const LOCATION = opt('location', '');
const SECONDS = Number(opt('seconds', 75)), ONLY = opt('only', ''), WORKERS = Number(opt('workers', 4));
const GAME = pathToFileURL(resolve(opt('game', join(ROOT, 'rescue-squad-3d.html')))).href;
const OUT = join(ROOT, 'build', LOCATION ? 'play-' + LOCATION : 'play');
mkdirSync(OUT, { recursive: true });

const jobs = [];
for (const v of ['heli', 'plane', 'boat']) for (const mode of ['rescue', 'fire', 'mixed']) jobs.push({ name: `${v}-${mode}`, pilots: [v], mode });
jobs.push({ name: 'heli+plane-rescue', pilots: ['heli', 'plane'], mode: 'rescue' }, { name: 'plane+boat-fire', pilots: ['plane', 'boat'], mode: 'fire' });
jobs.push({ name: 'heli-summit-night', pilots: ['heli'], mode: 'rescue', stage: 'summit' });
for (const v of ['heli', 'plane', 'boat']) for (const mode of ['rescue', 'fire']) jobs.push({ name: `${v}-manual-${mode}`, pilots: [v], mode, manual: true });
jobs.push({ name: 'heli+boat-mixed-controls-rescue', pilots: ['heli', 'boat'], mode: 'rescue', manual: true, mixedControls: true });
const todo = jobs.filter(j => !ONLY || j.name.includes(ONLY));

// what the page reports twice a second (kept small: it crosses the pipe)
const SAMPLE = `(() => {
  const G = window.__game, out = { t: G.game.t, state: G.game.state, paused: G.game.paused, mission: G.game.mission, fire: !!G.game.fire, pilots: [] };
  for (const p of G.players) {
    if (!p.active) continue;
    const bad = [];
    for (const k in p) { const v = p[k]; if (typeof v === 'number' && !Number.isFinite(v)) bad.push(k); else if (v && v.isVector3 && !Number.isFinite(v.x + v.y + v.z)) bad.push(k); }
    const q = { v: p.vehicle, pos: p.pos.toArray().map(n => Math.round(n * 10) / 10), rescued: p.rescued, cargo: p.cargo.length, water: +(p.water || 0).toFixed(2), bad,
      idle: G.game.fire && !p.fireJob && !p.attack && !p.spray && !p.cargo.length && G.waiting.some(a => a.fire && !a.fire.out) };
    // Check the rendered feedback for every machine, including the boat's continuous seawater pump.
    const panel = p.pane.querySelector('.water');
    q.hud = { visible: getComputedStyle(panel).display !== 'none', hint: p.pane.querySelector('.hint').textContent,
      equipment: panel.getAttribute('aria-label'), level: Number(panel.getAttribute('aria-valuenow')),
      label: panel.querySelector('.water-label').textContent, height: panel.getBoundingClientRect().height };
    if (p.vehicle === 'heli') {
      // the cable: a cylinder from its middle, scaled along its length; its ends should sit on the hook and on the top of
      // whatever hangs from it
      const r = p.rope;
      if (r.visible) {
        const qn = r.quaternion, len = r.scale.y;
        const x = 2 * (qn.x * qn.y - qn.w * qn.z), y = 1 - 2 * (qn.x * qn.x + qn.z * qn.z), z = 2 * (qn.y * qn.z + qn.w * qn.x);
        const a = { x: r.position.x - x * len / 2, y: r.position.y - y * len / 2, z: r.position.z - z * len / 2 }, b = { x: r.position.x + x * len / 2, y: r.position.y + y * len / 2, z: r.position.z + z * len / 2 };
        const d = (u, w) => Math.hypot(u.x - w.x, u.y - w.y, u.z - w.z);
        const top = p.basket.position, hook = p.hook;
        q.cable = { toHook: +Math.min(d(a, hook), d(b, hook)).toFixed(2), toLoad: +Math.min(d(a, { x: top.x, y: top.y + 2.9 * p.basket.scale.y, z: top.z }), d(b, { x: top.x, y: top.y + 2.9 * p.basket.scale.y, z: top.z })).toFixed(2) };
      }
      q.basketOut = p.basket.visible ? +Math.hypot(p.basket.position.x - p.pos.x, p.basket.position.z - p.pos.z).toFixed(1) : null;
      // (anything hanging well below the hook must have its cable drawn)
      q.hangsLoose = !!(p.basket.visible && p.hook.y - p.basket.position.y - 2.9 * p.basket.scale.y > 1.2 && !r.visible);
      q.both = !!(p.cage.visible && p.bucket.visible && p.basket.visible);
    }
    out.pilots.push(q);
  }
  // boats in the home pier (x -2..2, z 34..56) or the harbour's jetties
  const piers = G.world.piers || [];
  out.boatsInPiers = G.scene.children.filter(o => (o.userData.farHide === 700 || o.userData.farHide === 600) && o.visible)
    .filter(o => piers.some(P => { const ux = P.b.x - P.a.x, uz = P.b.z - P.a.z, l2 = ux * ux + uz * uz, t = Math.max(0, Math.min(1, ((o.position.x - P.a.x) * ux + (o.position.z - P.a.z) * uz) / l2)); return Math.hypot(o.position.x - P.a.x - ux * t, o.position.z - P.a.z - uz * t) < P.w + 2.5; }))
    .map(o => o.position.toArray().map(Math.round));
  out.problems = (window.__gameProblems || []).length;
  return out;
})()`;

async function play(job, page) {
  const notes = [], shots = [];
  // Manual outings exercise real startup, throttle and steering; mission completion still needs a human pilot.
  const seconds = job.manual ? Math.min(SECONDS, 20) : SECONDS;
  await page.goto(GAME, "!!(window.__game && document.querySelector('canvas.ready'))");
  // the menu, as a person uses it
  await page.click('#setup > summary');
  await page.click(`[data-mode="${job.mode}"]`);
  if (LOCATION) await page.evaluate(`(() => { const s=document.querySelector('#location'); s.value=${JSON.stringify(LOCATION)}; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  for (let i = 0; i < job.pilots.length; i++) { await page.click(`.veh[data-p="${i}"][data-v="${job.pilots[i]}"]`); await page.click(`.flt[data-p="${i}"][data-m="${job.manual && (!job.mixedControls || i === 1) ? 'pro' : 'easy'}"]`); }
  await page.click(job.pilots.length > 1 ? '#start2' : '#start1');
  await new Promise(r => setTimeout(r, 1500));
  const first = await page.evaluate(SAMPLE);
  if (LOCATION && await page.evaluate('__game.game.zone.id') !== LOCATION) notes.push('doing: starting a fixed-location outing; wrong zone');
  for (const q of first.pilots) { const d = Math.hypot(q.pos[0], q.pos[2]); if (d > 120) notes.push(`${q.v} started ${Math.round(d)} m from the home base (at ${q.pos[0]},${q.pos[2]})`); }
  for (const b of await page.evaluate('__game.debug.icyCheck()')) notes.push('BROKE icyScenery: ' + b);
  // (the summit outing: at night, on a snowy-peaks mission, 60 m out from the zone, with a climber waiting up top)
  let summit = null;
  if (job.stage === 'summit') summit = await page.evaluate(`(() => { const G = __game; G.setPreset(2); G.debug.zone('snow'); G.debug.goto('snow', 60);
    window.__summitId = G.debug.add('summit').id; return { programs: G.renderer.info.programs.length, picked: null }; })()`);
  // hold go: W for the first pilot, up arrow for the second
  await page.key('KeyW', true); if (job.pilots.length > 1) await page.key('ArrowUp', true);
  if (job.manual && !job.mixedControls && job.pilots[0] === 'heli') { await page.key('Space', true); await new Promise(r => setTimeout(r, 6000)); await page.key('Space', false); }
  const start = first.pilots.map(q => ({ rescued: q.rescued, water: q.water })), seen = { cargo: [0, 0], water: [0, 0], drop: [0, 0], idle: [0, 0], mission: first.mission };
  const breaks = {};
  const broke = (k, detail) => { if (!breaks[k]) breaks[k] = { n: 0, first: detail }; breaks[k].n++; };
  for (let s = 0; s < seconds * 2; s++) {
    await new Promise(r => setTimeout(r, 500));
    const o = await page.evaluate(SAMPLE);
    if (o.state !== 'play' || o.paused) { broke('notPlaying', o.state + (o.paused ? ' paused' : '')); await page.key('KeyW', true); }
    o.pilots.forEach((q, i) => {
      if (q.bad.length) broke('notANumber', q.v + ': ' + q.bad.join(','));
      if (q.hud.visible !== o.fire) broke('fireHudVisibility', q.v + ': fire panel visibility disagrees with mission');
      if (!o.fire && !q.hud.hint.trim()) broke('rescueHudGuidance', q.v + ': doing rescue mission with no guidance in the existing hint');
      if (o.fire) {
        const equipment = q.v === 'boat' ? 'Pump pressure' : q.v === 'heli' ? 'Bucket' : 'Tank';
        if (q.hud.equipment !== equipment || !q.hud.label) broke('fireHudEquipment', q.v + ': missing equipment or guidance');
        if (!Number.isFinite(q.hud.level) || q.hud.level < 0 || q.hud.level > 100) broke('fireHudLevel', q.v + ': meter outside 0–100');
        if (q.hud.height > 64) broke('fireHudTooTall', q.v + ': compact water gauge exceeds 64 px');
      }
      // (with a fire burning, every pilot has it to fight: a seaplane once idled through a boat's shore fire)
      if (q.idle && ++seen.idle[i] > 20) broke('idleInFire', `${q.v} has had no fire to fight for ${seen.idle[i] / 2} s while one burns`);
      if (q.cable && (q.cable.toHook > 0.6 || q.cable.toLoad > 0.6)) broke('cableNotJoined', `${q.v} hook ${q.cable.toHook} m, load ${q.cable.toLoad} m`);
      if (q.basketOut !== null && q.basketOut > 25) broke('basketAdrift', q.basketOut + ' m from the helicopter');
      if (q.both) broke('basketAndBucket', 'both shown');
      if (q.hangsLoose) broke('noCable', 'the basket or bucket hangs below the hook with no cable drawn');
      seen.cargo[i] = Math.max(seen.cargo[i], q.cargo + q.rescued - start[i].rescued);
      if (q.water > seen.water[i]) seen.water[i] = q.water;
      if (q.water < 0.2 && seen.water[i] > 0.8) seen.drop[i] = 1;
    });
    if (o.boatsInPiers.length) broke('boatInPier', o.boatsInPiers[0].join(','));
    if (summit && summit.picked === null && await page.evaluate('!__game.waiting.some(a => a.id === window.__summitId)')) summit.picked = s / 2;
    if (summit && s === 20) summit.programs = await page.evaluate('__game.renderer.info.programs.length');
    if (o.mission !== seen.mission) seen.missionDone = true;
    if (job.manual && s === 12) await page.key(job.mixedControls ? 'ArrowLeft' : 'KeyA', true);
    if (job.manual && s === 16) await page.key(job.mixedControls ? 'ArrowLeft' : 'KeyA', false);
    if (s === 10 || s === seconds || s === seconds * 2 - 1) { const f = join(OUT, `${job.name}-${Math.round(s / 2)}s.jpg`); writeFileSync(f, await page.screenshot()); shots.push(f); }
  }
  if (summit) {
    if (summit.picked === null || summit.picked > 90) notes.push(`NO PROGRESS: the summit climber was not picked up within ${Math.min(SECONDS, 90)} s`);
    const now = await page.evaluate('__game.renderer.info.programs.length');
    if (now > summit.programs) notes.push(`BROKE shaderHitch: ${now - summit.programs} shader programs were built after the first 10 s in the snowy peaks at night`);
  }
  // Watch inside the page, frame by frame: a delayed DevTools reply must not turn normal travel into a teleport.
  const after = await page.evaluate(`(${observeMissionTransition.toString()})(__game)`);
  if (!after) notes.push('BROKE nextMission: the next mission never started');
  else after.pos.forEach((q, i) => { const d = Math.hypot(q[0] - after.prev[i][0], q[2] - after.prev[i][2]); if (d > 15) notes.push(`BROKE movedBetweenMissions: ${job.pilots[i]} jumped ${Math.round(d)} m when the next mission started`); });
  await page.key('KeyW', false);
  if (job.pilots.length > 1) await page.key('ArrowUp', false);
  if (job.manual) await page.key(job.mixedControls ? 'ArrowLeft' : 'KeyA', false);
  // (how much game time really passed: a game crawling along cannot be judged on progress)
  const tEnd = await page.evaluate('__game.game.t'), rate = (tEnd - first.t) / (seconds + (job.manual && !job.mixedControls && job.pilots[0] === 'heli' ? 6 : 0));
  if (rate < 0.8) notes.push(`TOO SLOW TO JUDGE: only ${rate.toFixed(2)} game seconds per real second`);
  const problems = await page.evaluate('window.__gameProblems || []');
  for (const p of problems.slice(0, 4)) notes.push('game problem: ' + (p.message || p.what) + (p.kind ? ` (${p.kind})` : ''));
  for (const e of page.errors.splice(0).slice(0, 3)) notes.push('page error: ' + e.split('\n')[0]);
  for (const l of page.logs.splice(0).filter(l => l.startsWith('error')).slice(0, 3)) notes.push('console ' + l.split('\n')[0]);
  for (const [k, v] of Object.entries(breaks)) notes.push(`BROKE ${k} (${v.n} samples): ${v.first}`);
  // progress: something must have happened while go was held
  if (rate >= 0.8) job.pilots.forEach((v, i) => {
    if (job.manual) return;
    const fire = first.fire;
    if (!fire && !seen.cargo[i] && !seen.missionDone) notes.push(`NO PROGRESS: ${v} picked up nobody in ${SECONDS} s`);
    // (a crewmate may put the fire out first; idleInFire catches a pilot left with nothing to do)
    if (fire && !seen.water[i] && v !== 'boat' && !seen.missionDone) notes.push(`NO PROGRESS: ${v} never took on water in ${SECONDS} s`);
    if (fire && seen.water[i] >= 0.8 && !seen.drop[i] && v !== 'boat') notes.push(`NO PROGRESS: ${v} filled up but never dropped in ${SECONDS} s`);
  });
  if (job.manual) {
    const positions = await page.evaluate('__game.players.filter(p => p.active).map(p => p.pos.toArray())');
    positions.forEach((pos, i) => { if (Math.hypot(pos[0] - first.pilots[i].pos[0], pos[2] - first.pilots[i].pos[2]) < 5) notes.push(`NO PROGRESS: doing manual startup and throttle; ${job.pilots[i]} moved less than 5 m`); });
  }
  return { ...job, ok: !notes.length, notes, shots, fire: first.fire, rate: +rate.toFixed(2), summitS: summit ? summit.picked : undefined };
}

if (!CHROME) { console.error('No Chrome found (set CHROME to its path).'); process.exit(2); }
if (!existsSync(new URL(GAME))) { console.error('Build the game first: npm run build'); process.exit(2); }
console.log(`Playing ${todo.length} outings for ${SECONDS} s each, ${WORKERS} at a time (real time, drawing on)...`);
const results = [], queue = [...todo];
await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
  // (sound may start without a click, so a page whose sound is on is what is checked; the menu clicks are real too)
  // (on the real graphics card: software drawing runs the game far slower than real time, which is no test at all)
  const browser = launch(['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']);
  const page = await openPage(browser);
  try { while (queue.length) { const j = queue.shift(); try { results.push(await play(j, page)); } catch (e) { results.push({ ...j, ok: false, notes: ['could not play: ' + e.message], shots: [] }); } process.stdout.write('.'); } }
  finally { browser.close(); }
}));
console.log('\n');
let failed = false;
for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
  if (!r.ok) failed = true;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.fire ? ' (fire)' : ''}  (game ran at ${r.rate}x real time)${r.summitS != null ? `  summit climber aboard at ${r.summitS} s` : ''}`);
  for (const n of r.notes) console.log('       ' + n);
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\nScreenshots in build/play/. ${failed ? 'Some outings FAILED.' : 'All outings played cleanly.'}`);
process.exit(failed ? 1 : 0);

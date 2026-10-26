// Automated checks for the game: no screenshots, no judgement by eye. Plays every machine through every mission from
// fixed seeds in headless Chrome, with nothing drawn, and checks the rules (tools/sim-checks.js) every tenth of a second.
// Then compares the scores with the last accepted run (tools/check-baseline.json) and says what got worse.
//
//   npm run check                      everything (3 machines x 8 missions x 3 seeds)
//   npm run check -- --only plane      one machine (or --only plane:home for one mission)
//   npm run check -- --zone volcano    every vehicle, rescue and fire, in one zone
//   npm run check -- --seeds 5         more seeds
//   npm run check -- --frame 0.1       as a slow laptop plays it (seconds per frame; default 1/30)
//   npm run check -- --accept          save this run as the new baseline (after checking it is really better)
//
// It needs a built game (npm run build) and Google Chrome. It talks to Chrome over a pipe (--remote-debugging-pipe),
// so nothing else needs installing. Exit code 1 when a rule is broken, a mission is not finished, or a score regressed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CHROME, launch, openPage } from './cdp.mjs';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const args = process.argv.slice(2), opt = (name, d) => { const i = args.indexOf('--' + name); return i < 0 ? d : args[i + 1]; };
const SEEDS = Number(opt('seeds', 3)), FRAME = Number(opt('frame', 1 / 30)), ONLY = opt('only', ''), ACCEPT = args.includes('--accept');
const WORKERS = Number(opt('workers', 4)), SECONDS = Number(opt('seconds', 360));
const GAME = pathToFileURL(resolve(opt('game', join(ROOT, 'rescue-squad-3d.html')))).href;      // (--game another build, to compare)
const CHECKS = readFileSync(join(ROOT, 'tools', 'sim-checks.js'), 'utf8');
const BASELINE = resolve(opt('baseline', join(ROOT, 'tools', 'check-baseline.json')));

// which scores count as worse when they go up (and by how much before it is reported)
const WORSE_UP = { finishS: 0.2, metresPerRescue: 0.2, turnDegPerRescue: 0.25, flipsPerMin: 0.35, stuckS: 0.5, goArounds: 0.5, bumps: 0.5 };
const MISSIONS = [['home', false], ['forest', false], ['forest', true], ['reef', false], ['harbour', false], ['snow', false], ['volcano', false], ['volcano', true]];

async function openTestPage(browser) {
  const page = await openPage(browser);
  return {
    ...page,
    async load(url) { await page.goto(url, '!!(window.__game && window.__game.TEST)'); return page.evaluate(CHECKS); },
  };
}

// ---------------------------------------------------------------- the run
const jobs = [];
for (const vehicle of ['heli', 'plane', 'boat']) for (const [zone, fire] of MISSIONS) for (let seed = 1; seed <= SEEDS; seed++) {
  if (opt('zone', '') && zone !== opt('zone', '')) continue;
  const key = `${vehicle}:${zone}${fire ? '-fire' : ''}`;
  if (ONLY && !key.startsWith(ONLY) && !`${vehicle}:${zone}`.startsWith(ONLY)) continue;
  jobs.push({ key, vehicle, zone, fire, seed });
}
if (!CHROME) { console.error('No Chrome found (set CHROME to its path).'); process.exit(2); }
if (!existsSync(new URL(GAME))) { console.error('Build the game first: npm run build'); process.exit(2); }
console.log(`Checking ${jobs.length} runs (${SEEDS} seeds, ${(1 / FRAME).toFixed(0)} frames a second) on ${WORKERS} Chromes...`);

const results = [], t0 = Date.now();
let lint = null;
async function worker() {
  const browser = launch();
  const page = await openTestPage(browser);
  try {
    while (jobs.length) {
      const j = jobs.shift();
      await page.load(`${GAME}?test&seed=${j.seed}${opt('query', '') ? '&' + opt('query', '') : ''}`);
      if (!lint) lint = await page.evaluate('worldLint()');
      const r = await page.evaluate(`simCheck(${JSON.stringify({ vehicle: j.vehicle, zone: j.zone, fire: j.fire, seconds: SECONDS, frame: FRAME })})`);
      if (page.errors.length) r.rules.pageError = page.errors.splice(0).slice(0, 3);
      results.push({ ...j, ...r });
      const bad = Object.keys(r.rules).length || !r.scores.done;
      process.stdout.write(bad ? 'x' : '.');
    }
  } finally { browser.close(); }
}
await Promise.all(Array.from({ length: Math.min(WORKERS, jobs.length) }, worker));
// (the two-player crew check starts a two-player outing, so it gets a page of its own)
{
  const browser = launch();
  try {
    const page = await openTestPage(browser);
    await page.load(`${GAME}?test&seed=1`);
    for (const crew of [['plane', 'boat'], ['heli', 'boat'], ['heli', 'plane']]) lint = [...(lint || []), ...await page.evaluate(`crewLint(${JSON.stringify(crew)})`)];
    if (page.errors.length) lint.push('crew check page error: ' + page.errors[0]);
  } finally { browser.close(); }
}
console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)} s.\n`);

// ---------------------------------------------------------------- report
const byKey = {};
for (const r of results) (byKey[r.key] ||= []).push(r);
const mean = (list, k) => { const v = list.map(r => r.scores[k]).filter(x => typeof x === 'number'); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null; };
const summary = {};
for (const key of Object.keys(byKey).sort()) {
  const list = byKey[key], s = { runs: list.length, unfinished: list.filter(r => !r.scores.done).map(r => r.seed) };
  for (const k of ['finishS', 'metresPerRescue', 'turnDegPerRescue', 'flipsPerMin', 'stuckS', 'goArounds', 'bumps', 'detourPct']) s[k] = mean(list, k);
  s.rules = {};
  for (const r of list) for (const [rule, v] of Object.entries(r.rules)) (s.rules[rule] ||= []).push({ seed: r.seed, seconds: v, first: r.worst?.[rule] });
  summary[key] = s;
}
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
let failed = false;
// (places no sea lane serves are a note, not a failure: on its own the seaplane is simply never sent there)
const notes = (lint || []).filter(l => /^note: /.test(l)), problems = (lint || []).filter(l => !/^note: /.test(l));
if (problems.length) { failed = true; console.log('MAP PROBLEMS'); for (const l of problems.slice(0, 20)) console.log('  ' + l); console.log(); }
if (notes.length) { console.log('Notes'); for (const l of notes.slice(0, 20)) console.log('  ' + l.slice(6)); console.log(); }
for (const [key, s] of Object.entries(summary)) {
  const notes = [];
  if (s.unfinished.length) notes.push(`NOT FINISHED (seeds ${s.unfinished.join(', ')})`);
  for (const [rule, list] of Object.entries(s.rules)) notes.push(`BROKE ${rule}: ${list.map(x => `seed ${x.seed} ${x.seconds}${typeof x.seconds === 'number' ? ' s' : ''}${x.first ? ` first at t=${x.first.t} (${x.first.at.join(',')})${x.first.doing ? ' doing [' + x.first.doing + ']' : ''}` : ''}`).join('; ')}`);
  const b = base && base.summary[key];
  if (b) for (const [k, tol] of Object.entries(WORSE_UP)) {
    if (s[k] == null || b[k] == null) continue;
    const slack = Math.max(b[k] * tol, k === 'stuckS' || k === 'goArounds' || k === 'bumps' ? 1 : 0);
    if (s[k] > b[k] + slack) notes.push(`worse ${k}: ${b[k]} -> ${s[k]}`);
  }
  if (notes.length) failed = true;
  const line = `${notes.length ? 'FAIL' : 'ok  '} ${key.padEnd(20)} finish ${String(s.finishS).padStart(6)} s  turn/rescue ${String(s.turnDegPerRescue).padStart(5)}°  m/rescue ${String(s.metresPerRescue).padStart(5)}  flips/min ${String(s.flipsPerMin).padStart(4)}`;
  console.log(line);
  for (const n of notes) console.log('       ' + n);
}
mkdirSync(join(ROOT, 'build', 'check'), { recursive: true });
writeFileSync(resolve(opt('out', join(ROOT, 'build', 'check', 'results.json'))), JSON.stringify({ frame: FRAME, seeds: SEEDS, lint, summary, results }, null, 2));
if (ACCEPT) { writeFileSync(BASELINE, JSON.stringify({ accepted: new Date().toISOString(), frame: FRAME, seeds: SEEDS, summary }, null, 2)); console.log('\nSaved as the new baseline.'); }
else if (!base) console.log('\n(no baseline yet: run again with --accept to save one)');
console.log(failed ? '\nSome checks FAILED (details in build/check/results.json).' : '\nAll checks passed.');
process.exit(failed && !ACCEPT ? 1 : 0);

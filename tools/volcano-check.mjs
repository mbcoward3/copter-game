import { readFileSync } from 'node:fs';
import { launch, openPage } from './cdp.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const browser = launch(['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']);
try {
  const page = await openPage(browser);
  await page.goto(pathToFileURL(resolve('rescue-squad-3d.html')).href + '?seed=1', "!!document.querySelector('canvas.ready')");
  await page.evaluate(readFileSync(new URL('./sim-checks.js', import.meta.url), 'utf8'));
  const failures = await page.evaluate('volcanoLint()');
  failures.push(...page.errors, ...page.logs.filter(l => l.startsWith('error')));
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('Volcano coast, terrain seams, rescue clearings and scene budget passed.');
} finally { browser.close(); }

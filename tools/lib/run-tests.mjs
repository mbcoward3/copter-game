// Runs every unit test in a folder (default tools/test), each in its own Node process, and fails if any fails.
// A new test only needs to be a .mjs file in that folder that throws (node:assert) when something is wrong.
//
//   npm test                       every test
//   npm test -- flightpath audio   only the tests whose names contain one of these words
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const dir = resolve(ROOT, args[0]?.includes('/') ? args.shift() : 'tools/test');
const files = readdirSync(dir).filter(f => f.endsWith('.mjs') && (!args.length || args.some(a => f.includes(a)))).sort();
if (!files.length) { console.error(`No tests found in ${dir}${args.length ? ' matching ' + args.join(', ') : ''}`); process.exit(1); }

const failed = [];
for (const f of files) {
  const run = spawnSync(process.execPath, [join(dir, f)], { cwd: ROOT, stdio: 'inherit' });
  if (run.status !== 0) failed.push(f);
}
console.log(failed.length ? `\n${failed.length} of ${files.length} tests failed: ${failed.join(', ')}` : `\nAll ${files.length} tests passed.`);
process.exit(failed.length ? 1 : 0);

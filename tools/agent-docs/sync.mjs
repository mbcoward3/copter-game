// Copies the repo skills from .agents/skills (the source, read by Codex and other Agent Skills tools) to
// .claude/skills (read by Claude Code). Symlinks would avoid the copy, but git on Windows checks them out as plain
// files unless Developer Mode and core.symlinks are on, so the mirror is a real copy, checked by test.mjs.
//
//   npm run sync-skills
//
// Files are overwritten in place and only stale ones removed: on Windows a file another program has open can be
// rewritten but not always deleted.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, '.agents', 'skills'), DEST = join(ROOT, '.claude', 'skills');
const walk = dir => existsSync(dir) ? readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; }) : [];

if (!existsSync(SRC)) throw new Error('No .agents/skills folder');
const wanted = new Set(walk(SRC).map(p => relative(SRC, p)));
let copied = 0, removed = 0;
for (const f of wanted) {
  const from = join(SRC, f), to = join(DEST, f);
  if (existsSync(to) && readFileSync(from).equals(readFileSync(to))) continue;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied++;
}
for (const p of walk(DEST)) if (!wanted.has(relative(DEST, p))) { rmSync(p); removed++; }      // (the whole mirror is generated)
console.log(`Mirrored .agents/skills to .claude/skills: ${copied} updated, ${removed} removed`);

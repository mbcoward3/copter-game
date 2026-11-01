// Copies the repo skills from .agents/skills (the source, read by Codex and other Agent Skills tools) to
// .claude/skills (read by Claude Code). Symlinks would avoid the copy, but git on Windows checks them out as plain
// files unless Developer Mode and core.symlinks are on, so the mirror is a real copy, checked by test-agent-docs.mjs.
//
//   npm run sync-skills
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, '.agents', 'skills'), DEST = join(ROOT, '.claude', 'skills');

if (!existsSync(SRC)) throw new Error('No .agents/skills folder');
rmSync(DEST, { recursive: true, force: true });       // (the whole mirror is generated; nothing else lives there)
cpSync(SRC, DEST, { recursive: true });
console.log('Mirrored .agents/skills to .claude/skills');

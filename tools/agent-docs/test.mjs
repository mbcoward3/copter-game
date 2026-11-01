// Checks the agent instructions and docs stay usable:
//   - every skill in .agents/skills follows the Agent Skills spec (https://agentskills.io/specification),
//   - .claude/skills is an exact mirror of it (npm run sync-skills),
//   - relative Markdown links and #anchors in the repo's docs resolve,
//   - no new top-level Markdown files (feature docs go in docs/design, future work in docs/backlog.md).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS = join(ROOT, '.agents', 'skills'), MIRROR = join(ROOT, '.claude', 'skills');
const rel = p => relative(ROOT, p).replace(/\\/g, '/');
const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

// ---- skills against the spec
const SPEC_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const skills = readdirSync(SKILLS).filter(n => statSync(join(SKILLS, n)).isDirectory());
assert.ok(skills.length > 0, 'no skills found');
for (const dir of skills) {
  const file = join(SKILLS, dir, 'SKILL.md');
  assert.ok(existsSync(file), `${dir}: missing SKILL.md`);
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, `${dir}: SKILL.md must start with YAML frontmatter between --- lines`);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z-]+): (.+)$/);
    // (one plain "key: value" per line keeps the frontmatter valid YAML for every reader; no nesting needed yet)
    assert.ok(kv, `${dir}: frontmatter line is not a simple "key: value": ${line}`);
    const [, key, value] = kv;
    assert.ok(SPEC_KEYS.has(key), `${dir}: "${key}" is not an Agent Skills field (tool-specific fields break other tools)`);
    assert.ok(!/: | #|^[\[{>|*&!%@`'"]/.test(value), `${dir}: ${key} needs quoting to be valid YAML; reword it instead`);
    fm[key] = value;
  }
  assert.match(fm.name || '', /^[a-z0-9]+(-[a-z0-9]+)*$/, `${dir}: name must be lowercase letters, digits and single hyphens`);
  assert.ok(fm.name.length <= 64, `${dir}: name over 64 characters`);
  assert.equal(fm.name, dir, `${dir}: name must match its folder`);
  assert.ok(fm.description && fm.description.length <= 1024, `${dir}: description must be 1-1024 characters`);
  if (fm.compatibility) assert.ok(fm.compatibility.length <= 500, `${dir}: compatibility over 500 characters`);
  assert.ok(text.split('\n').length < 500, `${dir}: keep SKILL.md under 500 lines; move detail to references/`);
}

// ---- the Claude Code mirror
const listing = dir => existsSync(dir) ? walk(dir).map(p => relative(dir, p).replace(/\\/g, '/')).sort() : [];
assert.deepEqual(listing(MIRROR), listing(SKILLS), '.claude/skills differs from .agents/skills: run npm run sync-skills');
for (const f of listing(SKILLS)) {
  assert.ok(readFileSync(join(SKILLS, f)).equals(readFileSync(join(MIRROR, f))), `.claude/skills/${f} is stale: run npm run sync-skills`);
}

// ---- links in the docs
const slug = h => h.trim().toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
const anchors = file => new Set(readFileSync(file, 'utf8').split('\n').filter(l => /^#{1,6} /.test(l)).map(l => slug(l.replace(/^#+ /, ''))));
const docs = [...['AGENTS.md', 'CLAUDE.md', 'README.md'].map(f => join(ROOT, f)), ...walk(join(ROOT, 'docs')),
  ...walk(SKILLS), join(ROOT, 'charts', 'copter-game', 'README.md')].filter(f => f.endsWith('.md'));
for (const file of docs) {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(target)) continue;                       // (web and mail links)
    const [path, anchor] = target.split('#');
    const dest = path ? resolve(dirname(file), decodeURI(path)) : file;
    assert.ok(existsSync(dest), `${rel(file)}: broken link ${target}`);
    if (anchor && dest.endsWith('.md')) assert.ok(anchors(dest).has(anchor), `${rel(file)}: no heading #${anchor} in ${rel(dest)}`);
  }
}
assert.match(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md/m, 'CLAUDE.md must import AGENTS.md');

// ---- no new top-level docs
const topLevel = readdirSync(ROOT).filter(n => n.endsWith('.md')).sort();
assert.deepEqual(topLevel, ['AGENTS.md', 'CLAUDE.md', 'README.md'],
  'Top-level Markdown is AGENTS.md, CLAUDE.md and README.md only: put feature docs in docs/design/ and plans in docs/backlog.md');

console.log(`agent docs: ${skills.length} skills valid and mirrored, ${docs.length} docs' links resolve`);

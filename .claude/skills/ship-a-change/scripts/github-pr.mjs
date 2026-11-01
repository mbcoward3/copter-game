#!/usr/bin/env node
// Opens, inspects and merges GitHub pull requests through the REST API, for machines without the gh CLI.
// The token comes from git's own credential helper (the same login `git push` uses) and is never printed.
//
//   node github-pr.mjs open --title "Title" --body-file body.md [--head branch] [--base main]
//   node github-pr.mjs status <number>
//   node github-pr.mjs merge <number> [--method squash|merge|rebase]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, d) => { const i = rest.indexOf('--' + name); return i < 0 ? d : rest[i + 1]; };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const die = msg => { console.error(msg); process.exit(1); };

const remote = git('remote', 'get-url', 'origin');
const repo = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(\.git)?$/)?.[1] || die(`origin is not a GitHub remote: ${remote}`);

function token() {
  const out = execFileSync('git', ['-c', 'credential.interactive=never', 'credential', 'fill'],
    { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
  return out.match(/^password=(.*)$/m)?.[1] || die('No GitHub credential found; sign in with `git push` once first.');
}

async function api(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(`${method} ${path} failed (${res.status}): ${data.message || ''}`);
  return data;
}

if (cmd === 'open') {
  const title = flag('title') || die('--title is required');
  const body = flag('body-file') ? readFileSync(flag('body-file'), 'utf8') : '';
  const pr = await api('POST', '/pulls', { title, body, head: flag('head', git('branch', '--show-current')), base: flag('base', 'main') });
  console.log(`#${pr.number} ${pr.html_url}`);
} else if (cmd === 'status') {
  const pr = await api('GET', `/pulls/${rest[0] || die('PR number required')}`);
  const runs = await api('GET', `/commits/${pr.head.sha}/check-runs`);
  console.log(`#${pr.number} ${pr.state}${pr.merged ? ' (merged)' : ''} mergeable=${pr.mergeable} ${pr.mergeable_state} ${pr.html_url}`);
  for (const r of runs.check_runs) console.log(`  ${r.name}: ${r.status}${r.conclusion ? ' / ' + r.conclusion : ''}`);
} else if (cmd === 'merge') {
  const n = rest[0] || die('PR number required');
  const out = await api('PUT', `/pulls/${n}/merge`, { merge_method: flag('method', 'squash') });
  console.log(`${out.merged ? 'merged' : 'not merged'} ${out.sha || ''} ${out.message || ''}`);
} else {
  die('usage: github-pr.mjs open|status|merge  (see the comment at the top)');
}

---
name: ship-a-change
description: Commit, push, open and merge a pull request for Little Rescue Squad without disturbing other agents working in the same checkout. Use when a change has passed its checks and is ready to share, or when asked to commit, push, open a PR or merge into main. Includes a script for GitHub PRs on machines without the gh CLI.
compatibility: Needs git with an HTTPS GitHub login (Windows credential manager here) and Node 18+.
---

# Ship a change

Work is done only when it is merged into remote `main` (see `AGENTS.md`). Merging `main` runs CI/CD, which deploys
production at https://copters.matthewcoward.com.

## 1. Branch and stage carefully

Claude and Codex may share this checkout, and Codex keeps worktrees under `~/.codex/worktrees/`.

- Run `git status` first. If files you didn't touch are modified, leave them alone. If files change under you while
  you work, stop and ask.
- Work on a branch from `origin/main` (`claude/<topic>` or `codex/<topic>`). Never commit to `main` directly.
- Stage only your own files or hunks: `git add <paths>` or `git add -p`. No `git add -A`, `reset --hard`, `stash`,
  branch switches in a shared checkout, or force pushes.
- Delete scaffolding from abandoned approaches before committing.

## 2. Check

Run the checks the change needs (the `check-a-change` skill). `npm test` and `npm run build` always; `npm run test:docs`
when docs or skills changed. If you edited `.agents/skills/`, run `npm run sync-skills` and stage the
`.claude/skills/` mirror too.

## 3. Commit and push

Write the message as what changed and why. Add the attribution trailer your tool asks for. Push over HTTPS:

```bash
git -c credential.interactive=never push -u origin HEAD
```

The remote is HTTPS on purpose: there is no SSH key on this machine. If a remote uses `git@github.com:`, switch it
to `https://github.com/mbcoward3/copter-game.git`.

## 4. Open the PR

Use `gh` if it is installed. Otherwise:

```bash
node .agents/skills/ship-a-change/scripts/github-pr.mjs open --title "Short title" --body-file <file>
```

The body says what changed for the player, then the evidence: commands run, seeds, pass counts, screenshots reviewed,
and what remains unverified (feel, fun, hardware). This is where validation logs belong, not in `docs/`.

## 5. Merge and verify

```bash
node .agents/skills/ship-a-change/scripts/github-pr.mjs status <number>
node .agents/skills/ship-a-change/scripts/github-pr.mjs merge <number>
git fetch origin && git log --oneline -3 origin/main
```

Squash is the default merge method. If `main` moved, merge or rebase it into your branch, rerun the affected checks,
push, then merge. Confirm the merge commit is on `origin/main` before reporting done, and report any blocker (failed
checks, conflicts, a missing login) plainly.

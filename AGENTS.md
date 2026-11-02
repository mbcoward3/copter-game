# Little Rescue Squad 3D

A three.js rescue game played mainly by a three-year-old, often two players on one keyboard. Assisted controls (hold
go; everything else automatic, no fail states) come first. Pilot (manual) controls are for grown-ups. Smooth,
forgiving play matters more than rendering tech. Hosted at https://copters.matthewcoward.com; `npm run build` also
writes an offline single-file `rescue-squad-3d.html`.

This file is the shared instructions for every coding agent (Codex reads it directly; `CLAUDE.md` imports it).

## Map

| Path | What it is |
|---|---|
| `src/main.js` | Game: renderer, players, input, vehicle physics, the helicopter and boat autopilots, winch, camera, animals, fires, missions, HUD, main loop. Exposes `window.__game` for tools. Being split up one section at a time (see below). |
| `src/vehicles/` | Code moved out of `main.js`, one module per piece: `seaplane-autopilot.js` (landing choice, approaches, takeoff runs, `planePilot`). |
| `src/world.js` | Terrain, sea, zones, scenery, shaders. Zone modules: `icy.js`, `volcano.js`, `reef.js`. |
| `src/*.mjs` | Pure logic with no three.js or DOM, unit-tested in Node: flight paths, firefighting, missions, guidance, feedback, controls, `math.mjs` helpers. |
| `src/*.js` (others) | three.js/DOM modules: models, assets, audio, fx, nav (A* routes), life, traffic, seeded random (`seed.js`). |
| `src/assets/` | Packed models, AO and ground pictures, sounds. Committed; the build bundles them. |
| `tools/test/` | Unit tests, one `.mjs` per module; `npm test` runs every file in the folder. |
| `tools/checks/` | Browser checks: `check.mjs` + `sim-checks.js` (simulation rules, `check-baseline.json`), `play-check.mjs` (the real page) and focused `*-check.mjs` fixtures. `soak.js` runs in the page. |
| `tools/review/` | Screenshot and profiling tools for art and performance review. |
| `tools/assets/` | Blender model generators and asset packers (Python). |
| `tools/lib/` | Shared helpers: `cdp.mjs` (headless Chrome driver), `run-tests.mjs`. |
| `tools/agent-docs/`, `tools/deploy/` | Skill mirror and docs test; Helm chart test. |
| `docs/design/` | What each area should do, as acceptance tables: vehicles, guidance and HUD, missions, zones, rendering. |
| `docs/backlog.md` | Agreed future work, known gaps and open questions. |
| `.agents/skills/` | Repo skills (Agent Skills format). `.claude/skills/` is a generated mirror. |
| `charts/`, `Dockerfile`, `nginx.conf`, `.github/workflows/deploy.yml` | Hosting. Pushing `main` builds, signs and publishes; Flux deploys it. |

## Commands

```
npm install          # first time
npm run build        # offline HTML; build:hosted also writes build/site/
npm test             # unit tests (also run inside the Docker build)
npm run test:docs    # skills follow the spec, mirror matches, doc links resolve
npm run check        # headless simulation of every vehicle x mission x seed (needs Chrome; CI gates on it)
npm run play-check   # the real page, drawn, real key presses; screenshots in build/play/
npm run serve        # dev server on http://localhost:5173 (COPTER_PORT to change)
npm run sync-skills  # after editing .agents/skills/
```

Which checks a change needs is in the `check-a-change` skill.

## Skills

| Skill | Use it when |
|---|---|
| [check-a-change](.agents/skills/check-a-change/SKILL.md) | planning acceptance numbers and validating any gameplay, HUD, vehicle or zone change |
| [debug-a-seed](.agents/skills/debug-a-seed/SKILL.md) | a check fails, or you need to trace or capture the game in a browser |
| [rebuild-assets](.agents/skills/rebuild-assets/SKILL.md) | changing models, ground pictures or sounds |
| [ship-a-change](.agents/skills/ship-a-change/SKILL.md) | committing, opening and merging a PR |

Edit skills only in `.agents/skills/` (Codex and other Agent Skills tools read it), then run `npm run sync-skills`
to refresh the `.claude/skills/` copy that Claude Code reads. It is a copy because git on Windows checks symlinks out
as plain files. `npm run test:docs` (also in CI) fails if the copy drifts or a skill breaks the
[Agent Skills spec](https://agentskills.io/specification); use only the spec's frontmatter fields so every tool can
read them.

# Completing and sharing work

Work is not complete until the relevant checks pass, the changes are committed and pushed, and a pull request is
merged into remote main. Create and merge the pull request by default unless the user explicitly asks to stop earlier
or keep work local. Verify the merge succeeded and report any blocker; do not describe work that exists only on a
feature branch as finished.

Claude and Codex may work in this checkout concurrently. Preserve other agents' uncommitted changes, stage only the
files or hunks belonging to your task, and avoid blanket staging, resets, stashes, branch switches, or force pushes
that could disrupt their work. If the remote advances, inspect and reconcile it without overwriting another agent's
changes. Merge only completed and validated changes; leave active work in place. An explicit deployment still
requires the relevant user authorization; merging main triggers the repository's CI/CD, which deploys production.

Delete scaffolding you created for an approach you abandoned, in the same change.

# Vehicle changes

When improving one vehicle, assess whether the idea also benefits the helicopter, seaplane, or boat. Apply it to every
vehicle where it fits as part of the same change, adapting it to each vehicle's mechanics and controls. This includes
UI, guidance, accessibility, feedback, camera behavior, and checks, not just physics. Prefer shared presentation logic
for common behavior so improvements stay in sync. Keep deliberate differences where they serve the vehicle, and record
why a useful pattern does not apply when leaving one out (in `docs/design/vehicles.md`).

Validate with the `check-a-change` skill. Review relevant solo and two-player views, assisted and Pilot controls, and
rescue and firefighting missions.

# Architecture rules

- **Seeds replay exactly.** `?test&seed=N` fixes `Math.random` and the separate gameplay stream (`src/seed.js`), pins
  graphics detail and ignores saved settings. Anything that plays differently in the checker and the browser is a bug
  to fix first.
- **Don't consume shared random draws** for scenery or presentation. New zone scenery uses its own stream or is placed
  after random vegetation; otherwise every spawn elsewhere moves.
- **Presentation reads state; it never plans.** HUD, radar, hints and celebrations read live state and known geometry,
  never route planners or reachability caches. Radar, range and hints share one eligibility rule.
- **Gameplay is independent of graphics quality**, LOD and resolution.
- **Splitting `main.js`:** move one section per PR into a module that exports a `create...(deps)` factory, taking the
  game state it reads as arguments and returning what the rest of the game calls (see `src/vehicles/seaplane-autopilot.js`).
  Move the code unchanged; the proof is `npm run check` reproducing main's mission scores exactly, plus play-check.
- **Pure logic goes in `src/*.mjs`** with a test in `tools/test/`, so it is checkable without a browser.
- **Assisted play never fails.** No crash, sink, timeout or blocking toddler action, for either pilot.

# Docs

- Put acceptance tables and deliberate differences in the matching `docs/design/` page, and future work in
  `docs/backlog.md`. Don't add a new top-level Markdown file per feature.
- Validation evidence (runs, seeds, screenshots reviewed, what stays unverified) goes in the pull request description,
  not in the docs.
- `README.md` is for players and getting started.

# Assets and sound

Every sound is a real recording that belongs in the scene, with no narrator. Sources so far: BigSoundBank (CC0),
Kenney (CC0) and one CC BY-SA 4.0 Wikimedia recording credited in `README.md`. Before downloading any asset, show the
user the exact file, source, licence and size and get a yes. No paid assets.

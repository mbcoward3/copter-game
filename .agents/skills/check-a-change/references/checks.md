# Check tools

All browser checks drive headless Chrome over `--remote-debugging-pipe` (`tools/lib/cdp.mjs`), so nothing else needs
installing. Build first (`npm run build`). Exit code 1 means a failure.

## Unit tests: `npm test`

Every `.mjs` file in `tools/test/` (Node `assert`, no browser), each in its own process, via `tools/lib/run-tests.mjs`.
A new test only needs to be dropped in that folder. `npm test -- flightpath` runs the tests whose names match. CI and
the Docker build both run it.

`npm run test:docs` (`tools/agent-docs/test.mjs`) is separate because the Docker build has no docs: skills follow the
Agent Skills spec, the `.claude/skills` mirror matches, Markdown links and anchors resolve, and no new top-level
Markdown files. CI runs it too.

## Simulation: `npm run check` (`tools/checks/check.mjs`)

Plays each machine through each mission from fixed seeds with nothing drawn, holding only go, and checks
`tools/checks/sim-checks.js` rules every 0.1 s. It also lints the map (every spawn in water) and compares finish time,
turning and stuck time with `tools/checks/check-baseline.json`, failing on anything clearly worse. About 2 minutes for 72 runs
on 4 workers. CI runs it on every pull request and push to `main` (the `simulate` job), and publishing waits for it;
on failure the job uploads `build/check/` as the `check-results` artifact.

Rules include: a hull on land, the seaplane into a hill or onto a beach, landing far away, slow takeoff, never
flying, no progress, roundabout routes, the basket jerked faster than the winch, a helicopter inside a tower, any boat
aground or through a pier, anything flung off, friends not walking home. Seaplane rules are tabled in
`docs/design/vehicles.md`.

```
npm run check -- --only plane          # one machine; --only plane:home for one mission
npm run check -- --zone volcano        # every vehicle, rescue and fire, in one zone
npm run check -- --seeds 8             # more seeds (performance is compared on the baseline's matching seeds only)
npm run check -- --plane-seeds 8       # all vehicles on 3 seeds and the seaplane on 8, in one run
npm run check -- --frame 0.1           # as a slow laptop plays it (seconds per frame; default 1/30)
npm run check -- --game other.html     # check another build, e.g. main, for comparison
npm run check -- --accept              # save as the new baseline (only after showing it is really better)
```

Runs with fewer seeds than the baseline skip the performance comparison; their rules still apply.

## Real page: `npm run play-check` (`tools/checks/play-check.mjs`)

Loads the ordinary page with drawing and sound on the real GPU (`--use-angle=d3d11 --enable-gpu
--ignore-gpu-blocklist`), clicks through the start menu, holds W with real key presses in real time, and fails on:
any error (thrown, console, or `window.__gameProblems`), a non-finite number in a pilot's state, a fresh outing not
starting at home, no progress (friend aboard or home; on fire, water taken on and dropped), a cable not joined to its
basket or bucket, a boat in a pier, movement across a mission change, missing assisted rescue hints, and the snow
zone's `icyCheck()`. Outings: every machine × Rescue / Firefighting / Surprise me solo, two-player pairs, six
20-second manual smoke outings, a mixed-control pair, the night summit rescue and the two-seaplane Harbour Town seed 8
recovery. Screenshots go to `build/play/`.

```
npm run play-check -- --only plane     # one machine
npm run play-check -- --seconds 90     # real seconds per outing
npm run play-check -- --location volcano --workers 2
npm run play-check -- --outdir build/play-x --game other.html
```

SwiftShader (no GPU) runs the real page at close to zero speed, so this needs a real graphics card.

## Focused rendered checks

Each stages scenes with normal menus and fixed seeds and checks geometry or state, not mission completion.

| Command | Covers |
|---|---|
| `npm run crew-trip-check -- --seeds 8` | per-pilot pickup and home distance, time and turns for heli/seaplane, two-seaplane and seaplane/boat crews; always includes Home Bay seed 3 and Harbour Town seed 8 |
| `npm run assisted-hint-check` | assisted startup and wrapping hints across vehicles, rescue/fire, solo/two-player, narrow/wide |
| `npm run manual-guidance-check` | 44 manual rescue phases across six layouts |
| `npm run pilot-check` | manual instruments and HUD bounds, manual, assisted and mixed crews |
| `npm run radar-check` | home marker, eligible dots and fires, 12 scenes |
| `npm run menu-check` | 24 menu combinations incl. remembered choices and mixed controls at 600 and 1280 px |
| `npm run celebration-check` | 24 celebration cases: placement, particle budget, hints |
| `npm run analog-check` | stick dead zone mapping, slow seaplane taxi, reverse, full-power takeoff, synthetic gamepads |
| `node tools/checks/volcano-check.mjs` | Volcano Isle authored scenery, page and shader errors |
| `node tools/checks/volcano-controls.mjs` | 24 volcano views across controls, crews and missions |
| `node tools/checks/hosted-check.mjs` | hosted build: asset count, first-load and reload size, caching |

## Renderer and art

| Command | Covers |
|---|---|
| `npm run render-check` | shadow parity with reflections on/off and resource lifetime; run alone |
| `npm run profile -- --seconds 20` | CPU/GPU percentiles and screenshots for every combination; `--only`, `--dpr`, `--out`; run alone |
| `node tools/review/vehicle-shots.mjs --vehicle plane --light day,dusk,storm` | vehicle close-ups (`--views door,cockpit`), to `build/shots/` |
| `node tools/review/scene-shots.mjs --light day,dusk --only snow` | each zone from above, mid range and shore |

## In the page

`tools/checks/soak.js` and `tools/checks/sim-checks.js` are fetched from the dev server and evaluated in the page; see the
`debug-a-seed` skill.

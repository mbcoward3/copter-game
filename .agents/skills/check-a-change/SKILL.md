---
name: check-a-change
description: Plan and validate a change to Little Rescue Squad the way a player would judge it. Use before building any gameplay, vehicle, autopilot, HUD, menu, mission, zone or rendering change (to write acceptance numbers first), and again before calling it done (to pick and run the right checks, review screenshots and report what stays unverified).
compatibility: Needs Node 18+, a built game and Google Chrome; play-check and render-check need a real GPU.
---

# Check a change

In October 2026 a seaplane rework passed every automated check and still didn't work when played. The checks ran a
stripped-down simulation, tested what had been built rather than what a player sees, and nobody looked at the result.
These rules exist because of that.

## Before building

1. **Write what the player should see, as numbers.** Not "the plane lands near the friend" but "touches down within
   250 m of the friend, on water at least 3 m deep". Put the table in the matching `docs/design/` page. Every
   complaint a player has made about the feature becomes a row.
2. **Apply it to every vehicle where it fits** (see `AGENTS.md`). Add rows for each vehicle, or note in
   `docs/design/vehicles.md` why one is left out.
3. **Encode each row as a rule.** Pure logic gets a `tools/test-*.mjs` unit test. Simulation behaviour goes in
   `tools/checks/sim-checks.js`. Anything only visible on the real page (cables, menus, start position, piers, HUD geometry)
   goes in `tools/checks/play-check.mjs` or a focused `tools/checks/*-check.mjs`. Give every failure a "doing" note: what the
   machine was trying to do at that moment.
4. **Check the checker against what is broken.** Run the new rules on the current game before changing it. If they
   don't flag the bug a player reported, the rule is wrong, not the game.

## While building

5. **Trace, don't guess.** When a rule fails, replay the seed and log the autopilot state each second (the
   `debug-a-seed` skill). Most fixes here came from one line of trace.
6. **A seed must replay the same everywhere.** If a seed plays differently in the checker and the browser, fix that
   first, or no failure can be trusted.
7. **Change a rule only when the rule is wrong**, never to make a failure go away. Record why in the design page.
8. **Never edit `tools/checks/check-baseline.json` to pass.** `--accept` only after showing the new scores are better or
   that the change of geography explains them, and say so in the PR.

## Before calling it done

9. Run the checks the change needs (table below). Tune on 3 seeds, then run 8 (`--seeds 8`) before believing it.
10. **Look at the screenshots** in `build/play/` (and any focused check's output folder). Passing checks are not the
    same as looking right.
11. **Report what isn't covered.** Feel, readability, fun, child suitability and physical gamepad feel are
    unverified unless a person played it. Say so plainly; don't claim them.
12. Put the evidence in the PR description: commands run, seeds, pass counts, screenshots reviewed, what stays
    unverified.

## Which checks

Always: `npm test`, `npm run build`. Docs or skills: `npm run test:docs`. Then by what changed:

| Change touches | Also run |
|---|---|
| Any gameplay, autopilot, physics, spawn or obstacle | `npm run check` and `npm run play-check` |
| Moving or refactoring code with no intended behaviour change | `npm run check` on main and on the change (`--game`, see Gotchas) with identical score lines; for vehicle code also `--only <vehicle> --seeds 8` and `crew-trip-check` identical; then `play-check` |
| Seaplane routing, takeoff or landing | `npm run check -- --plane-seeds 8`, `npm run crew-trip-check` |
| Two-player behaviour | `npm run crew-trip-check`, play-check (includes paired outings) |
| HUD, hints or instruments | `npm run assisted-hint-check`, `npm run manual-guidance-check`, `npm run pilot-check` |
| Radar | `npm run radar-check` |
| Start menu or remembered settings | `npm run menu-check` |
| Mission completion or celebration | `npm run celebration-check` |
| Manual controls or gamepad | `npm run analog-check`, `npm run pilot-check` |
| One zone's scenery | `npm run check -- --zone <id> --seeds 8`, `npm run play-check -- --location <id>`, `node tools/review/scene-shots.mjs --only <id>`; volcano: `node tools/checks/volcano-check.mjs`, `node tools/checks/volcano-controls.mjs` |
| Rendering, shaders, models | `npm run render-check` (alone, serially), `node tools/review/vehicle-shots.mjs` / `scene-shots.mjs` |
| Hosted build, nginx, caching | `npm run build:hosted`, `node tools/checks/hosted-check.mjs` |

Details of each tool, its options and its output folder are in [references/checks.md](references/checks.md).

## Gotchas

- Don't rebuild while a check is running: each job reloads the HTML.
- Run GPU checks (`render-check`, `profile`) alone. Other GPU load (including a game) doubles frame times.
- A shader compile error only shows on the real page: the simulation check draws nothing.
- Rendered HUD checks must wait for the HUD's 0.2 s refresh before reading text, and must sample positions across
  consecutive animation frames inside the page, not separate DevTools calls (latency looks like a teleport).
- A check must measure what the player expects ("it flies"), not just progress: `slowTakeoff` once excused taxiing
  and missed a plane that never took off.
- To compare with main, extract it to a scratch folder (`git archive origin/main | tar -x -C <dir>`), copy
  `node_modules`, build there, then `npm run check -- --game <dir>/rescue-squad-3d.html`.

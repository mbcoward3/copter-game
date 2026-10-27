# Volcano Isle: art and gameplay review

Intent: a beautiful, quietly active volcanic island with people worth helping. The
original cone, black sand, ash and smoke already made a strong silhouette. Its lava
was a flat disc mostly buried by the bowl; the named lookout and camp were empty;
water encounters were functionally similar to the other islands. This pass makes
those existing places feel inhabited without changing the friendly rescue rules.

## What changed

- Irregular, slowly moving cooling plates cover the crater bowl, with glowing
  cracks and three terrain-following seams down different sides of the cone.
- Five coastal clusters of weathered hexagonal basalt provide close-range geology
  and silhouettes for water-level approaches. Nothing is placed in open water.
- Lava lookout and Black sand camp have Volcano Watch monitoring shelters, solar
  panels, survey markers, equipment and warm windows. Their full rescue clearings
  remain open. The lookout's helipad remains the destination, not the shelter.
- Mission introductions establish Volcano Watch and the shore-fire response.
- The authored scenery is instanced or merged into ten draw objects in its zone
  group. It uses existing zone culling, shadows, reflections and day/night lighting.
- Decoration is constructed after random vegetation, with local clearance filtering,
  so adding equipment does not consume the world's random sequence.

## Vehicle fit

The landscape and mission introduction are shared by helicopter, seaplane and boat,
in solo and split screen and in Assisted and Manual controls. The helicopter can
still fetch friends at the inland sites; seaplanes and boats serve the surrounding
water and shore fires. A boat cannot use an inland helipad, and a seaplane cannot
land on it: these useful differences remain. Lava is a scenic landmark, not a new
damage system or a fire to extinguish. Ordinary mission fires retain their existing
water, spread and cooling mechanics.

## Acceptance checks

| Player-visible requirement | Numeric rule | Check |
| --- | --- | --- |
| Distinct geological shore detail | At least 36 dry-land basalt columns | volcanoLint in sim-checks; volcano-check |
| Readable hot summit from several directions | 3 seams, 77 samples each; every center sample 0.16 m above terrain | volcanoLint; day/dusk/night art review |
| Both named places are inhabited | Exactly 2 equipped sites | volcanoLint; close-up art review |
| Equipment leaves rescue/landing space open | Footprint radius 3.6 m, outside each 9 m clearing | volcanoLint; normal mission simulation |
| Detail remains bounded | Fewer than 32 direct draw objects (currently 10) | volcanoLint |
| Existing plume starts at the summit | Crater emitter above 20 m | volcanoLint; live art review |
| All controls and crews draw correctly | 24 rendered views: 3 solo + 3 pairs, 2 modes, 2 mission types; finite positions; pane width >=300 px | volcano-controls |
| Actual trips still work | All 3 vehicles, rescue/fire/mixed, 75 s of real key input; plus fixed volcano outings | play-check, --location volcano |

The new authored-zone check was run against the original build first and failed
with "missing authored zone". Its static rules also run through the standard
worldLint. Review captures include overview, opposite side, mid, shore, crater,
basalt, lookout and camp in day, dusk and night. Short control inspections use
explicit placement to inspect the destination; play-check separately tests the
normal departure from home with drawing and real held keys.

## Review locally

Run `npm run build`, then `node serve.mjs` (set COPTER_PORT to avoid another dev
server). Choose Location > Volcano Isle in the outing menu. Try Rescue and
Firefighting, each vehicle, then two players. `build/volcano-after/` holds scenery
captures; `build/volcano-controls/` holds the controls/crew views.

Human review is still needed for perceived beauty, enjoyment, long-session manual
control feel and whether the existing missions provide enough variety. This pass
adds identity and polish, not a new volcano-specific mission system.

## Validation results (local review build)

- `npm test`: passed.
- `node tools/volcano-check.mjs`: passed, including rendered page errors and shader logs.
- `npm run check -- --zone volcano --seeds 8`: all 48 runs passed; every vehicle
  completed rescue and firefighting across eight seeds, with no rule failures or
  score regressions against the repository's accepted baseline.
- Standard `npm run check`: all 72 missions completed. The command remains red
  because of two existing seaplane `roundabout` failures: forest seed 2 and home
  seed 1. Both reproduce on an untouched build of base revision `b48fa08` at the
  same simulation positions/times. There are no newly introduced rule failures.
  Raw reports: `build/check/base.json`, `final.json`, `comparison.json`, and
  `volcano-final.json`. The accepted baseline was not changed.
- `npm run play-check -- --workers 2`: all 11 normal outings passed with drawing,
  sound and real held keys, including two-player rescue and firefighting.
- `npm run play-check -- --location volcano --workers 2`: all 11 fixed-volcano
  outings passed, including the paired firefighting outing. Game time advanced at
  1.03–1.10 times real time.
- `node tools/volcano-controls.mjs`: all 24 vehicle/control/crew/mission views
  passed. Their screenshots were inspected alongside the normal play screenshots.
- `npm run render-check`: passed; matching shadow passes, stable resource lifetime,
  no page errors or console errors. Final crater/coast/station shaders also rendered
  without errors in all day/dusk/night scenery captures.
- Non-volcano spawn pools were compared against the untouched base for seed 1 and
  match exactly. New scenery consumes no seeded random numbers.

The known whole-game check failures are a remaining integration limitation, not a
claim that the repository's entire validation suite is green. Beauty, fun and
long-session manual control feel remain for human review.

## Rebased integration validation

Rebased onto `eb9cccc` (snow-zone PR #11), preserving both zone imports, both sets
of scenery review views, and the snow zone's shared-random-stream reset.

- Unit suite, volcano authored-scene check, and hosted production build/cache
  checks pass (46 hosted binary assets; no page/shader errors).
- All 48 volcano simulation runs pass again across eight seeds and all vehicles.
- All 72 standard simulation missions complete. The two existing seaplane
  `roundabout` failures remain (forest seed 2, home seed 1). The snow helicopter's
  three-seed flips/min warning is 1.8 versus the accepted 1.2 baseline; an untouched
  build of `eb9cccc` reproduces the same 1.8 result, as recorded in ICY-PEAKS.md.
  There are no additional rule failures or new score warnings.
- All 12 real-page outings pass, including the snow summit-at-night rescue
  (climber aboard at 9.5 s); all 24 volcano control/crew views pass again.
- Day/night captures of both zones and relevant play screenshots were inspected.
- Renderer checks pass when run serially (145/145 shadow casters, stable resource
  lifetime, no page/shader errors). The first attempt overlapped other GPU checks
  and observed a 145/152 shadow-parity mismatch; the subsequent serial run passes.

Reports are under `build/check/rebased.json`, `volcano-rebased.json`,
`snow-parent.json`, `build/play/`, `build/rebased-scenes/` and `build/render/`.
The accepted simulation baseline has not been modified.

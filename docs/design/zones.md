# Zones

Six locations around one map (`LOCATIONS` in `src/missions.mjs`, `ZONES` in `src/world.js`): Home Bay (`home`,
centre), Pine Forest (`forest`), Coral Reef (`reef`, with the atoll lagoon), Harbour Town (`harbour`), Snowy Peaks
(`snow`) and Volcano Isle (`volcano`). Each zone's terrain, scenery and rescue spots come from `src/world.js` (`ZONES`, `zoneOf`) plus a zone module
where it has its own things: `src/icy.js`, `src/volcano.js`, `src/reef.js`.

## Rules for every zone

- **Don't consume the shared random sequence.** Scenery added to a zone draws from its own random stream, or is built
  after random vegetation with local clearance filtering. Otherwise every spawn spot and seed elsewhere moves. Compare
  non-zone spawn pools with an untouched build for seed 1: they must match exactly.
- **Obstacles before navigation.** Anything solid in the water goes into `OBSTACLES` (big) or `SHOALS` (small) before
  spawns and nav charts are built.
- **Bounded draws.** Authored scenery is instanced or merged, uses the existing zone culling, shadows, reflections and
  day/night lighting.
- **Rescue clearings stay open.** Props sit outside each 9 m clearing; a helipad stays the destination.

## Snowy Peaks (`snow`, centre 55, −505)

A cold, bright, friendly place unlike the rest of the map: steel-blue and glacier-green water with no turquoise,
broken ice and icebergs offshore, a white rim of shore ice; snow to the shore with dark shingle beaches; a glacier
tongue down the valley into the cove ending in an ice cliff; penguins (with belly slides) and seals; a log lodge by its
pad with snow, icicles, chimney smoke, warm windows, a snowman and a sledge; northern lights at night. Rescues: penguins
on floes, a climber by the summit flag (helicopter), the lodge pad.

| What the player sees | Number | Check |
|---|---|---|
| Water isn't turquoise | shallow green channel at most 1.15× blue, less saturated than Home Bay | `node tools/review/scene-shots.mjs --only snow` |
| Icebergs never block a rescue or route | no sea spawn within 14 m of a berg's waterline or 10 m of a growler; every berg in `OBSTACLES`, every growler in `SHOALS` | `__game.debug.icyCheck()` (every play-check outing) |
| Every afloat rescue is reachable by boat | water route from the home pier to every open-water rescue spot in the zone | `icyCheck()` |
| Nothing floats or sinks | bergs in at least 5 m of water (growlers 1.5 m), penguins within 0.4 m of the ground, lodge footing meets the ground at all corners, summit spot above 70 m | `icyCheck()` |
| The summit climber can be reached | easy helicopter holding only W from 60 m outside the zone picks them up within 90 s | play-check outing `heli-summit-night` |
| No hitch flying in at night | no shader program built after the first 10 s | `heli-summit-night` |
| It looks right | overview, mid, shore, lodge, cove, icebergs and night views reviewed | `scene-shots --only snow,prop-lodge`, `build/play/` |

The snow helicopter's baseline (`heli:snow` in `tools/checks/check-baseline.json`) was refreshed for the summit and iceberg
geography; no other mission's baseline changed with it.

## Volcano Isle

A beautiful, quietly active island with people worth helping. Slowly moving cooling plates with glowing cracks fill
the crater; three seams run down the cone. Five coastal clusters of hexagonal basalt give water-level silhouettes
(nothing in open water). Lava lookout and Black sand camp have Volcano Watch shelters, solar panels, survey markers
and warm windows; mission introductions establish Volcano Watch and the shore-fire response. Lava is scenery, not a
damage system or a fire to fight.

The helicopter still fetches friends inland. Seaplanes and boats serve the water and shore fires: a boat can't use an
inland helipad and a seaplane can't land on it, and those differences stay.

| Requirement | Rule | Check |
|---|---|---|
| Distinct shore geology | at least 36 dry-land basalt columns | `volcanoLint` in sim-checks, `node tools/checks/volcano-check.mjs` |
| Hot summit readable from several sides | 3 seams, 77 samples each, every centre sample 0.16 m above terrain | `volcanoLint`, day/dusk/night review |
| Both named places are inhabited | exactly 2 equipped sites | `volcanoLint` |
| Equipment leaves rescue space open | footprint radius 3.6 m, outside each 9 m clearing | `volcanoLint`, normal missions |
| Detail stays bounded | fewer than 32 direct draw objects (10 now) | `volcanoLint` |
| The plume starts at the summit | crater emitter above 20 m | `volcanoLint` |
| All controls and crews draw correctly | 24 views: 3 solo + 3 pairs × 2 modes × 2 mission types; finite positions; pane at least 300 px | `node tools/checks/volcano-controls.mjs` |
| Trips still work | all vehicles, rescue/fire/mixed, 75 s of real key input | `npm run play-check -- --location volcano` |

Review captures cover overview, opposite side, mid, shore, crater, basalt, lookout and camp, in day, dusk and night.
The control inspections place vehicles explicitly to look at the destination; play-check separately tests the normal
departure from home with real held keys.

## Still to judge by playing

Whether the penguins and northern lights delight a three-year-old, how the cold wind sounds, and whether the volcano's
missions offer enough variety. More zone ideas are in [../backlog.md](../backlog.md).

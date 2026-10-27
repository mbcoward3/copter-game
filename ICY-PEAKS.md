# Icy Peaks (the snow zone)

The far zone north of the home bay (`id: 'snow'`, centre 55, -505). This page says what the zone is meant to be and
how we check it, following `HOW-WE-CHECK.md`.

## What it should feel like

A cold, bright, friendly place that looks nothing like the rest of the map:

- **Cold sea.** Steel-blue and glacier-green water with no tropical turquoise, bits of broken ice floating in it,
  a few big icebergs standing offshore, and a white rim of shore ice where the sea meets the land.
- **Snow down to the shore.** The low ground is snow with tundra and rock showing through on wind-blown crests;
  the beaches are dark shingle, not white sand.
- **A glacier.** A tongue of blue-white ice running down the valley between the two peaks into the cove, ending in
  an ice cliff that the floes break off.
- **Life.** Penguins waddling about near the cove, now and then one sliding on its belly into the sea and popping
  back out; seals hauled out on the shingle.
- **A lodge.** A snug log lodge by its landing pad: snow on the roof, icicles, smoke from the chimney, warm windows at
  night, a snowman and a sledge outside.
- **Night magic.** Northern lights over the peaks at night, seen from anywhere on the map.
- **Rescues that belong here.** Penguins on ice floes, a climber waiting by the flag on the summit (helicopter),
  the lodge's landing pad, and whatever the sea throws up.

## Acceptance checks

| What the player sees | Number | Where it is checked |
| --- | --- | --- |
| Water in the zone is not turquoise | shallow water's green channel at most 1.15 x its blue, and less saturated than the home bay's | screenshots (`scene-shots --only snow`) |
| Icebergs never block a rescue or a route | no zone sea spawn point within 14 m of an iceberg's waterline or 10 m of a growler's (the clearances the game already keeps from stacks and shoals); every big berg in `OBSTACLES`, every growler in `SHOALS` | `__game.debug.icyCheck()` (run by every `play-check` outing); hulls and routes by `npm run check` |
| Every rescue afloat can be reached by boat | a water route from the home pier to every open-water rescue spot in the zone (bits of ice once sealed the cove) | `__game.debug.icyCheck()` |
| Nothing floats or sinks | every berg in water at least 5 m deep (growlers 1.5 m), every standing penguin within 0.4 m of the ground, the lodge's footing meets the ground at all four corners, the summit spot on the ground above 70 m | `__game.debug.icyCheck()` |
| The summit climber can be reached | easy helicopter holding only W, starting 60 m outside the zone, picks the climber up within 90 s | `play-check` outing `heli-summit-night` |
| Snow missions still finish for every machine | no new failures against the baseline | `npm run check` |
| No hitch when the zone comes into view | no shader program built after the first 10 s of flying into the zone at night (northern lights, lit lodge) | `play-check` outing `heli-summit-night` |
| It looks right | overview, mid, shore, lodge, cove, icebergs and night views looked at | `node tools/scene-shots.mjs --only snow,prop-lodge`, `build/play/*` |

Only a person playing can judge whether the penguins and the northern lights delight a three-year-old; that is listed
as unverified until someone plays it.

## Results (2026-10-26)

- `npm test` passes. `npm run play-check`: all 12 outings pass, including `heli-summit-night` (climber aboard about
  10 s after go, no shader built mid-flight).
- `npm run check`: every mission outside the snow zone scores exactly as on main (the snowy islands draw their scenery
  and rescue spots from random streams of their own, so nothing else moved). The two plane `roundabout` failures
  (home, forest) are the same on main. Over 8 seeds the snow missions finish in 130 s (heli, main 132), 168 s (boat,
  main 175) and 230 s (plane, main 226). On the 3 baseline seeds the heli's `flipsPerMin` reads 1.8 against 1.2; over
  8 seeds it is 1.5 against main's 1.9, so that is the seeds, not a regression, and the baseline was left alone.
- Not judged by any check: whether it delights a three-year-old, and how it sounds (the cold wind is louder there;
  no new recordings were added).

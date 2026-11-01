# `window.__game` reference

Defined at the end of `src/main.js`. Development and test use only; nothing in normal play calls it.

## Top level

`__game.game` (mission state: `started`, `state`, `paused`, `mode`, `location`, `t`), `players` (per pilot: `pos`,
`vel`, `yaw`, `vehicle`, `ap` autopilot state, `active`), `waiting` (friends waiting), `hoppers` (friends walking
home), `keys` (a Set of held key codes), `nav` (clearance charts and routes), `world`, `scene`, `renderer`, `metrics`
(`snapshot()`, `stop()`), `setQuality`, `setRenderScale`, `setWeather`, `setPreset(0..2)` (time of day), and the world
tables `ZONES`, `PADS`, `SITES`, `OBSTACLES`, `SHOALS`, `ISLETS`, `HUTS`, `DOCK`, `HOME_PIER`, plus `terrainHeight` and
`waveHeight`. Errors caught during frames are collected in `window.__gameProblems`.

## `__game.debug`

| Member | Does |
|---|---|
| `run(seconds, frame = 1/30)` | steps the game without drawing to the screen |
| `shot(name)` | draws a frame and posts it to the dev server as `shots/<name>.jpg` |
| `view = [x, y, z, lx, ly, lz]` | holds the menu camera still (`null` to release) |
| `watch = [x, y, z, lx, ly, lz]` | fixes the red pilot's camera during play |
| `noDraw` | skip drawing entirely (used by `soak.js`) |
| `vehicle(kind, i = 0)` | swap a pilot's machine without the menu: `'heli'`, `'plane'`, `'boat'` |
| `zone(id, fire)` | start the mission in a zone and put the red pilot there |
| `goto(id, d = 70)` | move the red pilot to just outside a zone, facing it |
| `next()` | move to the next mission as finishing one does |
| `add(kind, i)` | stage a waiting friend: `tower`, `roof`, `summit`, `floe`, `lake`, `hut`, `ledge`, or a sea spot |
| `camp(i)`, `boat()`, `wreck()` | stage a camp rescue at site `i`, a stricken fishing boat, a wreck |
| `fire(id)` | start a fire in a zone |
| `retire(animal)` | remove a waiting friend |
| `canFight(i, F)` | whether pilot `i`'s machine can fight fire `F` |
| `plan` | seaplane planner hooks: `landingFor`, `approachPath`, `glideAlt`, `APP`, `LANE` |
| `bumps` | per-pilot counts of touches by kind (rock, shallows, obstacle) |
| `icyCheck()` | Snowy Peaks scenery rules; returns a list of problems, empty if none |
| `pick(x, y)` | object and material under a pixel of the menu camera |
| `time(frames)` | milliseconds per drawn frame (only meaningful in a visible pane with no other GPU load) |

## Start a game from script

Click `#start1` (solo) or `#start2` (two players) after choosing vehicles with
`document.querySelector('.veh[data-p="0"][data-v="plane"]').click()`.

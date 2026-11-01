---
name: debug-a-seed
description: Replay, trace and capture Little Rescue Squad in a browser through the window.__game handle. Use when npm run check or play-check fails, when an autopilot misbehaves on a seed, when you need screenshots of a specific scene or camera, or when staging a rescue, zone or fire to inspect it.
compatibility: Needs a built game and the dev server (npm run serve, port 5173 or COPTER_PORT) open in a browser you can run JavaScript in.
---

# Debug a seed

A seed always plays out the same way, so a failure from `npm run check` can be replayed exactly and traced.

## Replay a failing seed

1. `npm run build`, then start the dev server (`npm run serve`; in the Claude desktop app use the `rescue-squad`
   preview configuration). Reload the page after every build.
2. Open `http://localhost:5173/rescue-squad-3d.html?test&seed=N`. Test mode seeds `Math.random` and the gameplay
   stream, pins graphics detail and ignores saved settings, so it matches the checker.
3. Load the rules into the page and play the failing mission:

   ```js
   eval(await (await fetch('/tools/checks/sim-checks.js')).text());
   simCheck({ vehicle: 'plane', zone: 'home', fire: false, seconds: 120 })
   ```

4. **Trace before guessing.** Step the game with `__game.debug.run(1)` in a loop and log, each second, the pilot's
   `pos`, `vel`, `target` and `routes` (`__game.players[0]`). The seaplane also keeps its autopilot state in `ap`
   (key, land, final, run, air, park; null for the other machines), and `__game.debug.plan.landingFor(...)` and
   `.approachPath(...)` expose why it chose a landing. Every seaplane bug so
   far showed up plainly in such a trace.
5. Write the fix, rebuild, re-run the same seed, then the wider checks (`check-a-change` skill).

## Hidden or background browser panes

- A hidden pane doesn't fire `requestAnimationFrame`, and its canvas screenshots are black or stale. Drive the game
  with `__game.debug.run(seconds)` and capture with `await __game.debug.shot('name')`, which posts the frame to
  `serve.mjs` and writes `shots/name.jpg` (git-ignored) to open.
- A pane that opened hidden can report a 0×0 viewport: resize it to 1280×720 and reload before capturing.
- Losing focus pauses into the menu and clears held keys. A harness must set `__game.game.state = 'play'`,
  `__game.game.paused = false` and re-add held keys (`__game.keys.add('KeyW')`) every step.
- Keep one JavaScript call under about 30 s of simulated two-player time (about 45 s wall time); longer calls time
  out. Reload between batches: a long hidden session slows every tick.
- Frame times in a hidden pane are meaningless; don't quote them as performance.

## Unattended play

`eval(await (await fetch('/tools/checks/soak.js')).text()); soak('heli', 300)` plays with drawing off and reports rescues
and stuck time. By default it holds only go. `{ steer: true }` adds exploratory steering, `{ pro: true }` uses manual
controls. Use it after any change to autopilots, spawns or obstacles: it has found boats wedged where no screenshot
showed it.

## Common symptoms

- **Black pixels:** a shader NaN (the composer's scrub pass turns NaN black). Look for `pow` of a possibly negative
  value or `normalize` of a zero vector.
- **A hitch the first time something appears:** a shader program built mid-game. Watch
  `__game.renderer.info.programs.length` across two players, presets, weather and vehicle switches; any growth is a
  freeze. three.js keys shaders on the number of visible lights.
- **A GLSL error only on the real page:** the simulation check draws nothing. `out` is a reserved word in GLSL.

The full `__game.debug` reference is in [references/debug-api.md](references/debug-api.md).

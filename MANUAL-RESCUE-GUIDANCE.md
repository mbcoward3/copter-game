# Manual rescue phase guidance

A real keyboard seaplane rescue, with pauses between decisions, earned three pickup stars and two mooring stars
and returned a penguin safely (1/5 progress). During the water approach and the partial-load return, the hint still
said to fly down onto water and taxi to a friend. The plane was already afloat and later was beside the home jetty.

| Requirement | Acceptance | Check |
|---|---|---|
| Afloat seaplane guidance describes taxiing | With an eligible friend within 120 m, the hint says taxi; it does not ask the pilot to descend or lift off | Rendered phase fixture and pure helper |
| Partial crews can understand returning home | With one passenger and within 90 m of the jetty (60 m of helicopter home), guidance names the jetty/base and the delivery action | Rendered phase fixtures, all vehicles |
| Boarding and unloading explain the wait | Incoming or unloading crews are asked to hold position, with the current phase named | Rendered fixtures and helper regressions |
| Full crews and the final partial crew receive return guidance | Capacity reached or no compatible waiting friend: send passengers home; do not call a partial crew Full | Helper and rendered fixtures |
| Grounded helicopter crews know how to leave a remote pickup | With passengers away from base, name Space (solo/Red) or Enter (Blue) before the homeward trip | Helper and mixed-control fixture |
| Partly filled crews retain choice | Away from home, acknowledge passengers and offer another rescue or returning home | Helper regression |
| Keys match each pilot | Blue uses Enter, Right Shift and Right Ctrl where relevant; each assistance setting stays independent | Mixed-control rendered fixtures |

Keep rating flashes and firefighting guidance in their existing priority. Reuse a shared manual rescue presenter;
read only geometric distance and the same equipment-compatibility rule as the radar. Never run route planners from
the hint. No physics, scoring, automatic pickups or drop-off rules change. Helicopter delivery remains at the base
or paddock, seaplane and boat delivery at the jetty. Assisted crews retain their existing hold-go guidance.

Phase fixtures verify UI decisions and layout, not a complete mission. The live manual pickup-and-return cycle
used normal menus and keyboard controls, without changing positions/cargo or switching to assistance. Pauses
between maneuvers mean it does not establish continuous handling feel. Human enjoyment and hardware feel remain
unverified.

## Mixed-fire observation correction

The first regular rendered run falsely failed the plane/boat fire outing: at 75 seconds the boat had completed two
incidents, the current mission showed 1/1 safe, and the plane still had a full tank. The refill rule already allowed
team completion before an aircraft refilled, but the drop rule lacked the same exception. Apply that existing
completion exception to both. Unfinished outings still fail when an aircraft never refills or fills but never
drops; idle/no-compatible-work checks, the 75-second observation window and every gameplay rule remain unchanged.
The regression includes the completed-full-tank case and unfinished no-refill/no-drop counterexamples.

## Final validation

- `npm test`, `npm run build` and 72 simulated missions passed.
- All 19 regular rendered outings passed; reviewed final fire and mixed-control rescue screenshots.
- The targeted rendered checker passed 44 staged phases across six vehicle/player layouts, including 600 px two-player setup key labels.
- Repeated a real keyboard seaplane pickup-and-return cycle on the final build: one friend delivered (1/5), three pickup stars and two mooring stars. No position/cargo staging or assistance switch; paused between maneuvers.
- Continuous handling, physical keyboard/gamepad feel, human enjoyment and completing all five friends manually remain unverified. The next handling pass prioritizes keyboard, as requested.

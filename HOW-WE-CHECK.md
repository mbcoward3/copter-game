# Planning and checking a change

Why this exists: in October 2026 a seaplane rework passed every automated check and still did not work when played.
The checks ran a stripped-down simulation (nothing drawn, no menu, no sound, the vehicle switched in by script), they
tested what had been built rather than what a player sees, and nobody looked at the result. These are the rules since.

## Before building

For every vehicle improvement, assess all three vehicles and apply the idea wherever
it fits, adapting it to their mechanics. See `AGENTS.md`. Share common UI and feedback
logic; document deliberate exceptions rather than letting vehicles drift apart.

1. **Write what the player should see, as numbers.** Not "the plane lands near the friend" but "touches down within
   250 m of the friend, on water at least 3 m deep". Put the table in the feature's spec (see `AIRPLANE-SPEC.md`,
   "Acceptance checks"). Every complaint a player has made about this feature becomes a row.
2. **Encode each row as a rule** in `tools/sim-checks.js` (fast simulation) and, where it can only be seen on the
   real page (cables, menus, start position, piers), in `tools/play-check.mjs`. Give every failure a "doing" note:
   what the machine was trying to do at that moment, so the failure points at the cause.
3. **Check the checker against what is already broken.** Run the new rules on the current game before changing it.
   If they do not flag the bug a player reported, the rule is wrong, not the game.

## While building

4. **Trace, don't guess.** When a rule fails, replay that seed (`rescue-squad-3d.html?test&seed=N` in the dev
   server's browser, then `simCheck({...})` from `tools/sim-checks.js`) and log the autopilot's state each second.
   Most fixes here came from one line of trace: the plane lifting off a skim because shoreline trees looked "ahead",
   the helicopter leaving while a friend was mid-climb, a teardrop turn resetting itself forever.
5. **A seed must replay the same everywhere.** Test mode fixes the graphics detail and ignores saved settings; if a
   seed ever plays differently in the checker and in the browser, fix that first, or no failure can be trusted.
6. **More seeds than you tuned on.** Tune on 3 seeds, then run 8 (`--seeds 8`) before believing it.
7. **Change a rule only when the rule is wrong**, never to make a failure go away, and say why in the spec. (Two were
   changed this way: taxiing to a nearby friend is not a slow take-off; the circuit onto a landing spot near the goal
   is not flying away.)

## Before calling it done

8. `npm test`, `npm run check` (all machines, all missions) and `npm run play-check` (the real page, on the graphics
   card, real clicks and key presses) all pass.
9. **Look at the play-check screenshots** in `build/play/`. Passing checks are not the same as looking right.
10. Report what is not covered: anything only a person playing can judge (feel, readability, fun) is listed as
    unverified, not claimed.

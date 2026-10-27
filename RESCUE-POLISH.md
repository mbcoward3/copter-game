# Rescue polish: reliable trips and readable feedback

Preserve hold-go rescue play, forgiving outcomes and each vehicle's character. This pass improves existing outings;
cooperative roles belong on the feature list and will be designed separately.

| What the player should see | Acceptance | Check |
|---|---|---|
| Assisted seaplane returns without an unnecessary extra circuit | Every hop stays within the existing 1.5x route + 400/650 m turning allowance, including home seed 1 and forest seed 2 | `roundabout` in `sim-checks.js` (both seeds fail before this change) |
| Changing missions preserves every vehicle's position | At most 15 m displacement between consecutive rendered frames spanning the mission change; measured inside the page rather than across delayed browser calls | `movedBetweenMissions` in `play-check.mjs` |
| Assisted rescue crews explain what is happening | All three vehicles give a nonempty, vehicle-appropriate hint: starting, boarding, returning/unloading or finding friends | `rescueHudGuidance` in `play-check.mjs` |
| Manual pilots keep actionable control instructions | Existing vehicle- and player-specific Pilot hints remain; fire guidance remains shared for both controls | Rendered solo and mixed-control checks |

The seaplane landing selector previously considered only the 16 cheapest estimated approaches. Those could all be
near the same point and require a long terrain-clearing circuit, while a different nearby landing lane went unexamined.
Compare feasible routes using a conservative distance bound rather than a fixed shortlist.
Reconsider an unworkable lane after climb-out changes the aircraft's height and position, but keep a valid approach
stable. Reconsider after gaining 4 m as well as after one second: climbing changes approach feasibility before
the old retry delay expires, and waiting can otherwise carry the aircraft past a shorter safe joining point.

Home seeds 4 and 6 also exposed a checker error: `neverFlies` accumulated several successful short taxi rescues.
Restart its 40-second clock on boarding or delivery (not merely a target change); retain all distance and safety
rules. A new water trip should get airborne or make rescue progress within that same allowance.

Expanded runs check safety and completion on every seed, but compare performance against the baseline's matching
seeds. Averaging eight different scenarios against a three-seed benchmark otherwise reports scenario variation as a
handling regression (the forest-fire turning average was 0.9/min over eight versus 0.3/min over the original three).
Runs with fewer than the baseline's seed count explicitly skip performance comparison; their rules still apply.

Boat and helicopter navigation do not use fixed-wing landing lanes and do not need that algorithm. Both receive the
same rescue feedback states, adapted to their startup and boarding mechanics.

The old transition check compared positions read by separate DevTools calls. Rendering or mission setup can delay a
call enough for normal travel to exceed 15 m. Sampling consecutive animation frames keeps the original distance
limit and catches discontinuity without interpreting browser latency as a teleport. A synthetic jump must still fail.

## Existing snow benchmark

The snowy-peaks scenery change predates this work and already failed the old helicopter turning benchmark on the
unmodified game. Its three seeds complete every rescue with no broken rules: 131.2 s against the older 128.9 s,
172 degrees of turning per friend against 162, and 1.8 changes of turning direction per minute against 1.2.
These are accepted for the changed summit/iceberg geography. Refresh only `heli:snow` from that observed result;
keep every rule, comparison tolerance and every other mission's benchmark unchanged. This is not evidence of a
helicopter handling improvement in this polish pass.

## Next: cooperation

Cooperation is agreed future work, after this polish pass:

- Give helicopter, seaplane and boat complementary rescue and firefighting jobs toward a shared outcome. Each pairing
  should offer useful contributions, and every mission must remain complete in solo play.
- Keep assistance independent for each pilot. A child can contribute visibly while an adult handles precision or
  planning; no timed child action should block the other pilot.
- Celebrate contributions together rather than ranking rescue totals. Explore optional handoffs once the existing
  pickup and return loop is consistently satisfying.

Human enjoyment, gamepad feel and suitability for individual children remain unverified by automated checks.

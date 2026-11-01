# Guidance and HUD

What each pilot is told and shown: hints, menu guides, radar, manual instruments, equipment gauge and the mission
celebration. All three vehicles share one presenter for each of these, with vehicle-specific wording. Code: the
`HUD` and `flow` sections of `src/main.js`, plus the pure helpers `src/rescue-guidance.mjs`, `src/pilot-feedback.mjs`
and `src/celebration.mjs`.

## Rules for all presentation code

- **Read state, never plan.** Hints, radar, instruments and range read live state and known geometry only. They never
  call route planners or warm reachability caches. A visible rescue means compatible equipment, not a guaranteed
  route or landing lane.
- **One eligibility rule.** Radar dots, the nearest-friend range and manual hints use the same equipment-compatibility
  rule (`showRescueFor`). Boats and seaplanes skip cliff, roof and landlocked rescues; seaplanes also skip lagoon
  huts. Boats skip shoreless fires; seaplanes skip fires with no scoop, or a scoop they already rejected.
- **Per-pilot settings.** Assistance, keys and instruments follow each pilot's own setting. Red/solo uses WASD,
  Space, Left Shift and R; Blue uses arrows, Enter, Right Shift and Right Ctrl.
- **Keep it compact.** One water gauge, a short percentage label and the bottom hint. No separate status header or
  progress bar. Assisted guidance stays "hold go" simple.

## Assisted guidance

| Requirement | Acceptance | Check |
|---|---|---|
| Crews explain what is happening | all three vehicles give a nonempty, vehicle-appropriate hint for starting, boarding, returning/unloading and finding friends | `rescueHudGuidance` in `play-check` |
| Guidance stays clear of the radar | hint rectangle has zero overlap with the radar at 614 and 1280 px, solo and two players, height 720 px | `npm run assisted-hint-check` |
| Instructions stay inside their pane | hint within 1 px of the pane sides, inside 0–720 px vertically | same |
| Wrapping uses the available pane | a long fixture spans at least min(240 px, pane width − 28 px) in panes up to 800 px | same |
| Fire gauge and mission strip stay apart | zero overlap at the same viewports | same |

Keep the fire gauge's and mission strip's responsive breakpoints coordinated. The mission strip moves at 1100 px and
the gauge at 600 px; the 601–1100 px band has its own rule.

## Manual rescue guidance

| Requirement | Acceptance |
|---|---|
| An afloat seaplane is told to taxi | with an eligible friend within 120 m, the hint says taxi, never descend or lift off |
| Partial crews understand returning home | with a passenger and within 90 m of the jetty (60 m of helicopter home), guidance names the jetty/base and the delivery action |
| Boarding and unloading explain the wait | the crew is asked to hold position, with the phase named |
| Full crews and the final partial crew get return guidance | at capacity, or with no compatible friend waiting: send passengers home; a partial crew is never called Full |
| A grounded helicopter knows how to leave a remote pickup | names Space (solo/Red) or Enter (Blue) before the trip home |
| Partly filled crews keep the choice | away from home, acknowledges passengers and offers another rescue or home |

Checked by `test-manual-guidance` and `npm run manual-guidance-check` (44 staged phases across six layouts). Rating
flashes and fire guidance keep their priority over these hints.

## Manual instruments

The compact instrument panel, per pilot, separate from the fire equipment gauge.

| Requirement | Acceptance | Check |
|---|---|---|
| Instruments appear for manual pilots | visible within 0.3 s of starting or resuming manual; hidden for each assisted pilot | `pilot-check`, `play-check` |
| Speed is real | km/h within 1 km/h of ground speed; boat reversing reads Astern | `pilot-check`, `test-pilot-feedback` |
| Aircraft can judge clearance | height in m within 1 m; climb/descent in m/s within 0.2 m/s | `pilot-check` |
| Boats get boating readouts | speed and friend/home/pier distance, no altitude | `pilot-check` |
| Range helps the approach | nearest eligible friend within 120 m while seats remain; otherwise home distance with passengers; pier gap within 90 m for boat and afloat seaplane | rendered readouts |
| Feedback teaches the scoring | one- and two-star landings, pickups and berthing include one actionable target; three stars stay a celebration | `test-pilot-feedback` |
| The HUD works in mixed-age play | instruments, hint and radar don't overlap or leave the pane at 1280×720 and 600×720 | `pilot-check` |

Instruments update with the rendered frame (reusing row nodes, changing only values that moved). The rest of the
HUD refreshes every 0.2 s. A 0.2 s refresh lagged the boat's sharp deceleration.

## Radar

| Requirement | Acceptance |
|---|---|
| Home points to the delivery area | marker within 2 radar pixels of the paddock (helicopter) or pier end (boat, seaplane) |
| Home is recognisable | H for the helicopter, anchor for water vehicles; the accessible description names home landing area or home jetty |
| Each radar shows relevant work | eligibility rule above, for rescues and fires |
| Returning pilots read the destination | helicopter shows Home range; boat and seaplane show Jetty range, then Pier gap when close and afloat |

Gold friends, orange fires, blue fill points and the other pilot keep their visual language. Checked by
`npm run radar-check` (12 staged scenes) and pure eligibility cases in `test-rescue-guidance`.

## Menu guidance

| Requirement | Acceptance |
|---|---|
| Solo/Red instructions match vehicle and controls | assisted: hold W or up; manual helicopter names Space before W; seaplane W before Space; boat W and A/D |
| Blue has its own correct instructions | names Blue, vehicle, assistance and the right up/Enter/arrow keys |
| Remembered choices can't hide the true controls | same guide after reload with setup closed |
| No stale advice | guide changes immediately on selection; pause and resume keep it |
| Accessible instructions agree | canvas description names each active pilot and their starting keys |
| Menus stay usable | guides inside the viewport at 600 and 1280 px; start/resume reachable |

Checked by `npm run menu-check` (24 combinations). Keep the default assisted headline simple. Manual guidance
describes starting the existing vehicle; it is not a tutorial or difficulty mode, and full controls stay in the setup
cards.

## Fire equipment gauge

| Behaviour | Acceptance |
|---|---|
| Equipment feedback | all three vehicles show a 0–100 meter during fire missions, hidden during rescue |
| Equipment matches the machine | helicopter: bucket; seaplane: tank; boat: pump pressure and seawater supply |
| Fire progress | an inline 0–100% out label for the incident being tackled, including a boat spraying a different nearby incident |
| Fire phases | short hints for mop-up and ground checking; 100% cooled isn't announced as out before checking finishes |
| Navigation | aircraft show a refill position when low and not dropping; the boat shows a shore spray position until spraying; radar and world marker agree |
| Layout | gauge at most 64 px tall in solo and split screen, including a 600 px wide viewport |

## Celebration

| Requirement | Acceptance |
|---|---|
| Every crew sees their celebration wherever they finish | each active pilot gets at least 3 burst centres inside the central 85% of their view over 3 s, including crews in different zones |
| Bursts stay in the world | burst centre at least 8 m above local terrain or water; projection inside the view |
| Costs stay bounded | at most 176 particles per burst interval across the crew; initial confetti at most 160 total |
| Guidance acknowledges the finish | everyone-safe guidance replaces task hints within 0.3 s of the celebration starting |
| Mission flow is unchanged | same eight-second celebration, sticker, sound cadence and next mission; no teleport |

Placement uses each camera's view and local terrain, and never a route planner or the gameplay random stream.
Checked by `npm run celebration-check` (24 cases) and `test-celebration`. Staged crews use the world's charted
water rescue positions in forest and reef: a generic zone-edge position once put the boat on land.

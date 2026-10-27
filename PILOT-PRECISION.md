# Manual rescue feedback

Manual pilots already control speed, height, hover and berthing, and receive pickup/landing stars. They need to see
the quantities they are trying to improve. The existing height/speed panel was permanently hidden; star messages
named the result without explaining the next useful adjustment.

| Player-visible requirement | Acceptance | Check |
|---|---|---|
| Useful instruments for every manual vehicle | Visible within 0.3 s of starting/resuming manual control; hidden for each assisted pilot independently | `pilot-check` and `play-check` |
| Speed is readable and uses actual movement | km/h within 1 km/h of current ground speed; boat reversing is labelled Astern | `pilot-check`, formatter regressions |
| Aircraft pilots can judge clearance and descent | Height in m, climb/descent in m/s; height within 1 m and vertical rate within 0.2 m/s of live state | `pilot-check` |
| Boat instruments describe boating | Speed and nearby friend/home/pier distance; no fictional altitude or vertical rate | `pilot-check`, formatter regressions |
| Range helps with an approach | Nearest eligible friend shown within 120 m while seats remain and the crew is empty or the friend is closer than home; otherwise home distance with passengers, pier gap within 90 m for boat/afloat seaplane | Rendered readouts, formatter regressions |
| Feedback teaches the existing scoring rules | One/two-star landings, pickups and berthing include one brief actionable target; three-star results remain celebrations | formatter and rendered landing checks |
| The HUD works in mixed-age play | Instrument, hint and radar bounds do not overlap or leave the pane in 1280x720 and 600x720 solo/mixed-control views | `pilot-check` |

Use the existing compact instrument area and bottom hint. Display values read live state; never ask routing or
reachability planners from presentation code. Nearby-friend range filters impossible kinds (cliff/roof/landlocked
rescues for boats and seaplanes, lagoon huts for seaplanes), but is a range reference, not an autopilot destination.

The helicopter and seaplane share height/speed/vertical-rate presentation. Boats use speed and range instead.
The boat's existing seawater pressure and aircraft water levels remain in the firefighting equipment gauge.
Assisted crews retain simple hold-go guidance; manual instruments are per pilot, not a global difficulty switch.

Human enjoyment, continuous handling feel, actual gamepad hardware and suitability for an individual child still
require human playtesting. This change improves information for the controls that already exist.

The first rendered checks caught the boat displaying 48 km/h after slowing to 39 km/h: the old 0.2-second HUD
refresh lagged its sharp deceleration. Instruments now update with the rendered state, reusing existing row nodes
and changing only values that moved. The rest of the HUD keeps its existing update rate.

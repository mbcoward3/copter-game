# Manual analog precision

Previously, the seaplane's manual water speed used only the sign of throttle input: any positive stick movement
requested 30 m/s, or 6 m/s beside a friend. It also enters automatic rotation above 19 m/s, so a gentle analog taxi
input could unexpectedly take off. Manual stick axes jumped from zero directly to 18% at the dead-zone boundary.

| Requirement | Acceptance | Evidence |
|---|---|---|
| Fine motion starts smoothly beyond the stick dead zone | Inputs through +/-0.18 produce zero; +/-0.1801 produces magnitude below 0.001; full travel still reaches +/-1 | Formatter and rendered input checks |
| Small throttle gives a controlled water taxi | With raw forward stick 0.35 and engines ready, seaplane stays afloat and below 7 m/s after 6 seconds | Rendered real-menu/physics check with a synthetic gamepad |
| Reverse taxi also respects analog magnitude | Raw reverse stick 0.35 settles below 1 m/s astern | Rendered physics check |
| Full takeoff power remains available | Full keyboard W after the slow taxi gets the seaplane airborne | Real key check |
| Precision applies to every manual vehicle | Helicopter tilt/slide/yaw and boat steering use the same continuous manual stick mapping | Shared input logic, unit and rendered checks |
| Assisted controls retain their established response | Raw 0.35 assisted stick still maps to 0.35, including independent mixed-control pilots | Rendered input check and regular mission matrix |

Remap only manual stick axes across the existing 0.18 dead zone, preserving the complete remaining range and full
travel. Existing analog triggers, keyboard keys and D-pad values stay as they are. Scale the seaplane's existing
water speed targets by throttle magnitude; keep taxi eligibility, takeoff thresholds, airborne cruise and controls.
The helicopter and boat already scale their manual movement/force by input magnitude, and need the shared stick
precision but no new speed model. Assisted hold-go navigation stays unchanged.

Synthetic gamepads verify logical mappings and game physics, not physical hardware or human handling feel. Human
fun, child suitability, hardware compatibility and physical gamepad feel remain unverified.

Validation: the old build failed the new rendered check, taking off at raw stick 0.35 and reaching 35.9 m/s. The
updated seaplane stays afloat at 6.22 m/s, performs slow reverse taxi, and retains full keyboard takeoff. Continuous
tilt/slide/yaw, independent assisted/manual gamepads and disconnect recovery pass for all three vehicles. Unit/build
checks, 72 simulated missions and 19 regular rendered outings pass; screenshots were reviewed. Real keyboard play
also verified an eight-second W takeoff. Logical gamepad checks use synthetic devices; actual hardware and human
handling feel remain unverified.

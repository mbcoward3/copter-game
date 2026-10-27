# Celebrate with the rescue crew

Mission completion already plays a tune, cheering, stickers and fireworks. The fireworks and first confetti burst
were fixed over (0,0), so crews finishing distant fire missions heard a celebration they could not see.

| Player-visible requirement | Acceptance | Evidence |
|---|---|---|
| Every crew sees their celebration wherever they finish | Each active pilot has at least 3 burst centres within the central 85% of their rendered view over 3 seconds, including crews separated across zones | Rendered staged completion check |
| Bursts stay in the world above the surface | Burst centre at least 8 m above local terrain/water; local camera projection remains inside the view | Geometry regression and rendered sampling |
| Solo and two-player costs stay bounded | At most 176 particles per burst interval across the crew (old solo: 175), initial confetti at most 160 total | Particle count regression |
| Vehicle and control choices do not change the reward | Helicopter, seaplane and boat; assisted/manual; solo and narrow mixed-control split views | Rendered matrix |
| Crew guidance acknowledges the completed mission | Everyone-safe guidance replaces task instructions within 0.3 seconds of celebration start, for fire/rescue and both controls | Rendered celebration hints and regular play |
| Existing mission flow stays intact | Same eight-second celebration, sticker award, sound cadence and following mission; no vehicle teleport | Regular mission/play checks |

Use the existing world particle effects and celebration timing. Move the first confetti to the active crews and
share the existing particle budget. Place fireworks along each camera's view, checking local terrain and reducing
world size at closer distances so a short camera view does not cause a full-screen burst. Helicopter altitude,
seaplane water/air views and boat low views all use the same placement logic. No route planner or gameplay random
source is used by celebration placement.

Staged rendering proves placement, not enjoyment or a complete human mission. Human fun, child suitability and
physical gamepad feel require human playtesting.

The first generic zone-edge test position put the boat on land. Staged crews now use the world's charted water
rescue positions in forest and reef; the projection and terrain limits remain the same.

Validation: corrected valid-water scenes fail against the pre-change build and pass in the updated game. All 24
rendered celebration cases (fire/rescue, three vehicles, both controls, solo/narrow mixed crews), unit/build checks,
72 simulated mission outings and 19 regular rendered outings pass. Screenshots were reviewed. Real keyboard play
completed Pine Forest firefighting missions, showed the nearby fireworks and final everyone-safe guidance, and
continued to the next mission. The final live success screen was captured without staging completion or positions.
Human enjoyment, child suitability, physical gamepad feel and full manual mission completion remain unverified.

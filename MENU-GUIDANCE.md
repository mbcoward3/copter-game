# Control-aware menu guidance

A live keyboard playthrough reproduced a returning-player problem: a remembered manual helicopter sat on the pad
while the collapsed setup menu instructed the player to hold W and promised the crew would do the rest.

| Requirement | Acceptance | Evidence |
|---|---|---|
| Solo/Red instructions match selected vehicle and control style | Assisted says hold W or up; manual helicopter names Space before W, seaplane W before Space, boat W and A/D | Real menu checker, all three vehicles |
| Blue has independently correct starting instructions | Together guide names Blue, vehicle, assistance and the appropriate up/Enter/arrow keys | Real menu checker with mixed controls |
| Remembered choices cannot hide the true controls | Same correct guide after reload with setup closed | Persisted-choice browser check |
| Changing options or pausing cannot leave stale advice | Guide changes immediately on vehicle/control selection; pause/resume retains the selected guidance | Real menu interaction |
| Accessible game instructions agree with the menu | Canvas description names each active pilot and their actual starting keys | Two-player launch check |
| Menus remain usable | Guides stay within viewport at 600 and 1280 pixels; start/resume remain reachable | Rendered bounds and reviewed screenshots |

Keep the default assisted headline simple. Manual guidance describes starting the existing vehicle, not a new tutorial
or difficulty mode. Full controls stay in the existing setup cards. Helicopter, seaplane and boat share one presenter
with vehicle-specific launch steps. Gameplay, scoring, mission flow and stored control preferences stay unchanged.

Validation: the pre-change build failed the new menu checks. The updated build passes all 24 menu combinations,
including persisted choices and mixed controls at both widths, plus unit/build checks, all 72 simulated mission
outings and 19 regular rendered outings. Real keyboard play followed Space then W and successfully lifted off and flew.
Screenshots were reviewed. Human enjoyment, child suitability and physical gamepad feel remain unverified.

# Efficient assisted crew trips

The multiplayer pathing report is about wasted movement, not merely eventual mission completion. A menu-started helicopter/seaplane Home Bay outing (seed 3) reproduces a seaplane pickup leg taking 52.4 seconds, travelling 1133 m and turning 626 degrees for a friend roughly 156 m away. Its charted water route is only about 161 m. The previous full-mission checks accepted this behavior.

The seaplane carries its time spent on water from the previous rescue into its next target. After an 18-second first pickup approach, the next short trip is already past both taxi grace periods. It chooses a takeoff, climb and landing loop despite a short safe water route. Time spent boarding pauses that timer but does not reset it. Assess each new rescue/home trip on its own; keep long-distance flights and committed takeoff runs.

| Requirement | Acceptance | Check |
|---|---|---|
| A nearby second rescue avoids an unnecessary flight circuit | Home Bay seed 3, helicopter/seaplane crew: Blue's f3 pickup leg takes at most 35 seconds and travels at most 350 m | Normal-menu crew trip trace; fails original build at 52.4 s / 1133 m |
| Nearby rescue after returning home stays efficient | Home Bay seed 1, two-seaplane crew: Red's f3 pickup takes at most 30 seconds and travels at most 350 m | Same trace; original travels 616 m |
| Distant rescues retain flying-boat identity | Existing all-zone seaplane flight, terrain, landing and completion checks remain unchanged | Standard check, eight seaplane seeds |
| Shared crew behavior remains safe | Helicopter/seaplane, two seaplanes and seaplane/boat outings finish through normal menu setup | Crew trip checker across zones and seeds, plus real rendered play |

Apply the timer correction to both pilots' seaplanes through their shared autopilot. Helicopters and boats do not have this taxi-versus-flight timer; their controls and physics are unchanged. Measure their multiplayer trips and retain the separate investigation of docking approaches and helicopter inefficiency. This correction alone is not evidence that every reported multiplayer routing problem is resolved.

Eight-seed expansion also reproduces a non-finishing two-seaplane Harbour Town outing (seed 8), on both the original build and the taxi-timer candidate. Red carries three friends and repeats a blocked northbound takeoff at approximately (410,-149), reversing and selecting the same run until the unchanged 360-second deadline expires. The intended avoidance list records a failed taxi-to-run spot, but loses that spot when the takeoff actually starts (`tkSpot` becomes null).

| Additional requirement | Acceptance | Check |
|---|---|---|
| A blocked takeoff does not retry the same failed origin forever | Two seaplanes, Harbour Town seed 8: complete within 180 seconds; retain the failed run origin when entering the existing recovery/avoidance process | Focused crew-trip checker; original fails to finish in 360 s |

Apply failed-origin memory to the shared seaplane takeoff/recovery path, including firefighting. Boats and helicopters do not use water takeoff runs. Keep departure clearance, collision handling, reversal duration and manual controls unchanged.

The rendered recovery check uses the normal start menus, fixed seed 8, two assisted seaplanes and Harbour Town. It requires natural completion within 180 seconds before running the separate forced mission-transition/teleport observer. It stops observation when that natural completion is seen and computes simulation speed from the actual observation interval. The original build fails this check on the real rendered page; the repaired build passes. Per-case seed/location settings and separate output directories keep this evidence reproducible.

Default crew-trip checks always include the known Home Bay seed 3 and Harbour Town seed 8 regressions, including when the exploratory seed count is reduced.

Validation on the final frozen build: npm test and standalone/hosted builds passed; 112 standard simulation outings (all vehicles/missions, eight seaplane seeds) passed; all 72 crew-trip outings passed. The 19 existing rendered outings passed, and the added full two-plane Harbour mission also passed. The focused rendered completion observer independently rejected the original build and accepted the final build; reviewed both screenshots. The live keyboard helicopter/seaplane seed 3 outing picked up all five friends, unloaded them and showed the teamwork celebration, using normal controls with pauses between maneuvers and no position/cargo staging or assistance switching.

Measured short-trip improvements: Blue Home seed 3 pickup 52.4 s / 1133 m -> 18.2 s / 149 m; Red two-plane Home seed 1 pickup 31.0 s / 616 m -> 16.8 s / 161 m. The previously non-finishing two-plane Harbour seed 8 outing finishes in 109.4 simulated seconds. Existing route-safety and baseline comparison rules were not relaxed.

Remaining review: several distant dock returns still spend 40–60 seconds on broad approaches, and an empty pilot with no unclaimed friends can wander while a partner delivers the final passengers. Those behaviors and the user's helicopter efficiency complaint need separate improvement; this pass fixes the two demonstrated seaplane faults rather than declaring all multiplayer navigation excellent. Human enjoyment, gamepad hardware feel and unsampled routing remain unverified.

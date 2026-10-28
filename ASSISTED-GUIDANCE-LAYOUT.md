# Assisted guidance visibility and routing investigation

The user reported degraded assisted seaplane and helicopter pathing. That report remains unresolved: passing sampled outings does not reproduce or disprove the observed failure. Keyboard handling polish is deferred while investigating.

A live two-player replay at a 614 px viewport also exposed a concrete presentation regression: assisted hint pills overlap the radar. The existing container rule protects only manual pilots. Apply the same space reservation to assisted pilots, across helicopter, seaplane and boat, rescue and fire. No route or vehicle behavior changes in this layout correction.

| Requirement | Acceptance | Check |
|---|---|---|
| Fire equipment and mission remain distinct | Fire gauge has zero intersection with the shared mission strip at the same viewport/player sizes | Same rendered fixtures |
| Assisted guidance stays readable | Hint rectangle has zero intersection with the radar at 614 and 1280 px, solo and two players, height 720 px | Rendered HUD fixtures, all three vehicles and both mission modes |
| Instructions remain inside their pilot view | Hint left/right stay inside pane within 1 px; hint top/bottom within 0..720 px | Same rendered fixtures |
| Manual guidance retains its reserved space | Existing 44 phase fixtures across six layouts continue passing | manual-guidance-check |
| Wrapping uses the available pane | Long instruction fixture occupies at least min(240 px, pane width - 28 px) in panes up to 800 px, without leaving the pane | Same rendered fixtures |

The layout fixtures use actual normal-menu startup instructions and a deliberately long text fixture to exercise wrapping. They test geometry, not mission decisions or route completion.

Routing evidence collected separately in ignored build reports: 128 existing simulation runs, 96 complete menu-started first outings and 18 complete helicopter/seaplane team outings finished. Home Bay comparison with the pre-polish build did not reproduce a slowdown on the sampled seeds. Stop-and-go and consecutive-mission observations are recorded below. These results do not establish the user's pathing complaint fixed; location, player pairing and observed failure are still needed to target that reproduction.

The final CSS applies the existing manual hint clearance to assisted hints and lets narrow-pane pills use their available width before wrapping. The corrected checker waits for the HUD's normal 0.2 s refresh before reading startup copy. Against the unmodified build, it rejects radar overlap in 18 of 24 layouts; the six wide solo layouts already fit.

The separate routing probes completed 18 stop-and-go outings and twelve three-mission sequences (36 missions) without reproducing the user's failure. They are sampled, accelerated observations; neither these probes nor the layout correction establishes the pathing complaint resolved.

Visual review also found a fire gauge/mission-strip overlap at 614 px: the mission moves down at 1100 px, while the gauge only moves at 600 px. Keep their responsive breakpoints coordinated. The existing smaller-screen overrides still apply below 600 px.

Validation: npm test, the standard 72-run npm run check, standalone and hosted builds, and all 19 rendered play-check outings passed. The final assisted HUD check passes all 24 layouts (48 startup/wrapping samples); the 44 manual guidance phases across six layouts also pass. Reviewed final assisted fire, manual rescue and regular play screenshots, and verified clear hints in a real keyboard two-player replay. The final fire-gauge rule affects 601..1100 px; the final targeted check covers that band, while the standard 1280 px outings and existing <=600 px overrides retain their geometry.

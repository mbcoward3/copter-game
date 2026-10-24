# Completing and sharing work

Work is not complete until the relevant checks pass, the changes are committed
and pushed, and a pull request is merged into remote main. Create and merge the
pull request by default unless the user explicitly asks to stop earlier or keep
work local. Verify the merge succeeded and report any blocker; do not describe
work that exists only on a feature branch as finished.

Claude and Codex may work in this checkout concurrently. Preserve other agents'
uncommitted changes, stage only the files or hunks belonging to your task, and
avoid blanket staging, resets, stashes, branch switches, or force pushes that could
disrupt their work. If the remote advances, inspect and reconcile it without
overwriting another agent's changes. Merge only completed and validated changes;
leave active work in place. An explicit deployment still requires the relevant
user authorization; merging main may trigger the repository's existing CI/CD.

# Vehicle changes

When improving one vehicle, assess whether the idea also benefits the helicopter,
seaplane, or boat. Apply it to every vehicle where it fits as part of the same
change, adapting it to each vehicle's mechanics and controls. This includes UI,
guidance, accessibility, feedback, camera behavior, and checks, not just physics.
Prefer shared presentation logic for common behavior so improvements stay in sync.
Keep deliberate differences where they serve the vehicle, and record why a useful
pattern does not apply when leaving one out.

Follow `HOW-WE-CHECK.md` for validation. Review relevant solo and two-player views,
assisted and Pilot controls, and rescue and firefighting missions.

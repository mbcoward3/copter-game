# Completing and sharing work

Work is not complete until the relevant checks pass, the changes are committed,
and the commits are pushed to the current working branch's remote. Push by default
unless the user explicitly asks to keep work local. Verify the push succeeded and
report any blocker; do not describe an unpushed commit as finished work.

Claude and Codex may work in this checkout concurrently. Preserve other agents'
uncommitted changes, stage only the files or hunks belonging to your task, and
avoid blanket staging, resets, stashes, branch switches, or force pushes that could
disrupt their work. If the remote advances, inspect and reconcile it without
overwriting another agent's changes. Push the working branch; merging or deploying
requires the relevant user authorization.

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

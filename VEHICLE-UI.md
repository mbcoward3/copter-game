# Shared vehicle feedback

Preserve the original seaplane's simple presentation across all three vehicles:
one compact water gauge, a short percentage label, and the existing bottom hint.
Do not add a separate status header or progress bar. Equipment level, inline fire
progress, radar destination, and world destination share logic in `src/main.js`.

| Player-visible behavior | Acceptance |
|---|---|
| Fire equipment feedback | All 3 vehicles show a meter from 0–100 during fire missions, hidden during rescue missions |
| Equipment matches the machine | Helicopter: bucket; seaplane: tank; boat: pump pressure and seawater supply |
| Fire progress | All 3 show an inline 0–100% out label for the incident they are tackling, including a boat spraying a different nearby incident |
| Fire phases | Short hints identify mop-up and ground checking; cooling to 100% is not announced as fire out before checking finishes |
| Navigation | Aircraft show a refill position when below ready level and not dropping; boat shows a shore spray position until spraying; radar and world marker agree |
| Controls | Assisted guidance says hold go; Pilot guidance uses the current player's keys and the vehicle's own refill/attack behavior |
| Layout | Gauge height at most 64 px in solo and split screen, including a 600 px wide viewport; hidden during rescue missions |

The boat deliberately has no refill tank: it draws seawater continuously. Its meter
reports actual pump pressure, not a fictional water reserve. Aircraft keep their
distinct bucket and scoop mechanics. Fire cooled is heat reduction, not a promise
that the ground is already safe.

Check the rendered HUD and actual navigation with `npm run play-check`, alongside
the unit and simulation checks required by `HOW-WE-CHECK.md`.

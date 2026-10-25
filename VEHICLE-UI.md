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

## Home pier and walking home

Friends brought home finish the trip on foot, for every machine. The boat comes alongside the end of the pier (from
whichever side is nearer; from the west on a short run that keeps clear of the sea arch) and carries straight on once
they are off; a second boat ties up along the west side and backs out after. The flying boat moors along the east side
with its door to the pier, its wing float just clear of the deck, and swings round on its two engines to leave; a
second one lies across the end. Friends hop up onto the deck (the flying boat's by way of its wing float, like
stepping stones), walk the pier and the lawn in a line, and hop over the pen's low front fence to their place. Out
of the helicopter, from its pad or its lowered basket, they walk across the grass the same way. They count as safe the
moment they are ashore. Hulls slide off the piers and jetties instead of passing through them (`pierFend`); wings,
being higher than the decks, pass over.

| Player-visible behavior | Acceptance |
|---|---|
| Easy boat and seaplane tie up rather than pass by | stopped within a few metres of their berth before anyone gets off; nobody new is fetched until everyone is off |
| No hull through a pier | `hullInPier` never broken (the hull's middle never over a deck) |
| Friends walk home | `walkHomeStuck`: every friend in the pen within 30 s of leaving the machine |
| Pilot mode | stop within 2.5 m of a deck (3 m for the flying boat's float) and the friends hop across; rated on how close |

Deliberate difference: the seaplane's friends always use the door, on the port side, so its berth puts that side to
the pier; the boat's crew help them over either side. Delivering this way costs the boat about 5–7 s a trip against
the old drop-off in passing (boat missions about 10–30% longer in `npm run check`); that is the time spent watching it
come alongside and the friends get off, which is the point of it.

The fire bucket (helicopter) tips onto its side to scoop and rights itself as it fills (1.6 s), sloshes, squashes as it
fills and bobs up as it empties, sheds water as it comes out of the sea and drips on the way to the fire and after.
The seaplane drips from its hull after a scoop and after a drop to match. The boat has no equivalent: its cannon
draws seawater continuously.

Wakes: every boat under way (the pilots' boat and seaplane, the sailing boats, the patrol trawler, the stricken
fishing boat as she leaves) leaves one continuous ribbon of white water along the way it really went, with the two arms
of its V spreading from it, so the wake bends round turns instead of swinging rigidly with the hull. The seaplane's
wake and hull foam fade out as it lifts off and back in as it touches down. The water shader has six trails (the two
pilots and the four nearest other boats), each skipped by water far from it.

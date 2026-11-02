# Vehicles

The three machines: helicopter, seaplane (a Coast Guard flying boat) and fast rescue boat. Each pilot picks one; two
players can mix. Per `AGENTS.md`, an improvement to one is assessed for all three. This page records how they
differ on purpose and the acceptance rules each one must keep.

Code: shared vehicle state, the helicopter and the hull helpers in `src/main.js` (sections `flight`, `winch + basket`);
the seaplane's flight model (`updatePlane`, `PL`) in `src/vehicles/seaplane.js` and its autopilot (`planePilot`, landing
choice, approaches, takeoff runs) in `src/vehicles/seaplane-autopilot.js`; the boat (`updateBoat`, `BT`) in
`src/vehicles/boat.js`; seaplane paths in `src/flightpath.mjs`; water/air clearance charts and A* routes in
`src/nav.js`; models in `src/models.js` and `tools/assets/build_vehicles.py`.

## How they differ, and why

| | Helicopter | Seaplane | Boat |
|---|---|---|---|
| Top speed | 26 m/s | about 40 m/s | water only |
| Turning | tight, spins on the spot | wide banked turns | boat-like, momentum |
| Stopping | hovers anywhere | only on water | anywhere afloat |
| Rescue | basket winch from above; lands for island pickups | lands on open water near the friend, taxis over, friend swims to the open door | stops beside the friend, crew throws a life ring on a line and tows them in |
| Seats | 3 | 4 | crew helps over the collar |
| Delivery | home pad or paddock, friends walk across the grass | moors along the east side of the home pier, door (port) to the pier | comes alongside the pier end from the nearer side |
| Fire tool | hanging bucket, dipped in a marked refill area | scoops on a skim, drops a wide water strip on a bombing run | deck cannon, unlimited seawater |
| Unique reach | cliff ledges, rooftops, summits, inland sites | distant open water | the atoll lagoon through the reef channel, shorelines |

Deliberate differences to keep:

- The seaplane's friends always use the door, on the port side, so its berth puts that side to the pier. The boat's
  crew help them over either side.
- The boat has no refill tank: it draws seawater continuously, and its gauge reports real pump pressure, not a
  fictional reserve. Aircraft keep their distinct bucket and scoop mechanics.
- Boats and helicopters don't use fixed-wing landing lanes or water takeoff runs, so seaplane routing fixes (landing
  selection, taxi-versus-fly timer, failed takeoff-origin memory) apply to the seaplane only, in both pilots'
  seaplanes and in firefighting.
- Delivering at the pier costs the boat about 5–7 s a trip compared with the old drop-off in passing. Boat missions
  are about 10–30% longer in `npm run check`. That is the time spent watching it come alongside, which is the point.

## Assisted controls (hold go)

Everything a toddler needs is automatic: safe height, slowing near friends, pickups, the trip home, landing. No
fail states: nothing crashes, sinks or runs out.

- **Helicopter:** rotor winds up for about 3 s on the pad, lifts off, climbs over buildings and arches, drops the
  basket by itself, lands itself over a helipad when left alone.
- **Seaplane:** taxis to a clear stretch, takes off, flies Dubins curves (turn, straight, turn onto a 90 m final, a
  1-in-6 glide that starts in the turn), lands within taxiing distance of the friend. Nearby friends it simply taxis
  to. Let go in the air and it lands on open water ahead.
- **Boat:** follows charted water routes (`followWater`), slows beside friends, noses up to the pier.

### Seaplane acceptance (assisted, holding only go)

Each rule is in `tools/checks/sim-checks.js` (run by `npm run check`) and, where it needs the real page, in
`tools/checks/play-check.mjs`.

| What you would see | Limit | Check |
|---|---|---|
| From a fresh start at the pier it is in the air quickly | airborne within 15 s (not counting taxiing to friends near enough to fetch by water) | `slowTakeoff` |
| It heads for where it is going | while more than 400 m from its goal, flying away from it at most 15% of that time (circling to line up within 450 m of the chosen landing spot is fine) | `fliesAway` |
| It never skims a hill, the trees or a tower | 8 m clear of ground, treetops and towers whenever airborne and not landing | `planeIntoHill` |
| It lands near the friend | touches down within 250 m of the friend (or the fire's water) | `landsFarAway` |
| It never lands on a beach, reef or rock | every touchdown on water at least 3 m deep | `planeOnLand` |
| On a fire it fetches water from near the fire | scoops within 400 m of the fire | `scoopsFarAway` |
| Holding go, it gets into the air | at most 40 s on the water per trip; the clock restarts when a friend boards or is delivered; waits not counted | `neverFlies` |
| It never gives up or circles | a pickup or drop at least every 60 s (lining up at the home pier with friends aboard counts) | `noProgress` |
| It flies a smooth curve, not a loop out and back | each hop at most 1.5× the shortest way round obstacles at cruise height, plus 400 m (650 m when the only landing water faces back the way it came) | `roundabout` |
| Its hull never goes through a pier | the hull's middle never over a deck | `hullInPier` |
| Friends it brings home walk to the pen | each is ashore and in the pen within 30 s | `walkHomeStuck` |
| Flying with the boat on a fire, it has a fire too | in each zone at most 20% of new fires are boat-only | `crewLint` |
| No errors, no frozen screen | nothing thrown, nothing in `__gameProblems` | `pageError` |

Rule decisions (rule 7 of [check-a-change](../../.agents/skills/check-a-change/SKILL.md): change a rule only when it
measured the wrong thing):

- `stuckS` doesn't count lying at the pier while friends climb off, or swinging round to leave it.
- `noProgress` counts lining up at the home pier with friends aboard: from the far zones the flight home plus berthing
  can take a little over a minute.
- `neverFlies` measures one water trip; it restarts on boarding or delivery, not on a target change.

### Seaplane routing decisions

Why the autopilot works the way it does. Each point fixed a reproduced failure.

- **Landing selection compares every feasible lane** using a conservative distance bound. A fixed shortlist of the 16
  cheapest estimates could cluster at one point that needed a long terrain-clearing circuit, while a nearby lane went
  unexamined.
- **Reconsider an unworkable lane** after climb-out changes height and position, but keep a valid approach stable. On
  a home approach, reconsider after gaining 4 m as well as after one second: climbing changes feasibility before the
  retry delay expires (home seed 7's constrained pier approach). Pickups keep the one-second interval: a faster retry
  switched lanes mid-climb and lengthened home seed 6.
- **Judge each trip on its own.** Time on the water carried from one rescue into the next once made a 156 m hop fly a
  1133 m takeoff-and-landing loop. Boarding pauses the timer; a new rescue or home trip resets it. Long flights and
  committed takeoff runs are kept.
- **Remember a failed takeoff origin.** A blocked northbound run was retried forever because the avoidance list lost
  the failed spot when the takeoff started (`tkSpot` became null). The failed origin now survives into recovery,
  including in firefighting.
- **Taxi short hops.** Friends near enough to reach by water are taxied to (under 140 m), but the plane starts moored
  facing the sea so that holding go in the home bay still flies.

### Crew trips (two pilots)

| Requirement | Acceptance | Check |
|---|---|---|
| A nearby second rescue avoids a needless circuit | Home Bay seed 3, heli/seaplane: Blue's f3 pickup at most 35 s and 350 m | `npm run crew-trip-check` |
| Nearby rescue after returning home stays efficient | Home Bay seed 1, two seaplanes: Red's f3 pickup at most 30 s and 350 m | same |
| A blocked takeoff doesn't retry the same origin forever | Harbour Town seed 8, two seaplanes: finish within 180 s | same, plus the play-check two-seaplane Harbour outing |
| Shared crew behaviour stays safe | heli/seaplane, two seaplanes and seaplane/boat outings finish from normal menus | crew-trip checker across zones and seeds |

Each new rescue or home trip is judged on its own: time spent on water for one rescue does not carry into the next.
Default crew-trip runs always include the Home Bay seed 3 and Harbour Town seed 8 regressions.

## Manual (Pilot) controls

Per pilot, under "Choose vehicles and controls". Keys are in `README.md`.

| Requirement | Acceptance | Evidence |
|---|---|---|
| Fine motion starts smoothly beyond the stick dead zone | inputs through ±0.18 give zero; ±0.1801 gives below 0.001; full travel reaches ±1 | `tools/test/manual-controls.mjs`, `analog-check` |
| Small throttle gives a controlled water taxi | raw forward stick 0.35: seaplane stays afloat, below 7 m/s after 6 s | `analog-check` (synthetic gamepad) |
| Reverse taxi respects analog magnitude | raw reverse 0.35 settles below 1 m/s astern | `analog-check` |
| Full takeoff power remains | full keyboard W after the slow taxi gets airborne | real key check |
| Precision applies to every manual vehicle | helicopter tilt/slide/yaw and boat steering share the manual stick mapping (`src/manual-controls.mjs`) | unit and rendered checks |
| Assisted controls keep their response | raw 0.35 assisted stick still maps to 0.35 | `analog-check` |

Only manual stick axes are remapped. Triggers, keys and D-pad values are unchanged. The seaplane's manual water speed
targets (30 m/s, or 6 m/s beside a friend) scale with throttle magnitude. Before, any forward stick asked for full
speed, and above 19 m/s the plane rotates for takeoff by itself, so a gentle taxi could take off. The helicopter and
boat already scaled force by input. Synthetic gamepads prove the mappings and physics, not hardware feel.

## Home pier and walking home

Friends brought home finish the trip on foot, for every machine. They hop onto the deck (the flying boat's by way of
its wing float), walk the pier and lawn in a line, and hop the pen's low fence. Out of the helicopter they walk across
the grass. They count as safe the moment they are ashore. Hulls slide off piers and jetties (`pierFend`); wings, being
higher than the decks, pass over. Code: `BERTHS`, `assignBerths`, `berthing`, `deckGap`, `deliverOne`, `hoppers` in
`src/main.js`.

| Player-visible behaviour | Acceptance |
|---|---|
| Easy boat and seaplane tie up rather than pass by | stopped within a few metres of the berth before anyone gets off; nobody new fetched until everyone is off |
| No hull through a pier | `hullInPier` never broken |
| Friends walk home | `walkHomeStuck`: every friend in the pen within 30 s of leaving the machine |
| Pilot mode | stop within 2.5 m of a deck (3 m for the flying boat's float) and friends hop across; rated on how close |

## Signature moments

The helicopter's start-up and landing are a highlight; every machine should have equivalents: engine start (starter
whine, slow turns, a puff of smoke, the airframe rocking), the takeoff run (rising note, spray, a low camera beside the
hull, spray stopping at lift-off), splashdown or touchdown (flare, splash, deceleration wake, a camera jolt) and
shutdown (the propeller or rotor winding down, water lapping).

## Water contact and equipment motion

- **Wakes:** every boat under way (pilots' boat and seaplane, sailing boats, the patrol trawler, the stricken
  fishing boat) leaves a continuous ribbon along its real path, with V arms spreading from it. The seaplane's wake
  fades as it lifts off and returns on touchdown. The water shader has six trails (two pilots, four nearest boats).
- **Hull foam:** each hull gets a foam line at its waterline and, when moving, a bow wave (`hullUniform` in
  `world.js`, `HULL_WATERLINE` in `main.js`).
- **Bucket:** tips to scoop and rights as it fills (1.6 s), sloshes, squashes as it fills and bobs as it empties,
  sheds water leaving the sea and drips on the way. The seaplane drips after a scoop and a drop to match. The boat
  has no equivalent (continuous seawater).

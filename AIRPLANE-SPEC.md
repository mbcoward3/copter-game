# Spec: airplane option

Status (2026-10-25): the seaplane is a Coast Guard flying boat (`src/models.js` `buildPlane`, `tools/build_vehicles.py`), flown in assisted mode by `planePilot` in `src/main.js`. Since 2026-10-25 it flies smooth curves (`src/flightpath.mjs`: turn, straight, turn onto a 90 m final, a steady 1-in-6 glide from cruising height that starts in the turn) instead of the old lead-in point and teardrop, and moors at the home pier with its door to it (see "Home pier" in `VEHICLE-UI.md`). The sections below the acceptance checks are the original v1 design notes.

## Acceptance checks (assisted mode, holding only go)

These are what a child and a parent would notice, written as numbers. Each one is checked automatically by
`npm run check` (fast simulation, every mission x 3 seeds) and `npm run play-check` (the real page, drawn, with real
key presses), under the check name in brackets. A change to the seaplane is not done until both pass and the
play-check screenshots have been looked at.

| What you would see | Limit | Check |
|---|---|---|
| From a fresh start at the pier it is in the air quickly | airborne within 15 s (not counting taxiing to friends near enough to fetch by water) | `slowTakeoff` |
| It heads for where it is going: no flying off somewhere else | while more than 400 m from its goal, flying away from it at most 15% of that time (circling nearer in to line up a landing is fine, and so is the circuit within 450 m of the landing spot it chose: out past it and back round) | `fliesAway` |
| It never skims a hill, the trees or a tower | 8 m clear of ground, treetops and towers whenever in the air and not landing | `planeIntoHill` |
| It lands near the friend, not somewhere far off | touches down within 250 m of the friend (or the fire's water) | `landsFarAway` |
| It never lands on a beach, a reef or a rock | every touchdown on water at least 3 m deep | `planeOnLand` |
| On a fire mission it fetches water from near the fire | scoops within 400 m of the fire | `scoopsFarAway` |
| Holding go, it gets into the air: it does not just drive round the bay on the water | at most 40 s on the water at a time (waits while friends get on or off not counted). Added 2026-10-25 after the first dock version started the plane nose-in to the island and taxied it everywhere in the home bay; the rule flagged that build | `neverFlies` |
| It never gives up or circles | a pickup or a drop at least every 60 s of play (or lining up at the home pier with friends aboard) | `noProgress` |
| It flies a smooth curve to where it lands, not a loop out and back | each hop between stretches of water flies at most 1.5× the shortest way round anything at cruising height, plus a turn about: 400 m, one circle at its turn radius; 650 m when the only water to land on faces back the way it came (out past the spot by the length of its final, round and back). The October 2026 teardrop flew 650–1150 m for 80–300 m hops and broke this in 6 of 8 missions | `roundabout` |
| Its hull never goes through a pier or a jetty | the hull's middle never over a deck | `hullInPier` |
| Friends it brings home walk to the pen | each is off the plane, along the pier and in the pen within 30 s | `walkHomeStuck` |
| Flying with the boat on a fire mission, it has a fire to fight too | in each zone, at most 20% of new fires are ones only the boat can fight (the boat needs a shore, the seaplane open water to scoop); before October 2026 it was 33–92%, and the seaplane flew about with nothing to do | `crewLint` |
| No errors, no frozen screen | nothing thrown, nothing recorded in `__gameProblems` | `pageError` |


Rule changes on 2026-10-25 (HOW-WE-CHECK rule 7), each because the rule was measuring the wrong thing once friends
are landed at the pier rather than dropped off in passing:
- `stuckS` no longer counts lying at the pier while friends climb off, or swinging round on the spot to leave it.
- `noProgress` counts lining up at the home pier with friends aboard: from the far zones (snow, harbour) the flight
  home and the berthing together can take a little over a minute, and nothing about that is giving up.
- `roundabout` (new) is checked against the old teardrop: it flags 6 of 8 missions there, none now.

Rule clarification during rescue polish (2026-10-26): `neverFlies` measures a water trip, restarting when a friend
boards or is delivered. Home seeds 4 and 6 exposed the old clock accumulating multiple successful short taxi
rescues into a supposed 40-second failure. Waiting still does not advance the clock; changing targets does not
reset it. The 40-second limit and independent 60-second no-progress rule remain. See `RESCUE-POLISH.md`.

## Recommendation: a rescue seaplane

Make the airplane a **floatplane** (think a de Havilland Beaver on floats, in rescue livery). It solves the pickup question naturally: a plane cannot hover over an animal, but a seaplane can land on the water next to one. It also fits the game, which is already about pulling animals out of the sea.

Each pilot picks **helicopter or seaplane** on the start screen. Two players can mix (one of each).

## How it plays, for a 3-year-old

Same three keys as the helicopter: go, turn, back. Everything else is automatic.

| Situation | What the plane does by itself |
|---|---|
| Parked at the dock, any key pressed | Engine start: propeller coughs, catches, spins up (about 3 s), then it taxis out |
| Holding go on the water | Takeoff run: spray off the floats, nose lifts, climbs to cruise height |
| Holding go in the air | Cruises at a fixed height, follows terrain up and over hills |
| Go released in the air | Throttles back and glides down to land on the water wherever it is, then floats. It never stalls or falls. |
| Turning | Banks into the turn. Turn rate is gentler than the helicopter's, so circles are wide. |
| Over land with go released | Keeps flying at minimum speed and steers itself toward the nearest water before settling |
| World edge | Turns itself back, same as the helicopter |

There are still no fail states: it cannot crash, sink or run out of anything.

## Animal pickup

**Skim and scoop.** When the plane flies within reach of a waiting animal with room aboard:

1. It automatically descends and slows, lining up on the animal (the pilot only needs to be roughly pointed at it).
2. It touches down and skims past on its floats with a long spray wake.
3. A side door slides open and the animal hops in with the same arc animation the helicopter basket uses.
4. If go is still held, it accelerates and takes off again. If not, it floats there.

This keeps the helicopter's rule that a pickup always completes once it has started, and should take about 2 seconds from touchdown to animal aboard.

**Animals on sandbars** (the "islet" spawns) are not reachable by floats. Two options, pick one:

- *Simple:* the plane taxis up to the beach and the animal runs down and hops in. No new mechanics.
- *More fun:* the plane drops a small parachute raft; the animal climbs on and becomes a normal water pickup. This adds a drop animation and one more state.

Recommend the simple option first.

## Delivery

The plane lands on the water near the base and taxis to the existing pier by itself once it is close. Animals hop out along the pier and run up to the paddock. The plane's "helipad" is a mooring at the end of the pier, where it parks and shuts down when left alone.

## Helicopter versus seaplane

| | Helicopter | Seaplane |
|---|---|---|
| Top speed | 26 m/s | about 40 m/s |
| Turning | Tight, can spin on the spot | Wide banked turns |
| Stopping | Hovers anywhere | Must be on water to stop |
| Pickup | Basket winch from above | Skim and scoop |
| Seats | 3 | 4 |
| Feels like | Precise, good for crowded spots | Fast, good for far-away animals |

In two-player with one of each, the natural teamwork is: the plane fetches distant animals, the helicopter handles the ones near rocks and sandbars.

## The moments that matter

The helicopter's start-up and landing are a highlight, so the plane needs equivalents:

- **Engine start:** starter whine, a few slow propeller turns, a puff of exhaust smoke, then it catches and the airframe rocks on its floats.
- **Takeoff run:** rising engine note, spray sheets off both floats, the camera drops low beside the float, then the spray stops as it lifts off.
- **Splashdown:** flare, a big double splash as the floats touch, deceleration wake, camera jolt.
- **Shutdown:** propeller winds down and stops, water laps at the floats.

## What needs building

- A second flight model next to the helicopter's: always-forward flight with banked turns, and the states parked, taxi, takeoff run, cruise, approach, skim, floating.
- A seaplane model with spinning propeller, floats, sliding door, red and blue liveries.
- Water effects: float wakes, takeoff and landing spray. The water shader already supports two wash sources per frame and would need float wakes added.
- Camera: chase camera that sits further back and banks slightly with the plane.
- Audio: piston-engine start, run and shutdown, splash sounds.
- Start screen: vehicle choice per pilot, usable by a parent with the mouse.
- Mooring at the pier and the taxi-to-pier assist.
- Paddock path from the pier for delivered animals.

## Open questions for you

1. Seaplane as proposed, or would you rather have a wheeled plane with a runway on the base island? A runway plane needs a different pickup idea (parachute raft drops only), which is less hands-on for a toddler.
2. For sandbar animals: taxi to the beach (simple) or parachute raft (more fun, more work)?
3. Should this go into v1, v2, or both?

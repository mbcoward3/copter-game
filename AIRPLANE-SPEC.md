# Spec: airplane option

Status: the seaplane is built in v1 (`src/main.js` `updatePlane`, `src/models.js` `buildPlane`) using the defaults below; the parachute raft and a taxi-to-mooring animation were not built. Written so it can be handed to a session working on either v1 (`src/`) or v2 (`v2/`).

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

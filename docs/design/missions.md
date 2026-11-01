# Missions: rescue and firefighting

Code: `src/missions.mjs` (choice and rotation), the `missions`, `animals` and `fires` sections of `src/main.js`,
`src/firefighting.mjs` (fire field, spread, water impact, pure and Node-tested) and `src/fire-scene.js` (fuel props,
water stream).

## Outings

- Players choose **Rescue**, **Firefighting** or **Surprise me**, then one of six locations or **Random locations**.
  Fixed choices repeat; random choices avoid repeating the same place and job straight away. Preferences are
  remembered.
- A fresh outing starts at the home base. Each next mission starts wherever the crew already is.
- Finishing a mission earns its sticker, celebrates with each crew where they are (see
  [guidance-and-hud.md](guidance-and-hud.md#celebration)), then moves on.
- Weather changes by mission (calm, breezy, calm, stormy) and raises swell and wind. Assisted flying barely feels it;
  Pilot mode feels all of it.

| Requirement | Acceptance | Check |
|---|---|---|
| Changing missions keeps every vehicle where it is | at most 15 m between consecutive rendered frames spanning the change | `movedBetweenMissions` in `play-check` (`tools/checks/mission-transition.mjs`) |
| A fresh outing starts at home | every pilot at the base or pier | `play-check` |

Sample consecutive animation frames inside the page, not positions read by separate DevTools calls: browser latency
otherwise looks like a teleport. A synthetic jump must still fail.

## Rescue spots

Friends wait on rafts and life rings, in kayaks, on capsized dinghies, on the deck of a smoking fishing boat (two or
three to winch off; she motors away when the last is safe), on stilt-hut porches in the atoll lagoon, at island landing
sites, on sea-cliff ledges and summits (helicopter only), and on ice floes in the snow zone. Which vehicle can reach
which spot is the eligibility rule in [guidance-and-hud.md](guidance-and-hud.md#rules-for-all-presentation-code).

## Firefighting

One substantial incident per mission: a spreading woodland/scrub front or a rooftop fire. Fire occupies a
terrain-following field of fuel patches; wind pushes it into neighbouring dry fuel. Friends and landing pads stay
clear of the burning area.

- Water lands over a real footprint. It cools burning patches and wets unburnt ground into a firebreak. A missed drop
  doesn't damage a distant fire. Secured patches stay out.
- The crew finishes by cooling remaining embers and checking the ground before celebrating. "Cooled" is heat
  reduction, not a promise the ground is safe.
- Fuel piles, pallets and crates belong to fire patches: heat chars and settles them; water darkens them without
  undoing damage. Smoke and embers follow the remaining heat; damage stays through the aftermath.
- In assisted controls, holding go runs the whole refill → line up → attack → repeat loop. Both players can work the
  same incident.

Per vehicle:

- **Helicopter:** dips the hanging bucket in the blue refill area, hovers over the front and opens a sustained water
  curtain. The bucket has an open mouth, a moving water surface and a working bottom valve.
- **Seaplane:** lands near the fire, skims to scoop a full tank (twin probes behind the hull step, spray), takes off,
  lines up a bombing run and lays a wide strip. Water carries forward with the aircraft, so it releases before the
  target. A gauge on its side shows the tank.
- **Boat:** the deck cannon turns and elevates toward individual burning patches. Continuous curved jet, unlimited
  seawater, steam where it lands. The pump primes and shows pressure; a helmeted operator follows a smooth sweep.

### Checker rules for fire

`tools/checks/fire-progress.mjs` reports an aircraft that never takes on water, or fills but never drops, during an
unfinished outing. A shared mission may finish before a filled aircraft gets its turn to drop; that exception
applies to both the refill rule and the drop rule. The idle and no-compatible-work checks and the 75-second
observation window are unchanged. `tools/test/fire-progress.mjs` covers the completed-full-tank case and the unfinished
counterexamples.

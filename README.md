# Little Rescue Squad 3D — Helicopter Heroes

Play the hosted game at **https://copters.matthewcoward.com**.

Alternatively, open **`rescue-squad-3d.html`** after building (no server or internet needed).

## Playing
- **Assisted controls:** hold `W` (or `↑` when playing solo) to go. Steering, rescues and the trip home are assisted;
  you can keep holding go through the whole mission. **Red:** `A`/`D` optionally turn, `S` slow/reverse. **Blue:** arrow keys.
- Press go on the pad and the engine starts up: the rotor winds up for about three seconds, then it lifts off.
- The helicopter flies at a safe height by itself, slows near animals, drops its basket on its own,
  climbs over buildings and rock arches, turns back if it wanders too far, and lands itself when left alone over a helipad.
- Each pilot picks a **helicopter**, a **seaplane** or a **fast boat** on the start screen (two players can mix).
- The menu shows the starting keys for each pilot's selected vehicle and controls, including remembered Manual choices.
- Each radar shows rescues suited to that vehicle's equipment. Green **H** marks the helicopter's home landing area;
  the green **anchor** marks the boat and seaplane's home jetty. Water pilots see **Jetty** range on the manual instruments.
- Helicopter: fly to a golden light beam; the side door slides open and the rescue basket goes down. Carry up to 3, fly home and they hop out.
  A friend waiting on an island is fetched by landing: fly over them and the helicopter sets itself down, they climb in, press go to leave.
  A smoking fishing boat has two or three friends on deck to winch off; when the last is safe she motors away.
- Boat: go, turn, back. It slows beside a friend and the crew throws them a life ring on a line, tows them in and they climb over the collar; it noses up to the pier to let them out.
- Seaplane: a Coast Guard rescue flying boat. Hold go and it taxis out to a clear stretch of water, takes off, flies round high ground and anything tall, circles onto a straight approach, lands on open water within taxiing distance of the friend, taxis over and waits while they swim to the open door and climb in; they ride home sitting in the doorway. Friends close enough to reach by water it simply taxis to. Let go in the air and it lands on open water ahead.
- Friends turn up in all sorts of places: on rafts and life rings, in kayaks, sitting on capsized dinghies, on the deck of a smoking
  fishing boat, on the porches of the stilt huts in the atoll lagoon (boats get in through the channel in the reef), at island landing
  sites, and stuck on sea-cliff ledges where only the helicopter's basket can reach.
- Manual controls (per pilot, under “Choose vehicles and controls”) are for grown-ups, and work for all three machines. Helicopter: tilt to accelerate, turn the nose, slide sideways,
  work the collective for height, land it yourself and hold a hover to winch. Landings and pickups are marked out of three stars.
  Keys: `W`/`S` tilt, `A`/`D` turn, `Q`/`E` slide, `Space`/`Left Shift` climb and descend, `R` winch (blue: arrows, `,`/`.`, `Enter`/`Right Shift`, `Right Ctrl`).
  Gamepad: left stick tilt, right stick turn, triggers climb and descend, A winch.
  For slow seaplane taxiing on a gamepad, use a light forward or reverse stick input; full forward gives takeoff power.
  You can bring friends home before filling every seat; the hints explain boarding and the approach to the base or jetty.
  Boat: `W`/`S` throttle, `A`/`D` steer; stop beside a friend and the crew throws a ring automatically (`R` can also throw it).
  Seaplane: hold `W` on the water to take off; in the air it cruises by itself, with `W` boosting and `S` easing off.
  `A`/`D` turn and `Space`/`Left Shift` climb and descend. Fly down to land on water, then taxi up to a friend and stop for boarding.
  Manual pilots have a compact live instrument panel: speed, height above the surface and climb/descent for aircraft;
  speed and approach range for boats. It shows a nearby friend, home or the gap to the pier as appropriate. Lower-star
  landings and pickups give a practical target for the next attempt. Each pilot's instruments follow their own controls.
- Choose **Rescue**, **Firefighting**, or **Surprise me** under **Choose mission, vehicles and controls**, then pick any of the six locations or **Random locations**. Fixed choices repeat; random choices avoid repeating the same place and job immediately. Preferences are remembered. Pause to change the options; starting with changed options begins a fresh outing.
- Finishing a mission earns its sticker and celebrates with each crew wherever they are, then moves on to the next mission.
- Firefighting sends the crew to one substantial incident. A fresh outing starts at the home base; each next mission starts wherever the crew already is: a spreading woodland/scrub front or a rooftop fire. Fire occupies a terrain-following field of fuel patches, and wind encourages it into neighbouring dry fuel. Friends and landing pads stay clear of the burning area.
  Water lands over an actual footprint. It cools burning patches and wets unburnt ground to make a firebreak; a missed drop does not damage a distant fire. Secured patches stay out. The crew finishes by cooling remaining embers and checking the ground before celebrating.
  Helicopter: dip the hanging bucket into the blue marked refill area, then hover over the front and open a sustained water curtain. The bucket visibly empties as it pours.
  Seaplane: land on open water near the fire and skim along it to scoop a full tank, take off, line up a bombing run, and lay a wide water strip across the front. Water carries forward with the aircraft, so it releases before reaching the target.
  Boat: use the deck cannon, which turns and elevates toward individual burning patches. Its continuous curved jet uses unlimited seawater, with steam where it lands.
  The bucket has an open mouth, a visible moving water surface and a working bottom valve. The flying boat lowers twin scoop probes behind its hull step before filling, throws spray as it skims and opens the drop doors in its hull for a broad water curtain; a gauge on its side shows how full the tank is. The boat primes its pump, shows pressure on its gauge and has a helmeted nozzle operator following a smooth target sweep.
  Fuel piles, pallets and crates belong to individual fire patches: heat chars and settles the timber; water darkens and wets it without undoing the damage. Smoke and airborne embers follow the remaining heat, and damaged objects remain through the incident aftermath.
  In assisted controls, **holding go handles the complete refill → line up → attack → repeat loop**. Both players can work the same incident. The camera opens up around the attack; fire and smoke recede locally, wet ground and scorched vegetation show where the crew has worked. The compact existing water gauge also shows containment, and radar marks fire and refill areas.
- Weather (corner button, and it changes by mission: calm, breezy, calm, stormy) raises the swell and the wind. Easy flying barely feels it; Pilot mode feels all of it.
- Extras: `F` or `/` honk; in assisted aircraft, `E`/`Q` or `Enter`/`Shift` adjust height; gamepads are supported in play.
- The water gauge shows bucket/tank fill during fire missions. Boats use their existing water cannon directly.
- The gear button opens settings for player 2, time of day, weather, graphics (✨ automatic: steps detail down when the
  computer struggles and back up when it can; 💎 best; ⚡ fast), and volume. Mute and pause stay beside it.
- Sound, vehicle and control preferences are remembered on this browser. The game pauses when the window loses focus;
  choose **Keep playing** to resume. Progress within an outing is not yet saved across reloads.
- Keyboard or gamepad is needed for driving; touch driving controls are not provided.

## Sounds
Vehicle engines, ambience, animal calls and effects use real recordings, cut into loops and one-shots by
`tools/pack_audio.py` (sources listed at its top). A soft synthesized thud accompanies touchdown; animals without a
recorded call use a quiet chime acknowledgment. Sources:
recordings from [BigSoundBank](https://bigsoundbank.com) (CC0); the jingles between missions from Kenney's
[Music Jingles](https://kenney.nl/assets/music-jingles) (CC0); and "Propeller-plane-flying-steady-01" by Versatile Virtuoso,
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Propeller-plane-flying-steady-01.wav), CC BY-SA 4.0.

## Changing the game
Source is in `src/`. The current game is the only maintained implementation.
Models, ground pictures, and sounds are in `src/assets/`; `npm run build` bundles them directly.
Blender generators and asset packers live in `tools/` and are only needed when changing those assets.
After editing:

    npm install        # first time only
    npm run build      # rebuilds rescue-squad-3d.html
    npm test           # flight-clearance, audio-lifecycle and firefighting regressions
    npm run check      # plays every machine through every mission, checks the rules, compares with the baseline
    npm run play-check # plays the real page, drawn, in real time with real key presses, and saves screenshots
    npm run serve      # optional dev server on http://localhost:5173

`npm run check` (`tools/check.mjs`, needs Google Chrome) plays each machine through each mission from fixed seeds in a
headless browser with nothing drawn, holding only go, and checks every tenth of a second that nothing breaks a rule:
a hull on land, the seaplane flown into a hill, landing on a beach or far from where it is going, slow to take off or
making no progress, the helicopter's basket jerked faster than the winch winds, a helicopter inside a tower, the patrol
boat or a sailing boat aground, anything flung off (the seaplane's rules are listed in AIRPLANE-SPEC.md). It also checks
the map (every spawn point in water) and compares finish times, turning and stuck time with `tools/check-baseline.json`, failing on anything clearly worse.
A seed (`rescue-squad-3d.html?test&seed=N`) always plays out the same way, so a failure can be replayed exactly; see the
top of `tools/check.mjs` for options (`--only plane`, `--seeds 5`, `--frame 0.1` for a slow laptop, `--accept`).
A seed plays the same in the dev page as in the check: test mode fixes the graphics detail and ignores saved settings.

`npm run play-check` (`tools/play-check.mjs`) is the other half: it opens the ordinary page on the real graphics card,
clicks through the start menu, holds go for each machine and mission (and two pilots together), and fails on any error,
a number gone bad, a fresh outing not starting at home, no progress, a cable not joined to its basket or bucket, or a
boat in a pier. Look at the screenshots it saves in `build/play/`: passing checks are not the same as looking right.

To rebuild models with Blender, run:

    blender --background --python tools/build_models.py -- build/models
    blender --background --python tools/build_vehicles.py -- build/vehicles
    blender --background --python tools/build_zones.py -- build/zones
    blender --background --python tools/pack_models.py -- build/models src/assets build/vehicles build/zones

`build_models.py` makes the helicopter, animals, and home scenery; `build_vehicles.py` makes the boat, seaplane,
sea arch, stilt hut, and kayak; `build_zones.py` makes regional buildings, trees, and wildlife.
The local model exports and baked shading are in `build/models/`. Ground-photo inputs are in `build/photos/`;
run `blender --background --python tools/pack_textures.py -- build/photos src/assets` to repack them.
These ignored working inputs are not required to build or play the game; model exports can be regenerated with
the commands above. For a fresh checkout, ground-photo inputs must be supplied separately (Poly Haven CC0;
the filenames are listed in `tools/pack_textures.py`), as must the audio inputs listed in `tools/pack_audio.py`.

`tools/soak.js` plays the game unattended in the browser and reports rescues and stuck time. Its default test holds only
go, including at home: `soak('heli', 300)`. It does not steer on the pilot's behalf. See the comment at its top for options.

Use [`HOW-WE-CHECK.md`](HOW-WE-CHECK.md) for the development/checking workflow and
[`AIRPLANE-SPEC.md`](AIRPLANE-SPEC.md) for the seaplane's current acceptance criteria.
`tools/sim-checks.js`, run by `npm run check`, is the maintained source of simulation rules and benchmark metrics.
`npm run assisted-hint-check` checks assisted startup and wrapping fixtures across all vehicles, rescue/fire,
solo/two-player and narrow/wide views. It verifies readable HUD geometry, not mission completion.

Pushing `main` builds the game and updates the production content in the private `talos-cluster` GitOps repository.

For a second local checkout, set `COPTER_PORT` before serving (PowerShell: `$env:COPTER_PORT=5174`).
The development server listens on this machine only.

Rendering and model development are documented in [`MODEL-PIPELINE.md`](MODEL-PIPELINE.md).
`npm run render-check` verifies shadow consistency and resource ownership on the real renderer;
`npm run profile` captures serial live CPU/GPU measurements and screenshots. Run profiling separately
from other browser checks. Each build writes `build/asset-report.json` with model budgets and contracts.
`npm run build:hosted` produces the cacheable hosted build in `build/site/` alongside the offline HTML.

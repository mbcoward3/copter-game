# Little Rescue Squad 3D — Helicopter Heroes

Play the hosted game at **https://copters.matthewcoward.com**.

Alternatively, open **`rescue-squad-3d.html`** after building (no server or internet needed).
The original 2D game is still there as `helicopter-game.html`.

## Playing
- **Assisted controls:** hold `W` (or `↑` when playing solo) to go. Steering, rescues and the trip home are assisted;
  you can keep holding go through the whole mission. **Red:** `A`/`D` optionally turn, `S` slow/reverse. **Blue:** arrow keys.
- Press go on the pad and the engine starts up: the rotor winds up for about three seconds, then it lifts off.
- The helicopter flies at a safe height by itself, slows near animals, drops its basket on its own,
  climbs over buildings and rock arches, turns back if it wanders too far, and lands itself when left alone over a helipad.
- Each pilot picks a **helicopter**, a **seaplane** or a **fast boat** on the start screen (two players can mix).
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
  Keys: `W`/`S` tilt, `A`/`D` turn, `Q`/`E` slide, `Space`/`Shift` climb and descend, `R` winch (blue: arrows, `,`/`.`, `Enter`/`Shift`, `Ctrl`).
  Gamepad: left stick tilt, right stick turn, triggers climb and descend, A winch.
  Boat: `W`/`S` throttle, `A`/`D` steer; stop beside a friend and the crew throws a ring automatically (`R` can also throw it).
  Seaplane: hold `W` on the water to take off; in the air it cruises by itself, with `W` boosting and `S` easing off.
  `A`/`D` turn and `Space`/`Shift` climb and descend. Fly down to land on water, then taxi up to a friend and stop for boarding.
- Choose **Rescue**, **Firefighting**, or **Surprise me** under **Choose mission, vehicles and controls**, then pick any of the six locations or **Random locations**. Fixed choices repeat; random choices avoid repeating the same place and job immediately. Preferences are remembered. Pause to change the options; starting with changed options begins a fresh outing.
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
Source is in `src/`. The models and ground pictures are in `src/assets/`, packed from the Blender-made
files of the Unreal prototype by `tools/pack_models.py` and `tools/pack_textures.py` (only needed again if those change).
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

`tools/build_vehicles.py` (Blender) makes the boat, the flying boat, the sea arch, stilt hut and kayak into `build/vehicles`, and
`tools/build_zones.py` the pines, the town's houses, the fire tower, ski hut, crane, sailing boat, seal and turtle into `build/zones`;
pack them all with
`blender --background --python tools/pack_models.py -- unreal/RescueSquad/Saved/Models src/assets build/vehicles build/zones`.
`tools/soak.js` plays the game unattended in the browser and reports rescues and stuck time. Its default test holds only
go, including at home: `soak('heli', 300)`. It does not steer on the pilot's behalf. See the comment at its top for options.

Pushing `main` builds the game and updates the production content in the private `talos-cluster` GitOps repository.

For a second local checkout, set `COPTER_PORT` before serving (PowerShell: `$env:COPTER_PORT=5174`).
The development server listens on this machine only.

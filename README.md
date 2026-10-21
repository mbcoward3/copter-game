# Little Rescue Squad 3D — Helicopter Heroes

Play the hosted game at **https://copters.matthewcoward.com**.

Alternatively, open **`rescue-squad-3d.html`** after building (no server or internet needed).
The original 2D game is still there as `helicopter-game.html`.

## Playing
- **Red:** `W` go, `A`/`D` turn, `S` back up. **Blue:** arrow keys. That is all a small pilot needs.
- Press go on the pad and the engine starts up: the rotor winds up for about three seconds, then it lifts off.
- The helicopter flies at a safe height by itself, slows near animals, drops its basket on its own,
  turns back if it wanders too far, and lands itself when left alone over a helipad.
- Each pilot picks a **helicopter**, a **seaplane** or a **fast boat** on the start screen (two players can mix).
- Helicopter: fly to a golden light beam; the side door slides open and the rescue basket goes down. Carry up to 3, fly home and they hop out.
  A friend waiting on an island is fetched by landing: fly over them and the helicopter sets itself down, they climb in, press go to leave.
  A smoking fishing boat has two or three friends on deck to winch off; when the last is safe she motors away.
- Boat: go, turn, back. It slows beside a friend and the crew throws them a life ring on a line, tows them in and they climb over the collar; it noses up to the pier to let them out.
- Seaplane: hold go to take off, let go and it lands on the water by itself. Fly toward a friend and it lands short, taxis up and waits while they swim to a float and climb in; fly home and it settles by the pier.
- Friends turn up in all sorts of places: on rafts and life rings, in kayaks, sitting on capsized dinghies, on the deck of a smoking
  fishing boat, on the porches of the stilt huts in the atoll lagoon (boats get in through the channel in the reef), at island landing
  sites, and stuck on sea-cliff ledges where only the helicopter's basket can reach.
- Pilot mode (per pilot, on the start screen) is for grown-ups, and works for all three machines. Helicopter: tilt to accelerate, turn the nose, slide sideways,
  work the collective for height, land it yourself and hold a hover to winch. Landings and pickups are marked out of three stars.
  Keys: `W`/`S` tilt, `A`/`D` turn, `Q`/`E` slide, `Space`/`Shift` climb and descend, `R` winch (blue: arrows, `,`/`.`, `Enter`/`Shift`, `Ctrl`).
  Gamepad: left stick tilt, right stick turn, triggers climb and descend, A winch.
  Boat: `W`/`S` throttle, `A`/`D` steer, `R` throws the ring when you are stopped beside a friend; jump the swell for air.
  Seaplane: `W`/`S` move the throttle lever, `A`/`D` turn, `Space`/`Shift` climb and descend; it flies above about 15 m/s,
  taxi up to a friend and stop to let them swim over.
- Fire missions: two of the missions (after the Pine Forest and after Volcano Isle) are fires to put out instead of friends
  to fetch: fires in the trees beside the island landing sites, a friend waiting by each. Put it out and the friend is safe.
  Helicopter: the basket is swapped for a water bucket; fly low over the sea to fill it, then over the fire to drop it.
  Seaplane: skim along the sea to scoop a tankful, then fly low over the fire. Boat: stop near the shore below the fire
  and the water cannon sprays it. In easy flying, holding go does all of this by itself.
- Weather (corner button, and it changes by mission: calm, breezy, calm, stormy) raises the swell and the wind. Easy flying barely feels it; Pilot mode feels all of it.
- Extras: `F` or `/` honk, `E`/`Q` or `Enter`/`Shift` higher/lower, gamepads.
- Corner buttons (for grown-ups): add/remove player 2, time of day, weather, graphics (✨ automatic: steps detail down when the
  computer struggles and back up when it can; 💎 best; ⚡ fast), mute, pause.

## Sounds
Every sound is a real recording, cut into loops and one-shots by `tools/pack_audio.py` (sources listed at its top):
recordings from [BigSoundBank](https://bigsoundbank.com) (CC0); the jingles between missions from Kenney's
[Music Jingles](https://kenney.nl/assets/music-jingles) (CC0); and "Propeller-plane-flying-steady-01" by Versatile Virtuoso,
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Propeller-plane-flying-steady-01.wav), CC BY-SA 4.0.

## Changing the game
Source is in `src/`. The models and ground pictures are in `src/assets/`, packed from the Blender-made
files of the Unreal prototype by `tools/pack_models.py` and `tools/pack_textures.py` (only needed again if those change).
After editing:

    npm install        # first time only
    npm run build      # rebuilds rescue-squad-3d.html
    npm run serve      # optional dev server on http://localhost:5173

`tools/build_vehicles.py` (Blender) makes the boat, seaplane, sea arch, stilt hut and kayak into `build/vehicles`; pack them with
`blender --background --python tools/pack_models.py -- unreal/RescueSquad/Saved/Models src/assets build/vehicles`.
`tools/soak.js` plays the game unattended in the browser and reports rescues and stuck time (see the comment at its top).

Pushing `main` builds the game and updates the production content in the private `talos-cluster` GitOps repository.

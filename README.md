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
- Boat: go, turn, back. It slows beside a friend so they can hop in and noses up to the pier to let them out.
- Seaplane: hold go to take off, let go and it lands on the water by itself. Fly toward a friend and it skims past so they hop aboard; fly home and it settles by the pier.
- Pilot mode (per pilot, on the start screen, helicopter only) is for grown-ups: tilt to accelerate, turn the nose, slide sideways,
  work the collective for height, land it yourself and hold a hover to winch. Landings and pickups are marked out of three stars.
  Keys: `W`/`S` tilt, `A`/`D` turn, `Q`/`E` slide, `Space`/`Shift` climb and descend, `R` winch (blue: arrows, `,`/`.`, `Enter`/`Shift`, `Ctrl`).
  Gamepad: left stick tilt, right stick turn, triggers climb and descend, A winch.
- Weather (corner button, and it changes by mission: calm, breezy, calm, stormy) raises the swell and the wind. Easy flying barely feels it; Pilot mode feels all of it.
- Extras: `F` or `/` honk, `E`/`Q` or `Enter`/`Shift` higher/lower, gamepads.
- Corner buttons (for grown-ups): add/remove player 2, time of day, graphics quality, mute, pause.

## Changing the game
Source is in `src/`. The models and ground pictures are in `src/assets/`, packed from the Blender-made
files of the Unreal prototype by `tools/pack_models.py` and `tools/pack_textures.py` (only needed again if those change).
After editing:

    npm install        # first time only
    npm run build      # rebuilds rescue-squad-3d.html
    npm run serve      # optional dev server on http://localhost:5173

Pushing `main` builds the game and updates the production content in the private `talos-cluster` GitOps repository.

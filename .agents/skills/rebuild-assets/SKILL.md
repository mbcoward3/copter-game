---
name: rebuild-assets
description: Regenerate and pack Little Rescue Squad's models, ground pictures and sounds into src/assets. Use when changing a vehicle, animal, building or scenery model in the Blender generators, adding a zone prop, repacking ground textures, or cutting new sound loops and one-shots from recordings.
compatibility: Needs Blender 5.2 (headless) for models and textures; Python with numpy and soundfile for audio.
---

# Rebuild assets

`src/assets/` is committed and is what the build bundles. Generators and packers in `tools/` are only needed when an
asset changes. Their working inputs and outputs live in git-ignored `build/` folders.

## Models

The procedural Blender scripts are the editable source:

| Script | Makes | Output |
|---|---|---|
| `tools/assets/build_models.py` | helicopter, animals, home scenery | `build/models` |
| `tools/assets/build_vehicles.py` | boat, seaplane (incl. rudder/elevator parts), stilt hut, kayak | `build/vehicles` |
| `tools/assets/build_zones.py` | regional buildings, trees, wildlife, zone props | `build/zones` |

PowerShell (`blender` is `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` on this machine):

```powershell
$blender = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
& $blender --background --python tools/assets/build_zones.py -- build/zones
```

Then pack. **Prefer `--add` with a folder of only the changed FBX files:** some models in `src/assets/models.bin`
were first packed from an Unreal export folder that no longer exists, so a full repack can silently drop them.

```powershell
& $blender --background --python tools/assets/pack_models.py -- --add build/changed src/assets
```

A full repack (`-- build/models src/assets build/vehicles build/zones`) is safe only after confirming every model
name in `models.bin` has a source in those folders. Packing takes about 3 minutes; run it in the background.

After packing:

1. `git diff --stat src/assets` and revert AO pictures you didn't mean to change (a repack re-bakes some with noise,
   e.g. `ao/World_SkiHut.jpg`).
2. `npm run build`, then read `build/asset-report.json` for triangle, material and size budgets.
3. Review with `node tools/review/vehicle-shots.mjs` or `node tools/review/scene-shots.mjs`, and run the checks from the
   `check-a-change` skill.

Contract rules (details in `docs/design/rendering.md`):

- `src/assets/model-contracts.json` holds units, axes, offsets, sockets and LOD distances. Vehicles are built from its
  sockets.
- One mesh per exported file; the packer rejects multi-mesh imports. Animated parts are separate named exports.
- Keep the flight-clearance and collision envelope unless a tested gameplay change says otherwise.
- The packer makes the far LOD by decimation and shares the near body's UVs, AO and materials. Check windows, rails
  and lettering at the LOD switch.
- Axes: Blender X, Y, Z become the game's Z, X, Y (nose +Z, up +Y).

## Ground pictures

Poly Haven CC0 photos (file names listed in `tools/assets/pack_textures.py`), in `build/photos`:

```powershell
& $blender --background --python tools/assets/pack_textures.py -- build/photos src/assets
```

## Sounds

Recordings go in `build/audio-src` (sources and numbers listed at the top of `tools/assets/pack_audio.py`), then
`python tools/assets/pack_audio.py` cuts loops and one-shots into `src/assets/sfx/`. `python tools/assets/audio_scan.py
build/audio-src/*.mp3` prints loudness and brightness per second to pick steady stretches.

The bar for sound: real recordings only, no narrator; level each one, make it quieter with distance and check for
clicks. Keep engine `playbackRate` near 1 (a slowed recording sounds like a tape running down). You can't listen, so
choose by description and the scan, and say so. New downloads need the user's yes first: exact file, source, licence
and size. Credit any non-CC0 source in `README.md`.

## Fresh checkout

The game builds and plays without any of the `build/` inputs. Model exports regenerate from the scripts; photos and
recordings must be downloaded again from the sources the packers list.

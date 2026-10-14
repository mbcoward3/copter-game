# Prompt for v2 — realistic graphics

Paste everything below the line into a new session opened in `C:\Projects\Copter-Game`.

---

I have a working 3D helicopter rescue game in this folder that my 3-year-old son plays, often two players on one keyboard. I want a **v2 with realistic graphics instead of the current cartoon look**. The gameplay is already right; this is a visual upgrade.

## Hard rule: do not touch v1

- Do not edit, move, rename or delete `rescue-squad-3d.html`, `helicopter-game.html`, `src/`, `build.mjs`, `serve.mjs`, `README.md`, `package.json` or `package-lock.json`.
- Do all work in a new folder `v2/`. Start by copying `src/`, `build.mjs`, `serve.mjs` and `package.json` into it, and give it its own `node_modules` and its own output file `v2/rescue-squad-v2.html`.
- If you need a dev server, add a second entry to `.claude/launch.json` on a different port; leave the existing entry as it is.
- Before you finish, confirm v1 files are byte-for-byte unchanged (compare hashes taken at the start).

## What v1 is (read `src/` before changing anything)

- three.js r170, bundled by esbuild into one self-contained HTML file that runs by double-click, offline.
- `world.js` (sky, ocean shader with planar reflections, islands, base), `models.js` (helicopter, animals, props — all built from primitive shapes), `main.js` (flight, winch, missions, split-screen rendering, HUD), `fx.js`, `life.js`, `audio.js`.
- Everything is procedural: there are no model or texture files.

## What must not change

These were tuned for a 3-year-old and are the point of the game:

- Controls: go / turn / back only. The helicopter holds its own height, slows near animals, drops the basket by itself, turns back at the world edge, and lands itself when left over a helipad.
- No fail states. Nothing can crash or be lost.
- Pickup is deterministic and quick (about 0.6 s from basket launch to animal aboard) and always completes once started.
- The engine start-up on the pad (about 3 s spool-up with rumble and dust) and the landing (flare, touchdown bounce, about 6.5 s spool-down). My son loves these; make them look and sound better, never shorter or skippable by accident.
- Two-player split-screen on one keyboard, and single-player full screen.
- Grown-up options stay on corner buttons, not single keys.
- Smoothness: v1 holds roughly 7 ms frames in two-player split-screen at 1600×900 on an RX 6950 XT. v2 must stay under 16 ms there.

## What I want from v2

Move the look from cartoon toward realism, in this priority order:

1. **Helicopter.** A properly modelled rescue helicopter (think Coast Guard MH-65 or EC135): real fuselage panels, glazed cockpit with interior and pilot, articulated rotor head, motion-blurred blades, working winch arm, weathered PBR paint with livery decals. Red and blue variants.
2. **Animals.** Realistic but still appealing and readable at a distance: proper bodies with fur or feather shading, simple idle and "excited" animation, wet look when pulled from the sea.
3. **Ocean.** Deeper, more physical water: better wave spectrum, foam and whitecaps, shoreline breakers, refraction and depth colour, convincing rotor downwash and spray.
4. **Islands and base.** Textured terrain (sand, rock, grass with normal maps), real foliage, a believable station, helipads, pier and lighthouse.
5. **Light and atmosphere.** Physically based sky with volumetric-looking clouds, better shadows (cascades), ambient occlusion, and screen-space reflections on wet and glossy surfaces. Keep the three times of day.
6. **Sound.** Replace the synthesised engine with layered, realistic turbine start, blade chop and shutdown.

## How to get the assets

- Blender is available through the Blender MCP tools if it is running. Model the helicopter, animals and props there and export glTF (Draco or meshopt compressed), then load them with `GLTFLoader`. Ask me to start Blender if the connection fails.
- Generate textures procedurally or bake them in Blender. Do not download third-party models, textures or audio without asking me first and telling me the source and licence.
- v2 does not have to be a single HTML file. A `v2/` folder with assets served by the dev server is fine, but tell me plainly how to launch it.

## About ray tracing

Do not build a path tracer. An earlier attempt at a path-traced photo mode with `three-gpu-pathtracer` produced scrambled colours and was removed. Real-time rasterised techniques that look ray traced (planar or screen-space reflections, good GI approximation) are what I want.

## How to work

- Go in the priority order above and show me a screenshot after each stage so I can steer.
- After each stage, run a scripted pilot (press only go and turn) in one-player and two-player mode and confirm animals are still rescued and delivered, there are no console errors, and frame time is still under 16 ms. Report the actual numbers.
- If realism and toddler-readability conflict (for example an animal that is hard to spot in realistic water), readability wins: keep the light beams and the radar.
- Tell me honestly what you could not verify, especially how things sound and feel.

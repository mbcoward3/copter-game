# Rendering and assets

three.js r170 with an HDR/MSAA composer, bloom and a grade (`src/main.js` section `rendering`; scene and shaders in
`src/world.js`). The direction is believable, stylised realism: convincing silhouettes, materials and motion, with
friendly characters and clear player colours. No engine change is planned; the Unreal and WebGPU options were
considered and set aside in October 2026.

## Rules

- **Gameplay never depends on graphics quality.** Flight, rescue, water impacts and seeds behave the same at every
  quality level, LOD and resolution. Collision and navigation don't use render LOD.
- **Main view, shadows and mirror each get their own visibility.** Toggling reflections must not change which objects
  cast shadows in the main view.
- **Deformation in every pass.** Animal poses and foliage wind run in the depth shader as well as the surface shader.
- **Retire what you create.** A retired rescue prop or animal frees its private materials and keeps shared assets
  (`src/render-resources.js`).
- **Upload only what changed.** Changed instance lists upload their active range; unchanged ones upload nothing.
- **No mid-game shader builds.** Keep the light configuration stable (hidden lights use stand-ins) and prewarm with
  `compileAsync` against the composer's render target. An InstancedMesh with count 0 still costs a draw call: hide it.
- **Quality adapts without reallocating.** Runtime resolution changes keep the same shadow map and MSAA targets.
- **LOD by the main camera.** Hero LOD selection uses the main viewport camera for both colour passes, with 12%
  hysteresis. Far bodies share the near body's UVs, AO texture and materials.
- **Model contracts.** `src/assets/model-contracts.json` is the runtime source for units, axes, ground/float offsets,
  sockets and body LOD distances. Vehicle construction uses those sockets. Geometry changes keep the existing
  flight-clearance and collision envelope unless a separately tested gameplay change says otherwise.

## Acceptance

| Area | Required outcome | Check |
|---|---|---|
| Shadows | same camera and quality: reflections on/off give the same set of main-view shadow casters; each viewport updates once | `npm run render-check` |
| Lifetime | repeated retirement releases private resources, preserves shared ones; programs stay flat | `npm run render-check`, `tools/test/render-resources.mjs` |
| Uploads | unchanged instances skip upload; changed ones upload only the active prefix | `npm test` |
| Measurement | serial, seeded real-page captures with CPU/GPU percentiles, full-frame counters, screenshots and memory | `npm run profile` |
| Pipeline | every build writes `build/asset-report.json` (budgets and contracts); hosted and offline builds share one source | `npm run build`, `node tools/checks/hosted-check.mjs` |

Reference numbers (24 October 2026, Chrome/ANGLE D3D11, RX 6950 XT, 1440×900, DPR 1, Best): every-frame p95
7.0–7.1 ms at the display cap; GPU p95 5.9–9.8 ms solo and 8.0–10.9 ms split; CPU submission p95 at most 2.6 ms solo
and 4.2 ms split. Far vehicle LODs: helicopter 20.4k triangles, seaplane 7.6k, boat 7.3k. Hosted first load 9.3 MB,
51 KB on reload; offline HTML 11.7 MB.

Submitted triangles (1.2–3.4M) are higher than an earlier paused probe because shadows and the mirror get their own
visibility (the union of main, shadow and mirror frusta) and the mirror gets a far-tree proxy instead of dropping near
trees. Geometry estimates in the asset report exclude textures, instancing and renderer bookkeeping; treat budgets as
optimisation targets, not a reason to lose needed surface distinctions.

Frame times on this machine are unreliable while another game uses the GPU, and in a hidden browser pane. Judge
performance by structure (passes, draws, programs) first, and run profiling alone.

## Delivery

- `npm run build` writes the offline single-file `rescue-squad-3d.html` with every asset.
- `npm run build:hosted` also writes `build/site/`: `index.html`, hashed JavaScript and separately hashed binary and
  image assets. The Docker image serves this. Nginx doesn't cache the entry page and caches content-addressed assets
  as immutable.

## Measurement tools

- `npm run render-check`: shadow parity and resource lifetime on the real renderer. Run serially.
- `npm run profile -- --seconds 20` (or `--only split-easy-fire --seconds 120 --dpr 2 --out build/profile-dpr2`): menu-
  driven captures of every vehicle, control and mission combination.
- `__game.metrics.snapshot()` in the page: frame/simulation/CPU/GPU percentiles, calls, triangles, resources,
  programs and quality changes. Stage costs overlap, so don't sum them. A null GPU time means unsupported, not zero.
  `__game.metrics.stop()` turns instrumentation off and restores the renderer's counters.
- Profiling: fire captures use storm weather and manual captures dusk. A short outing may still be flying to the
  fire, so check positions and screenshots before blaming firefighting for a cost.
- Memory investigations: warm every animal type first and record the plateau, then repeat mission changes, rescues
  and retirement. New cached textures on first use are expected; private animal materials and props must retire.
- `node tools/review/vehicle-shots.mjs --vehicle plane --light day,dusk,storm` (also `--views door,cockpit`) and
  `node tools/review/scene-shots.mjs --light day,dusk` write review captures to `build/shots/`.
- `__game.debug.pick(x, y)` names the object and material under a pixel of the menu camera.

## Model notes

- Seaplane: a flying-boat hull (vee bottom, chines, a crisp step, tapered bow), framed windscreen panes, flush
  portholes, a real cabin behind the door, and separate rudder and elevators (`Vehicle_PlaneRudder`,
  `Vehicle_PlaneElevator`) on contract sockets that move with turns and climbs.
- Foliage: see-through texels keep the foliage colour (`bleedTex`), so distant trees don't go black.
- `tools/assets/build_models.py` writes its baked shading to the absolute output folder; before that, Blender saved it
  elsewhere and models kept stale shading after shape changes.

## Not verified on this machine

Integrated GPUs, DPR 2 at length, mobile and thermal behaviour, other browsers, multi-hour sessions, and art approval
of close-up model detail. Open art and renderer work is in [../backlog.md](../backlog.md#graphics-and-renderer).

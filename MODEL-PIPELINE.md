# Model contract and rendering workflow

The procedural Blender generators remain the editable source. The packed format now records a versioned contract for each vehicle body, and rejects imports with multiple meshes rather than silently discarding all but one. Animated parts should be separate named exports until a hierarchical format is introduced.

`src/assets/model-contracts.json` is the runtime source for units, axes, ground/float offsets, sockets and body LOD distances. Vehicle construction uses those sockets directly. Geometry changes must preserve the existing flight-clearance/collision envelope unless a separately tested gameplay change is intended.

Rebuild authored assets in PowerShell:

```powershell
$blender = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
& $blender --background --python tools/build_models.py -- build/models
& $blender --background --python tools/build_vehicles.py -- build/vehicles
& $blender --background --python tools/build_zones.py -- build/zones
& $blender --background --python tools/pack_models.py -- build/models src/assets build/vehicles build/zones
npm run build
```

The packer generates a lighter second body for each vehicle. The first-pass reduction preserves the full source UVs/material slots and uses a decimator; inspect windows, rails and lettering at the transition before tightening budgets. The far body reuses the near body's UVs, so it shares the near body's AO texture and materials; the packer writes no separate picture for it. Hero LOD selection uses the main viewport camera for both color passes, with 12% hysteresis. Collision and navigation do not use render LOD.

Every build writes `build/asset-report.json`: geometry counts, material groups, estimated GPU geometry bytes, bounds, contracts, and compressed/inflated model size. Geometry estimates exclude textures, instancing and renderer bookkeeping. Treat the review's proposed material budgets as optimization targets, not justification for losing needed surface distinctions.

## Delivery

- `npm run build`: the existing offline `rescue-squad-3d.html`, including all assets.
- `npm run build:hosted`: also writes `build/site/index.html`, hashed JavaScript, and separately hashed binary/image assets. Binary requests begin together and assets are independently cacheable. The Docker build serves this variant; deployment still requires the normal push workflow.
- Nginx serves the entry page without caching and content-addressed assets with immutable caching. JavaScript/JSON compression is enabled.

## Measurement

```powershell
npm run render-check
npm run profile -- --seconds 20
npm run profile -- --only split-easy-fire --seconds 120 --dpr 2 --out build/profile-dpr2
```

The profile runner uses actual menu selection and keyboard input for every vehicle, assisted/manual controls, rescue/fire missions, and split-screen combinations. Fire captures use storm weather; manual captures use dusk. Run it alone, serially. A short outing may still be traveling toward the fire; inspect player positions/screenshots before attributing its cost to active firefighting. Use the longer capture to include attack effects.

`__game.metrics.snapshot()` reports p50/p95/p99/max frame, simulation, CPU submission and asynchronous GPU times; full-frame calls/triangles; resource counts; program count; quality changes; and CPU stage measurements. Stage costs can overlap (shadow work belongs to the first color pass), so do not sum them blindly. GPU timing is unavailable on some browsers; null is not zero. `__game.metrics.stop()` disables instrumentation and restores renderer counter behavior.

For a memory investigation, warm all animal types first, record the plateau, then repeat real mission changes, rescues and retirement. New cached textures/geometry are expected during first use. Private animal materials and props must retire; shared model geometry must survive.

## Further art and platform work

The first pass is not final art approval. Review all three vehicles at gameplay distance and in split screen, particularly the seaplane doorway/wing highlights, glazing in dusk/storm lighting, and the boat's window pillars. Full interior art, custom surface textures, authored multi-stage LODs and smooth vegetation transitions remain separate polish work. A glTF migration should prove a complete vehicle round trip and offline delivery before replacing the pack.

Integrated-GPU, mobile thermal behavior, cross-browser timing support, multi-hour sessions and subjective control/camera feel require additional device/player testing. The tools make those reviews repeatable; this machine cannot establish their results.

## Art review

```powershell
node tools/vehicle-shots.mjs --vehicle plane --light day,dusk,storm   # also boat, heli; --views door,cockpit
node tools/scene-shots.mjs --light day,dusk                            # each zone from above, mid range and the shore
```

Both use the real renderer at Best quality with the menu hidden, and write to `build/shots/`. In the browser console,
`__game.debug.pick(x, y)` names the object and material at a pixel of the menu camera's view, which is the quickest way
to find what a stray shape on screen belongs to.

October 2026 pass (all three vehicles and the scenery, reviewed close up, at play distance and in split screen):

- Seaplane: the hull is a flying boat's (vee bottom, chines, a crisp step, a tapered bow). The windscreen and side
  windows are panes with frames on the skin. The portholes are flush with metal rims, and the open door has a real
  cabin behind it. The fin is an aerofoil, and the rudder and elevators are separate models
  (`Vehicle_PlaneRudder`, `Vehicle_PlaneElevator`) on contract sockets that move with turns and climbs.
- Boat: recessed cabin glazing with pillars and seals, rounded collar ends, readable hull lettering, and cleaner outboards.
- Helicopter: its port-side lettering clears the fuel tank.
- Water contact: each hull in the water gets a foam line round its waterline and, when moving, a bow wave
  (`hullUniform` in world.js; waterlines are in main.js `HULL_WATERLINE`).
- Foliage: see-through texels keep the foliage colour (`bleedTex`), so distant pines and trees no longer go black.
  Pines are a little warmer and brighter, and beach sand ripples are shallower.
- `tools/build_models.py` now writes its baked shading to the absolute output folder. Before this, Blender saved those
  images somewhere else, so the helicopter, animals and base buildings kept 13 October shading after later shape changes.

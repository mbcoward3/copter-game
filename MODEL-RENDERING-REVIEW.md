# Model and rendering review

Reviewed October 24, 2026 against the working checkout, including its existing uncommitted changes. This is a review and implementation roadmap; game behavior and rendering code were not changed for it.

## Assessment

The game has outgrown the visual language of some of its assets. Its water, atmosphere, terrain materials, vegetation movement and environmental lighting establish a richer world than the vehicles' largely uniform painted surfaces and simple construction suggest. The right direction is believable, stylized realism: convincing silhouettes, construction, materials and motion, while keeping the friendly characters and clear player colors.

This is not principally a lack of polygons. The helicopter body already has 53,618 triangles. The larger issues are where those triangles go, material response, missing surface information, and the renderer's treatment of visibility, shadows and resource ownership. Improve one vehicle through the complete pipeline before rebuilding the whole asset library.

There is no evidence here that a new engine is necessary. The existing Three.js renderer already supports much of the desired result. Correcting its current pass structure and asset pipeline is a better first investment than a WebGPU migration.

## Evidence and limits

I inspected the source, Blender generators, packed asset metadata, the installed Three.js implementation, and current models drawn in Chrome. I built the game and used temporary local CDP probes. Those probes changed only browser state. The render captures reported no page errors.

The GPU timing probe used Chrome through ANGLE/D3D11 on an **AMD Radeon RX 6950 XT**, at **1440×900, device pixel ratio 1**, seeded with `20261024`. It loaded the ordinary page, started through the menu, paused at home, then sampled 45 frames after 15 settling frames per configuration. Timings use asynchronous `EXT_disjoint_timer_query_webgl2` queries. Renderer counters were accumulated across the complete composer frame, including shadow and reflection work, by disabling `renderer.info.autoReset` during capture.

| Paused home view | Median GPU time | Median CPU render submission | Draw calls | Submitted triangles |
| --- | ---: | ---: | ---: | ---: |
| Solo, Best | 5.44 ms | 2.00 ms | 513 | 1,145,647 |
| Solo, Fastest | 3.45 ms | 1.30 ms | 359 | 853,357 |
| Two views, Best | 6.26 ms | 2.60 ms | 837 | 1,296,944 |
| Two views, Fastest | 3.40 ms | 1.70 ms | 588 | 1,278,096 |

The split probe activated the already-created second helicopter and used the game's actual two-view rendering path. These are short, paused scene measurements, not live firefighting, sustained frame pacing, integrated-GPU results, or a full two-player gameplay benchmark. CPU submission excludes most simulation work. Submitted triangles include repeated passes and are not unique asset triangles. The roughly 7 ms frame cadence in this environment is not a portable FPS target. Fastest also changes visibility and shadow correctness, so the timing difference is not a pure reduction in resolution.

Separate close-camera probes reached approximately 1.8–1.9 million submitted triangles on Best. View composition matters significantly; a single FPS number would conceal that.

Asset metadata from `src/assets/models.bin`:

| Asset | Triangles | Material groups |
| --- | ---: | ---: |
| Helicopter body | 53,618 | 13 |
| Helicopter door | 1,732 | 3 |
| Rescue boat body | 17,752 | 9 |
| Seaplane body | 16,088 | 7 |
| Fishing boat / second fishing boat | 14,600 / 18,640 | 12 each |
| Animals | 4,080–6,192 | 7–8 |
| Life raft | 5,166 | 6 |

One mesh with multiple material groups still produces multiple draw submissions. The custom pack is about 3.87 MB compressed and 6.66 MB inflated; the built self-contained HTML was about 11.37 MiB. Asset size and rendering expense need separate budgets.

## Priority findings

### 1. Reflections currently change which objects cast the main view's shadows

**High priority, confirmed in code and runtime.** `SplitRenderPass` in `src/main.js:2926` marks the shadow map dirty, renders the reflection first, then reuses its shadow map for the main view. The reflection camera sees layers 0 and 2; detailed terrain and near plants are on layer 1.

In the installed Three.js r170, `WebGLShadowMap.renderObject()` tests object layers against the **rendering camera**, not just the sun's shadow camera. Enabling layer 1 on `sun.shadow.camera` therefore does not restore those casters. Instrumenting `onBeforeShadow` at home confirmed:

| Reflections | Shadow submissions from layer 0 | Shadow submissions from layer 1 |
| --- | ---: | ---: |
| On | 89 | 0 |
| Off | 89 | 12 |

Consequently the reflection optimization removes nearby vegetation and detailed terrain from the shadow map used for the main image. This can undermine grounding and make graphics tiers change the lighting unexpectedly.

**Fix:** establish a deliberate shadow update with the correct caster layers and caster visibility before either color pass. Reuse that result for reflection and main rendering within that viewport. Validate both players separately. Do not simply force another shadow update for every pass and accept the extra work as the final architecture.

### 2. Removed rescue props retain rendering allocations

**High priority, confirmed.** `buildRing()` in `src/models.js:102` allocates eight separate geometries and eight materials per ring. `updateSinking()` in `src/main.js:2189` removes expired props without disposing their owned resources. The animal departure paths similarly remove meshes with individually cloned animation materials. `createPortraits()` also creates animal materials without retiring them after readback.

A controlled test created and rendered 20 rescue rings with animals and beacons, removed those objects, and explicitly disposed the beacons as the existing game does. Renderer geometry counts were **202 → 382 → 362**. The remaining **160 geometries equal the eight ring segments per ring**. Shared animal geometry is intentionally cached; it should remain. Texture counts changed as previously unseen animal AO images loaded and are not proof of a texture leak.

**Fix:** define ownership. Cache shared geometry, textures and immutable materials; pool recurring props where practical; dispose private materials and private geometry when an entity retires. Do not recursively dispose every referenced resource, since that would destroy geometry and textures shared with other entities. Merge the ring into one geometry, with vertex colors or a texture carrying its stripes. Apply the same ownership rules to scene resets and portrait generation.

### 3. Main-camera visibility is being used as shadow and reflection visibility

**High priority for visual stability.** `world.cull()` in `src/world.js:1413` compacts vegetation and rocks according to the main camera's frustum plus a fixed 14 m margin. Those same lists serve the mirror and shadow passes. Objects outside the main image can still cast visible shadows or appear in the mirror. A fixed margin is not a conservative solution, especially with low sunlight and tall vegetation.

Near vegetation is also explicitly excluded from the reflection (`src/world.js:1343`). That is a deliberate quality compromise, but it means a nearby tree can have no matching reflection even at Best.

**Fix:** distinguish main, reflection and shadow visibility. Start with conservative unions or separate cached lists, then measure cost. Give reflections a cheaper representation of nearby trees rather than silently omitting them. Test objects behind the camera, at the screen edge, and against the water at low sun angles.

### 4. Shader animation does not carry into shadow deformation

**Medium priority, confirmed source mismatch.** Animal poses and foliage wind change vertex positions through `onBeforeCompile`, but those meshes have no corresponding `customDepthMaterial`. Standard shadow materials cannot reproduce that injected deformation. Waving animals and bending trees therefore cast their undeformed silhouettes.

**Fix:** share a small deformation function between surface and depth shaders, with the same uniforms. Use conservative animated bounds. If a distant tier intentionally uses a static shadow proxy, make that an explicit choice. Three.js documents this requirement in [Object3D's custom depth material documentation](https://archive.threejs.org/docs/api/en/core/Object3D.html).

### 5. Static scenery is repacked and uploaded for each viewport

**Medium priority; recurring cost is confirmed, best replacement needs measurement.** `world.cull()` rewrites matrices and colors for visible vegetation and rocks each view, then marks complete attributes dirty (`src/world.js:1437–1454`). There are no update ranges. In r170, `WebGLAttributes` uploads the entire attribute array when no ranges are supplied, even when `mesh.count` uses only its beginning.

In one home capture, changed instance buffers had about **330 KB of allocated capacity** against roughly **4 KB of active matrix/color prefixes**. That is one sparse view, not a global bandwidth estimate, but it exposes unnecessary work. Split screen repeats compaction and uploads; paused scenes do too.

**First improvement:** use dynamic buffer usage where appropriate, submit only changed prefixes, avoid updates when lists and fire tints have not changed, and cache membership until camera movement or LOD boundaries require a refresh.

**Larger improvement:** benchmark spatially bounded instance batches with persistent matrices, accurate bounds and per-cell LOD decisions. This trades additional draw calls for lower CPU compaction and upload costs. Do not automatically replace the current global batches with hundreds of tiny cells. Choose cell size from CPU/GPU measurements and retain the existing spatial buckets where useful.

### 6. Graphics quality combines too many expensive changes at once

**Medium priority.** `QUALITY` and `setQuality()` in `src/main.js:2703` change resolution, MSAA, reflection resolution/presence, shadow allocation, vegetation thresholds and bloom together. This obscures which cost actually caused a slowdown and can produce visible transitions and render-target allocation stalls.

For example, at device pixel ratio 2, Best → Good changes the main pixel ratio from 2 to 1.275: about **59% fewer main pixels in one step**, alongside a 4096 → 2048 shadow map and a reflection scale reduction. At DPR 1 the main resolution drop is smaller, so the same named tier has a different practical impact.

The frame-interval controller has useful smoothing and cooldowns, but a vsync-limited interval does not reveal spare GPU capacity. It also cannot distinguish simulation stalls, shader compilation, transparent overdraw and GPU saturation. Its saved setting has no screen-size or configuration context.

**Fix:** separate an artistic preset from a small number of runtime controls. Adjust resolution in restrained increments first when GPU-bound; adjust simulation scheduling or scene submission when CPU-bound. Use asynchronous GPU timing when supported, with a frame-interval fallback. Keep expensive shadow/MSAA reallocations infrequent. Add LOD hysteresis and a short dither transition, particularly for the current abrupt tree-to-lump change. Keep gameplay state independent of all quality decisions.

## Model polish

### Shared material language

`src/assets.js:98` already supplies clear-coated paint, image-based environment lighting and different roughness values. Preserve that foundation. The limitation is that most surfaces have uniform material properties, while their sole baked texture is grayscale AO. `wearBake()` uses that AO both to darken base color and to occlude ambient light, then adds brown grime (`src/assets.js:86`). This can make seams read as dirt regardless of what the material is or how it was used.

Add controlled base-color, normal and roughness information. Use clean painted panels, slightly varied paint roughness, rubber with a broader highlight, brushed metal where appropriate, cloth structure on the bucket, and restrained wear near handles, steps and the waterline. Put small panel lines, vents, fasteners and printed markings into textures or decals; reserve geometry for silhouette and meaningful relief. Give all hero assets comparable texel density.

The current Glass and Canopy materials are **opaque, dark, metalness 0.6** surfaces. This explains much of the toy-window appearance. Start with better window recesses, frames, Fresnel reflections and a simple dark cabin interior. Opaque glazing with a convincing interior illusion can remain the default. Reserve expensive transmission for shots that justify it; transparent glass everywhere would create unnecessary sorting and overdraw problems.

### Helicopter

The helicopter is the most developed hero and a good visual reference for construction detail, but it is also the most expensive body. Revisit nose/windscreen transitions, the cabin's relationship to the rotor mast and engines, wheel assembly detail, and the side doorway's actual depth. Refine highlight flow and bevels before increasing subdivision. Keep the recognizable rescue silhouette and player accent readable from the normal camera.

Audit the distribution of its 54k body triangles: lettering, tiny tubes and rounded fittings are candidates for baking or simplification. Create a close model, a normal-play model and a distant silhouette model rather than treating the existing mesh as the minimum at every distance. Use silhouette error at actual screen sizes as the deciding criterion.

Rotor animation needs a coherent speed-dependent blade/disc treatment for the main rotor and tail rotor. The tail disc is currently always translucent; the seaplane fades its dark propeller material but does not fade the separate Tip material in `updatePlane()`. Match the blur and tip behavior, avoid persistent full blade visibility at cruise, and inspect depth writing/sorting of overlapping transparent discs. Subtle mechanical motion will contribute more than extra tiny modeled fittings.

### Seaplane

This has the largest opportunity for shape refinement. The generated wings are beveled box panels (`tools/build_vehicles.py:91`), and the cockpit glazing is assigned by hull-coordinate tests. Improve the wing section and wing-root fairing, define a windshield with believable panes and framing, and give the engine nacelles convincing openings and transitions. Refine the hull step and keel so it visibly belongs on water.

The apparent open rescue doorway is assembled from a dark slab and a frame on the hull (`tools/build_vehicles.py:271` onward). Give it a real recess or opening, a visible sill, and a compact cabin interior. Passengers should look seated inside a space with depth. Add readable control-surface separation and restrained elevator/rudder motion tied to maneuvers.

### Rescue boat

The broad cabin, horizontal black glazing band, regular collar tube and simple outboard forms read as assembled primitives. Shape the forward windows and roofline, define the cabin door and window frames, vary the collar's cross section and segment seams, and give the hull a more convincing chine and bow/deck relationship. Concentrate hardware where it explains function: cleats, rail attachments, aft boarding space and motor mounts.

Improve water contact alongside the model: a bow wave that changes with speed, foam along the hull, a stern wake that follows the motors, and controlled pitch/roll. A modest model with convincing contact can feel more real than a detailed model sitting on the water without interaction.

### Animals, equipment and world props

Keep the animals stylized. Better eye placement/catchlights, eyelids, mouth expression, ear motion, seated poses and boarding animation would improve personality more than realistic fur. The current position-based shader selects body parts by coordinate thresholds; this is compact but increasingly brittle across different proportions. Add explicit part masks/pivots for simple animation, or introduce a small shared rig when poses become more involved. Bake fur color variation and consolidate their 7–8 material groups where possible.

The bucket, cannon, pump and gauges need the same bevel/material treatment as the vehicles. Add fabric folds and rim structure to the bucket, purposeful metal fittings and a readable nozzle; retain the existing working water level, scoop and valve behavior. The little mechanisms are already a strength worth polishing.

Buildings and boats should receive the same glazing and roughness treatment. Use a few stronger construction features, localized weathering and variation in repeated houses. Vegetation already has richer shading and motion, but its sparse far models and rounded far lumps need silhouette-preserving transitions. Bushes and palms should not simply disappear at conspicuous distance thresholds.

## Asset pipeline for expansion

The current format has virtues: deterministic assets, shared cached geometry, compact quantized data, and an offline single-file deliverable. Preserve those requirements explicitly.

Its limits are equally concrete. `tools/pack_models.py:214` selects only the first mesh from each imported file; the format retains no hierarchy, animation rig, named sockets or authored LOD chain. UVs are clamped into 0–1 (`:153`). Runtime positions and normals are expanded to Float32, so quantization currently saves distribution size more than GPU vertex storage. Simply exporting a richer multi-part asset would lose its structure.

Before producing many new models, choose either a versioned extension of this pack or a glTF-based intermediate/runtime path. A sensible incremental approach is to retain procedural Blender authoring, export a complete semantic hierarchy, and let the web build package assets for either hosted or offline use. Test a single vehicle round trip before changing everything. Mesh/texture compression should be measured against decode and startup cost rather than adopted automatically.

The model contract should carry:

- Units, forward/up axes, origin and bounds.
- Named parts and sockets: door hinge/slide, rotor, propeller, hoist exit, seats, cannon muzzle, scoop and drop doors.
- Separate render meshes, collision proxies and shadow proxies.
- LODs, material slots, texture channel/color-space definitions, and ownership metadata.
- Triangle, material-group, texture-memory and download budgets, reported by the build.

This removes the need to maintain related dimensions separately in Blender scripts, `models.js`, gameplay offsets and tests. Keep the flight and rescue collision/clearance envelopes stable while upgrading visual models.

Provisional budgets to test, not universal limits: 3–5 surface materials per hero, 1–2 for each animal, and three useful hero LODs. Judge triangle budgets after examining the helicopter's existing geometry and measuring a polished reference asset. A blanket percentage decimator is unlikely to protect windows, lettering and animal faces as well as an authored LOD.

## Rendering changes beyond the priority fixes

**Shadows:** after correctness, stabilize the moving sun projection to shadow texels to reduce shimmer. Allocate a detailed region around the player; use cheaper distant shadows where they contribute. Separate static and dynamic shadow work only if profiling shows it pays for its complexity. Two distant players need separate coverage; one huge shared shadow map is not an automatic improvement.

**Reflections:** retain the planar water reflection where visible, but use reflection-specific proxies, sensible distance limits and smaller render targets. Consider reduced update frequency for static scenery only after accounting for camera movement and reprojection; blindly reusing an old reflection makes it slide. A different update cadence for hero objects may be worthwhile later.

**Terrain and ocean:** the main land always uses a 2 m grid; only the mirror gets the coarse land. The ocean starts as a 320×320 grid, or 204,800 triangles, before tile culling. Investigate distance-based terrain index LODs and near/far ocean rings with seamless boundaries. Keep terrain collision sampling independent of visual LOD. These are plausible targets, but the current measurements do not isolate their GPU costs enough to justify replacing them first.

**Postprocessing:** the pipeline has HDR/MSAA targets, a full-resolution invalid-pixel scrub, bloom, output conversion and a separate grade. Bloom itself expands into numerous passes. Merge the scrub into an existing pre-bloom stage if practical, and combine the grade with final output while explicitly preserving color-space and tone-mapping order. Retain the scrub until the source of any invalid pixels is understood; do not remove a protective pass just to lower the pass count. Measure GPU time and bandwidth, since a fullscreen draw count alone says little.

**Fire and effects:** flame instancing and the shared particle pool are useful foundations. Fuel piles, however, allocate many separate box/cylinder meshes and materials (`src/fire-scene.js:38–58`). Share primitive geometry, instance fuel pieces by kind, and carry burn/wet state as per-instance data. Move purely visual analytic flame/smoke motion onto the GPU as incident size grows. Bound or spatially group effects instead of globally disabling culling. Smoke uses a hard-coded point-size scale of 650 (`:85`); give it the same viewport/FOV-dependent scale discipline as the shared FX material so changing quality or rendering a mirror does not change its apparent size unexpectedly.

**Simulation versus presentation:** `simulate()` invokes environmental visuals, particle updates and many material/transform updates on every simulation substep. Keep flight, rescue, water impacts and other authoritative logic there; move render-only interpolation and GPU buffer preparation into presentation once per rendered frame. This should not change mission outcomes or seed behavior. The current bounded substeps are useful; replacing the integrator is unnecessary for this review.

**Shader warmup:** keep asynchronous compilation and a stable light configuration. The stand-in lights and cached shader use address real compilation costs. Replace hidden warmup objects gradually with a declared variant/preload registry as the asset catalog grows. Measure time to first interactive frame and first-use stutters for each vehicle, fire effect, weather state and time preset. Broad startup compilation is not a substitute for lifecycle discipline.

**Delivery:** preserve the convenient offline HTML, but consider an additional hosted build with hashed JS/assets and independent browser caching. Inlining everything causes a small code update to invalidate model/audio delivery too, and makes startup decode work less flexible. Build both outputs from the same source and verify file:// operation for the offline artifact.

## Implementation order and acceptance

1. **Establish correctness and measurement.** Fix shadow layer/pass ownership, entity disposal/pooling and animated depth shaders. Add a development overlay or capture tool showing frame-time percentiles, simulation CPU, render submission CPU, asynchronous GPU time, full-frame draw/triangle counts, memory counts and quality changes. Validate reflection on/off lighting parity and offscreen casters.
2. **Polish one reference vehicle.** I would start with the seaplane because its silhouette and windows have the clearest improvement opportunities. Include the hull, glazing/interior, materials, propeller treatment, water contact, sockets and LODs in one complete vertical slice. Approve it at normal gameplay scale and in split screen, in daylight, dusk and storm lighting.
3. **Reduce recurring cost.** Add instance update ranges and visibility caching; measure cell batching; separate visual updates from simulation; instance fire fuel; tune independent quality controls. Compare equivalent images before claiming speedups.
4. **Expand the asset system.** Adopt the validated model contract for the helicopter, boat, animals and props. Add hosted asset delivery if startup/cache measurements support it. Revisit terrain/ocean LOD and broader renderer changes using the resulting profiles.

Suggested initial acceptance targets:

- Target 60 Hz as a first supported experience: p95 frame time within 16.7 ms on explicitly named representative hardware, with deliberate headroom for two-player firefighting. Record p99 and long stalls as well; an average alone is insufficient.
- No persistent growth in owned geometries/materials/programs after repeated rescue/retirement cycles and repeated mission resets, once intended shared caches are warm.
- No change in main-view shadow casters solely because water reflections were toggled.
- No obvious tree silhouette popping or missing edge-of-frame reflections/shadows in fixed camera sweeps.
- No first-use shader stall after loading the selected vehicle/mission configuration.
- Compare normal camera and split-screen results at DPR 1 and DPR 2 on integrated and discrete GPUs. Include a sustained session to reveal thermal limits.
- Preserve all existing gameplay and real-page regression checks when implementation begins. Run rendering performance jobs serially; the existing multi-worker play checks are useful functional tests but would contaminate GPU comparisons.

The review build passed. No simulation regression suite was run because this review did not change gameplay code. The measurements above do not validate live fire-mission performance, device coverage, long-session behavior, or the artistic result of the proposed model work.

Technical references: [Three.js renderer statistics and async compilation](https://archive.threejs.org/docs/api/en/renderers/WebGLRenderer.html), [custom shadow deformation](https://archive.threejs.org/docs/api/en/core/Object3D.html). Version-specific conclusions were checked against the installed r170 source, particularly `WebGLShadowMap`, `WebGLAttributes` and `WebGLRenderer`.

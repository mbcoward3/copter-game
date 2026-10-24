# Little Rescue Squad: review and development roadmap

Reviewed October 20, 2026, at commit `cbac08bf9b1d0b31c28fef01baf479a31159cb4b`.

## Direction

Build a wonderful rescue world that a three-year-old can operate with one held button. The complexity belongs in the navigation, animation, characters, audio, and world simulation. It must never become a requirement for the child to manage.

The game already has substantial breadth: three vehicles, six regions, eight mission slots, ten animal species, numerous rescue situations, firefighting, weather, day/night lighting, split-screen cooperation, gamepad input, recorded audio, ambient wildlife, and adaptive graphics. Its next leap should come from making those systems reliable, expressive, and connected. More mission counters or vehicles would currently have less value than a memorable, beautifully staged rescue.

The central experience should be: **I make my rescue machine go. My friend needs me. I help them. They are happy to see me again.**

## What I checked, and the limits of the evidence

- Read the game flow, all menu and HUD copy, vehicle assistance and physics, rescue/boarding/delivery systems, mission spawning, fire systems, camera, world layout, models/materials, effects, wildlife, audio runtime and packing pipeline, build/server/container/deployment configuration, README, and existing soak test.
- Built the current checkout successfully: the standalone HTML is approximately 10.5 MiB. Opened the original built game in headless Chrome; no JavaScript page errors were reported during that smoke test. Inspected rendered menu and opening-game screenshots, custom-camera daylight overview renders of all five outlying regions, and a forest fire close-up.
- Ran a 24-scenario simulation: three vehicles × six normal regional missions plus two fire missions. Forward stayed held throughout; the harness did not steer or release it at home. Each scenario had a fresh game and up to approximately ten simulated minutes to advance to the next mission. **23 advanced; one Home Bay helicopter run stalled.** All eight boat scenarios and all eight seaplane scenarios advanced; seven helicopter scenarios advanced.
- Five additional seeded Home Bay helicopter runs completed. This confirms the stall is conditional; these small samples do not establish a production failure rate.
- Reproduced the helicopter obstruction on the **unmodified original built game**: place a raft at `(32, 93)` and the helicopter at approximately `(-80, 15, 44)`, facing it, then hold forward. The helicopter remains at approximately `(-80.125, 14.95, 43.705)` from ten through sixty simulated seconds. It is caught at the sea arch's protective obstacle boundary.
- Measured the HUD at widths 1440, 1024, 768, and 480. The mission display overlaps the controls at 1024 and below, even with the first mission's five slots.
- Decoded all **45 MP3 files** successfully in the browser and measured duration and signal levels. Together they contain about 176.4 seconds of audio. Highest individual decoded peak was about -0.1 dBFS; that does not prove the combined mix is balanced or free of overload.

The matrix used the existing gameplay code and `debug.run`, with drawing, animation-frame scheduling, and initial shader warm-up disabled in a separate test-only HTML. The original build was separately loaded and used for the obstruction reproduction and regional renders. This is gameplay simulation coverage, not frame-rate benchmarking, complete visual QA, or proof of continuous campaign reliability. Missions were entered through the debug selector. Random spawns were not exhaustively covered. I did not conduct a human listening session, test physical controllers/tablets, or observe a child playing. Regional overviews establish layout and art direction; close-up interactions, night/weather combinations, and split-screen visuals still need dedicated visual QA.

Evidence and disposable harnesses are in ignored `build/review/`: `hold-forward.json`, `seeded-home.json`, `obstacle-repro.json`, `layout.json`, `audio-stats.json`, `menu.png`, and `flight.png`.

## 1. Protect the one-button promise first

### Confirmed blocker: the helicopter can fly into an endless obstruction

The easy helicopter points straight toward a goal in `src/main.js:388`. Later, obstacle handling projects its position outside a circle (`src/main.js:425`). It does not plan a route around that obstacle. At the sea arch, its desired movement repeatedly pushes it back against the same boundary. The child can hold the correct button indefinitely and receive no progress.

Give every vehicle a shared navigation contract with vehicle-specific routes:

1. Choose a reachable job and reserve it.
2. Plan a safe route to an appropriate approach point.
3. Approach, stabilize, and complete the interaction.
4. Depart safely, then return or select the next job.
5. Detect lack of **task progress**, not just lack of movement, and recover.

The boat already has local shore avoidance and a short reverse recovery; that is useful groundwork. Extend it to route planning rather than accumulating special cases. Use a water navigation graph or grid with hull clearance, connected-water checks, and explicit channel/berth links. Helicopters can use an obstacle-aware route with altitude clearance; seaplanes need water approach and takeoff corridors as well as flight paths. Local collision avoidance should sit beneath the route planner.

A recovery system should handle circling, unreachable targets, conflicting claims, blocked boarding, and repeated failed approaches. Try another approach, rise or reverse as appropriate, release/reassign a target, or use a friendly guided reposition as a final fallback. Prefer a believable recovery animation to a visible teleport. Never leave recovery dependent on a second button.

### Specify the actual control contract

- Holding go always enables progress through takeoff, travel, pickup, landing, unloading, water collection, firefighting, celebration, and departure.
- Releasing go gives a gentle, safe rest. It must not create danger or erase progress.
- Steering is optional and immediately respected. Assistance should explain itself visually and return smoothly when steering stops.
- A small accidental key press should not leave persistent altitude, reverse, or mode changes that defeat assistance. Offer a child control preset that ignores unrelated keys and avoids conflicting simultaneous inputs.
- A parent joining, leaving, changing vehicle, or pausing must not strand a child, orphan a claimed rescue, lose an incoming passenger, or reset the mission.
- Spawn jobs that the current team can reach. Current vehicle filters are a good start, but a valid spawn point also needs a valid approach and departure route.

Treat these as invariants in the simulation. The current `tools/soak.js` steers the helicopter itself and releases forward near home, so it does not validate this product requirement.

## 2. Make helping someone the main event

The game has many kinds of rescue, but most feed the same count and the same celebration. Make each rescue emotionally legible before adding more categories.

### Characters

Give recurring animals names, distinctive silhouettes, facial expressions, a recognizable vocal signature, and a small reason for being out in the world. A bunny's kite has drifted away; a penguin's picnic float is stuck; a puppy needs a lift from a lighthouse visit. Present the immediate objective through a picture and a short optional spoken line. Avoid long backstories or urgent distress that can become tiring.

Create a consistent animation language: notice the vehicle, wave, anticipate the basket/ring, board, settle into a seat, look at the pilot, wave on arrival, reunite, and return to an activity. Current animals mostly hop, rotate, and wriggle whole meshes. Character rigs, expressive faces, and authored clips would be a major quality improvement.

### Rescue presentation by type

| Existing system | What feels underdeveloped | Next improvement |
|---|---|---|
| Helicopter basket | Riders remain attached to the external basket throughout transport | Hoist up, transfer into cabin seats, show passengers through the open door/windows, stow the empty basket, then unload clearly |
| Landing-site pickup | Correctly automates landing, but needs a clearer arrival/departure beat | Friend waits visibly clear of the pad, waves, climbs through the door, buckles in; holding go continues after boarding |
| Boat life ring | A strong distinctive interaction already exists | Show a crew member throw it, the friend grab it, the tow line tension, a safe climb aboard, and a happy deck pose |
| Seaplane pickup | Taxies and waits for a swim; menu still describes skimming past | Stage a readable water approach and stop, float-side boarding, then a satisfying takeoff run |
| Raft/ring/kayak/capsized dinghy | Different props often resolve identically | Add one clear physical detail per situation: holding a ring, securing a paddle, stepping from a raft, recovering a favorite object |
| Ship/wreck/roof/ledge rescue | Good landmarks and multi-friend opportunities | Stage the queue, show who is next, give each pickup a clear silhouette, and finish with a wave or restored activity |
| Fire rescue | Collection, water load, damage, and completion are mostly implicit | Show an unmistakable fill state, water release, shrinking fire footprint, cooling/steam, and the friend's grateful response |
| Home delivery | Animals arc and flip into a grid | Add a dock/pad reception animation, greeter, reunion, and a visible safe home or activity |

Keep the child in control of go throughout. Short camera emphasis should help them see the result without repeatedly cutting away or demanding confirmation.

### The first session

Author an opening rescue rather than selecting it randomly. Start in good daylight with one highly visible friend close ahead and an obstacle-free route. Demonstrate go with a large animated key/button image. Use a warm optional line such as “Hold go. Let's help Bunny.”

Aim initially for a first meaningful rescue event within roughly 20–30 seconds and a complete short outing within a few minutes, then tune those targets from observation. The regional test runs often did not register a delivered friend until 50–90 simulated seconds. That can contain worthwhile pickup activity, but the child needs visible recognition before the delivery count changes.

A simple picture sequence—friend needs help → friend aboard → friend home—would clarify progress better than additional text. Never make reading the radar necessary.

## 3. Turn the regions into memorable places

The regions already differ geographically and in spawn types. Give each a signature character, recurring activity, local sound, staged rescue, optional interaction, and visible improvement after helping.

| Place | Build on | Make it memorable with |
|---|---|---|
| Home Bay | Base, lighthouse, sea arch, beach, lagoon huts | Returning friends greet the pilot; lighthouse keeper waves; successful rescues populate a living home base; safe honk responses |
| Pine Forest | Lake, fire tower, clearing, camp | Ranger character, campsite reunion, clear lake approaches, distinct forest ambience; a fire story whose recovery leaves a healthy-looking site |
| Coral Reef | Cays, reef, wreck | Visible shallow-water wildlife, a recurring boat crew, clear navigable channel markers, a wreck rescue staged as an expedition |
| Harbour Town | Roofs, breakwater, fishing boats | Working harbor characters, arrival/departure traffic, a fixed welcoming berth, boats visibly repaired after help |
| Snowy Peaks | Mountains, ski hut, floes, penguins | Penguin family, sheltered landing cove, warm hut reunion, snow-specific sound and gentle weather; strong contrast for animals against snow |
| Volcano Isle | Crater, black sand, terraces, fires | An island ranger or research crew, readable smoke vs mission-fire silhouettes, warm rock lighting, a safe lookout celebration; test boundary/altitude conflicts near the world edge |

Current progression cycles the eight mission slots and later increases the required friend count up to eight (fires up to five). That increases repetition more than discovery. Introduce new combinations, authored episodes, character relationships, world changes, and optional detours instead. Keep a short-outing option and let a parent or child revisit favorite places through a picture map.

The regional renders show useful silhouettes already: the forest ring and lake, the reef lagoon and wreck, the harbor's colorful roof cluster, the snowy mountain pair, and the dark volcanic cone. They also reveal where environmental storytelling can grow. Harbour Town needs a legible street/path/public-space structure around its house cluster. Snowy Peaks needs a readable destination and activity around the mountain scenery. The reef needs close-up life and discoveries to make its large water areas rewarding. Shorelines share a strong turquoise/foam band; vary coastline treatment by biome and viewing distance so places feel materially different. Foliage also needs a common style across rounded canopies, conical pines, and fine palm leaves.

Long return trips from far zones should earn their duration through scenery and passenger interaction. Local rescue stations or temporary regional drop-off points could reduce empty travel while preserving the home base for larger reunions.

Fire spawning currently falls back to Home Bay after repeated failures in the intended region. It prevents one kind of stall, but can undermine the mission's location and send vehicles on unexpected long trips. Validate regional mission layouts ahead of time and select a reachable authored alternative in the same story.

## 4. Make the art coherent and the action readable

The modeled vehicles, geography, reflections, waves, lights, and effects are substantial existing assets. The next art pass should establish a deliberate visual style and hierarchy.

- **Choose a style guide.** A polished miniature rescue world fits the existing foundation. Define proportions, character scale, materials, palette, shape language, lighting, iconography, and animation timing. The screenshots mix detailed photographic ground/rock textures, simpler foliage, modeled vehicles, flat UI, and OS emoji. Make those feel designed together.
- **Prioritize silhouettes and faces.** The child should recognize the animal and the action at normal camera distance. Spend art effort on expressive characters, vehicle doors/cockpits, baskets, floats, rings, and the home base before background detail.
- **Replace most emoji with matching game art.** Use portraits of the actual models for passengers, mission progress, stickers, and rescue markers. Current emoji do not visually match the characters and vary by platform. Keep symbols consistent across world, HUD, and collection book.
- **Tune water detail.** The opening screenshot has a large field of high-frequency wave detail competing with small rescue targets. Preserve beautiful water while making the important friend, route, and interaction stand out through composition, contrast, and calmer local detail.
- **Create a target hierarchy.** One current job gets the strongest cue. Future jobs get quieter cues. At close range, replace the fading beam with a readable portrait/interaction marker so help remains understandable after the column disappears.
- **Stage the camera by task.** Travel, approach, winch, boarding, firefighting, and delivery need different compositions. Frame vehicle + friend + connection point. Account for the helicopter's side door and cable; avoid keeping the action hidden behind the tail or terrain. Maintain smooth transitions and respect optional steering.
- **Make lighting support play.** Night, sunset, storm, smoke, and bloom should keep faces and targets legible. A child-friendly setting can cap darkness and weather intensity. Add reduced shake/flashes and quieter celebrations.
- **Make effects explain state.** A filling bucket needs visible rising water; tank readiness needs a clear non-text cue; each drop should visibly reduce the fire. Use hearts/confetti selectively so the event reads before its decoration.

The captured forest fire currently reads as a cluster of bright soft orange spheres beneath a smoke plume. Replace that generic particle silhouette with a clearer grounded flame body, varied flame shapes and heights, a defined burning footprint, and cooling stages. Keep the waiting friend's face readable and visually separated from the fire; in the close-up, the fire and beam dominate the tiny character beside them. Better effect art and staging would improve both quality and comprehension.

A more elaborate renderer is reasonable once these choices exist: improved sky/clouds, better coastline shading, contact shadows, local fog, richer vegetation, and authored lighting. Validate each on the target laptop and split screen. The current adaptive graphics system, culling, shader warm-up, and lighter reflection geometry are valuable work to preserve.

## 5. Give audio a deliberate hierarchy

Recorded engines and world sounds are a meaningful foundation. There are currently six vehicle layers, four environmental loops, and 35 one-shot/music files. All decode successfully. Runtime/source findings below are confirmed; judgments about pleasantness, startling sounds, repetition, or mix quality require listening on the actual speakers/headphones.

### Fix the runtime first

- `src/life.js:10` initializes `ears = []` and never assigns the active players. Distance-based `hear()` returns zero, silencing the dolphin and whale splash events routed through it.
- `src/audio.js:59` creates a looping layer for **every audio file for each player**, including applause, animal calls, and one-shot jingles. With 45 files, that is 90 per-player looping sources plus four ambience sources after decode, although only six engine layers per player are controlled. Build only the needed engine loops; play one-shots on demand. This is unnecessary graph/resource work, even where the browser optimizes silent gains.
- Pause stops the block containing `audio.setEngine` and `setAmbient` (`src/main.js:2405`). Existing audio nodes continue at their last values instead of receiving a pause transition. Connect pause/focus state directly to audio buses; decide explicitly what ambient bed remains.
- `CALLS` covers six of ten animals. Bunny, panda, fox, and penguin have no assigned vocal response. Give each an appropriate gentle character sound; real zoological calls are not necessary for recognizable fictional personalities.
- Add a single AudioContext failure/recovery path, including interrupted/suspended contexts, device changes, and delayed decode. A missing clip should not interrupt gameplay, but should be visible in diagnostics.

### Mix and content pass

Create separate engine, environment, character, UI/celebration, music, and optional voice buses. Briefly duck engines and weather for a friend's voice or a rescue confirmation. Limit overlapping horns and repeated calls, and add cooldowns/priority rules across both players. Use positions for world events and a stable convention for split-screen listening.

Provide a master volume and simple parent sound settings, remember them, and offer a gentle sound preset that softens ship horns, alarms, fireworks, and applause. The horn can remain a rewarding toy. Avoid repeated large celebratory bangs overwhelming every success.

Add a small, coherent musical language: quiet location ambience, an anticipatory rescue phrase, a warm pickup acknowledgment, and a resolved homecoming. Long continuous music is optional. A few clear, recorded voice prompts can replace reading; avoid verbose narration and overlapping prompts.

### Complete existing sound inventory and polish targets

| Files / families | Role | Specific review target |
|---|---|---|
| `heli_idle`, `heli_fly` | Rotor/engine layers | Startup, shutdown, ground/air crossfade, hover vs loaded flight, loop transitions |
| `plane_low`, `plane_high` | Piston/prop layers | Water taxi, takeoff power, flight, landing; transitions should agree with visible throttle/prop |
| `boat_engine`, `boat_water` | Motor and bow-water layers | Acceleration, idle, reverse, stop, hull airborne; avoid water rush continuing through a stationary rescue |
| `sea`, `wind`, `rain`, `fire` | Environment | Distance and weather balance; fire attenuation currently horizontal; make camera/vehicle perspectives coherent |
| `splash_small_1..3`, `splash_big_1..3` | Water events | Differentiate ring entry, scoop, bucket fill, landing, dolphin, whale; fix missing wildlife output first |
| `horn_1`, `air_horn_1`, `ship_horn_1` | Vehicle/world horn | Gentle preset, overlap limits, duration/cooldown relationship, world-distance treatment |
| `beep_1` | New rescue | Friendly call cue with visual equivalent; avoid sounding like repeated failure/urgency |
| `door_1`, `winch_1` | Mechanical actions | Synchronize to movement duration; a single one-shot should not imply a long moving winch has stopped |
| `hiss_1` | Fire cooling | Match water impact, diminishing fire, and steam; limit repeated overlap |
| `dog_1`, `cat_1..2`, `chick_1..2`, `pig_1`, `sheep_1..2`, `frog_1..2` | Character calls | Match size/personality, loudness and event; add four missing character signatures |
| `laugh_1` | Friendly vehicle bump | Check emotional fit and repetition; give a visible cause |
| `chime_1` | Home/help completion | Make pickup vs delivery vs fire completion distinct but related |
| `applause_1` | Mission complete | Leave room for friend voices and music; avoid repeated crowd noise becoming the whole reward |
| `jingle_start_1`, `jingle_done_1` | Mission transitions | Consistent musical palette; add measured variety and smooth interruption handling |
| `firework_1..4` | Celebration | Gentle alternative, synchronized visual/audio position, overlap cap |
| `gull_1..3` | Wildlife | Natural spacing, distance, variation, and priority below characters |
| Synthesized touchdown thud | Soft landing | README currently says every sound is recorded; make documentation accurate |

Keep exact source, attribution, and modification information with assets and expose a small Credits page from parent settings. The README and packing script already contain source information; preserve it as the library grows.

## 6. Rework the interface and every visible instruction

### Opening and pause screens

The current screenshot is readable for an adult, but it presents two pilot cards, six vehicle buttons, four flight-mode buttons, control tables, and a long explanatory paragraph before play. The primary buttons are above the choices, and both pilot cards appear even for solo play.

Use a child-facing opening: one large Play/Continue button, a large actual vehicle preview, optional vehicle pictures, and a parent-settings entry. Reveal the second pilot's setup only when needed. Demonstrate holding go with animation. Allow a parent to remember a preferred setup and restart directly into it.

Pause should make **Keep playing** the obvious action and distinguish changing setup from starting a new outing. Add a clear return-to-map/home choice and persistent resume. Hidden menus should be inert and removed from keyboard focus, not merely transparent.

### HUD

The current friend-face progress slots are a good direction, but there are multiple empty dashed-slot systems: three cargo boxes, five to eight mission circles, and a numerical rescue tally. Reduce competing counters. Use actual portraits, explicit aboard/home states, a large current-objective cue, and a quieter optional radar.

Move the six adult controls behind a compact settings button. Confirm responsive layout for long missions, split-screen, large text, narrow windows, and tablet sizes. At 1024×800, the first mission extends to x≈656 while controls start at x≈609: the overlap is measurable, not just a design preference.

Do not rely exclusively on red/blue, yellow/green, or fire color. Pair colors with character/vehicle/shape identity. Add descriptive accessible button names and selected-state semantics; test keyboard focus order and controller menu navigation. Touch gameplay currently has no go control; a tablet version needs a large hold area with pointer capture and safe cancellation on interruption.

### Wording corrections and proposed replacements

| Current wording | Problem | Suggested direction |
|---|---|---|
| “Helicopter Heroes” | Seaplane and boat have equal prominence | Make “Little Rescue Squad” the main identity; keep Helicopter Heroes only if helicopters are intentionally the focus |
| “1 Pilot / 2 Pilots” | Understandable to adults but an abstract entry choice for a small child | “Play” plus “Play together,” supported by one/two character pictures |
| “Easy flying” | Also labels a boat | “Little Pilot” or a simple assistance icon; explain assisted controls in parent settings |
| “Pilot” | Does not tell a parent what changes | “Manual controls” in adult settings; retain a friendlier visible label if desired |
| “Just fly! Everything stays up by itself.” | Boat mismatch; does not explain the held-button promise | “Hold go to help your friends.” |
| “Fly to a golden light beam” | Describes steering work that assistance can handle; depends on reading | Show the current friend and a gentle route cue; parent help: “Hold go. We help with steering and rescues.” |
| “the seaplane skims past” | Implementation lands and taxies for boarding | “The seaplane lands beside your friend.” |
| “Higher / lower keys work on both machines” | There are three vehicles; boat ignores height | Remove from child instructions and show only relevant optional controls |
| “Nothing can go wrong” | Overpromises while stalls exist | “Your crew will help you.” |
| “no autopilot” in manual-mode description | Some automatic pickup/safety/drop behavior remains | Explain the actual manual controls and retained assistance in parent help |
| “Rescue 9” in solo HUD | Unexplained callsign replaces Red | Show the selected pilot/vehicle identity, or introduce this callsign deliberately |
| “Help 5 friends ... fly them home” | Boat mismatch; quantity may imply work before reward | Use pictures and “Let's bring our friends home.” |
| “Put out 3 fires” | Count is clear to adults but not a whole story | “Let's help the forest friends,” with fire/water progress pictures |
| “Everyone in [place] is safe” | Current mission generated a quota, not every resident | “Our friends are home!” or a story-specific completion line |
| Teamwork banner with per-player totals | Totals accumulate across missions and imply comparison | Celebrate the shared mission result and both pilots together |
| “Greased it,” “Firm one!,” “Snatched it!” | Aviation idioms and evaluative tone | Fine as optional adult flavor; keep child-facing praise concrete: “Soft landing,” “Friend aboard,” “Home safe” |
| Emoji-only corner buttons and tooltip sticker names | Meaning depends on hovering/reading/platform glyphs | Illustrated icons, accessible names, optional spoken labels, visible collection context |

README/manual cleanup: distinguish held-forward assistance from optional steering; correct “both machines”; align plane/manual control explanations with actual behavior; explain boat auto-throw vs optional winch-key throw; include controller mappings and unsupported touch limitations accurately; acknowledge the synthesized touchdown sound.

## 7. Give progress an emotional purpose

Stickers persist, but they are small symbols on the menu, and the game does not save the active mission, passenger story, vehicle preferences, or world progress. Refreshing loses the outing.

Build a real picture-based rescue book: portraits of friends met, places visited, favorite moments, and large collectible scene stickers. Award small recognition for the first rescue immediately; do not make the child finish a five-friend quota before seeing a lasting reward.

The strongest long-term feature would be a **living rescue base**. Friends return to a playground, picnic, garden, dock, or clubhouse. Helping changes what they do there. The child can revisit them and see the consequence of earlier play. Use new scenes and cosmetic customization as rewards without changing the one-button baseline.

Add named save slots or simple local family profiles only when useful, with versioned saves and graceful recovery. Provide a short-outing mode and an obvious stopping point: a team photo/postcard, a wave goodnight, then Continue next time. Avoid streaks, pressure, penalties, or chores disguised as progress.

## 8. Make cooperation feel like a rescue squad

Split screen and mixed vehicles are valuable foundations. Build complementary, forgiving contributions: one pilot spots or reassures a friend while another lifts; a boat welcomes a seaplane; both help at a fire. Any mission must remain completable solo, and an idle or disconnected parent must not block the child.

Show partner identity and shared intent clearly. Maintain robust job reservations and release them on departure, vehicle change, cancellation, or timeout. Audit incoming passengers when a pilot leaves: current `setP2` handles cargo and targets but does not explicitly resolve every boarding state. Treat this as an edge-case risk requiring a focused test, not a confirmed data-loss bug.

Give a parent optional behind-the-scenes tools: join/leave, guide toward a favorite area, select a short mission, reset a blocked approach, adjust sound/weather, and end at a satisfying moment. Keep these away from the main child interaction.

## 9. Engineering worth investing in

The current ~2,500-line `main.js` coordinates physics, assistance, mission generation, UI, camera, sound, and rendering through overlapping flags and arrays. It has been productive, but much richer behaviors will become harder to reason about without a clearer simulation boundary.

Recommended foundations, built incrementally:

1. **Typed domain model and explicit state machines.** Separate navigation intent, vehicle motion, rescue interaction, mission state, and presentation. Represent job states such as approach, stabilize, collect, board, depart, deliver, recover. Give target ownership and cancellation one implementation. TypeScript and runtime assertions would help; a full ECS is optional rather than a prerequisite.
2. **Fixed-step deterministic simulation.** Seed gameplay randomness, separate cosmetic randomness, and decouple simulation time from rendering. Capture inputs and state transitions for replay. Existing `debug.run` is useful groundwork, but approximate frame stepping and shared `Math.random` do not provide stable regressions.
3. **Data-driven missions with validation.** Describe cast, region, approach routes, rescue beats, water sources, drop-offs, and vehicle compatibility. Validate route connectivity and mission completion assumptions before shipping. Keep a curated first-play path and controlled variations for replay.
4. **Navigation and progress recovery.** Build the route and task-progress layer described above. Draw goals, collision clearance, approach corridors, ownership, and recovery reasons in a development overlay.
5. **Presentation from events.** A friend boarding produces character, camera, sound, UI, save, and world-reaction events. Do not make a successful animation callback the sole owner of gameplay progression. Presentation should tolerate interruption and resume.
6. **A proper animation system.** Rigged characters, authored clips, inverse-kinematics/contact adjustments where useful, attachment points, doors, seats, ropes, and synchronized effects. Keep physics simulations bounded and predictable for child mode.
7. **Asset lifecycle and budgets.** Pool frequently spawned props, beams, particles, and characters; dispose only owned GPU resources when retiring objects. Existing geometry/material caches and sprite-material disposal help, but many removed rescue objects own geometry/materials that are not explicitly released. Verify long-session memory rather than assuming scene removal frees GPU allocations.
8. **Save and settings model.** Versioned local saves, resume, sound/comfort/control preferences, migration tests, and recovery from invalid or unavailable storage. Keep basic play possible without storage.
9. **Loading and resilience.** Show genuine progress while assets and shaders prepare; handle WebGL context loss and audio interruption. Retain the excellent offline single-file build; consider a separately optimized hosted build with cacheable assets and compression. Current nginx configuration does not enable gzip/Brotli itself; verify the actual ingress before claiming production delivery is uncompressed.
10. **Focused release checks.** CI should build, validate assets/mission data, run deterministic hold-go regressions, exercise save compatibility, and smoke-test the built artifact before deployment. Capture the failing replay automatically. A screenshot and FPS/memory harness should complement, not substitute for, simulation tests.

There are also timing details to clean up: mission celebration uses wall-clock `setTimeout` for emoji while simulation pause uses game time, so presentation can continue spawning during pause. Pause/background behavior should be designed across all systems together. Blur currently clears keys but does not automatically pause the outing.

### Acceptance gates

These are proposed product targets, not claims about the current build:

- Every authored child-mode mission completes with one continuously held go input for every supported vehicle/team configuration.
- Test at least 100 deterministic spawn/layout seeds per relevant mission configuration; retain every discovered failure as a named regression. A target of no unrecovered stall is more useful than an average rescue count.
- Detect a blocked task within a few seconds, then recover visibly and gently. Measure distance along route, approach completion, boarding progress, and delivery progress; circling must not count as success.
- First meaningful rescue feedback within roughly 20–30 seconds; a short complete outing in a few minutes. Tune with the actual child.
- A child can identify who they are helping and whether that friend is aboard/home without text, sound, color alone, or radar interpretation.
- Pause, blur, controller disconnect, changing vehicles, and joining/leaving cannot orphan a job or passenger.
- Validate layout at 1024×768 and representative phone/tablet sizes if those are supported, including eight-goal missions and split screen.
- Establish frame-time and memory targets on the actual target machines. Aim for consistently smooth play, including first rescue, first fire, weather changes, and two players. Headless software-renderer timing is not evidence of laptop GPU performance.
- Run a long session covering repeated missions and vehicle changes while tracking GPU resources, active audio sources, live jobs, and saves.

## 10. An ambitious build order

### Milestone A: the dependable foundation

Fix the arch stall and build obstacle-aware routes plus recovery. Correct wildlife listeners, audio layer creation, pause audio, and narrow HUD layout. Add deterministic held-go regressions and focused join/leave tests. Save settings and the current outing. These are the foundations for the experience already promised.

### Milestone B: one exceptional rescue

Choose Home Bay, helicopter, one named animal, one short authored story, and one reunion at base. Build a matching art/UI style, expressive character rig, complete cabin boarding, task-aware camera, mixed audio, optional voice, immediate sticker/postcard reward, and an excellent opening screen. Holding go alone must finish the entire experience. Test it with the child before expanding.

This slice should set the quality bar for everything else. It is not a disposable demo; its character, mission, animation, audio, camera, and save foundations become reusable production systems.

### Milestone C: apply the same quality to the other machines

Create a signature boat rescue and seaplane rescue with their own approach/boarding/departure choreography. Build a fully legible fire story across all three vehicles. Exercise mixed-vehicle cooperation. Do not simply reuse helicopter timing and call the vehicles finished.

### Milestone D: a living world and lasting reasons to return

Develop the rescue base, character relationships, collection book, picture map, short outings, persistent world changes, and authored regional episodes. Revisit each existing rescue location with this production standard. Expand interaction density and memorable stories before expanding map size.

### Milestone E: premium presentation and platform polish

Deepen animation, lighting, weather, sound/music variation, wildlife reactions, cinematic composition, accessibility, controller menus, touch if desired, and hardware-specific performance. Add offline/install conveniences and robust production diagnostics as needed. Further vehicles and regions become worthwhile once they add distinct stories and interactions.

### Features with the highest upside

1. Named expressive friends with recurring relationships and homecoming scenes.
2. A living base that visibly reflects past rescues.
3. A complete, reliable assisted route/interaction system.
4. A small library of excellent rescue stories with controlled variations.
5. A real picture book and favorite-place map.
6. A world that responds to optional honking, low passes, arrivals, weather, and returning friends.
7. Friendly parent-child cooperation that remains optional at every step.

Large map expansion, online multiplayer, fuel management, vehicle damage, mandatory precision challenges, elaborate inventories, competitive scores, and escalating quotas should wait. They can consume enormous engineering effort without strengthening this child's core experience. A separate adult manual mode can grow later without changing child-mode completion requirements.

## Recommended next implementation

Start with **reliable assisted navigation and a beautifully finished first rescue**. The arch reproduction should become the first regression. The first named animal's full rescue-to-reunion sequence should become the first quality benchmark. Those two investments turn the existing breadth into something that feels intentional, trustworthy, and worth returning to.

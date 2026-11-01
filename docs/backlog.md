# Backlog

The one place for agreed future work, known gaps and leftovers: add here rather than in a new file. Started
2026-10-26 as a running list of changes agreed in design discussions. Most of these are new features for the
whole game. The **For** column says who each one is aimed at:

- **Everyone:** both assisted (toddler) and Pilot mode get it. Assisted mode keeps its autopilot and gentleness, and
  the feature works quietly around it.
- **Pilot:** only matters when you are flying yourself.
- **Both, different:** both get it, tuned differently (gentle and forgiving in assisted mode, felt in full in Pilot).

Status: **idea** (agreed worth doing, not designed), **designing**, **building**, **shipped**, **parked**.

Per `AGENTS.md`, every item gets a version for the helicopter, the seaplane and the boat (and the land vehicle once
it exists), or a note on why it does not apply.

## 1. Flying controls

| Item | For | Status | Notes |
|---|---|---|---|
| Smoother, more responsive handling for all three machines | Pilot | idea | Today: tilt eases in slowly (`damp 3.2`), letting go brakes hard, the collective is a climb rate that holds height hands off. Feels floaty and on/off. |
| Analog everywhere | Pilot | idea | Gamepad sticks and triggers give fine control; keyboard needs eased ramps so taps are precise. |
| Complete helicopter controls | Pilot | idea | Proper collective feel, momentum carried through turns, nose and disc doing what a pilot expects; extras (lift from forward speed, ground cushion) only if they feel good. |
| Complete seaplane controls | Pilot | idea | Real takeoff run, rotation, banked turns, flare and touchdown; slow flight that mushes rather than snapping. |
| Complete boat controls | Pilot | idea | Hull momentum and slide, throttle and steering that feel like a boat, not a car. |
| Camera that helps precise flying | Both, different | idea | Chase camera with lag and look-ahead, a view down for the winch/basket. |

## 2. Physical mechanics: the world responds to how you fly

| Item | For | Status | Notes |
|---|---|---|---|
| Rotor wash / prop wash / wake push the world | Both, different | idea | Heli downwash flattens water, bends trees, blows smoke, fans fires, pushes swimmers. Seaplane prop wash and wake rock small boats. Boat wake rocks the stricken boat and swamps swimmers if you come in hot. Assisted: visual, never harmful. |
| Winch basket and bucket swing as a real pendulum | Both, different | idea | Stop sharp and it swings on; you damp it. A heavy full bucket tugs the heli; releasing at the top of the swing throws water further. Seaplane/boat: the throwing line and ring. Assisted: the autopilot steadies it. |
| Dropped water behaves like water | Everyone | idea | Low and slow = concentrated splash; high and fast = a long thin line. Seaplane lays lines, bucket gives focused hits, boat cannon a steady stream. |
| Fire that spreads with wind and fuel | Both, different | idea | Choose where to cut it off, not just hose the flames. Assisted: spreads slowly and never reaches a friend. |
| A sea you can read | Everyone | idea | Swell in sets; seaplane lands in a trough, boat surfs swells, heli matches a heaving deck. |
| Air shaped by terrain | Both, different | idea | Thermals off the volcano, ridge lift on the icy peaks, sink behind cliffs, the fire's own updraft; gusts less predictable than today's smooth sine waves. |

## 3. More interesting emergencies

| Item | For | Status | Notes |
|---|---|---|---|
| Emergencies that grow out of each other | Both, different | idea, investigate | Storm rolls in → sailboat capsizes → lightning starts a ridge fire the wind drives toward the lodge → a fishing boat drifts toward the rocks. Choose what to handle first and with which machine. Assisted: one thing at a time. |
| An event director that drives the existing systems | Everyone | idea | Weather, fire, sea and wind already exist; something sets them off and chains them so no two missions are the same. |

## 4. Zone-specific missions and themed friends

Today the friends are one shared set (bunny, kitty, puppy, chick, piggy, lamb, panda, fox, frog, penguin) placed on
shared kinds of spot (islet, ledge, perch, camp, dock, floe, wreck, hut, kayak, raft...). Only the snowy peaks
have their own (penguins on the floes, a climber on the summit).

| Item | For | Status | Notes |
|---|---|---|---|
| Friends themed to each zone | Everyone | idea | To settle: forest (deer, owl, bear cub, hikers), reef (sea turtle, dolphin in a net, divers), harbour (seal, gull, fishermen), snow (penguins, mountain goat, climbers, skiers), volcano (geologists, goats), home (farm animals). |
| Missions that only make sense in their zone | Everyone | idea | To settle: avalanche or crevasse rescue on the glacier; lava cutting off a road on the volcano; a tangled turtle or stranded whale on the reef; a ship fire or a boat on the rocks in the harbour; lost hikers and wildfire in the forest. Includes carrying supplies. Fuller profiles below. |

### Mission profiles

The feel to aim for is that of rescue picture books like *Roto and Roy* (which the user's son loves): big weather
and big drama, vehicles in trouble, a scared animal in a tricky spot, heavy things lifted, supplies flown in, and the
crew coming home to the hangar together. These are missions in that spirit, not copies of any story. Our machines,
friends and places stay our own.

Themes: 🔥 fire · 🌊 flood and water · 🚚 vehicles in trouble · 🐾 scared friend in a tricky spot · 📦 lifting and
supplies · 🔦 search · ⛈️ storm night.

| Mission | Theme | Zone | Machines | What happens | New mechanics it needs |
|---|---|---|---|---|---|
| Lightning fire on the ridge | 🔥 | forest, volcano | heli, seaplane; boat where shore allows | A storm passes, lightning strikes, and a fire starts and runs with the wind. | Lightning as a fire starter (event director); fire spread (section 2). |
| Fire creeping toward the lodge | 🔥 | snow, forest | heli, seaplane | Cut the fire off before it reaches the building, where the friends are sheltering. | Fire spread; a target the fire can reach. |
| Boat on fire in the harbour | 🔥 | harbour | boat, heli | A fishing boat burns at its mooring; the boat's cannon is the main tool, the heli helps from above. | Fire on a floating object. |
| Fill from the lake with a hose | 🔥 | forest | heli | Hover low over the lake and draw water up a hanging hose instead of dipping the bucket; a steady low hover fills fastest. | Snorkel hose as a second heli tool. |
| Flash flood in town | 🌊 | harbour, home | boat, heli; seaplane on open water | Water rises through the streets during the mission. Cars float off, friends wait on roofs, and the boat goes up streets that are normally dry. | Rising water level over town; floating cars; boat routes through flooded streets. |
| River over its banks | 🌊 | forest | heli, boat up the river mouth | Friends cut off on a shrinking island in the river. | Rising water; a river the boat can travel. |
| Tide coming in on the sandbar | 🌊 | reef | boat, seaplane, heli | Friends out on a sandbar at low tide; the tide is coming in. | Tide level over the mission. |
| Ice breaking up | 🌊 | snow | boat, heli | The ice under the penguins cracks into floes that drift apart. | Floes that split and drift. |
| Truck stuck in floodwater | 🚚 | harbour, home | heli | Hook it on and fly it to high ground. | Sling load (swinging-load physics, section 2). |
| Car on a washed-out bridge | 🚚 | forest | heli; land vehicle | The road is gone on both sides; lift the car off, or bring the jeep round another way. | Sling load; a broken road. |
| Lava across the road | 🚚 | volcano | heli; land vehicle | A lava flow cuts the road with a bus of geologists on the wrong side. | Lava flow that grows; vehicles on roads. |
| Boat with a dead engine | 🚚 | harbour, reef | boat | Drifting toward the rocks; pass a tow line and pull it to safety. | Towing. |
| Sailboat capsized | 🚚 | home, reef | boat, heli, seaplane | Crew in the water and clinging to the hull; right the boat or tow it in. | Capsized hull; towing. |
| Snowmobile through the ice | 🚚 | snow | heli | Rider on the ice edge, machine sinking. Pull the rider out, then lift the snowmobile. | Sling load; thin ice. |
| Scared friend at the cliff edge | 🐾 | forest, snow, volcano | heli | Too frightened to climb into the basket. A crew member goes down the line, calms them, and both come up together. | A crew member on the winch line who walks a few steps on the ledge. |
| Stuck up a tree with fire below | 🐾 | forest | heli | Put the fire out under the tree first, then winch the friend down. | Fire plus winch in one mission. |
| Goat on a crumbling ledge | 🐾 | snow, volcano | heli | Rocks are falling; lift them before the ledge goes. | A ledge that breaks over time. |
| Stranded whale | 🐾 | reef | boat, heli | A whale beached at low tide. Keep it wet with water drops until the tide rises, then tow it out. | Gentle water drops; tide; towing. |
| Skiers stuck on the chairlift | 🐾 | snow | heli | The lift stops in a storm; winch each one off their chair. | Chairlift; precise winching beside cables. |
| Sandbag the levee | 📦 | harbour, home | heli, boat | Fly or ferry sandbags to where the water is coming over, before the flood arrives. | Carrying supplies; drops placed at a spot; a wall that holds the water back. |
| Snowed-in village | 📦 | snow | heli | An avalanche closes the road. Fly in food and blankets, and bring out anyone who needs help. | Carrying supplies; avalanche. |
| Hay for the farm | 📦 | home | heli | Snow or flood cuts off the farm; drop hay bales to the animals. | Sling load. |
| Generator for the lighthouse | 📦 | harbour | heli, boat | The light is out in a storm. Bring a generator so the boats can find their way home. | Sling load; the lighthouse beam. |
| Lost hiker in the fog | 🔦 | forest, snow | heli, land vehicle | Fog rolls in. Follow the clues (a flare, a whistle, footprints) to find them. | Fog; finding friends from clues (no marker). |
| Missing kayaker at dusk | 🔦 | reef, home | boat, heli | Search the coast with the searchlight as the light fades. | Searchlight; day/night. |
| Storm night | ⛈️ | all | all | A storm builds over a whole session, and the emergencies above pile up one after another. | Event director; day/night; weather that builds. |
| A friend joins the crew | — | all | all | Some rescued friends come back to the hangar and ride along on later missions, in the cockpit or at the door. | Persistent crew. |

## 5. Expanded zones and a land vehicle

| Item | For | Status | Notes |
|---|---|---|---|
| Hand over to a land vehicle | Both, different | idea | Some missions reach past where the machine can go: the heli lands, the seaplane lands, the boat beaches, and a jeep-like vehicle drives off to finish the job on land, then comes back. Assisted: it drives itself on hold-go, like the others. |
| Bigger zones with inland areas worth driving | Everyone | idea | Tracks, river crossings, mountain roads; terrain fun to drive and reasons to go there. |
| How the jeep travels | — | open question | Slung under the heli, carried aboard the seaplane and boat? |

## 6. Graphics

| Item | For | Status | Notes |
|---|---|---|---|
| More precise and detailed graphics | Everyone | idea | Specifics to collect: which models, textures, water, lighting or effects bother you most. |
| More and nicer scenery | Everyone | idea | Ongoing, zone by zone. |

### Graphics and renderer

Open items from the October 2026 model and rendering review (the finished items are in
[design/rendering.md](design/rendering.md)).

- **Materials:** surfaces have uniform material properties and one grayscale AO bake, which `wearBake()` also uses as
  grime. Add base-colour, normal and roughness detail; put panel lines, vents and markings in textures, not geometry.
  Glazing is opaque dark metal: better recesses, frames, Fresnel and a simple interior beat real transmission.
- **Helicopter:** audit where its 54k body triangles go (lettering, small tubes); author near, play and far LODs.
  Match rotor and tail-disc blur with the seaplane propeller (the propeller's Tip material doesn't fade).
- **Seaplane:** wing section and root fairing, nacelle openings, hull step and keel. Close-up review of the doorway,
  wing highlights and glazing in dusk and storm light.
- **Boat:** forward windows and roofline, collar cross-section and seams, chine and bow, and hardware where it explains
  function. Window pillars need a close-up review.
- **Animals and props:** eyes, eyelids, expression, ear motion, seated and boarding poses; explicit part masks instead
  of coordinate thresholds; fewer material groups. Bucket, cannon, pump and gauges need the same bevel and material
  care. Vegetation needs silhouette-preserving LOD transitions (no tree-to-lump pop).
- **Asset format:** the pack keeps one mesh per file, no hierarchy, rig or authored LOD chain, and clamps UVs.
  A glTF path must prove one complete vehicle round trip with offline delivery before replacing it.
- **Renderer:** shadow texel snapping and a detailed region per player; reflection proxies, distance limits and smaller
  targets; terrain index LODs and ocean rings; merge the scrub pass and grade into existing passes (keep colour-space
  order); instance fire fuel pieces and give smoke viewport-scaled point size; move render-only updates out of
  simulation substeps; a declared shader-variant preload registry.
- **Targets to test:** 60 Hz p95 within 16.7 ms on named representative hardware with headroom for two-player fire; no
  first-use shader stall; no growth after repeated rescue cycles; checks at DPR 1 and 2 on integrated and discrete GPUs.

## 7. Cooperation

| Item | For | Status | Notes |
|---|---|---|---|
| Complementary rescue and firefighting roles | Both, different | idea | Give two pilots useful jobs toward a shared outcome: a helicopter reaches a ledge, a seaplane fetches distant friends, a boat works the shoreline. Each vehicle pairing needs worthwhile contributions. Solo play remains complete. |
| Mixed-age teamwork | Everyone | idea | Each pilot keeps independent assistance. A toddler can make a visible contribution while an adult takes on precision or planning; never require a timed toddler action to unblock the other pilot. |
| Shared moments and contribution feedback | Everyone | idea | Show what each crew helped accomplish and celebrate together, without turning rescue totals into a competition. Explore optional handoffs after the core rescue loop is polished. |

## 8. Polish the existing rescue loop first

| Item | For | Status | Notes |
|---|---|---|---|
| Reliable assisted trips and clear rescue feedback | Everyone | shipped | Remove unnecessary seaplane return circuits; explain boarding, returning and startup across all three vehicles. Merged in PR #13; see [design/vehicles.md](design/vehicles.md) and [design/guidance-and-hud.md](design/guidance-and-hud.md). |
| A gradual path from assisted to manual control | Both, different | idea | Explore steering and destination choice with height, hover and pickup assistance retained. |
| Useful feedback for improving a rescue | Pilot | shipped | Live instruments and actionable landing, pickup and docking advice across all three vehicles. Merged in PR #14; see [design/guidance-and-hud.md](design/guidance-and-hud.md#manual-instruments). Optional precision challenges remain a future idea. |
| Save outings and provide a natural stopping point | Everyone | idea | Preserve progress across reloads and make finishing a short outing satisfying. |

## Known gaps and leftovers

Found while shipping earlier work and not yet fixed.

| Item | Vehicles | Notes |
|---|---|---|
| The user's degraded assisted pathing report | heli, seaplane | Not reproduced in 128 sim runs, 96 menu-started outings and 18 team outings. Needs the location, pairing and what was seen. |
| Broad dock approaches | seaplane, boat | Several distant dock returns spend 40–60 s on wide approaches. |
| Idle partner wanders | all | An empty pilot with no unclaimed friends can wander while the partner delivers the last passengers. |
| Helicopter trip efficiency | heli | The user reported it as inefficient; still to investigate. |
| Bucket pour streak | heli | A sideways white streak at the very start of a pour. |
| Penguin and seal sounds | — | The snow zone has no animal recordings yet (needs a CC0 download approval). |
| Zone polish for forest, reef, harbour | all | The same treatment Snowy Peaks and Volcano Isle got. |
| Keyboard handling pass | all, Pilot | Requested as the next handling priority; continuous handling feel and full manual missions are unverified. |

## Open questions

- What would make Pilot mode itself fun for a grown-up alone? Smoother controls are part of it, but most of the list
  above is features for everyone. Still to find: what is specific to playing it as an adult.
- Order of work.

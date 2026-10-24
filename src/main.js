import { TEST, play } from './seed.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createWorld, terrainHeight, canopyAt, waveHeight, sea, PRESETS, WORLD_R, HOME_R, BASE_Y, PAD_Y, PADS, SITES, OBSTACLES, SHOALS, ISLETS, HUTS, PLANT_LAYER, MIRROR_LAYER, ZONES, zoneOf, ZONE_ISLETS, LAKE, TOWER, CRATER, WAKE_N, wakeUniform, snowAt } from './world.js';
import { buildHeli, buildBasket, buildBucket, buildRing, buildRaft, buildAnimal, buildBeam, buildPlane, buildBoat, tickFriends, ANIMAL_TYPES, SKID, HOIST, DOOR_OPEN, BASKET_TOP, PLANE_FLOAT } from './models.js';
import { model } from './assets.js';
import { createFx } from './fx.js';
import { createNav, lookAhead, routeLeft } from './nav.js';
import { createLife } from './life.js';
import { createTraffic } from './traffic.js';
import { audio, sfx, animalVoice } from './audio.js';
import { flightClearance } from './flight-safety.mjs';
import { createFireField, advanceFire, waterImpact, predictDrop, attackPoint, fireProgress, bombingRun, WATER } from './firefighting.mjs';
import { buildFireScene, buildWaterStream } from './fire-scene.js';
import { chooseMission, LOCATIONS, MODES } from './missions.mjs';
import { createPortraits } from './portraits.js';

const $ = (s, r = document) => r.querySelector(s);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let portraits = new Map();
function angDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

// ================================================================= renderer
const canvas = $('#gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  const el = $('#err'); el.style.display = 'flex';
  el.textContent = 'This game needs WebGL (3D graphics) – please try a recent version of Chrome, Edge or Firefox.';
  throw e;
}
const PR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const world = createWorld(scene, renderer);
const fx = createFx(scene);
const life = createLife(scene, world, fx);
// Keep the fire programs compiled from startup; the first dispatch should not pause to build its shaders.
const firePrograms = buildFireScene(scene, { x: 0, z: 0, spacing: 1, cells: [{ x: 0, z: 0, y: -100, canopy: 0, heat: 0, wet: 0, everBurned: false }] });
firePrograms.group.scale.setScalar(0.001);
// charts of open water and of what stands up in the air, for the autopilots' routes (see nav.js)
const navT0 = performance.now();
const nav = createNav();
life.setRoute(nav);
const traffic = createTraffic(scene, world, nav, fx);
const navMs = performance.now() - navT0;

// ================================================================= players
const P_COL = [0xff5a1f, 0x1f7dff];
const players = [];
const MAX_CARGO = 3;
const SLOTS = [[-0.78, 0.1, 0], [0.78, 0.1, 0], [0, 0.1, 0]];

function makePlayer(idx) {
  const model = buildHeli(P_COL[idx]);
  model.group.rotation.order = 'YXZ';
  scene.add(model.group);
  const plane = buildPlane(P_COL[idx]);
  plane.group.rotation.order = 'YXZ'; plane.group.visible = false;
  scene.add(plane.group);
  const boat = buildBoat(P_COL[idx]);
  boat.group.rotation.order = 'YXZ'; boat.group.visible = false;
  scene.add(boat.group);
  const basket = buildBasket(P_COL[idx]); scene.add(basket);
  // the fire bucket hangs from the same cable; it takes the basket's place while the helicopter is fighting a fire
  const cage = basket.children[0], bucket = buildBucket(); bucket.visible = false; basket.add(bucket);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.7 }));
  rope.castShadow = true; scene.add(rope);
  const cam = new THREE.PerspectiveCamera(60, 1, 0.5, 9000);
  cam.layers.enable(PLANT_LAYER);
  // Every shader is built for a fixed number of lights, so a helicopter (and its searchlight) going out of sight would
  // rebuild them all, a freeze of seconds on a small laptop. A dark stand-in light keeps the count while it is away.
  const spotStandIn = new THREE.SpotLight(0xffffff, 0); spotStandIn.visible = false;
  scene.add(spotStandIn);
  const waterStream = buildWaterStream(scene);
  const fillGuide = new THREE.Group();
  const guideRing = new THREE.Mesh(new THREE.RingGeometry(7, 8, 48), new THREE.MeshBasicMaterial({ color: 0x56caff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  guideRing.rotation.x = -Math.PI / 2; fillGuide.add(guideRing);
  const icon = document.createElement('canvas'); icon.width = icon.height = 128;
  const ctx = icon.getContext('2d'); ctx.font = '90px "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💧', 64, 66);
  const texture = new THREE.CanvasTexture(icon); texture.colorSpace = THREE.SRGBColorSpace;
  const dropIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false })); dropIcon.scale.set(3.5, 3.5, 1); dropIcon.position.y = 5; fillGuide.add(dropIcon);
  fillGuide.visible = false; scene.add(fillGuide);
  const pane = $('#pane' + idx);
  const p = {
    idx, model, basket, rope, cam, pane, fillGuide, waterStream, spotStandIn, active: false, cage, bucket, water: 0, pour: 0, attack: null, fireAim: null, fireJob: null, spray: null,
    vehicle: 'heli', heli: model, heliBasket: basket, plane, boat, fs: 0, afloat: true, sea: 1, hoist: 0, manualT: 0, hook: new THREE.Vector3(),
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, yawVel: 0, pitch: 0, roll: 0,
    spin: 0, landed: true, grounded: true, clearance: 0, surfaceY: 0, overLand: true,
    bpos: new THREE.Vector3(), bvel: new THREE.Vector3(), ropeLen: 0.6, stow: 0,
    parked: true, altOff: 0, idleT: 0, incoming: 0, shake: 0, squash: 0, camG: 1,
    cargo: [], target: null, boardCd: 0, dropCd: 0, washAcc: 0, hornCd: 0, speakCd: 0,
    camPos: new THREE.Vector3(), camYaw: 0, camLook: new THREE.Vector3(),
    rescued: 0, hint: '', input: { f: 0, t: 0, l: 0, s: 0, w: 0, horn: false },
    pro: false, tiltF: 0, tiltS: 0, winch: 0, style: 0, flash: '', flashT: 0, rateCd: 0,
    ui: { score: $('.score', pane), slots: [...pane.querySelectorAll('.slot')], hint: $('.hint', pane), alt: $('.alt', pane), water: $('.water', pane), fill: $('.water .fill', pane), radar: $('.radar', pane).getContext('2d') },
  };
  players.push(p);
  return p;
}
makePlayer(0); makePlayer(1);

// which machine a pilot flies; the other one is hidden
function showVehicle(p, on) {
  p.heli.group.visible = on && p.vehicle === 'heli';
  p.plane.group.visible = on && p.vehicle === 'plane';
  p.boat.group.visible = on && p.vehicle === 'boat';
  p.spotStandIn.visible = !p.heli.group.visible;
  if (!on || p.vehicle !== 'heli') { p.heliBasket.visible = false; p.rope.visible = false; }
}
function setVehicle(p, kind) {
  releasePilot(p);
  while (p.cargo.length) deliverOne(p);
  p.vehicle = kind;
  p.model = p[kind];
  p.basket = kind === 'heli' ? p.heliBasket : p[kind].seat;
  parkPlayer(p); showVehicle(p, p.active);
}
const BERTH = [{ x: -4.6, z: 52 }, { x: 6.4, z: 52 }];       // the boats tie up alongside the pier
const MOORING = [{ x: -8, z: 60 }, { x: 8, z: 60 }];   // either side of the pier
const DOCK = new THREE.Vector3(0, 0, 66);
const HOME_SPOT = { x: 0, z: -3 };        // where the easy helicopter heads with friends aboard: over the paddock
function parkPlayer(p) {
  const pad = p.vehicle === 'plane' ? MOORING[p.idx] : p.vehicle === 'boat' ? BERTH[p.idx] : PADS[p.idx];
  if (p.vehicle === 'plane') { p.pos.set(pad.x, PLANE_FLOAT, pad.z); p.fs = 0; p.afloat = true; p.sea = 1; p.hoist = 0; }
  else if (p.vehicle === 'boat') { p.pos.set(pad.x, 0, pad.z); p.fs = 0; p.afloat = true; p.hoist = 0; }
  else p.pos.set(pad.x, PAD_Y + SKID, pad.z);
  p.vel.set(0, 0, 0);
  p.yaw = 0; p.yawVel = 0; p.pitch = p.roll = 0; p.landed = p.grounded = true; p.spin = 0; p.parked = true; p.shake = p.squash = 0; p.camG = 1; p.altOff = 0; p.idleT = 0; p.incoming = 0; p.tiltF = p.tiltS = 0; p.winch = 0;
  p.surfaceY = p.vehicle === 'heli' ? PAD_Y : 0;
  p.bpos.copy(p.pos).y -= 3; p.bvel.set(0, 0, 0); p.ropeLen = 0.6; p.stow = 1;
  p.camYaw = 0; p.camPos.set(pad.x, PAD_Y + 12, pad.z - 24); p.camLook.copy(p.pos);
  p.avoidT = p.backT = p.wedgeT = p.manualT = 0; p.wedgeAt = null; p.spray = null;
}
players.forEach(parkPlayer);
const activePlayers = () => players.filter(p => p.active);

// ================================================================= game state
// Each outing stays in its selected mode. Fire districts have shore access for every vehicle.
const MISSION_ZONES = ['home', 'forest', 'reef', 'harbour', 'snow', 'volcano'].map(id => ZONES.find(Z => Z.id === id));
const game = { state: 'menu', mode: 'mixed', location: 'auto', paused: false, mission: 1, zone: MISSION_ZONES[0], fire: false, rescued: 0, goal: 5, saved: [], total: 0, presetIdx: 0, celebrate: 0, fireT: 0, spawnT: 0, t: 0, boop: 0 };
const waiting = [], residents = [], hoppers = [];
const goalFor = m => game.fire ? 1 : Math.min(5 + Math.floor((m - 1) / MISSION_ZONES.length), 8);
// friends this mission still needs found: the goal, less those already home, aboard, climbing aboard or hopping home
function stillNeeded() {
  let n = game.goal - game.rescued;
  for (const p of players) n -= p.cargo.length + p.incoming;
  for (const h of hoppers) if (h.state === 'hop') n--;
  return n;
}
const maxWaiting = () => Math.max(0, Math.min((game.fire ? 2 : 4) + (activePlayers().length > 1 ? 1 : 0), stillNeeded()));
for (const s of SITES) s.zone = zoneOf(s.x, s.z).id;

// ================================================================= input
const keys = new Set();
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyR', 'KeyM', 'ControlRight', 'Numpad0', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Period', 'Comma', 'Slash', 'NumpadEnter']);
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || (e.target.closest && e.target.closest('summary'))) return;
  if (e.target instanceof HTMLButtonElement && (e.code === 'Enter' || e.code === 'Space')) return;
  if (GAME_KEYS.has(e.code) && game.state === 'play') { e.preventDefault(); keys.add(e.code); audio.unlock(); }
  if (e.repeat) return;
  if (e.code === 'Escape') togglePause();   // everything else lives on the corner buttons, safe from little hands
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (game.started && game.state === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); if (game.started && game.state === 'play') togglePause(); } });
const k = c => (keys.has(c) ? 1 : 0);
const dz = v => (Math.abs(v) < 0.18 ? 0 : v);

function readInput(p) {
  const solo = activePlayers().length === 1;
  const pro = p.pro;
  let f = 0, t = 0, l = 0, s = 0, w = 0, horn = false;
  if (p.idx === 0 || solo) {
    f += k('KeyW') - k('KeyS'); t += k('KeyA') - k('KeyD'); horn = horn || !!k('KeyF');
    // a pilot flying it properly: E / Q slide sideways, Space / Shift work the collective, R runs the winch out
    if (pro) { s += k('KeyE') - k('KeyQ'); l += k('Space') - k('ShiftLeft'); w += k('KeyR'); }
    else l += (k('KeyE') | k('Space')) - (k('KeyQ') | k('ShiftLeft'));
  }
  if (p.idx === 1 || solo) {
    f += k('ArrowUp') - k('ArrowDown'); t += k('ArrowLeft') - k('ArrowRight'); horn = horn || !!k('Slash');
    if (pro) { s += k('Period') - k('Comma'); l += (k('Enter') | k('NumpadEnter')) - k('ShiftRight'); w += k('ControlRight') | k('Numpad0') | k('KeyM'); }
    else l += (k('Enter') | k('NumpadEnter') | k('Period')) - (k('ShiftRight') | k('Comma'));
  }
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const list = []; for (const g of pads) if (g && g.connected) list.push(g);
  const gp = list[solo ? 0 : p.idx];
  if (gp) {
    const b = i => (gp.buttons[i] ? gp.buttons[i].value : 0);
    if (pro) {
      // left stick tilts the disc, right stick turns the nose, triggers are the collective, A runs the winch out
      f += -dz(gp.axes[1] || 0) + b(12) - b(13); s += dz(gp.axes[0] || 0) + b(15) - b(14); t += -dz(gp.axes[2] || 0);
      l += b(7) - b(6); w += b(0);
    } else {
      f += -dz(gp.axes[1] || 0) + b(12) - b(13); t += -dz(gp.axes[0] || 0) + b(14) - b(15);
      l += b(7) - b(6) + b(0) - b(1) - dz(gp.axes[3] || 0);
    }
    horn = horn || b(2) > 0.5;
    if (Math.abs(f) + Math.abs(l) > 0.3) audio.unlock();
  }
  const inp = p.input;
  inp.f = clamp(f, -1, 1); inp.t = clamp(t, -1, 1); inp.l = clamp(l, -1, 1); inp.s = clamp(s, -1, 1); inp.w = w > 0.4 ? 1 : 0; inp.horn = horn;
}

// ================================================================= weather
// How hard it is blowing, 0 (calm) to 1 (storm). It raises the swell, darkens the sky, tosses the trees and pushes on
// anything flying; a pilot flying it properly feels all of it, the easy helicopter only a nudge.
const WEATHERS = [{ name: 'Calm', icon: '\u{1F343}', wind: 0.1 }, { name: 'Breezy', icon: '\u{1F32C}\uFE0F', wind: 0.5 }, { name: 'Stormy', icon: '\u26C8\uFE0F', wind: 1 }];
const weather = { idx: 0, now: 0.1, dir: 0.9 };
function setWeather(i) { weather.idx = i; $('#bWx').textContent = WEATHERS[i].icon; }
function cycleWeather() { setWeather((weather.idx + 1) % WEATHERS.length); banner(WEATHERS[weather.idx].icon + ' ' + WEATHERS[weather.idx].name, '', 1.6); }
const WIND = new THREE.Vector3();
// the air's own velocity at a place and time, metres a second: a steady wind with gusts rolling through it
function windAt(x, z, t, out) {
  const along = x * Math.sin(weather.dir) + z * Math.cos(weather.dir);
  const gust = 0.6 + 0.4 * Math.sin(t * 0.43 + along * 0.021) + 0.3 * Math.sin(t * 1.31 + along * 0.05 + x * 0.013);
  const sp = Math.max(0, weather.now - 0.15) * 8.8 * gust, veer = weather.dir + 0.35 * Math.sin(t * 0.21 + z * 0.01);
  return out.set(Math.sin(veer) * sp, Math.max(0, weather.now - 0.15) * 1.3 * Math.sin(t * 1.9 + along * 0.04), Math.cos(veer) * sp);
}

// ================================================================= flight
const MAX_SPEED = 26, CEILING = 95, CRUISE = 13;
const flightEnvelope = {};
const V = new THREE.Vector3(), V2 = new THREE.Vector3();

// a word and some stars for a piece of flying done well (only pilots flying it properly are marked)
function rate(p, stars, words) {
  if (p.rateCd > 0) return;
  p.rateCd = 4; p.style += stars; p.flash = '\u2605'.repeat(stars) + ' ' + words; p.flashT = 2.8;
  syncHud();
}
function surfaceAt(x, z, t, out) {
  let g = terrainHeight(x, z);
  for (const pad of PADS) if ((x - pad.x) ** 2 + (z - pad.z) ** 2 < 72) g = Math.max(g, PAD_Y);
  for (const s of SITES) if (s.pad && (x - s.x) ** 2 + (z - s.z) ** 2 < 42) g = Math.max(g, s.y + 0.3);
  const w = waveHeight(x, z, t);
  out.land = g > w + 0.2;
  out.y = out.land ? g : w;
  return out;
}
const SURF = { y: 0, land: false };

const HANDS_OFF = { f: 0, t: 0, l: 0, horn: false };
// friends a boat or a seaplane cannot get to: up at a landing site, stuck on a cliff ledge, up the fire tower or on a
// roof, or on the wreck out on the coral
const inland = an => an.kind === 'camp' || an.kind === 'ledge' || an.kind === 'perch' || an.kind === 'wreck';
// ...and on the forest's little lake (no boat can get there, and it is far too small to land a seaplane on), or on a hut
// porch in the atoll's lagoon (the seaplane cannot get in)
const outOfReach = (an, p) => an.fire ? !canFight(p, an.fire) : p.vehicle !== 'heli' && (inland(an) || an.landlocked || (p.vehicle === 'plane' && (an.kind === 'hut' || !planeOk(an))));
// a friend with a fire burning beside them (see the fires section): nobody picks them up, the fire is put out and then
// they are safe where they are. The helicopter can always help (its bucket), the seaplane when there is open sea to
// scoop from, the boat only when the fire is close enough to the water for its cannon.
const burning = an => !!(an.fire && !an.fire.out);
const canFight = (p, F) => p.vehicle === 'heli' || (p.vehicle === 'plane' ? !!(F.scoop && (F.scoopOk ??= !!landingFor(F, 100, F))) : !!F.shore);
// The lagoon is ringed by reef with one channel through it (the water routes find it by themselves).
const LAGOON = { x: -165, z: 200, r: 26 };
// the nearest friend this machine can get to, however far: where the easy boat and seaplane head when nobody is close
function nearestFor(p) {
  let best = null, bd = 1e9;
  for (const an of waiting) {
    if (outOfReach(an, p) || (!an.fire && an.claimed && an.claimed !== p)) continue;
    if (an.fire && (p.cargo.length || p.incoming)) continue;      // (nobody goes firefighting with friends aboard)
    const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
    if (d < bd) { bd = d; best = an; }
  }
  return best && { an: best, d: bd };
}
// Following a planned route over the water (nav.js) to goal: where to steer for now (a point look metres along it) and how
// far there is still to go. Planned again only when the goal moves, the machine strays off it, or now and then; a goal
// that cannot be reached is not tried again for a few seconds.
function followWater(p, goal, need, look) { return follow(p, 'water', nav.water, goal, need, look); }
function follow(p, key, chart, goal, need, look) {
  const R = (p.routes ||= {})[key] || (p.routes[key] = { path: null, gx: 1e9, gz: 1e9, t: -9, fail: -9, aim: { x: 0, z: 0, off: 0 } });
  const moved = Math.hypot(goal.x - R.gx, goal.z - R.gz) > 8;
  if (moved || !R.path || R.aim.off > 18 || game.t - R.t > 6) {
    if (moved || game.t - R.fail > 4) {
      R.path = chart.route(p.pos, goal, need, 60); R.gx = goal.x; R.gz = goal.z; R.t = game.t;
      if (!R.path) R.fail = game.t;
    }
  }
  if (!R.path) return null;
  lookAhead(R.path, p.pos.x, p.pos.z, look, R.aim);
  return { aim: R.aim, left: routeLeft(R.path, p.pos.x, p.pos.z) };
}
// ---- hulls on the water (the boat, the seaplane's floats, the stricken fishing boat, friends adrift) keep off the rocks
// and out of water too shallow to float in, whatever the swell is doing
const DRAFT = 0.4;
const shallow = (x, z) => terrainHeight(x, z) > -DRAFT;
// is there rock standing in the water within pad of here? (sea stacks, the arch's feet, the huts' stilts, boulders that break the surface)
function rockNear(x, z, pad) {
  for (const o of OBSTACLES) if (!o.easy && (x - o.x) ** 2 + (z - o.z) ** 2 < ((o.wr || o.r) + pad) ** 2) return true;
  for (const o of SHOALS) if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + pad) ** 2) return true;
  return false;
}
// a hull is a line from stern to bow (half-length len) with some beam: push it clear of every rock it has run into,
// by just as far as it is in (so it slides along the rock rather than through it). Returns whether it touched.
function fendOff(pos, yaw, len, beam, high, shoals = true, stacks = true) {
  const fx_ = Math.sin(yaw), fz_ = Math.cos(yaw);
  let hit = false;
  const one = (ox, oz, r) => {
    const t = clamp((ox - pos.x) * fx_ + (oz - pos.z) * fz_, -len, len);
    const dx = pos.x + fx_ * t - ox, dz = pos.z + fz_ * t - oz, d = Math.hypot(dx, dz), min = r + beam;
    if (d < min && d > 0.01) { pos.x += dx / d * (min - d); pos.z += dz / d * (min - d); hit = true; }
  };
  if (stacks) for (const o of OBSTACLES) if (!o.easy && high <= o.top) one(o.x, o.z, o.wr || o.r);
  if (shoals && high < 1.5) for (const o of SHOALS) one(o.x, o.z, o.r);
  return hit;
}
// moved from (px, pz) into water too shallow under its middle or its leading end (lead ahead, negative going astern)?
// Then slide along whichever way is still deep enough, or stay put. Already in the shallows, any way that gets deeper is allowed.
const keel = (x, z, fx_, fz_, lead) => Math.max(terrainHeight(x, z), terrainHeight(x + fx_ * lead, z + fz_ * lead));
function aground(pos, px, pz, fx_, fz_, lead) {
  const g0 = keel(px, pz, fx_, fz_, lead);
  const stuck = (x, z) => { const g = keel(x, z, fx_, fz_, lead); return g > -DRAFT && g > g0 - 0.01; };
  if (!stuck(pos.x, pos.z)) return false;
  if (!stuck(pos.x, pz)) pos.z = pz; else if (!stuck(px, pos.z)) pos.x = px; else { pos.x = px; pos.z = pz; }
  return true;
}
function updatePlayer(p, dt, t) {
  updateFireJob(p);
  // A friend waiting at a landing site: once the helicopter is overhead it sets itself down beside them, they climb
  // aboard, and then it sits there until the pilot presses go again.
  if (p.pickup && p.pickup.state !== 'waiting') p.pickup = null;
  if (!p.pro && !p.pickup && !p.grounded && p.cargo.length + p.incoming < MAX_CARGO) for (const an of waiting) {
    if (an.kind !== 'camp' || an.fire || (an.claimed && an.claimed !== p)) continue;
    if (Math.hypot(an.site.x - p.pos.x, an.site.z - p.pos.z) < 8) { p.pickup = an; an.claimed = p; p.parked = true; sfx.winch(); break; }
  }
  // (a pilot flying it properly has to put it down at the site themselves)
  if (p.pro && p.grounded && Math.hypot(p.vel.x, p.vel.z) < 1.5 && p.cargo.length + p.incoming < MAX_CARGO) for (const an of waiting) {
    if (an.kind === 'camp' && !an.fire && Math.hypot(an.site.x - p.pos.x, an.site.z - p.pos.z) < an.site.r + 1) { board(an, p); break; }
  }
  const held = p.pickup || (p.grounded && p.incoming > 0);
  const inp = held ? HANDS_OFF : p.input;
  if (p.pickup) {
    const s = p.pickup.site, pull = damp(1.6, dt);
    p.vel.x += ((s.x - p.pos.x) * 0.9 - p.vel.x) * pull; p.vel.z += ((s.z - p.pos.z) * 0.9 - p.vel.z) * pull;
    if (p.grounded) board(p.pickup, p);
  }
  let fx_, fz_, tgt = 0;
  windAt(p.pos.x, p.pos.z, t, WIND);
  if (p.pro) {
    // ---- flown properly: tilt pushes, the machine has weight, height is the pilot's, and the wind is felt in full
    const busy = inp.f !== 0 || inp.s !== 0 || inp.t !== 0 || inp.l !== 0;
    if (busy) p.idleT = 0; else p.idleT += dt;
    if (p.parked && inp.l > 0) { p.parked = false; }
    if (!p.parked && p.grounded && p.idleT > 3.5) { p.parked = true; }
    const spooling = !p.parked && p.grounded && p.spin < 0.93, live = !p.parked && !spooling && !p.grounded;
    p.yawVel += (inp.t * (p.grounded ? 0 : 1.55) - p.yawVel) * damp(4, dt);
    p.yaw += p.yawVel * dt;
    fx_ = Math.sin(p.yaw); fz_ = Math.cos(p.yaw);
    const rx = -fz_, rz = fx_;                                   // the pilot's right
    p.tiltF += ((live ? inp.f : 0) - p.tiltF) * damp(3.2, dt);
    p.tiltS += ((live ? inp.s : 0) - p.tiltS) * damp(3.2, dt);
    if (p.grounded) { const grip = damp(6, dt); p.vel.x -= p.vel.x * grip; p.vel.z -= p.vel.z * grip; }
    else {
      // speeds through the air, not over the ground: a headwind slows it and a crosswind carries it off
      const vf = (p.vel.x - WIND.x) * fx_ + (p.vel.z - WIND.z) * fz_, vs = (p.vel.x - WIND.x) * rx + (p.vel.z - WIND.z) * rz;
      let af = p.tiltF * (p.tiltF > 0 ? 9.5 : 7) - vf * (inp.f === 0 ? 0.42 : 0.27);
      let as = p.tiltS * 7 - vs * (inp.s === 0 ? 0.85 : 0.5);
      as -= vf * p.yawVel * 0.85;                                // the nose leads the turn: most of the slip follows it round
      p.vel.x += (fx_ * af + rx * as) * dt; p.vel.z += (fz_ * af + rz * as) * dt;
    }
    // collective: a rate of climb. Hands off, it holds its height; near the ground the air under the disc cushions it
    let climb = inp.l > 0 ? inp.l * 9 : inp.l * 7;
    if (spooling || p.parked) climb = Math.min(climb, 0);
    if (climb < 0) climb = Math.max(climb, -(1.1 + Math.max(p.clearance, 0) * 0.9));
    p.vel.y += (climb + (p.grounded ? 0 : WIND.y) - p.vel.y) * damp(2.6, dt);
    // treetops are springy: they push back up and slow it, they do not stop it dead
    const tops = p.surfaceY + canopyAt(p.pos.x, p.pos.z) - 2;
    if (!p.grounded && p.overLand && p.pos.y - SKID < tops) { p.vel.y += 16 * dt; const snag = damp(1.2, dt); p.vel.x -= p.vel.x * snag; p.vel.z -= p.vel.z * snag; p.shake = Math.max(p.shake, 0.3); }
  } else {
    // The helicopter looks after its own height: it cruises a little above whatever is below,
    // takes off when you steer and settles back onto a helipad when left alone above one.
    const busy = inp.f !== 0 || inp.t !== 0 || inp.l !== 0;
    if (busy) { p.idleT = 0; if (p.parked && (inp.f !== 0 || inp.t !== 0 || inp.l > 0)) { p.parked = false; p.altOff = 0; } }
    else p.idleT += dt;
    if (!p.parked) {
      p.altOff = clamp(p.altOff + inp.l * 16 * dt, -CRUISE, 70);
      // (the landing sites out on the islands too, with or without friends aboard)
      const overPad = (!p.cargo.length && PADS.some(pad => Math.hypot(p.pos.x - pad.x, p.pos.z - pad.z) < 7)) || SITES.some(s => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < (s.pad ? 6.5 : s.r - 2));
      if ((overPad && p.idleT > 2.2 && Math.hypot(p.vel.x, p.vel.z) < 3) || (p.grounded && p.altOff <= -CRUISE + 0.5 && !busy)) p.parked = true;
    }
    // (over the sea, hold height against the calm water line so the swell does not make it bob)
    // (and over forest, against the treetops)
    let ahead = p.overLand ? p.surfaceY + Math.max(0, canopyAt(p.pos.x, p.pos.z) - 4) : 0;
    // (up over the fire tower or the roofs when someone is waiting up there, high enough for the basket to come down to them)
    if (p.cargo.length + p.incoming < MAX_CARGO) for (const an of waiting) if (an.kind === 'perch' && Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z) < 45) ahead = Math.max(ahead, an.pos.y + 9 - CRUISE);
    for (const sec of [0.6, 1.3, 2.2]) {
      const ax = p.pos.x + p.vel.x * sec, az = p.pos.z + p.vel.z * sec;
      surfaceAt(ax, az, t, SURF);
      if (SURF.land) ahead = Math.max(ahead, SURF.y + Math.max(0, canopyAt(ax, az) - 4));
    }
    flightClearance(p.pos, p.yaw, Math.hypot(p.vel.x, p.vel.z), OBSTACLES, SKID, flightEnvelope);
    const wantY = p.parked ? p.surfaceY + SKID - 0.5 : Math.max(ahead + SKID + CRUISE + p.altOff, flightEnvelope.height);
    // start-up: the rotor has to wind all the way up before the skids leave the ground
    const spooling = !p.parked && p.grounded && p.spin < 0.93;
    let lift = p.parked ? -0.5 : clamp((wantY - p.pos.y) * 0.16, -0.8, 1);
    if (p.parked && p.clearance < 4) lift = Math.max(lift, -0.16);      // flare: the last few metres are slow and gentle
    if (spooling) lift = Math.min(lift, 0);

    // The autopilot, as the seaplane has: hold go and it turns toward the nearest friend (over a landing site, the site
    // itself), slows right down over them for the basket, and once it is full (or has some aboard and nobody is near)
    // it heads home to the paddock. Any steering of the pilot's own wins.
    let steer = inp.t, gd = 1e9, off = 0;
    if (inp.f > 0 && inp.t === 0 && !p.grounded) {
      const room = p.cargo.length + p.incoming < MAX_CARGO, guide = room ? nearestFor(p) : null;
      const an = p.target || (guide && guide.an);
      // (fighting a fire: to the nearest open water to fill the bucket, then over the flames)
      const goal = p.fireJob ? (waterReady(p) ? { x: p.fireAim.x - (p.hook.x - p.pos.x), z: p.fireAim.z - (p.hook.z - p.pos.z) } : p.fireJob.fire.dip) : p.cargo.length && (!room || !guide || guide.d > 200) ? HOME_SPOT : an ? (an.kind === 'camp' ? an.site : an.pos) : null;
      if (goal) {
        gd = Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
        off = angDiff(Math.atan2(goal.x - p.pos.x, goal.z - p.pos.z), p.yaw);
        if (gd > 4) steer = clamp(off * 1.6, -1, 1);
      }
    }
    p.yawVel += (steer * (p.grounded ? 0 : 1.75) - p.yawVel) * damp(5, dt);
    p.yaw += p.yawVel * dt;
    fx_ = Math.sin(p.yaw); fz_ = Math.cos(p.yaw);
    // ease off by itself near a friend who needs a lift, so the basket can reach
    let top = Math.min(MAX_SPEED, flightEnvelope.speed);
    if (p.cargo.length + p.incoming < MAX_CARGO) for (const an of waiting) {
      const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
      if (d < 34) top = Math.min(top, 6 + d * 0.6);
    }
    // (on autopilot it comes to a hover over where it is going, and turns before it sets off rather than swinging wide)
    if (gd < 1e9) top = Math.min(top, 0.5 + gd * 0.55) * clamp(1.3 - Math.abs(off), 0.25, 1);
    // (and it holds its hover while a friend climbs into the basket: off to the next one only once they are aboard)
    const steady = !p.pro && p.incoming > 0 && !p.grounded;
    if (steady) top = 0;
    tgt = p.parked || spooling ? 0 : inp.f * (inp.f > 0 ? top : 12);
    const a = damp(p.grounded ? 5 : steady ? 4 : (inp.f === 0 ? 0.9 : 1.5), dt);
    p.vel.x += (fx_ * tgt - p.vel.x) * a; p.vel.z += (fz_ * tgt - p.vel.z) * a;
    p.vel.y += (lift * 11 - p.vel.y) * damp(4, dt);
    // a breath of the weather, no more: enough to feel the day, never enough to carry a small pilot off
    if (!p.grounded) { p.vel.x += WIND.x * 0.12 * dt; p.vel.z += WIND.z * 0.12 * dt; }
  }

  // world edge: a soft invisible wall of wind
  const rr = Math.hypot(p.pos.x, p.pos.z);
  if (rr > WORLD_R - 25) {
    // too far out to sea: the helicopter gently turns itself back toward the islands
    const home = Math.atan2(-p.pos.x, -p.pos.z), k2 = clamp((rr - (WORLD_R - 25)) / 40, 0, 1);
    p.yaw += angDiff(home, p.yaw) * damp(1.6 * k2, dt);
    if (rr > WORLD_R) { const push = (rr - WORLD_R) * 0.9; p.vel.x -= (p.pos.x / rr) * push * dt * 6; p.vel.z -= (p.pos.z / rr) * push * dt * 6; }
  }
  p.pos.addScaledVector(p.vel, dt);
  if (p.pos.y > CEILING) { p.pos.y = CEILING; p.vel.y = Math.min(p.vel.y, 0); }

  // towers and buildings push the helicopter round them
  for (const o of OBSTACLES) {
    if (p.pos.y - SKID > o.top || (o.easy && p.pro)) continue;
    const dx = p.pos.x - o.x, dzz = p.pos.z - o.z, d = Math.hypot(dx, dzz), min = Math.max(o.r, o.wr || 0) + 4.5;      // (a stack spreads widest at the waterline)
    if (d < min && d > 0.01) { p.pos.x = o.x + (dx / d) * min; p.pos.z = o.z + (dzz / d) * min; bump(p, 'obstacle'); }
  }

  surfaceAt(p.pos.x, p.pos.z, t, SURF);
  p.surfaceY = SURF.y; p.overLand = SURF.land;
  const floor = SURF.y + SKID + (SURF.land ? 0 : 1.3);
  if (p.pos.y <= floor) {
    if (SURF.land && !p.grounded && p.vel.y < -0.5) {
      // touchdown: thump, dust ring, suspension bounce, camera jolt
      fx.dust(p.pos.x, SURF.y, p.pos.z, 60); sfx.touchdown();
      p.shake = 1; p.squash = 1;
      if (p.pro && (PADS.some(pad => Math.hypot(p.pos.x - pad.x, p.pos.z - pad.z) < 8.5) || SITES.some(q => Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < q.r))) {
        if (p.vel.y > -1.5) rate(p, 3, 'Greased it'); else if (p.vel.y > -3) rate(p, 2, 'Good landing'); else rate(p, 1, 'Firm one!');
      }
    }
    p.pos.y = floor; p.vel.y = Math.max(p.vel.y, 0);
    p.grounded = SURF.land;
  } else if (p.pos.y > floor + 0.15) {
    if (p.grounded) { fx.dust(p.pos.x, SURF.y, p.pos.z, 50); p.shake = Math.max(p.shake, 0.45); }
    p.grounded = false;
  }
  p.clearance = p.pos.y - SKID - SURF.y;
  p.landed = p.grounded && p.parked;

  // rotor
  if (p.parked && p.grounded) p.spin = Math.max(0, p.spin - dt * (0.07 + p.spin * 0.22));       // long, lazy spool-down (~6 s)
  else if (p.grounded) p.spin = Math.min(1, p.spin + dt * (0.16 + p.spin * 0.42));              // start-up: slow first turns, then it winds up (~3 s)
  else p.spin += (1 - p.spin) * damp(2, dt);
  const m = p.model;
  m.rotor.rotation.y += p.spin * 34 * dt; m.tail.rotation.x += p.spin * 50 * dt;
  m.discMat.opacity = 0.3 * p.spin * p.spin; m.tipRingMat.opacity = 0.06 * p.spin * p.spin;
  m.bladeMat.opacity = m.tipMat.opacity = 1 - 0.72 * p.spin * p.spin;

  // attitude
  const fwdSpeed = p.vel.x * fx_ + p.vel.z * fz_;
  const sway = p.grounded ? 0 : weather.now * 0.05 * Math.sin(t * 2.3 + p.idx * 1.7 + p.pos.x * 0.05);      // the gusts rock it
  const pt = p.grounded ? 0 : p.pro ? p.tiltF * 0.36 + sway * 0.6 : p.parked && p.clearance < 7 ? -0.09 : clamp(fwdSpeed / MAX_SPEED * 0.3 + (tgt - fwdSpeed) / MAX_SPEED * 0.12, -0.3, 0.42);
  const rt = p.grounded ? 0 : (p.pro ? p.tiltS * 0.34 : 0) + sway + clamp(-p.yawVel * (0.1 + 0.2 * Math.abs(fwdSpeed) / MAX_SPEED), -0.5, 0.5);
  p.pitch += (pt - p.pitch) * damp(3.5, dt); p.roll += (rt - p.roll) * damp(3.5, dt);
  const bob = p.grounded ? 0 : Math.sin(t * 1.9 + p.idx * 2) * 0.16;
  // rumble on the skids while the rotor winds up or down, and a springy bounce on touchdown
  p.shake = Math.max(0, p.shake - dt * 2.4); p.squash = Math.max(0, p.squash - dt * 1.7);
  const rumble = p.grounded ? p.spin * (1.15 - 0.75 * p.spin) * 0.085 : 0;
  const J = () => (Math.random() - 0.5) * rumble;
  const sq = -0.3 * p.squash * Math.sin((1 - p.squash) * 8.5);
  m.group.position.set(p.pos.x + J(), p.pos.y + bob + sq + J() * 0.6, p.pos.z + J());
  m.group.rotation.set(p.pitch + J() * 0.35 - sq * 0.12, p.yaw, p.roll + J() * 0.5 + (p.grounded ? 0 : Math.sin(t * 1.3 + p.idx) * 0.012));

  // lights
  const blink = (t * 1.2 + p.idx * 0.5) % 1;
  const on = p.spin > 0.03 ? 1 : 0;
  m.strobe.material.emissiveIntensity = blink < 0.08 ? 14 * on : 0;
  m.beacon.material.emissiveIntensity = blink > 0.5 && blink < 0.62 ? 9 * on : 0.3;

  // rotor wash on water / dust on land
  if (p.spin > 0.12 && p.clearance < 20) {
    const s = (1 - p.clearance / 20) * p.spin * p.spin;
    p.washAcc += dt * 90 * s;
    while (p.washAcc > 1) { p.washAcc -= 1; fx.wash(p.pos.x, SURF.y, p.pos.z, 0.5 + s, SURF.land); }
  }

  // horn
  p.hornCd -= dt;
  if (inp.horn && p.hornCd <= 0) {
    p.hornCd = 0.45; sfx.honk(p.vehicle, p.idx);
    fx.emoji('🎵', p.pos.x, p.pos.y + 4, p.pos.z, 2.2);
    for (const an of waiting) if (an.pos.distanceTo(p.pos) < 90) an.excite = 2.5;
  }

  updateWinch(p, dt, t);
  updateCamera(p, dt, t);
}

// ================================================================= seaplane
// Always-forward flight. Hold go to take off and cruise; let go and it glides down and lands on the
// water by itself. It lines up on friends and on the dock, skims past and they hop aboard.
// Everything is driven through smoothed rates (turn rate, speed, climb rate) so nothing ever snaps.
const PL = { max: 36, fly: 16, cruise: 30 };      // (cruising at 30 m it is over every hill and tree but the three mountains, which it goes round)
function landWithin(p, fx_, fz_, dist, t) { const x = p.pos.x + fx_ * dist, z = p.pos.z + fz_ * dist; surfaceAt(x, z, t, SURF2); return SURF2.land ? SURF2.y + canopyAt(x, z) * 0.9 : -1e9; }
// is there land or shallows, or rock standing in the water, this far ahead on the water?
function blockedAt(p, fx_, fz_, dist, pad = 3) {
  const x = p.pos.x + fx_ * dist, z = p.pos.z + fz_ * dist;
  return shallow(x, z) || rockNear(x, z, pad);
}
// ================================================================= the easy seaplane's autopilot
// What it should visibly do is written down, as numbers, in AIRPLANE-SPEC.md ("Acceptance checks"), and checked by
// npm run check and npm run play-check. In short: it comes down on open water as near as it safely can to whoever (or
// whatever fire) it is going to, flown in from a lead-in point well back so it is lined up before it descends (if not,
// it goes round, and after twice round it picks another spot). Then it taxis the rest. It takes off from where it is,
// down whichever clear run of water points most nearly the way it is going. In the air it follows routes round anything
// tall and any high ground (nav.js), climbs straight out after take-off, and climbs over anything coming up.
const LANE = { back: 190, lead: 100, roll: 50 };      // (the glide down from cruising height runs back - roll metres)
const AIR = { top: 26, need: 22, tight: 12, look: 45 };      // (round anything standing near cruising height or over it; lower hills it flies over)
const LAND = { room: 12, reach: 250, near: 6, taxi: 140 };       // (water room either side of a landing; how far from the goal it may come down; how far it will taxi rather than fly)
// nothing high under the way in, by the ceiling chart: along the glide everything stays well under the glide path, and
// from the lead-in point to the top of the glide (flown at cruising height) well under that. So the plane never has to
// climb over anything once it is on its way in. (x, z) is the stopping point, (ux, uz) the way it lands.
function approachClear(x, z, ux, uz) {
  for (let d = LANE.roll; d <= LANE.back + LANE.lead + 40; d += 10) {
    const px = x - ux * d, pz = z - uz * d;
    if (Math.hypot(px, pz) > WORLD_R - 20) return false;
    const may = d >= LANE.back ? PL.cruise - 10 : Math.max(1.5, PL.cruise * (d - LANE.roll) / (LANE.back - LANE.roll) - 4);
    if (nav.ceiling(px, pz) > may) return false;
  }
  return true;
}
// Where to come down for goal S, and on what heading: the open water nearest S (out to LAND.reach) with a clear run
// LANE.back long behind the stopping point (and, for a scoop, a take-off run ahead of it too), a clear approach beyond
// that, and a clear straight taxi on to S. Of those, the one least out of the plane's way. Returns { x, z, h } (stop by
// x, z having landed along heading h) or null. `skip` holds spots already tried and given up on.
function landingFor(S, ahead, from, skip) {
  const wet = nav.water.at(S.x, S.z) >= LAND.near ? S : nav.water.open(S.x, S.z, LAND.near, 30);
  if (!wet) return null;
  let best = null, bs = 1e9;
  // (for a friend, near enough to taxi the rest comfortably; for a fire's water, anywhere near it)
  const reach = ahead > 0 ? LAND.reach : LAND.taxi - 20;
  for (let r = 0; r <= reach; r += 20) for (let k = 0; k < (r ? 16 : 1); k++) {
    const a = k * Math.PI / 8 + r * 0.01, qx = wet.x + Math.cos(a) * r, qz = wet.z + Math.sin(a) * r;
    if (nav.water.at(qx, qz) < LAND.room || terrainHeight(qx, qz) > -3) continue;
    if (skip && skip.some(q => Math.hypot(q.x - qx, q.z - qz) < 40)) continue;
    if (r && !nav.water.clear(qx, qz, wet.x, wet.z, LAND.near)) continue;
    for (let hk = 0; hk < 16; hk++) {
      const h = hk * Math.PI / 8, ux = Math.sin(h), uz = Math.cos(h);
      if (!nav.water.clear(qx - ux * LANE.back, qz - uz * LANE.back, qx + ux * (ahead + 15), qz + uz * (ahead + 15), LAND.room)) continue;
      if (!approachClear(qx, qz, ux, uz)) continue;
      // (and nothing standing over the run on the water beyond: the sea arch spans water a hull could pass under, a wing cannot)
      if (ahead > 0 && nav.ceiling(qx + ux * ahead * 0.5, qz + uz * ahead * 0.5) > 2) continue;
      if (ahead > 0 && !clearClimb({ x: qx + ux * (ahead - RUN_FREE), z: qz + uz * (ahead - RUN_FREE) }, h)) continue;      // (and climbing away after a scoop)
      // (the way round to the start of the approach, how far it has to turn to come in along h, and the taxi after)
      const p0x = qx - ux * (LANE.back + LANE.lead), p0z = qz - uz * (LANE.back + LANE.lead);
      const toward = Math.atan2(qx - from.x, qz - from.z);
      const cost = Math.hypot(p0x - from.x, p0z - from.z) + 70 * Math.abs(angDiff(toward, h)) + 4 * r;
      if (cost < bs) { bs = cost; best = { x: qx, z: qz, h }; }
    }
  }
  return best;
}
// can the seaplane get to a friend at (x, z)? (worked out once per place: a landing spot near it exists)
const planeReach = new Map();
function planeCanReach(x, z) {
  const key = Math.round(x / 10) + ',' + Math.round(z / 10);
  if (!planeReach.has(key)) planeReach.set(key, !!landingFor({ x, z }, 0, { x, z }));
  return planeReach.get(key);
}
function planePilot(p, t, dt, ready, room) {
  const A = p.ap || (p.ap = { key: null, land: null, t: -9, final: false, run: null, air: null, airT: -9, manual: 0, park: null });
  const out = { aim: A.aimPt || (A.aimPt = { x: 0, z: 0 }), cap: PL.max, alt: PL.cruise, look: undefined, over: undefined, run: false, near: false };
  const alt = p.pos.y - PLANE_FLOAT;
  // the pilot steering for themselves: it holds its height and speed and leaves the turning to them, then picks up again
  if (p.input.t !== 0) { A.manual = 1.2; A.final = false; A.run = null; }
  if (A.manual > 0) { A.manual -= dt; out.aim = null; out.cap = p.afloat ? 9 : PL.max * 0.8; out.alt = Math.max(alt, PL.cruise); return out; }
  if (!ready) { out.cap = 0; return out; }

  // ---- what it is doing: a friend, the pier, a fire (scoop or drop), or, let go in the air, just landing
  const F = p.fireJob && p.fireJob.fire;
  A.skim = false; A.taxi = false;
  let kind, goal, key;
  if (F) { kind = waterReady(p) ? 'drop' : 'scoop'; goal = waterReady(p) ? p.fireAim : F.scoop; key = kind + F.x; }
  else if (p.target) { kind = 'pickup'; goal = p.target.pos; key = 'f' + p.target.id; }
  else if (p.cargo.length) { kind = 'dock'; goal = DOCK; key = 'dock'; }
  else if (p.input.f <= 0 && (A.park || !p.afloat)) {
    // (and it stays a landing through the touchdown and roll-out, bounces and all, until it has slowed on the water)
    // (let go in the air: land on the nearest good lane ahead)
    if (!A.park) { const ahead = { x: p.pos.x + Math.sin(p.yaw) * 220, z: p.pos.z + Math.cos(p.yaw) * 220 }; A.park = nav.water.open(ahead.x, ahead.z, 22, 260) || nav.water.open(p.pos.x, p.pos.z, 22, 400) || { x: p.pos.x, z: p.pos.z }; }
    kind = 'park'; goal = A.park; key = 'park';
  } else { kind = 'free'; goal = null; key = 'free'; }
  if (p.input.f > 0 || (p.afloat && p.fs < 6)) A.park = null;          // (kept through the splash and roll-out)
  if (key !== A.key) { A.key = key; A.land = null; A.final = false; A.air = null; A.bomb = null; A.arrived = false; A.stallT = null; A.stallAt = null; A.reverseUntil = 0; A.tried = null; A.goes = 0; A.tkSpot = null; }
  if (!goal) {
    // nothing to fetch: go held, it takes off down a clear lane the way it is pointing and flies on wherever the pilot
    // steers it (the world's edge turns it back); let go on the water, it waits
    if (p.afloat) { if (p.input.f <= 0) { out.aim = null; out.cap = 0; return out; } out.alt = 0; return takeoff(p, A, out, null); }
    A.run = null; out.aim = null;
    // (straight on, unless something tall stands in the way: then round it)
    const ax = p.pos.x + Math.sin(p.yaw) * 220, az = p.pos.z + Math.cos(p.yaw) * 220;
    if (!nav.air(AIR.top).clear(p.pos.x, p.pos.z, ax, az, AIR.need)) { out.aim = A.aimPt; airRoute(p, A, { x: ax, z: az }, out, AIR.look); }
    return out;
  }

  // A scoop interrupted by a float catching a rock must not leave the crew applying power forever.
  if (kind === 'scoop' && p.afloat && p.input.f > 0) {
    if (game.t < A.reverseUntil) { out.aim = null; out.cap = -4; out.alt = 0; return out; }
    if (!A.stallAt || Math.hypot(p.pos.x - A.stallAt.x, p.pos.z - A.stallAt.z) > 6) {
      A.stallAt = { x: p.pos.x, z: p.pos.z }; A.stallT = game.t;
    }
    if (game.t - A.stallT > 5) {
      A.reverseUntil = game.t + 2.5; A.stallT = null; A.stallAt = null;
      A.run = null; A.final = false; A.land = null; A.air = null;
      out.aim = null; out.cap = -4; out.alt = 0; return out;
    }
  } else { A.stallT = null; A.stallAt = null; }

  // ---- a fire with water aboard: by an air route over it, low enough to drop (the drop itself is in updatePlane)
  if (kind === 'drop') {
    if (p.afloat) return takeoff(p, A, out, goal);
    if (!A.bomb) {
      const aim = { ...p.fireAim };
      const from = Math.hypot(p.pos.x - aim.x, p.pos.z - aim.z) > 130 ? p.pos : F.scoop;
      A.bomb = bombingRun(aim, from, WORLD_R); A.bomb.since = t;
      A.air = null;
    }
    const B = A.bomb; p.fireAim = B.aim;
    const dx = B.aim.x - p.pos.x, dz = B.aim.z - p.pos.z, distance = Math.hypot(dx, dz);
    if (B.stage === 'line-up') {
      airRoute(p, A, B.entry, out, 50);
      const entryD = Math.hypot(p.pos.x - B.entry.x, p.pos.z - B.entry.z);
      if (entryD < 180) out.aim = B.entry;
      out.cap = 25;
      if (entryD < 42) { B.stage = 'run'; B.since = t; A.air = null; }
    } else {
      out.cap = 22; out.aim = B.lock || B.aim;
      const error = Math.abs(angDiff(Math.atan2(dx, dz), p.yaw));
      if (!B.lock && distance < 85 && error < 0.28) {
        const h = Math.atan2(dx, dz);
        B.lock = { x: B.aim.x + Math.sin(h) * 160, z: B.aim.z + Math.cos(h) * 160 };
      }
      if (!p.attack && ((B.lock && distance > 95 && (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) < 0) || t - B.since > 24)) {
        A.bomb = null; A.air = null;
      }
    }
    out.over = F.y + 12 - PLANE_FLOAT;
    return out;
  }
  // ---- on the water: taxi to it if it is near enough by water, or else take off (it stays down unless on a take-off run)
  if (p.afloat) {
    out.alt = 0;
    if (kind === 'scoop' && A.final && A.land) {
      // skimming the run: keep straight along it, fill up, and (full) carry on into the take-off
      const h = A.land.h; A.run = h; A.skim = true;
      out.aim = { x: p.pos.x + Math.sin(h) * 80, z: p.pos.z + Math.cos(h) * 80 };
      out.cap = p.water >= 1 ? PL.max : 12; out.run = true;
      if (p.water >= 1) out.alt = PL.cruise; else { out.final = true; out.look = 20; }      // (still skimming: it stays down on the water)
      return out;
    }
    if (A.run === null && kind !== 'scoop' && kind !== 'park') {
      const R = follow(p, 'taxi', nav.water, goal, 7.5, 16);
      // (taxi only when it is close: further than this, flying there is quicker and nicer to watch)
      if (R && R.left < LAND.taxi) {
        A.final = false; A.tk = false; A.taxi = true;
        out.aim = R.aim; out.near = R.left < 40;
        out.cap = clamp(1.5 + (R.left - (kind === 'dock' ? 6 : 10)) * 0.3, 0, 13);
        A.arrived = R.left < 6;
        return out;
      }
    }
    if (kind === 'park') { out.cap = 0; return out; }
    // (landed for it but it is too far by water after all: that spot is not tried again for this one)
    if (A.land && kind !== 'scoop') { (A.tried ||= []).push({ x: A.land.x, z: A.land.z }); A.land = null; }
    // (the tank fills only on the scoop run chosen by the fire, which holds it down until full: see the skim above)
    return takeoff(p, A, out, goal);
  }
  // (just off the water: straight on along the take-off run until it has some height, and only then turn for where it is
  // going; a low turn just after lifting off is how a plane meets the trees on the shore)
  // (a skim that bounces off a wave for a moment is still the skim, not a take-off)
  if (A.run !== null && !(kind === 'scoop' && A.final && !waterReady(p))) A.climbH = A.run;
  A.run = null;
  if (A.climbH != null) {
    if (alt < 14) { out.aim = { x: p.pos.x + Math.sin(A.climbH) * 80, z: p.pos.z + Math.cos(A.climbH) * 80 }; out.alt = PL.cruise; return out; }
    A.climbH = null;
  }

  // ---- in the air, to land: a lane chosen once and kept (a pilot who keeps changing their mind never lands), chosen
  // again only if the friend drifts well away from it; then the lead-in, and the run in
  if (A.land && Math.hypot(goal.x - A.land.gx, goal.z - A.land.gz) > 30) A.land = null;
  if (!A.land) {
    const ahead = kind === 'scoop' ? 100 : 0;      // (skim, fill and lift off: about 100 m of water beyond touching down)
    const L = landingFor(kind === 'scoop' ? F : goal, ahead, p.pos, A.tried);
    if (L) {
      L.gx = goal.x; L.gz = goal.z;
      A.land = L; A.t = t; A.air = null; A.wide = null;
    }
  }
  const L = A.land;
  if (!L) {
    // (nowhere left to land for this friend: let them go for now, for someone else or for later, and fly on)
    if (kind === 'pickup' && p.target) { p.target.claimed = null; p.target.noPlaneUntil = game.t + 30; p.target = null; }
    airRoute(p, A, goal, out, AIR.look); return out;
  }
  const fx = Math.sin(L.h), fz = Math.cos(L.h);
  const along = (p.pos.x - L.x) * fx + (p.pos.z - L.z) * fz;          // negative before the stopping point
  const cross = Math.abs((p.pos.x - L.x) * fz - (p.pos.z - L.z) * fx);
  const lined = Math.abs(angDiff(p.yaw, L.h));
  // (onto final only near the top of the glide: joined any later, it is too high to come down in time)
  if (!A.final && along > -(LANE.back + LANE.lead + 30) && along < -LANE.back * 0.8 && cross < 22 && lined < 0.5) A.final = true;
  // (past the top of the glide without having joined it, it is a go-round too)
  const missed = !A.final && A.wide === false && along > -LANE.back * 0.8 && along < 0 && cross < 60;
  if (missed || (A.final && (cross > 30 || lined > 0.8 || along > 20))) {
    // (not lined up after all: go round again; twice round for the same spot and it picks another)
    A.final = false; A.wide = null;
    if ((A.goes = (A.goes || 0) + 1) >= 2) { (A.tried ||= []).push({ x: L.x, z: L.z }); A.land = null; A.goes = 0; }
  }
  const P0 = { x: L.x - fx * (LANE.back + LANE.lead), z: L.z - fz * (LANE.back + LANE.lead) }, G = { x: L.x - fx * LANE.back, z: L.z - fz * LANE.back };
  if (A.final) {
    // on the line: follow it, slow to approach speed and come down the glide path to touch down short of the stop
    lookAhead([G, L], p.pos.x, p.pos.z, 60, out.aim);
    const toTouch = -along - LANE.roll;
    out.alt = PL.cruise * clamp(toTouch / (LANE.back - LANE.roll), 0, 1);      // (down over the open water of the lane only)
    out.alt -= 1.5 * (1 - clamp(toTouch / 30, 0, 1));          // (and the last bit aimed just under the surface, so it settles rather than floats along)
    out.cap = 20; out.look = Math.max(0, -along - 8); out.final = true;
    return out;
  }
  // not lined up yet: round by the air route to the lead-in point, then down the line. Coming from the landing side, it
  // swings out wide of the lead-in first (a teardrop) rather than turning about on the spot and missing the line
  const sideOf = (p.pos.x - L.x) * fz - (p.pos.z - L.z) * fx >= 0 ? 1 : -1;
  if (along > -(LANE.back + LANE.lead) + 20 && A.wide == null) A.wide = { x: P0.x - fx * 60 + fz * sideOf * 90, z: P0.z - fz * 60 - fx * sideOf * 90 };
  if (A.wide && Math.hypot(p.pos.x - A.wide.x, p.pos.z - A.wide.z) < 50) A.wide = false;      // (false: done with it until next time)
  if (A.wide) airRoute(p, A, A.wide, out, AIR.look);
  else airRoute(p, A, P0, out, AIR.look, [G, L]);
  if (Math.hypot(p.pos.x - L.x, p.pos.z - L.z) < 300) out.cap = 30;      // (slower near, so the turns onto the line are tighter)
  return out;
}
// the air route to `to` (round anything tall), then on along `then`; steer for a point `look` metres along it
function airRoute(p, A, to, out, look, then) {
  if (!A.air || game.t - A.airT > 3 || Math.hypot(A.airTo.x - to.x, A.airTo.z - to.z) > 5) {
    // (with room to spare round high ground, so cutting the corners of the route does not cut across a hillside; only
    // where that cannot be found, a tighter one)
    const air = nav.air(AIR.top), r = air.route(p.pos, to, AIR.need, 60) || air.route(p.pos, to, AIR.tight, 60) || [{ x: p.pos.x, z: p.pos.z }, { x: to.x, z: to.z }];
    A.air = then ? r.concat(then) : r; A.airT = game.t; A.airTo = { x: to.x, z: to.z };
  }
  lookAhead(A.air, p.pos.x, p.pos.z, look, out.aim);
}
// the top of the tallest thing in the plane's way over the next `secs` seconds, following its turn: a tower, a stack,
// the arch, a hill or the trees on it (or -1e9)
function tallAhead(p, secs) {
  let top = -1e9;
  for (let s = 0.5; s <= secs; s += 0.5) {
    const h = p.yaw + p.yawVel * s * 0.8, d = Math.max(p.fs, 10) * s;
    // (along the arc it is turning on, roughly)
    const x = p.pos.x + Math.sin(p.yaw + p.yawVel * s * 0.4) * d, z = p.pos.z + Math.cos(p.yaw + p.yawVel * s * 0.4) * d;
    for (const o of OBSTACLES) if (o.top > p.pos.y - PLANE_FLOAT - 6 && (x - o.x) ** 2 + (z - o.z) ** 2 < (Math.max(o.r, o.wr || 0) + 9) ** 2) top = Math.max(top, o.top);
    // (and the hills and treetops under that arc: landAhead only looks dead ahead)
    const gr = terrainHeight(x, z);
    if (gr > 0.5) top = Math.max(top, gr + canopyAt(x, z) + 2);
  }
  return top;
}
// the highest the ceiling chart says anything stands under the plane's way over the next 7 seconds, along its heading
// and toward its aim point
function roofAhead(p, aim) {
  let top = nav.ceiling(p.pos.x, p.pos.z);
  const v = Math.max(p.fs, 16), ah = aim ? Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z) : p.yaw;
  for (let s = 0.5; s <= 7; s += 0.5) for (const h of [p.yaw, ah, p.yaw + p.yawVel * s * 0.5]) top = Math.max(top, nav.ceiling(p.pos.x + Math.sin(h) * v * s, p.pos.z + Math.cos(h) * v * s));
  return top;
}
// is the climb-out beyond a take-off run clear of high ground and trees?
const RUN_FREE = 130;
function clearClimb(P, h) {
  const ux = Math.sin(h), uz = Math.cos(h);
  // (it lifts off by the end of the run and climbs at about 1 in 3, over anything the ceiling chart knows of, by 10 m)
  for (let d = RUN_FREE; d <= RUN_FREE + 240; d += 10) if (nav.ceiling(P.x + ux * d, P.z + uz * d) > Math.max(0.5, (d - RUN_FREE) * 0.3 - 10)) return false;
  return true;
}
// Where to take off from, heading for `to`: the nearest point on the water (by a straight taxi, out to 300 m) with a
// clear run of open water and a clear climb beyond it, along whichever heading needs least turning now and afterwards.
// Returns { x, z, h, r } (r: how far away it is) or null.
function takeoffSpot(p, to) {
  const dir = to ? Math.atan2(to.x - p.pos.x, to.z - p.pos.z) : p.yaw;
  let best = null, bs = 1e9, foundAt = -1;
  for (let r = 0; r <= 300; r += 25) {
    if (foundAt >= 0 && r > foundAt + 25) break;          // (the first ring with one, and the next, for a better way round)
    for (let k = 0; k < (r ? 16 : 1); k++) {
      const a = k * Math.PI / 8, qx = p.pos.x + Math.sin(a) * r, qz = p.pos.z + Math.cos(a) * r;
      if (r && (nav.water.at(qx, qz) < 10 || !nav.water.clear(p.pos.x, p.pos.z, qx, qz, 5))) continue;
      for (let hk = 0; hk < 16; hk++) {
        const h = hk * Math.PI / 8;
        const sc = r + 30 * Math.abs(angDiff(h, dir)) + (r ? 0 : 12 * Math.abs(angDiff(h, p.yaw)));
        if (sc >= bs) continue;
        if (!nav.water.clear(qx, qz, qx + Math.sin(h) * RUN_FREE, qz + Math.cos(h) * RUN_FREE, 10) || !clearClimb({ x: qx, z: qz }, h)) continue;
        bs = sc; best = { x: qx, z: qz, h, r }; if (foundAt < 0) foundAt = r;
      }
    }
  }
  return best;
}
// a take-off: from the take-off spot (taxiing there first if it is not right here), turning to face along its run, then
// full power down it
function takeoff(p, A, out, to) {
  if (A.run === null) {
    if (!A.tkSpot || game.t - A.tkSpot.t > 20) { A.tkSpot = takeoffSpot(p, to); if (A.tkSpot) A.tkSpot.t = game.t; }
    const S = A.tkSpot;
    if (S && (S.r === 0 || Math.hypot(S.x - p.pos.x, S.z - p.pos.z) < 8)) { A.run = S.h; A.runT = game.t; A.tkSpot = null; }
    else {
      // (taxi out to it; with nowhere to go at all, wait)
      A.tk = !!S;
      out.aim = S ? { x: S.x, z: S.z } : null;
      out.cap = S ? clamp(3 + Math.hypot(S.x - p.pos.x, S.z - p.pos.z) * 0.5, 3, 12) : 0; out.near = true;
      return out;
    }
  }
  A.tk = false;
  const h = A.run, off = Math.abs(angDiff(p.yaw, h));
  out.aim = { x: p.pos.x + Math.sin(h) * 80, z: p.pos.z + Math.cos(h) * 80 };
  // (turning to face the run, slowly; then the run)
  out.cap = off > 0.2 && p.fs < 8 ? 3.5 : PL.max; out.run = true;
  out.alt = out.cap > 4 ? PL.cruise : 0;
  if (game.t - A.runT > 25) A.run = null;          // (and should it ever not get away, choose again)
  return out;
}
function updatePlane(p, dt, t) {
  const inp = p.input, m = p.plane;
  updateFireJob(p);
  const busy = inp.f !== 0 || inp.t !== 0 || inp.l !== 0;
  // the pilot's own height: up/down keys move the cruising height; the autopilot's descents wait while they are in use
  // once the pilot touches the height keys, height stays theirs until the plane next comes to rest on the water
  if (inp.l !== 0) p.manualT = 1;
  if (p.parked || (p.afloat && Math.abs(p.fs) < 2 && inp.l === 0)) { p.altOff = 0; p.manualT = 0; }
  if (busy) { p.idleT = 0; if (p.parked) { p.parked = false; } } else p.idleT += dt;
  if (p.parked) p.spin = Math.max(0, p.spin - dt * (0.09 + p.spin * 0.28));
  else p.spin = Math.min(1, p.spin + dt * (0.18 + p.spin * 0.5));
  const ready = !p.parked && p.spin > 0.9;

  const fx_ = Math.sin(p.yaw), fz_ = Math.cos(p.yaw);
  const alt = p.pos.y - PLANE_FLOAT;                       // height of the floats above the calm sea
  const dockD = Math.hypot(p.pos.x - DOCK.x, p.pos.z - DOCK.z);
  const room = p.cargo.length + p.incoming < MAX_CARGO;

  // who to fetch: the nearest friend it can, kept until they are aboard (no changing its mind half way through a landing)
  if (p.target && p.target.state !== 'waiting') { if (p.target.claimed === p) p.target.claimed = null; p.target = null; }
  if (!p.pro && !p.target && !p.fireJob && room) {
    const g = nearestFor(p);
    if (g && !g.an.fire && (!p.cargo.length || (dockD > 200 && (g.d < 180 || g.d < dockD * 0.6)))) { p.target = g.an; g.an.claimed = p; }      // (with friends aboard, one more if they are much nearer than home, and home is not just here)
  }
  // ---- the autopilot: where to steer, how fast and how high (see planePilot)
  const ap = p.pro ? null : planePilot(p, t, dt, ready, room);
  const cap = ap ? ap.cap : PL.max;

  // ---- turning: one smoothed turn rate; the bank comes from it. The pilot's own steering always wins outright.
  const maxRate = p.afloat ? 1.15 : p.pro ? 1.5 : p.fireJob && waterReady(p) ? 1.3 : 0.9;
  let turnCmd = p.pro ? clamp(inp.t - inp.s, -1, 1) : inp.t !== 0 ? inp.t
    : ap && ap.aim ? clamp(angDiff(Math.atan2(ap.aim.x - p.pos.x, ap.aim.z - p.pos.z), p.yaw) * 1.7 - p.yawVel * 0.35, -1, 1) : 0;
  // far out to sea: lean back toward the islands
  const rr = Math.hypot(p.pos.x, p.pos.z);
  if (rr > WORLD_R - 50) { const home = angDiff(Math.atan2(-p.pos.x, -p.pos.z), p.yaw), k2 = clamp((rr - (WORLD_R - 50)) / 45, 0, 1); turnCmd = lerp(turnCmd, clamp(home * 1.5, -1, 1), k2); }
  p.yawVel += (clamp(turnCmd, -1, 1) * (ready ? maxRate : 0) - p.yawVel) * damp(2.6, dt);
  p.yaw += p.yawVel * dt;

  // ---- speed: eased toward what the pilot (and the situation) asks for
  const atDock = (!p.target && p.cargo.length > 0 && dockD < 18) || (p.afloat && p.incoming > 0);      // (and it waits while someone climbs aboard)
  // on the water, ease to a stop before a beach instead of bumping into it
  let shore = 1;
  if (alt < 3) { if (blockedAt(p, fx_, fz_, 7, 6)) shore = 0; else if (blockedAt(p, fx_, fz_, 16, 6)) shore = 0.35; }
  let want = 0;
  if (ready && !atDock) {
    if (inp.f < 0) want = p.afloat ? -5 : PL.fly;
    else if (inp.f > 0 || !p.afloat) want = cap;          // (let go in the air: the autopilot finds a lane and lands)
  }
  // (a beach right ahead on the water: ease off; the routes keep it rare. Not on a take-off run, which has a clear lane)
  if (p.afloat && want > 0 && shore < 1 && p.fs < PL.fly && !(ap && ap.run)) want *= Math.max(shore, ap && ap.near ? 0 : 0.15);
  // eased near the target speed, and never harder than a gentle push or a firm-but-soft brake
  if (!p.pro) p.fs += clamp((want - p.fs) * 1.6, p.afloat ? -9 : -5, 6.5) * dt;

  const flying = p.fs > PL.fly - 1;
  if (p.pro) {
    // ---- flown by hand, arcade style. In the air it cruises by itself at 32 m/s: W boosts, S eases off, and it settles
    // back to cruise when you let go; diving picks up speed and climbing costs some. It never stalls, so landing is just
    // flying down onto the water, where it settles and slows to a taxi. On the water W drives it along, and held long
    // enough it lifts off by itself.
    let vyT = 0;
    if (p.afloat) {
      // (with a friend close by and room aboard, W taxis up to them; otherwise it is take-off power)
      const taxi = room && waiting.some(an => !an.fire && !outOfReach(an, p) && Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z) < 45);
      const want = !ready || p.incoming ? 0 : inp.f > 0 ? (taxi ? 6 : 30) : inp.f < 0 ? -3 : 0;
      p.fs += clamp(want - p.fs, -7 * dt, 7 * dt);
      if (inp.f > 0 && !taxi && p.fs > 19) vyT = 7;                             // rotate and climb away
      else if (inp.l > 0 && p.fs > 15) vyT = 6;
    } else {
      vyT = inp.l * (inp.l > 0 ? 11 : 10);
      if (inp.l === 0 && alt < 12) vyT = 4;                                       // hands off, it climbs back to a safe height
      const want = 32 + (inp.f > 0 ? 18 * inp.f : 12 * inp.f) - p.vel.y * 1.4;       // (a dive speeds it up, a climb slows it)
      p.fs += clamp(want - p.fs, -6 * dt, 8 * dt);
      p.fs = Math.max(p.fs, 18);
      let ahead = -1e9;
      for (const sec of [0.6, 1.4, 2.4]) ahead = Math.max(ahead, landWithin(p, fx_, fz_, p.fs * sec, t));
      if (ahead > 2.5) vyT = Math.max(vyT, (ahead + 5 - alt) * 1.6);             // never fly into a hill (beaches and sandbars do not count)
      if (alt < 3 && vyT < 0) vyT = Math.max(vyT, -2.2);                          // a gentle last few metres onto the water
    }
    p.vel.y += (vyT - p.vel.y) * damp(3, dt);
    p.descent = p.vel.y;
  } else {
  // ---- height: cruise when flying, follow the glide slope when landing or scooping, always clear of land
  let landAhead = -1e9;
  // (on a lined-up final, only as far as where it stops: the beach of a friend's sandbar beyond is not a hill to climb)
  // (and down on the water, settling after a touchdown or taxiing, it does not look at all: only a take-off run climbs)
  const look = p.afloat && !(ap && ap.run) ? 0 : ap && ap.look !== undefined ? ap.look : 1e9;
  for (const sec of [0, 0.8, 1.6, 2.6]) landAhead = Math.max(landAhead, landWithin(p, fx_, fz_, Math.min(p.fs * sec, look), t));
  let wantAlt = 0, vyT = 0, steepClimb = false;
  if (flying) {
    const mine = clamp(PL.cruise + p.altOff, 0, 76);
    wantAlt = p.manualT > 0 ? mine : ap ? Math.min(mine, ap.alt) : mine;
    if (landAhead > -1e8) wantAlt = Math.max(wantAlt, landAhead + 9);        // never let a hill come to us
    // nor a tower, a stack or the arch: wherever the plane will be in the next few seconds, turning as it is turning,
    // anything standing taller than it within reach of a wingtip has it climb over the top
    // (not on a lined-up final either: the approach to a landing spot is checked clear when the spot is chosen)
    const tall = (p.afloat && !(ap && ap.run)) || (ap && ap.final) ? -1e9 : tallAhead(p, 5);
    if (tall > -1e8) wantAlt = Math.max(wantAlt, tall + 7 - PLANE_FLOAT);
    steepClimb = tall + 7 - PLANE_FLOAT > alt || landAhead + 9 > alt;      // (high ground coming: climb hard)
    // and above everything under where it is going over the next few seconds, by the ceiling chart: straight on, and
    // toward where the autopilot is steering (not on a lined-up final, whose glide is over open water checked clear)
    if (!(ap && ap.final) && !(p.afloat && !(ap && ap.run)) && !(p.afloat && ap && ap.alt <= 0)) {
      const roof = roofAhead(p, ap && ap.aim);
      if (roof + 10 > wantAlt) { wantAlt = roof + 10; if (roof + 10 > alt + 2) steepClimb = true; }
    }
    if (ap && ap.over !== undefined) wantAlt = Math.max(wantAlt, ap.over);     // (over a fire's treetops to drop on it)
  }
  vyT = p.manualT > 0 ? clamp((wantAlt - alt) * 2.2, -9, 9) : clamp((wantAlt - alt) * 2.2, ap && ap.final ? -8 : -6.5, steepClimb ? 10 : 7);
  if (flying && inp.l !== 0) {
    // while a height key is held the plane climbs or dives right away, and levels off where you let go
    vyT = inp.l * 9;
    if (landAhead > -1e8) vyT = Math.max(vyT, (landAhead + 9 - alt) * 2.2);
    p.altOff = clamp(alt + p.vel.y * 0.35 - PL.cruise, -PL.cruise, 60);
  }
  p.vel.y += (vyT - p.vel.y) * damp(inp.l !== 0 ? 3.2 : wantAlt > alt ? 1.8 : 2.6, dt);
  }

  // ---- move
  const px = p.pos.x, pz = p.pos.z;
  const nfx = Math.sin(p.yaw), nfz = Math.cos(p.yaw);
  p.vel.x = nfx * p.fs; p.vel.z = nfz * p.fs;
  p.pos.addScaledVector(p.vel, dt);
  // on the water the floats, bow to stern, stay off the shallows; and, last resort only (the steering above normally keeps
  // us clear), the wingtips stay off anything tall and the floats off the boulders
  const low = p.pos.y - PLANE_FLOAT;
  if (!flying && low < 1.5 && aground(p.pos, px, pz, nfx, nfz, p.fs >= 0 ? 5 : -5)) { p.fs *= Math.max(0, 1 - dt * 3); bump(p, 'shallows'); }
  const tips = fendOff(p.pos, p.yaw, 0, 7.4, low, false), floats = low < 1.5 && fendOff(p.pos, p.yaw, 3.4, 1.8, low, true, false);
  if (tips || floats) bump(p, 'rock');
  if (tips || floats) p.fs *= 1 - damp(2, dt);
  surfaceAt(p.pos.x, p.pos.z, t, SURF);
  if (SURF.land && !flying && p.pos.y - SURF.y < PLANE_FLOAT + 1.2) { p.pos.x = px; p.pos.z = pz; p.fs *= Math.max(0, 1 - dt * 3); surfaceAt(px, pz, t, SURF); }
  const floor = (SURF.land ? SURF.y + 1.6 : 0) + PLANE_FLOAT;
  const wasAfloat = p.afloat;
  const wave = waveHeight(p.pos.x, p.pos.z, t);
  if (p.pos.y <= floor) {
    if (!wasAfloat && !SURF.land && p.fs > 7) {
      // splashdown
      for (const sx of [-1.8, 1.8]) fx.splash(p.pos.x - nfz * sx, wave, p.pos.z + nfx * sx, 34, 1.3);
      sfx.splash(1, true); p.shake = 0.6; p.squash = 1;
      if (p.pro) { if (p.descent > -1.5) rate(p, 3, 'Greased it'); else if (p.descent > -3.2) rate(p, 2, 'Good landing'); else rate(p, 1, 'Firm splashdown!'); }
    }
    p.pos.y = floor; p.vel.y = Math.max(p.vel.y, 0);
  }
  p.afloat = !SURF.land && p.pos.y - floor < 0.25;
  if (wasAfloat && !p.afloat && p.fs > PL.fly - 2) { fx.splash(p.pos.x, wave, p.pos.z, 26, 1.1); }
  p.surfaceY = SURF.y; p.overLand = SURF.land; p.clearance = p.pos.y - floor;
  p.grounded = p.afloat && Math.abs(p.fs) < 8;
  p.landed = p.parked; p.ropeLen = 0.6;

  // ---- taxied up close and slow: the friend swims across and climbs up the float
  if (p.target) {
    const an = p.target, d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
    if ((d < (an.kind === 'islet' ? 30 : an.kind === 'deck' ? 16 : 13) || (p.ap && p.ap.arrived && d < 30)) && p.afloat && Math.abs(p.fs) < 5.5) { board(an, p); p.target = null; }
  }
  // (a pilot taxis right up to them and stops; they swim over)
  if (p.pro && p.afloat && Math.abs(p.fs) < 7.5 && room) for (const an of waiting) {
    if (an.fire || outOfReach(an, p)) continue;
    const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
    if (d < (an.kind === 'islet' ? 24 : 12)) { board(an, p); if (an.kind === 'islet' || d < 7) rate(p, 3, 'Right alongside'); else if (d < 10) rate(p, 2, 'Nice taxiing'); else rate(p, 1, 'A long swim!'); break; }
  }
  // ---- the water bomber: skimming fast along the sea fills the tank; passing low over the fire empties it onto them
  if (p.fireJob && !p.attack && p.water < 1 && p.afloat && p.fs > 6 && (p.scoopOpen || 0) > .7) {
    p.water = Math.min(1, p.water + dt / 2.2);
    p.scoopSprayAcc = (p.scoopSprayAcc || 0) + dt * 35;
    while (p.scoopSprayAcc >= 1) {
      p.scoopSprayAcc--;
      for (const side of [-1, 1]) fx.emit(p.pos.x + Math.cos(p.yaw)*side*1.5, wave+.1, p.pos.z-Math.sin(p.yaw)*side*1.5,
        -nfx*5+side*Math.cos(p.yaw)*2, 2+Math.random()*2, -nfz*5-side*Math.sin(p.yaw)*2, .8,.94,1,.7,.4,.7,9,0,2);
    }
    if (p.water >= 1) waterAboard(p);
  }
  if (p.water >= 0.99 && !p.attack && !p.afloat && p.fireJob) {
    const F = p.fireJob.fire, aim = p.fireAim;
    const hit = predictDrop({ x: p.pos.x, y: p.pos.y - 1.3, z: p.pos.z }, p.vel, aim.y, 'plane', WIND);
    // Start early: the tank lays a continuous strip across the front, rather than a single magic hit.
    const ahead = Math.max(0, p.fs) * WATER.plane.duration * 0.45;
    if ((Math.hypot(hit.x + nfx * ahead - aim.x, hit.z + nfz * ahead - aim.z) < 9 && p.pos.y > aim.y + 1) || (p.pro && inp.w)) dump(p, p.fireJob);
  }
  // ---- home: friends hop out along the pier
  p.dropCd -= dt;
  if (p.cargo.length && p.afloat && dockD < (p.pro ? 22 : 34) && Math.abs(p.fs) < (p.pro ? 7 : 12) && p.dropCd <= 0) { if (p.pro) rate(p, dockD < 10 ? 3 : 2, dockD < 10 ? 'Neat mooring' : 'Moored'); deliverOne(p); p.dropCd = 0.45; }
  if (!p.parked && p.afloat && Math.abs(p.fs) < 1 && p.idleT > 3 && !p.cargo.length && !p.incoming && dockD < 70) { p.parked = true; }
  p.mode = p.target || p.incoming ? 'pickup' : (p.cargo.length && dockD < 130 ? 'deliver' : 'idle');

  // ---- how it looks: coordinated bank, nose follows the flight path, floats ride the swell
  for (const pr of m.props) pr.rotation.z += p.spin * 46 * dt;
  m.discMat.opacity = 0.3 * p.spin * p.spin; m.bladeMat.opacity = 1 - 0.82 * p.spin * p.spin;
  const air = clamp(p.clearance / 2.5, 0, 1);
  p.sea += ((1 - air) - p.sea) * damp(3, dt);                               // 1 = sitting on the water, 0 = airborne
  const planing = clamp(p.fs / PL.fly, 0, 1);
  const pt = -Math.atan2(p.vel.y, Math.max(p.fs, 10)) * 0.85 - p.sea * planing * 0.075;
  const rt = clamp(-Math.atan(p.yawVel * Math.max(p.fs, 0) / 9.8) * lerp(0.9, 0.12, p.sea), p.pro ? -1.05 : -0.6, p.pro ? 1.05 : 0.6);
  p.pitch += (pt - p.pitch) * damp(2.2, dt); p.roll += (rt - p.roll) * damp(2.0, dt);
  p.shake = Math.max(0, p.shake - dt * 2.4); p.squash = Math.max(0, p.squash - dt * 1.7);
  const rumble = p.sea * p.spin * (1.15 - 0.75 * p.spin) * 0.05;
  const J = () => (Math.random() - 0.5) * rumble;
  const sq = -0.25 * p.squash * Math.sin((1 - p.squash) * 8.5);
  const calm = p.sea * (1 - 0.7 * planing);                                 // bob and rock fade as it gets up on the step
  const rock = Math.sin(t * 1.4 + p.idx) * 0.035 * calm;
  // (on the water the floats lie along the swell: bow up a crest, one float lifted as a wave runs under it)
  let swellP = 0, swellR = 0;
  if (calm > 0.01) {
    const wf = waveHeight(p.pos.x + nfx * 3.4, p.pos.z + nfz * 3.4, t), wb = waveHeight(p.pos.x - nfx * 3.4, p.pos.z - nfz * 3.4, t);
    const ws = waveHeight(p.pos.x - nfz * 1.8, p.pos.z + nfx * 1.8, t), wo = waveHeight(p.pos.x + nfz * 1.8, p.pos.z - nfx * 1.8, t);
    swellP = -(wf - wb) / 6.8 * 0.8 * calm; swellR = (ws - wo) / 3.6 * 0.6 * calm;
  }
  m.group.position.set(p.pos.x + J(), p.pos.y + wave * 0.55 * calm + sq + J() * 0.5, p.pos.z + J());
  m.group.rotation.set(p.pitch + swellP + Math.cos(t * 1.1 + p.idx) * 0.01 * calm + J() * 0.3, p.yaw, p.roll + swellR + rock * 0.5 + J() * 0.4);

  // spray off the floats while on the water
  if (p.afloat && Math.abs(p.fs) > 2) {
    p.washAcc += dt * Math.abs(p.fs) * 6;
    while (p.washAcc > 1) {
      p.washAcc -= 1;
      const sx = Math.random() < 0.5 ? -1.8 : 1.8, back = 1 + Math.random() * 3, out = (Math.random() - 0.3) * Math.sign(sx);
      fx.emit(p.pos.x - nfz * sx - nfx * back, wave + 0.1, p.pos.z + nfx * sx - nfz * back, -nfz * out * 4 + nfx * p.fs * 0.25, 1.5 + Math.random() * p.fs * 0.14, nfx * out * 4 + nfz * p.fs * 0.25, 0.92, 0.97, 1, 0.55, 0.3 + Math.random() * 0.45, 0.6 + Math.random() * 0.6, 9, 1.2);
    }
  }
  // lights
  const blink = (t * 1.2 + p.idx * 0.5) % 1, on = p.spin > 0.03 ? 1 : 0;
  m.strobe.material.emissiveIntensity = blink < 0.08 ? 14 * on : 0;
  m.beacon.material.emissiveIntensity = blink > 0.5 && blink < 0.62 ? 9 * on : 0.3;
  // riders jiggle
  p.cargo.forEach((an, i) => { if (an.state !== 'riding') return; an.model.position.y = SLOTS[i][1] + Math.abs(Math.sin(t * 5 + an.phase)) * 0.12; an.model.rotation.z = Math.sin(t * 4 + an.phase) * 0.08; feel(an, 1, 0, dt); });
  // horn
  p.hornCd -= dt;
  if (inp.horn && p.hornCd <= 0) {
    p.hornCd = 0.45; sfx.honk(p.vehicle, p.idx);
    fx.emoji('\u{1F3B5}', p.pos.x, p.pos.y + 4, p.pos.z, 2.2);
    for (const an of waiting) if (an.pos.distanceTo(p.pos) < 90) an.excite = 2.5;
  }
  updateCamera(p, dt, t);
}

// ================================================================= fast rescue boat
// Stays on the water. Go, turn, back. It slows by itself beside a friend so they can hop in,
// and noses up to the pier to let them out. Same smoothed rates as the seaplane.
const BT = { max: 30 };
function updateBoat(p, dt, t) {
  const inp = p.input, m = p.boat;
  updateFireJob(p);
  const busy = inp.f !== 0 || inp.t !== 0;
  if (busy) { p.idleT = 0; if (p.parked) { p.parked = false; } } else p.idleT += dt;
  if (p.parked) p.spin = Math.max(0, p.spin - dt * (0.15 + p.spin * 0.5));
  else p.spin = Math.min(1, p.spin + dt * (0.3 + p.spin * 0.8));
  const ready = !p.parked && p.spin > 0.9;
  const fx_ = Math.sin(p.yaw), fz_ = Math.cos(p.yaw);
  const dockD = Math.hypot(p.pos.x - DOCK.x, p.pos.z - DOCK.z);
  const room = p.cargo.length + p.incoming < MAX_CARGO;

  if (p.target && (p.target.state !== 'waiting' || Math.hypot(p.target.pos.x - p.pos.x, p.target.pos.z - p.pos.z) > 160)) { if (p.target.claimed === p) p.target.claimed = null; p.target = null; }
  if (!p.pro && !p.target && !p.fireJob && ready && room) {
    let bd = 110;
    for (const an of waiting) {
      if (an.fire || outOfReach(an, p) || (an.claimed && an.claimed !== p)) continue;
      const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
      const off = Math.abs(angDiff(Math.atan2(an.pos.x - p.pos.x, an.pos.z - p.pos.z), p.yaw));
      if (d < bd && (off < 1.1 || d < 40)) { bd = d; p.target = an; }
    }
    if (p.target) p.target.claimed = p;
  }
  const guide = !p.pro && !p.target && room ? nearestFor(p) : null;
  // (a fire by the shore: in close to the water's edge below it, for the cannon)
  const fj = !p.pro && p.fireJob;
  const goal = p.pro ? null : fj ? fj.fire.shore : p.target ? p.target.pos : p.cargo.length && (!room || !guide || guide.d > 160) ? DOCK : guide ? guide.an.pos : null;
  let assist = 0, gd = 1e9, cap = BT.max, routed = false;
  if (goal && ready) {
    // the way there by water, planned round every island, rock and shoal and through the reef's channel (nav.js); the
    // boat cuts smoothly onto it and round its corners, and eases off for the sharp ones
    const R = followWater(p, goal, 5.5, Math.max(14, Math.abs(p.fs) * 1.3));
    const aim = R ? R.aim : goal;
    routed = !!R;
    gd = R ? R.left : Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
    const off = angDiff(Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z), p.yaw);
    if (gd > 7 && (routed || Math.abs(off) < 1.9 || gd > 35)) assist = clamp(off * 1.8, -1, 1);
    cap = Math.min(BT.max, p.target || fj ? 5 + Math.max(0, gd - 9) * 0.5 : 2 + Math.max(0, gd - 15) * 0.4);
    if (routed) cap = Math.min(cap, 7 + 23 * clamp(1.2 - Math.abs(off) * 1.1, 0, 1));
  }

  // steering bites harder once the boat has some way on
  let turnCmd = p.pro ? clamp(inp.t - inp.s, -1, 1) : inp.t !== 0 ? inp.t + assist * 0.35 : (inp.f > 0 ? assist : 0);
  const rr = Math.hypot(p.pos.x, p.pos.z);
  if (rr > WORLD_R - 50) { const home = angDiff(Math.atan2(-p.pos.x, -p.pos.z), p.yaw), k2 = clamp((rr - (WORLD_R - 50)) / 45, 0, 1); turnCmd = lerp(turnCmd, clamp(home * 1.5, -1, 1), k2); }
  // a coast in the way: swing toward open water and follow the shore round, instead of nosing into the beach
  const ownIslet = p.target && p.target.kind === 'islet' && gd < 48;
  p.avoidT = Math.max(0, (p.avoidT || 0) - dt);
  // (only when there is no planned route to follow: a route already goes round all of it)
  if (!p.pro && !routed && ready && p.fs > -0.5 && !ownIslet) {
    // (looking further ahead the faster it goes, so it has room to turn)
    const look = Math.max(16, p.fs * 0.8);
    const blocked = blockedAt(p, fx_, fz_, look) || blockedAt(p, fx_, fz_, 8);
    if (blocked && p.avoidT <= 0) {
      const l = blockedAt(p, Math.sin(p.yaw + 0.9), Math.cos(p.yaw + 0.9), 16), r = blockedAt(p, Math.sin(p.yaw - 0.9), Math.cos(p.yaw - 0.9), 16);
      p.avoidDir = l && !r ? -1 : r && !l ? 1 : (turnCmd >= 0 ? 1 : -1);
    }
    if (blocked) p.avoidT = 1.1;
    if (p.avoidT > 0 && inp.t === 0) turnCmd = blocked ? p.avoidDir : 0;      // turn until clear, then run straight for a moment
  }
  // Holding station for the cannon is intentional, not a cove to reverse out of.
  const fireHolding = !!fj && (gd < 12 || !!p.spray);
  if (fireHolding) p.backT = 0;
  // wedged in a cove with go held and getting nowhere: back out for a moment, turning, then carry on
  p.wedgeT = (p.wedgeT || 0) + dt;
  if (p.wedgeT > 2.5) {
    if (!p.pro && !fireHolding && ready && inp.f > 0 && !p.incoming && p.wedgeAt && Math.hypot(p.pos.x - p.wedgeAt.x, p.pos.z - p.wedgeAt.z) < 2) p.backT = 1.8;
    p.wedgeT = 0; (p.wedgeAt || (p.wedgeAt = new THREE.Vector3())).copy(p.pos);
  }
  if (p.backT > 0) { p.backT -= dt; turnCmd = p.avoidDir || 1; }
  // (while the cannon is going, it swings its bow round to face the fire, so the fire is in the picture)
  if (!p.pro && p.spray && inp.t === 0) { const F = p.spray.fire; turnCmd = clamp(angDiff(Math.atan2(F.x - p.pos.x, F.z - p.pos.z), p.yaw) * 1.6, -1, 1); }
  const bite = clamp(Math.abs(p.fs) / 9, 0.45, 1) * (p.fs < -0.5 && !fireHolding ? -1 : 1) * (p.pro ? 1.15 - clamp((Math.abs(p.fs) - 20) / 40, 0, 0.35) : 1);
  p.yawVel += (clamp(turnCmd, -1, 1) * (ready ? 1.35 * bite : 0) - p.yawVel) * damp(2.5, dt);
  p.yaw += p.yawVel * dt;

  // ease off before a beach instead of running aground
  const dir = p.fs >= 0 ? 1 : -1;
  let shore = 1;
  if (p.pro) shore = 1;
  else if (blockedAt(p, fx_ * dir, fz_ * dir, 7, 1.5)) shore = 0; else if (blockedAt(p, fx_ * dir, fz_ * dir, 15, 1.5) || blockedAt(p, fx_ * dir, fz_ * dir, Math.abs(p.fs) * 1.6, 1.5)) shore = 0.3;      // (further ahead the faster it goes)
  const atDock = (!p.pro && !p.target && p.cargo.length > 0 && dockD < 15) || p.incoming > 0 || (fj && gd < 12) || !!p.spray;      // (and it lies stopped while someone comes aboard, or while the cannon is going)
  let want = 0;
  if (ready && !atDock) want = inp.f > 0 ? cap : inp.f < 0 ? -7 : 0;
  if (p.backT > 0) want = -6;
  if (shore < 1 && Math.sign(want) === dir && !(p.backT > 0)) want *= Math.max(shore, ownIslet ? 0 : 0.12);   // creep while turning away, so it never just sits there
  if (p.pro) {
    // a throttle and a hull: full power runs it up to 34 m/s, letting go it coasts down on the water's drag, back is astern
    const thrust = !ready || atDock ? 0 : inp.f > 0 ? 7.5 * inp.f : inp.f < 0 ? 6 * inp.f : 0;
    p.fs += (thrust - p.fs * (0.05 + Math.abs(p.fs) * 0.004) - (inp.f === 0 ? p.fs * 0.32 : 0)) * dt;
    if (atDock) p.fs *= 1 - damp(2, dt);
  } else p.fs += clamp((want - p.fs) * 1.8, -11, 8.5) * dt;

  const px = p.pos.x, pz = p.pos.z;
  const nfx = Math.sin(p.yaw), nfz = Math.cos(p.yaw);
  p.vel.set(nfx * p.fs, 0, nfz * p.fs);
  p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
  // the whole hull, bow to stern, slides along any rock it meets; and touching the shallows it slides along whichever way
  // is still deep enough rather than stopping dead
  if (aground(p.pos, px, pz, nfx, nfz, p.fs >= 0 ? 4.8 : -4.6)) { p.fs += clamp(3 - p.fs, -14 * dt, 0); bump(p, 'shallows'); }
  if (fendOff(p.pos, p.yaw, 3.2, 1.6, 0)) { p.fs *= 1 - damp(4, dt); bump(p, 'rock'); }
  const wave = waveHeight(p.pos.x, p.pos.z, t);
  // the hull rides the swell; going fast enough over a big one it leaves the water for a moment
  const rideY = wave * 0.75;
  p.bvy = p.bvy || 0;
  if (p.pos.y <= rideY + 0.02) {
    if (p.air > 0.5 && Math.abs(p.fs) > 12) { fx.splash(p.pos.x, wave, p.pos.z, 30, 1.2); sfx.splash(0.8, true); p.squash = 1; p.shake = 0.6; if (p.pro) rate(p, p.air > 0.8 ? 3 : 2, p.air > 0.8 ? 'Big air!' : 'Airborne!'); }
    p.bvy = (rideY - p.pos.y) / Math.max(dt, 1e-3) * 0.5 + Math.max(0, (waveHeight(p.pos.x + Math.sin(p.yaw) * p.fs * 0.05, p.pos.z + Math.cos(p.yaw) * p.fs * 0.05, t) * 0.75 - rideY) / 0.05) * 0.35;
    p.pos.y = rideY; p.air = 0;
  } else { p.bvy -= 9.8 * dt; p.pos.y += p.bvy * dt; p.air += dt; if (p.pos.y < rideY) p.pos.y = rideY - 0.001; }
  p.afloat = true; p.surfaceY = wave; p.overLand = false; p.clearance = 0; p.ropeLen = 0.6;
  p.grounded = Math.abs(p.fs) < 6; p.landed = p.parked;

  if (p.target) {
    const an = p.target, d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
    if (d < (an.kind === 'islet' ? 26 : an.kind === 'deck' ? 15 : 13) && Math.abs(p.fs) < 6.5) { board(an, p); p.target = null; }
  }
  // (a pilot comes alongside, stops and throws the ring)
  p.throwCd = Math.max(0, (p.throwCd || 0) - dt);
  // (stopped right beside someone, the crew throws without being asked)
  const autoThrow = p.pro && Math.abs(p.fs) < 2 && waiting.some(an => !an.fire && !outOfReach(an, p) && Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z) < 11);
  if (p.pro && (inp.w || autoThrow) && p.throwCd <= 0 && room) {
    p.throwCd = 0.8;
    let best = null, bd = 1e9;
    for (const an of waiting) { if (inland(an) || an.fire) continue; const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z); if (d < bd) { bd = d; best = an; } }
    if (best && bd < (best.kind === 'islet' ? 26 : 17) && Math.abs(p.fs) < 4) { board(best, p); if (bd < 8) rate(p, 3, 'Right alongside'); else if (bd < 12) rate(p, 2, 'Good throw'); else rate(p, 1, 'Long throw!'); }
  }
  // ---- the water cannon: stopped (or nearly) close enough to a fire, the crew plays it on the flames until it is out
  const was = p.spray;
  p.spray = null;
  if (ready && Math.abs(p.fs) < 4.5 && !p.cargo.length && !p.incoming) for (const an of waiting) {
    if (burning(an) && an.fire.shore && Math.hypot(an.fire.x - p.pos.x, an.fire.z - p.pos.z) < 52) { p.spray = an; break; }
  }
  if (p.spray) {
    const F = p.spray.fire;
    if (!was) sfx.splash();
    const target = attackPoint(F, p.idx, p.pos);
    if (!was || !p.cannonAim) p.cannonAim = { ...target };
    for (const k of ['x','y','z']) p.cannonAim[k] += (target[k] - p.cannonAim[k]) * damp(2.5, dt);
    const aim = p.cannonAim, src = { x: p.pos.x + nfx * 2.6, y: p.pos.y + 2.6, z: p.pos.z + nfz * 2.6 };
    const distance = Math.hypot(aim.x - src.x, aim.z - src.z), tau = clamp(distance / 30, 0.45, 1.6);
    const direction = Math.atan2(aim.x - src.x, aim.z - src.z), elevation = Math.atan2(aim.y - src.y + 4.905 * tau * tau, distance);
    src.x += Math.sin(direction) * Math.cos(elevation) * 1.28; src.z += Math.cos(direction) * Math.cos(elevation) * 1.28; src.y += Math.sin(elevation) * 1.28;
    p.pumpPressure = Math.min(1, (p.pumpPressure || 0) + dt / 1.2);
    if (F.active > 0 && p.pumpPressure > .15) p.waterStream.update(src, { ...aim, time: tau }, .11 * p.pumpPressure, .28 * p.pumpPressure, p.pumpPressure); else p.waterStream.hide();
    p.jetAcc = (p.jetAcc || 0) + dt;
    if (F.active > 0 && p.pumpPressure >= .95 && p.jetAcc >= 0.08) {
      const dose = Math.min(p.jetAcc, 0.16); p.jetAcc = 0;
      launchWater(p, p.spray, src, { ...aim, time: tau, radius: WATER.boat.radius }, WATER.boat.capacity * dose, 'jet');
    }
    p.boat.monitor.rotation.y = angDiff(Math.atan2(aim.x - src.x, aim.z - src.z), p.yaw);
    p.boat.barrel.rotation.x = -Math.atan2(aim.y - src.y + 4.905 * tau * tau, distance);
    p.sprayT = (p.sprayT || 0) - dt;
    if (p.sprayT <= 0) { p.sprayT = 1.2; sfx.hiss(0.35); }
  }
  if (!p.spray) { p.waterStream.hide(); p.pumpPressure = Math.max(0, (p.pumpPressure || 0) - dt * 2); }
  p.boat.needle.rotation.x = 1.1 - (p.pumpPressure || 0) * 2.2;
  p.boat.crew.rotation.y += angDiff(p.boat.monitor.rotation.y, p.boat.crew.rotation.y) * damp(3, dt);
  p.boat.crew.rotation.x = p.spray ? -.13 + Math.sin(t * 12) * .015 : 0;
  p.dropCd -= dt;
  if (p.cargo.length && dockD < (p.pro ? 14 : 30) && Math.abs(p.fs) < (p.pro ? 2.5 : 10) && p.dropCd <= 0) { if (p.pro) rate(p, dockD < 8 ? 3 : 2, dockD < 8 ? 'Neat docking' : 'Docked'); deliverOne(p); p.dropCd = 0.45; }
  if (!p.parked && Math.abs(p.fs) < 1 && p.idleT > 3 && !p.cargo.length && !p.incoming && dockD < 70) { p.parked = true; }
  p.mode = p.target || p.incoming ? 'pickup' : (p.cargo.length && dockD < 120 ? 'deliver' : 'idle');

  // how it sits: bow lifts as it gets on the plane, leans into turns, rides the swell fore-and-aft and side-to-side
  const planing = clamp(Math.abs(p.fs) / 16, 0, 1);
  const wf = waveHeight(p.pos.x + nfx * 3, p.pos.z + nfz * 3, t), wb = waveHeight(p.pos.x - nfx * 3, p.pos.z - nfz * 3, t);
  const ws = waveHeight(p.pos.x - nfz * 1.5, p.pos.z + nfx * 1.5, t), wo = waveHeight(p.pos.x + nfz * 1.5, p.pos.z - nfx * 1.5, t);
  const pt = -(wf - wb) / 6 * 0.7 - planing * 0.1 - clamp((want - p.fs) * 0.006, -0.05, 0.07);
  const rt = clamp(-p.yawVel * Math.abs(p.fs) * 0.014, -0.4, 0.4) + (ws - wo) / 3 * 0.6;
  p.pitch += (pt - p.pitch) * damp(4, dt); p.roll += (rt - p.roll) * damp(3, dt);
  const rumble = p.spin * (1.1 - 0.8 * p.spin) * 0.03;
  const J = () => (Math.random() - 0.5) * rumble;
  m.group.position.set(p.pos.x + J(), p.pos.y + planing * 0.18 + J(), p.pos.z + J());
  m.group.rotation.set(p.pitch + J(), p.yaw, p.roll + J());
  for (const mo of m.motors) mo.rotation.y += (-p.yawVel * 0.35 - mo.rotation.y) * damp(6, dt);

  // rooster tail off the stern and spray from the bow
  const sp = Math.abs(p.fs);
  if (sp > 1.5) {
    p.washAcc += dt * sp * 7;
    while (p.washAcc > 1) {
      p.washAcc -= 1;
      const side = (Math.random() - 0.5) * 2;
      fx.emit(p.pos.x - nfx * 4 - nfz * side * 0.8, wave + 0.15, p.pos.z - nfz * 4 + nfx * side * 0.8, -nfx * sp * 0.3 - nfz * side * 2.5, 1 + Math.random() * sp * 0.2, -nfz * sp * 0.3 + nfx * side * 2.5, 0.92, 0.97, 1, 0.6, 0.3 + Math.random() * 0.5, 0.6 + Math.random() * 0.7, 9, 1.1);
      if (planing > 0.5 && Math.random() < 0.5) { const sd = Math.random() < 0.5 ? -1 : 1; fx.emit(p.pos.x + nfx * 2.2 - nfz * sd * 1.2, wave + 0.2, p.pos.z + nfz * 2.2 + nfx * sd * 1.2, -nfz * sd * (3 + Math.random() * 3) + nfx * sp * 0.4, 1.5 + Math.random() * 2.5, nfx * sd * (3 + Math.random() * 3) + nfz * sp * 0.4, 0.95, 0.98, 1, 0.5, 0.25 + Math.random() * 0.35, 0.5 + Math.random() * 0.5, 10, 1.2); }
    }
  }
  // blue and red flashers
  const blink = (t * 2.2 + p.idx * 0.5) % 1, on = p.spin > 0.03 ? 1 : 0;
  m.strobe.material.emissiveIntensity = blink < 0.5 ? 9 * on : 0.2;
  m.beacon.material.emissiveIntensity = blink >= 0.5 ? 9 * on : 0.2;
  p.cargo.forEach((an, i) => { if (an.state !== 'riding') return; an.model.position.y = SLOTS[i][1] + Math.abs(Math.sin(t * 5 + an.phase)) * 0.12; an.model.rotation.z = Math.sin(t * 4 + an.phase) * 0.08; feel(an, 1, 0, dt); });
  p.hornCd -= dt;
  if (inp.horn && p.hornCd <= 0) {
    p.hornCd = 0.45; sfx.honk(p.vehicle, p.idx);
    fx.emoji('\u{1F3B5}', p.pos.x, p.pos.y + 4, p.pos.z, 2.2);
    for (const an of waiting) if (an.pos.distanceTo(p.pos) < 90) an.excite = 2.5;
  }
  updateCamera(p, dt, t);
}

// ================================================================= winch + basket
const WINCH_SPEED = 10, WV = new THREE.Vector3();      // (m/s the winch winds the cable, at most)
function updateWinch(p, dt, t) {
  p.dropCd -= dt;
  // fighting a fire (and nobody aboard): the bucket is on the cable instead of the basket
  const bucket = !p.cargo.length && !p.incoming && (!!p.fireJob || p.water > 0);
  p.cage.visible = !bucket; p.bucket.visible = bucket;
  if (bucket) {
    const w = p.bucket.userData.water; w.visible = p.water > .03;
    w.position.y = .2 + 1.35 * p.water; w.scale.setScalar(.76 + p.water * .24);
    w.rotation.set(-Math.PI / 2 + Math.sin(t * 3) * .035, Math.cos(t * 2) * .035, 0);
    p.bucket.userData.valve.rotation.z += ((p.attack ? -1.3 : 0) - p.bucket.userData.valve.rotation.z) * damp(12, dt);
  }
  // The cabin door opens before the fixed hoist lowers a load.
  const needHoist = !p.grounded && (p.target || bucket || p.incoming > 0 || p.cargo.length > 0 || (p.pro && (p.input.w || p.winch > 0.1)));
  const was = p.hoist;
  p.hoist = clamp(p.hoist + (needHoist ? dt / 0.55 : -dt / 0.9), 0, 1);
  if (needHoist && was === 0) sfx.door();
  const hz = p.hoist * p.hoist * (3 - 2 * p.hoist);
  const open = Math.min(1, hz * 1.6);
  p.heli.door.position.set(DOOR_OPEN.x * open, 0, DOOR_OPEN.z * open);
  const out = clamp((hz - 0.3) / 0.7, 0, 1);
  // Fixed hoist attachment in world space.
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  p.hook.set(p.pos.x + HOIST.px * cy + HOIST.z * sy, p.pos.y + HOIST.y, p.pos.z - HOIST.px * sy + HOIST.z * cy);
  const hookY = p.hook.y, ready = out > 0.85;
  const nearBase = Math.hypot(p.pos.x, p.pos.z) < 42;
  let mode = 'idle';

  // choose who to help: the nearest friend in reach. Once chosen we stick with them until they're aboard.
  if (p.target && (p.target.state !== 'waiting' || Math.hypot(p.target.pos.x - p.pos.x, p.target.pos.z - p.pos.z) > 48)) { if (p.target.claimed === p) p.target.claimed = null; p.target = null; }
  if (p.pro) { if (p.target) { p.target.claimed = null; p.target = null; } }
  else if (!p.target && !p.parked && !bucket && p.cargo.length + p.incoming < MAX_CARGO) {
    let bd = 20;
    for (const an of waiting) {
      if (an.kind === 'camp' || an.fire || (an.claimed && an.claimed !== p)) continue;      // (campers are fetched by landing, not by basket)
      const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
      if (d < bd && hookY - an.pos.y > 2) { bd = d; p.target = an; }
    }
    if (p.target) { p.target.claimed = p; sfx.winch(); }
  }

  // where the basket wants to be
  const b = p.bpos, bv = p.bvel;
  let tx = p.hook.x, ty = hookY - 0.6 - BASKET_TOP, tz = p.hook.z, om = 12;
  if (p.pro) {
    // the pilot's own winch: hold the button and the cable runs out straight down; let go and it winds back in.
    // The longer the cable, the more the basket trails behind the helicopter, so a steady hover is what lands it
    if (p.incoming === 0) p.winch = clamp(p.winch + (p.input.w && ready ? 7 : -9) * dt, 0, 60);
    if (p.incoming > 0) om = 0;
    else { ty -= p.winch; om = 12 / (1 + p.winch * 0.13); if (p.input.w) mode = 'pickup'; }
  } else if (bucket && ready) {
    // empty and over the sea, going slowly: the bucket goes down into the water; otherwise it hangs a little below
    surfaceAt(p.hook.x, p.hook.z, t, SURF2);
    if (!p.attack && p.water < 1 && !SURF2.land && Math.hypot(p.vel.x, p.vel.z) < 9) { mode = 'dip'; ty = SURF2.y - 1.0; om = 4.5; }
    else { ty -= 2.5; om = 6; }
  } else if (p.target && ready) {
    mode = 'pickup'; om = 5.5;
    tx = p.target.pos.x; ty = p.target.pos.y + 0.1; tz = p.target.pos.z;
  } else if (p.incoming > 0) {
    mode = 'pickup'; om = 0;                      // wait right there while a friend is mid-hop
  } else if (p.cargo.length && nearBase && !p.grounded && ready) {
    mode = 'deliver'; om = 4.5;
    ty = BASE_Y + 0.4;
  }
  // critically damped spring: quick, smooth, never overshoots or swings wildly
  if (om > 0) {
    const k2 = om * om, c = 2 * om;
    bv.x += ((tx - b.x) * k2 - bv.x * c) * dt; bv.y += ((ty - b.y) * k2 - bv.y * c) * dt; bv.z += ((tz - b.z) * k2 - bv.z * c) * dt;
    // (but never faster than the winch can wind, relative to the helicopter: an empty basket a long way down comes up
    // over a couple of seconds, not in a blink)
    WV.subVectors(bv, p.vel); const rel = WV.length();
    if (rel > WINCH_SPEED) bv.copy(p.vel).addScaledVector(WV, WINCH_SPEED / rel);
    b.addScaledVector(bv, dt);
  } else bv.set(0, 0, 0);
  const bs = surfaceAt(b.x, b.z, t, SURF2);
  const bFloor = bs.y + (bs.land ? 0.05 : bucket && p.water < 1 ? -1.3 : -0.3);
  if (b.y < bFloor) { b.y = bFloor; bv.y = Math.max(bv.y, 0); if (p.pro) p.winch = Math.min(p.winch, hookY - 0.6 - BASKET_TOP - bFloor + 0.4); }
  if (b.y > hookY - 0.6 - BASKET_TOP) b.y = hookY - 0.6 - BASKET_TOP;
  p.ropeLen = Math.max(0.6, hookY - b.y - BASKET_TOP);

  // The basket stays inside the cabin until the door has opened.
  const sc = Math.max(0.001, out);
  p.basket.position.copy(b); p.basket.scale.setScalar(sc);
  p.basket.rotation.set(clamp(-(b.z - p.pos.z) * 0.03, -0.35, 0.35), p.yaw, clamp((b.x - p.pos.x) * 0.03, -0.35, 0.35));
  p.basket.visible = sc > 0.02;

  // rope
  V.copy(p.hook); V2.set(b.x, b.y + BASKET_TOP * sc, b.z);
  const rl = V.distanceTo(V2);
  p.rope.visible = p.basket.visible && rl > 0.05;
  p.rope.position.copy(V).lerp(V2, 0.5);
  p.rope.scale.set(1, Math.max(rl, 0.01), 1);
  if (rl > 0.01) p.rope.quaternion.setFromUnitVectors(UP, V2.sub(V).multiplyScalar(1 / rl));

  // the bucket fills while it is under water, and empties itself once it is over a fire
  if (bucket) {
    if (!p.attack && p.water < 1 && !bs.land && b.y < bs.y + 0.1) {
      p.water = Math.min(1, p.water + dt / 0.9);
      if (Math.random() < 0.5) fx.splash(b.x, bs.y, b.z, 3, 0.5);
      if (p.water >= 1) { waterAboard(p); bv.y -= 2.5; fx.splash(b.x, bs.y, b.z, 22, 0.9); }
    }
    if (p.water >= 0.99 && !p.attack && p.fireJob) {
      const aim = p.fireAim;
      const hit = predictDrop({ x: b.x, y: b.y + 0.4, z: b.z }, p.vel, aim.y, 'heli', WIND);
      if ((Math.hypot(hit.x - aim.x, hit.z - aim.z) < 5.5 && b.y > aim.y + 1 && b.y < aim.y + 45) || (p.pro && p.input.w && bs.land)) dump(p, p.fireJob);
    }
  }

  // friend hops aboard as soon as the basket is close
  if (p.target && Math.hypot(b.x - p.target.pos.x, b.z - p.target.pos.z) < 3.2 && Math.abs(b.y - p.target.pos.y) < 2.6) { board(p.target, p); p.target = null; }
  if (p.pro && p.winch > 1 && !bucket && p.cargo.length + p.incoming < MAX_CARGO) for (const an of waiting) {
    if (an.kind === 'camp' || an.fire || Math.hypot(b.x - an.pos.x, b.z - an.pos.z) > 3.2 || Math.abs(b.y - an.pos.y) > 2.6) continue;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    board(an, p);
    if (sp < 1.5) rate(p, 3, 'Rock-steady hover'); else if (sp < 4) rate(p, 2, 'Nice pickup'); else rate(p, 1, 'Snatched it!');
    break;
  }

  // set down at the base
  if (p.cargo.length && p.dropCd <= 0) {
    if (p.grounded && nearBase && (p.parked || p.pro)) { deliverOne(p); p.dropCd = 0.4; }
    else if ((mode === 'deliver' || (p.pro && nearBase && p.winch > 1)) && b.y < BASE_Y + 1.6) { deliverOne(p); p.dropCd = 0.4; }
  }
  p.mode = mode;

  // riders jiggle
  p.cargo.forEach((an, i) => { if (an.state !== 'riding') return; an.model.position.y = SLOTS[i][1] + Math.abs(Math.sin(t * 5 + an.phase)) * 0.12; an.model.rotation.z = Math.sin(t * 4 + an.phase) * 0.08; });
}
const SURF2 = { y: 0, land: false };
const UP = new THREE.Vector3(0, 1, 0);

// ================================================================= camera
function updateCamera(p, dt, t) {
  const pro = p.pro, sp = Math.hypot(p.vel.x, p.vel.z);
  p.camYaw += angDiff(p.yaw, p.camYaw) * damp(p.vehicle === 'plane' ? 2.0 : pro ? 1.9 : 2.6, dt);
  const ext = Math.max(0, p.ropeLen - 0.6);
  p.camG += ((p.grounded ? 1 : 0) - p.camG) * damp(p.grounded ? 1.3 : 0.9, dt);
  const pl = p.vehicle === 'plane', bt = p.vehicle === 'boat';
  const dist = lerp((pl ? 27 : bt ? 17 : 19) + ext * 0.42, pl ? 17 : bt ? 11.5 : 12.5, p.camG), height = lerp((pl ? 9 : bt ? 6 : 7.5) + ext * 0.3, pl ? 4.6 : bt ? 4 : 3.4, p.camG);
  const incident = p.fireJob?.fire;
  const fireView = incident && (waterReady(p) || p.spray || game.t < (p.waterViewUntil || 0)) ? clamp(1 - Math.hypot(p.pos.x - incident.x, p.pos.z - incident.z) / 90, 0, 1) : 0;
  const back = dist + (pro ? sp * 0.2 : 0) + fireView * (bt ? 14 : 17);
  const vx = p.pos.x, vy = p.pos.y, vz = p.pos.z;
  let cx = vx - Math.sin(p.camYaw) * back, cz = vz - Math.cos(p.camYaw) * back;
  let cy = vy + height + (pro ? sp * 0.04 : 0) + fireView * 12;
  const fov = (activePlayers().length > 1 ? 66 : 58) + (pro ? sp * 0.36 : 0);
  if (Math.abs(p.cam.fov - fov) > 0.05) { p.cam.fov += (fov - p.cam.fov) * damp(3, dt); p.cam.updateProjectionMatrix(); }
  // Keep the view clear. Towers, rocks and huts: the camera steps sideways until the line from it to the machine
  // passes them by. Going through the arch (the one easy obstacle) it drops low behind, to see through and not
  // into the rock over the gap...
  for (const o of OBSTACLES) {
    const ox = o.x - vx, oz = o.z - vz, dv = Math.hypot(ox, oz);
    if (o.easy) { if (dv < o.r) cy = lerp(cy, Math.min(cy, vy + 1.5), THREE.MathUtils.smoothstep(o.r - dv, 0, 8) * clamp((14 - vy) / 4, 0, 1)); continue; }
    const R = Math.min(Math.max(o.r + 2, (o.wr || 0) + 3), dv);      // (the arch's feet spread wider than they stand)
    if (dv < o.r || dv > back + R) continue;
    const sx = cx - vx, sz = cz - vz, L = Math.hypot(sx, sz) + 1e-6, f = clamp((ox * sx + oz * sz) / (L * L), 0, 1);
    let qx = vx + sx * f - o.x, qz = vz + sz * f - o.z, d = Math.hypot(qx, qz);
    const over = clamp((o.top + 4 - vy - (cy - vy) * f) / 4, 0, 1);      // (fading out as the line clears its top)
    if (d >= R || !over) continue;
    if (d < 0.05) { qx = -sz / L * 0.05; qz = sx / L * 0.05; d = 0.05; }      // (dead behind it: pick a side)
    const push = Math.min((R - d) / Math.max(f, 0.35), 10) * over / d;
    cx += qx * push; cz += qz * push;
  }
  // ...and hills and treetops: it rises until it stands over them and looks down past them, easing up and down
  // (never into the ground itself, though)
  const floor = Math.max(terrainHeight(cx, cz), 0.8);
  let need = floor + canopyAt(cx, cz) + 2.2 - cy;
  for (let f = 0.3; f < 0.9; f += 0.25) {
    const x = vx + (cx - vx) * f, z = vz + (cz - vz) * f;
    const over = Math.max(terrainHeight(x, z), 0.8) + canopyAt(x, z) + 1.2 - (vy + (cy - vy) * f);
    if (over > 0) need = Math.max(need, over / f);
  }
  need = clamp(need, 0, 22);
  p.camLift = (p.camLift || 0) + (need - (p.camLift || 0)) * damp(need > (p.camLift || 0) ? 3.5 : 1.1, dt);
  cy = Math.max(cy + p.camLift, floor + 2.2);
  V.set(cx, cy, cz);
  p.camPos.lerp(V, damp(5, dt));
  const lead = p.vehicle === 'plane' ? 9 : p.vehicle === 'boat' ? 7 : 5;
  V.set(p.pos.x + Math.sin(p.yaw) * lead, p.pos.y + 1.2 - ext * 0.36, p.pos.z + Math.cos(p.yaw) * lead);
  if (fireView > 0) { V.x = lerp(V.x, incident.x, fireView * 0.45); V.z = lerp(V.z, incident.z, fireView * 0.45); V.y = lerp(V.y, incident.y + 2, fireView * 0.3); }
  p.camLook.lerp(V, damp(7, dt));
  p.cam.position.copy(p.camPos);
  const sh = reducedMotion.matches ? 0 : p.shake * p.shake * 0.5 + (p.grounded ? p.spin * (1.1 - 0.8 * p.spin) * 0.07 : 0);
  if (sh > 0) { p.cam.position.x += (Math.random() - 0.5) * sh; p.cam.position.y += (Math.random() - 0.5) * sh; p.cam.position.z += (Math.random() - 0.5) * sh; }
  p.cam.lookAt(p.camLook);
}

// ================================================================= animals
let animalSerial = 0;
function pickType() {
  const present = new Set(waiting.map(a => a.type.id));
  players.forEach(p => p.cargo.forEach(c => present.add(c.type.id)));
  const fresh = ANIMAL_TYPES.filter(tp => !present.has(tp.id));
  const pool = fresh.length ? fresh : ANIMAL_TYPES;
  return pool[(play() * pool.length) | 0];
}
// where a friend waits at a landing site: clear of the pad's rim and of where the helicopter sets down, still on the
// level ground, and on the side of it looking out over open ground rather than into the trees
function campSpot(site) {
  const d = Math.min(8.2, site.r - 0.8), a0 = play() * 6.283;
  let best = a0, bs = 1e9;
  for (let i = 0; i < 12; i++) {
    const a = a0 + i * 0.5236, ca = Math.cos(a), sa = Math.sin(a);
    // (never in the doorway of the ski hut beside the pad)
    if (site.block && Math.hypot(site.x + ca * d - site.block.x, site.z + sa * d - site.block.z) < site.block.r + 1.5) continue;
    let s = 0;
    for (const r of [site.r + 4, site.r + 9, site.r + 15]) { const x = site.x + ca * r, z = site.z + sa * r; s += canopyAt(x, z) + Math.max(0, terrainHeight(x, z) - site.y); }
    if (s < bs - 0.5) { bs = s; best = a; }
  }
  return { x: site.x + Math.cos(best) * d, z: site.z + Math.sin(best) * d };
}
const pickOf = list => (list && list.length ? list[(play() * list.length) | 0] : null);
// can the seaplane get to this friend? (not for a while after it gave up on them; otherwise, is there a place to land near them)
function planeOk(an) {
  if (an.noPlaneUntil && game.t < an.noPlaneUntil) return false;
  return planeCanReach(an.pos.x, an.pos.z);
}
// can this team get to a friend at (x, z)? A seaplane on its own only where it can land near them
const teamReaches = (x, z) => activePlayers().some(p => p.vehicle !== 'plane') || planeCanReach(x, z);
function spawnAnimal(near) {
  if (waiting.length >= maxWaiting()) return;
  // Retry locally; never send a fixed-location outing to another region.
  if (game.fire) { if (spawnFire(game.zone)) game.fireMiss = 0; else game.fireMiss++; return; }
  if (game.zone.id !== 'home') { spawnInZone(game.zone); return; }
  const maxD = near ? 130 : HOME_R - 20;
  const heliUp = activePlayers().some(p => p.vehicle === 'heli');
  if (!near && !game.boat && play() < 0.16 && waiting.length + 3 <= maxWaiting() && spawnBoat(maxD, world.spawn.sea)) return;
  const homeLedges = world.spawn.ledges.filter(l => l.zone === 'home'), homeStacks = world.spawn.stacks.filter(l => l.zone === 'home');
  let spot = null, kind = 'ring', site = null;
  for (let tries = 0; tries < 40 && !spot; tries++) {
    const r = play();
    let c;
    site = null;
    if (r < 0.22 && heliUp && !near) {
      // someone waiting on an island, where only a landing will do
      const free = SITES.filter(q => !q.busy && q.zone === 'home');
      if (!free.length) continue;
      site = free[(play() * free.length) | 0]; kind = 'camp';
      c = campSpot(site);
    }
    else if (r < 0.3 && heliUp && !near && homeLedges.length) {
      // a climber stuck on a sea cliff: only the basket can reach
      c = pickOf(homeLedges); kind = 'ledge';
    }
    else if (r < 0.36 && !near && activePlayers().some(q => q.vehicle !== 'plane')) { c = HUTS[(play() * HUTS.length) | 0].porch; kind = 'hut'; }
    else if (r < 0.5) { c = ISLETS[(play() * ISLETS.length) | 0]; kind = 'islet'; }
    else if (r < 0.56 && homeStacks.length) { c = pickOf(homeStacks); kind = 'raft'; }
    else if (r < 0.62) { c = world.spawn.sea[(play() * world.spawn.sea.length) | 0]; kind = 'kayak'; }
    else if (r < 0.68) { c = world.spawn.sea[(play() * world.spawn.sea.length) | 0]; kind = 'dinghy'; }
    else { c = world.spawn.sea[(play() * world.spawn.sea.length) | 0]; kind = r < 0.82 ? 'raft' : 'ring'; }
    if (Math.hypot(c.x, c.z) > maxD) continue;
    if (!site && kind !== 'ledge' && kind !== 'hut' && !teamReaches(c.x, c.z)) continue;
    // (anyone afloat bobs in clear water, with room for a hull to come alongside, never up against a rock)
    if (!site && kind !== 'ledge' && kind !== 'hut' && kind !== 'islet' && rockNear(c.x, c.z, 8)) continue;
    if (waiting.some(a => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 45)) continue;
    spot = c;
  }
  if (!spot) return;
  const an = addWaiting(kind, spot.x, spot.z, site ? { site } : null);
  if (site) site.busy = true;
  fx.emoji('\u2757', an.pos.x, an.pos.y + 5, an.pos.z, 3.5);
  sfx.newFriend();
}
// What can happen in each far zone, and who can help: 'heli' only the helicopter's basket or a landing (and the forest's
// little lake, too small for a seaplane and out of any boat's reach), 'fly' the helicopter or the seaplane, 'all' anybody.
const AFLOAT = new Set(['raft', 'ring', 'kayak', 'dinghy', 'floe']);
function zoneChoices(Z) {
  const sea = world.spawn.zoneSea[Z.id] || [];
  const sites = SITES.filter(s => s.zone === Z.id && !s.busy);
  const ledges = world.spawn.ledges.filter(l => l.zone === Z.id), stacks = world.spawn.stacks.filter(l => l.zone === Z.id);
  const islets = ZONE_ISLETS.filter(s => s.zone === Z.id && !s.head);
  const C = [];
  const add = (w, kind, spot, who = 'all', extra = null) => C.push({ w, kind, spot, who, extra });
  add(1.5, 'raft', () => pickOf(sea)); add(0.8, 'kayak', () => pickOf(sea));
  if (islets.length) add(1, 'islet', () => pickOf(islets));
  if (sites.length) add(2, 'camp', () => { const s = pickOf(sites); return s && { ...campSpot(s), site: s }; }, 'heli');
  if (ledges.length) add(1.5, 'ledge', () => pickOf(ledges), 'heli');
  if (stacks.length) add(0.8, 'raft', () => pickOf(stacks));
  if (Z.id === 'forest') {
    add(2, 'perch', () => world.towerDeck, 'heli');
    add(2.5, 'kayak', () => { const a = play() * 6.283, d = play() * LAKE.r * 0.45; return { x: LAKE.x + Math.cos(a) * d, z: LAKE.z + Math.sin(a) * d }; }, 'heli', { landlocked: true });
    add(1.2, 'kayak', () => pickOf(sea));
  } else if (Z.id === 'reef') {
    add(2.5, 'ring', () => pickOf(sea)); add(1, 'islet', () => pickOf(islets));
  } else if (Z.id === 'harbour') {
    add(2.5, 'perch', () => pickOf(world.roofs), 'heli'); add(2, 'islet', () => world.breakwaterHead); add(1.5, 'dinghy', () => pickOf(sea));
  } else if (Z.id === 'snow') {
    add(3.5, 'floe', () => pickOf(sea));
  } else if (Z.id === 'volcano') {
    add(1.5, 'dinghy', () => pickOf(sea)); add(1, 'ring', () => pickOf(sea));
  }
  return C;
}
function spawnInZone(Z) {
  const act = activePlayers(), heliUp = act.some(p => p.vehicle === 'heli'), flyUp = heliUp || act.some(p => p.vehicle === 'plane');
  const room = maxWaiting() - waiting.length;
  // the crew of the wreck on the reef, or a fishing boat broken down off the harbour
  if (Z.id === 'reef' && heliUp && !world.wreck.crew && room >= 2 && play() < 0.3 && spawnWreck()) return;
  if ((Z.id === 'harbour' || Z.id === 'reef') && !game.boat && room >= 3 && play() < 0.2 && spawnBoat(Infinity, world.spawn.zoneSea[Z.id])) return;
  const C = zoneChoices(Z).filter(c => c.who === 'all' || (c.who === 'heli' ? heliUp : flyUp));
  const total = C.reduce((n, c) => n + c.w, 0);
  for (let tries = 0; tries < 40; tries++) {
    let r = play() * total, c = C[0];
    for (const q of C) { r -= q.w; if (r <= 0) { c = q; break; } }
    const s = c.spot();
    if (!s) continue;
    if (AFLOAT.has(c.kind) && !(c.extra && c.extra.landlocked) && rockNear(s.x, s.z, 8)) continue;
    if ((AFLOAT.has(c.kind) || c.kind === 'islet') && !teamReaches(s.x, s.z)) continue;
    if (waiting.some(a => Math.hypot(a.pos.x - s.x, a.pos.z - s.z) < (c.kind === 'perch' ? 10 : 30))) continue;
    const extra = { ...(c.extra || {}) };
    if (s.site) extra.site = s.site;
    if (c.kind === 'perch') extra.perchY = s.y;
    if (c.kind === 'floe') extra.prefer = 'penguin';
    const an = addWaiting(c.kind, s.x, s.z, extra);
    if (s.site) s.site.busy = true;
    fx.emoji('\u2757', an.pos.x, an.pos.y + 5, an.pos.z, 3.5);
    sfx.newFriend();
    return;
  }
}
// two of the wreck's old crew, back aboard her for a look and stranded when the tide came in: winched off one by one
const WRECK_SPOTS = [[0.4, -4.4], [-0.3, -6.8]];
function spawnWreck() {
  const B = world.wreck;
  for (let i = 0; i < 2; i++) { addWaiting('wreck', B.x, B.z, { boat: B, off: WRECK_SPOTS[i] }); B.crew++; }
  fx.emoji('\u{1F198}', B.x, 12, B.z, 4.5);
  sfx.newFriend();
  return true;
}
// A fishing boat broken down and smoking, with her crew waiting on deck to be winched off one by one.
// When the last of them is safe she gets her engine going again and motors away.
const DECK_SPOTS = [[1.3, -4.2], [-1.3, -6.6], [1.1, -8.6]];
function spawnBoat(maxD, list) {
  let spot = null;
  for (let tries = 0; tries < 30 && !spot && list.length; tries++) {
    const c = list[(play() * list.length) | 0];
    if (Math.hypot(c.x, c.z) > maxD || Math.hypot(c.x, c.z) < 90 || rockNear(c.x, c.z, 24)) continue;
    if (waiting.some(a => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 55) || !teamReaches(c.x, c.z)) continue;
    spot = c;
  }
  if (!spot) return false;
  const hull = new THREE.Color().setHSL(Math.random(), 0.6, 0.22);
  const B = { x: spot.x, z: spot.z, y: 0, yaw: play() * 6.283, deck: 1.7, crew: 0, leaving: 0, puff: 0, mesh: model('World_Boat', { tints: { Navy: hull } }) };
  B.mesh.scale.setScalar(1.5); B.mesh.rotation.order = 'YXZ'; B.mesh.userData.farHide = 600;
  scene.add(B.mesh);
  game.boat = B;
  const n = 2 + (play() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) { addWaiting('deck', B.x, B.z, { boat: B, off: DECK_SPOTS[i] }); B.crew++; }
  fx.emoji('\u{1F198}', B.x, 12, B.z, 4.5);
  sfx.newFriend();
  return true;
}
function boatFriendOff(B) { if (--B.crew <= 0 && !B.wreck) { B.leaving = 0.01; sfx.shipHorn(); fx.emoji('\u{1F44B}', B.x, 12, B.z, 4); } }
function updateBoatRescue(dt, t) {
  const B = game.boat; if (!B) return;
  if (B.leaving) {
    B.leaving += dt;
    const sp = Math.min(B.leaving * 2.2, 9);
    // (she swings toward open water before she gathers way, and round any island or rock in her path)
    const clear = a => { const x = B.x + Math.sin(a) * 26, z = B.z + Math.cos(a) * 26; return terrainHeight(x, z) < -3 && !rockNear(x, z, 12); };
    if (clear(B.yaw)) { B.yaw += angDiff(Math.atan2(B.x, B.z), B.yaw) * damp(0.5, dt); B.dodge = 0; }
    else { B.dodge = B.dodge || (clear(B.yaw + 0.8) || !clear(B.yaw - 0.8) ? 1 : -1); B.yaw += B.dodge * 0.5 * dt; }
    const px = B.x, pz = B.z, go = B.dodge ? sp * 0.4 : sp;
    B.x += Math.sin(B.yaw) * go * dt; B.z += Math.cos(B.yaw) * go * dt;
    aground(B, px, pz, Math.sin(B.yaw), Math.cos(B.yaw), 10.5);
    fendOff(B, B.yaw, 7.2, 3.3, 0);
    if (Math.random() < dt * sp * 2) fx.emit(B.x - Math.sin(B.yaw) * 10, 0.3, B.z - Math.cos(B.yaw) * 10, (Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2, 0.92, 0.97, 1, 0.5, 0.9, 1.2, 2, 1);
    if (B.leaving > 45 || Math.hypot(B.x, B.z) > WORLD_R + 260) { scene.remove(B.mesh); game.boat = null; return; }
  } else {
    // she drifts downwind while she waits (never onto the shallows)
    windAt(B.x, B.z, t, WIND);
    // (nor onto a rock: she stops while there is still a hull's length of water between)
    const nx = B.x + WIND.x * 0.1 * dt, nz = B.z + WIND.z * 0.1 * dt, wl = Math.hypot(WIND.x, WIND.z) || 1, ax = nx + WIND.x / wl * 22, az = nz + WIND.z / wl * 22;
    if (terrainHeight(ax, az) < -6 && !rockNear(ax, az, 12) && !rockNear(nx, nz, 14) && Math.hypot(nx, nz) < WORLD_R - 40) { B.x = nx; B.z = nz; }
    // smoke from the engine hatch, so she can be found from far off
    B.puff -= dt;
    if (B.puff <= 0) {
      B.puff = 0.09;
      const k = 0.16 + Math.random() * 0.1;
      fx.emit(B.x + Math.sin(B.yaw) * 1.5, B.y + 4, B.z + Math.cos(B.yaw) * 1.5, 0.6 + (Math.random() - 0.5), 3.2, 0.3 + (Math.random() - 0.5), k, k, k, 0.5, 2.2 + Math.random() * 1.6, 3.2 + Math.random(), -0.6, 0.35);
    }
  }
  const fx_ = Math.sin(B.yaw), fz_ = Math.cos(B.yaw);
  const h0 = waveHeight(B.x, B.z, t), hf = waveHeight(B.x + fx_ * 7, B.z + fz_ * 7, t), hs = waveHeight(B.x + fz_ * 3, B.z - fx_ * 3, t);
  B.y = h0 - 0.15;
  B.mesh.position.set(B.x, B.y, B.z);
  B.mesh.rotation.set(-(hf - h0) / 7 * 0.8, B.yaw, (hs - h0) / 3 * 0.6);
}
// ================================================================= fires
// A fire in the trees at the edge of an island landing site, with a friend waiting on the site, or on a rooftop in
// Harbour Town with a friend on the roof next door. The helicopter dips its bucket in the sea and drops it on the
// flames; the seaplane skims a tankful off the sea and drops it from overhead; the boat comes in close below and plays
// its water cannon on it. When the last of it is out, the friend is safe where they are and counts as helped.
const fading = [];
const jit = (a = 1) => (Math.random() - 0.5) * 2 * a;
function openWater(x, z, clear) {
  if (Math.hypot(x, z) > WORLD_R - 45 || terrainHeight(x, z) > -2.5 || rockNear(x, z, clear)) return false;
  for (let k = 0; k < 6; k++) { const a = k * 1.047; if (terrainHeight(x + Math.cos(a) * clear, z + Math.sin(a) * clear) > -1.5) return false; }
  return true;
}
// the nearest open water between `from` and `to` metres from (x, z); `skip` turns down some of it
function nearestWater(x, z, from, to, clear, skip) {
  for (let r = from; r <= to; r += 5) for (let k = 0; k < 24; k++) {
    const a = k * 0.2618 + r * 0.37, wx = x + Math.cos(a) * r, wz = z + Math.sin(a) * r;
    if (openWater(wx, wz, clear) && !(skip && skip(wx, wz))) return { x: wx, z: wz };
  }
  return null;
}
const inLagoon = (x, z) => Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.r + 8;
const inLake = (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 10;
function makeFire(x, z, y, r, roof = false, asset = null) {
  const dip = nearestWater(x, z, 22, 240, 12, inLagoon);
  if (!dip) return null;
  const shore = nearestWater(x, z, 10, 40, 6, (wx, wz) => inLake(wx, wz));
  const scoop = nearestWater(x, z, 35, 320, 24, (wx, wz) => inLagoon(wx, wz) || inLake(wx, wz));
  const field = createFireField({ x, z, y: roof ? y : terrainHeight(x, z), radius: roof ? 4.6 : 15 + Math.min(4, game.mission),
    spacing: roof ? 2.3 : 4.8, roof, protectedAreas: asset ? [{ ...asset, r: 6 }] : [],
    sample: (wx, wz) => SITES.some(s => Math.hypot(s.x - wx, s.z - wz) < s.r + 2) ? null : ({ y: terrainHeight(wx, wz), canopy: canopyAt(wx, wz) }) });
  if (field.cells.length < 7) return null;
  field.groundY = field.y;
  field.y = Math.max(...field.cells.map(c => c.y + Math.min(c.canopy * 0.6, 12)));
  Object.assign(field, { dip, shore, scoop, hiss: 0, steamAcc: 0, vis: 1, label: roof ? 'Rooftop fire' : 'Island fire' });
  field.visual = buildFireScene(scene, field);
  world.trackFire(field);
  return field;
}
// in the trees at the edge of a landing site, the friend on the far side of the site from it
function siteFire(s, wantShore) {
  const a0 = play() * 6.283;
  let best = null, bs = -1e9;
  for (let i = 0; i < 10; i++) {
    const a = a0 + i * 0.628, d = s.r + 6.5, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, g = terrainHeight(x, z);
    if (g < 1) continue;
    const c = canopyAt(x, z), sc = Math.min(c, 6) + (nearestWater(x, z, 10, 40, 6) ? (wantShore ? 20 : 4) : 0) + play() * 2;      // (where the boat's cannon can reach it, when a boat is out)
    if (sc > bs) { bs = sc; best = { a, x, z, y: g + Math.max(c - 2, 0.4) }; }
  }
  if (!best) return null;
  const fd = Math.min(7.5, s.r - 1.2), asset = { x: s.x - Math.cos(best.a) * fd, z: s.z - Math.sin(best.a) * fd };
  const F = makeFire(best.x, best.z, best.y, 5.5, false, asset);
  if (!F) return null;
  F.label = 'Woodland fire';
  return { kind: 'camp', x: s.x - Math.cos(best.a) * fd, z: s.z - Math.sin(best.a) * fd, extra: { site: s, fire: F } };
}
function roofFire() {
  const R = world.roofs, r1 = pickOf(R);
  if (!r1) return null;
  const next = R.filter(q => { const d = Math.hypot(q.x - r1.x, q.z - r1.z); return d > 9 && d < 26; });
  if (!next.length) return null;
  const r2 = pickOf(next), F = makeFire(r1.x, r1.z, r1.y + 0.5, 8, true, r2);
  if (F) F.label = 'Rooftop fire';
  return F && { kind: 'perch', x: r2.x, z: r2.z, extra: { perchY: r2.y, fire: F } };
}
function coastalFire(Z) {
  for (let i = 0; i < 50; i++) {
    const a = play() * Math.PI * 2, d = Math.sqrt(play()) * Z.r;
    const x = Z.x + Math.cos(a) * d, z = Z.z + Math.sin(a) * d, y = terrainHeight(x, z);
    if (y < 1 || y > 16 || !nearestWater(x, z, 10, 38, 6, inLake)) continue;
    const fx = x + 7, fz = z + 3, fy = terrainHeight(fx, fz);
    if (fy < 1 || Math.abs(fy - y) > 4) continue;
    const F = makeFire(fx, fz, fy + Math.max(0.5, canopyAt(fx, fz) - 2), 4.5, false, { x, z });
    if (F) { F.label = 'Shoreline fire'; return { kind: 'perch', x, z, extra: { perchY: y + 0.2, fire: F } }; }
  }
  return null;
}
function spawnFire(Z) {
  const act = activePlayers(), makers = [];
  const wantShore = act.some(p => p.vehicle === 'boat');
  for (const s of SITES) if (s.zone === Z.id && !s.busy && !s.block) makers.push(() => siteFire(s, wantShore));
  if (Z.id === 'harbour') for (let i = 0; i < 4; i++) makers.push(roofFire);
  for (let i = 0; i < 3; i++) makers.push(() => coastalFire(Z));
  for (let tries = 0; tries < 6 && makers.length; tries++) {
    const r = makers.splice((play() * makers.length) | 0, 1)[0]();
    if (!r) continue;
    if (!act.some(p => canFight(p, r.extra.fire))) { disposeFire(r.extra.fire); continue; }
    if (waiting.some(a => Math.hypot(a.pos.x - r.x, a.pos.z - r.z) < 30)) { disposeFire(r.extra.fire); continue; }
    const an = addWaiting(r.kind, r.x, r.z, r.extra);
    if (r.extra.site) r.extra.site.busy = true;
    r.extra.fire.asset = { x: r.x, z: r.z };
    an.beam.visible = false;
    fx.emoji('\u{1F525}', r.extra.fire.x, r.extra.fire.y + 6, r.extra.fire.z, 4.5);
    sfx.newFriend();
    return true;
  }
  return false;
}
// who this pilot is fighting a fire for: the nearest friend in need, when that is someone with a fire beside them
function waterReady(p) { return p.water >= 0.99 || !!p.attack; }
function updateFireJob(p) {
  const j = p.fireJob;
  if (j && (!burning(j) || j.state !== 'waiting' || p.cargo.length || p.incoming || !canFight(p, j.fire))) { if (j.claimed === p) j.claimed = null; p.fireJob = null; p.attack = null; }
  if (!p.fireJob && !p.cargo.length && !p.incoming && !p.target && !p.pickup) {
    const g = nearestFor(p);
    if (g && burning(g.an)) p.fireJob = g.an;
  }
  if (p.fireJob && (!p.attack && (!p.fireAim || game.t > (p.aimUntil || 0)))) {
    p.fireAim = attackPoint(p.fireJob.fire, p.idx, p.vehicle === 'boat' ? p.pos : null); p.aimUntil = game.t + 0.8;
  }
}
function waterAboard(p) { sfx.splash(); p.flash = p.vehicle === 'plane' ? 'Tank full · line up a water run' : 'Bucket full · tackle the fire front'; p.flashT = 2.5; }
const pours = [];
function removeBeam(an) {
  if (!an.beam) return;
  scene.remove(an.beam); an.beam.geometry.dispose(); an.beam.material.dispose(); an.beam = null;
}
function dump(p, an) {
  if (p.attack || p.water < 0.99 || !burning(an) || an.fire.active === 0) return;
  p.attack = { an, left: WATER[p.vehicle].duration, opening: .18, acc: 0, hits: 0, vehicle: p.vehicle };
  an.fire.drops++; p.flash = p.vehicle === 'plane' ? 'Water run!' : 'Opening the bucket!'; p.flashT = 1.8;
  sfx.splash();
}
function launchWater(p, an, source, hit, amount, kind) {
  if (pours.length > 160) return;
  const packet = { p, an, source: { ...source }, x: hit.x, z: hit.z, y: hit.y, tau: hit.time, radius: hit.radius, amount, kind, t: 0 };
  pours.push(packet); p.waterViewUntil = game.t + hit.time + 2;
  // The visible stream uses the same ballistic arc as the water footprint; it never homes onto a fire.
  const count = kind === 'jet' ? 13 : 20;
  for (let i = 0; i < count; i++) {
    const tx = hit.x + jit(hit.radius * 0.65), tz = hit.z + jit(hit.radius * 0.65), tau = hit.time;
    fx.emit(source.x + jit(kind === 'jet' ? 0.06 : 0.65), source.y, source.z + jit(0.3),
      (tx - source.x) / tau, (hit.y - source.y) / tau + 4.905 * tau, (tz - source.z) / tau,
      0.65, 0.9, 1.05, 0.8, kind === 'jet' ? 0.5 : 0.85, tau + 0.1, 9.81, 0, 2);
  }
}
function updateWaterRuns(dt) {
  for (const p of players) {
    const run = p.attack;
    const opening = game.fire && p.vehicle === 'plane' && !!run ? 1 : 0;
    p.gateOpen = (p.gateOpen || 0) + (opening - (p.gateOpen || 0)) * damp(14, dt);
    p.plane.gates.forEach((g, i) => { g.rotation.z = (i ? 1 : -1) * p.gateOpen * 1.25; });
    // (the autopilot's only on its scoop run, skimming the stretch of water it picked by the fire: taxiing out from the
    // pier is not a scoop. Flown by hand, anywhere within reach of the fire)
    const scooping = game.fire && p.vehicle === 'plane' && p.afloat && p.fs > 6 && p.fireJob && p.water < .99
      && (p.pro ? Math.hypot(p.fireJob.fire.x - p.pos.x, p.fireJob.fire.z - p.pos.z) < 450 : !!(p.ap && p.ap.skim));
    p.scoopOpen = (p.scoopOpen || 0) + ((scooping ? 1 : 0) - (p.scoopOpen || 0)) * damp(5, dt);
    p.plane.scoops.forEach(g => { g.rotation.x = (1 - p.scoopOpen) * -Math.PI / 2; });
    p.plane.level.scale.y = Math.max(.02, p.water);
    p.plane.level.position.y = -0.8 + p.water * 0.5;
    if (!run) { if (p.vehicle !== 'boat' || !p.spray) p.waterStream.hide(); continue; }
    if (!p.active || p.vehicle !== run.vehicle || !burning(run.an)) { p.attack = null; p.waterStream.hide(); continue; }
    if (run.opening > 0) { run.opening -= dt; continue; }
    const used = Math.min(dt, run.left), config = WATER[run.vehicle];
    run.left -= used; run.acc += used; p.water = Math.max(0, run.left / config.duration);
    if (run.acc >= 0.07 || run.left <= 0) {
      const source = run.vehicle === 'heli' ? { x: p.bpos.x, y: p.bpos.y + 0.4, z: p.bpos.z } : { x: p.pos.x, y: p.pos.y - 1.3, z: p.pos.z };
      const aim = p.fireAim || attackPoint(run.an.fire, p.idx);
      const hit = predictDrop(source, p.vel, aim.y, run.vehicle, WIND);
      launchWater(p, run.an, source, hit, config.capacity * run.acc / config.duration, 'drop'); run.acc = 0;
      p.waterStream.update(source, hit, run.vehicle === 'heli' ? .45 : .65, run.vehicle === 'heli' ? 1.5 : 2.3, Math.min(1, (config.duration - run.left) / hit.time));
    }
    if (run.left <= 0) { p.waterStream.hide(); p.attack = null; p.water = 0; p.fireAim = null; }
  }
}
function fireOut(an, p) {
  const F = an.fire;
  if (F.out || !waiting.includes(an)) return;
  F.out = true; F.t = 0; fading.push(F);
  const i = waiting.indexOf(an); if (i >= 0) waiting.splice(i, 1);
  removeBeam(an);
  if (an.site) an.site.busy = false;
  for (const q of players) { if (q.attack?.an === an) { q.attack = null; q.waterStream.hide(); } if (q.fireJob === an) q.fireJob = null; if (q.target === an) q.target = null; if (q.pickup === an) q.pickup = null; }
  // they are safe where they are: a cheer, and they count as helped
  fx.hearts(an.pos.x, an.pos.y + 3, an.pos.z, 6); fx.confetti(an.pos.x, an.pos.y + 2.5, an.pos.z, 70); fx.sparkle(F.x, F.y + 2, F.z, 30);
  animalVoice(an.type.id, true); sfx.chime(); sfx.hiss(1);
  an.state = 'cheer'; an.t = 0; hoppers.push(an);
  p.flash = '✅ Fire out! Your friend is safe'; p.flashT = 4;
  p.rescued++; game.rescued++; game.total++; game.saved.push(an.type.e);
  if (game.rescued >= game.goal && game.celebrate <= 0) missionComplete();
  syncHud();
}
function steam(F, dt, k) {
  F.steamAcc = (F.steamAcc || 0) + dt * 22 * k;
  while (F.steamAcc > 1) {
    F.steamAcc--;
    const wet = F.cells.filter(c => c.wet > 0.04 || F.out), c = wet[(Math.random() * wet.length) | 0];
    if (!c) break;
    fx.emit(c.x + jit(1), c.y + 1, c.z + jit(1), jit(0.8), 2.5 + Math.random() * 3, jit(0.8),
      0.85, 0.91, 0.92, 0.32 * k, -(2 + Math.random() * 2), 2 + Math.random(), -0.8, 0.3);
  }
}
function disposeFire(F) { F.visual?.dispose(); F.visual = null; }
let fireNear = 1e9;
function updateFires(dt, t) {
  updateWaterRuns(dt);
  fireNear = 1e9;
  for (const an of [...waiting]) {
    const F = an.fire; if (!F) continue;
    let near = 1e9;
    for (const p of activePlayers()) near = Math.min(near, Math.hypot(p.pos.x - F.x, p.pos.z - F.z));
    fireNear = Math.min(fireNear, near); if (near < 180) F.engaged = true;
    windAt(F.x, F.z, t, WIND); advanceFire(F, dt, WIND); world.updateFireScars(F);
    if (near < 850) F.visual?.update(t, WIND);
    if (F.hiss > 0) { F.hiss -= dt; steam(F, dt, Math.min(1, F.hiss)); }
    // The crew checks the cooling ground before declaring the whole incident safe.
    if (F.quiet > 2.2 && waiting.includes(an)) fireOut(an, F.lastPilot || activePlayers()[0]);
  }
  for (let i = pours.length - 1; i >= 0; i--) {
    const packet = pours[i]; packet.t += dt;
    if (packet.t < packet.tau) continue;
    let cooled = 0;
    for (const an of waiting) {
      const F = an.fire; if (!F || Math.hypot(F.x - packet.x, F.z - packet.z) > F.r + packet.radius) continue;
      const result = waterImpact(F, packet); cooled += result.cooled;
      if (result.cooled > 0.001) { F.hiss = 1; F.lastPilot = packet.p; F.lastHit = t; }
    }
    fx.splash(packet.x, packet.y + 0.2, packet.z, packet.kind === 'jet' ? 3 : 10, packet.kind === 'jet' ? 0.25 : 0.6);
    if (cooled > 0.02 && t > (packet.p.hissAt || 0)) { sfx.hiss(0.65); packet.p.hissAt = t + 0.7; }
    pours.splice(i, 1);
  }
  for (let i = fading.length - 1; i >= 0; i--) {
    const F = fading[i]; F.t += dt;
    if (F.t > 18) { disposeFire(F); fading.splice(i, 1); continue; }
    windAt(F.x, F.z, t, WIND); F.visual?.update(t, WIND, Math.min(1, (18 - F.t) / 4));
    if (F.t < 6) steam(F, dt, 1 - F.t / 6);
  }
}
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
// an ice floe: a thick slab of old ice, ragged round its edge
const FLOE_MAT = new THREE.MeshStandardMaterial({ color: 0xe8f2fa, roughness: 0.4 });
function buildFloe() {
  const g = new THREE.CylinderGeometry(2.7, 3.1, 0.8, 11, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 0.82 + 0.3 * Math.abs(Math.sin(a * 2.3 + 1.1) * Math.cos(a * 3.7)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.translate(0, -0.12, 0); g.computeVertexNormals();
  const m = new THREE.Mesh(g, FLOE_MAT); m.castShadow = m.receiveShadow = true;
  const o = new THREE.Group(); o.add(m);
  return o;
}
function addWaiting(kind, x, z, extra) {
  const type = (extra && extra.prefer && !waiting.some(a => a.type.id === extra.prefer) && ANIMAL_TYPES.find(tp => tp.id === extra.prefer)) || pickType();
  const friend = buildAnimal(type.id);
  const an = {
    id: animalSerial++, type, model: friend, kind, state: 'waiting', pos: new THREE.Vector3(x, 0, z),
    phase: Math.random() * 6, callT: 3 + Math.random() * 6, excite: 0, exciteCd: 0, grow: 0, claimed: null, prop: null, ...extra,
  };
  if (kind === 'ring') an.prop = buildRing(); else if (kind === 'raft') an.prop = buildRaft(); else if (kind === 'floe') an.prop = buildFloe();
  else if (kind === 'kayak') {
    an.prop = model('World_Kayak', { tints: { Tip: new THREE.Color().setHSL(Math.random(), 0.8, 0.45) } }); an.prop.scale.setScalar(1.9); an.prop.rotation.order = 'YXZ'; an.heading = play() * 6.283;
    // (the paddle is modelled across the cockpit, where it would run through whoever sits there: it lies across the foredeck instead)
    const names = an.prop.geometry.userData.mats, oar = i => /Accent|Metal/.test(names[i]);
    const paddle = new THREE.Mesh(an.prop.geometry, an.prop.material.map((mt, i) => oar(i) ? mt : HIDDEN));
    an.prop.material = an.prop.material.map((mt, i) => oar(i) ? HIDDEN : mt);
    paddle.position.set(0, -0.27, 1.05); paddle.castShadow = true; an.prop.add(paddle);
  }
  else if (kind === 'dinghy') { an.prop = new THREE.Group(); const hull = model('World_Sail'); hull.scale.setScalar(1.5); hull.rotation.z = 1.45; hull.position.set(-0.6, 0.15, 0); an.prop.add(hull); an.prop.rotation.y = Math.random() * 6.283; }
  if (an.prop) { an.prop.userData.farHide = 360; scene.add(an.prop); }
  an.beam = buildBeam(); scene.add(an.beam);
  friend.userData.farHide = 360;
  scene.add(friend);
  waiting.push(an);
  placeWaiting(an, game.t, 0);
  if (AFLOAT.has(kind)) fx.splash(an.pos.x, an.pos.y, an.pos.z, 20);
  return an;
}
// how a friend feels, 0..1 each, eased: happy tilts and nods the head, wave lifts an arm and waves it (models.js)
function feel(an, happy, wave, dt) {
  const a = an.model.userData.anim; if (!a) return;
  const k = damp(4, dt || 0.016);
  a.uHappy.value += (happy - a.uHappy.value) * k; a.uWave.value += (wave - a.uWave.value) * k;
}
function placeWaiting(an, t, dt) {
  const x = an.pos.x, z = an.pos.z;
  an.grow = Math.min(1, an.grow + dt * 2);
  const s = 1.7 * (0.2 + 0.8 * an.grow);
  // who is closest?
  let near = null, nd = 1e9;
  for (const p of players) if (p.active) { const d = p.pos.distanceTo(an.pos); if (d < nd) { nd = d; near = p; } }
  an.excite = Math.max(0, an.excite - dt);
  const excited = nd < 45 || an.excite > 0;
  // (they wave to whoever is coming for them)
  feel(an, excited ? 1 : 0.15, nd < 45 ? 1 : 0, dt);
  const m = an.model;
  if (near) {
    const want = Math.atan2(near.pos.x - x, near.pos.z - z);
    m.rotation.y += angDiff(want, m.rotation.y) * damp(4, dt || 1);
  }
  const hop = excited ? Math.abs(Math.sin(t * 7 + an.phase)) * 0.35 : 0;
  if (an.kind === 'hut') {
    // on the hut's porch, over the lagoon
    an.pos.y = HUTS[0].floor;
    m.position.set(x, an.pos.y + hop, z); m.rotation.x = m.rotation.z = 0;
  } else if (an.kind === 'kayak') {
    // paddling about in small circles, slowly blown downwind
    const w = waveHeight(x, z, t);
    an.heading += (dt || 0) * 0.25;
    windAt(x, z, t, WIND);
    const nx = x + (Math.sin(an.heading) * 0.6 + WIND.x * 0.04) * (dt || 0), nz = z + (Math.cos(an.heading) * 0.6 + WIND.z * 0.04) * (dt || 0);
    if (terrainHeight(nx, nz) < -4 && !rockNear(nx, nz, 5)) { an.pos.x = nx; an.pos.z = nz; }
    an.pos.y = w + 0.35;
    m.position.set(an.pos.x, w - 0.55 + hop * 0.3, an.pos.z); m.rotation.z = Math.sin(t * 1.4 + an.phase) * 0.06;
    an.prop.position.set(an.pos.x, w - 0.05, an.pos.z); an.prop.rotation.set(Math.sin(t * 1.2) * 0.05, an.heading, Math.sin(t * 1.4 + an.phase) * 0.06);
  } else if (an.kind === 'dinghy') {
    // sitting on the hull of their capsized sailing dinghy
    const w = waveHeight(x, z, t);
    // (astride the upturned side of the hull, which lies a little off the middle of it: 0.6 across, 1.45 up)
    const h = an.prop.rotation.y;
    an.pos.y = w + 1.8;
    m.position.set(x - 0.6 * Math.cos(h), w + 1.4 + hop * 0.4, z + 0.6 * Math.sin(h)); m.rotation.z = Math.sin(t * 1.3 + an.phase) * 0.05;
    an.prop.position.set(x, w, z); an.prop.rotation.x = Math.sin(t * 1.1 + an.phase) * 0.04;
  } else if (an.kind === 'islet' || an.kind === 'camp' || an.kind === 'ledge') {
    an.pos.y = terrainHeight(x, z);
    m.position.set(x, an.pos.y + hop, z); m.rotation.x = m.rotation.z = 0;
  } else if (an.kind === 'perch') {
    // up on the fire tower's deck or a rooftop
    an.pos.y = an.perchY;
    m.position.set(x, an.pos.y + hop, z); m.rotation.x = m.rotation.z = 0;
  } else if (an.kind === 'wreck') {
    // on the wreck's sloping deck (the point on her deck worked out from the hull itself, listing as she is)
    world.wreckMesh.localToWorld(an.pos.set(an.off[0] / 1.5, an.boat.deck / 1.5, an.off[1] / 1.5));
    m.position.set(an.pos.x, an.pos.y + hop, an.pos.z); m.rotation.x = m.rotation.z = 0;
  } else if (an.kind === 'deck') {
    // on the deck of the stricken boat, riding the swell with her
    const B = an.boat, c = Math.cos(B.yaw), sn = Math.sin(B.yaw);
    an.pos.set(B.x + an.off[0] * c + an.off[1] * sn, B.y + B.deck, B.z - an.off[0] * sn + an.off[1] * c);
    m.position.set(an.pos.x, an.pos.y + hop, an.pos.z); m.rotation.x = m.rotation.z = 0;
  } else {
    // A raft, a ring or a floe rides the real swell: it lifts and tips with the slope of the water under it. A helicopter
    // hovering low over it blows it slowly round and out from under the rotor (never toward rocks or the shallows).
    const w = waveHeight(x, z, t);
    const sx = (waveHeight(x + 1.2, z, t) - waveHeight(x - 1.2, z, t)) / 2.4, sz = (waveHeight(x, z + 1.2, t) - waveHeight(x, z - 1.2, t)) / 2.4;
    for (const p of players) {
      if (!p.active || p.vehicle !== 'heli' || p.spin < 0.3 || !dt) continue;
      const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz), blow = (1 - clamp(d / 16, 0, 1)) * clamp(1 - (p.clearance - 2) / 16, 0, 1);
      if (blow <= 0 || d < 0.01) continue;
      an.phase += dt * blow * 0.9;
      const nx = x + dx / d * blow * 0.45 * dt, nz = z + dz / d * blow * 0.45 * dt;
      if (terrainHeight(nx, nz) < -2 && !rockNear(nx, nz, 4)) { an.pos.x = nx; an.pos.z = nz; }
    }
    const tipX = -Math.atan(sz * 1.3), tipZ = Math.atan(sx * 1.3), bob = Math.sin(t * 1.4 + an.phase) * 0.02;
    an.prop.rotation.order = 'XZY';
    if (an.kind === 'ring') {
      an.pos.y = w + 0.2;
      m.position.set(an.pos.x, w - 1.0 + hop * 0.4, an.pos.z);
      an.prop.position.set(an.pos.x, w + 0.15, an.pos.z); an.prop.rotation.set(tipX + bob, an.phase, tipZ);
    } else {
      an.pos.y = w + 0.45;
      m.position.set(an.pos.x, w + 0.3 + hop, an.pos.z);
      an.prop.position.set(an.pos.x, w + 0.05, an.pos.z); an.prop.rotation.set(tipX + bob, an.phase, tipZ);
    }
    m.rotation.z = tipZ * 0.6 + bob;
  }
  m.scale.setScalar(s);
  // a happy wriggle when help is close
  const body = m.userData.body;
  body.rotation.z = excited ? Math.sin(t * 6 + an.phase) * 0.14 : Math.sin(t * 1.6 + an.phase) * 0.04;
  body.rotation.y = excited ? Math.sin(t * 9 + an.phase) * 0.25 : 0;
  // beacon
  const fade = clamp((nd - 16) / 30, 0, 1);
  an.beam.position.set(x, an.pos.y + 2, z);
  an.beam.material.opacity = (0.17 + 0.07 * Math.sin(t * 3 + an.phase)) * fade * (1 - 0.45 * world.preset.night);
  an.beam.visible = !an.fire && fade > 0.01;
  // calling out
  an.exciteCd -= dt; an.callT -= dt;
  if (nd < 45 && an.exciteCd <= 0) { an.exciteCd = 4; fx.emoji('💕', x, an.pos.y + 4.5, z, 2.4); animalVoice(an.type.id, false, 1 - nd / 60); }
  if (nd >= 45 && an.callT <= 0) { an.callT = 7 + Math.random() * 7; fx.emoji('❗', x, an.pos.y + 4.5, z, 3); if (nd < 160) animalVoice(an.type.id, false, 0.6 * (1 - nd / 170)); }
}
function seatRiders(p) {
  p.cargo.forEach((an, i) => {
    an.model.position.set(SLOTS[i][0], SLOTS[i][1], SLOTS[i][2]);
    an.model.rotation.set(0, p.basket.userData.facingOut ? 0 : Math.atan2(SLOTS[i][0], SLOTS[i][2]), 0);
    an.model.scale.setScalar(1.0);
  });
}
function board(an, p) {
  const i = waiting.indexOf(an); if (i < 0 || p.cargo.length + p.incoming >= MAX_CARGO) return;
  waiting.splice(i, 1);
  const wet = AFLOAT.has(an.kind);
  if (an.prop && !(an.kind === 'ring' && p.vehicle !== 'boat')) { sinking.push({ o: an.prop, t: 0 }); an.prop = null; }      // (a ring goes with them)
  removeBeam(an);
  if (an.site) an.site.busy = false;
  if (an.boat) boatFriendOff(an.boat);
  an.state = 'boarding'; an.t = 0; an.by = p; an.claimed = null; an.splashT = 0;
  an.from = an.model.position.clone(); an.fromScale = an.model.scale.x; an.slot = p.cargo.length + p.incoming;
  // How they get aboard. Into the basket: a short paddle to it and a scramble over the side. The boat throws them a
  // life ring on a line and tows them in to climb over the collar; the seaplane's friends swim to a float and climb
  // up it; anyone on a beach runs down and wades out first. Off a stricken boat's deck it is one big jump.
  if (an.kind === 'deck' || an.kind === 'camp' || an.kind === 'hut' || an.kind === 'ledge' || an.kind === 'perch' || an.kind === 'wreck') an.leg = 'climb';
  else if (p.vehicle === 'boat' && wet) an.leg = 'throw';
  else an.leg = 'travel';
  if (an.leg === 'climb') setClimb(an, p);
  if (wet && p.vehicle !== 'heli') { fx.splash(an.pos.x, an.pos.y, an.pos.z, 16); sfx.splash(); }
  p.incoming++;
  hoppers.push(an);
  animalVoice(an.type.id, true);
  game.spawnT = Math.min(game.spawnT, 2 + play() * 2);
  syncHud();
}
function setClimb(an, p) {
  an.leg = 'climb'; an.t = 0;
  an.from = an.model.position.clone(); an.fromScale = an.model.scale.x;
  const d = an.from.distanceTo(p.pos);
  an.bdur = p.vehicle === 'heli' ? 0.42 : 0.5 + Math.max(0, d - 8) * 0.022;
  an.barc = (p.vehicle === 'heli' ? 1.1 : 1.4) + Math.max(0, d - 8) * 0.2;
}
// where a friend coming aboard makes for: the basket, the boat's side by the aft deck, or the plane's float step
const BP = new THREE.Vector3();
function boardPoint(p, an, out) {
  if (p.vehicle === 'heli') return out.copy(p.basket.position);
  const g = p.model.group;
  g.updateMatrixWorld();      // (it has moved since the last frame was drawn)
  const side = Math.sign((an.model.position.x - g.position.x) * Math.cos(p.yaw) - (an.model.position.z - g.position.z) * Math.sin(p.yaw)) || 1;
  // (the boat's crew take them in over either side; the flying boat's friends climb onto the step at its door, on the port side)
  if (p.vehicle === 'boat') out.set(side * 1.9, 0, -2.2); else out.set(1.55, -1.25, -0.55);
  out.applyMatrix4(g.matrixWorld);
  return out;
}
const lineRings = [];
function updateBoarding(dt, t) {
  for (let i = hoppers.length - 1; i >= 0; i--) {
    const an = hoppers[i]; if (an.state !== 'boarding') continue;
    const p = an.by, m = an.model;
    if (an.leg === 'throw') {
      // a crewman throws the life ring: it flies out on its line and lands beside the friend
      if (!lineRings[p.idx]) { lineRings[p.idx] = buildRing(); lineRings[p.idx].scale.setScalar(0.42); scene.add(lineRings[p.idx]); }
      const ring = lineRings[p.idx];
      boardPoint(p, an, BP); BP.y += 1.6;
      an.t += dt / 0.65;
      const k = Math.min(an.t, 1);
      ring.visible = true;
      ring.position.lerpVectors(BP, m.position, k); ring.position.y += Math.sin(k * Math.PI) * 4 - (1 - k) * 0 + 0.3;
      ring.rotation.set(k * 9, k * 4, 0);
      showLine(p, BP, ring.position);
      if (k >= 1) { an.leg = 'travel'; an.t = 0; fx.splash(m.position.x, m.position.y + 0.6, m.position.z, 12, 0.7); sfx.splash(); }
      continue;
    }
    if (an.leg === 'travel') {
      // across the sand and through the water to the boarding point, swimming where it is deep
      boardPoint(p, an, BP);
      an.t += dt;
      const dx = BP.x - m.position.x, dz = BP.z - m.position.z, d = Math.hypot(dx, dz);
      const ground = terrainHeight(m.position.x, m.position.z), wave = waveHeight(m.position.x, m.position.z, t);
      const onLand = ground > wave - 0.3;
      const towed = p.vehicle === 'boat' && lineRings[p.idx] && lineRings[p.idx].visible;
      const speed = onLand ? 6.5 : towed ? 6 : p.vehicle === 'heli' ? 3 : 4;
      const step = Math.min(d, speed * dt);
      if (d > 0.01) { m.position.x += (dx / d) * step; m.position.z += (dz / d) * step; m.rotation.y = Math.atan2(dx, dz); }
      if (onLand) m.position.y = ground + Math.abs(Math.sin(an.t * 11)) * 0.45;
      else {
        m.position.y = wave - 1.0 + Math.sin(an.t * 7) * 0.08;                         // up to the shoulders, paddling
        m.rotation.z = Math.sin(an.t * 7) * 0.12;
        an.splashT -= dt;
        if (an.splashT <= 0) { an.splashT = 0.16; fx.splash(m.position.x, wave, m.position.z, 4, 0.35); }
      }
      if (towed) {
        const ring = lineRings[p.idx];
        ring.position.set(m.position.x, wave + 0.15, m.position.z);
        boardPoint(p, an, V2); V2.y += 1.4;
        showLine(p, V2, ring.position);
      }
      if (an.prop) { an.prop.position.x = m.position.x; an.prop.position.z = m.position.z; }
      if (d < 0.9 || an.t > 9) {
        if (an.prop) { sinking.push({ o: an.prop, t: 0 }); an.prop = null; }
        if (towed) { lineRings[p.idx].visible = false; p.rope.visible = false; }
        if (p.vehicle === 'heli') { fx.splash(m.position.x, wave, m.position.z, 10, 0.6); p.bvel.y -= 1.2; }
        setClimb(an, p);
      }
      continue;
    }
    an.t += dt / an.bdur;
    const k = Math.min(an.t, 1), e = k * k * (3 - 2 * k);
    p.basket.updateWorldMatrix(true, false);
    V.set(SLOTS[an.slot][0], SLOTS[an.slot][1], SLOTS[an.slot][2]).applyMatrix4(p.basket.matrixWorld);
    m.position.lerpVectors(an.from, V, e);
    m.position.y += Math.sin(k * Math.PI) * an.barc;
    // (shrinking or growing to the size they will ride at: the flying boat's door seats them a little smaller)
    m.scale.setScalar(lerp(an.fromScale, p.basket.getWorldScale(V2).x, e));
    m.rotation.x = 0; m.rotation.z = 0;
    if (k >= 1) {
      hoppers.splice(i, 1);
      an.state = 'riding'; p.incoming--;
      p.basket.add(m); m.visible = true; p.cargo.push(an); seatRiders(p);      // (seen with the machine now, however far it flies)
      p.basket.getWorldPosition(V);
      fx.hearts(V.x, V.y + 2.5, V.z, 4); fx.sparkle(V.x, V.y + 1.5, V.z, 14);
      if (p.vehicle === 'heli') p.bvel.y -= 2.5;                       // the basket dips under the new weight
      else { p.squash = Math.max(p.squash, 0.5); sfx.touchdown(); }    // the boat or plane rocks as they climb in
      syncHud();
    }
  }
}
// the throwing line, drawn with the pilot's (otherwise idle) winch cable
function showLine(p, a, b) {
  const r = p.rope, len = a.distanceTo(b);
  r.visible = len > 0.05;
  r.position.copy(a).lerp(b, 0.5);
  r.scale.set(0.6, Math.max(len, 0.01), 0.6);
  if (len > 0.01) r.quaternion.setFromUnitVectors(UP, V.copy(b).sub(a).multiplyScalar(1 / len));
}
const sinking = [];
function updateSinking(dt) {
  for (let i = sinking.length - 1; i >= 0; i--) {
    const sk = sinking[i]; sk.t += dt;
    sk.o.position.y -= dt * 0.25; sk.o.scale.setScalar(Math.max(0.01, 1 - sk.t / 1.2));
    if (sk.t > 1.2) { scene.remove(sk.o); sinking.splice(i, 1); }
  }
}
function slotPos(i, out) {
  const col = i % 6, row = (i / 6) | 0;
  return out.set(-7.5 + col * 3 + (row % 2) * 1.2, BASE_Y, -9.2 + row * 3.1);
}
function deliverOne(p) {
  const an = p.cargo.shift(); if (!an) return;
  scene.attach(an.model);
  seatRiders(p);
  an.state = 'hop'; an.t = 0; an.from = an.model.position.clone(); an.by = p;
  { const d = Math.hypot(an.from.x, an.from.z); an.hdur = 0.95 + Math.max(0, d - 30) * 0.02; an.harc = 5 + Math.max(0, d - 30) * 0.22; }
  an.model.scale.setScalar(1.3); an.model.rotation.set(0, 0, 0);
  hoppers.push(an);
  sfx.chime();
}
function updateHoppers(dt, t) {
  for (let i = hoppers.length - 1; i >= 0; i--) {
    const an = hoppers[i];
    if (an.state !== 'hop') continue;
    an.t += dt / an.hdur;
    const to = slotPos(residents.length, V);
    const k = Math.min(an.t, 1);
    an.model.position.lerpVectors(an.from, to, k);
    an.model.position.y += Math.sin(k * Math.PI) * an.harc;
    an.model.rotation.x = k * Math.PI * 2;
    feel(an, 1, 1, dt);
    if (k >= 1) {
      hoppers.splice(i, 1);
      an.model.rotation.set(0, 0, 0);
      an.state = 'safe'; an.x = to.x; an.z = to.z;
      residents.push(an);
      fx.confetti(to.x, BASE_Y + 1.5, to.z, 50); fx.hearts(to.x, BASE_Y + 3, to.z, 3);
      animalVoice(an.type.id, true);
      an.by.rescued++; game.rescued++; game.total++;
      game.saved.push(an.type.e);
      if (residents.length > 15) { const old = residents.shift(); old.state = 'leaving'; old.t = 0; hoppers.push(old); }
      if (game.rescued >= game.goal && game.celebrate <= 0) missionComplete();
      syncHud();
    }
  }
}
function updateResidents(dt, t) {
  residents.forEach((an, i) => {
    const to = slotPos(i, V);
    an.x += (to.x - an.x) * damp(2.5, dt); an.z += (to.z - an.z) * damp(2.5, dt);
    let nd = 1e9, near = null;
    for (const p of players) if (p.active) { const d = Math.hypot(p.pos.x - an.x, p.pos.z - an.z); if (d < nd) { nd = d; near = p; } }
    const party = game.celebrate > 0;
    const travel = Math.min(Math.hypot(to.x - an.x, to.z - an.z) * 0.3, 1.2);
    const hop = Math.abs(Math.sin(t * (party ? 7 : 3.2) + an.phase)) * (party ? 1.5 : nd < 30 ? 0.8 : 0.3) + travel;
    an.model.position.set(an.x, BASE_Y + hop, an.z);
    // (the friends at home wave to a pilot coming in, and everyone waves at a party)
    feel(an, party ? 1 : 0.5, party || nd < 30 ? 1 : 0, dt);
    const want = near && nd < 60 ? Math.atan2(near.pos.x - an.x, near.pos.z - an.z) : 0;
    an.model.rotation.y += angDiff(want, an.model.rotation.y) * damp(3, dt);
  });
}
// old friends wander into the station to make room (reuses the hoppers list)
function updateLeaving(dt) {
  for (let i = hoppers.length - 1; i >= 0; i--) {
    const an = hoppers[i];
    if (an.state === 'cheer') {
      // (their fire is out: big happy jumps on the spot, a spin, then off home)
      an.t += dt;
      const k = Math.min(an.t / 3.2, 1);
      an.model.position.y = an.pos.y + Math.abs(Math.sin(an.t * 6)) * 1.3 * (1 - k * 0.5);
      an.model.rotation.y += dt * 4;
      if (an.t > 3.2) an.model.scale.setScalar(Math.max(0.01, 1.7 * (1 - (an.t - 3.2) / 1)));
      if (an.t >= 4.2) { scene.remove(an.model); hoppers.splice(i, 1); }
      continue;
    }
    if (an.state === 'bye') {
      // (a friend nobody can reach now heads off home: a happy hop on the spot as they shrink away)
      an.t += dt;
      an.model.position.y = an.pos.y + Math.abs(Math.sin(an.t * 8)) * 0.6;
      an.model.scale.setScalar(Math.max(0.01, 1.7 * (1 - an.t / 1.4)));
      if (an.t >= 1.4) { scene.remove(an.model); hoppers.splice(i, 1); }
      continue;
    }
    if (an.state !== 'leaving') continue;
    an.t += dt;
    an.model.position.x += (4 - an.model.position.x) * damp(2, dt);
    an.model.position.z += (-12 - an.model.position.z) * damp(2, dt);
    an.model.position.y = BASE_Y + Math.abs(Math.sin(an.t * 8)) * 0.5;
    an.model.scale.setScalar(Math.max(0.01, 1.3 * (1 - an.t / 1.6)));
    if (an.t >= 1.6) { scene.remove(an.model); hoppers.splice(i, 1); }
  }
}

// ================================================================= missions
const bannerEl = $('#banner'); let bannerT = 0;
function banner(title, sub, secs = 3.5) {
  $('h1', bannerEl).textContent = title; $('p', bannerEl).textContent = sub || '';
  bannerEl.classList.add('show'); bannerT = secs;
}
function missionComplete() {
  game.celebrate = 8; game.fireT = 0.9;
  const two = activePlayers().length > 1, Z = game.zone, icon = game.fire ? FIRE_ICON : Z.icon;
  banner(icon + ' Hooray! 🎉', (two ? 'Great teamwork! ' : '') + (game.fire ? 'All the fires are out!' : 'Our friends are home!'), 6);
  // a little tune, then the cheering, then the fireworks
  sfx.levelDone(); sfx.cheer(1.1);
  // the mission's sticker goes in the book, and its picture showers down round every pilot
  addSticker(game.fire ? 'fire' : Z.id);
  game.stickerT = 0; game.stickerBursts = 14; game.stickerIcon = icon;
  fx.confetti(0, BASE_Y + 8, 0, 160);
}
// Friends left waiting somewhere nobody is heading any more wave and go home by themselves (reuses the hoppers list).
function releaseWaiting(test) {
  for (let i = waiting.length - 1; i >= 0; i--) {
    const an = waiting[i];
    if (!test(an)) continue;
    waiting.splice(i, 1);
    removeBeam(an);
    if (an.prop) { sinking.push({ o: an.prop, t: 0 }); an.prop = null; }
    if (an.site) an.site.busy = false;
    if (an.boat) boatFriendOff(an.boat);
    if (an.fire && !an.fire.out) { an.fire.out = true; an.fire.t = 2; for (const c of an.fire.cells) { c.heat = 0; c.wet = Math.max(c.wet, 0.2); } fading.push(an.fire); }
    for (const p of players) { if (p.pickup === an) p.pickup = null; if (p.target === an) p.target = null; if (p.fireJob === an) p.fireJob = null; }
    an.claimed = null; an.state = 'bye'; an.t = 0;
    fx.emoji('\u{1F44B}', an.pos.x, an.pos.y + 4.5, an.pos.z, 3);
    hoppers.push(an);
  }
}
function setZone(m) {
  const chosen = chooseMission(game.mode, game.location, m > 1 ? { id: game.zone.id, fire: game.fire } : null, play);
  game.mission = m; game.zone = ZONES.find(z => z.id === chosen.id); game.fire = chosen.fire; game.fireMiss = 0; game.rescued = 0; game.goal = goalFor(m); game.saved = [];
  releaseWaiting(() => true);
  pours.length = 0;
  for (const p of players) { p.water = 0; p.routes = {}; p.attack = null; p.fireAim = null; p.aimUntil = 0; }
  // (the crew is never moved: a fresh outing starts at the home base, and each next mission, fire or not, starts
  // wherever they are)
  game.spawnT = 0;
  life.setZone(game.zone);
  placeZoneBeam();
  syncHud();
}
const FIRE_ICON = '\u{1F692}';
function zoneBanner() {
  const Z = game.zone, pro = activePlayers().some(p => p.pro);
  const what = game.fire ? 'Protect our friends · contain the front · cool the embers' : 'Help ' + game.goal + ' friends and bring them home';
  banner(game.fire ? FIRE_ICON + ' ' + Z.name + ' fire!' : Z.icon + ' ' + Z.name, (pro ? world.preset.icon + WEATHERS[weather.idx].icon + ' ' + WEATHERS[weather.idx].name + ' — ' : '') + what);
  sfx.levelStart();
}
// (the screen fades out, the next mission is set up behind it, and it fades back in: on game time, so pausing waits)
function nextMission() { $('#fade').style.opacity = 1; game.switchT = 0.75; }
function switchMission(dt) {
  if (!(game.switchT > 0) || (game.switchT -= dt) > 0) return;
  setZone(game.mission + 1);
  setPreset((game.presetIdx + 1) % PRESETS.length);
  setWeather([0, 1, 0, 2][(game.mission - 1) % 4]);
  $('#fade').style.opacity = 0;
  zoneBanner();
  syncHud();
}
// ---- the light that stands over the zone a mission is in, seen from anywhere, fading as a pilot gets there
const ZONE_HUB = { forest: TOWER, reef: { x: -335, z: 385 }, harbour: { x: 492, z: -160 }, snow: SITES.find(s => s.name === 'Ski hut'), volcano: CRATER };
const zoneBeam = buildBeam();
zoneBeam.scale.set(3.5, 2.6, 3.5); zoneBeam.visible = false;
scene.add(zoneBeam);
function placeZoneBeam() {
  const hub = ZONE_HUB[game.zone.id];
  zoneBeam.visible = !!hub;
  if (!hub) return;
  zoneBeam.position.set(hub.x, terrainHeight(hub.x, hub.z), hub.z);
  zoneBeam.material.color.set(game.zone.color);
}
function updateZoneBeam(t) {
  if (!zoneBeam.visible) return;
  let nd = 1e9;
  for (const p of activePlayers()) nd = Math.min(nd, Math.hypot(p.pos.x - zoneBeam.position.x, p.pos.z - zoneBeam.position.z));
  zoneBeam.material.opacity = clamp((nd - 110) / 160, 0, 1) * (0.1 + 0.03 * Math.sin(t * 2)) * (game.state === 'play' ? 1 : 0);
}
// ---- stickers: one for each zone a mission has been finished in, kept on this computer
const stickers = new Set();
try { for (const id of JSON.parse(localStorage.getItem('rescue-squad-stickers') || '[]')) stickers.add(id); } catch (e) { /* (private window) */ }
function addSticker(id) {
  stickers.add(id);
  try { localStorage.setItem('rescue-squad-stickers', JSON.stringify([...stickers])); } catch (e) { /* (private window) */ }
  showStickers();
}
function showStickers() {
  $('#stickers').innerHTML = [...MISSION_ZONES.map(Z => [Z.id, Z.name, Z.icon]), ['fire', 'Fire missions', FIRE_ICON]]
    .map(([id, name, icon]) => '<span class="' + (stickers.has(id) ? 'got' : '') + '" title="' + name + '">' + icon + '</span>').join('');
}
showStickers();
function setPreset(i) {
  game.presetIdx = i;
  const p = PRESETS[i];
  world.applyPreset(p);
  bloom.strength = p.bloom;
  for (const pl of players) {
    pl.heli.spot.intensity = p.night >= 1 ? 2600 : p.night > 0 ? 500 : 0;
    pl.heli.coneMat.opacity = p.night >= 1 ? 0.085 : p.night > 0 ? 0.025 : 0;
    pl.heli.lampMat.emissiveIntensity = pl.plane.lampMat.emissiveIntensity = pl.boat.lampMat.emissiveIntensity = p.night > 0 ? 8 : 0.5;
    pl.heli.tipRingMat.color.setHex(0xffd23c).multiplyScalar(1 - 0.85 * p.night);
  }
  $('#bTime').textContent = p.icon;
}
function cyclePreset() { setPreset((game.presetIdx + 1) % PRESETS.length); banner(world.preset.icon + ' ' + world.preset.name, '', 1.6); }

// ================================================================= HUD
// The mission's progress, for pilots who cannot read yet: the zone's picture, then a ring for each friend to find, which
// fills with that friend's face (with a bounce) as they get home. Grown-up pilots get the numbers as well.
function setFace(el, emoji) {
  const face = portraits.get(emoji);
  if (el.dataset.face === emoji && (el.firstElementChild?.getAttribute('src') === face?.url)) return false;
  el.dataset.face = emoji; el.textContent = emoji;
  if (face) {
    const img = document.createElement('img'); img.src = face.url; img.alt = face.name; img.draggable = false;
    el.replaceChildren(img);
  }
  return true;
}
function syncHud() {
  $('#mIcon').textContent = game.fire ? FIRE_ICON : game.zone.icon;
  const row = $('#mSlots');
  while (row.children.length < game.goal) row.appendChild(document.createElement('span'));
  while (row.children.length > game.goal) row.lastChild.remove();
  [...row.children].forEach((el, i) => {
    const e = game.saved[i] || '';
    if (setFace(el, e)) { el.classList.toggle('got', !!e); if (e) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
  });
  $('#mCount').textContent = (game.fire || activePlayers().some(p => p.pro)) ? (game.fire ? game.zone.name + ' · ' : '') + Math.min(game.rescued, game.goal) + ' / ' + game.goal : '';
  for (const p of players) {
    p.boat.monitor.visible = p.boat.pump.visible = p.boat.crew.visible = game.fire; p.plane.fireTank.visible = game.fire;
    $('.cargo', p.pane).style.display = game.fire ? 'none' : '';
    p.pane.classList.toggle('fighting', game.fire);
    p.ui.score.textContent = (game.fire ? '🔥 ' : '🐾 ') + p.rescued + (p.pro ? '  \u2605 ' + p.style : '');
    p.ui.slots.forEach((el, i) => { const a = p.cargo[i]; setFace(el, a ? a.type.e : ''); el.classList.toggle('full', !!a); });
  }
}
function layoutHud() {
  const two = activePlayers().length > 1, playing = game.state === 'play';
  const p0 = players[0].pane, p1 = players[1].pane;
  p0.style.display = playing ? '' : 'none'; p1.style.display = playing && two ? '' : 'none';
  p0.style.left = '0'; p0.style.width = two ? '50%' : '100%';
  p1.style.left = '50%'; p1.style.width = '50%';
  $('#divider').style.display = playing && two ? 'block' : 'none';
  $('#mission').style.display = playing ? '' : 'none';
  $('#banner').style.visibility = playing ? '' : 'hidden';
  $('#controls').style.display = playing ? '' : 'none';
  $('#controls').inert = !playing;
  $('#hud').classList.toggle('two', two);
  $('#bP2').textContent = two ? '− Player 2' : '+ Player 2';
  $('.label', p0).textContent = two ? 'Red' : 'Rescue Squad';
  $('#mission').style.top = two ? '62px' : '14px';
}
// A line of guidance under each pilot's picture. Small pilots cannot read, so in easy flying it stays empty; in Pilot
// mode it says what to do next in that machine's own terms.
function hintFor(p) {
  const solo = activePlayers().length === 1;
  if (p.flashT > 0) return p.flash;
  if (!p.pro) return game.fire ? (p.spray ? ((p.pumpPressure || 0) < .95 ? 'Starting the pump…' : '💦 Spraying · ' + Math.round(fireProgress(p.spray.fire) * 100) + '% out') : p.fireJob ? (p.vehicle === 'boat' ? '🔥 Hold go to reach the shore and spray' : p.fireJob.fire.phase === 'checking' ? 'Checking the ground · nearly safe' : p.fireJob.fire.phase === 'mop-up' ? 'Cool the glowing embers' : waterReady(p) ? 'Hold go · water onto the fire front' : 'Hold go · refill for the next run') : '🔥 Looking for the next fire') : '';
  const key = (a, b) => (p.idx && !solo ? b : a);
  const full = p.cargo.length >= MAX_CARGO || (p.cargo.length && !waiting.length);
  if (p.fireJob) {
    if (p.vehicle === 'heli') return p.water < 1 ? 'Fire! Hover low over the sea and hold ' + key('R', 'Ctrl') + ' to fill the bucket' : 'Fly over the fire — the bucket empties itself';
    if (p.vehicle === 'plane') return p.water < 1 ? 'Fire! Skim along the sea to scoop up water' : 'Fly low over the fire to drop it';
    return 'Fire! Stop near the shore below it and the cannon sprays it';
  }
  if (p.vehicle === 'heli') {
    if (p.grounded) return p.incoming ? 'Climbing aboard…' : 'Hold ' + key('Space', 'Enter') + ' to lift off';
    if (full) return 'Full — land at the base, or winch them down by the paddock';
    return 'Hover over a friend and hold ' + key('R', 'Ctrl') + ' to winch';
  }
  if (p.vehicle === 'boat') {
    if (p.incoming) return 'Coming aboard…';
    if (full) return 'Full — bring them in to the jetty and stop';
    return 'Stop beside a friend to throw the ring';
  }
  if (p.incoming) return 'Swimming to the float…';
  if (p.afloat && p.fs < 3 && !p.cargo.length) return key('W', '↑') + ' to speed up, ' + key('Space', 'Enter') + ' to lift off';
  if (full) return 'Full — land and taxi in to the jetty';
  return 'Fly down onto the water near a friend and taxi up to them';
}
function drawRadar(p) {
  const g = p.ui.radar, S = 336, c = S / 2, R = c - 14, range = 210;
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2;
  g.beginPath(); g.arc(c, c, R * 0.5, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(c, c - R); g.lineTo(c, c + R); g.moveTo(c - R, c); g.lineTo(c + R, c); g.stroke();
  const fxx = Math.sin(p.yaw), fzz = Math.cos(p.yaw);
  const plot = (x, z, draw) => {
    const dx = x - p.pos.x, dzz = z - p.pos.z;
    let rx = (-fzz * dx + fxx * dzz) / range * R, ry = (fxx * dx + fzz * dzz) / range * R;
    const d = Math.hypot(rx, ry); let edge = false;
    if (d > R) { rx *= R / d; ry *= R / d; edge = true; }
    draw(c + rx, c - ry, edge);
  };
  // base
  plot(0, 0, (x, y) => { g.fillStyle = '#5dff8f'; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill(); g.fillStyle = '#0b3'; g.font = 'bold 17px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#063'; g.fillText('H', x, y + 1); });
  // the zone this mission is in, when the pilot is not there yet: its picture on a disc of its colour, at the radar's rim
  const Z = game.zone;
  if (Z.id !== 'home' && Math.hypot(p.pos.x - Z.x, p.pos.z - Z.z) > Z.r * 0.7) plot(Z.x, Z.z, (x, y) => {
    g.fillStyle = Z.color; g.globalAlpha = 0.9; g.beginPath(); g.arc(x, y, 19, 0, 7); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    g.font = '22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(Z.icon, x, y + 1);
  });
  // animals
  const pulse = 0.5 + 0.5 * Math.sin(game.t * 5);
  for (const a of waiting) plot(a.fire?.x ?? a.pos.x, a.fire?.z ?? a.pos.z, (x, y, edge) => {
    g.fillStyle = burning(a) ? '#ff5a2a' : '#ffd23c'; g.beginPath(); g.arc(x, y, edge ? 8 : 10, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,210,60,' + (0.7 - pulse * 0.6) + ')'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 12 + pulse * 12, 0, 7); g.stroke();
  });
  if (p.fireJob && !waterReady(p) && p.vehicle !== 'boat') {
    const fill = p.vehicle === 'plane' ? p.fireJob.fire.scoop : p.fireJob.fire.dip;
    plot(fill.x, fill.z, (x, y) => { g.fillStyle = '#56caff'; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); g.fillStyle = '#042840'; g.font = 'bold 19px sans-serif'; g.textAlign = 'center'; g.fillText('💧', x, y + 6); });
  }
  // the other pilot
  for (const o of players) if (o.active && o !== p) plot(o.pos.x, o.pos.z, (x, y) => { g.fillStyle = o.idx ? '#3d95ff' : '#ff6a2b'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); });
  // me
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(c, c - 16); g.lineTo(c + 11, c + 12); g.lineTo(c, c + 5); g.lineTo(c - 11, c + 12); g.closePath(); g.fill();
}
let hudAcc = 0;
function updateHud(dt) {
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.classList.remove('show'); }
  hudAcc += dt;
  const slow = hudAcc > 0.2; if (slow) hudAcc = 0;
  for (const p of players) {
    p.fillGuide.visible = game.state === 'play' && p.active && !!p.fireJob && !waterReady(p) && p.vehicle !== 'boat';
    if (p.fillGuide.visible) {
      const point = p.vehicle === 'plane' ? p.fireJob.fire.scoop : p.fireJob.fire.dip;
      p.fillGuide.position.set(point.x, waveHeight(point.x, point.z, game.t) + 0.5, point.z);
      p.fillGuide.children[1].position.y = 5 + Math.sin(game.t * 2) * 0.5;
    }
  }
  for (const p of activePlayers()) {
    drawRadar(p);
    p.flashT -= dt; p.rateCd -= dt;
    if (slow) {
      const showWater = game.fire && p.vehicle !== 'boat';

      p.ui.water.style.display = showWater ? 'flex' : 'none';
      if (showWater) {
        const fill = Math.round(clamp(p.water, 0, 1) * 100);
        p.ui.fill.style.height = fill + '%'; p.ui.water.setAttribute('aria-valuenow', fill);
        p.ui.water.setAttribute('aria-valuetext', fill >= 100 ? 'Full, ready to drop' : fill + '% full');
        let label = $('.water-label', p.ui.water);
        if (!label) { label = document.createElement('span'); label.className = 'water-label'; p.ui.water.appendChild(label); }
        const F = p.fireJob?.fire;
        label.textContent = fill + '%' + (F ? ' · 🔥 ' + Math.round(fireProgress(F) * 100) + '% out' : '');
      }
      const h = hintFor(p);
      if (h !== p.hint) { p.hint = h; p.ui.hint.textContent = h; }
      p.ui.alt.innerHTML = '↕ ' + Math.max(0, p.clearance).toFixed(0).padStart(2, ' ') + ' m<br>➤ ' + (Math.hypot(p.vel.x, p.vel.z) * 3.6).toFixed(0) + ' km/h';
    }
  }
}

// ================================================================= flow
const menu = $('#menu');
const vehicleChoice = ['heli', 'heli'];
let modeChoice = 'mixed', locationChoice = 'auto';
try {
  const mode = localStorage.getItem('rescue-squad-mode'), location = localStorage.getItem('rescue-squad-location');
  if (MODES.includes(mode)) modeChoice = mode;
  if (LOCATIONS.includes(location)) locationChoice = location;
} catch { /* private browsing */ }
for (const Z of MISSION_ZONES) { const option = document.createElement('option'); option.value = Z.id; option.textContent = Z.icon + ' ' + Z.name; $('#location').appendChild(option); }
$('#location').value = locationChoice;
$('#location').addEventListener('change', () => {
  locationChoice = $('#location').value;
  try { localStorage.setItem('rescue-squad-location', locationChoice); } catch { /* private browsing */ }
  syncModeChoice();
});
const outingChanged = () => game.mode !== modeChoice || game.location !== locationChoice;
function syncModeChoice() {
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', b.dataset.mode === modeChoice);
  $('#modeDescription').textContent = (modeChoice === 'mixed' ? 'A fresh mix of rescue and firefighting missions. Your crew chooses what comes next.' : modeChoice === 'fire' ? 'Collect seawater, tackle island and rooftop fires, and keep friends safe.' : 'Find friends around the islands and bring them safely home.') + (game.started && outingChanged() ? ' Changing these options starts a new outing.' : '');
  $('#resume').textContent = game.started && outingChanged() ? '▶ Start new outing' : '▶ Keep playing';
  for (const card of document.querySelectorAll('.card')) {
    $('.keysEasy tr td:last-child', card).textContent = modeChoice === 'fire' ? 'hold to go and fight fires' : 'hold to go and help';
    $('.kp-heli tr:last-child td:last-child', card).textContent = modeChoice === 'fire' ? 'hold to dip the water bucket' : 'hold to lower the basket';
    $('.kp-plane tr:last-child td:last-child', card).textContent = modeChoice === 'fire' ? 'skim to fill; fly low over flames to drop' : 'fly down onto water to land; hold W to take off again';
    $('.kp-boat tr:last-child td:last-child', card).textContent = modeChoice === 'fire' ? 'slow near the shore to spray the fire' : 'stop beside a friend to throw the ring';
  }
}
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => {
  modeChoice = b.dataset.mode;
  try { localStorage.setItem('rescue-squad-mode', modeChoice); } catch { /* private browsing */ }
  syncModeChoice();
});
syncModeChoice();
function beginOuting() {
  game.mode = modeChoice; game.location = locationChoice;
  world.resetFireScars();
  game.celebrate = game.switchT = game.total = 0;
  $('#fade').style.opacity = 0;
  releaseWaiting(() => true); pours.length = 0;
  for (const p of players) {
    releasePilot(p);
    for (const an of p.cargo) { an.model.removeFromParent(); }
    p.cargo.length = 0; p.rescued = p.style = p.flashT = 0;
    p.routes = {}; p.ap = null;
    parkPlayer(p);
  }
  for (const an of hoppers) an.model.removeFromParent();
  hoppers.length = 0;
  setZone(1);
  spawnAnimal(true); spawnAnimal(true); spawnAnimal(false);
  zoneBanner(); syncModeChoice();
}
function savePilotChoices() {
  try { localStorage.setItem('rescue-squad-pilots', JSON.stringify(players.map(p => ({ vehicle: vehicleChoice[p.idx], pro: p.pro })))); } catch { /* private browsing */ }
}
function syncPilotChoices() {
  for (const p of players) {
    const card = $('.card[data-pilot="' + p.idx + '"]');
    if (card) card.className = 'card v-' + vehicleChoice[p.idx] + (p.pro ? ' pro' : '');
    for (const b of document.querySelectorAll('.veh[data-p="' + p.idx + '"]')) {
      const on = b.dataset.v === vehicleChoice[p.idx]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    }
    for (const b of document.querySelectorAll('.flt[data-p="' + p.idx + '"]')) {
      const on = (b.dataset.m === 'pro') === p.pro; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    }
  }
}
try {
  const choices = JSON.parse(localStorage.getItem('rescue-squad-pilots') || 'null');
  if (Array.isArray(choices)) players.forEach((p, i) => {
    if (choices[i] && ['heli', 'plane', 'boat'].includes(choices[i].vehicle)) vehicleChoice[i] = choices[i].vehicle;
    p.pro = choices[i]?.pro === true;
  });
} catch { /* Keep the simple defaults when storage is unavailable. */ }
syncPilotChoices();
for (const b of document.querySelectorAll('.veh')) b.addEventListener('click', () => {
  const i = +b.dataset.p; vehicleChoice[i] = b.dataset.v;
  syncPilotChoices(); savePilotChoices();
});
for (const b of document.querySelectorAll('.flt')) b.addEventListener('click', () => {
  const i = +b.dataset.p; players[i].pro = b.dataset.m === 'pro';
  syncPilotChoices(); savePilotChoices();
  players[i].tiltF = players[i].tiltS = 0; players[i].winch = 0; players[i].altOff = 0;
  syncHud();
});
function applyVehicleChoices() { for (const p of players) if (p.vehicle !== vehicleChoice[p.idx]) setVehicle(p, vehicleChoice[p.idx]); }
// friends nobody flying now can get to (up at a landing site with no helicopter about) wave and head off home,
// so they neither wait for ever nor hold up new rescues
function releaseStranded() {
  const act = activePlayers();
  releaseWaiting(an => !act.some(p => !outOfReach(an, p)));
}
// A departing pilot's half-finished pickup must be resolved before their machine is hidden or changed.
function releasePilot(p) {
  for (const an of waiting) if (an.claimed === p) an.claimed = null;
  p.waterStream.hide(); p.waterViewUntil = 0; p.pumpPressure = 0; p.cannonAim = null; p.gateOpen = p.scoopOpen = 0;
  p.target = p.pickup = p.fireJob = p.spray = p.attack = p.fireAim = null; p.water = p.pour = 0;
  p.ap = null; p.routes = {};          // (the autopilots' plans and routes start afresh)
  for (let i = hoppers.length - 1; i >= 0; i--) {
    const an = hoppers[i];
    if (an.state !== 'boarding' || an.by !== p) continue;
    hoppers.splice(i, 1);
    if (an.prop) { sinking.push({ o: an.prop, t: 0 }); an.prop = null; }
    p.basket.attach(an.model);
    an.state = 'riding'; p.cargo.push(an);
  }
  p.incoming = 0;
  if (lineRings[p.idx]) lineRings[p.idx].visible = false;
  p.rope.visible = false;
}
function showMenu(show) {
  menu.inert = !show; menu.setAttribute('aria-hidden', !show); menu.classList.toggle('hidden', !show);
  if (!show) { $('#settings').open = false; canvas.focus({ preventScroll: true }); }
  else $('#resume').focus({ preventScroll: true });
}
function startGame(n) {
  audio.setPaused(false);
  audio.unlock();
  applyVehicleChoices();
  const fresh = game.state === 'menu' && !game.started;
  game.started = true;
  players[0].active = true;
  if ((n === 2) !== players[1].active) setP2(n === 2, true);
  releaseStranded();
  if (fresh || outingChanged()) beginOuting();
  game.state = 'play'; game.paused = false;
  showMenu(false);
  layoutHud(); syncHud(); onResize();
  document.activeElement && document.activeElement.blur();
}
function setP2(on, quiet) {
  const p = players[1];
  if (on === p.active) return;
  if (on) {
    p.active = true; parkPlayer(p); showVehicle(p, true);
    if (!quiet) { fx.confetti(p.pos.x, p.pos.y + 3, p.pos.z, 80); sfx.chime(); banner('Blue pilot joined! 🔵', 'Arrow keys to fly', 3); }
  } else {
    releasePilot(p); while (p.cargo.length) deliverOne(p);
    p.active = false; showVehicle(p, false);
    releaseStranded();
  }
  layoutHud(); onResize();
}
function toggleP2() { audio.unlock(); setP2(!players[1].active); }
function togglePause() {
  if (!game.started) return;
  if (game.state === 'play') {
    game.state = 'menu'; game.paused = true; keys.clear(); audio.setPaused(true);
    $('#resumeRow').style.display = ''; $('#start1').classList.add('ghost'); $('#start2').classList.add('ghost');
    syncModeChoice(); showMenu(true); layoutHud(); onResize();
  }
  else resume();
}
function resume() { applyVehicleChoices(); if (outingChanged()) beginOuting(); releaseStranded(); keys.clear(); game.state = 'play'; game.paused = false; audio.setPaused(false); audio.unlock(); showMenu(false); layoutHud(); onResize(); }
// ---- picture quality. Four steps from the full picture down to one any laptop can draw smoothly. On "auto" (the
// default) the game watches how long frames really take and steps down when it is struggling, back up when there
// is room to spare; the corner button can also pin it to the best or the fastest. maxPR caps the pixels drawn per
// screen pixel (a sharp laptop screen would otherwise be drawn at four times the pixels), msaa smooths the edges.
const QUALITY = [
  { name: 'Best', maxPR: 2, scale: 1, msaa: 4, refl: 1, shadow: 4096, near: 105, far: 400, bloom: true },
  { name: 'Good', maxPR: 1.5, scale: 0.85, msaa: 4, refl: 0.5, shadow: 2048, near: 90, far: 360, bloom: true },
  { name: 'Fast', maxPR: 1.25, scale: 0.75, msaa: 2, refl: 0, shadow: 2048, near: 70, far: 300, bloom: true },
  { name: 'Fastest', maxPR: 1, scale: 0.6, msaa: 2, refl: 0, shadow: 1024, near: 50, far: 240, bloom: false },
];
// Where "auto" starts: the level it settled on last time on this machine, or else a guess from the graphics chip, so
// a small laptop is not made to struggle through the best picture for the first half minute.
function firstQuality() {
  try { const saved = localStorage.getItem('rescue-squad-quality'); if (saved !== null) return clamp(+saved | 0, 0, QUALITY.length - 1); } catch (e) { /* (private window) */ }
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const chip = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  let level = /SwiftShader|llvmpipe|Software|Basic Render/i.test(chip) ? 3
    : /Intel|Mali|Adreno|PowerVR|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics/i.test(chip) || matchMedia('(pointer: coarse)').matches ? 2
    : /Apple/i.test(chip) ? 1 : 0;
  // (a very big screen is a lot of pixels even for a strong card)
  if (level === 0 && innerWidth * innerHeight * PR * PR > 4.5e6) level = 1;
  return level;
}
const quality = { mode: 'auto', level: 0, slowT: 0, fastT: 0, coolT: 6, blockUpT: 0, avg: 16.7, savedT: 0 };      // (a grace period while shaders compile)
function setQuality(level) {
  level = clamp(level, 0, QUALITY.length - 1);
  const q = QUALITY[level];
  quality.level = level;
  gfx.reflections = q.refl > 0; gfx.reflScale = q.refl;
  const pr = Math.max(0.5, Math.min(PR, q.maxPR) * q.scale);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (rt.samples !== q.msaa) { rt.samples = q.msaa; rt.dispose(); }
  const sun = world.sun;
  if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  world.setDetail(q.near, q.far);
  bloom.enabled = q.bloom;
  onResize();
}
function toggleGfx() {
  // auto -> best -> fastest -> auto
  quality.mode = quality.mode === 'auto' ? 'best' : quality.mode === 'best' ? 'fast' : 'auto';
  if (quality.mode === 'best') setQuality(0); else if (quality.mode === 'fast') setQuality(3);
  quality.slowT = quality.fastT = quality.coolT = quality.blockUpT = 0;
  $('#bGfx').textContent = quality.mode === 'auto' ? '\u2728' : quality.mode === 'best' ? '\u{1F48E}' : '\u26A1';
  banner($('#bGfx').textContent + ' ' + (quality.mode === 'auto' ? 'Automatic graphics' : quality.mode === 'best' ? 'Best graphics' : 'Fast graphics'),
    quality.mode === 'auto' ? 'Picks what this computer can draw smoothly' : quality.mode === 'best' ? 'Everything on' : 'For slower computers', 1.8);
}
// called once a frame with how long the frame really took (milliseconds)
function watchFrames(ms) {
  if (quality.mode !== 'auto' || document.hidden || ms > 250) return;
  quality.avg += (ms - quality.avg) * 0.05;
  const s = Math.min(ms, 50) / 1000;
  quality.coolT -= s; quality.blockUpT -= s;
  if (quality.coolT > 0) return;
  if (quality.avg > 21) { quality.slowT += s; quality.fastT = 0; } else if (quality.avg < 17.6) { quality.fastT += s; quality.slowT = 0; } else { quality.slowT = quality.fastT = 0; }
  quality.savedT += s;
  if (quality.savedT > 20) {
    quality.savedT = -1e9;
    try { localStorage.setItem('rescue-squad-quality', quality.level); } catch (e) { /* (private window) */ }
  }
  // (under 30 frames a second it steps down sooner)
  if (quality.slowT > (quality.avg > 34 ? 1.2 : 2.5) && quality.level < QUALITY.length - 1) {
    // (if it struggles straight after a step up, do not try that again for a minute)
    if (quality.justUp) quality.blockUpT = 60;
    setQuality(quality.level + 1); quality.slowT = 0; quality.coolT = 3; quality.justUp = false; quality.savedT = 0;
  } else if (quality.fastT > 15 && quality.level > 0 && quality.blockUpT <= 0) {
    setQuality(quality.level - 1); quality.fastT = 0; quality.coolT = 5; quality.justUp = true; quality.savedT = 0;
  } else if (quality.fastT > 8) quality.justUp = false;
}
function syncSoundControls() {
  const mute = $('#bMute');
  mute.textContent = audio.muted || audio.volume === 0 ? '🔇' : '🔊';
  mute.setAttribute('aria-pressed', audio.muted);
  mute.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  $('#volume').value = Math.round(audio.volume * 100);
}
function toggleMute() { audio.unlock(); audio.toggleMute(); syncSoundControls(); }
syncSoundControls();
$('#volume').addEventListener('input', e => { audio.unlock(); audio.setVolume(+e.target.value / 100); syncSoundControls(); });
document.addEventListener('pointerdown', e => { if (!$('#settings').contains(e.target)) $('#settings').open = false; });

$('#start1').addEventListener('click', () => startGame(1));
$('#start2').addEventListener('click', () => startGame(2));
$('#resume').addEventListener('click', resume);
$('#bP2').addEventListener('click', e => { toggleP2(); e.currentTarget.blur(); });
$('#bTime').addEventListener('click', e => { cyclePreset(); e.currentTarget.blur(); });
$('#bWx').addEventListener('click', e => { cycleWeather(); e.currentTarget.blur(); });
$('#bGfx').addEventListener('click', e => { toggleGfx(); e.currentTarget.blur(); });
$('#bMute').addEventListener('click', e => { toggleMute(); e.currentTarget.blur(); });
$('#bPause').addEventListener('click', e => { togglePause(); e.currentTarget.blur(); });

// ================================================================= rain
// Streaks of rain in a box that travels with whichever camera is drawing, falling slant with the wind. Only in a blow.
const RAIN_N = 2600, RAIN_BOX = 60;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 6), rainSeed = new Float32Array(RAIN_N * 3);
for (let i = 0; i < RAIN_N; i++) { rainSeed[i * 3] = Math.random(); rainSeed[i * 3 + 1] = Math.random(); rainSeed[i * 3 + 2] = Math.random(); }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
const rainMat = new THREE.LineBasicMaterial({ color: 0xc8d4e2, transparent: true, opacity: 0, depthWrite: false });
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 4;
scene.add(rain);
function placeRain(at, t) {
  const heavy = clamp((weather.now - 0.6) / 0.35, 0, 1);
  rain.visible = heavy > 0.01;
  if (!rain.visible) return;
  rainMat.opacity = 0.32 * heavy * (1 - 0.6 * world.preset.night);
  windAt(at.x, at.z, t, WIND);
  const fall = 26, sx = WIND.x / fall, sz = WIND.z / fall, len = 1.6;
  for (let i = 0; i < RAIN_N; i++) {
    // each drop falls through the box over and over, from a fixed place in it that the camera carries along
    const h = (rainSeed[i * 3 + 1] * RAIN_BOX - t * fall) % RAIN_BOX, y = at.y + RAIN_BOX * 0.5 + (h < 0 ? h + RAIN_BOX : h) - RAIN_BOX;
    const x = at.x + (rainSeed[i * 3] - 0.5) * RAIN_BOX + (y - at.y) * sx, z = at.z + (rainSeed[i * 3 + 2] - 0.5) * RAIN_BOX + (y - at.y) * sz;
    const o = i * 6;
    rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
    rainPos[o + 3] = x + sx * len; rainPos[o + 4] = y + len; rainPos[o + 5] = z + sz * len;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ================================================================= snow and ash
// Each zone has weather of its own: soft snowflakes always drift down over the snowy peaks (thicker in a blow), and
// fine grey ash floats down round the volcano. A box of flakes travels with whichever camera is drawing, as the rain does.
const FLAKE_N = 1800, FLAKE_BOX = 70;
const flakeGeo = new THREE.BufferGeometry(), flakePos = new Float32Array(FLAKE_N * 3), flakeSeed = new Float32Array(FLAKE_N * 4);
for (let i = 0; i < FLAKE_N * 4; i++) flakeSeed[i] = Math.random();
flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3).setUsage(THREE.DynamicDrawUsage));
const flakeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const flakeMat = new THREE.PointsMaterial({ map: flakeTex, size: 0.32, transparent: true, depthWrite: false, opacity: 0, color: 0xffffff });
const flakes = new THREE.Points(flakeGeo, flakeMat);
flakes.frustumCulled = false; flakes.visible = false; flakes.renderOrder = 4;
scene.add(flakes);
function placeFlakes(at, t) {
  const snow = snowAt(at.x, at.z), ash = 1 - clamp((Math.hypot(at.x - CRATER.x, at.z - CRATER.z) - 110) / 60, 0, 1);
  const k = Math.max(snow, ash * 0.8);
  flakes.visible = k > 0.02 && at.y < 140;
  if (!flakes.visible) return;
  const isSnow = snow >= ash;
  flakeMat.opacity = (isSnow ? 0.8 : 0.55) * k * (1 - 0.5 * world.preset.night);
  flakeMat.color.set(isSnow ? 0xffffff : 0x6e6a66);
  flakeMat.size = isSnow ? 0.5 : 0.26;
  windAt(at.x, at.z, t, WIND);
  const fall = isSnow ? 1.6 + weather.now * 1.5 : 0.7, n = Math.round(FLAKE_N * (isSnow ? 0.45 + 0.55 * weather.now : 0.5));
  flakeGeo.setDrawRange(0, n);
  for (let i = 0; i < n; i++) {
    const sd = i * 4, h = (flakeSeed[sd + 1] * FLAKE_BOX - t * fall * (0.7 + flakeSeed[sd + 3] * 0.6)) % FLAKE_BOX;
    const y = at.y + FLAKE_BOX * 0.4 + (h < 0 ? h + FLAKE_BOX : h) - FLAKE_BOX;
    // (each one wanders as it falls, and drifts with the wind)
    const wob = Math.sin(t * 1.3 + flakeSeed[sd + 3] * 40) * 0.8, drift = (y - at.y) / fall;
    let x = at.x + (flakeSeed[sd] - 0.5) * FLAKE_BOX - WIND.x * drift * 0.4 + wob, z = at.z + (flakeSeed[sd + 2] - 0.5) * FLAKE_BOX - WIND.z * drift * 0.4 + Math.cos(t * 1.1 + flakeSeed[sd] * 30) * 0.8;
    x = at.x + ((((x - at.x) / FLAKE_BOX + 0.5) % 1 + 1) % 1 - 0.5) * FLAKE_BOX; z = at.z + ((((z - at.z) / FLAKE_BOX + 0.5) % 1 + 1) % 1 - 0.5) * FLAKE_BOX;
    flakePos[i * 3] = x; flakePos[i * 3 + 1] = y; flakePos[i * 3 + 2] = z;
  }
  flakeGeo.attributes.position.needsUpdate = true;
}

// ================================================================= rendering
const menuCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 9000);
// how high the menu's orbit must go at angle a to sail over the wooded hill and see the base past its treetops,
// worked out once round the circle and smoothed so it climbs and settles gently
let menuLift = null;
function menuFloor(a) {
  const N = 180, top = (x, z) => Math.max(terrainHeight(x, z), 0.8) + canopyAt(x, z);
  if (!menuLift) {
    const need = [];
    for (let i = 0; i < N; i++) {
      const x = Math.sin(i / N * 6.283) * 70, z = Math.cos(i / N * 6.283) * 70;
      let y = top(x, z) + 9;
      for (let f = 0.05; f < 0.65; f += 0.05) y = Math.max(y, (top(x * (1 - f), z * (1 - f)) + 3 - 9 * f) / (1 - f));
      need.push(y);
    }
    const ring = (src, w, fn) => src.map((_, i) => { let v = fn === 'max' ? -1e9 : 0; for (let j = -w; j <= w; j++) { const s = src[(i + j + N) % N]; v = fn === 'max' ? Math.max(v, s) : v + s / (2 * w + 1); } return v; });
    menuLift = ring(ring(ring(need, 12, 'max'), 6), 6);
  }
  const u = ((a / 6.283) % 1 + 1) % 1 * N, i = Math.floor(u) % N;
  return lerp(menuLift[i], menuLift[(i + 1) % N], u - Math.floor(u));
}
menuCam.layers.enable(PLANT_LAYER);
function getViews() {
  const act = activePlayers();
  if (game.state !== 'play' || !act.length) return [{ cam: menuCam, x: 0, w: 1, focus: MENU_FOCUS }];
  if (act.length === 1) return [{ cam: act[0].cam, x: 0, w: 1, focus: act[0].pos }];
  return [{ cam: players[0].cam, x: 0, w: 0.5, focus: players[0].pos }, { cam: players[1].cam, x: 0.5, w: 0.5, focus: players[1].pos }];
}
const MENU_FOCUS = new THREE.Vector3(0, BASE_Y, 0);

// ---- planar water reflection: the whole scene is drawn once more from a camera mirrored below the sea
const gfx = { reflections: true, reflScale: 1 };
const reflRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
const reflCam = new THREE.PerspectiveCamera();
reflCam.layers.enable(MIRROR_LAYER);
const aboveSea = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.6), _cp = new THREE.Plane(), _cq = new THREE.Vector4();
const _rp = new THREE.Vector3(), _rt = new THREE.Vector3(), _ru = new THREE.Vector3(), _rm = new THREE.Matrix4();
// what lies under the sea is cut away by tilting the mirror camera's near plane onto the water (as three's Reflector
// does) rather than with a clipping plane, which would need a second copy of every shader
function clipNearToSea(c) {
  _cp.copy(aboveSea).applyMatrix4(c.matrixWorldInverse);
  const e = c.projectionMatrix.elements;
  _cq.set((Math.sign(_cp.normal.x) + e[8]) / e[0], (Math.sign(_cp.normal.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
  const k = 2 / (_cp.normal.dot(_cq) + _cp.constant * _cq.w);
  e[2] = _cp.normal.x * k; e[6] = _cp.normal.y * k; e[10] = _cp.normal.z * k + 1; e[14] = _cp.constant * k;
  c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
}
function renderReflection(renderer, cam) {
  const u = world.waterUniforms;
  cam.updateMatrixWorld();
  _rp.setFromMatrixPosition(cam.matrixWorld);
  _rt.set(0, 0, -1).transformDirection(cam.matrixWorld).add(_rp);
  _ru.set(0, 1, 0).transformDirection(cam.matrixWorld);
  reflCam.position.set(_rp.x, -_rp.y, _rp.z);
  reflCam.up.set(_ru.x, -_ru.y, _ru.z);
  reflCam.lookAt(_rt.x, -_rt.y, _rt.z);
  reflCam.near = cam.near; reflCam.far = cam.far;
  reflCam.updateMatrixWorld();
  reflCam.projectionMatrix.copy(cam.projectionMatrix);
  // (only the depth row changes, so where things land on the mirror is the same either way)
  u.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    .multiply(reflCam.projectionMatrix).multiply(_rm.copy(reflCam.matrixWorld).invert());
  clipNearToSea(reflCam);
  world.water.visible = false;
  renderer.setRenderTarget(reflRT);
  renderer.clear();
  renderer.render(scene, reflCam);
  world.water.visible = true;
  u.uReflTex.value = reflRT.texture;
}

class SplitRenderPass extends Pass {
  constructor() { super(); this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    const rt = this.renderToScreen ? null : readBuffer;
    const W = readBuffer.width, H = readBuffer.height;
    rt.scissorTest = false; rt.viewport.set(0, 0, W, H);
    renderer.setRenderTarget(rt); renderer.clear();
    world.waterUniforms.uReflOn.value = gfx.reflections ? 1 : 0;
    for (const v of getViews()) {
      const vx = Math.round(v.x * W), vw = Math.round(v.w * W);
      const a = vw / H;
      if (Math.abs(v.cam.aspect - a) > 1e-4) { v.cam.aspect = a; v.cam.updateProjectionMatrix(); }
      const tanF = Math.tan(THREE.MathUtils.degToRad(v.cam.fov) / 2);
      world.aimSun(v.focus);
      v.cam.updateMatrixWorld();
      world.cull(v.cam);
      // the shadow map is drawn once per view and shared by the mirror pass and the main pass
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
      if (gfx.reflections) {
        const rw = Math.max(64, Math.round(vw * 0.5 * gfx.reflScale)), rh = Math.max(64, Math.round(H * 0.5 * gfx.reflScale));
        if (reflRT.width !== rw || reflRT.height !== rh) reflRT.setSize(rw, rh);
        fx.material.uniforms.uScale.value = rh / (2 * tanF);
        renderReflection(renderer, v.cam);
      }
      rt.viewport.set(vx, 0, vw, H); rt.scissor.set(vx, 0, vw, H); rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      fx.material.uniforms.uScale.value = H / (2 * tanF);
      placeRain(v.cam.position, game.t); placeFlakes(v.cam.position, game.t);
      renderer.render(scene, v.cam);
    }
    rt.scissorTest = false; rt.viewport.set(0, 0, W, H); rt.scissor.set(0, 0, W, H);
  }
}
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new SplitRenderPass());
// one bad (NaN / runaway) pixel would be smeared over the whole screen by bloom – scrub them first
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; if (!(c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0)) c = vec3(0.0); gl_FragColor = vec4(min(c, vec3(48.0)), 1.0); }',
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// the grade: a little more contrast and colour than the tone curve leaves, and corners that fall away gently
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);
      c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.12);
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.42;
      gl_FragColor = vec4(c, 1.0);
    }`,
}));

function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  for (const p of players) p.cam.fov = activePlayers().length > 1 ? 66 : 58;
  for (const p of players) p.cam.updateProjectionMatrix();
}
addEventListener('resize', onResize);

// development: debug.view = [x, y, z, lookX, lookY, lookZ] holds the menu camera still; debug.run(seconds) plays
// the game forward without waiting for the screen (a hidden tab draws nothing), and debug.shot(name) posts the
// frame to serve.mjs, which writes shots/<name>.jpg
// Simulation checks count how often each pilot touches something, by kind, once per touch rather than per frame.
function bump(p, kind) {
  const c = debug.bumps[p.idx];
  if (game.t - (c.last[kind] ?? -9) > 0.5) c[kind] = (c[kind] || 0) + 1;
  c.last[kind] = game.t;
}
const debug = {
  view: null,
  bumps: [{ last: {} }, { last: {} }],
  // on to the next mission, exactly as finishing one does
  next: () => nextMission(),
  // fly a different machine without going back to the menu
  vehicle(kind, i = 0) { setVehicle(players[i], kind); vehicleChoice[i] = kind; },
  // put a rescue where it can be looked at: a stricken boat, or a friend at landing site number i
  boat: () => spawnBoat(400, world.spawn.sea),
  wreck: () => spawnWreck(),
  // start the mission in a zone ('forest', 'reef', ...), and put the red pilot there
  zone(id, fire = false) { game.mode = fire ? 'fire' : 'rescue'; game.location = id; setZone(1); },
  goto(id, d = 70) {
    const Z = ZONES.find(q => q.id === id), p = players[0], l = Math.hypot(Z.x, Z.z) || 1;
    p.pos.set(Z.x - Z.x / l * (Z.r + d), p.vehicle === 'heli' ? 30 : p.pos.y, Z.z - Z.z / l * (Z.r + d));
    p.vel.set(0, 0, 0); p.yaw = Math.atan2(Z.x - p.pos.x, Z.z - p.pos.z);
    p.parked = p.landed = p.grounded = false; p.camPos.set(p.pos.x - Math.sin(p.yaw) * 20, p.pos.y + 8, p.pos.z - Math.cos(p.yaw) * 20);
  },
  add(kind, i = 0) {
    if (kind === 'tower') return addWaiting('perch', world.towerDeck.x, world.towerDeck.z, { perchY: world.towerDeck.y });
    if (kind === 'roof') { const r = world.roofs[i]; return addWaiting('perch', r.x, r.z, { perchY: r.y }); }
    if (kind === 'floe') { const f = world.spawn.zoneSea.snow[i]; return addWaiting('floe', f.x, f.z, { prefer: 'penguin' }); }
    if (kind === 'lake') return addWaiting('kayak', LAKE.x, LAKE.z, { landlocked: true });
    const c = kind === 'hut' ? HUTS[i].porch : kind === 'ledge' ? world.spawn.ledges[i] : world.spawn.sea[i];
    return addWaiting(kind, c.x, c.z);
  },
  camp(i) { const site = SITES[i], c = campSpot(site); site.busy = true; return addWaiting('camp', c.x, c.z, { site }); },
  // a fire in a zone ('home', 'forest', 'harbour', ...)
  fire(id = 'home') { return spawnFire(ZONES.find(Z => Z.id === id)); },
  // (frame: how long each frame takes, in seconds: 1/30 by default; 0.1 plays it as a slow laptop would)
  run(seconds = 0.1, frame = 1 / 30) { for (let i = 0; i < seconds / frame - 1e-6; i++) tick(performance.now(), frame); },
  // milliseconds a frame really takes to draw (reading a pixel back makes the graphics card finish first)
  time(frames = 40) {
    const gl = renderer.getContext(), px = new Uint8Array(4), t0 = performance.now();
    for (let i = 0; i < frames; i++) { debug.run(0.034); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return (performance.now() - t0) / frames;
  },
  shot(name) {
    debug.run(0.07);
    return new Promise(done => canvas.toBlob(b => fetch('/__shot/' + name + '.jpg', { method: 'POST', body: b }).then(() => done(name)), 'image/jpeg', 0.92));
  },
};

// ================================================================= main loop
setPreset(0);
layoutHud(); syncHud();
showVehicle(players[1], false);
players[0].active = true;   // red sits on its pad behind the menu

let last = performance.now(), simT = 0;
let lastFrame = performance.now();
// (one bad frame must never freeze the game for good: the error is noted, once per kind, for the checks to find, and
// the next frame goes on)
const problemsSeen = new Set();
function frame(now) {
  requestAnimationFrame(frame); watchFrames(now - lastFrame); lastFrame = now;
  try { tick(now); } catch (e) {
    const key = String(e && e.message);
    if (!problemsSeen.has(key)) { problemsSeen.add(key); console.error(e); (window.__gameProblems ||= []).push({ what: 'frame error', message: key, stack: e && e.stack }); }
  }
}
// The game moves on in equal small steps of at most 1/60 s, however long the frame was: a slow laptop's frame is
// worked out in two or three steps, so the springs, the swinging basket and the autopilots behave just as they do
// on a fast machine (and a long stall is capped, so nothing leaps). Every frame still moves on by exactly its own
// time, so the picture never judders on a fast screen.
const STEP = 1 / 60;
function tick(now, forced) {
  const frameDt = forced || Math.min((now - last) / 1000, 0.1); last = now;
  const steps = Math.max(1, Math.ceil(frameDt / STEP - 1e-6));
  for (let i = 0; i < steps; i++) simulate(frameDt / steps);
  present(frameDt);
}
function simulate(dt) {
  const playing = game.state === 'play';
  if (!game.paused) simT += dt;
  const t = simT; game.t = t;
  tickFriends(t);

  if (!game.paused) {
    weather.now += (WEATHERS[weather.idx].wind - weather.now) * damp(0.35, dt); weather.dir += dt * 0.004;
    sea.swell = 0.75 + weather.now * 1.2;
    world.blow(weather.now);
    world.update(dt, t);
    for (const p of players) {
      if (!p.active) continue;
      if (playing) readInput(p); else { p.input.f = p.input.t = p.input.l = 0; p.input.horn = false; }
      if (p.vehicle === 'plane') updatePlane(p, dt, t); else if (p.vehicle === 'boat') updateBoat(p, dt, t); else updatePlayer(p, dt, t);
    }
    // copter high-five
    game.boop -= dt;
    const [a, b] = players;
    if (a.active && b.active) {
      const d = a.pos.distanceTo(b.pos);
      if (d < 13 && d > 0.01) {
        V.copy(b.pos).sub(a.pos).multiplyScalar(1 / d);
        const push = (13 - d) * 6;
        if (!a.grounded) a.vel.addScaledVector(V, -push * dt * 4); if (!b.grounded) b.vel.addScaledVector(V, push * dt * 4);
        if (game.boop <= 0 && !a.grounded && !b.grounded) {
          game.boop = 3; sfx.laugh(); V.copy(a.pos).add(b.pos).multiplyScalar(0.5);
          fx.hearts(V.x, V.y + 2, V.z, 6); fx.emoji('🙌', V.x, V.y + 4, V.z, 4);
        }
      }
    }
    // animals
    if (game.started) {
      game.spawnT -= dt;
      if (waiting.length < maxWaiting() && game.spawnT <= 0 && game.celebrate <= 0) { spawnAnimal(false); game.spawnT = 4 + play() * 4; }
    }
    updateBoatRescue(dt, t);
    updateFires(dt, t);
    updateZoneBeam(t);
    switchMission(dt);
    for (const an of waiting) placeWaiting(an, t, dt);
    updateLeaving(dt); updateBoarding(dt, t); updateSinking(dt);
    updateHoppers(dt, t);
    updateResidents(dt, t);
    life.update(dt, t, activePlayers());
    traffic.update(dt, t, activePlayers());

    // celebration
    if (game.celebrate > 0) {
      game.stickerT -= dt;
      if (game.stickerBursts > 0 && game.stickerT <= 0) {
        game.stickerT += 0.18; game.stickerBursts--;
        for (const p of activePlayers()) fx.emoji(game.stickerIcon, p.pos.x + (Math.random() - 0.5) * 30, p.pos.y + 6 + Math.random() * 8, p.pos.z + (Math.random() - 0.5) * 30, 3 + Math.random() * 2);
      }
      game.celebrate -= dt; game.fireT -= dt;
      if (game.fireT <= 0) {
        game.fireT = 0.28 + Math.random() * 0.3;
        fx.firework((Math.random() - 0.5) * 90, 34 + Math.random() * 30, (Math.random() - 0.5) * 90 - 10);
        sfx.firework(0.6 + Math.random() * 0.4);
      }
      if (game.celebrate <= 0) nextMission();
    }
    fx.update(dt);

    // water interaction uniforms + sound
    const two = activePlayers().length > 1;
    players.forEach((p, i) => {
      const u = world.waterUniforms;
      if (!p.active) { u.uHeli.value[i].w = 0; u.uLamp.value[i].w = 0; audio.setEngine(i, p.vehicle, 0, 0, 0, 0, false); return; }
      const alt = p.pos.y - (p.vehicle === 'plane' ? PLANE_FLOAT : p.vehicle === 'boat' ? 0 : SKID);
      // (the rotor's wash is felt by what is under it: the water, or the treetops)
      const washAlt = p.vehicle === 'heli' ? Math.max(0, p.clearance - (p.overLand ? canopyAt(p.pos.x, p.pos.z) : 0)) : alt;
      u.uHeli.value[i].set(p.pos.x, p.pos.y, p.pos.z, p.landed || p.vehicle === 'boat' ? 0 : clamp(1 - (washAlt - 1) / 24, 0, 1) * p.spin * (p.vehicle === 'plane' ? 0.25 : 1));
      const off = alt * 0.53;
      u.uLamp.value[i].set(p.pos.x + Math.sin(p.yaw) * off, p.pos.z + Math.cos(p.yaw) * off, 3 + alt * 0.42, world.preset.night >= 1 ? clamp(1.1 - alt / 70, 0, 1) * 0.55 : 0);
      const load = clamp(Math.abs(p.input.l) * 0.6 + Math.hypot(p.vel.x, p.vel.z) / MAX_SPEED * 0.6, 0, 1);
      // (how far off the ground or the water: the helicopter's skids, the seaplane's floats; the boat never leaves it)
      const air = p.vehicle === 'heli' ? (p.grounded ? 0 : 1) : p.vehicle === 'plane' ? 1 - p.sea : 0;
      const work = p.vehicle === 'boat' ? clamp(Math.abs(p.fs) / 30, 0, 1) : p.vehicle === 'plane' ? clamp(p.fs / 36, 0, 1) : load;
      audio.setEngine(i, p.vehicle, p.spin, work, air, two ? (i ? 0.55 : -0.55) : 0, playing);
    });
    // the wakes: every fifth of a second a boat (or the seaplane on the water) going along drops a point of churned water
    players.forEach((p, i) => {
      const trail = p.trail || (p.trail = []);
      p.trailT = (p.trailT || 0) - dt;
      const sp = Math.abs(p.fs || 0), onWater = p.active && (p.vehicle === 'boat' || (p.vehicle === 'plane' && p.afloat));
      if (onWater && sp > 3 && p.trailT <= 0) {
        p.trailT = 0.2;
        const back = p.vehicle === 'boat' ? 3.6 : 2.5;
        trail.push({ x: p.pos.x - Math.sin(p.yaw) * back, z: p.pos.z - Math.cos(p.yaw) * back, t: t, s: clamp(sp / 22, 0.25, 1) });
      }
      while (trail.length && (trail.length > WAKE_N / 2 || t - trail[0].t > 7)) trail.shift();
      for (let k = 0; k < WAKE_N / 2; k++) {
        const pt = trail[k], u = wakeUniform.value[i * WAKE_N / 2 + k];
        if (pt) u.set(pt.x, pt.z, t - pt.t, pt.s); else u.w = 0;
      }
    });
    // the sea, louder the lower the pilots are; wind and rain with the weather; the fire's crackle close to one
    let low = 1e9;
    for (const p of activePlayers()) low = Math.min(low, p.vehicle === 'boat' ? 0 : Math.max(0, p.pos.y - 2));
    audio.setAmbient(playing ? clamp(1.1 - low / 60, 0.3, 1) : 0.5, weather.now, clamp((weather.now - 0.6) / 0.35, 0, 1), playing ? clamp(1 - fireNear / 110, 0, 1) : 0);
  }
}
function present(dt) {
  const playing = game.state === 'play';
  // menu camera: slow orbit of the base
  if (!playing) {
    const a = performance.now() / 1000 * 0.07 + 0.9;
    menuCam.position.set(Math.sin(a) * 70, Math.max(24 + Math.sin(a * 0.7) * 5, menuFloor(a)), Math.cos(a) * 70);
    menuCam.lookAt(0, 9, 0);
    if (debug.view) { menuCam.position.fromArray(debug.view, 0); menuCam.lookAt(debug.view[3], debug.view[4], debug.view[5]); }
    const asp = innerWidth / innerHeight;
    if (Math.abs(menuCam.aspect - asp) > 1e-4) { menuCam.aspect = asp; menuCam.updateProjectionMatrix(); }
  } else updateHud(dt);

  if (debug.noDraw) return;          // (soak tests play the game without drawing it)
  composer.render();
}
// (the checks always run at the same detail, so a seed plays out the same on every computer: what is near enough to
// show, and the effects drawing from the shared random numbers, would otherwise differ with the graphics card)
setQuality(TEST ? 3 : firstQuality());
if (TEST) quality.mode = 'fast';
// Every shader is handed to the graphics driver before the first frame and compiled side by side where the browser
// allows it, instead of one after another inside the first frame with the page frozen for seconds. They are compiled
// for the composer's buffer, which is what the scene is really drawn into, and the full-screen passes' shaders come
// along through a scene of stand-in quads wearing them.
const postScene = new THREE.Scene(), quad = new THREE.PlaneGeometry(2, 2);
for (const pass of composer.passes) for (const v of Object.values(pass)) for (const m of [v].flat()) if (m && m.isShaderMaterial) postScene.add(new THREE.Mesh(quad, m));
if (TEST) {
  // (a test page draws nothing and plans everything at once, so a seed always plays out the same way)
  debug.noDraw = true;
  traffic.plan(true);
} else {
renderer.setRenderTarget(composer.renderTarget1);
const warmUp = Promise.all([renderer.compileAsync(scene, menuCam), renderer.compileAsync(postScene, menuCam)]);
renderer.setRenderTarget(null);
warmUp.catch(() => {}).then(() => {
  firePrograms.group.visible = false;
  try { portraits = createPortraits(renderer); syncHud(); } catch (e) { console.warn('Using rescue symbols for passenger pictures', e); }
  world.prewarmShadows(composer.renderTarget1, menuCam);
  // (and one whole frame drawn, mirror and all, for the few shaders only a real frame builds)
  composer.render();
  requestAnimationFrame(frame);
  requestAnimationFrame(() => { canvas.classList.add('ready'); $('#loading').hidden = true; });
  traffic.plan();
});
}

// tiny debug handle (also handy for automated checks)
window.__game = { TEST, PLANE_FLOAT, DOCK, nav, navMs, life, traffic, terrainHeight, waveHeight, sea, ISLETS, HUTS, PADS, WORLD_R, canopyAt, SITES, OBSTACLES, SHOALS, ZONES, quality, setQuality, weather, setWeather, gfx, game, players, waiting, residents, scene, world, renderer, composer, keys, fx, debug, setPreset };

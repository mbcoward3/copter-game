import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createWorld, terrainHeight, canopyAt, waveHeight, sea, PRESETS, WORLD_R, BASE_Y, PAD_Y, PADS, SITES, OBSTACLES, ISLETS } from './world.js';
import { buildHeli, buildBasket, buildRing, buildRaft, buildAnimal, buildBeam, buildPlane, buildBoat, ANIMAL_TYPES, SKID, HOIST, DOOR_OPEN, BASKET_TOP, PLANE_FLOAT } from './models.js';
import { model } from './assets.js';
import { createFx } from './fx.js';
import { createLife } from './life.js';
import { audio, sfx, animalVoice } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
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
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.7 }));
  rope.castShadow = true; scene.add(rope);
  const cam = new THREE.PerspectiveCamera(60, 1, 0.5, 9000);
  const pane = $('#pane' + idx);
  const p = {
    idx, model, basket, rope, cam, pane, active: false,
    vehicle: 'heli', heli: model, heliBasket: basket, plane, boat, fs: 0, afloat: true, sea: 1, hoist: 0, manualT: 0, hook: new THREE.Vector3(),
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, yawVel: 0, pitch: 0, roll: 0,
    spin: 0, landed: true, grounded: true, clearance: 0, surfaceY: 0, overLand: true,
    bpos: new THREE.Vector3(), bvel: new THREE.Vector3(), ropeLen: 0.6, stow: 0,
    parked: true, altOff: 0, idleT: 0, incoming: 0, shake: 0, squash: 0, camG: 1,
    cargo: [], target: null, boardCd: 0, dropCd: 0, washAcc: 0, hornCd: 0, speakCd: 0,
    camPos: new THREE.Vector3(), camYaw: 0, camLook: new THREE.Vector3(),
    rescued: 0, hint: '', input: { f: 0, t: 0, l: 0, s: 0, w: 0, horn: false },
    pro: false, tiltF: 0, tiltS: 0, winch: 0, style: 0, flash: '', flashT: 0, rateCd: 0,
    ui: { score: $('.score', pane), slots: [...pane.querySelectorAll('.slot')], hint: $('.hint', pane), alt: $('.alt', pane), radar: $('.radar', pane).getContext('2d') },
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
  if (!on || p.vehicle !== 'heli') { p.heliBasket.visible = false; p.rope.visible = false; }
}
function setVehicle(p, kind) {
  if (p.pickup) { p.pickup.claimed = null; p.pickup = null; }
  p.target = null;
  while (p.cargo.length) deliverOne(p);
  p.vehicle = kind;
  p.model = p[kind];
  p.basket = kind === 'heli' ? p.heliBasket : p[kind].seat;
  parkPlayer(p); showVehicle(p, p.active);
}
const BERTH = [{ x: -5, z: 52 }, { x: 5, z: 52 }];       // the boats tie up alongside the pier
const MOORING = [{ x: -8, z: 60 }, { x: 8, z: 60 }];   // either side of the pier
const DOCK = new THREE.Vector3(0, 0, 66);
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
}
players.forEach(parkPlayer);
const activePlayers = () => players.filter(p => p.active);

// ================================================================= game state
const game = { state: 'menu', paused: false, mission: 1, rescued: 0, goal: 5, total: 0, presetIdx: 0, celebrate: 0, fireT: 0, spawnT: 0, t: 0, boop: 0 };
const waiting = [], residents = [], hoppers = [];
const goalFor = m => Math.min(4 + m * 2, 14);
const maxWaiting = () => Math.min(3 + game.mission + (activePlayers().length > 1 ? 1 : 0), 8);

// ================================================================= input
const keys = new Set();
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyR', 'KeyM', 'ControlRight', 'Numpad0', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Period', 'Comma', 'Slash', 'NumpadEnter']);
addEventListener('keydown', e => {
  if (e.target instanceof HTMLButtonElement && (e.code === 'Enter' || e.code === 'Space') && game.state === 'menu') return; // let menu buttons work
  if (GAME_KEYS.has(e.code)) { e.preventDefault(); keys.add(e.code); audio.unlock(); }
  if (e.repeat) return;
  if (e.code === 'Escape') togglePause();   // everything else lives on the corner buttons, safe from little hands
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const k = c => (keys.has(c) ? 1 : 0);
const dz = v => (Math.abs(v) < 0.18 ? 0 : v);

function readInput(p) {
  const solo = activePlayers().length === 1;
  const pro = p.pro && p.vehicle === 'heli';
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
function updatePlayer(p, dt, t) {
  // A friend waiting at a landing site: once the helicopter is overhead it sets itself down beside them, they climb
  // aboard, and then it sits there until the pilot presses go again.
  if (p.pickup && p.pickup.state !== 'waiting') p.pickup = null;
  if (!p.pro && !p.pickup && !p.grounded && p.cargo.length + p.incoming < MAX_CARGO) for (const an of waiting) {
    if (an.kind !== 'camp' || (an.claimed && an.claimed !== p)) continue;
    if (Math.hypot(an.site.x - p.pos.x, an.site.z - p.pos.z) < 8) { p.pickup = an; an.claimed = p; p.parked = true; sfx.winch(); break; }
  }
  // (a pilot flying it properly has to put it down at the site themselves)
  if (p.pro && p.grounded && Math.hypot(p.vel.x, p.vel.z) < 1.5 && p.cargo.length + p.incoming < MAX_CARGO) for (const an of waiting) {
    if (an.kind === 'camp' && Math.hypot(an.site.x - p.pos.x, an.site.z - p.pos.z) < an.site.r + 1) { board(an, p); break; }
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
    if (p.parked && inp.l > 0) { p.parked = false; if (p.grounded && p.spin < 0.6) sfx.engineStart(p.spin); }
    if (!p.parked && p.grounded && p.idleT > 3.5) { p.parked = true; sfx.engineStop(); }
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
    if (busy) { p.idleT = 0; if (p.parked && (inp.f !== 0 || inp.t !== 0 || inp.l > 0)) { p.parked = false; p.altOff = 0; if (p.grounded && p.spin < 0.6) sfx.engineStart(p.spin); } }
    else p.idleT += dt;
    if (!p.parked) {
      p.altOff = clamp(p.altOff + inp.l * 16 * dt, -CRUISE, 70);
      const overPad = PADS.some(pad => Math.hypot(p.pos.x - pad.x, p.pos.z - pad.z) < 7);
      if ((overPad && p.idleT > 2.2 && Math.hypot(p.vel.x, p.vel.z) < 3 && !p.cargo.length) || (p.grounded && p.altOff <= -CRUISE + 0.5 && !busy)) p.parked = true;
    }
    // (over the sea, hold height against the calm water line so the swell does not make it bob)
    // (and over forest, against the treetops)
    let ahead = p.overLand ? p.surfaceY + Math.max(0, canopyAt(p.pos.x, p.pos.z) - 4) : 0;
    for (const sec of [0.6, 1.3, 2.2]) {
      const ax = p.pos.x + p.vel.x * sec, az = p.pos.z + p.vel.z * sec;
      surfaceAt(ax, az, t, SURF);
      if (SURF.land) ahead = Math.max(ahead, SURF.y + Math.max(0, canopyAt(ax, az) - 4));
    }
    const wantY = p.parked ? p.surfaceY + SKID - 0.5 : ahead + SKID + CRUISE + p.altOff;
    // start-up: the rotor has to wind all the way up before the skids leave the ground
    const spooling = !p.parked && p.grounded && p.spin < 0.93;
    let lift = p.parked ? -0.5 : clamp((wantY - p.pos.y) * 0.16, -0.8, 1);
    if (p.parked && p.clearance < 4) lift = Math.max(lift, -0.16);      // flare: the last few metres are slow and gentle
    if (spooling) lift = Math.min(lift, 0);

    p.yawVel += (inp.t * (p.grounded ? 0 : 1.75) - p.yawVel) * damp(5, dt);
    p.yaw += p.yawVel * dt;
    fx_ = Math.sin(p.yaw); fz_ = Math.cos(p.yaw);
    // ease off by itself near a friend who needs a lift, so the basket can reach
    let top = MAX_SPEED;
    if (p.cargo.length + p.incoming < MAX_CARGO) for (const an of waiting) {
      const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
      if (d < 34) top = Math.min(top, 6 + d * 0.6);
    }
    tgt = p.parked || spooling ? 0 : inp.f * (inp.f > 0 ? top : 12);
    const a = damp(p.grounded ? 5 : (inp.f === 0 ? 0.9 : 1.5), dt);
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
    if (p.pos.y - SKID > o.top) continue;
    const dx = p.pos.x - o.x, dzz = p.pos.z - o.z, d = Math.hypot(dx, dzz), min = o.r + 4.5;
    if (d < min && d > 0.01) { p.pos.x = o.x + (dx / d) * min; p.pos.z = o.z + (dzz / d) * min; }
  }

  surfaceAt(p.pos.x, p.pos.z, t, SURF);
  p.surfaceY = SURF.y; p.overLand = SURF.land;
  const floor = SURF.y + SKID + (SURF.land ? 0 : 1.3);
  if (p.pos.y <= floor) {
    if (SURF.land && !p.grounded && p.vel.y < -0.5) {
      // touchdown: thump, dust ring, suspension bounce, camera jolt
      fx.dust(p.pos.x, SURF.y, p.pos.z, 60); sfx.touchdown();
      p.shake = 1; p.squash = 1;
      if (p.parked) sfx.engineStop();
      if (p.pro && (PADS.some(pad => Math.hypot(p.pos.x - pad.x, p.pos.z - pad.z) < 8.5) || SITES.some(q => Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < q.r))) {
        if (p.vel.y > -1.5) rate(p, 3, 'Greased it'); else if (p.vel.y > -3) rate(p, 2, 'Good landing'); else rate(p, 1, 'Firm one!');
      }
    }
    p.pos.y = floor; p.vel.y = Math.max(p.vel.y, 0);
    p.grounded = SURF.land;
  } else if (p.pos.y > floor + 0.15) {
    if (p.grounded) { fx.dust(p.pos.x, SURF.y, p.pos.z, 50); sfx.liftoff(); p.shake = Math.max(p.shake, 0.45); }
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
  m.discMat.opacity = 0.3 * p.spin * p.spin; m.tipRingMat.opacity = 0.1 * p.spin * p.spin;
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
    p.hornCd = 0.45; sfx.heliHorn(p.idx);
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
const PL = { max: 36, fly: 16, cruise: 16 };
function landWithin(p, fx_, fz_, dist, t) { surfaceAt(p.pos.x + fx_ * dist, p.pos.z + fz_ * dist, t, SURF2); return SURF2.land ? SURF2.y : -1e9; }
function updatePlane(p, dt, t) {
  const inp = p.input, m = p.plane;
  const busy = inp.f !== 0 || inp.t !== 0 || inp.l !== 0;
  // the pilot's own height: up/down keys move the cruising height; the autopilot's descents wait while they are in use
  // once the pilot touches the height keys, height stays theirs until the plane next comes to rest on the water
  if (inp.l !== 0) p.manualT = 1;
  if (p.parked || (p.afloat && Math.abs(p.fs) < 2 && inp.l === 0)) { p.altOff = 0; p.manualT = 0; }
  if (busy) { p.idleT = 0; if (p.parked) { p.parked = false; if (p.spin < 0.6) sfx.engineStart(p.spin); } } else p.idleT += dt;
  if (p.parked) p.spin = Math.max(0, p.spin - dt * (0.09 + p.spin * 0.28));
  else p.spin = Math.min(1, p.spin + dt * (0.18 + p.spin * 0.5));
  const ready = !p.parked && p.spin > 0.9;

  const fx_ = Math.sin(p.yaw), fz_ = Math.cos(p.yaw);
  const alt = p.pos.y - PLANE_FLOAT;                       // height of the floats above the calm sea
  const dockD = Math.hypot(p.pos.x - DOCK.x, p.pos.z - DOCK.z);
  const room = p.cargo.length + p.incoming < MAX_CARGO;

  // who to scoop up: someone roughly ahead, or anyone close by
  if (p.target && (p.target.state !== 'waiting' || Math.hypot(p.target.pos.x - p.pos.x, p.target.pos.z - p.pos.z) > 110)) { if (p.target.claimed === p) p.target.claimed = null; p.target = null; }
  if (!p.target && ready && room) {
    let bd = 85;
    for (const an of waiting) {
      if (an.kind === 'camp' || (an.claimed && an.claimed !== p)) continue;
      const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
      const off = Math.abs(angDiff(Math.atan2(an.pos.x - p.pos.x, an.pos.z - p.pos.z), p.yaw));
      if (d < bd && (off < 1.0 || d < 30)) { bd = d; p.target = an; }
    }
    if (p.target) p.target.claimed = p;
  }

  // ---- where the autopilot would like to go: the friend, or the dock when carrying friends home
  const goal = p.target ? p.target.pos : (p.cargo.length && dockD < 130 ? DOCK : null);
  let assist = 0, gd = 1e9, off = 0, cap = PL.max, glide = PL.cruise;
  if (goal && ready) {
    gd = Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
    off = angDiff(Math.atan2(goal.x - p.pos.x, goal.z - p.pos.z), p.yaw);
    // steer toward it unless it has slipped behind us at close range (then fly on and come round again)
    if (gd > 12 && (Math.abs(off) < 1.8 || gd > 45)) assist = clamp(off * 1.5, -1, 1);
    // a straight glide slope that reaches the water a little before the friend, so the pickup is always a skim
    const reach = p.target ? (p.target.kind === 'islet' ? 44 : 32) : 36;
    glide = clamp((gd - reach) * 0.2, 0, PL.cruise);
    cap = Math.min(PL.max, p.target ? 10 + Math.max(0, gd - 12) * 0.3 : 3 + Math.max(0, gd - 16) * 0.33);
  }

  // ---- turning: one smoothed turn rate; the bank comes from it
  const maxRate = p.afloat ? 1.15 : 0.9;
  let turnCmd = inp.t !== 0 ? inp.t + assist * 0.35 : assist;
  // far out to sea: lean back toward the islands
  const rr = Math.hypot(p.pos.x, p.pos.z);
  if (rr > WORLD_R - 50) { const home = angDiff(Math.atan2(-p.pos.x, -p.pos.z), p.yaw), k2 = clamp((rr - (WORLD_R - 50)) / 45, 0, 1); turnCmd = lerp(turnCmd, clamp(home * 1.5, -1, 1), k2); }
  // steer round the lighthouse and the station instead of bumping into them
  for (const o of OBSTACLES) {
    if (alt > o.top + 2) continue;
    const dx = o.x - p.pos.x, dzz = o.z - p.pos.z, d = Math.hypot(dx, dzz);
    if (d > 70) continue;
    const a = angDiff(Math.atan2(dx, dzz), p.yaw);
    if (Math.abs(a) < 0.55) turnCmd = lerp(turnCmd, a > 0 ? -1 : 1, clamp(1.25 - d / 70, 0, 1));
  }
  p.yawVel += (clamp(turnCmd, -1, 1) * (ready ? maxRate : 0) - p.yawVel) * damp(2.6, dt);
  p.yaw += p.yawVel * dt;

  // ---- speed: eased toward what the pilot (and the situation) asks for
  const atDock = !p.target && p.cargo.length > 0 && dockD < 18;
  // on the water, ease to a stop before a beach instead of bumping into it
  let shore = 1;
  if (alt < 3) { if (landWithin(p, fx_, fz_, 7, t) > -1e8) shore = 0; else if (landWithin(p, fx_, fz_, 16, t) > -1e8) shore = 0.35; }
  let want = 0;
  if (ready && !atDock) {
    if (inp.f > 0) want = cap;
    else if (inp.f < 0) want = p.afloat ? -5 : PL.fly;
    else want = p.afloat ? 0 : PL.fly;                    // let go in the air: keep gliding until the floats are down
  }
  if (p.afloat && want > 0 && shore < 1 && p.fs < PL.fly) want *= shore;
  // eased near the target speed, and never harder than a gentle push or a firm-but-soft brake
  p.fs += clamp((want - p.fs) * 1.6, p.afloat ? -9 : -5, 6.5) * dt;

  // ---- height: cruise when flying, follow the glide slope when landing or scooping, always clear of land
  let landAhead = -1e9;
  // (a friend's own sandbar is not a hill to climb over: only look as far as its beach)
  const look = p.target && p.target.kind === 'islet' ? Math.max(0, gd - 20) : 1e9;
  for (const sec of [0, 0.8, 1.6, 2.6]) landAhead = Math.max(landAhead, landWithin(p, fx_, fz_, Math.min(p.fs * sec, look), t));
  const flying = p.fs > PL.fly - 1;
  let wantAlt = 0;
  if (flying) {
    const mine = clamp(PL.cruise + p.altOff, 0, 76);
    if (inp.f > 0) wantAlt = p.manualT > 0 ? mine : Math.min(mine, glide);
    if (landAhead > -1e8) wantAlt = Math.max(wantAlt, landAhead + 9);        // never let a hill come to us
  }
  let vyT = p.manualT > 0 ? clamp((wantAlt - alt) * 2.2, -9, 9) : clamp((wantAlt - alt) * 2.2, -6.5, 7);
  if (flying && inp.l !== 0) {
    // while a height key is held the plane climbs or dives right away, and levels off where you let go
    vyT = inp.l * 9;
    if (landAhead > -1e8) vyT = Math.max(vyT, (landAhead + 9 - alt) * 2.2);
    p.altOff = clamp(alt + p.vel.y * 0.35 - PL.cruise, -PL.cruise, 60);
  }
  p.vel.y += (vyT - p.vel.y) * damp(inp.l !== 0 ? 3.2 : wantAlt > alt ? 1.8 : 2.6, dt);

  // ---- move
  const px = p.pos.x, pz = p.pos.z;
  const nfx = Math.sin(p.yaw), nfz = Math.cos(p.yaw);
  p.vel.x = nfx * p.fs; p.vel.z = nfz * p.fs;
  p.pos.addScaledVector(p.vel, dt);
  for (const o of OBSTACLES) {          // last resort only; the steering above normally keeps us clear
    if (p.pos.y - PLANE_FLOAT > o.top) continue;
    const dx = p.pos.x - o.x, dzz = p.pos.z - o.z, d = Math.hypot(dx, dzz), min = o.r + 7;
    if (d < min && d > 0.01) { const push = Math.min(1, dt * 6); p.pos.x += ((o.x + (dx / d) * min) - p.pos.x) * push; p.pos.z += ((o.z + (dzz / d) * min) - p.pos.z) * push; }
  }
  surfaceAt(p.pos.x, p.pos.z, t, SURF);
  if (SURF.land && !flying && p.pos.y - SURF.y < PLANE_FLOAT + 1.2) { p.pos.x = px; p.pos.z = pz; p.fs *= Math.max(0, 1 - dt * 3); surfaceAt(px, pz, t, SURF); }
  const floor = (SURF.land ? SURF.y + 1.6 : 0) + PLANE_FLOAT;
  const wasAfloat = p.afloat;
  const wave = waveHeight(p.pos.x, p.pos.z, t);
  if (p.pos.y <= floor) {
    if (!wasAfloat && !SURF.land && p.fs > 7) {
      // splashdown
      for (const sx of [-1.8, 1.8]) fx.splash(p.pos.x - nfz * sx, wave, p.pos.z + nfx * sx, 34, 1.3);
      sfx.splash(); sfx.touchdown(); p.shake = 0.6; p.squash = 1;
    }
    p.pos.y = floor; p.vel.y = Math.max(p.vel.y, 0);
  }
  p.afloat = !SURF.land && p.pos.y - floor < 0.25;
  if (wasAfloat && !p.afloat && p.fs > PL.fly - 2) { sfx.liftoff(); fx.splash(p.pos.x, wave, p.pos.z, 26, 1.1); }
  p.surfaceY = SURF.y; p.overLand = SURF.land; p.clearance = p.pos.y - floor;
  p.grounded = p.afloat && Math.abs(p.fs) < 8;
  p.landed = p.parked; p.ropeLen = 0.6;

  // ---- scoop: the friend leaps aboard as the plane skims past
  if (p.target) {
    const an = p.target, d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
    if (d < (an.kind === 'islet' ? 26 : 10) && p.clearance < 6) { board(an, p); p.target = null; }
  }
  // ---- home: friends hop out along the pier
  p.dropCd -= dt;
  if (p.cargo.length && p.afloat && dockD < 34 && Math.abs(p.fs) < 12 && p.dropCd <= 0) { deliverOne(p); p.dropCd = 0.45; }
  if (!p.parked && p.afloat && Math.abs(p.fs) < 1 && p.idleT > 3 && !p.cargo.length && !p.incoming && dockD < 70) { p.parked = true; sfx.engineStop(); }
  p.mode = p.target || p.incoming ? 'pickup' : (p.cargo.length && dockD < 130 ? 'deliver' : 'idle');

  // ---- how it looks: coordinated bank, nose follows the flight path, floats ride the swell
  m.prop.rotation.z += p.spin * 46 * dt;
  m.discMat.opacity = 0.3 * p.spin * p.spin; m.bladeMat.opacity = 1 - 0.82 * p.spin * p.spin;
  const air = clamp(p.clearance / 2.5, 0, 1);
  p.sea += ((1 - air) - p.sea) * damp(3, dt);                               // 1 = sitting on the water, 0 = airborne
  const planing = clamp(p.fs / PL.fly, 0, 1);
  const pt = -Math.atan2(p.vel.y, Math.max(p.fs, 10)) * 0.85 - p.sea * planing * 0.075;
  const rt = clamp(-Math.atan(p.yawVel * Math.max(p.fs, 0) / 9.8) * lerp(0.9, 0.12, p.sea), -0.6, 0.6);
  p.pitch += (pt - p.pitch) * damp(2.2, dt); p.roll += (rt - p.roll) * damp(2.0, dt);
  p.shake = Math.max(0, p.shake - dt * 2.4); p.squash = Math.max(0, p.squash - dt * 1.7);
  const rumble = p.sea * p.spin * (1.15 - 0.75 * p.spin) * 0.05;
  const J = () => (Math.random() - 0.5) * rumble;
  const sq = -0.25 * p.squash * Math.sin((1 - p.squash) * 8.5);
  const calm = p.sea * (1 - 0.7 * planing);                                 // bob and rock fade as it gets up on the step
  const rock = Math.sin(t * 1.4 + p.idx) * 0.035 * calm;
  m.group.position.set(p.pos.x + J(), p.pos.y + wave * 0.55 * calm + sq + J() * 0.5, p.pos.z + J());
  m.group.rotation.set(p.pitch + Math.cos(t * 1.1 + p.idx) * 0.02 * calm + J() * 0.3, p.yaw, p.roll + rock + J() * 0.4);

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
  p.cargo.forEach((an, i) => { if (an.state !== 'riding') return; an.model.position.y = SLOTS[i][1] + Math.abs(Math.sin(t * 5 + an.phase)) * 0.12; an.model.rotation.z = Math.sin(t * 4 + an.phase) * 0.08; });
  // horn
  p.hornCd -= dt;
  if (inp.horn && p.hornCd <= 0) {
    p.hornCd = 0.45; sfx.heliHorn(p.idx);
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
  const busy = inp.f !== 0 || inp.t !== 0;
  if (busy) { p.idleT = 0; if (p.parked) { p.parked = false; if (p.spin < 0.6) sfx.engineStart(p.spin); } } else p.idleT += dt;
  if (p.parked) p.spin = Math.max(0, p.spin - dt * (0.15 + p.spin * 0.5));
  else p.spin = Math.min(1, p.spin + dt * (0.3 + p.spin * 0.8));
  const ready = !p.parked && p.spin > 0.9;
  const fx_ = Math.sin(p.yaw), fz_ = Math.cos(p.yaw);
  const dockD = Math.hypot(p.pos.x - DOCK.x, p.pos.z - DOCK.z);
  const room = p.cargo.length + p.incoming < MAX_CARGO;

  if (p.target && (p.target.state !== 'waiting' || Math.hypot(p.target.pos.x - p.pos.x, p.target.pos.z - p.pos.z) > 90)) { if (p.target.claimed === p) p.target.claimed = null; p.target = null; }
  if (!p.target && ready && room) {
    let bd = 65;
    for (const an of waiting) {
      if (an.kind === 'camp' || (an.claimed && an.claimed !== p)) continue;
      const d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
      const off = Math.abs(angDiff(Math.atan2(an.pos.x - p.pos.x, an.pos.z - p.pos.z), p.yaw));
      if (d < bd && (off < 1.1 || d < 28)) { bd = d; p.target = an; }
    }
    if (p.target) p.target.claimed = p;
  }
  const goal = p.target ? p.target.pos : (p.cargo.length && dockD < 120 ? DOCK : null);
  let assist = 0, gd = 1e9, cap = BT.max;
  if (goal && ready) {
    gd = Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
    const off = angDiff(Math.atan2(goal.x - p.pos.x, goal.z - p.pos.z), p.yaw);
    if (gd > 9 && (Math.abs(off) < 1.9 || gd > 35)) assist = clamp(off * 1.6, -1, 1);
    cap = Math.min(BT.max, p.target ? 5 + Math.max(0, gd - 9) * 0.5 : 2 + Math.max(0, gd - 15) * 0.4);
  }

  // steering bites harder once the boat has some way on
  let turnCmd = inp.t !== 0 ? inp.t + assist * 0.35 : (inp.f > 0 ? assist : 0);
  const rr = Math.hypot(p.pos.x, p.pos.z);
  if (rr > WORLD_R - 50) { const home = angDiff(Math.atan2(-p.pos.x, -p.pos.z), p.yaw), k2 = clamp((rr - (WORLD_R - 50)) / 45, 0, 1); turnCmd = lerp(turnCmd, clamp(home * 1.5, -1, 1), k2); }
  // a coast in the way: swing toward open water and follow the shore round, instead of nosing into the beach
  const ownIslet = p.target && p.target.kind === 'islet' && gd < 48;
  p.avoidT = Math.max(0, (p.avoidT || 0) - dt);
  if (ready && p.fs > -0.5 && !ownIslet) {
    const blocked = landWithin(p, fx_, fz_, 16, t) > -1e8 || landWithin(p, fx_, fz_, 8, t) > -1e8;
    if (blocked && p.avoidT <= 0) {
      const l = landWithin(p, Math.sin(p.yaw + 0.9), Math.cos(p.yaw + 0.9), 16, t) > -1e8, r = landWithin(p, Math.sin(p.yaw - 0.9), Math.cos(p.yaw - 0.9), 16, t) > -1e8;
      p.avoidDir = l && !r ? -1 : r && !l ? 1 : (turnCmd >= 0 ? 1 : -1);
    }
    if (blocked) p.avoidT = 1.1;
    if (p.avoidT > 0 && inp.t === 0) turnCmd = blocked ? p.avoidDir : 0;      // turn until clear, then run straight for a moment
  }
  const bite = clamp(Math.abs(p.fs) / 9, 0.45, 1) * (p.fs < -0.5 ? -1 : 1);
  p.yawVel += (clamp(turnCmd, -1, 1) * (ready ? 1.35 * bite : 0) - p.yawVel) * damp(2.5, dt);
  p.yaw += p.yawVel * dt;

  // ease off before a beach instead of running aground
  const dir = p.fs >= 0 ? 1 : -1;
  let shore = 1;
  if (landWithin(p, fx_ * dir, fz_ * dir, 6, t) > -1e8) shore = 0; else if (landWithin(p, fx_ * dir, fz_ * dir, 14, t) > -1e8) shore = 0.3;
  const atDock = !p.target && p.cargo.length > 0 && dockD < 15;
  let want = 0;
  if (ready && !atDock) want = inp.f > 0 ? cap : inp.f < 0 ? -7 : 0;
  if (shore < 1 && Math.sign(want) === dir) want *= Math.max(shore, ownIslet ? 0 : 0.12);   // creep while turning away, so it never just sits there
  p.fs += clamp((want - p.fs) * 1.8, -11, 8.5) * dt;

  const px = p.pos.x, pz = p.pos.z;
  const nfx = Math.sin(p.yaw), nfz = Math.cos(p.yaw);
  p.vel.set(nfx * p.fs, 0, nfz * p.fs);
  p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
  surfaceAt(p.pos.x, p.pos.z, t, SURF);
  if (SURF.land) {
    // touched the shallows: slide along whichever way is still water rather than stopping dead
    if (!surfaceAt(p.pos.x, pz, t, SURF).land) p.pos.z = pz;
    else if (!surfaceAt(px, p.pos.z, t, SURF).land) p.pos.x = px;
    else { p.pos.x = px; p.pos.z = pz; }
    p.fs += clamp(3 - p.fs, -14 * dt, 0);
  }
  const wave = waveHeight(p.pos.x, p.pos.z, t);
  p.pos.y = wave * 0.75;
  p.afloat = true; p.surfaceY = wave; p.overLand = false; p.clearance = 0; p.ropeLen = 0.6;
  p.grounded = Math.abs(p.fs) < 6; p.landed = p.parked;

  if (p.target) {
    const an = p.target, d = Math.hypot(an.pos.x - p.pos.x, an.pos.z - p.pos.z);
    if (d < (an.kind === 'islet' ? 24 : 8)) { board(an, p); p.target = null; }
  }
  p.dropCd -= dt;
  if (p.cargo.length && dockD < 30 && Math.abs(p.fs) < 10 && p.dropCd <= 0) { deliverOne(p); p.dropCd = 0.45; }
  if (!p.parked && Math.abs(p.fs) < 1 && p.idleT > 3 && !p.cargo.length && !p.incoming && dockD < 70) { p.parked = true; sfx.engineStop(); }
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
  p.cargo.forEach((an, i) => { if (an.state !== 'riding') return; an.model.position.y = SLOTS[i][1] + Math.abs(Math.sin(t * 5 + an.phase)) * 0.12; an.model.rotation.z = Math.sin(t * 4 + an.phase) * 0.08; });
  p.hornCd -= dt;
  if (inp.horn && p.hornCd <= 0) {
    p.hornCd = 0.45; sfx.heliHorn(p.idx);
    fx.emoji('\u{1F3B5}', p.pos.x, p.pos.y + 4, p.pos.z, 2.2);
    for (const an of waiting) if (an.pos.distanceTo(p.pos) < 90) an.excite = 2.5;
  }
  updateCamera(p, dt, t);
}

// ================================================================= winch + basket
function updateWinch(p, dt, t) {
  p.dropCd -= dt;
  // door slides open and the boom swings out whenever there is someone to fetch or carry
  const needHoist = !p.grounded && (p.target || p.incoming > 0 || p.cargo.length > 0 || (p.pro && (p.input.w || p.winch > 0.1)));
  const was = p.hoist;
  p.hoist = clamp(p.hoist + (needHoist ? dt / 0.55 : -dt / 0.9), 0, 1);
  if (needHoist && was === 0) sfx.door();
  const hz = p.hoist * p.hoist * (3 - 2 * p.hoist);
  const open = Math.min(1, hz * 1.6);
  p.heli.door.position.set(DOOR_OPEN.x * open, 0, DOOR_OPEN.z * open);
  p.heli.boom.rotation.y = -Math.PI / 2 * clamp((hz - 0.3) / 0.7, 0, 1);
  const out = clamp((hz - 0.3) / 0.7, 0, 1);
  // boom tip in world space (stowed it points forward along the cabin, deployed it sticks out of the side)
  const lx = HOIST.px - Math.sin(out * Math.PI / 2) * HOIST.len, lz = HOIST.z + Math.cos(out * Math.PI / 2) * HOIST.len;
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  p.hook.set(p.pos.x + lx * cy + lz * sy, p.pos.y + HOIST.y, p.pos.z - lx * sy + lz * cy);
  const hookY = p.hook.y, ready = out > 0.85;
  const nearBase = Math.hypot(p.pos.x, p.pos.z) < 42;
  let mode = 'idle';

  // choose who to help: the nearest friend in reach. Once chosen we stick with them until they're aboard.
  if (p.target && (p.target.state !== 'waiting' || Math.hypot(p.target.pos.x - p.pos.x, p.target.pos.z - p.pos.z) > 48)) { if (p.target.claimed === p) p.target.claimed = null; p.target = null; }
  if (p.pro) { if (p.target) { p.target.claimed = null; p.target = null; } }
  else if (!p.target && !p.parked && p.cargo.length + p.incoming < MAX_CARGO) {
    let bd = 20;
    for (const an of waiting) {
      if (an.kind === 'camp' || (an.claimed && an.claimed !== p)) continue;      // (campers are fetched by landing, not by basket)
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
    b.addScaledVector(bv, dt);
  } else bv.set(0, 0, 0);
  const bs = surfaceAt(b.x, b.z, t, SURF2);
  const bFloor = bs.y + (bs.land ? 0.05 : -0.3);
  if (b.y < bFloor) { b.y = bFloor; bv.y = Math.max(bv.y, 0); if (p.pro) p.winch = Math.min(p.winch, hookY - 0.6 - BASKET_TOP - bFloor + 0.4); }
  if (b.y > hookY - 0.6 - BASKET_TOP) b.y = hookY - 0.6 - BASKET_TOP;
  p.ropeLen = Math.max(0.6, hookY - b.y - BASKET_TOP);

  // the basket lives inside the cabin until the boom is out
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

  // friend hops aboard as soon as the basket is close
  if (p.target && Math.hypot(b.x - p.target.pos.x, b.z - p.target.pos.z) < 3.2 && Math.abs(b.y - p.target.pos.y) < 2.6) { board(p.target, p); p.target = null; }
  if (p.pro && p.winch > 1 && p.cargo.length + p.incoming < MAX_CARGO) for (const an of waiting) {
    if (an.kind === 'camp' || Math.hypot(b.x - an.pos.x, b.z - an.pos.z) > 3.2 || Math.abs(b.y - an.pos.y) > 2.6) continue;
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
  const pro = p.pro && p.vehicle === 'heli', sp = Math.hypot(p.vel.x, p.vel.z);
  p.camYaw += angDiff(p.yaw, p.camYaw) * damp(p.vehicle === 'plane' ? 2.0 : pro ? 1.9 : 2.6, dt);
  const ext = Math.max(0, p.ropeLen - 0.6);
  p.camG += ((p.grounded ? 1 : 0) - p.camG) * damp(p.grounded ? 1.3 : 0.9, dt);
  const pl = p.vehicle === 'plane', bt = p.vehicle === 'boat';
  const dist = lerp((pl ? 27 : bt ? 17 : 19) + ext * 0.42, pl ? 17 : bt ? 11.5 : 12.5, p.camG), height = lerp((pl ? 9 : bt ? 6 : 7.5) + ext * 0.3, pl ? 4.6 : bt ? 4 : 3.4, p.camG);
  const back = dist + (pro ? sp * 0.2 : 0);
  const cx = p.pos.x - Math.sin(p.camYaw) * back, cz = p.pos.z - Math.cos(p.camYaw) * back;
  let cy = p.pos.y + height + (pro ? sp * 0.04 : 0);
  const fov = (activePlayers().length > 1 ? 66 : 58) + (pro ? sp * 0.36 : 0);
  if (Math.abs(p.cam.fov - fov) > 0.05) { p.cam.fov += (fov - p.cam.fov) * damp(3, dt); p.cam.updateProjectionMatrix(); }
  const minY = Math.max(terrainHeight(cx, cz), 0.8) + 2.2;
  if (cy < minY) cy = minY;
  V.set(cx, cy, cz);
  p.camPos.lerp(V, damp(5, dt));
  const lead = p.vehicle === 'plane' ? 9 : p.vehicle === 'boat' ? 7 : 5;
  V.set(p.pos.x + Math.sin(p.yaw) * lead, p.pos.y + 1.2 - ext * 0.36, p.pos.z + Math.cos(p.yaw) * lead);
  p.camLook.lerp(V, damp(7, dt));
  p.cam.position.copy(p.camPos);
  const sh = p.shake * p.shake * 0.5 + (p.grounded ? p.spin * (1.1 - 0.8 * p.spin) * 0.07 : 0);
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
  return pool[(Math.random() * pool.length) | 0];
}
function spawnAnimal(near) {
  const maxD = near ? 130 : Math.min(150 + game.mission * 60, WORLD_R - 20);
  const heliUp = activePlayers().some(p => p.vehicle === 'heli');
  if (!near && !game.boat && Math.random() < 0.16 && waiting.length + 2 <= maxWaiting() && spawnBoat(maxD)) return;
  let spot = null, kind = 'ring', site = null;
  for (let tries = 0; tries < 40 && !spot; tries++) {
    const r = Math.random();
    let c;
    site = null;
    if (r < 0.22 && heliUp && !near) {
      // someone waiting on an island, where only a landing will do
      const free = SITES.filter(q => !q.busy);
      if (!free.length) continue;
      site = free[(Math.random() * free.length) | 0]; kind = 'camp';
      const a = Math.random() * 6.283;
      c = { x: site.x + Math.cos(a) * (site.r - 2.5), z: site.z + Math.sin(a) * (site.r - 2.5) };
    }
    else if (r < 0.45) { c = ISLETS[(Math.random() * ISLETS.length) | 0]; kind = 'islet'; }
    else if (r < 0.56 && game.mission > 1 && world.spawn.stacks.length) { c = world.spawn.stacks[(Math.random() * world.spawn.stacks.length) | 0]; kind = 'raft'; }
    else { c = world.spawn.sea[(Math.random() * world.spawn.sea.length) | 0]; kind = r < 0.7 ? 'raft' : 'ring'; }
    if (Math.hypot(c.x, c.z) > maxD) continue;
    if (waiting.some(a => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 45)) continue;
    spot = c;
  }
  if (!spot) return;
  const an = addWaiting(kind, spot.x, spot.z, site ? { site } : null);
  if (site) site.busy = true;
  fx.emoji('\u2757', an.pos.x, an.pos.y + 5, an.pos.z, 3.5);
  sfx.mayday();
}
// A fishing boat broken down and smoking, with her crew waiting on deck to be winched off one by one.
// When the last of them is safe she gets her engine going again and motors away.
const DECK_SPOTS = [[1.3, -4.2], [-1.3, -6.6], [1.1, -8.6]];
function spawnBoat(maxD) {
  let spot = null;
  for (let tries = 0; tries < 30 && !spot; tries++) {
    const c = world.spawn.sea[(Math.random() * world.spawn.sea.length) | 0];
    if (Math.hypot(c.x, c.z) > maxD || Math.hypot(c.x, c.z) < 90) continue;
    if (waiting.some(a => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 55)) continue;
    spot = c;
  }
  if (!spot) return false;
  const hull = new THREE.Color().setHSL(Math.random(), 0.6, 0.22);
  const B = { x: spot.x, z: spot.z, y: 0, yaw: Math.random() * 6.283, deck: 1.7, crew: 0, leaving: 0, puff: 0, mesh: model('World_Boat', { tints: { Navy: hull } }) };
  B.mesh.scale.setScalar(1.5); B.mesh.rotation.order = 'YXZ';
  scene.add(B.mesh);
  game.boat = B;
  const n = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) { addWaiting('deck', B.x, B.z, { boat: B, off: DECK_SPOTS[i] }); B.crew++; }
  fx.emoji('\u{1F198}', B.x, 12, B.z, 4.5);
  sfx.mayday();
  return true;
}
function boatFriendOff(B) { if (--B.crew <= 0) { B.leaving = 0.01; sfx.horn(); fx.emoji('\u{1F44B}', B.x, 12, B.z, 4); } }
function updateBoatRescue(dt, t) {
  const B = game.boat; if (!B) return;
  if (B.leaving) {
    B.leaving += dt;
    const sp = Math.min(B.leaving * 2.2, 9);
    // (she swings toward open water before she gathers way)
    B.yaw += angDiff(Math.atan2(B.x, B.z), B.yaw) * damp(0.5, dt);
    B.x += Math.sin(B.yaw) * sp * dt; B.z += Math.cos(B.yaw) * sp * dt;
    if (Math.random() < dt * sp * 2) fx.emit(B.x - Math.sin(B.yaw) * 10, 0.3, B.z - Math.cos(B.yaw) * 10, (Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2, 0.92, 0.97, 1, 0.5, 0.9, 1.2, 2, 1);
    if (B.leaving > 45 || Math.hypot(B.x, B.z) > WORLD_R + 260) { scene.remove(B.mesh); game.boat = null; return; }
  } else {
    // she drifts downwind while she waits (never onto the shallows)
    windAt(B.x, B.z, t, WIND);
    const nx = B.x + WIND.x * 0.1 * dt, nz = B.z + WIND.z * 0.1 * dt;
    if (terrainHeight(nx + Math.sign(WIND.x) * 22, nz + Math.sign(WIND.z) * 22) < -6 && Math.hypot(nx, nz) < WORLD_R - 40) { B.x = nx; B.z = nz; }
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
function addWaiting(kind, x, z, extra) {
  const type = pickType();
  const model = buildAnimal(type.id);
  const an = {
    id: animalSerial++, type, model, kind, state: 'waiting', pos: new THREE.Vector3(x, 0, z),
    phase: Math.random() * 6, callT: 3 + Math.random() * 6, excite: 0, exciteCd: 0, grow: 0, claimed: null, prop: null, ...extra,
  };
  if (kind === 'ring') an.prop = buildRing(); else if (kind === 'raft') an.prop = buildRaft();
  if (an.prop) scene.add(an.prop);
  an.beam = buildBeam(); scene.add(an.beam);
  scene.add(model);
  waiting.push(an);
  placeWaiting(an, game.t, 0);
  if (kind === 'ring' || kind === 'raft') fx.splash(an.pos.x, an.pos.y, an.pos.z, 20);
  return an;
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
  const m = an.model;
  if (near) {
    const want = Math.atan2(near.pos.x - x, near.pos.z - z);
    m.rotation.y += angDiff(want, m.rotation.y) * damp(4, dt || 1);
  }
  const hop = excited ? Math.abs(Math.sin(t * 7 + an.phase)) * 0.35 : 0;
  if (an.kind === 'islet' || an.kind === 'camp') {
    an.pos.y = terrainHeight(x, z);
    m.position.set(x, an.pos.y + hop, z); m.rotation.x = m.rotation.z = 0;
  } else if (an.kind === 'deck') {
    // on the deck of the stricken boat, riding the swell with her
    const B = an.boat, c = Math.cos(B.yaw), sn = Math.sin(B.yaw);
    an.pos.set(B.x + an.off[0] * c + an.off[1] * sn, B.y + B.deck, B.z - an.off[0] * sn + an.off[1] * c);
    m.position.set(an.pos.x, an.pos.y + hop, an.pos.z); m.rotation.x = m.rotation.z = 0;
  } else {
    const w = waveHeight(x, z, t);
    const rock = Math.sin(t * 1.4 + an.phase);
    if (an.kind === 'ring') {
      an.pos.y = w + 0.2;
      m.position.set(x, w - 1.0 + hop * 0.4, z);
      an.prop.position.set(x, w + 0.15, z); an.prop.rotation.set(rock * 0.08, 0, Math.cos(t * 1.1 + an.phase) * 0.08);
    } else {
      an.pos.y = w + 0.45;
      m.position.set(x, w + 0.3 + hop, z);
      an.prop.position.set(x, w + 0.05, z); an.prop.rotation.set(rock * 0.06, an.phase, Math.cos(t * 1.1 + an.phase) * 0.06);
    }
    m.rotation.z = rock * 0.07;
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
  an.beam.visible = fade > 0.01;
  // calling out
  an.exciteCd -= dt; an.callT -= dt;
  if (nd < 45 && an.exciteCd <= 0) { an.exciteCd = 4; fx.emoji('💕', x, an.pos.y + 4.5, z, 2.4); animalVoice(an.type.id, false); }
  if (nd >= 45 && an.callT <= 0) { an.callT = 7 + Math.random() * 7; fx.emoji('❗', x, an.pos.y + 4.5, z, 3); if (nd < 160) animalVoice(an.type.id, false); }
}
function seatRiders(p) {
  p.cargo.forEach((an, i) => {
    an.model.position.set(SLOTS[i][0], SLOTS[i][1], SLOTS[i][2]);
    an.model.rotation.set(0, Math.atan2(SLOTS[i][0], SLOTS[i][2]), 0);
    an.model.scale.setScalar(1.0);
  });
}
function board(an, p) {
  const i = waiting.indexOf(an); if (i < 0 || p.cargo.length + p.incoming >= MAX_CARGO) return;
  waiting.splice(i, 1);
  if (an.prop) { sinking.push({ o: an.prop, t: 0 }); an.prop = null; }
  scene.remove(an.beam);
  if (an.kind === 'ring' || an.kind === 'raft') { fx.splash(an.pos.x, an.pos.y, an.pos.z, 24); sfx.splash(); } else fx.dust(an.pos.x, an.pos.y, an.pos.z, 10);
  if (an.site) an.site.busy = false;
  if (an.boat) boatFriendOff(an.boat);
  an.state = 'boarding'; an.t = 0; an.by = p; an.claimed = null;
  { const d = an.model.position.distanceTo(p.pos); an.bdur = 0.38 + Math.max(0, d - 8) * 0.022; an.barc = 1.6 + Math.max(0, d - 8) * 0.2; }
  an.from = an.model.position.clone(); an.fromScale = an.model.scale.x; an.slot = p.cargo.length + p.incoming;
  p.incoming++;
  hoppers.push(an);
  animalVoice(an.type.id, true); sfx.pop();
  game.spawnT = Math.min(game.spawnT, 2 + Math.random() * 2);
  syncHud();
}
// the little leap from the water into the basket
function updateBoarding(dt) {
  for (let i = hoppers.length - 1; i >= 0; i--) {
    const an = hoppers[i]; if (an.state !== 'boarding') continue;
    const p = an.by;
    an.t += dt / an.bdur;
    const k = Math.min(an.t, 1), e = k * k * (3 - 2 * k);
    V.set(SLOTS[an.slot][0], SLOTS[an.slot][1], SLOTS[an.slot][2]).applyMatrix4(p.basket.matrixWorld);
    an.model.position.lerpVectors(an.from, V, e);
    an.model.position.y += Math.sin(k * Math.PI) * an.barc;
    an.model.scale.setScalar(lerp(an.fromScale, 1.0, e));
    an.model.rotation.x = 0; an.model.rotation.z = 0;
    if (k >= 1) {
      hoppers.splice(i, 1);
      an.state = 'riding'; p.incoming--;
      p.basket.add(an.model); p.cargo.push(an); seatRiders(p);
      p.basket.getWorldPosition(V);
      fx.hearts(V.x, V.y + 2.5, V.z, 4); fx.sparkle(V.x, V.y + 1.5, V.z, 14);
      p.bvel.y -= 2.5;                       // the basket dips under the new weight
      syncHud();
    }
  }
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
  sfx.arpeggio();
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
    if (k >= 1) {
      hoppers.splice(i, 1);
      an.model.rotation.set(0, 0, 0);
      an.state = 'safe'; an.x = to.x; an.z = to.z;
      residents.push(an);
      fx.confetti(to.x, BASE_Y + 1.5, to.z, 50); fx.hearts(to.x, BASE_Y + 3, to.z, 3);
      animalVoice(an.type.id, true);
      an.by.rescued++; game.rescued++; game.total++;
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
    const want = near && nd < 60 ? Math.atan2(near.pos.x - an.x, near.pos.z - an.z) : 0;
    an.model.rotation.y += angDiff(want, an.model.rotation.y) * damp(3, dt);
  });
}
// old friends wander into the station to make room (reuses the hoppers list)
function updateLeaving(dt) {
  for (let i = hoppers.length - 1; i >= 0; i--) {
    const an = hoppers[i]; if (an.state !== 'leaving') continue;
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
  game.celebrate = 8; game.fireT = 0;
  const two = activePlayers().length > 1;
  banner('Mission complete! 🎉', two ? 'Great teamwork!  🔴 ' + players[0].rescued + '   🔵 ' + players[1].rescued : 'Everyone is safe and sound', 6);
  sfx.fanfare();
}
function nextMission() {
  game.mission++; game.rescued = 0; game.goal = goalFor(game.mission);
  const fade = $('#fade');
  fade.style.opacity = 1;
  setTimeout(() => {
    setPreset((game.presetIdx + 1) % PRESETS.length);
    setWeather([0, 1, 0, 2][(game.mission - 1) % 4]);
    fade.style.opacity = 0;
    banner('Mission ' + game.mission, world.preset.icon + WEATHERS[weather.idx].icon + ' ' + world.preset.name + ', ' + WEATHERS[weather.idx].name.toLowerCase() + ' — rescue ' + game.goal + ' friends');
    syncHud();
  }, 750);
}
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
  $('#bTime').textContent = p.icon; $('#mIcon').textContent = p.icon;
}
function cyclePreset() { setPreset((game.presetIdx + 1) % PRESETS.length); banner(world.preset.icon + ' ' + world.preset.name, '', 1.6); }

// ================================================================= HUD
function syncHud() {
  $('#mText').textContent = 'Mission ' + game.mission;
  $('#mCount').textContent = Math.min(game.rescued, game.goal) + ' / ' + game.goal;
  $('#mBar').style.width = Math.min(100, (game.rescued / game.goal) * 100) + '%';
  for (const p of players) {
    p.ui.score.textContent = '🐾 ' + p.rescued + (p.pro ? '  \u2605 ' + p.style : '');
    p.ui.slots.forEach((el, i) => { const a = p.cargo[i]; el.textContent = a ? a.type.e : ''; el.classList.toggle('full', !!a); });
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
  $('#buttons').style.display = playing ? '' : 'none';
  $('#bP2').textContent = two ? '− Player 2' : '+ Player 2';
  $('.label', p0).textContent = two ? 'Red' : 'Rescue 9';
  $('#mission').style.top = two ? '62px' : '14px';
}
const spoolHint = p => !p.parked && p.grounded && p.spin < 0.93;
function hintFor(p) {
  const solo = activePlayers().length === 1;
  if (p.flashT > 0) return p.flash;
  if (game.celebrate > 0) return '🎆 Hooray!';
  if (Math.hypot(p.pos.x, p.pos.z) > WORLD_R - 10) return '↩️ Heading back to the islands';
  if (p.pickup || (p.grounded && p.incoming > 0)) return '\u{1F6EC} Landing to pick up a friend';
  if (p.mode === 'pickup') return '🧺 Here comes the basket!';
  if (p.mode === 'deliver') return p.vehicle !== 'heli' ? '🏠 Heading for the dock…' : '🏠 Lowering them home…';
  if (p.cargo.length >= MAX_CARGO) return '🏠 Basket full — fly home!';
  if (spoolHint(p)) return '🔊 Engine starting…';
  if (p.pro && p.vehicle === 'heli') {
    if (p.grounded) return '\u{1F681} Hold ' + (p.idx && !solo ? 'Enter' : 'Space') + ' to lift off';
    if (p.cargo.length >= MAX_CARGO) return '\u{1F3E0} Full \u2014 take them home';
    return p.cargo.length ? '\u{1F3E0} Land at base, or winch them down' : '\u{1FA9D} Hover over a friend and hold ' + (p.idx && !solo ? 'Ctrl' : 'R') + ' to winch';
  }
  if (p.landed) return '🚁 Press ' + (solo ? '↑ or W' : p.idx ? '↑' : 'W') + ' to fly!';
  if (p.cargo.length && !waiting.length) return '🏠 Bring them home to base';
  if (p.cargo.length) return '✨ More friends, or fly home';
  return '✨ Follow the golden light beams';
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
  // animals
  const pulse = 0.5 + 0.5 * Math.sin(game.t * 5);
  for (const a of waiting) plot(a.pos.x, a.pos.z, (x, y, edge) => {
    g.fillStyle = '#ffd23c'; g.beginPath(); g.arc(x, y, edge ? 8 : 10, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,210,60,' + (0.7 - pulse * 0.6) + ')'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 12 + pulse * 12, 0, 7); g.stroke();
  });
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
  for (const p of activePlayers()) {
    drawRadar(p);
    p.flashT -= dt; p.rateCd -= dt;
    if (slow) {
      const h = hintFor(p);
      if (h !== p.hint) { p.hint = h; p.ui.hint.textContent = h; }
      p.ui.alt.innerHTML = '↕ ' + Math.max(0, p.clearance).toFixed(0).padStart(2, ' ') + ' m<br>➤ ' + (Math.hypot(p.vel.x, p.vel.z) * 3.6).toFixed(0) + ' km/h';
    }
  }
}

// ================================================================= flow
const menu = $('#menu');
const vehicleChoice = ['heli', 'heli'];
for (const b of document.querySelectorAll('.veh')) b.addEventListener('click', () => {
  const i = +b.dataset.p; vehicleChoice[i] = b.dataset.v;
  for (const o of document.querySelectorAll('.veh[data-p="' + i + '"]')) o.classList.toggle('on', o === b);
});
for (const b of document.querySelectorAll('.flt')) b.addEventListener('click', () => {
  const i = +b.dataset.p; players[i].pro = b.dataset.m === 'pro';
  for (const o of document.querySelectorAll('.flt[data-p="' + i + '"]')) o.classList.toggle('on', o === b);
  b.closest('.card').classList.toggle('pro', players[i].pro);
  players[i].tiltF = players[i].tiltS = 0; players[i].winch = 0; players[i].altOff = 0;
  syncHud();
});
function applyVehicleChoices() { for (const p of players) if (p.vehicle !== vehicleChoice[p.idx]) setVehicle(p, vehicleChoice[p.idx]); }
function startGame(n) {
  audio.unlock();
  applyVehicleChoices();
  const fresh = game.state === 'menu' && !game.started;
  game.started = true;
  players[0].active = true;
  if ((n === 2) !== players[1].active) setP2(n === 2, true);
  if (fresh) {
    game.mission = 1; game.rescued = 0; game.goal = goalFor(1);
    spawnAnimal(true); spawnAnimal(true); spawnAnimal(false);
    banner('Mission 1', 'Rescue ' + game.goal + ' friends and bring them home');
  }
  game.state = 'play'; game.paused = false;
  menu.classList.add('hidden');
  layoutHud(); syncHud(); onResize();
  document.activeElement && document.activeElement.blur();
}
function setP2(on, quiet) {
  const p = players[1];
  if (on === p.active) return;
  if (on) {
    p.active = true; parkPlayer(p); showVehicle(p, true);
    if (!quiet) { fx.confetti(p.pos.x, p.pos.y + 3, p.pos.z, 80); sfx.pop(); banner('Blue pilot joined! 🔵', 'Arrow keys to fly', 3); }
  } else {
    p.target = null; while (p.cargo.length) deliverOne(p);
    p.active = false; showVehicle(p, false);
  }
  layoutHud(); onResize();
}
function toggleP2() { audio.unlock(); setP2(!players[1].active); }
function togglePause() {
  if (!game.started) return;
  if (game.state === 'play') { game.state = 'menu'; game.paused = true; $('#resumeRow').style.display = ''; menu.classList.remove('hidden'); layoutHud(); onResize(); }
  else resume();
}
function resume() { applyVehicleChoices(); game.state = 'play'; game.paused = false; menu.classList.add('hidden'); layoutHud(); onResize(); }
function toggleGfx() {
  gfx.reflections = !gfx.reflections;
  const pr = gfx.reflections ? PR : 1;
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); onResize();
  $('#bGfx').textContent = gfx.reflections ? '💎' : '⚡';
  banner(gfx.reflections ? '💎 Ultra graphics' : '⚡ Fast graphics', gfx.reflections ? 'Mirror water on' : 'For slower computers', 1.6);
}
function toggleMute() { audio.unlock(); $('#bMute').textContent = audio.toggleMute() ? '🔇' : '🔊'; }

$('#start1').addEventListener('click', () => startGame(1));
$('#start2').addEventListener('click', () => startGame(2));
$('#resume').addEventListener('click', resume);
$('#bP2').addEventListener('click', e => { toggleP2(); e.currentTarget.blur(); });
$('#bTime').addEventListener('click', e => { cyclePreset(); e.currentTarget.blur(); });
$('#bWx').addEventListener('click', e => { cycleWeather(); e.currentTarget.blur(); });
$('#bGfx').addEventListener('click', e => { toggleGfx(); e.currentTarget.blur(); });
$('#bMute').addEventListener('click', e => { toggleMute(); e.currentTarget.blur(); });
$('#bPause').addEventListener('click', e => { togglePause(); e.currentTarget.blur(); });

// ================================================================= rendering
const menuCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 9000);
function getViews() {
  const act = activePlayers();
  if (game.state !== 'play' || !act.length) return [{ cam: menuCam, x: 0, w: 1, focus: MENU_FOCUS }];
  if (act.length === 1) return [{ cam: act[0].cam, x: 0, w: 1, focus: act[0].pos }];
  return [{ cam: players[0].cam, x: 0, w: 0.5, focus: players[0].pos }, { cam: players[1].cam, x: 0.5, w: 0.5, focus: players[1].pos }];
}
const MENU_FOCUS = new THREE.Vector3(0, BASE_Y, 0);

// ---- planar water reflection: the whole scene is drawn once more from a camera mirrored below the sea
const gfx = { reflections: true };
const reflRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
const reflCam = new THREE.PerspectiveCamera();
const clipAboveSea = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.6)];
const NO_CLIP = [];
const _rp = new THREE.Vector3(), _rt = new THREE.Vector3(), _ru = new THREE.Vector3(), _rm = new THREE.Matrix4();
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
  reflCam.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
  u.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    .multiply(reflCam.projectionMatrix).multiply(_rm.copy(reflCam.matrixWorld).invert());
  world.water.visible = false;
  renderer.clippingPlanes = clipAboveSea;
  renderer.setRenderTarget(reflRT);
  renderer.clear();
  renderer.render(scene, reflCam);
  renderer.clippingPlanes = NO_CLIP;
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
      // the shadow map is drawn once per view and shared by the mirror pass and the main pass
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
      if (gfx.reflections) {
        const rw = Math.max(64, vw >> 1), rh = Math.max(64, H >> 1);
        if (reflRT.width !== rw || reflRT.height !== rh) reflRT.setSize(rw, rh);
        fx.material.uniforms.uScale.value = rh / (2 * tanF);
        renderReflection(renderer, v.cam);
      }
      rt.viewport.set(vx, 0, vw, H); rt.scissor.set(vx, 0, vw, H); rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      fx.material.uniforms.uScale.value = H / (2 * tanF);
      renderer.render(scene, v.cam);
    }
    rt.scissorTest = false; rt.viewport.set(0, 0, W, H); rt.scissor.set(0, 0, W, H);
  }
}
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(PR);
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
const debug = {
  view: null,
  // put a rescue where it can be looked at: a stricken boat, or a friend at landing site number i
  boat: () => spawnBoat(400),
  camp(i) { const site = SITES[i]; site.busy = true; return addWaiting('camp', site.x + site.r - 2.5, site.z, { site }); },
  run(seconds = 0.1) { for (let i = 0; i < seconds * 30; i++) { last = performance.now() - 33; tick(performance.now()); } },
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
function frame(now) { requestAnimationFrame(frame); tick(now); }
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  const playing = game.state === 'play';
  if (!game.paused) simT += dt;
  const t = simT; game.t = t;

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
          game.boop = 3; sfx.boop(); V.copy(a.pos).add(b.pos).multiplyScalar(0.5);
          fx.hearts(V.x, V.y + 2, V.z, 6); fx.emoji('🙌', V.x, V.y + 4, V.z, 4);
        }
      }
    }
    // animals
    if (game.started) {
      game.spawnT -= dt;
      if (waiting.length < maxWaiting() && game.spawnT <= 0 && game.celebrate <= 0) { spawnAnimal(false); game.spawnT = 4 + Math.random() * 4; }
    }
    updateBoatRescue(dt, t);
    for (const an of waiting) placeWaiting(an, t, dt);
    updateLeaving(dt); updateBoarding(dt); updateSinking(dt);
    updateHoppers(dt, t);
    updateResidents(dt, t);
    life.update(dt, t, activePlayers());

    // celebration
    if (game.celebrate > 0) {
      game.celebrate -= dt; game.fireT -= dt;
      if (game.fireT <= 0) {
        game.fireT = 0.28 + Math.random() * 0.3;
        fx.firework((Math.random() - 0.5) * 90, 34 + Math.random() * 30, (Math.random() - 0.5) * 90 - 10);
        sfx.boom(); sfx.crackle();
      }
      if (game.celebrate <= 0) nextMission();
    }
    fx.update(dt);

    // water interaction uniforms + sound
    const two = activePlayers().length > 1;
    players.forEach((p, i) => {
      const u = world.waterUniforms;
      if (!p.active) { u.uHeli.value[i].w = 0; u.uLamp.value[i].w = 0; audio.setRotor(i, 0, 0, 0, false); return; }
      const alt = p.pos.y - (p.vehicle === 'plane' ? PLANE_FLOAT : p.vehicle === 'boat' ? 0 : SKID);
      u.uHeli.value[i].set(p.pos.x, p.pos.y, p.pos.z, p.landed ? 0 : clamp(1 - (alt - 1) / 24, 0, 1) * p.spin);
      const off = alt * 0.53;
      u.uLamp.value[i].set(p.pos.x + Math.sin(p.yaw) * off, p.pos.z + Math.cos(p.yaw) * off, 3 + alt * 0.42, world.preset.night >= 1 ? clamp(1.1 - alt / 70, 0, 1) * 0.55 : 0);
      const load = clamp(Math.abs(p.input.l) * 0.6 + Math.hypot(p.vel.x, p.vel.z) / MAX_SPEED * 0.6, 0, 1);
      audio.setRotor(i, p.spin, load, two ? (i ? 0.55 : -0.55) : 0, playing, p.vehicle !== 'heli');
    });
    audio.setOcean(playing ? 0.07 : 0.03);
  }

  // menu camera: slow orbit of the base
  if (!playing) {
    const a = performance.now() / 1000 * 0.07 + 0.9;
    menuCam.position.set(Math.sin(a) * 70, 24 + Math.sin(a * 0.7) * 5, Math.cos(a) * 70);
    menuCam.lookAt(0, 9, 0);
    if (debug.view) { menuCam.position.fromArray(debug.view, 0); menuCam.lookAt(debug.view[3], debug.view[4], debug.view[5]); }
    const asp = innerWidth / innerHeight;
    if (Math.abs(menuCam.aspect - asp) > 1e-4) { menuCam.aspect = asp; menuCam.updateProjectionMatrix(); }
  } else updateHud(dt);

  world.focus(getViews().map(v => v.cam.position));
  composer.render();
}
requestAnimationFrame(frame);

// tiny debug handle (also handy for automated checks)
window.__game = { weather, setWeather, gfx, game, players, waiting, residents, scene, world, renderer, composer, keys, fx, debug, setPreset };

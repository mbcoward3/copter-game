import * as THREE from 'three';
import { model, geo } from './assets.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ================================================================= helicopter
// A Coast Guard MH-60T Jayhawk (modelled in Blender, see tools/pack_models.py).
// Model space: nose toward +Z, up +Y, wheels touch the ground at y = -SKID.
export const SKID = 1.95;
// where the cable leaves the hoist, over the starboard cabin door
export const HOIST = { px: -1.11, y: -0.2, z: 0.58 };
// how far the cabin door slides back (z) and stands off the hull (x) when open
export const DOOR_OPEN = { x: -0.06, z: -0.84 };

export function buildHeli(accent) {
  const g = new THREE.Group();
  const tints = { Accent: new THREE.Color(accent) };
  g.add(model('Jayhawk_Body', { tints }));
  const door = new THREE.Group(); g.add(door);
  door.add(model('Jayhawk_Door'));

  // main rotor: the blades fade into a blurred disc as it spins up
  const rotor = new THREE.Group(); rotor.position.y = 0.686; g.add(rotor);
  const blades = model('Jayhawk_MainRotor', { own: ['Dark', 'Tip'] });
  const bladeMat = blades.userData.mat('Dark'), tipMat = blades.userData.mat('Tip');
  bladeMat.transparent = tipMat.transparent = true;
  rotor.add(blades);
  const discMat = new THREE.MeshBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.4, 5.6, 40), discMat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.72; g.add(disc);
  const tipRing = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.6, 48), new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  tipRing.rotation.x = -Math.PI / 2; tipRing.position.y = 0.73; g.add(tipRing);

  const tail = new THREE.Group(); tail.position.set(-0.26, 1.165, -6.81); g.add(tail);
  tail.add(model('Jayhawk_TailRotor'));
  const tailDisc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  tailDisc.rotation.y = Math.PI / 2; tail.add(tailDisc);

  // lights
  const lightMat = (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 3 });
  const strobe = mesh(new THREE.SphereGeometry(0.09, 8, 6), lightMat(0xffffff), 0, 1.62, -6.95, g);
  const beacon = mesh(new THREE.SphereGeometry(0.1, 8, 6), lightMat(0xff2030), 0, -1.3, -0.6, g);
  for (const l of [strobe, beacon]) l.castShadow = false;

  // searchlight under the nose
  const spot = new THREE.SpotLight(0xdcecff, 0, 110, 0.36, 0.55, 1.1);
  spot.position.set(0, -1.25, 2.6);
  spot.target.position.set(0, -14, 9.4);
  g.add(spot, spot.target);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdcecff, emissiveIntensity: 0 });
  mesh(new THREE.SphereGeometry(0.14, 10, 8), lampMat, 0, -1.25, 2.6, g).castShadow = false;
  const coneGeo = new THREE.CylinderGeometry(0.2, 7.5, 22, 20, 1, true);
  coneGeo.translate(0, -11, 0);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xbfdcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.copy(spot.position);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -12.8, 6.8).normalize());
  g.add(cone);

  return { group: g, door, rotor, tail, discMat, tipRingMat: tipRing.material, bladeMat, tipMat, strobe, beacon, spot, coneMat, lampMat };
}

// ================================================================= rescue basket + life ring + raft
export const BASKET_TOP = 2.9;      // the cable attaches here, at the top of the lifting bails
export function buildBasket(accent) {
  const g = new THREE.Group();
  const cage = model('Jayhawk_Basket', { tints: { Accent: new THREE.Color(accent) } });
  cage.rotation.y = Math.PI / 2;      // long side across, so three friends sit in a row
  g.add(cage);
  return g;
}

// A firefighting bucket on the winch cable: orange fabric on a dark rim, four straps up to the hook ring
export function buildBucket() {
  const g = new THREE.Group();
  const orange = std(0xd8471e, { roughness: 0.8, side: THREE.DoubleSide }), dark = std(0x24262a, { roughness: 0.6 });
  mesh(new THREE.CylinderGeometry(1.15, 0.8, 1.7, 18, 1, true), orange, 0, 0.85, 0, g);
  mesh(new THREE.TorusGeometry(1.15, 0.08, 6, 20), dark, 0, 1.7, 0, g).rotation.x = Math.PI / 2;
  const inside = mesh(new THREE.RingGeometry(.45, .82, 18), dark, 0, 0.08, 0, g); inside.rotation.x = -Math.PI / 2;
  const water = mesh(new THREE.CircleGeometry(1.05, 18), std(0x2f7f9c, { roughness: 0.08 }), 0, 1.0, 0, g); water.rotation.x = -Math.PI / 2;
  water.position.y = 1.71; water.visible = false;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 1.1, z = Math.sin(a) * 1.1;
    const from = new THREE.Vector3(x, 1.7, z), to = new THREE.Vector3(0, BASKET_TOP, 0), len = from.distanceTo(to);
    const strap = mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 4), dark, 0, 0, 0, g);
    strap.position.copy(from).lerp(to, 0.5);
    strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  }
  const flap = new THREE.Group(); flap.position.set(-.45, -.06, 0); g.add(flap);
  mesh(new THREE.CircleGeometry(.45, 16), std(0x98a5a8, {side: THREE.DoubleSide}), .45, 0, 0, flap).rotation.x = -Math.PI / 2;
  g.userData.valve = flap;
  g.userData.water = water;
  return g;
}

export function buildRing() {
  const g = new THREE.Group();
  const cols = [0xff5a1f, 0xffffff];
  for (let i = 0; i < 8; i++) {
    const t = mesh(new THREE.TorusGeometry(1.15, 0.36, 10, 6, Math.PI / 4 + 0.02), std(cols[i % 2], { roughness: 0.5 }), 0, 0, 0, g);
    t.rotation.set(Math.PI / 2, 0, (i / 8) * Math.PI * 2);
  }
  return g;
}
export function buildRaft() {
  const g = new THREE.Group();
  const raft = model('Jayhawk_Raft');
  raft.scale.setScalar(1.5);
  g.add(raft);
  return g;
}

// ================================================================= the friends
// each has two colours of its own: main, then tummy / face / ears
const fur = (a, b) => ({ FurA: new THREE.Color().setRGB(...a), FurB: new THREE.Color().setRGB(...b) });
export const ANIMAL_TYPES = [
  { id: 'bunny', e: '🐰', fur: fur([0.85, 0.8, 0.74], [1, 0.55, 0.6]) }, { id: 'kitty', e: '🐱', fur: fur([0.9, 0.36, 0.04], [0.95, 0.85, 0.7]) },
  { id: 'puppy', e: '🐶', fur: fur([0.5, 0.24, 0.08], [0.85, 0.65, 0.4]) }, { id: 'chick', e: '🐤', fur: fur([1, 0.68, 0.04], [1, 0.8, 0.25]) },
  { id: 'piggy', e: '🐷', fur: fur([1, 0.42, 0.5], [1, 0.6, 0.65]) }, { id: 'lamb', e: '🐑', fur: fur([0.95, 0.92, 0.85], [0.06, 0.05, 0.05]) },
  { id: 'panda', e: '🐼', fur: fur([0.92, 0.92, 0.9], [0.02, 0.02, 0.02]) }, { id: 'fox', e: '🦊', fur: fur([0.8, 0.14, 0.02], [0.95, 0.92, 0.88]) },
  { id: 'frog', e: '🐸', fur: fur([0.09, 0.48, 0.06], [0.55, 0.8, 0.3]) }, { id: 'penguin', e: '🐧', fur: fur([0.02, 0.025, 0.04], [0.95, 0.95, 0.95]) },
];
// The friends come alive without a skeleton: each is one mesh, and its vertex shader moves parts of it by where they
// are on the body (every friend is built on the same frame, about 1.66 tall, facing +z). The eyes blink now and then;
// the head tilts and nods, gently when idle and happily when help is near; and one arm lifts and waves.
// Per friend: anim.uWave and anim.uHappy, 0..1, eased by the game; time is shared (tickFriends).
const FRIEND_TIME = { value: 0 };
export function tickFriends(t) { FRIEND_TIME.value = t; }
const POSE = /* glsl */`
uniform float uTime, uPhase, uWave, uHappy;
// the turns for a point of the body: x the arm's lift, y the head's tilt, z the head's nod
vec3 poseAngles(vec3 p) {
  float arm = 0.0;
  #ifdef ARM
    arm = smoothstep(0.37, 0.46, p.x) * smoothstep(0.32, 0.44, p.y) * (1.0 - smoothstep(0.9, 1.0, p.y)) * uWave * (1.75 + 0.45 * sin(uTime * 10.0 + uPhase));
  #endif
  float hw = smoothstep(0.9, 1.05, p.y);
  float tilt = (sin(uTime * 3.1 + uPhase) * 0.14 * uHappy + sin(uTime * 0.7 + uPhase) * 0.045) * hw;
  float nod = sin(uTime * 2.3 + uPhase * 2.0) * 0.07 * uHappy * hw;
  return vec3(arm, tilt, nod);
}
vec2 turn(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(v.x * c - v.y * s, v.x * s + v.y * c); }
vec3 posePoint(vec3 p, vec3 a) {
  p.xy = vec2(0.36, 0.82) + turn(p.xy - vec2(0.36, 0.82), a.x);
  p.xy = vec2(0.0, 0.95) + turn(p.xy - vec2(0.0, 0.95), a.y);
  p.zy = vec2(0.0, 0.95) + turn(p.zy - vec2(0.0, 0.95), a.z);
  return p;
}
vec3 poseDir(vec3 n, vec3 a) { n.xy = turn(n.xy, a.x); n.xy = turn(n.xy, a.y); n.zy = turn(n.zy, a.z); return n; }
`;
function animateFriend(mat, anim, flags) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, anim);
    const defs = flags.map(f => '#define ' + f + '\n').join('');
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + defs + POSE)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 poseA = poseAngles(position);\nobjectNormal = poseDir(objectNormal, poseA);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef EYE
          // (a blink: the eye squeezes shut to a line and opens again, every few seconds)
          float blinkC = mod(uTime + uPhase * 7.0, 3.7), blink = 1.0 - smoothstep(0.0, 0.08, abs(blinkC - 0.1));
          if (transformed.y > 1.13 && transformed.z > 0.25) transformed.y = 1.215 + (transformed.y - 1.215) * (1.0 - 0.92 * blink);
        #endif
        transformed = posePoint(transformed, poseA);`);
  };
  mat.customProgramCacheKey = () => key + '|friend' + flags.join('');
}
export function buildAnimal(id) {
  const type = ANIMAL_TYPES.find(t => t.id === id);
  const g = new THREE.Group();
  const name = 'Friend_' + id[0].toUpperCase() + id.slice(1);
  const body = model(name, { tints: type.fur, own: geo(name).userData.mats });
  const anim = { uTime: FRIEND_TIME, uPhase: { value: Math.random() * 10 }, uWave: { value: 0 }, uHappy: { value: 0 } };
  for (const mat of [].concat(body.material)) animateFriend(mat, anim, [...(/^(Paint|Dark)$/.test(mat.name) ? ['EYE'] : []), ...(/^Fur/.test(mat.name) ? ['ARM'] : [])]);
  body.scale.setScalar(1.45);
  g.add(body);
  g.userData.body = body;
  g.userData.anim = anim;
  return g;
}

// soft pulsing beacon column above a waiting animal
export function buildBeam() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const geo = new THREE.CylinderGeometry(2.2, 0.5, 110, 12, 1, true);
  geo.translate(0, 58, 0);
  const m = new THREE.Mesh(geo, mat);
  return m;
}


// ================================================================= rescue flying boat
// A Coast Guard rescue amphibian after the Grumman HU-16 Albatross (tools/build_vehicles.py): a boat hull that sits
// in the water, two engines on a high wing, wingtip floats, and a big door open in the port side where rescued friends
// sit and look out. Nose toward +Z; the keel is at y = -1.85.
// (the hull floats with its keel 0.4 m down in the water: its origin is this far above the calm sea)
export const PLANE_FLOAT = 1.45;
// where each engine's propeller turns (game axes: x is to port)
const ENGINES = [[2.5, 0.75, 3.22], [-2.5, 0.75, 3.22]];
export function buildPlane(accent) {
  const g = new THREE.Group();
  g.add(model('Vehicle_Plane', { tints: { Accent: new THREE.Color(accent) } }));
  // (two propellers that turn together: prop is the list, and each blurs into a disc as it spins up)
  const discMat = new THREE.MeshBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  let bladeMat = null;
  const props = ENGINES.map(([x, y, z]) => {
    const prop = new THREE.Group(); prop.position.set(x, y, z + 0.02); g.add(prop);
    const blades = model('Vehicle_PlaneProp', { own: ['Dark', 'Tip'] });
    blades.scale.setScalar(0.95);
    if (!bladeMat) bladeMat = blades.userData.mat('Dark');
    else blades.material = blades.material.map(m => m.name === 'Dark' ? bladeMat : m);
    blades.userData.mat('Tip').transparent = true; bladeMat.transparent = true;
    prop.add(blades);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), discMat); disc.position.set(x, y, z + 0.1); g.add(disc);
    return prop;
  });
  // the friends sit in the open door, looking out, with room for three along the sill
  // (friend-sized for the door: three abreast on the sill, a little smaller than life, all facing out)
  const seat = new THREE.Group(); seat.position.set(0.62, -1.02, -0.55); seat.rotation.y = Math.PI / 2; seat.scale.setScalar(0.5); seat.userData.facingOut = true; g.add(seat);

  const lightMat = (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 3 });
  mesh(new THREE.SphereGeometry(0.1, 8, 6), lightMat(0xff2020), 7.4, 0.98, 1.5, g).castShadow = false;
  mesh(new THREE.SphereGeometry(0.1, 8, 6), lightMat(0x20ff40), -7.4, 0.98, 1.5, g).castShadow = false;
  const strobe = mesh(new THREE.SphereGeometry(0.11, 8, 6), lightMat(0xffffff), 0, 2.95, -5.5, g); strobe.castShadow = false;
  const beacon = mesh(new THREE.SphereGeometry(0.12, 8, 6), lightMat(0xff2030), 0, 0.98, 0.9, g); beacon.castShadow = false;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdcecff, emissiveIntensity: 0 });
  mesh(new THREE.SphereGeometry(0.16, 10, 8), lampMat, 0, -0.35, 5.62, g).castShadow = false;
  // the water bomber's kit, shown on fire missions: the tank sits inside the hull, so outside there are only the drop
  // doors in the hull bottom, the two scoop probes behind the step, and a gauge on the hull side showing how full it is
  const fireTank = new THREE.Group(); g.add(fireTank); fireTank.visible = false;
  const gates = [], scoops = [];
  for (const side of [-1, 1]) {
    const gate = new THREE.Group(); gate.position.set(side * 0.42, -1.8, 0.4); fireTank.add(gate);
    mesh(new THREE.BoxGeometry(0.42, 0.06, 1.5), std(0xdee4df), -side * 0.21, 0, 0, gate); gates.push(gate);
    const scoop = new THREE.Group(); scoop.position.set(side * 0.35, -1.7, -0.5); fireTank.add(scoop);
    mesh(new THREE.BoxGeometry(0.16, 0.5, 0.22), std(0x536d78), 0, -0.2, 0, scoop);
    mesh(new THREE.BoxGeometry(0.3, 0.12, 0.4), std(0xe9b93b), 0, -0.45, 0.1, scoop); scoops.push(scoop);
  }
  // (the gauge: a window in the starboard side with the water rising in it)
  mesh(new THREE.BoxGeometry(0.06, 1.1, 1.5), std(0x263b48), -0.93, -0.3, 1.2, fireTank);
  const level = mesh(new THREE.BoxGeometry(0.08, 1, 1.3), std(0x43c9ea, { emissive: 0x126078, emissiveIntensity: 0.3 }), -0.95, -0.3, 1.2, fireTank);
  return { group: g, props, discMat, bladeMat, strobe, beacon, lampMat, seat, fireTank, gates, scoops, level };
}


// ================================================================= fast rescue boat
// A Coast Guard response boat (tools/build_vehicles.py): foam collar in the pilot's colour, cabin amidships, twin
// outboards. Bow toward +Z, origin on the waterline; friends ride on the open aft deck.
export function buildBoat(accent) {
  const g = new THREE.Group();
  g.add(model('Vehicle_Boat', { tints: { Accent: new THREE.Color(accent) } }));
  const lightMat = (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 3 });
  const strobe = mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), lightMat(0x3b7bff), -0.42, 3.22, -0.35, g); strobe.castShadow = false;
  const beacon = mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), lightMat(0xff2030), 0.42, 3.22, -0.35, g); beacon.castShadow = false;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdcecff, emissiveIntensity: 0 });
  mesh(new THREE.SphereGeometry(0.12, 10, 8), lampMat, 0, 2.42, 1.42, g).castShadow = false;
  const motors = [];
  for (const sx of [-0.55, 0.55]) {
    const mo = new THREE.Group(); mo.position.set(sx, 0.85, -4.12); g.add(mo);
    mo.add(model('Vehicle_BoatMotor'));
    motors.push(mo);
  }
  const seat = new THREE.Group(); seat.position.set(0, 0.66, -2.5); g.add(seat);
  const monitor = new THREE.Group(); monitor.position.set(0, 2.25, 2.65); g.add(monitor); monitor.visible = false;
  mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.6, 12), std(0xff6838), 0, 0, 0, monitor);
  const barrel = new THREE.Group(); barrel.position.y = 0.32; monitor.add(barrel);
  const nozzle = mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.45, 12), std(0xe4e8e9), 0, 0, 0.55, barrel); nozzle.rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.18, 0.055, 6, 12), std(0x2e3e48), 0, 0, 1.28, barrel);
  const pump = new THREE.Group(); pump.position.set(-.8, 1, 1.8); g.add(pump); pump.visible = false;
  mesh(new THREE.BoxGeometry(.7, .65, .9), std(0xd24827), 0, 0, 0, pump);
  const gauge = mesh(new THREE.CircleGeometry(.19, 16), std(0xf5f0d8), -.36, .1, .1, pump); gauge.rotation.y = -Math.PI/2;
  const needle = new THREE.Group(); needle.position.set(-.37, .1, .1); pump.add(needle);
  mesh(new THREE.BoxGeometry(.02, .13, .025), std(0x202d35), 0, .06, 0, needle);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0,.2,0),new THREE.Vector3(-.3,.4,.6),new THREE.Vector3(.2,1,.85),new THREE.Vector3(.8,1.3,.85)]);
  pump.add(new THREE.Mesh(new THREE.TubeGeometry(curve,18,.13,8,false),std(0xe0b44d)));
  const crew = buildAnimal('puppy'); crew.scale.setScalar(.42); crew.position.set(.65,1.2,2.1); g.add(crew); crew.visible=false;
  mesh(new THREE.SphereGeometry(.6,12,8,0,Math.PI*2,0,Math.PI/2), std(0xf8c738), 0, 1.9, 0, crew);
  mesh(new THREE.CylinderGeometry(.72,.72,.08,14), std(0xf8c738), 0, 1.9, 0, crew);
  return { group: g, seat, strobe, beacon, lampMat, motors, monitor, barrel, pump, needle, crew };
}

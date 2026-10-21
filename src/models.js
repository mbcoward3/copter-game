import * as THREE from 'three';
import { model } from './assets.js';

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
export const HOOK_Y = -1.25;
// where the cable leaves the hoist, over the starboard cabin door
export const HOIST = { px: -1.11, y: -0.2, z: 0.58, len: 0 };
// how far the cabin door slides back (z) and stands off the hull (x) when open
export const DOOR_OPEN = { x: -0.06, z: -0.84 };

export function buildHeli(accent) {
  const g = new THREE.Group();
  const tints = { Accent: new THREE.Color(accent) };
  g.add(model('Jayhawk_Body', { tints }));
  const door = new THREE.Group(); g.add(door);
  door.add(model('Jayhawk_Door'));
  const boom = new THREE.Group(); g.add(boom);       // the hoist is fixed on this airframe

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

  return { group: g, door, boom, rotor, tail, discMat, tipRingMat: tipRing.material, bladeMat, tipMat, strobe, beacon, spot, coneMat, lampMat };
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
  const orange = std(0xd8471e, { roughness: 0.8 }), dark = std(0x24262a, { roughness: 0.6 });
  mesh(new THREE.CylinderGeometry(1.15, 0.8, 1.7, 18), orange, 0, 0.85, 0, g);
  mesh(new THREE.TorusGeometry(1.15, 0.08, 6, 20), dark, 0, 1.7, 0, g).rotation.x = Math.PI / 2;
  const inside = mesh(new THREE.CircleGeometry(1.08, 18), dark, 0, 1.705, 0, g); inside.rotation.x = -Math.PI / 2;
  const water = mesh(new THREE.CircleGeometry(1.05, 18), std(0x2f7f9c, { roughness: 0.08 }), 0, 1.0, 0, g); water.rotation.x = -Math.PI / 2;
  water.position.y = 1.71; water.visible = false;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 1.1, z = Math.sin(a) * 1.1;
    const from = new THREE.Vector3(x, 1.7, z), to = new THREE.Vector3(0, BASKET_TOP, 0), len = from.distanceTo(to);
    const strap = mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 4), dark, 0, 0, 0, g);
    strap.position.copy(from).lerp(to, 0.5);
    strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  }
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
export function buildAnimal(id) {
  const type = ANIMAL_TYPES.find(t => t.id === id);
  const g = new THREE.Group();
  const body = model('Friend_' + id[0].toUpperCase() + id.slice(1), { tints: type.fur });
  body.scale.setScalar(1.45);
  g.add(body);
  g.userData.body = body;
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


// ================================================================= rescue seaplane
// A Coast Guard Beaver on floats (tools/build_vehicles.py). Nose toward +Z; the floats touch the water at
// y = -PLANE_FLOAT. Friends ride home in the open rear cockpit.
export const PLANE_FLOAT = 1.85;
export function buildPlane(accent) {
  const g = new THREE.Group();
  g.add(model('Vehicle_Plane', { tints: { Accent: new THREE.Color(accent) } }));
  const prop = new THREE.Group(); prop.position.set(0, 0, 4.72); g.add(prop);
  const blades = model('Vehicle_PlaneProp', { own: ['Dark', 'Tip'] });
  const bladeMat = blades.userData.mat('Dark');
  bladeMat.transparent = blades.userData.mat('Tip').transparent = true;
  prop.add(blades);
  const discMat = new THREE.MeshBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 32), discMat); disc.position.set(0, 0, 4.8); g.add(disc);
  const seat = new THREE.Group(); seat.position.set(0, 0.55, -1.3); g.add(seat);

  const lightMat = (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 3 });
  mesh(new THREE.SphereGeometry(0.1, 8, 6), lightMat(0xff2020), 7.25, 1.26, 2.3, g).castShadow = false;
  mesh(new THREE.SphereGeometry(0.1, 8, 6), lightMat(0x20ff40), -7.25, 1.26, 2.3, g).castShadow = false;
  const strobe = mesh(new THREE.SphereGeometry(0.11, 8, 6), lightMat(0xffffff), 0, 2.32, -4.62, g); strobe.castShadow = false;
  const beacon = mesh(new THREE.SphereGeometry(0.12, 8, 6), lightMat(0xff2030), 0, -0.78, 0.5, g); beacon.castShadow = false;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdcecff, emissiveIntensity: 0 });
  mesh(new THREE.SphereGeometry(0.16, 10, 8), lampMat, 2.2, 1.1, 2.6, g).castShadow = false;
  return { group: g, prop, discMat, bladeMat, strobe, beacon, lampMat, seat };
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
  return { group: g, seat, strobe, beacon, lampMat, motors };
}

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
// Model space: nose toward +Z. The floats touch the water at y = -PLANE_FLOAT.
export const PLANE_FLOAT = 1.85;
export function buildPlane(accent) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf7f7f4, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
  const livery = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
  const dark = std(0x2a3038, { roughness: 0.45, metalness: 0.6 });
  const metal = std(0x9aa4ae, { roughness: 0.3, metalness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0d2233, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.78, envMapIntensity: 1.8 });

  const prof = [[0.03, -4.7], [0.3, -4.4], [0.6, -3.0], [0.9, -1.2], [1.02, 0.6], [1.0, 2.2], [0.86, 3.2], [0.74, 3.7]].map(q => new THREE.Vector2(q[0], q[1]));
  const bodyGeo = new THREE.LatheGeometry(prof, 26); bodyGeo.rotateX(Math.PI / 2);
  mesh(bodyGeo, paint, 0, 0, 0, g).scale.set(1, 0.95, 1);
  const bellyGeo = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q.x * 1.012, q.y)), 26, -Math.PI * 0.3, Math.PI * 0.6); bellyGeo.rotateX(Math.PI / 2);
  mesh(bellyGeo, livery, 0, 0, 0, g).scale.set(1, 0.95, 1);
  const cowl = mesh(new THREE.CylinderGeometry(0.76, 0.72, 1.0, 22), livery, 0, 0, 4.1, g); cowl.rotation.x = Math.PI / 2;
  const cabin = mesh(new THREE.BoxGeometry(1.5, 0.85, 2.1), glass, 0, 0.8, 1.9, g); cabin.castShadow = false;
  mesh(new THREE.BoxGeometry(1.56, 0.1, 2.2), paint, 0, 1.25, 1.9, g);

  // propeller
  const prop = new THREE.Group(); prop.position.set(0, 0, 4.72); g.add(prop);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.5, transparent: true, opacity: 1 });
  for (let i = 0; i < 3; i++) { const b = mesh(new THREE.BoxGeometry(0.3, 1.9, 0.07), bladeMat, 0, 0, 0, prop); b.geometry.translate(0, 0.95, 0); b.rotation.z = (i / 3) * Math.PI * 2; }
  const spinner = mesh(new THREE.ConeGeometry(0.3, 0.6, 14), metal, 0, 0, 0.25, prop); spinner.rotation.x = Math.PI / 2;
  const discMat = new THREE.MeshBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.95, 32), discMat); disc.position.set(0, 0, 4.74); g.add(disc);

  // high wing, struts, tail
  mesh(new THREE.BoxGeometry(14, 0.22, 2.1), paint, 0, 1.42, 1.3, g);
  for (const sx of [-1, 1]) {
    mesh(new THREE.BoxGeometry(1.5, 0.24, 2.12), livery, sx * 6.3, 1.42, 1.3, g);
    const st = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.1, 6), metal, sx * 2.25, 0.45, 1.3, g); st.rotation.z = -sx * 0.98;
  }
  mesh(new THREE.BoxGeometry(4.8, 0.13, 1.25), livery, 0, 0.3, -4.1, g);
  const finShape = new THREE.Shape();
  finShape.moveTo(0.9, 0); finShape.lineTo(-0.7, 2.2); finShape.lineTo(-1.3, 2.2); finShape.lineTo(-1.1, 0); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.14, bevelEnabled: false }); finGeo.translate(0, 0, -0.07); finGeo.rotateY(-Math.PI / 2);
  mesh(finGeo, livery, 0, 0.3, -3.6, g);

  // floats
  for (const sx of [-1, 1]) {
    const f = mesh(new THREE.CapsuleGeometry(0.46, 6.4, 6, 14), paint, sx * 1.8, -PLANE_FLOAT + 0.46, 0.5, g); f.rotation.x = Math.PI / 2;
    const keel = mesh(new THREE.BoxGeometry(0.5, 0.12, 6.2), livery, sx * 1.8, -PLANE_FLOAT + 0.1, 0.5, g);
    for (const sz of [-0.9, 2.0]) { const st = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), metal, sx * 1.3, -0.85, sz, g); st.rotation.z = sx * 0.78; }
  }
  // open back seat for rescued friends
  mesh(new THREE.TorusGeometry(0.95, 0.12, 8, 20), livery, 0, 0.82, -1.3, g).rotation.x = Math.PI / 2;
  const seat = new THREE.Group(); seat.position.set(0, 0.55, -1.3); g.add(seat);

  const lightMat = (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 3 });
  mesh(new THREE.SphereGeometry(0.11, 8, 6), lightMat(0xff2020), 7.05, 1.42, 1.3, g).castShadow = false;
  mesh(new THREE.SphereGeometry(0.11, 8, 6), lightMat(0x20ff40), -7.05, 1.42, 1.3, g).castShadow = false;
  const strobe = mesh(new THREE.SphereGeometry(0.13, 8, 6), lightMat(0xffffff), 0, 2.6, -4.7, g); strobe.castShadow = false;
  const beacon = mesh(new THREE.SphereGeometry(0.14, 8, 6), lightMat(0xff2030), 0, -0.98, 0, g); beacon.castShadow = false;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdcecff, emissiveIntensity: 0 });
  mesh(new THREE.SphereGeometry(0.2, 10, 8), lampMat, 0, -0.55, 3.9, g).castShadow = false;
  return { group: g, prop, discMat, bladeMat, strobe, beacon, lampMat, seat };
}


// ================================================================= fast rescue boat
// Model space: bow toward +Z, origin on the waterline.
export function buildBoat(accent) {
  const g = new THREE.Group();
  const hullM = new THREE.MeshPhysicalMaterial({ color: 0xf7f7f4, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 });
  const tubeM = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const dark = std(0x2a3038, { roughness: 0.45, metalness: 0.6 });
  const metal = std(0x9aa4ae, { roughness: 0.3, metalness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0d2233, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.6, envMapIntensity: 1.8 });

  // V hull
  const sh = new THREE.Shape();
  sh.moveTo(-1.35, -3.6); sh.lineTo(1.35, -3.6); sh.lineTo(1.45, 1.0); sh.quadraticCurveTo(1.1, 3.4, 0, 4.6); sh.quadraticCurveTo(-1.1, 3.4, -1.45, 1.0); sh.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.3, bevelSegments: 2 });
  hullGeo.rotateX(Math.PI / 2);                       // shape y -> +z (bow forward), depth -> down
  mesh(hullGeo, hullM, 0, 0.55, 0, g);
  mesh(new THREE.BoxGeometry(2.5, 0.08, 6.6), std(0x7d8791, { roughness: 0.8 }), 0, 0.5, -0.2, g);   // deck
  // inflatable collar
  for (const sx of [-1, 1]) {
    const t1 = mesh(new THREE.CapsuleGeometry(0.42, 4.6, 6, 14), tubeM, sx * 1.5, 0.72, -1.2, g); t1.rotation.x = Math.PI / 2;
    const t2 = mesh(new THREE.CapsuleGeometry(0.4, 2.9, 6, 14), tubeM, sx * 0.86, 0.76, 2.75, g); t2.rotation.x = Math.PI / 2; t2.rotation.z = sx * 0.47; t2.rotation.order = 'YXZ'; t2.rotation.set(Math.PI / 2, -sx * 0.47, 0);
  }
  mesh(new THREE.SphereGeometry(0.44, 12, 10), tubeM, 0, 0.78, 4.15, g);
  // console, windshield, wheel, light bar on a roll arch
  mesh(new THREE.BoxGeometry(1.3, 1.05, 1.0), hullM, 0, 1.05, 0.9, g);
  const ws = mesh(new THREE.BoxGeometry(1.4, 0.7, 0.06), glass, 0, 1.85, 1.3, g); ws.rotation.x = -0.35; ws.castShadow = false;
  const wheel = mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 14), dark, 0, 1.5, 0.36, g); wheel.rotation.x = -0.5;
  for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), metal, sx * 1.05, 1.75, -2.5, g);
  mesh(new THREE.BoxGeometry(2.2, 0.1, 0.5), metal, 0, 2.8, -2.5, g);
  const lightMat = (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 3 });
  const strobe = mesh(new THREE.BoxGeometry(0.5, 0.16, 0.22), lightMat(0x3b7bff), -0.5, 2.94, -2.5, g); strobe.castShadow = false;
  const beacon = mesh(new THREE.BoxGeometry(0.5, 0.16, 0.22), lightMat(0xff2030), 0.5, 2.94, -2.5, g); beacon.castShadow = false;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdcecff, emissiveIntensity: 0 });
  mesh(new THREE.SphereGeometry(0.16, 10, 8), lampMat, 0, 2.95, -2.3, g).castShadow = false;
  // twin outboards
  const motors = [];
  for (const sx of [-0.55, 0.55]) {
    const mo = new THREE.Group(); mo.position.set(sx, 0.9, -3.85); g.add(mo);
    mesh(new THREE.BoxGeometry(0.5, 0.75, 0.75), dark, 0, 0.3, 0, mo);
    mesh(new THREE.BoxGeometry(0.52, 0.12, 0.77), tubeM, 0, 0.5, 0, mo);
    mesh(new THREE.BoxGeometry(0.16, 1.2, 0.3), metal, 0, -0.6, -0.05, mo);
    motors.push(mo);
  }
  // open aft deck for rescued friends
  const seat = new THREE.Group(); seat.position.set(0, 0.5, -1.3); g.add(seat);
  return { group: g, seat, strobe, beacon, lampMat, motors };
}

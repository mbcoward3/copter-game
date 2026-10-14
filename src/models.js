import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ================================================================= helicopter
// Model space: nose toward +Z, up +Y, skids touch the ground at y = -SKID.
export const SKID = 1.95;
export const HOOK_Y = -1.25;
// hoist boom: pivot above the side door, swings from stowed (along the fuselage) to straight out
export const HOIST = { px: -1.2, y: 1.2, z: 0.15, len: 1.45 };

export function buildHeli(accent) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf7f7f4, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
  const livery = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
  const dark = std(0x2a3038, { roughness: 0.45, metalness: 0.6 });
  const metal = std(0x9aa4ae, { roughness: 0.3, metalness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0d2233, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.78, envMapIntensity: 1.8 });

  // fuselage: a lathe profile spun round the long axis
  const prof = [[0.03, -2.5], [0.55, -2.4], [1.05, -2.0], [1.38, -1.2], [1.5, -0.2], [1.46, 0.8], [1.25, 1.7], [0.85, 2.4], [0.4, 2.85], [0.03, 3.0]]
    .map(p => new THREE.Vector2(p[0], p[1]));
  const bodyGeo = new THREE.LatheGeometry(prof, 28);
  bodyGeo.rotateX(Math.PI / 2);
  const body = mesh(bodyGeo, paint, 0, 0, 0, g);
  body.scale.set(1, 1.02, 1);

  // livery: belly band + stripe
  const bellyGeo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p.x * 1.012, p.y)), 28, -Math.PI * 0.3, Math.PI * 0.6);
  bellyGeo.rotateX(Math.PI / 2);
  mesh(bellyGeo, livery, 0, 0, 0, g).scale.set(1, 1.02, 1);

  // canopy
  const canGeo = new THREE.SphereGeometry(1.36, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.56);
  canGeo.rotateX(Math.PI * 0.36);
  const canopy = mesh(canGeo, glass, 0, 0.22, 1.25, g);
  canopy.scale.set(0.98, 0.96, 1.32); canopy.castShadow = false;

  // engine cowling + mast
  const cowl = mesh(new THREE.CapsuleGeometry(0.62, 1.9, 6, 14), livery, 0, 1.45, -0.55, g);
  cowl.rotation.x = Math.PI / 2; cowl.scale.set(1.25, 1, 0.8);
  mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.4, 10), dark, 0, 1.65, -1.75, g).rotation.x = Math.PI / 2; // exhaust
  mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.0, 10), metal, 0, 2.3, 0, g);

  // tail
  const tailBoom = mesh(new THREE.CylinderGeometry(0.2, 0.52, 5.4, 14), paint, 0, 0.55, -4.6, g);
  tailBoom.rotation.x = -Math.PI / 2 + 0.06;
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(-1.1, 2.1); finShape.lineTo(-0.3, 2.1); finShape.lineTo(0.9, 0.1); finShape.lineTo(0.5, -0.5); finShape.lineTo(0, -0.3);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  finGeo.translate(0, 0, -0.07); finGeo.rotateY(-Math.PI / 2);
  mesh(finGeo, livery, 0, 0.7, -7.0, g);
  mesh(new THREE.BoxGeometry(2.6, 0.1, 0.7), livery, 0, 0.75, -6.0, g);
  const tail = new THREE.Group(); tail.position.set(0.3, 1.75, -7.55); g.add(tail);
  mesh(new THREE.BoxGeometry(0.05, 2.3, 0.2), dark, 0, 0, 0, tail);
  mesh(new THREE.BoxGeometry(0.05, 0.2, 2.3), dark, 0, 0, 0, tail);
  const tailDisc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  tailDisc.rotation.y = Math.PI / 2; tail.add(tailDisc);

  // main rotor
  const rotor = new THREE.Group(); rotor.position.y = 2.82; g.add(rotor);
  mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), dark, 0, 0, 0, rotor);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.5, transparent: true, opacity: 1 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xffd23c, transparent: true, opacity: 1 });
  for (let i = 0; i < 4; i++) {
    const b = mesh(new THREE.BoxGeometry(5.3, 0.06, 0.36), bladeMat, 0, 0, 0, rotor);
    b.geometry.translate(2.8, 0, 0); b.rotation.y = (i / 4) * Math.PI * 2;
    const tip = mesh(new THREE.BoxGeometry(0.5, 0.065, 0.37), tipMat, 0, 0, 0, rotor);
    tip.geometry.translate(5.3, 0, 0); tip.rotation.y = b.rotation.y;
  }
  const discMat = new THREE.MeshBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.4, 5.6, 40), discMat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 2.84; g.add(disc);
  const tipRing = new THREE.Mesh(new THREE.RingGeometry(5.1, 5.55, 48), new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  tipRing.rotation.x = -Math.PI / 2; tipRing.position.y = 2.85; g.add(tipRing);

  // skids
  for (const sx of [-1.25, 1.25]) {
    const sk = mesh(new THREE.CapsuleGeometry(0.09, 4.6, 4, 8), metal, sx, -SKID + 0.09, 0.3, g);
    sk.rotation.x = Math.PI / 2;
    for (const sz of [-0.9, 1.4]) {
      const st = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), metal, sx * 0.86, -1.5, sz, g);
      st.rotation.z = sx > 0 ? 0.42 : -0.42;
    }
  }
  // rescue door on the side: a dark doorway with a panel that slides back along the fuselage
  mesh(new THREE.BoxGeometry(0.1, 1.45, 1.55), new THREE.MeshStandardMaterial({ color: 0x0c0f13, roughness: 0.9 }), -1.42, 0.0, -0.25, g).castShadow = false;
  const door = new THREE.Group(); door.position.set(-1.5, 0.0, -0.25); g.add(door);
  mesh(new THREE.BoxGeometry(0.09, 1.5, 1.6), livery, 0, 0, 0, door);
  mesh(new THREE.BoxGeometry(0.1, 0.5, 0.8), glass, -0.01, 0.3, 0, door).castShadow = false;
  mesh(new THREE.BoxGeometry(0.06, 0.06, 3.3), metal, -1.5, 0.82, -1.0, g);          // door rail
  // hoist: a boom above the door that swings out over the side
  const boom = new THREE.Group(); boom.position.set(HOIST.px, HOIST.y, HOIST.z); g.add(boom);
  mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 10), dark, 0, -0.1, 0, boom);
  const arm = mesh(new THREE.BoxGeometry(0.16, 0.16, HOIST.len), livery, 0, 0.1, HOIST.len / 2, boom);
  const drum = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), metal, 0, 0.1, HOIST.len - 0.1, boom); drum.rotation.z = Math.PI / 2;

  // lights
  const lightMat = (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 3 });
  const navL = mesh(new THREE.SphereGeometry(0.11, 8, 6), lightMat(0xff2020), 1.5, 0, 0.2, g);
  const navR = mesh(new THREE.SphereGeometry(0.11, 8, 6), lightMat(0x20ff40), -1.5, 0, 0.2, g);
  const strobe = mesh(new THREE.SphereGeometry(0.13, 8, 6), lightMat(0xffffff), 0, 2.95, -7.3, g);
  const beacon = mesh(new THREE.SphereGeometry(0.14, 8, 6), lightMat(0xff2030), 0, -1.48, -0.9, g);
  for (const l of [navL, navR, strobe, beacon]) l.castShadow = false;

  // searchlight
  const spot = new THREE.SpotLight(0xdcecff, 0, 110, 0.36, 0.55, 1.1);
  spot.position.set(0, -1.2, 2.2);
  spot.target.position.set(0, -14, 9);
  g.add(spot, spot.target);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdcecff, emissiveIntensity: 0 });
  mesh(new THREE.SphereGeometry(0.24, 10, 8), lampMat, 0, -1.2, 2.2, g).castShadow = false;
  const coneGeo = new THREE.CylinderGeometry(0.25, 7.5, 22, 20, 1, true);
  coneGeo.translate(0, -11, 0);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xbfdcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.copy(spot.position);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -12.8, 6.8).normalize());
  g.add(cone);

  g.traverse(o => { if (o.isMesh && o.castShadow) o.receiveShadow = false; });
  return { group: g, door, boom, rotor, tail, discMat, tipRingMat: tipRing.material, bladeMat, tipMat, strobe, beacon, spot, coneMat, lampMat };
}

// ================================================================= rescue basket + life ring + raft
export function buildBasket(accent) {
  // a Coast Guard style rescue basket: steel cage, red flotation, lifting bails
  const g = new THREE.Group();
  const steel = std(0xc9d1d8, { roughness: 0.35, metalness: 0.85 });
  const floatM = std(0xe5261f, { roughness: 0.55 });
  const W = 2.5, D = 1.5, H = 0.95;
  mesh(new THREE.BoxGeometry(W, 0.07, D), std(0x8f989f, { roughness: 0.6, metalness: 0.6 }), 0, 0.03, 0, g);
  const bar = (len, x, y, z, axis) => { const c = mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), steel, x, y, z, g); if (axis === 'x') c.rotation.z = Math.PI / 2; if (axis === 'z') c.rotation.x = Math.PI / 2; return c; };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(H, sx * W / 2, H / 2, sz * D / 2, 'y');
  for (const y of [H * 0.5, H]) { for (const sz of [-1, 1]) bar(W, 0, y, sz * D / 2, 'x'); for (const sx of [-1, 1]) bar(D, sx * W / 2, y, 0, 'z'); }
  for (const sx of [-0.5, 0, 0.5]) for (const sz of [-1, 1]) bar(H, sx * W / 2, H / 2, sz * D / 2, 'y');
  for (const sz of [-1, 1]) { const f = mesh(new THREE.CapsuleGeometry(0.2, W - 0.5, 4, 10), floatM, 0, H + 0.05, sz * (D / 2 + 0.12), g); f.rotation.z = Math.PI / 2; }
  // two bails meeting at the lifting ring
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a = new THREE.Vector3(sx * W / 2, H, sz * D / 2), b = new THREE.Vector3(0, BASKET_TOP, 0);
    const c = mesh(new THREE.CylinderGeometry(0.03, 0.03, a.distanceTo(b), 5), steel, 0, 0, 0, g);
    c.position.copy(a).lerp(b, 0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }
  const ring = mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 12), std(accent, { roughness: 0.4, metalness: 0.5 }), 0, BASKET_TOP, 0, g);
  ring.rotation.y = Math.PI / 2;
  return g; // cable attaches at y = BASKET_TOP
}
export const BASKET_TOP = 2.35;

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
  const wood = std(0x9a7248, { roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.28, 0.28, 4.2, 8), wood, -1.5 + i * 0.6, 0, 0, g);
    l.rotation.x = Math.PI / 2; l.rotation.y = (i % 2) * 0.03;
  }
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), wood, 1.3, 1.5, -1.5, g);
  const flag = mesh(new THREE.PlaneGeometry(1.2, 0.8), std(0xff3b3b, { side: THREE.DoubleSide }), 0.7, 2.6, -1.5, g);
  flag.castShadow = true;
  return g;
}

// ================================================================= animals
export const ANIMAL_TYPES = [
  { id: 'bunny', e: '🐰' }, { id: 'kitty', e: '🐱' }, { id: 'puppy', e: '🐶' },
  { id: 'chick', e: '🐤' }, { id: 'piggy', e: '🐷' }, { id: 'lamb', e: '🐑' },
  { id: 'panda', e: '🐼' }, { id: 'fox', e: '🦊' }, { id: 'frog', e: '🐸' }, { id: 'penguin', e: '🐧' },
];
const SPH = new THREE.SphereGeometry(1, 18, 14);
const CONE = new THREE.ConeGeometry(1, 1, 12);
const eyeMat = std(0x111111, { roughness: 0.15 });
const glintMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });

function ball(mat, sx, sy, sz, x, y, z, parent) { const m = mesh(SPH, mat, x, y, z, parent); m.scale.set(sx, sy, sz); return m; }
function cone(mat, r, h, x, y, z, parent) { const m = mesh(CONE, mat, x, y, z, parent); m.scale.set(r, h, r); return m; }

export function buildAnimal(id) {
  const g = new THREE.Group();
  const head = new THREE.Group(); head.position.set(0, 1.12, 0.12); g.add(head);
  const eyes = (y = 0.08, x = 0.2, z = 0.4, s = 0.085) => {
    for (const sx of [-1, 1]) {
      ball(eyeMat, s, s * 1.15, s, sx * x, y, z, head);
      const gl = new THREE.Mesh(SPH, glintMat); gl.scale.setScalar(s * 0.36); gl.position.set(sx * x + 0.025, y + 0.035, z + s * 0.8); head.add(gl);
    }
  };
  const basic = (bodyC, headC = bodyC) => {
    const bm = std(bodyC), hm = headC === bodyC ? bm : std(headC);
    ball(bm, 0.52, 0.56, 0.5, 0, 0.52, 0, g);
    ball(hm, 0.48, 0.45, 0.45, 0, 0, 0, head);
    for (const sx of [-1, 1]) { ball(bm, 0.15, 0.13, 0.2, sx * 0.25, 0.1, 0.22, g); g.userData['arm' + sx] = ball(bm, 0.12, 0.24, 0.12, sx * 0.52, 0.66, 0.06, g); }
    return { bm, hm };
  };
  switch (id) {
    case 'bunny': {
      const { hm } = basic(0xf3efe9); const pink = std(0xffa6b8);
      for (const sx of [-1, 1]) { const e = ball(hm, 0.11, 0.42, 0.08, sx * 0.19, 0.66, -0.02, head); e.rotation.z = -sx * 0.16; ball(pink, 0.055, 0.3, 0.03, sx * 0.19, 0.66, 0.05, head).rotation.z = -sx * 0.16; }
      ball(pink, 0.06, 0.045, 0.05, 0, -0.04, 0.44, head); ball(std(0xffffff), 0.17, 0.17, 0.17, 0, 0.36, -0.5, g); eyes(); break;
    }
    case 'kitty': {
      const { hm, bm } = basic(0xf2a23c);
      for (const sx of [-1, 1]) cone(hm, 0.17, 0.3, sx * 0.28, 0.42, 0, head).rotation.z = -sx * 0.25;
      ball(std(0xfff1dc), 0.2, 0.15, 0.12, 0, -0.1, 0.36, head); ball(std(0xff8fa0), 0.05, 0.04, 0.04, 0, -0.04, 0.47, head);
      const t = ball(bm, 0.08, 0.36, 0.08, 0, 0.62, -0.52, g); t.rotation.x = -0.5; eyes(); break;
    }
    case 'puppy': {
      const { hm } = basic(0xc98d55); const brown = std(0x6e4526);
      for (const sx of [-1, 1]) ball(brown, 0.13, 0.3, 0.18, sx * 0.46, 0.02, 0, head).rotation.z = sx * 0.25;
      ball(std(0xf2dcc0), 0.22, 0.17, 0.2, 0, -0.1, 0.36, head); ball(eyeMat, 0.075, 0.06, 0.06, 0, -0.03, 0.56, head);
      ball(hm, 0.07, 0.07, 0.24, 0, 0.5, -0.55, g); eyes(); break;
    }
    case 'chick': {
      basic(0xffd83a); const or = std(0xff8a1f);
      const bk = cone(or, 0.1, 0.22, 0, -0.03, 0.5, head); bk.rotation.x = Math.PI / 2;
      for (const k of [-1, 0, 1]) ball(std(0xffd83a), 0.05, 0.14, 0.05, k * 0.07, 0.48, 0, head).rotation.z = -k * 0.4;
      eyes(0.1, 0.2, 0.4); break;
    }
    case 'piggy': {
      const { hm } = basic(0xffaebd); const dk = std(0xf07f98);
      for (const sx of [-1, 1]) cone(hm, 0.14, 0.22, sx * 0.3, 0.38, 0.05, head).rotation.set(0.5, 0, -sx * 0.5);
      const sn = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 14), dk, 0, -0.06, 0.46, head); sn.rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) ball(eyeMat, 0.03, 0.045, 0.02, sx * 0.06, -0.06, 0.535, head);
      eyes(0.12); break;
    }
    case 'lamb': {
      const wool = std(0xfbf8f2, { roughness: 1 }), face = std(0x3a3340);
      ball(wool, 0.5, 0.52, 0.48, 0, 0.52, 0, g);
      for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.36; ball(wool, 0.22, 0.22, 0.22, Math.cos(a) * r, 0.42 + (i % 3) * 0.2, Math.sin(a) * r, g); }
      ball(face, 0.38, 0.4, 0.38, 0, 0, 0.03, head);
      for (let i = 0; i < 5; i++) ball(wool, 0.18, 0.16, 0.18, (i - 2) * 0.15, 0.32 - Math.abs(i - 2) * 0.05, 0, head);
      for (const sx of [-1, 1]) { ball(face, 0.2, 0.08, 0.1, sx * 0.44, 0.08, 0, head).rotation.z = -sx * 0.4; ball(face, 0.13, 0.12, 0.18, sx * 0.25, 0.1, 0.22, g); g.userData['arm' + sx] = ball(face, 0.11, 0.22, 0.11, sx * 0.52, 0.66, 0.06, g); }
      for (const sx of [-1, 1]) { ball(std(0xffffff), 0.1, 0.11, 0.06, sx * 0.16, 0.08, 0.34, head); ball(eyeMat, 0.055, 0.065, 0.04, sx * 0.16, 0.08, 0.385, head); }
      break;
    }
    case 'panda': {
      const { } = basic(0xf7f7f5); const blk = std(0x1c1c1f);
      for (const sx of [-1, 1]) { ball(blk, 0.16, 0.16, 0.1, sx * 0.34, 0.36, 0, head); ball(blk, 0.13, 0.16, 0.06, sx * 0.2, 0.06, 0.38, head).rotation.z = sx * 0.4; }
      ball(blk, 0.06, 0.045, 0.05, 0, -0.08, 0.45, head);
      for (const sx of [-1, 1]) { g.userData['arm' + sx].material = blk; }
      for (const sx of [-1, 1]) { const gl = new THREE.Mesh(SPH, glintMat); gl.scale.setScalar(0.035); gl.position.set(sx * 0.2 + 0.02, 0.09, 0.445); head.add(gl); }
      break;
    }
    case 'fox': {
      const { hm, bm } = basic(0xe8692a); const wh = std(0xfff4e6);
      for (const sx of [-1, 1]) { cone(hm, 0.17, 0.38, sx * 0.27, 0.46, 0, head).rotation.z = -sx * 0.2; cone(eyeMat, 0.08, 0.14, sx * 0.3, 0.6, 0, head).rotation.z = -sx * 0.2; }
      const sn = cone(wh, 0.2, 0.36, 0, -0.1, 0.44, head); sn.rotation.x = Math.PI / 2; ball(eyeMat, 0.055, 0.05, 0.05, 0, -0.09, 0.63, head);
      const t = ball(bm, 0.16, 0.16, 0.42, 0, 0.4, -0.62, g); t.rotation.x = 0.5; ball(wh, 0.12, 0.12, 0.16, 0, 0.56, -0.93, g); eyes(0.1); break;
    }
    case 'frog': {
      const { hm } = basic(0x56b947);
      for (const sx of [-1, 1]) { ball(hm, 0.17, 0.17, 0.17, sx * 0.24, 0.36, 0.12, head); ball(std(0xffffff), 0.12, 0.12, 0.08, sx * 0.24, 0.38, 0.22, head); ball(eyeMat, 0.07, 0.08, 0.04, sx * 0.24, 0.38, 0.285, head); }
      ball(std(0xd7f29a), 0.36, 0.3, 0.2, 0, 0.5, 0.33, g);
      const mouth = mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 14, Math.PI), eyeMat, 0, -0.02, 0.38, head); mouth.rotation.set(0.3, 0, Math.PI); break;
    }
    case 'penguin': {
      const { } = basic(0x22262e); const or = std(0xffa11f);
      ball(std(0xffffff), 0.38, 0.44, 0.3, 0, 0.5, 0.26, g); ball(std(0xffffff), 0.36, 0.32, 0.2, 0, -0.03, 0.29, head);
      const bk = cone(or, 0.09, 0.2, 0, -0.03, 0.52, head); bk.rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) ball(or, 0.16, 0.06, 0.24, sx * 0.24, 0.05, 0.25, g);
      eyes(0.1, 0.17, 0.44, 0.07); break;
    }
  }
  g.userData.head = head;
  g.scale.setScalar(1.7);
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

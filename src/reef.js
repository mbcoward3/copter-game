// The coral reef's life, seen through its clear shallow water: coral heads of five kinds standing on the sea bed in
// patches, and little schools of bright fish circling round them. All of it hangs in the reef zone's own group, so it
// is only drawn near the reef.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Anything under the sea fades into the water's own colour the deeper it lies, red first, as real water does.
function underwater(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vDeep;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vDeep = max(0.0, -(modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y);
        #else
          vDeep = max(0.0, -(modelMatrix * vec4(transformed, 1.0)).y);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDeep;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        vec3 keep = exp(-vDeep * vec3(0.2, 0.06, 0.045));
        gl_FragColor.rgb = gl_FragColor.rgb * keep + vec3(0.01, 0.09, 0.1) * (1.0 - keep.g);`);
  };
  mat.customProgramCacheKey = () => 'underwater' + (mat.vertexColors ? 'v' : '');
  return mat;
}

// ---- the coral, each kind one geometry about a metre across, standing on y = 0
function brain() {
  const g = new THREE.SphereGeometry(0.75, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // (the winding grooves of a brain coral)
    const groove = 1 + 0.06 * Math.sin(x * 11 + Math.sin(z * 7) * 2.5);
    p.setXYZ(i, x * groove, y * 0.75 * groove - 0.12, z * groove);
  }
  g.computeVertexNormals();
  return g;
}
function staghorn(rnd) {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const len = 0.6 + rnd() * 0.7, a = rnd() * 6.283, tilt = 0.25 + rnd() * 0.6;
    const c = new THREE.CylinderGeometry(0.035, 0.07, len, 5);
    c.translate(0, len / 2, 0);
    c.rotateZ(tilt); c.rotateY(a);
    c.translate(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    parts.push(c);
    // (and a fork off each)
    const f = new THREE.CylinderGeometry(0.025, 0.045, len * 0.5, 5);
    f.translate(0, len * 0.25, 0); f.rotateZ(tilt + 0.6); f.rotateY(a + 0.5);
    f.translate(Math.cos(a) * (0.12 + Math.sin(tilt) * len * 0.5), Math.cos(tilt) * len * 0.5, Math.sin(a) * (0.12 + Math.sin(tilt) * len * 0.5));
    parts.push(f);
  }
  return mergeGeometries(parts.map(g => g.toNonIndexed()));
}
function table() {
  const top = new THREE.CylinderGeometry(0.85, 0.7, 0.12, 14);
  top.translate(0, 0.55, 0);
  const p = top.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) + 0.08 * Math.sin(Math.atan2(z, x) * 5)); }
  const stalk = new THREE.CylinderGeometry(0.1, 0.18, 0.55, 6); stalk.translate(0, 0.27, 0);
  const g = mergeGeometries([top.toNonIndexed(), stalk.toNonIndexed()]);
  g.computeVertexNormals();
  return g;
}
function fan() {
  // a sea fan: a flat, frilly half disc standing on edge
  const g = new THREE.CircleGeometry(0.8, 18, 0, Math.PI);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.06 * Math.sin(x * 9 + y * 5)); }
  g.computeVertexNormals();
  return g;
}
function tubes(rnd) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const h = 0.4 + rnd() * 0.6, r = 0.07 + rnd() * 0.05, a = rnd() * 6.283, d = rnd() * 0.25;
    const c = new THREE.CylinderGeometry(r, r * 0.85, h, 8, 1, true);
    c.translate(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    parts.push(c.toNonIndexed());
  }
  return mergeGeometries(parts);
}

const COLOURS = [[1.0, 0.32, 0.45], [1.0, 0.45, 0.12], [0.55, 0.22, 0.85], [1.0, 0.78, 0.18], [0.2, 0.75, 0.5], [0.9, 0.2, 0.2], [0.75, 0.6, 0.45], [0.85, 0.5, 0.75]];

// ---- fish: a little body and tail, about 25 cm, nose toward +z
function fishGeo() {
  const body = new THREE.SphereGeometry(0.12, 8, 6); body.scale(0.55, 1, 1.4); body.deleteAttribute('uv');
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.14, 0, 0.1, -0.28, 0, -0.1, -0.28], 3));
  tail.computeVertexNormals();
  return mergeGeometries([body.toNonIndexed(), tail]);
}
const FISH = [[1.0, 0.85, 0.15], [1.0, 0.5, 0.12], [0.25, 0.55, 1.0], [0.95, 0.95, 0.95], [1.0, 0.35, 0.6]];

export function buildReef({ group, terrainHeight, fbm, centre, radius, keepOut }) {
  const rnd = (() => { let a = 4242; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const kinds = [brain(), staghorn(rnd), table(), fan(), tubes(rnd)];
  const spots = kinds.map(() => []);
  const patches = [];
  const m = new THREE.Object3D(), col = new THREE.Color();
  for (let x = centre.x - radius; x < centre.x + radius; x += 1.9) for (let z = centre.z - radius; z < centre.z + radius; z += 1.9) {
    const px = x + (rnd() - 0.5) * 1.8, pz = z + (rnd() - 0.5) * 1.8, r = rnd();
    if (Math.hypot(px - centre.x, pz - centre.z) > radius) continue;
    const y = terrainHeight(px, pz);
    // (on the sea bed between a metre and six down, in patches, and clear of the channels and the wreck)
    if (y > -1.2 || y < -6.5) continue;
    const patch = fbm(px * 0.05 + 7.7, pz * 0.05 - 2.3);
    if (patch < 0.4 || r > (patch - 0.36) * 2.6) continue;
    if (keepOut(px, pz)) continue;
    const q = rnd(), k = q < 0.34 ? 0 : q < 0.64 ? 1 : q < 0.72 ? 2 : q < 0.82 ? 3 : 4;      // (mostly brain and staghorn; table coral is the rarest)
    // (never so tall that a hull passing over would cut through it)
    const room = -0.8 - y, s = Math.min(room / (k === 1 ? 1.2 : k === 3 ? 0.85 : 0.75), 1.0 + rnd() * 1.4);
    if (s < 0.35) continue;
    spots[k].push({ x: px, y: y - 0.05, z: pz, s, yaw: rnd() * 6.283, c: COLOURS[(rnd() * COLOURS.length) | 0] });
    if (rnd() < 0.02) patches.push({ x: px, z: pz, y });
  }
  kinds.forEach((g, k) => {
    const list = spots[k];
    if (!list.length) return;
    const mat = underwater(new THREE.MeshStandardMaterial({ roughness: 0.85, side: k === 3 ? THREE.DoubleSide : THREE.FrontSide }));
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((it, i) => {
      m.position.set(it.x, it.y, it.z); m.rotation.set(0, it.yaw, 0); m.scale.set(it.s, it.s * (0.8 + 0.4 * ((i * 7) % 5) / 5), it.s); m.updateMatrix();
      mesh.setMatrixAt(i, m.matrix);
      mesh.setColorAt(i, col.setRGB(...it.c).multiplyScalar(0.8 + 0.3 * ((i * 13) % 7) / 7));
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  // fish: a school round some of the coral patches, each fish on its own circle round the school's wandering middle
  const schools = patches.filter((p, i) => i % 2 === 0).slice(0, 22).map((p, i) => ({ ...p, n: 10 + (i % 4) * 3, c: FISH[i % FISH.length], ph: rnd() * 6.283, r: 2.5 + rnd() * 2.5 }));
  const total = schools.reduce((n, s) => n + s.n, 0);
  const fishMesh = new THREE.InstancedMesh(fishGeo(), underwater(new THREE.MeshStandardMaterial({ roughness: 0.5, side: THREE.DoubleSide })), Math.max(total, 1));
  const fish = [];
  for (const s of schools) for (let i = 0; i < s.n; i++) {
    fish.push({ s, a: rnd() * 6.283, rr: s.r * (0.5 + rnd() * 0.7), dy: rnd(), sp: 0.5 + rnd() * 0.4 });
    fishMesh.setColorAt(fish.length - 1, col.setRGB(...s.c));
  }
  fishMesh.count = fish.length;
  fishMesh.frustumCulled = false;
  group.add(fishMesh);

  return {
    counts: spots.map(l => l.length), fish: fish.length,
    update(t) {
      if (!group.visible || !fish.length) return;
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i], s = f.s;
        const cx = s.x + Math.sin(t * 0.07 + s.ph) * 3, cz = s.z + Math.cos(t * 0.05 + s.ph) * 3;
        const a = f.a + t * f.sp * (i % 3 === 0 ? -1 : 1) * 0.6;
        const x = cx + Math.cos(a) * f.rr, z = cz + Math.sin(a) * f.rr;
        // (hanging midway between the coral and the surface, never above it or into the sea bed)
        const floor = terrainHeight(x, z);
        const y = Math.min(-0.5, Math.max(floor + 0.4, s.y * 0.5 - 0.3 + f.dy * 0.8 + Math.sin(t * 1.3 + i) * 0.15));
        m.position.set(x, y, z);
        const dir = i % 3 === 0 ? -1 : 1;
        m.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir) + Math.sin(t * 9 + i) * 0.15, 0);
        m.scale.setScalar(0.9 + f.dy * 0.5);
        m.updateMatrix();
        fishMesh.setMatrixAt(i, m.matrix);
      }
      fishMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

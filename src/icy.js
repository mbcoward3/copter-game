// The snowy peaks' own things (see ICY-PEAKS.md): icebergs standing offshore and bits of ice bobbing round the glacier's
// foot, a colony of penguins by the cove that waddle about and now and then belly-slide into the sea for a swim, smoke
// from the lodge's chimney, and the northern lights over the peaks at night.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { model } from './assets.js';

// ================================================================= icebergs
// An iceberg is a lump of old ice, sculpted where it broke and melted: snow on its top, white-blue sides with bands of
// dense blue ice in them, turquoise just under the water and deep blue below. kind: 'table' (flat-topped, wide),
// 'dome' or 'spire'. Its waterline is at y = 0; returns the geometry and how far it reaches out at the waterline.
const BERG_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0, envMapIntensity: 0.7 });
function bergGeometry(rnd, size, tall, kind, detail = 2) {
  // (welded into one smooth skin: the sphere comes with every triangle's corners apart)
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
  const g = mergeVertices(ico), p = g.attributes.position;
  ico.dispose();
  // (lumpy all over, each berg its own way: broad swellings, then smaller knobs and the flutes melt-water cuts down
  // its sides; the low spots between are where the ice shows blue)
  const waves = Array.from({ length: 9 }, (_, i) => ({ k: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(1.4 + i * 1.3), ph: rnd() * 6.28, a: 0.2 / (1 + i * 0.55) }));
  const crags = Array.from({ length: 6 }, (_, i) => ({ k: new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.4, rnd() - 0.5).normalize().multiplyScalar(5 + i * 2.2), ph: rnd() * 6.28, a: 0.075 / (1 + i * 0.3) }));
  const sx = size * (0.8 + rnd() * 0.5), sz = size * (0.8 + rnd() * 0.5), lean = (rnd() - 0.5) * 0.5, v = new THREE.Vector3();
  const dent = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let r = 1;
    for (const w of waves) r += w.a * Math.sin(v.dot(w.k) + w.ph);
    // (and sharp-edged crags where it split: ridges between scooped faces, mostly running up and down)
    for (const w of crags) r += w.a * (0.5 - Math.abs(Math.sin(v.dot(w.k) + w.ph)));
    const flute = 0.05 * Math.sin(Math.atan2(v.z, v.x) * 13 + v.y * 2) * Math.max(0, v.y);
    r += flute; dent[i] = r;
    v.multiplyScalar(r);
    let y = v.y;
    if (y > 0) {
      // (a tabular berg stands in sheer cliffs from the water up to its flat top)
      if (kind === 'table') { const k = 0.88 / Math.max(0.5, Math.sqrt(1 - Math.min(0.9, v.y * v.y))); v.x *= k; v.z *= k; y = Math.min(y * 1.4, 0.72 + 0.05 * Math.sin(v.x * 5 + v.z * 3)); }
      else if (kind === 'spire') y = y * (1 + 1.1 * Math.max(0, y - 0.2) * Math.max(0, 1 - Math.hypot(v.x - lean, v.z) * 1.1));
      y *= tall;
    } else y *= size * 1.1;
    p.setXYZ(i, v.x * sx + (y > 0 ? lean * y * 0.15 : 0), y, v.z * sz);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color(), deep = new THREE.Color();
  let wr = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.count; i++) { lo = Math.min(lo, dent[i]); hi = Math.max(hi, dent[i]); }
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), up = n.getY(i), hollow = 1 - (dent[i] - lo) / (hi - lo + 1e-6);
    if (y < -0.3) c.setRGB(0.1, 0.4, 0.56).lerp(deep.setRGB(0.02, 0.14, 0.26), Math.min(1, -y / (size * 0.8)));
    else if (y < 0.45) c.setRGB(0.36, 0.72, 0.84);
    else {
      // white-blue ice, bluer down in the hollows and the flutes, snow lying on what faces the sky, and a band or two
      // of old dense blue ice through it
      c.setRGB(0.82, 0.91, 0.98).lerp(deep.setRGB(0.42, 0.7, 0.9), Math.min(1, Math.max(0, hollow - 0.35) * 1.8));
      if (Math.sin(y * 1.3 + p.getX(i) * 0.25 + size * 3) > 0.9) c.lerp(deep.setRGB(0.3, 0.6, 0.86), 0.6);
      if (up > 0.6 && y > 0.3 * tall) c.lerp(deep.setRGB(0.95, 0.97, 1.0), Math.min(1, (up - 0.6) * 4));
    }
    c.toArray(col, i * 3);
    if (Math.abs(y) < 0.6) wr = Math.max(wr, Math.hypot(p.getX(i), p.getZ(i)));
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return { geo: g, wr };
}

// Puts the icebergs in the snowy zone's sea, clear of the land and of each other, with growlers (bits the size of a
// car) in the cove under the glacier's foot. Each goes into OBSTACLES (the big ones, which a low helicopter must also
// clear) or SHOALS (the bits) so every hull, chart and spawn point keeps clear of it. Called by createWorld before the
// spawn points are chosen; the game's navigation charts are made after it.
export function placeIcebergs({ group, zone, cove, foot, terrainHeight, zoneOf, worldR, OBSTACLES, SHOALS }) {
  let seed = 4411;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const bergs = [];
  const clearOfLand = (x, z, r) => { for (let k = 0; k < 12; k++) { const a = k * 0.5236; if (terrainHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) > -3.5) return false; } return true; };
  const add = (x, z, size, tall, kind, small) => {
    const { geo, wr } = bergGeometry(rnd, size, tall, kind, small ? 2 : 4);
    const m = new THREE.Mesh(geo, BERG_MAT);
    m.position.set(x, small ? 0 : -0.35, z); m.rotation.y = rnd() * 6.283;
    m.castShadow = !small; m.receiveShadow = true;
    group.add(m);
    const B = { m, x, z, wr, top: tall * (kind === 'spire' ? 1.9 : 1.05), small, ph: rnd() * 10 };
    bergs.push(B);
    if (small) SHOALS.push({ x, z, r: wr + 0.3 });
    else OBSTACLES.push({ x, z, r: wr * 0.75, top: B.top, wr: wr + 0.5 });
    return B;
  };
  // the big ones: well out from the shore, out of the cove, far apart
  const PLAN = [[9, 9, 'table'], [7, 12, 'spire'], [6, 6, 'dome'], [5, 7, 'spire'], [4.5, 4, 'table'], [3.5, 3.5, 'dome']];
  for (const [size, tall, kind] of PLAN) {
    for (let k = 0; k < 3000; k++) {
      const a = rnd() * 6.283, d = 60 + rnd() * (zone.r + 30), x = zone.x + Math.cos(a) * d, z = zone.z + Math.sin(a) * d;
      // (and well beyond the island from the home bay, so none stands under a seaplane's long approach to a rescue there)
      if (zoneOf(x, z) !== zone || Math.hypot(x, z) > worldR - 50 || Math.hypot(x, z) < 440 || terrainHeight(x, z) > -7) continue;
      if (Math.hypot(x - cove.x, z - cove.z) < 55 || !clearOfLand(x, z, size * 1.4 + 14)) continue;
      if (bergs.some(B => Math.hypot(B.x - x, B.z - z) < 55)) continue;
      add(x, z, size, tall, kind, false);
      break;
    }
  }
  // growlers: calved off the glacier, bunched under its foot (the rest of the cove stays open water for the boats)
  for (let n = 0, k = 0; n < 7 && k < 3000; k++) {
    const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 16, x = foot.x + Math.cos(a) * d * 1.4, z = foot.z + 9 + Math.sin(a) * d * 0.6;
    if (terrainHeight(x, z) > -2.5 || !clearOfLand(x, z, 4)) continue;
    if (bergs.some(B => Math.hypot(B.x - x, B.z - z) < (B.small ? 9 : B.wr + 8))) continue;
    add(x, z, 1 + rnd() * 1.3, 0.5 + rnd() * 0.7, rnd() < 0.5 ? 'table' : 'dome', true);
    n++;
  }
  return bergs;
}

// ================================================================= the northern lights
// Curtains of green light with a fringe of pink at their tops, hung high over the far side of the snowy peaks: they
// ripple and drift, rays running along them. Drawn only at night, and seen from anywhere on the map.
const AURORA_VERT = /* glsl */`
uniform float uTime;
attribute float aAlong;
varying vec2 vUv;
void main() {
  vUv = vec2(aAlong, uv.y);
  vec3 p = position;
  // (the curtain folds and sways, slowly)
  float fold = sin(aAlong * 17.0 + uTime * 0.11) * 9.0 + sin(aAlong * 41.0 - uTime * 0.17) * 4.0;
  p.x += fold * normal.x; p.z += fold * normal.z;
  p.y += sin(aAlong * 23.0 + uTime * 0.15) * 7.0 + sin(aAlong * 7.0 - uTime * 0.07) * 10.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const AURORA_FRAG = /* glsl */`
uniform float uTime, uOpacity, uSeed;
varying vec2 vUv;
float h1(float x) { return fract(sin(x * 127.1 + uSeed) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float u = vUv.x, v = vUv.y;
  // bright and sharp along its foot, fading upward; brightening and dimming in patches that drift along it
  float patches = 0.25 + 0.75 * smoothstep(0.25, 0.8, n1(u * 9.0 - uTime * 0.05) * 0.7 + n1(u * 23.0 + uTime * 0.09) * 0.3);
  float rays = 0.55 + 0.45 * n1(u * 260.0 + uTime * 0.6) * n1(u * 90.0 - uTime * 0.25);
  float foot = smoothstep(0.0, 0.06, v) * exp(-v * 2.4) * (1.0 - smoothstep(0.55, 1.0, v + (n1(u * 37.0 + uTime * 0.2) - 0.5) * 0.3));
  float ends = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u);
  vec3 col = mix(vec3(0.15, 1.0, 0.45), vec3(0.75, 0.25, 0.85), smoothstep(0.3, 0.85, v));
  col = mix(col, vec3(0.6, 1.0, 0.7), smoothstep(0.08, 0.0, v) * 0.6);
  float a = foot * patches * rays * ends * uOpacity;
  gl_FragColor = vec4(col * a, 1.0);
}`;
function auroraCurtain(centre, radius, from, to, low, high, seed) {
  const N = 160, pos = new Float32Array((N + 1) * 2 * 3), nor = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), along = new Float32Array((N + 1) * 2), idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = from + (to - from) * t, r = radius * (1 + 0.12 * Math.sin(t * 7 + seed));
    const x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r, y0 = low + 12 * Math.sin(t * 5 + seed * 2);
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos.set([x, k ? y0 + (high - low) : y0, z], j * 3); nor.set([Math.cos(a), 0, Math.sin(a)], j * 3);
      uv.set([t, k], j * 2); along[j] = t;
    }
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

// ================================================================= the zone's life, each frame
export function createIcy({ scene, world, terrainHeight, waveHeight, fx, zone, cove, lodge }) {
  const icy = {};
  let seed = 9001;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // ---- the northern lights: two curtains, one behind the other
  const auroraTime = { value: 0 }, auroraOpacity = { value: 0 };
  const aurora = new THREE.Group();
  for (const [r, from, to, low, high, sd, k] of [[300, -2.75, -0.55, 150, 260, 1.3, 1], [380, -2.4, -0.9, 190, 300, 4.1, 0.7]]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: auroraTime, uOpacity: { get value() { return auroraOpacity.value * k; } }, uSeed: { value: sd } },
      vertexShader: AURORA_VERT, fragmentShader: AURORA_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const m = new THREE.Mesh(auroraCurtain(zone, r, from, to, low, high, sd), mat);
    m.frustumCulled = false; m.renderOrder = -5;
    aurora.add(m);
  }
  aurora.visible = false;
  scene.add(aurora);
  icy.aurora = aurora;

  // ---- penguins: a colony on the flat shore by the cove, each with a patch of its own to potter about in
  const penguins = [];
  {
    const spots = [];
    for (let k = 0; k < 4000 && spots.length < 11; k++) {
      const a = rnd() * 6.283, d = 28 + rnd() * 26, x = cove.x + Math.cos(a) * d, z = cove.z + Math.sin(a) * d, y = terrainHeight(x, z);
      if (y < 0.5 || y > 3.2 || lodge.ice(x, z) > 0.05 || spots.some(s => Math.hypot(s.x - x, s.z - z) < 2.2)) continue;
      if ([0, 1.57, 3.14, 4.71].some(b => Math.abs(terrainHeight(x + Math.cos(b) * 1.5, z + Math.sin(b) * 1.5) - y) > 0.5)) continue;
      // (they keep together: after the first, each comes near one already there)
      if (spots.length && Math.min(...spots.map(s => Math.hypot(s.x - x, s.z - z))) > 7) continue;
      spots.push({ x, z });
    }
    for (const s of spots) {
      const m = model('World_Penguin'); m.rotation.order = 'YXZ'; m.userData.farHide = 240;
      const sc = 1.05 + rnd() * 0.35;
      m.scale.setScalar(sc);
      const P0 = rnd() * 6.283;
      m.position.set(s.x, terrainHeight(s.x, s.z), s.z); m.rotation.set(0, P0, 0);
      scene.add(m);
      penguins.push({ m, home: s, x: s.x, z: s.z, y: terrainHeight(s.x, s.z), yaw: P0, state: 'stand', t: rnd() * 4, ph: rnd() * 10, sc, tx: s.x, tz: s.z, swim: null });
    }
  }
  // where a penguin standing at (x, z) would reach the sea going straight downhill (or null)
  const toSea = (x, z) => {
    let bx = 0, bz = 0, best = 1e9;
    for (let k = 0; k < 16; k++) { const a = k * 0.3927, h = terrainHeight(x + Math.cos(a) * 3, z + Math.sin(a) * 3); if (h < best) { best = h; bx = Math.cos(a); bz = Math.sin(a); } }
    for (let d = 1; d < 30; d++) if (terrainHeight(x + bx * d, z + bz * d) < -0.4) return { x: x + bx * (d + 1.5), z: z + bz * (d + 1.5), dx: bx, dz: bz };
    return null;
  };
  let slideCd = 6;
  function updatePenguin(P, dt, t, players) {
    P.t -= dt;
    const turnTo = (want, k) => { let d = want - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); P.yaw += d * Math.min(1, dt * k); };
    let pitch = 0, roll = 0, lift = 0;
    if (P.state === 'stand') {
      // (looking about, a little shuffle now and then; and when somebody comes close, turning to watch them and
      // hopping up and down)
      roll = Math.sin(t * 0.8 + P.ph) * 0.03;
      let near = null, nd = 32;
      for (const q of players) { const d = Math.hypot(q.pos.x - P.x, q.pos.z - P.z); if (d < nd) { nd = d; near = q; } }
      if (near) { turnTo(Math.atan2(near.pos.x - P.x, near.pos.z - P.z), 3); lift = Math.max(0, Math.sin(t * 7 + P.ph * 3)) * 0.18; P.t = Math.max(P.t, 1); }
      if (P.t <= 0) {
        if (slideCd <= 0 && rnd() < 0.35) { const s = toSea(P.x, P.z); if (s) { P.swim = s; P.state = 'slide'; P.st = 0; slideCd = 9 + rnd() * 10; return; } }
        const a = rnd() * 6.283, d = rnd() * 4;
        P.tx = P.home.x + Math.cos(a) * d; P.tz = P.home.z + Math.sin(a) * d;
        if (terrainHeight(P.tx, P.tz) > 0.4) { P.state = 'walk'; P.t = 8; } else P.t = 2 + rnd() * 4;
      }
    } else if (P.state === 'walk') {
      // the waddle: rocking from foot to foot, a little bob with each step
      const dx = P.tx - P.x, dz = P.tz - P.z, d = Math.hypot(dx, dz);
      turnTo(Math.atan2(dx, dz), 4);
      const sp = 0.55 * P.sc;
      if (d > 0.2 && P.t > 0) { P.x += Math.sin(P.yaw) * sp * dt; P.z += Math.cos(P.yaw) * sp * dt; }
      else { P.state = 'stand'; P.t = 2 + rnd() * 6; }
      roll = Math.sin(t * 9 + P.ph) * 0.16; lift = Math.abs(Math.sin(t * 9 + P.ph)) * 0.05;
    } else if (P.state === 'slide') {
      // a hop forward onto its tummy and away downhill, flippers back, into the sea
      P.st += dt;
      turnTo(Math.atan2(P.swim.dx, P.swim.dz), 6);
      const down = Math.min(1, P.st / 0.35);
      pitch = 1.35 * down; lift = Math.sin(down * Math.PI) * 0.35;
      if (P.st > 0.35) { P.x += P.swim.dx * 3.2 * dt; P.z += P.swim.dz * 3.2 * dt; }
      if (terrainHeight(P.x, P.z) < -0.35) {
        fx.splash(P.x, 0, P.z, 10, 0.4);
        P.state = 'swim'; P.t = 10 + rnd() * 8; P.sa = Math.atan2(P.z - P.home.z, P.x - P.home.x); P.sr = Math.hypot(P.x - P.home.x, P.z - P.home.z) + 4;
      }
    } else if (P.state === 'swim') {
      // swimming out round in a curve, leaping clear of the water now and then, then home
      const back = P.t <= 0;
      if (!back) {
        P.sa += dt * 0.32 / Math.max(1, P.sr / 10);
        P.tx = P.home.x + Math.cos(P.sa) * P.sr; P.tz = P.home.z + Math.sin(P.sa) * P.sr;
        if (terrainHeight(P.tx, P.tz) > -0.8) P.sr += dt * 3;
      } else {
        const s = P.swim; P.tx = s.x - s.dx * 4; P.tz = s.z - s.dz * 4;
      }
      const dx = P.tx - P.x, dz = P.tz - P.z;
      turnTo(Math.atan2(dx, dz), 2.5);
      P.x += Math.sin(P.yaw) * 2.6 * dt; P.z += Math.cos(P.yaw) * 2.6 * dt;
      const leap = Math.max(0, Math.sin(t * 1.3 + P.ph)) ** 8;
      pitch = 1.5 - leap * 0.5; lift = leap * 0.9;
      const ground = terrainHeight(P.x, P.z);
      if (back && ground > -0.25) { P.state = 'stand'; P.t = 3 + rnd() * 5; fx.splash(P.x, 0, P.z, 6, 0.3); }
      P.y = Math.max(ground, waveHeight(P.x, P.z, t) - 0.22 + lift);
      P.m.position.set(P.x, P.y, P.z); P.m.rotation.set(pitch, P.yaw, roll);
      return;
    }
    P.y = terrainHeight(P.x, P.z);
    P.m.position.set(P.x, P.y + lift - (pitch > 1 ? 0.12 : 0), P.z);
    P.m.rotation.set(pitch, P.yaw, roll);
  }

  // ---- smoke from the lodge's chimney
  let smokeT = 0;
  icy.update = function (dt, t, players, bergs) {
    auroraTime.value = t;
    const night = world.preset.night, near = (x, z, r) => players.some(p => (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 < r * r);
    auroraOpacity.value = night * (0.75 + 0.25 * Math.sin(t * 0.13)) * (1 - 0.7 * (world.weatherNow || 0));
    aurora.visible = auroraOpacity.value > 0.01;
    if (!near(zone.x, zone.z, zone.r + 320)) return;
    slideCd -= dt;
    for (const P of penguins) if (P.m.visible || P.state !== 'stand') updatePenguin(P, dt, t, players);
    // the bits of ice ride the swell
    for (const B of bergs) if (B.small) {
      const h = waveHeight(B.x, B.z, t);
      B.m.position.y = h - 0.1; B.m.rotation.x = Math.sin(t * 0.9 + B.ph) * 0.05; B.m.rotation.z = Math.cos(t * 0.7 + B.ph) * 0.05;
    }
    if (lodge.chimney && near(lodge.chimney.x, lodge.chimney.z, 300)) {
      smokeT -= dt;
      while (smokeT <= 0) {
        smokeT += 0.1;
        const c = lodge.chimney, k = 0.7 * (1 - 0.65 * night);
        fx.emit(c.x + (Math.random() - 0.5) * 0.3, c.y + 0.3, c.z + (Math.random() - 0.5) * 0.3, 0.25 + (Math.random() - 0.5) * 0.4, 1.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4,
          k, k, k * 1.03, 0.55, 1.8 + Math.random() * 1.2, 3.6 + Math.random(), -0.05, 0.4);
      }
    }
  };
  icy.penguins = penguins;
  return icy;
}

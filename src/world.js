import * as THREE from 'three';
import { geo, look, model, modelInfo, groundTex } from './assets.js';

// ---------------------------------------------------------------- helpers
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm(x, z) {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 9.2, z * 2.1 - 4.7) * 0.3 + vnoise(x * 4.3 - 2.1, z * 4.3 + 7.9) * 0.15;
}
// sharp crests: what makes a hill read as a mountain
function ridged(x, z) {
  let total = 0, weight = 0.55, scale = 1;
  for (let i = 0; i < 3; i++) { total += weight * (1 - Math.abs(2 * vnoise(x * scale, z * scale) - 1)); weight *= 0.5; scale *= 2.1; }
  return total;
}
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---------------------------------------------------------------- layout
// cameras that see the scene directly also see this layer; the water's mirror camera does not
export const PLANT_LAYER = 1;
// and only the water's mirror sees this one (a lighter copy of the land)
export const MIRROR_LAYER = 2;
export const WORLD_R = 330;        // soft flight boundary
export const SEA_FLOOR = -14;
export const BASE_Y = 5;           // height of the rescue base plateau
export const PAD_Y = BASE_Y + 0.3;
export const PADS = [{ x: -15, z: 12 }, { x: 15, z: 12 }];
export const STATION = { x: 0, z: -30 };
export const LIGHTHOUSE = { x: -98, z: 74 };
// a sea arch between the base and the lighthouse: tall enough to fly through, and the boat fits under it too
export const ARCH = { x: -59, z: 54, yaw: 3.97 };
// the fishermen's huts on stilts round the atoll's lagoon
// (each faces the middle of the lagoon; porch is where someone waits on its front step, floor its height)
export const HUTS = [0.4, 1.9, 3.3, 4.6].map(a => {
  const x = -165 + Math.cos(a) * 15, z = 200 + Math.sin(a) * 15, yaw = Math.atan2(x + 165, z - 200);
  return { x, z, yaw, porch: { x: x - Math.sin(yaw) * 3.4, z: z - Math.cos(yaw) * 3.4 }, floor: 4.7 };
});

// Each island is a lobe of land: r is the mean radius of its shore, h how high its hills stand, coast how far
// headlands and coves wander from a circle. flats are levelled places (a site names one a helicopter can land on),
// dents are hollows (a lagoon), cliff the height of a sea cliff and cliffDir the side it faces.
const lobe = (x, z, r, h, o = {}) => ({ x, z, r, h, coast: 0.36, pow: 1.3, forest: 0.8, palms: 0.22, ...o, sx: x * 0.013 + 3.1, sz: z * 0.013 - 1.7 });
export const ISLANDS = [
  lobe(0, -12, 56, 6.5, { coast: 0.1, forest: 0, flats: [{ x: 0, z: -8, r: 40, y: BASE_Y }] }),      // rescue base
  lobe(8, -84, 44, 17, { forest: 0.95 }),                                                              // the wooded hill behind it
  lobe(LIGHTHOUSE.x, LIGHTHOUSE.z, 30, 8, { coast: 0.18, cliff: 7.2, forest: 0.12, palms: 0.05, flats: [{ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 9, y: 7.5 }] }),
  lobe(175, 175, 92, 22, { ridge: 50, pow: 2.0, cliff: 12, cliffDir: [-0.6, -0.8], forest: 0.85,       // the mountain
    flats: [{ x: 146, z: 150, r: 10, site: 'Mountain ledge', pad: true }, { x: 205, z: 118, r: 10, site: 'Cove beach' }] }),
  lobe(-200, -130, 82, 20, { forest: 1,                                                                // the forest, with a lagoon and a meadow
    dents: [{ x: -168, z: -100, r: 20, y: -3.5 }], flats: [{ x: -214, z: -134, r: 11, site: 'Forest meadow', pad: true }] }),
  lobe(210, -150, 44, 19, { forest: 0.7, cliff: 8, cliffDir: [1, -0.2] }),                             // twin hills joined by a sand spit
  lobe(160, -196, 34, 12, { forest: 0.6, flats: [{ x: 186, z: -176, r: 9, site: 'Sand spit' }] }),
  lobe(-165, 200, 58, 2.6, { coast: 0.14, forest: 0, palms: 0.4, dents: [{ x: -165, z: 200, r: 25, y: -4 }, { x: -142, z: 172, r: 7, y: -4 }, { x: -133, z: 161, r: 7, y: -4 }] }),      // the atoll, with a channel through its reef
  lobe(30, -255, 46, 8, { coast: 0.2, cliff: 15, forest: 0.35, flats: [{ x: 30, z: -255, r: 10, site: 'Table rock', pad: true }] }),      // the mesa
  lobe(-285, 45, 40, 14, { ridge: 22, pow: 1.5, cliff: 11, forest: 0.3, palms: 0.05, flats: [{ x: -268, z: 62, r: 9, site: 'Crag shelf' }] }),
  lobe(290, 20, 42, 2.4, { coast: 0.3, forest: 0, palms: 0.45, flats: [{ x: 290, z: 20, r: 9, site: 'Palm cay' }] }),
];
// tiny sandbars where friends get stranded
export const ISLETS = [
  { x: 95, z: 60 }, { x: -70, z: -95 }, { x: 110, z: -70 }, { x: -20, z: 135 },
  { x: 60, z: 250 }, { x: -120, z: -260 }, { x: 250, z: -40 }, { x: -230, z: 120 },
  { x: 100, z: -262 }, { x: -110, z: 5 },
];
for (const I of ISLANDS) I.reach = I.r * (1 + I.coast) * 1.34;
for (const s of ISLETS) ISLANDS.push({ x: s.x, z: s.z, r: 17, h: 3.2, islet: true, reach: 17, forest: 0, palms: 0.2 });

export const OBSTACLES = [
  { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 6.5, top: 42 },
  { x: STATION.x, z: STATION.z, r: 15, top: 24 },
  // the arch's two feet; and, for the easy helicopter only, the whole arch, which it flies round rather than through
  ...[-1, 1].map(k => ({ x: ARCH.x + k * 12.5 * Math.cos(ARCH.yaw), z: ARCH.z + k * 12.5 * Math.sin(ARCH.yaw), r: 6, top: 24 })),
  { x: ARCH.x, z: ARCH.z, r: 19, top: 25, easy: true },
  ...HUTS.map(h => ({ x: h.x, z: h.z, r: 6, top: 13 })),
];

function islandHeight(I, x, z, natural) {
  const dx = x - I.x, dz = z - I.z, d2 = dx * dx + dz * dz;
  if (d2 >= I.reach * I.reach) return SEA_FLOOR;
  const dist = Math.sqrt(d2);
  if (I.islet) { const d = dist / I.r, s = 1 - d * d * (3 - 2 * d); return SEA_FLOOR + (I.h - SEA_FLOOR) * Math.pow(s, 0.8); }
  const wob = (fbm(x * 0.017 + I.sx, z * 0.017 + I.sz) - 0.5) * 2 * I.coast;
  const d = dist / (I.r * (1 + wob));
  let h;
  if (d >= 1) h = SEA_FLOOR * Math.pow(Math.min((d - 1) / 0.3, 1), 1.5);                    // a shelf of shallows, then deep
  else {
    const u = 1 - d;
    const rise = Math.pow(smooth((u - 0.1) / 0.9), I.pow);
    let hill = I.h * rise * (0.65 + 0.7 * fbm(x * 0.02 + I.sz, z * 0.02 + I.sx));
    if (I.ridge) hill += I.ridge * Math.pow(rise, 1.5) * Math.pow(ridged(x * 0.015 + I.sx, z * 0.015 + I.sz), 1.7) * 1.5;
    h = 2.2 * smooth(u / 0.16) + hill + (fbm(x * 0.09, z * 0.09) - 0.5) * 1.4 * smooth(u / 0.25);
    if (I.cliff) {
      // a sea cliff: the ground climbs to the cliff top almost at once, then runs level until the hill behind catches up
      const face = I.cliffDir ? smooth(((dx * I.cliffDir[0] + dz * I.cliffDir[1]) / dist + 0.25) / 0.6) : 1;
      const t = (h - 2.4) / (I.cliff - 2.4);
      if (t > 0) h = Math.max(h, 2.4 + (I.cliff - 2.4) * face * smooth(t / 0.26));
    }
  }
  if (I.dents) for (const D of I.dents) { const w = 1 - smooth((Math.hypot(x - D.x, z - D.z) - D.r) / 14); if (w > 0) h += (D.y - h) * w; }
  if (I.flats && !natural) for (const F of I.flats) { const w = 1 - smooth((Math.hypot(x - F.x, z - F.z) - F.r) / 9); if (w > 0) h += (F.y - h) * w; }
  return h;
}
// places a helicopter can set down away from the base: { x, z, y, r, name, pad }
export const SITES = [];
for (const I of ISLANDS) for (const F of I.flats || []) {
  if (F.y === undefined) F.y = Math.round(islandHeight(I, F.x, F.z, true) * 2) / 2;
  if (F.site) SITES.push({ x: F.x, z: F.z, y: F.y, r: F.r, name: F.site, pad: !!F.pad });
}
export function terrainHeight(x, z) {
  let h = SEA_FLOOR;
  for (const I of ISLANDS) { const ih = islandHeight(I, x, z); if (ih > h) h = ih; }
  return h;
}

// how far the treetops stand above the ground, so helicopters cruise over the forest and not through it
const CAN_N = 160, CAN_SPAN = 800;
const canopy = new Float32Array(CAN_N * CAN_N);
export function canopyAt(x, z) {
  const i = Math.floor((x / CAN_SPAN + 0.5) * CAN_N), j = Math.floor((z / CAN_SPAN + 0.5) * CAN_N);
  return i < 0 || j < 0 || i >= CAN_N || j >= CAN_N ? 0 : canopy[j * CAN_N + i];
}
function raiseCanopy(x, z, radius, top) {
  const cell = CAN_SPAN / CAN_N, n = Math.ceil(radius / cell);
  const ci = Math.floor((x / CAN_SPAN + 0.5) * CAN_N), cj = Math.floor((z / CAN_SPAN + 0.5) * CAN_N);
  for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
    if (i < 0 || j < 0 || i >= CAN_N || j >= CAN_N) continue;
    if (canopy[j * CAN_N + i] < top) canopy[j * CAN_N + i] = top;
  }
}

// ---------------------------------------------------------------- ocean swell (shared by shader + gameplay)
const G = 9.81;
export const WAVES = [
  { dx: 0.92, dz: 0.39, len: 78, amp: 0.5 },
  { dx: -0.45, dz: 0.89, len: 47, amp: 0.28 },
  { dx: 0.64, dz: -0.77, len: 29, amp: 0.16 },
  { dx: 0.12, dz: 0.99, len: 17, amp: 0.085 },
  { dx: -0.83, dz: -0.56, len: 10.5, amp: 0.045 },
].map(w => {
  const k = (Math.PI * 2) / w.len;
  return { ...w, k, om: Math.sqrt(G * k) };
});
export const sea = { swell: 1 };       // how big the swell is running: 1 is a fair day
export function waveHeight(x, z, t) {
  let y = 0;
  for (const w of WAVES) y += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.om * t);
  return y * sea.swell;
}

// ---------------------------------------------------------------- time-of-day presets (linear colour)
function dirFrom(elevDeg, azimDeg) {
  const e = THREE.MathUtils.degToRad(elevDeg), a = THREE.MathUtils.degToRad(azimDeg);
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).normalize();
}
const C = (r, g, b) => new THREE.Color(r, g, b);
export const PRESETS = [
  {
    name: 'Sunny Day', icon: '☀️', night: 0,
    sunDir: dirFrom(46, 140), sunColor: C(1.0, 0.94, 0.82), sunLight: 3.4, sunDisc: 30, glow: 0.6,
    zenith: C(0.035, 0.16, 0.66), horizon: C(0.46, 0.68, 0.95), hemiSky: C(0.5, 0.68, 1.0), hemiGround: C(0.3, 0.3, 0.22), hemi: 0.38,
    fog: C(0.47, 0.67, 0.93), fogDensity: 0.00075, env: 0.9, stars: 0, exposure: 0.92,
    deep: C(0.003, 0.05, 0.16), shallow: C(0.02, 0.46, 0.44), spec: 22, bloom: 0.2,
    cloud: 0.44, cloudLit: C(1.0, 0.98, 0.95), cloudDark: C(0.52, 0.6, 0.74),
  },
  {
    name: 'Golden Hour', icon: '🌅', night: 0.25,
    sunDir: dirFrom(8.5, 205), sunColor: C(1.0, 0.5, 0.17), sunLight: 3.6, sunDisc: 26, glow: 1.6,
    zenith: C(0.1, 0.16, 0.44), horizon: C(1.0, 0.5, 0.24), hemiSky: C(0.55, 0.45, 0.75), hemiGround: C(0.4, 0.24, 0.16), hemi: 0.4,
    fog: C(0.86, 0.47, 0.3), fogDensity: 0.0011, env: 1.0, stars: 0.15, exposure: 1.0,
    deep: C(0.012, 0.04, 0.12), shallow: C(0.1, 0.34, 0.38), spec: 30, bloom: 0.36,
    cloud: 0.5, cloudLit: C(1.3, 0.62, 0.3), cloudDark: C(0.3, 0.22, 0.38),
  },
  {
    name: 'Starry Night', icon: '🌙', night: 1,
    sunDir: dirFrom(38, 320), sunColor: C(0.55, 0.68, 1.0), sunLight: 0.75, sunDisc: 5, glow: 0.35,
    zenith: C(0.003, 0.006, 0.028), horizon: C(0.022, 0.045, 0.11), hemiSky: C(0.16, 0.22, 0.48), hemiGround: C(0.03, 0.04, 0.07), hemi: 0.5,
    fog: C(0.018, 0.035, 0.085), fogDensity: 0.0012, env: 0.5, stars: 1, exposure: 1.25,
    deep: C(0.002, 0.012, 0.04), shallow: C(0.01, 0.1, 0.14), spec: 9, bloom: 0.5,
    cloud: 0.3, cloudLit: C(0.09, 0.12, 0.2), cloudDark: C(0.012, 0.018, 0.04),
  },
];

// ---------------------------------------------------------------- pictures made here
// soft tileable noise, four different layers in the four channels
function noiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4), rnd = mulberry(77);
  for (let c = 0; c < 4; c++) {
    const octaves = [4, 8, 16, 32, 64].map(n => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd(); return { n, g }; });
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5;
      for (const { n, g } of octaves) {
        const fx = (x / size) * n, fy = (y / size) * n, ix = Math.floor(fx), iy = Math.floor(fy);
        const ux = smooth(fx - ix), uy = smooth(fy - iy), x1 = (ix + 1) % n, y1 = (iy + 1) % n;
        v += amp * (g[iy * n + ix] * (1 - ux) * (1 - uy) + g[iy * n + x1] * ux * (1 - uy) + g[y1 * n + ix] * (1 - ux) * uy + g[y1 * n + x1] * ux * uy);
        amp *= 0.5;
      }
      data[(y * size + x) * 4 + c] = Math.round(THREE.MathUtils.clamp(v / 0.97, 0, 1) * 255);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
// wind ripples: a patch of water built from many small waves running every which way. R, G = its slope, B = its height
function rippleTexture(size = 256) {
  const rnd = mulberry(1234), waves = [];
  for (let i = 0; i < 46; i++) {
    const kx = Math.round((rnd() - 0.5) * 44), ky = Math.round((rnd() - 0.5) * 44), k = Math.hypot(kx, ky);
    if (k < 2.5) { i--; continue; }
    waves.push({ kx, ky, a: Math.pow(k, -1.25), ph: rnd() * 6.283 });
  }
  const sx = new Float32Array(size * size), sy = new Float32Array(size * size), hh = new Float32Array(size * size);
  let ms = 0, mh = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0, dy = 0, h = 0;
    for (const w of waves) { const p = (6.283185 * (w.kx * x + w.ky * y)) / size + w.ph, s = Math.sin(p); h += w.a * Math.cos(p); dx -= w.a * w.kx * s; dy -= w.a * w.ky * s; }
    const i = y * size + x; sx[i] = dx; sy[i] = dy; hh[i] = h;
    ms = Math.max(ms, Math.abs(dx), Math.abs(dy)); mh = Math.max(mh, Math.abs(h));
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { data[i * 4] = Math.round((sx[i] / ms * 0.5 + 0.5) * 255); data[i * 4 + 1] = Math.round((sy[i] / ms * 0.5 + 0.5) * 255); data[i * 4 + 2] = Math.round((hh[i] / mh * 0.5 + 0.5) * 255); data[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- sky
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`;
const SKY_FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uCloudLit, uCloudDark;
uniform float uSunDisc, uGlow, uStars, uTime, uCloud;
uniform sampler2D uNoise;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cloudAt(vec2 p){
  vec2 drift = vec2(uTime * 0.0016, uTime * 0.0007);
  float n = texture2D(uNoise, p * 0.05 + drift).r * 0.6 + texture2D(uNoise, p * 0.13 - drift * 1.7).g * 0.28 + texture2D(uNoise, p * 0.41 + drift * 3.0).b * 0.12;
  return clamp((n - 0.5) * 2.6 + 0.5, 0.0, 1.0);
}
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.55, min(-d.y * 4.0, 1.0));
  float s = max(dot(d, uSunDir), 0.0);
  if (uStars > 0.0) {
    vec3 p = d * 210.0;
    vec3 c = floor(p);
    float r = hash(c);
    float tw = 0.7 + 0.3 * sin(uTime * 2.0 + r * 80.0);
    float st = step(0.9945, r) * smoothstep(0.42, 0.0, length(fract(p) - 0.5)) * tw;
    col += vec3(1.0, 0.95, 0.85) * st * uStars * smoothstep(0.0, 0.25, d.y) * 2.2;
  }
  vec3 sun = uSunColor * (smoothstep(0.99955, 0.99975, s) * uSunDisc + pow(s, 180.0) * 0.9 * uGlow + pow(s, 12.0) * 0.22 * uGlow);
  // a deck of fair-weather cumulus: a flat layer seen in perspective, lit from the sun's side and grey underneath
  if (d.y > 0.0 && uCloud > 0.0) {
    vec2 p = d.xz / (d.y + 0.09);
    float n = cloudAt(p);
    float lo = 1.0 - uCloud * 0.9;
    float cover = smoothstep(lo, lo + 0.16, n);
    float toward = cloudAt(p + normalize(uSunDir.xz + 1e-4) * 0.22);
    float lit = clamp(0.55 + (n - toward) * 3.2 + (n - lo) * -1.2, 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, lit) + uSunColor * pow(s, 8.0) * 0.35 * (1.0 - cover * 0.5);
    float far = smoothstep(0.0, 0.11, d.y);
    sun *= 1.0 - cover * 0.85;
    col = mix(col, mix(uHorizon, cc, far * 0.75 + 0.25), cover * far);
  }
  gl_FragColor = vec4(col + sun, 1.0);
}`;

// ---------------------------------------------------------------- water
const NW = WAVES.length;
const WATER_VERT = /* glsl */`
uniform float uTime, uSwell;
uniform vec4 uWaves[${NW}];   // dir.xy, k, amp
uniform float uOmega[${NW}];
varying vec3 vWorld;
varying vec3 vBigN;
varying float vCrest;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float fade = (1.0 - smoothstep(500.0, 1400.0, length(wp.xz))) * uSwell;
  float y = 0.0; vec2 dd = vec2(0.0);
  for (int i = 0; i < ${NW}; i++) {
    float ph = uWaves[i].z * dot(uWaves[i].xy, wp.xz) - uOmega[i] * uTime;
    y += uWaves[i].w * sin(ph);
    dd += uWaves[i].xy * (uWaves[i].z * uWaves[i].w * cos(ph));
  }
  wp.y += y * fade;
  vCrest = y * fade;
  vBigN = vec3(-dd.x * fade, 1.0, -dd.y * fade);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uDeep, uShallow, uFogColor;
uniform float uFogDensity, uSpec, uNight, uSwell;
uniform sampler2D uHeightTex, uRipple;
uniform vec4 uHeli[2];     // xyz world position, w strength
uniform vec4 uLamp[2];     // searchlight spot on water: xz, radius, strength
uniform sampler2D uReflTex;
uniform mat4 uReflMat;
uniform float uReflOn;
varying vec3 vWorld;
varying vec3 vBigN;
varying float vCrest;
void main(){
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vWorld.xz;

  // wind ripples: three sheets of the same patch at different sizes, sliding different ways, so no pattern repeats
  vec3 r1 = texture2D(uRipple, p / 23.0 + uTime * vec2(0.021, 0.013)).xyz;
  vec3 r2 = texture2D(uRipple, vec2(p.y, -p.x) / 8.3 + uTime * vec2(-0.034, 0.027)).xyz;
  vec3 r3 = texture2D(uRipple, (p + p.yx * 0.31) / 61.0 - uTime * vec2(0.008, 0.011)).xyz;
  vec2 dn = (r1.xy - 0.5) * 0.5 + vec2(r2.y - 0.5, -(r2.x - 0.5)) * 0.34 / (1.0 + dist * 0.02) + (r3.xy - 0.5) * 0.42;
  dn *= (0.55 + 0.45 * uSwell) / (1.0 + dist * 0.0022);
  float chop = r1.z * 0.5 + r2.z * 0.3 + r3.z * 0.2;

  // rotor wash rings
  float wash = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 dv = p - uHeli[i].xz;
    float d = length(dv);
    float s = uHeli[i].w * exp(-d * 0.085);
    dn += (dv / max(d, 0.01)) * sin(d * 1.5 - uTime * 11.0) * s * 0.55;
    wash += s * smoothstep(13.0, 2.0, d) * (0.3 + 0.9 * texture2D(uRipple, p / 9.0 - (dv / max(d, 0.01)) * uTime * 0.5).z);
  }

  vec3 N = normalize(vBigN + vec3(-dn.x, 0.0, -dn.y));
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);

  vec3 sky = mix(uHorizon, uZenith, pow(R.y, 0.5));
  if (uReflOn > 0.5) {
    // planar mirror of the real scene, wobbled by the wave normal
    vec4 rc = uReflMat * vec4(vWorld.x, 0.0, vWorld.z, 1.0);
    vec2 ruv = rc.xy / rc.w + N.xz * vec2(0.09, 0.2) / (1.0 + dist * 0.004);
    vec3 mir = min(texture2D(uReflTex, clamp(ruv, 0.002, 0.998)).rgb, vec3(3.0));
    sky = mix(sky, mir, 0.85);
  }
  float sd = max(dot(R, uSunDir), 0.0);
  vec3 sun = uSunColor * (pow(sd, 520.0) * uSpec + pow(sd, 48.0) * uSpec * 0.03);

  float th = texture2D(uHeightTex, p / 900.0 + 0.5).r * 30.0 - 14.0;
  float depth = vWorld.y - th;
  // clear water over sand is turquoise only where it is shallow; a few metres down the open sea takes over
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 7.5, depth));
  float light = 0.25 + 0.75 * max(dot(N, uSunDir), 0.0);
  body *= mix(light, 1.0, 0.35) * (1.0 - 0.55 * uNight);
  body += uShallow * 0.1 * smoothstep(0.5, 0.85, chop) * (1.0 - 0.7 * uNight) / (1.0 + dist * 0.01);   // light through the ripples' crests

  vec3 col = mix(body, sky + sun, fres);

  // searchlight pools on the water
  for (int i = 0; i < 2; i++) {
    float d = length(p - uLamp[i].xy);
    float s = smoothstep(uLamp[i].z, uLamp[i].z * 0.35, d) * uLamp[i].w;
    col += (uShallow * 1.6 + vec3(0.35, 0.4, 0.4)) * s * (0.6 + 0.6 * chop);
  }

  // foam: surf sliding up the beach in bands, lace on the steepest crests, and the rotor's churn
  float lace = texture2D(uRipple, p / 5.7 + uTime * vec2(0.02, -0.015)).z * 0.6 + texture2D(uRipple, p / 13.0 - uTime * vec2(0.012, 0.02)).z * 0.4;
  float surf = sin(depth * 2.3 + uTime * 1.25 + lace * 5.0) * 0.5 + 0.5;
  float shore = smoothstep(1.9, 0.0, depth) * smoothstep(0.3, 0.62, lace + surf * 0.28 - depth * 0.1);
  shore = max(shore, smoothstep(0.35, 0.0, depth));
  float crest = smoothstep(0.55, 1.1, vCrest / max(uSwell, 0.4)) * smoothstep(0.55, 0.75, lace) * 0.4 * max(uSwell - 0.4, 0.0) / (1.0 + dist * 0.006);
  float foam = clamp(shore + crest + wash * 0.85, 0.0, 1.0);
  vec3 foamCol = mix(vec3(0.95), uHorizon * 0.8 + 0.25, 0.25) * (1.0 - 0.72 * uNight) * (0.75 + 0.25 * light);
  col = mix(col, foamCol, foam);

  float alpha = clamp(smoothstep(-0.05, 1.3, depth) * 0.97 + foam, 0.0, 1.0);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, alpha);
}`;

// ---------------------------------------------------------------- ground
// One material for the land and (with rocky set) for every boulder on it: scanned sand, mossy turf and rock, laid by
// height and steepness in world space, so a rock half buried in the beach takes the beach's wet line and the hill's moss.
function groundMaterial(noiseTex, rocky) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const uniforms = {
    tSandC: { value: groundTex('sand', 'c') }, tSandN: { value: groundTex('sand', 'n') },
    tMossC: { value: groundTex('moss', 'c') }, tMossN: { value: groundTex('moss', 'n') },
    tRockC: { value: groundTex('rock', 'c') }, tRockN: { value: groundTex('rock', 'n') }, tNoise: { value: noiseTex },
  };
  mat.defines = rocky ? { ROCKY: 1 } : {};
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTP; varying vec3 vTN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 tw = vec4(transformed, 1.0); vec3 tn = objectNormal;
        #ifdef USE_INSTANCING
          tw = instanceMatrix * tw; tn = mat3(instanceMatrix) * tn;
        #endif
        vTP = (modelMatrix * tw).xyz; vTN = normalize(mat3(modelMatrix) * tn);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tSandC, tSandN, tMossC, tMossN, tRockC, tRockN, tNoise;
        varying vec3 vTP; varying vec3 vTN;
        vec3 twice(sampler2D t, vec2 uv, float n) { return mix(texture2D(t, uv).rgb, texture2D(t, uv * 0.37 + vec2(0.31, 0.17)).rgb, n); }`)
      .replace('#include <map_fragment>', `
        vec3 gn = normalize(vTN);
        vec2 gp = vTP.xz;
        float n1 = texture2D(tNoise, gp / 290.0).r, n2 = texture2D(tNoise, gp / 41.0).g, n3 = texture2D(tNoise, gp / 9.0).b;
        float steep = 1.0 - gn.y;
        vec3 bw = pow(abs(gn), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
        vec3 rockC = texture2D(tRockC, vTP.zy / 13.0).rgb * bw.x + twice(tRockC, gp / 13.0, n2).rgb * bw.y + texture2D(tRockC, vTP.xy / 13.0).rgb * bw.z;
        rockC = mix(rockC, vec3(dot(rockC, vec3(0.3, 0.5, 0.2))), 0.45) * vec3(1.45, 1.4, 1.36);
        vec3 sandC = twice(tSandC, gp / 22.0, n2) * vec3(1.62, 1.44, 1.12);
        vec3 grass = twice(tMossC, gp / 12.0, n2) * mix(vec3(0.42, 1.0, 0.3), vec3(0.8, 1.08, 0.4), smoothstep(0.3, 0.75, n1)) * 1.35;
        vec3 nm;
        #ifdef ROCKY
          float wMoss = smoothstep(0.72, 0.96, gn.y) * smoothstep(0.35, 0.6, n2) * smoothstep(2.0, 4.0, vTP.y);
          vec3 col = mix(rockC * 1.25, grass, wMoss * 0.8);
          nm = texture2D(tRockN, gp / 13.0).xyz * 2.0 - 1.0;
        #else
          float wRock = max(smoothstep(0.14, 0.3, steep + (n2 - 0.5) * 0.1), smoothstep(34.0, 46.0, vTP.y + n2 * 9.0));
          float wSand = 1.0 - smoothstep(1.5, 2.9, vTP.y + (n2 - 0.5) * 1.6 + (n3 - 0.5) * 0.5);
          wRock *= 1.0 - wSand * smoothstep(0.5, 0.2, steep);
          vec3 col = mix(mix(grass, sandC, wSand), rockC * 1.25, wRock);
          nm = mix(mix(texture2D(tMossN, gp / 12.0).xyz, texture2D(tSandN, gp / 22.0).xyz, wSand), texture2D(tRockN, gp / 13.0).xyz, wRock) * 2.0 - 1.0;
        #endif
        float wet = 1.0 - smoothstep(-0.15, 0.75, vTP.y + (n3 - 0.5) * 0.3);
        col *= mix(1.0, 0.5, wet) * (0.82 + 0.36 * n1);
        diffuseColor.rgb = col;
        vec3 groundN = normalize(gn + vec3(nm.x, 0.0, nm.y) * 0.9 * gn.y);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.93, 0.35, wet);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(groundN, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => 'ground' + (rocky ? 1 : 0);
  return mat;
}

// A grid made by PlaneGeometry, cut into tiles x tiles meshes that share its vertices, so that a view (and the sun's
// shadow box) only draws the tiles it can see. pad grows each tile's bounds for vertices a shader moves up or down.
function tiled(geo, segs, tiles, material, pad, setup) {
  const group = new THREE.Group(), ts = segs / tiles, row = segs + 1, p = geo.attributes.position.array, v = new THREE.Vector3();
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const idx = new Uint32Array(ts * ts * 6), box = new THREE.Box3();
    let k = 0;
    for (let iy = ty * ts; iy < (ty + 1) * ts; iy++) for (let ix = tx * ts; ix < (tx + 1) * ts; ix++) {
      const a = ix + row * iy, b = a + row, c = b + 1, d = a + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    for (let iy = ty * ts; iy <= (ty + 1) * ts; iy++) for (let ix = tx * ts; ix <= (tx + 1) * ts; ix++) {
      const i = (ix + row * iy) * 3; box.expandByPoint(v.set(p[i], p[i + 1], p[i + 2]));
    }
    box.min.y -= pad; box.max.y += pad;
    const g = new THREE.BufferGeometry();
    for (const name in geo.attributes) g.setAttribute(name, geo.attributes[name]);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const tile = new THREE.Mesh(g, material);
    setup(tile);
    group.add(tile);
  }
  return group;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ================================================================= build
export function createWorld(scene, renderer) {
  const rnd = mulberry(20260910);
  const world = { time: 0, preset: PRESETS[0], nightMats: [], spawn: { sea: [], stacks: [], islets: ISLETS } };
  const noiseTex = noiseTexture();

  // ---------- sky dome
  const skyUniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uSunDisc: { value: 1 }, uGlow: { value: 1 }, uStars: { value: 0 }, uTime: { value: 0 },
    uCloud: { value: 0.4 }, uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() }, uNoise: { value: noiseTex },
  };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const skyGeo = new THREE.SphereGeometry(4000, 48, 24);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // environment maps (one per preset) so shiny paint and glass reflect the sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envUniforms = THREE.UniformsUtils.clone(skyUniforms);
  envUniforms.uNoise.value = noiseTex;
  envScene.add(new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({ uniforms: envUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false })));
  const envCache = new Map();
  function envFor(p) {
    if (envCache.has(p)) return envCache.get(p);
    envUniforms.uZenith.value.copy(p.zenith); envUniforms.uHorizon.value.copy(p.horizon);
    envUniforms.uSunDir.value.copy(p.sunDir); envUniforms.uSunColor.value.copy(p.sunColor);
    envUniforms.uSunDisc.value = 0; envUniforms.uGlow.value = p.glow * 1.5; envUniforms.uStars.value = 0;
    envUniforms.uCloud.value = p.cloud; envUniforms.uCloudLit.value.copy(p.cloudLit); envUniforms.uCloudDark.value.copy(p.cloudDark);
    const rt = pmrem.fromScene(envScene, 0, 1, 9000);
    envCache.set(p, rt.texture);
    return rt.texture;
  }

  // ---------- lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.camera.layers.enable(PLANT_LAYER);
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 520;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xffffff, 0.001);
  world.sun = sun;

  // ---------- terrain
  const TSIZE = 900, TSEG = 448;
  const tgeo = new THREE.PlaneGeometry(TSIZE, TSIZE, TSEG, TSEG);
  tgeo.rotateX(-Math.PI / 2);
  const tpos = tgeo.attributes.position;
  for (let i = 0; i < tpos.count; i++) tpos.setY(i, terrainHeight(tpos.getX(i), tpos.getZ(i)));
  tgeo.computeVertexNormals();
  const groundMat = groundMaterial(noiseTex, false), rockMat = groundMaterial(noiseTex, true);
  const terrain = tiled(tgeo, TSEG, 8, groundMat, 0, tile => { tile.receiveShadow = tile.castShadow = true; tile.layers.set(PLANT_LAYER); });
  // the mirror in the water only needs the land's shape above the waterline, seen softly: a copy a tenth as dense
  const mgeo = new THREE.PlaneGeometry(TSIZE, TSIZE, 150, 150);
  mgeo.rotateX(-Math.PI / 2);
  { const mp = mgeo.attributes.position; for (let i = 0; i < mp.count; i++) mp.setY(i, terrainHeight(mp.getX(i), mp.getZ(i))); }
  mgeo.computeVertexNormals();
  const mirrorLand = tiled(mgeo, 150, 3, groundMat, 0, tile => { tile.layers.set(MIRROR_LAYER); tile.receiveShadow = true; });
  scene.add(mirrorLand);
  world.terrain = terrain;
  scene.add(terrain);

  // height map for the water shader (shallows + shore foam)
  // (read straight off the terrain's own vertices, which lie on the same grid: row j runs along x at z = j)
  const HT = TSEG + 1;
  const hdata = new Uint8Array(HT * HT);
  for (let i = 0; i < HT * HT; i++) hdata[i] = Math.round(THREE.MathUtils.clamp((tpos.getY(i) + 14) / 30, 0, 1) * 255);
  const heightTex = new THREE.DataTexture(hdata, HT, HT, THREE.RedFormat, THREE.UnsignedByteType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.unpackAlignment = 1;      // (rows of 449 bytes are not a multiple of four)
  heightTex.needsUpdate = true;

  // ---------- water (grid is dense near the middle, stretched toward the horizon)
  const wgeo = new THREE.PlaneGeometry(2, 2, 320, 320);
  wgeo.rotateX(-Math.PI / 2);
  const wpos = wgeo.attributes.position;
  for (let i = 0; i < wpos.count; i++) {
    const x = wpos.getX(i), z = wpos.getZ(i);
    wpos.setXYZ(i, Math.sign(x) * Math.pow(Math.abs(x), 2.1) * 4200, 0, Math.sign(z) * Math.pow(Math.abs(z), 2.1) * 4200);
  }
  const waterUniforms = {
    uTime: { value: 0 }, uSwell: { value: 1 },
    uWaves: { value: WAVES.map(w => new THREE.Vector4(w.dx, w.dz, w.k, w.amp)) },
    uOmega: { value: WAVES.map(w => w.om) },
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.001 }, uSpec: { value: 20 }, uNight: { value: 0 },
    uHeightTex: { value: heightTex }, uRipple: { value: rippleTexture() },
    uHeli: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uLamp: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uReflTex: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
  };
  const waterMat = new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false });
  // (tiles padded by the tallest swell, so a wave crest never pokes up out of a tile that was left undrawn)
  const water = tiled(wgeo, 320, 8, waterMat, 6, tile => { tile.renderOrder = -1; });
  scene.add(water);
  world.waterUniforms = waterUniforms; world.water = water;

  // ---------- things that stand on the ground
  const place = (name, x, z, { y, yaw = 0, scale = 1, opts } = {}) => {
    const m = model(name, opts);
    m.position.set(x, y === undefined ? terrainHeight(x, z) : y, z); m.rotation.y = yaw; m.scale.setScalar(scale);
    scene.add(m);
    return m;
  };
  const keepOut = [];      // { x, z, r }: nothing grows here
  const glow = look('Glow');
  world.nightMats.push({ mat: glow, max: 7, min: 1.0 });

  // helipads: the two at the base in the pilots' colours, and a plain one at each landing site that has one
  function helipad(x, z, y, radius, ring) {
    const tex = canvasTex(512, 512, (g, w) => {
      g.fillStyle = '#4a4e52'; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 2600; i++) { const v = 60 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(Math.random() * w, Math.random() * w, 2 + Math.random() * 3, 2 + Math.random() * 3); }
      g.strokeStyle = ring; g.lineWidth = 34; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 30, 0, 7); g.stroke();
      g.strokeStyle = '#eeeeea'; g.lineWidth = 12; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 78, 0, 7); g.stroke();
      g.fillStyle = '#eeeeea'; g.font = 'bold 250px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('H', w / 2, w / 2 + 14);
    });
    const side = new THREE.MeshStandardMaterial({ color: 0x6c6f70, roughness: 0.9 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.5, 0.6, 40), [side, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 }), side]);
    m.position.set(x, y - 0.3, z); m.receiveShadow = true;
    scene.add(m);
    keepOut.push({ x, z, r: radius + 5 });
  }
  const padCols = ['#ff6a2b', '#2f8cff'];
  PADS.forEach((pad, i) => {
    helipad(pad.x, pad.z, PAD_Y, 8.5, padCols[i]);
    const lights = place('World_PadLights', pad.x, pad.z, { y: PAD_Y + 0.02, opts: { own: ['Glow'], shadow: false } });
    const lm = lights.userData.mat('Glow');
    lm.emissive.set(padCols[i]); lm.emissiveIntensity = 2.2;
  });
  for (const s of SITES) {
    keepOut.push({ x: s.x, z: s.z, r: s.r + 2 });
    if (s.pad) helipad(s.x, s.z, s.y + 0.3, 6.5, '#ffd23c');
  }

  // the rescue base
  place('World_Station', STATION.x, STATION.z, { y: BASE_Y });
  place('World_Paddock', 0, -6.5, { y: BASE_Y });
  place('World_Windsock', 27, 4, { y: BASE_Y, yaw: 0.6 });
  place('World_Truck', -24, -15, { y: BASE_Y, yaw: 0.5 });
  place('World_Crates', 24, -17, { y: BASE_Y, yaw: -0.3 });
  place('World_Table', -27, 0, { y: BASE_Y, yaw: 0.2 });
  place('World_Jetty', 0, 36, { y: 0.35, scale: 1.2 });
  // sunshades and towels on the dry sand east of the jetty, wherever the beach turns out to be
  let beachZ = 30;
  while (beachZ < 60 && terrainHeight(20, beachZ + 5) > 1.5) beachZ++;
  place('World_Beach', 20, beachZ, { yaw: 0.4 });
  keepOut.push({ x: STATION.x, z: STATION.z, r: 25 }, { x: 0, z: -6.5, r: 16 }, { x: 0, z: 40, r: 9 }, { x: 0, z: 52, r: 9 }, { x: 20, z: beachZ, r: 7 }, { x: 0, z: 8, r: 34 });
  world.paddock = { x: 0, z: -3, r: 9 };
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1133, emissiveIntensity: 0 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), beaconMat);
  beacon.position.set(STATION.x, BASE_Y + modelInfo('World_Station').size[1] + 0.2, STATION.z); scene.add(beacon);

  // lighthouse
  const lh = new THREE.Group();
  const lhY = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
  lh.position.set(LIGHTHOUSE.x, lhY, LIGHTHOUSE.z);
  lh.add(model('World_Lighthouse'));
  // the beam is brightest at the lamp and along its middle, and thins to nothing at its far end and its edges
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float facing = abs(dot(vN, vV)) / max(length(vN) * length(vV), 1e-5); gl_FragColor = vec4(vec3(1.0, 0.91, 0.65) * uOpacity * pow(clamp(vUv.y, 0.0, 1.0), 2.2) * facing * facing, 1.0); }',
  });
  const beamGeo = new THREE.CylinderGeometry(0.6, 13, 170, 24, 1, true);
  beamGeo.rotateZ(Math.PI / 2); beamGeo.translate(85, 0, 0);
  const beams = new THREE.Group(); beams.position.y = 27.6;
  const b1 = new THREE.Mesh(beamGeo, beamMat), b2 = new THREE.Mesh(beamGeo, beamMat); b2.rotation.y = Math.PI;
  beams.add(b1, b2); beams.rotation.z = -0.045;
  const beamPivot = new THREE.Group(); lh.add(beamPivot); beamPivot.add(beams);
  scene.add(lh);
  keepOut.push({ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 8 });

  // the sea arch, and the huts in the lagoon
  { const a = model('World_Arch', { shadow: true }); a.material = rockMat; a.position.set(ARCH.x, -1.5, ARCH.z); a.rotation.y = -ARCH.yaw; scene.add(a); }
  for (const h of HUTS) { place('World_Hut', h.x, h.z, { y: 0, yaw: h.yaw, scale: 2 }); keepOut.push({ x: h.x, z: h.z, r: 9 }); }

  // a camp in the forest meadow, for whoever waits there to be fetched
  { const s = SITES.find(q => q.name === 'Forest meadow'); place('World_Camp', s.x + 13, s.z + 4, { yaw: 1.2 }); keepOut.push({ x: s.x + 13, z: s.z + 4, r: 6 }); }

  // ---------- forest, palms, scrub and rocks
  // Every plant is one of a handful of models drawn many times. Near ones are the full model, those across the bay a
  // sparser copy, and the far hills' are single soft shapes; world.cull() sorts them for each view.
  let NEAR = 105, FAR = 400;
  const dm = new THREE.Object3D();
  const species = new Map();        // model name -> [{ m: Matrix4, x, z, s }]
  const plant = (name, x, y, z, s, tilt = 0.12) => {
    dm.position.set(x, y, z); dm.rotation.set((rnd() - 0.5) * tilt, rnd() * 6.283, (rnd() - 0.5) * tilt); dm.scale.set(s, s * (0.9 + rnd() * 0.25), s); dm.updateMatrix();
    if (!species.has(name)) species.set(name, []);
    species.get(name).push({ m: dm.matrix.clone(), x, y, z, s });
  };
  const TREES = ['World_Tree3', 'World_Tree4', 'World_Tree5', 'World_Tree3', 'World_Tree4', 'World_Tree', 'World_Tree2'];
  const PALMS = ['World_Palm', 'World_Palm2', 'World_Palm3'], BUSHES = ['World_Bush', 'World_Bush2'], ROCKS = ['World_Rock', 'World_Rock2', 'World_Rock3'];
  const pick = list => list[(rnd() * list.length) | 0];
  const rocks = { World_Rock: [], World_Rock2: [], World_Rock3: [], World_Driftwood: [] };
  const rock = (name, x, y, z, s) => {
    dm.position.set(x, y, z); dm.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6.283, (rnd() - 0.5) * 0.5); dm.scale.set(s, s * (0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.4)); dm.updateMatrix();
    rocks[name].push({ m: dm.matrix.clone(), x, z, cy: y, r: s * 1.6 });
  };
  const blocked = (x, z) => keepOut.some(k => (x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r);
  for (const I of ISLANDS) {
    const cell = 5.6;
    for (let gx = I.x - I.reach; gx < I.x + I.reach; gx += cell) for (let gz = I.z - I.reach; gz < I.z + I.reach; gz += cell) {
      const x = gx + rnd() * cell, z = gz + rnd() * cell, r = rnd();
      const y = islandHeight(I, x, z);
      if (y < -2.5 || y < terrainHeight(x, z) - 0.01) continue;                 // sea, or a neighbouring lobe stands higher here
      const steep = Math.hypot(terrainHeight(x + 1.5, z) - terrainHeight(x - 1.5, z), terrainHeight(x, z + 1.5) - terrainHeight(x, z - 1.5)) / 3;
      if (y < 0.9) { if (r < (I.cliff ? 0.2 : 0.07)) rock(pick(ROCKS), x, y - 0.2, z, 0.5 + rnd() * rnd() * 2.6); continue; }
      if (blocked(x, z)) continue;
      if (steep > 0.75) { if (r < 0.1) rock(pick(ROCKS), x, y - 0.5, z, 0.7 + rnd() * 1.5); continue; }
      if (y < 3.4) {
        // the beach: palms leaning over it, driftwood and scrub along the top of the sand
        if (r < I.palms) { const s = 0.85 + rnd() * 0.45; plant(pick(PALMS), x, y - 0.25, z, s, 0.2); raiseCanopy(x, z, 3, 9 * s); }
        else if (r < I.palms + 0.05) rock('World_Driftwood', x, y + 0.05, z, 0.7 + rnd() * 0.8);
        else if (r < I.palms + 0.16 && y > 2) plant(pick(BUSHES), x, y - 0.05, z, 0.7 + rnd() * 0.9);
        else if (r > 0.97) rock(pick(ROCKS), x, y - 0.3, z, 0.4 + rnd() * 0.9);
        continue;
      }
      // inland: forest in drifts with glades between, scrub in the gaps, the odd boulder
      const glade = fbm(x * 0.03 + 5.3, z * 0.03 - 8.1);
      const wood = I.forest * smooth((glade - 0.3 + I.forest * 0.22) / 0.22) * (1 - smooth((y - 38) / 12));
      if (r < wood * 0.82) {
        const s = 0.75 + rnd() * 0.75, name = pick(TREES);
        plant(name, x, y - 0.35, z, s);
        raiseCanopy(x, z, 7, modelInfo(name).size[1] * s * 1.1);
      } else if (r < wood * 0.82 + 0.16) plant(pick(BUSHES), x, y - 0.05, z, 0.8 + rnd() * 1.4);
      else if (r > 0.975) rock(pick(ROCKS), x, y - 0.4, z, 0.5 + rnd() * 1.4);
    }
  }
  // sea stacks: tall rocks standing in the shallows off the islands that have cliffs
  for (const I of ISLANDS) if (I.cliff) for (let k = 0, n = 3 + ((rnd() * 3) | 0); k < n; k++) {
    const a = rnd() * 6.283, d = I.r * (1.12 + rnd() * 0.3), x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = terrainHeight(x, z);
    if (y > -0.5 || y < -9 || Math.hypot(x, z) < 75) continue;
    const s = 2.2 + rnd() * 3;
    dm.position.set(x, y - 1, z); dm.rotation.set(0, rnd() * 6.283, 0); dm.scale.set(s, s * (1.6 + rnd() * 1.4), s); dm.updateMatrix();
    rocks[pick(ROCKS)].push({ m: dm.matrix.clone(), x, z, cy: y + s * 3, r: s * 6 });
    OBSTACLES.push({ x, z, r: s * 1.8, top: y + s * 6 });
    // (and a place just to seaward of it where a raft can fetch up)
    const out = s * 1.8 + 11, sx2 = x + Math.cos(a) * out, sz2 = z + Math.sin(a) * out;
    if (terrainHeight(sx2, sz2) < -3) world.spawn.stacks.push({ x: sx2, z: sz2 });
  }
  const lodded = [];
  let plantCount = 0;
  for (const [name, list] of species) {
    const leaf = modelInfo(name).groups.filter(g => /^Leaf/.test(g.mat)).sort((a, b) => b.count - a.count)[0];
    const tiers = [name, name + '_far'].map((n, far) => {
      const g = geo(n);
      const mesh = new THREE.InstancedMesh(g, g.userData.mats.map(mn => foliage(mn, /Tree[345]/.test(name))), list.length);
      mesh.castShadow = !far; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0;
      if (!far) mesh.layers.set(PLANT_LAYER);      // (the near trees stay out of the water's mirror: it is the costliest thing in it)
      scene.add(mesh);
      return mesh;
    });
    const size = modelInfo(name).size;
    for (const it of list) { it.r = Math.max(size[0], size[1], size[2]) * it.s * 0.6; it.cy = it.y + size[1] * it.s * 0.5; }
    lodded.push({ list, tiers, leaf: look(leaf ? leaf.mat : 'Leaf').color, size, bushy: /Bush/.test(name) });
    plantCount += list.length;
  }
  // the far hills' trees: one soft lump each, coloured like the tree it stands for
  const lumpGeo = new THREE.SphereGeometry(1, 9, 6);
  { const p = lumpGeo.attributes.position, nr = lumpGeo.attributes.normal;
    for (let i = 0; i < p.count; i++) { const k = 0.82 + 0.36 * vnoise(p.getX(i) * 2.3 + 7, p.getZ(i) * 2.3 + p.getY(i) * 1.7); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); nr.setXYZ(i, nr.getX(i) * 0.8, nr.getY(i) * 0.8 + 0.35, nr.getZ(i) * 0.8); } }
  const lumps = new THREE.InstancedMesh(lumpGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), plantCount);
  lumps.frustumCulled = false; lumps.count = 0; lumps.receiveShadow = true;
  scene.add(lumps);
  for (const L of lodded) for (const it of L.list) {
    // (each plant's lump is worked out once; world.cull() only picks which ones to draw)
    dm.position.set(it.x, it.y + L.size[1] * it.s * 0.62, it.z); dm.rotation.set(0, it.x, 0);
    dm.scale.set(L.size[0] * it.s * 0.46, L.size[1] * it.s * 0.36, L.size[2] * it.s * 0.46); dm.updateMatrix();
    it.lump = dm.matrix.clone(); it.col = L.leaf.clone().multiplyScalar(1.15);
  }
  const rockSets = [];
  for (const name in rocks) {
    const list = rocks[name]; if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geo(name), name === 'World_Driftwood' ? look('Bleached') : rockMat, list.length);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0;
    scene.add(mesh);
    rockSets.push({ mesh, list });
  }
  world.counts = { plants: plantCount, rocks: Object.values(rocks).reduce((n, l) => n + l.length, 0) };

  world.setDetail = (near, far) => { NEAR = near; FAR = far; };
  // Called before each viewport is drawn. Of the plants and rocks this camera can see (with a margin, so the shadows
  // and mirror images of those just outside the picture are still there), near ones get the full model, those across
  // the bay the sparser copy and the far hills' a lump. The view's shadow and mirror passes use the same choice.
  const frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sph = new THREE.Sphere(), MARGIN = 14;
  const seen = it => { _sph.center.set(it.x, it.cy, it.z); _sph.radius = it.r + MARGIN; return frustum.intersectsSphere(_sph); };
  world.cull = function (cam) {
    frustum.setFromProjectionMatrix(_pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const px = cam.position.x, pz = cam.position.z, near2 = NEAR * NEAR, far2 = FAR * FAR;
    let nl = 0;
    for (const L of lodded) {
      let n0 = 0, n1 = 0;
      const [t0, t1] = L.tiers;
      for (const it of L.list) {
        const dx = it.x - px, dz = it.z - pz, d2 = dx * dx + dz * dz;
        if ((d2 >= far2 && L.bushy) || !seen(it)) continue;
        if (d2 < near2) t0.setMatrixAt(n0++, it.m);
        else if (d2 < far2) t1.setMatrixAt(n1++, it.m);
        else { lumps.setMatrixAt(nl, it.lump); lumps.setColorAt(nl++, it.col); }
      }
      t0.count = n0; t1.count = n1;
      t0.instanceMatrix.needsUpdate = t1.instanceMatrix.needsUpdate = true;
    }
    lumps.count = nl; lumps.instanceMatrix.needsUpdate = true;
    if (lumps.instanceColor) lumps.instanceColor.needsUpdate = true;
    for (const R of rockSets) {
      let n = 0;
      for (const it of R.list) if (seen(it)) R.mesh.setMatrixAt(n++, it.m);
      R.mesh.count = n; R.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  // ---------- ledges on the sea cliffs, where only the helicopter's basket can reach
  world.spawn.ledges = [];
  for (const I of ISLANDS) if (I.cliff) for (let k = 0; k < 64; k++) {
    const a = (k / 64) * 6.283;
    for (let d = I.r * 0.6; d < I.r * 1.4; d += 1.5) {
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = terrainHeight(x, z);
      const steep = Math.hypot(terrainHeight(x + 1.5, z) - terrainHeight(x - 1.5, z), terrainHeight(x, z + 1.5) - terrainHeight(x, z - 1.5)) / 3;
      if (y > 5 && y < 15 && steep > 0.9 && terrainHeight(x + Math.cos(a) * 6, z + Math.sin(a) * 6) < y - 3) { world.spawn.ledges.push({ x, z }); break; }
    }
  }

  // ---------- open-sea spawn points
  let guard = 0;
  while (world.spawn.sea.length < 60 && guard++ < 5000) {
    const a = rnd() * 6.283, d = 70 + rnd() * (WORLD_R - 100);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) if (terrainHeight(x + Math.cos(k * 0.785) * 14, z + Math.sin(k * 0.785) * 14) > -5) ok = false;
    if (ok) world.spawn.sea.push({ x, z });
  }

  // ---------- presets
  world.applyPreset = function (p) {
    world.preset = p;
    skyUniforms.uZenith.value.copy(p.zenith); skyUniforms.uHorizon.value.copy(p.horizon);
    skyUniforms.uSunDir.value.copy(p.sunDir); skyUniforms.uSunColor.value.copy(p.sunColor);
    skyUniforms.uSunDisc.value = p.sunDisc; skyUniforms.uGlow.value = p.glow; skyUniforms.uStars.value = p.stars;
    skyUniforms.uCloud.value = p.cloud; skyUniforms.uCloudLit.value.copy(p.cloudLit); skyUniforms.uCloudDark.value.copy(p.cloudDark);
    sun.color.copy(p.sunColor); sun.intensity = p.sunLight;
    hemi.color.copy(p.hemiSky); hemi.groundColor.copy(p.hemiGround); hemi.intensity = p.hemi;
    scene.fog.color.copy(p.fog); scene.fog.density = p.fogDensity;
    scene.environment = envFor(p); scene.environmentIntensity = p.env;
    const u = waterUniforms;
    u.uZenith.value.copy(p.zenith); u.uHorizon.value.copy(p.horizon); u.uSunDir.value.copy(p.sunDir); u.uSunColor.value.copy(p.sunColor);
    u.uDeep.value.copy(p.deep); u.uShallow.value.copy(p.shallow); u.uFogColor.value.copy(p.fog); u.uFogDensity.value = p.fogDensity;
    u.uSpec.value = p.spec; u.uNight.value = p.night >= 1 ? 1 : 0;
    for (const n of world.nightMats) n.mat.emissiveIntensity = (n.min || 0) + (n.max - (n.min || 0)) * p.night;
    beamMat.uniforms.uOpacity.value = 0.5 * p.night; beams.visible = p.night > 0;
    renderer.toneMappingExposure = p.exposure;
  };

  // how hard it is blowing, 0 to 1: cloud closes in and darkens, the light flattens, the haze thickens, the sea greys
  const grey = new THREE.Color(), tmpC = new THREE.Color();
  const dull = (out, c, w, dim) => { const l = c.r * 0.3 + c.g * 0.5 + c.b * 0.2; return out.copy(c).lerp(grey.setRGB(l, l, l * 1.06), w * 0.75).multiplyScalar(1 - dim * w); };
  world.blow = function (w) {
    const p = world.preset, u = waterUniforms;
    skyUniforms.uCloud.value = Math.min(0.98, p.cloud + w * 0.6);
    dull(skyUniforms.uCloudLit.value, p.cloudLit, w, 0.5); dull(skyUniforms.uCloudDark.value, p.cloudDark, w, 0.45);
    dull(skyUniforms.uZenith.value, p.zenith, w, 0.3); dull(skyUniforms.uHorizon.value, p.horizon, w, 0.25);
    u.uZenith.value.copy(skyUniforms.uZenith.value); u.uHorizon.value.copy(skyUniforms.uHorizon.value);
    dull(u.uDeep.value, p.deep, w * 0.6, 0.15); dull(u.uShallow.value, p.shallow, w * 0.5, 0.25);
    dull(scene.fog.color, p.fog, w, 0.25); u.uFogColor.value.copy(scene.fog.color);
    scene.fog.density = u.uFogDensity.value = p.fogDensity * (1 + 1.5 * w);
    sun.intensity = p.sunLight * (1 - 0.6 * w); u.uSpec.value = p.spec * (1 - 0.7 * w);
    hemi.intensity = p.hemi * (1 + 0.5 * w); scene.environmentIntensity = p.env * (1 - 0.3 * w);
    gustUniform.value = 0.7 + 3.3 * w;
  };

  world.update = function (dt, t) {
    world.time = t;
    waterUniforms.uTime.value = t; waterUniforms.uSwell.value = sea.swell; skyUniforms.uTime.value = t;
    windUniform.value = t;
    beamPivot.rotation.y = t * 0.5;
    beaconMat.emissiveIntensity = (t % 1.4) < 0.25 ? 6 : 0;
  };

  // point the shadow camera at whatever a viewport is looking at
  world.aimSun = function (target) {
    sun.target.position.copy(target);
    sun.position.copy(target).addScaledVector(world.preset.sunDir, 260);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  };

  return world;
}

// ---------------------------------------------------------------- leaves and bark for the plants
// Leaves are lit from both sides as if they faced out of the crown (see geo() in assets.js), let a little sun through,
// and stir in the wind; the higher up the plant, the more it moves.
const windUniform = { value: 0 }, gustUniform = { value: 1 };
const foliageCache = new Map();
// a spray of leaves on a twig, painted once and worn by every card of the broad-leaved trees (see CARDS in tools/pack_models.py)
let sprayTex;
function leafSpray() {
  if (sprayTex) return sprayTex;
  const rnd = mulberry(4242);
  sprayTex = canvasTex(256, 256, (g, w) => {
    g.clearRect(0, 0, w, w);
    const leaf = (x, y, a, len, shade) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = `rgb(${shade * 0.86 | 0},${shade | 0},${shade * 0.62 | 0})`;
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.3, -len * 0.3, len * 0.75, -len * 0.24, len, 0); g.bezierCurveTo(len * 0.75, len * 0.24, len * 0.3, len * 0.3, 0, 0); g.fill();
      g.strokeStyle = `rgba(255,255,220,0.35)`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.9, 0); g.stroke();
      g.restore();
    };
    for (let t = 0; t < 5; t++) {
      // each twig runs out from near the middle and carries leaves down both sides
      const a0 = rnd() * 6.283, x0 = w / 2 + (rnd() - 0.5) * 36, y0 = w / 2 + (rnd() - 0.5) * 36, reach = 62 + rnd() * 34;
      g.strokeStyle = 'rgb(96,84,60)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a0) * reach, y0 + Math.sin(a0) * reach); g.stroke();
      for (let i = 0; i < 9; i++) {
        const k = 0.15 + (i / 9) * 0.85, side = i % 2 ? 1 : -1;
        leaf(x0 + Math.cos(a0) * reach * k, y0 + Math.sin(a0) * reach * k, a0 + side * (0.75 + rnd() * 0.5), 34 + rnd() * 20, 150 + rnd() * 105);
      }
      leaf(x0 + Math.cos(a0) * reach, y0 + Math.sin(a0) * reach, a0 + (rnd() - 0.5) * 0.4, 40 + rnd() * 14, 190 + rnd() * 60);
    }
  });
  sprayTex.flipY = false;
  return sprayTex;
}
function foliage(name, cards) {
  const key = name + (cards ? '+cards' : '');
  if (foliageCache.has(key)) return foliageCache.get(key);
  const base = look(name);
  if (!/^Leaf/.test(name)) { foliageCache.set(key, base); return base; }
  const mat = new THREE.MeshStandardMaterial({ color: base.color.clone().multiplyScalar(cards ? 2.1 : 0.85), roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.35 });
  if (cards) { mat.map = leafSpray(); mat.alphaTest = 0.42; mat.alphaToCoverage = true; }
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWind = windUniform; sh.uniforms.uGust = gustUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind, uGust; varying float vHigh;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 root = instanceMatrix[3].xyz;
        #else
          vec3 root = vec3(0.0);
        #endif
        float lift = max(position.y - 1.5, 0.0);
        float gust = sin(uWind * 1.3 + root.x * 0.11 + root.z * 0.07) + 0.5 * sin(uWind * 2.9 + root.x * 0.31 + position.y);
        transformed.x += (gust + uGust * 0.6) * lift * 0.022 * uGust; transformed.z += (gust + uGust * 0.4) * lift * 0.014 * uGust;
        transformed.y += sin(uWind * (3.7 + uGust) + position.x * 2.1 + position.z * 1.7 + root.x) * 0.03 * uGust * min(lift, 2.0);
        vHigh = clamp(position.y / 9.0, 0.0, 1.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHigh;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= 0.5 + 0.7 * vHigh;');      // dark in the heart of the crown, bright at the top
  };
  mat.customProgramCacheKey = () => 'foliage';
  foliageCache.set(key, mat);
  return mat;
}

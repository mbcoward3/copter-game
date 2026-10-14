import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

// ---------------------------------------------------------------- layout
export const WORLD_R = 330;        // soft flight boundary
export const SEA_FLOOR = -14;
export const BASE_Y = 5;           // height of the rescue base plateau
export const PAD_Y = BASE_Y + 0.3;
export const PADS = [{ x: -15, z: 12 }, { x: 15, z: 12 }];
export const STATION = { x: 0, z: -17 };
export const LIGHTHOUSE = { x: -98, z: 74 };

export const ISLANDS = [
  { x: 0, z: 0, r: 85, h: 16, flat: BASE_Y },            // rescue base
  { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 30, h: 22, flat: 6 },
  { x: -200, z: -130, r: 78, h: 30 },
  { x: 205, z: -150, r: 60, h: 20 },
  { x: 175, z: 175, r: 86, h: 38 },
  { x: -165, z: 200, r: 55, h: 15 },
  { x: 30, z: -255, r: 50, h: 13 },
  { x: -285, z: 45, r: 44, h: 22 },
  { x: 290, z: 20, r: 40, h: 12 },
];
// tiny sandbars where animals get stranded
export const ISLETS = [
  { x: 95, z: 60 }, { x: -70, z: -95 }, { x: 110, z: -70 }, { x: -20, z: 135 },
  { x: 60, z: 250 }, { x: -120, z: -260 }, { x: 250, z: -40 }, { x: -230, z: 120 },
  { x: 120, z: -235 }, { x: -110, z: 5 },
];
for (const s of ISLETS) ISLANDS.push({ x: s.x, z: s.z, r: 17, h: 3.2, islet: true });

export const OBSTACLES = [
  { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 6.5, top: 36 },
  { x: STATION.x, z: STATION.z, r: 12, top: 15 },
];

export function terrainHeight(x, z) {
  let h = SEA_FLOOR;
  for (const I of ISLANDS) {
    const dx = x - I.x, dz = z - I.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= I.r * I.r) continue;
    const d = Math.sqrt(d2) / I.r;
    const s = 1 - d * d * (3 - 2 * d);
    let ih;
    if (I.flat !== undefined) ih = Math.min(I.flat, SEA_FLOOR + (I.h - SEA_FLOOR) * s);
    else if (I.islet) ih = SEA_FLOOR + (I.h - SEA_FLOOR) * Math.pow(s, 0.8);
    else ih = SEA_FLOOR + (I.h - SEA_FLOOR) * Math.pow(s, 1.4) * (0.7 + 0.6 * fbm(x * 0.02 + I.x, z * 0.02 + I.z));
    if (ih > h) h = ih;
  }
  return h;
}

// ---------------------------------------------------------------- ocean swell (shared by shader + gameplay)
const G = 9.81;
export const WAVES = [
  { dx: 0.92, dz: 0.39, len: 78, amp: 0.55 },
  { dx: -0.45, dz: 0.89, len: 47, amp: 0.3 },
  { dx: 0.64, dz: -0.77, len: 29, amp: 0.17 },
].map(w => {
  const k = (Math.PI * 2) / w.len;
  return { ...w, k, om: Math.sqrt(G * k) };
});
export function waveHeight(x, z, t) {
  let y = 0;
  for (const w of WAVES) y += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.om * t);
  return y;
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
    sunDir: dirFrom(48, 140), sunColor: C(1.0, 0.95, 0.84), sunLight: 3.3, sunDisc: 30, glow: 0.6,
    zenith: C(0.045, 0.19, 0.72), horizon: C(0.50, 0.72, 0.98), hemiSky: C(0.55, 0.72, 1.0), hemiGround: C(0.32, 0.30, 0.24), hemi: 1.15,
    fog: C(0.50, 0.71, 0.96), fogDensity: 0.0007, env: 0.9, stars: 0, exposure: 0.95,
    deep: C(0.004, 0.075, 0.17), shallow: C(0.03, 0.50, 0.50), spec: 26, bloom: 0.22,
  },
  {
    name: 'Golden Hour', icon: '🌅', night: 0.25,
    sunDir: dirFrom(8.5, 205), sunColor: C(1.0, 0.50, 0.17), sunLight: 3.6, sunDisc: 26, glow: 1.6,
    zenith: C(0.11, 0.17, 0.46), horizon: C(1.0, 0.50, 0.24), hemiSky: C(0.55, 0.45, 0.75), hemiGround: C(0.40, 0.24, 0.16), hemi: 0.95,
    fog: C(0.86, 0.47, 0.30), fogDensity: 0.0011, env: 1.0, stars: 0.15, exposure: 1.0,
    deep: C(0.015, 0.05, 0.13), shallow: C(0.10, 0.36, 0.40), spec: 34, bloom: 0.38,
  },
  {
    name: 'Starry Night', icon: '🌙', night: 1,
    sunDir: dirFrom(38, 320), sunColor: C(0.55, 0.68, 1.0), sunLight: 0.75, sunDisc: 5, glow: 0.35,
    zenith: C(0.003, 0.006, 0.028), horizon: C(0.022, 0.045, 0.11), hemiSky: C(0.16, 0.22, 0.48), hemiGround: C(0.03, 0.04, 0.07), hemi: 0.75,
    fog: C(0.018, 0.035, 0.085), fogDensity: 0.0012, env: 0.5, stars: 1, exposure: 1.25,
    deep: C(0.002, 0.012, 0.04), shallow: C(0.01, 0.10, 0.14), spec: 9, bloom: 0.5,
  },
];

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
uniform vec3 uZenith, uHorizon, uSunDir, uSunColor;
uniform float uSunDisc, uGlow, uStars, uTime;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.55, min(-d.y * 4.0, 1.0));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (smoothstep(0.99955, 0.99975, s) * uSunDisc + pow(s, 180.0) * 0.9 * uGlow + pow(s, 12.0) * 0.22 * uGlow);
  if (uStars > 0.0) {
    vec3 p = d * 210.0;
    vec3 c = floor(p);
    float r = hash(c);
    float tw = 0.7 + 0.3 * sin(uTime * 2.0 + r * 80.0);
    float st = step(0.9945, r) * smoothstep(0.42, 0.0, length(fract(p) - 0.5)) * tw;
    col += vec3(1.0, 0.95, 0.85) * st * uStars * smoothstep(0.0, 0.25, d.y) * 2.2;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- water
const WATER_VERT = /* glsl */`
uniform float uTime;
uniform vec4 uWaves[3];   // dir.xy, k, amp
uniform float uOmega[3];
varying vec3 vWorld;
varying vec3 vBigN;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float fade = 1.0 - smoothstep(500.0, 1400.0, length(wp.xz));
  float y = 0.0; vec2 dd = vec2(0.0);
  for (int i = 0; i < 3; i++) {
    float ph = uWaves[i].z * dot(uWaves[i].xy, wp.xz) - uOmega[i] * uTime;
    y += uWaves[i].w * sin(ph);
    dd += uWaves[i].xy * (uWaves[i].z * uWaves[i].w * cos(ph));
  }
  wp.y += y * fade;
  vBigN = vec3(-dd.x * fade, 1.0, -dd.y * fade);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uDeep, uShallow, uFogColor;
uniform float uFogDensity, uSpec, uNight;
uniform sampler2D uHeightTex;
uniform vec4 uHeli[2];     // xyz world position, w strength
uniform vec4 uLamp[2];     // searchlight spot on water: xz, radius, strength
uniform sampler2D uReflTex;
uniform mat4 uReflMat;
uniform float uReflOn;
varying vec3 vWorld;
varying vec3 vBigN;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main(){
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  // fine ripples (analytic), faded with distance to stay calm on the horizon
  vec2 p = vWorld.xz;
  vec2 dn = vec2(0.0);
  float a = 0.085; float f = 0.42; vec2 dir = vec2(0.8, 0.6);
  for (int i = 0; i < 6; i++) {
    float ph = dot(dir, p) * f + uTime * (1.1 + float(i) * 0.37) + noise(p * 0.05 + float(i)) * 3.0;
    dn += dir * (a * f * cos(ph));
    dir = vec2(dir.x * 0.52 - dir.y * 0.854, dir.x * 0.854 + dir.y * 0.52);
    f *= 1.72; a *= 0.62;
  }
  dn *= 1.0 / (1.0 + dist * 0.012);

  // rotor wash rings
  float wash = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 dv = p - uHeli[i].xz;
    float d = length(dv);
    float s = uHeli[i].w * exp(-d * 0.085);
    dn += (dv / max(d, 0.01)) * sin(d * 1.5 - uTime * 11.0) * s * 0.55;
    wash += s * smoothstep(13.0, 2.0, d) * (0.35 + 0.65 * noise(p * 1.7 - (dv / max(d, 0.01)) * uTime * 5.0));
  }

  vec3 N = normalize(vBigN + vec3(-dn.x, 0.0, -dn.y));
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);

  vec3 sky = mix(uHorizon, uZenith, pow(R.y, 0.5));
  if (uReflOn > 0.5) {
    // planar mirror of the real scene, wobbled by the wave normal
    vec4 rc = uReflMat * vec4(vWorld.x, 0.0, vWorld.z, 1.0);
    vec2 ruv = rc.xy / rc.w + N.xz * vec2(0.06, 0.12) / (1.0 + dist * 0.004);
    vec3 mir = min(texture2D(uReflTex, clamp(ruv, 0.002, 0.998)).rgb, vec3(3.0));
    sky = mix(sky, mir, 0.92);
  }
  float sd = max(dot(R, uSunDir), 0.0);
  vec3 sun = uSunColor * (pow(sd, 900.0) * uSpec + pow(sd, 60.0) * uSpec * 0.035);

  float th = texture2D(uHeightTex, p / 900.0 + 0.5).r * 30.0 - 14.0;
  float depth = vWorld.y - th;
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 6.5, depth));
  float light = 0.25 + 0.75 * max(dot(N, uSunDir), 0.0);
  body *= mix(light, 1.0, 0.35) * (1.0 - 0.55 * uNight);
  body += uShallow * 0.22 * max(vWorld.y, 0.0) * (1.0 - 0.7 * uNight);   // light through the crests

  vec3 col = mix(body, sky + sun, fres);

  // searchlight pools on the water
  for (int i = 0; i < 2; i++) {
    float d = length(p - uLamp[i].xy);
    float s = smoothstep(uLamp[i].z, uLamp[i].z * 0.35, d) * uLamp[i].w;
    col += (uShallow * 1.6 + vec3(0.35, 0.4, 0.4)) * s * (0.6 + 0.6 * noise(p * 2.0 + uTime));
  }

  // shoreline foam + wash foam
  float fn = noise(p * 0.7 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + noise(p * 2.3 - uTime * 0.3) * 0.4;
  float shore = smoothstep(1.5, 0.0, depth + sin(uTime * 1.3 + depth * 2.5 + fn * 4.0) * 0.3) * smoothstep(0.25, 0.75, fn + 0.25);
  float crest = smoothstep(0.62, 0.95, vWorld.y) * smoothstep(0.45, 0.8, fn) * 0.5;
  float foam = clamp(shore + crest + wash * 0.85, 0.0, 1.0);
  vec3 foamCol = mix(vec3(0.95), uHorizon * 0.8 + 0.25, 0.25) * (1.0 - 0.72 * uNight);
  col = mix(col, foamCol, foam);

  float alpha = clamp(smoothstep(-0.05, 1.1, depth) + foam, 0.0, 1.0);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, alpha);
}`;

function tint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
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
  const world = { time: 0, preset: PRESETS[0], nightMats: [], spawn: { sea: [], islets: ISLETS } };

  // ---------- sky dome
  const skyUniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uSunDisc: { value: 1 }, uGlow: { value: 1 }, uStars: { value: 0 }, uTime: { value: 0 },
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
  envScene.add(new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({ uniforms: envUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false })));
  const envCache = new Map();
  function envFor(p) {
    if (envCache.has(p)) return envCache.get(p);
    envUniforms.uZenith.value.copy(p.zenith); envUniforms.uHorizon.value.copy(p.horizon);
    envUniforms.uSunDir.value.copy(p.sunDir); envUniforms.uSunColor.value.copy(p.sunColor);
    envUniforms.uSunDisc.value = 0; envUniforms.uGlow.value = p.glow * 1.5; envUniforms.uStars.value = 0;
    const rt = pmrem.fromScene(envScene, 0, 1, 9000);
    envCache.set(p, rt.texture);
    return rt.texture;
  }

  // ---------- lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 500;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xffffff, 0.001);
  world.sun = sun;

  // ---------- terrain
  const TSIZE = 900, TSEG = 320;
  const tgeo = new THREE.PlaneGeometry(TSIZE, TSIZE, TSEG, TSEG);
  tgeo.rotateX(-Math.PI / 2);
  const tpos = tgeo.attributes.position;
  for (let i = 0; i < tpos.count; i++) tpos.setY(i, terrainHeight(tpos.getX(i), tpos.getZ(i)));
  tgeo.computeVertexNormals();
  const tnorm = tgeo.attributes.normal;
  const tcol = new Float32Array(tpos.count * 3);
  const sand = C(0.80, 0.70, 0.46), wetSand = C(0.42, 0.36, 0.25), grass = C(0.20, 0.42, 0.11), grass2 = C(0.34, 0.50, 0.14), rock = C(0.36, 0.34, 0.32), tmp = new THREE.Color();
  for (let i = 0; i < tpos.count; i++) {
    const x = tpos.getX(i), y = tpos.getY(i), z = tpos.getZ(i);
    const n = fbm(x * 0.06, z * 0.06);
    if (y < 0.3) tmp.copy(wetSand).lerp(sand, THREE.MathUtils.clamp((y + 4) / 4.3, 0, 1));
    else if (y < 1.6 + n * 1.4) tmp.copy(sand);
    else {
      tmp.copy(grass).lerp(grass2, n);
      const steep = 1 - tnorm.getY(i);
      const rk = THREE.MathUtils.smoothstep(steep, 0.18, 0.34) + THREE.MathUtils.smoothstep(y, 22, 30);
      tmp.lerp(rock, Math.min(rk, 1));
    }
    tmp.multiplyScalar(0.85 + 0.3 * vnoise(x * 0.9, z * 0.9));
    tcol[i * 3] = tmp.r; tcol[i * 3 + 1] = tmp.g; tcol[i * 3 + 2] = tmp.b;
  }
  tgeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  const detail = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      // tileable speckle: blades of grass / grains of sand
      const n = 0.5 * hash2(i, j) + 0.3 * hash2(i >> 1, j >> 1) + 0.2 * hash2(i >> 3, j >> 3);
      const v = 150 + n * 105;
      const o = (j * w + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.repeat.set(140, 140);
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: detail, bumpMap: detail, bumpScale: 1.2 }));
  terrain.receiveShadow = true;
  world.terrain = terrain;
  scene.add(terrain);

  // height map for the water shader (shallows + shore foam)
  const HT = 256;
  const hdata = new Uint8Array(HT * HT);
  for (let j = 0; j < HT; j++) for (let i = 0; i < HT; i++) {
    const h = terrainHeight((i / (HT - 1) - 0.5) * TSIZE, (j / (HT - 1) - 0.5) * TSIZE);
    hdata[j * HT + i] = Math.round(THREE.MathUtils.clamp((h + 14) / 30, 0, 1) * 255);
  }
  const heightTex = new THREE.DataTexture(hdata, HT, HT, THREE.RedFormat, THREE.UnsignedByteType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  // ---------- water (grid is dense near the middle, stretched toward the horizon)
  const wgeo = new THREE.PlaneGeometry(2, 2, 300, 300);
  wgeo.rotateX(-Math.PI / 2);
  const wpos = wgeo.attributes.position;
  for (let i = 0; i < wpos.count; i++) {
    const x = wpos.getX(i), z = wpos.getZ(i);
    wpos.setXYZ(i, Math.sign(x) * Math.pow(Math.abs(x), 2.1) * 4200, 0, Math.sign(z) * Math.pow(Math.abs(z), 2.1) * 4200);
  }
  const waterUniforms = {
    uTime: { value: 0 },
    uWaves: { value: WAVES.map(w => new THREE.Vector4(w.dx, w.dz, w.k, w.amp)) },
    uOmega: { value: WAVES.map(w => w.om) },
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.001 }, uSpec: { value: 20 }, uNight: { value: 0 },
    uHeightTex: { value: heightTex },
    uHeli: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uLamp: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uReflTex: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
  };
  const water = new THREE.Mesh(wgeo, new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }));
  water.frustumCulled = false; water.renderOrder = -1;
  scene.add(water);
  world.waterUniforms = waterUniforms; world.water = water;

  // ---------- base: helipads
  const padCols = ['#ff6a2b', '#2f8cff'];
  world.padLights = [];
  PADS.forEach((pad, i) => {
    const tex = canvasTex(512, 512, (g, w) => {
      g.fillStyle = '#3d4248'; g.fillRect(0, 0, w, w);
      g.strokeStyle = padCols[i]; g.lineWidth = 34; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 30, 0, 7); g.stroke();
      g.strokeStyle = '#f4f4f4'; g.lineWidth = 12; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 78, 0, 7); g.stroke();
      g.fillStyle = '#f4f4f4'; g.font = 'bold 250px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('H', w / 2, w / 2 + 14);
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9, 0.6, 40), [
      new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x555a60 }),
    ]);
    m.position.set(pad.x, PAD_Y - 0.3, pad.z); m.receiveShadow = true;
    scene.add(m);
    // ring of landing lights
    const lm = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(padCols[i]), emissiveIntensity: 2 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lm);
      l.position.set(pad.x + Math.cos(a) * 8.9, PAD_Y + 0.1, pad.z + Math.sin(a) * 8.9);
      scene.add(l);
    }
    world.padLights.push(lm);
  });

  // ---------- base: rescue station
  const station = new THREE.Group();
  station.position.set(STATION.x, BASE_Y, STATION.z);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.8 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xd9412f, roughness: 0.55 });
  const greyMat = new THREE.MeshStandardMaterial({ color: 0x7c8a96, roughness: 0.5, metalness: 0.5 });
  const winMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.3, emissive: 0xffc46b, emissiveIntensity: 0 });
  world.nightMats.push({ mat: winMat, max: 3.2 });
  const addBox = (w, h, d, mat, x, y, z, parent = station) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  addBox(20, 7, 10, wallMat, 0, 3.5, 0);
  addBox(21.4, 1, 11.4, redMat, 0, 7.5, 0);
  addBox(7, 4.5, 7, wallMat, -5, 10.2, 0);        // control tower
  addBox(8, 0.7, 8, redMat, -5, 12.8, 0);
  addBox(7.2, 1.8, 7.2, winMat, -5, 10.9, 0).castShadow = false;
  addBox(4.2, 4.6, 0.3, greyMat, 4, 2.3, 5.1);    // hangar door
  for (const wx of [-7, -3, 0.2]) { const w = addBox(2.2, 2, 0.25, winMat, wx, 4, 5.05); w.castShadow = false; }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.9), new THREE.MeshStandardMaterial({
    roughness: 0.6, map: canvasTex(512, 108, (g, w, h) => {
      g.fillStyle = '#d9412f'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = 'bold 78px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('✚ RESCUE 9', w / 2, h / 2 + 5);
    }),
  }));
  sign.position.set(-2, 6.1, 5.06); station.add(sign);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), greyMat); mast.position.set(-5, 16, 0); station.add(mast);
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1133, emissiveIntensity: 0 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), beaconMat); beacon.position.set(-5, 19.2, 0); station.add(beacon);
  world.beaconMat = beaconMat;
  // windsock
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), greyMat); pole.position.set(13.5, 3, 3); station.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide, roughness: 0.8 }));
  sock.geometry.rotateZ(Math.PI / 2); sock.geometry.translate(-1.5, 0, 0);
  sock.position.set(13.5, 5.8, 3); station.add(sock); world.sock = sock;
  scene.add(station);

  // little fence round the "safe paddock" where rescued friends hang out
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.8 });
  world.paddock = { x: 0, z: -3, r: 9 };
  const postGeo = new THREE.CylinderGeometry(0.11, 0.11, 1.1, 6);
  const posts = new THREE.InstancedMesh(postGeo, fenceMat, 26);
  const dm = new THREE.Object3D();
  for (let k = 0; k < 26; k++) {
    const a = Math.PI * (0.02 + (k / 25) * 0.96);
    dm.position.set(world.paddock.x + Math.cos(a) * 11.5, BASE_Y + 0.55, world.paddock.z - 5 + Math.sin(a) * 9.5);
    dm.updateMatrix(); posts.setMatrixAt(k, dm.matrix);
  }
  posts.castShadow = true; scene.add(posts);

  // pier
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6748, roughness: 0.9 });
  const pier = new THREE.Group();
  for (let k = 0; k < 14; k++) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 2.2), woodMat);
    pl.position.set(0, 1.9, 36 + k * 2.4); pl.castShadow = pl.receiveShadow = true; pier.add(pl);
    if (k % 3 === 0) for (const sx of [-2, 2]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), woodMat);
      leg.position.set(sx, -2.4, 36 + k * 2.4); pier.add(leg);
    }
  }
  scene.add(pier);

  // ---------- lighthouse
  const lh = new THREE.Group();
  const lhY = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
  lh.position.set(LIGHTHOUSE.x, lhY, LIGHTHOUSE.z);
  const white = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.6 });
  const segH = 5.2;
  for (let k = 0; k < 5; k++) {
    const r0 = 4.2 - k * 0.42, r1 = r0 - 0.42;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segH, 20), k % 2 ? redMat : white);
    s.position.y = segH / 2 + k * segH; s.castShadow = s.receiveShadow = true; lh.add(s);
  }
  const gal = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.5, 20), greyMat); gal.position.y = 26.2; gal.castShadow = true; lh.add(gal);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffdd77, emissiveIntensity: 1.5, roughness: 0.2 });
  world.nightMats.push({ mat: lampMat, max: 9, min: 1.2 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3, 14), lampMat); lamp.position.y = 28; lh.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.7, 2.6, 16), redMat); cap.position.y = 30.9; cap.castShadow = true; lh.add(cap);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a6, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beamGeo = new THREE.CylinderGeometry(0.6, 13, 170, 24, 1, true);
  beamGeo.rotateZ(Math.PI / 2); beamGeo.translate(85, 0, 0);
  const beams = new THREE.Group(); beams.position.y = 28;
  const b1 = new THREE.Mesh(beamGeo, beamMat), b2 = new THREE.Mesh(beamGeo, beamMat); b2.rotation.y = Math.PI;
  beams.add(b1, b2); beams.rotation.z = -0.045; lh.add(beams);
  const beamPivot = new THREE.Group(); lh.add(beamPivot); beamPivot.add(beams);
  world.beamPivot = beamPivot; world.beamMat = beamMat;
  scene.add(lh);

  // ---------- vegetation + rocks (instanced)
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const palmParts = [tint(new THREE.CylinderGeometry(0.16, 0.3, 5.4, 6).translate(0, 2.7, 0), 0x7a5a3a)];
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.PlaneGeometry(1.1, 3.6, 1, 5);
    leaf.rotateX(-Math.PI / 2); leaf.translate(0, 0, 1.8);
    const lp = leaf.attributes.position;
    for (let i = 0; i < lp.count; i++) { const t = lp.getZ(i) / 3.6; lp.setY(i, 0.5 * t - 1.9 * t * t - Math.abs(lp.getX(i)) * 0.35); }
    leaf.rotateY((k / 7) * Math.PI * 2 + 0.2); leaf.translate(0, 5.4, 0);
    palmParts.push(tint(leaf, k % 2 ? 0x3f8f2f : 0x2f7a2a));
  }
  palmParts.push(tint(new THREE.SphereGeometry(0.45, 8, 6).translate(0, 5.3, 0), 0x5b3d22));
  const palmGeo = mergeGeometries(palmParts.map(g => g.toNonIndexed()));
  palmGeo.computeVertexNormals();
  const pineParts = [tint(new THREE.CylinderGeometry(0.25, 0.35, 2, 6).translate(0, 1, 0), 0x5a4030)];
  for (let k = 0; k < 4; k++) pineParts.push(tint(new THREE.ConeGeometry(2.3 - k * 0.45, 2.8, 8).translate(0, 2.6 + k * 1.6, 0), k % 2 ? 0x1f5a2c : 0x1a4d27));
  const pineGeo = mergeGeometries(pineParts.map(g => g.toNonIndexed()));
  pineGeo.computeVertexNormals();
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6a66, roughness: 0.95, flatShading: true });

  const palmsM = [], pinesM = [], rocksM = [];
  for (const I of ISLANDS) {
    const tries = I.islet ? 14 : Math.round(I.r * I.r * 0.045);
    for (let k = 0; k < tries; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * I.r;
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
      const y = terrainHeight(x, z);
      if (I === ISLANDS[0] && d < 44) continue;                       // keep the base clear
      if (I === ISLANDS[1] && d < 9) continue;
      const r = rnd();
      dm.rotation.set((rnd() - 0.5) * 0.25, rnd() * 6.3, (rnd() - 0.5) * 0.25);
      if (y > 1.0 && y < 9 && r < (I.islet ? 0.2 : 0.5)) {
        const s = 0.8 + rnd() * 0.7; dm.scale.set(s, s * (0.9 + rnd() * 0.4), s); dm.position.set(x, y - 0.2, z); dm.updateMatrix(); palmsM.push(dm.matrix.clone());
      } else if (y >= 7 && y < 26 && r < 0.75) {
        const s = 0.8 + rnd() * 0.9; dm.rotation.x *= 0.3; dm.rotation.z *= 0.3; dm.scale.set(s, s * (0.9 + rnd() * 0.5), s); dm.position.set(x, y - 0.3, z); dm.updateMatrix(); pinesM.push(dm.matrix.clone());
      } else if (y > -2.5 && y < 1.2 && r > 0.55) {
        const s = 0.5 + rnd() * rnd() * 3.2; dm.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); dm.scale.set(s * (0.8 + rnd() * 0.6), s * (0.5 + rnd() * 0.5), s); dm.position.set(x, y + s * 0.15, z); dm.updateMatrix(); rocksM.push(dm.matrix.clone());
      }
    }
  }
  const inst = (geo, mat, list) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
  };
  inst(palmGeo, leafMat, palmsM); inst(pineGeo, leafMat, pinesM); inst(rockGeo, rockMat, rocksM);

  // ---------- clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.08 });
  const puffs = [];
  for (let c = 0; c < 26; c++) {
    const a = rnd() * 6.283, d = 150 + rnd() * 1250;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 120 + rnd() * 110 + d * 0.06;
    const sc0 = 14 + rnd() * 22;
    const n = 5 + Math.floor(rnd() * 6);
    for (let k = 0; k < n; k++) {
      const s = sc0 * (0.55 + rnd() * 0.75);
      dm.rotation.set(0, 0, 0); dm.scale.set(s * 1.3, s * 0.72, s);
      dm.position.set(cx + (rnd() - 0.5) * sc0 * 3.6, cy + (rnd() - 0.5) * sc0 * 0.5, cz + (rnd() - 0.5) * sc0 * 2);
      dm.updateMatrix(); puffs.push(dm.matrix.clone());
    }
  }
  const clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), cloudMat, puffs.length);
  puffs.forEach((mx, i) => clouds.setMatrixAt(i, mx));
  clouds.frustumCulled = false;
  scene.add(clouds);
  world.clouds = clouds; world.cloudMat = cloudMat;

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
    sun.color.copy(p.sunColor); sun.intensity = p.sunLight;
    hemi.color.copy(p.hemiSky); hemi.groundColor.copy(p.hemiGround); hemi.intensity = p.hemi;
    scene.fog.color.copy(p.fog); scene.fog.density = p.fogDensity;
    scene.environment = envFor(p); scene.environmentIntensity = p.env;
    const u = waterUniforms;
    u.uZenith.value.copy(p.zenith); u.uHorizon.value.copy(p.horizon); u.uSunDir.value.copy(p.sunDir); u.uSunColor.value.copy(p.sunColor);
    u.uDeep.value.copy(p.deep); u.uShallow.value.copy(p.shallow); u.uFogColor.value.copy(p.fog); u.uFogDensity.value = p.fogDensity;
    u.uSpec.value = p.spec; u.uNight.value = p.night >= 1 ? 1 : 0;
    for (const n of world.nightMats) n.mat.emissiveIntensity = (n.min || 0) + (n.max - (n.min || 0)) * p.night;
    beamMat.opacity = 0.03 + 0.03 * p.night;
    cloudMat.emissiveIntensity = p.night >= 1 ? 0.0 : 0.08;
    renderer.toneMappingExposure = p.exposure;
  };

  world.update = function (dt, t) {
    world.time = t;
    waterUniforms.uTime.value = t; skyUniforms.uTime.value = t;
    beamPivot.rotation.y = t * 0.5;
    clouds.rotation.y = t * 0.0025;
    world.sock.rotation.y = 0.5 + Math.sin(t * 0.7) * 0.3; world.sock.rotation.z = Math.sin(t * 3.1) * 0.08;
    const blink = (t % 1.4) < 0.25 ? 1 : 0;
    beaconMat.emissiveIntensity = blink * 6;
  };

  // point the shadow camera at whatever a viewport is looking at
  world.aimSun = function (target) {
    sun.target.position.copy(target);
    sun.position.copy(target).addScaledVector(world.preset.sunDir, 220);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  };

  return world;
}

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
export const WORLD_R = 620;        // soft flight boundary
export const HOME_R = 330;         // the home bay's own islands, rocks and open-sea spawns lie inside this
// the land is worked out on a grid TSPAN across, a point every TSTEP metres
export const TSPAN = 1400, TSTEP = 2;
export const SEA_FLOOR = -14;
export const BASE_Y = 5;           // height of the rescue base plateau
export const PAD_Y = BASE_Y + 0.3;
export const PADS = [{ x: -15, z: 12 }, { x: 15, z: 12 }];
export const STATION = { x: 0, z: -30 };
export const LIGHTHOUSE = { x: -98, z: 74 };
// a sea arch between the base and the lighthouse: tall enough to fly through, and the boat fits under it too
export const ARCH = { x: -59, z: 54, yaw: 3.97 };
// a level patch of sand below the base, east of the jetty, for the sunshades and towels (the bank above is too steep)
const BEACH = { x: 20, z: 38, r: 6, y: 1.5 };
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
  lobe(0, -12, 56, 6.5, { coast: 0.1, forest: 0, flats: [{ x: 0, z: -8, r: 40, y: BASE_Y }, BEACH] }),      // rescue base
  lobe(8, -84, 44, 17, { forest: 0.95 }),                                                              // the wooded hill behind it
  lobe(LIGHTHOUSE.x, LIGHTHOUSE.z, 30, 8, { coast: 0.18, cliff: 7.2, forest: 0.12, palms: 0.05, flats: [{ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 9, y: 7.5 }] }),
  lobe(175, 175, 92, 22, { ridge: 50, pow: 2.0, cliff: 12, cliffDir: [-0.6, -0.8], forest: 0.85,       // the mountain
    flats: [{ x: 146, z: 150, r: 10, site: 'Mountain ledge', pad: true }, { x: 205, z: 118, r: 10, site: 'Cove beach' }] }),
  lobe(-200, -130, 82, 20, { forest: 1,                                                                // the forest, with a lagoon and a meadow
    dents: [{ x: -168, z: -100, r: 20, y: -3.5 }], flats: [{ x: -214, z: -134, r: 11, site: 'Forest meadow', pad: true }] }),
  lobe(210, -150, 44, 19, { forest: 0.7, cliff: 8, cliffDir: [1, -0.2] }),                             // twin hills joined by a grassy saddle
  lobe(160, -196, 34, 12, { forest: 0.6, flats: [{ x: 186, z: -176, r: 9, site: 'Hill saddle' }] }),
  lobe(-165, 200, 58, 2.6, { coast: 0.14, forest: 0, palms: 0.4, dents: [{ x: -165, z: 200, r: 25, y: -4 }, { x: -142, z: 172, r: 7, y: -4 }, { x: -133, z: 161, r: 7, y: -4 }] }),      // the atoll, with a channel through its reef
  lobe(30, -255, 46, 8, { coast: 0.2, cliff: 15, forest: 0.35, flats: [{ x: 30, z: -255, r: 10, site: 'Table rock', pad: true }] }),      // the mesa
  lobe(-285, 45, 40, 14, { ridge: 22, pow: 1.5, cliff: 11, forest: 0.3, palms: 0.05, flats: [{ x: -268, z: 62, r: 9, site: 'Crag shelf' }] }),
  lobe(290, 20, 42, 2.4, { coast: 0.3, forest: 0, palms: 0.45, flats: [{ x: 290, z: 20, r: 9, site: 'Palm cay' }] }),
];
// The far zones, each with its own islands and its own kinds of rescue. A place belongs to whichever zone it lies
// deepest inside (see zoneOf); the home bay is everything round the base.
export const ZONES = [
  { id: 'home', name: 'Home Bay', icon: '\u{1F3DD}️', x: 0, z: 0, r: 260, color: '#5dff8f' },
  { id: 'forest', name: 'Pine Forest', icon: '\u{1F332}', x: -410, z: -250, r: 135, color: '#62d26f' },
  { id: 'reef', name: 'Coral Reef', icon: '\u{1F420}', x: -300, z: 350, r: 130, color: '#3fe0d0' },
  { id: 'harbour', name: 'Harbour Town', icon: '\u{1F3D8}️', x: 455, z: -165, r: 115, color: '#ffa04a' },
  { id: 'snow', name: 'Snowy Peaks', icon: '❄️', x: 55, z: -505, r: 135, color: '#bfe8ff' },
  { id: 'volcano', name: 'Volcano Isle', icon: '\u{1F30B}', x: 320, z: 390, r: 120, color: '#ff6a3a' },
];
export const zoneOf = (x, z) => { let best = ZONES[0], bd = 1e9; for (const Z of ZONES) { const d = Math.hypot(x - Z.x, z - Z.z) - Z.r; if (d < bd) { bd = d; best = Z; } } return best; };
// the ranger's fire tower in the pine forest, the wreck on the reef, the harbour's breakwater and the crater
export const TOWER = { x: -392, z: -206 };
export const WRECK = { x: -238, z: 296, yaw: 0.7 };
export const BREAKWATER = [[446, -214], [404, -204], [389, -182]];
export const CRATER = { x: 320, z: 390, r: 11 };
export const LAKE = { x: -424, z: -246, r: 28 };
function bar(a, b, w, h) {
  const x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2;
  return { x, z, bar: [a[0], a[1], b[0], b[1]], w, h, r: 0, coast: 0, forest: 0, palms: 0, reach: Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + w + 12 };
}
ISLANDS.push(
  // the pine forest: a big wooded island round a lake that only something that flies can reach, and a wooded islet
  lobe(-420, -250, 104, 26, { forest: 1, pine: 1, coast: 0.28, palms: 0, pow: 1.0, dents: [{ ...LAKE, y: -3.5, f: 30 }],
    flats: [{ x: -370, z: -302, r: 10, site: 'Pine clearing', pad: true }, { x: -478, z: -210, r: 10, site: 'Lakeside camp' }, { x: TOWER.x, z: TOWER.z, r: 6 }] }),
  lobe(-318, -338, 30, 9, { forest: 0.9, pine: 1, palms: 0 }),
  // the reef: a second atoll, with coral flats just under the surface round it (and the old wreck aground on one)
  lobe(-335, 385, 58, 2.5, { coast: 0.14, forest: 0, palms: 0.45, dents: [{ x: -335, z: 385, r: 26, y: -4 }, { x: -296, z: 362, r: 7, y: -4 }, { x: -284, z: 350, r: 7, y: -4 }] }),
  lobe(-238, 300, 34, 0.4, { coast: 0.45, forest: 0, palms: 0, sub: -4.4 }),
  lobe(-262, 418, 26, 0.4, { coast: 0.45, forest: 0, palms: 0, sub: -4.4 }),
  // harbour town on its terrace above a walled harbour
  lobe(482, -160, 72, 9, { coast: 0.14, forest: 0.18, palms: 0.06, town: 1, dents: [{ x: 418, z: -160, r: 26, y: -6 }],
    flats: [{ x: 492, z: -160, r: 34, y: 5 }, { x: 502, z: -112, r: 9, y: 5, site: 'Town square', pad: true }] }),
  ...BREAKWATER.slice(1).map((b, i) => bar(BREAKWATER[i], b, 3, 2.4)),
  // the snowy peaks: a ridged range with a sheltered cove where the ice floes collect, and a second peak behind
  lobe(30, -505, 105, 30, { ridge: 70, pow: 1.8, cliff: 10, cliffDir: [0, -1], forest: 0.6, pine: 1, palms: 0, treeLine: 12, dents: [{ x: 96, z: -432, r: 26, y: -6 }],
    flats: [{ x: 10, z: -550, r: 13, y: 12, site: 'Ski hut', pad: true }] }),
  lobe(128, -548, 52, 22, { ridge: 40, pow: 1.8, forest: 0.5, pine: 1, palms: 0, treeLine: 12 }),
  // the volcano: a cone with a crater on top, black-sand coves and terraces on its slopes
  lobe(CRATER.x, CRATER.z, 82, 5, { cone: { h: 62, crater: CRATER.r, deep: 10 }, coast: 0.2, forest: 0.4, palms: 0.12, treeLine: 13, cliff: 6, cliffDir: [0.8, 0.6],
    dents: [{ x: 252, z: 345, r: 24, y: -6 }], flats: [{ x: 346, z: 360, r: 9, site: 'Lava lookout', pad: true }, { x: 362, z: 448, r: 9, site: 'Black sand camp' }] }),
);
// tiny sandbars where friends get stranded
export const ISLETS = [
  { x: 95, z: 60 }, { x: -70, z: -95 }, { x: 110, z: -70 }, { x: -20, z: 135 },
  { x: 60, z: 250 }, { x: -120, z: -260 }, { x: 250, z: -40 }, { x: -230, z: 120 },
  { x: 120, z: -262 }, { x: -110, z: 5 },
];
for (const I of ISLANDS) if (!I.bar) I.reach = I.r * (1 + I.coast) * 1.34;
for (const s of ISLETS) ISLANDS.push({ x: s.x, z: s.z, r: 17, h: 3.2, islet: true, reach: 17, forest: 0, palms: 0.2 });
// sandbars and cays out in the zones (the reef's cays, the volcano's black-sand bars, the breakwater's head)
export const ZONE_ISLETS = [
  { x: -210, z: 352, zone: 'reef' }, { x: -300, z: 282, zone: 'reef' }, { x: -392, z: 300, zone: 'reef' },
  { x: 236, z: 440, zone: 'volcano' }, { x: 410, z: 330, zone: 'volcano' },
  { x: -470, z: -100, zone: 'forest' },
  { x: 386, z: -178, zone: 'harbour', r: 8, head: true },
];
for (const s of ZONE_ISLETS) ISLANDS.push({ x: s.x, z: s.z, r: s.r || 17, h: s.head ? 2.6 : 3.2, islet: true, reach: s.r || 17, forest: 0, palms: s.head ? 0 : 0.2 });
// which islands can reach each 40 m square of the map, so a height is worked out from the few nearby, not all of them
const BK = 40, BKN = Math.ceil(TSPAN / BK) + 2, BKH = (BKN * BK) / 2, buckets = Array.from({ length: BKN * BKN }, () => []);
for (const I of ISLANDS) {
  const i0 = Math.max(0, Math.floor((I.x - I.reach + BKH) / BK)), i1 = Math.min(BKN - 1, Math.floor((I.x + I.reach + BKH) / BK));
  const j0 = Math.max(0, Math.floor((I.z - I.reach + BKH) / BK)), j1 = Math.min(BKN - 1, Math.floor((I.z + I.reach + BKH) / BK));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const nx = Math.max(i * BK - BKH, Math.min(I.x, (i + 1) * BK - BKH)), nz = Math.max(j * BK - BKH, Math.min(I.z, (j + 1) * BK - BKH));
    if ((nx - I.x) ** 2 + (nz - I.z) ** 2 < I.reach * I.reach) buckets[j * BKN + i].push(I);
  }
}

export const OBSTACLES = [
  { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 6.5, top: 42 },
  { x: STATION.x, z: STATION.z, r: 15, top: 24 },
  // the arch's two feet; and, for the easy helicopter only, the whole arch, which it flies round rather than through
  ...[-1, 1].map(k => ({ x: ARCH.x + k * 12.5 * Math.cos(ARCH.yaw), z: ARCH.z + k * 12.5 * Math.sin(ARCH.yaw), r: 6, top: 24, wr: 7.5 })),
  { x: ARCH.x, z: ARCH.z, r: 19, top: 25, easy: true },
  ...HUTS.map(h => ({ x: h.x, z: h.z, r: 6, top: 13 })),
];
// (wr, where there is one, is how far it reaches out at the waterline: what a hull keeps clear of)
// the boulders in the shallows that break the surface, which a hull must also keep clear of
export const SHOALS = [];

function islandHeight(I, x, z, natural) {
  const dx = x - I.x, dz = z - I.z, d2 = dx * dx + dz * dz;
  if (d2 >= I.reach * I.reach) return SEA_FLOOR;
  if (I.bar) {
    // a breakwater: a level-topped wall of rubble along a line, steep-sided down to the sea bed
    const [ax, az, bx, bz] = I.bar, ux = bx - ax, uz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz)));
    const d = Math.hypot(x - ax - t * ux, z - az - t * uz);
    return I.h + (fbm(x * 0.3, z * 0.3) - 0.5) * 0.4 + (SEA_FLOOR - I.h) * smooth((d - I.w) / 9);
  }
  const dist = Math.sqrt(d2);
  // (a sandbar has a little level top to stand on)
  if (I.islet) { const d = Math.max(0, dist - 3.5) / (I.r - 3.5), s = 1 - d * d * (3 - 2 * d); return SEA_FLOOR + (I.h - SEA_FLOOR) * Math.pow(s, 0.8); }
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
    if (I.cone) {
      // a volcano: a cone rising to a rim, gullied down its sides, with a bowl of a crater inside the rim
      const c = I.cone, span = I.r * 0.95, rim = c.h * Math.pow(1 - c.crater / span, 1.7);
      let k = Math.min(rim, c.h * Math.pow(Math.max(0, 1 - dist / span), 1.7));
      k *= 0.86 + 0.28 * ridged(x * 0.05 + I.sx, z * 0.05 + I.sz) * smooth((dist - c.crater) / 10);
      if (dist < c.crater) k -= c.deep * (1 - (dist / c.crater) ** 2);
      h += k;
    }
    if (I.cliff) {
      // a sea cliff: the ground climbs to the cliff top almost at once, then runs level until the hill behind catches up
      const face = I.cliffDir ? smooth(((dx * I.cliffDir[0] + dz * I.cliffDir[1]) / (dist || 1) + 0.25) / 0.6) : 1;
      const t = (h - 2.4) / (I.cliff - 2.4);
      if (t > 0) h = Math.max(h, 2.4 + (I.cliff - 2.4) * face * smooth(t / 0.26));
    }
  }
  if (I.sub) h += I.sub;
  if (I.dents) for (const D of I.dents) { const w = 1 - smooth((Math.hypot(x - D.x, z - D.z) - D.r) / (D.f || 14)); if (w > 0) h += (D.y - h) * w; }
  if (I.flats && !natural) for (const F of I.flats) { const w = 1 - smooth((Math.hypot(x - F.x, z - F.z) - F.r) / 9); if (w > 0) h += (F.y - h) * w; }
  return h;
}
// places a helicopter can set down away from the base: { x, z, y, r, name, pad }
export const SITES = [];
for (const I of ISLANDS) for (const F of I.flats || []) {
  if (F.y === undefined) {
    // (level with its own hillside, or with a neighbouring hill that reaches over it, so that does not bulge through)
    let over = SEA_FLOOR;
    for (const J of ISLANDS) if (J !== I) for (let a = 0; a < 6.283; a += 0.3) for (let r = 0; r <= F.r + 0.01; r += F.r / 4) over = Math.max(over, islandHeight(J, F.x + Math.cos(a) * r, F.z + Math.sin(a) * r, true));
    F.y = Math.max(Math.round(islandHeight(I, F.x, F.z, true) * 2) / 2, Math.ceil(over * 2 + 0.2) / 2);
  }
  if (F.site) SITES.push({ x: F.x, z: F.z, y: F.y, r: F.r, name: F.site, pad: !!F.pad });
}
export function terrainHeight(x, z) {
  const i = Math.floor((x + BKH) / BK), j = Math.floor((z + BKH) / BK);
  if (i < 0 || j < 0 || i >= BKN || j >= BKN) return SEA_FLOOR;
  let h = SEA_FLOOR;
  for (const I of buckets[j * BKN + i]) { const ih = islandHeight(I, x, z); if (ih > h) h = ih; }
  return h;
}

// how far the treetops stand above the ground, so helicopters cruise over the forest and not through it
const CAN_N = 280, CAN_SPAN = TSPAN;
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
function clearCanopy(x, z, radius) {
  const cell = CAN_SPAN / CAN_N;
  for (let j = 0; j < CAN_N; j++) for (let i = 0; i < CAN_N; i++) {
    const cx = ((i + 0.5) / CAN_N - 0.5) * CAN_SPAN, cz = ((j + 0.5) / CAN_N - 0.5) * CAN_SPAN;
    if (Math.hypot(cx - x, cz - z) < radius + cell * 0.5) canopy[j * CAN_N + i] = 0;
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
  float fade = (1.0 - smoothstep(900.0, 2000.0, length(wp.xz))) * uSwell;
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
uniform sampler2D uHeightTex, uRipple, uNoise;
uniform vec3 uReef;        // the coral reef: x, z, radius
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

  float th = texture2D(uHeightTex, p / ${TSPAN.toFixed(1)} + 0.5).r * 30.0 - 14.0;
  float depth = vWorld.y - th;
  // clear water over sand is turquoise only where it is shallow; a few metres down the open sea takes over
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 7.5, depth));
  float light = 0.25 + 0.75 * max(dot(N, uSunDir), 0.0);
  // coral heads seen through the clear water over the reef: dark, mottled patches in the shallows
  float reefW = (1.0 - smoothstep(uReef.z, uReef.z + 40.0, length(p - uReef.xy))) * smoothstep(8.0, 2.0, depth);
  if (reefW > 0.0) {
    vec4 cn = texture2D(uNoise, p / 70.0);
    float patchy = smoothstep(0.42, 0.62, cn.r * 0.6 + texture2D(uNoise, p / 17.0).g * 0.4);
    vec3 coral = mix(vec3(0.03, 0.13, 0.12), vec3(0.16, 0.12, 0.13), smoothstep(0.35, 0.65, cn.b));
    body = mix(body, coral, patchy * reefW * 0.8);
  }
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
// where the ground turns snowy above the snow line, black with volcanic sand and ash, or brown with pine needles
// (circles x, z, r; the ground shader fades each out over 40 m beyond r)
const SNOW_AREA = [60, -515, 150], ASH_AREA = [320, 390, 95], PINE_AREA = [-405, -262, 125];
const zoneUniforms = {
  uSnowZ: { value: new THREE.Vector3(...SNOW_AREA) }, uAshZ: { value: new THREE.Vector3(...ASH_AREA) }, uPineZ: { value: new THREE.Vector3(...PINE_AREA) },
};
export const snowAt = (x, z) => 1 - smooth((Math.hypot(x - SNOW_AREA[0], z - SNOW_AREA[1]) - SNOW_AREA[2]) / 40);
// One material for the land and (with rocky set) for every boulder on it: scanned sand, mossy turf and rock, laid by
// height and steepness in world space, so a rock half buried in the beach takes the beach's wet line and the hill's moss.
function groundMaterial(noiseTex, rocky) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const uniforms = {
    tSandC: { value: groundTex('sand', 'c') }, tSandN: { value: groundTex('sand', 'n') },
    tMossC: { value: groundTex('moss', 'c') }, tMossN: { value: groundTex('moss', 'n') },
    tRockC: { value: groundTex('rock', 'c') }, tRockN: { value: groundTex('rock', 'n') }, tNoise: { value: noiseTex }, ...zoneUniforms,
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
        uniform vec3 uSnowZ, uAshZ, uPineZ;
        float zoneW(vec3 Z, vec2 p) { return 1.0 - smoothstep(Z.z, Z.z + 40.0, length(p - Z.xy)); }
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
        float wAsh = zoneW(uAshZ, gp), wPine = zoneW(uPineZ, gp), wSnowZ = zoneW(uSnowZ, gp);
        sandC = mix(sandC, mix(sandC, vec3(0.34, 0.35, 0.37), 0.75), wSnowZ);                       // shingle on the cold shore
        sandC = mix(sandC, vec3(0.075, 0.07, 0.068) * (0.75 + 0.5 * n2), wAsh);                      // black volcanic sand
        grass = mix(grass, grass * vec3(0.6, 0.55, 0.36), wAsh * 0.8);
        rockC = mix(rockC, rockC * vec3(0.34, 0.32, 0.32), wAsh);
        grass = mix(grass, grass * vec3(0.66, 0.74, 0.5), wPine);
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
        // snow lies above the snow line wherever it is not too steep to hold it (on boulders too)
        float wSnow = wSnowZ * smoothstep(6.0, 11.0, vTP.y + (n2 - 0.5) * 7.0 + (n3 - 0.5) * 1.5) * (1.0 - smoothstep(0.4, 0.62, steep + (n3 - 0.5) * 0.12));
        col = mix(col, vec3(0.78, 0.82, 0.9) * (0.92 + 0.12 * n3), wSnow);
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
  // The whole map's heights on one grid, then cut into tiles that each own their vertices; a tile with nothing but deep
  // sea bed in it is never built (the sea above it hides it), so a bigger map with open water between costs little.
  const TN = TSPAN / TSTEP, TR = TN + 1, H = new Float32Array(TR * TR);
  for (let j = 0; j < TR; j++) for (let i = 0; i < TR; i++) H[j * TR + i] = terrainHeight(i * TSTEP - TSPAN / 2, j * TSTEP - TSPAN / 2);
  const hAt = (i, j) => H[Math.min(TN, Math.max(0, j)) * TR + Math.min(TN, Math.max(0, i))];
  // (stride: use every stride-th grid point, for a lighter copy; tile: that many cells a side)
  function landTiles(stride, tile, material, setup) {
    const group = new THREE.Group(), cells = TN / stride, n = Math.ceil(cells / tile);
    for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
      const c0 = tx * tile, r0 = ty * tile, cw = Math.min(tile, cells - c0), rh = Math.min(tile, cells - r0);
      let top = -1e9;
      for (let r = 0; r <= rh; r++) for (let c = 0; c <= cw; c++) top = Math.max(top, hAt((c0 + c) * stride, (r0 + r) * stride));
      if (top < -4) continue;
      const vn = (cw + 1) * (rh + 1), pos = new Float32Array(vn * 3), nor = new Float32Array(vn * 3), idx = new Uint32Array(cw * rh * 6);
      let k = 0;
      for (let r = 0; r <= rh; r++) for (let c = 0; c <= cw; c++, k++) {
        const i = (c0 + c) * stride, j = (r0 + r) * stride;
        pos[k * 3] = i * TSTEP - TSPAN / 2; pos[k * 3 + 1] = hAt(i, j); pos[k * 3 + 2] = j * TSTEP - TSPAN / 2;
        // (the normal from the neighbours on the full grid, so tiles meet without a seam of light)
        const nx = hAt(i - stride, j) - hAt(i + stride, j), nz = hAt(i, j - stride) - hAt(i, j + stride), ny = 2 * stride * TSTEP, l = Math.hypot(nx, ny, nz);
        nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
      }
      k = 0;
      for (let r = 0; r < rh; r++) for (let c = 0; c < cw; c++) {
        const a = r * (cw + 1) + c, b = a + cw + 1;
        idx[k++] = a; idx[k++] = b; idx[k++] = a + 1; idx[k++] = b; idx[k++] = b + 1; idx[k++] = a + 1;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingBox(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, material);
      setup(m);
      group.add(m);
    }
    return group;
  }
  const groundMat = groundMaterial(noiseTex, false), rockMat = groundMaterial(noiseTex, true);
  const terrain = landTiles(1, 100, groundMat, tile => { tile.receiveShadow = tile.castShadow = true; tile.layers.set(PLANT_LAYER); });
  // the mirror in the water only needs the land's shape above the waterline, seen softly: a copy far less dense
  const mirrorLand = landTiles(4, 50, groundMat, tile => { tile.layers.set(MIRROR_LAYER); tile.receiveShadow = true; });
  scene.add(mirrorLand);
  world.terrain = terrain;
  scene.add(terrain);

  // height map for the water shader (shallows + shore foam), straight off the same grid: row j runs along x
  const hdata = new Uint8Array(TR * TR);
  for (let i = 0; i < TR * TR; i++) hdata[i] = Math.round(THREE.MathUtils.clamp((H[i] + 14) / 30, 0, 1) * 255);
  const heightTex = new THREE.DataTexture(hdata, TR, TR, THREE.RedFormat, THREE.UnsignedByteType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.unpackAlignment = 1;      // (rows of an odd number of bytes)
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
    uHeightTex: { value: heightTex }, uRipple: { value: rippleTexture() }, uNoise: { value: noiseTex }, uReef: { value: new THREE.Vector3(-290, 355, 120) },
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
    keepOut.push({ x: s.x, z: s.z, r: s.r + 9 });       // (a glade wide enough that the big trees' crowns do not reach over it)
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
  place('World_Beach', BEACH.x, BEACH.z, { y: BEACH.y, yaw: 1.5 });
  keepOut.push({ x: STATION.x, z: STATION.z, r: 25 }, { x: 0, z: -6.5, r: 16 }, { x: 0, z: 40, r: 9 }, { x: 0, z: 52, r: 9 }, { x: BEACH.x, z: BEACH.z, r: 9 }, { x: 0, z: 8, r: 34 });
  world.paddock = { x: 0, z: -3, r: 9 };
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1133, emissiveIntensity: 0 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), beaconMat);
  { // (it tops the control tower's mast, the highest point of the station, which stands off to one side of it)
    const sp = geo('World_Station').attributes.position, top = modelInfo('World_Station').size[1];
    let bx = 0, bz = 0, bn = 0;
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) > top - 0.3) { bx += sp.getX(i); bz += sp.getZ(i); bn++; }
    beacon.position.set(STATION.x + bx / bn, BASE_Y + top + 0.2, STATION.z + bz / bn); scene.add(beacon);
  }

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
  const PINES = ['World_Pine', 'World_Pine2', 'World_Pine'];
  const PALMS = ['World_Palm', 'World_Palm2', 'World_Palm3'], BUSHES = ['World_Bush', 'World_Bush2'], ROCKS = ['World_Rock', 'World_Rock2', 'World_Rock3'];
  const pick = list => list[(rnd() * list.length) | 0];
  const rocks = { World_Rock: [], World_Rock2: [], World_Rock3: [], World_Driftwood: [] };
  // the lowest ground under something r across, so it stands on a slope with none of its underside showing
  const low = (x, z, r) => { let y = terrainHeight(x, z); for (let k = 0; k < 8; k++) y = Math.min(y, terrainHeight(x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r)); return y; };
  const footOf = name => { const b = geo(name).boundingBox || (geo(name).computeBoundingBox(), geo(name).boundingBox); return Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z) * 0.8; };
  // (dy: how far it sinks below the lowest ground under it)
  const rock = (name, x, dy, z, s) => {
    dm.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6.283, (rnd() - 0.5) * 0.5); dm.scale.set(s, s * (0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.4));
    const y = low(x, z, footOf(name) * s) + dy;
    dm.position.set(x, y, z); dm.updateMatrix();
    rocks[name].push({ m: dm.matrix.clone(), x, z, cy: y, r: s * 1.6 });
    return dm.matrix;
  };
  // how far a rock reaches out from where it stands, at the height of the sea (0 if it stays under it): what a hull must keep clear of
  const _v = new THREE.Vector3();
  const waterline = (name, m) => {
    const P = geo(name).attributes.position; let r = 0;
    for (let i = 0; i < P.count; i++) { _v.fromBufferAttribute(P, i).applyMatrix4(m); if (_v.y > -0.7 && _v.y < 3) r = Math.max(r, Math.hypot(_v.x - m.elements[12], _v.z - m.elements[14])); }
    return r;
  };
  // ---------- the far zones' buildings
  // Each zone's own things go in a group of their own, which world.cull hides when a view is far from that zone (from
  // the home bay none of them is drawn, and the far zones' buildings are only specks by then).
  const zoneGroups = {};
  const zplace = (zone, name, x, z, o) => { const m = place(name, x, z, o); scene.remove(m); (zoneGroups[zone] ||= new THREE.Group()).add(m); return m; };
  // the ranger's fire tower on its own level patch in the pines; the ranger waits on the corner of its deck
  {
    const y = terrainHeight(TOWER.x, TOWER.z);
    zplace('forest', 'World_FireTower', TOWER.x, TOWER.z, { y });
    OBSTACLES.push({ x: TOWER.x, z: TOWER.z, r: 4, top: y + 17.6 });
    keepOut.push({ x: TOWER.x, z: TOWER.z, r: 7 });
    clearCanopy(TOWER.x, TOWER.z, 8);
    world.towerDeck = { x: TOWER.x - 2.4, y: y + 12.1, z: TOWER.z + 2.4 };
  }
  // the ski hut, on the far side of its landing pad from the slope, its porch toward the pad
  {
    const s = SITES.find(q => q.name === 'Ski hut');
    let a = 0, best = 1e9;
    for (let k = 0; k < 16; k++) { const b = k * 0.3927, d = Math.abs(terrainHeight(s.x + Math.cos(b) * 15, s.z + Math.sin(b) * 15) - s.y); if (d < best) { best = d; a = b; } }
    const hx = s.x + Math.cos(a) * 10.5, hz = s.z + Math.sin(a) * 10.5;
    zplace('snow', 'World_SkiHut', hx, hz, { y: s.y, yaw: Math.atan2(s.x - hx, s.z - hz) });
    OBSTACLES.push({ x: hx, z: hz, r: 5, top: s.y + 7.5 });
    keepOut.push({ x: hx, z: hz, r: 8 });
    s.block = { x: hx, z: hz, r: 6.5 };
  }
  // harbour town: rows of tall narrow houses stepping round the terrace, facing the harbour, painted every colour,
  // with the quays, moored boats and a crane down at the water, and a little light on the breakwater's head
  world.roofs = [];
  {
    const T = { x: 492, z: -160, r: 34, y: 5 }, sq = SITES.find(q => q.name === 'Town square');
    const WALLS = ['#f4d27a', '#f29a7a', '#9fd3e6', '#f6efe2', '#b9e0a5', '#e8a6c8', '#f2b65e', '#cfd8ff'].map(c => new THREE.Color(c).multiplyScalar(2.1));
    const ROOFS = ['#c8553d', '#a8442f', '#5d6b78', '#3f5f7a', '#b4613f'].map(c => new THREE.Color(c).multiplyScalar(2.6));
    const spots = [];
    for (let ring = 0; ring < 3; ring++) {
      const rr = 9 + ring * 9.5, n = Math.round(rr * 0.62);
      for (let i = 0; i < n; i++) {
        const a = (i + ring * 0.5) / n * 6.283 + (rnd() - 0.5) * 0.12, x = T.x + Math.cos(a) * rr, z = T.z + Math.sin(a) * rr;
        if (Math.hypot(x - sq.x, z - sq.z) < sq.r + 7 || Math.hypot(x - T.x, z - T.z) > T.r - 3) continue;
        if (Math.abs(terrainHeight(x, z) - T.y) > 0.3) continue;
        spots.push({ x, z, yaw: Math.atan2(T.x - x, T.z - z) + Math.PI + (rnd() - 0.5) * 0.3 });
      }
    }
    const walls = new THREE.InstancedMesh(geo('World_House'), geo('World_House').userData.mats.map(mn => look(mn, { bake: 'World_House' })), spots.length);
    const roofs = new THREE.InstancedMesh(geo('World_HouseRoof'), geo('World_HouseRoof').userData.mats.map(mn => look(mn, { bake: 'World_HouseRoof' })), spots.length);
    spots.forEach((s, i) => {
      const k = 0.9 + rnd() * 0.25;
      dm.position.set(s.x, T.y, s.z); dm.rotation.set(0, s.yaw, 0); dm.scale.set(k, 0.9 + rnd() * 0.35, k); dm.updateMatrix();
      walls.setMatrixAt(i, dm.matrix); roofs.setMatrixAt(i, dm.matrix);
      walls.setColorAt(i, WALLS[(rnd() * WALLS.length) | 0]); roofs.setColorAt(i, ROOFS[(rnd() * ROOFS.length) | 0]);
      const top = T.y + modelInfo('World_HouseRoof').size[1] * dm.scale.y + modelInfo('World_HouseRoof').min[1] * dm.scale.y;
      OBSTACLES.push({ x: s.x, z: s.z, r: 4.6 * k, top });
      keepOut.push({ x: s.x, z: s.z, r: 6 });
      world.roofs.push({ x: s.x, z: s.z, y: top - 0.25 });
    });
    for (const m of [walls, roofs]) { m.castShadow = m.receiveShadow = true; (zoneGroups.harbour ||= new THREE.Group()).add(m); }
    // the quay: two piers out into the harbour from its eastern shore, a crane by them, boats tied up alongside
    for (const qz of [-168, -146]) {
      let qx = 418; while (qx < 470 && terrainHeight(qx, qz) < 0.4) qx += 1;
      zplace('harbour', 'World_Jetty', qx - 2, qz, { y: 0.35, yaw: -Math.PI / 2, scale: 1.2 });
      keepOut.push({ x: qx - 6, z: qz, r: 8 });
    }
    { let cx = 418; while (cx < 470 && terrainHeight(cx, -185) < 1.2) cx += 1;
      zplace('harbour', 'World_Crane', cx + 4, -185, { y: terrainHeight(cx + 4, -185), yaw: -Math.PI / 2 });
      OBSTACLES.push({ x: cx + 4, z: -185, r: 3.5, top: terrainHeight(cx + 4, -185) + 21 }); keepOut.push({ x: cx + 4, z: -185, r: 7 }); }
    world.moored = [];
    for (const [bx, bz, name, yaw] of [[428, -178, 'World_Boat2', -1.5], [426, -157, 'World_Boat', -1.62]]) {
      const b = zplace('harbour', name, bx, bz, { y: 0, yaw, scale: name === 'World_Boat2' ? 1.3 : 1.5 });
      b.rotation.order = 'YXZ';
      world.moored.push({ m: b, x: bx, z: bz, yaw });
      OBSTACLES.push({ x: bx, z: bz, r: 6, top: 9, wr: 6.5 });
    }
    // the light on the breakwater's head
    const head = ZONE_ISLETS.find(s => s.head);
    zplace('harbour', 'World_Lighthouse', head.x + 2, head.z - 1.5, { scale: 0.42, yaw: 0.6 });
    OBSTACLES.push({ x: head.x + 2, z: head.z - 1.5, r: 2.8, top: terrainHeight(head.x, head.z) + 18 });
    keepOut.push({ x: head.x, z: head.z, r: 9 });
    world.breakwaterHead = { x: head.x - 2.5, z: head.z + 2 };
    // armour stones along both sides of the breakwater, half in and half out of the water
    for (let i = 0; i + 1 < BREAKWATER.length; i++) {
      const [ax, az] = BREAKWATER[i], [bx, bz] = BREAKWATER[i + 1], len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let d = 2; d < len - 1; d += 2.6) for (const side of [-1, 1]) {
        const x = ax + (bx - ax) * d / len + nx * side * (4.2 + rnd()), z = az + (bz - az) * d / len + nz * side * (4.2 + rnd());
        rock(pick(ROCKS), x, -0.6, z, 0.9 + rnd() * 0.6);
      }
    }
  }
  // the wreck: an old fishing boat run up on the coral, listing, rusted and long since given up
  {
    const w = zplace('reef', 'World_Boat', WRECK.x, WRECK.z, { y: -1.5, yaw: WRECK.yaw, scale: 1.5, opts: { tints: { Navy: new THREE.Color(0.16, 0.06, 0.03), Paint: new THREE.Color(0.32, 0.27, 0.2) } } });
    w.rotation.order = 'YXZ'; w.rotation.x = -0.12; w.rotation.z = 0.32;
    OBSTACLES.push({ x: WRECK.x, z: WRECK.z, r: 8, top: 9, wr: 9 });
    keepOut.push({ x: WRECK.x, z: WRECK.z, r: 10 });
    world.wreckMesh = w;
    world.wreck = { x: WRECK.x, z: WRECK.z, y: -1.5, yaw: WRECK.yaw, deck: 1.7, crew: 0, wreck: true };
  }

  const blocked = (x, z) => keepOut.some(k => (x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r);
  for (const s of ISLETS) keepOut.push({ x: s.x, z: s.z, r: 6.5 });      // (whoever is stranded on a sandbar stands in the middle)
  for (const I of ISLANDS) for (const D of I.dents || []) if (D.r < 10) keepOut.push({ x: D.x, z: D.z, r: D.r + 9 });      // (the atoll's reef channel)
  for (const I of ISLANDS) {
    const cell = 5.6;
    for (let gx = I.x - I.reach; gx < I.x + I.reach; gx += cell) for (let gz = I.z - I.reach; gz < I.z + I.reach; gz += cell) {
      const x = gx + rnd() * cell, z = gz + rnd() * cell, r = rnd();
      const y = islandHeight(I, x, z);
      if (y < -2.5 || y < terrainHeight(x, z) - 0.01) continue;                 // sea, or a neighbouring lobe stands higher here
      const steep = Math.hypot(terrainHeight(x + 1.5, z) - terrainHeight(x - 1.5, z), terrainHeight(x, z + 1.5) - terrainHeight(x, z - 1.5)) / 3;
      if (y < 0.9) {
        // (none in the reef channel or by the jetty and huts, and only pebbles off a sandbar)
        if (r < (I.cliff ? 0.2 : 0.07) && !blocked(x, z)) { const name = pick(ROCKS), w = waterline(name, rock(name, x, -0.2, z, (0.5 + rnd() * rnd() * 2.6) * (I.islet ? 0.4 : 1))); if (w > 0) SHOALS.push({ x, z, r: w }); }
        continue;
      }
      if (blocked(x, z)) continue;
      if (steep > 0.75) { if (r < 0.1) rock(pick(ROCKS), x, -0.3, z, 0.7 + rnd() * 1.5); continue; }
      if (y < 3.4) {
        // the beach: palms leaning over it, driftwood and scrub along the top of the sand
        if (r < I.palms) { const s = 0.85 + rnd() * 0.45; plant(pick(PALMS), x, y - 0.25, z, s, 0.2); raiseCanopy(x, z, 3, 9 * s); }
        else if (r < I.palms + 0.05) rock('World_Driftwood', x, -0.1, z, 0.7 + rnd() * 0.8);
        else if (r < I.palms + 0.16 && y > 2) plant(pick(BUSHES), x, y - 0.05, z, 0.7 + rnd() * 0.9);
        else if (r > 0.97) rock(pick(ROCKS), x, -0.2, z, 0.4 + rnd() * 0.9);
        continue;
      }
      // inland: forest in drifts with glades between, scrub in the gaps, the odd boulder
      const glade = fbm(x * 0.03 + 5.3, z * 0.03 - 8.1);
      const line = I.treeLine || 38, wood = I.forest * smooth((glade - 0.3 + I.forest * 0.22) / 0.22) * (1 - smooth((y - line) / (line < 20 ? 5 : 12)));

      if (r < wood * 0.82) {
        const s = 0.75 + rnd() * 0.75, name = pick(I.pine ? PINES : TREES);
        plant(name, x, y - 0.35, z, s);
        raiseCanopy(x, z, 7, modelInfo(name).size[1] * s * 1.1);
      } else if (r < wood * 0.82 + 0.16 && y < line + 3) plant(pick(BUSHES), x, y - 0.05, z, 0.8 + rnd() * 1.4);
      else if (r > 0.975) rock(pick(ROCKS), x, -0.3, z, 0.5 + rnd() * 1.4);
    }
  }
  // sea stacks: tall rocks standing in the water off the sea cliffs (on the side a cliff faces), clear of the arch, the
  // huts, the other islands and sandbars, the patrol boat's beat round the base, the edge of the world and each other
  const stacks = [];
  const stackOk = (I, x, z, y) => y < -1.5 && y > -9 && (zoneOf(x, z).id === 'home' ? Math.hypot(x, z) > 205 && Math.hypot(x, z) < HOME_R - 25 : Math.hypot(x, z) < WORLD_R - 30)
    && Math.hypot(x - ARCH.x, z - ARCH.z) > 40 && HUTS.every(h => Math.hypot(x - h.x, z - h.z) > 40)
    && ISLANDS.every(J => J === I || Math.hypot(x - J.x, z - J.z) > J.reach + (J.islet ? 15 : 6))
    && stacks.every(q => Math.hypot(x - q.x, z - q.z) > 24);
  for (const I of ISLANDS) if (I.cliff) for (let k = 0, n = 3 + ((rnd() * 3) | 0), placed = 0; k < 40 && placed < n; k++) {
    const a = I.cliffDir ? Math.atan2(I.cliffDir[1], I.cliffDir[0]) + (rnd() - 0.5) * 2.6 : rnd() * 6.283, d = I.r * (1.15 + rnd() * 0.4);
    const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, s = 2.2 + rnd() * 3;
    // (wholly in the water: no part of it overhanging the beach)
    let high = terrainHeight(x, z);
    for (let q = 0; q < 8; q++) high = Math.max(high, terrainHeight(x + Math.cos(q * 0.785) * s * 1.1, z + Math.sin(q * 0.785) * s * 1.1));
    if (!stackOk(I, x, z, terrainHeight(x, z)) || high > -0.6) continue;
    const y = low(x, z, s * 0.9);
    dm.position.set(x, y - 1, z); dm.rotation.set(0, rnd() * 6.283, 0); dm.scale.set(s, s * (1.6 + rnd() * 1.4), s); dm.updateMatrix();
    const name = pick(ROCKS), wr = waterline(name, dm.matrix);
    if (!wr) continue;                  // (one that would not even break the surface)
    placed++; stacks.push({ x, z });
    rocks[name].push({ m: dm.matrix.clone(), x, z, cy: y + s * 3, r: s * 6 });
    OBSTACLES.push({ x, z, r: s * 1.8, top: y + s * 6, wr });
    // (and a place just to seaward of it where a raft can fetch up)
    const out = wr + 10, sx2 = x + Math.cos(a) * out, sz2 = z + Math.sin(a) * out;
    if (terrainHeight(sx2, sz2) < -3) world.spawn.stacks.push({ x: sx2, z: sz2, zone: zoneOf(sx2, sz2).id });
  }
  // ledges on the sea cliffs, where only the helicopter's basket can reach: find the cliff face, then step back from
  // its edge to the first patch of level ground, and clear the plants and boulders off it
  world.spawn.ledges = [];
  const slope = (x, z) => Math.hypot(terrainHeight(x + 1.5, z) - terrainHeight(x - 1.5, z), terrainHeight(x, z + 1.5) - terrainHeight(x, z - 1.5)) / 3;
  for (const I of ISLANDS) if (I.cliff) for (let k = 0; k < 64; k++) {
    const a = (k / 64) * 6.283, ca = Math.cos(a), sa = Math.sin(a);
    for (let d = I.r * 0.6; d < I.r * 1.4; d += 1.5) {
      const x = I.x + ca * d, z = I.z + sa * d, y = terrainHeight(x, z);
      if (!(y > 5 && y < 15 && slope(x, z) > 0.9 && terrainHeight(x + ca * 6, z + sa * 6) < y - 3)) continue;
      for (let e = d - 1; e > d - 8; e -= 0.5) {
        const lx = I.x + ca * e, lz = I.z + sa * e, ly = terrainHeight(lx, lz);
        let flat = slope(lx, lz) < 0.35;
        for (let q = 0; q < 6 && flat; q++) flat = Math.abs(terrainHeight(lx + Math.cos(q * 1.047) * 1.2, lz + Math.sin(q * 1.047) * 1.2) - ly) < 0.5;
        if (!flat) continue;
        if (ly > 5 && ly < 18 && !blocked(lx, lz) && terrainHeight(lx + ca * 7, lz + sa * 7) < ly - 3) world.spawn.ledges.push({ x: lx, z: lz, zone: zoneOf(lx, lz).id });
        break;
      }
      break;
    }
  }
  const nearLedge = it => world.spawn.ledges.some(l => (it.x - l.x) ** 2 + (it.z - l.z) ** 2 < 16);
  for (const [name, list] of species) species.set(name, list.filter(it => !nearLedge(it)));
  for (const name in rocks) rocks[name] = rocks[name].filter(it => it.cy < 2 || !nearLedge(it));
  // the trees round a landing site stand back from it, so their tops must not roof it over either
  for (const s of SITES) clearCanopy(s.x, s.z, s.r + 3);
  for (const zone in zoneGroups) scene.add(zoneGroups[zone]);
  world.zoneGroups = zoneGroups;
  const lodded = [];
  let plantCount = 0;
  for (const [name, list] of species) {
    const leaf = modelInfo(name).groups.filter(g => /^Leaf/.test(g.mat)).sort((a, b) => b.count - a.count)[0];
    const tiers = [name, name + '_far'].map((n, far) => {
      const g = geo(n);
      const mesh = new THREE.InstancedMesh(g, g.userData.mats.map(mn => foliage(mn, /Tree[345]/.test(name) ? 'spray' : /Pine/.test(name) ? (mn === 'Leaf2' ? 'needles' : 'core') : '')), list.length);
      mesh.setColorAt(0, new THREE.Color(0xffffff));
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
    it.lump = dm.matrix.clone(); it.col = L.leaf.clone().multiplyScalar(1.15); it.burn = 0; it.fireTint = new THREE.Color(0xffffff); it.charCol = it.col.clone();
  }
  const charColor = new THREE.Color(0x3c2a20);
  world.trackFire = fire => {
    fire.vegetation = lodded.flatMap(L => L.list).filter(it => Math.hypot(it.x - fire.x, it.z - fire.z) < fire.r + 4);
  };
  world.updateFireScars = fire => {
    for (const it of fire.vegetation || []) {
      let nearest = null, distance = fire.spacing * .8;
      for (const c of fire.cells) { const d = Math.hypot(it.x - c.x, it.z - c.z); if (d < distance) { distance = d; nearest = c; } }
      if (!nearest) continue;
      it.burn = Math.max(it.burn, Math.min(.9, nearest.burned + nearest.heat * .62));
      it.fireTint.setScalar(1 - it.burn); it.charCol.copy(it.col).lerp(charColor, it.burn);
    }
  };
  world.resetFireScars = () => { for (const L of lodded) for (const it of L.list) { it.burn = 0; it.fireTint.setScalar(1); it.charCol.copy(it.col); } };
  const rockSets = [];
  for (const name in rocks) {
    const list = rocks[name]; if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geo(name), name === 'World_Driftwood' ? look('Bleached') : rockMat, list.length);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0;
    scene.add(mesh);
    rockSets.push({ mesh, list });
  }
  // plants and rocks gathered into squares of the map, each with a sphere round all of it, so a view skips whole
  // squares it cannot see (or that are too far for anything but a lump) without looking at every plant in them
  const CELL = 80;
  const cellsOf = list => {
    const map = new Map();
    for (const it of list) { const key = Math.floor(it.x / CELL) * 1000 + Math.floor(it.z / CELL); if (!map.has(key)) map.set(key, []); map.get(key).push(it); }
    return [...map.values()].map(items => {
      let cx = 0, cy = 0, cz = 0;
      for (const it of items) { cx += it.x; cy += it.cy; cz += it.z; }
      cx /= items.length; cy /= items.length; cz /= items.length;
      let r = 0;
      for (const it of items) r = Math.max(r, Math.hypot(it.x - cx, it.cy - cy, it.z - cz) + it.r);
      return { items, sph: new THREE.Sphere(new THREE.Vector3(cx, cy, cz), r) };
    });
  };
  for (const L of lodded) L.cells = cellsOf(L.list);
  for (const R of rockSets) R.cells = cellsOf(R.list);
  world.counts = { plants: plantCount, rocks: Object.values(rocks).reduce((n, l) => n + l.length, 0) };

  world.setDetail = (near, far) => { NEAR = near; FAR = far; };
  // Called before each viewport is drawn. Of the plants and rocks this camera can see (with a margin, so the shadows
  // and mirror images of those just outside the picture are still there), near ones get the full model, those across
  // the bay the sparser copy and the far hills' a lump. The view's shadow and mirror passes use the same choice.
  const frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sph = new THREE.Sphere(), MARGIN = 14;
  const seen = it => { _sph.center.set(it.x, it.cy, it.z); _sph.radius = it.r + MARGIN; return frustum.intersectsSphere(_sph); };
  const cellSeen = c => { _sph.copy(c.sph); _sph.radius += MARGIN; return frustum.intersectsSphere(_sph); };
  world.cull = function (cam) {
    frustum.setFromProjectionMatrix(_pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const px = cam.position.x, pz = cam.position.z, near2 = NEAR * NEAR, far2 = FAR * FAR;
    // (the sea's grid is finest in its middle: it travels with the camera, in whole steps so its waves do not swim)
    water.position.set(Math.round(px / 32) * 32, 0, Math.round(pz / 32) * 32);
    // (a zone's buildings drawn only within 300 m of it, and in the water's mirror only from close by)
    for (const Z of ZONES) {
      const zg = zoneGroups[Z.id]; if (!zg) continue;
      const d = Math.hypot(Z.x - px, Z.z - pz) - Z.r, mirrored = d < 120;
      zg.visible = d < 300;
      if (zg.visible && zg.userData.mirrored !== mirrored) { zg.userData.mirrored = mirrored; for (const c of zg.children) c.layers.set(mirrored ? 0 : PLANT_LAYER); }
    }
    // small things (gulls, friends and what they float on, boats) are not drawn from further off than they can be seen
    for (const o of scene.children) { const fh = o.userData.farHide; if (fh) o.visible = (o.position.x - px) ** 2 + (o.position.z - pz) ** 2 < fh * fh; }
    let nl = 0;
    for (const L of lodded) {
      let n0 = 0, n1 = 0;
      const [t0, t1] = L.tiers;
      for (const c of L.cells) {
        if (!cellSeen(c)) continue;
        if (L.bushy && Math.hypot(c.sph.center.x - px, c.sph.center.z - pz) - c.sph.radius > FAR) continue;
        for (const it of c.items) {
          const dx = it.x - px, dz = it.z - pz, d2 = dx * dx + dz * dz;
          if ((d2 >= far2 && L.bushy) || !seen(it)) continue;
          if (d2 < near2) { t0.setMatrixAt(n0, it.m); t0.setColorAt(n0++, it.fireTint); }
          else if (d2 < far2) { t1.setMatrixAt(n1, it.m); t1.setColorAt(n1++, it.fireTint); }
          else { lumps.setMatrixAt(nl, it.lump); lumps.setColorAt(nl++, it.charCol); }
        }
      }
      // (an empty batch still costs a draw call in every pass, so it is hidden instead)
      t0.count = n0; t1.count = n1; t0.visible = n0 > 0; t1.visible = n1 > 0;
      t0.instanceMatrix.needsUpdate = t1.instanceMatrix.needsUpdate = true;
      t0.instanceColor.needsUpdate = t1.instanceColor.needsUpdate = true;
    }
    lumps.count = nl; lumps.visible = nl > 0; lumps.instanceMatrix.needsUpdate = true;
    if (lumps.instanceColor) lumps.instanceColor.needsUpdate = true;
    for (const R of rockSets) {
      let n = 0;
      for (const c of R.cells) if (cellSeen(c)) for (const it of c.items) if (seen(it)) R.mesh.setMatrixAt(n++, it.m);
      R.mesh.count = n; R.mesh.visible = n > 0; R.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  // ---------- open-sea spawn points
  let guard = 0;
  while (world.spawn.sea.length < 60 && guard++ < 5000) {
    const a = rnd() * 6.283, d = 70 + rnd() * (HOME_R - 100);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    let ok = terrainHeight(x, z) < -5;       // (a sandbar is small enough to sit inside the ring below)
    for (let k = 0; k < 8 && ok; k++) if (terrainHeight(x + Math.cos(k * 0.785) * 14, z + Math.sin(k * 0.785) * 14) > -5) ok = false;
    if (ok && OBSTACLES.some(o => Math.hypot(x - o.x, z - o.z) < (o.wr || o.r) + 14)) ok = false;       // (nor hard by a stack, the arch or a hut)
    if (ok) world.spawn.sea.push({ x, z });
  }

  // ...and in each far zone, open water inside it for those afloat there
  world.spawn.zoneSea = {};
  for (const Z of ZONES) if (Z.id !== 'home') {
    const list = world.spawn.zoneSea[Z.id] = [];
    for (let g = 0; list.length < 36 && g < 6000; g++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * (Z.r + 15), x = Z.x + Math.cos(a) * d, z = Z.z + Math.sin(a) * d;
      if (zoneOf(x, z) !== Z || Math.hypot(x, z) > WORLD_R - 45 || terrainHeight(x, z) > -5) continue;
      let ok = true;
      for (let k = 0; k < 8 && ok; k++) if (terrainHeight(x + Math.cos(k * 0.785) * 14, z + Math.sin(k * 0.785) * 14) > -5) ok = false;
      if (ok && OBSTACLES.some(o => Math.hypot(x - o.x, z - o.z) < (o.wr || o.r) + 14)) ok = false;
      if (ok && SHOALS.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 10)) ok = false;
      if (ok && list.some(q => Math.hypot(x - q.x, z - q.z) < 12)) ok = false;
      if (ok) list.push({ x, z });
    }
  }

  // ---------- the volcano's crater, glowing
  {
    const floor = terrainHeight(CRATER.x, CRATER.z);
    const lavaMat = new THREE.MeshStandardMaterial({ color: 0x1a0602, emissive: 0xff4a10, emissiveIntensity: 2.2, roughness: 0.6 });
    world.nightMats.push({ mat: lavaMat, max: 6, min: 2.2 });
    const lava = new THREE.Mesh(new THREE.CircleGeometry(CRATER.r * 0.72, 28), lavaMat);
    lava.rotation.x = -Math.PI / 2; lava.position.set(CRATER.x, floor + 0.6, CRATER.z);
    scene.add(lava);
    world.crater = { x: CRATER.x, y: floor, z: CRATER.z };
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

  // The shadow pass builds the depth shaders of whatever casts a shadow the first time it meets it, a stall in the middle
  // of play. While the game loads, one shadow pass over the whole map with one of every plant and rock in it builds
  // them all at once (into target, the buffer the game really draws into).
  world.prewarmShadows = function (target, cam) {
    const sc = sun.shadow.camera, keep = [sc.left, sc.right, sc.top, sc.bottom, sc.far];
    sc.left = sc.bottom = -TSPAN * 0.75; sc.right = sc.top = TSPAN * 0.75; sc.far = 3000; sc.updateProjectionMatrix();
    world.aimSun(new THREE.Vector3(0, 0, 0));
    sun.position.copy(world.preset.sunDir).multiplyScalar(1400); sun.updateMatrixWorld();      // (far enough back that nothing is behind it)
    for (const L of lodded) for (const m of L.tiers) { m.setMatrixAt(0, L.list[0].m); m.count = 1; m.visible = true; m.instanceMatrix.needsUpdate = true; }
    for (const R of rockSets) { R.mesh.setMatrixAt(0, R.list[0].m); R.mesh.count = 1; R.mesh.visible = true; R.mesh.instanceMatrix.needsUpdate = true; }
    for (const id in zoneGroups) { zoneGroups[id].visible = true; for (const c of zoneGroups[id].children) c.layers.set(0); zoneGroups[id].userData.mirrored = true; }
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(target); renderer.render(scene, cam); renderer.setRenderTarget(null);
    [sc.left, sc.right, sc.top, sc.bottom, sc.far] = keep; sc.updateProjectionMatrix();
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
// a fir bough: a twig with short needles bristling down both sides of it, worn by every card of the pines
let needleTex;
function needleSpray() {
  if (needleTex) return needleTex;
  const rnd = mulberry(5151);
  needleTex = canvasTex(256, 256, (g, w) => {
    g.clearRect(0, 0, w, w);
    const twig = (x0, y0, x1, y1, len, n) => {
      g.strokeStyle = 'rgb(80,62,40)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
      for (let i = 0; i < n; i++) {
        const k = i / n, x = x0 + dx * k, y = y0 + dy * k, side = i % 2 ? 1 : -1, nl = len * (1 - k * 0.45) * (0.75 + rnd() * 0.5);
        const ax = ux * 0.55 + -uy * side, ay = uy * 0.55 + ux * side, al = Math.hypot(ax, ay), shade = 120 + rnd() * 110;
        g.strokeStyle = `rgb(${shade * 0.62 | 0},${shade | 0},${shade * 0.66 | 0})`; g.lineWidth = 1.6 + rnd();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + ax / al * nl, y + ay / al * nl); g.stroke();
      }
    };
    // (a main stem along the card, v running from the trunk end to the tip, with side shoots off it)
    twig(w / 2, w * 0.02, w / 2, w * 0.98, 30, 120);
    for (let s = 0; s < 7; s++) {
      const y = w * (0.12 + s * 0.12), side = s % 2 ? 1 : -1;
      twig(w / 2, y, w / 2 + side * w * (0.42 - s * 0.03), y + w * 0.16, 18, 42);
    }
  });
  needleTex.flipY = false;
  return needleTex;
}
function foliage(name, cards) {
  const key = name + (cards ? '+' + cards : '');
  if (foliageCache.has(key)) return foliageCache.get(key);
  const base = look(name);
  if (!/^Leaf/.test(name)) { foliageCache.set(key, base); return base; }
  const mat = new THREE.MeshStandardMaterial({ color: base.color.clone().multiplyScalar(cards && cards !== 'core' ? 2.1 : 0.85), roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.35 });
  if (cards === 'core') mat.color.multiplyScalar(0.3);         // (the shadowed heart of a pine, seen between its boughs)
  else if (cards) { mat.map = cards === 'needles' ? needleSpray() : leafSpray(); mat.alphaTest = 0.42; mat.alphaToCoverage = true; }
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWind = windUniform; sh.uniforms.uGust = gustUniform; sh.uniforms.uSnowZ = zoneUniforms.uSnowZ;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind, uGust; varying float vHigh; varying vec3 vFW; varying float vUp;')
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
        vHigh = clamp(position.y / 9.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          vFW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;
        #else
          vFW = (modelMatrix * vec4(transformed, 1.0)).xyz; vUp = normalize(mat3(modelMatrix) * objectNormal).y;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSnowZ; varying float vHigh; varying vec3 vFW; varying float vUp;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      // dark in the heart of the crown, bright at the top; and in the snowy peaks, snow lying on the boughs' tops
      .replace('#include <color_fragment>', `diffuseColor.rgb *= 0.5 + 0.7 * vHigh;
        float snowy = (1.0 - smoothstep(uSnowZ.z, uSnowZ.z + 40.0, length(vFW.xz - uSnowZ.xy))) * smoothstep(0.35, 0.8, vUp) * smoothstep(1.5, 4.0, vFW.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.8, 0.86), snowy * 0.85);
        #ifdef USE_INSTANCING_COLOR
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.16,.085,.04), (1.0 - vColor.r) * .92);
        #endif`);
  };
  mat.customProgramCacheKey = () => 'foliage';
  foliageCache.set(key, mat);
  return mat;
}

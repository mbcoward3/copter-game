// Fire simulation and water footprints are independent of rendering and frame rate.
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const WATER = {
  heli: { duration: 1.35, capacity: 7, radius: 7.5, carry: 0.18 },
  plane: { duration: 1.5, capacity: 15, radius: 8, carry: 0.82 },
  boat: { capacity: 1.45, radius: 3.8 },
};
export function createFireField({ x, z, y, radius = 17, spacing = 4.8, sample, roof = false, protectedAreas = [] }) {
  const cells = [], rows = Math.ceil(radius / spacing);
  for (let q = -rows; q <= rows; q++) for (let r = -rows; r <= rows; r++) {
    const dx = spacing * (q + r * 0.5), dz = spacing * r * 0.8660254;
    if (Math.hypot(dx, dz) > radius) continue;
    if (protectedAreas.some(a => Math.hypot(x + dx - a.x, z + dz - a.z) < a.r + spacing * .45)) continue;
    const surface = roof ? { y, canopy: 0 } : sample(x + dx, z + dz);
    if (!surface || surface.y < 0.8 || Math.abs(surface.y - y) > 9) continue;
    cells.push({ x: x + dx, z: z + dz, y: surface.y + 0.12, canopy: surface.canopy || 0,
      heat: 0, wet: 0, fuel: 1, ignition: 0, burned: 0, secured: false, everBurned: false, neighbours: [] });
  }
  // The initial front is already substantial; the remaining fuel gives it somewhere to travel.
  const ordered = cells.map((c, i) => ({ i, score: Math.hypot(c.x - x + radius * 0.2, c.z - z) } )).sort((a, b) => a.score - b.score);
  for (const { i } of ordered.slice(0, Math.min(12, Math.ceil(cells.length * 0.55)))) {
    cells[i].heat = 0.8; cells[i].everBurned = true;
  }
  for (let i = 0; i < cells.length; i++) for (let j = 0; j < cells.length; j++) {
    if (i !== j && Math.hypot(cells[i].x - cells[j].x, cells[i].z - cells[j].z) < spacing * 1.12) cells[i].neighbours.push(j);
  }
  const field = { x, z, y, r: radius, spacing, cells, heat: 0, max: 0, peak: 0, waterUsed: 0, elapsed: 0,
    simAcc: 0, quiet: 0, out: false, engaged: false, hits: 0, drops: 0, lastPilot: null, phase: 'attack' };
  refreshFire(field);
  return field;
}
export function refreshFire(fire) {
  fire.heat = fire.cells.reduce((sum, c) => sum + c.heat, 0);
  fire.peak = Math.max(fire.peak, fire.heat);
  fire.max = Math.max(0.01, fire.peak);
  fire.active = fire.cells.filter(c => c.heat > 0.025).length;
  fire.flames = fire.cells.filter(c => c.heat > 0.18).length;
  fire.secured = fire.cells.filter(c => c.secured).length;
  fire.phase = fire.active === 0 ? 'checking' : fire.flames === 0 ? 'mop-up' : 'attack';
}
export function advanceFire(fire, dt, wind = { x: 0, z: 0 }) {
  if (fire.out || !fire.engaged || dt <= 0) return;
  fire.simAcc += Math.min(dt, 1);
  while (fire.simAcc >= 0.2) {
    fire.simAcc -= 0.2; fire.elapsed += 0.2;
    const next = fire.cells.map(c => c.heat);
    fire.cells.forEach((c, i) => {
      c.wet = Math.max(0, c.wet - 0.0005 * 0.2);
      if (c.secured) return;
      if (c.heat > 0) {
        c.burned = clamp(c.burned + c.heat * 0.003);
        if (c.wet > 0.08 && c.heat < 0.18) next[i] = Math.max(0, c.heat - 0.055 * 0.2);
        else next[i] = Math.min(1, c.heat + 0.008 * (1 - c.wet) * 0.2);
        if (next[i] <= 0.025 && c.everBurned) { next[i] = 0; c.secured = true; c.fuel = 0; }
      } else if (c.wet < 0.16 && c.fuel > 0) {
        let exposure = 0;
        for (const j of c.neighbours) {
          const n = fire.cells[j];
          const toward = ((c.x - n.x) * wind.x + (c.z - n.z) * wind.z) / (fire.spacing * 16);
          exposure += Math.max(0, n.heat - 0.25) * clamp(1 + toward, 0.45, 1.8);
        }
        c.ignition += exposure * 0.016 * 0.2;
        if (c.ignition > 0.38) { next[i] = 0.35; c.everBurned = true; }
      }
    });
    fire.cells.forEach((c, i) => { c.heat = next[i]; });
    refreshFire(fire);
    fire.quiet = fire.active === 0 && fire.waterUsed > 0 ? fire.quiet + 0.2 : 0;
  }
}
export function waterImpact(fire, packet) {
  if (fire.out || !Number.isFinite(packet.amount) || packet.amount <= 0) return { cooled: 0, touched: 0 };
  const hits = fire.cells.map(c => ({ c, w: Math.max(0, 1 - Math.hypot(c.x - packet.x, c.z - packet.z) / packet.radius) } )).filter(h => h.w > 0);
  const total = hits.reduce((sum, h) => sum + h.w, 0);
  let cooled = 0;
  for (const { c, w } of hits) {
    const dose = packet.amount * w / total;
    const used = Math.min(c.heat, dose);
    c.heat = Math.max(0, c.heat - dose); cooled += used;
    c.wet = clamp(c.wet + dose * 0.85);
    if (c.everBurned && c.heat <= 0.025) { c.heat = 0; c.secured = true; c.fuel = 0; }
  }
  if (hits.length) { fire.waterUsed += packet.amount; fire.hits++; fire.quiet = 0; }
  refreshFire(fire);
  return { cooled, touched: hits.length };
}
export function predictDrop(source, velocity, surfaceY, vehicle, wind = { x: 0, z: 0 }) {
  const config = WATER[vehicle], time = Math.max(0.25, Math.sqrt(2 * Math.max(0.3, source.y - surfaceY) / 9.81));
  return { x: source.x + velocity.x * config.carry * time + wind.x * time * 0.04,
    z: source.z + velocity.z * config.carry * time + wind.z * time * 0.04, y: surfaceY, time,
    radius: config.radius + Math.max(0, time - 1.5) * 0.8 };
}
export function attackPoint(fire, pilot = 0, rangeFrom = null) {
  const live = fire.cells.filter(c => c.heat > 0.025 && (!rangeFrom || Math.hypot(c.x - rangeFrom.x, c.z - rangeFrom.z) < 62));
  if (!live.length) return { x: fire.x, z: fire.z, y: fire.y };
  let best = live[0], score = -Infinity;
  for (const c of live) {
    const density = live.reduce((sum, n) => sum + n.heat * Math.max(0, 1 - Math.hypot(n.x - c.x, n.z - c.z) / 9), 0);
    const side = pilot ? (c.x - fire.x) * 0.035 : -(c.x - fire.x) * 0.035;
    const threat = fire.asset ? 0.6 / (1 + Math.hypot(c.x - fire.asset.x, c.z - fire.asset.z) / 12) : 0;
    const value = density + side + threat;
    if (value > score) { score = value; best = c; }
  }
  return { x: best.x, z: best.z, y: best.y + Math.min(best.canopy * 0.6, 12) };
}
export function fireProgress(fire) { return clamp(1 - fire.heat / fire.max); }
export function bombingRun(aim, from, worldRadius) {
  const preferred = Math.atan2(aim.x - from.x, aim.z - from.z);
  let best = null, score = -Infinity;
  for (let i = 0; i < 48; i++) {
    const h = i * Math.PI / 24, sx = Math.sin(h), sz = Math.cos(h);
    const entry = { x: aim.x - sx * 140, z: aim.z - sz * 140 }, exit = { x: aim.x + sx * 100, z: aim.z + sz * 100 };
    const edge = Math.max(0, Math.hypot(entry.x, entry.z) - (worldRadius - 85));
    const away = Math.max(0, Math.hypot(exit.x, exit.z) - (worldRadius - 45));
    const value = Math.cos(h - preferred) * 10 - edge * 10 - away * .2;
    if (value > score) { score = value; best = { aim: { ...aim }, h, entry, exit, stage: 'line-up', lock: null }; }
  }
  return best;
}

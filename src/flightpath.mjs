// Smooth flight paths for the seaplane's autopilot: the shortest way from where it is, heading the way it is heading,
// to a point it must pass heading a given way, made of a turn, a straight and a turn, every turn the same radius
// (a Dubins path). Flown with the pure-pursuit steering below, the plane banks into one steady turn, rolls out, flies
// straight and rolls into the last turn onto its landing line, with no waypoints to swing between.
//
// Headings follow the game: heading h points along (sin h, cos h); a turn of sign +1 makes h grow.
const TAU = Math.PI * 2;
const wrap = a => ((a % TAU) + TAU) % TAU;
// the centre of the turn of sign s through (x, z) on heading h
const centre = (x, z, h, s, R) => ({ x: x + R * s * Math.cos(h), z: z - R * s * Math.sin(h) });

// The shortest path from (x0, z0) on heading h0 to (x1, z1) on heading h1, turn radius R: turn-straight-turn, or
// turn-turn-turn when close. Returns { len, segs } or null; each seg is { arc: true, c, s, h, turn } (from heading h,
// turning `turn` radians the way s) or { arc: false, a, b, h }. With `all`, every one of the (up to six) paths, shortest
// first, for when the shortest runs over something: another may go round the other side.
export function dubins(x0, z0, h0, x1, z1, h1, R, all = false) {
  let best = null;
  const found = [];
  const keep = c => { found.push(c); if (!best || c.len < best.len) best = c; };
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
    const c1 = centre(x0, z0, h0, s1, R), c2 = centre(x1, z1, h1, s2, R);
    const dx = c2.x - c1.x, dz = c2.z - c1.z, D = Math.hypot(dx, dz);
    let h, L;
    if (s1 === s2) { if (D < 1e-6) { h = h0; L = 0; } else { h = Math.atan2(dx, dz); L = D; } }
    else { if (D < 2 * R) continue; L = Math.sqrt(D * D - 4 * R * R); h = Math.atan2(dx, dz) + Math.atan2(2 * R * s1, L); }
    const t1 = wrap(s1 * (h - h0)), t2 = wrap(s2 * (h1 - h));
    const len = (t1 + t2) * R + L;
    {
      const a = { x: c1.x - R * s1 * Math.cos(h), z: c1.z + R * s1 * Math.sin(h) };
      keep({ len, segs: [
        { arc: true, c: c1, s: s1, h: h0, turn: t1, R },
        { arc: false, a, b: { x: a.x + Math.sin(h) * L, z: a.z + Math.cos(h) * L }, h },
        { arc: true, c: c2, s: s2, h, turn: t2, R },
      ] });
    }
  }
  // turn-turn-turn: shorter than any of those when the goal is close (within four turns' radius)
  for (const s of [1, -1]) {
    const c1 = centre(x0, z0, h0, s, R), c3 = centre(x1, z1, h1, s, R);
    const dx = c3.x - c1.x, dz = c3.z - c1.z, D = Math.hypot(dx, dz);
    if (D > 4 * R || D < 1e-6) continue;
    const off = Math.sqrt(4 * R * R - D * D / 4);
    for (const side of [1, -1]) {
      const c2 = { x: (c1.x + c3.x) / 2 + side * off * dz / D, z: (c1.z + c3.z) / 2 - side * off * dx / D };
      const T1 = { x: (c1.x + c2.x) / 2, z: (c1.z + c2.z) / 2 }, T2 = { x: (c2.x + c3.x) / 2, z: (c2.z + c3.z) / 2 };
      const hA = headingOn(T1, c1, s, R), hB = headingOn(T2, c3, s, R);
      const t1 = wrap(s * (hA - h0)), t2 = wrap(-s * (hB - hA)), t3 = wrap(s * (h1 - hB));
      const len = (t1 + t2 + t3) * R;
      keep({ len, segs: [
        { arc: true, c: c1, s, h: h0, turn: t1, R },
        { arc: true, c: c2, s: -s, h: hA, turn: t2, R },
        { arc: true, c: c3, s, h: hB, turn: t3, R },
      ] });
    }
  }
  return all ? found.sort((a, b) => a.len - b.len) : best;
}
// the heading of a machine at point P going round the circle about c the way s
function headingOn(P, c, s, R) { return Math.atan2((P.z - c.z) / (R * s), -(P.x - c.x) / (R * s)); }
// how long the path above is (or Infinity), for comparing landing spots cheaply
export function dubinsLength(x0, z0, h0, x1, z1, h1, R) { const d = dubins(x0, z0, h0, x1, z1, h1, R); return d ? d.len : Infinity; }

// The path as points every `step` metres, each { x, z, h, s } (s: metres from the start), then straight on through
// `then` (a list of { x, z }).
export function samplePath(path, step = 6, then = []) {
  const pts = [];
  let s = 0;
  const push = (x, z, h) => { const q = pts[pts.length - 1]; if (q) s += Math.hypot(x - q.x, z - q.z); if (!q || s - q.s > 0.01) pts.push({ x, z, h, s }); };
  for (const g of path.segs) {
    if (g.arc) {
      const n = Math.max(1, Math.ceil(g.turn * g.R / step));
      for (let i = 0; i <= n; i++) { const h = g.h + g.s * g.turn * i / n; push(g.c.x - g.R * g.s * Math.cos(h), g.c.z + g.R * g.s * Math.sin(h), h); }
    } else {
      const L = Math.hypot(g.b.x - g.a.x, g.b.z - g.a.z), n = Math.max(1, Math.ceil(L / step));
      for (let i = 0; i <= n; i++) push(g.a.x + (g.b.x - g.a.x) * i / n, g.a.z + (g.b.z - g.a.z) * i / n, g.h);
    }
  }
  for (const q of then) {
    const l = pts[pts.length - 1], L = Math.hypot(q.x - l.x, q.z - l.z), h = Math.atan2(q.x - l.x, q.z - l.z), n = Math.max(1, Math.ceil(L / step));
    for (let i = 1; i <= n; i++) push(l.x + (q.x - l.x) * i / n, l.z + (q.z - l.z) * i / n, h);
    q.s = pts[pts.length - 1].s;      // (how far along the path it is)
  }
  return pts;
}

// Where the plane is on a sampled path: the nearest point (searched forward from `from`, the index found last time, so
// a path that comes back near itself is not jumped along), how far off it is, and the point `look` metres further on.
export function track(pts, x, z, from, look, out) {
  let bi = from, bd = Infinity;
  for (let i = Math.max(0, from - 2); i < pts.length && i < from + 60; i++) {
    const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  out.i = bi; out.off = Math.sqrt(bd); out.s = pts[bi].s;
  const want = pts[bi].s + look;
  let j = bi; while (j < pts.length - 1 && pts[j + 1].s < want) j++;
  if (j >= pts.length - 1) { out.x = pts[pts.length - 1].x; out.z = pts[pts.length - 1].z; }
  else { const a = pts[j], b = pts[j + 1], k = (want - a.s) / (b.s - a.s || 1); out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k; }
  return out;
}

// Pure pursuit: the turn rate (radians a second, + makes the heading grow) that carries a machine at (x, z) on heading
// h, going v, along the circle through the aim point.
export function pursuitRate(x, z, h, v, aim) {
  const dx = aim.x - x, dz = aim.z - z, L = Math.hypot(dx, dz);
  if (L < 0.5) return 0;
  let a = Math.atan2(dx, dz) - h; a = Math.atan2(Math.sin(a), Math.cos(a));
  return 2 * v * Math.sin(a) / L;
}

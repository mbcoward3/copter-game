// Navigation for the autopilots. Two charts of the world on a 5 m grid, each holding how far it is from every point to
// the nearest thing in the way:
//   water: to land, shallows, rock or the pier (for the boat, and the seaplane on the water)
//   air:   to anything standing up taller than a given height (for the helicopter and the seaplane in the air; they
//          climb over the ground by themselves, so only towers, stacks, the arch and the like are in the way)
// and routes over them that keep to the middle of the open water, smoothed into a few straight legs.
import { terrainHeight, OBSTACLES, SHOALS, WORLD_R } from './world.js';

const CELL = 5, HALF = WORLD_R + 60, N = Math.ceil((HALF * 2) / CELL);
const idx = (x, z) => {
  const i = Math.floor((x + HALF) / CELL), j = Math.floor((z + HALF) / CELL);
  return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
};
const cx = i => (i + 0.5) * CELL - HALF;

// distance from every free cell to the nearest blocked one (two chamfer passes; plenty for steering)
function distances(blocked) {
  const d = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) d[k] = blocked[k] ? 0 : 1e9;
  const D1 = CELL, D2 = CELL * Math.SQRT2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + D1);
    if (j > 0) { v = Math.min(v, d[k - N] + D1); if (i > 0) v = Math.min(v, d[k - N - 1] + D2); if (i < N - 1) v = Math.min(v, d[k - N + 1] + D2); }
    d[k] = v;
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    const k = j * N + i; let v = d[k];
    if (i < N - 1) v = Math.min(v, d[k + 1] + D1);
    if (j < N - 1) { v = Math.min(v, d[k + N] + D1); if (i < N - 1) v = Math.min(v, d[k + N + 1] + D2); if (i > 0) v = Math.min(v, d[k + N - 1] + D2); }
    d[k] = v;
  }
  return d;
}
function stamp(blocked, x, z, r) {
  const i0 = Math.max(0, Math.floor((x - r + HALF) / CELL)), i1 = Math.min(N - 1, Math.floor((x + r + HALF) / CELL));
  const j0 = Math.max(0, Math.floor((z - r + HALF) / CELL)), j1 = Math.min(N - 1, Math.floor((z + r + HALF) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if ((cx(i) - x) ** 2 + (cx(j) - z) ** 2 < r * r) blocked[j * N + i] = 1;
}

// a little binary heap for A*
function heap() {
  const k = [], v = [];
  return {
    get size() { return k.length; },
    push(key, val) { k.push(key); v.push(val); let i = k.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= v[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; } },
    pop() {
      const top = k[0], lk = k.pop(), lv = v.pop();
      if (k.length) { k[0] = lk; v[0] = lv; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < k.length && v[l] < v[m]) m = l; if (r < k.length && v[r] < v[m]) m = r; if (m === i) break; [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; } }
      return top;
    },
  };
}

export function createNav() {
  // ---- the water chart
  const wet = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cx(i), z = cx(j);
    if (Math.hypot(x, z) > WORLD_R - 30 || terrainHeight(x, z) > -1.4) wet[j * N + i] = 1;
  }
  for (const o of OBSTACLES) if (!o.easy) stamp(wet, o.x, o.z, (o.wr || o.r) + 1);
  for (const o of SHOALS) stamp(wet, o.x, o.z, o.r + 1);
  for (let z = 34; z <= 56; z += 2) stamp(wet, 0, z, 2.6);           // the base's pier
  const water = distances(wet);

  // ---- air charts, one for each height that matters, made when first asked for
  const airs = new Map();
  const air = top => {
    if (!airs.has(top)) {
      const b = new Uint8Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (Math.hypot(cx(i), cx(j)) > WORLD_R + 20) b[j * N + i] = 1;
      for (const o of OBSTACLES) if (o.top > top) stamp(b, o.x, o.z, o.r);
      airs.set(top, distances(b));
    }
    return airs.get(top);
  };

  const at = (d, x, z) => { const k = idx(x, z); return k < 0 ? 0 : d[k]; };
  // is the straight line from a to b at least `need` from anything, all the way?
  function clear(d, ax, az, bx, bz, need) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 2.5));
    for (let s = 0; s <= n; s++) if (at(d, ax + (bx - ax) * s / n, az + (bz - az) * s / n) < need) return false;
    return true;
  }
  // the nearest point to (x, z) with at least `need` of room, within maxR (or null)
  function open(d, x, z, need, maxR = 80) {
    const k0 = idx(x, z);
    if (k0 >= 0 && d[k0] >= need) return { x, z };
    let best = null, bd = 1e9;
    const R = Math.ceil(maxR / CELL), i0 = Math.floor((x + HALF) / CELL), j0 = Math.floor((z + HALF) / CELL);
    for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N || d[j * N + i] < need) continue;
      const dd = (cx(i) - x) ** 2 + (cx(j) - z) ** 2;
      if (dd < bd && dd <= maxR * maxR) { bd = dd; best = { x: cx(i), z: cx(j) }; }
    }
    return best;
  }
  // A* from a to b through cells with at least `need` of room, dearer the closer it runs to anything (so it keeps to
  // the middle of a channel), then pulled tight into straight legs. Returns [{x, z}, ...] ending at b (or at the nearest
  // reachable point to it), or null when there is no way through.
  function route(d, a, b, need, maxSnap = 60) {
    const s = open(d, a.x, a.z, need, 40), g = open(d, b.x, b.z, need, maxSnap);
    if (!s || !g) return null;
    if (clear(d, s.x, s.z, g.x, g.z, need)) return finish([s, g], a, b, d, need);
    const start = idx(s.x, s.z), goal = idx(g.x, g.z);
    const cost = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1);
    const gi = goal % N, gj = (goal / N) | 0, h = k => Math.hypot((k % N) - gi, ((k / N) | 0) - gj) * CELL;
    const q = heap(); cost[start] = 0; q.push(start, h(start));
    let found = false, steps = 0;
    while (q.size && steps++ < 120000) {
      const k = q.pop();
      if (k === goal) { found = true; break; }
      const i = k % N, j = (k / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni, room = d[nk]; if (room < need) continue;
        const c = cost[k] + (di && dj ? CELL * Math.SQRT2 : CELL) * (1 + 6 / (room - need + 3));
        if (c < cost[nk]) { cost[nk] = c; from[nk] = k; q.push(nk, c + h(nk)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = goal; k >= 0; k = from[k]) cells.push({ x: cx(k % N), z: cx((k / N) | 0) });
    cells.reverse(); cells[0] = s; cells[cells.length - 1] = g;
    // pull it tight: from each point, straight on to the furthest one in clear sight
    const legs = [cells[0]];
    for (let i = 0; i < cells.length - 1;) {
      let j = cells.length - 1;
      while (j > i + 1 && !clear(d, cells[i].x, cells[i].z, cells[j].x, cells[j].z, need)) j--;
      legs.push(cells[j]); i = j;
    }
    return finish(legs, a, b, d, need);
  }
  // (start from where the machine really is, and end where it really wants to be if that is in clear water too)
  function finish(legs, a, b, d, need) {
    legs[0] = { x: a.x, z: a.z };
    if (at(d, b.x, b.z) >= need * 0.6 && clear(d, legs[legs.length - 1].x, legs[legs.length - 1].z, b.x, b.z, need * 0.6)) legs.push({ x: b.x, z: b.z });
    return legs;
  }

  return {
    water: { at: (x, z) => at(water, x, z), clear: (ax, az, bx, bz, need) => clear(water, ax, az, bx, bz, need), open: (x, z, need, r) => open(water, x, z, need, r), route: (a, b, need, snap) => route(water, a, b, need, snap) },
    air: top => { const d = air(top); return { at: (x, z) => at(d, x, z), clear: (ax, az, bx, bz, need) => clear(d, ax, az, bx, bz, need), open: (x, z, need, r) => open(d, x, z, need, r), route: (a, b, need, snap) => route(d, a, b, need, snap) }; },
  };
}

// Following a route: the point `look` metres further along it from the nearest point on it to (x, z), so the machine
// cuts smoothly onto it and round its corners instead of aiming at one waypoint after another.
export function lookAhead(path, x, z, look, out) {
  let bi = 0, bt = 0, bd = 1e9;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const d = (a.x + ex * t - x) ** 2 + (a.z + ez * t - z) ** 2;
    if (d < bd) { bd = d; bi = i; bt = t; }
  }
  out.off = Math.sqrt(bd);           // (how far off the route it has strayed)
  let left = look, i = bi, t = bt;
  while (i < path.length - 1) {
    const a = path[i], b = path[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z), rest = l * (1 - t);
    if (rest >= left) { const k = t + left / (l || 1); out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k; return out; }
    left -= rest; i++; t = 0;
  }
  const e = path[path.length - 1]; out.x = e.x; out.z = e.z;
  return out;
}
// how far is it along the route from (x, z) to its end?
export function routeLeft(path, x, z) {
  let bi = 0, bt = 0, bd = 1e9;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const d = (a.x + ex * t - x) ** 2 + (a.z + ez * t - z) ** 2;
    if (d < bd) { bd = d; bi = i; bt = t; }
  }
  let L = Math.sqrt(bd);
  for (let i = bi; i < path.length - 1; i++) L += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z) * (i === bi ? 1 - bt : 1);
  return L;
}

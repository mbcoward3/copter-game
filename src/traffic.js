// More life round the islands: sailing boats beating from zone to zone, seals hauled out in the snowy cove, sea
// turtles paddling over the reef, and smoke curling from the harbour town's chimneys on a cold day.
import * as THREE from 'three';
import { waveHeight, terrainHeight } from './world.js';
import { model } from './assets.js';

export function createTraffic(scene, world, nav, fx) {
  const traffic = {};
  const rnd = (() => { let a = 777; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

  // ------------------------------------------------ sailing boats
  // Each one sails a loop of the zones over open water (a planned route, so never across a sandbar), steady and slow,
  // heeling a little with the breeze. Different sails for each.
  const sea = id => (world.spawn.zoneSea[id] || world.spawn.sea);
  const TOURS = [['home', 'harbour', 'volcano', 'home'], ['home', 'reef', 'forest', 'home'], ['snow', 'harbour', 'home', 'snow']];
  const SAILS = [[0.95, 0.93, 0.86], [1.0, 0.55, 0.3], [0.55, 0.75, 1.0]];
  const boats = [];
  // (the routes are planned after the game has loaded, a leg at a time between frames, so they cost no wait at start)
  const legs = [];
  TOURS.forEach((tour, b) => {
    const stops = tour.map((id, k) => { const list = sea(id); return list[(b * 7 + k * 3) % list.length]; }).filter(Boolean);
    for (let k = 0; k + 1 < stops.length; k++) legs.push({ b, a: stops[k], z: stops[k + 1], last: k + 2 === stops.length });
  });
  const paths = TOURS.map(() => []);
  let now = false;
  const planNext = (n) => {
    if (n) now = true;
    const L = legs.shift(); if (!L) return;
    const leg = nav.water.route(L.a, L.z, 9, 60) || nav.water.route(L.a, L.z, 6, 80);
    const path = paths[L.b];
    if (!leg || path === null) paths[L.b] = null; else path.push(...(path.length ? leg.slice(1) : leg));
    if (L.last && paths[L.b] && paths[L.b].length > 1) launch(L.b, paths[L.b]);
    if (now) planNext(true); else setTimeout(planNext, 50);
  };
  // (now: all of it straight away, as the automated checks want)
  traffic.plan = now => now ? planNext(true) : setTimeout(planNext, 400);
  traffic.boats = boats;
  function launch(b, path) {
    const lens = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    const m = model('World_Sailboat', { tints: { FlagB: new THREE.Color(...SAILS[b]) } });
    m.rotation.order = 'YXZ'; m.userData.farHide = 700;
    scene.add(m);
    boats.push({ m, path, lens, total: lens[lens.length - 1], s: rnd() * lens[lens.length - 1], dir: 1, yaw: 0 });
    traffic.counts.boats = boats.length;
  }
  const at = (B, s, out) => {
    let i = 1; while (i < B.lens.length - 1 && B.lens[i] < s) i++;
    const a = B.path[i - 1], b = B.path[i], k = (s - B.lens[i - 1]) / Math.max(B.lens[i] - B.lens[i - 1], 0.01);
    out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k;
    return out;
  };
  const P = { x: 0, z: 0 }, Q = { x: 0, z: 0 };

  // ------------------------------------------------ seals in the snowy cove
  // On the low shingle round the cove where the ice floes collect, each one lifting its head now and then.
  const seals = [];
  { const cove = { x: 96, z: -432 };
    // (the cove first, then any flat shingle round the snowy islands)
    for (let k = 0; k < 3000 && seals.length < 7; k++) {
      const far = k > 600, a = rnd() * 6.283, d = far ? rnd() * 160 : 18 + rnd() * 22, c0 = far ? { x: 55, z: -505 } : cove;
      const x = c0.x + Math.cos(a) * d, z = c0.z + Math.sin(a) * d, y = terrainHeight(x, z);
      if (y < 0.5 || y > 2.2 || seals.some(q => Math.hypot(q.x - x, q.z - z) < 3) || (far && seals.length && Math.min(...seals.map(q => Math.hypot(q.x - x, q.z - z))) > 40)) continue;
      // (only where the shore is flat enough to lie on)
      if ([0, 1.57, 3.14, 4.71].some(b => Math.abs(terrainHeight(x + Math.cos(b) * 1.2, z + Math.sin(b) * 1.2) - y) > 0.25)) continue;
      const m = model('World_Seal', { tints: { Dolphin: new THREE.Color(0.2, 0.19, 0.18).multiplyScalar(0.7 + rnd() * 0.6) } }); m.userData.farHide = 260;
      const yaw = rnd() * 6.283;
      m.position.set(x, y - 0.32, z); m.rotation.set(0, yaw, 0); m.scale.setScalar(1.2);
      scene.add(m); seals.push({ m, x, z, yaw, ph: rnd() * 10 });
    }
  }

  // ------------------------------------------------ sea turtles over the reef
  const turtles = [];
  for (let k = 0; k < 400 && turtles.length < 6; k++) {
    const x = -290 + (rnd() - 0.5) * 220, z = 355 + (rnd() - 0.5) * 220, y = terrainHeight(x, z);
    if (y > -2.2 || y < -4.5) continue;
    const m = model('World_Turtle'); m.userData.farHide = 220; m.rotation.order = 'YXZ'; m.scale.setScalar(1.4);
    scene.add(m); turtles.push({ m, cx: x, cz: z, r: 6 + rnd() * 8, a: rnd() * 6.283, sp: 0.06 + rnd() * 0.05, ph: rnd() * 10 });
  }

  // ------------------------------------------------ the town's chimneys
  let smokeT = 0;
  const chimneys = (world.chimneys || []).filter((_, i) => i % 3 === 0);

  traffic.update = function (dt, t, players) {
    const near = (x, z, r) => players.some(p => (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 < r * r);
    for (const B of boats) {
      B.s = (B.s + dt * 4.2) % B.total;
      at(B, B.s, P); at(B, (B.s + 8) % B.total, Q);
      const want = Math.atan2(Q.x - P.x, Q.z - P.z);
      let d = want - B.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); B.yaw += d * Math.min(1, dt * 0.8);
      const h = waveHeight(P.x, P.z, t), hf = waveHeight(P.x + Math.sin(B.yaw) * 3, P.z + Math.cos(B.yaw) * 3, t);
      B.m.position.set(P.x, h - 0.1, P.z);
      B.m.rotation.set(-(hf - h) / 3 * 0.6, B.yaw, 0.12 + 0.06 * world.weatherNow + Math.sin(t * 0.8 + B.s) * 0.03);
      if (near(P.x, P.z, 150) && Math.random() < dt * 6) fx.emit(P.x - Math.sin(B.yaw) * 3.4, h + 0.1, P.z - Math.cos(B.yaw) * 3.4, 0, 0.6, 0, 0.92, 0.97, 1, 0.45, 0.6, 1, 2, 1);
    }
    for (const S of seals) {
      if (!S.m.visible) continue;
      // (head up and a look round, then down again)
      const up = Math.max(0, Math.sin(t * 0.35 + S.ph)) ** 3;
      S.m.rotation.set(-0.12 * up, S.yaw + Math.sin(t * 0.5 + S.ph) * 0.25 * up, 0);
    }
    for (const T of turtles) {
      if (!T.m.visible) continue;
      T.a += dt * T.sp;
      const x = T.cx + Math.cos(T.a) * T.r, z = T.cz + Math.sin(T.a) * T.r * 0.7;
      const floor = terrainHeight(x, z), surf = Math.max(0, Math.sin(t * 0.05 + T.ph)) ** 8;      // (up for a breath, now and then)
      T.m.position.set(x, Math.min(-0.15, Math.max(floor + 0.5, -0.9 + surf * 0.75)), z);
      T.m.rotation.set(Math.sin(t * 1.4 + T.ph) * 0.05, Math.atan2(-Math.sin(T.a), Math.cos(T.a) * 0.7) + Math.PI / 2, Math.sin(t * 1.4 + T.ph) * 0.08);
    }
    if (chimneys.length && near(chimneys[0].x, chimneys[0].z, 260)) {
      smokeT -= dt;
      while (smokeT <= 0) {
        smokeT += 0.12;
        const c = chimneys[(Math.random() * chimneys.length) | 0], k = 0.62 * (1 - 0.7 * world.preset.night);
        fx.emit(c.x, c.y + 0.4, c.z, 0.3 + (Math.random() - 0.5) * 0.4, 1.0 + Math.random() * 0.5, 0.2 + (Math.random() - 0.5) * 0.4, k, k, k * 1.02, 0.5, 2.0 + Math.random() * 1.4, 3.2 + Math.random(), -0.05, 0.4);
      }
    }
  };
  traffic.counts = { boats: boats.length, seals: seals.length, turtles: turtles.length, chimneys: chimneys.length };
  return traffic;
}

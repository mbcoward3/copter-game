// Ambient life: patrol boat, seagulls, dolphins, and now and then a whale.
import * as THREE from 'three';
import { waveHeight, terrainHeight, canopyAt, OBSTACLES } from './world.js';
import { model } from './assets.js';
import { sfx } from './audio.js';

export function createLife(scene, world, fx) {
  const life = {};
  const seaSpot = () => world.spawn.sea[(Math.random() * world.spawn.sea.length) | 0];
  // open water: deeper than `deep` here and nearly so for m metres all round, and m clear of every rock, stack and hut
  const open = (x, z, m, deep) => {
    if (terrainHeight(x, z) > deep) return false;
    for (let q = m; q > 0; q -= 8) for (let k = 0; k < 8; k++) if (terrainHeight(x + Math.cos(k * 0.785) * q, z + Math.sin(k * 0.785) * q) > deep + 2) return false;   // (rings 8 m apart, so no sandbar hides between them)
    for (const o of OBSTACLES) if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + m) ** 2) return false;
    return true;
  };
  // ...and all the way along a swim of len metres from (x, z) heading (dx, dz)
  // (and well away from the base's jetty, which runs out from (0, 36) to about (0, 54) and is in nobody's OBSTACLES)
  const offJetty = (x, z, m) => Math.hypot(x, z - Math.min(54, Math.max(36, z))) > m + 14;
  const clearSwim = (x, z, dx, dz, len, m, deep) => { for (let s = 0; s <= len; s += 3) if (!open(x + dx * s, z + dz * s, m, deep) || !offJetty(x + dx * s, z + dz * s, m)) return false; return true; };

  // ------------------------------------------------ patrol boat
  const boat = model('World_Boat2');       // the trawler SEA OTTER, bow toward +Z
  boat.scale.setScalar(1.3); boat.rotation.order = 'YXZ';
  scene.add(boat);
  const boatState = { a: 0.6, near: new Set() };
  // her beat: a loop round the base that keeps to deep water, worked out once from the sea bed (and the stacks, arch
  // feet, huts and lighthouse, which createWorld has put in OBSTACLES by now). She goes round the arch, not under it.
  const BEAT = 180, beat = new Float32Array(BEAT).fill(128);       // (a plain ring, should no loop be found)
  {
    const R0 = 64, RS = 2, RN = 64, A = i => (i / BEAT) * 6.283;
    // a chart of sea room round the base: on a 4 m grid, how far it is to water shallower than 6 m or to a rock
    const G = 4, GN = 108, GH = GN * G / 2, chart = new Float32Array(GN * GN);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = (i + 0.5) * G - GH, z = (j + 0.5) * G - GH;
      chart[j * GN + i] = terrainHeight(x, z) > -6 || OBSTACLES.some(o => (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) ? 0 : 1e9;
    }
    for (const dir of [1, -1]) for (let j = dir > 0 ? 0 : GN - 1; j >= 0 && j < GN; j += dir) for (let i = dir > 0 ? 0 : GN - 1; i >= 0 && i < GN; i += dir) {
      let v = chart[j * GN + i];
      const pj = j - dir; if (pj >= 0 && pj < GN) for (let di = -1; di <= 1; di++) { const pi = i + di; if (pi >= 0 && pi < GN) v = Math.min(v, chart[pj * GN + pi] + (di ? G * 1.414 : G)); }
      const pi = i - dir; if (pi >= 0 && pi < GN) v = Math.min(v, chart[j * GN + pi] + G);
      chart[j * GN + i] = v;
    }
    // how much sea room she has at angle a, radius q (read off the chart a little pessimistically, and 24 m is plenty)
    const room = (a, q) => {
      const u = (Math.cos(a) * q + GH) / G - 0.5, w = (Math.sin(a) * q + GH) / G - 0.5, i = Math.floor(u), j = Math.floor(w), fu = u - i, fw = w - j;
      if (i < 0 || j < 0 || i >= GN - 1 || j >= GN - 1) return 0;
      const c = (ii, jj) => chart[jj * GN + ii];
      return Math.min(24, (c(i, j) * (1 - fu) + c(i + 1, j) * fu) * (1 - fw) + (c(i, j + 1) * (1 - fu) + c(i + 1, j + 1) * fu) * fw - 3);
    };
    const rm = []; for (let i = 0; i < BEAT; i++) { rm[i] = new Float32Array(RN); for (let j = 0; j < RN; j++) rm[i][j] = room(A(i), R0 + j * RS); }
    // the cheapest closed loop through the clear radii: steady turns, plenty of sea room (she squeezes through a
    // gap only where she must), and kept near 128 m where the base can see her
    let best = Infinity;
    for (let j0 = 0; j0 < RN; j0 += 4) if (rm[0][j0] >= 10) {
      let cost = new Float64Array(RN).fill(Infinity); cost[j0] = 0;
      const from = [];
      for (let i = 1; i <= BEAT; i++) {
        const nc = new Float64Array(RN).fill(Infinity), fr = new Int8Array(RN), row = rm[i % BEAT];
        for (let j = 0; j < RN; j++) if (row[j] >= 10) for (let d = -6; d <= 6; d++) {
          const c = cost[j + d] + d * d + (24 - row[j]) * 1.5 + 0.004 * (R0 + j * RS - 128) ** 2;
          if (c < nc[j]) { nc[j] = c; fr[j] = d; }
        }
        cost = nc; from.push(fr);
      }
      if (cost[j0] < best) { best = cost[j0]; for (let i = BEAT, j = j0; i > 0; i--) { beat[i % BEAT] = R0 + j * RS; j += from[i - 1][j]; } }
    }
    // smooth it out, but never into less sea room than the rough line had (or 14 m, if that is less)
    for (let pass = 0; pass < 60; pass++) { const c = beat.slice(); for (let i = 0; i < BEAT; i++) {
      const q = (c[(i + BEAT - 1) % BEAT] + c[i] * 2 + c[(i + 1) % BEAT]) / 4;
      if (room(A(i), q) >= Math.min(14, room(A(i), c[i]))) beat[i] = q;
    } }
  }
  // (a Catmull-Rom curve through the points, so her heading swings round smoothly rather than in jerks at each one)
  const beatAt = a => {
    const f = (((a / 6.283) % 1) + 1) % 1 * BEAT, i = Math.floor(f), u = f - i;
    const p0 = beat[(i + BEAT - 1) % BEAT], p1 = beat[i], p2 = beat[(i + 1) % BEAT], p3 = beat[(i + 2) % BEAT];
    return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
  };

  // ------------------------------------------------ seagulls
  const gulls = [];
  // the highest thing under a flock's circle: hills, treetops, and the lighthouse, station, stacks and arch
  const skyline = (x, z, r) => {
    let top = 0;
    for (let k = 0; k < 32; k++) for (const q of [r - 6, r + 6]) { const px = x + Math.cos(k * 0.196) * q, pz = z + Math.sin(k * 0.196) * q; top = Math.max(top, terrainHeight(px, pz) + canopyAt(px, pz)); }
    for (const o of OBSTACLES) { const d = Math.hypot(o.x - x, o.z - z); if (Math.abs(d - r) < o.r + 8) top = Math.max(top, o.top); }
    return top;
  };
  const ground = (x, z) => terrainHeight(x, z) + canopyAt(x, z);
  for (let f = 0; f < 4; f++) {
    // circling out over the water where it can; over the hills only well clear of them
    let flock = null;
    for (let n = 0; n < 12; n++) {
      const c = seaSpot(), F = { x: c.x * 0.7, z: c.z * 0.7, y: 22 + Math.random() * 22, r: 26 + Math.random() * 30, sp: (0.18 + Math.random() * 0.12) * (f % 2 ? 1 : -1) };
      F.top = skyline(F.x, F.z, F.r);
      if (!flock || F.top < flock.top) flock = F;
      if (F.top < F.y - 12) break;
    }
    flock.y = Math.max(flock.y, flock.top + 12);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const wl = model('World_GullWingL', { shadow: false }), wr = model('World_GullWingR', { shadow: false });
      g.add(model('World_Gull', { shadow: false }), wl, wr); g.scale.setScalar(2.2); scene.add(g);
      const off = i * 0.32 + Math.random() * 0.1;          // (each starts on its circle, not down in the base)
      gulls.push({ g, wl, wr, flock, off, dy: i * 1.3, ph: Math.random() * 6, scat: 0, vel: new THREE.Vector3(),
        pos: new THREE.Vector3(flock.x + Math.cos(off) * flock.r, flock.y + i * 1.3, flock.z + Math.sin(off) * flock.r) });
    }
  }
  const gullTo = new THREE.Vector3();

  // ------------------------------------------------ dolphins
  const dolphins = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.add(model('World_Dolphin')); g.scale.setScalar(1.25); g.visible = false; scene.add(g);
    dolphins.push({ g, t: -1, x: 0, z: 0, dx: 1, dz: 0, delay: 0 });
  }
  let podTimer = 5;
  const JT = 1.5, JL = 13, JH = 4.2;       // a leap: how long, how far, how high

  // ------------------------------------------------ the whale
  // Every minute or so, out in deep water somewhere a pilot can see it: a blow, a long slow roll along the surface,
  // and sometimes a breach that throws spray everywhere. She never surfaces under anybody.
  const whale = { g: new THREE.Group(), t: -1, timer: 30 };
  whale.g.add(model('World_Whale')); whale.g.scale.setScalar(1.15); whale.g.visible = false; whale.g.rotation.order = 'YXZ';
  scene.add(whale.g);
  life.whale = whale;

  // ------------------------------------------------ update
  life.update = function (dt, t, players) {
    // boat
    boatState.a += dt * 5.8 / beatAt(boatState.a);          // a steady 5.8 m/s however far out her beat swings
    const br = beatAt(boatState.a), bx = Math.cos(boatState.a) * br, bz = Math.sin(boatState.a) * br;
    // she points from her stern (6 m back along the beat) to her bow (6 m on), so she swings through a bend, not round a pin
    const ab = boatState.a + 6 / br, as = boatState.a - 6 / br, rb = beatAt(ab), rs = beatAt(as);
    let fx_ = Math.cos(ab) * rb - Math.cos(as) * rs, fz_ = Math.sin(ab) * rb - Math.sin(as) * rs;
    { const fl = Math.hypot(fx_, fz_); fx_ /= fl; fz_ /= fl; }
    const h0 = waveHeight(bx, bz, t), hf = waveHeight(bx + fx_ * 5, bz + fz_ * 5, t), hs = waveHeight(bx + fz_ * 2.5, bz - fx_ * 2.5, t);
    boat.position.set(bx, h0 - 0.1, bz);
    boat.rotation.set(-(hf - h0) / 5 * 0.8, Math.atan2(fx_, fz_), (hs - h0) / 2.5 * 0.5);
    if (Math.random() < dt * 14) fx.emit(bx - fx_ * 6 + (Math.random() - 0.5) * 2, h0 + 0.2, bz - fz_ * 6 + (Math.random() - 0.5) * 2, -fx_ * 2, 1.2, -fz_ * 2, 0.92, 0.97, 1, 0.5, 0.8, 1.2, 2, 1);
    // a toot and a wave for each helicopter that comes down to say hello (once a visit, not on and on while it hovers)
    for (const p of players) {
      const d = Math.hypot(p.pos.x - bx, p.pos.z - bz);
      if (!boatState.near.has(p) && d < 32 && p.pos.y < 40) { boatState.near.add(p); sfx.horn(); fx.emoji('👋', bx, h0 + 8, bz, 3); }
      else if (boatState.near.has(p) && (d > 55 || p.pos.y > 50)) boatState.near.delete(p);
    }

    // gulls
    for (const b of gulls) {
      const flap = Math.sin(t * 9 + b.ph) * 0.6;
      b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
      if (b.scat > 0) {
        b.scat -= dt;
        b.pos.addScaledVector(b.vel, dt); b.vel.multiplyScalar(1 - dt * 0.8);
        b.pos.y = Math.max(b.pos.y, ground(b.pos.x, b.pos.z) + 3);           // (scattering up over a hill, not into it)
        b.g.position.copy(b.pos);
        b.g.rotation.set(0, Math.atan2(b.vel.x, b.vel.z), 0);
        continue;
      }
      const a = t * b.flock.sp + b.off;
      const tx = b.flock.x + Math.cos(a) * b.flock.r, tz = b.flock.z + Math.sin(a) * b.flock.r, ty = b.flock.y + b.dy + Math.sin(t * 0.8 + b.ph) * 1.5;
      b.pos.lerp(gullTo.set(tx, ty, tz), Math.min(1, dt * 2));
      if (b.pos.distanceToSquared(gullTo) > 4) b.pos.y = Math.max(b.pos.y, ground(b.pos.x, b.pos.z) + 3);   // (on the way back from a scatter)
      b.g.position.copy(b.pos);
      const dir = Math.sign(b.flock.sp);
      b.g.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0); b.g.rotation.z = -0.3 * dir;
      for (const p of players) {
        if (p.pos.distanceTo(b.pos) < 16) {
          b.scat = 3.5; b.vel.copy(b.pos).sub(p.pos).setY(0).normalize().multiplyScalar(22); b.vel.y = 9; sfx.chirp();
          break;
        }
      }
    }

    // the whale
    whale.timer -= dt;
    if (whale.t < 0 && whale.timer <= 0 && players.length) {
      whale.timer = 50 + Math.random() * 40;
      const p = players[(Math.random() * players.length) | 0];
      const a = p.yaw + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5), d = 70 + Math.random() * 40;
      const cx = p.pos.x + Math.sin(a) * d, cz = p.pos.z + Math.cos(a) * d;
      // she rolls 40 m along her heading and is near 20 m long: the whole of that lane must be deep, open water
      if (!players.some(q => Math.hypot(q.pos.x - cx, q.pos.z - cz) < 30)) for (let n = 0, h0 = Math.random() * 6.283; n < 8; n++) {
        const h = h0 + n * 0.785, dx = Math.sin(h), dz = Math.cos(h);
        if (!clearSwim(cx - dx * 12, cz - dz * 12, dx, dz, 64, 12, -8)) continue;
        whale.t = 0; whale.x = cx; whale.z = cz; whale.h = h; whale.breach = Math.random() < 0.45; whale.blown = 0;
        break;
      }
    }
    if (whale.t >= 0) {
      whale.t += dt;
      const T = whale.breach ? 9 : 12, k = whale.t / T;
      const dx = Math.sin(whale.h), dz = Math.cos(whale.h);
      const x = whale.x + dx * k * 40, z = whale.z + dz * k * 40, w = waveHeight(x, z, t);
      let y, pitch;
      if (whale.breach && k > 0.4 && k < 0.62) {
        // up and out of the water nose first, over on her side, and down with a crash
        const b = (k - 0.4) / 0.22;
        y = w - 2 + Math.sin(b * Math.PI) * 9; pitch = -1.1 + b * 2.0;
        whale.g.rotation.z = b * 1.6;
        if (b > 0.8 && whale.blown < 2) { whale.blown = 2; fx.splash(x, w, z, 120, 2.6); sfx.splash(); }
      } else {
        // a long, slow roll: the back breaks the surface, then the tail lifts as she dives
        y = w - 4 + Math.sin(Math.min(k / 0.9, 1) * Math.PI) * 3.6; pitch = Math.cos(Math.min(k / 0.9, 1) * Math.PI) * 0.25;
        whale.g.rotation.z = 0;
      }
      if (k > 0.12 && whale.blown < 1) { whale.blown = 1; for (let i = 0; i < 60; i++) fx.emit(x + dx * 5, w + 1.5, z + dz * 5, (Math.random() - 0.5) * 1.5, 7 + Math.random() * 5, (Math.random() - 0.5) * 1.5, 0.95, 0.98, 1, 0.55, 0.7 + Math.random() * 0.6, 1.4 + Math.random(), 4, 0.8); }
      whale.g.visible = true;
      whale.g.position.set(x, y, z);
      whale.g.rotation.x = pitch; whale.g.rotation.y = whale.h;
      if (k >= 1) { whale.t = -1; whale.g.visible = false; }
    }

    // dolphins: a pod leaps near one of the players every so often
    podTimer -= dt;
    if (podTimer <= 0 && players.length) {
      podTimer = 9 + Math.random() * 9;
      const p = players[(Math.random() * players.length) | 0];
      const a = p.yaw + (Math.random() - 0.5) * 1.6, d = 30 + Math.random() * 35;
      const cx = p.pos.x + Math.sin(a) * d, cz = p.pos.z + Math.cos(a) * d;
      // each dolphin swims two leaps and the gap between (some 31 m): find a heading where every one of them keeps to
      // deep water, 10 m off any shore, sandbar, stack or jetty the whole way, or let the pod stay down this time
      const start = (ha, i) => { const dx = Math.sin(ha), dz = Math.cos(ha); return [cx + dz * (i - 1.5) * 3.2 - dx * i * 1.5, cz - dx * (i - 1.5) * 3.2 - dz * i * 1.5, dx, dz]; };
      const h0 = Math.random() * 6.283;
      for (let n = 0; n < 8; n++) {
        const ha = h0 + n * 0.785;
        if (!dolphins.every((dd, i) => clearSwim(...start(ha, i), JL * 2 + 6, 10, -5))) continue;
        dolphins.forEach((dd, i) => {
          [dd.x, dd.z, dd.dx, dd.dz] = start(ha, i);
          dd.t = 0; dd.delay = i * 0.28 + Math.random() * 0.15; dd.jumps = 2;
        });
        break;
      }
    }
    for (const d of dolphins) {
      if (d.t < 0) continue;
      if (d.delay > 0) { d.delay -= dt; continue; }
      const was = d.t; d.t += dt;
      const k = d.t / JT;
      const px = d.x + d.dx * JL * k, pz = d.z + d.dz * JL * k;
      const wy = waveHeight(px, pz, t);
      if (was === 0) { fx.splash(px, wy, pz, 14, 0.8); sfx.splash(); }
      if (k >= 1) {
        fx.splash(px, wy, pz, 18, 0.9);
        d.g.visible = false; d.jumps--;
        if (d.jumps > 0) { d.x = px + d.dx * 5; d.z = pz + d.dz * 5; d.t = 0; d.delay = 0.5; } else d.t = -1;
        continue;
      }
      d.g.visible = true;
      d.g.position.set(px, wy - 0.5 + JH * 4 * k * (1 - k), pz);
      const slope = Math.atan2(JH * 4 * (1 - 2 * k), JL);
      d.g.rotation.set(0, 0, 0); d.g.rotation.y = Math.atan2(d.dx, d.dz); d.g.rotateX(-slope);
    }
  };
  return life;
}

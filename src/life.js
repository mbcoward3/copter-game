// Ambient life: patrol boat, seagulls, dolphins.
import * as THREE from 'three';
import { waveHeight, terrainHeight } from './world.js';
import { model } from './assets.js';
import { sfx } from './audio.js';

export function createLife(scene, world, fx) {
  const life = {};
  const seaSpot = () => world.spawn.sea[(Math.random() * world.spawn.sea.length) | 0];

  // ------------------------------------------------ patrol boat
  const boat = model('World_Boat2');       // the trawler SEA OTTER, bow toward +Z
  boat.scale.setScalar(1.3); boat.rotation.order = 'YXZ';
  scene.add(boat);
  const boatState = { a: 0.6, hornCd: 0 };
  // her beat: a loop round the base that keeps to deep water, worked out once from the sea bed
  const BEAT = 120, beat = new Float32Array(BEAT);
  {
    let r = 128;
    const deep = (a, q) => { for (let k = 0; k < 8; k++) if (terrainHeight(Math.cos(a) * q + Math.cos(k * 0.785) * 16, Math.sin(a) * q + Math.sin(k * 0.785) * 16) > -7) return false; return true; };
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < BEAT; i++) {
      const a = (i / BEAT) * 6.283;
      let best = r, found = false;
      for (let off = 0; off < 80 && !found; off += 4) for (const q of [r + off, r - off]) if (q > 62 && q < 190 && deep(a, q)) { best = q; found = true; break; }
      r = beat[i] = best;
    }
    for (let pass = 0; pass < 6; pass++) { const c = beat.slice(); for (let i = 0; i < BEAT; i++) beat[i] = (c[(i + BEAT - 1) % BEAT] + c[i] * 2 + c[(i + 1) % BEAT]) / 4; }
  }
  const beatAt = a => { const f = (((a / 6.283) % 1) + 1) % 1 * BEAT, i = Math.floor(f); return beat[i] + (beat[(i + 1) % BEAT] - beat[i]) * (f - i); };

  // ------------------------------------------------ seagulls
  const gulls = [];
  for (let f = 0; f < 4; f++) {
    const c = seaSpot();
    const flock = { x: c.x * 0.7, z: c.z * 0.7, y: 22 + Math.random() * 22, r: 26 + Math.random() * 30, sp: (0.18 + Math.random() * 0.12) * (f % 2 ? 1 : -1) };
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const wl = model('World_GullWingL', { shadow: false }), wr = model('World_GullWingR', { shadow: false });
      g.add(model('World_Gull', { shadow: false }), wl, wr); g.scale.setScalar(2.2); scene.add(g);
      gulls.push({ g, wl, wr, flock, off: i * 0.32 + Math.random() * 0.1, dy: i * 1.3, ph: Math.random() * 6, scat: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
  }

  // ------------------------------------------------ dolphins
  const dolphins = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.add(model('World_Dolphin')); g.scale.setScalar(1.25); g.visible = false; scene.add(g);
    dolphins.push({ g, t: -1, x: 0, z: 0, dx: 1, dz: 0, delay: 0 });
  }
  let podTimer = 5;

  // ------------------------------------------------ update
  life.update = function (dt, t, players) {
    // boat
    boatState.a += dt * 0.045; boatState.hornCd -= dt;
    const br = beatAt(boatState.a), bx = Math.cos(boatState.a) * br, bz = Math.sin(boatState.a) * br;
    const b2 = beatAt(boatState.a + 0.02);
    let fx_ = Math.cos(boatState.a + 0.02) * b2 - bx, fz_ = Math.sin(boatState.a + 0.02) * b2 - bz;
    { const fl = Math.hypot(fx_, fz_); fx_ /= fl; fz_ /= fl; }
    const h0 = waveHeight(bx, bz, t), hf = waveHeight(bx + fx_ * 5, bz + fz_ * 5, t), hs = waveHeight(bx + fz_ * 2.5, bz - fx_ * 2.5, t);
    boat.position.set(bx, h0 - 0.1, bz);
    boat.rotation.set(-(hf - h0) / 5 * 0.8, Math.atan2(fx_, fz_), (hs - h0) / 2.5 * 0.5);
    if (Math.random() < dt * 14) fx.emit(bx - fx_ * 6 + (Math.random() - 0.5) * 2, h0 + 0.2, bz - fz_ * 6 + (Math.random() - 0.5) * 2, -fx_ * 2, 1.2, -fz_ * 2, 0.92, 0.97, 1, 0.5, 0.8, 1.2, 2, 1);
    for (const p of players) {
      if (boatState.hornCd <= 0 && Math.hypot(p.pos.x - bx, p.pos.z - bz) < 32 && p.pos.y < 40) {
        boatState.hornCd = 7; sfx.horn(); fx.emoji('👋', bx, h0 + 8, bz, 3);
      }
    }

    // gulls
    for (const b of gulls) {
      const flap = Math.sin(t * 9 + b.ph) * 0.6;
      b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
      if (b.scat > 0) {
        b.scat -= dt;
        b.pos.addScaledVector(b.vel, dt); b.vel.multiplyScalar(1 - dt * 0.8);
        b.g.position.copy(b.pos);
        b.g.rotation.set(0, Math.atan2(b.vel.x, b.vel.z), 0);
        continue;
      }
      const a = t * b.flock.sp + b.off;
      const tx = b.flock.x + Math.cos(a) * b.flock.r, tz = b.flock.z + Math.sin(a) * b.flock.r, ty = b.flock.y + b.dy + Math.sin(t * 0.8 + b.ph) * 1.5;
      b.pos.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 2));
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

    // dolphins: a pod leaps near one of the players every so often
    podTimer -= dt;
    if (podTimer <= 0 && players.length) {
      podTimer = 9 + Math.random() * 9;
      const p = players[(Math.random() * players.length) | 0];
      const a = p.yaw + (Math.random() - 0.5) * 1.6, d = 30 + Math.random() * 35;
      const cx = p.pos.x + Math.sin(a) * d, cz = p.pos.z + Math.cos(a) * d;
      if (terrainHeight(cx, cz) < -6) {
        const ha = Math.random() * 6.283;
        dolphins.forEach((dd, i) => {
          dd.dx = Math.sin(ha); dd.dz = Math.cos(ha);
          dd.x = cx + dd.dz * (i - 1.5) * 3.2 - dd.dx * i * 1.5; dd.z = cz - dd.dx * (i - 1.5) * 3.2 - dd.dz * i * 1.5;
          dd.t = 0; dd.delay = i * 0.28 + Math.random() * 0.15; dd.jumps = 2;
        });
      }
    }
    const JT = 1.5, JL = 13, JH = 4.2;
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

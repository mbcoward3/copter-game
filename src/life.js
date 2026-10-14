// Ambient life: patrol boat, seagulls, party balloons, dolphins.
import * as THREE from 'three';
import { waveHeight, terrainHeight, WORLD_R } from './world.js';
import { sfx } from './audio.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

export function createLife(scene, world, fx) {
  const life = { onPop: null };
  const seaSpot = () => world.spawn.sea[(Math.random() * world.spawn.sea.length) | 0];

  // ------------------------------------------------ patrol boat
  const boat = new THREE.Group();
  {
    const s = new THREE.Shape();
    s.moveTo(-2.2, -6); s.lineTo(2.2, -6); s.lineTo(2.5, 2); s.quadraticCurveTo(1.6, 7, 0, 8.5); s.quadraticCurveTo(-1.6, 7, -2.5, 2); s.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2 });
    hullGeo.rotateX(-Math.PI / 2); hullGeo.translate(0, -0.9, 0); // bow toward -Z after rotate
    const hull = new THREE.Mesh(hullGeo, std(0xe6521f, { roughness: 0.4 })); hull.castShadow = true; boat.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 11), std(0xd9c7a6)); deck.position.set(0, 1.45, 0.5); boat.add(deck);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 4.2), std(0xfbf7f0)); cabin.position.set(0, 2.7, 1.8); cabin.castShadow = true; boat.add(cabin);
    const winMat = std(0x7fc4ee, { roughness: 0.1, metalness: 0.4, emissive: 0xffc46b, emissiveIntensity: 0 });
    world.nightMats.push({ mat: winMat, max: 3 });
    const win = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, 3.4), winMat); win.position.set(0, 3.1, 1.5); boat.add(win);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 4.6), std(0xe6521f)); roof.position.set(0, 4.0, 1.8); boat.add(roof);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), std(0x888888)); mast.position.set(0, 5.4, 2.6); boat.add(mast);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 3 })); lamp.position.set(0, 6.8, 2.6); boat.add(lamp);
    scene.add(boat);
  }
  const boatState = { a: 0.6, hornCd: 0 };

  // ------------------------------------------------ seagulls
  const gullMat = std(0xf5f5f5, { side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.35, 0, 0, -0.35, 1.7, 0, -0.1]), 3));
  wingGeo.computeVertexNormals();
  const gulls = [];
  for (let f = 0; f < 4; f++) {
    const c = seaSpot();
    const flock = { x: c.x * 0.7, z: c.z * 0.7, y: 22 + Math.random() * 22, r: 26 + Math.random() * 30, sp: (0.18 + Math.random() * 0.12) * (f % 2 ? 1 : -1) };
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), gullMat); body.scale.set(0.8, 0.7, 2); g.add(body);
      const wl = new THREE.Mesh(wingGeo, gullMat), wr = new THREE.Mesh(wingGeo, gullMat); wr.scale.x = -1;
      g.add(wl, wr); g.scale.setScalar(1.3); scene.add(g);
      gulls.push({ g, wl, wr, flock, off: i * 0.32 + Math.random() * 0.1, dy: i * 1.3, ph: Math.random() * 6, scat: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
  }

  // ------------------------------------------------ balloons
  const BAL_COL = [0xff5d8f, 0xffc93c, 0x4fd6a8, 0x5b9bff, 0xb07bff, 0xff8a3c];
  const balGeo = new THREE.SphereGeometry(1, 18, 14);
  const strGeo = new THREE.CylinderGeometry(0.02, 0.02, 2.6, 4); strGeo.translate(0, -2.9, 0);
  const strMat = std(0xdddddd);
  const balloons = [];
  function placeBalloon(b) {
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * 6.283, d = 30 + Math.random() * (WORLD_R - 70);
      b.x = Math.cos(a) * d; b.z = Math.sin(a) * d;
      const gh = Math.max(terrainHeight(b.x, b.z), 0);
      b.y = gh + 9 + Math.random() * 26;
      if (gh < 20) break;
    }
    b.g.position.set(b.x, b.y, b.z); b.alive = true; b.grow = 0;
  }
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(balGeo, new THREE.MeshPhysicalMaterial({ color: BAL_COL[i % BAL_COL.length], roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 }));
    m.scale.set(1.5, 1.85, 1.5); m.castShadow = true; g.add(m, new THREE.Mesh(strGeo, strMat));
    scene.add(g);
    const b = { g, ph: Math.random() * 6, respawn: 0 };
    placeBalloon(b); b.grow = 1; balloons.push(b);
  }

  // ------------------------------------------------ dolphins
  const dolMat = std(0x5d7f9c, { roughness: 0.25, metalness: 0.1 });
  const dolphins = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.9, 6, 12), dolMat); body.rotation.x = Math.PI / 2; body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 8), dolMat); nose.rotation.x = Math.PI / 2; nose.position.z = 1.6;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 6), dolMat); fin.position.set(0, 0.6, -0.1); fin.rotation.x = -0.5;
    const tailF = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.45), dolMat); tailF.position.z = -1.6;
    g.add(body, nose, fin, tailF); g.visible = false; scene.add(g);
    dolphins.push({ g, t: -1, x: 0, z: 0, dx: 1, dz: 0, delay: 0 });
  }
  let podTimer = 5;

  // ------------------------------------------------ update
  life.update = function (dt, t, players) {
    // boat
    boatState.a += dt * 0.045; boatState.hornCd -= dt;
    const br = 128, bx = Math.cos(boatState.a) * br, bz = Math.sin(boatState.a) * br;
    const hd = boatState.a + Math.PI;           // travelling tangent; bow is -Z
    const fx_ = -Math.sin(boatState.a), fz_ = Math.cos(boatState.a);
    const h0 = waveHeight(bx, bz, t), hf = waveHeight(bx + fx_ * 5, bz + fz_ * 5, t), hs = waveHeight(bx + fz_ * 2.5, bz - fx_ * 2.5, t);
    boat.position.set(bx, h0 + 0.1, bz);
    boat.rotation.set(0, 0, 0);
    boat.rotation.y = Math.atan2(-fx_, -fz_);
    boat.rotateX(-(hf - h0) / 5 * 0.8); boat.rotateZ((hs - h0) / 2.5 * 0.5);
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

    // balloons
    for (const b of balloons) {
      if (!b.alive) { b.respawn -= dt; if (b.respawn <= 0) { placeBalloon(b); } continue; }
      b.grow = Math.min(1, b.grow + dt * 1.5);
      const by = b.y + Math.sin(t * 0.9 + b.ph) * 1.2;
      b.g.position.y = by; b.g.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.12; b.g.scale.setScalar(b.grow);
      b.g.visible = true;
      for (const p of players) {
        const dx = p.pos.x - b.x, dy = p.pos.y - by, dz = p.pos.z - b.z;
        if (dx * dx + dy * dy * 0.6 + dz * dz < 49) {
          b.alive = false; b.g.visible = false; b.respawn = 10 + Math.random() * 10;
          fx.confetti(b.x, by, b.z, 70); fx.emoji('⭐', b.x, by, b.z, 4); sfx.pop();
          if (life.onPop) life.onPop(p);
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

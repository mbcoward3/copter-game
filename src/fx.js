import * as THREE from 'three';

const MAX = 4000;
const BRIGHT = [[1.0, 0.56, 0.69], [1.0, 0.82, 0.4], [0.5, 0.85, 0.75], [0.6, 0.72, 1.0], [0.76, 0.6, 1.0], [1.0, 0.64, 0.36]];

export function createFx(scene) {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX);
  const grav = new Float32Array(MAX), drag = new Float32Array(MAX), size0 = new Float32Array(MAX), alpha0 = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: /* glsl */`
      attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;
      void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      varying vec4 vColor;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = exp(-d * d * 14.0) * smoothstep(0.5, 0.42, d) * vColor.a * 1.15;      // soft-edged, so spray reads as spray
        if (a < 0.01) discard; gl_FragColor = vec4(vColor.rgb, a); }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; points.renderOrder = 5;
  scene.add(points);

  let cursor = 0;
  function emit(x, y, z, vx, vy, vz, r, g, b, a, sz, lf, gr = 9, dr = 0.6) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = a;
    size0[i] = sz; alpha0[i] = a; life[i] = maxLife[i] = lf; grav[i] = gr; drag[i] = dr;
  }
  const R = (a = 1) => (Math.random() - 0.5) * 2 * a;

  const emojiTex = new Map();
  function texFor(e) {
    if (emojiTex.has(e)) return emojiTex.get(e);
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '100px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    emojiTex.set(e, t); return t;
  }
  const sprites = [];
  // Each emoji's material is thrown away when it fades, and with the last of them three would throw away their shader
  // too, to build it again for the next one. This one is drawn once (while the game loads) and kept, which keeps it.
  let keeper = null;

  const fx = {
    material: mat,
    emit,
    splash(x, y, z, n = 26, power = 1) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, s = (1.5 + Math.random() * 4) * power;
        emit(x + R(0.5), y, z + R(0.5), Math.cos(a) * s, (4 + Math.random() * 6) * power, Math.sin(a) * s, 0.9, 0.97, 1, 0.85, 0.35 + Math.random() * 0.4, 0.7 + Math.random() * 0.6, 14, 0.4);
      }
    },
    // rotor downwash mist blown outward across the surface
    wash(x, y, z, strength, land) {
      const a = Math.random() * 6.283, d = 2 + Math.random() * 5, s = 7 + Math.random() * 9;
      const c = land ? [0.78, 0.72, 0.6] : [0.92, 0.97, 1];
      emit(x + Math.cos(a) * d, y + 0.2, z + Math.sin(a) * d, Math.cos(a) * s, 0.6 + Math.random() * 2.2, Math.sin(a) * s, c[0], c[1], c[2], 0.2 * strength, 0.3 + Math.random() * 0.55, 0.7 + Math.random() * 0.7, 1.5, 1.6);
    },
    confetti(x, y, z, n = 60) {
      for (let i = 0; i < n; i++) {
        const c = BRIGHT[(Math.random() * BRIGHT.length) | 0];
        emit(x, y, z, R(7), 4 + Math.random() * 9, R(7), c[0], c[1], c[2], 1, 0.3 + Math.random() * 0.3, 1.4 + Math.random() * 1.2, 7, 1.2);
      }
    },
    dust(x, y, z, n = 22) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, s = 3 + Math.random() * 6;
        emit(x, y + 0.2, z, Math.cos(a) * s, 0.5 + Math.random() * 1.5, Math.sin(a) * s, 0.82, 0.78, 0.68, 0.4, 0.9 + Math.random(), 0.8 + Math.random() * 0.6, 0.5, 1.8);
      }
    },
    firework(x, y, z) {
      const c = BRIGHT[(Math.random() * BRIGHT.length) | 0];
      const k = 5;  // HDR so bloom makes them glow
      for (let i = 0; i < 150; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = 14 + Math.random() * 5, q = Math.sqrt(1 - u * u);
        emit(x, y, z, q * Math.cos(a) * s, u * s, q * Math.sin(a) * s, c[0] * k, c[1] * k, c[2] * k, 1, 0.55, 1.5 + Math.random() * 0.8, 4, 1.3);
      }
      for (let i = 0; i < 25; i++) emit(x, y, z, R(4), R(4), R(4), 6, 6, 5, 1, 0.9, 0.35, 0, 1);
    },
    sparkle(x, y, z, n = 8, c = [3, 2.4, 0.8]) {
      for (let i = 0; i < n; i++) emit(x + R(1.2), y + R(1.2), z + R(1.2), R(1.5), 1 + Math.random() * 2, R(1.5), c[0], c[1], c[2], 1, 0.22 + Math.random() * 0.2, 0.6 + Math.random() * 0.6, -1, 1);
    },
    emoji(e, x, y, z, scale = 2.4, rise = 3.2, dur = 1.5) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFor(e), transparent: true, depthWrite: false, fog: false }));
      s.position.set(x, y, z); s.scale.setScalar(0.01); s.renderOrder = 6;
      scene.add(s);
      sprites.push({ s, t: 0, dur, rise, scale });
    },
    hearts(x, y, z, n = 3) {
      const set = ['❤️', '💛', '💙', '🧡'];
      for (let i = 0; i < n; i++) fx.emoji(set[(Math.random() * 4) | 0], x + R(1.6), y + R(0.8), z + R(1.6), 1.8, 4, 1.3 + Math.random() * 0.5);
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { size[i] = 0; col[i * 4 + 3] = 0; continue; }
        const d = Math.max(0, 1 - drag[i] * dt);
        vel[i * 3] *= d; vel[i * 3 + 2] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = life[i] / maxLife[i];
        size[i] = size0[i] * (0.6 + 0.4 * k);
        col[i * 4 + 3] = alpha0[i] * Math.min(1, k * 2.5);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aColor.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
      if (keeper) keeper.visible = false;
      for (let i = sprites.length - 1; i >= 0; i--) {
        const o = sprites[i]; o.t += dt;
        const k = o.t / o.dur;
        if (k >= 1) { scene.remove(o.s); o.s.material.dispose(); sprites.splice(i, 1); continue; }
        o.s.position.y += o.rise * dt * (1 - k * 0.6);
        const pop = k < 0.2 ? (k / 0.2) * 1.2 : 1 + 0.2 * Math.max(0, 1 - (k - 0.2) * 5);
        o.s.scale.setScalar(o.scale * pop);
        o.s.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      }
    },
  };
  keeper = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFor('❗'), transparent: true, depthWrite: false, fog: false }));
  keeper.scale.setScalar(0.001); keeper.position.set(0, 9, 0);
  scene.add(keeper);
  return fx;
}

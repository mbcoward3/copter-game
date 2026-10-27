import * as THREE from 'three';
import { unzlibSync } from 'three/addons/libs/fflate.module.js';
import packed from './assets/models.bin';
import { AO, GROUND } from './assets/pictures.js';
import { sharedResource } from './render-resources.js';
import contracts from './assets/model-contracts.json';

// ================================================================= packed models (see tools/pack_models.py)
const raw = unzlibSync(packed);
const headLen = new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0, true);
const INDEX = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + headLen)));
const DATA = raw.buffer.slice(raw.byteOffset + 4 + headLen);
const geoCache = new Map();
const LEAFY = /^(Leaf|LeafDry|Leaf2|Leaf3)$/;

export const modelInfo = name => INDEX[name];

// geometry of one model, with one group per material; .userData.mats names them in order
export function geo(name) {
  if (geoCache.has(name)) return geoCache.get(name);
  const m = INDEX[name];
  if (!m) throw new Error('no model called ' + name);
  const q = new Uint16Array(DATA, m.pos, m.nv * 3), n4 = new Int8Array(DATA, m.nor, m.nv * 4);
  const pos = new Float32Array(m.nv * 3), nor = new Float32Array(m.nv * 3);
  for (let i = 0; i < m.nv; i++) for (let k = 0; k < 3; k++) {
    pos[i * 3 + k] = m.min[k] + (q[i * 3 + k] / 65535) * m.size[k];
    nor[i * 3 + k] = n4[i * 4 + k] / 127;
  }
  const idx = m.wide ? new Uint32Array(DATA, m.idx, m.ni) : new Uint16Array(DATA, m.idx, m.ni);
  // a tree lit leaf by leaf is a flicker of light and dark cards; lit as if each leaf faced out of the crown it reads as a canopy
  const leafy = m.groups.filter(g => LEAFY.test(g.mat));
  if (leafy.length && /Tree|Bush|Palm|Pine/.test(name)) {
    const mid = new THREE.Vector3(); let count = 0;
    const seen = new Uint8Array(m.nv);
    for (const g of leafy) for (let i = g.start; i < g.start + g.count; i++) seen[idx[i]] = 1;
    for (let i = 0; i < m.nv; i++) if (seen[i]) { mid.x += pos[i * 3]; mid.y += pos[i * 3 + 1]; mid.z += pos[i * 3 + 2]; count++; }
    mid.multiplyScalar(1 / count); mid.y -= m.size[1] * 0.18;
    const v = new THREE.Vector3();
    for (let i = 0; i < m.nv; i++) if (seen[i]) {
      v.set(pos[i * 3] - mid.x, pos[i * 3 + 1] - mid.y, pos[i * 3 + 2] - mid.z).normalize();
      v.multiplyScalar(0.8); v.y += 0.2 + 0.15 * Math.abs(nor[i * 3 + 1]); v.normalize();
      nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (m.uv !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(DATA, m.uv, m.nv * 2), 2, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  m.groups.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
  g.userData.mats = m.groups.map(gr => gr.mat);
  g.computeBoundingSphere(); g.computeBoundingBox();
  geoCache.set(name, sharedResource(g));
  return g;
}

// ================================================================= pictures
const loader = new THREE.TextureLoader();
const texCache = new Map();
function picture(url, srgb, repeat) {
  if (texCache.has(url)) return texCache.get(url);
  const t = loader.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; t.flipY = false;
  texCache.set(url, t);
  return t;
}
export const groundTex = (name, kind) => picture(GROUND[name + '_' + kind], kind === 'c', true);
export const bakeTex = name => (AO[name] ? picture(AO[name], false, false) : null);

// ================================================================= materials, by the names the models use
// colour (linear), roughness, metalness
const LOOKS = {
  Paint: [[0.86, 0.86, 0.83], 0.22, 0], Accent: [[1.0, 0.1, 0.012], 0.22, 0], Dark: [[0.012, 0.012, 0.015], 0.55, 0],
  Glass: [[0.004, 0.008, 0.012], 0.03, 0], Metal: [[0.3, 0.31, 0.33], 0.38, 1], Rubber: [[0.012, 0.012, 0.012], 0.9, 0],
  Tip: [[0.9, 0.55, 0.02], 0.5, 0], Raft: [[1.0, 0.22, 0.015], 0.6, 0], Navy: [[0.02, 0.08, 0.25], 0.4, 0],
  Deck: [[0.3, 0.18, 0.09], 0.8, 0], Rock: [[0.17, 0.16, 0.15], 0.9, 0], Bark: [[0.1, 0.075, 0.05], 0.9, 0],
  Leaf: [[0.05, 0.2, 0.025], 0.55, 0], LeafDry: [[0.3, 0.22, 0.07], 0.8, 0], Leaf2: [[0.025, 0.13, 0.03], 0.5, 0], Leaf3: [[0.07, 0.17, 0.02], 0.5, 0],
  Canopy: [[0.02, 0.05, 0.06], 0.04, 0], Seam: [[0.22, 0.22, 0.22], 0.5, 0], Glow: [[1.0, 0.8, 0.35], 0.3, 0],
  Bleached: [[0.5, 0.46, 0.38], 0.9, 0], Dolphin: [[0.42, 0.5, 0.6], 0.22, 0], Blush: [[1.0, 0.32, 0.38], 0.85, 0],
  Roof: [[0.2, 0.27, 0.33], 0.45, 0.4], Concrete: [[0.42, 0.42, 0.4], 0.85, 0], FurA: [[0.8, 0.6, 0.4], 0.85, 0], FurB: [[0.95, 0.9, 0.8], 0.85, 0],
  Whale: [[0.1, 0.125, 0.16], 0.22, 0], FlagA: [[1.0, 0.1, 0.012], 0.8, 0], FlagB: [[0.86, 0.86, 0.83], 0.8, 0], FlagC: [[1.0, 0.32, 0.38], 0.8, 0],
  FlagD: [[1.0, 0.4, 0.015], 0.8, 0], FlagE: [[0.02, 0.1, 0.36], 0.8, 0],
  Snow: [[0.8, 0.84, 0.9], 0.75, 0], Ice: [[0.42, 0.66, 0.84], 0.08, 0],
};
// Baked shade (see tools/pack_models.py): dark in the creases, seams and underneath, and a little grimy there too.
// It rides in the material's "map" slot, so it also dims the surface colour instead of only the ambient light.
function wearBake(mat, tex, dirt) {
  mat.map = tex; mat.aoMap = tex; mat.aoMapIntensity = 0.6;
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      float bakeAo = texture2D(map, vMapUv).r;
      diffuseColor.rgb *= mix(0.62, 1.0, pow(bakeAo, 1.15));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.83, 0.79, 0.72), clamp((1.0 - bakeAo) * ${dirt.toFixed(2)}, 0.0, 1.0));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (1.0 - bakeAo) * 0.13, 0.08, 1.0);');
  };
  mat.customProgramCacheKey = () => 'bake' + dirt;
}
const matCache = new Map();
// one material by name. opts: bake (model whose baked shade it wears), tint (THREE.Color replacing the colour), own (never shared)
export function look(name, opts = {}) {
  if (name === 'Glow' || name === 'Canopy' || name === 'Glass') opts = { ...opts, bake: null };
  const key = name + '|' + (opts.bake || '') + '|' + (opts.tint ? opts.tint.getHexString() : '');
  if (!opts.own && matCache.has(key)) return matCache.get(key);
  const [c, rough, metal] = LOOKS[name] || LOOKS.Paint;
  const color = opts.tint ? opts.tint.clone() : new THREE.Color().setRGB(c[0], c[1], c[2]);
  let mat;
  if (name === 'Paint' || name === 'Accent' || name === 'Navy') mat = new THREE.MeshPhysicalMaterial({ color, roughness: rough + 0.08, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  else if (name === 'Glass' || name === 'Canopy') mat = new THREE.MeshPhysicalMaterial({ color: 0x183c4d, roughness: 0.09, metalness: 0, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.25 });
  else if (name === 'Glow') mat = new THREE.MeshStandardMaterial({ color: 0x1a1408, emissive: color, emissiveIntensity: 1.2, roughness: rough });
  else if (LEAFY.test(name)) mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide });
  else mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  mat.name = name;
  const tex = opts.bake ? bakeTex(opts.bake) : null;
  if (tex) wearBake(mat, tex, /^(Jayhawk_Body|Jayhawk_Door|World_)/.test(opts.bake) ? 0.7 : 0.3);
  // Random hull/fur tints belong to their entity; caching them forever retains every rescue.
  if (!opts.own && !opts.tint) matCache.set(key, sharedResource(mat));
  return mat;
}

// a mesh of one packed model. tints: { MaterialName: THREE.Color }, own: [names] that get their own copy
export function model(name, { tints = {}, own = [], shadow = true } = {}) {
  const g = geo(name);
  // (a vehicle's far body shares the near body's UVs, baked shade and so its materials)
  const near = name.endsWith('_far') && AO[name.slice(0, -4)] ? name.slice(0, -4) : name;
  const bake = INDEX[name].ao ? near : null;
  const mats = g.userData.mats.map(mn => look(mn, { bake, tint: tints[mn], own: own.includes(mn) }));
  const mesh = new THREE.Mesh(g, mats);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  mesh.userData.mat = mn => mats[g.userData.mats.indexOf(mn)];
  return mesh;
}

// Vehicle bodies choose their level per viewport (world.cull), from the main camera.
export const heroLods = new Set();
export function heroModel(name, options) {
  const lod = new THREE.LOD(); lod.autoUpdate = false; heroLods.add(lod);
  lod.addLevel(model(name, options), 0);
  if (INDEX[name + '_far']) lod.addLevel(model(name + '_far', options), contracts[name].lodDistance, .12);
  return lod;
}

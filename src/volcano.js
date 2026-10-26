import * as THREE from 'three';
import { groundTex } from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A quiet, inhabited volcano: hot summit, old basalt coast and two working field sites.
// Fixed layout and no random gameplay draws: art must never change mission seeds.
export function buildVolcano({ group, crater, terrainHeight: height, sites, obstacles, keepOut, nightMats }) {
  const time = { value: 0 }, seams = [], fieldSites = [];
  const basalt = new THREE.MeshStandardMaterial({ color: 0x98948b, map: groundTex('rock', 'c'), normalMap: groundTex('rock', 'n'), normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.94, flatShading: true });
  basalt.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vColumnY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvColumnY = position.y;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vColumnY;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.94 + 0.06 * smoothstep(0.05,0.18,abs(sin(vColumnY*40.0)));');
  };
  basalt.customProgramCacheKey = () => 'basalt-strata-v1';
  const hot = new THREE.MeshStandardMaterial({ color: 0x211815, emissive: 0xff671a, emissiveIntensity: 2, roughness: 0.86, side: THREE.DoubleSide });
  nightMats.push({ mat: hot, min: 1.4, max: 2.6 });
  hot.onBeforeCompile = shader => {
    shader.uniforms.volcanoTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLava;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLava = position.xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vLava; uniform float volcanoTime;
      vec2 lavaHash(vec2 p) { return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)))) * 43758.5453); }
      float lavaNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(lavaHash(i).x,lavaHash(i+vec2(1,0)).x,f.x),mix(lavaHash(i+vec2(0,1)).x,lavaHash(i+1.0).x,f.x),f.y); }
    `).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec2 p = vLava * 0.64;
      p += vec2(lavaNoise(p*2.3),lavaNoise(p*2.3+19.0))*0.33;
      vec2 cell=floor(p), f=fract(p); float first=9.0, second=9.0;
      for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
        vec2 q=vec2(float(x),float(y));
        vec2 seed=lavaHash(cell+q);
        vec2 delta=q+0.5+0.35*sin(seed*6.283+volcanoTime*0.025)-f;
        float d=dot(delta,delta);
        if(d<first) { second=first; first=d; } else second=min(second,d);
      }
      float crack=1.0-smoothstep(0.025,0.12,second-first);
      float grain=lavaNoise(vLava*8.0)*0.45+lavaNoise(vLava*2.0)*0.55;
      totalEmissiveRadiance *= 0.012 + crack * (0.7 + 0.3 * sin(volcanoTime * 0.5 + p.y));
      diffuseColor.rgb *= 0.45 + grain * 0.9;
`);
  };
  hot.customProgramCacheKey = () => 'volcano-crust-v1';
  const mesh = (geometry, material) => { const m = new THREE.Mesh(geometry, material); m.receiveShadow = true; group.add(m); return m; };
  // The lake follows the bowl, so the old flat disc never disappears into its sloping floor.
  const verts = [], ids = [], rings = 12, sectors = 64;
  for (let r = 0; r <= rings; r++) for (let j = 0; j <= sectors; j++) {
    const a = j / sectors * Math.PI * 2, d = crater.r * 0.79 * r / rings;
    const x = crater.x + Math.cos(a) * d, z = crater.z + Math.sin(a) * d;
    verts.push(x, height(x, z) + 0.2, z);
    if (r < rings && j < sectors) { const k = r * (sectors + 1) + j; ids.push(k, k + sectors + 1, k + 1, k + 1, k + sectors + 1, k + sectors + 2); }
  }
  const lake = new THREE.BufferGeometry(); lake.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); lake.setIndex(ids); lake.computeVertexNormals(); mesh(lake, hot);
  const seamParts = [];
  for (const angle of [0.45, 2.6, 4.55]) {
    const points = [], v = [], ix = [], count = 76;
    for (let i = 0; i <= count; i++) {
      const t = i / count, d = 12 + t * 35, a = angle + Math.sin(t * 8 + angle) * 0.065;
      const width = (0.38 + 0.85 * (1 - t)) * Math.min(1,t*12) * Math.min(1,(1-t)*8) + 0.04;
      const x = crater.x + Math.cos(a) * d, z = crater.z + Math.sin(a) * d;
      points.push({ x, y: height(x, z) + 0.16, z });
      for (const side of [-1, 1]) { const px = x - Math.sin(a) * width * side, pz = z + Math.cos(a) * width * side; v.push(px, height(px, pz) + 0.16, pz); }
      if (i < count) { const k = i * 2; ix.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(ix); g.computeVertexNormals(); seamParts.push(g); seams.push(points);
  }
  mesh(mergeGeometries(seamParts), hot); seamParts.forEach(g => g.dispose());

  // Hexagonal cooling columns: grouped on dry shore, clear of beaches, pads and water approaches.
  const columnData = [];
  for (let cluster = 0; cluster < 5; cluster++) {
    const a = 0.05 + cluster * 1.23;
    for (let j = 0; j < 18; j++) {
      const theta = a + (j % 6 - 2.5) * 0.033;
      let shore = 45;
      for (let d = 100; d >= 40; d -= 0.75) if (height(crater.x + Math.cos(theta)*d, crater.z + Math.sin(theta)*d) > 3.2) { shore = d; break; }
      const d = shore - Math.floor(j / 6) * 1.8;
      const x = crater.x + Math.cos(theta) * d, z = crater.z + Math.sin(theta) * d, y = height(x, z);
      if (y < 1.8 || y > 12 || sites.some(s => Math.hypot(x-s.x,z-s.z) < s.r + 12)) continue;
      const rise = 1.8 + 2.5 * (0.5 + 0.5 * Math.sin(j * 2.7 + cluster));
      const bottom = Math.min(...[-1,1].flatMap(dx=>[-1,1].map(dz=>height(x+dx,z+dz)))) - 0.9;
      const h = y + rise - bottom;
      columnData.push({ x, z, y: bottom, h });
      obstacles.push({ x, z, r: 1, top: y + rise }); keepOut.push({ x, z, r: 2 });
    }
  }
  const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.94, 1.1, 1, 6), basalt, columnData.length), dummy = new THREE.Object3D();
  columnData.forEach((p, i) => { dummy.position.set(p.x, p.y + p.h / 2, p.z); dummy.scale.set(1, p.h, 1); dummy.rotation.y = Math.floor(i/18)*0.3; dummy.updateMatrix(); columns.setMatrixAt(i, dummy.matrix); columns.setColorAt(i, new THREE.Color().setHSL(0.07 + i%3 * 0.015, 0.09, 0.3 + i%5 * 0.018)); });
  columns.castShadow = columns.receiveShadow = true; group.add(columns);

  const shell = new THREE.MeshStandardMaterial({ color: 0xe4d8bc, roughness: 0.85 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x277d83, roughness: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x383c43, roughness: 0.65, metalness: 0.25 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffbd52, emissive: 0xff9b32, emissiveIntensity: 0.15 });
  nightMats.push({ mat: amber, min: 0.15, max: 1.8 });
  const batches = new Map([[shell, []], [teal, []], [metal, []], [amber, []], [basalt, []]]);
  const box = (mat, x, y, z, w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x,y,z); batches.get(mat).push(g); };
  for (const site of sites) {
    // Find a gentle patch outside the complete landing / waiting circle.
    let best = null;
    for (let k = 0; k < 32; k++) {
      const a = k / 32 * Math.PI * 2, x = site.x + Math.cos(a)*15, z = site.z + Math.sin(a)*15;
      const samples = [-2,2].flatMap(dx => [-2,2].map(dz => height(x+dx,z+dz)));
      const slope = Math.max(...samples)-Math.min(...samples), y = Math.max(...samples);
      if (y > 1.5 && (!best || slope < best.slope)) best = {x,z,y,slope,bottom:Math.min(...samples)-0.5};
    }
    const {x,z,y} = best;
    keepOut.push({x,z,r:5}); obstacles.push({x,z,r:3.6,top:y+4.5});
    fieldSites.push({name:site.name,props:[{x,z,r:3.6}]});
    box(basalt,x,(y+best.bottom)/2,z,5.2,y-best.bottom,4.8);
    box(shell,x,y+1.25,z,4.2,2.5,3.5);
    box(teal,x,y+2.65,z,4.8,0.3,4);
    box(teal,x-1.1,y+1.35,z+1.77,1.1,1.6,0.06);
    box(metal,x+0.8,y+1.6,z+1.79,1.3,0.8,0.07);
    box(amber,x+0.8,y+1.6,z+1.84,1.1,0.6,0.04);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#183c42'; ctx.fillRect(0,0,512,128);
    ctx.fillStyle = '#ffce72'; ctx.font = 'bold 27px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('VOLCANO WATCH',256,45); ctx.fillStyle = '#fff4db'; ctx.font = '24px sans-serif';
    ctx.fillText(site.name.toUpperCase(),256,88);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = mesh(new THREE.PlaneGeometry(3.5,0.65), new THREE.MeshStandardMaterial({map:tex,roughness:0.9}));
    sign.position.set(x,y+2.13,z+1.82);
    for (const dx of [-2.05,2.05]) box(teal,x+dx,y+1.25,z+1.77,0.14,2.5,0.12);
    box(metal,x-0.9,y+2.96,z,1.6,0.14,1.6);
    box(teal,x-0.9,y+3.04,z,1.35,0.04,1.35);
    for (let k=0;k<3;k++) box(shell,x-1.3+k*0.4,y+3.07,z,0.025,0.02,1.3);
    box(amber,x+2.0,y+0.35,z+1.9,0.8,0.7,0.8);
    box(metal,x+2.0,y+0.72,z+1.9,0.86,0.08,0.86);
    // A little monitoring mast with an orange wind vane, not another tall flight hazard.
    box(metal,x+1.4,y+3.4,z,0.1,1.5,0.1);
    box(amber,x+1.75,y+4.1,z,0.85,0.22,0.3);
    box(teal,x-0.9,y+2.9,z,1.4,0.12,1.4);
    // Mark the route to the clearing with low amber survey stakes.
    for (let i=0;i<3;i++) { const t=(i+1)/4, px=x+(site.x-x)*t, pz=z+(site.z-z)*t; if (Math.hypot(px-site.x,pz-site.z)<site.r+1) continue; const py=height(px,pz); box(metal,px,py+0.4,pz,0.12,0.8,0.12); box(amber,px,py+0.85,pz,0.22,0.18,0.22); }
  }
  for (const [material, parts] of batches) { const m = mesh(mergeGeometries(parts), material); m.castShadow = true; parts.forEach(g=>g.dispose()); }
  return { group, columns: columnData.length, columnData, seams, sites: fieldSites, update(t) { time.value = t; } };
}

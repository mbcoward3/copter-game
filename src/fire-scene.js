import * as THREE from 'three';

// Stable world-space fire bodies, separate from the game's shared confetti/water particle budget.
const vertex = `
  attribute float aHeat;
  varying vec2 vUv; varying float vHeat; varying float vSeed;
  uniform float uTime;
  void main(){
    vUv=uv; vHeat=aHeat; vSeed=instanceMatrix[3].x*.31+instanceMatrix[3].z*.17;
    vec3 p=position;
    p.x+=sin(uTime*3.+vSeed+uv.y*5.)*uv.y*uv.y*.18;
    gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);
  }`;
const fragment = `
  varying vec2 vUv; varying float vHeat; varying float vSeed; uniform float uTime;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  void main(){
    if(vHeat<.03)discard;
    float y=vUv.y;
    float turbulence=noise(vec2(vUv.x*6.+vSeed,y*5.-uTime*2.8))*.65+noise(vec2(vUv.x*13.,y*11.-uTime*5.+vSeed))*.35;
    float width=(.5-pow(y,1.3)*.46)*(0.75+vHeat*.25);
    float edge=abs(vUv.x-.5+sin(y*8.+uTime*3.+vSeed)*y*.06)/max(.03,width);
    float body=(1.-smoothstep(.45,.98,edge+turbulence*.35))*smoothstep(0.,.07,y)*(1.-smoothstep(.55+turbulence*.28,1.,y));
    vec3 orange=vec3(1.8,.18,.015), yellow=vec3(2.4,.95,.06), core=vec3(2.5,1.6,.35);
    vec3 color=mix(orange,yellow,clamp((1.-edge)*1.4-y*.65,0.,1.));
    color=mix(color,core,pow(max(0.,1.-edge*2.),2.)*(1.-y)*.25);
    float alpha=body*(.62+.3*vHeat);
    if(alpha<.015)discard;gl_FragColor=vec4(color,alpha);
  }`;
export function buildFireScene(scene, fire) {
  const group = new THREE.Group(); group.position.set(fire.x, 0, fire.z); scene.add(group);
  const n = fire.cells.length;
  // Fuel belongs to individual simulation cells: an untouched pile stays intact,
  // a soaked pile darkens, and burned timbers retain their damage after cooling.
  const fuel = [], charColor = new THREE.Color(0x242322), batches = new Map();
  const roof = fire.label === 'Rooftop fire';
  fire.cells.forEach((cell, i) => {
    if (i % 3 !== 0) return;
    const body = new THREE.Group(); body.position.set(cell.x-fire.x,cell.y,cell.z-fire.z); body.rotation.y=i*1.73; group.add(body);
    const base = new THREE.Color(roof ? 0x9b8261 : 0x9d693c);
    const mat = new THREE.MeshStandardMaterial({color:base,roughness:.9});
    const pieces = [];
    const part = (geometry,x,y,z,rx=0,rz=0) => {
      const key = geometry.type + JSON.stringify(geometry.parameters);
      if (!batches.has(key)) batches.set(key, { geometry, pieces: [] });
      else { geometry.dispose(); geometry = batches.get(key).geometry; }
      const m = new THREE.Mesh(geometry,mat); m.position.set(x,y,z); m.rotation.set(rx,0,rz); m.castShadow=m.receiveShadow=true; body.add(m);
      m.visible = false; // Pose handles remain CPU-side; the visible pieces are batched below.
      const piece = {mesh:m,y,rx,rz,body,mat}; pieces.push(piece); batches.get(key).pieces.push(piece); return m;
    };
    if (roof || i % 2 === 0) {
      // Stacked shipping crates and pallets; lids settle as the supporting timber burns.
      for(let k=0;k<3;k++) {
        part(new THREE.BoxGeometry(1.5,.85,1.4),(k%2)*.8-.4,.48+Math.floor(k/2)*.9,0);
        for(const side of [-1,1]) part(new THREE.BoxGeometry(1.6,.1,.12),(k%2)*.8-.4,.2+Math.floor(k/2)*.9,side*.72);
      }
    } else {
      for(let k=0;k<5;k++) part(new THREE.CylinderGeometry(.33,.4,3.1,7), (k%3-1)*.7,.4+Math.floor(k/3)*.65,0,Math.PI/2);
      // A simple timber drying rack gives the blaze a readable silhouette.
      for(const side of [-1,1]) part(new THREE.BoxGeometry(.18,2.7,.18),side*1.25,1.35,0,0,side*.12);
      part(new THREE.BoxGeometry(3.1,.2,.25),0,2.6,0);
    }
    fuel.push({cell,body,mat,base,pieces,damage:0});
  });
  for (const batch of batches.values()) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
    mat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aFuel; varying vec2 vFuel;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFuel=aFuel;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vFuel;').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(.9,.32,vFuel.x);').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(.22,.025,0.)*vFuel.y;');
    };
    mat.customProgramCacheKey = () => 'fuel-state-v1';
    batch.state = new THREE.InstancedBufferAttribute(new Float32Array(batch.pieces.length * 2), 2).setUsage(THREE.DynamicDrawUsage);
    batch.geometry.setAttribute('aFuel', batch.state);
    batch.mesh = new THREE.InstancedMesh(batch.geometry, mat, batch.pieces.length);
    batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.mesh.castShadow = batch.mesh.receiveShadow = true;
    group.add(batch.mesh);
  }
  const fuelMatrix = new THREE.Matrix4();
  const emberGeo = new THREE.BufferGeometry(), emberPos = new Float32Array(n*2*3);
  emberGeo.setAttribute('position',new THREE.BufferAttribute(emberPos,3).setUsage(THREE.DynamicDrawUsage));
  const emberMat = new THREE.PointsMaterial({color:0xffa127,size:.22,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});
  const embers = new THREE.Points(emberGeo,emberMat); embers.frustumCulled=false; group.add(embers);
  const flameGeometry = new THREE.PlaneGeometry(1, 1, 4, 8); flameGeometry.translate(0, .5, 0);
  const heat = new Float32Array(n * 6); flameGeometry.setAttribute('aHeat', new THREE.InstancedBufferAttribute(heat, 1));
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment,
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const flames = new THREE.InstancedMesh(flameGeometry, material, n * 6); flames.frustumCulled = false; flames.renderOrder = 3; group.add(flames);
  const patchGeo = new THREE.CircleGeometry(fire.spacing * .62, 14); patchGeo.rotateX(-Math.PI / 2);
  const patchMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uFade: { value: 1 } },
    vertexShader: `varying vec2 vUv;varying vec3 vTint;void main(){vUv=uv;vTint=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vTint;uniform float uFade;void main(){vec2 p=vUv-.5;float d=length(p)*2.;float grain=sin(p.x*51.)*sin(p.y*47.)*.04;float a=(1.-smoothstep(.25,.95,d+grain))*.6*uFade;if(a<.01)discard;gl_FragColor=vec4(vTint,a);}` });
  const patches = new THREE.InstancedMesh(patchGeo, patchMat, n); patches.frustumCulled = false; group.add(patches);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff5f0a, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const glow = new THREE.InstancedMesh(patchGeo.clone(), glowMat, n); glow.frustumCulled = false; group.add(glow);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const smokeGeo = new THREE.BufferGeometry(), smokePos = new Float32Array(n * 4 * 3), smokeSize = new Float32Array(n * 4), smokeAlpha = new Float32Array(n * 4);
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute('aSize', new THREE.BufferAttribute(smokeSize, 1).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(smokeAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const smokeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uScale: { value: 650 } },
    vertexShader: `uniform float uScale;attribute float aSize;attribute float aAlpha;varying float vAlpha;varying float vSeed;void main(){vSeed=position.x*.7+position.z*.3;vAlpha=aAlpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uScale/max(1.,-p.z);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying float vAlpha;varying float vSeed;void main(){vec2 p=gl_PointCoord-.5;float billow=sin(p.x*21.+vSeed)*sin(p.y*19.-vSeed)*.055;float a=exp(-dot(p,p)*7.)*(1.-smoothstep(.3,.5,length(p)+billow))*vAlpha;if(a<.008)discard;gl_FragColor=vec4(mix(vec3(.12,.13,.15),vec3(.32,.29,.25),gl_PointCoord.y),a);}` });
  const smoke = new THREE.Points(smokeGeo, smokeMat); smoke.frustumCulled = false; smoke.renderOrder = 4; group.add(smoke);
  const viewport = new THREE.Vector4();
  smoke.onBeforeRender = (renderer, _scene, camera) => { renderer.getCurrentViewport(viewport); smokeMat.uniforms.uScale.value = viewport.w * Math.abs(camera.projectionMatrix.elements[5]) * .5; };
  function update(t, wind, fade = 1) {
    material.uniforms.uTime.value = t;
    for(const f of fuel) {
      f.damage=Math.max(f.damage, Math.min(1,f.cell.burned*1.8));
      f.mat.color.copy(f.base).lerp(charColor,f.damage*.95);
      if(f.cell.wet>.03) f.mat.color.multiplyScalar(1-Math.min(.3,f.cell.wet*.4));
      f.mat.roughness=f.cell.wet>.03?.32:.9;
      f.mat.emissive.setRGB(f.cell.heat*.22*(1-f.cell.wet),f.cell.heat*.025,0);
      f.pieces.forEach((p,k)=>{
        const settle=Math.max(0,f.damage-.3)/.7;
        p.mesh.position.y=p.y*(1-settle*.55);
        p.mesh.rotation.z=p.rz+Math.sin(k*4.7)*settle*.45;
        p.mesh.rotation.x=p.rx+Math.cos(k*2.1)*settle*.12;
      });
    }
    for (const batch of batches.values()) {
      batch.pieces.forEach((p,i) => {
        p.body.updateMatrix(); p.mesh.updateMatrix(); fuelMatrix.multiplyMatrices(p.body.matrix, p.mesh.matrix);
        batch.mesh.setMatrixAt(i, fuelMatrix); batch.mesh.setColorAt(i, p.mat.color);
        batch.state.setXY(i, p.mat.roughness < .5 ? 1 : 0, p.mat.emissive.r / .22);
      });
      batch.mesh.instanceMatrix.needsUpdate = batch.mesh.instanceColor.needsUpdate = batch.state.needsUpdate = true;
      batch.mesh.computeBoundingSphere();
    }
    fire.cells.forEach((c, i) => {
      const intensity = c.heat > .16 ? c.heat : 0;
      const canopy = Math.min(c.canopy, 24), height = 6 + Math.min(canopy * .12, 3);
      // Overlapping tongues connect the ground fire to burning crowns instead of hanging a flame card above a tree.
      for (let k = 0; k < 6; k++) {
        const layer = Math.floor(k / 2), at = i * 6 + k;
        const alive = layer === 0 || canopy > 5;
        dummy.position.set(c.x - fire.x, c.y + layer * canopy * .35, c.z - fire.z);
        dummy.rotation.set(0, (k % 2) * Math.PI / 2 + i * .47 + layer * .3, 0);
        dummy.scale.set(fire.spacing * (1.05 + .2 * Math.sin(i + k)), height * (.82 + .23 * Math.sin(i * 2.1 + k)) * (.35 + Math.sqrt(intensity) * .65), 1);
        dummy.updateMatrix(); flames.setMatrixAt(at, dummy.matrix); heat[at] = alive ? intensity * fade * (layer === 0 ? 1 : .8) : 0;
      }
      dummy.rotation.set(0, 0, 0); dummy.position.set(c.x - fire.x, c.y + .04, c.z - fire.z); dummy.scale.setScalar(c.everBurned || c.wet > .03 ? 1 : .001); dummy.updateMatrix(); patches.setMatrixAt(i, dummy.matrix);
      color.set(c.wet > .05 ? 0x284b4d : 0x392b22); patches.setColorAt(i, color);
      dummy.position.y += .03; dummy.scale.setScalar(c.heat > .025 ? .35 + c.heat * .65 : .001); dummy.updateMatrix(); glow.setMatrixAt(i, dummy.matrix);
      for(let k=0;k<2;k++) {
        const a=i*2+k, age=(t*.4+i*.37+k*.5)%1;
        emberPos[a*3]=c.x-fire.x+Math.sin(i+age*5)*1.4+wind.x*age*.3;
        emberPos[a*3+1]=c.heat>.18 ? c.y+1+age*12+Math.min(c.canopy,15) : -1000;
        emberPos[a*3+2]=c.z-fire.z+Math.cos(i+age*3)*1.4+wind.z*age*.3;
      }
      for (let k = 0; k < 4; k++) {
        const at = i * 4 + k, age = ((t * .18 + i * .17 + k * .25) % 1), rise = age * 32;
        smokePos[at * 3] = c.x - fire.x + wind.x * age * .8 + Math.sin(i + age * 4) * 2;
        smokePos[at * 3 + 1] = c.y + Math.max(3, c.canopy * .9, height * .6) + rise;
        smokePos[at * 3 + 2] = c.z - fire.z + wind.z * age * .8;
        smokeSize[at] = (5 + age * 12) * (.4 + c.heat * .6);
        smokeAlpha[at] = Math.sin(age * Math.PI) * (c.heat > .025 ? .28 + c.heat * .18 : 0) * fade;
      }
    });
    emberGeo.attributes.position.needsUpdate=true; emberMat.opacity=.85*fade;
    flames.instanceMatrix.needsUpdate = true; flameGeometry.attributes.aHeat.needsUpdate = true;
    patches.instanceMatrix.needsUpdate = true; if (patches.instanceColor) patches.instanceColor.needsUpdate = true; glow.instanceMatrix.needsUpdate = true;
    for (const a of Object.values(smokeGeo.attributes)) a.needsUpdate = true;
    patchMat.uniforms.uFade.value = fade; glowMat.opacity = .18 * fade;
  }
  function dispose() {
    scene.remove(group);
    const resources = new Set();
    group.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); });
    for (const resource of resources) resource.dispose();
  }
  update(0, { x: 0, z: 0 });
  return { group, update, dispose, fuel };
}
// A coherent curved water column, with particles continuing after its valve closes.
export function buildWaterStream(scene) {
  const segments = 18, sides = 6, positions = new Float32Array((segments + 1) * sides * 3), indices = [];
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides;
    indices.push(a, a + sides, b, b, a + sides, b + sides);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)); geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({ color: 0xc4ecff, transparent: true, opacity: .68, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5; scene.add(mesh);
  return {
    mesh,
    update(source, hit, startWidth = .13, endWidth = .3, length = 1) {
      mesh.visible = true;
      const dx = hit.x - source.x, dy = hit.y - source.y, dz = hit.z - source.z, horizontal = Math.hypot(dx, dz);
      const ux = horizontal > .01 ? -dz / horizontal : 1, uz = horizontal > .01 ? dx / horizontal : 0;
      for (let i = 0; i <= segments; i++) {
        const k = i / segments * Math.max(.01, length), h = 4.905 * hit.time * hit.time;
        const cx = source.x + dx * k, cy = source.y + dy * k + h * k * (1 - k), cz = source.z + dz * k;
        const ty = dy + h * (1 - 2 * k), tl = Math.hypot(dx, ty, dz) || 1;
        const vx = -uz * ty / tl, vy = (uz * dx - ux * dz) / tl, vz = ux * ty / tl;
        const radius = startWidth + (endWidth - startWidth) * k;
        for (let j = 0; j < sides; j++) {
          const a = j * Math.PI * 2 / sides, u = Math.cos(a) * radius, v = Math.sin(a) * radius, at = (i * sides + j) * 3;
          positions[at] = cx + ux * u + vx * v; positions[at + 1] = cy + vy * v; positions[at + 2] = cz + uz * u + vz * v;
        }
      }
      geometry.attributes.position.needsUpdate = true;
    },
    hide() { mesh.visible = false; },
  };
}

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
  const smokeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    vertexShader: `attribute float aSize;attribute float aAlpha;varying float vAlpha;void main(){vAlpha=aAlpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*650./max(1.,-p.z);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying float vAlpha;void main(){vec2 p=gl_PointCoord-.5;float a=exp(-dot(p,p)*10.)*(1.-smoothstep(.35,.5,length(p)))*vAlpha;if(a<.008)discard;gl_FragColor=vec4(vec3(.14,.15,.17),a);}` });
  const smoke = new THREE.Points(smokeGeo, smokeMat); smoke.frustumCulled = false; smoke.renderOrder = 4; group.add(smoke);
  function update(t, wind, fade = 1) {
    material.uniforms.uTime.value = t;
    fire.cells.forEach((c, i) => {
      const intensity = c.heat > .16 ? c.heat : 0;
      const canopy = Math.min(c.canopy, 24), height = 6 + Math.min(canopy * .12, 3);
      // Overlapping tongues connect the ground fire to burning crowns instead of hanging a flame card above a tree.
      for (let k = 0; k < 6; k++) {
        const layer = Math.floor(k / 2), at = i * 6 + k;
        const alive = layer === 0 || canopy > 5;
        dummy.position.set(c.x - fire.x, c.y + layer * canopy * .35, c.z - fire.z);
        dummy.rotation.set(0, (k % 2) * Math.PI / 2 + i * .47 + layer * .3, 0);
        dummy.scale.set(fire.spacing * (1.05 + .2 * Math.sin(i + k)), height * (.82 + .23 * Math.sin(i * 2.1 + k)), 1);
        dummy.updateMatrix(); flames.setMatrixAt(at, dummy.matrix); heat[at] = alive ? intensity * fade * (layer === 0 ? 1 : .8) : 0;
      }
      dummy.rotation.set(0, 0, 0); dummy.position.set(c.x - fire.x, c.y + .04, c.z - fire.z); dummy.scale.setScalar(c.everBurned || c.wet > .03 ? 1 : .001); dummy.updateMatrix(); patches.setMatrixAt(i, dummy.matrix);
      color.set(c.wet > .05 ? 0x284b4d : 0x392b22); patches.setColorAt(i, color);
      dummy.position.y += .03; dummy.scale.setScalar(c.heat > .025 ? .35 + c.heat * .65 : .001); dummy.updateMatrix(); glow.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 4; k++) {
        const at = i * 4 + k, age = ((t * .18 + i * .17 + k * .25) % 1), rise = age * 32;
        smokePos[at * 3] = c.x - fire.x + wind.x * age * .8 + Math.sin(i + age * 4) * 2;
        smokePos[at * 3 + 1] = c.y + Math.max(3, c.canopy * .9, height * .6) + rise;
        smokePos[at * 3 + 2] = c.z - fire.z + wind.z * age * .8;
        smokeSize[at] = (5 + age * 12) * (.4 + c.heat * .6);
        smokeAlpha[at] = Math.sin(age * Math.PI) * (c.heat > .025 ? .2 + c.heat * .16 : 0) * fade;
      }
    });
    flames.instanceMatrix.needsUpdate = true; flameGeometry.attributes.aHeat.needsUpdate = true;
    patches.instanceMatrix.needsUpdate = true; if (patches.instanceColor) patches.instanceColor.needsUpdate = true; glow.instanceMatrix.needsUpdate = true;
    for (const a of Object.values(smokeGeo.attributes)) a.needsUpdate = true;
    patchMat.uniforms.uFade.value = fade; glowMat.opacity = .18 * fade;
  }
  function dispose() { scene.remove(group); group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
  update(0, { x: 0, z: 0 });
  return { group, update, dispose };
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

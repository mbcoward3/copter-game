import * as THREE from 'three';
import { buildAnimal, ANIMAL_TYPES } from './models.js';

// Photograph the existing models once, so the passenger pictures match the friends in the world.
export function createPortraits(renderer) {
  const size = 96, result = new Map(), scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x72604b, 2.5));
  const light = new THREE.DirectionalLight(0xffefd8, 3); light.position.set(-3, 5, 4); scene.add(light);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  camera.position.set(0.5, 0.3, 6); camera.lookAt(0, 0, 0);
  const target = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), frame = ctx.createImageData(size, size);
  const oldTarget = renderer.getRenderTarget(), oldColor = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
  const oldViewport = renderer.getViewport(new THREE.Vector4()), oldScissor = renderer.getScissor(new THREE.Vector4());
  const oldScissorTest = renderer.getScissorTest(), oldShadows = renderer.shadowMap.enabled;
  try {
    renderer.shadowMap.enabled = false; renderer.setScissorTest(false); renderer.setClearColor(0, 0);
    for (const type of ANIMAL_TYPES) {
      const friend = buildAnimal(type.id), box = new THREE.Box3().setFromObject(friend);
      const center = box.getCenter(new THREE.Vector3()), extent = box.getSize(new THREE.Vector3());
      const scale = 1.75 / Math.max(extent.x, extent.y, extent.z);
      friend.scale.setScalar(scale); friend.position.copy(center).multiplyScalar(-scale);
      scene.add(friend);
      // Rebind after readback (which restores the resolved framebuffer), and use the target's physical viewport.
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      for (let y = 0; y < size; y++) frame.data.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), (size - y - 1) * size * 4);
      ctx.putImageData(frame, 0, 0);
      result.set(type.e, { url: canvas.toDataURL('image/png'), name: type.id === 'kitty' ? 'Kitty' : type.id[0].toUpperCase() + type.id.slice(1) });
      scene.remove(friend);
    }
  } finally {
    renderer.setRenderTarget(oldTarget); renderer.setClearColor(oldColor, oldAlpha);
    renderer.setViewport(oldViewport); renderer.setScissor(oldScissor); renderer.setScissorTest(oldScissorTest);
    renderer.shadowMap.enabled = oldShadows; target.dispose();
  }
  return result;
}

import * as THREE from 'three';

// Place the existing world effect in this crew's view, above the local surface. No navigation or gameplay RNG.
export function celebrationBurst(camera, focus, terrainHeight, random = Math.random) {
  camera.updateMatrixWorld();
  const ray = new THREE.Vector3((random() - 0.5) * 0.6, 0.2 + random() * 0.25, 0)
    .unproject(camera).sub(camera.position).normalize();
  for (const distance of [90, 65, 45, 25, 12]) {
    const position = ray.clone().multiplyScalar(distance).add(camera.position);
    position.y = Math.max(position.y, Math.max(0, terrainHeight(position.x, position.z)) + 8);
    const projected = position.clone().project(camera);
    const clear = [0.25, 0.5, 0.75].every(f => {
      const x = camera.position.x + (position.x - camera.position.x) * f;
      const z = camera.position.z + (position.z - camera.position.z) * f;
      return camera.position.y + (position.y - camera.position.y) * f > Math.max(0, terrainHeight(x, z)) + 2;
    });
    if (clear && Math.abs(projected.x) <= 0.7 && Math.abs(projected.y) <= 0.7 && projected.z > -1 && projected.z < 1) {
      return { position, scale: Math.min(1, camera.position.distanceTo(position) / 90) };
    }
  }
  // A view changing across a frame can briefly point away from the crew. Keep the burst with them until it settles.
  const position = new THREE.Vector3(focus.x, Math.max(focus.y, Math.max(0, terrainHeight(focus.x, focus.z))) + 8, focus.z);
  return { position, scale: Math.min(1, camera.position.distanceTo(position) / 90) };
}

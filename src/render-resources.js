// Shared assets live for the page; entity-owned resources live until retirement.
const shared = new WeakSet();
const disposed = new WeakSet();
export function sharedResource(resource) { shared.add(resource); return resource; }
export function retireObject(root) {
  if (!root) return;
  root.removeFromParent();
  const resources = new Set();
  root.traverse(o => {
    if (o.geometry) resources.add(o.geometry);
    for (const m of [o.material, o.customDepthMaterial, o.customDistanceMaterial].flat()) if (m) resources.add(m);
    for (const r of o.userData.ownedResources || []) resources.add(r);
  });
  for (const resource of resources) if (!shared.has(resource) && !disposed.has(resource)) { disposed.add(resource); resource.dispose(); }
}

// Three uploads the entire attribute without ranges, regardless of instance count.
export function uploadInstances(mesh, count, colors = true) {
  mesh.count = count; mesh.visible = count > 0;
  if (!count) return;
  for (const [attribute, width, key] of [[mesh.instanceMatrix, 16, 'matrixDirty'], [colors && mesh.instanceColor, 3, 'colorDirty']]) {
    if (!attribute || !mesh.userData[key]) continue;
    attribute.clearUpdateRanges(); attribute.addUpdateRange(0, count * width); attribute.needsUpdate = true;
    mesh.userData[key] = false;
  }
}
export function writeInstance(mesh, index, matrix, color) {
  const a = mesh.instanceMatrix.array, e = matrix.elements;
  for (let k = 0; k < 16; k++) if (a[index * 16 + k] !== Math.fround(e[k])) {
    mesh.setMatrixAt(index, matrix); mesh.userData.matrixDirty = true; break;
  }
  if (color) {
    if (!mesh.instanceColor) { mesh.setColorAt(index, color); mesh.instanceColor.setUsage(mesh.instanceMatrix.usage); }
    const c = mesh.instanceColor.array, at = index * 3;
    if (c[at] !== Math.fround(color.r) || c[at+1] !== Math.fround(color.g) || c[at+2] !== Math.fround(color.b)) {
      mesh.setColorAt(index, color); mesh.userData.colorDirty = true;
    }
  }
}

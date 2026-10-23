// Easy flight already follows terrain. Include buildings and rock arches in that same height envelope.
// Looking along the nose also works from rest when a collision has already stopped the helicopter.
export function flightClearance(pos, yaw, speed, obstacles, skid, out = {}) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), look = Math.max(45, speed * 3);
  out.height = -Infinity; out.speed = Infinity;
  for (const o of obstacles) {
    const radius = Math.max(o.r, o.wr || 0) + 6.5;
    const dx = o.x - pos.x, dz = o.z - pos.z;
    const along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
    if (across >= radius || along < -radius || along > look + radius) continue;
    const entry = along - Math.sqrt(radius * radius - across * across);
    if (entry > look) continue;
    const clearY = o.top + skid + 3;
    out.height = Math.max(out.height, clearY);
    // Slow the approach until the skids are clear, rather than repeatedly flying into the collision boundary.
    if (pos.y < clearY - 0.5) out.speed = Math.min(out.speed, Math.max(0.6, (entry - 2) * 0.65));
  }
  return out;
}

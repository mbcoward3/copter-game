// Small numeric helpers shared by the game and its modules. Pure, so tools/test/math.mjs checks them in Node.

// the signed difference between two headings (radians), wrapped into -PI..PI
export function angDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

// the same as three.js MathUtils.clamp
export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

// how far to close on a target this frame, easing at `rate` per second: frame-rate independent smoothing
export function damp(rate, dt) { return 1 - Math.exp(-rate * dt); }

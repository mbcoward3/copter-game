// Keep a quiet centre, then use the full remaining stick travel for precise manual movement.
export function manualAxis(value) {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(value);
  return magnitude <= 0.18 ? 0 : Math.sign(value) * Math.min(1, (magnitude - 0.18) / 0.82);
}

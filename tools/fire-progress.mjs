// A shared mission may finish before a filled aircraft gets its turn to drop.
// Active, unfinished outings still require the same refill/drop evidence.
export function fireProgressNote({ vehicle, water, drop, missionDone, seconds }) {
  if (vehicle === 'boat' || missionDone) return null;
  if (!water) return `NO PROGRESS: ${vehicle} never took on water in ${seconds} s`;
  if (water >= 0.8 && !drop) return `NO PROGRESS: ${vehicle} filled up but never dropped in ${seconds} s`;
  return null;
}

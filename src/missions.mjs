export const LOCATIONS = ['home', 'forest', 'reef', 'harbour', 'snow', 'volcano'];
export const MODES = ['rescue', 'fire', 'mixed'];

// Draw from valid combinations, avoiding an immediate repeat whenever there is a choice.
export function chooseMission(mode, location, previous = null, random = Math.random) {
  const places = LOCATIONS.includes(location) ? [location] : LOCATIONS;
  const types = mode === 'mixed' ? [false, true] : [mode === 'fire'];
  const choices = places.flatMap(id => types.map(fire => ({ id, fire })));
  const fresh = choices.filter(q => q.id !== previous?.id || q.fire !== previous?.fire);
  const pool = fresh.length ? fresh : choices;
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
}

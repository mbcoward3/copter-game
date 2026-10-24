// Repeatable play for the automated checks (tools/check.mjs). Opened with ?seed=N in the address, every random choice
// the game makes (where friends appear, what they are, the gusts, the splashes) comes from one seeded sequence instead
// of the browser's, so the same seed plays out the same way every time. Without it nothing changes.
// This module is imported first, so it is in place before anything else draws a random number.
const m = /[?&]seed=(\d+)/.exec(location.search);
if (m) {
  let a = Number(m[1]) >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Gameplay's own random numbers (where friends appear and who they are, which fire, what mission): a stream apart from
// the one every splash and sparkle draws from, so a new effect never changes which rescues a seed plays out.
const g = /[?&]seed=(\d+)/.exec(location.search);
let b = g ? (Number(g[1]) * 7919 + 13) >>> 0 : (Math.random() * 4294967296) >>> 0;
export const play = () => {
  b = (b + 0x6D2B79F5) | 0;
  let t = Math.imul(b ^ (b >>> 15), 1 | b);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// ?test: a page driven by the checks, never shown: no drawing, no shader warm-up, no frames of its own
export const TEST = /[?&]test\b/.test(location.search);
// (and it starts from nothing saved: a browser that has played before keeps the last pilots, mode and graphics, which
// would make a seed play out differently there than on a fresh one)
if (TEST) {
  const mem = new Map();
  const store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  try { Object.defineProperty(window, 'localStorage', { value: store, configurable: true }); } catch (e) { /* (left as it is) */ }
}

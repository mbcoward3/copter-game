// Every sound is a real recording (tools/pack_audio.py), carried in the page: seamless loops for the engines and the
// sea, wind, rain and fire, and one-shots for everything else (splashes, horns, gulls, the animals' calls).
import LOOPS from './assets/sfx.js';
let actx = null, master = null, out = null, muted = false;
const engines = [], ambient = {};

function noiseBuffer(seconds) {
  const b = actx.createBuffer(1, actx.sampleRate * seconds, actx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3 + w * 0.25; }
  return b;
}
// An MP3 starts and ends with a few milliseconds of encoder silence: loop only the part with sound in it, or every
// pass round the loop would tick.
function audible(buf) {
  const d = buf.getChannelData(0);
  let i = 0, j = d.length - 1;
  while (i < j && Math.abs(d[i]) < 1e-4) i++;
  while (j > i && Math.abs(d[j]) < 1e-4) j--;
  return [i / buf.sampleRate, (j + 1) / buf.sampleRate];
}
const loopBufs = new Map();
function loopBuf(name) {
  if (!loopBufs.has(name)) loopBufs.set(name, LOOPS[name] ? actx.decodeAudioData(LOOPS[name].slice().buffer).catch(() => null) : Promise.resolve(null));
  return loopBufs.get(name);
}
// one layer of an engine: a recording going round and round, silent until the game turns it up
function layer(name, dest) {
  const g = actx.createGain(); g.gain.value = 0; g.connect(dest);
  const L = { g, src: null };
  loopBuf(name).then(buf => {
    if (!buf) return;
    const [a, b] = audible(buf), s = actx.createBufferSource();
    s.buffer = buf; s.loop = true; s.loopStart = a; s.loopEnd = b;
    s.connect(g); s.start(actx.currentTime, a + Math.random() * (b - a) * 0.9);       // (each pilot's from a different place)
    L.src = s;
  });
  return L;
}

export const audio = {
  unlock() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      // out is the mute switch
      out = actx.createGain(); out.gain.value = muted ? 0 : 1;
      master = actx.createGain(); master.gain.value = 0.75;
      const comp = actx.createDynamicsCompressor();
      master.connect(out); out.connect(comp).connect(actx.destination);
      // the world all round: waves, wind, rain and (near one) a fire
      for (const name of ['sea', 'wind', 'rain', 'fire']) ambient[name] = layer(name, master);
      for (const key of Object.keys(LOOPS)) loopBuf(key);
      // each pilot's engine: every machine's layers, only the one being flown turned up
      for (let i = 0; i < 2; i++) {
        const pan = actx.createStereoPanner ? actx.createStereoPanner() : actx.createGain();
        pan.connect(master);
        const L = {};
        for (const name of Object.keys(LOOPS)) L[name] = layer(name, pan);
        engines.push({ pan, L });
      }
    }
    if (actx.state === 'suspended') actx.resume();
  },
  // each 0..1: the sea's wash, the wind, the rain, the nearest fire
  setAmbient(sea, wind, rain, fire) {
    if (!actx) return;
    const t = actx.currentTime, set = (name, v, rate = 1) => { const L = ambient[name]; if (!L) return; L.g.gain.setTargetAtTime(v, t, 0.6); if (L.src) L.src.playbackRate.setTargetAtTime(rate, t, 0.6); };
    set('sea', sea * 0.55); set('wind', wind * wind * 0.6, 0.9 + 0.2 * wind); set('rain', rain * 0.55); set('fire', fire * 0.8);
  },
  // kind 'heli' | 'plane' | 'boat'; spin 0..1 (engine/rotor speed); load 0..1 (how hard it is working: speed, climb);
  // air 0..1 (off the ground or water); pan -1..1
  setEngine(i, kind, spin, load, air, pan, active) {
    const e = engines[i]; if (!e) return;
    const t = actx.currentTime;
    const set = (name, gain, rate) => { const L = e.L[name]; if (!L) return; L.g.gain.setTargetAtTime(gain, t, 0.18); if (L.src) L.src.playbackRate.setTargetAtTime(rate, t, 0.18); };
    const on = active ? 1 : 0, s = spin;
    // helicopter: turning over on the pad (a low slow beat while it spools up, rising to full speed), then the sound of
    // it flying, which takes over once it is off the ground and harder the more it works
    const h = kind === 'heli' ? on : 0;
    set('heli_idle', h * s * Math.sqrt(s) * 0.95 * (1 - 0.7 * air), 0.5 + 0.5 * s + 0.03 * load);
    set('heli_fly', h * s * s * air * (0.7 + 0.45 * load), 0.93 + 0.07 * s + 0.07 * load);
    // seaplane: the engine near, rising with the throttle, and the cruising drone once it is up
    const pl = kind === 'plane' ? on : 0;
    // (kept close to its own pitch: slowed right down, a recorded engine sounds like a tape running down, not a start-up)
    set('plane_low', pl * s * s * (1 - 0.75 * air) * (0.5 + 0.5 * load), 0.88 + 0.06 * s + 0.12 * load);
    set('plane_high', pl * s * air * 0.95, 0.88 + 0.2 * load);
    // boat: the engine, higher as she speeds up, with the rush of the water over it
    const b = kind === 'boat' ? on : 0;
    set('boat_engine', b * s * (0.45 + 0.55 * load), 0.62 + 0.55 * load);
    set('boat_water', b * s * load * 0.85, 0.85 + 0.3 * load);
    if (e.pan.pan) e.pan.pan.setTargetAtTime(pan, t, 0.2);
  },
  toggleMute() { muted = !muted; if (out) out.gain.setTargetAtTime(muted ? 0 : 1, actx.currentTime, 0.05); return muted; },
};

// ---- one-shots, cut from real recordings (tools/pack_audio.py): `name_1`, `name_2`... are takes of the same sound,
// and each play picks one and nudges its pitch a little, so nothing ever sounds like the same sample twice.
const TAKES = {};
for (const key of Object.keys(LOOPS)) { const m = /^(.*)_(\d+)$/.exec(key); if (m) (TAKES[m[1]] ||= []).push(key); }
function play(name, vol = 1, rate = 1, delay = 0, pan = 0) {
  if (!actx || !TAKES[name] || vol < 0.01) return;
  const key = TAKES[name][(Math.random() * TAKES[name].length) | 0];
  loopBuf(key).then(buf => {
    if (!buf) return;
    const src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = buf; src.playbackRate.value = rate * (0.95 + Math.random() * 0.1);
    g.gain.value = vol;
    src.connect(g);
    if (pan && actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(master); } else g.connect(master);
    src.start(actx.currentTime + delay);
  });
}
// a soft low thud (wheels on a pad), the one sound simple enough to make rather than record
function thud(vol) {
  if (!actx) return;
  const s = actx.createBufferSource(); s.buffer = noiseBuffer(0.4);
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
  const g = actx.createGain(), t = actx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  s.connect(f).connect(g).connect(master); s.start();
}

// `v` is how loud, 0..1: the game passes less for things far away
export const sfx = {
  splash(v = 1, big = false) { play(big ? 'splash_big' : 'splash_small', 0.9 * v); },
  hiss(v = 1) { play('hiss', 0.7 * v); },
  newFriend(v = 1) { play('beep', 0.35 * v); play('beep', 0.3 * v, 1, 0.22); },          // the rescue radio: two short beeps
  shipHorn(v = 1) { play('ship_horn', 0.5 * v, 1.15); },
  honk(vehicle, idx) { play(vehicle === 'boat' ? 'air_horn' : 'horn', 0.55, idx ? 1.12 : 1); },
  laugh() { play('laugh', 0.55); },
  chime() { play('chime', 0.45); },
  cheer(delay = 0) { play('applause', 0.75, 1, delay); },
  // between missions: a few bars on steel drums as one starts, and a happier few when it is done
  levelStart() { play('jingle_start', 0.7); },
  levelDone() { play('jingle_done', 0.75); },
  firework(v = 1) { play('firework', 0.6 * v); },
  gulls(v = 1) { play('gull', 0.5 * v); },
  door() { play('door', 0.35); },
  winch() { play('winch', 0.3); },
  touchdown(v = 1) { thud(0.7 * v); },
};

// friends' calls: the real animal where there is a good recording of one; the rest are quiet
const CALLS = { puppy: ['dog', 1.15], kitty: ['cat', 1.05], chick: ['chick', 1], piggy: ['pig', 1.1], lamb: ['sheep', 1.12], frog: ['frog', 1] };
let lastVoiceAt = -9;
export function animalVoice(id, force, vol = 1) {
  const now = performance.now() / 1000;
  if (!force && now - lastVoiceAt < 1.2) return;
  lastVoiceAt = now;
  const c = CALLS[id];
  if (c) play(c[0], 0.6 * vol, c[1]);
}


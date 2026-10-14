// All sound is synthesised with WebAudio – no asset files.
let actx = null, master = null, muted = false;
const rotors = [];
let ocean = null;

function noiseBuffer(seconds) {
  const b = actx.createBuffer(1, actx.sampleRate * seconds, actx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3 + w * 0.25; }
  return b;
}

export const audio = {
  unlock() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      master = actx.createGain(); master.gain.value = muted ? 0 : 0.75;
      const comp = actx.createDynamicsCompressor();
      master.connect(comp).connect(actx.destination);
      const nb = noiseBuffer(3);
      // ocean bed
      const src = actx.createBufferSource(); src.buffer = nb; src.loop = true;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      const g = actx.createGain(); g.gain.value = 0.0;
      const lfo = actx.createOscillator(); lfo.frequency.value = 0.13;
      const lg = actx.createGain(); lg.gain.value = 0.05;
      lfo.connect(lg).connect(g.gain); lfo.start();
      src.connect(lp).connect(g).connect(master); src.start();
      ocean = g;
      // one rotor voice per player
      for (let i = 0; i < 2; i++) {
        const s = actx.createBufferSource(); s.buffer = nb; s.loop = true; s.loopStart = i * 0.7;
        const bp = actx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 260;
        const chop = actx.createGain(); chop.gain.value = 0.5;
        const cl = actx.createOscillator(); cl.type = 'sawtooth'; cl.frequency.value = 13;
        const cg = actx.createGain(); cg.gain.value = 0.5;
        cl.connect(cg).connect(chop.gain); cl.start();
        const whine = actx.createOscillator(); whine.type = 'triangle'; whine.frequency.value = 180;
        const wg = actx.createGain(); wg.gain.value = 0.012;
        whine.connect(wg); whine.start();
        const sub = actx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 40;
        const sg = actx.createGain(); sg.gain.value = 0; sub.connect(sg); sub.start();
        const out = actx.createGain(); out.gain.value = 0;
        const pan = actx.createStereoPanner ? actx.createStereoPanner() : actx.createGain();
        s.connect(bp).connect(chop).connect(out); wg.connect(out); sg.connect(chop);
        out.connect(pan).connect(master); s.start();
        rotors.push({ out, cl, whine, wg, sub, sg, bp, pan });
      }
    }
    if (actx.state === 'suspended') actx.resume();
  },
  setOcean(v) { if (ocean) ocean.gain.setTargetAtTime(v, actx.currentTime, 0.5); },
  // spin 0..1 (rotor rpm), load 0..1 (how hard it's working), pan -1..1
  setRotor(i, spin, load, pan, active, plane) {
    const r = rotors[i]; if (!r) return;
    const t = actx.currentTime;
    // silent when stopped; slow heavy "whop… whop…" at low rpm that tightens into a buzz, under a rising turbine whine
    r.out.gain.setTargetAtTime(active && spin > 0.004 ? 0.05 + 0.3 * Math.sqrt(spin) + 0.08 * load : 0, t, 0.12);
    r.cl.frequency.setTargetAtTime(plane ? 4 + 58 * spin + load * 14 : 1.2 + 14.5 * spin + load * 1.5, t, 0.08);
    r.whine.frequency.setTargetAtTime(70 + 520 * Math.pow(spin, 1.5) + 50 * load, t, 0.08);
    r.wg.gain.setTargetAtTime(0.006 + 0.03 * spin * (1.4 - spin), t, 0.1);
    r.sub.frequency.setTargetAtTime(34 + 26 * spin, t, 0.1);
    r.sg.gain.setTargetAtTime(0.5 * spin * (1.25 - spin), t, 0.1);
    r.bp.frequency.setTargetAtTime(120 + 150 * spin + 160 * load, t, 0.1);
    if (r.pan.pan) r.pan.pan.setTargetAtTime(pan, t, 0.2);
  },
  toggleMute() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.75, actx.currentTime, 0.05); return muted; },
};

export function tone(freq, delay, dur, type, vol, glideTo) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function noiseHit(dur, freq, vol) {
  if (!actx) return;
  const s = actx.createBufferSource(); s.buffer = noiseBuffer(dur);
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7;
  const g = actx.createGain(); const t = actx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start();
}

const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
export const sfx = {
  pop() { const f = notes[(Math.random() * notes.length) | 0]; tone(f, 0, 0.35, 'sine', 0.35, f * 1.6); },
  arpeggio() { tone(523.25, 0, 0.25, 'sine', 0.3); tone(659.25, 0.1, 0.25, 'sine', 0.3); tone(783.99, 0.2, 0.3, 'sine', 0.3); tone(1046.5, 0.32, 0.45, 'sine', 0.32); },
  fanfare() { [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) => { tone(f, i * 0.14, 0.4, 'triangle', 0.28); tone(f / 2, i * 0.14, 0.4, 'sine', 0.18); }); },
  boop() { tone(660, 0, 0.14, 'square', 0.12); tone(880, 0.12, 0.18, 'square', 0.12); },
  thump() { tone(150, 0, 0.2, 'sine', 0.3, 90); },
  chirp() { tone(1900, 0, 0.09, 'sine', 0.08, 2500); tone(2100, 0.1, 0.08, 'sine', 0.07, 2700); },
  mayday() { tone(988, 0, 0.09, 'square', 0.05); tone(988, 0.16, 0.09, 'square', 0.05); tone(740, 0.38, 0.16, 'square', 0.05); },
  horn() { tone(150, 0, 0.5, 'square', 0.1, 140); tone(225, 0.06, 0.44, 'triangle', 0.1, 210); },
  heliHorn(i) { const f = i ? 392 : 330; tone(f, 0, 0.28, 'sawtooth', 0.09); tone(f * 1.5, 0, 0.28, 'square', 0.05); },
  splash() { noiseHit(0.5, 900, 0.5); },
  boom() { noiseHit(0.9, 160, 0.9); tone(90, 0, 0.5, 'sine', 0.3, 40); },
  crackle() { for (let i = 0; i < 6; i++) tone(2000 + Math.random() * 3000, 0.25 + Math.random() * 0.5, 0.05, 'square', 0.03); },
  // starter: igniter ticks, a cough, then the turbine catches
  engineStart(spin) {
    for (let i = 0; i < 14; i++) tone(2600 + Math.random() * 600, i * 0.085, 0.025, 'square', 0.035);
    tone(70, 0.05, 2.6, 'sawtooth', 0.07, 420);
    tone(140, 0.05, 2.6, 'triangle', 0.05, 900);
    noiseHit(0.35, 300, 0.35);
  },
  engineStop() { tone(520, 0, 3.2, 'triangle', 0.045, 60); tone(900, 0, 2.2, 'sine', 0.02, 120); },
  liftoff() { noiseHit(1.1, 500, 0.5); tone(160, 0, 0.7, 'triangle', 0.12, 520); },
  touchdown() { noiseHit(0.5, 110, 1.0); tone(95, 0, 0.35, 'sine', 0.4, 45); tone(1400, 0.05, 0.08, 'square', 0.025, 900); tone(1100, 0.16, 0.06, 'square', 0.02, 800); },
  door() { tone(180, 0, 0.5, 'sawtooth', 0.05, 260); tone(900, 0.45, 0.05, 'square', 0.04); tone(520, 0.55, 0.4, 'triangle', 0.05, 380); },
  winch() { tone(300, 0, 0.12, 'triangle', 0.05, 420); },
};

const VOICES = {
  bunny() { tone(600, 0, 0.1, 'sine', 0.2, 900); tone(800, 0.1, 0.12, 'sine', 0.2, 1200); },
  kitty() { tone(650, 0, 0.12, 'sine', 0.2, 880); tone(880, 0.12, 0.3, 'sine', 0.2, 430); },
  puppy() { tone(220, 0, 0.09, 'square', 0.12, 175); tone(235, 0.15, 0.09, 'square', 0.12, 180); },
  chick() { tone(2200, 0, 0.07, 'sine', 0.09, 2600); tone(2300, 0.09, 0.07, 'sine', 0.09, 2700); },
  piggy() { tone(300, 0, 0.12, 'sawtooth', 0.1, 190); tone(280, 0.16, 0.12, 'sawtooth', 0.1, 175); },
  lamb() { tone(500, 0, 0.09, 'triangle', 0.15, 430); tone(430, 0.1, 0.09, 'triangle', 0.15, 500); tone(500, 0.2, 0.15, 'triangle', 0.15, 390); },
  panda() { tone(260, 0, 0.16, 'triangle', 0.16, 330); tone(330, 0.16, 0.2, 'triangle', 0.16, 240); },
  fox() { tone(900, 0, 0.08, 'sawtooth', 0.07, 1300); tone(1000, 0.1, 0.1, 'sawtooth', 0.07, 700); },
  frog() { tone(180, 0, 0.1, 'square', 0.1, 320); tone(180, 0.14, 0.14, 'square', 0.1, 340); },
  penguin() { tone(520, 0, 0.08, 'square', 0.08, 620); tone(520, 0.1, 0.08, 'square', 0.08, 620); tone(480, 0.2, 0.12, 'square', 0.08, 400); },
};
let lastVoiceAt = -9;
export function animalVoice(id, force) {
  const now = performance.now() / 1000;
  if (!force && now - lastVoiceAt < 1.2) return;
  lastVoiceAt = now;
  if (VOICES[id]) VOICES[id]();
}

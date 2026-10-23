import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A small WebAudio stand-in exercises the graph and pause lifecycle without an audio device.
const sources = [], contexts = [], stored = new Map();
class Param {
  value = 1;
  setTargetAtTime(v) { this.value = v; }
  setValueAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param(); playbackRate = new Param(); pan = new Param(); frequency = new Param();
  connect(node) { return node; }
  disconnect() {}
  start() { this.started = true; }
  stop() { this.stopped = true; this.onended?.(); }
}
class Context {
  currentTime = 10; sampleRate = 44100; state = 'running'; destination = new Node();
  constructor() { contexts.push(this); }
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createBufferSource() { const n = new Node(); sources.push(n); return n; }
  createBuffer(channels, length) { return { sampleRate: 44100, duration: length / 44100, getChannelData: () => new Float32Array(length) }; }
  decodeAudioData() { return Promise.resolve({ duration: 1, sampleRate: 44100, getChannelData: () => new Float32Array([0, 0.2, 0.1, 0]) }); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}
globalThis.window = { AudioContext: Context };
globalThis.localStorage = { getItem: k => stored.get(k), setItem: (k, v) => stored.set(k, v) };
const clips = ['heli_idle','heli_fly','plane_low','plane_high','boat_engine','boat_water','sea','wind','rain','fire','chime_1','applause_1'];
const source = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8')
  .replace("import LOOPS from './assets/sfx.js';", `const LOOPS = Object.fromEntries(${JSON.stringify(clips)}.map(k => [k, new Uint8Array([1,2,3])]));`);
const { audio, sfx, animalVoice } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
audio.unlock(); await flush();
assert.equal(sources.filter(s => s.loop).length, 16, 'Only six engine layers per pilot and four ambient loops');
assert.equal(contexts.length, 1);
sfx.cheer(1.1); await flush();
const applause = sources.at(-1);
assert.equal(applause.loop, undefined, 'Applause must be a one-shot');
audio.setPaused(true);
assert.equal(contexts[0].state, 'suspended');
assert.equal(applause.stopped, true, 'Pause cancels delayed celebration audio');
const before = sources.length;
sfx.chime(); await flush();
assert.equal(sources.length, before, 'No new effects while paused');
audio.setPaused(false); assert.equal(contexts[0].state, 'running');
sfx.chime(); audio.setPaused(true); audio.setPaused(false); await flush();
assert.equal(sources.length, before, 'An effect awaiting decode cannot play after pause/resume');
animalVoice('bunny', true); await flush();
assert.equal(sources.length, before + 1, 'A quiet character acknowledgment covers animals without a recording');
audio.setVolume(0.35); audio.toggleMute();
assert.deepEqual(JSON.parse(stored.get('rescue-squad-sound')), { muted: true, volume: 0.35 });
audio.setVolume(NaN); assert.equal(audio.volume, 0.35);
console.log('Audio graph, pause, acknowledgment and settings regressions passed');

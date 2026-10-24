// Bounded diagnostics also supply automatic resolution scaling. GPU queries are
// polled on later frames; never read pixels or wait for the GPU.
export function createRenderMetrics(renderer) {
  const gl = renderer.getContext(), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let enabled = false, previousAutoReset = true, current = null, query = null, started = 0, lastGpu = null, lastSimulation = 0;
  const samples = [], pending = [], changes = [], stages = new Set();
  let stageTimes = {};
  function poll() {
    const disjoint = timer && gl.getParameter(timer.GPU_DISJOINT_EXT);
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (disjoint || gl.getQueryParameter(p.query, gl.QUERY_RESULT_AVAILABLE)) {
        if (!disjoint) lastGpu = p.sample.gpu = gl.getQueryParameter(p.query, gl.QUERY_RESULT) / 1e6;
        else lastGpu = null;
        gl.deleteQuery(p.query); pending.splice(i, 1);
      }
    }
  }
  const summary = values => {
    const a = values.filter(Number.isFinite).sort((x,y)=>x-y), at = q => a.length ? a[Math.min(a.length-1, Math.floor(a.length*q))] : null;
    return { count: a.length, p50: at(.5), p95: at(.95), p99: at(.99), max: a.length ? a[a.length-1] : null };
  };
  const api = {
    get enabled() { return enabled; },
    get lastGpu() { return enabled ? lastGpu : null; },
    get lastSimulation() { return lastSimulation; },
    measure(name, fn) {
      if (!enabled) return fn();
      const t = performance.now();
      try { return fn(); } finally { const target = current ? current.stages : stageTimes; stages.add(name); target[name] = (target[name] || 0) + performance.now() - t; }
    },
    wrap(name, fn) { return function(...args) { return api.measure(name, () => fn.apply(this,args)); }; },
    start() {
      if (enabled) return;
      enabled = true; previousAutoReset = renderer.info.autoReset; renderer.info.autoReset = false;
      samples.length = changes.length = 0; stageTimes = {}; stages.clear();
    },
    stop() {
      enabled = false; renderer.info.autoReset = previousAutoReset;
      for (const p of pending) gl.deleteQuery(p.query); pending.length = 0;
    },
    quality(level, scale) { if (enabled) changes.push({ at: performance.now(), level, scale }); },
    begin(frameMs, simulationMs) {
      if (!enabled) return;
      poll(); renderer.info.reset(); lastSimulation = simulationMs; current = { frame: frameMs, simulation: simulationMs, stages: stageTimes }; stageTimes = {};
      query = timer && pending.length < 8 ? gl.createQuery() : null;
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      started = performance.now();
    },
    end() {
      if (!enabled || !current) return;
      current.submission = performance.now() - started;
      current.calls = renderer.info.render.calls; current.triangles = renderer.info.render.triangles;
      if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push({query, sample:current}); }
      samples.push(current); if (samples.length > 3600) samples.shift(); current = query = null;
    },
    snapshot() {
      if (enabled) poll();
      const fields = Object.fromEntries(['frame','simulation','submission','gpu','calls','triangles'].map(k=>[k,summary(samples.map(s=>s[k]))]));
      const cpuStages = Object.fromEntries([...stages].map(k => [k, summary(samples.map(s=>s.stages[k] || 0))]));
      return { enabled, gpuTimer: !!timer, frames: samples.length, ...fields, cpuStages, memory: {...renderer.info.memory}, programs: renderer.info.programs.length, changes: [...changes] };
    },
  };
  return api;
}

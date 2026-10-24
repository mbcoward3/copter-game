// A small driver for headless Google Chrome over its DevTools pipe (--remote-debugging-pipe), so the checks need nothing
// installed beyond Chrome itself. Used by tools/check.mjs (simulation checks) and tools/play-check.mjs (real play).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => p && existsSync(p));

// extra: more command-line switches (the real-play check lets sound start without a click and keeps drawing on)
export function launch(extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'copter-check-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--allow-file-access-from-files',
    '--user-data-dir=' + dir, ...extra, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const out = proc.stdio[3], inp = proc.stdio[4];
  let id = 0, buf = '';
  const waiting = new Map(), listeners = [];
  inp.on('data', d => {
    buf += d.toString('utf8');
    let k;
    while ((k = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, k)); buf = buf.slice(k + 1);
      if (msg.id && waiting.has(msg.id)) { const w = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? w.no(new Error(msg.error.message)) : w.ok(msg.result); }
      else for (const l of listeners) l(msg);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const i = ++id; waiting.set(i, { ok, no }); out.write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
  return {
    send, on: l => listeners.push(l),
    close: () => { try { proc.kill(); } catch {} setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 500); },
  };
}

// a page (tab) on that Chrome: evaluate script in it, navigate, press keys and click like a person does
export async function openPage(browser, { width = 1280, height = 720 } = {}) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const errors = [], logs = [];
  browser.on(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  });
  await browser.send('Runtime.enable', {}, sessionId);
  await browser.send('Page.enable', {}, sessionId);
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  // (a hidden page gets no animation frames; this one must play as if it were in front)
  await browser.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId).catch(() => {});
  const evaluate = async expr => {
    const r = await browser.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const KEYS = { KeyW: ['w', 87], KeyA: ['a', 65], KeyD: ['d', 68], KeyS: ['s', 83], ArrowUp: ['ArrowUp', 38], Escape: ['Escape', 27] };
  return {
    errors, logs, evaluate, sessionId,
    async goto(url, ready = '!!window.__game') {
      await browser.send('Page.navigate', { url }, sessionId);
      for (let i = 0; i < 900; i++) { await new Promise(r => setTimeout(r, 100)); try { if (await evaluate(ready)) return true; } catch {} }
      return false;
    },
    // real key events, through the browser's own input pipeline (the game's listeners see exactly what a keyboard sends)
    key: (code, down) => browser.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: KEYS[code][0], windowsVirtualKeyCode: KEYS[code][1] }, sessionId),
    // a real click on the middle of the element matching a CSS selector (a user gesture: it unlocks sound, as a person's does)
    async click(selector) {
      const box = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
      if (!box) throw new Error('nothing to click: ' + selector);
      for (const type of ['mousePressed', 'mouseReleased']) await browser.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 }, sessionId);
    },
    async screenshot() { const r = await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }, sessionId); return Buffer.from(r.data, 'base64'); },
  };
}

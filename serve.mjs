// Tiny static file server for local development: node serve.mjs
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = 5173;
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') path = '/rescue-squad-3d.html';
  // development only: the page posts a picture of itself here so it can be looked at afterwards (see __game.shot)
  if (req.method === 'POST' && path.startsWith('/__shot/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    await mkdir(join(ROOT, 'shots'), { recursive: true });
    await writeFile(join(ROOT, 'shots', path.slice(8).replace(/[^\w.-]/g, '_')), Buffer.concat(chunks));
    res.writeHead(200); res.end('ok'); return;
  }
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => console.log('serving on http://localhost:' + PORT));

// Bundles src/main.js + three.js into one self-contained HTML file that
// works by double-clicking it (no server, no internet needed).
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: !process.argv.includes('--dev'),
  format: 'iife',
  target: 'es2020',
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const template = readFileSync('src/index.html', 'utf8');
const html = template.replace('/*__BUNDLE__*/', () => js);
writeFileSync('rescue-squad-3d.html', html);
console.log('built rescue-squad-3d.html', (html.length / 1024).toFixed(0) + ' KB');

// Bundles src/main.js + three.js + the models and pictures in src/assets into one self-contained HTML file
// that works by double-clicking it (no server, no internet needed).
import { build } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

// the pictures in src/assets are carried inside the page; this lists them for src/assets.js
const pics = dir => readdirSync('src/assets/' + dir).filter(f => f.endsWith('.jpg'));
const names = (dir, p) => pics(dir).map((f, i) => `'${f.slice(0, -4)}': ${p}${i}`).join(', ');
writeFileSync('src/assets/pictures.js', [
  ...pics('ao').map((f, i) => `import a${i} from './ao/${f}';`),
  ...pics('ground').map((f, i) => `import g${i} from './ground/${f}';`),
  `export const AO = { ${names('ao', 'a')} };`,
  `export const GROUND = { ${names('ground', 'g')} };`, '',
].join('\n'));

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: !process.argv.includes('--dev'),
  format: 'iife',
  target: 'es2020',
  write: false,
  loader: { '.bin': 'binary', '.jpg': 'dataurl' },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const template = readFileSync('src/index.html', 'utf8');
const html = template.replace('/*__BUNDLE__*/', () => js);
writeFileSync('rescue-squad-3d.html', html);
console.log('built rescue-squad-3d.html', (html.length / 1024).toFixed(0) + ' KB');

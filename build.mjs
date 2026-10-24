// Bundles src/main.js + three.js + the models and pictures in src/assets into one self-contained HTML file
// that works by double-clicking it (no server, no internet needed).
import { build } from 'esbuild';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

// Generate the asset imports used by src/assets.js and src/audio.js.
function assetList(dir, extension, prefix, optional = false) {
  const path = 'src/assets/' + dir;
  const files = optional && !existsSync(path) ? [] : readdirSync(path).filter(f => f.endsWith(extension)).sort();
  return {
    imports: files.map((f, i) => `import ${prefix}${i} from './${dir}/${f}';`),
    entries: files.map((f, i) => `'${f.slice(0, -extension.length)}': ${prefix}${i}`).join(', '),
  };
}
const ao = assetList('ao', '.jpg', 'a'), ground = assetList('ground', '.jpg', 'g');
writeFileSync('src/assets/pictures.js', [
  ...ao.imports, ...ground.imports,
  `export const AO = { ${ao.entries} };`,
  `export const GROUND = { ${ground.entries} };`, '',
].join('\n'));
const sounds = assetList('sfx', '.mp3', 'c', true);
writeFileSync('src/assets/sfx.js', [...sounds.imports, `export default { ${sounds.entries} };`, ''].join('\n'));

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: !process.argv.includes('--dev'),
  format: 'iife',
  target: 'es2020',
  write: false,
  loader: { '.bin': 'binary', '.jpg': 'dataurl', '.mp3': 'binary' },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const template = readFileSync('src/index.html', 'utf8');
const html = template.replace('/*__BUNDLE__*/', () => js);
writeFileSync('rescue-squad-3d.html', html);
console.log('built rescue-squad-3d.html', (html.length / 1024).toFixed(0) + ' KB');

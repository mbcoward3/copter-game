// Bundles src/main.js + three.js + the models and pictures in src/assets into one self-contained HTML file
// that works by double-clicking it (no server, no internet needed).
import { build } from 'esbuild';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

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

// Human-reviewable asset budgets accompany either delivery format.
mkdirSync('build', { recursive: true });
const packedModels = readFileSync('src/assets/models.bin'), rawModels = inflateSync(packedModels);
const modelIndex = JSON.parse(rawModels.subarray(4, 4 + rawModels.readUInt32LE(0)));
const contracts = JSON.parse(readFileSync('src/assets/model-contracts.json','utf8'));
for (const [name, contract] of Object.entries(contracts)) {
  const near = modelIndex[name], far = modelIndex[name + '_far'];
  if (!near || !far || far.ni >= near.ni) throw Error('Missing or ineffective vehicle LOD: ' + name);
  if (JSON.stringify(near.contract) !== JSON.stringify(contract)) throw Error('Repack models after changing the contract: ' + name);
}
for (const [name,m] of Object.entries(modelIndex)) {
  let end=0;
  for (const group of m.groups) { if(group.start!==end || group.count%3) throw Error('Invalid material ranges: '+name);end+=group.count; }
  if(end!==m.ni || m.ni%3 || !m.nv) throw Error('Invalid mesh budget: '+name);
}
const assetReport = Object.entries(modelIndex).map(([name,m]) => ({ name, triangles:m.ni/3, vertices:m.nv, groups:m.groups.length, geometryBytes:m.nv*(24+(m.uv===undefined?0:4))+m.ni*(m.wide?4:2), bounds:{min:m.min,size:m.size}, contract:m.contract||null }));
for (const m of assetReport) if (!Number.isFinite(m.triangles) || m.groups === 0 || m.bounds.size.some(n=>!Number.isFinite(n)||n<=0)) throw Error('Invalid model: '+m.name);
writeFileSync('build/asset-report.json', JSON.stringify({ packedBytes:packedModels.length, inflatedBytes:rawModels.length, models:assetReport },null,2));

if (process.argv.includes('--hosted')) {
  const outdir = 'build/site', binaryAssets = new Map();
  rmSync(outdir, { recursive: true, force: true });      // (no stale hashed bundles from earlier builds)
  mkdirSync(outdir + '/assets', { recursive: true });
  const hosted = await build({
    entryPoints:['src/main.js'],bundle:true,minify:true,format:'esm',target:'es2022',outdir,entryNames:'app-[hash]',assetNames:'assets/[name]-[hash]',metafile:true,
    loader:{'.jpg':'file'},
    plugins:[{name:'cached-binary-assets',setup(builder){
      builder.onLoad({filter:/\.(bin|mp3)$/},args=>{
        const bytes=readFileSync(args.path),hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
        const url='assets/'+basename(args.path,extname(args.path))+'-'+hash+extname(args.path);
        writeFileSync(outdir+'/'+url,bytes);binaryAssets.set(url,bytes.length);
        return {contents:`export default new Uint8Array(await globalThis.__rescueAssets.get(${JSON.stringify(url)}));`,loader:'js'};
      });
    }}],
  });
  const entry=Object.entries(hosted.metafile.outputs).find(([,m])=>m.entryPoint)?.[0];
  const urls=[...binaryAssets.keys()];
  // Begin independent, cacheable asset requests together before evaluating the bundled modules.
  const boot=`<script>globalThis.__rescueAssets=new Map(${JSON.stringify(urls)}.map(url=>[url,fetch(url).then(r=>{if(!r.ok)throw Error('Asset unavailable: '+url);return r.arrayBuffer()})]));</script><script type="module">try{await import('./${basename(entry)}')}catch(error){const e=document.querySelector('#err');e.style.display='flex';e.textContent='The game could not finish loading. Please reload to try again.';console.error(error)}</script>`;
  writeFileSync(outdir+'/index.html',template.replace('<script>/*__BUNDLE__*/</script>',()=>boot));
  console.log('built hosted site:',resolve(outdir),`(${binaryAssets.size} independently cached binary assets)`);
}

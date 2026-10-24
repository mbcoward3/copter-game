import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { launch, openPage } from './cdp.mjs';
const root=resolve('build/site'), responses=[];
const server=createServer(async(req,res)=>{
  try {
    const file=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    if(!file.startsWith(root+sep))throw Error('Path outside site');
    const data=await readFile(file);responses.push({path:req.url,bytes:data.length});
    res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.jpg':'image/jpeg'}[extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('.html')?'no-cache':'public,max-age=31536000,immutable'});res.end(data);
  }catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=launch(['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']);
try {
 const page=await openPage(browser),url=`http://127.0.0.1:${server.address().port}/`;
 assert.ok(await page.goto(url,"!!document.querySelector('canvas.ready')"));
 const initial=responses.splice(0);await page.click('#start1');await new Promise(r=>setTimeout(r,1000));
 await mkdir('build/render',{recursive:true});await writeFile('build/render/hosted.jpg',await page.screenshot());
 assert.ok(await page.goto(url,"!!document.querySelector('canvas.ready')"));
 const reload=responses.splice(0),report={initialRequests:initial.length,initialBytes:initial.reduce((n,r)=>n+r.bytes,0),reloadRequests:reload.length,reloadBytes:reload.reduce((n,r)=>n+r.bytes,0),errors:page.errors,logs:page.logs};
 await writeFile('build/render/hosted.json',JSON.stringify(report,null,2));console.log(report);
 assert.deepEqual(page.errors,[]);assert.deepEqual(page.logs.filter(s=>s.startsWith('error:')),[]);
 assert.ok(report.reloadBytes<report.initialBytes/2,'Hashed assets survive page reload in browser cache');
}finally{browser.close();await new Promise(r=>server.close(r))}

// Measures individual assisted rescue/home trips, not just eventual mission completion.
// Starts crews through normal menus in the deterministic test page and advances game time.
// This is an accelerated simulation; pair it with rendered play and live keyboard review.
// npm run crew-trip-check -- --seeds 8 [--game path/to/build.html] [--out build/report.json]
import { launch, openPage } from "./cdp.mjs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2), opt = (key, fallback) => {
  const i = args.indexOf("--" + key);
  return i < 0 ? fallback : args[i + 1];
};
const seeds = Number(opt("seeds", 3));
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 100) throw Error("Choose 1\u2013100 seeds");
const game = resolve(opt("game", "rescue-squad-3d.html")), out = resolve(opt("out", "build/crew-trip-results.json"));
const jobs = [];
for (const crew of [["plane", "plane"], ["heli", "plane"], ["plane", "boat"]]) for (const zone of ["home", "forest", "harbour"]) for (let seed = 1; seed <= seeds; seed++) jobs.push({ crew, zone, seed });
// Always include the reported regressions, even in a reduced seed sweep.
for (const fixture of [{crew:['heli','plane'],zone:'home',seed:3},{crew:['plane','plane'],zone:'harbour',seed:8}]) {
  if (!jobs.some(j=>j.crew.join(',')===fixture.crew.join(',')&&j.zone===fixture.zone&&j.seed===fixture.seed)) jobs.push(fixture);
}
const selected=opt('only','');if(selected){for(let i=jobs.length-1;i>=0;i--)if(jobs[i].crew.join('+')+':'+jobs[i].zone+':'+jobs[i].seed!==selected)jobs.splice(i,1);if(!jobs.length)throw Error('No matching crew:zone:seed case');}
const results = [];
async function work() {
  const b = launch();
  try {
    const page = await openPage(b);
    while (jobs.length) {
      const j = jobs.shift();
      await page.goto(pathToFileURL(game).href + "?test&seed=" + j.seed);
      const r = await page.evaluate(`(()=>{const G=__game;${j.crew.map((v, i) => `document.querySelector('.veh[data-p="${i}"][data-v="${v}"]').click();document.querySelector('.flt[data-p="${i}"][data-m="easy"]').click();`).join("")}document.querySelector('[data-mode="rescue"]').click();const loc=document.querySelector('#location');loc.value='${j.zone}';loc.dispatchEvent(new Event('change'));document.querySelector('#start2').click();G.keys.add('KeyW');G.keys.add('ArrowUp');const trips=[],open=[null,null];for(let k=0;k<1800;k++){G.game.paused=false;G.game.state='play';G.debug.run(.2);for(const p of G.players){const key=p.ap?.key||p.rescueDestination||'free';let q=open[p.idx];if(!q||q.key!==key){if(q)trips.push(q);q=open[p.idx]={pilot:p.idx,vehicle:p.vehicle,key,start:k/5,startPos:p.pos.toArray(),goal:p.target?.pos.toArray(),metres:0,turn:0,landings:0,goes:0,points:[],last:p.pos.toArray(),yaw:p.yaw,afloat:p.afloat,final:p.ap?.final};}q.seconds=k/5-q.start;q.metres+=Math.hypot(p.pos.x-q.last[0],p.pos.z-q.last[2]);q.turn+=Math.abs(Math.atan2(Math.sin(p.yaw-q.yaw),Math.cos(p.yaw-q.yaw)))*180/Math.PI;if(p.afloat&&!q.afloat)q.landings++;if(q.final&&!p.ap?.final&&!p.afloat)q.goes++;if(k%10===0)q.points.push({s:k/5,pos:p.pos.toArray().map(n=>+n.toFixed(1)),cargo:p.cargo.length,incoming:p.incoming,safe:p.rescued,fs:p.fs,goal:p.target?.pos.toArray(),land:p.ap?.land,berthing:p.berthing,path:!!p.ap?.path,final:p.ap?.final,run:p.ap?.run,tries:p.ap?.tried?.length,afloat:p.afloat});q.last=p.pos.toArray();q.yaw=p.yaw;q.afloat=p.afloat;q.final=p.ap?.final;}if(G.game.celebrate>0||G.game.mission>1)return {done:true,seconds:k/5,trips:[...trips,...open.filter(Boolean)]};}return {done:false,trips:[...trips,...open.filter(Boolean)]};})()`);
      if (page.errors.length) throw Error(page.errors.join("\n"));
      results.push({ ...j, ...r });
      writeFileSync(out, JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ ...j, done: r.done, seconds: r.seconds, worst: r.trips.filter((q) => q.vehicle === "plane" && q.key !== "free").sort((a, b2) => b2.seconds - a.seconds).slice(0, 2).map((q) => ({ pilot: q.pilot, key: q.key, seconds: q.seconds, metres: Math.round(q.metres), turn: Math.round(q.turn), landings: q.landings, goes: q.goes })) }));
    }
  } finally {
    b.close();
  }
}
await Promise.all([work(), work()]);
const failures = [];
for (const r of results) {
  if(r.zone==='harbour'&&r.seed===8&&r.crew.join(',')==='plane,plane'&&(!r.done||r.seconds>180))failures.push('doing blocked takeoff recovery: two-plane Harbour seed 8 did not finish within 180 seconds');
  if (!r.done) failures.push(r.crew + " " + r.zone + " seed " + r.seed + ": mission unfinished");
  if (r.zone === "home" && r.seed === 3 && r.crew.join(",") === "heli,plane") {
    const q = r.trips.find((t) => t.pilot === 1 && t.key === "f3");
    if (!q || q.seconds > 35 || q.metres > 350) failures.push("doing nearby second pickup: Blue Home seed 3 took " + q?.seconds + " s / " + Math.round(q?.metres) + " m");
  }
  if (r.zone === "home" && r.seed === 1 && r.crew.join(",") === "plane,plane") {
    const q = r.trips.find((t) => t.pilot === 0 && t.key === "f3");
    if (!q || q.seconds > 30 || q.metres > 350) failures.push("doing nearby pickup after delivery: Red Home seed 1 took " + q?.seconds + " s / " + Math.round(q?.metres) + " m");
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}

/**
 * WebKit, measured. Every other harness runs Chrome, and Chrome composites SVG animations on its
 * own thread, so a cost that only WebKit pays never shows in them. Every browser on an iPhone is
 * WebKit. This drives a real WKWebView on the Mac (tools/webkit.swift, built with swiftc on first
 * use into tools/shots/) at a phone's 390 CSS pixels and 3x, off the screen, and reads the frames
 * from the page itself.
 *
 *   TZ=America/New_York node tools/webkit.mjs                 # every case, idle and opening
 *   TZ=America/New_York node tools/webkit.mjs coast-night idle  # one case, one mode
 *   node tools/webkit.mjs --strict                             # exit non-zero under 50 frames a second
 *
 * idle waits for the live paint, finishes the charts' entrance, then counts frames for 10 seconds.
 * open counts the first 6 seconds from the first byte, with no cache. It prints the frame rate, the
 * median and 90th-percentile frame, the frames lost, and the CPU the web and GPU processes spent.
 * There is no Playwright here, so the fixtures are baked into a document-start script that shims
 * fetch and Date in the page. macOS only.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, mkdirSync, statSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { ROOT, FONT_CSS, LOC_TZ, forecast, marine, coops, erddap } from "./fixtures.mjs";

const PORT = Number(process.env.PORCH_PORT || 8930);
const FONT_DIR = process.env.PORCH_FONT_DIR || "";
const args = process.argv.slice(2), STRICT = args.includes("--strict"), words = args.filter((a) => !a.startsWith("--"));
const MODES = words.filter((w) => w === "idle" || w === "open"), ONLY = words.filter((w) => w !== "idle" && w !== "open");

const CASES = [
  { name: "coast-night", loc: "mb", when: "2026-10-24T21:30:00", note: "the moon a night short of full, bats, the witch, the marsh lights, a little cloud",
    o: { baseTemp: 64, nowTemp: 62, feels: 62, rh: 75, isDay: 0, code: 0, cloud: 30, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8,
      sunrise: "07:30", sunset: "18:26", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "farm-night", loc: "sp", when: "2026-10-12T21:00:00", note: "an October night at the barn: bats, the witch, the fox and the owl",
    o: { baseTemp: 52, nowTemp: 49, feels: 47, rh: 70, isDay: 0, code: 1, cloud: 20, nowWind: 6, nowDir: 280, nowGust: 11, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 9,
      sunrise: "07:27", sunset: "18:52", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "coast-rain", loc: "mb", when: "2026-10-09T13:10:00", note: "rain under a full deck: the most cloud the sky draws",
    o: { baseTemp: 68, nowTemp: 66, feels: 66, rh: 94, isDay: 1, code: 63, cloud: 96, nowWind: 14, nowDir: 60, nowGust: 24, nowUv: 1.1, uvMax: 3, windAmp: 10, gustAmp: 16,
      sunrise: "07:12", sunset: "18:46", popCurve: () => 85, dailyPop: (p) => p.fill(85) } },
  { name: "coast-afternoon", loc: "mb", when: "2026-10-10T15:30:00", note: "partly cloudy, the ordinary afternoon",
    o: { baseTemp: 71, nowTemp: 75, feels: 75, rh: 55, isDay: 1, code: 2, cloud: 45, nowWind: 9, nowDir: 40, nowGust: 15, nowUv: 3.4, uvMax: 5, windAmp: 6, gustAmp: 10,
      sunrise: "07:13", sunset: "18:44", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
];

const runner = path.join(ROOT, "tools", "shots", "webkit-runner"), source = path.join(ROOT, "tools", "webkit.swift");
if (!existsSync(runner) || statSync(runner).mtimeMs < statSync(source).mtimeMs) {
  mkdirSync(path.dirname(runner), { recursive: true });
  execFileSync("swiftc", ["-O", source, "-o", runner], { stdio: "inherit" });
}

/* the page's side: fixtures for every upstream, the clock on the scenario's instant, and a frame counter */
function pageScript(cs, mode, secs) {
  const now = new Date(cs.when), tz = LOC_TZ[cs.loc], q = (p, x = "") => `https://x/?product=${p}${x}`;
  const FX = { forecast: forecast(now, cs.o, tz, cs.loc), marine: marine(now, cs.o, tz),
    hilo: coops(q("predictions", "&interval=hilo"), now, cs.o), wt: coops(q("water_temperature"), now, cs.o),
    wl: coops(q("water_level"), now, cs.o), pred: coops(q("predictions", "&interval=6"), now, cs.o), buoy: erddap(now, cs.o) };
  return `(function(){
  var FX=${JSON.stringify(FX)},T=${now.getTime()},MODE=${JSON.stringify(mode)},SECS=${secs};
  try{localStorage.setItem("mbwx-loc",${JSON.stringify(cs.loc)})}catch(e){}
  var off=T-Date.now(),RD=Date,F=function(){var a=[].slice.call(arguments);return a.length?new (Function.prototype.bind.apply(RD,[null].concat(a)))():new RD(RD.now()+off)};
  F.now=function(){return RD.now()+off};F.parse=RD.parse;F.UTC=RD.UTC;F.prototype=RD.prototype;window.Date=F;
  var rf=window.fetch;
  window.fetch=function(url){var u=String(url),b=null;
    if(/marine-api\\.open-meteo/.test(u))b=FX.marine;else if(/api\\.open-meteo/.test(u))b=FX.forecast;
    else if(/tidesandcurrents/.test(u)){var s=new URL(u).searchParams,p=s.get("product");b=p==="predictions"&&s.get("interval")==="hilo"?FX.hilo:p==="water_temperature"?FX.wt:p==="water_level"?FX.wl:p==="predictions"?FX.pred:{error:{message:"unknown product"}}}
    else if(/erddap\\.secoora/.test(u)){if(!FX.buoy)return Promise.resolve(new Response("Error {code=404;}",{status:404}));b=FX.buoy}
    else if(/api\\.weather\\.gov\\/alerts/.test(u))b={features:[]};else if(/api\\.weather\\.gov\\/products/.test(u))b={"@graph":[]};
    return b?Promise.resolve(new Response(JSON.stringify(b),{status:200,headers:{"Content-Type":"application/json"}})):rf.apply(this,arguments)};
  var post=function(o){try{webkit.messageHandlers.porch.postMessage(o)}catch(e){}},iv=[],last=0,on=false;
  (function tick(t){if(on){if(last)iv.push(t-last);last=t}requestAnimationFrame(tick)})(0);
  function report(){var s=iv.slice().sort(function(a,b){return a-b}),q=function(p){return s.length?+s[Math.min(s.length-1,Math.floor(p*s.length))].toFixed(1):null},sum=iv.reduce(function(a,b){return a+b},0);
    post({kind:"done",frames:iv.length,fps:+(iv.length/(sum/1000)).toFixed(1),p50:q(.5),p90:q(.9),max:s.length?+s[s.length-1].toFixed(1):null,
      over34:iv.filter(function(d){return d>34}).length,lost:iv.reduce(function(a,d){return a+Math.max(0,Math.round(d/16.67)-1)},0),
      animations:document.getAnimations().filter(function(a){return a.playState==="running"}).length,dpr:devicePixelRatio,width:innerWidth})}
  var live=function(){var s=document.getElementById("stamp");return s&&/^live/.test(s.textContent)};
  if(MODE==="open"){on=true;post({kind:"start"});setTimeout(function(){on=false;report()},SECS*1000);return}
  var w=setInterval(function(){if(!live())return;clearInterval(w);
    setTimeout(function(){try{finishReveal()}catch(e){}
      setTimeout(function(){post({kind:"start"});on=true;last=0;setTimeout(function(){on=false;report()},SECS*1000)},1000)},3000)},50);
})();`;
}

let script = "";
const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  if (p === "/webkit-fixture.js") { res.writeHead(200, { "Content-Type": "application/javascript" }); return res.end(script); }
  if (p === "/sw.js") { res.writeHead(404); return res.end(); }
  if (p.startsWith("/f/") && FONT_DIR) {
    const f = path.join(FONT_DIR, path.basename(p));
    if (existsSync(f)) { res.writeHead(200, { "Content-Type": "font/woff2" }); return res.end(readFileSync(f)); }
  }
  const f = path.join(ROOT, p);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  let body = readFileSync(f);
  if (p === "/index.html") {
    body = body.toString("utf8").replace("<head>", `<head><script src="/webkit-fixture.js"></script>`)
      .replace(/<link rel="preconnect"[^>]*>/g, "");
    if (FONT_DIR) body = body.replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, `<style>${FONT_CSS(PORT)}</style>`);
  }
  res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : p.endsWith(".png") ? "image/png" : "application/octet-stream" });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, r));
if (!FONT_DIR) console.warn("PORCH_FONT_DIR is unset: the page asks Google Fonts for its type.\n");

const problems = [];
for (const cs of CASES.filter((c) => !ONLY.length || ONLY.some((q) => c.name.includes(q)))) {
  console.log(`### ${cs.name}\n    ${cs.note}`);
  for (const mode of MODES.length ? MODES : ["idle", "open"]) {
    const secs = mode === "idle" ? 10 : 6;
    script = pageScript(cs, mode, secs);
    const child = spawn(runner, [`http://localhost:${PORT}/index.html`, "390", "1.5", String(secs + 40)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = ""; child.stdout.on("data", (d) => { out += d; });
    await new Promise((r) => child.on("exit", r));
    const line = out.split("\n").find((l) => l.startsWith("{\"cpu"));
    if (!line) { problems.push(`${cs.name} ${mode}: no report (${out.trim().slice(0, 120)})`); continue; }
    const r = JSON.parse(line), p = r.page;
    console.log(`    ${mode.padEnd(4)} ${String(p.fps).padStart(5)} fps, frames ${p.p50}ms median, ${p.p90}ms p90, ${p.max}ms worst, ${p.lost} lost, ${p.over34} over 34ms` +
      ` | cpu over ${secs}s: web ${r.cpuWeb.toFixed(1)}s, gpu ${r.cpuGpu.toFixed(1)}s | ${p.animations} animations, ${p.width}px at ${p.dpr}x`);
    if (STRICT && mode === "idle" && p.fps < 50) problems.push(`${cs.name}: ${p.fps} frames a second at idle`);
  }
}
server.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.join("\n  ")}` : "\nno problems found");
process.exit(problems.length ? 1 : 0);

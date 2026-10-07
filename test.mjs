import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { inflateSync } from "node:zlib";

const root = new URL("./", import.meta.url);

test("application scripts and manifest parse", async () => {
  const [html, worker, manifestText] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("sw.js", root), "utf8"),
    readFile(new URL("manifest.json", root), "utf8"),
  ]);

  const inlineScript = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(inlineScript, "index.html should contain its application script");
  assert.doesNotThrow(() => new vm.Script(inlineScript[1]));
  assert.doesNotThrow(() => new vm.Script(worker));
  assert.doesNotThrow(() => JSON.parse(manifestText));
  assert.equal(JSON.parse(manifestText).background_color, "#FAFAF6");
});

test("reliability guardrails stay in place", async () => {
  const [html, worker] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("sw.js", root), "utf8"),
  ]);

  assert.match(html, /async function fetchJSON\(url,timeoutMs=7000\)/);
  assert.match(html, /const initialCached=readCache\(LOC\.id\)/);
  assert.match(html, /const CACHE_MAX_AGE=6\*3\.6e6/);
  assert.match(html, /JSON\.stringify\(\{savedAt:Date\.now\(\),data\}\)/);
  assert.match(html, /forecastDay\(cached\.data\)===todayET\(\)/);
  assert.doesNotMatch(html, /marine=\{wave_height_max:2\.5,wave_period_max:5\}/);
  assert.match(worker, /controller\.abort\(\),4000/);
  assert.match(worker, /mbwx-shell-v89/);
  // the clouds end in their own scallops: Josh loves the clouds and not the curly tail
  const cloud = html.match(/const propCloud=seed=>\[[\s\S]*?\];/);
  assert.ok(cloud, "propCloud should be extractable");
  assert.doesNotMatch(cloud[0], /curlT|pTaper/);
  assert.match(worker, /caches\.match\(e\.request,\{ignoreSearch:true\}\)\|\|fetch\(e\.request\)/);
});

test("a shared link with tracking text still opens from the offline shell", async () => {
  const worker = await readFile(new URL("sw.js", root), "utf8");
  const listeners = {};
  let matchOptions, fetches = 0;
  const cached = { source: "cached shell" };
  const retried = { source: "network retry" };
  let cacheResult = cached, succeedOnRetry = false;
  const context = {
    URL, AbortController, setTimeout, clearTimeout,
    fetch: async () => { fetches++; if (succeedOnRetry && fetches === 2) return retried; throw new Error("offline"); },
    caches: {
      match: async (_request, options) => { matchOptions = options; return cacheResult; },
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      keys: async () => [], delete: async () => {},
    },
    self: {
      addEventListener: (name, fn) => { listeners[name] = fn; },
      skipWaiting: () => {}, clients: { claim: () => {} },
    },
  };
  vm.runInNewContext(worker, context);
  let response;
  listeners.fetch({
    request: { method: "GET", url: "https://joshsmith-lab.github.io/mossbridge-wx/?fbclid=family" },
    respondWith: (promise) => { response = promise; },
  });
  assert.equal(await response, cached);
  assert.equal(fetches, 1);
  assert.equal(matchOptions.ignoreSearch, true);

  cacheResult = null; succeedOnRetry = true; fetches = 0;
  listeners.fetch({
    request: { method: "GET", url: "https://joshsmith-lab.github.io/mossbridge-wx/?utm_source=message" },
    respondWith: (promise) => { response = promise; },
  });
  assert.equal(await response, retried);
  assert.equal(fetches, 2);
});

test("loading, cached data and the hourly explorer tell the truth", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // A fresh farm load never flashes the coast's tide chart or scene description.
  assert.match(html, /function paintLocationShell\(\)/);
  assert.match(html, /tideSection"\)\.style\.display=LOC\.tide\?"":"none"/);
  assert.match(html, /Sun and moon over Appalachian ridgelines and the farm pond/);
  assert.match(html, /else paintLoadingState\(\);\s*refresh\(\);/);

  // A cached forecast says how old it is, and its live pulse stands still.
  assert.match(html, /function cacheAgeText\(savedAt\)/);
  assert.match(html, /return`updated \$\{mins\}m ago`/);
  assert.match(html, /classList\.toggle\("cached",!live\)/);
  assert.match(html, /\.cached \.live-dot\{animation:none/);
  const cacheCode = html.match(/const cacheKey=id=>"mbwx-"\+id;[\s\S]*?\n}\n(?=function writeCache)/)?.[0];
  assert.ok(cacheCode, "cache reader should be extractable for its rollover check");
  // The rollover check now asks the *location's* clock what day it is, so the sandbox has to
  // supply one. Denver crossing midnight while Porters Neck has not is exactly the case a
  // travel location introduces, and it is the reason this is worth pinning.
  const runCache = (stored, today) => {
    const ctx = { localStorage: { getItem: () => JSON.stringify(stored) }, locToday: () => today, result: "not run" };
    vm.runInNewContext(`${cacheCode}\nresult=readCache("mb");`, ctx);
    return ctx.result;
  };
  const fresh = (time) => ({ savedAt: Date.now(), data: { current: { time } } });
  assert.equal(runCache(fresh("2000-01-01T23:55"), "2000-01-02"), null,
    "a fresh timestamp must not make yesterday's forecast current");
  assert.ok(runCache(fresh("2000-01-02T00:05"), "2000-01-02"),
    "a forecast from today's date on the location's clock is still good");
  assert.equal(runCache(fresh("2000-01-02T23:55"), "2000-01-03"), null,
    "and it goes stale the moment that clock rolls over, not the phone's");

  // Feels-like is real hourly data, revealed only when it differs enough to matter.
  assert.match(html, /hourly=temperature_2m,apparent_temperature,precipitation_probability/);
  assert.match(html, /feels:wj\.hourly\.apparent_temperature\?\.slice\(i0\)/);
  // and the hourly readout is one reader on the one machine every chart reads through
  assert.match(html, /const showFeels=T!=null&&F!=null&&Math\.abs\(F-T\)>=3;/);
  assert.match(html, /function readHour\(h,i,nowI,golden=false\)\{/);
  assert.match(html, /function xpSetup\(k,\{view=null,pick=false,release=null\}=\{\}\)\{/);
  assert.match(html, /if\(e\.key!=="PageUp"&&e\.key!=="PageDown"\)return;/);
  assert.match(html, /xpPublish\("hourly",\{svg:hourlySvg,/);
  assert.match(html, /else if\(pop>=DRY_UNDER\|\|isWet\(code\)\)\{parts\.push\(\[`\$\{kind\} \$\{pop\}%`,""\]\);said\.push\(`\$\{pop\} percent chance of \$\{kind\}`\)\}/);
  assert.match(html, /document\.addEventListener\("pointercancel",e=>\{if\(e\.pointerId!==X\.ptr\)return;drop\(\);xpHide\(X\)\}\);/);
  assert.match(html, /<input class="xp-key" type="range" min="0" max="0" step="1" value="0" disabled aria-label="Next 24 hours, hour by hour">/);
  assert.doesNotMatch(html, /HOURLY_PEEK|TIDE_PEEK|setupHourlyPeek|setupTidePeek|PeekLive|hourly-cursor|tide-cursor/);
  // clipped sideways only (hidden where clip is not known), so the chart never scrolls across and a
  // pill lifted clear of its ring is not cut off at the top
  assert.match(html, /\.hourly-scroll\{margin:0;padding:0;overflow:hidden;overflow:clip visible\}/);
  assert.match(html, /\.hourly-inner\{min-width:0;width:100%/);
  assert.match(html, /viewBox="0 0 700 160"/);
  assert.match(html, /const trendTemp=fillT\.map/);
  // a missing hour is not a zero: the line runs through it between its known neighbours, and the
  // marks are the known hours only, so no dot is drawn at NaN and the real low keeps its mark
  assert.match(html, /const hiI=kt\.length\?kn\.indexOf\(Math\.max\(\.\.\.kt\)\):-1,loI=kt\.length\?kn\.indexOf\(Math\.min\(\.\.\.kt\)\):-1;/);
  assert.match(html, /marks:\[nowI,hiI,loI\]\.filter\(i=>i>=0\)/);
  // and past the first or last known hour there is no neighbour, so the line and its fill stop at
  // the known hours rather than holding flat a temperature the run does not carry
  assert.match(html, /const line=drawn\?spline\(pts\.slice\(kf,kl\+1\)\):"",xa=drawn\?X\(kf\):X\(0\),xb=drawn\?X\(kl\):X\(0\);/);
  assert.match(html, /revealChart\("hourly",hourlySvg,\{xa,xb,/);
  // The Tonight card never reads a missing hour as zero, or calls the minimum of an incomplete
  // run the night's low. Its weather remains independent of its temperature readings.
  assert.match(html, /function tonightBrief\(dy,h,now\)/);
  assert.match(html, /const low=full&&temps\.length===slots\.length\?Math\.round\(Math\.min\(\.\.\.temps\)\):null;/);
  assert.doesNotMatch(html, /temp:Number\(h\.temp\[i\]\)/);
  assert.match(html, /class="tline"[^>]*vector-effect="non-scaling-stroke"/);

  // The two tiny-looking masthead controls remain full touch targets and keyboard operable.
  assert.match(html, /id="locBtn" role="button" tabindex="0"/);
  assert.match(html, /id="refreshBtn" role="button" tabindex="0"/);
  assert.match(html, /min-height:44px/);
  assert.match(html, /keyboardClick\(document\.getElementById\("refreshBtn"\),refresh\)/);
});

test("overnight copy follows the night the family is actually in", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /const before=now<rise,when=before\?"before morning":"tonight"/);
  assert.match(html, /const end=new Date\(dy\.sunrise\?\.\[before\?0:1\]\)/);
  assert.doesNotMatch(html, /const fallbackDay=|const fallbackLow=/);
  assert.match(html, /const start=before\|\|now>=set\?new Date\(now\):new Date\(set\)/);
  // after midnight the golden hour named is this morning's: the note takes the first gold band
  // on the chart that has not ended, and the Tonight card no longer says it a second time
  assert.match(html, /const nextLight=goldWindows\.find\(gw=>gw\.b>now\)\|\|null;/);
  // Missing storm direction does not turn a moving system into a stationary one.
  assert.match(html, /const motion=s\.spd>0\?\(s\.dirDeg!=null\?"moving "/);
});

test("the sunrise and sunset times stay readable on any sky", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // The sky picks one of two inks by contrast; the halo has to be the other one. Keying it
  // off the theme instead put a light halo under light text at golden hour and erased the
  // word, and a 2.6px stroke on a 10px face closed every counter besides.
  assert.match(html, /--on-sky:#0F2B36; --off-sky:#F7F4EA;/);
  assert.match(html, /root\.setProperty\("--off-sky",bright\?LIT_ON:INK_ON\);/);
  assert.match(html, /\.suntime\{paint-order:stroke;stroke:var\(--off-sky,#F7F4EA\);stroke-width:1\.3px;/);
  assert.match(html, /const lab=\(f,t\)=>`<text class="suntime"/);
  // the halo is CSS now, so no <text> carries a hand-set stroke on the sky at all
  assert.doesNotMatch(html, /<text[^>]*paint-order="stroke"[^>]*>\$\{t\}/);
  assert.doesNotMatch(html, /stroke="\$\{dark\?"#0A1A22":"#F4F3EC"\}"/);
  // and the two numbers written on the sky are no longer at 70% of it
  assert.match(html, /font-weight="600" fill="currentColor" opacity="\.92"/);
  // the override is cleared with the rest when a render bails out
  assert.match(html, /"--sky3","--on-sky","--off-sky","--scrim"/);
});

test("the rain chance bars can be read from across the room", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // A ten percent hour drew four pixels of pale blue at .3 opacity, and a 3px corner
  // radius on a four pixel bar rounded the shape away into a lozenge with no top edge.
  assert.doesNotMatch(html, /width="11" height="\$\{bh\.toFixed\(1\)\}" rx="3"/);
  assert.doesNotMatch(html, /opacity="\$\{h\.pop\[i\]>=40\?\.55:\.3\}"/);
  // the radius follows the height, so a short bar keeps a flat top to read
  assert.match(html, /rx="\$\{Math\.min\(3,bh\*\.3\)\.toFixed\(1\)\}"/);
  // and the ink climbs with the odds rather than stepping once at forty
  assert.match(html, /opacity="\$\{\(\.48\+Math\.min\(h\.pop\[i\],60\)\/60\*\.36\)\.toFixed\(2\)\}"/);
  // the scale itself is untouched: height is still .42 of the odds, floored only where
  // the true bar is under five units and a trace is a trace at any of them
  assert.match(html, /const bh=Math\.max\(5,h\.pop\[i\]\*\.42\)/);
  // the printed number still belongs to the hours that are actually likely
  assert.match(html, /if\(h\.pop\[i\]>=40&&i%4===2&&i!==hiI&&i!==loI\)/);
  // the odds number carries its percent sign, as the week's do, so it never reads as a temperature
  assert.match(html, /\$\{rvAt\(x,"label",240\)\}>\$\{h\.pop\[i\]\}%<\/text>/);
});

test("the hourly labels step aside instead of printing through each other", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // On a phone an hour is about twelve pixels wide. The 78° beside a 79° high printed
  // straight through it, and a 62° sat under the 61° low. Labels are placed against boxes:
  // obstacles first (bars, key dots), then the high, now and the low, then every fourth hour
  // where it has room, then the rain odds, then the moon on the night band.
  assert.match(html, /const taken=\[\],hit=b=>taken\.some\(/);
  // now is the hour now is in on the wall clock, so on a cache opened late the axis's NOW and the
  // now dot sit where the reading says now, not on an hour that has passed
  assert.match(html, /const keys=\[\.\.\.new Set\(\[hiI,nowI,loI\]\)\]\.filter\(i=>i>=0&&kn\[i\]!=null\);/);
  assert.match(html, /nowF=h\.time\.findIndex\(t=>new Date\(t\)\.getTime\(\)>=nowHr0\),nowI=nowF<0\?n-1:nowF;/);
  assert.match(html, /\$\{i===nowI\?"mark":""\}[^\n]*\$\{i===nowI\?"NOW":/);
  // the high always keeps the space above its dot; now and the low may take the space under theirs
  assert.match(html, /if\(hit\(b\)&&i!==hiI\)\{const uy=below\(x,y,15\.86,t,22\),under=box\(x,uy,15\.86,t\)/);
  // and every label clears the line under both of its ends, not only its own dot
  assert.match(html, /const above=\(x,y,size,txt,gap\)=>\{const hw=txt\.length\*size\*\.3\+2;return Math\.min\(y-gap,yAt\(x-hw\)-5,yAt\(x\+hw\)-5\)\};/);
  // the hour right beside a key label would only repeat it
  assert.match(html, /if\(kn\[i\]==null\|\|keys\.some\(k=>Math\.abs\(k-i\)<2\|\|\(Math\.abs\(k-i\)<=3\|\|Math\.abs\(X\(k\)-X\(i\)\)<64\)&&Math\.round\(h\.temp\[k\]\)===Math\.round\(h\.temp\[i\]\)\)\)continue;/);
  // with no room over or under its dot, a key label steps along the row away from what it hit
  assert.match(html, /for\(let st=4;st<=40;st\+=2\)\{const sx=x\+dir\*st/);
  // the rain odds give way to the line too; the bar already says it
  assert.match(html, /if\(hit\(b\)\|\|Math\.min\(\.\.\.ys\)<b\[3\]\+3&&Math\.max\(\.\.\.ys\)>b\[1\]-3\)continue;/);
  // a regular hour that has no room is left out, dot and all
  assert.match(html, /if\(hit\(b\)\|\|hit\(d\)\|\|prev&&prev\.t===t&&x-prev\.x<64\)continue;/);
  // the night tag is decoration: it gives way to the numbers. The band and the moon already say
  // it is dark, so the words are gone and the moon is placed against its own box
  assert.match(html, /!hit\(\[c0-7,9,c0\+7,23\]\)\)\{cx=c0;break\}/);
  assert.match(html, /<path d="M 4\.6 0 a 4\.6 4\.6 0 1 1-4\.6-4\.6 A 3\.6 3\.6 0 0 0 4\.6 0 Z"\/><\/g>`;/);
  assert.doesNotMatch(html, /AFTER DARK<\/text>/);
});

test("the page agrees with itself", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // the chart's NOW is the reading in the header, not the top-of-hour forecast
  assert.match(html, /temp:hourly\.temp\.map\(\(t,i\)=>i\?t:now0\(t,"temperature_2m"\)\)/);
  // ink is judged against the cloud the text sits on as well as the bare gradient
  assert.match(html, /const cInk=Math\.min\(contrast\(INK_ON,field\),contrast\(INK_ON,lit\)\)/);
  // the headline never names an hour that has already started
  assert.match(html, /second=wetI===w0\n\s*\?\(kind\?`\$\{kind\} \$\{likely\?"likely any time now\.":"could start any time\."\}`:likely\?"Rain likely any time now\.":"Showers could pop up any time\."\)/);
  // no sunscreen schedule when the rest of today's hourly UV stays under 3: the sun card steps
  // aside rather than say so, and the hour it starts from is the live reading
  assert.match(html, /if\(!slots\.length\)return null;/);
  assert.match(html, /document\.getElementById\("sunCard"\)\.hidden=!sunAdvice;/);
  assert.match(html, /uv:hourly\.uv&&hourly\.uv\.map\(\(u,i\)=>i\?u:now0\(u,"uv_index"\)\)/);
  assert.doesNotMatch(html, /UV stays low|Sunscreen weather is over|The strong sun is done|Easy sun/);
  // golden hour is said once, as the legend of the hourly chart's gold bands: the Tonight card
  // no longer repeats it, and the low stays with its words
  assert.doesNotMatch(html, /id="goldTimes"|goldBits|\.gold-bit\{/);
  // (and a low the run does not carry is said unavailable, never 0°)
  assert.match(html, /const lowText=low==null\?"Low unavailable":`a low of \$\{low\}°`;/);
  assert.match(html, /`Down to \$\{low\}° \$\{when\}\.`;/);
  // Low odds never become a promise of dry weather, and a wet code still keeps its name.
  assert.doesNotMatch(html, /mostly dry \$\{when\}/i);
  // Ice and snow get their odds words from their own hours: likely from 60, otherwise possible.
  assert.match(html, /let weather=ice\.length\?`Freezing rain \$\{likely\(ice\)\?"likely":"possible"\}`:/);
  assert.match(html, /snow\.length\?`Snow \$\{likely\(snow\)\?"likely":"possible"\}`:/);
  // inside a golden hour the note says how long it has left
  assert.match(html, /now>=nextLight\.a\?"until "\+clock\(nextLight\.b\):spanTxt\(nextLight\.a,nextLight\.b\)/);
  // the lit side of the moon is the light side on both themes
  // (a pale moon, not the paper: #FFF6E2 on #FAFAF6 read as an empty ring)
  assert.match(html, /\.moon-phase \.moon-lit\{fill:#F5E6B8\}/);
  // a star on a line of type is left out
  assert.match(html, /function starsClearOfType\(\)/);
  // text boxes only, and each star placed from its own percentages so a second call agrees
  assert.match(html, /createTreeWalker\(el,NodeFilter\.SHOW_TEXT\)/);
  assert.match(html, /parseFloat\(st\.getAttribute\("cx"\)\)/);
  // the UV words start where their bands start on the bar's 0-12 scale
  assert.match(html, /\.uv-scale span:nth-child\(3\)\{left:50%\}/);
  // and the bar is that same scale, lit in the gradient's own stops
  assert.match(html, /const X=u=>clamp\(u,0,12\)\/12\*W/);
  assert.match(html, /const UV_STOPS=\[\[0,"#4E9E6E"\],\[\.38,"#D9B437"\],\[\.68,"#C7431F"\],\[1,"#7A3A86"\]\];/);
});

test("each location keeps its own clock", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // Every place carries its zone and the label it is quoted in.
  assert.match(html, /tz:"America\/New_York",tzLabel:"ET"/);
  assert.match(html, /tz:"America\/Denver",tzLabel:"MT"/);
  assert.doesNotMatch(html, /timezone=America%2FNew_York/);
  // eight days, so next weekend's Sunday is there on a Sunday (see weekSpan)
  assert.match(html, /&timezone=\$\{encodeURIComponent\(L\.tz\)\}&forecast_days=8/);
  assert.match(html, /clock12\(new Date\(c\.time\)\)\+" "\+LOC\.tzLabel/);
  assert.match(html, /const bd=yest\.toLocaleDateString\("en-CA",\{timeZone:L\.tz\}\)/);

  // The app reasons in the location's wall clock; the astronomy converts back to a real
  // instant so the sun is where it actually is rather than where the phone thinks it is.
  assert.match(html, /const wallNow=\(\)=>new Date\(Date\.now\(\)\+TZSHIFT\)/);
  assert.match(html, /function sunPos\(date\)\{const t=trueTime\(date\);/);
  assert.match(html, /function moonPos\(date\)\{const t=trueTime\(date\);/);
  assert.match(html, /function moonPhase\(date\)\{const d=toDays\(trueTime\(date\)\)/);
  assert.match(html, /const now=wallNow\(\), sunrise=/);
  assert.match(html, /const now=wallNow\(\),t0=/);
  assert.match(html, /const now=wallNow\(\)\.getTime\(\);/);

  // And the shift itself is real arithmetic, not a hardcoded offset: run it.
  const shiftCode = html.match(/const tzOffset=[\s\S]*?function syncClock\(\)\{[^}]*\}/)?.[0];
  assert.ok(shiftCode, "the clock shift should be extractable");
  const at = (tz, iso) => {
    const ctx = { Date, LOC: { tz }, TZSHIFT: 0, out: 0 };
    vm.runInNewContext(`${shiftCode}\nconst d=new Date("${iso}");out=tzOffset(LOC.tz,d)/3600000;`, ctx);
    return ctx.out;
  };
  // Denver is two hours behind New York on both sides of a daylight-saving change.
  assert.equal(at("America/New_York", "2026-08-15T18:00:00Z") - at("America/Denver", "2026-08-15T18:00:00Z"), 2);
  assert.equal(at("America/New_York", "2026-01-15T18:00:00Z") - at("America/Denver", "2026-01-15T18:00:00Z"), 2);
  // and the offsets are the real ones, not a fixed guess
  assert.equal(at("America/Denver", "2026-08-15T18:00:00Z"), -6);
  assert.equal(at("America/Denver", "2026-01-15T18:00:00Z"), -7);
  // A locale string is never parsed back into a Date: that reads it as phone time.
  assert.doesNotMatch(html, /new Date\([^()]*\.toLocale(?:Date|Time)?String\(/);
});

test("the clock holds across the nights the clocks change", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const code = html.match(/let TZSHIFT=0;[\s\S]*?const trueTime=[^\n]*/)?.[0];
  assert.ok(code, "the clock shift should be extractable");

  // The oracle is written out by hand rather than asked of Intl, so it cannot share a
  // mistake with the code it checks: each zone's offset and the instant it changes.
  const ZONES = {
    "America/New_York": [["2026-11-01T06:00Z", -4, -5], ["2027-03-14T07:00Z", -5, -4]],
    "America/Denver": [["2026-11-01T08:00Z", -6, -7], ["2027-03-14T09:00Z", -7, -6]],
  };
  // 8 p.m. Eastern the evening before until both zones have turned, every ten minutes.
  const WINDOWS = [["2026-11-01T00:00Z", "2026-11-01T10:00Z"], ["2027-03-14T01:00Z", "2027-03-14T11:00Z"]];

  // Run in a phone whose own clock is really set to the zone, because the old shift went
  // wrong exactly where a string is read back as phone time, and injecting an offset would
  // not reproduce that.
  const child = `
    const vm=require("vm"),{code,zones,windows}=JSON.parse(require("fs").readFileSync(0,"utf8"));
    const ctx=vm.createContext({NOW:0,LOC:null});
    vm.runInContext("const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...a){a.length?super(...a):super(NOW)}static now(){return NOW}};"+code,ctx);
    const pad=n=>String(n).padStart(2,"0"),at=(d,utc)=>{const g=k=>d[(utc?"getUTC":"get")+k]();
      return g("FullYear")+"-"+pad(g("Month")+1)+"-"+pad(g("Date"))+" "+pad(g("Hours"))+":"+pad(g("Minutes"))};
    const off=(tz,t)=>{const [x]=zones[tz].filter(([iso])=>Math.abs(t-Date.parse(iso))<864e5);return (t<Date.parse(x[0])?x[1]:x[2])*36e5};
    const rows=[];
    for(const tz in zones)for(const [a,b] of windows)for(let t=Date.parse(a);t<=Date.parse(b);t+=6e5){
      ctx.NOW=t;ctx.LOC={tz};
      const [shift,wall]=vm.runInContext("syncClock();[TZSHIFT,wallNow().getTime()]",ctx);
      rows.push({tz,at:new Date(t).toISOString().slice(0,16)+"Z",shift:shift/36e5,reads:at(new Date(wall)),wants:at(new Date(t+off(tz,t)),true)});
    }
    process.stdout.write(JSON.stringify(rows));`;
  const { execFileSync } = await import("node:child_process");
  const sweep = (phone) => JSON.parse(execFileSync(process.execPath, ["-e", child], {
    input: JSON.stringify({ code, zones: ZONES, windows: WINDOWS }),
    env: { ...process.env, TZ: phone }, encoding: "utf8",
  })).map((r) => ({ phone, ...r }));

  for (const phone of Object.keys(ZONES)) {
    const rows = sweep(phone);
    assert.equal(rows.length, 4 * 61);
    // A phone at home reads its own clock: no shift at all, so every instant is the real one.
    // This is the night the old shift ran an hour slow, from 10 p.m. on October 31 Eastern.
    assert.deepEqual(rows.filter((r) => r.tz === phone && r.shift !== 0), []);
    // Away from home, the wall clock reads the place's, through its own change and the phone's.
    assert.deepEqual(rows.filter((r) => r.reads !== r.wants), []);
  }
});

test("every motion is driven by a reading, not by decoration", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // water: wind sets the chop, the tide sets where the light sits on it
  assert.match(html, /const chopK=clamp\(\(wind-5\)\/13,0,1\)/);
  // water is never perfectly still, so a calm keeps two faint dashes rather than none
  assert.match(html, /\{const ww=mulberry\(4419\),count=2\+Math\.round\(chopK\*7\)/);
  // a cloud shadow needs discrete clouds and a sun: clear casts none, overcast is all
  // shadow already, and fog has no directional light at all
  assert.match(html, /if\(PRM\|\|storm\|\|fog\|\|cloud<12\|\|cloud>92\)return""/);
  // the barn vane's bearing is authoritative; even its real-world quiver stays within 1.25°
  assert.match(html, /const windFrom=\(\(Number\(weather\.wind_direction_10m\)\|\|0\)%360\+360\)%360/);
  assert.match(html, /transform="rotate\(\$\{windFrom\.toFixed\(1\)\} 0 0\)"><g class="vane-hunt" data-vane-bearing="\$\{Math\.round\(windFrom\)\}"/);
  assert.match(html, /const vaneHunt=clamp\(\(gust-wind\)\*\.11,\.15,1\.25\)/);
  assert.match(html, /--vh-neg:-\$\{vaneHunt\.toFixed\(1\)\}deg/);
  assert.match(html, /function tideTrend\(preds\)/);
  assert.match(html, /renderScene\(sunrise,sunset,now,c,dark,LOC\.tide\?tideTrend\(d\.tides\):0,allowedFishWins\)/);
  assert.match(html, /specular\(glintX,GY\+12\.5,tideDir<0\?2\.4:tideDir>0\?-1\.6:0\)/);

  // vegetation: gusts raise the throw, and the wave crosses the bank downwind
  assert.match(html, /const gust=Math\.max\(wind,Number\(weather\.wind_gusts_10m\)\|\|0\)/);
  assert.match(html, /const downwind=windFrom>180\?-1:1/);
  assert.match(html, /const waveDelay=\(i,dur\)=>-\(dur\*\(\(downwind>0\?i:BANDS-1-i\)\*\.15\+bandLag\[i\]\)\)/);
  assert.match(html, /swayAmt=clamp\(\.5\+wind\*\.095\+\(gust-wind\)\*\.055,\.5,3\.9\)/);

  // wildlife: one gull crosses; articulated wings and species-specific joints replace bobbing blobs
  assert.match(html, /class="gull-cross"/);
  assert.match(html, /@keyframes gullCross/);
  assert.match(html, /class="heron-strike"/);
  // mostly still: two steps, a strike, no walk home (that was the moonwalk)
  assert.match(html, /29\.5%,80%\{transform:translateX\(-5\.6px\)\}/);
  assert.doesNotMatch(html, /61\.5%,64%\{transform:translateX\(-2\.8px\)\}/);
  assert.match(html, /class="heron-wade"/);
  assert.match(html, /@keyframes heronWade/);
  assert.match(html, /heronWade 150s/);
  // the heron's ankle sits behind its hip (+x, he faces -x): the leg bends backward, the way
  // a heron's does, as a thigh and a tarsus hanging from the ankle joint
  assert.match(html, /pTaper\(\[\[1\.8,-31,2\.2\],\[2\.8,-23\.9,1\.4\],\[3\.4,-16\.8,1\.5\]\],"leg"\)/);
  assert.match(html, /class="heron-tarsus"/);
  assert.match(html, /class="heron-lunge"/);
  // the heron never turns. The end-of-loop flip was there to mask the drift back to its
  // mark, and a fold-and-flip on a fourteen-second beat read as a twirl; 5.6px over
  // thirty seconds needs no mask
  assert.doesNotMatch(html, /heronFace/);
  assert.doesNotMatch(html, /heron-face/);
  assert.doesNotMatch(html, /scaleX\(\.12\)/);
  assert.doesNotMatch(html, /rotate\(-80deg\)/);
  assert.match(html, /class="heron-splash" data-water-contact="heron-bill"/);
  // Water answers the actual feet and bill, on the same wall-clock phase as the joints.
  assert.match(html, /heronStepRingA 150s/);
  assert.match(html, /data-water-contact="heron-near"[\s\S]*?style="\$\{phase\(150\)\}"/);
  assert.match(html, /data-water-contact="heron-far"[\s\S]*?style="\$\{phase\(150\)\}"/);
  assert.doesNotMatch(html, /showHeron\?ringAt/);
  assert.match(html, /class="crab-ripple" data-water-contact="crab"[\s\S]*?style="\$\{phase\(58\)\}"/);
  assert.match(html, /crabStep 58s/);
  assert.equal((html.match(/class="crab-leg" style=/g) || []).length, 4);
  assert.equal((html.match(/class="crab-support"/g) || []).length, 4);
  assert.match(html, /class="frog-throat" style="opacity:.25;transform:scale\(\.88\);\$\{phase\(13\)\}"/);
  assert.match(html, /class="frog-ripple" data-water-contact="frog"[\s\S]*?style="\$\{phase\(13\)\}"/);
  // one look per 97s, phased off the wall clock. Two sweeps every 31s had a bird whose
  // whole character is stillness moving forty per cent of the time
  assert.match(html, /animation:heronScan 97s/);
  assert.doesNotMatch(html, /heronScan 31s/);
  assert.match(html, /@keyframes heronScan\{0%,80%,100%\{transform:rotate\(0\)\}/);
  assert.match(html, /class="heron-scan" style="\$\{phase\(97\)\}"/);
  // the storybook heron stands tall, so the strike pitches the body well forward and swings
  // the neck down far enough that the bill actually meets the water
  assert.match(html, /40\.8%,43\.6%\{transform:translate\(-1px,2\.8px\) rotate\(-46deg\)\}/);
  assert.match(html, /40\.8%,43\.6%\{transform:rotate\(-48deg\) translate\(0,7px\)\}/);
  assert.doesNotMatch(html, /M 18\.4 34\.2 L 17\.7 38\.0/);
  assert.match(html, /class="flight-wing wing-l"/);
  assert.match(html, /rapid mirrored triangles read as a bat/);
  // A bird at fourteen pixels is a silhouette. Wings are filled tapers that come to a point;
  // they used to be constant-width strokes with two short strokes at each tip standing in for
  // spread primaries, and splayed tips on a constant-width wing is the shape of a bat's hand.
  assert.match(html, /const flip=d=>d\.replace\(\/-\?\[\\d\.\]\+\/g,n=>i\+\+%2\?n:/);
  assert.doesNotMatch(html, /M -7\.5 -2\.4 L -9\.8 -3|M -7\.2 -\.7 L -9\.5 -1\.6/);
  // and they beat in a short burst before going back to a glide, rather than once
  assert.match(html, /@keyframes wingBeat\{0%,52%,100%\{transform:rotate\(var\(--rest\)\)\}/);
  assert.match(html, /data-species="great-blue-heron"/);
  assert.match(html, /data-species="fiddler-crab"/);
  assert.match(html, /class="raccoon-head"/);
  assert.doesNotMatch(html, /heron-breathe/);
  assert.match(html, /const flyCount=Math\.round\(clamp\(3\+\(temp-60\)\*\.6,3,12\)\)/);
  assert.match(html, /class="deer-tail"/);
  assert.match(html, /class="crab-run"/);
  // the crab sits on the flat with open water behind it, not up on the grass line where a
  // dark crab on dark spartina is a smudge and the ten-pixel dash travels behind the reeds
  // (its y is now the mud under its legs, where it has always stood)
  assert.match(html, /crabAt\(crabX,base\+14,\.5,1\)/);
  assert.doesNotMatch(html, /crabAt\(W\*\.57,base-2/);
  // and its x comes off the resident, because a fixed fraction of a frame that is a
  // fraction of the screen ran the crab through the oystercatcher on a 320px phone
  assert.match(html, /const crabX=residentX>W\*\.5\?residentX-64:residentX\+64/);
  // the residents are solid ink now: no more grass reading through a bird
  assert.match(html, /const owlAt=\(x,y,s,opacity=\.96\)/);
  assert.match(html, /const frogAt=\(x,y,s,opacity=\.96\)/);
  assert.match(html, /const crabAt=\(x,y,s,opacity=\.96\)/);
  assert.match(html, /const raccoon=\(x,y,s,o=\.96\)/);
  // The spartina keeps its calendar (green, golding, straw) as tip, middle and root, lit by
  // the scene's own sky, so night drains it and fog pulls it into the veil like everything
  assert.match(html, /const bladeC=SEASON_BLADE\[month\]\.map\(c=>air\(c,\.06\)\)/);
  assert.match(html, /const grassInk="url\(#blade\)",bankC=air\(SEASON_BLADE\[month\]\[2\],\.1\)/);
  assert.match(html, /path d="\$\{mid\}" fill="\$\{bankC\}"/);
  assert.match(html, /<path d="\$\{d\}" fill="\$\{grassInk\}"\/>/);
  // but the far canopy stays in the air, mostly the sky's own colour — the depth cue
  assert.match(html, /const farC=air\("#6E8C82",\.62\)/);
  assert.match(html, /path d="\$\{tl\}" fill="\$\{farC\}"/);
  // residents stay intact; the landscape gives each silhouette a quiet natural pocket
  assert.match(html, /Math\.abs\(x-residentX\)<26\)ht\*=\.28/);
  assert.match(html, /const animalLeft=barnX-48,animalRight=barnX\+48,rightTreeX=W\*\.955/);
  assert.match(html, /const yard=x>animalLeft-18&&x<animalRight\+22/);
  assert.match(html, /class="barn" data-scene-anchor="barn"/);
  // the buck is placed off the barn, far enough into the field to be deer-sized
  assert.match(html, /const deerX=Math\.min\(animalRight\+40,W-30\),deerS=\.62/);
  assert.match(html, /deerAt\(deerX,base\+13,deerS,-1,1\)/);
  // Storybook Ink: every moving joint pivots on its real joint. joint() wraps the group so its
  // own origin is the joint, and the scene CSS gives those classes view-box and 0 0. Lose either
  // and every rig falls back to pivoting on a bounding-box corner
  assert.match(html, /const joint=\(jx,jy,open,inner\)=>`<g transform="translate\(\$\{f1\(jx\)\} \$\{f1\(jy\)\}\)">\$\{open\}<g transform="translate\(\$\{f1\(-jx\)\} \$\{f1\(-jy\)\}\)">/);
  assert.match(html, /#sceneSvg \.fox-head,#sceneSvg \.fox-tail\{transform-box:view-box;transform-origin:0 0\}/);
  // the scene never runs an SVG filter: the picture repaints every frame something moves, so the
  // paper grain is a baked tile and nothing in renderScene carries filter=
  const scene = html.slice(html.indexOf("function renderScene("), html.indexOf("/* ── smooth path through points"));
  assert.doesNotMatch(scene, /filter="url/);
  // clouds are drawn in the scene only when there are clouds to draw, and they really drift:
  // two direction keywords in one animation shorthand made Chrome drop it and nothing moved
  assert.equal(html.split("cloud>=10&&cloud<=85&&!wet&&!storm&&!fog").length - 1, 2);
  assert.doesNotMatch(html, /(reverse|normal) infinite alternate/);
  // the barn lamps come on once the sun is down, not before the sunset time on the arc
  assert.match(html, /const lamps=sunAltDeg< -\.83/);
  // the body has a waist: haunch, stifle, the flank tucking up, then the belly — not a bean
  assert.match(html, /\[-18\.6,-24\.2\],\[-15\.8,-23\.6\],\[-12\.6,-25\.4\],\[-8,-24\.8\]/);
  // the fox crosses the yard clear of the barn, measured off it
  assert.match(html, /deer\?"":dark\?fox\(animalRight\+6,base\+17\.5,\.95,1\)/);
  // the small shorebird's bill sits against open water, not the dark bank
  assert.match(html, /oysterCatcher\(residentX,base\+14\.6,\.92,1\)/);
  // Shady Spring gets asymmetric Appalachian folds, a real gambrel barn, and bare winter trees
  assert.match(html, /const ridgeProfiles=\[/);
  assert.match(html, /const winter=month===11\|\|month<=1\|\|snowing/);
  assert.match(html, /a broken gambrel/);
  assert.match(html, /M 12\.4 -11\.6 L 23\.6 0 M 23\.6 -11\.6 L 12\.4 0/);

  assert.match(html, /class="hawk-circle"/);
  // the warm-weather farm residents now read as hens and move on separate, quiet clocks
  assert.match(html, /\.hen-peck\{/);
  assert.match(html, /\.hen-look\{/);
  assert.match(html, /\.hen-scratch\{/);
  assert.match(html, /@keyframes henPeck/);
  assert.match(html, /@keyframes henTip/);
  // peck is beak-down (negative rotate). Positive rotate folded the head over the back.
  assert.match(html, /59%\{transform:rotate\(-42deg\)\}/);
  assert.match(html, /58%,72%\{transform:rotate\(-12deg\)\}/);
  // three breeds a body-length apart, feet on the dirt (y is the ground under them now)
  assert.match(html, /barnX\+yard\*\.30,base\+18,\.42,"scratch",19,-1/);
  assert.match(html, /barnX\+yard\*\.56,base\+17,\.46,"peck",15/);
  assert.match(html, /barnX\+yard\*\.82,base\+17\.6,\.43,"look",23/);
  assert.match(html, /:\(!wet&&!storm\)\?chickens\(barnX,rightTreeX,base\)/);

  // light: the sun flattens near the horizon, the meteor waits for a clear night
  assert.match(html, /const squash=clamp\(\.9\+Math\.max\(0,sunAltDeg\)\/8\*\.1,\.9,1\)/);
  assert.match(html, /if\(night>\.55&&cloud<30&&!PRM\)/);
  assert.match(html, /const golden=altDeg>-4\.5&&altDeg<6\.5/);
  // only the low third of the sky scintillates, so the night is ~30 animations not 110
  assert.match(html, /const tw=s\.y>52/);
  // heat haze is a marsh-at-high-UV thing, never a decoration
  assert.match(html, /\(Number\(weather\.uv_index\)\|\|0\)>=8&&sunAltDeg>40&&!wet&&!storm&&!PRM/);

  // charts: the entrance is drawn once per opening (and per place), never under reduced
  // motion, and only when the chart is on screen and the data is real
  assert.match(html, /const REVEAL=\{hourly:\{state:PRM\?"done":"armed"/);
  assert.match(html, /if\(R\.state!=="armed"\|\|!R\.g\|\|!REVEAL_READY\|\|!R\.seen\|\|!R\.g\.svg\.isConnected\)return;/);
  assert.match(html, /if\(live\)\{REVEAL_READY=true;clearTimeout\(REVEAL_WAIT\);REVEAL_WAIT=0\}/);
  assert.match(html, /else if\(!REVEAL_READY&&!REVEAL_WAIT\)REVEAL_WAIT=setTimeout\(revealReady,900\);/);
  // a re-render mid-sweep continues it rather than restarting or snapping it to full
  assert.match(html, /if\(R\.state==="running"\)\{revealApply\(k\);return\}/);
  assert.match(html, /const base=R\.t0-performance\.now\(\)/);
  // the wipe animates the content of a static clip, never the clip itself
  assert.match(html, /<clipPath id="hourlyArea"><path d="\$\{area\}"\/><\/clipPath>/);
  assert.match(html, /<clipPath id="tideArea"><path d="\$\{area\}"\/><\/clipPath>/);
  assert.doesNotMatch(html, /LINE_DRAWN/);
  // a new place gets its own entrance
  assert.match(html, /revealArm\(\);\n  paintAddr\(\);/);
  // and the skiff sets with the tide
  assert.match(html, /const setDx=next\?\(next\.type==="H"\?3:-3\):0/);
});

test("it snows in Shady Spring", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // every one of these used to fall through: blank label, rain icon, and a dry scene
  assert.match(html, /const SNOW=\[71,73,75,77,85,86\], ICE=\[56,57,66,67\]/);
  assert.match(html, /const WETC=\[51,53,55,61,63,65,80,81,82,95,96,99,\.\.\.SNOW,\.\.\.ICE\]/);
  for (const code of [56, 57, 66, 67, 71, 73, 75, 77, 85, 86])
    assert.match(html, new RegExp(`${code}:"[A-Z]`), `WMO ${code} needs a label`);
  assert.match(html, /71:"Light snow",73:"Snow",75:"Heavy snow"/);
  // freezing precipitation is never called rain, and never called snow
  assert.match(html, /66:"Freezing rain",67:"Freezing rain"/);
  assert.match(html, /"Freezing rain\. Expect ice on anything untreated\."/);
  assert.doesNotMatch(html, /66:"Rain"|67:"Rain"/);
  // the icon ladder checks ice and snow before it falls through to rain
  assert.match(html, /glyphFor=w=>w>=95\?"storm":isIce\(w\)\?"ice":isSnow\(w\)\?"snow":w>=51\?"rain"/);
  assert.match(html, /snow:`<path d="\$\{CLOUD\}"/);
  // snow drifts rather than streaks, and takes six to nine seconds to cross the sky
  assert.match(html, /const SNOWFALL=\{71:\[22,9,2\.4\]/);
  assert.match(html, /@keyframes flake\{/);
  assert.match(html, /rf\.className="rainfx"\+\(snowing\?" snow":""\)/);
  // and the week's one-line brief no longer calls a heavy snow day "periods of rain"
  assert.match(html, /else if\(snow\)\{text=`\$\{code===75\|\|code===86\?"Heavy snow":"Snow"\}/);
  assert.match(html, /code:wj\.hourly\.weather_code\.slice\(i0\)/);
  // and the odds word follows the odds: 35% snow is possible, not likely
  assert.match(html, /const likely=is=>is\.some\(i=>known\(h\.pop\?\.\[i\]\)&&\+h\.pop\[i\]>=60\)/);
  assert.match(html, /snow\.length\?`Snow \$\{likely\(snow\)\?"likely":"possible"\}`:/);
  // and the weekend note calls a snowy Saturday's odds snow
  assert.match(html, /odds:wet\?`\$\{Math\.round\(\+P\[i\]\)\}%`:"",noun:wet\?isSnow\(w\)\?"snow":isIce\(w\)\?"ice":"rain":""/);
});

test("and the rain is visible when it rains there", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // the sky layer draws the same rain at all three places, and stays that way. Inking
  // Shady Spring's drops heavier to survive the mountain read as the app changing rather
  // than the weather, and the problem is not up here anyway.
  assert.doesNotMatch(html, /LOC\.scene==="ridge"&&!snowing/);
  assert.match(html, /\(snowing\?weight:1\.2\*weight\)\.toFixed\(2\)\+"px"/);
  assert.match(html, /const \[count,fallSec,weight\]=snowing\?\(SNOWFALL\[code\]\|\|SNOWFALL\[73\]\):\(RAIN\[code\]\|\|RAIN\[63\]\)/);
  // and a nearer layer falls in front of the fold, pale where the layer behind it is dark
  assert.match(html, /@keyframes nearFall\{/);
  assert.match(html, /const nrK=clamp\(\(nrWeight-\.55\)\/\.7,0,1\)/);
  assert.match(html, /class="nearrain"/);
  assert.match(html, /mask="url\(#ridgerain\)"/);
  // it fades in across the crest instead of starting on a cut line
  assert.match(html, /id="ridgerainfade" gradientUnits="userSpaceOnUse"/);
  // and it lands in the field: gone by the grass line, never run off the foot of the frame
  // into the page, which is where a downpour turned into a mess of white bars over the pond
  assert.match(html, /const nrTop=base-rTop\*\.94,nrLand=base\+4;/);
  assert.match(html, /span=nrLand-nrTop;/);
  assert.doesNotMatch(html, /span=H\+10-nrTop/);
  // a drop is several frames long at its own speed, so it reads as a streak, not a dash
  // jumping its own length every frame
  assert.match(html, /const step=968\/nrFall\/60/);
  assert.match(html, /const len=clamp\(step\*2\.6,22,Math\.min\(64,span\*\.72\)\)/);
  // dealt one to a slot across the frame, not thrown in clumps
  assert.match(html, /const tx=-34\+\(i\+\.15\+nr\(\)\*\.7\)\*slot/);
  // the pond answers the rain rather than going glass-still under it, which it used to do
  assert.match(html, /if\(wet&&!snowing&&!PRM\)\{\s*const pw2=mulberry\(6197\),rings=2\+Math\.round\(rainK\*3\)/);
  assert.match(html, /const ps=mulberry\(2884\),ticks=3\+Math\.round\(rainK\*5\)/);
  // snow neither rings the water nor gets a second layer of falling lines
  assert.doesNotMatch(html, /if\(wet&&!PRM\)\{\s*const \[,nrFall/);
  // and a star the cloud has already taken below what an eye can find stops performing,
  // which is what pays for the drops in a night downpour
  assert.match(html, /const tw=s\.y>52&&Number\(o\)>=\.18/);
});

test("the almanac fishes the farm pond, the coast keeps its neutral sun line, and Denver dresses for comfort", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // solunar is folklore built on honest astronomy, and the code says so out loud
  assert.match(html, /function solunarWindows\(now\)/);
  assert.match(html, /The theory is folklore; the moon times are real/);
  // majors are two hours around transit and underfoot, minors one hour around rise and set
  assert.match(html, /const half=\(major\?60:30\)\*6e4/);
  // the farm card gets the windows, each dropped on its own hours (thunder, ice, a gale, a gust
  // the run does not carry). fishLine and farmCard are run under "the water and the farm" below
  assert.match(html, /function fishLine\(h,now\)/);
  assert.match(html, /function fishWindows\(h,now\)/);
  assert.match(html, /if\(LOC\.fish\)renderMoon\(css,allowedFishWins,now\);/);
  // the ridge sun line states when, never what to wear; the kids' language stays coastal
  assert.match(html, /function ridgeSunLine\(c,dy,h,now\)/);
  assert.match(html, /comfort\?comfortAdvice\(c,h\):LOC\.scene==="ridge"\?ridgeSunLine\(c,dy,h,now\):sunProtectionAdvice\(c,dy,h,now\)/);
  assert.match(html, /Strongest sun /);
  // the travel slot replaces the UV meter with one concise, weather-aware clothing answer
  assert.match(html, /function comfortAdvice\(c,h\)/);
  assert.match(html, /comfort\?"What to wear":"Sun"/);
  assert.match(html, /Warm coat, gloves, and waterproof shoes/);
  assert.match(html, /T-shirt weather\. Bring a light layer for tonight/);
  assert.match(html, /id="uvDetails"/);
  // the pond uses the same allowed list, with an exclusive end and weather-aware fish motion
  assert.match(html, /if\(!PRM&&fishWindowActive\(fishWins,now,weather\)\)/);
  assert.match(html, /const allowedFishWins=LOC\.fish&&farm\?\.fish\?fishWindows\(h,now\):\[\];/);
  // and the title says whose theory the times are (the footer used to), on screen as the almanac's,
  // and in full to a screen reader and on hover; the chart speaks its windows
  assert.match(html, /<b title="The almanac's solunar tables: its theory, worked out from the moon's real positions\.">Almanac fishing times<span class="sr-only">\. The almanac's solunar tables: its theory, worked out from the moon's real positions\.<\/span><\/b><span id="moonNote"><\/span>/);
  assert.match(html, /The almanac's fishing times: \$\{said\.length\?said\.join\(", "\):"none clear"\}/);
});

test("the approved fish shares the almanac windows and keeps its water on the same clock", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const agents = await readFile(new URL("AGENTS.md", root), "utf8");
  const source = html.slice(html.indexOf("function fishWindowActive("), html.indexOf("function fishLine("));
  const ctx = vm.createContext({ known: v => v != null && v !== "" && Number.isFinite(+v),
    isWet: v => [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86].includes(v) });
  vm.runInContext(source, ctx);
  const start = new Date("2026-10-07T10:00:00Z"), end = new Date("2026-10-07T12:00:00Z");
  const wins = [{start,end}], weather = {temperature_2m:65,weather_code:1};
  const active = (time, w = weather, windows = wins) => ctx.fishWindowActive(windows, new Date(time), w);
  assert.equal(active(+start-1), false); assert.equal(active(+start), true);
  assert.equal(active(+end-1), true); assert.equal(active(+end), false);
  assert.equal(active(+start, weather, []), false, "a weather-filtered or warning-suppressed window cannot put fish in the pond");
  for (const temp of [null, undefined, "", NaN, 44.9])
    assert.equal(active(+start, {...weather,temperature_2m:temp}), false);
  assert.equal(active(+start, {...weather,temperature_2m:45}), true);
  for (const code of [null,undefined,"",NaN,51,56,61,66,71,80,85,95,96,99])
    assert.equal(active(+start, {...weather,weather_code:code}), false, `weather ${code} keeps the pond quiet`);
  assert.match(html, /const rigFish=/);
  assert.match(html, /inkRig\(rigFish\(\),pal/);
  assert.match(html, /inkPal\(INK\.fish\)/);
  for (const name of ["Rise","Ring","Drops"])
    assert.match(html, new RegExp(`animation:porchFish${name} 18s`), "one cycle for fish and water");
  assert.match(html, /now>=w\.start&&now<w\.end/);
  assert.match(html, /#moonSvg \.bite-body,#moonSvg \.bite-ring,#moonSvg \.bite-drops\{animation-play-state:paused\}/);
  assert.match(agents, /Josh approved fish on both this moon line and the Shady Spring pond/);
  assert.match(agents, /never a report of actual fish activity/);
  assert.match(agents, /The animation ceiling stays 120/);
});

test("offscreen scenery resumes elapsed gestures without replaying entrances or old animals", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const source = html.slice(html.indexOf("let FISH_SEEN=false,SCENE_PARKED=[];"), html.indexOf("function fishMotion("));
  let now=1000, box={top:-500,bottom:0}, moving=[];
  const animation=(time,end=Infinity)=>{
    const target={isConnected:true};
    return {animationName:"resident",currentTime:time,playState:"running",plays:0,finishes:0,
      effect:{target,getComputedTiming:()=>({endTime:end})},
      pause(){this.playState="paused"},play(){this.plays++;this.playState="running"},
      finish(){this.finishes++;this.currentTime=end;this.playState="finished"}};
  };
  const sky={getBoundingClientRect:()=>box,getAnimations:()=>moving};
  const ctx=vm.createContext({Date:{now:()=>now},PRM:false,innerHeight:852,
    document:{hidden:false,getElementById:()=>sky}});
  vm.runInContext(source,ctx);
  const deer=animation(200), entrance=animation(10,100), removed=animation(50);
  moving=[deer,entrance,removed];
  assert.equal(ctx.sceneMotion(),true);
  assert.equal(deer.playState,"paused");
  assert.equal(entrance.playState,"paused");
  removed.effect.target.isConnected=false;
  const replacement=animation(400);
  moving=[deer,entrance,replacement];now+=100;
  ctx.sceneMotion(); // replacement children must be found while the header stays offscreen
  assert.equal(replacement.playState,"paused");
  now+=900;box={top:-200,bottom:1}; // even a sliver back in view resumes the scene
  assert.equal(ctx.sceneMotion(),false);
  assert.equal(deer.currentTime,1200);
  assert.equal(deer.plays,1,"a repeated offscreen pass cannot duplicate a clock");
  assert.equal(replacement.currentTime,1300);
  assert.equal(entrance.finishes,1);
  assert.equal(entrance.plays,0,"an elapsed entrance must not rewind to its beginning");
  assert.equal(removed.plays,0,"disconnected animals never return");
  ctx.sceneResume();assert.equal(deer.plays,1,"released animation references are cleared");
  box={top:852,bottom:1200};assert.equal(ctx.sceneMotion(),true);
  now+=50;ctx.document.hidden=true;assert.equal(ctx.sceneMotion(),false);
  assert.equal(deer.currentTime,1250,"visibility handoff preserves the same elapsed clock");
  assert.ok(html.includes('new IntersectionObserver(()=>fishMotion(),{threshold:0}).observe(document.getElementById("sky"))'));
  assert.ok(html.includes('Math.floor((120-ambient)/3)'),"chart fish yield within the existing animation ceiling");
});

test("fishing boundaries repaint once without renewing the forecast or crossing locations", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const source = html.slice(html.indexOf("let LAST=null,LASTW=0,rzT,FISH_TIMER=0;"), html.indexOf('addEventListener("resize"'));
  assert.ok(source.includes("function fishSchedule("), "the boundary scheduler is extractable");
  let now = Date.parse("2026-10-07T14:00:00Z"), seq = 0, shift = 0;
  const timers = new Map(), paints = [], events = [];
  class Clock extends Date { constructor(...a){super(...(a.length?a:[now]))} static now(){return now} }
  const ctx = vm.createContext({ Date:Clock, document:{hidden:false}, LOC:{id:"sp",fish:true},
    CACHE_MAX_AGE:6*3.6e6, wallNow:()=>new Clock(now-shift), trueTime:d=>new Clock(+d+shift),
    syncClock:()=>{}, forecastDay:d=>d.day, todayET:()=>"2026-10-07",
    setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id}, clearTimeout:id=>timers.delete(id),
    render:(...a)=>paints.push(a), paintLoadingState:()=>events.push("clear"), refresh:()=>events.push("refresh") });
  vm.runInContext(source,ctx);
  const reset = (age=0,day="2026-10-07") => {
    ctx.reading={d:{day},live:age===0,savedAt:now-age};
    vm.runInContext("LAST=reading",ctx);
    return ctx.reading;
  };
  const wins = () => [{start:new Clock(now-shift+60000),end:new Clock(now-shift+120000)}];
  const armed = () => {assert.equal(timers.size,1);return [...timers.values()][0]};
  const first=reset();ctx.fishSchedule(wins());assert.equal(armed().ms,60020);
  ctx.fishSchedule(wins());assert.equal(timers.size,1,"repainting replaces the timer");
  let callback=armed().fn;timers.clear();now+=60020;callback();
  assert.equal(paints.length,1);assert.equal(paints[0][2],first.savedAt,"the original reading age survives a boundary repaint");
  reset();ctx.fishSchedule(wins());callback=armed().fn;timers.clear();ctx.LOC={id:"mb",fish:false};callback();
  assert.equal(paints.length,1,"an old farm timer cannot repaint the coast");
  ctx.LOC={id:"sp",fish:true};reset();ctx.fishSchedule(wins());callback=armed().fn;timers.clear();reset();callback();
  assert.equal(paints.length,1,"a newer reading wins over an old callback");
  ctx.document.hidden=true;ctx.fishSchedule(wins());assert.equal(timers.size,0,"hiding cancels old work");
  ctx.document.hidden=false;reset();ctx.fishSchedule(wins());ctx.fishCancel();assert.equal(timers.size,0);
  reset(6*3.6e6-1000);ctx.fishSchedule(wins());assert.equal(armed().ms,1020,"cache expiry comes before the next fishing boundary");
  callback=armed().fn;timers.clear();now+=1020;callback();assert.deepEqual(events,["clear","refresh"]);
  reset(0,"2026-10-06");ctx.fishSchedule(wins());callback=armed().fn;timers.clear();callback();
  assert.deepEqual(events,["clear","refresh","clear","refresh"],"a different forecast day is not revived");
  reset();shift=2*3.6e6;ctx.fishSchedule(wins());assert.equal(armed().ms,60020,"wall-clock boundaries convert back to true elapsed time");
  ctx.fishSchedule([]);assert.equal(timers.size,0,"no approved windows leave no boundary timer");
  assert.match(html, /function paintLoadingState\(\)\{\n  sceneResume\(\);\n  fishCancel\(\);/);
  assert.match(html, /if\(!LOC_ORDER\.includes\(id\)\|\|LOC\.id===id\)return;\n  sceneResume\(\);\n  fishCancel\(\);/);
  assert.match(html, /savedAt=savedAt\|\|\(LAST\?\.d===d\?LAST\.savedAt:Date\.now\(\)\);/);
});

test("a fishing window keeps its minute when now advances between sampling ticks", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const source = html.slice(html.indexOf("function solunarWindows("), html.indexOf("const clock12="));
  const now=new Date("2026-10-07T14:20:00Z");
  const ctx=vm.createContext({moonPos:d=>({alt:Math.cos((+d-+now)/(6*3.6e6)*2*Math.PI)})});
  vm.runInContext(source,ctx);
  const interior=t=>Array.from(ctx.solunarWindows(t)).filter(w=>+w.start>+now+3*3.6e6&&+w.end<+now+24*3.6e6).map(w=>[+w.start,+w.end]);
  assert.ok(interior(now).length>0);
  assert.deepEqual(interior(now),interior(new Date(+now+61000)),"repainting at a boundary cannot move that same boundary");
});

test("the fuller daytime paper follows its sky, stays readable, and eases into golden hour", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const agents = await readFile(new URL("AGENTS.md", root), "utf8");
  const ctx = vm.createContext({});
  const colors = html.slice(html.indexOf("const hex2rgb="), html.indexOf("const tempColor="));
  const paper = html.slice(html.indexOf("function daylightPaper("), html.indexOf("function goldenHour("));
  vm.runInContext("const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));" + colors + paper +
    ";this.paper=daylightPaper;this.blend=daylightBlend;this.lum=lum;this.contrast=contrast", ctx);
  for (const sky of [["#5C9FC6","#9ECBDC","#EAE6D2"], ["#394B5B","#77898E","#A0ACAA"], ["#A2AAA7","#CDD3CF","#E5E6DC"]]) {
    for (const place of ["marsh", "ridge"]) {
      const p = ctx.paper(sky, place);
      assert.ok(ctx.lum(p.paper) >= .72, `${place} ${p.paper} keeps the small readings visible`);
      for (const ink of ["#435D69", "#286184", "#AD3517", "#974607", "#785015", "#1E6B44"])
        assert.ok(ctx.contrast(ink, p.paper) >= 4.5, `${ink} on ${p.paper}`);
      assert.notEqual(p.paper, "#FAFAF6", "daytime paper belongs to its sky");
    }
  }
  assert.equal(ctx.blend(-3), 0); assert.equal(ctx.blend(6), 1);
  assert.equal(ctx.blend(-20), 0); assert.equal(ctx.blend(50), 1);
  assert.ok(1 - ctx.blend(5.99) < .00001, "no jump at the golden-hour boundary");
  for (let alt = -3; alt < 6; alt += .1) assert.ok(ctx.blend(alt + .1) >= ctx.blend(alt));
  assert.match(html, /#hourlySvg \.tline,#weekSvg \.tline,#yearSvg \.tline,#tideSvg \.wline,#moonSvg \.wline\{stroke-width:4px\}/);
  assert.match(html, /#hourlySvg text,#weekSvg text,#yearSvg text\{font-family:var\(--disp\);font-weight:650\}/);
  assert.match(html, /const W=Math\.max\(320,appW\(\)\/1\.22\),H=/);
  assert.match(agents, /Fuller, closer, more playful/);
});

test("golden hour reaches the whole page, and the two ends differ", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /function goldenHour\(altDeg,now,dark,root\)/);
  assert.match(html, /goldenHour\(altDeg,now,dark,root\)/);
  assert.match(html, /<div class="goldwash" id="goldWash"><\/div>/);
  // the same +6 to -4 window the arc and the tonight card already use
  assert.match(html, /const k=altDeg<=6&&altDeg>=-4\.5\?clamp\(\(6-altDeg\)\/10,0,1\):0/);
  // morning and evening are different light, and the code carries both
  assert.match(html, /const GOLD=\{am:\{lit:"#FFDED6",dark:"#41292C"\},pm:\{lit:"#FFD79C",dark:"#432A17"\}\}/);
  assert.match(html, /const rising=sunPos\(new Date\(now\.getTime\(\)\+6e5\)\)\.alt>sunPos\(now\)\.alt/);
  // golden-hour overrides reset outside their window; daylight then supplies the sky-tinted paper
  assert.match(html, /for\(const v of \["--paper","--wash","--line"\]\)root\.removeProperty\(v\)/);
  // the ink never moves: only the paper leans, so nothing gets harder to read
  assert.doesNotMatch(html, /root\.setProperty\("--ink"/);
  // the sun line warms the existing dotted path; no glow, bar or boundary bead is added
  assert.match(html, /stroke="#D39A3C" stroke-width="1\.8" stroke-dasharray="1 7"/);
  assert.doesNotMatch(html, /const boundary=a<\.5\?b:a,bx=px\(boundary\),by=py\(boundary\)/);
  assert.doesNotMatch(html, /stroke="#FFD68A" stroke-width="7"/);
});

test("nothing new moves under prefers-reduced-motion", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // the blanket rule that kills every animation and transition, including both pseudo-elements
  // (the open week day's wash is a ::before with a transition)
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)\{\s*\*,\*::before,\*::after\{animation:none!important;transition:none!important\}/);
  // elements that exist only to be animated must be invisible when they are not
  for (const cls of ["water-ring", "ff", "splash", "bolt", "meteor"])
    assert.match(html, new RegExp(`\\.${cls}\\{[^}]*opacity:0`), `.${cls} should rest at opacity 0`);
  // and the generators that emit motion are gated before they ever build markup
  assert.match(html, /const phase=p=>PRM\?"":`animation-delay/);
  assert.match(html, /const showFlies=seasonalFlies&&!PRM/);
  assert.match(html, /if\(wet&&!snowing&&!PRM\)\{const wr=mulberry\(7138\)/);
  // lightning no longer needs the grid cell's own code to be a thunderstorm; see the
  // THUNDER assertions below. It still draws nothing under reduced motion.
  assert.match(html, /if\(!THUNDER\|\|PRM\)\{layer\.innerHTML="";return\}/);
  assert.match(html, /if\(!PRM&&!wet&&!storm\)/);
});

test("the live dot pulses without relaying out the page", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // animating a box-shadow spread radius cost a full layout every frame, forever
  assert.match(html, /@keyframes ping\{0%\{transform:scale\(\.75\);opacity:1\}/);
  assert.doesNotMatch(html, /@keyframes ping\{0%\{box-shadow/);
  assert.match(html, /\.live-dot::after\{/);
});

test("plain-language and living-scene refinements stay in place", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // Nothing is scored or picked. The best window (a score of rain, gusts, heat and cold nobody could
  // see the reason for) went in September 2026, and the headline says only what is coming. Its
  // sentences, the water's and the farm's say today and today only, off the hours coveredHours gives.
  assert.match(html, /function dayStory\(c,dy,h,now\)/);
  assert.match(html, /return\{html:\[first,second\]\.filter\(Boolean\)\.join\(" "\),told\};/);
  assert.match(html, /const dayRead=dayStory\(c,dy,h,now\);/);
  assert.match(html, /function coveredHours\(h,dy,now\)/);
  assert.doesNotMatch(html, /Best outside stretch:|bestOutsideWindow|windowLabel|best time to piddle|best time to head out|best window/);
  assert.match(html, /id="goldenband"/);
  assert.match(html, /one local wildlife cue at a time/);
  assert.match(html, /seasonalFlies/);
  assert.match(html, /function sunProtectionAdvice\(c,dy,h,now\)/);
  // Josh removed the coast's reminders. Both places keep the measured sun hours,
  // without inventing a 10-to-5 schedule when the hourly source is missing.
  assert.doesNotMatch(html, /Sunscreen from |Sunscreen until |Sunscreen if/);
  assert.match(html, /return ridgeSunLine\(c,dy,h,now\);/);
  assert.match(html, /slot\.time\.getTime\(\)>=hour/);
  assert.match(html, /const peak=Math\.max\(\.\.\.slots\.map\(slot=>\+slot\.uv\)\),cls=peak>=6/);
  assert.doesNotMatch(html, /Strongest sun 10 a\.m\. to 5 p\.m\./);
  assert.doesNotMatch(html, /Wear SPF 30\+/);
  assert.doesNotMatch(html, /Reapply after two hours/);
  assert.match(html, /class="wildlife heron"/);
  assert.match(html, /const owlAt=/);
  assert.match(html, /const frogAt=/);
  assert.match(html, /const crabAt=/);
  assert.doesNotMatch(html, /marshDeer/);
  assert.match(html, /const night=tonightBrief\(dy,full,now\);/);
  assert.doesNotMatch(html, /id="eveWind"/);
  assert.match(html, /function dailyBrief\(dy,i\)/);
  // the week is two lines, not a stack of bars: highs and lows on one scale, the range washed
  // between them, drawn in by the same pen as the hourly chart; a tapped day opens its brief
  assert.doesNotMatch(html, /class="range-fill"/);
  assert.match(html, /<path class="rv-line2" d="\$\{loLine\}"/);
  assert.match(html, /<path class="tline" d="\$\{hiLine\}"/);
  assert.match(html, /week:\{state:PRM\?"done":"armed",seen:false,anims:\[\]\}/);
  assert.match(html, /class="wk-day\$\{cls\}" type="button" data-day="\$\{t\}" data-i="\$\{i\}" aria-expanded=/);
  // the weekend is marked, not described: a quiet ink band over its columns, laid over the
  // chart (so the labels' paper halos never draw boxes on it), fading in as the pen reaches it
  assert.match(html, /\.wk\{display:grid;grid-template-columns:repeat\(var\(--wk-n,7\),1fr\)\}/);
  assert.match(html, /wrap\.style\.setProperty\("--wk-n",n\);/);
  assert.match(html, /const cls=we\.includes\(i\)\?" we":"";/);
  assert.match(html, /<path class="wk-we" d="M/);
  assert.match(html, /fill="\$\{css\.ink\}" opacity="\.05"\$\{rvAt\(wx0,"fade"\)\}/);
  assert.match(html, /\$\{marks\}\n\s*\$\{weBand\}/);
  assert.doesNotMatch(html, />WEEKEND</);
  // eight columns on a 320 phone are 35px, so the day names tighten their tracking to fit
  assert.match(html, /@media \(max-width:359px\)\{\.wk\.wk8 \.wk-name\{letter-spacing:\.02em\}\}/);
  assert.match(html, /wrap\.classList\.toggle\("wk8",n>7\);/);
  // and the chart, the briefs and the note all read the same days, cut once
  assert.match(html, /const \{wk,we\}=weekSpan\(dy\);\n\s*renderWeek\(wk,css,we\);\n\s*document\.getElementById\("weekNote"\)\.textContent=weekendNote\(wk,we\);/);
  // the rain odds stay a number per day: a line through seven daily chances invents the nights between
  assert.match(html, /They are deliberately not a third line/);
  // and the week says only what the picture does not: no dates and no chevrons; the odds are
  // printed where the sky is wet or the odds are real, and a missing chance is never a number
  assert.doesNotMatch(html, /class="wk-date"/);
  assert.doesNotMatch(html, /WEEK_CHEV/);
  assert.match(html, /has=raw!=null&&Number\.isFinite\(\+raw\)/);
  assert.match(html, /return\{t,has,pop,sky,code,likely,odds:has&&\(likely\|\|sky&&isWet\(code\)\)\}/);
  // one threshold for the printed odds and the tapped brief, so the column and the sentence agree
  assert.match(html, /const WEEK_H=146,WEEK_WET=35;/);
  assert.match(html, /hasPop&&pop>=WEEK_WET\)text=/);
  // a missing sky is no glyph, never a sun; a week with no odds at all is not "mostly dry",
  // and the note never calls a weekend dry (see the weekend test)
  assert.match(html, /\$\{sky\?icon\(code,16\):""\}/);
  assert.match(html, /if\(!P\.some\(known\)\)return "rain odds unavailable";/);
  assert.doesNotMatch(html, /"mostly dry"|looks most likely/);
  // the tapped brief says nothing it was not told: no invented sky, no easy day on missing odds,
  // and an easy day is its sky and nothing more
  assert.match(html, /else if\(hasSky\)\{/);
  assert.match(html, /const feel=high==null\?"":high>=92/);
  assert.match(html, /if\(!hasPop&&!note\)note="Rain odds unavailable\.";/);
  assert.doesNotMatch(html, /Most of the day should feel easy outside|It may turn breezy/);
  assert.match(html, /moonPhaseIcon/);
  assert.doesNotMatch(html, /phaseName/);
  assert.match(html, /flight-wing/);
  assert.match(html, /deer-ear/);
  // "soupy" is earned, not decorative: real humidity sitting on real heat
  assert.match(html, /soupy\?" and soupy":humid\?" and humid":""/);
  // nothing on the card is about heat; the headline and feels-like carry that
  assert.match(html, /id="sunTitle">Sun</);
  assert.doesNotMatch(html, />UV · sun exposure</);
  assert.doesNotMatch(html, /Sun &amp; heat|"Sun & heat"/);
  assert.doesNotMatch(html, />Evening outlook</);
});

test("the weekend is always in the week, and it is the one coming", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
    lift(/const dayName=s=>[^\n]*;/),
    lift(/const WEEK_H=146,WEEK_WET=35;/),
    html.slice(html.indexOf("function weekSpan("), html.indexOf("function renderWeek(")),
    "globalThis.weekSpan=weekSpan;globalThis.weekendNote=weekendNote;",
  ].join("\n"), ctx);
  const daily = (start, n = 8, o = {}) => {
    const time = [], d = new Date(start + "T12:00");
    for (let i = 0; i < n; i++) { time.push(d.toLocaleDateString("en-CA")); d.setDate(d.getDate() + 1); }
    return { time, temperature_2m_max: time.map((_, i) => 70 + i), temperature_2m_min: time.map((_, i) => 55 + i),
      weather_code: time.map((_, i) => o.code?.[i] ?? 1), precipitation_probability_max: time.map((_, i) => (o.pop ? o.pop[i] : 10)) };
  };
  // 2026-09-21 is a Monday: [first day, the weekend's columns, how many days the week shows]
  for (const [start, we, n] of [
    ["2026-09-21", [5, 6], 7], ["2026-09-22", [4, 5], 7], ["2026-09-23", [3, 4], 7], ["2026-09-24", [2, 3], 7],
    ["2026-09-25", [1, 2], 7], ["2026-09-26", [0, 1], 7], ["2026-09-27", [6, 7], 8],
  ]) {
    const r = ctx.weekSpan(daily(start));
    assert.deepEqual([...r.we], we, start + ": the weekend's columns");
    assert.equal(r.wk.time.length, n, start + ": days shown");
    for (const k of ["temperature_2m_max", "temperature_2m_min", "weather_code", "precipitation_probability_max"])
      assert.equal(r.wk[k].length, n, `${start}: ${k} is cut to the same days`);
  }
  // an old seven-day cache on a Sunday marks the Saturday it has and invents no Sunday
  const old = ctx.weekSpan(daily("2026-09-27", 7));
  assert.deepEqual([...old.we], [6]);
  assert.equal(old.wk.time.length, 7);

  // the note is the weekend in numbers, and only the part of it still to come
  const note = (start, n, o) => { const { wk, we } = ctx.weekSpan(daily(start, n, o)); return ctx.weekendNote(wk, we); };
  assert.equal(note("2026-09-24"), "Sat 72° · Sun 73°");
  assert.equal(note("2026-09-26"), "Sun 71°", "on Saturday today is the page above");
  assert.equal(note("2026-09-27"), "Sat 76° · Sun 77°", "on Sunday it is next weekend");
  assert.equal(note("2026-09-27", 7), "Sat 76°", "a seven-day cache names only the Saturday it has");
  // odds from WEEK_WET, the line the columns print them from, named by what that day's sky is doing
  assert.equal(note("2026-09-24", 8, { pop: [10, 10, 34, 60, 10, 10, 10, 10] }), "Sat 72° · Sun 73° 60% rain");
  assert.equal(note("2026-09-24", 8, { pop: [10, 10, 35, 70, 10, 10, 10, 10], code: [1, 1, 73, 66] }), "Sat 72° 35% snow · Sun 73° 70% ice");
  // two wet days of one kind say the noun once, so the note stays on its title's line at 320
  assert.equal(note("2026-09-24", 8, { pop: [10, 10, 40, 100, 10, 10, 10, 10] }), "Sat 72° 40% · Sun 73° 100% rain");
  assert.equal(note("2026-09-24", 8, { pop: [10, 10, 100, 100, 10, 10, 10, 10], code: [1, 1, 73, 73] }), "Sat 72° 100% · Sun 73° 100% snow");
  // a missing chance prints no odds; a week without any says so rather than passing for dry
  assert.equal(note("2026-09-24", 8, { pop: [10, 10, null, 80, 10, 10, 10, 10] }), "Sat 72° · Sun 73° 80% rain");
  assert.equal(note("2026-09-24", 8, { pop: Array(8).fill(null) }), "rain odds unavailable");
  // and a forecast too short to reach the weekend says nothing about it
  assert.equal(note("2026-09-21", 3), "");
  // no adjectives: five to seven days out, "dry" is a claim without its odds
  const noteCode = html.slice(html.indexOf("function weekendNote("), html.indexOf("function renderWeek("));
  assert.doesNotMatch(noteCode, /dry|nice|lovely|great/i);
});

test("a tapped day says its feel and its sky, and a note only when there is something to plan", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
    lift(/const WEEK_H=146,WEEK_WET=35;/),
    html.slice(html.indexOf("function dailyBrief("), html.indexOf("/* ── the week")),
    "globalThis.dailyBrief=dailyBrief;",
  ].join("\n"), ctx);
  const brief = (high, code, pop, wind = 10) => ctx.dailyBrief({ temperature_2m_max: [high], weather_code: [code],
    precipitation_probability_max: [pop], wind_speed_10m_max: [wind] }, 0);
  assert.equal(brief(85, 0, 10), "Warm and sunny.");
  assert.equal(brief(75, 1, 10), "Nice and mostly sunny.");
  assert.equal(brief(75, 2, 10), "Nice with some clouds.");
  assert.equal(brief(60, 3, 10), "Cool and cloudy.");
  assert.equal(brief(60, 45, 10), "Cool and foggy.");
  assert.equal(brief(95, 1, 10), "Hot and mostly sunny. Keep the middle of the day short.");
  assert.equal(brief(84, 95, 70), "Thunderstorms likely. Watch for alerts.");
  assert.equal(brief(84, 95, 10), "Thunderstorms possible. Watch for alerts.");
  assert.equal(brief(30, 66, 70), "Freezing rain likely. Give the roads time.");
  assert.equal(brief(30, 75, 70), "Heavy snow likely. Plan on slow going.");
  assert.equal(brief(30, 77, 40), "Snow possible. Plan on slow going.");
  assert.equal(brief(30, 73, 40), "Snow possible. Plan on slow going.");
  assert.equal(brief(70, 63, 80), "Rain likely.");
  assert.equal(brief(70, 81, 50), "Showers possible.");
  assert.equal(brief(70, 53, 30), "Drizzle possible.");
  assert.equal(brief(70, 3, 60), "Showers possible.");
  assert.equal(brief(70, 3, 40), "Showers possible.");
  assert.equal(brief(70, 2, 10, 22), "Partly cloudy and windy.");
  // Missing sky, odds, wind or temperature never earns a nice-day claim.
  assert.equal(brief(70, null, 10), "");
  assert.equal(brief(70, 2, null), "Partly cloudy. Rain odds unavailable.");
  assert.equal(brief(70, 2, 10, null), "Partly cloudy.");
  assert.equal(brief(null, 2, 10), "Partly cloudy.");
  assert.equal(brief(undefined, 63, 80), "Rain likely.");
  assert.equal(brief(null, null, 10), "");
  assert.equal(brief(75, 3, 10), "Cloudy.");
  assert.equal(brief(75, 45, 10), "Foggy.");
  assert.equal(brief(75, 1, 30), "Mostly sunny.");
  assert.equal(brief(75, 61, 10), "Showers possible.");
  assert.doesNotMatch(html.slice(html.indexOf("function dailyBrief("), html.indexOf("/* ── the week")), /Mild|Expect a wet stretch|Maybe a passing shower/);

});

test("the sun card says it with the bar, and steps aside when today has nothing left", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };

  // the stat row is gone: the reading rides on the pin and a later peak is a ring with its hour
  assert.doesNotMatch(html, /id="uvPeak"|id="uvPin"|right now <b id="uvNow">|class="uv-bar"/);
  assert.match(html, /<svg id="uvSvg" class="uv-svg"/);
  // today means today: the ring is the highest hour still to come today, never tomorrow's, and
  // searched from the hour now is in, so a cache opened hours later rings no peak that has passed
  assert.match(html, /uv0=h\.time\.findIndex\(t=>new Date\(t\)\.getTime\(\)>=nowHr\);/);
  assert.match(html, /if\(uv0>=0\)for\(let i=Math\.max\(1,uv0\);i<h\.time\.length&&h\.time\[i\]\.slice\(0,10\)===dy\.time\[0\];i\+\+\)/);
  assert.doesNotMatch(html, /uvTomorrow/);
  // a ring within half a point of the pin, in the pin's band, would sit on it; one in a higher
  // band stays, nudged clear, or a sunscreen sentence sat over a bar that showed nothing past LOW
  assert.match(html, /if\(uvI>=0&&uvPk-\(uvNow\?\?0\)<\.5&&uvBand\(uvPk\)===uvBand\(uvNow\?\?0\)\)uvI=-1;/);
  assert.match(html, /cx=clamp\(Math\.max\(X\(u\),pinX\+10\),4\.5,W-4\.5\)/);
  // labels are placed, not stamped: the peak's hour steps right of the reading or goes unsaid
  assert.match(html, /const tx=Math\.max\(clamp\(cx,tw\/2,W-tw\/2\),pinR\+6\+tw\/2\)/);
  assert.match(html, /if\(tx\+tw\/2<=W\+\.5\)marks\+=/);
  // The band is spoken, not inked: EXTREME is set flush right and covers about 10.2 to 12, so an
  // inked HIGH sat far left of a 10.6 pin standing under EXTREME. The scale is a quiet ruler, and
  // the label says the band of the number printed on the pin, and the peak in spoken time.
  // one band rule, on the number the pin prints, for the spoken band and the ring; the ring's
  // nudge needs the pin's own x
  assert.match(html, /const uvBand=u=>\{u=\+\(\+u\)\.toFixed\(1\);return u<3\?0:u<6\?1:u<11\?2:3\};/);
  assert.match(html, /band=pin\?uvBand\(uvNow\):-1;/);
  assert.match(html, /pinR=tx\+tw\/2;pinX=px;/);
  assert.equal((html.match(/u<3\?0:u<6\?1:u<11\?2:3/g) || []).length, 1, "the band rule is written once");
  assert.doesNotMatch(html, /\.uv-scale span\.on|\.uv-scale span"\)\.forEach/);
  assert.match(html, /svg\.setAttribute\("aria-label",sentence\(\[pin\?`UV \$\{shown\.toFixed\(1\)\} now, \$\{UV_BANDS\[band\]\}`:"UV today",\n\s*uvI>=0\?`peaking at \$\{\(\+h\.uv\[uvI\]\)\.toFixed\(1\)\} around \$\{spokenAt\(h\.time\[uvI\]\)\}`:null\]/);
  // the loading and error shell draw no bar, so the scale words go with it
  assert.match(html.slice(html.indexOf("function paintLoadingState("), html.indexOf("function setLoc(")), /document\.getElementById\("uvDetails"\)\.style\.display="none";/);
  // the charts' pen draws it in: one-shot, only on screen, never under reduced motion, and in page
  // order, so it follows whichever chart above it is still drawing, and the year follows it
  assert.match(html, /sun:\{state:PRM\?"done":"armed",seen:false,anims:\[\]\},year:\{state:PRM\?"done":"armed",seen:false,anims:\[\]\}\};/);
  assert.match(html, /revealChart\("sun",svg,\{xa:0,xb:xe,/);
  assert.match(html, /case "boat":case "pin":run\(/);
  // the lit stretch is a stroke under a still clip: the WebKit-safe wipe
  assert.match(html, /<g clip-path="url\(#uvTrack\)"><path class="tline" d="\$\{bar\}"/);
  // with nothing left to say today the card steps aside and the tonight card takes the row;
  // a place with no reading yet brings it back as a skeleton
  assert.match(html, /document\.getElementById\("eveCard"\)\.classList\.toggle\("wide",!sunAdvice\)/);
  assert.match(html, /document\.getElementById\("sunCard"\)\.hidden=false;document\.getElementById\("eveCard"\)\.classList\.remove\("wide"\);/);
  // a bar with neither a pin nor a peak on it is not drawn
  assert.match(html, /const uvBar=!!sunAdvice&&!comfort&&\(uvNow>=\.5\|\|uvI>=0\);/);

  // The two sentences, run: what they say, and that each says nothing (null) rather than a
  // sentence about nothing. The chip shows from 3, so a live 3 must always leave a sentence.
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/const clock=d=>\{[^\n]*\};/),
    lift(/const spokenClock=[^\n]*/),
    lift(/const sentence=[^\n]*/),
    html.slice(html.indexOf("function ridgeSunLine("), html.indexOf("/* Denver answers the question")),
    "globalThis.ridgeSunLine=ridgeSunLine;globalThis.sunProtectionAdvice=sunProtectionAdvice;",
  ].join("\n"), ctx);
  const day = "2026-08-02";
  const run = (from, uv) => ({ time: uv.map((_, i) => `${day}T${String(from + i).padStart(2, "0")}:00`), uv });
  const dy = (max = 9) => ({ time: [day, "2026-08-03"], uv_index_max: [max, max] });
  const at = (hm) => new Date(`${day}T${hm}`);
  const coast = (hm, uvNow, uv, max) => ctx.sunProtectionAdvice({ uv_index: uvNow }, dy(max), run(+hm.slice(0, 2), [uvNow, ...uv]), at(hm));
  const farm = (hm, uvNow, uv, max) => ctx.ridgeSunLine({ uv_index: uvNow }, dy(max), run(+hm.slice(0, 2), [uvNow, ...uv]), at(hm));
  assert.equal(coast("14:20", 8.4, [7.2, 4.9, 2.1, .6]).text, "Strongest sun until 5 p.m.");
  assert.equal(coast("09:05", 4.1, [5.8, 7, 7, 6.6, 5.1, 3.4, 1.8]).text, "Strongest sun until 4 p.m.", "a live 4.1 is inside the window");
  assert.equal(coast("07:05", 1.2, [2.6, 4, 6, 7, 7, 6.6, 5.1, 3.4, 1.8]).text, "Strongest sun 9 a.m. to 4 p.m.");
  assert.equal(coast("14:40", 3.8, [3.6, 2.4, 1], 4.2).text, "Strongest sun until 4 p.m.");
  assert.equal(farm("09:05", 4.1, [5.8, 7, 7, 6.6, 5.1, 3.4, 1.8]).text, "Strongest sun until 4 p.m.");
  assert.equal(farm("07:05", 1.2, [2.6, 4, 6, 7, 7, 6.6, 5.1, 3.4, 1.8]).text, "Strongest sun 9 a.m. to 4 p.m.");
  // evening, an overcast that took the sun, and a winter noon all have nothing to say
  assert.equal(coast("19:58", .5, [.2, 0, 0]), null);
  assert.equal(coast("12:10", 1.4, [1.8, 1.6, 1.1, .6]), null, "the hourly run never reaches 3");
  assert.equal(farm("19:58", .4, [.1, 0, 0], 7), null);
  assert.equal(farm("12:10", 2.6, [2.6, 2.2, 1.4], 2.8), null);
  // a live 3 is a sentence at both places, even when the hours after it fall away
  for (const hm of ["10:15", "14:59", "16:40"]) {
    assert.ok(coast(hm, 3, [2.4, 1, 0]), `coast ${hm}: a chip at 3 needs its card`);
    assert.ok(farm(hm, 3, [2.4, 1, 0]), `farm ${hm}: a chip at 3 needs its card`);
  }
  // No hourly UV means no schedule, even with a known daily peak.
  const noHourly = (max) => ctx.sunProtectionAdvice({ uv_index: null }, { time: [day], uv_index_max: max == null ? undefined : [max] }, { time: [`${day}T11:00`] }, at("11:10"));
  assert.equal(noHourly(7), null, "a daily peak cannot invent hourly timing");
  assert.equal(noHourly(null), null);
  // A stale cache cannot borrow the UV it had earlier, or tomorrow's peak.
  const lateRun={time:[`${day}T11:00`,`${day}T12:00`,`${day}T15:00`,"2026-08-03T12:00"],uv:[8,9,1,10]};
  assert.equal(ctx.sunProtectionAdvice({uv_index:8},dy(9),lateRun,at("15:10")),null);
  assert.equal(ctx.ridgeSunLine({},dy(9),{time:[`${day}T12:00`],uv:[null]},at("12:10")),null);
  assert.equal(coast("14:40",3.8,[3.6,2.4,1],9).cls,"go","a past high peak cannot colour the remaining sun");
  // and the chip is never shown without the card
  assert.match(html, /if\(sunAdvice&&Number\(c\.uv_index\)>=3\)chipData\.push\(\[CI\.uv,/);
});

test("Denver is a parked travel scene: kept as the template, out of the rotation", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /den:\{id:"den",addrFull:"Next up · Denver"/);
  assert.match(html, /lat:39\.7392,lon:-104\.9903,scene:"front-range",kind:"trip"/);
  // the trip is over: only the two family places are in the rotation
  assert.match(html, /const LOC_ORDER=\["mb","sp"\]/);
  // a phone last left on a parked place opens at home, not on a place it cannot tap back to
  assert.match(html, /LOC=LOC_ORDER\.includes\(saved\)\?LOCS\[saved\]:LOCS\.mb/);
  assert.match(html, /const nextLoc=\(\)=>LOC_ORDER\[\(LOC_ORDER\.indexOf\(LOC\.id\)\+1\)%LOC_ORDER\.length\]/);
  assert.match(html, /if\(LOC\.scene==="front-range"\)/);
  assert.match(html, /data-species="black-billed-magpie"/);
  assert.match(html, /data-species="mule-deer"/);
  assert.match(html, /data-species="cottontail"/);
  assert.match(html, /high plains foreground, the Front Range, cottonwood and city edge/);
  assert.match(html, /if\(Math\.abs\(x-residentX\)<30\)ht\*=\.22/);
  assert.match(html, /Wells Fargo's rounded shoulder/);
  assert.match(html, /class="denver-buildings" data-scene-anchor="denver-skyline"/);
  assert.match(html, /class="city-window\$\{spark\?" spark":""\}"/);
  assert.match(html, /@keyframes citySparkle/);
  assert.match(html, /class="city-beacon"/);
  assert.match(html, /sceneLabel:"Sun and moon over Denver and the Front Range"/);
  assert.match(html, /cacheKey=id=>"mbwx-"\+id/);
});

test("the scenes dress for the holidays and take it all down when they pass", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/const mdOf=[^\n]*\nconst inSeason=[^\n]*/),
    lift(/const HOLIDAYS=[^\n]*\nconst holidayOn=[^\n]*/),
    "globalThis.holidayOn=holidayOn;",
  ].join("\n"), ctx);
  // a window is month-days on the place's own wall clock, so it is read off local fields
  const on = (s) => ctx.holidayOn(new Date(s))?.id ?? null;
  assert.equal(on("2026-09-30T23:59"), null);
  assert.equal(on("2026-10-01T00:00"), "halloween");
  assert.equal(on("2026-10-31T23:59"), "halloween");
  // they come down the morning after
  assert.equal(on("2026-11-01T00:00"), null);
  assert.equal(on("2027-10-15T12:00"), "halloween");
  // the pumpkins go out plain and are carved for the last week
  assert.equal(ctx.holidayOn(new Date("2026-10-24T09:00")).carved, "10-24");
  // the gate reads the place's own date string, as the boat season does, never the shifted wall
  // clock, which runs an hour slow in the small hours of November 1 2026 when the clocks go back
  assert.match(html, /const today=locToday\(\),hol=holidayOn\(today\),halloween=hol\?\.id==="halloween";/);
  assert.match(html, /const carved=halloween&&mdOf\(today\)>=hol\.carved/);
  assert.equal(ctx.holidayOn("2026-10-31")?.id, "halloween");
  assert.equal(ctx.holidayOn("2026-11-01"), null);
  // the candle is lit with the barn lamps, and not in the rain
  assert.match(html, /const candles=carved&&sunAltDeg< -\.83&&!wet&&!storm/);
  // it gutters as hard as the gusts say, and in a calm or under reduced motion not at all
  assert.match(html, /const candleK=clamp\(\(gust-3\)\/24,0,1\),flick=!PRM&&candleK>\.04/);
  assert.match(html, /#sceneSvg \.candle\.flicker\{animation:candle/);
  assert.match(html, /@keyframes candle\{0%,100%\{opacity:1\}/);
  // its two deep ducks in a cycle are not the same depth
  assert.match(html, /31%\{opacity:var\(--c0,\.8\)\}[^\n]*74%\{opacity:var\(--c2,\.85\)\}/);
  assert.match(html, /--c0:\$\{\(1-\.55\*candleK\)[^\n]*--c2:\$\{\(1-\.4\*candleK\)[^\n]*--c1:\$\{\(1-\.25\*candleK\)/);
  // everything the candle lights is in that one flickering group: the spill on what is beside
  // it, its light on the water, the glow and the face
  assert.match(html, /<g class="candle\$\{flick\?" flicker":""\}"\$\{st\}>\$\{spill\}\$\{water\}\$\{halo\}/);
  // the spill never paints over the pumpkin, and the water column is cut where the piling stands
  assert.match(html, /<g clip-path="url\(#\$\{id\}c\)" mask="url\(#\$\{id\}m\)">/);
  assert.match(html, /gaps:\[\[dx\+12\.2,dx\+15\.8,base\+15\.4\]\]/);
  // and it thins out before the wavelets nearer the bank, at glints of uneven depth and length
  assert.match(html, /refl:\{top:base\+4\.2,bottom:base\+11\.6,/);
  assert.match(html, /for\(let t=r\(\)\*\.05;t<1;t\+=\.12\+r\(\)\*\.2\)\{/);
  // at the barn the big ones flank the door on the ground, so neither hides a lit window. They
  // are not a pair: the left one is bigger and a step nearer, the right one smaller and back
  assert.match(html, /lanL=barnX-10\.2,lanR=barnX\+11\.4/);
  assert.match(html, /const bigL=\{w:9\.2,h:6\.8,s:\.9\},bigR=\{w:8\.6,h:7\.4,s:\.8\}/);
  assert.match(html, /pumpkinAt\(lanL,barnFoot\+\.8,bigL\.s,/);
  assert.match(html, /pumpkinAt\(lanR,barnFoot,bigR\.s,/);
  // the left one lights the white pumpkin on the bale, the bale's end and the shock above the
  // bale's shadow, and the bale throws a band of shade on the shock
  assert.match(html, /\{\.\.\.whiteOne,face:true/);
  assert.match(html, /\{\.\.\.shock,face:true[^}]*shade:\[bale,whiteOne\]\}/);
  assert.match(html, /\+baleShade\+`<g class="decor" data-decor="straw-bale">/);
  // that band is a contact shadow by day, deeper only when the lantern beside it is lit, and it
  // fades under cloud like the kit's own crescents
  assert.match(html, /const lowK=candles\?nightK:0,/);
  assert.match(html, /opacity="\$\{\(\(\.32\+\.22\*lowK\)\*shadeK\)\.toFixed\(2\)\}"/);
  // the props are built only while they are out
  assert.match(html, /let barnDecor="",keepClear=\[\];\n    if\(halloween\)\{/);
  // the head in the loft window is Halloween's. For October the loft opens wider, and the rest
  // of the year the barn is drawn exactly as it was
  assert.match(html, /let loftHead="";const barnParts=propBarn\(halloween\?LOFT_WIDE:LOFT\);\n    if\(halloween\)\{/);
  assert.match(html, /castShadow\(propBarn\(halloween\?LOFT_WIDE:LOFT\),/);
  const bctx = vm.createContext({});
  vm.runInContext([lift(/const f1=[^\n]*/), lift(/const part=[^\n]*/), lift(/const LOFT=[^\n]*\nconst propBarn=[\s\S]*?"window"\)\];/),
    "globalThis.loftOf=l=>propBarn(l).find(p=>p.role==='loft').d;globalThis.W=LOFT_WIDE;"].join("\n"), bctx);
  assert.equal(bctx.loftOf(), "M 15.8 -22.4 L 15.8 -26.2 L 20.2 -26.2 L 20.2 -22.4 Z");
  assert.equal(bctx.loftOf(bctx.W), "M 14.7 -21.5 L 14.7 -27.3 L 21.3 -27.3 L 21.3 -21.5 Z");
  // he is clipped to that window, drawn over the lamp's glow so it never washes out his eyes,
  // stands in the loft's own deeper light, and never moves
  assert.match(html, /<rect x="\$\{lx\}" y="\$\{ly\}" width="\$\{lw\}" height="\$\{lh\}"\/><\/clipPath><g class="decor" data-decor="michael-myers" clip-path=/);
  assert.match(html, /fill="url\(#lampglow\)"\/>`:""\}\$\{loftHead\}/);
  assert.match(html, /loft:lamps\?\(halloween\?INK\.myers\.loftLamp:"#FFD27A"\):"#E8D7B0"/);
  const head = html.slice(html.indexOf("const propLoftHead="), html.indexOf("/* the meadow and the marsh grass"));
  assert.ok(head.includes("mulberry(1978)"), "the head's drawing is where the guard looks");
  assert.doesNotMatch(head, /class=|Math\.random/);
  // they are drawn with the barn, right after the fence, so the cloud shadows, the pond and the
  // near rain pass over them as they do over the barn. The grass leaves out whole the tufts that
  // would cross them, measured off the shock's own foot, so no blade crosses a lit face and no
  // other grass moves
  const ridge = html.slice(html.indexOf("${fence}${barnDecor}"), html.indexOf("${catsL}${catsR}"));
  assert.ok(ridge.startsWith("${fence}${barnDecor}"), "the barn's decorations follow the fence directly");
  assert.ok(ridge.indexOf("${cloudShadows(") > 0 && ridge.indexOf("${nearRain}") > 0 && ridge.indexOf("${tufts.map") > 0,
    "the cloud shadows, the near rain and the grass are painted over the barn's decorations");
  assert.match(html, /keepClear=\[\[shock\.x\+sx0\*shock\.s-\.4,lanR\+bigR\.w\*bigR\.s\/2\+\.4\]\]/);
  assert.match(html, /if\(!keepClear\.some\(\(\[a,b\]\)=>t1>a&&t0<b\)\)tufts\[bandOf\(x0\)\]\+=t;/);
  // the carved face is its own role, so the heron's own `face` keeps its outline
  assert.match(html, /const INK_INNER=new Set\(\[[^\]]*"carve"\]\)/);
  assert.doesNotMatch(html, /const INK_INNER=new Set\(\[[^\]]*"face"/);
  assert.match(html, /heron:\{body:"#8C92B5",wing:"#6B6E95",neck:"#A9A9C4",bill:"#E8B04A",face:/);
  // placed off the dock and the barn, never off a fraction of the frame, and the middle
  // piling is left to the cormorant
  assert.match(html, /pumpkinAt\(dx\+15\.8,deckY,1,/);
  assert.match(html, /pumpkinAt\(dx-26\.8,deckY/);
  assert.match(html, /const shock=\{parts:propCornShock\(5\),x:barnX-21\.5,y:barnFoot,s:\.74\}/);
  assert.match(html, /decorAt\(shock\.parts,INK\.cornShock,shock\.x,shock\.y,shock\.s\)/);
  // the harness looks at them in and out of season, lit and unlit
  const scene = await readFile(new URL("tools/scene.mjs", root), "utf8");
  for (const name of ["27-marsh-halloween-night", "28-marsh-halloween-cold-morning", "29-marsh-halloween-rain-night", "31-ridge-halloween-night", "32-ridge-november-morning", "35-marsh-november-small-hours"])
    assert.match(scene, new RegExp(`name: "${name}"`));
  assert.match(scene, /decorations are \[/);
});

test("a trick-or-treater comes on Halloween night, from sunset, and stays in when it rains", async () => {
  const [html, scene, rig] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("tools/scene.mjs", root), "utf8"),
    readFile(new URL("tools/rig.mjs", root), "utf8"),
  ]);
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/const mdOf=[^\n]*\nconst inSeason=[^\n]*/),
    lift(/const HOLIDAYS=[^\n]*\nconst holidayOn=[^\n]*\nconst trickOrTreating=[^\n]*/),
    lift(/const SNOW=[^\n]*\nconst isSnow=[^\n]*\nconst WETC=[^\n]*\nconst isWet=[^\n]*/),
    "globalThis.holidayOn=holidayOn;globalThis.tot=trickOrTreating;",
  ].join("\n"), ctx);
  const out = (d, alt, code = 0, hour = 20) => ctx.tot(ctx.holidayOn(d), d, alt, code, hour);
  // the night itself, on the place's own calendar, from sunset, when the barn lamps and the candles are lit
  assert.equal(ctx.holidayOn("2026-10-31").trickOrTreat, "10-31");
  assert.equal(out("2026-10-31", -14), true);
  assert.equal(out("2026-10-31", -1), true);
  assert.equal(out("2026-10-31", -.5), false);
  assert.equal(out("2026-10-31", 20), false);
  for (const d of ["2026-10-30", "2026-10-24", "2026-11-01", "2026-09-30"]) assert.equal(out(d, -14), false, d);
  assert.equal(out("2027-10-31", -14), true);
  // the small hours of the 31st are still the 30th's night: no kid at 3 or 5 a.m., one at 9 p.m.
  assert.equal(out("2026-10-31", -40, 0, 3), false);
  assert.equal(out("2026-10-31", -14, 0, 5), false);
  assert.equal(out("2026-10-31", -14, 0, 21), true);
  // a drizzle does not keep a kid in, and fog and cloud do not either. Rain does, and anything
  // heavier, and snow, ice and a storm
  for (const c of [0, 1, 2, 3, 45, 48, 51, 53, 55]) assert.equal(out("2026-10-31", -14, c), true, `code ${c}`);
  for (const c of [56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]) assert.equal(out("2026-10-31", -14, c), false, `code ${c}`);
  // it reads the same date string the rest of Halloween does
  assert.match(html, /const trickOrTreat=trickOrTreating\(hol,today,sunAltDeg,code,localHour\);/);
  // the kid is a decoration like the pumpkins, drawn at ten units to the pixel and lit by the sky
  assert.match(html, /svg:`<g class="decor" data-decor="trick-or-treater">\$\{inkAt\(x,y,s,1,\n\s*inkRig\(layers,decorPal\(INK\.trickOrTreater,\.04\),\{s,line:\.7,heavy:\.3,shade:\.9,lit:\.5,light:lightAt\(x,y-6\)\}\)\)\}<\/g>`/);
  // at the farm at the door between the two big ones, drawn before them so both lanterns light the
  // sheet, and the doorstep's pool goes under the kid's feet rather than over them
  assert.match(html, /const kid=trickOrTreat\?kidAt\(barnX-\.4,barnFoot\+\.4\):null,kidLit=kid\?\[\{\.\.\.kid,face:true,edge:\.8\}\]:\[\];/);
  assert.ok(html.indexOf('+(kid?kid.svg:"")') < html.indexOf("+pumpkinAt(lanL,barnFoot+.8"), "the kid is drawn before the lanterns that light it");
  assert.match(html, /pumpkinAt\(lanL,barnFoot\+\.8,bigL\.s,\{w:bigL\.w,h:bigL\.h,carved,seed:4,lights:\[\.\.\.kidLit,/);
  assert.match(html, /pumpkinAt\(lanR,barnFoot,bigR\.s,\{w:bigR\.w,h:bigR\.h,carved,seed:6,lights:\[\.\.\.kidLit,doorstep\]\}\)/);
  // on the coast at the dock's landward end, kept off it while the cormorant has the middle piling
  assert.match(html, /\+\(trickOrTreat&&\(dark\|\|temp>=48\)\?kidAt\(dx-17,deckY\)\.svg:""\):"";/);
  assert.match(html, /const marshResident=dark\?raccoon\(residentX,raccoonY,\.95,1\)\n\s*:temp<48\?cormorant\(/);
  // drawn from parts with the kit: the sneakers, the sheet with its two eye holes painted last in
  // black, then the hand and the pail. It never moves
  const kit = html.slice(html.indexOf("/* ── Storybook ink: the drawing kit"), html.indexOf("/* ── the scene: arc, sun / moon"));
  const kctx = vm.createContext({});
  vm.runInContext(`${html.match(/function mulberry\(a\)\{[\s\S]*?\}\}/)[0]}\n${kit}\nglobalThis.kid=propTrickOrTreater;globalThis.box=pathBox;globalThis.INK=INK;`, kctx);
  const units = kctx.kid();
  const roles = units.map((u) => [...new Set(u.parts.map((p) => p.role))].join(",")).join(" | ");
  assert.equal(roles, "shoe,sole | sheet,fold,eye | skin,handle,candy,pail,rim,rib,mark");
  assert.equal(units[1].parts.filter((p) => p.role === "eye").length, 2, "two eye holes");
  assert.equal(units[0].parts.filter((p) => p.role === "shoe").length, 2, "two sneakers");
  for (const u of units) for (const p of u.parts) assert.ok(kctx.INK.trickOrTreater[p.role], p.role);
  const prop = html.slice(html.indexOf("const propTrickOrTreater="), html.indexOf("/* ── More Halloween: the black cat"));
  assert.doesNotMatch(prop, /class=|style=|Math\.random|animation/);
  // kid scale with the storybook's licence: about eleven and a half pixels tall, under the barn
  // door's nearly fourteen and twice a jack-o'-lantern, with eye holes of more than a pixel each,
  // the sneakers showing under the hem and the pail held out past the sheet
  const sil = (u) => u.parts.filter((p) => !p.noSil).map((p) => p.d);
  const [x0, y0, w, h] = kctx.box(units.flatMap(sil));
  assert.ok(h / 10 > 11 && h / 10 < 12.5 && w / 10 > 10 && w / 10 < 11.6, `the kid is ${w / 10} x ${h / 10}`);
  for (const p of units[1].parts.filter((q) => q.role === "eye")) { const [, , ew, eh] = kctx.box([p.d]); assert.ok(ew / 10 >= 1.1 && eh / 10 >= 1.5, `eye ${ew / 10} x ${eh / 10}`); }
  const [, sy0, , sh] = kctx.box([units[1].parts[0].d]), [, , , fh] = kctx.box(sil(units[0]));
  assert.ok(sy0 + sh < -10 && fh > 14, "the sneakers show under the hem");
  const [px0] = kctx.box(sil(units[2]));
  assert.ok(px0 > 30 && x0 + w > 65, "the pail is held out at the side");
  // and mirrored, the pail is in the other hand
  const [mx0, , mw] = kctx.box(kctx.kid(-1).flatMap(sil));
  assert.ok(Math.abs(mx0 + mw + x0) < 1, "side -1 mirrors the kid");
  assert.match(html, /trickOrTreater:\{sheet:"#F3F0E8",[^}]*pail:"#F57A18",/);
  // the harnesses look at the kid: close up in the rig, out on Halloween night at both places and
  // in a drizzle, in for the night in the rain, and kept off the dock while the cormorant has it
  assert.match(rig, /"trick-or-treater": \["trickOrTreater", \(c\) => c\.propTrickOrTreater\(\)/);
  assert.match(rig, /ghostface \| witch \| trick-or-treater/);
  for (const name of ["27-marsh-halloween-night", "31-ridge-halloween-night", "46-marsh-halloween-drizzle-night"])
    assert.match(scene, new RegExp(`name: "${name}"[^\\n]*decor: \\[[^\\]]*"trick-or-treater"`));
  for (const name of ["47-ridge-halloween-rain-night", "48-marsh-halloween-cold-dusk", "29-marsh-halloween-rain-night", "38-marsh-october-moon"])
    assert.doesNotMatch(scene.match(new RegExp(`name: "${name}"[^\\n]*`))[0], /trick-or-treater/);
  assert.match(scene, /const MORE = \/\^\([^)]*\btrick-or-treater\b[^)]*\)\$\/;/);
  assert.match(scene, /out\.hits\.push\(`\$\{el\.dataset\.decor\} runs into \$\{o\.dataset\.decor\}`\)/);
});

// More Halloween, Josh, October 3 2026: "I want MORE halloween." Each of these is Halloween's, a
// decoration like the pumpkins, built only while it is out, drawn with the kit and lit by the sky
const moreHalloween = async () => {
  const [html, scene, rig, agents] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("tools/scene.mjs", root), "utf8"),
    readFile(new URL("tools/rig.mjs", root), "utf8"),
    readFile(new URL("AGENTS.md", root), "utf8"),
  ]);
  const kit = html.slice(html.indexOf("/* ── Storybook ink: the drawing kit"), html.indexOf("/* ── the scene: arc, sun / moon"));
  const ctx = vm.createContext({});
  vm.runInContext(`${html.match(/function mulberry\(a\)\{[\s\S]*?\}\}/)[0]}\n${kit}\nglobalThis.cat=propBlackCat;globalThis.ghost=propCheeseclothGhost;globalThis.scarecrow=propScarecrow;globalThis.box=pathBox;globalThis.INK=INK;globalThis.INNER=INK_INNER;`, ctx);
  const sil = (parts) => parts.filter((p) => !p.noSil && !ctx.INNER.has(p.role)).map((p) => p.d);
  const decorOf = (name) => { const m = scene.match(new RegExp(`name: "${name}"[^\\n]*decor: \\[([^\\]]*)\\]`)); assert.ok(m, name); return m[1]; };
  const farm = html.slice(html.indexOf("const pcx=W*.335"), html.indexOf("/* marsh: hazy maritime treeline"));
  const coast = html.slice(html.indexOf("/* marsh: hazy maritime treeline"), html.indexOf("/* ── smooth path through points"));
  const keyframes = (k) => { const body = html.match(new RegExp(`@keyframes ${k}\\{([\\s\\S]*?)\\}\\}`))[1]; return [...new Set(body.match(/[a-z-]+(?=:)/g))]; };
  return { html, scene, rig, agents, ctx, sil, decorOf, farm, coast, keyframes };
};

test("a black cat sits on the dock and on the farm's top rail in October, and goes in when it rains", async () => {
  const { html, scene, rig, agents, ctx, sil, decorOf, farm, coast, keyframes } = await moreHalloween();
  // both places, October only, in when it rains, and on a cold morning it gives the dock to the
  // cormorant, who has the middle piling
  assert.ok(coast.includes("const dockCat=halloween&&!wet&&!storm&&!(temp<48&&!dark)?catAt(dx+2.5,deckY+.25):null;"));
  assert.ok(farm.includes("if(halloween&&!wet&&!storm){\n      const want=barnX+27.5,"), "on the top rail, measured off the barn");
  assert.ok(farm.includes("fenceCat=catAt(cx,qy+(ry-qy)*t-7.2-.75).svg"), "sitting on the top rail");
  // amber slit eyes by day, the green eyeshine from sunset (the barn lamps' hour), never toned by the sky
  assert.match(html, /const eyeshine=sunAltDeg< -\.83;/);
  assert.match(html, /if\(eyeshine\)\{p\.eye=INK\.blackCat\.eyeNight;p\.eyeRing=INK\.blackCat\.eyeNight\}/);
  assert.match(html, /blackCat:\{body:"#2A2430",[^}]*eye:"#E8B43A",eyeNight:"#B8F25A",eyeRing:"#1A1214",/);
  // on the dock the lit lantern beside it warms its side, gently, so it is still a black cat
  assert.ok(coast.includes("if(dockCat)dockLit.lights.push({...dockCat,face:true,edge:.7,k:.3});"));
  // a tail flick now and then, off the wall clock, a transform at the tail's own root
  assert.match(html, /layers=propBlackCat\(phase\(23\)\)/);
  assert.deepEqual(keyframes("catTail"), ["transform"]);
  assert.match(html, /#sceneSvg \.cat-tail\{animation:catTail 23s ease-in-out infinite\}/);
  // drawn with the kit: the tail its own joint, then the body with two ears, two eyes and their
  // slits; about eight across and twelve tall, drawn at ten units to the unit
  const units = ctx.cat();
  assert.equal(units[0].open, '<g class="cat-tail">');
  const body = units[1].parts;
  assert.equal(body.filter((p) => p.role === "eye").length, 2);
  assert.equal(body.filter((p) => p.role === "eyeRing").length, 2);
  const [, , w, h] = ctx.box([...sil(body), ...sil(units[0].layers[0].parts)]);
  assert.ok(w / 10 > 7.5 && w / 10 < 10.5 && h / 10 > 17 && h / 10 < 19.5, `the cat is ${w / 10} x ${h / 10} with its tail`);
  const prop = html.slice(html.indexOf("const propBlackCat="), html.indexOf("const propCheeseclothGhost="));
  assert.doesNotMatch(prop.replace('${tail?` style="${tail}"`:""}', ""), /style=|Math\.random|animation/);
  // the harnesses look at it: close up in the rig, by day and with its eyeshine, out on every dry
  // October scene, in in the rain, off the dock on the cold morning, and gone in November
  assert.match(rig, /cat: \["blackCat", \(c\) => c\.propBlackCat\(\)/);
  for (const n of ["26-marsh-october-afternoon", "27-marsh-halloween-night", "37-marsh-october-fog-morning", "30-ridge-october-afternoon", "31-ridge-halloween-night", "41-ridge-october-dusk"])
    assert.match(decorOf(n), /"black-cat"/, n);
  for (const n of ["28-marsh-halloween-cold-morning", "29-marsh-halloween-rain-night", "34-ridge-halloween-rain-night", "46-marsh-halloween-drizzle-night", "48-marsh-halloween-cold-dusk", "32-ridge-november-morning", "35-marsh-november-small-hours"])
    assert.doesNotMatch(decorOf(n), /"black-cat"/, n);
  assert.match(agents, /\*\*A black cat sits out in October\.\*\*/);
});

test("eyes open in the dark at both places on October nights, blink once and go", async () => {
  const { html, scene, rig, agents, decorOf, farm, coast, keyframes } = await moreHalloween();
  // night only (the sun 6° under), and not in the rain or a storm
  assert.match(html, /const nightEyes=halloween&&sunAltDeg< -6&&!wet&&!storm;/);
  // one gold pair and one green pair at each place: in the coast's spartina, at the farm's woods' edge
  assert.match(coast, /const marshEyes=nightEyes\?darkEyes\(\[\[[^\]]*"gold"[^\]]*\],\[[^\]]*"green"[^\]]*\]\]\):"";/);
  assert.match(farm, /const farmEyes=nightEyes\?darkEyes\(\[\[[^\]]*"gold"[^\]]*\],\[[^\]]*"green"[^\]]*\]\]\):"";/);
  // each on its own clock off the wall clock: they fade in, blink once (a scale) and fade out,
  // which is transform and opacity and nothing else
  assert.match(html, /--ed:\$\{dur\}s;animation-delay:-\$\{\(\(Date\.now\(\)\/1000\+off\)%dur\)\.toFixed\(1\)\}s/);
  assert.deepEqual(keyframes("darkEyes").sort(), ["opacity", "transform"]);
  // they are light, so the sky does not tone them
  assert.match(html, /fill="\$\{c==="gold"\?"#F6C64E":"#C2F45C"\}"/);
  for (const n of ["27-marsh-halloween-night", "38-marsh-october-moon", "31-ridge-halloween-night", "33-ridge-october-night", "39-ridge-october-moon"])
    assert.match(decorOf(n), /"eyes"/, n);
  // not at dusk, when the first bats are out against the last of the light, nor in the rain
  for (const n of ["40-marsh-october-dusk", "41-ridge-october-dusk", "48-marsh-halloween-cold-dusk", "26-marsh-october-afternoon", "29-marsh-halloween-rain-night", "34-ridge-halloween-rain-night", "35-marsh-november-small-hours"])
    assert.doesNotMatch(decorOf(n), /"eyes"/, n);
  assert.match(agents, /\*\*Eyes in the dark\.\*\*/);
});

test("a scarecrow stands across the farm pond in October with a crow on its arm by day, and never moves", async () => {
  const { html, scene, rig, agents, ctx, decorOf, farm, coast } = await moreHalloween();
  // the farm only, in the field across the pond, a little right of its middle
  assert.ok(farm.includes("const scX=pcx+prx*.05,scS=.076,crow=!dark&&!wet&&!storm;"), "the crow is gone at night and in the rain");
  assert.ok(farm.includes("${scarecrow}") && !coast.includes("scarecrow"), "the farm only");
  // nothing of it moves: no class, style or animation but the decoration's own tag
  const line = farm.slice(farm.indexOf("const scarecrow=halloween?"), farm.indexOf("/* The black cat sits on the top rail"));
  assert.doesNotMatch(line.replace('class="decor"', ""), /class=|style=|animation/);
  const prop = html.slice(html.indexOf("const propScarecrow="), html.indexOf("/* Great horned owl"));
  assert.doesNotMatch(prop, /class=|style=|Math\.random|animation/);
  // drawn with the kit, the crow its own unit, only when it is there
  assert.equal(ctx.scarecrow(false).length, 1);
  assert.equal(ctx.scarecrow(true).length, 2);
  const roles = new Set(ctx.scarecrow(true)[1].parts.map((p) => p.role));
  for (const r of ["body", "beak", "wing", "foot", "crowEye"]) assert.ok(roles.has(r), r);
  for (const u of ctx.scarecrow(true)) for (const p of u.parts) assert.ok(ctx.INK.scarecrow[p.role], p.role);
  assert.match(rig, /scarecrow: \["scarecrow", \(c\) => c\.propScarecrow\(true\)/);
  for (const n of ["30-ridge-october-afternoon", "31-ridge-halloween-night", "34-ridge-halloween-rain-night", "47-ridge-halloween-rain-night", "41-ridge-october-dusk"])
    assert.match(decorOf(n), /"scarecrow"/, n);
  for (const n of ["26-marsh-october-afternoon", "27-marsh-halloween-night", "32-ridge-november-morning"]) assert.doesNotMatch(decorOf(n), /"scarecrow"/, n);
  assert.match(agents, /\*\*A scarecrow stands across the pond at the farm\.\*\*/);
});

test("a cheesecloth ghost hangs in the farm's big hardwood and swings with the gusts inside its sway", async () => {
  const { html, scene, rig, agents, ctx, decorOf, farm, coast, keyframes } = await moreHalloween();
  // from the big left hardwood, inside its sway group, at the farm only (the oak has Ghostface)
  assert.ok(farm.includes("${tree(W*.055,1.3,.08,3,farmGhost)}"));
  assert.ok(html.includes("const tree=(x,s,d,seed,extra=\"\")=>`<g${treeAt(x)}>${propAt(propHardwood(seed,winter)"), "drawn inside the tree's own group");
  assert.ok(!coast.includes("ghostIn("), "never at the coast");
  // it swings from its knot as far as the gusts say, in five mile an hour steps so the live paint
  // landing after the cache does not move it, and hangs still in a calm
  assert.match(html, /const gq=Math\.round\(gust\/5\)\*5,amt=gq<5\?0:clamp\(1\.2\+gq\*\.28,1\.2,10\),dur=clamp\(3\.4-gq\*\.05,1\.8,3\.4\);/);
  assert.match(html, /const st=PRM\|\|!amt\?"":` style="--gs:/);
  // in a calm it hangs still: the swing's class goes on only when there is a swing, or the CSS
  // runs ghostSwing on its own defaults
  assert.match(html, /<g\$\{amt\?' class="ghost-swing"':""\}\$\{st\}>/);
  assert.deepEqual(keyframes("ghostSwing"), ["transform"]);
  // drawn with the kit: two eye holes and an O of a mouth in the eye role, a hem torn into tatters
  const parts = ctx.ghost()[0].parts;
  assert.equal(parts.filter((p) => p.role === "eye").length, 3);
  assert.ok(parts.filter((p) => p.role === "thread").length >= 2, "threads trail off the tatters");
  const prop = html.slice(html.indexOf("const propCheeseclothGhost="), html.indexOf("const propScarecrow="));
  assert.doesNotMatch(prop, /class=|style=|Math\.random|animation/);
  assert.match(rig, /"sheet-ghost": \["cheesecloth", \(c\) => c\.propCheeseclothGhost\(\)/);
  for (const n of ["30-ridge-october-afternoon", "31-ridge-halloween-night", "34-ridge-halloween-rain-night"]) assert.match(decorOf(n), /"sheet-ghost"/, n);
  for (const n of ["26-marsh-october-afternoon", "27-marsh-halloween-night", "32-ridge-november-morning"]) assert.doesNotMatch(decorOf(n), /"sheet-ghost"/, n);
  assert.match(agents, /\*\*A cheesecloth ghost hangs in the big hardwood at the farm\.\*\*/);
});

test("will-o'-the-wisps drift low over the marsh on dry still October nights, and nowhere else", async () => {
  const { html, scene, rig, agents, decorOf, farm, coast, keyframes } = await moreHalloween();
  assert.ok(coast.includes("const wisps=halloween&&sunAltDeg< -6&&!wet&&!storm&&wind<9&&gust<15"));
  assert.ok(!farm.includes("wispsAt("), "the coast only");
  // three, seeded, each on its own slow clock off the wall clock, drifting and dimming
  assert.match(html, /const r=mulberry\(911\+i\*37\),dur=13\+r\(\)\*7;/);
  assert.match(html, /animation-delay:-\$\{\(\(Date\.now\(\)\/1000\+i\*5\.3\)%dur\)\.toFixed\(1\)\}s/);
  assert.equal((coast.match(/\[wispX[^\]]*\]/g) || []).length, 3);
  assert.deepEqual(keyframes("wisp").sort(), ["opacity", "transform"]);
  // they keep between the raccoon and the dock, a short reach apart, and the last one ends short of
  // the oyster rake, measured off its own drawing, so its light falls on the water and not the shells
  assert.match(coast, /const rakeX=W\*\.645,rakeD=scallop\(0,1\.2,15,2\.8,11,41,\{flat:\.9,bulge:\.7\}\),\[rakeBx\]=pathBox\(\[rakeD\]\);/);
  assert.match(coast, /<g data-prop="rake" transform="translate\(\$\{rakeX\.toFixed\(1\)\}/);
  assert.match(coast, /const wispX=residentX\+48,wispSpan=Math\.min\(Math\.min\(dkX-66,rakeX\+rakeBx-9\)-wispX,118\);/);
  for (const n of ["27-marsh-halloween-night", "38-marsh-october-moon"]) assert.match(decorOf(n), /"wisps"/, n);
  for (const n of ["29-marsh-halloween-rain-night", "40-marsh-october-dusk", "31-ridge-halloween-night", "35-marsh-november-small-hours"]) assert.doesNotMatch(decorOf(n), /"wisps"/, n);
  // and the scene harness walks every one of the new things through its own motion and keeps it in
  // the frame, off every animal and a pixel clear of every other decoration, at 320, 390, 430 and 760
  assert.match(scene, /const MORE = \/\^\(black-cat\|eyes\|wisps\|scarecrow\|sheet-ghost\|trick-or-treater\)\$\/;/);
  assert.match(scene, /for \(const width of \[320, 390, PHONE_WIDTH\]/);
  assert.match(scene, /if \(cs\.decor\?\.length\) reportDecor\(cs, 760, await decorCheck\(page\)\);/);
  assert.match(agents, /\*\*Will-o'-the-wisps on the marsh\.\*\*/);
});

test("Halloween's moon keeps its place and its phase, and only changes colour", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/const clamp=[^\n]*/),
    lift(/const hex2rgb=[^\n]*\nconst rgb2hex=[^\n]*\nconst mix=[^\n]*/),
    html.slice(html.indexOf("const HMOON={"), html.indexOf("let LOC;try{")),
    "globalThis.halloweenMoon=halloweenMoon;globalThis.HMOON=HMOON;",
  ].join("\n"), ctx);
  // Josh's pick, one constant, and the ordinary moon when it is null
  assert.match(html, /const HALLOWEEN_MOON="blood";/);
  assert.deepEqual(Object.keys(ctx.HMOON).sort(), ["blood", "harvest"]);
  assert.equal(ctx.halloweenMoon(null, { altDeg: 20, sunAltDeg: -12, up: false }), null);
  // it is October's alone, read off the place's own calendar like the decorations
  assert.match(html, /const hm=HALLOWEEN_MOON&&holidayOn\(locToday\(\)\)\?\.id==="halloween"\?halloweenMoon\(HALLOWEEN_MOON,/);
  // the real phase and the real place: the terminator is the ordinary one, drawn at the moon's own r
  assert.match(html, /const r=hm\?hm\.r:11, ill=mph\.fraction, ph=mph\.phase;/);
  const night = (kind, altDeg, skyAlt = 0) => ctx.halloweenMoon(kind, { altDeg, sunAltDeg: -14, up: false, skyAlt });
  // after dark the colour is whole; by day it is a pale tint, because a red moon in a blue sky is odd
  assert.equal(night("blood", 30).k, 1);
  const day = ctx.halloweenMoon("blood", { altDeg: 50, sunAltDeg: 30, up: true });
  assert.equal(day.k, 0.25);
  const red = (h) => parseInt(h.slice(1, 3), 16) - parseInt(h.slice(5, 7), 16);
  assert.ok(red(night("blood", 30).lit) > 90, "a blood moon is red after dark");
  assert.ok(red(day.lit) < 50, "and only tinted by day");
  // the blood moon is the ordinary size; the harvest moon is bigger, and biggest low over the skyline
  assert.equal(night("blood", 5).r, 11);
  assert.ok(night("harvest", 60).r > 12.5 && night("harvest", 60).r < 14);
  assert.ok(night("harvest", 3).r > 16.5);
  assert.ok(night("harvest", 25, 22).r > night("harvest", 25, 0).r, "at the ridge, low is low over the crest");
  assert.ok(day.r < 11.1 && ctx.halloweenMoon("harvest", { altDeg: 50, sunAltDeg: 30, up: true }).r < 12);
  // overcast takes its glow and dims it, because the ordinary moon is not veiled after dark
  assert.match(html, /const over=up\?0:clamp\(\(cloud-60\)\/40,0,1\),glowK=\(\.5\+\.5\*ill\)\*\(1-\.8\*over\);/);
  // its light on the water and on the lit edges is its own colour, a little
  assert.match(html, /glintCol=hm\?hm\.glint:"#E8F1FA"/);
  assert.match(html, /moonXY\?moonLight:"#8FA3C2"/);
  // in the scene it is a decoration, its disc is what the bats keep off and the witch crosses, and
  // the harness checks it in October and the ordinary moon after
  assert.match(html, /moonBody=`<g data-moon="\$\{hm\.kind\}" data-decor="\$\{hm\.kind\}-moon" data-disc=/);
  assert.match(html, /moonXY=\[x,y\];moonR=r;/);
  const scene = await readFile(new URL("tools/scene.mjs", root), "utf8");
  for (const name of ["38-marsh-october-moon", "39-ridge-october-moon"]) assert.match(scene, new RegExp(`name: "${name}"[^\\n]*"blood-moon"[^\\n]*moon: true`));
  assert.match(scene, /const want = cs\.when\.slice\(5, 7\) === "10" && moon\.pick \? moon\.pick : "ordinary";/);
  // and it adds no motion
  const body = html.slice(html.indexOf("if(hm){"), html.indexOf("}else moonBody="));
  assert.doesNotMatch(body, /animation|class="/);
});

test("Ghostface peeks out of the live oak for October, and never moves", async () => {
  const [html, scene, rig] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("tools/scene.mjs", root), "utf8"),
    readFile(new URL("tools/rig.mjs", root), "utf8"),
  ]);
  // Josh, October 1 2026: a Scream Ghost Face peeking from behind the live oak at Porters Neck.
  // He is Halloween's, a decoration like the pumpkins, and is built only while it is out
  assert.match(html, /const ghostface=halloween\?`<g class="decor" data-decor="ghostface"><g transform="translate\(\$\{f1\(gfX\)\} \$\{f1\(gfY\)\}\) scale\(\.1\)">\$\{inkRig\(propGhostface\(\),decorPal\(INK\.ghostface,oakD\),/);
  // placed off the oak's own units, at the oak's distance, lit by its sky
  assert.match(html, /const gfX=oakX\+GF_AT\[0\]\*oakS,gfY=base\+2\+GF_AT\[1\]\*oakS;/);
  assert.match(html, /light:lightAt\(gfX,gfY\)\}\)\}<\/g><\/g>`:"";/);
  // behind the tree, so its limbs hide his shoulders, and outside its sway group, so he never
  // moves with it. Nothing of his carries a class, a style or an animation
  assert.ok(html.includes("${ghostface}${oak}"), "Ghostface is painted directly behind the oak");
  assert.ok(html.indexOf("const ghostface=") > html.indexOf("const oak=liveOak();"), "he is not drawn inside the oak's sway group");
  const line = html.match(/const ghostface=halloween\?[^\n]*/)[0];
  assert.doesNotMatch(line.replace('class="decor"', ""), /class=|style=|animation/);
  const prop = html.slice(html.indexOf("const propGhostface="), html.indexOf("/* the meadow and the marsh grass"));
  assert.doesNotMatch(prop, /class=|style=|Math\.random|animation/);
  // in October the one moss wisp over his face is left out whole, and it still makes its draws,
  // so no other wisp moves
  const moss = html.slice(html.indexOf("const clear=11+mr()*5"), html.indexOf("if(!overFace)moss+="));
  assert.ok(moss.includes("mr()*1.1") && moss.includes("mr()*9"), "every draw happens before the gate");
  assert.match(moss, /const overFace=halloween&&/);
  // drawn from parts with the kit: the robe, the hood, then the mask, with the eyes and the open
  // mouth in the eye role, so they are painted last, in black, and never outlined
  const kit = html.slice(html.indexOf("/* ── Storybook ink: the drawing kit"), html.indexOf("/* ── the scene: arc, sun / moon"));
  const ctx = vm.createContext({});
  vm.runInContext(`${html.match(/function mulberry\(a\)\{[\s\S]*?\}\}/)[0]}\n${kit}\nglobalThis.gf=propGhostface;globalThis.box=pathBox;globalThis.INK=INK;`, ctx);
  const units = ctx.gf();
  assert.equal(units.map((u) => u.parts.map((p) => p.role).join(",")).join(" | "), "robe | hood | mask,eye,eye,eye");
  for (const role of ["robe", "hood", "mask", "eye"]) assert.ok(ctx.INK.ghostface[role], role);
  // the mask is the one bright thing in the crown: white over a soft black robe and hood
  assert.match(html, /ghostface:\{robe:"#1A1820",hood:"#26232D",mask:"#F5F3EE",eye:"#07060A",/);
  // the storybook's licence: a mask about six pixels wide and nine tall, drawn at ten units to
  // the pixel, tipped the way he cocks his head
  const [, , w, h] = ctx.box([ctx.gf(0)[2].parts[0].d]);
  assert.ok(w / 10 > 5.6 && w / 10 < 6.6 && h / 10 > 8.6 && h / 10 < 9.8, `mask ${w / 10} x ${h / 10}`);
  assert.match(html, /const propGhostface=\(tip=\.28,z=1\.22\)=>/);
  assert.match(html, /const GF_AT=\[5\.65,-28\.2\];/);
  // the harnesses look at him: close up in the rig, and in every October marsh scene
  assert.match(rig, /ghostface: \["ghostface", \(c\) => c\.propGhostface\(\)/);
  assert.match(rig, /lumina \| cornshock \| bale \| loft-head \| ghostface/);
  for (const name of ["26-marsh-october-afternoon", "27-marsh-halloween-night", "28-marsh-halloween-cold-morning", "29-marsh-halloween-rain-night", "36-marsh-october-golden-evening", "37-marsh-october-fog-morning"])
    assert.match(scene, new RegExp(`name: "${name}"[^\\n]*decor: \\["ghostface"`));
  assert.match(scene, /name: "35-marsh-november-small-hours"[^\n]*decor: \[\]/);
  // he stands still and the oak sways over him, so the scene harness samples both eyes at both
  // ends of the sway, in the scene's wind and in a gale, and fails 40% of either hidden
  assert.match(scene, /if \(cs\.decor\?\.includes\("ghostface"\)\)/);
  assert.match(scene, /oak\.style\.setProperty\("--tsway", "1\.4deg"\)/);
  assert.match(scene, /r\.flat\(\)\.some\(\(v\) => v >= 40\)/);
  // and the notes count the scenes it runs
  const agents = await readFile(new URL("AGENTS.md", root), "utf8");
  const words = ["twenty-nine", "thirty", "thirty-one", "thirty-two", "thirty-three", "thirty-four", "thirty-five", "thirty-six", "thirty-seven", "thirty-eight", "thirty-nine",
    "forty", "forty-one", "forty-two", "forty-three", "forty-four", "forty-five", "forty-six", "forty-seven", "forty-eight", "forty-nine"];
  const said = agents.match(/`tools\/scene\.mjs` is for anything that moves\. (\S+) scenes/)[1].toLowerCase();
  assert.equal(29 + words.indexOf(said), (scene.match(/^  \{ name: "/gm) || []).length, `AGENTS.md says ${said} scenes`);
});

test("bats come out over both scenes on October nights, from sunset to dawn, and the weather keeps them in", async () => {
  const [html, scene, rig] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("tools/scene.mjs", root), "utf8"),
    readFile(new URL("tools/rig.mjs", root), "utf8"),
  ]);
  // Josh, October 3 2026: "I want bats, fluttering around - more movement, both scenes". They are
  // Halloween's, so October only, and they keep a bat's hours: out from sunset (the sun under
  // -0.83°) and in by civil dawn (-6° on the way up). A storm, heavy rain, snow, ice and a cold night
  // keep them in, and wind, overcast, light rain, fog and cold thin the colony out
  assert.match(html, /if\(!halloween\|\|sunAltDeg>=-\.83\|\|\(rising&&sunAltDeg>=-6\)\|\|storm\|\|rainK>=\.65\|\|snowing\|\|isIce\(code\)\|\|temp<=34\)return 0;/);
  assert.match(html, /const n=7-\(wind>=7\)-\(gust>=15\)-\(gust>=22\)-2\*\(gust>=30\)-\(cloud>75\)-\(temp<50\)-\(temp<42\)-\(rainK>0\?3:0\)-\(fog\?1:0\);/);
  // a couple at sunset, the whole colony a few degrees on, thinning before dawn
  assert.match(html, /const k=clamp\(\.35\+\(rising\?-6-sunAltDeg:-\.83-sunAltDeg\)\/4,\.35,1\);/);
  // the wind moves them: each one is carried downwind across its loop and leans with it
  assert.match(html, /const lean=downwind\*clamp\(wind\*\.7,0,14\),drift=downwind\*clamp\(wind\*1\.3,0,26\);/);
  // at both scenes, in the sky: over the far ridge at the farm, over the treeline and what stands
  // on it on the coast, and off the sun and the moon, whatever size the moon is drawn
  assert.ok(html.includes("${sceneClouds}\n      ${bats}\n      ${ridgeFolds.slice(2)"), "the farm's bats fly over the far ridge");
  assert.ok(html.includes("${sceneClouds}\n    ${bats}\n    ${witchFly("), "the coast's bats fly over the far treeline");
  assert.match(html, /moonXY&&\[\.\.\.moonXY,moonR\+3\]/);
  // every draw is seeded and made before any gate, and the loops take their phase off the wall clock
  assert.match(html, /const q=Array\.from\(\{length:9\},mulberry\(4110\+i\*97\)\);/);
  assert.match(html, /--bd:\$\{dur\.toFixed\(2\)\}s;\$\{phase\(dur\)\}/);
  // each bat's patch of sky is its own and not a share of the colony, so a colony that grows or
  // thins between the cached paint and the live one never moves the bats that stay: seven fixed
  // patches dealt out in an order that spreads two or three bats across the whole sky
  assert.match(html, /const slot=\(W-24\)\/7,HOME=\[1,5,3,0,6,2,4\];/);
  assert.match(html, /const cx=12\+slot\*\(HOME\[i\]\+\.5\)\+\(q\[1\]-\.5\)\*slot\*\.6;/);
  assert.doesNotMatch(html, /slot=\(W-24\)\/batN/);
  const HOME = JSON.parse(html.match(/HOME=(\[[\d,]+\])/)[1]);
  assert.deepEqual([...HOME].sort(), [0, 1, 2, 3, 4, 5, 6]);
  for (const n of [2, 3]) assert.ok(Math.max(...HOME.slice(0, n)) - Math.min(...HOME.slice(0, n)) >= 4, `${n} bats spread across the sky`);
  // transforms only, and under reduced motion the wings carry no timing (the page's own rule
  // stops every animation), so each bat holds still at its home spot
  for (const k of ["batFlap", "batHuntA", "batHuntB", "batHuntC"]) {
    const body = html.match(new RegExp(`@keyframes ${k}\\{([\\s\\S]*?)\\}\\}`))[1];
    for (const prop of body.match(/[a-z-]+(?=:)/g)) assert.equal(prop, "transform", `${k} animates ${prop}`);
  }
  assert.match(html, /const beat=PRM\?\(\)=>"":side=>/);
  // the vulture goes to roost when they come out
  assert.match(html, /const soarer=!wet&&!storm&&!dark&&!batN\?/);
  // drawn from parts with the kit, each wing its own joint at the shoulder
  assert.match(html, /const rigBat=\(beat=\(\)=>""\)=>\{const open=side=>`<g class="bat-wing bat-w/);
  assert.match(html, /\{open:open\(-1\),pivot:\[-S\[0\],S\[1\]\],layers:\[\{parts:wingParts\(-1\)\}\]\}/);
  assert.match(html, /bat:\{body:"#4A3833",wing:"#2C2228"/);
  // the harnesses look at them: close up in the rig, and walked through their loops in every scene
  assert.match(rig, /bat: \["bat", \(c\) => c\.rigBat\(\)/);
  for (const [name, n] of [["27-marsh-halloween-night", 6], ["31-ridge-halloween-night", 4], ["33-ridge-october-night", 6], ["38-marsh-october-moon", 7], ["39-ridge-october-moon", 6], ["40-marsh-october-dusk", 7], ["41-ridge-october-dusk", 7]])
    assert.match(scene, new RegExp(`name: "${name}"[^\\n]*"bat"[^\\n]*bats: ${n},`));
  for (const name of ["26-marsh-october-afternoon", "29-marsh-halloween-rain-night", "30-ridge-october-afternoon", "34-ridge-halloween-rain-night", "32-ridge-november-morning", "35-marsh-november-small-hours"])
    assert.doesNotMatch(scene, new RegExp(`name: "${name}"[^\\n]*bats:`));
  assert.match(scene, /if \(bat\.colony !== want\)/);
  assert.match(scene, /why\.add\("goes behind the scenery"\)/);
});

test("a witch flies over both scenes on October nights, on the wind, across the moon, and holds still under reduced motion", async () => {
  const [html, scene, rig] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("tools/scene.mjs", root), "utf8"),
    readFile(new URL("tools/rig.mjs", root), "utf8"),
  ]);
  // Josh, October 3 2026: "I want a witch to fly through the night sky". She is Halloween's, out only
  // once the sky is dark on its nights, and the weather still grounds her: a storm, thunder overhead,
  // anything heavier than light rain, freezing rain, heavy snow and fog
  assert.match(html, /const witchPlan=\(yTop,yLow,moonOk,tops=\[\]\)=>\{\n    if\(!halloween\|\|sunAltDeg>=-6\|\|storm\|\|fog\|\|THUNDER>1\|\|rainK>=\.65\|\|\[66,67,75,86\]\.includes\(code\)\)return null;/);
  // at both scenes: behind the far treeline on the coast and above the oak, the pines and the heron,
  // in front of the folds at the farm, and the moon only counts when it is in open sky
  // she is planned before the bats are placed, so under reduced motion they keep off where she holds
  assert.ok(html.includes("const witch=witchPlan(17,GY-63,(x,y)=>y<GY-26&&skyTops.every(([a,b,t])=>x+moonR<a||x-moonR>b||y+moonR<t),skyTops);\n  const bats=batN?batColony(8,"), "the coast's witch keeps above the oak, the pines and the heron");
  assert.ok(html.includes("const witch=witchPlan(17,base-rTop-11,(x,y)=>y<crestY(0,x)-13);\n    const bats=batColony(8,"), "the farm's witch is planned before its bats");
  assert.match(html, /const batKeep=wp=>wp&&wp\.box\?\[\.\.\.timeBoxes,wp\.box\]:timeBoxes;/);
  assert.equal(html.split("batKeep(witch)").length, 3, "both places' bats keep off the still witch");
  assert.ok(html.includes("${witchFly(witch)}\n    <path d=\"${tl}\""), "the coast's witch flies behind the far treeline");
  assert.ok(html.includes("${hawk}${soarer}\n      ${witchFly(witch)}"), "the farm's witch flies in front of the folds");
  assert.match(html, /&&tops\.every\(\(\[a,b,t\]\)=>under\(y0,y1,a,b,t-6\)\)/);
  // she rides the wind, taken in five-mile steps so the live paint does not move her: downwind,
  // quicker in a blow, leaning further over the handle
  assert.match(html, /const g=Math\.round\(clamp\(gust,0,45\)\/5\)\*5/);
  assert.match(html, /const cyc=Math\.abs\(W\+2\*edge\)\/\(30\+g\*\.8\)\/\.22;/);
  assert.match(html, /tilt=Math\.atan\(k\)\*180\/Math\.PI\+d\*\(2\+g\*\.2\)/);
  // across the moon: a straight line through it with her seat a little under its middle, clear of
  // the sunrise and sunset times, the only numbers written on the sky
  assert.match(html, /const\[mx,my\]=\[moonXY\[0\],moonXY\[1\]\+3\]/);
  assert.match(html, /line=c=>\[my\+c\*near,my-c\*far\]/);
  // both ends of a line through the moon stay inside her band, so a moon under it is never crossed
  // by a climb out of the barnyard
  assert.match(html, /\.map\(line\)\.find\(\(\[a,b\]\)=>Math\.min\(a,b\)>=yTop&&Math\.max\(a,b\)<=yLow&&clear\(a,b\)\)/);
  // a moon she leaves alone she passes well over or well under, never along its rim
  assert.match(html, /return ys\.every\(y=>y<my-moonR-8\)\|\|ys\.every\(y=>y>my\+moonR\+16\)\};/);
  assert.match(html, /\[y0,y1\]=ls\.find\(\(\[a,b\]\)=>clear\(a,b\)&&offMoon\(a,b\)\)\|\|/);
  assert.match(html, /const clear=\(y0,y1\)=>labs\.every\(/);
  // lit from where the moon really is
  assert.match(html, /light:lightAt\(lx,ly\)/);
  // her clock: the first crossing 2.4s after the app opens or comes back to the front, and while she
  // is crossing her direction and her cycle are held, so a wind that flips cannot turn her round
  assert.match(html, /let WITCH_RUN=null;\ndocument\.addEventListener\("visibilitychange",\(\)=>\{/);
  assert.match(html, /WITCH_RUN\.t0=WITCH_RUN\.open=Date\.now\(\)\+2400;/);
  assert.match(html, /if\(!R\)R=WITCH_RUN=\{d:downwind,C:cyc,t0:now\+2400,open:now\+2400\};\n    else if\(atOf\(R\)>=\.22\*R\.C&&/);
  // transforms only, and under reduced motion she is drawn still beside the moon, off its disc, so
  // its real phase still shows
  for (const k of ["witchCross", "witchBob", "witchCape"]) {
    const body = html.match(new RegExp(`@keyframes ${k}\\{([^\\n]*)\\}`))[1];
    for (const prop of body.match(/[a-z-]+(?=:)/g)) assert.equal(prop, "transform", `${k} animates ${prop}`);
  }
  assert.match(html, /const ahead=mx\+d\*\(gap-WEX\[0\]\),behind=mx-d\*\(gap\+WEX\[1\]\);/);
  // wherever she holds still, her box keeps off the sunrise and sunset times, the moon's disc and
  // what stands up into her sky, and the frame
  assert.match(html, /return l>4&&r<W-4&&t>2&&y>=yTop&&y<=yLow&&timeBoxes\.every\(/);
  assert.match(html, /rest=spots\.find\(ok\)\|\|/);
  assert.match(html, /return `<g class="witch" \$\{tag\} transform=/);
  // drawn from parts with the kit: the far boot, the broom, the cat, the cape on its one joint at her
  // shoulders, her body, her head and hat; and her box is the one the scene keeps off the frame
  const kit = html.slice(html.indexOf("/* ── Storybook ink: the drawing kit"), html.indexOf("/* ── the scene: arc, sun / moon"));
  const ctx = vm.createContext({});
  vm.runInContext(`${html.match(/function mulberry\(a\)\{[\s\S]*?\}\}/)[0]}\n${kit}\nglobalThis.pw=propWitch;globalThis.box=pathBox;globalThis.B=WITCH_BOX;globalThis.INK=INK;`, ctx);
  const units = ctx.pw(), flat = (l) => (l.parts ? l.parts : l.layers.flatMap(flat)), parts = units.flatMap(flat);
  assert.equal(units.length, 6);
  assert.equal(units.filter((u) => u.open).map((u) => u.open).join(), '<g class="witch-cape">');
  for (const role of ["hat", "wood", "straw", "cat", "cape", "lining", "robe", "skin", "eye", "mark"]) {
    assert.ok(parts.some((p) => p.role === role), `she has a ${role}`);
    assert.ok(ctx.INK.witch[role], `INK.witch.${role}`);
  }
  const [x, y, w, h] = ctx.box(parts.filter((p) => !p.noSil).map((p) => p.d));
  assert.ok(Math.abs(x - ctx.B[0]) < 2 && Math.abs(y - ctx.B[1]) < 2 && Math.abs(x + w - ctx.B[2]) < 2 && Math.abs(y + h - ctx.B[3]) < 2, `box ${[x, y, x + w, y + h].map(Math.round)}`);
  // and nothing of the drawing animates on its own: the scene moves her
  const prop = html.slice(html.indexOf("const propWitch="), html.indexOf("const WITCH_BOX="));
  assert.doesNotMatch(prop.replace('class="witch-cape"', ""), /class=|style=|Math\.random|animation/);
  // the harnesses look at her: close up in the rig, and walked across at 320, 390 and 430 in every
  // scene she is out in, never behind a tree, and held off the disc under reduced motion
  assert.match(rig, /witch: \["witch", \(c\) => c\.propWitch\(\)/);
  for (const name of ["27-marsh-halloween-night", "31-ridge-halloween-night", "33-ridge-october-night", "38-marsh-october-moon", "39-ridge-october-moon"])
    assert.match(scene, new RegExp(`name: "${name}"[^\\n]*witch: true`));
  for (const name of ["29-marsh-halloween-rain-night", "34-ridge-halloween-rain-night", "35-marsh-november-small-hours", "36-marsh-october-golden-evening", "40-marsh-october-dusk", "41-ridge-october-dusk"])
    assert.doesNotMatch(scene, new RegExp(`name: "${name}"[^\\n]*witch: true`));
  assert.match(scene, /if \(!!witch !== !!cs\.witch\)/);
  assert.match(scene, /the witch's path misses the moon/);
  assert.match(scene, /a tree or the treeline hides \$\{witch\.hidden\}% of the witch/);
  assert.match(scene, /for \(const width of \[320, 390, \.\.\.\(cs\.witchWidths \|\| \[\]\)\]\.filter\(\(w\) => w !== PHONE_WIDTH\)\)/);
  assert.match(scene, /under reduced motion the witch holds still over the moon's disc and hides its phase/);
  assert.match(scene, /under reduced motion the witch holds still on \$\{/);
  assert.match(scene, /the witch passes along the rim of a moon she does not cross/);
  // the farm on an early October evening with a westerly, where a moon under her band once sent
  // her out of the barnyard through the owl, at 430 and 900
  assert.match(scene, /name: "42-ridge-october-evening-westerly"[^\n]*witch: true[^\n]*witchWidths: \[900\]/);
});

test("Halloween's cobweb is strung across the corner of the app itself, clear of every word, and takes no tap", async () => {
  const [html, scene, rig] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("tools/scene.mjs", root), "utf8"),
    readFile(new URL("tools/rig.mjs", root), "utf8"),
  ]);
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/function mulberry\(a\)\{[^\n]*\n[^\n]*\}\}/),
    lift(/const WEB=\{[\s\S]*?\};\n/),
    html.slice(html.indexOf("function webPlan("), html.indexOf("function paintCobweb(")),
    "globalThis.webPlan=webPlan;globalThis.WEB=WEB;",
  ].join("\n"), ctx);
  // Josh, October 3 2026: "maybe cobwebs a corner of the app that breaks the fourth wall". It is the
  // Halloween window's, read off the place's own calendar the way the decorations are, and it is
  // strung once there is a reading: the loading and error shell has none
  assert.match(html, /if\(holidayOn\(locToday\(\)\)\?\.id!=="halloween"\|\|!LAST\)return off\(\);/);
  assert.match(html, /LAST=\{d,live,savedAt\};LASTW=appW\(\);\n  fishSchedule\(allowedFishWins\);\n  paintCobweb\(\);\n  fishMotion\(\);\n\}/);
  assert.match(html, /xpReset\(\);LAST=null;\n  paintCobweb\(\);\n\}/);
  // placed again when the alert strip opens and moves everything under it, and when the fonts land
  assert.match(html, /el\.setAttribute\("aria-expanded",open\?"true":"false"\);\n  \/\*[^\n]*\*\/\n  paintCobweb\(\);/);
  assert.match(html, /document\.fonts\.ready\.then\(\(\)=>\{starsClearOfType\(\);paintCobweb\(\)\}\)/);
  // on the glass: out of the flow, over the rain, hidden from screen readers, and every tap goes
  // through it
  assert.match(html, /<div class="cobweb" id="cobweb" aria-hidden="true" hidden><\/div>\n<\/header>/);
  assert.match(html, /\.cobweb\{position:absolute;top:0;right:0;width:0;height:0;z-index:3;pointer-events:none\}/);
  assert.match(html, /\.sky>\*:not\(\.sky-fx\):not\(\.flash\):not\(\.rainfx\):not\(\.cobweb\)\{position:relative;z-index:2\}/);
  // the type it keeps off is the type the stars keep off, plus the chips, the rain strip and the alert
  assert.match(html, /const boxes=\[\.\.\.typeBoxes\("\.masthead,\.now,#verdict,#chips,#nowcast"\),/);
  assert.match(html, /const lines=typeBoxes\("\.masthead,\.now,#verdict,#chips"\);/);

  // the planner is pure. In open sky the web is its full size for the width, with its spider
  const W = 390, top = 34, Rmax = 105;
  const meta = [{ l: 20, t: 18, r: 145, b: 32 }, { l: 231, t: 18, r: 370, b: 32 }, { l: 21, t: 56, r: 139, b: 130 },
    { l: 153, t: 96, r: 244, b: 110 }, { l: 153, t: 118, r: 246, b: 132 }];
  const open = ctx.webPlan([...meta, { l: 20, t: 158, r: 272, b: 182 }], { W, top, Rmax });
  assert.equal(open.R, Rmax);
  assert.ok(open.spider, "a spider hangs under it");
  assert.equal(open.moor.length, 2, "both mooring threads run up the gutter into the corner");
  const quad = (q, t) => [0, 1].map((k) => (1 - t) * (1 - t) * q.a[k] + 2 * t * (1 - t) * q.c[k] + t * t * q.b[k]);
  const silk = (p) => [...[...p.radials, ...p.moor].flatMap(([a, b]) => Array.from({ length: 41 }, (_, i) => [a[0] + (b[0] - a[0]) * i / 40, a[1] + (b[1] - a[1]) * i / 40])),
    ...[...p.rungs, ...p.loose].flatMap((q) => Array.from({ length: 21 }, (_, i) => quad(q, i / 20)))];
  const clearOf = (p, boxes, pad) => silk(p).every(([x, y]) => boxes.every((b) => x < b.l - pad || x > b.r + pad || y < b.t - pad || y > b.b + pad));
  assert.ok(clearOf(open, meta, 4.5), "no thread within 5px of the type");
  // the spider's whole swing and her drop keep off the type too: a long headline under the web pulls
  // her up her dragline rather than letting her hang into it
  const spiderBox = (p) => { const s = p.spider, L = s.D + s.d * ctx.WEB.over + ctx.WEB.sl, half = ctx.WEB.sw + L * Math.sin(ctx.WEB.swing * Math.PI / 180);
    return { l: s.x - half, r: s.x + half, t: s.y + s.D - 1, b: s.y + L }; };
  const meets = (a, b, pad) => a.r > b.l - pad && a.l < b.r + pad && a.b > b.t - pad && a.t < b.b + pad;
  const longHead = [...meta, { l: 20, t: 152, r: 372, b: 176 }];
  const tight = ctx.webPlan(longHead, { W, top, Rmax });
  assert.ok(tight.spider, "a long headline still leaves her room");
  assert.ok(longHead.every((b) => !meets(spiderBox(tight), b, 4.5)), "the spider keeps off a long headline");
  assert.ok(spiderBox(tight).b < 152 - 4.5 && spiderBox(open).b > 152, "the headline moves her up");
  // her drop is the charm: a tight spot moves her up the web or shortens her line before it takes it
  assert.equal(open.spider.d, 8);
  assert.ok(tight.spider.d > 0, `line ${tight.spider.D}, drop ${tight.spider.d}`);
  assert.ok(clearOf(tight, longHead, 4.5));
  // with less room the web is smaller and keeps its shape: the same radials at the same angles
  const wide = [...meta, { l: 153, t: 60, r: 330, b: 74 }];
  const small = ctx.webPlan(wide, { W, top, Rmax });
  assert.ok(small && small.R < Rmax && small.R >= ctx.WEB.Rmin);
  assert.ok(clearOf(small, wide, 4.5));
  const angle = ([a, b]) => Math.atan2(b[0] - a[0], b[1] - a[1]).toFixed(6);
  assert.deepEqual(small.radials.map(angle), open.radials.map(angle));
  // no room is no web, and a mooring thread that would cross the live stamp is left off
  assert.equal(ctx.webPlan([...meta, { l: 240, t: 40, r: 400, b: 150 }], { W, top, Rmax }), null);
  const crowded = ctx.webPlan([...meta.slice(0, 1), { l: 231, t: 18, r: 388, b: 32 }, ...meta.slice(2)], { W, top, Rmax });
  assert.equal(crowded.moor.length, 0);
  // the same web every time: every draw is seeded
  assert.deepEqual(JSON.stringify(ctx.webPlan(meta, { W, top, Rmax })), JSON.stringify(ctx.webPlan(meta, { W, top, Rmax })));

  // the silk is the sky's own two inks, and dew only while the sun is up
  assert.match(html, /const silk=day\?offSky:on,ink=day\?on:offSky;/);
  assert.match(html, /dew=document\.documentElement\.getAttribute\("data-theme"\)!=="dark";/);
  assert.match(html, /if\(dew\)out\+=`<g fill="\$\{silk\}"/);
  // the spider is a black widow drawn with the kit, at ten units to the pixel and a little over
  // life size for one, with a cool edge at night
  assert.match(html, /const propSpider=\(\)=>\{/);
  assert.match(html, /spider:\{body:"#17111A",leg:"#17111A",mark:"#C9302A"/);
  assert.match(html, /inkAt\(0,0,WEB\.sp,1,inkUnit\(propSpider\(\),pal,\{s:WEB\.sp,light:\[-\.55,-1\]/);
  // her reach is her drawing's: half her span and her length, at her size
  assert.ok(Math.abs(ctx.WEB.sw - 60 * ctx.WEB.sp) < .05 && Math.abs(ctx.WEB.sl - 131 * ctx.WEB.sp) < .05);
  // the spider's planned room budgets the bounce at the bottom of her drop, the same share the drop takes
  assert.match(html, /L=D\+d\*WEB\.over\+WEB\.sl/);
  assert.match(html, /--yo:\$\{f1\(sp\.d\*WEB\.over\)\}px/);
  assert.match(html, /ro=\(sp\.D\+sp\.d\*WEB\.over\)\/sp\.D/);
  // she sways and now and then lets herself down and climbs back: transforms only, the dragline
  // reeled out on the same clock as her drop, phased off the wall clock, and still under reduced motion
  for (const k of ["webSwing", "webReel", "webDrop"]) {
    const body = html.match(new RegExp(`@keyframes ${k}\\{([^\\n]*)\\}`))[1];
    for (const prop of body.match(/[a-z-]+(?=:)/g)) assert.equal(prop, "transform", `${k} animates ${prop}`);
  }
  assert.match(html, /\.cobweb \.web-reel\{animation:webReel var\(--dd,29s\) ease-in-out infinite\}/);
  assert.match(html, /\.cobweb \.web-drop\{animation:webDrop var\(--dd,29s\) ease-in-out infinite\}/);
  assert.match(html, /const ph=p=>PRM\?"":`animation-delay:-\$\{\(Date\.now\(\)\/1000%p\)\.toFixed\(1\)\}s;`,dd=29;/);
  // the harnesses look at it: close up in the rig, and in every scene at three widths
  assert.match(rig, /spider: \["spider", \(c\) => c\.propSpider\(\)/);
  assert.match(scene, /reportWeb\(cs, PHONE_WIDTH, await webCheck\(page\)\);/);
  assert.match(scene, /the cobweb is \$\{web\.on \? "up" : "not up"\}/);
  assert.match(scene, /a thread within 3px of/);
  assert.match(scene, /a thread takes the tap/);
});

test("a pumpkin still reads as one at seven pixels, and no two are cut alike", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const kit = html.slice(html.indexOf("/* ── Storybook ink: the drawing kit"), html.indexOf("/* ── the scene: arc, sun / moon"));
  const ctx = vm.createContext({});
  vm.runInContext(`${html.match(/function mulberry\(a\)\{[\s\S]*?\}\}/)[0]}\n${kit}\nglobalThis.propPumpkin=propPumpkin;`, ctx);
  const plain = ctx.propPumpkin(10, 7, { seed: 3 }), carved = ctx.propPumpkin(10, 7, { carved: true, seed: 3 });
  // two eyes and a grin and no nose, so the face is still three marks at seven pixels, with the
  // rind's cut edge painted over the holes on the walls you can see into
  assert.equal(carved.filter((p) => p.role === "carve").length, 3);
  assert.ok(carved.findIndex((p) => p.role === "eyeRing") > carved.findLastIndex((p) => p.role === "carve"));
  assert.equal(plain.filter((p) => p.role === "carve" || p.role === "eyeRing").length, 0);
  // a woody stem cut square, with its fibres and its cut end, and a tendril of vine. None of those
  // three joins the outline, so the ink stays on the pumpkin and the stalk. The stalk is painted
  // before the body, so it comes up out of the well rather than sitting on it like a peg
  for (const role of ["body", "band", "stem", "fibre", "cut", "vine"]) assert.ok(plain.some((p) => p.role === role), role);
  assert.ok(plain.filter((p) => ["fibre", "cut", "vine"].includes(p.role)).every((p) => p.noSil));
  assert.ok(plain.findIndex((p) => p.role === "stem") < plain.findIndex((p) => p.role === "body"));
  // the seed is how it grew: the pair on the dock and the three at the barn are not stamped copies
  const drawn = [[9.6, 7.2, 3], [6.6, 4.9, 8], [9.2, 6.8, 4], [8.6, 7.4, 6], [6, 4.4, 9]];
  const body = ([w, h, seed]) => ctx.propPumpkin(w, h, { seed }).find((p) => p.role === "body").d;
  assert.equal(new Set(drawn.map(body)).size, 5);
  assert.equal(body(drawn[2]), body(drawn[2]));
  // the cuts are straight-edged polygons, so their corners and areas can be read off the path
  const poly = (d) => [...d.matchAll(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g)].map((m) => [+m[1], +m[2]]);
  const area = (E) => Math.abs(E.reduce((a, p, i) => { const q = E[(i + 1) % E.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const inside = (E, [x, y]) => {
    let hit = false;
    for (let i = 0, j = E.length - 1; i < E.length; j = i++) if ((E[i][1] > y) !== (E[j][1] > y) && x < (E[j][0] - E[i][0]) * (y - E[i][1]) / (E[j][1] - E[i][1]) + E[i][0]) hit = !hit;
    return hit || E.some((p, i) => { const q = E[(i + 1) % E.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return Math.abs((q[0] - p[0]) * (p[1] - y) - (p[0] - x) * (q[1] - p[1])) / l < .02; });
  };
  // the three that are lit are three carvings: the dock's and the pair at the barn door, each with
  // its own eyes and its own teeth
  const lit = [[9.6, 7.2, 3], [9.2, 6.8, 4], [8.6, 7.4, 6]].map(([w, h, seed]) => ({ w, h, P: ctx.propPumpkin(w, h, { carved: true, seed }) }));
  assert.equal(new Set(lit.map(({ P }) => P.find((p) => p.role === "carve").cut)).size, 3);
  assert.equal(new Set(lit.map(({ P }) => P.filter((p) => p.role === "carve")[2].cut)).size, 3);
  for (const { w, h, P } of lit) {
    const holes = P.filter((p) => p.role === "carve").map((p) => poly(p.d)), rind = P.filter((p) => p.role === "eyeRing").map((p) => poly(p.d));
    // the eyes come to a point at the top, never a flat-topped half moon, so the face looks awake
    for (const E of holes.slice(0, 2)) {
      const ys = E.map((p) => p[1]).sort((a, b) => a - b), tall = ys[ys.length - 1] - ys[0];
      assert.ok(ys[1] - ys[0] > tall * .3, "a pointed eye");
    }
    // the face carries about as much light as the first draft's did, more than a tenth of its box
    assert.ok(holes.reduce((a, E) => a + area(E), 0) > .1 * w * h, "a face that lights");
    // the rind is a thin wall inside its own hole, never a pale tab standing out of the face
    rind.forEach((R, i) => { for (const p of R) assert.ok(inside(holes[i], p), "rind inside its hole"); });
  }
  // the candle lights the rind too, so the cut wall glows with the rest of the face
  assert.match(html, /if\(lit&&p\.rindLit\)o\.eyeRing=p\.rindLit;/);
  for (const k of ["pumpkin", "lumina"]) assert.match(html, new RegExp(`\\b${k}:\\{[^}]*rindLit:"#`));
  // a mini is squat and wide under a stalk that is mostly ink: no cut face, fibres or vine to
  // fill it with light at five pixels
  for (const [w, h, seed] of [[6, 4.4, 9], [6.6, 4.9, 8]]) {
    const P = ctx.propPumpkin(w, h, { seed }), B = poly(P.find((p) => p.role === "body").d);
    const xs = B.map((p) => p[0]), ys = B.map((p) => p[1]);
    assert.ok((Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)) > 1.55, "a squat mini");
    assert.ok(P.some((p) => p.role === "stem") && !P.some((p) => ["cut", "fibre", "vine"].includes(p.role)));
  }
});

test("tide chart reads as depth over the bottom", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // height is measured up from the chart datum, never autoscaled to the window, and the scale is
  // the table's own: the gauge is said beside the boat, not drawn, so it is not on the scale
  assert.match(html, /const hiV=Math\.max\(\.\.\.vs\),base=Math\.min\(0,\.\.\.vs\);\n  const vTop=hiV\+Math\.max\(\.5,\(hiV-base\)\*\.2\);/);
  assert.match(html, /const wNow=interp\(now\.getTime\(\)\)\+\(gap\|\|0\);/);
  assert.match(html, /seaY=H-34/);
  // the old top rail with a height printed beside every extreme is gone
  assert.doesNotMatch(html, /labelRailY/);
  assert.doesNotMatch(html, /\$\{p\.v\.toFixed\(1\)\} ft/);
  // lows share one aligned row, and the skiff rocks with the chop
  assert.match(html, /lowY=H-9/);
  assert.match(html, /rockDeg=clamp\(2\.2\+g0\*\.13/);
  assert.match(html, /const tide=renderTides\(d\.tides,css,c\.wind_gusts_10m,c\.wind_speed_10m,levelFeet\(d\.water,now\)\);/);
  // the skiff rides the table's curve (Josh, September 28 2026: "I preferred the boat actually on
  // the tide line"), and when the gauge runs off the table the gap rides beside it as a tag. He
  // chose that over a mark at the real water and over the gauge's own line, so neither is drawn
  assert.match(html, /function renderTides\(preds,css,gust,wind,gap=0\)\{/);
  assert.match(html, /const nx=X\(now\.getTime\(\)\),ny=Y\(interp\(now\.getTime\(\)\)\);/);
  assert.doesNotMatch(html, /gy=Y\(wNow\)|const seen=gap|offMark|stroke-dasharray="1\.5 2\.5"/);
  // the tag is placed against the curve, not stamped: beside the bow, behind the stern, then over
  // (or under) the boat, at the first spot the tide line does not cross and off the boat
  assert.match(html, /const offBoat=c=>!\(c\.x0<nx\+21&&c\.x1>nx-25&&c\.t<ny\+6&&c\.b>ny-24\);/);
  assert.match(html, /tag=named\.find\(c=>c\.ok&&!c\.hits&&offBoat\(c\)\);/);
  assert.match(html, /cap=8\.2\*fs/);
  assert.match(html, /c\.hits=curve\.filter\(\(\[px,py\]\)=>px>c\.x0-6&&px<c\.x1\+6&&py>c\.t-6&&py<c\.b\+6\)/);
  assert.match(html, /tag=best\|\|ok\.find\(offBoat\)\|\|ok\[0\]\|\|named\[0\];/);
  assert.match(html, /if\(c\.ok&&!c\.hits&&offBoat\(c\)&&\(!best\|\|d\(c\)<d\(best\)\)\)best=c;/);
  // no spot sits higher than a high's time needs over it, or the high's time is printed on the tag
  // and the explorer's pill rises into the title, and the search reaches rows over the boat's box,
  // because at 320 past a high every row beside and under it is crossed by a flank
  assert.match(html, /c\.ok=c\.x0>=x0&&c\.x1<=W-padX&&c\.t>=12\*fs\+7&&c\.b<=seaY-4;/);
  assert.match(html, /for\(let dy=-57;dy<=27;dy\+=3\)for\(let dx=-70;dx<=70;dx\+=3\)\{/);
  const shots = await readFile(new URL("tools/shots.mjs", root), "utf8");
  assert.match(shots, /name: "91-over-the-table-at-the-high-porters-neck"/);
  assert.match(shots, /name: "93-half-over-falling-porters-neck"/);
  // the low's tick goes under the tag and the boat, and the now line runs into the boat
  assert.match(html, /\$\{ticks\}\n\s*\$\{nowY2>nowTop\+2\?/);
  assert.match(html, /let nowY2=ny-6;/);
  // and the pill rises clear of the skiff at now, which has no ring
  assert.match(html, /over:stops\.map\(s=>s\.now\?skiffTop:NaN\)/);
  assert.match(html, /const ys=\[\.\.\.D\.y\[i\],D\.over\?\.\[i\]\]\.filter\(Number\.isFinite\)/);
  assert.match(html, /const tagTxt=gap\?`\$\{gap>0\?"\+":"−"\}\$\{Math\.abs\(gap\)\} ft`:""/);
  // the tag is part of the boat for the labels, so a high steps over it rather than giving way, no
  // label is set above the chart, and the tag arrives with the skiff
  assert.match(html, /const boatTop=Math\.min\(ny-22,tagUp\?tag\.t-3:Infinity\);/);
  assert.match(html, /const onBoat=high&&lx<tagR&&lx\+lw>tagL&&y-6>boatTop;/);
  assert.match(html, /y="\$\{\(high\?Math\.max\(12\*fs,y-lift\):lowY\)\.toFixed\(1\)\}"/);
  assert.match(html, /\$\{tag\?`<g\$\{rvAt\(nx,"fade"\)\}><text/);
  assert.doesNotMatch(html, /if\(onBoat&&gap&&tm<now\.getTime\(\)\)continue;/);
  assert.doesNotMatch(html, /ny=Y\(wNow\)/);
  // the skiff's burgee flies on the real wind: limp in calm air, level by 15 mph, and the
  // gusts above the wind set its flutter; reduced motion holds the wind's angle, still
  assert.match(html, /const w0=Number\(wind\)\|\|0,flagDeg=-35\*\(1-clamp\(w0\/15,0,1\)\);/);
  assert.match(html, /const flutter=clamp\(1\.2\+\(g0-w0\)\*\.35,1\.2,6\)/);
  assert.match(html, /\$\{PRM\?`transform:rotate\(\$\{flagDeg\.toFixed\(1\)\}deg\)`/);
  // the taller skiff: a high label steps over it sooner and higher, and over its tag too (tagR is the boat's own right edge, 19px, when there is no tag)
  assert.match(html, /tagR=tagUp\?Math\.max\(nx\+19,tag\.x1\+2\):nx\+19;/);
  assert.match(html, /const lift=onBoat\?Math\.max\(9,y-boatTop\+4\):9;/);
  assert.match(html, /const chartH=w=>Math\.round\(165\+\(760-w\)\*\.09\)/);
  assert.match(html, /Ht=chartH\(W\)-18/);
  assert.match(html, /H=chartH\(W\)/);
  assert.match(html, /class="tide-explore xp" id="tideExplore"/);
  assert.match(html, /function xpSetup\(/);
  // the water's reader: at now the water that is there (wNow), and the table's everywhere else
  assert.match(html, /return\{t,depth:t===nt\?wNow:p\?p\.v:interp\(t\),turn:/);
  assert.match(html, /xpPublish\("tide",null\);\n    document\.getElementById\("tideSvg"\)\.innerHTML="";/);
});

test("light, motion and alerts stay tuned", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // clock reads the way a person says it
  assert.match(html, /const clock12=d=>/);
  assert.match(html, /clock12\(new Date\(c\.time\)\)/);
  // dusk and dark are drawn off the same clock, so they meet with no pale seam
  assert.match(html, /const darkSpans=\[\]/);
  assert.match(html, /id="goldenband"/);
  // motion scales with the wind that is actually blowing
  assert.match(html, /const rush=clamp\(1\+\(Number\(windSpd\)\|\|0\)\/11,1,4\.2\)/);
  assert.match(html, /renderSkyFx\(altDeg,c\.cloud_cover,c\.wind_direction_10m,wet,storm,c\.wind_speed_10m,c\.weather_code\)/);
  // rain is drawn from the code, not from one "it is wet" flag: a drizzle is not a downpour
  assert.match(html, /const RAIN=\{51:\[16,1\.55,\.55\]/);
  assert.match(html, /const \[count,fallSec,weight\]=snowing\?\(SNOWFALL\[code\]\|\|SNOWFALL\[73\]\):\(RAIN\[code\]\|\|RAIN\[63\]\)/);
  // and it leans the way the clouds are already going
  assert.match(html, /const lean=clamp\(\(Number\(windSpd\)\|\|0\)\*\.62,0,18\)\*\(windDir>180\?-1:1\)/);
  assert.match(html, /rf\.style\.setProperty\("--rlean"/);
  assert.match(html, /@keyframes swayTree/);
  assert.match(html, /class="deer-head"/);
  assert.match(html, /@keyframes deerGraze/);
  // the graze is two joints on one clock: the neck swings down from the withers and the
  // head tips back at the poll, so the muzzle reaches the grass instead of hanging mid-air
  assert.match(html, /@keyframes deerGraze\{0%,26%,48%,100%\{transform:none\}32%,40%\{transform:rotate\(116deg\)\}/);
  assert.match(html, /@keyframes deerNod\{0%,26%,48%,100%\{transform:none\}32%,40%\{transform:rotate\(-56deg\)\}/);
  assert.match(html, /\.deer-nod\{animation:deerNod 48s/);
  assert.match(html, /deerGraze 48s/);
  assert.match(html, /@keyframes flagFlick/);
  assert.doesNotMatch(html, /class="buck-regard"|class="buck-threeq"/);
  assert.doesNotMatch(html, /@keyframes buckTurn/);
  // hind leg: a gentle S, stifle then hock — not a lightning bolt
  assert.match(html, /pTaper\(\[\[-16\.8,-30,7\.6\],\[-16\.4,-23\.4,4\.6\],\[-18\.4,-17\.4,3\],\[-19\.4,-13\.4,2\.4\]/);
  assert.doesNotMatch(html, /M 5\.0 11\.6 L 6\.2 14\.8 L 4\.0 17\.6/);
  // the rack: a main beam sweeping forward with tines rising off it
  assert.match(html, /pTaper\(\[\[24,-57\.6,2\],\[22\.8,-61\.6,1\.8\],\[23\.6,-65\.6,1\.6\]/);
  // mule deer stands: ear and tail only. The graze clock hid the ears and read as a rodent.
  assert.match(html, /class="mule-head"/);
  assert.match(html, /!dark&&!deerOut&&!storm\?magpieAt/);
  assert.match(html, /:\(!wet&&!storm\)\?chickens/);
  assert.match(html, /:storm\?"":oysterCatcher/);
  // The raccoon now forages on a real bank rise: the reaching paw stays fully above
  // the water, with solid ground beneath it. The old foot ring falsely read as wading.
  assert.match(html, /const raccoonY=base-6;/);
  assert.match(html, /data-prop="raccoon-bank"/);
  assert.match(html, /\$\{raccoonBank\}\$\{marshResident\}/);
  assert.doesNotMatch(html, /ringAt\(residentX/);
  assert.match(html, /raccoon\(residentX,raccoonY,\.95,1\)/);
  assert.doesNotMatch(html, /raccoon\(residentX,base\+7/);
  assert.match(html, /@keyframes perchHop/);
  assert.match(html, /@keyframes groundHop/);
  assert.match(html, /@keyframes cormSettle/);
  assert.match(html, /class="corm-neck"/);
  assert.match(html, /if\(wind<8\)waterWeather\+=ringAt/);
  // Lightning. One clock for the bolts and the sky wash, or they drift apart the way a
  // 37s bolt and a 7s wash did: the sky lit with nothing under it and the bolt struck
  // into a dark sky, and neither half was ever seen with the other.
  assert.match(html, /const STORM_P=19/);
  assert.match(html, /animation:stormWash 19s linear infinite/);
  assert.match(html, /animation:bolt 19s linear infinite/);
  assert.doesNotMatch(html, /stormWash 7s/);
  assert.doesNotMatch(html, /var\(--bd,37s\)/);
  // and it is a sky effect, not a scene one: inside the scene SVG it could only start a
  // third of the way down the page, which is a bolt coming out of clear air
  assert.match(html, /function paintBolts\(\)/);
  assert.match(html, /<g id="boltLayer"><\/g>/);
  assert.doesNotMatch(html, /boltAt\(/);
  // it takes three readings, not just the grid cell's own code at the moment you look
  assert.match(html, /THUNDER=storm\?2/);
  assert.match(html, /\(h\?\.code\|\|\[\]\)\.slice\(0,3\)\.some\(isTS\)/);
  assert.match(html, /thunderstorm\\s\+warning/i);
  // an alert opens to the gist instead of only shouting its title
  assert.match(html, /function alertGist\(a\)/);
  assert.match(html, /function toggleAlert\(\)/);
  assert.match(html, /class="alert-body"/);
  // the card is the night and its moon; the golden hour is the hourly chart's note
  assert.match(html, /<h3>Tonight<\/h3>/);
  assert.doesNotMatch(html, />Tonight into tomorrow</);
  assert.match(html, /class="gold-key">golden hour</);
  assert.match(html, /\.gold-key\{/);
  assert.doesNotMatch(html, /Golden Hour is /);
  assert.doesNotMatch(html, /Tomorrow morning's Golden Hour runs /);
  // the water is named for where every reading under it comes from, all year; the farm's wave is
  // the almanac's, and says so; the week is this week; the year names the airport its normals are
  // from. The parked trip has no card of its own
  assert.match(html, /<b>Water · Wrightsville Beach<\/b>/);
  assert.doesNotMatch(html, /On the water · Mason Inlet|Tide · Wrightsville Beach|<b>The week<\/b>/);
  assert.match(html, /<b>This week<\/b>/);
  assert.match(html, />Almanac fishing times<span class="sr-only">/);
  assert.doesNotMatch(html, /fish bite · by the moon|outTitle/);
  assert.match(html, /\{title:"Piddling",\.\.\.farm\.say\}/);
});


test("expired alerts disappear and the strongest active warning owns the outdoor card", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const code = html.slice(html.indexOf("function activeAlerts("), html.indexOf("function renderAlerts("));
  const ctx = vm.createContext({});
  vm.runInContext(code, ctx);
  const now = Date.parse("2026-09-13T15:00:00Z");
  const warning = (event, severity, expires) => ({event,severity,expires});
  const expired = warning("Severe Thunderstorm Warning","Severe","2026-09-13T14:59:00Z");
  const watch = warning("Tornado Watch","Extreme","2026-09-13T16:00:00Z");
  const thunder = warning("Severe Thunderstorm Warning","Severe","2026-09-13T16:00:00Z");
  const tornado = warning("Tornado Warning","Extreme","2026-09-13T16:00:00Z");
  const active = ctx.activeAlerts([expired,watch,thunder,tornado],now);
  assert.equal(active.length,3);
  assert.equal(ctx.outdoorWarning(active),tornado);
  assert.equal(ctx.outdoorWarning([watch]),null);
  assert.equal(ctx.activeAlerts([{...thunder,ends:"2026-09-13T15:00:00Z"}],now).length,0,
    "an alert that has ended stays ended even if its message expires later");
  assert.equal(ctx.activeAlerts([{event:"Alert without a stated end"}],now).length,1);
});

test("the water and the farm say what is there, and nothing is scored or picked", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  // the bite windows are the moon's; here they are fixed, so each window's own gating is what is tested
  const bite = [{ start: new Date("2026-08-02T15:30"), end: new Date("2026-08-02T17:30") },
    { start: new Date("2026-08-02T21:30"), end: new Date("2026-08-02T22:30") }];
  const ctx = vm.createContext({ solunarWindows: () => bite });
  const start = html.indexOf('const known=v=>v!=null&&v!==""'), end = html.indexOf("function dayStory(");
  assert.ok(start > 0 && end > start, "the water and the farm are one block");
  vm.runInContext([
    lift(/const LOCS=\{[\s\S]*?\n\};/),
    lift(/const mdOf=[^\n]*\nconst inSeason=[^\n]*/),
    lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
    lift(/const hh=t=>\{[^\n]*\};/),
    lift(/const clock=d=>\{[^\n]*\};/),
    lift(/const spanTxt=\(a,b\)=>\{[^\n]*\n[^\n]*\};/),
    lift(/const spokenAt=t=>[^\n]*;/),
    lift(/const sentence=s=>[^\n]*;/),
    html.slice(start, end),
    html.slice(html.indexOf("const NORMALS={"), html.indexOf("function renderYear(")),
    lift(/const moonName=m=>\{[\s\S]*?\};/),
    "Object.assign(globalThis,{coveredHours,waterGrade,waterTemp,levelGap,levelFeet,waterCard,waterNote,fishLine,fishWindows,farmCard,LOCS,NORMALS,yearCompare,doyOf,moonName});",
  ].join("\n"), ctx);
  // what the context returns is made again on this side, so deepEqual compares values, not realms
  const own = (r) => r == null || typeof r !== "object" ? r : JSON.parse(JSON.stringify(r));
  const W = Object.fromEntries(["coveredHours", "waterGrade", "waterTemp", "levelGap", "levelFeet", "waterCard", "waterNote", "fishLine", "farmCard", "yearCompare", "moonName"].map((k) => [k, (...a) => own(ctx[k](...a))]));
  const p = (v) => String(v).padStart(2, "0");
  const key = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
  // a run of hours from `from`, each reading a constant or a function of (index, hour)
  const run = (from, o = {}, n = 24) => {
    const t0 = new Date(from).getTime(), time = Array.from({ length: n }, (_, i) => key(new Date(t0 + i * 3.6e6)));
    const f = (k, v) => time.map((t, i) => typeof o[k] === "function" ? o[k](i, +t.slice(11, 13)) : k in o ? o[k] : v);
    return { time, gust: f("gust", 12), pop: f("pop", 5), code: f("code", 1), temp: f("temp", 75), feels: f("feels", 75) };
  };
  const aug = { time: ["2026-08-02", "2026-08-03"], sunrise: ["2026-08-02T06:30", "2026-08-03T06:31"], sunset: ["2026-08-02T20:10", "2026-08-03T20:09"] };
  const dec = { time: ["2026-12-12", "2026-12-13"], sunrise: ["2026-12-12T07:10", "2026-12-13T07:11"], sunset: ["2026-12-12T17:04", "2026-12-13T17:04"] };
  const at = (s) => new Date(s);

  // The hours a sentence speaks for are the daylight left today, from the hour now is in, each hour
  // inside sunrise-30 to sunset+30, and tomorrow's once today's has gone.
  const noon = W.coveredHours(run("2026-08-02T13:00"), aug, at("2026-08-02T13:20"));
  assert.deepEqual([noon.hrs, noon.isToday, noon.now, noon.day], [[0, 1, 2, 3, 4, 5, 6], true, true, "2026-08-02"]);
  const night = W.coveredHours(run("2026-08-02T21:00"), aug, at("2026-08-02T21:10"));
  assert.deepEqual([night.hrs[0], night.hrs.length, night.isToday, night.now, night.day], [10, 13, false, false, "2026-08-03"], "after dark it is tomorrow's 7a to 7p");
  assert.equal(W.coveredHours(run("2026-12-12T15:00"), dec, at("2026-12-12T15:20")).hrs.length, 2, "a December afternoon has two hours of light left after three");
  assert.equal(W.coveredHours(run("2026-12-12T17:00"), dec, at("2026-12-12T17:10")).isToday, false);
  assert.equal(W.coveredHours(run("2026-08-02T09:00"), aug, at("2026-08-02T13:40")).hrs[0], 4, "a cache opened late starts at the hour now is in");
  assert.deepEqual(W.coveredHours(run("2026-08-02T05:00"), undefined, at("2026-08-02T05:10")).hrs, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], "without sunrise and sunset, 7a to 8p");
  // a live run holds the whole of the day it speaks for, and a cache opened after dark does not
  assert.equal(night.whole, true);
  assert.equal(W.coveredHours(run("2026-08-02T14:00"), aug, at("2026-08-02T20:45")).whole, false, "saved at two, it stops at one tomorrow");

  // one hour on the water: the boat's thresholds, and the wind named first on the same step
  assert.deepEqual(["21,2", "22,2", "30,2", "12,3", "12,5", "24,5", "31,3"].map((s) => W.waterGrade(...s.split(",").map(Number))),
    ["easy", "choppy", "windy", "outside", "rough", "rough", "windy"]);

  // the water temperature is the station's, under an hour old, and never a model's
  const now = at("2026-08-02T13:20");
  assert.equal(W.waterTemp({ temp: { t: "2026-08-02 13:12", v: "76.8" } }, now), 77);
  assert.equal(W.waterTemp({ temp: { t: "2026-08-02 12:12", v: "76.8" } }, now), null, "an hour and more old is not said");
  assert.equal(W.waterTemp({ temp: { t: "2026-08-02 13:12", v: "" } }, now), null);
  assert.equal(W.waterTemp(null, now), null);

  // the gauge against the table, over its last half hour, to the half foot from half a foot
  const gauge = (off, o = {}) => { const n = o.n ?? 11, marks = Array.from({ length: n }, (_, i) => new Date(now.getTime() - (o.age ?? 8) * 6e4 - (n - 1 - i) * 36e4));
    const st = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    return { level: marks.map((d) => ({ t: st(d), v: String(2 + off) })), pred: o.noPred ? [] : marks.map((d) => ({ t: st(d), v: "2" })) }; };
  assert.equal(W.levelGap(gauge(1.97), now), "Running 2 ft above the tide table.", "September 27 2026");
  assert.equal(W.levelGap(gauge(.6), now), "Running half a foot above the tide table.");
  assert.equal(W.levelGap(gauge(-1.3), now), "Running 1.5 ft below the tide table.");
  assert.equal(W.levelGap(gauge(.4), now), null, "the table is close enough");
  assert.equal(W.levelGap(gauge(2, { age: 40 }), now), null, "a gauge half an hour old is not the water now");
  assert.equal(W.levelGap(gauge(2, { n: 2 }), now), null, "two readings are too thin");
  assert.equal(W.levelGap(gauge(2, { noPred: true }), now), null, "no table to read it against");
  assert.equal(W.levelGap(gauge(7), now), null, "six feet off is the sensor");
  // and the same gap as a number, for the skiff to float at, signed and to the half foot
  assert.deepEqual([1.97, .6, -1.3, .4, 7].map((g) => W.levelFeet(gauge(g), now)), [2, .5, -1.5, null, null]);
  assert.deepEqual([W.levelFeet(gauge(-1.25), now), W.levelGap(gauge(-1.25), now)], [-1.5, "Running 1.5 ft below the tide table."], "a tie rounds the same on the chart and in the sentence");
  assert.equal(W.levelFeet(gauge(2, { age: 40 }), now), null);

  // Off season (and the boat season is off until Josh says) nothing is graded or coloured: the seas
  // are the hour now is in, the water is the station's, and whatever the wind does is the chip's.
  assert.equal(ctx.LOCS.mb.boatSeason, null);
  const mt = (w, from = "2026-08-02T00:00") => { const r = run(from, {}, 48); return { time: r.time, wave: r.time.map((_, i) => typeof w === "function" ? w(i) : w) }; };
  const water = { temp: { t: "2026-08-02 13:12", v: "76.8" } }, c = { weather_code: 1, apparent_temperature: 75 };
  const off = W.waterCard(ctx.LOCS.mb, run("2026-08-02T13:00", { gust: 40 }), c, aug, mt(2.4), { ...water, ...gauge(1.97) }, null, true, now);
  assert.deepEqual(off, { say: null, level: "Running 2 ft above the tide table.",
    line: [{ label: "seas about", value: "2 ft", cls: "" }, { label: "water", value: "77°", cls: "" }] });
  assert.equal(W.waterCard(ctx.LOCS.mb, run("2026-08-02T13:00"), c, aug, mt(.3), null, null, false, now).line[0].value, "under 1 ft");
  assert.equal(W.waterCard(ctx.LOCS.mb, run("2026-08-02T13:00"), c, aug, mt((i) => i === 13 ? 3.6 : 1), null, null, false, now).line[0].value, "4 ft", "the hour now is in");
  assert.equal(W.waterCard(ctx.LOCS.mb, run("2026-08-02T13:00"), c, aug, { wave_height_max: 2.4 }, null, null, false, now).line, null, "an old cache's seas are not borrowed");

  // the note beside the water's title is the water temperature and the seas; without them the turn
  assert.equal(W.waterNote(off, null), "77° · seas ~2 ft");
  assert.equal(W.waterNote({ line: [{ label: "seas", value: "under 1 ft" }] }, null), "seas under 1 ft");
  assert.equal(W.waterNote({ line: [{ label: "gusts to", value: 24 }, { label: "seas", value: "unavailable" }, { label: "water", value: "61°" }] }, null), "61° · seas unavailable", "the gust is the chip's");
  assert.equal(W.waterNote(null, { rising: true, note: "high 8:28p" }), "rising · high 8:28p");
  assert.equal(W.waterNote(null, null), "");
  // With the season switched on, the boat's sentence speaks for the rest of today's daylight.
  const boat = { ...ctx.LOCS.mb, boatSeason: ["03-15", "10-31"] };
  const card = (o = {}, x = {}) => W.waterCard(boat, run(x.from || "2026-08-02T13:00", o), { ...c, ...x.c }, aug,
    "marine" in x ? x.marine : mt(x.seas ?? 2.4), water, x.warning || null, !!x.storm, at(x.now || "2026-08-02T13:20"), x.told || null);
  const say = (o, x) => { const s = card(o, x).say; return s && [s.text, s.cls]; };
  assert.deepEqual(say(), ["Easy out there.", "go"]);
  assert.deepEqual(card().line, [{ label: "gusts to", value: 12, cls: "" }, { label: "seas about", value: "2 ft", cls: "" }, { label: "water", value: "77°", cls: "" }]);
  assert.deepEqual(say({ gust: 24 }), ["Choppy. Stick to the ICW.", "caution"]);
  assert.equal(card({ gust: 24 }).line[0].cls, "caution", "the reading that is the reason wears its colour");
  assert.deepEqual(say({ gust: 31 }), ["Too windy for the boat.", "no"]);
  assert.equal(card({ gust: 31 }).line[0].cls, "no");
  assert.deepEqual(say({}, { seas: 3.4 }), ["Rough outside. Stick to the ICW.", "caution"]);
  assert.deepEqual(say({}, { seas: 2.6 }), ["Rough outside. Stick to the ICW.", "caution"], "graded on the foot that is printed");
  assert.deepEqual(say({}, { seas: 5.2 }), ["Too rough for the boat.", "no"]);
  assert.equal(card({ gust: 21.6 }).line[0].value, 22);
  assert.deepEqual(say({ gust: 21.6 }), ["Choppy. Stick to the ICW.", "caution"], "the gust that is printed is the gust that is graded");
  // a day that changes: worse first is said with the hour it lays down, once two better hours follow
  assert.deepEqual(say({ gust: (i) => i < 3 ? 25 : 12 }), ["Choppy until about 4 p.m., then easy.", "caution"]);
  assert.deepEqual(say({ gust: (i) => i < 2 ? 31 : i < 5 ? 24 : 12 }), ["Too windy until about 3 p.m., then choppy.", "caution"]);
  assert.deepEqual(say({ gust: (i) => i < 6 ? 25 : 12 }), ["Choppy. Stick to the ICW.", "caution"], "one better hour at the end is not a change");
  // better first is said with the hour it comes up, and the hour it lays down again when it does
  assert.deepEqual(say({ gust: (i) => i < 2 ? 12 : 25 }), ["Easy until about 3 p.m., then choppy.", "caution"]);
  assert.deepEqual(say({ gust: (i) => i < 2 || i > 3 ? 12 : 25 }), ["Easy until about 3 p.m., then choppy until about 5 p.m.", "caution"]);
  assert.deepEqual(say({ gust: (i) => i < 1 ? 12 : i < 3 ? 24 : 31 }), ["Choppy until about 4 p.m., then too windy.", "caution"], "the worse of what comes first");
  // a day that changes is amber, and each reading wears the colour of its own step
  const turns = card({ gust: (i) => i < 2 ? 31 : 12 });
  assert.deepEqual([turns.say.cls, turns.line[0].value, turns.line[0].cls], ["caution", 31, "no"]);
  // after dark it is tomorrow's, and tomorrow is always said
  const late = { from: "2026-08-02T21:00", now: "2026-08-02T21:10" };
  assert.deepEqual(say({}, late), ["Easy out there tomorrow.", "go"]);
  // green only on a whole day: a cache opened after dark knows tomorrow's morning, not its afternoon
  assert.equal(card({}, { from: "2026-08-02T14:00", now: "2026-08-02T20:45" }).say, null);
  // a warning or a storm tonight is tonight's: the line is the water now, not tomorrow's daylight
  const warnedNight = card({ gust: (i) => i < 3 ? 40 : 12 }, { ...late, warning: { event: "Tropical Storm Warning" } });
  assert.deepEqual([warnedNight.say.text, warnedNight.line.map((x) => x.label)], ["Stay off the water.", ["seas about"]], "and a thermometer eight hours old is not said");
  const stormNight = card({ gust: (i) => i < 3 ? 40 : 12 }, { ...late, storm: true });
  assert.deepEqual([stormNight.say, stormNight.line.map((x) => x.label)], [null, ["seas about"]]);
  assert.deepEqual(say({ gust: 24 }, late), ["Choppy tomorrow. Stick to the ICW.", "caution"]);
  assert.deepEqual(say({ gust: (i) => i < 13 ? 25 : 12 }, late), ["Choppy until about 10 a.m. tomorrow, then easy.", "caution"]);
  assert.deepEqual(say({ gust: 12 }, { ...late, seas: 6 }), ["Too rough for the boat tomorrow.", "no"]);
  // the season is judged on the day the sentence speaks for: on October 31 after dark it is November's
  assert.equal(card({}, { from: "2026-10-31T21:00", now: "2026-10-31T21:10", marine: mt(2.4, "2026-10-31T00:00") }).say, null);
  // a warning, thunder, ice and snow come first
  assert.deepEqual(say({}, { warning: { event: "Severe Thunderstorm Warning" } }), ["Stay off the water.", "no"]);
  assert.deepEqual(say({ code: (i) => i === 0 ? 95 : 1 }), ["Thunder nearby. Stay off the water.", "no"]);
  assert.deepEqual(say({ code: (i) => i === 3 ? 95 : 1, pop: (i) => i === 3 ? 50 : 5 }), ["Thunder possible around 4 p.m. Be in early.", "caution"]);
  assert.deepEqual(say({ code: (i) => i === 3 ? 95 : 1, pop: (i) => i === 3 ? 80 : 5 }), ["Thunder likely around 4 p.m. Be in early.", "caution"]);
  assert.deepEqual(say({ code: (i) => i === 1 ? 95 : 1 }), ["Thunder possible around 2 p.m.", "no"], "no two decent hours before it");
  assert.deepEqual(say({ code: (i) => i === 3 ? 95 : 1, gust: 31 }), ["Too windy for the boat. Thunder possible around 4 p.m.", "no"], "hours too windy to be out in are the answer");
  assert.deepEqual(say({ code: (i) => i === 3 ? 95 : 1 }, { marine: null }), ["Thunder possible around 4 p.m.", "no"], "nor are hours with no seas reading");
  // the headline has named the hour, so only what to do is said
  const toldTS = { told: [{ kind: "Thunder", time: "2026-08-02T16:00" }] };
  assert.deepEqual(say({ code: (i) => i === 3 ? 95 : 1 }, toldTS), ["Be in before the thunder.", "caution"]);
  assert.deepEqual(say({ code: (i) => i === 3 ? 95 : 1, gust: 31 }, toldTS), ["Too windy for the boat.", "no"]);
  assert.deepEqual(say({ code: (i) => i === 0 ? 95 : 1 }, { told: [{ kind: "Thunder", time: "2026-08-02T13:00" }] }), ["Stay off the water.", "no"], "the headline has said thunder nearby");
  assert.deepEqual(say({ code: (i) => i === 10 ? 95 : 1 }, { ...late, told: [{ kind: "Thunder", time: "2026-08-03T07:00" }] }), ["Stay off the water tomorrow.", "no"], "and tomorrow is always said");
  assert.deepEqual(say({ code: (i) => i === 17 ? 95 : 1 }, { ...late, told: [{ kind: "Thunder", time: "2026-08-03T14:00" }] }), ["Be in before the thunder tomorrow.", "caution"]);
  // a gale before the thunder is the answer, and nobody is invited out across it
  assert.deepEqual(say({ gust: (i) => i === 1 ? 31 : 12, code: (i) => i === 4 ? 95 : 1 }), ["Too windy for the boat. Thunder possible around 5 p.m.", "no"]);
  assert.deepEqual(say({ gust: (i) => i === 1 ? 31 : 12, code: (i) => i === 4 ? 95 : 1 }, { told: [{ kind: "Thunder", time: "2026-08-02T17:00" }] }), ["Too windy for the boat.", "no"]);
  assert.deepEqual(say({ code: (i) => i === 2 ? 66 : 1, pop: 50 }), ["Stay off the water.", "no"]);
  assert.deepEqual(say({ code: 73, pop: 50 }, late), ["Stay off the water tomorrow.", "no"]);
  assert.deepEqual(say({}, { c: { weather_code: 75 } }), ["Stay off the water.", "no"], "snow falling now");
  // a storm overhead is the headline's, and the line still says the water
  const storm = card({ gust: 34 }, { storm: true });
  assert.deepEqual([storm.say, storm.line[0].value, storm.line[0].cls], [null, 34, "no"]);
  // an unknown is never green, and the sentence says it once, not the line as well
  const noSeas = card({}, { marine: null });
  assert.deepEqual([noSeas.say.text, noSeas.say.cls, noSeas.line.map((x) => x.label)], ["Seas unavailable.", "caution", ["gusts to", "water"]]);
  const windyNoSeas = card({ gust: 31 }, { marine: null });
  assert.deepEqual([windyNoSeas.say.text, windyNoSeas.line[1].value, windyNoSeas.line[1].cls], ["Too windy for the boat.", "unavailable", "caution"], "wind strong enough decides on its own");
  assert.deepEqual(say({ gust: null }), ["Gusts unavailable.", "caution"]);
  assert.deepEqual(say({ gust: null }, { seas: 5 }), ["Too rough for the boat.", "no"]);
  const blind = card({ gust: null }, { marine: null });
  assert.deepEqual([blind.say.text, blind.line.map((x) => x.label)], ["Gusts and seas unavailable.", ["water"]]);
  assert.deepEqual(say({ gust: (i) => i === 1 ? 12 : null }), ["Easy out there.", "go"], "one known hour is a reading");
  assert.deepEqual(say({ pop: null }), ["Easy out there. Rain odds unavailable.", "caution"], "no odds is never dry");
  assert.deepEqual(say({ pop: 60 }), ["Easy out there, but wet at times.", "caution"]);
  assert.deepEqual(say({ feels: 45 }), ["Easy out there, but cold.", "caution"]);
  assert.deepEqual(say({ feels: (i) => i ? 64 : 44 }), ["Easy out there.", "go"], "a chilly start does not turn a mild afternoon amber");

  // The bite windows are dropped one by one on their own hours, never all at once.
  const fishRun = (o) => run("2026-08-02T13:00", o);
  assert.equal(W.fishLine(fishRun(), now), "3:30–5:30p · 9:30–10:30p");
  assert.equal(W.fishLine(fishRun({ code: (i, hr) => hr === 16 ? 95 : 1 }), now), "9:30–10:30p", "thunder at four takes the 3:30 window only");
  assert.equal(W.fishLine(fishRun({ gust: (i, hr) => hr === 22 ? 31 : 12 }), now), "3:30–5:30p");
  assert.equal(W.fishLine(fishRun({ code: (i, hr) => hr === 17 ? 66 : 1 }), now), "9:30–10:30p");
  assert.equal(W.fishLine(fishRun({ gust: (i, hr) => hr === 15 ? null : 12 }), now), "9:30–10:30p", "a gust the run does not carry is not calm");
  for (const missing of [null, undefined, "", NaN])
    assert.equal(W.fishLine(fishRun({ code: (i, hr) => hr === 16 ? missing : 1 }), now), "9:30–10:30p", "an unknown weather code never earns a fishing window");
  const extraFishHour = (time, overrides = {}) => {
    const h = fishRun();
    for (const [key, values] of Object.entries(h))
      values.push(key === "time" ? time : Object.hasOwn(overrides, key) ? overrides[key] : values[4]);
    return h;
  };
  for (const time of ["2026-08-02T16:00", "2026-08-02T17:00", "2026-08-02T17:15"]) {
    for (const hazard of [{ code: 95 }, { code: 66 }, { gust: 31 }])
      assert.equal(W.fishLine(extraFishHour(time, hazard), now), "9:30–10:30p", "a duplicate or partially overlapping hazard cannot hide behind a clear row");
    for (const key of ["code", "gust"])
      for (const missing of [null, undefined, "", NaN])
        assert.equal(W.fishLine(extraFishHour(time, { [key]: missing }), now), "9:30–10:30p", "every overlapping row needs its own known code and gust");
    assert.equal(W.fishLine(extraFishHour(time), now), "3:30–5:30p · 9:30–10:30p", "known calm duplicates and partial overlaps retain a fully covered window");
  }
  assert.equal(W.fishLine(extraFishHour("2026-08-02T15:00", { code: 95 }), at("2026-08-02T16:10")), "now–5:30p · 9:30–10:30p", "an overlapping hazard entirely in the past does not remove the remaining clear window");
  const gap = fishRun();
  for (const values of Object.values(gap)) values.splice(3, 1); // the whole 4 p.m. row is absent
  assert.equal(W.fishLine(gap, now), "9:30–10:30p", "a missing hour inside a window is not clear weather");
  assert.equal(W.fishLine(run("2026-08-02T16:00"), now), "9:30–10:30p", "the run must cover the beginning of a future window");
  assert.equal(W.fishLine(run("2026-08-02T16:00"), at("2026-08-02T16:10")), "now–5:30p · 9:30–10:30p", "an underway window needs coverage from now, not a spent hour");
  assert.equal(W.fishLine(fishRun(), at("2026-08-02T17:30")), "9:30–10:30p", "the window ends at its published end, exclusively");
  assert.equal(W.fishLine(run("2026-08-02T13:00", {}, 9), now), "3:30–5:30p", "a window past the end of the run is not known");
  assert.equal(W.fishLine(fishRun(), at("2026-08-02T16:10")), "now–5:30p · 9:30–10:30p");
  assert.equal(W.fishLine(fishRun({ gust: 31 }), now), null);

  // The farm makes no call and is never green. An ordinary day is the bite line and nothing else.
  const farm = (o = {}, x = {}) => W.farmCard(ctx.LOCS.sp, run(x.from || "2026-08-02T13:00", o), { ...c, ...x.c }, x.dy || aug,
    x.warning || null, !!x.storm, at(x.now || "2026-08-02T13:20"), x.told || null);
  const fsay = (o, x) => { const f = farm(o, x); return [f.say && f.say.text, f.say && f.say.cls, f.fish]; };
  assert.deepEqual(fsay(), [null, null, "3:30–5:30p · 9:30–10:30p"]);
  assert.deepEqual(fsay({}, { storm: true }), [null, null, null], "a storm overhead is the headline's");
  assert.deepEqual(fsay({}, { warning: { event: "Severe Thunderstorm Warning" } }), ["Chores can wait.", "no", null]);
  assert.deepEqual(fsay({}, { warning: { event: "Winter Storm Warning" } }), ["Feed early and keep a path open.", "no", null]);
  assert.deepEqual(fsay({ code: 66, pop: 60 }, { warning: { event: "Ice Storm Warning" } }), ["Stay off the hill until it turns over.", "no", null]);
  assert.deepEqual(fsay({ code: (i) => i === 0 ? 95 : 1 }), ["Thunder nearby.", "no", null]);
  // freezing rain and snow are named with their hour, because the headline names only its first
  // wet stretch: a shower at two hid the freezing rain at five
  assert.deepEqual(fsay({ code: (i) => i === 2 ? 66 : 1, pop: 50, gust: 31 }), ["Freezing rain possible around 3 p.m. Stay off the hill until it turns over.", "no", null], "ice outranks wind");
  assert.deepEqual(fsay({ code: (i) => i === 4 ? 66 : 80, pop: (i) => i === 0 || i === 4 ? 50 : 5 })[0], "Freezing rain possible around 5 p.m. Stay off the hill until it turns over.");
  assert.deepEqual(fsay({ code: 66, pop: 80 })[0], "Freezing rain likely any time now. Stay off the hill until it turns over.");
  assert.deepEqual(fsay({ code: 66, pop: 50 }, { c: { weather_code: 66 } })[0], "Stay off the hill until it turns over.", "falling now, the headline's first sentence has it");
  assert.deepEqual(fsay({ code: (i) => i === 2 ? 66 : 1, pop: 50 }, { told: [{ kind: "Freezing rain", time: "2026-08-02T15:00" }] })[0], "Stay off the hill until it turns over.", "named by the headline");
  assert.deepEqual(fsay({ code: (i) => i === 14 ? 66 : 1, pop: 50 }, late), ["Freezing rain possible around 11 a.m. tomorrow. Stay off the hill until it turns over.", "no", null]);
  // a gale now is said with the hour it lays down, a gale from next hour is still to come, and a
  // gale with thunder behind it says the thunder too, with no clock that sends anyone out into it
  assert.deepEqual(fsay({ gust: (i) => i < 3 ? 31 : 12 }), ["Too windy until about 4 p.m. Chores can wait.", "no", null]);
  assert.deepEqual(fsay({ gust: 31 }), ["Too windy. Chores can wait.", "no", null]);
  assert.deepEqual(fsay({ gust: (i) => i === 1 ? 31 : 12 }), ["Too windy from about 2 p.m. Get the chores done early.", "caution", "3:30–5:30p · 9:30–10:30p"], "calm now is not too windy now");
  assert.deepEqual(fsay({ gust: (i) => i === 0 ? 32 : 16, code: (i) => i === 1 ? 95 : 1 }), ["Too windy. Thunder possible around 2 p.m. Chores can wait.", "no", null]);
  assert.deepEqual(fsay({ code: (i, hr) => hr === 16 ? 95 : 1 }), ["Thunder possible around 4 p.m. Piddle before then.", "caution", "9:30–10:30p"], "the bite window in the thunder goes, the evening one stays");
  assert.deepEqual(fsay({ code: (i, hr) => hr === 16 ? 95 : 1 }, { told: [{ kind: "Thunder", time: "2026-08-02T16:00" }] })[0], "Piddle before the thunder.", "the headline has named the hour");
  assert.deepEqual(fsay({ gust: (i) => i >= 1 && i <= 2 ? 33 : 12, code: (i) => i === 3 ? 95 : 1 }),
    ["Too windy from about 2 p.m. Thunder possible around 4 p.m. Chores can wait.", "no", null], "a gale before the thunder is said, and nobody piddles through it");
  assert.deepEqual(fsay({ pop: (i) => i < 3 ? 80 : 5, code: (i) => i === 3 ? 95 : 1 }), ["Thunder possible around 4 p.m. Slip out between the showers.", "caution", "9:30–10:30p"], "rain before the thunder is not a clear stretch");
  assert.deepEqual(fsay({ code: (i) => i === 3 ? 95 : 1 }, { c: { weather_code: 63 } })[0], "Thunder possible around 4 p.m. Slip out between the showers.", "raining now");
  assert.deepEqual(fsay({ code: (i) => i === 3 ? 95 : 1, gust: (i) => i === 1 ? null : 12 })[0], "Thunder possible around 4 p.m.", "a gust the run does not carry is not a clear hour");
  // thunder the headline has named for another hour is not this one: tonight's is not tomorrow's
  assert.deepEqual(fsay({ code: (i) => i === 1 || i === 18 ? 95 : 1 }, { ...late, told: [{ kind: "Thunder", time: "2026-08-02T22:00" }] })[0],
    "Thunder possible around 3 p.m. tomorrow. Piddle before then.");
  assert.deepEqual(fsay({ code: (i) => i === 0 ? 95 : 1 }, { told: [{ kind: "Thunder", time: "2026-08-02T13:00" }] }), ["Chores can wait.", "no", null], "the headline has said thunder nearby");
  assert.deepEqual(fsay({ code: (i) => i === 1 ? 95 : 1 }), ["Thunder possible around 2 p.m.", "no", null]);
  assert.deepEqual(fsay({ code: (i) => i === 1 ? 95 : 1 }, { told: [{ kind: "Thunder", time: "2026-08-02T14:00" }] }), ["Chores can wait.", "no", null]);
  // After dark the card speaks for tomorrow. What the headline has named goes unsaid, and what to do
  // carries the day, so it never reads as tonight's
  assert.deepEqual(fsay({ code: (i) => i === 10 ? 95 : 1 }, { ...late, told: [{ kind: "Thunder", time: "2026-08-03T07:00" }] })[0], "Chores can wait tomorrow.");
  assert.deepEqual(fsay({ code: (i) => i === 17 ? 95 : 1 }, { ...late, told: [{ kind: "Thunder", time: "2026-08-03T14:00" }] }), ["Piddle before the thunder tomorrow.", "caution", "9:30–10:30p"]);
  assert.deepEqual(fsay({ gust: (i) => i === 14 ? 31 : 12 }, { ...late, told: [{ kind: "Windy", time: "2026-08-03T11:00" }] })[0], "Get the chores done early tomorrow.");
  assert.deepEqual(fsay({ code: 73, pop: 80 }, { ...late, told: [{ kind: "Snow", time: "2026-08-03T07:00" }] })[0], "Feed early tomorrow and keep a path open.");
  assert.deepEqual(fsay({ code: 66, pop: 80 }, { ...late, told: [{ kind: "Freezing rain", time: "2026-08-03T07:00" }] })[0], "Stay off the hill tomorrow until it turns over.");
  assert.deepEqual(fsay({ pop: (i) => i >= 10 && i <= 12 ? 80 : 5 }, { ...late, told: [{ kind: "Rain", time: "2026-08-03T07:00" }] })[0], "Slip out between the showers tomorrow.");
  assert.deepEqual(fsay({ pop: (i) => i >= 10 && i <= 12 ? 80 : 5 }, late)[0], "Rain likely tomorrow. Slip out between the showers.");
  // tonight's 2 a.m. snow, which the headline names as tonight's, is not tomorrow's 10 a.m. snow
  assert.deepEqual(fsay({ code: (i) => i === 5 || i === 13 ? 73 : 1, pop: (i) => i === 5 ? 50 : i === 13 ? 85 : 5 }, { ...late, told: [{ kind: "Snow", time: "2026-08-03T02:00" }] })[0],
    "Snow likely around 10 a.m. tomorrow. Feed early and keep a path open.");
  // the wind the headline has named before its thunder is not said again either
  assert.deepEqual(fsay({ gust: (i) => i === 1 ? 31 : 12, code: (i) => i === 4 ? 95 : 1 }, { told: [{ kind: "Windy", time: "2026-08-02T14:00" }, { kind: "Thunder", time: "2026-08-02T17:00" }] }),
    ["Chores can wait.", "no", null]);
  assert.deepEqual(fsay({ gust: (i) => i === 0 ? 31 : 12 }, { told: [{ kind: "Windy", time: "2026-08-02T13:00" }] })[0], "Too windy until about 2 p.m. Chores can wait.", "the hour it lays down is new");
  // and rain the headline has named is only what to do about it
  assert.deepEqual(fsay({ pop: (i) => i === 3 ? 80 : 5 }, { told: [{ kind: "Rain", time: "2026-08-02T16:00" }] })[0], "Piddle early.");
  assert.deepEqual(fsay({ gust: (i) => i === 4 ? 31 : 12 }), ["Too windy from about 5 p.m. Get the chores done early.", "caution", "9:30–10:30p"]);
  assert.deepEqual(fsay({ gust: (i) => i === 4 ? 31 : 12 }, { told: [{ kind: "Windy", time: "2026-08-02T17:00" }] })[0], "Get the chores done early.", "the headline has said windy by 5");
  assert.deepEqual(fsay({ code: (i) => i === 14 ? 66 : 1, pop: 50 }, { ...late, told: [{ kind: "Freezing rain", time: "2026-08-02T23:00" }] })[0],
    "Freezing rain possible around 11 a.m. tomorrow. Stay off the hill until it turns over.", "tonight's freezing rain is not tomorrow's");
  assert.deepEqual(fsay({ code: 73, pop: 50 }), ["Snow could start any time. Feed early and keep a path open.", "caution", "3:30–5:30p · 9:30–10:30p"]);
  assert.deepEqual(fsay({ code: 73, pop: 50 }, { c: { weather_code: 73 } })[0], "Feed early and keep a path open.");
  assert.deepEqual(fsay({ code: 73, pop: 80 }, late)[0], "Snow likely around 7 a.m. tomorrow. Feed early and keep a path open.");
  // freezing rain falling now takes the bite line even after dark, when the card is tomorrow's
  assert.deepEqual(fsay({}, late), [null, null, "9:30–10:30p"]);
  assert.deepEqual(fsay({}, { ...late, c: { weather_code: 66 } }), [null, null, null]);
  assert.deepEqual(fsay({ pop: (i) => i === 1 ? 80 : 5 })[0], "Slip out between the showers.");
  assert.deepEqual(fsay({ pop: (i) => i === 3 ? 80 : 5 })[0], "Piddle early. Rain likely later.");
  // a gap is never read as calm or dry: nothing is said, and no bite time is offered on unknown gusts
  assert.deepEqual(fsay({ gust: null, pop: null }), [null, null, null]);
  // the morning rounds: this morning's until ten, tomorrow's from sunset, at 36° or under
  const oct = { time: ["2026-10-22", "2026-10-23"], sunrise: ["2026-10-22T07:32", "2026-10-23T07:33"], sunset: ["2026-10-22T18:40", "2026-10-23T18:39"] };
  const cold = { from: "2026-10-22T07:00", now: "2026-10-22T07:40", dy: oct, c: { apparent_temperature: 27 } };
  const oct22 = [{ start: new Date("2026-10-22T09:16"), end: new Date("2026-10-22T11:16") }];
  bite.splice(0, 2, ...oct22);
  assert.deepEqual(fsay({ feels: (i) => i < 3 ? 30 : 50 }, cold), ["Cold one. Bundle up for the morning rounds.", "caution", "9:16–11:16a"]);
  assert.deepEqual(fsay({ feels: (i) => i < 3 ? 30 : 50 }, { ...cold, c: { apparent_temperature: 22 } })[0], "Cold one for the morning rounds.", "the headline has said bundle up");
  assert.deepEqual(fsay({ feels: (i) => i < 3 ? 40 : 50 }, cold)[0], null);
  assert.deepEqual(fsay({ feels: (i, hr) => hr >= 7 && hr <= 9 ? 33 : 45 }, { from: "2026-10-22T19:00", now: "2026-10-22T19:30", dy: oct, c: { apparent_temperature: 44 } })[0],
    "Cold one tomorrow. Bundle up for the morning rounds.");
  assert.deepEqual(fsay({ feels: 30 }, { ...cold, from: "2026-10-22T13:00", now: "2026-10-22T13:20" })[0], null, "the afternoon has no morning rounds in it");
  const farmSrc = html.slice(html.indexOf("function farmCard("), html.indexOf("function waterNote("));
  assert.ok(farmSrc.length > 500 && farmSrc.length < 9000, "the farm card is read on its own");
  assert.doesNotMatch(farmSrc, /"go"/, "the farm never says go");

  // render() paints what the two cards say and nothing of its own, the water before the chart is drawn,
  // and the cards hear what the headline has already named
  assert.match(html, /const water=LOC\.tide\?waterCard\(LOC,h,c,dy,m,d\.water,warning,storm,now,dayRead\.told\):null;/);
  assert.ok(html.indexOf("const water=LOC.tide?waterCard(") < html.indexOf("const tide=renderTides("), "the note and the level are known before the chart is drawn");
  assert.match(html, /const farm=LOC\.kind==="farm"\?farmCard\(LOC,h,c,dy,warning,storm,now,dayRead\.told\):null;/);
  // one shape for every section: nothing between a title and its chart. The water's readings are
  // its note and the level is on the chart, and said to a screen reader with it
  assert.match(html, /<div class="eyebrow"><b>Water · Wrightsville Beach<\/b><span id="tideNote">[^<]*<\/span><\/div>\n  <div class="tide-explore xp"/);
  assert.match(html, /document\.getElementById\("tideNote"\)\.textContent=tide\?waterNote\(water,tide\):\[waterNote\(water,null\),"tide data unavailable"\]\.filter\(Boolean\)\.join\(" · "\);/);
  assert.match(html, /tide\?"Tide curve, next 27 hours"\+\(water&&water\.level\?"\. "\+water\.level:""\):"Tide data unavailable"/);
  // the loading shell's empty pictures say what they will be, never the last place's
  const shell = html.slice(html.indexOf("function paintLocationShell("), html.indexOf("function paintLoadingState("));
  for (const s of ['"tideSvg").setAttribute("aria-label","Tide curve, next 27 hours")', '"moonSvg").setAttribute("aria-label","The moon over the next day and a half, and the almanac\'s fishing times")', '"yearSvg").setAttribute("aria-label","Normal highs and lows by month")'])
    assert.ok(shell.includes(s), `the shell resets ${s}`);
  // the moon's labels are placed, majors first, and one that would touch a label down gives way
  assert.match(html, /for\(const mk of\[\.\.\.marks\.filter\(m=>m\.major\),\.\.\.marks\.filter\(m=>!m\.major\)\]\)\{\n    if\(placed\.some\(p=>Math\.abs\(p\.x-mk\.x\)<p\.hw\+mk\.hw\)\)continue;/);
  assert.doesNotMatch(html, /id="waterRead"|id="waterLine"|id="waterLevel"|id="wFishWrap"/);
  // the farm's wave is the moon, where the tide is at the coast; the sentences are one card, the
  // farm's under the family's word and the boat's while the boat is out, painted on every render
  assert.match(html, /<section id="moonSection" hidden>\n  <div class="eyebrow"><b[^>]*>Almanac fishing times/);
  assert.match(html, /document\.getElementById\("moonSection"\)\.hidden=!LOC\.fish;/);
  assert.match(html, /const said=farm&&farm\.say\?\{title:"Piddling",\.\.\.farm\.say\}:water&&water\.say\?\{title:"The boat",\.\.\.water\.say\}:null;/);
  assert.match(html, /document\.getElementById\("sayCard"\)\.hidden=!said;/);
  assert.match(html, /if\(said\)\{document\.getElementById\("sayTitle"\)\.textContent=said\.title;/);
  // the moon's phase, said the way a person says it
  assert.deepEqual([[.01, .02], [.99, .5], [.5, .25], [.5, .75], [.3, .2], [.3, .8], [.8, .4], [.8, .6]].map(([f, p]) => W.moonName({ fraction: f, phase: p })),
    ["new moon", "full moon", "first quarter", "last quarter", "waxing crescent", "waning crescent", "waxing gibbous", "waning gibbous"]);

  // The year: NOAA's 1991-2020 normals at the two airports, as published
  const Nm = ctx.NORMALS.mb, Ns = ctx.NORMALS.sp;
  assert.deepEqual([Nm.place, Nm.hi[6], Nm.lo[0], Nm.rain[8], Ns.place, Ns.hi[6], Ns.lo[0], Ns.snow[0]], ["Wilmington", 90, 36.3, 8.69, "Beckley", 80.7, 24, 15.5]);
  // the title is the place's own name: "Shady Spring" for the farm (Josh: "Change Beckley to Shady
  // Spring") and "Wilmington" kept at the coast, where he said no to Porters Neck; the airport is
  // said with the source
  assert.deepEqual([Nm.name, Ns.name], ["Wilmington", "Shady Spring"]);
  assert.match(html, /el\.textContent=N\?"The year · "\+N\.name:"The year";/);
  // set together, by one helper, in the render and in a new place's loading shell, so the hover
  // text never keeps the last place's airport while the new place loads
  assert.equal((html.match(/yearTitle\(N\);/g) || []).length, 2);
  assert.match(html, /normals at the \$\{N\.place\} airport/);
  // the spoken label ends on the note as a sentence ("5° warmer this week."), and says "this week"
  // once: "This week: 5° warmer this week." said it twice
  assert.match(html, /\$\{cmp\?" "\+cmp\.note\[0\]\.toUpperCase\(\)\+cmp\.note\.slice\(1\)\+"\.":""\}`\);/);
  assert.doesNotMatch(html, /" This week: "\+cmp\.note/);
  assert.doesNotMatch(html, /"The year · "\+N\.place/);
  assert.deepEqual([Nm.dhi.length, Ns.dlo.length, Nm.dhi[0], Ns.dlo[365]], [366, 366, 577, 253], "daily normals in tenths, a leap year's days");
  assert.deepEqual(["2026-01-01", "2026-02-28", "2026-03-01", "2026-12-31"].map((s) => ctx.doyOf(s)), [0, 58, 60, 365]);
  // this week against them: the days' middle temperatures against each day's normal
  const wk = (hi, lo, from = "2026-09-27") => { const t0 = new Date(from + "T12:00"), time = Array.from({ length: 8 }, (_, i) => { const d = new Date(t0.getTime() + i * 864e5); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; });
    return { time, temperature_2m_max: time.map(() => hi), temperature_2m_min: time.map(() => lo) }; };
  const normalMid = (N, from) => { const d = wk(0, 0, from).time.slice(0, 7); return d.reduce((s, x) => s + (N.dhi[ctx.doyOf(x)] + N.dlo[ctx.doyOf(x)]) / 20, 0) / 7; };
  const mid = normalMid(Nm, "2026-09-27");
  assert.equal(W.yearCompare(Nm, wk(mid + 7, mid + 5)).note, "6° warmer this week");
  assert.equal(W.yearCompare(Nm, wk(mid - 3, mid - 7)).note, "5° cooler this week");
  assert.equal(W.yearCompare(Nm, wk(mid + 3.5, mid - 1.5)).note, "a normal week", "under 3° either way is normal");
  assert.equal(W.yearCompare(Nm, wk(mid + 2.5, mid - 2.5)).note, "a normal week");
  assert.equal(W.yearCompare(Nm, wk(mid + 5.5, mid - .5)).note, "3° warmer this week", "2.5 rounds up the same either way");
  assert.equal(W.yearCompare(Nm, wk(mid - .5, mid - 5.5)).note, "3° cooler this week");
  assert.equal(W.yearCompare(Nm, { time: [] }), null);
  assert.equal(W.yearCompare(Nm, { time: ["2026-09-27"], temperature_2m_max: [null], temperature_2m_min: [60] }), null, "a missing reading is not a normal one");
  // Christmas week at Beckley reads December and January's own days, not a month held flat
  const xmas = normalMid(Ns, "2026-12-22");
  assert.equal(W.yearCompare(Ns, wk(xmas + 1, xmas - 1, "2026-12-22")).note, "a normal week");
  assert.ok(Math.abs(xmas - (42.2 + 26.4) / 2) < 1.5, `late December's normal mid at Beckley is about 34°, not ${xmas.toFixed(1)}`);
  // and the year is drawn off them: one scale at both places, the wrap, the pin, the months
  assert.match(html, /const tMin=Math\.min\(20,cmp\?cmp\.wkLo-3:99\),tMax=Math\.max\(95,cmp\?cmp\.wkHi\+3:0\);/);
  assert.match(html, /const wrap=a=>\[\[X\(-1\),Y\(a\[11\]\)\],\.\.\.a\.map\(\(t,i\)=>\[X\(i\),Y\(t\)\]\),\[X\(12\),Y\(a\[0\]\)\]\];/);
  assert.match(html, /const N=NORMALS\[LOC\.id\];\n  document\.getElementById\("yearSection"\)\.hidden=!N;\n  if\(N\)renderYear\(N,dy,css\);/);
  assert.match(html, /<span\$\{i===m0\?' class="yr-now"':""\}>/);
  // the seas are asked for every day of the year, hour by hour for two days, and the station's own
  // thermometer and gauge beside the table they are read against
  assert.match(html, /L\.marine\?fetchJSON\(`https:\/\/marine-api\.open-meteo\.com\/v1\/marine\?[^`]*&hourly=wave_height&[^`]*&forecast_days=2&length_unit=imperial`/);
  assert.match(html, /"product=water_temperature&date=latest","product=water_level&datum=MLLW&range=1","product=predictions&datum=MLLW&interval=6&range=1"/);
  assert.match(html, /hourly:s,marine,tides,water,alerts,storms,nowcast/);
  // and a marine run with no reading in it is no seas, never a default
  assert.match(html, /w\.some\(v=>v!=null&&Number\.isFinite\(\+v\)\)\?\{time:t,wave:w\}:null;\s*\}\)\.catch\(\(\)=>null\):Promise\.resolve\(null\)/);
  // the boat season waits for Josh
  assert.match(html, /the season stays off until Josh says it is back/);
  assert.match(html, /boatSeason:null\}/);
  // nothing is scored or picked, and the one word is gone
  assert.doesNotMatch(html, /bestOutsideWindow|windowRead|outsideCard|CALL_WORD|call-word|call-when|titleFor|offTitle|windowLabel|best time to piddle|wWindow/);
  assert.doesNotMatch(html, /On the water · Figure 8|Outside · Porters Neck|Around the farm|Around Denver/);
  // The cards say what is there and nothing already said: no wind arrow or speed (the chip is now),
  // no next tide (the eyebrow carries it), no restating the alert strip, none of the old lead strings
  assert.doesNotMatch(html, /id="wTide"|id="wWind"|id="wGust"|card-flex/);
  assert.doesNotMatch(html, /"Warning in effect"|See the alert above|watch the shallow spots|mind the shoals|reliable marine reading/);
  assert.doesNotMatch(html, /Light wind, easy air|Plan around the gusts|An easy day on the water/);
  // and the family says windy: not in any sentence the app can print
  assert.doesNotMatch(html, /blustery|breezy|wind-whipped/i);
});

test("out-of-order refreshes cannot repaint or stop a newer request", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const code = html.slice(html.indexOf("let REFRESH_ID=0;"), html.indexOf("\nconst SWAP="));
  const pending=[],paints=[],writes=[],nodes=new Map();
  const node = id => {
    if(!nodes.has(id)){
      const classes=new Set(),attrs=new Map();
      nodes.set(id,{textContent:"",attrs,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},setAttribute:(k,v)=>attrs.set(k,v)});
    }
    return nodes.get(id);
  };
  const home={id:"mb",lat:34,lon:-77,tz:"America/New_York"};
  const farm={id:"sp",lat:37,lon:-80,tz:"America/New_York"};
  const ctx=vm.createContext({
    LOC:home,document:{getElementById:node},navigator:{onLine:true},
    fetchJSON:url=>url.includes("open-meteo.com")
      ?new Promise((resolve,reject)=>pending.push({resolve,reject}))
      :Promise.resolve({features:[]}),
    render:(data,live)=>paints.push({temp:data.current.temperature_2m,live}),
    writeCache:(id,data)=>writes.push({id,temp:data.current.temperature_2m}),
    readCache:()=>null,paintLoadingState:()=>{node("stamp").textContent="loading";},
  });
  vm.runInContext(code,ctx);
  const forecast = temp => ({
    current:{time:"2026-09-13T11:00",temperature_2m:temp},daily:{},
    hourly:Object.fromEntries(["time","temperature_2m","apparent_temperature","precipitation_probability","weather_code","wind_speed_10m","wind_gusts_10m","uv_index"]
      .map(k=>[k,[k==="time"?"2026-09-13T11:00":temp]])),
  });
  const first=ctx.refresh(),second=ctx.refresh();
  pending[0].resolve(forecast(61));await first;
  assert.equal(paints.length,0);
  assert.equal(node("refreshBtn").classList.contains("spin"),true);
  pending[1].resolve(forecast(72));await second;
  assert.equal(paints.at(-1).temp,72);
  assert.equal(node("refreshBtn").attrs.get("aria-busy"),"false");

  const oldHome=ctx.refresh();
  ctx.LOC=farm;const farmRequest=ctx.refresh();
  ctx.LOC=home;const newHome=ctx.refresh();
  pending[4].resolve(forecast(84));await newHome;
  pending[2].resolve(forecast(63));pending[3].reject(new Error("offline"));
  await Promise.all([oldHome,farmRequest]);
  assert.deepEqual(paints.map(p=>p.temp),[72,84],"home-farm-home must not revive the old home request");
  assert.deepEqual(writes.map(w=>w.temp),[72,84],"only accepted responses enter the cache");

  const failure=ctx.refresh();pending[5].reject(new Error("offline"));await failure;
  assert.equal(node("stamp").textContent,"unavailable");
  assert.match(node("verdict").textContent,/Tap the timestamp to try again/);
  assert.equal(node("refreshBtn").classList.contains("spin"),false);
});

test("the page reads top down: now, today, the week, and nothing it has already said", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };

  // The first screen is now, the next day and the week, because the weekend is what the family
  // looks for. The week moved up from the foot of the page to sit right under the hours.
  const at = (s) => { const i = html.indexOf(s); assert.ok(i > 0, `${s} should be in the markup`); return i; };
  // Every section is one shape (a title with one short note, the picture, its labels) and both
  // places run in the same order: the moon at the farm sits where the tide sits at the coast, the
  // sentences are cards, and the year is at the foot
  const order = ['<header class="sky"', "<b>Next 24 hours</b>", '<div class="week">', '<section id="moonSection"', '<section id="tideSection">',
    '<section id="stormSection"', '<div class="cards">', '<div class="card wide" id="sayCard"', '<div class="card" id="sunCard">', '<section id="yearSection"', '<p class="foot">'].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "sections run in page order");
  assert.match(html, /\.week\{padding:28px 20px 0\}/);
  // and the charts draw in down the page in the same order: REVEAL's keys are that order, and
  // each chart follows whichever chart above it is still drawing
  assert.match(html, /const REVEAL=\{hourly:\{[^}]*\},week:\{[^}]*\},\n  tide:\{[^}]*\},moon:\{[^}]*\},\n  sun:\{[^}]*\},year:\{[^}]*\}\};/);
  assert.match(html, /const order=Object\.keys\(REVEAL\);\n  for\(const u of order\.slice\(0,order\.indexOf\(k\)\)\)if\(REVEAL\[u\]\.state==="running"\)t0=Math\.max\(t0,REVEAL\[u\]\.t0\+420\);/);
  assert.match(html, /const RV_OF=\{hourlySvg:"hourly",weekSvg:"week",tideSvg:"tide",moonSvg:"moon",uvSvg:"sun",yearSvg:"year"\};/);
  assert.match(html, /for\(const id in RV_OF\)io\.observe\(document\.getElementById\(id\)\)/);
  // and a chart the live paint has just pushed below the fold is measured again, not drawn to
  // nobody, once the layout has settled. The measurement never clears the observer's word: a
  // week that grew back on screen later in the same render sat blank until the next scroll.
  assert.match(html, /function revealTry\(k,settled\)\{/);
  assert.match(html, /if\(!\(b\.height>0&&Math\.min\(b\.bottom,innerHeight\)-Math\.max\(b\.top,0\)>=b\.height\*\.3\)\)\{if\(!settled\)requestAnimationFrame\(\(\)=>revealTry\(k,true\)\);return\}/);
  assert.doesNotMatch(html.slice(html.indexOf("function revealTry("), html.indexOf("function revealApply(")), /R\.seen=false/);
  const armed = ["renderWeek(wk,css,we);", "const tide=renderTides(d.tides", "if(LOC.fish)renderMoon(", "if(uvBar)renderUV(", "if(N)renderYear(N,dy,css);"].map(at);
  assert.deepEqual([...armed].sort((a, b) => a - b), armed, "each chart is armed after the ones above it, or it would not see them running");

  // The wind chip is the speed and an arrow into the wind; the compass point is only spoken,
  // and calm air gets no arrow at all, though gusts running 6 over it are still said (the
  // burgee and the trees move to them). dirTxt stays for the tropics rows.
  const chips = html.slice(html.indexOf("const wNow=Math.round(c.wind_speed_10m)"), html.indexOf('document.getElementById("chips").innerHTML'));
  assert.match(chips, /\[vane\(c\.wind_direction_10m\),`<span class="sr-only">Wind from the \$\{dirLong\(c\.wind_direction_10m\)\}, <\/span>/);
  assert.match(chips, /wNow<1\?\[CI\.wind,gNow-wNow>=6\?`calm, gusts \$\{gNow\} mph`:"calm"\]/);
  assert.doesNotMatch(chips, /dirTxt/);
  assert.match(html, /\.chip \.vane\{color:currentColor;opacity:\.8\}/);
  // the chip never carries the barn vane's attribute: scene.mjs reads the first one in the page
  assert.doesNotMatch(html.slice(html.indexOf("const vane=deg=>"), html.indexOf("function paintTemperature(")), /data-vane-bearing/);
  // UV earns a chip where it earns the sun card, from 3, and never without the card
  assert.match(chips, /if\(sunAdvice&&Number\(c\.uv_index\)>=3\)chipData\.push/);
  // feels-like earns its line by the rule the hourly readout already uses
  assert.match(html, /<div id="feelsRow">feels <b id="feels">/);
  assert.match(html, /\|\|Math\.abs\(Math\.round\(c\.apparent_temperature\)-Math\.round\(c\.temperature_2m\)\)<3;/);
  // hour 0 carries the live gust, so the headline knows about the wind the chip is showing
  assert.match(html, /gust:hourly\.gust&&hourly\.gust\.map\(\(g,i\)=>i\?g:now0\(g,"wind_gusts_10m"\)\)/);

  // The hourly note names the gold band and nothing else: the bars and the headline say the rain.
  assert.doesNotMatch(html, /staying mostly dry|blue bars show rain chance/);
  // The nowcast names what is falling. It said "Rain" through snow and freezing rain at the farm.
  assert.match(html, /const kind=isIce\(w\)\?"Freezing rain":isSnow\(w\)\?"Snow":"Rain";/);
  assert.match(html, /renderNowcast\(d\.nowcast,c\.weather_code,h\)/);
  assert.doesNotMatch(html, /"Rain now, ending ~"/);
  {
    // and run: what is falling now is the current code, what starts later is its own hour's code
    const els = {}, el = (id) => (els[id] ??= { id, textContent: "", innerHTML: "", className: "" });
    const nc = vm.createContext({ document: { getElementById: el } });
    vm.runInContext([
      lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
      lift(/const clock=d=>\{[^\n]*\};/),
      html.slice(html.indexOf("function renderNowcast("), html.indexOf("const SWIRL=")),
      "globalThis.renderNowcast=renderNowcast;",
    ].join("\n"), nc);
    const slots = (p) => ({ time: p.map((_, i) => `2026-01-14T${String(16 + Math.floor((30 + i * 15) / 60)).padStart(2, "0")}:${String((30 + i * 15) % 60).padStart(2, "0")}`), precipitation: p });
    const hourly = (codes) => ({ time: ["2026-01-14T16:00", "2026-01-14T17:00", "2026-01-14T18:00", "2026-01-14T19:00"], code: codes });
    const cast = (p, code, codes = [code, code, code, code]) => { nc.renderNowcast(slots(p), code, hourly(codes)); return el("ncText").textContent; };
    const later = [0, 0, .4, .6, .5, .3, 0, 0, 0, 0, 0, 0], all = Array(12).fill(.5);
    assert.equal(cast(later, 3, [3, 73, 73, 3]), "Snow ~5:00p–6:00p", "dry now, snow in the next hour is snow");
    assert.equal(cast(later, 3, [3, 66, 66, 3]), "Freezing rain ~5:00p–6:00p");
    assert.equal(cast(later, 3, [3, 61, 61, 3]), "Rain ~5:00p–6:00p");
    assert.equal(cast(all, 66), "Freezing rain now, for 2h+");
    assert.equal(cast(all, 73), "Snow now, for 2h+");
    assert.equal(cast(all, 63), "Rain now, for 2h+");
    assert.equal(cast([.5, .5, .5, .1, 0, 0, 0, 0, 0, 0, 0, 0], 71), "Snow now, ending ~5:30p");
    assert.equal(cast([0, 0, 0, 0, .4, .5, .5, .5, .5, .5, .5, .5], 3, [3, 75, 75, 75]), "Snow from ~5:30p");
    assert.equal(el("nowcast").className, "nowcast on");
    cast(Array(12).fill(0), 3);
    assert.equal(el("nowcast").className, "nowcast", "a dry hour hides the strip");
  }
  // code 99 is not a warning, so it does not borrow the NWS warning word
  assert.match(html, /96:"Storms with hail",99:"Storms, heavy hail"/);
  // the tropics rows: the distance says how close, the count is the rows, and pressure and
  // advisory numbers are forecaster detail
  assert.doesNotMatch(html, /within 500 mi|active system|" mb":null|"adv "/);
  assert.match(html, /const meta=\[s\.mph\?s\.mph\+" mph winds":null,motion\]/);
  // a failed first load still offers the timestamp as the retry
  assert.match(html, /"Couldn't load the weather\. Tap the timestamp to try again\."/);

  // The footer is one quiet credit (Open-Meteo's data is CC BY 4.0). The sources, the refresh
  // instructions and the per-place footnotes are gone, and nothing still writes to them.
  assert.match(html, /<p class="foot"><a href="https:\/\/open-meteo\.com\/" rel="noopener">Weather data by Open-Meteo\.com<\/a><\/p>/);
  assert.match(html, /\.foot a\{color:inherit;text-decoration:none\}/);
  assert.doesNotMatch(html, /footSrc|foot-note|Refreshes on open|LOC\.foot\b/);
  assert.doesNotMatch(html.slice(html.indexOf("const LOCS={"), html.indexOf("const LOC_ORDER=")), /\bfoot:/);

  // The headline describes the coming period from its own hours, not the current sky twice.
  const story = html.slice(html.indexOf("function dayStory("), html.indexOf("/* Both places get the sun"));
  const storyCode = story.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(storyCode, /breaks of sun|breaks in the sky|gray skies|plenty of sun|cloud cover|clear sky|c\.cloud_cover/);
  // and it says windy, the way the family does
  assert.doesNotMatch(storyCode, /mild|blustery|breezy|wind-whipped/i);
  assert.doesNotMatch(html.replace(/\/\*[\s\S]*?\*\//g, ""), /\bmild\b/i, "the app uses the family's plain words");
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
    lift(/const hh=t=>\{[^\n]*\};/),
    lift(/const spokenAt=t=>[^\n]*;/),
    lift(/const sentence=s=>[^\n]*;/),
    lift(/const mdOf=[^\n]*\nconst inSeason=[^\n]*/),
    lift(/const XP=\{\},XP_HOLD=[^\n]*/),
    story,
  ].join("\n"), ctx);
  const dy = { time: ["2026-08-02"], temperature_2m_max: [90], sunrise: ["2026-08-02T06:00"], sunset: ["2026-08-02T20:00"] };
  const hours = (from, o = {}) => {
    const t0 = new Date(from.slice(0, 13) + ":00:00Z").getTime();
    const time = Array.from({ length: 24 }, (_, i) => new Date(t0 + i * 3.6e6).toISOString().slice(0, 16));
    return { time, temp: time.map(() => 75), feels: time.map(() => 75), pop: time.map((_, i) => o.pop?.(i) ?? 5), gust: time.map((_, i) => o.gust?.(i) ?? 10),
      code: time.map((_, i) => o.code?.(i) ?? 2) };
  };
  const tell = (c, o, loc = { id: "sp" }, d = dy) => {
    ctx.LOC = loc;
    return ctx.dayStory({ relative_humidity_2m: 50, apparent_temperature: c.temperature_2m, ...c }, d, hours(c.time, o)).html;
  };
  // after midnight the night is graded by the air it is in, not by the new day's forecast high
  assert.equal(tell({ time: "2026-08-02T01:15", temperature_2m: 70, weather_code: 1 }), "Dry through the morning.");
  assert.equal(tell({ time: "2026-08-02T19:15", temperature_2m: 84, weather_code: 1 }), "Warm this evening. Dry through the night.");
  // a night is warm from 74, where the Tonight card calls it warm, and under 40 it is cold
  assert.equal(tell({ time: "2026-08-02T23:10", temperature_2m: 78, weather_code: 2 }), "Warm tonight. Dry through the night.");
  assert.equal(tell({ time: "2026-08-02T19:15", temperature_2m: 35, weather_code: 1 }), "Cold this evening. Dry through the night.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 88, weather_code: 1, relative_humidity_2m: 80 }), "Warm and soupy with some sun this afternoon.");
  // a live gust in hour 0 is a windy headline; one later in the day is named by its hour
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i ? 12 : 30) }), "Windy now.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i === 3 ? 31 : 12) }), "Windy by 4 p.m.");
  // it names the first windy hour, not the windiest: gusts of 30 now are windy now, whatever comes at 4
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i === 0 ? 30 : i === 3 ? 34 : 12) }), "Windy now.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i === 1 ? 29 : i === 4 ? 33 : 12) }), "Windy by 2 p.m.");
  // One night is one night: after dark the small hours before morning are tonight's, and only
  // daylight tomorrow is "tomorrow". The Tonight card under it calls the same shower tonight's.
  assert.equal(tell({ time: "2026-08-02T21:30", temperature_2m: 72, weather_code: 1 }, { pop: (i) => (i === 4 ? 45 : 5) }), "Showers possible around 1 a.m.");
  assert.equal(tell({ time: "2026-08-02T21:30", temperature_2m: 72, weather_code: 1 }, { pop: (i) => (i === 10 ? 45 : 5) }), "Showers possible around 7 a.m. tomorrow.");
  assert.equal(tell({ time: "2026-08-02T19:15", temperature_2m: 76, weather_code: 63 }, { pop: (i) => (i < 7 ? 80 : 10) }), "Raining now. Should let up around 2 a.m.");
  // after midnight the midnight at the far end of the run is the one that ends today, so it is
  // plain "midnight": "midnight tomorrow" reads as the end of tomorrow, a day late
  assert.equal(tell({ time: "2026-08-02T01:15", temperature_2m: 70, weather_code: 1 }, { pop: (i) => (i === 23 ? 45 : 5) }), "Showers possible around midnight.");
  assert.equal(tell({ time: "2026-08-02T01:15", temperature_2m: 70, weather_code: 1 }, { pop: (i) => (i === 22 ? 45 : 5) }), "Showers possible around 11 p.m.");
  assert.equal(tell({ time: "2026-08-02T21:30", temperature_2m: 72, weather_code: 1 }, { pop: (i) => (i === 3 ? 45 : 5) }), "Showers possible around midnight.");
  // The look-ahead names what is coming from its own hours' codes, ice first: it only knew rain,
  // and called three o'clock's snow "Rain likely around 3 p.m." over a Tonight card that said snow.
  const cold = { time: "2026-08-02T10:00", temperature_2m: 30, weather_code: 3 }, winter = { time: ["2026-08-02"], temperature_2m_max: [34] };
  const at3 = (p, code) => ({ pop: (i) => (i >= 5 ? p : 5), code: (i) => (i >= 5 ? code : 3) });
  assert.equal(tell(cold, at3(80, 73), undefined, winter), "Cold today. Snow likely around 3 p.m.");
  assert.equal(tell(cold, at3(55, 73), undefined, winter), "Cold today. Snow possible around 3 p.m.");
  assert.equal(tell(cold, at3(80, 66), undefined, winter), "Cold today. Freezing rain likely around 3 p.m.");
  assert.equal(tell(cold, at3(55, 66), undefined, winter), "Cold today. Freezing rain possible around 3 p.m.");
  assert.equal(tell(cold, { pop: (i) => (i >= 5 ? 80 : 5), code: (i) => (i === 5 ? 73 : i > 5 ? 66 : 3) }, undefined, winter), "Cold today. Freezing rain likely around 3 p.m.", "ice outranks snow in the same stretch");
  assert.equal(tell(cold, at3(55, 61), undefined, winter), "Cold today. Showers possible around 3 p.m.", "rain keeps its own words");
  // the stretch is the run of wet hours from the first one: a shower at one and snow at eight are
  // two events, and the shower's hour does not carry the snow's name or the snow's odds
  assert.equal(tell(cold, { pop: (i) => (i === 3 || i === 4 ? 45 : i >= 10 && i <= 12 ? 90 : 5), code: (i) => (i >= 10 ? 71 : i >= 3 ? 61 : 3) }, undefined, winter), "Cold today. Showers possible around 1 p.m.");
  // missing odds are not dry: the headline says what it knows, or that the odds are missing
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 1 }, { pop: () => NaN }), "Rain odds unavailable.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 1 }, { pop: () => NaN, gust: (i) => (i === 3 ? 31 : 12) }), "Windy by 4 p.m.");
  assert.equal(tell(cold, { pop: () => 80, code: () => 73 }, undefined, winter), "Cold today. Snow likely any time now.");
  assert.equal(tell(cold, { pop: () => 45, code: () => 73 }, undefined, winter), "Cold today. Snow could start any time.");
  assert.equal(tell(cold, { pop: () => 45, code: () => 67 }, undefined, winter), "Cold today. Freezing rain could start any time.");
  assert.equal(tell(cold, { pop: () => 30, code: () => 71 }, undefined, winter), "Cold today. Maybe a few flurries.");
  assert.equal(tell(cold, { pop: () => 30, code: () => 56 }, undefined, winter), "Cold today. Maybe a little freezing rain.");
  assert.equal(tell(cold, { pop: () => 30 }, undefined, winter), "Cold today. Maybe a stray shower.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 1 }, { pop: (i) => (i === 2 ? 80 : 5) }), "Rain likely around 3 p.m.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 1 }, { pop: (i) => (i === 2 ? 45 : 5) }), "Showers possible around 3 p.m.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 1 }, { pop: () => 30 }), "Maybe a stray shower.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 63 }, { pop: (i) => (i < 3 ? 80 : 10) }), "Raining now. Should let up around 4 p.m.");
  assert.equal(tell({ time: "2026-08-02T15:00", temperature_2m: 70, weather_code: 45 }), "Foggy. Some sun later.");
  assert.equal(tell({ time: "2026-08-02T08:00", temperature_2m: 70, weather_code: 45 }), "Foggy this morning. Some sun later.");
  assert.match(tell({ time: "2026-08-02T08:00", temperature_2m: 31, weather_code: 66 }, { pop: () => 90 }), /^Freezing rain\. Expect ice on anything untreated\. Give yourself extra time on the roads\./);
  // thunder the run carries on poor odds is still thunder, and never "Should stay dry."
  assert.equal(tell({ time: "2026-08-02T10:30", temperature_2m: 70, weather_code: 2 }, { code: (i) => i >= 2 && i <= 9 ? 95 : 2 }), "Warm today. Thunder possible around noon.");
  assert.equal(tell({ time: "2026-08-02T10:30", temperature_2m: 70, weather_code: 2 }, { code: (i) => i === 0 ? 95 : 2 }), "Warm today. Thunder nearby.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 1 }, { pop: (i) => (i === 2 ? 45 : 5), code: (i) => i === 5 ? 95 : 1 }), "Showers possible around 3 p.m.", "the first wet stretch still leads");
  // and says what it named, so the cards under it do not say it again
  ctx.LOC = { id: "sp" };
  const toldOf = (o) => JSON.parse(JSON.stringify(ctx.dayStory({ time: "2026-08-02T10:30", temperature_2m: 70, weather_code: 2, relative_humidity_2m: 50, apparent_temperature: 70 }, dy,
    hours("2026-08-02T10:30", o)).told));
  assert.deepEqual(toldOf({ code: (i) => i === 2 ? 95 : 2 }), [{ kind: "Thunder", time: "2026-08-02T12:00" }]);
  assert.deepEqual(toldOf({ gust: (i) => i === 1 ? 30 : 10 }), [{ kind: "Windy", time: "2026-08-02T11:00" }]);
  assert.deepEqual(toldOf({ pop: (i) => i === 3 ? 60 : 5 }), [{ kind: "Rain", time: "2026-08-02T13:00" }]);
  // wind before the thunder is said with it, so neither is lost
  assert.equal(tell({ time: "2026-08-02T10:30", temperature_2m: 70, weather_code: 2 }, { gust: (i) => i === 1 ? 30 : 10, code: (i) => i === 4 ? 95 : 2 }),
    "Warm today. Windy by 11 a.m., then thunder possible around 2 p.m.");
  assert.deepEqual(toldOf({ gust: (i) => i === 1 ? 30 : 10, code: (i) => i === 4 ? 95 : 2 }), [{ kind: "Windy", time: "2026-08-02T11:00" }, { kind: "Thunder", time: "2026-08-02T14:00" }]);
  assert.equal(tell({ time: "2026-08-02T10:30", temperature_2m: 70, weather_code: 2 }, { gust: (i) => i === 4 ? 34 : 10, code: (i) => i === 4 ? 95 : 2 }),
    "Warm today. Thunder possible around 2 p.m.", "the storm hour carries the top gust: no \"then\" inside one hour");
  assert.equal(tell({ time: "2026-08-02T21:10", temperature_2m: 76, weather_code: 1 }, { gust: (i) => i === 13 ? 30 : 10, code: (i) => i === 17 ? 95 : 1 }),
    "Warm tonight. Windy by 10 a.m., then thunder possible around 2 p.m. tomorrow.", "tomorrow said once");
  // a cache opened late speaks from the hour now is in, not the hour it was written in
  ctx.LOC = { id: "sp" };
  const lateCache = ctx.dayStory({ time: "2026-08-02T09:10", temperature_2m: 70, weather_code: 2, relative_humidity_2m: 50, apparent_temperature: 70 }, dy,
    hours("2026-08-02T09:10", { code: (i) => i < 2 || i === 5 ? 95 : 2 }), new Date("2026-08-02T11:40"));
  assert.equal(lateCache.html, "Warm today. Thunder possible around 2 p.m.");
  // Quiet descriptions name a period only when every daylight hour is actually known.
  const completeDy = { time: ["2026-08-02", "2026-08-03"], temperature_2m_max: [76, 68],
    sunrise: ["2026-08-02T06:00", "2026-08-03T06:00"], sunset: ["2026-08-02T18:00", "2026-08-03T18:00"] };
  const readAt = (time, options = {}) => {
    const c = { time, temperature_2m: 75, apparent_temperature: 75, relative_humidity_2m: 50, weather_code: 1, ...options.c };
    const h = hours(c.time, { code: () => 1, ...options.hours });
    options.change?.(h);
    return ctx.dayStory(c, options.dy || completeDy, h, new Date(options.now || time));
  };
  assert.equal(readAt("2026-08-02T14:00").html, "Nice and sunny this afternoon.");
  assert.equal(readAt("2026-08-02T07:40",{hours:{code:i=>i<5?3:0}}).html,"Cloudy, then sunny.","sustained clearing replaces an empty dry-day summary");
  assert.equal(readAt("2026-08-02T07:40",{hours:{code:i=>i<5?0:3}}).html,"Sunny, then cloudy.");
  assert.equal(readAt("2026-08-02T07:40",{hours:{code:i=>i%2?3:0}}).html,"Clouds and sun today.","mixed skies still say what the day looks like");
  assert.equal(readAt("2026-08-02T07:40",{hours:{code:i=>i%4?3:0}}).html,"Mostly cloudy today.","one sunny hour cannot become a sustained clearing");
  assert.equal(readAt("2026-08-02T07:40",{hours:{code:i=>i%4?0:3}}).html,"Mostly sunny today.");
  assert.equal(readAt("2026-08-02T07:40",{hours:{code:()=>2}}).html,"Nice with some sun today.");
  assert.equal(readAt("2026-08-02T07:40",{c:{temperature_2m:80,relative_humidity_2m:80},
    dy:{...completeDy,temperature_2m_max:[90,68]}}).html,"Warm, soupy and sunny today.");
  assert.equal(readAt("2026-08-02T07:40",{hours:{code:i=>i===3?45:3}}).html,"Some fog today.");
  assert.equal(readAt("2026-08-02T07:40",{c:{temperature_2m:60,relative_humidity_2m:90},
    dy:{...completeDy,temperature_2m_max:[90,68]}}).html,"Warm and sunny today.","a damp cool morning cannot borrow afternoon heat to become humid or soupy");
  assert.doesNotMatch(storyCode,/Dry today\.|Dry through the afternoon\./,"a quiet daytime summary names the sky rather than only the absence of rain");
  assert.equal(readAt("2026-08-02T14:00", { c: { weather_code: 3 }, hours: { code: () => 3 } }).html, "Cloudy this afternoon.");
  assert.equal(readAt("2026-08-02T19:00").html, "Sunny tomorrow and 8° cooler.");
  assert.equal(readAt("2026-08-02T19:00", { c: { weather_code: 45 } }).html, "Foggy. Sunny tomorrow and 8° cooler.", "looking ahead cannot hide fog here now");
  assert.equal(readAt("2026-08-02T17:00").html, "8° cooler tomorrow, with a high of 68°.", "a 24-hour run ending at four cannot promise tomorrow afternoon's sky");
  assert.equal(readAt("2026-08-02T19:00", { dy: { ...completeDy, temperature_2m_max: [76, 79] } }).html, "Sunny tomorrow.", "a small temperature change adds no comparison");
  assert.equal(readAt("2026-08-02T17:00", { dy: { ...completeDy, temperature_2m_max: [null, 79] } }).html, "Tomorrow's high is 79°.");
  assert.equal(readAt("2026-08-02T19:00", { dy: { ...completeDy, temperature_2m_max: [76, null] } }).html, "Sunny tomorrow.", "no invented temperature is needed for a known sky");
  assert.equal(readAt("2026-08-02T17:00", { dy: { ...completeDy, temperature_2m_max: [76, null] } }).html, "Warm this evening. Dry through the night.");
  for (const change of [h => { h.pop[2] = null; }, h => { h.code[2] = null; },
    h => { for (const k of Object.keys(h)) h[k].splice(2, 1); }, h => { for (const k of Object.keys(h)) h[k].splice(2); }]) {
    assert.doesNotMatch(readAt("2026-08-02T14:00", { change }).html, /nice|sunny|cloudy|dry/i, "a missing hour or reading cannot certify the afternoon");
  }
  assert.doesNotMatch(readAt("2026-08-02T14:00", { change: h => { h.gust[2] = null; } }).html, /nice|sunny|cloudy/i, "unknown wind cannot certify a pleasant afternoon");
  for (const feel of [98, 35, null]) assert.doesNotMatch(readAt("2026-08-02T14:00", { change: h => { h.feels[2] = feel; } }).html, /nice/i, "future apparent temperature must also support Nice");
  assert.doesNotMatch(readAt("2026-08-02T14:00", { dy: { time: completeDy.time, temperature_2m_max: [76, 68] } }).html, /nice|sunny|cloudy|dry/i, "no daylight bounds means no promise about the whole period");
  assert.doesNotMatch(readAt("2026-08-02T14:00", { dy: { ...completeDy, temperature_2m_max: [null, 68] }, change: h => { h.temp.fill(null); }, c: { temperature_2m: null, apparent_temperature: null } }).html, /cold|warm|hot|nice|0°/i);
  assert.match(readAt("2026-08-02T14:00", { c: { apparent_temperature: 100 } }).html, /Keep the middle of the day short\./);
  assert.doesNotMatch(readAt("2026-08-02T14:00", { c: { apparent_temperature: 100 } }).html, /Nice/);
  assert.match(readAt("2026-08-02T14:00", { c: { apparent_temperature: 20 } }).html, /Bundle up\./);
  // The wall clock changes the subject even if the cache was written before evening.
  assert.equal(readAt("2026-08-02T13:00", { now: "2026-08-02T18:00" }).html, "8° cooler tomorrow, with a high of 68°.");
  assert.equal(readAt("2026-08-02T10:00", { now: "2026-08-02T14:00", c: { weather_code: 95 } }).html, "Nice and sunny this afternoon.", "an old current storm is not overhead now");
  // The current afternoon is graded from its remaining hours, never a spent high.
  assert.equal(readAt("2026-08-02T14:00", { dy: { ...completeDy, temperature_2m_max: [95, 68] }, c: { temperature_2m: 55, apparent_temperature: 55 }, change: h => h.temp.fill(55) }).html, "Cool and sunny this afternoon.");
  // Thunder keeps its name with high or missing rain odds, and a rain shower cannot hide it.
  for (const pop of [80, NaN]) {
    const r = readAt("2026-08-02T10:00", { hours: { code: i => i === 2 ? 95 : 1, pop: i => i === 2 ? pop : 5 } });
    assert.equal(r.html, "Thunder possible around noon.");
    assert.deepEqual(JSON.parse(JSON.stringify(r.told)), [{ kind: "Thunder", time: "2026-08-02T12:00" }]);
  }
  const wetThunder = readAt("2026-08-02T10:00", { c: { weather_code: 63 }, hours: { code: i => i === 2 ? 95 : 1, pop: i => i < 2 ? 80 : 5 } });
  assert.equal(wetThunder.html, "Raining now. Thunder possible around noon.");
  assert.deepEqual(JSON.parse(JSON.stringify(wetThunder.told)), [{ kind: "Thunder", time: "2026-08-02T12:00" }]);
  assert.doesNotMatch(readAt("2026-08-02T10:00", { c: { weather_code: 63 }, hours: { pop: () => NaN } }).html, /let up|dry/i, "missing rain odds cannot end a shower");
  assert.doesNotMatch(readAt("2026-08-02T10:00", { c: { weather_code: 73 }, hours: { code: () => 73 } }).html, /let up|dry/i, "low odds cannot end snow still carried by the codes");
  // storms overhead: the water is named only while the boat is going out
  const coast = { id: "mb", boatSeason: ["03-15", "10-31"] };
  assert.equal(tell({ time: "2026-08-02T16:00", temperature_2m: 80, weather_code: 95 }, {}, coast), "<em>Storms overhead.</em> Stay off the water.");
  assert.equal(tell({ time: "2026-11-14T16:00", temperature_2m: 60, weather_code: 95 }, {}, coast), "<em>Storms overhead.</em> Head inside.");
  assert.equal(tell({ time: "2026-08-02T16:00", temperature_2m: 80, weather_code: 95 }), "<em>Storms overhead.</em> Head inside.");
  // the season is month-days on the place's own calendar, and may wrap the new year
  const inSeason = vm.runInContext("inSeason", ctx);
  assert.equal(inSeason("2026-03-14T12:00", coast.boatSeason), false);
  assert.equal(inSeason("2026-03-15T12:00", coast.boatSeason), true);
  assert.equal(inSeason("2026-10-31T23:00", coast.boatSeason), true);
  assert.equal(inSeason(new Date(2026, 10, 1, 9), coast.boatSeason), false);
  assert.equal(inSeason("2026-12-20T12:00", ["11-01", "02-28"]), true);
  assert.equal(inSeason("2026-06-20T12:00", ["11-01", "02-28"]), false);
  assert.equal(inSeason("2026-06-20T12:00", undefined), false);
});

test("the copy harness keeps looking at the days the water, the farm and the weekend are about", async () => {
  const shots = await readFile(new URL("tools/shots.mjs", root), "utf8");
  const fixtures = await readFile(new URL("tools/fixtures.mjs", root), "utf8");
  // each scenario is there for one day of the week or one season, so its date has to stay that day
  const when = (name) => { const m = shots.match(new RegExp(`name: "${name}", loc: "(\\w+)", when: "([^"]+)"`)); assert.ok(m, `${name} should be in tools/shots.mjs`); return { loc: m[1], d: new Date(m[2]) }; };
  const scenario = (name) => shots.slice(shots.indexOf(`name: "${name}"`), shots.indexOf("{ name:", shots.indexOf(`name: "${name}"`) + 1) >>> 0 || undefined);
  const sun = when("15-wet-week-shady-spring"), sat = when("16-saturday-porters-neck"), nov = when("17-off-season-saturday-porters-neck");
  const jan = when("18-january-porters-neck"), seas = when("19-no-seas-porters-neck"), cold = when("20-cold-morning-shady-spring");
  assert.equal(sun.d.getDay(), 0, "the eight-column week is a Sunday");
  assert.equal(sat.d.getDay(), 6, "the weekend-is-today scenario is a Saturday");
  assert.ok(nov.d.getDay() === 6 && nov.loc === "mb" && nov.d.getMonth() === 10, "a coast Saturday in November");
  assert.ok(jan.d.getMonth() === 0 && jan.loc === "mb", "a January coast day");
  assert.ok(seas.loc === "mb" && /wave: null/.test(scenario("19-no-seas-porters-neck")), "a boat day with no seas");
  assert.ok(cold.loc === "sp" && cold.d.getHours() < 10, "a farm morning, before the rounds are done");
  // the boat season is off until Josh says, so the boat's sentence is looked at with it switched
  // back on, and the harness fails if there is nothing to switch
  for (const n of ["14-week-porters-neck", "16-saturday-porters-neck", "19-no-seas-porters-neck"])
    assert.match(scenario(n), /boat: true/, `${n} shows the boat's sentence`);
  assert.match(shots, /on = src\.replace\("boatSeason:null", 'boatSeason:\["03-15","10-31"\]'\)/);
  assert.match(shots, /if \(on === src\) errs\.push\("no boatSeason:null to switch on"\)/);
  // and each says what it is there to show, so the harness fails when it stops showing it
  assert.match(shots, /expect: \{ cols: 8, weekend: \["Sat", "Sun"\], moon: true, say: null, fish: true, xp: \{ week: /);
  // and each chart's pill where it starts is printed and held: the water at now and an hour on while
  // the gauge runs off the table, the Sunday week, a January coast with no snow, an October farm with its snow
  assert.match(shots, /xp: Object\.fromEntries\(Object\.entries\(XP\)/);
  assert.equal(shots.split("tideHour: / by the table$/").length - 1, 3, "the three surge scenarios read the table an hour on");
  assert.match(shots, /xp: \{ year: \/\^Jan 57° \\\/ 36° rain 3\\\.8 in\$\/ \}/);
  assert.match(shots, /xp: \{ year: \/\^Oct 64° \\\/ 44° rain 2\\\.7 in snow 1 in\$\/ \}/);
  assert.match(shots, /for \(const \[k, re\] of Object\.entries\(ex\.xp \|\| \{\}\)\) if \(!re\.test\(copy\.xp\[k\] \|\| ""\)\) fail\(/);
  assert.match(shots, /expect: \{ cols: 7, weekend: \["Today", "Sun"\], note: \/\^Sun \\d\+° 45% rain\$\/, sayTitle: "The boat", say: "Easy out there\.", sayCls: "go"/);
  assert.match(shots, /sayTitle: "The boat", say: "Too windy for the boat\.", sayCls: "no"/);
  assert.match(shots, /sayTitle: "The boat", say: "Seas unavailable\.", sayCls: "caution", tide: \/\^77°\$\//);
  assert.match(shots, /tide: \/\^77° · seas ~2 ft\$\/, level: "Running 2 ft above the tide table\."/);
  // the water blown out under the table, and every chart's words kept on the chart, off each other and off the bed
  assert.match(shots, /surge: -1\.6, waterTemp: 48,/);
  assert.match(shots, /level: "Running 1\.5 ft below the tide table\."/);
  assert.match(shots, /\["hourlySvg", "weekSvg", "tideSvg", "moonSvg", "yearSvg"\]/);
  assert.match(shots, /\{ w: 320, h: 1500, tag: "narrow" \}/);
  assert.match(shots, /runs into/);
  assert.match(shots, /sits on the bed/);
  assert.match(shots, /if \(ex\.level && !copy\.water\?\.tag\) fail\("the skiff carries no level tag"\)/);
  assert.match(shots, /say: null, tide: \/\^63° · seas ~2 ft\$\/, level: null, marine: 1/);
  assert.match(shots, /moon: true, sayTitle: "Piddling", say: "Cold one\. Bundle up for the morning rounds\.", sayCls: "caution", fish: true, year: /);
  assert.match(shots, /say: null, tide: \/\^seas ~2 ft\$\/, sun: "\(steps aside\)", marine: 1/);
  // A neutral sun sentence over a LOW pin keeps the moderate peak ring still to come.
  assert.match(shots, /sun: "Strongest sun noon to 1 p\.m\.", uvBar: \/\^UV 2\\\.9 now, low, peaking at 3\\\.1 around noon\\\.\$\//);
  assert.match(shots, /if \(ex\.uvBar && !ex\.uvBar\.test\(copy\.uvBar \|\| ""\)\) fail\(/);
  assert.match(shots, /if \(r\.url\(\)\.includes\("marine-api\.open-meteo\.com"\)\) marineAsks\+\+;/);
  // the readout prints what is seen: the compass point and the bite framing are spoken only
  assert.match(shots, /k\.querySelectorAll\("\.sr-only"\)\.forEach\(\(x\) => x\.remove\(\)\)/);
  for (const sel of ['T("tideNote")', 'getElementById("tideSvg").getAttribute("aria-label")', 'T("moonNote")', 'T("sayTitle")', 'T("saySay")', 'T("yearNote")', '"sunCard"', 'T("eveLead")', 'T("weekNote")'])
    assert.ok(shots.includes(sel), `the copy readout reads ${sel}`);
  // the fixtures serve the eight days the week needs, two days of hourly seas, and the station's
  // thermometer and gauge beside the table
  assert.match(fixtures, /export const DAYS = 8;/);
  assert.match(fixtures, /export function marine\(now, o, tz\)/);
  assert.match(fixtures, /export function coops\(url, now, o, tidePhase = 0\)/);
  assert.match(fixtures, /coops\(r\.request\(\)\.url\(\), now, o, tidePhase\)/);
});

test("every line reads the same way: one machine, and readers that say only what they know", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const code = html.slice(html.indexOf("<script>"));

  // One machine. The gesture code is the explorer's alone, and nothing of the old per-chart peeks is left
  assert.equal(code.split('addEventListener("pointerdown"').length - 1, 1, "one pointerdown in the file");
  assert.doesNotMatch(html, /HOURLY_PEEK|TIDE_PEEK|setupHourlyPeek|setupTidePeek|PeekLive|hourly-cursor|tide-cursor/);
  assert.match(html, /xpReset\(\);LAST=null;/, "the loading and error shell resets every explorer");
  assert.match(html, /\}else xpPublish\("tide",null\);/, "a paint with no tide chart publishes none");
  assert.match(html, /if\(LOC\.fish\)renderMoon\(css,allowedFishWins,now\);else xpPublish\("moon",null\);/);
  assert.match(html, /if\(N\)renderYear\(N,dy,css\);else xpPublish\("year",null\);/);
  // the week: its days stay buttons and tab stops, a slide opens the day you let go on the way a tap
  // does (weekPick), the click a drag leaves behind is swallowed, and the arrows move and open
  assert.match(html, /xpSetup\("week",\{pick:true,release:weekPick\}\);/);
  assert.match(html, /if\(performance\.now\(\)-\(XP\.week\?\.end\?\?-Infinity\)<600\)return;/);
  assert.match(html, /const to=e\.key==="ArrowRight"\?j\+1:/);
  assert.doesNotMatch(html.slice(html.indexOf("function renderWeek("), html.indexOf("function weekBrief(")), /tabindex="-1"/);
  assert.match(html, /const said=readDay\(dy,i\)\.said;/, "the button speaks the pill's sentence");
  // a missing day is not a zero: the week's lines run between known days and stop at the known
  // ends, the marks are the known days only, and a series with under two known days is no chart
  assert.match(html, /if\(n<2\|\|!HI\.ok\|\|!LO\.ok\)\{svg\.innerHTML="";xpPublish\("week",null\);return\}/);
  assert.match(html, /const hiLine=spline\(hiP\.slice\(HI\.f,HI\.l\+1\)\),loLine=spline\(loP\.slice\(LO\.f,LO\.l\+1\)\);/);
  assert.match(html, /if\(!hk\)continue;/);
  { const knownRun = vm.runInNewContext(html.match(/function knownRun\(a\)\{[\s\S]*?\n\}/)[0] + ";knownRun"), R = knownRun([70, null, 74, 75, null]);
    assert.deepEqual([...R.k], [70, null, 74, 75, null]);
    assert.deepEqual([R.v[1], R.f, R.l, R.ok], [72, 0, 3, true], "a gap runs between its neighbours, and the ends are the known days");
    assert.equal(knownRun([null, 60, ""]).ok, false, "one known day is no line"); }
  // the moon's reader is handed only the windows renderMoon drew, and the crossings of its own horizon
  assert.match(html, /const nt=now\.getTime\(\),drawn=wins\.filter\(/);
  assert.match(html, /read:i=>readMoon\(ts\[i\],nt,alts\[i\],drawn,cross\)/);
  assert.match(html, /const cross=moonCross\(t0,t1\+26\*3\.6e6\)/);
  // the year's stops are the twelve months, never the wrapped ends, and this month is where it starts
  assert.match(html, /xpPublish\("year",\{svg,W,x:ms\.map\(X\),y:ms\.map\(m=>\[Y\(N\.hi\[m\]\),Y\(N\.lo\[m\]\)\]\),t:ms,band:\[12,H-1\],start:m0,marks:\[m0,hiI,loI\]/);
  for (const l of ["Almanac fishing times, 15 minutes a step", "The year, month by month"])
    assert.ok(html.includes(`<input class="xp-key" type="range" min="0" max="0" step="1" value="0" disabled aria-label="${l}">`), l);
  // one explorer per chart, set up in page order, and every one of them is a chart the entrance draws
  const setups = [...html.matchAll(/xpSetup\("(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(setups, ["hourly", "week", "tide", "moon", "year"]);
  const revealKeys = Object.keys(Object.fromEntries([...html.match(/const REVEAL=\{([\s\S]*?)\};/)[1].matchAll(/(\w+):\{state/g)].map((m) => [m[1], 1])));
  for (const k of setups) assert.ok(revealKeys.includes(k), `${k} is in REVEAL`);
  assert.deepEqual(setups, revealKeys.filter((k) => setups.includes(k)), "in REVEAL's page order");
  // one cursor slot per chart, over its line and under its words: in each chart's template it comes
  // before the first literal text and the labels, so their paper halos break the hairline
  assert.equal(html.split('<g class="xp-cursor"').length - 1, 5);
  for (const [fn, words] of [["function render(", "${dots}"], ["function renderWeek(", "${marks}"], ["function renderTides(", "${labels}"], ["function renderMoon(", "${labels}"], ["function renderYear(", "${marks}"]]) {
    const src = html.slice(html.indexOf(fn)), tpl = src.slice(src.indexOf("innerHTML=`"), src.indexOf("innerHTML=`") + 9000);
    const slot = tpl.indexOf('<g class="xp-cursor"'), firstText = tpl.indexOf("<text");
    assert.ok(slot > 0 && slot < tpl.indexOf(words) && (firstText < 0 || slot < firstText), `${fn} draws its cursor under its words`);
  }
  // four range inputs, one per chart that is not already a row of buttons
  assert.equal(html.split('<input class="xp-key" type="range"').length - 1, 4);
  for (const l of ["Next 24 hours, hour by hour", "Water, 15 minutes a step", "Almanac fishing times, 15 minutes a step", "The year, month by month"])
    assert.ok(html.includes(`aria-label="${l}">`), l);
  // the Sun bar is a scale, not a day, and has none
  assert.match(html, /The Sun bar has none: it is a scale, not\n   a day/);
  assert.doesNotMatch(html, /uvExplore/);

  // Touch: a vertical swipe is the page's, a sideways slide is the chart's, and a scroll leaves nothing behind
  const xpRule = css.match(/\.xp\{[^}]*\}/)?.[0] || "";
  for (const d of ["touch-action:pan-y;", "touch-action:pan-y pinch-zoom;", "-webkit-user-select:none;", "-webkit-touch-callout:none;"])
    assert.ok(xpRule.includes(d), `.xp carries ${d}`);
  // a press ends wherever the finger comes up: a repaint replaces the node a tap is pressed on, and a
  // lift just off the chart never came back to the box and left the reading up for good
  assert.match(html, /document\.addEventListener\("pointerup",e=>\{\n\s*if\(e\.pointerId!==X\.ptr\)return;/);
  assert.doesNotMatch(html, /box\.addEventListener\("pointer(up|cancel)"/);
  assert.match(html, /document\.addEventListener\("pointercancel",e=>\{if\(e\.pointerId!==X\.ptr\)return;drop\(\);xpHide\(X\)\}\);/);
  assert.match(html, /Math\.abs\(dx\)>=XP_SLOP&&Math\.abs\(dx\)>Math\.abs\(dy\)/);
  assert.match(html, /const XP=\{\},XP_HOLD=140,XP_LINGER=2200,XP_SLOP=6,XP_TAP=10,XP_SNAP=7,DRY_UNDER=5,WINDY_GUST=28;/);
  assert.match(html, /box\.setPointerCapture\(e\.pointerId\)/);
  // a finger that has moved past a tap's own settle (XP_TAP, the browser's and the phones' tap
  // tolerance, while XP_SLOP still decides a slide) is not holding still, so a slow scroll never
  // pops a reading, and a finger that moved and came back is not a tap. A firm press that rolls
  // 7px is still a tap: at 6px it read nothing while the week opened its day for the same press
  assert.match(html, /if\(!X\.slide&&!X\.held&&Math\.hypot\(dx,dy\)>=XP_TAP\)\{clearTimeout\(X\.holdT\);X\.moved=true\}/);
  // a finger that stops a gliding page is not a tap on the chart under it
  assert.match(html, /addEventListener\("scroll",\(\)=>\{XP_SCROLLED=performance\.now\(\)\},\{passive:true\}\);/);
  assert.match(html, /X\.fling=performance\.now\(\)-XP_SCROLLED<50;/);
  assert.match(html, /if\(!slid&&!held&&!moved&&!X\.fling\)xpShow\(X,xpIndex\(X,e\.clientX\)\);/);
  // and however long it rests there: the hold is never armed for it
  assert.match(html, /if\(!pick&&!X\.fling\)X\.holdT=setTimeout\(X\.hold=\(\)=>/);
  // still means still for the whole wait: a thumb creeping into a scroll starts the wait again
  assert.match(html, /else if\(X\.hold&&!X\.slide&&!X\.held&&!X\.moved&&Math\.hypot\(e\.clientX-X\.ax,e\.clientY-X\.ay\)>=2\)\{/);
  // a tapped reading keeps the rest of its linger through a repaint, and no longer
  assert.match(html, /const left=X\.ptr==null&&X\.hideAt\?X\.hideAt-performance\.now\(\):0;/);
  assert.match(html, /xpShow\(X,best\);if\(!held\)xpHide\(X,left\);return\}/);
  // the hour labels are part of the hourly's explorer, the way the year's months are the year's
  const hx = html.slice(html.indexOf('id="hourlyExplore"'), html.indexOf('<div class="week">'));
  assert.ok(hx.indexOf('id="hrLabels"') > 0, "the hour labels are in the hourly section");
  assert.doesNotMatch(hx.slice(0, hx.indexOf('id="hrLabels"')), /\n    <\/div>/, "#hrLabels sits inside #hourlyExplore, before it closes");
  // a live paint drawn after the top of the hour asks for the new hour's run, once an hour
  assert.match(html, /if\(live&&nowI>0&&ROLL_ASKED!==nowHr0\)\{ROLL_ASKED=nowHr0;setTimeout\(refresh,0\)\}/);
  // the pill's small coloured words take the inks that read on the golden-hour paper
  assert.match(css, /\.xp-peek \.cold\{color:var\(--water-ink\)\}/);
  assert.match(css, /\.xp-peek \.warm\{color:#974607\}/);
  // a tap leaves :hover stuck on a phone, so only a mouse's hover holds a reading through a repaint
  assert.match(html, /const held=X\.ptr!=null\|\|X\.mouse&&X\.box\.matches\(":hover"\)\|\|X\.key&&document\.activeElement===X\.key;/);
  assert.match(html, /X\.mouse=e\.pointerType==="mouse";/);
  // a finger that landed a moment before a repaint keeps its press
  assert.match(html, /if\(same&&X\.ptr!=null&&!X\.shown\)\{xpRest\(X\);return\}/);
  // the week's guard eats the click a slide left behind, and a new press spends it
  assert.match(html, /if\(pick\)X\.end=-Infinity;/);
  // a mouse press let go off the chart is let go here too
  assert.match(html, /if\(X\.ptr!=null&&!\(e\.buttons&1\)\)drop\(\);/);
  assert.match(html, /box\.addEventListener\("pointerleave",e=>\{if\(e\.pointerType!=="mouse"\)return;X\.mouse=false;if\(X\.ptr!=null&&!X\.slide\)drop\(\);if\(X\.ptr==null\)xpHide\(X\)\}\);/);

  // Keyboard and screen reader: a real range input is the one tab stop, and its value is the sentence
  const show = html.slice(html.indexOf("function xpShow("), html.indexOf("function xpHide("));
  assert.match(show, /X\.key\.setAttribute\("aria-valuetext",r\.said\)/);
  assert.match(show, /revealFinish\(X\.k\);/, "a chart still drawing in finishes before a ring rides it");
  assert.doesNotMatch(show, /style\.left/, "the pill moves by transform");
  // the value and its sentence go back to the start together, and a chart not drawn has no sentence
  assert.match(html, /const xpRest=X=>\{if\(!X\.key\|\|!X\.D\)return;X\.key\.value=X\.D\.start;X\.key\.setAttribute\("aria-valuetext",X\.D\.read\(X\.D\.start\)\.said\)\};/);
  const hide = html.slice(html.indexOf("function xpHide("), html.indexOf("function xpPublish("));
  assert.match(hide, /if\(document\.activeElement!==X\.key\)xpRest\(X\);/);
  assert.match(html, /key\.addEventListener\("blur",\(\)=>\{xpHide\(X\);if\(X\.D\)xpRest\(X\)\}\);/);
  assert.match(html, /if\(!D\)\{drop0\(X\);if\(X\.key\)\{X\.key\.value=0;X\.key\.removeAttribute\("aria-valuetext"\)\}return\}/);
  // the pill rises clear of the point it reads, by transform, and a missing daily high has no ring
  assert.match(show, /X\.peek\.style\.setProperty\("--xp-y",Math\.min\(0,ry-ph\)\.toFixed\(1\)\+"px"\);/);
  assert.match(css, /\.xp-peek\{[^}]*transform:translate\(calc\(var\(--xp-x,50%\) - 50%\),var\(--xp-y,0px\)\);/);
  assert.match(html, /y:days\.map\(\(_,i\)=>\[xpFin\(his\[i\]\)\?Y\(his\[i\]\):NaN,xpFin\(los\[i\]\)\?Y\(los\[i\]\):NaN\]\)/);
  // the hour beside NOW gives way to it on the axis, and the now pill reads the live thunder
  assert.match(html, /\$\{i===nowI\?"NOW":i%3===0&&Math\.abs\(i-nowI\)>1\?hh\(h\.time\[i\]\):""\}/);
  assert.match(html, /hLive=liveHour\(h,c\.weather_code,nowI\);/);
  assert.match(html, /read:i=>readHour\(hLive,i,nowI,gold\.has\(i\)\)/);
  for (const el of html.match(/<div class="[^"]*\bxp\b[^"]*" id="\w+Explore">[\s\S]*?\n  <\/div>/g) || [])
    assert.doesNotMatch(el, /aria-live/, "no live region inside an explorer");

  // No motion: the pill, hairline and ring appear and go in place
  for (const sel of [".xp-peek{", ".xp-cursor{", ".xp-cursor line{", ".xp-cursor circle{"]) {
    const rule = css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
    assert.ok(css.includes(sel), `${sel} is in the stylesheet`);
    assert.doesNotMatch(rule, /transition|animation/, `${sel} has no transition`);
  }

  // Honesty: the pill can never say dry over a bar the chart drew, and the headline's windy line is one number
  const dryUnder = +html.match(/DRY_UNDER=(\d+)/)[1], barFloor = +html.match(/if\(h\.pop\[i\]>=(\d+)\)\{/)[1];
  assert.ok(dryUnder <= barFloor, `dry under ${dryUnder}% sits at or under the bar floor of ${barFloor}%`);
  assert.match(html, /gustI=win\.find\(i=>has\(h\.gust\?\.\[i\]\)&&\+h\.gust\[i\]>=WINDY_GUST\)/);
  assert.doesNotMatch(html.slice(html.indexOf("function dayStory("), html.indexOf("/* Both places get the sun")), />=28\b/);
  const readMoonSrc = html.slice(html.indexOf("function readMoon("), html.indexOf("function readMonth("));
  assert.doesNotMatch(readMoonSrc, /solunarWindows|fishWindows/, "the moon's reader sees only the windows the chart drew");

  // The readers are pure, and run here
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/const XP=\{\},XP_HOLD=[^\n]*/),
    lift(/const WMO=\{[^\n]*/),
    lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
    lift(/const hh=t=>\{[^\n]*\};/),
    lift(/const dayName=s=>[^\n]*;/),
    lift(/const mmdd=s=>[^\n]*;/),
    lift(/const clock=d=>\{[^\n]*\};/),
    html.slice(html.indexOf("const NORMALS={"), html.indexOf("const DOY=")),
    html.slice(html.indexOf("const precipKind="), html.indexOf("/* where the moon crosses the chart's own horizon")),
    "Object.assign(globalThis,{precipKind,xpWhen,xpSaid,quarterStops,liveHour,goldStops,readHour,readDay,readTide,readMoon,readMonth,NORMALS});",
  ].join("\n"), ctx);
  const own = (r) => JSON.parse(JSON.stringify(r));
  const text = (r) => r.parts.map((p) => p[0]).join(" ");
  const outs = [];
  const keep = (r) => { outs.push(text(r), r.said); return r; };

  // the hour: now at the hour now is in, its clock everywhere else, never a weekday
  const t0 = new Date("2026-08-02T14:00").getTime();
  const hours = (o = {}) => { const time = Array.from({ length: 24 }, (_, i) => { const d = new Date(t0 + i * 3.6e6), p = (v) => String(v).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`; });
    const f = (k, v) => time.map((_, i) => typeof o[k] === "function" ? o[k](i) : k in o ? o[k] : v);
    return { time, temp: f("temp", 75), feels: f("feels", 75), pop: f("pop", 0), code: f("code", 1), gust: f("gust", 12) }; };
  const hr = (o, i = 0, nowI = 0, gold) => keep(own(ctx.readHour(hours(o), i, nowI, gold)));
  assert.deepEqual(hr({}).parts, [["now", ""], ["75°", "b"], ["dry", ""]]);
  assert.equal(hr({}).said, "Now, 75 degrees, dry");
  assert.deepEqual(hr({ pop: null }, 1).parts.at(-1), ["rain –", ""], "a missing chance is a dash, never dry");
  assert.equal(hr({ pop: null }, 1).said, "3 pm, 75 degrees, rain chance unavailable");
  assert.equal(text(hr({ pop: 4 }, 1)), "3p 75° dry");
  assert.equal(text(hr({ pop: 5 }, 1)), "3p 75° rain 5%");
  assert.equal(text(hr({ pop: 3, code: 95 }, 3)), "5p 75° thunder 3%", "thunder on poor odds is still thunder");
  assert.equal(hr({ pop: 60, code: 95 }, 3).said, "5 pm, 75 degrees, 60 percent chance of rain, with thunder");
  assert.equal(text(hr({ pop: 70, code: 75, temp: 24, feels: 13 }, 17)), "7a 24° feels 13° snow 70%");
  assert.deepEqual(hr({ temp: 24, feels: 13 }, 17).parts[2], ["feels 13°", "cold"]);
  assert.deepEqual(hr({ temp: 93, feels: 101, pop: 22 }, 2).parts[2], ["feels 101°", "warm"]);
  assert.equal(hr({ temp: 93, feels: 101, pop: 22 }, 2).said, "4 pm, 93 degrees, feels like 101, 22 percent chance of rain");
  assert.equal(text(hr({ pop: 80, code: 67 }, 1)), "3p 75° freezing rain 80%");
  assert.equal(text(hr({ gust: 31, pop: 10 }, 21)), "11a 75° rain 10% gusts 31");
  assert.equal(hr({ gust: 31, pop: 10 }, 21).said, "11 am, 75 degrees, 10 percent chance of rain, gusts 31 miles an hour");
  assert.doesNotMatch(text(hr({ gust: 27 }, 1)), /gust/);
  assert.doesNotMatch(text(hr({ gust: null }, 1)), /gust/, "a missing gust says nothing");
  // windy is judged on the raw gust, the way the headline judges it: 27.6 is not windy, and is not printed 28
  assert.doesNotMatch(text(hr({ gust: 27.6 }, 1)), /gust/, "27.6 is under the headline's windy line");
  assert.equal(text(hr({ gust: 28 }, 1)), "3p 75° dry gusts 28");
  assert.equal(text(hr({ gust: 28.4 }, 1)), "3p 75° dry gusts 28");
  // thunder reported now is thunder in the now pill, whatever the hour's code says, on a fresh paint only
  const live = (o, code, nowI = 0, i = nowI) => keep(own(ctx.readHour(ctx.liveHour(hours(o), code, nowI), i, nowI)));
  assert.equal(text(live({ pop: 78, code: 80 }, 95)), "now 75° thunder 78%");
  assert.equal(text(live({ pop: 3, code: 3 }, 95)), "now 75° thunder 3%", "never dry under a storm overhead");
  assert.match(live({ pop: 3, code: 3 }, 99).said, /with thunder$/);
  assert.equal(text(live({ pop: 78, code: 80 }, 95, 0, 1)), "3p 75° rain 78%", "only the now hour takes the live code");
  assert.equal(text(live({ pop: 78, code: 80 }, 95, 3)), "now 75° rain 78%", "a cache's live reading is hours old");
  assert.equal(text(live({ pop: 78, code: 95 }, 61)), "now 75° thunder 78%", "live rain never paints over the hour's own thunder");
  // rain or snow reported now is never dry in the now pill, whatever the odds: the header said
  // "Light rain" and the headline "Raining now." over a pill that read "now 62° dry"
  assert.equal(text(live({ pop: 3, code: 3 }, 71)), "now 75° snow 3%");
  assert.equal(text(live({ pop: 3, code: 3 }, 61)), "now 75° rain 3%");
  assert.equal(text(live({ pop: 3, code: 3 }, 61, 3)), "now 75° dry", "a cache's live reading is hours old");
  // and an hour whose own sky is wet is never dry either
  assert.equal(text(hr({ pop: 3, code: 61 }, 1)), "3p 75° rain 3%");
  assert.equal(text(hr({ pop: 0, code: 51 }, 1)), "3p 75° rain 0%");
  assert.equal(text(hr({ pop: 2, code: 73 }, 1)), "3p 75° snow 2%");
  assert.doesNotMatch(text(hr({ feels: 77 }, 1)), /feels/, "two degrees off is the same number twice");
  assert.match(text(hr({ feels: 78 }, 1)), /feels 78°/);
  assert.deepEqual(hr({ temp: null, pop: 40 }, 1).parts.slice(1), [["–", "b"], ["rain 40%", ""]]);
  assert.equal(hr({ temp: null, pop: 40 }, 1).said, "3 pm, temperature unavailable, 40 percent chance of rain");
  assert.doesNotMatch(JSON.stringify(hr({ temp: null }, 1)), /0°/);
  // a cache opened late: now is the hour now is in, and the hours before it say their clock
  assert.equal(hr({}, 3, 3).parts[0][0], "now");
  assert.equal(hr({}, 0, 3).parts[0][0], "2p");
  assert.equal(hr({}, 12, 3).parts[0][0], "2a", "tomorrow's small hours carry no day");
  // inside a gold band the pill says golden hour, quietly, and nowhere else
  assert.deepEqual(hr({}, 6, 0, true).parts.at(-1), ["golden hour", "gold"]);
  assert.match(hr({}, 6, 0, true).said, /, golden hour$/);
  assert.doesNotMatch(text(hr({}, 4, 0, false)), /golden/);
  // the stops that say it: each stop whose own time is inside the band (now judged at now), and for
  // a band still to come that holds no whole hour, the one hour nearest its middle. The hour before
  // and the hour after a band stand outside its gold ("6p golden hour" under "golden hour 6:27–7:15p")
  const T = (s) => new Date(s).getTime(), run = hours().time;
  const gs = (bands, nowI = 0, now = T(run[0])) => [...ctx.goldStops(run, nowI, now, bands.map(([a, b]) => [T(a), T(b)]))].map((i) => run[i].slice(11, 16));
  assert.deepEqual(gs([["2026-08-02T19:55", "2026-08-02T20:50"]]), ["20:00"], "9p is past the band");
  assert.deepEqual(gs([["2026-08-02T18:28", "2026-08-02T19:17"]]), ["19:00"], "6p is before the band");
  assert.deepEqual(gs([["2026-08-03T06:06", "2026-08-03T06:58"]]), ["07:00"], "a band with no hour in it gets exactly one");
  assert.deepEqual(gs([["2026-08-03T07:02", "2026-08-03T07:51"]]), ["07:00"]);
  const dusk = hours().time.map((_, i) => new Date(T("2026-08-02T19:00") + i * 3.6e6)).map((d) => { const p = (v) => String(v).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`; });
  const gd = (a, b, now) => [...ctx.goldStops(dusk, 0, T(now), [[T(a), T(b)]])];
  assert.deepEqual(gd("2026-08-02T19:37", "2026-08-02T20:28", "2026-08-02T19:58"), [0, 1], "the now pill at 7:58 inside a 7:37 band says it");
  assert.deepEqual(gd("2026-08-02T19:25", "2026-08-02T20:15", "2026-08-02T19:05"), [1], "at 7:05, before a 7:25 band, now does not");
  assert.deepEqual(gd("2026-08-02T18:10", "2026-08-02T18:55", "2026-08-02T19:05"), [], "a band that has passed never falls back to now");
  for (let i = 0; i < 24; i++) assert.doesNotMatch(text(hr({}, i, 0)), /Mon|Sun|Tue|Wed|Thu|Fri|Sat/);

  // the day: the odds are always a number, and a missing one is the column's dash
  const wk = { time: ["2026-10-02", "2026-10-03", "2026-10-04"], temperature_2m_max: [84, 81, 101], temperature_2m_min: [67, 67, 76],
    weather_code: [1, 80, 95], precipitation_probability_max: [0, 45, null] };
  assert.equal(text(keep(own(ctx.readDay(wk, 0)))), "Today 84° / 67° rain 0%", "never dry, five days out");
  assert.deepEqual(own(ctx.readDay(wk, 1)).parts, [["Sat 10/3", ""], ["81°", "b"], ["/ 67°", "faint"], ["rain 45%", ""]]);
  assert.equal(text(keep(own(ctx.readDay(wk, 2)))), "Sun 10/4 101° / 76° thunder –");
  assert.equal(own(ctx.readDay(wk, 1)).said, "Saturday, October 3. Showers. High 81, low 67. 45 percent chance of rain.");

  // the water: the table's own number at a turn, about the rest, the water that is there at now
  const nowT = new Date("2026-09-27T13:05").getTime(), at = (s) => new Date(s).getTime();
  const tide = (s, gap) => keep(own(ctx.readTide(s, nowT, gap)));
  assert.equal(text(tide({ t: at("2026-09-27T18:15"), depth: 1.24, turn: null, now: false, dir: "falling" })), "6:15p ~1.2 ft");
  assert.equal(tide({ t: at("2026-09-27T18:15"), depth: 1.24, turn: null, now: false, dir: "falling" }).said, "6:15 pm, about 1.2 feet, falling");
  assert.equal(text(tide({ t: at("2026-09-27T13:36"), depth: 4.3, turn: "H", now: false, dir: "falling" })), "1:36p 4.3 ft", "a turn has no tilde");
  assert.equal(tide({ t: at("2026-09-27T13:36"), depth: 4.3, turn: "H", now: false, dir: "falling" }).said, "High tide at 1:36 pm, 4.3 feet");
  assert.equal(text(tide({ t: at("2026-09-27T19:45"), depth: -0.34, turn: null, now: false, dir: "rising" })), "7:45p ~−0.3 ft", "a true minus");
  // with the gauge two feet over: now is the table plus the gap, and everything else is the table's
  const surgeNow = tide({ t: nowT, depth: 6.2, turn: null, now: true, dir: "rising" }, 2);
  assert.deepEqual(surgeNow.parts, [["now", ""], ["~6.2 ft", "b"]]);
  assert.equal(surgeNow.said, "Now, about 6.2 feet, running 2 ft above the tide table, rising");
  const later = tide({ t: at("2026-09-28T01:30"), depth: 4.2, turn: null, now: false, dir: "rising" }, 2);
  assert.deepEqual(later.parts, [["Mon 1:30a", ""], ["~4.2 ft", "b"], ["by the table", "faint"]], "tomorrow gets its day");
  assert.equal(later.said, "Monday 1:30 am, about 4.2 feet by the tide table, rising");
  assert.doesNotMatch(text(tide({ t: at("2026-09-27T18:15"), depth: 1.2, turn: null, now: false, dir: "falling" }, null)), /table/, "no live gap, no table");
  assert.doesNotMatch(text(tide({ t: nowT, depth: 3, turn: null, now: true, dir: "rising" }, null)), /table|rising|falling/);
  assert.equal(text(tide({ t: at("2026-09-27T14:00"), depth: 3, turn: null, now: false, dir: "falling" })), "2p ~3.0 ft", ":00 is dropped");
  // said, noon and midnight are words, a midnight belongs to the day it ends, and a turn on
  // another day is "High tide Monday at 2 am", never "High tide at Monday 2 am"
  assert.match(hr({}, 22).said, /^noon, /);
  assert.match(hr({}, 10).said, /^midnight, /);
  assert.equal(tide({ t: at("2026-09-28T00:00"), depth: 3.4, turn: null, now: false, dir: "rising" }).said, "midnight, about 3.4 feet, rising");
  assert.equal(tide({ t: at("2026-09-28T02:00"), depth: 4.3, turn: "H", now: false, dir: "falling" }).said, "High tide Monday at 2 am, 4.3 feet");
  assert.equal(tide({ t: at("2026-09-28T12:00"), depth: 0.4, turn: "L", now: false, dir: "rising" }).said, "Low tide Monday at noon, 0.4 feet");

  // the moon: when a fishing time ends, or when the moon next rises or sets, and never a window the chart dropped
  const mNow = at("2026-08-02T15:20"), wins = [{ start: new Date("2026-08-02T15:30"), end: new Date("2026-08-02T17:30") }];
  const cross = [{ t: at("2026-08-02T22:32"), rise: true }, { t: at("2026-08-03T11:32"), rise: false }];
  const moon = (t, alt, w = wins) => keep(own(ctx.readMoon(at(t), mNow, alt, w, cross)));
  assert.deepEqual(moon("2026-08-02T16:15", 20).parts, [["4:15p", ""], ["fishing until 5:30p", "b"]]);
  assert.equal(moon("2026-08-02T16:15", 20).said, "4:15 pm, moon up, an almanac fishing time until 5:30 pm");
  assert.doesNotMatch(text(moon("2026-08-02T16:15", 20, [])), /fishing/, "a dropped window is never named");
  assert.equal(text(moon("2026-08-02T12:40", -30)), "12:40p moonrise 10:32p");
  assert.equal(moon("2026-08-02T12:40", -30).said, "12:40 pm, moon down, rises at 10:32 pm");
  assert.equal(text(moon("2026-08-03T01:10", 30)), "Mon 1:10a moonset 11:32a", "a target on the stop's own day carries no weekday");
  assert.equal(moon("2026-08-03T01:10", 30).said, "Monday 1:10 am, moon up, sets at 11:32 am");
  assert.equal(text(moon("2026-08-02T23:40", 5)), "11:40p moonset Mon 11:32a");
  assert.equal(moon("2026-08-02T23:40", 5).said, "11:40 pm, moon up, sets Monday at 11:32 am");
  assert.equal(text(moon("2026-08-02T22:32", 0)), "10:32p moonrise");
  assert.equal(text(keep(own(ctx.readMoon(mNow, mNow, 12, wins, [])))), "now moon up");
  // a window's edges keep now's seconds, so a quarter hour on the minute it ends is past it, and
  // never "fishing until" the same minute
  const edge = [{ start: new Date(at("2026-08-02T15:30") + 500), end: new Date(at("2026-08-02T17:30") + 500) }];
  assert.doesNotMatch(text(keep(own(ctx.readMoon(at("2026-08-02T17:30"), mNow, 20, edge, cross)))), /fishing/);
  assert.equal(text(keep(own(ctx.readMoon(at("2026-08-02T17:29"), mNow, 20, edge, cross)))), "5:29p fishing until 5:30p");

  // the month: snow only where the strip draws it, and one inch is an inch
  const N = ctx.NORMALS;
  assert.equal(text(keep(own(ctx.readMonth(N.mb, 0)))), "Jan 57° / 36° rain 3.8 in", "the coast never says snow");
  assert.equal(text(keep(own(ctx.readMonth(N.mb, 6)))), "Jul 90° / 73° rain 6.9 in");
  assert.equal(own(ctx.readMonth(N.mb, 6)).said, "July, normal high 90, low 73, 6.9 inches of rain");
  assert.equal(text(keep(own(ctx.readMonth(N.sp, 0)))), "Jan 41° / 24° rain 3.1 in snow 16 in");
  assert.equal(own(ctx.readMonth(N.sp, 0)).said, "January, normal high 41, low 24, 3.1 inches of rain, 16 inches of snow");
  assert.doesNotMatch(text(own(ctx.readMonth(N.sp, 6))), /snow/, "no snow in a farm July");
  assert.equal(own(ctx.readMonth(N.sp, 9)).said, "October, normal high 64, low 44, 2.7 inches of rain, 1 inch of snow");

  // the stops: quarter hours on the clock, now exact, and nothing within five minutes of now or a named point
  const q0 = at("2026-08-02T12:50"), q1 = at("2026-08-02T16:10"), qn = at("2026-08-02T13:23"), turn = at("2026-08-02T14:41");
  const qs = own(ctx.quarterStops(q0, q1, qn, [turn, at("2026-08-02T20:00")]));
  assert.ok(qs.includes(qn) && qs.includes(turn), "now and the turn at their own minute");
  assert.ok(!qs.includes(at("2026-08-02T20:00")), "nothing is made outside the span");
  for (const t of qs.filter((t) => t !== qn && t !== turn)) {
    assert.equal(new Date(t).getMinutes() % 15, 0, "quarter hours land on :00, :15, :30 and :45");
    assert.ok(Math.abs(t - qn) > 3e5 && Math.abs(t - turn) > 3e5, "nothing sits within 5 minutes of now or a turn");
  }
  assert.deepEqual([...qs].sort((a, b) => a - b), qs);

  // the interaction harness reads the charts with a real finger, since a synthetic event skips the
  // browser's gesture handling and that is how the hourly chart's freeze went unseen
  const inter = await readFile(new URL("tools/interactions.mjs", root), "utf8");
  assert.match(inter, /Input\.dispatchTouchEvent/);
  assert.match(inter, /hasTouch:true,isMobile:true/);
  assert.match(inter, /the slide is the chart's, not the page's/);
  // and nothing any reader says breaks the house voice
  for (const s of outs) {
    assert.doesNotMatch(s, /;|—/, `"${s}" has no semicolon or em dash`);
    assert.doesNotMatch(s, /breezy|blustery|wind-whipped/i);
  }
});

test("installable assets exist", async () => {
  await Promise.all([
    access(new URL("icon-180.png", root)),
    access(new URL("icon-512.png", root)),
  ]);
  // each PNG is the size its name and the manifest say (IHDR width and height), exported from
  // the one master, icon.svg
  for (const s of [180, 512]) {
    const png = await readFile(new URL(`icon-${s}.png`, root));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [s, s], `icon-${s}.png is ${s}x${s}`);
  }
  const svg = await readFile(new URL("icon.svg", root), "utf8");
  // the sun half-set on the horizon under the header's own rays, in the Mark's plum dusk, with
  // the Mark's wavelets drawn once and mirrored. The master carries everything it needs (the grain
  // is one embedded image), and no mask is made of <use>, which CoreSVG draws as empty
  assert.match(svg, /viewBox="0 0 1024 1024"/);
  assert.match(svg, /<stop offset="0" stop-color="#4A3F6B"\/>/, "the Mark's plum at the top of the sky");
  assert.match(svg, /<g transform="matrix\(-1 0 0 1 1024 0\)"><path d="M 128 716 q 40 -14 80 0"/, "the wavelets, mirrored");
  assert.doesNotMatch(svg, /<mask\b[^>]*>(?:(?!<\/mask>)[\s\S])*<use/, "masks drawn out in full");
  assert.doesNotMatch(svg, /href="(?!#|data:image\/png;base64,)/, "no outside references");
  assert.doesNotMatch(svg, /<text/, "no letters");
  // and it is built by tools/icon/build.mjs from C2_SHIP, the plum sky and the mirrored wavelets
  const gen = await readFile(new URL("tools/icon/gen.mjs", root), "utf8");
  assert.match(gen, /export const C2_SHIP = merge\(C2, C2_SHIP_PATCH\);/);
});

// the phone never loads icon.svg: it loads the PNGs, so the export is checked too. 8-bit RGB,
// non-interlaced, which is what tools/icon.mjs writes
const rgbPng = (b) => {
  assert.deepEqual([b[24], b[25], b[28]], [8, 2, 0], "8-bit RGB, not interlaced");
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), idat = [];
  for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) if (b.toString("latin1", o + 4, o + 8) === "IDAT") idat.push(b.subarray(o + 8, o + 8 + b.readUInt32BE(o)));
  const raw = inflateSync(Buffer.concat(idat)), s = w * 3, px = Buffer.alloc(h * s);
  for (let y = 0; y < h; y++) for (let x = 0, f = raw[y * (s + 1)]; x < s; x++) {
    const a = x > 2 ? px[y * s + x - 3] : 0, u = y ? px[(y - 1) * s + x] : 0, c = x > 2 && y ? px[(y - 1) * s + x - 3] : 0, p = a + u - c;
    const paeth = Math.abs(p - a) <= Math.abs(p - u) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - u) <= Math.abs(p - c) ? u : c;
    px[y * s + x] = raw[y * (s + 1) + 1 + x] + [0, a, u, (a + u) >> 1, paeth][f];
  }
  return { at: (x, y) => px.subarray((y * w + x) * 3, (y * w + x) * 3 + 3).toString("hex"),
    colours: new Set(Array.from({ length: w * h }, (_, i) => px.subarray(i * 3, i * 3 + 3).toString("hex"))).size };
};
test("the shipped icon is the export of icon.svg", async () => {
  // both sizes, sampled at the same places in the tile: the sun, the water under it, the plum at
  // the top of the sky and the top ray
  for (const n of [180, 512]) {
    const icon = rgbPng(await readFile(new URL(`icon-${n}.png`, root)));
    const rgb = (x, y) => icon.at(Math.round(x * n / 180), Math.round(y * n / 180)).match(/../g).map((h) => parseInt(h, 16));
    assert.ok(icon.colours > 3, `icon-${n}: anti-aliased, not the three-colour original`);
    const [sr, sg, sb] = rgb(90, 70), [wr, wg, wb] = rgb(90, 150), [kr, kg, kb] = rgb(90, 10), [yr, yg, yb] = rgb(90, 30);
    assert.ok(sr > 220 && sg > 170 && sb < 120, `icon-${n}: the sun, above the horizon`);
    assert.ok(wb > wr && wr < 90 && wg < 90, `icon-${n}: the water, dark blue under it`);
    assert.ok(kr > kg && kb > kg, `icon-${n}: the sky, dusk purple at the top`);
    assert.ok(yr > 220 && yg > 200 && yb > 160, `icon-${n}: the sun's top ray, cream`);
  }
  // the export renders the master once at 1024 and area-averages it down: a straight 180 render
  // leaves a pixel of khaki between the sun's ink and its lit rim
  const exporter = await readFile(new URL("tools/icon.mjs", root), "utf8");
  assert.match(exporter, /const SRC = 1024;/);
  assert.match(exporter, /encode\(n, n, areaAverage\(full, n\)\)/);
});

test("icon.svg is exactly what tools/icon builds", async () => {
  // no Chrome needed: the master is a string, built from C2_SHIP with the grain it already carries
  const svg = await readFile(new URL("icon.svg", root), "utf8");
  const grain = svg.match(/<image id="grainI" href="(data:image\/png;base64,[^"]+)"/)[1];
  const { master } = await import(new URL("tools/icon/gen.mjs", root));
  assert.equal(master(grain), svg, "rebuild with node tools/icon/build.mjs, then node tools/icon.mjs");
});

test("Tonight uses its own hours, connected words, and honest missing readings", async () => {
  const html=await readFile(new URL("index.html",root),"utf8");
  const ctx=vm.createContext({});
  vm.runInContext([
    html.match(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/)[0],
    html.match(/const known=v=>[^;]+;/)[0],
    html.slice(html.indexOf("function tonightBrief("),html.indexOf("function dailyBrief(")),
    "globalThis.tonightBrief=tonightBrief;"
  ].join("\n"),ctx);
  const dy={sunrise:["2026-10-06T07:10","2026-10-07T07:11"],sunset:["2026-10-06T18:40"],
    temperature_2m_min:[20,20],precipitation_probability_max:[100,100]};
  const run=(start="2026-10-06T20:00",n=12)=>{
    const times=Array.from({length:n},(_,i)=>{const t=new Date(start);t.setHours(t.getHours()+i);
      return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}T${String(t.getHours()).padStart(2,"0")}:00`});
    return{time:times,temp:times.map((_,i)=>70-i),pop:times.map(()=>5),code:times.map(()=>1)};
  };
  const say=h=>ctx.tonightBrief(dy,h,new Date("2026-10-06T20:30"));
  assert.equal(say(run()).text,"Down to 59° tonight.","daily rain odds and a different daily low do not become tonight's");
  const raining=run();raining.code[0]=61;raining.pop[0]=80;
  assert.equal(say(raining).text,"Rain likely tonight, with a low of 59°.","the current hour still belongs to tonight at half past");
  const thunder=run();thunder.temp[3]=null;thunder.code[3]=95;
  assert.equal(say(thunder).text,"Thunder possible tonight. Low unavailable.","a missing temperature cannot erase thunder, even at low odds");
  assert.equal(say(thunder).cls,"caution");
  const frozen=run();frozen.code[2]=66;frozen.pop[2]=20;frozen.code[6]=73;frozen.pop[6]=80;
  assert.equal(say(frozen).text,"Freezing rain possible tonight, with a low of 59°.","ice takes priority, but another event's odds cannot make the ice likely");
  frozen.code[2]=73;frozen.code[8]=95;
  assert.equal(say(frozen).text,"Snow likely and thunder possible tonight, with a low of 59°.","naming snow cannot silence thunder");
  const unknown=run();unknown.pop.fill(null);
  assert.equal(say(unknown).text,"Down to 59° tonight. Rain odds unavailable.");
  assert.equal(say(run("2026-10-06T20:00",5)).text,"Low unavailable tonight. Rain odds unavailable.","half a night is not a whole-night minimum");
  const gap=run();gap.time.splice(4,1);gap.temp.splice(4,1);gap.pop.splice(4,1);gap.code.splice(4,1);
  assert.match(say(gap).text,/Low unavailable/,"a missing hour cannot be hidden by complete endpoint readings");
  const dawn=run("2026-10-06T01:00",12);dawn.code[9]=95;dawn.pop[9]=90;
  assert.equal(ctx.tonightBrief(dy,dawn,new Date("2026-10-06T01:30")).text,"Down to 64° before morning.","a daytime storm after sunrise is outside the remaining night");
  assert.equal(ctx.tonightBrief({sunrise:[],sunset:[]},run(),new Date("2026-10-06T20:30")).text,"Forecast unavailable tonight.","no invented sunrise or nighttime interval");
});


test("the real morning refresh keeps tomorrow's sunrise for Tonight and only 24 slots for the chart", async () => {
  const html=await readFile(new URL("index.html",root),"utf8");
  const source=[
    html.match(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/)[0],
    html.match(/const known=v=>[^;]+;/)[0],
    html.slice(html.indexOf("function tonightBrief("),html.indexOf("function dailyBrief(")),
    html.slice(html.indexOf("function renderHours("),html.indexOf("function render(d,")),
    html.slice(html.indexOf('const cacheKey=id=>'),html.indexOf("async function fetchJSON(")),
    html.slice(html.indexOf("let REFRESH_ID=0;"),html.indexOf("\nconst SWAP="))
  ].join("\n");
  for(const [id,rise] of [["mb","07:11"],["sp","07:25"]]){
    let now=+new Date("2026-10-07T07:40"),response,offline=false;
    class Clock extends Date {constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
    const store=new Map(),paints=[],node={classList:{add(){},remove(){}},setAttribute(){}};
    const ctx=vm.createContext({Date:Clock,LOC:{id,lat:34,lon:-77,tz:"America/New_York"},
      locToday:()=>new Clock().getFullYear()+"-"+String(new Clock().getMonth()+1).padStart(2,"0")+"-"+String(new Clock().getDate()).padStart(2,"0"),
      document:{getElementById:()=>node},navigator:{onLine:!offline},
      localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
      fetchJSON:async url=>{if(offline)throw Error("offline");return url.includes("api.open-meteo.com")?response:{features:[]}},
      paintLoadingState:()=>{},
      render:(data,live,savedAt)=>{
        const projected=ctx.renderHours(data.hourly,data.current);
        paints.push({data,live,savedAt,...projected,night:ctx.tonightBrief(data.daily,projected.full,new Clock())});
      }});
    vm.runInContext(source,ctx);
    const time=Array.from({length:192},(_,i)=>{
      const d=new Date("2026-10-07T00:00");d.setHours(i);
      return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+"T"+String(d.getHours()).padStart(2,"0")+":00";
    });
    response={current:{time:"2026-10-07T07:30",temperature_2m:66,apparent_temperature:65,wind_gusts_10m:9,uv_index:2},
      daily:{sunrise:["2026-10-07T"+rise,"2026-10-08T"+rise],sunset:["2026-10-07T18:46"],
        temperature_2m_min:[20,20],precipitation_probability_max:[100,100]},
      hourly:{time,temperature_2m:time.map(()=>60),apparent_temperature:time.map(()=>59),
        precipitation_probability:time.map(()=>0),weather_code:time.map(()=>1),
        wind_speed_10m:time.map((_,i)=>i),wind_gusts_10m:time.map((_,i)=>i+1),uv_index:time.map((_,i)=>i/10)}};
    // The last sunrise hour is outside the old retained run and controls both readings.
    response.hourly.temperature_2m[31]=42;
    response.hourly.weather_code[31]=95;
    response.hourly.precipitation_probability[31]=80;
    response.hourly.temperature_2m[32]=-10; // daylight after sunrise cannot become the night's low
    await ctx.refresh();
    const first=paints.at(-1);
    assert.equal(first.data.hourly.time.length,185,id+": refresh retains the actual remaining provider run");
    assert.equal(first.night.text,"Thunder likely tonight, with a low of 42°.");
    for(const [key,values] of Object.entries(first.full)){
      assert.equal(first.h[key].length,24,key+": the chart and its companion readings keep their horizon");
      assert.deepEqual(Array.from(first.h[key]),Array.from(values.slice(0,24)),key+": fields stay aligned");
    }
    assert.deepEqual([first.h.temp[0],first.h.feels[0],first.h.gust[0],first.h.uv[0]],[66,65,9,2]);
    assert.equal(first.data.hourly.temp[0],60,"the live chart reading does not overwrite the cached forecast");
    assert.deepEqual([...store.keys()],["mbwx-"+id],"the existing cache key is preserved");
    const saved=ctx.readCache(id);assert.equal(saved.data.hourly.time.length,185);
    now+=2*36e5;offline=true;await ctx.refresh();
    assert.equal(paints.at(-1).live,false);
    assert.equal(paints.at(-1).night.text,first.night.text,"reopening a morning cache later keeps its full night");
    assert.equal(paints.at(-1).savedAt,saved.savedAt,"the failed refresh does not renew its age");
    const original=structuredClone(saved.data.hourly);
    for(const field of ["temp","pop"]){
      const missing=structuredClone(original);missing[field][24]=null;
      const brief=ctx.tonightBrief(saved.data.daily,missing,new Clock());
      if(field==="temp")assert.equal(brief.text,"Thunder likely tonight. Low unavailable.");
      else assert.equal(brief.text,"Thunder possible tonight, with a low of 42°.","unknown odds cannot make thunder likely");
    }
    const missingHour=structuredClone(original);
    for(const values of Object.values(missingHour))values.splice(24,1);
    assert.equal(ctx.tonightBrief(saved.data.daily,missingHour,new Clock()).text,"Low unavailable tonight. Rain odds unavailable.");
    const legacy={...saved.data,hourly:Object.fromEntries(Object.entries(original).map(([k,v])=>[k,v.slice(0,24)]))};
    store.set("mbwx-"+id,JSON.stringify({savedAt:saved.savedAt,data:legacy}));
    assert.equal(ctx.tonightBrief(legacy.daily,ctx.renderHours(ctx.readCache(id).data.hourly,legacy.current).full,new Clock()).text,
      "Low unavailable tonight. Rain odds unavailable.","old short caches are accepted without inventing their absent hours");
    now=saved.savedAt+6*36e5+1;assert.equal(ctx.readCache(id),null,"expiry remains enforced");
    now=+new Date("2026-10-07T23:30");ctx.writeCache(id,saved.data);
    now=+new Date("2026-10-08T00:10");assert.equal(ctx.readCache(id),null,"yesterday's forecast cannot survive midnight");
  }
  assert.match(html,/const c=d\.current,dy=d\.daily,m=d\.marine,\{full,h\}=renderHours\(d\.hourly,c\);/);
  assert.match(html,/const night=tonightBrief\(dy,full,now\);/);
});

test("condition words follow daylight and the copy previews cover both family places", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const shots = await readFile(new URL("tools/shots.mjs", root), "utf8");
  const ctx=vm.createContext({});
  vm.runInContext(html.match(/const WMO=\{[^\n]*/)[0]+"\n"+html.match(/const skyLabel=[^\n]*/)[0]+"\nglobalThis.label=skyLabel;",ctx);
  assert.equal(ctx.label(0,true),"Sunny");
  assert.equal(ctx.label(1,true),"Mostly sunny");
  assert.equal(ctx.label(0,false),"Clear");
  assert.equal(ctx.label(1,false),"Mostly clear");
  assert.equal(ctx.label(3,true),"Cloudy");
  assert.equal(ctx.label(66,true),"Freezing rain");
  assert.equal(ctx.label(null,true),"—");
  for(const name of ["words-day-porters-neck","words-night-porters-neck","words-day-shady-spring","words-night-shady-spring"])
    assert.ok(shots.includes(name),name+" has a phone preview");
});

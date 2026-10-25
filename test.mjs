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
  assert.match(worker, /mbwx-shell-v139/);
  // the loading shell is the Mark: the hour's paper, the place, one still drawing, and the line
  assert.match(html, /<html lang="en" class="loading" data-theme="light">/);
  assert.match(html, /id="loadMark"/);
  assert.match(html, /id="loadShell"/);
  assert.match(html, /function paintLoadMark\(\)\{/);
  assert.match(html, /function finishLoadMark\(\)\{/);
  assert.match(html, /function loadFrame\(\)\{/);
  assert.match(html.slice(html.indexOf("function paintLoadingState("), html.indexOf("function setLoc(")), /paintLoadMark\(\);/);
  assert.match(html.slice(html.indexOf('id="loadMark"'), html.indexOf('id="loadShell"')), /Reading the sky…/);
  assert.doesNotMatch(html.slice(html.indexOf("<body>"), html.indexOf('id="loadShell"')), /class="skel"/);
  assert.match(html, /held\(\);\n  finishLoadMark\(\);/);
  assert.match(html, /Tap the timestamp to try again\.";\n      finishLoadMark\(\);/);
  // the buoy's readings are data, so the worker never answers them from the shell's cache
  assert.match(worker, /u\.hostname\.includes\("weather\.gov"\)\|\|u\.hostname\.includes\("secoora\.org"\)\|\|/);
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
  assert.match(html, /function tonightBrief\(dy,h,now,told=null\)/);
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
  // Missing storm direction does not turn a moving system into a stationary one: only the advisory's
  // own STATIONARY says it is not moving.
  assert.match(html, /spd:mov\?\+mov\[3\]:still\?0:null/);
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
  // the loading shell paints the hour's paper over whatever the last place left inline
  const mark = html.slice(html.indexOf("function paintLoadMark("), html.indexOf("function finishLoadMark("));
  assert.match(mark, /rootEl\.setAttribute\("data-theme",dark\?"dark":"light"\);/);
  assert.match(mark, /root\.setProperty\("--sky1",stops\[0\]\);root\.setProperty\("--sky2",stops\[1\]\);root\.setProperty\("--sky3",stops\[2\]\);/);
  assert.match(mark, /root\.setProperty\("--on-sky",bright\?INK_ON:LIT_ON\);\n  root\.setProperty\("--off-sky",bright\?LIT_ON:INK_ON\);\n  root\.setProperty\("--scrim"/);
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
  // (under a storm the card's own rain, snow and freezing rain are not said again: `card`)
  assert.match(html, /let weather=ice\.length&&!card\("Freezing rain"\)\?`Freezing rain \$\{likely\(ice\)\?"likely":"possible"\}`:/);
  assert.match(html, /snow\.length&&!card\("Snow"\)\?`Snow \$\{likely\(snow\)\?"likely":"possible"\}`:/);
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
  // the UV words stand under the middles of their bands on the bar's 0-12 scale (low 0-3, moderate 3-6,
  // high 6-11), extreme flush right: set at the bands' starts they bunched in the left half (Josh, October 21
  // 2026: "the uv language feels crowded (to the left)")
  assert.match(html, /\.uv-scale span\{position:absolute;top:0;white-space:nowrap;transform:translateX\(-50%\)\}/);
  assert.match(html, /\.uv-scale span:nth-child\(1\)\{left:12\.5%\}\n\.uv-scale span:nth-child\(2\)\{left:37\.5%\}\n\.uv-scale span:nth-child\(3\)\{left:70\.8%\}/);
  assert.match(html, /\.uv-scale span:last-child\{right:0;transform:none\}/);
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
  assert.match(html, /renderScene\(sunrise,sunset,now,c,dark,LOC\.tide\?tideTrend\(d\.tides\):0,allowedFishWins,scene=>\{/);
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
  // a fiddler is down its burrow in a downpour, which also keeps the busiest frame under the ceiling
  assert.match(html, /const marshCrab=\(wet\|\|storm\)&&temp>=48&&!\[65,82\]\.includes\(\+code\)\?crabAt/);
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
  assert.match(html, /:is\(#sceneSvg,\.scene-layer\) \.fox-head,:is\(#sceneSvg,\.scene-layer\) \.fox-tail\{transform-box:view-box;transform-origin:0 0\}/);
  // the scene never runs an SVG filter: the picture repaints every frame something moves, so the
  // paper grain is a baked tile and nothing in renderScene carries filter=
  const scene = html.slice(html.indexOf("function renderScene("), html.indexOf("/* ── smooth path through points"));
  assert.doesNotMatch(scene, /filter="url/);
  // nor does the sky: the clouds' blur is worked out once into a canvas each drifting layer carries,
  // because a live blur on a moving group held WebKit to 10 to 23 frames a second. Three passes of
  // a five-pixel box at 3.6 CSS pixels to the canvas pixel are the filter's nine, with the coverage
  // and the stretch back up
  const skyFx = html.slice(html.indexOf("function renderSkyFx("), html.indexOf("function paintBolts("));
  assert.doesNotMatch(skyFx, /filter="url|feGaussianBlur/);
  assert.match(skyFx, /<div class="cloud drift" style="opacity:\$\{op\.toFixed\(3\)\};animation:drift /);
  assert.match(html, /function bakeClouds\(\)\{/);
  // one bake per render at the size shown: renderSkyFx re-observes instead of baking the loading
  // shell's sky, the canvases are placed in the sky's percentages, and a header that only grows
  // taller waits for the pens before it bakes again
  assert.match(skyFx, /if\(CLOUD_RO\)\{CLOUD_DUE=true;clearTimeout\(CLOUD_LATER\);const fx=document\.getElementById\("skyFx"\);CLOUD_RO\.unobserve\(fx\);CLOUD_RO\.observe\(fx\)\}\n  else bakeClouds\(\);/);
  assert.match(html, /left:pc\(b\.ax,W\),top:pc\(b\.ay,H\),width:pc\(b\.bx-b\.ax,W\),height:pc\(b\.by-b\.ay,H\)/);
  assert.match(html, /if\(Object\.values\(REVEAL\)\.some\(v=>v\.state==="running"\)\)\{CLOUD_LATER=setTimeout\(later,400\);return\}/);
  assert.match(html, /const CLOUD_BLUR=9,CLOUD_BOX=5,CLOUD_PX=2\*CLOUD_BLUR\/CLOUD_BOX,/);
  // clouds are drawn in the scene only when there are clouds to draw, and they really drift:
  // two direction keywords in one animation shorthand made Chrome drop it and nothing moved
  assert.equal(html.split("cloud>=10&&cloud<=85&&!wet&&!storm&&!fog").length - 1, 3);
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
  assert.match(html, /if\(R\.state==="running"\)\{R\.job=\(R\.job\|0\)\+1;revealApply\(k\);return\}/);
  // the pen's keyframes are built on the frame after the chart is in the page, and a
  // newer continue or finish drops the one still waiting
  assert.match(html, /const job=R\.job=\(R\.job\|0\)\+1;/);
  assert.match(html, /requestAnimationFrame\(\(\)=>\{if\(R\.job===job&&R\.state==="running"\)revealApply\(k\)\}\)/);
  // the animations keep the samples a straight join would miss, on the same clock
  assert.match(html, /function penIdx\(samp,more\)/);
  assert.match(html, /if\(at>=0&&worst>\.34\)/);
  // the first paint yields: picture, then the hourly pen, then the week pen, then the rest
  assert.match(html, /function paintSoon\(gen,fn\)\{requestAnimationFrame\(\(\)=>\{if\(gen===RENDER_GEN\)fn\(\)\}\)\}/);
  assert.match(html, /function paintAfter\(gen,fn\)\{requestAnimationFrame\(\(\)=>requestAnimationFrame\(\(\)=>requestAnimationFrame\(\(\)=>\{if\(gen===RENDER_GEN\)fn\(\)\}\)\)\)\}/);
  // (and whose reading it is, so a refresh past the cache's six hours can fall back on the page's own)
  assert.match(html, /savedAt=savedAt\|\|\(LAST\?\.d===d\?LAST\.savedAt:Date\.now\(\)\);\n  LAST=\{d,live,savedAt,loc:LOC\.id\};\n  sceneResume\(\);/);
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
  assert.match(html, /snow\.length&&!card\("Snow"\)\?`Snow \$\{likely\(snow\)\?"likely":"possible"\}`:/);
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
  // the ridge's drops and the house's (Porters Neck) come from one helper, each with its own mask
  assert.match(html, /mask="url\(#\$\{id\}\)"/);
  assert.match(html, /nearRainLayer\(\{W,top:nrTop,land:nrLand,code,wind,downwind,dark,seed:5347,id:"ridgerain"\}\)/);
  assert.match(html, /nearRainLayer\(\{W,top:rainTop,land:rainLand,code,wind,downwind,dark,seed:5381,id:"pnrain"\}\)/);
  // it fades in across the crest instead of starting on a cut line
  assert.match(html, /id="\$\{id\}fade" gradientUnits="userSpaceOnUse"/);
  // and it lands in the field: gone by the grass line, never run off the foot of the frame
  // into the page, which is where a downpour turned into a mess of white bars over the pond
  assert.match(html, /const nrTop=base-rTop\*\.94,nrLand=base\+4;/);
  assert.match(html, /span=land-top;/);
  assert.doesNotMatch(html, /span=H\+10-nrTop/);
  // a drop is 2.6 frames long at 30Hz, so a phone that steps down from 60 still
  // overlaps the streak. The 60Hz step and the 64px cap left light rain short of that.
  // taken on screen: a scene unit is appW()/W px since the frame came closer in, so in units the
  // step and the fall are divided by it, or the near rain fell 1.35 times the sky layer's speed
  assert.match(html, /const k=appW\(\)\/W,step=968\/k\/nrFall\/30/);
  assert.match(html, /const d=travel\*k\*nrFall\/968\*/);
  assert.match(html, /const len=clamp\(step\*2\.6,22,span\*\.72\)/);
  assert.doesNotMatch(html, /968\/nrFall\/60/);
  assert.doesNotMatch(html, /Math\.min\(64,span\*\.72\)/);
  // sky streaks use the same 30Hz step, take their phase off the clock, and are not
  // rebuilt when the rain itself has not changed. They keep falling through the pen: holding them
  // while the hours or the week drew froze every streak mid-air for about three seconds each time
  // the app opened in the rain, and saved nothing, because the drops are compositor transforms.
  assert.match(html, /Math\.min\(176,880\/d\/30\*2\.6\)/);
  assert.match(html, /\(nowS\+seed\*d\)%d/);
  assert.match(html, /rainKey!==RAIN_KEY\|\|rf\.childElementCount!==count/);
  assert.match(html, /pictureKey===SCENE_KEY&&SCENE_META&&sceneSvg\.childElementCount\)\{andThen\(SCENE_META\);return\}/);
  assert.doesNotMatch(html, /rain-held|syncRainHold|\.rainfx\.held/);
  // dealt one to a slot across the frame, not thrown in clumps
  assert.match(html, /const tx=-34\+\(i\+\.15\+nr\(\)\*\.7\)\*slot/);
  // the pond answers the rain rather than going glass-still under it, which it used to do
  assert.match(html, /if\(wet&&!snowing&&!PRM\)\{\s*const pw2=mulberry\(6197\),rings=2\+Math\.round\(rainK\*3\)/);
  assert.match(html, /const ps=mulberry\(2884\),ticks=3\+Math\.round\(rainK\*5\)/);
  // snow neither rings the water nor gets a second layer of falling lines
  assert.match(html, /const nearRainL=wet&&!snowing&&!PRM\?nearRainLayer\(\{W,top:nrTop/);
  assert.match(html, /const nearRainL=wet&&!snowing&&!PRM\?nearRainLayer\(\{W,top:rainTop/);
  assert.doesNotMatch(html, /const nearRainL=wet&&!PRM\?/);
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
  // the moon chart draws the same allowed list, and reads the whole run for its water and for why
  assert.match(html, /if\(LOC\.fish\)renderMoon\(css,allowedFishWins,now,\{h:full,why:fishWhy\(full,now,\{storm,warning,ice:isIce\(\+c\.weather_code\),\n    stay:stayed\?coveredHours\(h,dy,now\)\.hrs:null,shown:allowedFishWins,\n    until:h\.time\?\.length\?new Date\(h\.time\[h\.time\.length-1\]\)\.getTime\(\)\+36e5:\+now\}\)\}\);/);
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
  assert.match(html, /#moonSvg \.leap-body,#moonSvg \.leap-ring,#moonSvg \.leap-drops\{animation-play-state:paused\}/);
  assert.match(agents, /Josh approved fish on both this moon line and the Shady Spring pond/);
  assert.match(agents, /never a report of actual fish activity/);
  assert.match(agents, /The animation ceiling stays 120/);
});

test("the moon explained (Josh, October 10 2026): the pond, its chop, its resting fish, and why the fishing times went", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const agents = await readFile(new URL("AGENTS.md", root), "utf8");
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, `${a} is extractable`); return html.slice(i, j); };
  // the solunar windows are fixed here, so each window's own hours are what is tested
  let wins = [];
  const ctx = vm.createContext({ solunarWindows: () => wins, clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    known: (v) => v != null && v !== "" && Number.isFinite(+v), isIce: (w) => [56, 57, 66, 67].includes(w) });
  vm.runInContext([cut("function rowPlace(", "function moonNoteFit("), cut("const FISH_REACH=", "function chartFish("),
    "Object.assign(globalThis,{rowPlace,fishWhy,chopLevel,pondSurface,fishSpots,FISH_REACH,FISH_REST});"].join("\n"), ctx);
  const own = (r) => r == null || typeof r !== "object" ? r : JSON.parse(JSON.stringify(r));

  // The chop is the run's own gusts, B's lines: flat under 22, a light chop from 22, choppy from 30,
  // the gust that takes a fishing time. A gust the run does not carry is flat water, never a gale
  for (const g of [null, undefined, "", NaN, "x", 0, 12, 21.9]) assert.equal(ctx.chopLevel(g), 0, `gust ${g} is flat`);
  for (const g of [22, 25, 29.9, "24"]) assert.equal(ctx.chopLevel(g), 1, `gust ${g} is a light chop`);
  for (const g of [30, 41, 51]) assert.equal(ctx.chopLevel(g), 2, `gust ${g} is choppy`);
  // the surface rides on the horizon from x0 to x1 exactly, flat before the run starts, past its end
  // and wherever the gust is unknown, and it never moves the scale under it
  const hour = (h) => `2026-10-10T${String(h).padStart(2, "0")}:00`, t = (h) => new Date(hour(h)).getTime();
  const flat = own(ctx.pondSurface(null, 16, 334, t(10), t(20), 120));
  assert.equal(flat[0].x, 16); assert.equal(flat.at(-1).x, 334);
  assert.ok(flat.every((p) => p.y === 120 && p.chop === 0), "no run is a flat pond");
  const run = { time: [12, 13, 14, 15, 16, 17].map(hour), gust: [12, 25, 25, 36, 36, null] };
  const S = own(ctx.pondSurface(run, 0, 400, t(10), t(20), 120)), at = (h) => S.filter((p) => p.x >= (h - 10) * 40 + 12 && p.x < (h - 9) * 40 - 12);
  assert.ok(at(10).every((p) => p.y === 120) && at(11).every((p) => p.y === 120), "before the run starts the water is flat");
  assert.ok(at(12).every((p) => p.chop === 0), "a 12 mph hour is flat");
  assert.ok(at(13).every((p) => Math.abs(p.chop - 1.1) < 1e-9) && at(13).some((p) => p.y < 119), "a 25 mph hour stands up in a light chop");
  assert.ok(at(15).every((p) => Math.abs(p.chop - 2.2) < 1e-9), "a 36 mph hour is choppy");
  assert.ok(Math.min(...at(15).map((p) => p.y)) < Math.min(...at(13).map((p) => p.y)) - 1, "choppy stands higher than a light chop");
  assert.ok(at(17).every((p) => p.y === 120) && at(19).every((p) => p.y === 120), "an unknown gust and the hours past the run are flat");
  assert.ok(S.every((p) => p.y > 120 - 5 && p.y < 120 + 2), "the chop stays a few pixels either side of the horizon");
  assert.match(html, /const surf=pondSurface\(h,x0,xR,t0,t1,hz\),rough=surf\.some\(p=>p\.chop>0\);/);
  assert.match(html, /if\(surf\.some\(p=>p\.chop>=1\.4\)\)for\(let row=0;row<3;row\+\+\)\{/, "wavelets only in the choppy water");
  // and the moon's line is cut at that surface: up over it, dotted under the water, which is drawn over the dots
  assert.match(html, /<clipPath id="moonUp"><path d="M 0 \$\{sy0\.toFixed\(1\)\} \$\{sLine\} L \$\{W\} \$\{sy1\.toFixed\(1\)\} L \$\{W\} 0 L 0 0 Z"\/><\/clipPath>/);
  const tpl = cut("function renderMoon(", "function yearTitle(");
  const order = ['<g clip-path="url(#moonDown)">', "${fish.svg}", 'fill="url(#pondFill)" clip-path="url(#pondArea)"/>', "${caps}", '<path class="pond-line"', '<g class="xp-cursor"></g>', "${labels}"].map((k) => tpl.indexOf(k));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), "the dots, the fish, the water over them, the wavelets, the surface, then the words: " + order);
  assert.doesNotMatch(tpl, /class="wline"[^\n]*css\.water/, "the surface is not the line the pen draws; the moon's is");

  // Why there are no fishing times, from the page's own readings, and only when the weather took
  // every one: storms, a warning and ice now first, then ice, thunder and wind in the times' own hours
  // or the hours the card said stay in for. A gap is nobody's reason. Never a time
  const now = new Date("2026-10-10T12:30");
  const W2 = [{ start: new Date("2026-10-10T12:10"), end: new Date("2026-10-10T14:10"), major: true },
    { start: new Date("2026-10-10T18:16"), end: new Date("2026-10-10T19:16"), major: false },
    { start: new Date("2026-10-11T00:38"), end: new Date("2026-10-11T02:38"), major: true }];
  const hrs = (n, o = {}) => { const t0 = new Date("2026-10-10T12:00").getTime(), p = (v) => String(v).padStart(2, "0");
    const time = Array.from({ length: n }, (_, i) => { const d = new Date(t0 + i * 36e5); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`; });
    return { time, gust: time.map((s, i) => typeof o.gust === "function" ? o.gust(i) : o.gust ?? 12), code: time.map((s, i) => typeof o.code === "function" ? o.code(i) : o.code ?? 3) }; };
  wins = W2;
  const why = (h, o) => ctx.fishWhy(h, now, o);
  assert.equal(why(hrs(30, { gust: 40 }), { shown: [W2[1]] }), null, "a time still drawn means nothing to explain");
  assert.equal(why(hrs(30), {}), null, "a calm day explains nothing");
  assert.equal(why(hrs(30), { storm: true }), "storms");
  assert.equal(why(hrs(30), { warning: { event: "Winter Storm Warning" } }), "weather warning");
  assert.equal(why(hrs(30), { ice: true }), "icy");
  assert.equal(why(hrs(30, { gust: 36 }), {}), "too windy", "a gale through every time");
  assert.equal(why(hrs(30, { gust: 36, code: (i) => i === 7 ? 95 : 3 }), {}), "thunder", "thunder is named before wind");
  assert.equal(why(hrs(30, { gust: 36, code: (i) => i === 13 ? 66 : 3 }), {}), "icy", "and ice before thunder");
  assert.equal(why(hrs(30, { gust: (i) => i === 13 ? null : i === 12 || i === 14 ? 12 : 36 }), {}), null, "a time lost to an unknown gust is nobody's reason");
  assert.equal(why(hrs(30, { gust: (i) => i === 13 ? null : 36 }), {}), "too windy", "and one with a gale in it as well went for the gale");
  assert.equal(why(hrs(8, { gust: 36 }), {}), null, "nor a time past the end of the run");
  assert.equal(why(hrs(30, { gust: (i) => i < 3 ? 36 : 12 }), {}), null, "a time clear of the wind was not taken by it");
  assert.equal(why(hrs(30, { gust: (i) => i === 0 ? 41 : 12 }), { stay: [0, 1, 2, 3] }), "too windy", "the card's stay-in for a gale now explains times clear on their own hours");
  assert.equal(why(hrs(30), { stay: [0, 1, 2, 3] }), null, "a stay-in with no reading behind it says nothing");
  // only the times the chart could ever draw count: a gale through all of them, with one calm time
  // past the hours fishWindows reads (the chart's last two hours), is still "too windy". On October 10
  // 2026 a day-long gale left the chart empty with only "new moon" beside it for that reason
  const reach = new Date("2026-10-10T12:00").getTime() + 12 * 36e5;
  assert.equal(why(hrs(30, { gust: (i) => i < 12 ? 40 : 12 }), {}), null, "a calm time the chart can draw still stands");
  assert.equal(why(hrs(30, { gust: (i) => i < 12 ? 40 : 12 }), { until: reach }), "too windy", "and one past its reach is no reason to say nothing");
  wins = [];
  assert.equal(why(hrs(30, { gust: 40 }), {}), null, "no almanac time in the span, nothing to explain");
  wins = W2;
  for (const o of [{ storm: true }, { warning: {} }, { ice: true }, {}]) assert.doesNotMatch(String(why(hrs(30, { gust: 40 }), o)), /\d|until|after|later|from|tomorrow/, "a reason, never a time");
  // it goes in the note after the phase, the reason alone when both do not fit beside the title,
  // fitted again when the fonts land; and the chart's spoken label says it after "none clear"
  assert.match(html, /moonNoteFit\(moonName\(m\)\+\(why\?" · "\+why:""\),why\);/);
  assert.match(html, /if\(note\.dataset\.why&&title&&note\.offsetTop>title\.offsetTop\+4\)note\.textContent=note\.dataset\.why;/);
  assert.match(html, /\$\{said\.length\?said\.join\(", "\):"none clear"\}\$\{!said\.length&&why\?", "\+why:""\}\./);
  // and the farm's stay-in rule is the card's, unchanged: the chart is handed only the allowed list
  assert.match(html, /const stayed=LOC\.fish&&farm&&!farm\.fish&&fishWindows\(h,now\)\.length>0;/);
  assert.match(html, /const allowedFishWins=LOC\.fish&&farm\?\.fish\?fishWindows\(h,now\):\[\];/);

  // Labels in a row: a crowded row stands a real gap apart, moves apart about evenly, and a label
  // that would sit too far off its point gives way, the lowest priority first
  const row = (items, lo, hi, give, gap) => own(ctx.rowPlace(items, lo, hi, give, gap));
  const night320 = row([{ pri: 2, cx: 62, hw: 25 }, { pri: 1, cx: 112, hw: 21 }, { pri: 2, cx: 152, hw: 25 }, { pri: 1, cx: 202, hw: 21 }], 16, 264, 18, 12.4);
  assert.equal(night320.length, 4, "four starts at 320 all stand");
  for (let i = 1; i < 4; i++) assert.ok(night320[i].x - night320[i].hw - (night320[i - 1].x + night320[i - 1].hw) >= 12.4 - 1e-6, "a character and a half apart");
  const pair = row([{ pri: 1, cx: 100, hw: 20 }, { pri: 1, cx: 120, hw: 20 }], 0, 400, 20, 10);
  assert.ok(Math.abs((100 - pair[0].x) - (pair[1].x - 120)) < 1e-6, "a crowded pair moves apart evenly");
  assert.deepEqual(row([{ pri: 1, cx: 100, hw: 20, k: "minor" }, { pri: 2, cx: 104, hw: 20, k: "major" }], 0, 400, 12, 10).map((m) => m.k), ["major"], "the minor gives way");
  assert.ok(row([{ pri: 1, cx: 2, hw: 20 }], 0, 400, 12, 10)[0].x === 20, "an end label steps inside the edge");

  // Every fishing time drawn gets one fish, a major's bigger than a minor's, seated on the water
  // inside its own band, so each fish stands for its own time: at the band's middle, or the nearest
  // spot inside the band where its whole leap clears the moon's disc. When none does (the time under
  // way at moonrise or moonset, the moon on the water in its band) it rests still in its band, sunk
  // clear of the disc. It was walked along the whole chart, and on October 10 2026 rested hours past
  // its time under the gale that took the next one. No two resting fish touch
  const X = (t) => t, hz = 120, base = { hz, W: 400, bottom: 200 };
  const bands = [{ major: true, a: 40, b: 64 }, { major: false, a: 180, b: 192 }, { major: true, a: 300, b: 324 }];
  const sp = own(ctx.fishSpots(bands, X, { ...base, disc: null }));
  assert.equal(sp.length, 3, "a fish for every time");
  assert.deepEqual(sp.map((f) => [f.x, f.s, f.still]), [[52, 1.15, false], [186, .88, false], [312, 1.15, false]], "in the middle of each band, majors bigger, all leaping");
  const R = ctx.FISH_REACH, box = (f, Q) => [f.x - Q.l * f.s, hz - Q.up * f.s + (f.dy || 0), f.x + Q.r * f.s, hz + Q.down * f.s + (f.dy || 0)];
  const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  // a fish resting still may sit up to half its resting width past its band, its body still across it,
  // when nothing inside the band keeps it off the moon or its neighbours; a leap starts inside it
  const inBand = (f) => { const slack = f.still ? ctx.FISH_REST.l * f.s / 2 : 0; return f.x >= f.a - slack - 1e-9 && f.x <= f.b + slack + 1e-9; };
  // a major overhead in the band under way, with the disc high in the sky: the leap moves inside the band to clear it
  const high = [52, 70, 64, 90];
  const over = own(ctx.fishSpots([{ major: true, now: true, a: 40, b: 64 }], X, { ...base, disc: high }));
  assert.ok(inBand(over[0]) && !over[0].still && !hit(box(over[0], R), high), "it leaps from inside its band, clear of the disc: " + over[0].x);
  // the moon setting into the pond in the band under way: no spot in the band clears the leap
  const disc = [32, 108, 57, 133];
  const busy = own(ctx.fishSpots([{ major: false, now: true, a: 40, b: 52 }, { major: true, a: 100, b: 124 }], X, { ...base, disc }));
  assert.equal(busy.length, 2, "the time under way keeps its fish");
  assert.ok(inBand(busy[0]), "inside its own band, never hours away: " + busy[0].x);
  assert.equal(busy[0].still, true, "resting, with no leap the moon is in the way of");
  assert.ok(!hit(box(busy[0], ctx.FISH_REST), disc), "sunk clear of the disc");
  assert.equal(busy[0].x, 52, "at the side of its band farthest from the moon");
  assert.ok(inBand(busy[1]) && !busy[1].still, "and the next fish keeps its own band and its leap");
  assert.ok(!hit(box(busy[0], ctx.FISH_REST), [box(busy[1], ctx.FISH_REST)[0] - 4, 0, box(busy[1], ctx.FISH_REST)[2] + 4, 400]), "resting fish keep apart");
  for (const f of [...sp, ...busy]) assert.ok(box(f, f.still ? ctx.FISH_REST : R)[3] <= 200, "over the times under the water");
  // a crowded run never pushes a fish into its neighbour's band
  const crowd = own(ctx.fishSpots([{ major: false, now: true, a: 30, b: 41 }, { major: true, a: 46, b: 68 }, { major: false, a: 80, b: 91 }], X, { ...base, disc: [24, 108, 48, 133] }));
  assert.ok(crowd.every(inBand), "every fish in its own band: " + crowd.map((f) => f.x).join(", "));
  // and the chart seats every fish on the pond's surface, in its band, a still one sunk just clear of the moon
  assert.match(html, /leapFish\(x,hz\+dy,s,pal,\{offset,delay:\(Date\.now\(\)\/1000\+offset\)%18,still,band:\[X\(a\),X\(b\)\]\}\)/);
  assert.match(html, /#moonSvg \.leap-still \.leap-body,#moonSvg \.leap-still \.leap-ring,#moonSvg \.leap-still \.leap-drops\{animation:none\}/);
  assert.match(html, /const fish=chartFish\(wins,X,now,css,rvAt,\{t0,t1,hz,W,bottom:labTop-2,floor:botY-1,x0,xR,disc:discBox\}\);/);
  // a moon just under the water, underfoot: a resting fish over it stays up rather than sinking onto it
  // (October 28 2026 3:20 p.m. at 320: it was sunk 25px, onto the disc)
  const uDisc = [25.2, 168.1, 50.4, 193.3], drawn = [28.2, 171.1, 47.4, 190.3], uhz = 150.5;
  const uf = own(ctx.fishSpots([{ major: true, now: true, a: 24, b: 42 }], X, { hz: uhz, W: 280, bottom: 196, floor: 187, disc: uDisc }))[0];
  const ubox = (f, Q) => [f.x - Q.l * f.s, uhz - Q.up * f.s + f.dy, f.x + Q.r * f.s, uhz + Q.down * f.s + f.dy];
  assert.ok(inBand(uf), "in its band");
  assert.ok(uf.dy <= 0, "not sunk onto a moon under it: " + JSON.stringify(uf));
  assert.equal(hit(ubox(uf, ctx.FISH_REST), drawn), false, "clear of the moon under the water: " + JSON.stringify(uf));
  // a resting fish sunk under a moon on the water never hangs past the pond's floor
  const low = own(ctx.fishSpots([{ major: true, now: true, a: 40, b: 52 }], X, { hz: 120, W: 400, bottom: 200, floor: 145, disc: [34, 104, 58, 128] }))[0];
  assert.ok(box(low, ctx.FISH_REST)[3] <= 145 + 1e-6, "its resting body stays in the water: " + JSON.stringify(low));
  // neighbours keep their 4px at rest, and one's leap never reaches the other resting
  const pair2 = own(ctx.fishSpots([{ major: true, a: 60, b: 82 }, { major: false, a: 108, b: 117 }], X, { ...base, disc: null }));
  const occ = (f) => box(f, f.still ? ctx.FISH_REST : R);
  assert.ok(!hit(occ(pair2[0]), box(pair2[1], ctx.FISH_REST)) && !hit(occ(pair2[1]), box(pair2[0], ctx.FISH_REST)), "no dive into a resting neighbour: " + JSON.stringify(pair2.map((f) => [f.x, f.still])));
  assert.ok(pair2.every(inBand));
  // and a spot at the very end of a band counts: a fish that has room to leap there leaps
  const edge = own(ctx.fishSpots([{ major: false, a: 64.35, b: 75.51 }], X, { ...base, disc: [31.29, 108, 75.4 - 24 * .88, 133] }))[0];
  assert.equal(edge.still, false, "it leaps from the band's end: " + edge.x);
  assert.doesNotMatch(tpl, /over=true|ring:!over/, "no fish leaps out of the moon");

  // The chart's fish rest where you can see them: their own keyframes start and end on the resting
  // pose, which is also their plain style, so a paused fish, one past the budget and one under reduced
  // motion all rest visibly under the water. Each is three animations on the staggered 18s clock, all
  // transforms and opacity, under the porchFish name fishMotion pauses and resumes
  const kf = (name) => { const i = css.indexOf(`@keyframes ${name}{`); assert.ok(i > 0, name); return css.slice(i, css.indexOf("\n}", i)); };
  const rest = kf("porchFishLeap").match(/0%,30%,100%\{opacity:([\d.]+);transform:([^}]*)\}/);
  assert.ok(rest && +rest[1] >= .5, "the chart's fish is visible at rest");
  assert.match(rest[2], /^translate\(0,10px\) rotate\(-3deg\)$/, "resting just under the water");
  assert.ok(css.includes(`#moonSvg .leap-body{opacity:${rest[1]};transform:${rest[2]};animation:porchFishLeap 18s linear infinite;`), "the plain style is the resting pose");
  for (const n of ["LeapRing", "LeapDrops"]) assert.match(kf(`porchFish${n}`), /0%,4%(,100%)?\{opacity:0;/, `the ${n} is gone at rest`);
  for (const n of ["Leap", "LeapRing", "LeapDrops"]) assert.doesNotMatch(kf(`porchFish${n}`).replace(/@keyframes \w+\{/, ""), /[{;](?!opacity|transform)[a-z-]+:/, `${n} moves by transform and opacity alone`);
  assert.match(html, /<g class="leap-body">\$\{fish\}<\/g>\n    <ellipse class="leap-ring" rx="10" ry="2"\/>\n    <g class="leap-drops">/);
  assert.match(html, /function leapFish\(x,y,s,pal,\{offset=0,delay=0,still=false,band=null\}=\{\}\)\{/);
  assert.match(html, /transform="translate\(\$\{x\.toFixed\(2\)\} \$\{y\.toFixed\(2\)\}\) scale\(\$\{s\}\)" style="--bite-delay:-\$\{delay\.toFixed\(2\)\}s;--bite-water:\$\{pal\.water\}"/);
  // the scene's pond fish keeps its own clock exactly: gone between leaps, drawn only while a time
  // is under way, never under reduced motion
  assert.ok(css.includes(`@keyframes porchFishRise{
  0%,4%,15%,100%{opacity:0;transform:translate(-5px,8px) rotate(-24deg)}
  4.5%{opacity:1;transform:translate(-5px,4px) rotate(-27deg)}
  6%{opacity:1;transform:translate(-3px,-5px) rotate(-24deg)}
  8%{opacity:1;transform:translate(0,-9px) rotate(-5deg)}
  10%{opacity:1;transform:translate(3px,-6px) rotate(17deg)}
  12%{opacity:1;transform:translate(5px,2px) rotate(30deg)}
  13.5%{opacity:0;transform:translate(6px,10px) rotate(34deg)}
}`), "the pond fish's leap is unchanged");
  assert.match(css, /\.bite-body\{opacity:0;animation:porchFishRise 18s linear infinite;animation-delay:var\(--bite-delay,0s\)\}/);
  assert.match(html, /pondFx\+=fishBite\(pcx-prx\*\.08,base\+13,\.88,\{\.\.\.inkPal\(INK\.fish\),water:dark\?"#B7D6E1":"#426E80"\},\{pond:true,delay:\(Date\.now\(\)\/1000\)%18\}\);/);
  assert.match(html, /function fishBite\(x,y,s,pal,\{delay=0,pond=false,tilt=0,offset=0\}=\{\}\)\{/);
  assert.doesNotMatch(css, /fish-still/);

  // The moon's own times sit under the water, MOONRISE and MOONSET, on a tick from where the curve
  // crosses the surface, quieter than the fishing times over the picture: faint, at the regular weight
  assert.match(tpl, /const word=c\.rise\?"MOONRISE":"MOONSET",time=clock\(new Date\(c\.t\)\);/);
  assert.match(tpl, /font-size="\$\{wfs\}" letter-spacing="\.06em" fill="\$\{css\.faint\}" \$\{halo\}>\$\{mk\.word\}<\/text>/);
  assert.match(tpl, /font-size="\$\{tfs\.toFixed\(1\)\}" font-weight="400" fill="\$\{css\.faint\}" \$\{halo\}>\$\{mk\.time\}<\/text>/);
  assert.match(tpl, /font-size="\$\{\(10\.5\*fs\)\.toFixed\(1\)\}" font-weight="600" fill="\$\{css\.wink\}"/, "the fishing times stay the answer");
  assert.match(tpl, /const tfs=9\.2\*fs,wfs=9\.5,/, "the moon's time is smaller than a fishing time's 10.5");
  // the disc shows its phase on light paper: a deep dark side, a white lit side, the rim outside the face
  assert.match(tpl, /<circle r="\$\{r\}" fill="\$\{MOON_INK\}" opacity="\$\{dark\?\.55:\.88\}"\/>/);
  assert.match(tpl, /fill="\$\{dark\?"#FFF6E2":"#FFFFFF"\}"\/>\n    <circle r="\$\{r\+\.5\}" fill="none" stroke="\$\{MOON_INK\}" stroke-width="1"\/>/);
  // and the explorer stops on them and says them, PageUp and PageDown included
  assert.match(tpl, /const named=ts\.map\(\(t,i\)=>t===nt\|\|starts\.includes\(t\)\|\|rim\.includes\(t\)\?i:-1\)/);

  assert.match(agents, /Josh picked "A, plus B's choppy water"/);
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
  assert.match(html, /function paintLoadingState\(\)\{\n  \/\* a paint still landing from the previous reading stands down \*\/\n  RENDER_GEN\+\+;PAINT_DONE\(\);\n  sceneResume\(\);\n  fishCancel\(\);/);
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
  assert.match(html, /const W=LOC\.view==="pond"\?320:Math\.max\(320,appW\(\)\/1\.22\),H=/);
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
  // the headline reads the whole run, so from five o'clock it can describe tomorrow's daylight: with the
  // 24-hour slice it said only "Tomorrow's high is 79°." until tomorrow's last daylight hour was inside
  // it. Its look-ahead is still capped at 24 hours inside dayStory (win), so nothing else changes
  // (under a storm the headline is the storm card's: stormStory, below)
  // (and a thunderstorm overhead still leads the storm's headline: stormsOverhead, shared with dayStory)
  assert.match(html, /const dayRead=stormDay\?stormStory\(sm,now,TZSHIFT,stormsOverhead\(c,now\)\):\(\(r\)=>sm\.tier&&stormGust\(sm\)!=null\?\{\.\.\.r,told:\[\.\.\.r\.told,\{kind:"Windy"\}\]\}:r\)\(dayStory\(c,dy,full,now\)\);/);
  assert.match(html, /const overhead=stormsOverhead\(c,nd\);\n  if\(overhead\)return\{html:overhead,told:\[\]\};/);
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
  assert.match(html, /const night=tonightBrief\(dy,full,now,stormDay\?dayRead\.told:null\);/);
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
  assert.match(html, /\.wk\{display:grid;grid-template-columns:var\(--wk-cols,repeat\(var\(--wk-n,7\),1fr\)\)\}/);
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
  // the day's high is a number on its ring ("I also want the actual numerical high represented somehow"),
  // in the pin's figures and the softer ink, its hour small after it; placed, not stamped: right of the
  // reading, then without its hour, then with the reading stepped left of its pin, and never off the card
  assert.match(html, /const at=clamp\(cx-nw\/2,0,Math\.max\(0,W-w\)\);/);
  assert.match(html, /for\(const \[w,hour\] of \[\[nw\+gap\+hw,true\],\[nw,false\]\]\)/);
  assert.match(html, /if\(!hour&&pinL&&at-6-pinL\.w>=0\)\{pinL=\{x:Math\.min\(at-6,px-4\)-pinL\.w,w:pinL\.w\}/);
  assert.match(html, /<text data-uv="high"[^\n]*<tspan font-size="14" font-weight="600" fill="\$\{css\.soft\}">\$\{peakL\.num\}<\/tspan>/);
  // The band is spoken, not inked: EXTREME is set flush right and covers about 10.2 to 12, so an
  // inked HIGH sat far left of a 10.6 pin standing under EXTREME. The scale is a quiet ruler, and
  // the label says the band of the number printed on the pin, and the peak in spoken time.
  // one band rule, on the number the pin prints, for the spoken band and the ring; the ring's
  // nudge needs the pin's own x
  assert.match(html, /const uvBand=u=>\{u=\+\(\+u\)\.toFixed\(1\);return u<3\?0:u<6\?1:u<11\?2:3\};/);
  assert.match(html, /band=pin\?uvBand\(uvNow\):-1;/);
  assert.match(html, /if\(pin\)\{pinX=px;pinL=\{x:clamp\(px-pw\/2,0,W-pw\),w:pw\}\}/);
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
  // the trip is over: only the family places are in the rotation, the coast, the farm and Beaufort
  assert.match(html, /const LOC_ORDER=\["mb","sp","bft"\]/);
  // a phone last left on a parked place opens at home, not on a place it cannot tap back to
  assert.match(html, /LOC=LOC_ORDER\.includes\(saved\)\?LOCS\[saved\]:LOCS\.mb/);
  assert.match(html, /const nextLoc=\(\)=>LOC_ORDER\[\(LOC_ORDER\.indexOf\(LOC\.id\)\+1\)%LOC_ORDER\.length\]/);
  assert.match(html, /const prevLoc=\(\)=>LOC_ORDER\[\(LOC_ORDER\.indexOf\(LOC\.id\)\+LOC_ORDER\.length-1\)%LOC_ORDER\.length\]/);
  // the address still steps forward, and a sideways swipe on the picture goes either way and wraps
  assert.match(html, /document\.getElementById\("locBtn"\)\.addEventListener\("click",\(\)=>setLoc\(nextLoc\(\)\)\)/);
  assert.match(html, /const id=dir<0\?nextLoc\(\):prevLoc\(\)/);
  assert.match(html, /drag\.lock=Math\.abs\(dx\)>Math\.abs\(dy\)\?"x":"y"/);
  assert.match(html, /if\(PRM\)\{rest\(\);setLoc\(id\);return\}/);
  assert.doesNotMatch(html, /sceneDots|scene-dots/);
  assert.match(html, /\.scene-frame\{margin:14px -20px 0;position:relative;z-index:2;transform:translate3d\(0,0,0\);will-change:transform;touch-action:pan-y;/);
  // the swipe is smooth in WebKit (Josh, October 23 2026: "smooth af"): the frame carries its identity transform
  // and its own layer from the start, the new place is painted while the picture waits off the screen and is drawn
  // in place, all but invisible, before it slides in, the charts' pens wait, and the live forecast is asked for
  // once the picture is home. tools/webkit.mjs has a swipe mode that counts every frame while it moves
  assert.match(html, /function setLoc\(id,later=false\)\{/);
  assert.match(html, /if\(!later\)refresh\(\);/);
  assert.match(html, /REVEAL_HOLD=true;\n      setLoc\(id,true\);/);
  assert.match(html, /Promise\.race\(\[PAINT,new Promise\(r=>setTimeout\(r,450\)\)\]\)\.then\(home\);/);
  assert.match(html, /frame\.style\.transform="";frame\.style\.opacity="\.01";/);
  assert.match(html, /function revealReady\(\)\{if\(REVEAL_HOLD\)/);
  const webkitSrc = await readFile(new URL("tools/webkit.mjs", root), "utf8");
  assert.match(webkitSrc, /w === "swipe"/);
  assert.match(webkitSrc, /while it moves:/);
  assert.match(html, /const frame=document\.querySelector\("\.scene-frame"\)/);
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
  // (one under a roof, Beaufort's dock house, is out of the wind until it gusts ten)
  assert.match(html, /const candleK=clamp\(\(gust-\(sheltered\?10:3\)\)\/24,0,1\),flick=!PRM&&candleK>\.04/);
  assert.match(html, /:is\(#sceneSvg,\.scene-layer\) \.candle\.flicker\{animation:candle/);
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
  for (const name of ["27-house-halloween-night", "45-house-carved-week-morning", "29-house-halloween-rain-night", "31-ridge-halloween-night", "32-ridge-november-morning", "35-house-november-small-hours"])
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
  // in a drizzle, in for the night in the rain, and at the house's gate from the minute it is dark enough
  assert.match(rig, /"trick-or-treater": \["trickOrTreater", \(c\) => c\.propTrickOrTreater\(\)/);
  assert.match(rig, /ghostface \| witch \| trick-or-treater/);
  for (const name of ["27-house-halloween-night", "31-ridge-halloween-night", "46-house-halloween-drizzle-night", "48-house-halloween-cold-dusk"])
    assert.match(scene, new RegExp(`name: "${name}"[^\\n]*decor: \\[[^\\]]*"trick-or-treater"`));
  for (const name of ["47-ridge-halloween-rain-night", "29-house-halloween-rain-night", "38-house-october-moon"])
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
  assert.match(html, /:is\(#sceneSvg,\.scene-layer\) \.cat-tail\{animation:catTail 23s ease-in-out infinite\}/);
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
  for (const n of ["30-ridge-october-afternoon", "31-ridge-halloween-night", "41-ridge-october-dusk"])
    assert.match(decorOf(n), /"black-cat"/, n);
  // the house at Porters Neck has no dock and no rail for it: the cat sits out at the farm alone
  for (const n of ["26-house-october-afternoon", "27-house-halloween-night", "34-ridge-halloween-rain-night", "46-house-halloween-drizzle-night", "48-house-halloween-cold-dusk", "32-ridge-november-morning", "35-house-november-small-hours"])
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
  for (const n of ["31-ridge-halloween-night", "33-ridge-october-night", "39-ridge-october-moon"])
    assert.match(decorOf(n), /"eyes"/, n);
  // the eyes were in the marsh's spartina, which is parked: the house's lawn has none
  for (const n of ["27-house-halloween-night", "38-house-october-moon"]) assert.doesNotMatch(decorOf(n), /"eyes"/, n);
  // not at dusk, when the first bats are out against the last of the light, nor in the rain
  for (const n of ["40-house-october-dusk", "41-ridge-october-dusk", "48-house-halloween-cold-dusk", "26-house-october-afternoon", "29-house-halloween-rain-night", "34-ridge-halloween-rain-night", "35-house-november-small-hours"])
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
  for (const n of ["26-house-october-afternoon", "27-house-halloween-night", "32-ridge-november-morning"]) assert.doesNotMatch(decorOf(n), /"scarecrow"/, n);
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
  for (const n of ["26-house-october-afternoon", "27-house-halloween-night", "32-ridge-november-morning"]) assert.doesNotMatch(decorOf(n), /"sheet-ghost"/, n);
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
  // the marsh lights belong to the marsh, which is parked: no scene the harness runs has them now
  for (const n of ["27-house-halloween-night", "38-house-october-moon", "29-house-halloween-rain-night", "40-house-october-dusk", "31-ridge-halloween-night", "35-house-november-small-hours"]) assert.doesNotMatch(decorOf(n), /"wisps"/, n);
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
  for (const name of ["38-house-october-moon", "39-ridge-october-moon"]) assert.match(scene, new RegExp(`name: "${name}"[^\\n]*"blood-moon"[^\\n]*moon: true`));
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
  for (const name of ["26-house-october-afternoon", "27-house-halloween-night", "45-house-carved-week-morning", "29-house-halloween-rain-night", "36-house-october-golden-evening", "37-house-october-fog-morning"])
    assert.match(scene, new RegExp(`name: "${name}"[^\\n]*decor: \\["ghostface"`));
  assert.match(scene, /name: "35-house-november-small-hours"[^\n]*decor: \[\]/);
  // at the house he is a dim layer clipped inside the rightmost east window, and never moves.
  // The harness asks for that window rather than the oak's eye sample
  assert.match(scene, /if \(cs\.decor\?\.includes\("ghostface"\) && await page\.locator\('\.scene \[data-prop="house"\]'\)\.count\(\)\)/);
  assert.match(scene, /if \(!peek\) problems\.push\(`\$\{cs\.name\}: Ghostface is not in the east window`\);/);
  // in the parked marsh's oak he stands still and the oak sways over him, so the harness samples both
  // eyes at both ends of the sway, in the scene's wind and in a gale, and fails 40% of either hidden
  assert.match(scene, /\} else if \(cs\.decor\?\.includes\("ghostface"\)\) \{/);
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
  for (const [name, n] of [["27-house-halloween-night", 6], ["31-ridge-halloween-night", 4], ["33-ridge-october-night", 6], ["38-house-october-moon", 7], ["39-ridge-october-moon", 6], ["40-house-october-dusk", 7], ["41-ridge-october-dusk", 7]])
    assert.match(scene, new RegExp(`name: "${name}"[^\\n]*"bat"[^\\n]*bats: ${n},`));
  for (const name of ["26-house-october-afternoon", "29-house-halloween-rain-night", "30-ridge-october-afternoon", "34-ridge-halloween-rain-night", "32-ridge-november-morning", "35-house-november-small-hours"])
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
  assert.equal(html.split("batKeep(witch)").length, 4, "every place's bats keep off the still witch");
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
  for (const name of ["27-house-halloween-night", "31-ridge-halloween-night", "33-ridge-october-night", "38-house-october-moon", "39-ridge-october-moon"])
    assert.match(scene, new RegExp(`name: "${name}"[^\\n]*witch: true`));
  for (const name of ["29-house-halloween-rain-night", "34-ridge-halloween-rain-night", "35-house-november-small-hours", "36-house-october-golden-evening", "40-house-october-dusk", "41-ridge-october-dusk"])
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
  assert.match(html, /LASTW=appW\(\);\n  fishSchedule\(allowedFishWins\);\n  paintCobweb\(\);\n  fishMotion\(\);\n  PAINT_DONE\(\);\n  \}\);\}\);\}\);\},!!warning\);\n\}/);
  assert.match(html, /xpReset\(\);LAST=null;\n  paintCobweb\(\);\n  paintLoadMark\(\);\n\}/);
  // placed again when the alert strip opens and moves everything under it, and when the fonts land
  assert.match(html, /el\.setAttribute\("aria-expanded",open\?"true":"false"\);\n  \/\*[^\n]*\*\/\n  paintCobweb\(\);/);
  // (and the storm card's quoted title is fitted again, in the face that has landed)
  assert.match(html, /document\.fonts\.ready\.then\(\(\)=>\{starsClearOfType\(\);paintCobweb\(\);moonNoteFit\(\);keepView\(stormTitleFit\)\}\)/);
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
  // (MOCK, option C: Beaufort's fishing water rides the same call as a sixth argument, null everywhere else)
  assert.match(html, /const tide=renderTides\(d\.tides,css,c\.wind_gusts_10m,c\.wind_speed_10m,levelFeet\(d\.water,now\),LOC\.grass\?\{h:full,c,zone:d\.zone\|\|\[\]\}:null\);/);
  // the skiff rides the table's curve (Josh, September 28 2026: "I preferred the boat actually on
  // the tide line"), and when the gauge runs off the table the gap rides beside it as a tag. He
  // chose that over a mark at the real water and over the gauge's own line, so neither is drawn
  assert.match(html, /function renderTides\(preds,css,gust,wind,gap=0,day=null\)\{/);
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
  assert.match(html, /const ty=high\?Math\.max\(12\*fs,y-lift\):lowY;times\.push\(\[lx,ty-11\*fs\*\.78-2,lx\+lw,ty\+3\]\);/);
  assert.match(html, /<text x="\$\{x\.toFixed\(1\)\}" y="\$\{ty\.toFixed\(1\)\}" text-anchor="\$\{anchor\}"/);
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
  // and that clock is set once the paint has landed, on the wash and the bolts together: the wash
  // is the same element from paint to paint, so a delay worked out again each paint kept its old
  // start time, and the live paint landing after the cache struck bolts into a sky that never lit
  assert.doesNotMatch(html, /fl\.style\.animationDelay/);
  assert.match(html, /for\(const a of el\.getAnimations\(\)\)onClock\(a,\(\)=>Date\.now\(\)%P\+P\)/);
  assert.match(html, /function onClock\(a,at\)\{a\.currentTime=at\(\);a\.ready\.then\(/);
  // the witch's crossing is put on her own clock the same way, once the scene has painted
  assert.match(html, /paintBolts\(\);\n  witchClock\(\);/);
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
  assert.match(html, /<b id="waterTitle">Water · Wrightsville Beach<\/b>/);
  assert.match(html, /document\.getElementById\("waterTitle"\)\.textContent="Water · "\+\(LOC\.water\|\|"Wrightsville Beach"\);/);
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

test("the warning strip enters once and stays put through every repaint", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const clock12 = html.match(/const clock12=d=>\{[\s\S]*?ap\};/);
  assert.ok(clock12, "clock12 should be extractable");
  const code = html.slice(html.indexOf("function alertGist("), html.indexOf("function toggleAlert("));
  // a strip with only what renderAlerts touches, logging every write that would reach the page
  const strip = () => {
    const cls = new Set(["alert-strip"]), attrs = {}, writes = [];
    const part = (name) => ({ set innerHTML(v) { writes.push(name); } });
    let markup = "", head = null, body = null, restarts = 0;
    return {
      dataset: {}, writes, get restarts() { return restarts; },
      get className() { return [...cls].join(" "); },
      set className(v) { writes.push("class"); cls.clear(); v.split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
      classList: {
        contains: (c) => cls.has(c),
        add: (c) => { if (!cls.has(c)) { writes.push("class"); cls.add(c); } },
        toggle: (c, on) => { if (cls.has(c) !== !!on) { writes.push("class"); on ? cls.add(c) : cls.delete(c); } return !!on; },
      },
      get innerHTML() { return markup; },
      set innerHTML(v) {
        writes.push("html"); markup = v;
        head = /class="alert-head"/.test(v) ? part("head") : null;
        body = /class="alert-body"/.test(v) ? part("body") : null;
      },
      querySelector: (s) => (s === ".alert-head" ? head : s === ".alert-body" ? body : null),
      setAttribute: (k, v) => { if (attrs[k] !== String(v)) writes.push(k); attrs[k] = String(v); },
      removeAttribute: (k) => { if (k in attrs) { writes.push(k); delete attrs[k]; } },
      getAttribute: (k) => attrs[k] ?? null,
      getAnimations: () => [{ animationName: "alertIn", cancel() {}, play() { restarts++; } }],
    };
  };
  const el = strip(), NOW = Date.parse("2026-09-13T20:30:00Z"), timers = new Map();
  let tid = 0, asked = 0;
  class Clock extends Date { static now() { return NOW; } }
  const ctx = vm.createContext({ Date: Clock, LOC: { id: "mb" }, refresh: () => asked++,
    document: { hidden: false, getElementById: () => el },
    setTimeout: (fn, ms) => { timers.set(++tid, { fn, ms }); return tid; }, clearTimeout: (id) => timers.delete(id) });
  // (and the VTEC reader, for a product issued ahead of its start)
  vm.runInContext(clock12[0] + "\n" + code + "\n" + html.slice(html.indexOf("function vtecOf("), html.indexOf("/* an alert as the page keeps it")), ctx);
  const svr = { event: "Severe Thunderstorm Warning", severity: "Severe", ends: "2026-09-13T21:15:00Z",
    desc: "* WHAT...Sixty mph wind gusts.\n\n* WHERE...Porters Neck.", inst: "Move to an interior room." };

  // the words are worked out first, and the lead alert is what the strip is
  const one = ctx.alertStrip([svr]), two = ctx.alertStrip([svr, { event: "Heat Advisory", severity: "Moderate" }]);
  assert.equal(ctx.alertStrip([]), null);
  assert.equal(one.lead, two.lead, "another alert joining does not change which alert the strip is");
  assert.match(two.head, / ·\u00A0\+1\u00A0more/, "the dot rides with the words after it, so a wrapped strip never ends a line on it");
  assert.match(two.body, /also active: Heat Advisory/);
  assert.equal(ctx.alertStep(null, null), "none");
  assert.equal(ctx.alertStep(one, null), "off");
  assert.equal(ctx.alertStep(null, one), "enter");
  assert.equal(ctx.alertStep(one, { ...one }), "keep");
  assert.equal(ctx.alertStep(one, two), "update");
  assert.equal(ctx.alertStep(one, ctx.alertStrip([{ ...svr, event: "Tornado Warning", severity: "Extreme" }, svr])), "replace");

  // the cache paints it, and it comes on
  ctx.renderAlerts([svr]);
  assert.equal(el.className, "alert-strip on");
  assert.equal(el.getAttribute("aria-expanded"), "false");
  // and it goes when the warning ends, not at the next paint: the forecast is asked for again a
  // second after the end, in front and at the same place only
  assert.equal(timers.size, 1);
  const [[endId, end]] = timers;
  assert.equal(end.ms, Date.parse(svr.ends) - NOW + 1000);
  end.fn(); assert.equal(asked, 1);
  ctx.document.hidden = true; end.fn(); ctx.document.hidden = false;
  ctx.LOC.id = "sp"; end.fn(); ctx.LOC.id = "mb";
  assert.equal(asked, 1, "a phone in a pocket, or at the other place, asks nothing");
  timers.delete(endId);
  // the live paint, a re-render, a resize, a foreground: the same warning writes nothing at all,
  // which is what keeps its entrance from playing again
  el.writes.length = 0;
  for (let i = 0; i < 4; i++) ctx.renderAlerts([{ ...svr }]);
  assert.deepEqual(el.writes, [], "the same warning painted again writes nothing to the strip");
  // opened, then extended: the words change in place, and the open strip keeps its body
  el.classList.toggle("open", true); el.dataset.open = "1";
  const body = el.querySelector(".alert-body");
  el.writes.length = 0;
  ctx.renderAlerts([{ ...svr, ends: "2026-09-13T22:00:00Z" }]);
  assert.ok(!el.writes.includes("html") && el.writes.includes("head"), "an extended warning changes its words in place: " + el.writes);
  assert.equal(el.querySelector(".alert-body"), body, "and an open strip keeps its body");
  assert.equal(el.className, "alert-strip on open");
  assert.equal(el.restarts, 0, "nothing enters for an update");
  // a different alert takes the lead: the strip is already on, so its entrance is played again
  ctx.renderAlerts([{ ...svr, event: "Tornado Warning", severity: "Extreme" }, svr]);
  assert.equal(el.restarts, 1);
  // it ends, and the strip comes down; the next one enters by coming on, and arrives closed
  ctx.renderAlerts([]);
  assert.equal(timers.size, 0, "no alert, no end to wait for");
  // a storm card's own alerts end on the same clock, strip or none: a beach warning the strip never
  // shows is due at its next advisory, and the forecast is asked for again a second after
  ctx.renderAlerts([], { due: [{ event: "Tropical Storm Warning", ends: null, expires: "2026-09-13T23:00:00Z" }] });
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, Date.parse("2026-09-13T23:00:00Z") - NOW + 1000);
  ctx.renderAlerts([svr], { due: [{ event: "Tropical Cyclone Local Statement", expires: "2026-09-13T22:30:00Z" }] });
  assert.equal([...timers.values()][0].ms, Date.parse(svr.ends) - NOW + 1000, "the earliest of them all");
  timers.clear();
  ctx.renderAlerts([]);
  assert.equal(el.className, "alert-strip");
  assert.equal(el.innerHTML, "");
  assert.equal(el.dataset.open, "0");
  ctx.renderAlerts([svr]);
  assert.equal(el.className, "alert-strip on");
  assert.equal(el.getAttribute("aria-expanded"), "false");
  assert.equal(el.restarts, 1, "a strip coming on enters by its class, with nothing replayed by hand");
  // and the loading shell takes it down the same way an ended alert does
  const shell = html.slice(html.indexOf("function paintLoadingState("), html.indexOf("function setLoc("));
  assert.match(shell, /renderAlerts\(null\);/);
  assert.doesNotMatch(html, /className="alert-strip on"/);
  // and a product issued ahead of its start is asked for again a second after its VTEC begin as well, so an
  // open page turns the storm's headline from "from noon" to under way at noon, and NOW to the warning
  timers.clear();
  const ahead = { event: "Winter Storm Warning", severity: "Moderate", ends: "2026-09-14T10:00:00Z", expires: "2026-09-14T10:00:00Z",
    vtec: ["/O.NEW.KRLX.WS.W.0002.260913T2200Z-260914T1000Z/"] };
  ctx.renderAlerts([ahead]);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, Date.parse("2026-09-13T22:00:00Z") - NOW + 1000, "at its start, before its end");
  ctx.renderAlerts([{ ...ahead, vtec: ["/O.CON.KRLX.WS.W.0002.000000T0000Z-260914T1000Z/"] }]);
  assert.equal([...timers.values()][0].ms, Date.parse(ahead.ends) - NOW + 1000, "once under way, its end alone");
  ctx.renderAlerts([{ ...ahead, vtec: ["/O.NEW.KRLX.WS.W.0002.260913T1900Z-260914T1000Z/"] }]);
  assert.equal([...timers.values()][0].ms, Date.parse(ahead.ends) - NOW + 1000, "a start already passed is no time to wait for");
  ctx.renderAlerts([{ ...ahead, vtec: ["/O.UPG.KRLX.WS.W.0002.260913T2200Z-260914T1000Z/", "/O.EXA.KRLX.BZ.W.0001.260913T2300Z-260914T1000Z/"] }]);
  assert.equal([...timers.values()][0].ms, Date.parse("2026-09-13T23:00:00Z") - NOW + 1000, "and an upgraded line's start is not the product's");
  ctx.renderAlerts([], { due: [ahead] });
  assert.equal([...timers.values()][0].ms, Date.parse("2026-09-13T22:00:00Z") - NOW + 1000, "the card's own alerts too");
  timers.clear();
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
    lift(/const NOT_OUTDOOR=[^\n]*\nfunction outdoorWarning\(alerts\)\{[\s\S]*?\n\}/),
    html.slice(start, end),
    html.slice(html.indexOf("const NORMALS={"), html.indexOf("function renderYear(")),
    lift(/const moonName=m=>\{[\s\S]*?\};/),
    "Object.assign(globalThis,{coveredHours,waterGrade,waterTemp,buoyRow,levelGap,levelFeet,waterCard,waterNote,fishLine,fishWindows,farmCard,LOCS,NORMALS,yearCompare,doyOf,moonName,outdoorWarning});",
  ].join("\n"), ctx);
  // what the context returns is made again on this side, so deepEqual compares values, not realms
  const own = (r) => r == null || typeof r !== "object" ? r : JSON.parse(JSON.stringify(r));
  const W = Object.fromEntries(["coveredHours", "waterGrade", "waterTemp", "buoyRow", "levelGap", "levelFeet", "waterCard", "waterNote", "fishLine", "farmCard", "yearCompare", "moonName"].map((k) => [k, (...a) => own(ctx[k](...a))]));
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

  // the water temperature is a thermometer's, under an hour old, and never a model's
  const now = at("2026-08-02T13:20");
  assert.equal(W.waterTemp({ temp: { t: "2026-08-02 13:12", v: "76.8" } }, now), 77);
  assert.equal(W.waterTemp({ temp: { t: "2026-08-02 12:12", v: "76.8" } }, now), null, "an hour and more old is not said");
  assert.equal(W.waterTemp({ temp: { t: "2026-08-02 13:12", v: "" } }, now), null);
  assert.equal(W.waterTemp(null, now), null);
  // NOAA's station first, under its hour, and when it has nothing the Masonboro Inlet buoy's, under
  // its hour and a half (Josh, October 10 2026: "just a data point I always want")
  const buoyAt = (t, v) => ({ t: "2026-08-02 " + t, v });
  assert.equal(W.waterTemp({ temp: { t: "2026-08-02 13:12", v: "80.2" }, buoy: buoyAt("13:00", "76.3") }, now), 80, "the station's, when it has one");
  assert.equal(W.waterTemp({ temp: null, buoy: buoyAt("13:00", "76.3") }, now), 76, "the station gone quiet, the buoy says it");
  assert.equal(W.waterTemp({ temp: { t: "2026-08-02 12:12", v: "80.2" }, buoy: buoyAt("13:00", "76.3") }, now), 76, "the station's an hour old, the buoy's is not");
  assert.equal(W.waterTemp({ temp: null, buoy: buoyAt("12:00", "76.3") }, now), 76, "the buoy reads every half hour and posts late, so its reading stands an hour and a half");
  assert.equal(W.waterTemp({ temp: null, buoy: buoyAt("11:40", "76.3") }, now), null, "and past that it is not said either");
  assert.equal(W.waterTemp({ temp: { t: "2026-08-02 12:12", v: "80.2" }, buoy: null }, now), null, "the station's hour is still an hour");
  assert.equal(W.waterTemp({ temp: null, buoy: buoyAt("13:00", "") }, now), null);
  assert.equal(W.waterTemp({ temp: null, buoy: null }, now), null, "with neither thermometer it is not said");
  // the buoy's row: Celsius at a UTC instant, made the station's degrees at the place's wall clock,
  // the latest in time, and never a reading its quality checks call suspect (3) or failed (4)
  const erddap = (rows) => ({ table: { columnNames: ["time", "sea_water_temperature", "sea_water_temperature_qc_agg"], columnUnits: ["UTC", "degree_Celsius", null], rows } });
  const ET = "America/New_York";
  const u = (s) => Date.parse(s);
  assert.deepEqual(W.buoyRow(erddap([["2026-08-02T16:30:00Z", 24.6, 1], ["2026-08-02T17:00:00Z", 24.7, 1]]), ET), { t: "2026-08-02 13:00", v: 76.46, at: u("2026-08-02T17:00:00Z") });
  assert.deepEqual(W.buoyRow(erddap([["2026-08-02T17:00:00Z", 24.7, 1], ["2026-08-02T16:30:00Z", 24.6, 1]]), ET), { t: "2026-08-02 13:00", v: 76.46, at: u("2026-08-02T17:00:00Z") }, "the latest by its time, in any order");
  assert.deepEqual(W.buoyRow(erddap([["2026-08-02T16:30:00Z", 24.6, 1], ["2026-08-02T17:00:00Z", 31.0, 4]]), ET), { t: "2026-08-02 12:30", v: 76.28, at: u("2026-08-02T16:30:00Z") }, "a failed reading is passed over");
  assert.deepEqual(W.buoyRow(erddap([["2026-08-02T16:30:00Z", 24.6, 1], ["2026-08-02T17:00:00Z", 31.0, 3]]), ET), { t: "2026-08-02 12:30", v: 76.28, at: u("2026-08-02T16:30:00Z") }, "and a suspect one");
  assert.deepEqual(W.buoyRow(erddap([["2026-08-02T17:00:00Z", 24.7, 2]]), ET), { t: "2026-08-02 13:00", v: 76.46, at: u("2026-08-02T17:00:00Z") }, "one the checks have not looked at is kept, like NOAA's preliminary readings");
  assert.deepEqual(W.buoyRow(erddap([["2026-08-02T16:30:00Z", 24.6, 1], ["2026-08-02T17:00:00Z", null, 1]]), ET), { t: "2026-08-02 12:30", v: 76.28, at: u("2026-08-02T16:30:00Z") }, "a row with no reading is no reading");
  assert.deepEqual(W.buoyRow(erddap([["2026-01-15T12:30:00Z", 8.5, 1]]), ET), { t: "2026-01-15 07:30", v: 47.3, at: u("2026-01-15T12:30:00Z") }, "January is five hours behind UTC, not four");
  // rounded once: 24.7°C is 76.46°F, said as 76. Rounded to a tenth first it was 76.5 and said as 77.
  // The buoy keeps its true instant, so its now is a true instant too, the same on any clock
  assert.equal(W.waterTemp({ buoy: W.buoyRow(erddap([["2026-08-02T17:00:00Z", 24.7, 1]]), ET) }, new Date("2026-08-02T17:30:00Z")), 76);
  assert.equal(W.waterTemp({ buoy: W.buoyRow(erddap([["2026-08-02T17:00:00Z", 23.6, 1]]), ET) }, new Date("2026-08-02T17:30:00Z")), 74, "23.6°C is 74.48°F");
  // its age is its true instant against the true now: on the night the clocks go back, 01:35 EST
  // and a reading from 01:00 EST is 35 minutes old, not the 95 that "01:00" read as EDT would be
  const fallBack = W.buoyRow(erddap([["2026-11-01T06:00:00Z", 20.0, 1]]), ET);
  assert.equal(fallBack.t, "2026-11-01 01:00");
  assert.equal(W.waterTemp({ buoy: fallBack }, new Date("2026-11-01T06:35:00Z")), 68, "fresh across the change");
  assert.equal(W.waterTemp({ buoy: W.buoyRow(erddap([["2026-11-01T04:00:00Z", 20.0, 1]]), ET) }, new Date("2026-11-01T06:00:00Z")), null, "and two hours old is two hours old");
  assert.equal(W.buoyRow(erddap([]), ET), null);
  assert.equal(W.buoyRow(erddap([["2026-08-02T17:00:00Z", 31.0, 4]]), ET), null);
  assert.equal(W.buoyRow({ table: { columnNames: ["time"], rows: [["2026-08-02T17:00:00Z"]] } }, ET), null);
  assert.equal(W.buoyRow(null, ET), null);
  // and it is said in the note in the station's place, the same size: "76° · seas ~3 ft"
  assert.equal(W.waterNote({ line: [{ label: "seas about", value: "3 ft" }, { label: "water", value: W.waterTemp({ temp: null, buoy: buoyAt("13:00", "76.3") }, now) + "°" }] }, null), "76° · seas ~3 ft");

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
  // a Freeze Warning is CAP Severe the way every one is, and it is about the garden: on a frosty fall
  // night it printed "Feed early and keep a path open." in red and took the fishing times
  const frost = [{ event: "Freeze Warning", severity: "Severe" }, { event: "Frost Advisory", severity: "Minor" }, { event: "Hard Freeze Warning", severity: "Severe" }];
  assert.equal(ctx.outdoorWarning(frost), null, "a freeze or a frost keeps nobody in");
  assert.deepEqual(fsay({ temp: 31, feels: 27 }, { warning: ctx.outdoorWarning(frost) }), [null, null, "3:30–5:30p · 9:30–10:30p"], "the fishing times stay");
  assert.equal(ctx.outdoorWarning([...frost, { event: "High Wind Warning", severity: "Severe" }]).event, "High Wind Warning", "and a real warning still counts");
  // what a storm's card or line says has no hour, and is said for every hour: the card says only what to do
  assert.deepEqual(fsay({ gust: (i) => i < 3 ? 31 : 12 }, { told: [{ kind: "Windy" }] }), ["Chores can wait.", "no", null], "the storm's line gave the gusts");
  assert.deepEqual(fsay({ gust: (i) => i === 1 ? 31 : 12 }, { told: [{ kind: "Windy" }] })[0], "Get the chores done early.");
  assert.deepEqual(fsay({ code: 73, pop: 80 }, { told: [{ kind: "Snow" }] })[0], "Feed early and keep a path open.");
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
  assert.match(html, /<div class="eyebrow"><b id="waterTitle">Water · Wrightsville Beach<\/b><span id="tideNote">[^<]*<\/span><\/div>\n  <div class="tide-explore xp"/);
  assert.match(html, /document\.getElementById\("tideNote"\)\.textContent=tide\?waterNote\(water,tide\):\[waterNote\(water,null\),"tide data unavailable"\]\.filter\(Boolean\)\.join\(" · "\);/);
  assert.match(html, /tide\?"Tide curve, next 27 hours"\+\(water&&water\.level\?"\. "\+water\.level:""\):"Tide data unavailable"/);
  // the loading shell's empty pictures say what they will be, never the last place's
  const shell = html.slice(html.indexOf("function paintLocationShell("), html.indexOf("function paintLoadingState("));
  for (const s of ['"tideSvg").setAttribute("aria-label","Tide curve, next 27 hours")', '"moonSvg").setAttribute("aria-label","The moon over the next day and a half, and the almanac\'s fishing times")', '"yearSvg").setAttribute("aria-label","Normal highs and lows by month")'])
    assert.ok(shell.includes(s), `the shell resets ${s}`);
  // the moon's labels are placed, a character and a half apart, and one that would sit too far off
  // its point gives way, a minor before a major (rowPlace is run under "the moon explained" below)
  assert.match(html, /marks\.push\(\{pri:w\.major\?2:1,txt,cx:\(X\(a\)\+X\(b\)\)\/2,hw:txt\.length\*10\.5\*fs\*\.3\}\);/);
  assert.match(html, /for\(const mk of rowPlace\(marks,x0,xR,18,10\.5\*fs\*\.9\)\)/);
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
  // and the buoy's thermometer, the last day of it (an empty window is a 404 every phone would log),
  // for when the station's has nothing
  assert.match(html, /buoy:"41110-ilm2wave-ilm2w-5-miles-",/);
  assert.match(html, /L\.buoy\?fetchJSON\(`https:\/\/erddap\.secoora\.org\/erddap\/tabledap\/\$\{L\.buoy\}\.json\?time%2Csea_water_temperature%2Csea_water_temperature_qc_agg&time%3E%3Dnow-1day`,6000\)\.then\(j=>buoyRow\(j,L\.tz\)\)\.catch\(\(\)=>null\):null\]/);
  assert.match(html, /return temp\|\|level\|\|buoy\?\{temp,level,pred:rows\(pr\?\.predictions\),buoy\}:null/);
  assert.match(html, /return say\(w\?\.temp,36e5\)\?\?say\(w\?\.buoy,BUOY_FRESH\);/);
  assert.match(html, /const BUOY_FRESH=54e5;/);
  // (the house's list, or the last good one carried through a failed request: refresh, the storm card)
  assert.match(html, /hourly:s,marine,tides,water,alerts:alerts\?\?carry,storms,nowcast/);
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
    finishLoadMark:()=>{},
    // the storm lane runs beside the forecast; here it has nothing to say and says it at once
    stormLane:()=>Object.assign(Promise.resolve({storms:[],beach:null,wssi:null}),{beach:Promise.resolve(null),wssi:Promise.resolve(null)}),LAST:null,
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

test("the beach's answer is every paint's, and a cached beach warning at its expiry waits for it", async () => {
  // Debby's tropical storm warning was the beach's alone. Its expiry is only the next advisory's time,
  // and the Weather Service has nearly always renewed it by then: refreshed at that expiry (the strip's
  // timer, stormDue) on the cached beach, the card came down, the headline went back to "Raining now.",
  // and both came back when the advisories landed. And a first open with the advisories slow painted
  // without the beach's warning it already had. STORM_WAIT is cut short here
  const html = await readFile(new URL("index.html", root), "utf8");
  const code = html.slice(html.indexOf("let REFRESH_ID=0;"), html.indexOf("\nconst SWAP=")).replace("const STORM_WAIT=3000;", "const STORM_WAIT=80;");
  assert.ok(code.includes("const STORM_WAIT=80;"));
  const T = Date.parse("2024-08-07T15:40:00Z"), tsw = (expires) => ({ id: "tsw", event: "Tropical Storm Warning", expires, vtec: ["/O.CON.KILM.TR.W.1004.000000T0000Z-000000T0000Z/"] });
  const ffa = { id: "ffa", event: "Flood Watch", ends: "2024-08-09T08:00:00-04:00", vtec: ["/O.CON.KILM.FA.A.0006.000000T0000Z-240809T1200Z/"] };
  const run = async ({ last, kept, cache = kept, beach, point = [] }) => {
    const paints = [], nodes = new Map(), node = (id) => { if (!nodes.has(id)) { const c = new Set(), a = new Map(); nodes.set(id, { textContent: "", classList: { add: (v) => c.add(v), remove: (v) => c.delete(v), contains: (v) => c.has(v) }, setAttribute: (k, v) => a.set(k, v) }); } return nodes.get(id); };
    class Clock extends Date { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } }
    const forecast = { current: { time: "2024-08-07T11:00", temperature_2m: 78 }, daily: {}, hourly: Object.fromEntries(["time", "temperature_2m", "apparent_temperature", "precipitation_probability", "weather_code", "wind_speed_10m", "wind_gusts_10m", "uv_index"].map((k) => [k, [k === "time" ? "2024-08-07T11:00" : 1]])) };
    const t0 = performance.now();
    const ctx = vm.createContext({ Date: Clock, setTimeout, LOC: { id: "mb", kind: "coast", lat: 34, lon: -77, tz: "America/New_York" }, document: { getElementById: node }, navigator: { onLine: true },
      fetchJSON: (url) => url.includes("open-meteo.com") ? Promise.resolve(forecast) : url.includes("alerts/active?point") ? Promise.resolve({ features: point }) : Promise.reject(new Error("none")),
      alertRow: (f) => f, alertLive: () => true, isTropical: (a) => /^TR\./.test(a.vtec[0].slice(3)) || /\.TR\./.test(a.vtec[0]), stormLive: (a, now) => !(Date.parse(a.ends || a.expires || "") <= now),
      stormWaits: (L, al, b) => (al || []).length > 0 || (b || []).length > 0, render: (d) => paints.push({ beach: d.beach, seen: d.seen, storms: d.storms, ms: performance.now() - t0 }), writeCache: () => {},
      readCache: () => (cache ? { data: cache, savedAt: T - 6e5 } : null), paintLoadingState: () => {}, PAINT: Promise.resolve(), LAST: last,
      // the advisories are slow (they never land here); the beach answers in 20ms, or never
      stormLane: () => Object.assign(new Promise(() => {}), { beach: beach === undefined ? new Promise(() => {}) : new Promise((r) => setTimeout(() => r(beach), 20)), wssi: Promise.resolve(null) }) });
    vm.runInContext(code, ctx);
    await ctx.refresh();
    return paints;
  };
  const renewed = tsw("2024-08-07T17:00:00-04:00"), stale = tsw("2024-08-07T11:00:00-04:00");
  // refreshed at the beach warning's expiry, with the warning renewed: the paint is the renewed warning's,
  // never the cached one painted as ended
  const kept = { beach: [stale], storms: [], seen: { point: T - 6e5, beach: T - 6e5 } };
  const here = (d, savedAt = T - 6e5) => ({ d, savedAt, loc: "mb" });
  let p = await run({ last: here(kept), kept, beach: [renewed] });
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].beach.map((a) => a.expires), [renewed.expires], "the beach's renewed warning, so the card stays up");
  assert.ok(Math.abs(p[0].seen.beach - T) < 1e3 && p[0].seen.point === T, "both lists fetched now");
  // a beach that never answers is waited for STORM_WAIT at most, and the cache is what there is: its
  // list, with when it was fetched, so the warning still stands until the beach decides (stormRead)
  p = await run({ last: here(kept), kept, beach: undefined });
  assert.deepEqual(p[0].beach.map((a) => a.expires), [stale.expires]);
  assert.equal(p[0].seen.beach, T - 6e5, "the cached beach keeps its own time");
  assert.ok(p[0].ms >= 70, "it waited for the beach: " + p[0].ms);
  // a cached beach still in date is painted at once, as it always was
  const fresh = { beach: [renewed], storms: [] };
  p = await run({ last: here(fresh), kept: fresh, beach: undefined });
  assert.ok(p[0].ms < 60, "nothing to wait for: " + p[0].ms);
  // Debby's own timings: refreshed at 11:40, the beach's warning ran out at 7 pm, and the strip's timer
  // refreshed then, 7h20m on, with the cache past its six hours. The page's own reading for this place
  // stands in for it: the wait runs, and the paint keeps the page's storms
  const old = { beach: [stale], storms: [{ name: "Debby" }], seen: { point: T - 7.3 * 36e5, beach: T - 7.3 * 36e5 } };
  p = await run({ last: here(old, T - 7.3 * 36e5), kept: null, beach: [renewed] });
  assert.deepEqual(p[0].beach.map((a) => a.expires), [renewed.expires], "with the cache aged out, the renewed beach");
  assert.deepEqual(p[0].storms, [{ name: "Debby" }], "and the page's own storms until the advisories land");
  p = await run({ last: here(old, T - 7.3 * 36e5), kept: null, beach: undefined });
  assert.ok(p[0].ms >= 70, "the stale beach is waited for: " + p[0].ms);
  assert.deepEqual(p[0].beach.map((a) => a.expires), [stale.expires]);
  // and another place's reading is never this one's
  p = await run({ last: { ...here(old, T - 7.3 * 36e5), loc: "sp" }, kept: null, beach: undefined });
  assert.ok(p[0].ms < 60, "the farm's reading is not the coast's: " + p[0].ms);
  assert.equal(p[0].beach, null);
  // a first open, Debby's Flood Watch at the house, the advisories slow and the beach fast: the beach's
  // warning is in the first paint, which waited STORM_WAIT for the advisories
  p = await run({ last: null, kept: null, beach: [renewed], point: [ffa] });
  assert.deepEqual(p.map((x) => x.beach && x.beach.map((a) => a.id)), [["tsw"]], "the card is in the first frame");
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
  const order = ['<header class="sky"', '<section id="stormSection" hidden>', "<b>Next 24 hours</b>", '<div class="week">', '<section id="moonSection"', '<section id="tideSection">',
    '<section id="stormLine" hidden aria-label="Storm">', '<section id="stormDebug"', '<div class="cards">', '<div class="card wide" id="sayCard"', '<div class="card" id="sunCard">', '<section id="yearSection"', '<p class="foot">'].map(at);
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
  // burgee and the trees move to them). dirTxt stays for the storm card's compass points.
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
    /* the bars' row keeps its nodes: a stand-in that counts the rewrites and makes its children */
    let barWrites = 0;
    const barRow = { id: "ncBars", children: [], set innerHTML(v) { barWrites++; this.children = Array.from({ length: (v.match(/<i /g) || []).length }, () => ({ style: {} })); }, get innerHTML() { return ""; } };
    const els = { ncBars: barRow }, el = (id) => (els[id] ??= { id, textContent: "", innerHTML: "", className: "" });
    const nc = vm.createContext({ document: { getElementById: el } });
    vm.runInContext([
      lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
      lift(/const clock=d=>\{[^\n]*\};/),
      html.slice(html.indexOf("function renderNowcast("), html.indexOf("/* ── the storm card")),
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
    // a repaint of the same strip writes no new bars, so none of them grows in again; it sets the
    // heights in place
    const w0 = barWrites;
    cast(all, 63); cast(all, 63);
    assert.equal(barWrites, w0, "the bars are not rewritten on a repaint");
    assert.equal(barRow.children.length, 10);
    assert.equal(barRow.children[0].style.height, "22px");
    cast(Array(12).fill(0), 3);
    assert.equal(el("nowcast").className, "nowcast", "a dry hour hides the strip");
    assert.equal(barRow.children.length, 0, "and lets its bars go, so they grow in once when it is back");
  }
  // code 99 is not a warning, so it does not borrow the NWS warning word
  assert.match(html, /96:"Storms with hail",99:"Storms, heavy hail"/);
  // the Tropics · Atlantic rows went with the storm card (October 10 2026): no list of every Atlantic
  // system at any distance, no swirl turning for no reading, and nothing scored
  assert.doesNotMatch(html, /within 500 mi|active system|" mb":null|"adv "/);
  assert.doesNotMatch(html, /Tropics · Atlantic|storm-row|renderStorms|SWIRL|tropics:true/);
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
  // a live gust in hour 0 is a windy headline; one later in the day is named by its hour. Wind is not the
  // sky, so the day's own sky is said first (Josh, October 25 2026: "Windy by 9 a.m. --- again - not it.
  // what's the sun doing?")
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i ? 12 : 30) }), "Clouds and sun this afternoon. Windy now.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i === 3 ? 31 : 12) }), "Clouds and sun this afternoon. Windy by 4 p.m.");
  // it names the first windy hour, not the windiest: gusts of 30 now are windy now, whatever comes at 4
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i === 0 ? 30 : i === 3 ? 34 : 12) }), "Clouds and sun this afternoon. Windy now.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i === 1 ? 29 : i === 4 ? 33 : 12) }), "Clouds and sun this afternoon. Windy by 2 p.m.");
  // A hazard that only comes after dark leaves the day to be said first. October 23 2026 at 5:27 am, a
  // sunny day with the gusts reaching 30 at ten that night, read "Windy by 10 p.m." and nothing else
  // (Josh: "doesn't tell me about today").
  {
    const oct23 = (hi) => ({ time: ["2026-10-23", "2026-10-24"], temperature_2m_max: [hi, 70], sunrise: ["2026-10-23T07:23", "2026-10-24T07:24"], sunset: ["2026-10-23T18:27", "2026-10-24T18:25"] });
    const dawn = { time: "2026-10-23T05:27", temperature_2m: 42, weather_code: 0 }, sunny = { code: () => 0 };
    assert.equal(tell(dawn, { ...sunny, gust: (i) => (i >= 17 ? 30 : 16) }, undefined, oct23(68)), "Nice and sunny today. Windy by 10 p.m.");
    assert.equal(tell(dawn, { ...sunny, gust: (i) => (i >= 17 ? 30 : 16) }, undefined, oct23(90)), "Warm and sunny today. Windy by 10 p.m.");
    assert.equal(tell(dawn, { ...sunny, pop: (i) => (i === 16 ? 60 : 5) }, undefined, oct23(90)), "Warm and sunny today. Showers possible around 9 p.m.");
    assert.equal(tell(dawn, { ...sunny, code: (i) => (i === 15 ? 95 : 0) }, undefined, oct23(90)), "Warm and sunny today. Thunder possible around 8 p.m.");
    // a hazard inside the daylight already says the day; one the daylight's own gusts or showers would
    // spoil gets no sky; and from five the evening's own words stand
    assert.equal(tell(dawn, { ...sunny, gust: (i) => (i >= 10 ? 30 : 16) }, undefined, oct23(90)), "Warm and sunny today. Windy by 3 p.m.");
    // October 25 2026 at 6:38 am: sunny all day, a high of 72, gusts of 31 from nine. A windy day is never nice
    const oct25 = { time: ["2026-10-25", "2026-10-26"], temperature_2m_max: [72, 70], sunrise: ["2026-10-25T07:24", "2026-10-26T07:25"], sunset: ["2026-10-25T18:24", "2026-10-26T18:23"] };
    assert.equal(tell({ time: "2026-10-25T06:38", temperature_2m: 56, weather_code: 0 }, { ...sunny, gust: (i) => (i >= 3 ? 31 : 26) }, undefined, oct25), "Sunny today. Windy by 9 a.m.");
    // a windy day whose sky is not all known says only the wind
    assert.equal(tell({ time: "2026-10-25T06:38", temperature_2m: 56, weather_code: 0 }, { code: (i) => (i === 6 ? NaN : 0), gust: (i) => (i >= 3 ? 31 : 26) }, undefined, oct25), "Windy by 9 a.m.");
    assert.equal(tell(dawn, { ...sunny, gust: (i) => (i === 8 ? 27 : i >= 17 ? 30 : 16), pop: (i) => (i === 16 ? 60 : i === 6 ? 30 : 5) }, undefined, oct23(90)), "Warm today. Showers possible around 9 p.m.");
    assert.equal(tell({ ...dawn, time: "2026-10-23T17:10", temperature_2m: 66 }, { ...sunny, gust: (i) => (i >= 5 ? 30 : 16) }, undefined, oct23(68)), "Cool this evening. Windy by 10 p.m.");
  }
  // One night is one night: after dark the small hours before morning are tonight's, and only
  // daylight tomorrow is "tomorrow". The Tonight card under it calls the same shower tonight's.
  assert.equal(tell({ time: "2026-08-02T21:30", temperature_2m: 72, weather_code: 1 }, { pop: (i) => (i === 4 ? 45 : 5) }), "Showers possible around 1 a.m.");
  assert.equal(tell({ time: "2026-08-02T21:30", temperature_2m: 72, weather_code: 1 }, { pop: (i) => (i === 10 ? 45 : 5) }), "Showers possible around 7 a.m. tomorrow.");
  // the night runs to tomorrow's sunrise, as the Tonight card's does: an October 6 a.m. is dark
  const octDy = { time: ["2026-10-09", "2026-10-10"], temperature_2m_max: [80, 81], sunrise: ["2026-10-09T07:15", "2026-10-10T07:16"], sunset: ["2026-10-09T18:47", "2026-10-10T18:46"] };
  assert.equal(tell({ time: "2026-10-09T21:30", temperature_2m: 72, weather_code: 1 }, { pop: (i) => (i === 9 ? 45 : 5) }, undefined, octDy), "Showers possible around 6 a.m.");
  assert.equal(tell({ time: "2026-10-09T21:30", temperature_2m: 72, weather_code: 1 }, { pop: (i) => (i === 10 ? 45 : 5) }, undefined, octDy), "Showers possible around 7 a.m.");
  assert.equal(tell({ time: "2026-10-09T21:30", temperature_2m: 72, weather_code: 1 }, { pop: (i) => (i === 11 ? 45 : 5) }, undefined, octDy), "Showers possible around 8 a.m. tomorrow.");
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
  assert.equal(readAt("2026-08-02T07:40",{c:{weather_code:3},hours:{code:i=>i<5?3:0}}).html,"Cloudy, then sunny.","sustained clearing replaces an empty dry-day summary");
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
  // The now hour's sky is the one the label beside the number names. The forecast run said sunny at
  // 2:00 while the reading at 2:20 was cloudy, and the headline said "Nice and sunny" beside "Cloudy"
  assert.equal(readAt("2026-08-02T14:20", { c: { weather_code: 3 }, hours: { code: () => 1 } }).html, "Mostly sunny this afternoon.");
  assert.doesNotMatch(readAt("2026-08-02T09:00", { c: { weather_code: 3 }, hours: { code: () => 1 } }).html, /^Nice and sunny/);
  assert.equal(readAt("2026-08-02T09:00", { c: { weather_code: 3 }, hours: { code: i => i < 2 ? 3 : 1 } }).html, "Cloudy, then sunny.");
  // A wet sky at an hour with odds under 25 is a stray shower, not missing data: every reading is
  // there, so the headline never says "Forecast details unavailable." over a whole run
  assert.equal(readAt("2026-08-02T10:00", { c: { temperature_2m: 74, apparent_temperature: 74 }, hours: { code: i => i === 5 ? 51 : 1, pop: i => i === 5 ? 15 : 5 } }).html, "Maybe a stray shower.");
  assert.equal(readAt("2026-08-02T10:00", { c: { temperature_2m: 74, apparent_temperature: 74 }, hours: { code: i => i === 5 ? 80 : 1, pop: i => i === 5 ? 20 : 5 } }).html, "Maybe a stray shower.");
  assert.equal(readAt("2026-08-02T02:00", { c: { temperature_2m: 70, apparent_temperature: 70 }, hours: { code: i => i === 4 ? 51 : 1, pop: i => i === 4 ? 10 : 5 } }).html, "Maybe a stray shower.");
  assert.equal(readAt("2026-08-02T10:00", { c: { temperature_2m: 74, apparent_temperature: 74 }, hours: { code: i => i === 5 ? 71 : 1, pop: i => i === 5 ? 15 : 5 } }).html, "Maybe a few flurries.");
  assert.equal(readAt("2026-08-02T10:00", { c: { temperature_2m: 74, apparent_temperature: 74 }, hours: { code: i => i === 5 ? 56 : 1, pop: i => i === 5 ? 15 : 5 } }).html, "Maybe a little freezing rain.");
  // a real gap still says so
  assert.doesNotMatch(readAt("2026-08-02T10:00", { c: { temperature_2m: 74, apparent_temperature: 74 }, change: h => { h.code[5] = null; } }).html, /stray|nice|sunny|dry/i);
  // With the whole run in hand the evening describes tomorrow's daylight from five o'clock; the bare
  // number is for a short cache (the 17:00 case above, a 24-hour run ending at four)
  {
    const t0 = new Date("2026-10-09T17:00:00Z").getTime(), time = Array.from({ length: 48 }, (_, i) => new Date(t0 + i * 3.6e6).toISOString().slice(0, 16));
    const h48 = { time, temp: time.map(() => 75), feels: time.map(() => 75), pop: time.map(() => 5), gust: time.map(() => 10), code: time.map(() => 1) };
    const oct = { time: ["2026-10-09", "2026-10-10"], temperature_2m_max: [79, 79], sunrise: ["2026-10-09T07:15", "2026-10-10T07:16"], sunset: ["2026-10-09T18:47", "2026-10-10T18:46"] };
    const c = { time: "2026-10-09T17:20", temperature_2m: 75, apparent_temperature: 75, relative_humidity_2m: 50, weather_code: 1 };
    assert.equal(ctx.dayStory(c, oct, h48, new Date("2026-10-09T17:20")).html, "Sunny tomorrow.");
  }
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
  assert.match(shots, /\["stormSvg", "hourlySvg", "weekSvg", "tideSvg", "moonSvg", "yearSvg"\]/);
  // and the storm card's nine real cases, with the tier, the title, the named line and the headline held
  for (const n of ["florence-coast", "debby-flood-coast", "blizzard-farm", "isaias-farm-today", "isaias-coast-today", "quiet-distant", "ice-farm", "snow-ice-farm", "long-quote-farm"]) assert.ok(shots.includes(`["${n}", { stormTier: `), n);
  assert.match(shots, /headline: "Hurricane Florence is closest Friday morning\."/);
  assert.match(shots, /stormLine: "Isaias's remnants pass 33 mi north Sunday evening · gusts to 50"/);
  // a winter warning's title is its own sentence, never numbers rebuilt from it, and at the farm the card
  // comes up only with WPC's index at Major or Extreme: RLX's January 2026 warning, Moderate, is the strip's
  assert.match(shots, /stormTitle: "Winter storm warning remains in effect until 1 AM EST Sunday"/);
  assert.match(shots, /\["snow-ice-farm", \{ stormTier: "storm", stormTitle: "Total snow accumulations between 4 and 10 inches and ice accumulations between one tenth and one half of an inch\."/);
  assert.match(shots, /\["ice-farm", \{ stormTier: null, strip: /);
  // a warning issued ahead of its start says its start, in the headline and the chart's spoken label
  assert.match(shots, /headline: "Winter storm from noon until 6 a\.m\. Tuesday\.",/);
  assert.match(shots, /stormWords: \/Snow and ice: Winter Storm Warning from noon until Tuesday at 6 am\//);
  // and a sentence too long for three lines gives way to the warning's own shorter one, with the whole one
  // under the chart: the corpus's 153 characters at 390, and January 2025's 113 at 320
  assert.match(shots, /\["long-quote-farm", \{ stormTier: "storm", stormTitle: "Heavy mixed precipitation\.", stormNote: "",\n      stormFull: "Additional snow accumulations of 3 to 5 inches/);
  assert.match(shots, /stormTitle320: "Heavy mixed precipitation expected\.", stormFull320: "Total snow accumulations between 4 and 10 inches/);
  assert.match(shots, /\.\.\.await stripWrap\(page\), \.\.\.await stormTitleRule\(page\)\]/);
  // every line that joins its parts with a dot is measured for a lone dot at every width, and today's
  // coast strip stays on two lines at 320 (tying whole clauses together put it on three)
  assert.match(shots, /const DOT_LINES = \{ "#alertStrip\.on \.alert-head": "the strip", "#stormWarns": "the storm card's warnings", "#stormAsOf": "the storm card's sources", "#stormLineText": "the named storm's line" \};/);
  assert.match(shots, /strip: \/\^Flood Watch · until 11:00 am Sun · \\\+1 more\$\/, stripLines: 2 \}\]/);
  assert.match(shots, /a TCV impacts word on the card/);
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

  // One machine for the charts. The picture's swipe is the other pointerdown, and nothing of the
  // old per-chart peeks is left
  assert.equal(code.split('addEventListener("pointerdown"').length - 1, 2, "the explorer, and the picture's swipe");
  assert.match(code, /function sceneSwipe\(\)\{[\s\S]*?frame\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(html, /HOURLY_PEEK|TIDE_PEEK|setupHourlyPeek|setupTidePeek|PeekLive|hourly-cursor|tide-cursor/);
  assert.match(html, /xpReset\(\);LAST=null;/, "the loading and error shell resets every explorer");
  assert.match(html, /\}else xpPublish\("tide",null\);/, "a paint with no tide chart publishes none");
  assert.match(html, /until:h\.time\?\.length\?new Date\(h\.time\[h\.time\.length-1\]\)\.getTime\(\)\+36e5:\+now\}\)\}\);else xpPublish\("moon",null\);/);
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
  // one explorer per chart, set up in page order, and every one of them but the storm card is a chart
  // the entrance draws: the storm card comes up only when it is needed, and adds no motion
  const setups = [...html.matchAll(/xpSetup\("(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(setups, ["storm", "hourly", "week", "tide", "moon", "year"]);
  const revealKeys = Object.keys(Object.fromEntries([...html.match(/const REVEAL=\{([\s\S]*?)\};/)[1].matchAll(/(\w+):\{state/g)].map((m) => [m[1], 1])));
  const drawnIn = setups.filter((k) => k !== "storm");
  for (const k of drawnIn) assert.ok(revealKeys.includes(k), `${k} is in REVEAL`);
  assert.deepEqual(drawnIn, revealKeys.filter((k) => setups.includes(k)), "in REVEAL's page order");
  assert.match(html, /function revealFinish\(k\)\{\n  const R=REVEAL\[k\];\n  if\(!R\)return;/, "a reading on the storm card finishes no entrance");
  // one cursor slot per chart, over its line and under its words: in each chart's template it comes
  // before the first literal text and the labels, so their paper halos break the hairline
  assert.equal(html.split('<g class="xp-cursor"').length - 1, 6);
  for (const [fn, words] of [["function paintStormCard(", "${labels}"], ["function render(", "${dots}"], ["function renderWeek(", "${marks}"], ["function renderTides(", "${labels}"], ["function renderMoon(", "${labels}"], ["function renderYear(", "${marks}"]]) {
    const src = html.slice(html.indexOf(fn)), tpl = src.slice(src.indexOf("innerHTML=`"), src.indexOf("innerHTML=`") + 9000);
    const slot = tpl.indexOf('<g class="xp-cursor"'), firstText = tpl.indexOf("<text");
    assert.ok(slot > 0 && slot < tpl.indexOf(words) && (firstText < 0 || slot < firstText), `${fn} draws its cursor under its words`);
  }
  // five range inputs, one per chart that is not already a row of buttons
  assert.equal(html.split('<input class="xp-key" type="range"').length - 1, 5);
  for (const l of ["The storm, hour by hour", "Next 24 hours, hour by hour", "Water, 15 minutes a step", "Almanac fishing times, 15 minutes a step", "The year, month by month"])
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
  // Under a storm the card's rain, snow and freezing rain are not said again, nothing is a warm night
  // and nothing is green: under Florence it read "Rain likely tonight, with a low of 71°."
  const storm=(h,told)=>ctx.tonightBrief(dy,h,new Date("2026-10-06T20:30"),told);
  assert.deepEqual({...storm(raining,[{kind:"Rain"},{kind:"Windy"}])},{text:"Down to 59° tonight.",cls:""});
  const warm=run();warm.temp=warm.temp.map(()=>78);
  assert.equal(ctx.tonightBrief(dy,warm,new Date("2026-10-06T20:30")).text,"A warm night, with a low of 78°.");
  assert.deepEqual({...storm(warm,[{kind:"Rain"}])},{text:"Down to 78° tonight.",cls:""},"no warm night under a hurricane");
  const snowy=run();snowy.code[6]=73;snowy.pop[6]=80;
  assert.equal(storm(snowy,[{kind:"Snow"}]).text,"Down to 59° tonight.","the blizzard's snow is the card's");
  assert.equal(storm(thunder,[{kind:"Rain"}]).text,"Thunder possible tonight. Low unavailable.","thunder is not on the card, and is still said");
  assert.equal(storm(unknown,[{kind:"Rain"}]).text,"Down to 59° tonight.");
  // missing odds are unavailable, not dry, unless the card has said the rain: a High Wind Warning has not
  assert.deepEqual({...storm(unknown,[{kind:"Windy"}])},{text:"Down to 59° tonight. Rain odds unavailable.",cls:"caution"});
  assert.deepEqual({...storm(unknown,[])},{text:"Down to 59° tonight. Rain odds unavailable.",cls:"caution"});
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
      paintLoadingState:()=>{},stormLane:()=>Object.assign(Promise.resolve({storms:[],beach:null,wssi:null}),{beach:Promise.resolve(null),wssi:Promise.resolve(null)}),LAST:null,
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
  assert.match(html,/const night=tonightBrief\(dy,full,now,stormDay\?dayRead\.told:null\);/);
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

test("the oak-egret preview stays occasional, weather-aware and attached to its branches", async () => {
  const html=await readFile(new URL("index.html",root),"utf8");
  const scene=await readFile(new URL("tools/scene.mjs",root),"utf8");
  const countCode=html.slice(html.indexOf("function oakEgretCount("),html.indexOf("/* Raccoon on the bank"));
  assert.ok(countCode.startsWith("function oakEgretCount("),"the real presence helper is extractable");
  const randomCode=html.slice(html.indexOf("function mulberry("),html.indexOf("let STARS=null;"));
  const ctx=vm.createContext({});
  vm.runInContext(randomCode+countCode,ctx);
  const calm={weather_code:1,temperature_2m:65,wind_speed_10m:6,wind_gusts_10m:10};
  const expected=[1,2,0,0,0,0,0,1,2,1,1,0,1,2,2,0,2,1,0,0,0,0,0,1,0,1,0,1,1,0,1];
  const month=()=>expected.map((_,i)=>ctx.oakEgretCount(`2026-10-${String(i+1).padStart(2,"0")}`,calm,13,45));
  assert.deepEqual(month(),expected,"the fixed daily seed leaves some days empty and uses both occupied poses");
  assert.deepEqual(month(),expected,"another render cannot change the day's count");
  assert.deepEqual([...new Set(month())].sort(),[0,1,2],"there are never more than two birds");
  const date="2026-10-02",count=(patch={},hour=13,alt=45,storm=false)=>ctx.oakEgretCount(date,{...calm,...patch},hour,alt,storm);
  assert.equal(count({temperature_2m:40,wind_speed_10m:12,wind_gusts_10m:18}),2,"the stated gentle-weather limits are inclusive");
  for(const code of [0,1,2,3])assert.equal(count({weather_code:code}),2,`known sky code ${code} permits the day's birds`);
  for(const code of [45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99,4,-1])
    assert.equal(count({weather_code:code}),0,`code ${code} cannot put birds on exposed limbs`);
  for(const patch of [{temperature_2m:39.9},{wind_speed_10m:12.1},{wind_gusts_10m:18.1}])assert.equal(count(patch),0);
  for(const field of Object.keys(calm))for(const value of [null,undefined,"",NaN,Infinity,"unavailable"])
    assert.equal(count({[field]:value}),0,`${field} must be known`);
  assert.equal(count({},13,45,true),0,"nearby thunder suppresses birds even when the current sky is clear");
  assert.equal(count({},9,30),0,"morning forage keeps the perches empty after sunrise");
  assert.equal(count({},11,30),0,"the morning forage keeps the perches empty");
  assert.equal(count({},12,30),2,"midday rest can bring the birds back to the oak");
  assert.equal(count({},15,30),2,"midday rest lasts through the afternoon");
  assert.equal(count({},16,6),2,"the birds can return as the sun lowers toward evening");
  assert.equal(count({},17,6.1),0,"birds do not arrive before the late-day light");
  assert.equal(count({},18,2),2,"birds return to the roost during golden hour");
  assert.equal(count({},20,-5),2,"the birds may stay tucked in the oak overnight");
  assert.equal(count({},6,1),0,"the roost empties after sunrise");
  assert.equal(count({},-1,-10),0,"an invalid local hour cannot select a sighting");
  for(const bad of ["","20261002","2026-10-2","2026-10-02T12:00"])
    assert.equal(ctx.oakEgretCount(bad,calm),0,"a missing or malformed local date has no daily selection");
  // Pin the policy boundaries separately from the real calendar's sampled values.
  for(const [sample,want] of [[0,0],[.449999,0],[.45,1],[.799999,1],[.8,2],[.999999,2]]){
    let seed;
    const edge=vm.createContext({mulberry:n=>{seed=n;return()=>sample}});
    vm.runInContext(countCode,edge);
    assert.equal(edge.oakEgretCount(date,calm,13,45),want);
    assert.equal(seed,20261002^0xE6E7,"the location's date supplies the same seed at every refresh");
  }

  const oak=html.slice(html.indexOf("const liveOak=()=>{"),html.indexOf("const oak=liveOak();"));
  assert.match(oak,/oakEgretCount\(locToday\(\),weather,localHour,sunAltDeg,storm\|\|THUNDER>0\)/);
  assert.match(oak,/const birds=\[\[-28,-23\.5,\.32,1\],\[55,-18\.2,\.30,-1\]\]\.slice\(0,count\)/,"both birds are on limbs clear of the heron's lane");
  assert.match(oak,/const stretch=i===0&&!dark&&localHour>=10&&localHour<16&&!PRM/,"only a daytime bird may stretch its wings");
  assert.match(oak,/rigEgret\(phase,sunAltDeg<=-\.83\|\|i===1,stretch\)/,"night birds and the second daytime bird rest with tucked necks");
  assert.match(oak,/decorPal\(INK\.egret,oakD\)/,"white feathers receive the tree's distance and sky light");
  assert.match(oak,/return `<g data-prop="live-oak"\$\{treeAt\(oakX\)\}>\$\{inkAt\(oakX,gy,oakS,1,inkUnit\(propOak\(\)/);
  assert.match(oak,/\$\{moss\}<\/g>`\+birds\)\}<\/g>`;/,"birds are above the leaves but inside both parent transforms");
  const rig=html.slice(html.indexOf("const rigEgret="),html.indexOf("/* This is an occasional resident"));
  assert.match(rig,/rest\?\[/,"the small silhouette has a separate tucked-neck pose");
  assert.match(rig,/pivot:\[-\.5,-22\]/,"the occasional wing movement turns at the shoulder");
  assert.match(rig,/egret-wing-stretch/);
  const css=html.slice(html.indexOf("<style>"),html.indexOf("</style>"));
  assert.match(css,/\.egret-wing-stretch\{animation:egretWingStretch 90s ease-in-out infinite\}/,"a short wing stretch follows a long quiet rest");
  assert.match(css,/@keyframes egretWingStretch\{0%,95%,100%\{transform:none\}/);
  assert.match(scene,/\.oak-egret \*/,"scene checks include the perched bird's occasional wing movement");
  assert.match(scene,/egret: perch overlaps the heron through its movement/,"scene checks the egret and heron across their gestures");
});

test("every line runs the same width, from CHART_IN to CHART_IN", async () => {
  const [html, shots, interactions] = await Promise.all(["index.html", "tools/shots.mjs", "tools/interactions.mjs"].map((f) => readFile(new URL(f, root), "utf8")));
  const fn = (name, next) => html.slice(html.indexOf(`function ${name}(`), html.indexOf(next, html.indexOf(`function ${name}(`)));
  // Josh, October 9 2026: "the width of the week part doesn't extend as far as the other lines.
  // everything should be even". One inset, the hourly's own 16px, for all five
  assert.match(html, /\nconst CHART_IN=16;\n/);
  assert.match(html, /const W=appW\(\)-40,Ht=chartH\(W\)-18,pad=CHART_IN,n=h\.temp\.length,base=Ht-6;/);
  assert.match(html, /const X=i=>pad\+i\*\(W-2\*pad\)\/\(n-1\);/);
  // the week's points run edge to edge with the others, its columns are centred under them and cut
  // at the content edge, and an end day's number stays inside it
  const week = fn("renderWeek", "function weekBrief(");
  assert.match(week, /const W=appW\(\)-40,L=CHART_IN,R=W-CHART_IN,s=\(R-L\)\/Math\.max\(1,n-1\),X=i=>L\+i\*s;/);
  assert.match(week, /wrap\.style\.setProperty\("--wk-cols",n>2\?`\$\{edge\} repeat\(\$\{n-2\},1fr\) \$\{edge\}`/);
  assert.match(week, /wrap\.style\.setProperty\("--wk-pad",/);
  assert.match(week, /const xh=clamp\(x,wh,W-wh\),xl=clamp\(x,wl,W-wl\);/);
  // an end column is cut at the content edge, but its tapped wash and the weekend band are centred
  // on its point, no more than 3px past the edge, or the box sat visibly off its own day's name
  assert.match(week, /const he=Math\.min\(s\/2-3,L\+3\),colL=i=>i<=0\?L-he:L\+\(i-\.5\)\*s\+3,colR=i=>i>=n-1\?W-L\+he:L\+\(i\+\.5\)\*s-3;/);
  assert.match(html, /\.wk-day:first-child::before\{left:max\(-3px,calc\(3px - var\(--wk-pad,0px\)\)\);right:max\(3px,calc\(var\(--wk-pad,0px\) - 3px\)\)\}/);
  assert.match(html, /\.wk-day:last-child::before\{left:max\(3px,calc\(var\(--wk-pad,0px\) - 3px\)\);right:max\(-3px,calc\(3px - var\(--wk-pad,0px\)\)\)\}/);
  // the week's hairline runs under the line's ends, like every other chart's rule
  assert.match(week, /<line x1="\$\{L\}" y1="\$\{H-\.5\}" x2="\$\{R\.toFixed\(1\)\}"/);
  // a cached place switch holds the week's height across the clear, so nothing under it jumps
  assert.match(fn("clearPlaceReadings", "\n}\n"), /wr\.style\.minHeight=wr\.offsetHeight\+"px"/);
  assert.match(week, /wrap\.style\.minHeight="";\n  wrap\.innerHTML=days\.map/);
  assert.doesNotMatch(week, /\(i\+\.5\)\*col/);
  assert.match(html, /\.wk-day:first-child\{padding-right:var\(--wk-pad,0px\)\}\.wk-day:last-child\{padding-left:var\(--wk-pad,0px\)\}/);
  assert.match(html, /align-items:center;align-items:safe center;/);
  // the water and the moon start where the others do: the depth scale sits on its own gridlines
  // inside the plot, placed clear of the curve, the boat, its tag, the now line and the times
  const tide = fn("renderTides", "function renderMoon(");
  assert.match(tide, /const W=appW\(\)-40,H=chartH\(W\),padX=CHART_IN;/);
  assert.match(tide, /const topY=22,seaY=H-34,bedY=seaY\+6,lowY=H-9,x0=padX;/);
  assert.doesNotMatch(tide, /axisW|\(x0-6\)\.toFixed/);
  assert.match(tide, /const shared=spots\.find\(s=>grids\.every\(g=>g\.quiet\|\|!gHits\(g,s\)\)\);/);
  // at Beaufort the grass line says 8, so the scale names only 4 and its 2 and 6 are unlabelled gridlines; the
  // coast labels every one (Josh, October 21 2026: "the water section in beaufort feels crowded")
  assert.match(tide, /grids\.push\(\{ft,y:Y\(ft\),w:\(ft\+" ft"\)\.length\*gfs\*\.6,quiet:grass!=null&&ft%4!==0\}\)/);
  assert.match(tide, /const spots=\[\["end",xR\],\["start",x0\]\];/);
  // and clear of the tag's room beside the bow and the stern, drawn or not
  assert.match(tide, /const solid=\[\.\.\.times,\[nx-26\*fs-tagRoom,boatTop,nx\+24\*fs\+tagRoom,ny\+6\],/);
  // the moon too, with the pond's surface and its water from CHART_IN to CHART_IN as well
  const moonSrc = fn("renderMoon", "function yearTitle(");
  assert.match(moonSrc, /const topLab=12\*fs,topY=Math\.round\(topLab\+27\),botY=Math\.round\(labTop-10\),x0=padX,xR=W-padX;\n  const X=t=>x0\+\(t-t0\)\/\(t1-t0\)\*\(xR-x0\);/);
  assert.match(moonSrc, /const W=appW\(\)-40,padX=CHART_IN,fs=/);
  assert.match(moonSrc, /const surf=pondSurface\(h,x0,xR,t0,t1,hz\)/);
  assert.match(moonSrc, /<rect x="\$\{x0\}" y="\$\{\(hz-6\)\.toFixed\(1\)\}" width="\$\{\(xR-x0\)\.toFixed\(1\)\}"[^>]*fill="url\(#pondFill\)"/);
  // the year's months are laid out between the two edges, the wrap clipped to them, the months
  // row padded by the same 16px so each letter sits under its point
  const year = fn("renderYear", "const vane=");
  assert.match(year, /const W=appW\(\)-40,L=CHART_IN,R=W-CHART_IN,col=\(R-L\)\/12,X=m=>L\+\(m\+\.5\)\*col/);
  assert.match(year, /<clipPath id="yrClip"><rect x="\$\{L\}" y="0" width="\$\{\(R-L\)\.toFixed\(1\)\}"/);
  assert.match(year, /revealChart\("year",svg,\{xa:L,xb:R,/);
  assert.match(html, /\.yr-months\{display:flex;margin-top:8px;padding:0 16px\}/);
  // and the harnesses measure it: every line and its fill at the same two edges within a pixel at
  // 320 to 900 at both places, with the rows under their points, and the week tapped at its points
  assert.match(shots, /async function even\(page\)/);
  assert.match(shots, /\.\.\.await crowded\(page\), \.\.\.await pillClear\(page\), \.\.\.await even\(page\)/);
  assert.match(shots, /\.\.\.await titlesFit\(page\),\.\.\.await even\(page\)/);
  assert.match(shots, /render\(LAST\.d,LAST\.live,LAST\.savedAt\);await PAINT;finishReveal\(\);/);
  assert.match(interactions, /const weekAt=async\(page,b\)=>/);
});

test("a paint says when it has landed, and the harnesses wait on it rather than counting frames", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  // the stamp goes live on a paint's first frame and the charts land several frames after it, so
  // the stamp is no signal that the page can be measured: PAINT is the latest paint's promise
  assert.match(html, /let PAINT=Promise\.resolve\(\),PAINT_DONE=\(\)=>\{\};\nfunction paintBegin\(\)\{PAINT_DONE\(\);PAINT=new Promise\(r=>PAINT_DONE=r\)\}/);
  assert.match(html, /const gen=\+\+RENDER_GEN;\n  paintBegin\(\);/);
  // settled after the last stage, and by a superseding loading shell, so no waiter hangs
  assert.match(html, /  fishMotion\(\);\n  PAINT_DONE\(\);\n  \}\);\}\);\}\);\},!!warning\);\n\}/);
  assert.match(html, /RENDER_GEN\+\+;PAINT_DONE\(\);/);
  for (const f of ["interactions", "tonight", "shots"]) {
    const src = await readFile(new URL(`tools/${f}.mjs`, root), "utf8");
    assert.match(src, /\bPAINT\b/, `tools/${f}.mjs waits on PAINT`);
  }
  const inter = await readFile(new URL("tools/interactions.mjs", root), "utf8");
  assert.match(inter, /const painted=page=>page\.evaluate\(async\(\)=>\{await PAINT;/);
  // a place switch with a cache takes the last place's pictures down before the first frame
  assert.match(html, /if\(cached\)\{paintLocationShell\(\);clearPlaceReadings\(\);render\(cached\.data,false,cached\.savedAt\)\}/);
  const clear = html.slice(html.indexOf("function clearPlaceReadings("), html.indexOf("function setLoc("));
  for (const id of ["hourlySvg", "weekSvg", "tideSvg", "moonSvg", "yearSvg", "uvSvg", "ncBars"]) assert.ok(clear.includes(`"${id}"`), `${id} is cleared on a switch`);
  assert.match(clear, /renderAlerts\(null\);/);
  assert.match(inter, /the coast's water is gone on the switch's first frame/);
});

/* ── the storm card ─────────────────────────────────── */
// values made in the sandbox are compared as data, since its arrays are not this realm's
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)), m);
// The page's own storm block in a sandbox, with a clock and a fetch of its own: fetchStorms and the
// beach lane run against tools/storm-fixtures.mjs, the real products each scenario serves the harnesses.
async function stormSandbox(nowISO, fetchJSON = async () => { throw new Error("offline"); }) {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const now = Date.parse(nowISO);
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = vm.createContext({ Date: Clock, location: { search: "" }, fetchJSON });
  vm.runInContext([lift(/const LOCS=\{[\s\S]*?\n\};/), lift(/const toRad=x=>[^\n]*/), lift(/const distMi=[\s\S]*?asin\(Math\.sqrt\(a\)\)\};/),
    lift(/const dirTxt=[^\n]*/), ...stormHelpers(html, lift), html.slice(html.indexOf("/* ── the storm card"), html.indexOf("/* ── tide ─")),
    "globalThis.S={vtecOf,alertLive,alertRow,tcvRead,wwRead,inchesIn,hlsRead,tcpRead,tcmRead,namedIn,ssCat,stormRead,stormStrip,fetchStorms,stormLane,LOCS,"
      + "stormStory,stormLineHtml,stormWarns,stormSay,stormStamps,stormHero,stormLead,stormPart,stCalm,relDay,peakSize,stormCover,stormGust,stormWaits,stormDue,ssMph,"
      + "stormQuote,stormQuoteShort,winterKinds,winterLabel,wssiRead,wssiMajor,wssiOver,wsWindow,wsFor,wssiUrl,stormEvents,stormEmergency,stormPeak,stormAmount,stormDots,stormWhen,stormUntil};"].join("\n"), ctx);
  return { S: ctx.S, now, html };
}
// what the storm block reads from the rest of the page: the strip's short-fuse list, the relative-day
// reader, and the clock words
const stormHelpers = (html, lift) => [lift(/const SAY_JUNK=[^\n]*/), lift(/const sayKeep=[^\n]*/), lift(/const SHORT_FUSE=[^\n]*/), lift(/const REL_DAYS=[^\n]*/), lift(/const REL_END=[\s\S]*?\};/),
  html.slice(html.indexOf("function relDay("), html.indexOf("/* The strip enters when an alert arrives")),
  lift(/const clock12=d=>\{[\s\S]*?ap\};/), lift(/const clock=d=>\{[^\n]*\};/), lift(/const spokenClock=[^\n]*/), lift(/const sentence=[^\n]*/), lift(/const esc=s=>[^\n]*/)];
const STORM_FIX = () => import(new URL("tools/storm-fixtures.mjs", root));
// a scenario read the way the page reads it: the point's alerts through alertRow and the VTEC drop, then
// the storm lane (advisories and the beach zone), then the model
async function stormScenario(name, edit = (st) => st, at) {
  const { STORMS, stormAlerts, stormProducts, stormWssi } = await STORM_FIX();
  const st = edit(structuredClone({ ...STORMS[name], o: undefined }));
  const asked = [];
  const fetchJSON = async (url) => { asked.push(url); const j = /\/alerts\//.test(url) ? { features: stormAlerts(st, url) } : /mapservices\.weather\.noaa\.gov/.test(url) ? stormWssi(st) : stormProducts(st, url); if (!j) throw new Error("404"); return j; };
  const { S, now, html } = await stormSandbox(at || st.when, fetchJSON);
  const L = S.LOCS[st.loc];
  const point = (await fetchJSON("https://api.weather.gov/alerts/active?point=1,1")).features.map(S.alertRow).filter(S.alertLive);
  const { storms, beach, wssi } = await S.stormLane(L, Promise.resolve(point));
  return { S, L, st, point, storms, beach, wssi, now, html, asked, model: S.stormRead(L, point, beach, storms, now, { wssi }) };
}

test("the storm card's readers take the Weather Service's products as written", async () => {
  const { S } = await stormSandbox("2026-10-10T20:20:00Z");
  // VTEC: what happened, what it is, its event number and its times
  const hu = S.vtecOf("/O.CON.KILM.HU.W.1006.000000T0000Z-000000T0000Z/");
  deq({ ...hu }, { action: "CON", office: "KILM", phen: "HU", sig: "W", key: "HU.W", etn: 1006, begin: null, end: null });
  assert.equal(S.vtecOf("/O.CON.KRLX.WI.Y.0008.261010T2100Z-261011T1500Z/").end, "2026-10-11T15:00:00Z");
  assert.equal(S.vtecOf("/00000.0.ER.000000T0000Z.000000T0000Z.000000T0000Z.OO/"), null, "a hydrologic VTEC line is not a product");

  // a cancelled advisory and an upgraded watch stay in the live feed, and go
  const live = JSON.parse(await readFile(new URL("tools/storm-fixtures/feed/live-2026-10-10.json", root), "utf8")).features;
  const row = (k) => S.alertRow(live[k]);
  assert.equal(S.alertLive(row("cancelled")), false, "JAN's cancelled Wind Advisory");
  assert.equal(S.alertLive(row("upgraded")), false, "MSO's upgraded Winter Storm Watch, a day after it was replaced");
  assert.equal(S.alertLive(row("tornado-warning")), true);
  assert.equal(S.alertLive({ event: "Special Weather Statement", vtec: [] }), true, "a product with no VTEC is not over");
  assert.equal(S.alertLive({ vtec: ["/O.UPG.KMSO.WS.A.0005.261011T0000Z-261012T0000Z/", "/O.NEW.KMSO.WS.W.0004.261011T0000Z-261012T0000Z/"] }), true,
    "a segment that upgrades one product and issues the next is live");
  // and an alert keeps what the card needs: its VTEC, headline, AWIPS id, onset and damage tags
  const torn = row("tornado-warning");
  deq([...torn.vtec], ["/O.CON.KCHS.TO.W.0009.000000T0000Z-261010T2045Z/"]);
  assert.equal(torn.par.tornadoDetection, "OBSERVED");
  const wind = S.alertRow(JSON.parse(await readFile(new URL("tools/storm-fixtures/isaias/alerts-point-sp.json", root), "utf8")).features[0]);
  assert.equal(wind.headline, "WIND ADVISORY REMAINS IN EFFECT FROM 5 PM THIS AFTERNOON TO 11 AM EDT SUNDAY");
  assert.equal(wind.awips, "NPWRLX");
  assert.equal(wind.onset, "2026-10-10T17:00:00-04:00");
  assert.ok(wind.zones.includes("WVZ516"));

  // the public advisory: the padded number of a full advisory reads (it did not, and the section blinked)
  const { STORMS } = await STORM_FIX();
  const tcp = (st, i = 0) => S.tcpRead(st.tcp[i].productText, st.tcp[i].issuanceTime);
  const wpc = tcp(STORMS["isaias-farm-today"]);
  deq({ ...wpc, headlines: [...wpc.headlines] }, { bin: "AT4", atcf: "AL092026", type: "Post-Tropical Cyclone", name: "Isaias", adv: "16",
    issued: "2026-10-10T15:34:00+00:00", valid: "2026-10-10T15:00:00.000Z", local: "1000 AM CDT Sat Oct 10 2026", office: "WPC",
    headlines: ["FLASH FLOODING RISK CONTINUES WITH ISAIAS"], lat: 32.8, lon: -86.8, mph: 35, dir: "NNW", dirDeg: 335, spd: 10, mb: 1006, final: false, handoff: false });
  const nhc15 = tcp(STORMS["isaias-farm-today"], 2);
  assert.equal(nhc15.adv, "15");
  assert.equal(nhc15.handoff, true, "NHC's last advisory hands Isaias to WPC");
  assert.equal(nhc15.final, false, "and so is not the last word on it");
  const flo = STORMS["florence-coast"];
  assert.equal(tcp(flo, 1).adv, "56A", "an intermediate keeps its letter");
  assert.equal(tcp(flo, 3).adv, "24", "a corrected advisory reads as its number");
  assert.equal(tcp(flo, 3).name, "Isaac");
  const fake = (title, extra = "") => S.tcpRead(`\n000\nWTNT35 KNHC 061500\nTCPAT5\n \nBULLETIN\n${title}\nNWS National Hurricane Center Miami FL       AL052026\n1100 AM EDT Tue Oct 06 2026\n\nLOCATION...25.0N 70.0W\nMAXIMUM SUSTAINED WINDS...30 MPH...45 KM/H\n${extra}`, "2026-10-06T15:00:00+00:00");
  assert.equal(fake("Tropical Depression Nine Advisory Number   1").adv, "1");
  deq([fake("Remnants of Ida Advisory Number  30").type, fake("Remnants of Ida Advisory Number  30").name], ["Remnants", "Ida"]);
  assert.equal(fake("Potential Tropical Cyclone Eight Advisory Number   2").name, "Eight");
  assert.equal(fake("Hurricane Five Advisory Number   2", "PRESENT MOVEMENT...STATIONARY\n").spd, 0, "only STATIONARY is not moving");
  assert.equal(fake("Hurricane Five Advisory Number   2").spd, null, "a missing movement is unknown, never stationary");
  assert.equal(fake("Hurricane Five Advisory Number   2", "This is the last public advisory on this system.\n").final, true);
  assert.equal(fake("Hurricane Five Advisory Number   2").final, false);
  // a special advisory reads (most often a storm strengthening near landfall); it was dropped, and the
  // card fell back on the advisory before it
  assert.equal(fake("Hurricane Five Special Advisory Number   2").adv, "2");
  assert.equal(fake("Hurricane Five Special Advisory Number   2").name, "Five");
  const floSpecial = S.tcpRead(flo.tcp[0].productText.replace(/(Hurricane Florence) Advisory Number/, "$1 Special Advisory Number"), flo.tcp[0].issuanceTime);
  deq([floSpecial.name, floSpecial.adv, floSpecial.mph], ["Florence", "57", 105], "Florence's 57 retitled a special advisory still reads");
  assert.equal(S.tcmRead("TCMAT5 HURRICANE FIVE SPECIAL FORECAST/ADVISORY NUMBER   2 NWS NATIONAL HURRICANE CENTER MIAMI FL AL052026 CENTER LOCATED NEAR 25.0N 70.0W AT 06/1500Z MAX SUSTAINED WINDS 70 KT WITH GUSTS TO 85 KT.", "2026-10-06T15:00:00+00:00").adv, "2", "and its special forecast advisory");

  // the forecast advisory: knots, and the forecast points on the advisory's own month
  const tcm = S.tcmRead(flo.tcm[0].productText, flo.tcm[0].issuanceTime);
  assert.equal(tcm.kt, 90);
  assert.equal(tcm.gust, 110);
  assert.equal(tcm.atcf, "AL062018");
  deq({ ...tcm.track[0] }, { when: "2018-09-13T15:00:00.000Z", lat: 33.4, lon: -75.5, kt: 90 });
  deq({ ...tcm.track[2] }, { when: "2018-09-14T12:00:00.000Z", lat: 34.2, lon: -77.8, kt: 85, note: "INLAND" });
  const wpcTcm = S.tcmRead(STORMS["isaias-farm-today"].tcm[0].productText, STORMS["isaias-farm-today"].tcm[0].issuanceTime);
  deq(wpcTcm.track.map((p) => [p.when, p.lat, p.lon, p.kt]), [["2026-10-10T15:00:00.000Z", 32.8, -86.8, 30], ["2026-10-11T00:00:00.000Z", 34, -87.4, 30],
    ["2026-10-11T12:00:00.000Z", 36.7, -85.5, 25], ["2026-10-12T00:00:00.000Z", 38.3, -81, 20]], "and a DISSIPATED point is no point");
  const turn = S.tcmRead("TCMAT1 CENTER LOCATED NEAR 30.0N 70.0W AT 30/1500Z MAX SUSTAINED WINDS 70 KT WITH GUSTS TO 85 KT. FORECAST VALID 01/0000Z 31.0N 71.0W MAX WIND 75 KT...GUSTS 90 KT.", "2026-09-30T14:50:00+00:00");
  assert.equal(turn.track[1].when, "2026-10-01T00:00:00.000Z", "a point past the month's end is the next month's");
  // the category is the knots', never the rounded miles an hour: 96 kt is a 3 that the advisory writes as 110 mph
  deq([63, 64, 82, 83, 95, 96, 112, 113, 136, 137].map(S.ssCat), [null, 1, 1, 2, 2, 3, 3, 4, 4, 5]);

  // a TCV segment, collapsed before it is read: the peaks, windows, threat lines and the impacts word
  const seg = S.tcvRead(flo.point.find((f) => f.properties.event === "Hurricane Warning").properties.description);
  assert.equal(seg.wind.peak, "65-85 mph with gusts to 105 mph");
  deq(seg.wind.windows.map((w) => [w.label, w.text]), [["Window for Tropical Storm force winds", "until Saturday afternoon"],
    ["Window for Hurricane force winds", "early this evening until Friday afternoon"]]);
  assert.equal(seg.wind.threat, "Potential for wind greater than 110 mph");
  deq([seg.wind.potential, seg.wind.realized, seg.wind.phase], ["Unfolding", null, "unfolding"]);
  // the potential impacts and the realized ones are kept apart: Florence's house zone gave its surge
  // only REALIZED IMPACTS: Being Assessed, a day before landfall, which is no level of the surge's
  deq([seg.surge.potential, seg.surge.realized, seg.surge.phase], [null, "Being Assessed", "realized"], "REALIZED IMPACTS is the after, and kept apart");
  assert.ok(!("level" in seg.wind), "no one impacts word stands for both");
  // what to plan, prepare and act on, as written
  assert.equal(seg.wind.act, "Now is the time to shelter from life-threatening wind. Be ready to move to the safest place inside your shelter if necessary.");
  assert.equal(seg.wind.plan, "Plan for extreme wind of equivalent CAT 3 hurricane force or higher due to possible forecast changes in track, size, or intensity.");
  assert.match(seg.wind.prepare, /^Last minute efforts should solely focus on protecting life\./);
  assert.equal(seg.rain.act, "Heed any flood watches and warnings. Failure to take action will likely result in serious injury or loss of life.");
  assert.equal(seg.tornado.act, "Move quickly to the safest place within your shelter if a tornado warning is issued.");
  assert.equal(seg.rain.peak, "Additional More than two feet");
  assert.equal(seg.rain.potential, "Devastating to Catastrophic");
  assert.equal(seg.rain.trend, "increased");
  assert.equal(seg.tornado.peak, "Situation is somewhat favorable for tornadoes");
  // and the live CAP form, which wraps a key mid-phrase and can leave a forecast empty (TCVSGX, October 10 2026)
  const sgx = S.tcvRead("* WIND\n- LATEST LOCAL FORECAST: Below tropical storm force wind\n- Peak Wind Forecast: 10-15 mph with gusts to 30 mph\n\n- THREAT TO LIFE AND PROPERTY THAT INCLUDES TYPICAL FORECAST\nUNCERTAINTY IN TRACK, SIZE AND INTENSITY: Potential for wind 39\nto 57 mph\n- The wind threat has remained nearly steady from the\nprevious assessment.\n\n- POTENTIAL IMPACTS: Limited\n- Damage to porches, awnings, carports, sheds, and unanchored\nmobile homes.\n\n* TORNADO\n- LATEST LOCAL FORECAST:\n- Situation is unfavorable for tornadoes\n\n- THREAT TO LIFE AND PROPERTY THAT INCLUDES TYPICAL FORECAST\nUNCERTAINTY IN TRACK, SIZE AND INTENSITY: Tornadoes not expected\n\n- POTENTIAL IMPACTS: Little to None");
  assert.equal(sgx.wind.threat, "Potential for wind 39 to 57 mph");
  assert.equal(sgx.wind.trend, "steady");
  assert.equal(sgx.tornado.forecast, null);
  assert.equal(sgx.tornado.peak, "Situation is unfavorable for tornadoes");
  assert.equal(sgx.tornado.potential, "Little to None");
  deq(Object.keys(S.tcvRead("* WHAT...Southeast winds 20 to 30 mph.")), [], "an ordinary product is no TCV");

  // an ordinary warning's bullets, old and new, read as written: the old ones bullet by bullet, each
  // value stopped at the next "* KEY..." (an empty ice bullet ran on into the snow's)
  const blizz = STORMS["blizzard-farm"].point[0].properties.description;
  assert.equal(S.wwRead(blizz)["SNOW ACCUMULATIONS"], "12 TO 18 INCHES.");
  const empty = "* HAZARD TYPES...HEAVY SNOW.\n* ICE ACCUMULATIONS...\n* SNOW ACCUMULATIONS...4 TO 8 INCHES.\n* TIMING...THURSDAY.";
  assert.equal(S.wwRead(empty)["ICE ACCUMULATIONS"], "", "RLX, February 13 2014: an empty bullet stays empty");
  assert.equal(S.wwRead(empty)["SNOW ACCUMULATIONS"], "4 TO 8 INCHES.");
  // the rain a TCV gives, in inches, so the beach's worse number rides beside the house's; an elevation is
  // never an amount ("Heavy snow above 3000 feet" read as 36,000 inches)
  assert.equal(S.inchesIn("Additional More than two feet"), 24);
  assert.equal(S.inchesIn("Additional 4-8 inches, with locally higher amounts"), 8);
  assert.equal(S.inchesIn("Additional 10 to 15 inches"), 15);
  assert.equal(S.inchesIn("between 3 and 8 inches"), 8);
  assert.equal(S.inchesIn("Heavy snow above 3000 feet"), null);
  assert.equal(S.inchesIn("6 to 10 inches above 3,000 feet"), 10);
  assert.equal(S.inchesIn("an additional .5 inches"), 0.5, "a bare decimal keeps its dot");

  // A winter warning's snow and ice are never read as numbers (October 10 2026). Twelve winters of the
  // offices' own warnings found a misreading in every grammar written for them, so the card quotes the
  // warning's own sentence that carries the amounts, whole: the WHAT line's sentence that says
  // "accumulation", else its first sentence, else the warning's headline, else nothing
  const q = (desc, headline = null) => S.stormQuote({ desc, headline });
  const jan26 = "* WHAT...Heavy mixed precipitation expected. Total snow and sleet\naccumulations between 3 and 8 inches and ice accumulations between\ntwo tenths and one half of an inch.\n\n* WHERE...Portions of southwest Virginia and southeast and southern\nWest Virginia.\n\n* WHEN...From 7 AM Saturday to 7 AM EST Monday.";
  assert.equal(q(jan26), "Total snow and sleet accumulations between 3 and 8 inches and ice accumulations between two tenths and one half of an inch.", "RLX, January 23 2026");
  assert.equal(q("* WHAT...Storm total of 3 to 5 inches. Locally higher amounts on ridgetops.\n\n* WHERE...Portions of central West Virginia."), "Storm total of 3 to 5 inches.", "RLX, December 8 2025: no accumulation, its first sentence");
  assert.equal(q("* WHAT...Snow expected. Total snow accumulations of 1 to 3 inches through 7 a.m. Tuesday. Winds gusting as high as 35 mph."), "Total snow accumulations of 1 to 3 inches through 7 a.m. Tuesday.", "a clock's stops do not end a sentence");
  assert.equal(q(blizz, "WINTER STORM WARNING REMAINS IN EFFECT UNTIL 1 AM EST SUNDAY"), "WINTER STORM WARNING REMAINS IN EFFECT UNTIL 1 AM EST SUNDAY", "an old product has no WHAT line: its headline");
  assert.equal(q("* SNOW ACCUMULATIONS...12 TO 18 INCHES."), null, "with no WHAT line and no headline, nothing: the title is the warning's name");
  assert.equal(q(""), null);
  // and the shorter sentence the warning itself gives, for a title the accumulation sentence is too long
  // for (stormTitleFit): its WHAT line's first sentence, when that is not the quote and is short
  const sh = (desc) => S.stormQuoteShort({ desc });
  assert.equal(sh(jan26), "Heavy mixed precipitation expected.", "RLX, January 23 2026");
  assert.equal(sh("* WHAT...Storm total of 3 to 5 inches. Locally higher amounts on ridgetops."), null, "the first sentence is the quote itself");
  assert.equal(sh(blizz), null, "no WHAT line, nothing shorter: the title is the warning's name");
  assert.equal(sh("* WHAT...Heavy snow and blowing snow, with whiteout conditions at times on the higher ridges. Total snow accumulations of 6 to 10 inches."), null, "and nothing over 60 characters");
  // and every text that a grammar misread is only ever quoted: "a few hundredths of an inch" read as an
  // inch of ice, "3,000 feet" as an amount, an ellipsis as a decimal point, "of snow" taking the ice
  // before it, "snow and sleet" said as snow, "over a foot" as a foot
  for (const [what, why] of [
    ["Total snow accumulations between 4 and 7 inches and ice accumulations of a light glaze to a few hundredths of an inch.", "RLX's own wording, 14 products from 2014 to 2026"],
    ["Total snow accumulations ranging from 2 to 4 inches below 3,000 feet with 4 to 7 inches above 3,000 feet.", "LWX, December 11 2023"],
    ["Additional ice accumulations around one quarter of an inch, with up to an inch of snow.", "PBZ, February 5 2025"],
    ["Total ice accumulations up to one quarter to one third of an inch, along with less than an inch of snow and sleet.", "LWX, February 11 2025"],
    ["Total snow and sleet accumulations between 12 and 18 inches.", "LWX, January 24 2026"],
    ["Ice accumulations around one to a quarter inch.", "LWX, February 17 2021: an inverted range"],
    ["Total snow accumulations of over a foot.", "over a foot"]]) {
    const desc = `* WHAT...Heavy mixed precipitation expected. ${what}\n\n* WHERE...Somewhere.`;
    assert.equal(q(desc), what, why);
    assert.equal(S.stCalm(q(desc)), what, "mixed case is left as written");
  }
  assert.equal(S.stCalm("WINTER STORM WARNING REMAINS IN EFFECT UNTIL 1 AM EST SUNDAY"), "Winter storm warning remains in effect until 1 AM EST Sunday", "an old product's capitals in sentence case");
  // what a winter warning is for, from its words, and never how much
  const kinds = (desc, phen = "WS") => [...S.winterKinds(S.wwRead(desc), phen)];
  deq(kinds(jan26), ["snow", "ice"]);
  deq(kinds("* WHAT...Heavy snow expected. Total snow accumulations of 6 to 10 inches."), ["snow"]);
  deq(kinds("* WHAT...Significant icing. Total ice accumulations of one quarter inch. Light snow possible.", "IS"), ["ice", "snow"], "an ice storm's ice comes first");
  deq(kinds("* WHAT...Freezing rain. Additional ice accumulations of a light glaze.", "WW"), ["ice"]);
  deq(kinds("* WHAT...Blizzard conditions. Total snow accumulations of 6 to 10 inches. Winds gusting as high as 50 mph.", "BZ"), ["snow", "wind"]);
  deq(kinds("* HAZARD TYPES...FREEZING RAIN...SLEET...AND SNOW BECOMING ALL SNOW.\n* ICE ACCUMULATIONS...ONE QUARTER INCH OF ICE.\n* SNOW ACCUMULATIONS...4 TO 8 INCH STORM TOTAL."), ["snow", "ice"], "an old product's hazard bullets");
  deq(kinds(blizz), ["snow"], "and its keys");
  deq(kinds("* WHAT...Snow and ice pellets.", "WS"), ["snow"], "ice pellets are sleet, not ice");
  deq(kinds("* WHAT...Winter storm conditions expected.", "IS"), ["ice"], "with no kind in its words, the product's own");
  deq([["snow"], ["snow", "ice"], ["ice", "snow"], ["snow", "wind"], ["snow", "ice", "wind"]].map(S.winterLabel), ["Snow", "Snow and ice", "Ice and snow", "Snow and wind", "Snow, ice and wind"]);

  // WPC's Winter Storm Severity Index at the farm's point, the farm's bar for a Winter Storm Warning (F3).
  // The answers are the service's own: the farm's on October 11 2026 had no results, as every answer
  // outside winter does, and a point in Montana that night lay in the Winter Weather Area, Minor, Moderate
  // and Major areas on Day 1, which nest, so that day's reading is the highest, and in the Winter Weather
  // Area and Minor on Day 2. Each of the three days is its own layer, and one identify request asks them all
  const { WSSI_REAL, wssiAnswer } = await STORM_FIX();
  assert.equal(S.wssiRead(WSSI_REAL.farm), null, "no results is no reading");
  deq(S.wssiRead(WSSI_REAL.major), { impact: "MAJOR", issued: "2026-10-11T00:15:00.000Z", days: [
    { day: 1, impact: "MAJOR", start: "2026-10-11T00:00:00.000Z", end: "2026-10-12T00:00:00.000Z" }, { day: 2, impact: "MINOR", start: "2026-10-12T00:00:00.000Z", end: "2026-10-13T00:00:00.000Z" }] });
  deq(WSSI_REAL.major.results.filter((r) => r.layerId === 1).map((r) => r.attributes.impact), ["WINTER WEATHER AREA", "MINOR", "MODERATE", "MAJOR"], "the service's own impact words");
  deq(WSSI_REAL.layer4.major.features.map((f) => f.attributes.impact), ["WINTER WEATHER AREA", "MINOR", "MODERATE", "MAJOR"], "the same words from the 72-hour layer the page asked until October 11");
  assert.equal(S.wssiRead(WSSI_REAL.layer4.major), null, "whose three days at once are a shape the page no longer reads");
  assert.equal(S.wssiRead(wssiAnswer("EXTREME", "2025-01-05T06:00:00Z")).impact, "EXTREME");
  assert.equal(S.wssiRead(wssiAnswer(["WINTER WEATHER AREA", "MODERATE", "MODERATE"], "2026-01-24T00:00:00Z")).impact, "MODERATE");
  for (const bad of [null, {}, { error: { code: 400 } }, { results: null }, { results: [{ layerId: 1, attributes: { impact: "SEVERE" } }] }, { results: [{}] },
    { results: [{ layerId: 4, attributes: { impact: "MAJOR" } }] }, { features: [{ attributes: { impact: "MAJOR" } }] }])
    assert.equal(S.wssiRead(bad), null, `${JSON.stringify(bad)} is no reading`);
  // Major or Extreme on a day the warning is in effect: a day that overlaps what is left of its hours
  const at = Date.parse("2026-10-11T12:00:00Z"), win = { begin: "2026-10-11T06:00:00Z", end: "2026-10-12T06:00:00Z" };
  const day1 = (impact) => ({ impact, days: [{ day: 1, impact, start: "2026-10-11T00:00:00.000Z", end: "2026-10-12T00:00:00.000Z" }] });
  deq(["WINTER WEATHER AREA", "MINOR", "MODERATE", "MAJOR", "EXTREME"].map((impact) => S.wssiMajor(day1(impact), at, win)), [false, false, false, true, true], "Major or Extreme");
  assert.equal(S.wssiMajor({ impact: "MAJOR", days: [{ day: 1, impact: "MAJOR", start: "2026-10-10T00:00:00.000Z", end: "2026-10-11T06:00:00.000Z" }] }, at, win), false, "and not a day that is over");
  assert.equal(S.wssiMajor({ impact: "MAJOR", days: [{ day: 1, impact: "MAJOR", start: null, end: null }] }, at, win), false, "nor a day with no times");
  assert.equal(S.wssiMajor(null, at, win), false);
  // a bigger storm on Day 3 never raises tonight's small warning, the way the 72-hour layer's maximum did;
  // a Major on the warning's own day does
  const tonight = { begin: "2026-10-11T22:00:00Z", end: "2026-10-12T12:00:00Z" };
  const day3 = S.wssiRead(wssiAnswer(["MODERATE", null, "MAJOR"], "2026-10-11T00:00:00Z")), day1m = S.wssiRead(wssiAnswer(["MAJOR", "MINOR", null], "2026-10-11T00:00:00Z"));
  deq([day3.impact, S.wssiOver(day3, at, tonight), S.wssiMajor(day3, at, tonight)], ["MAJOR", "MODERATE", false], "a Day-3 Major beside a Day-1 warning");
  deq([S.wssiOver(day1m, at, tonight), S.wssiMajor(day1m, at, tonight)], ["MAJOR", true], "a Day-1 Major on the warning's own hours");
  assert.equal(S.wssiMajor(day3, at, { begin: "2026-10-13T06:00:00Z", end: "2026-10-14T00:00:00Z" }), true, "and the Day-3 Major is a Day-3 warning's");
  // the warning's own hours: its VTEC's begin and end, or its onset and ends
  deq({ ...S.wsWindow({ vtec: ["/O.NEW.KRLX.WS.W.0002.250105T1700Z-250107T1100Z/"], onset: "2025-01-05T05:24:00-05:00", ends: null }) }, { begin: "2025-01-05T17:00:00Z", end: "2025-01-07T11:00:00Z" });
  deq({ ...S.wsWindow({ vtec: ["/O.CON.KRLX.WS.W.0007.000000T0000Z-210219T1500Z/"], onset: "2021-02-17T22:04:00-05:00", ends: "2021-02-19T10:00:00-05:00" }) }, { begin: "2021-02-17T22:04:00-05:00", end: "2021-02-19T15:00:00Z" });
  assert.equal(S.wssiUrl(S.LOCS.sp), "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer/identify?geometry=-80.9942,37.8215&geometryType=esriGeometryPoint&sr=4326&layers=all:1,2,3&tolerance=0&mapExtent=-81.0042,37.8115,-80.9842,37.8315&imageDisplay=100,100,96&returnGeometry=false&returnFieldName=true&f=json",
    "one identify request for layers 1 to 3, Overall_Impact_Day_1, _2 and _3, at the farm's point, with the fields by name");
  // a stormAmount past a decimal point starts at the number, never at the digits after the dot
  deq([...S.stormAmount("an additional .05 inches", "inches|inch")], ["0.05", "inches"]);

  // a storm named in an alert stands beside a storm word or "remnants": never a county, a town or a number
  const sys = [{ name: "Isaias" }];
  deq([...S.namedIn(wind.desc, sys)], ["Isaias"], "RLX's Wind Advisory: the remnants of Isaias");
  const coast = JSON.parse(await readFile(new URL("tools/storm-fixtures/isaias/alerts-point-mb.json", root), "utf8")).features;
  deq([...S.namedIn(coast.map((f) => f.properties.description).join(" "), sys)], [], "ILM's Flood Watch says tropical moisture");
  deq([...S.namedIn("Rainfall from a very slow moving Tropical Cyclone Debby", [{ name: "Debby" }])], ["Debby"]);
  deq([...S.namedIn("Darlington-Dillon-Florence-Marion", [{ name: "Florence" }])], []);
  deq([...S.namedIn("Including the cities of Hurricane, Teays Valley", [{ name: "Ida" }])], []);
  deq([...S.namedIn("Rainfall totals of up to eight inches. Eight remnants", [{ name: "Eight", ptc: true }])], []);
  deq([...S.namedIn("Potential Tropical Cyclone Eight will bring", [{ name: "Eight", ptc: true }])], ["Eight"]);
  deq([...S.namedIn("HURRICANE SANDY WILL COMBINE WITH AN UPPER LEVEL LOW", [{ name: "Sandy" }])], ["Sandy"]);

  // the HLS: its headline, storm information, the watches it lists, and whether it is the last one
  const hls = S.hlsRead(flo.point.find((f) => f.properties.event === "Tropical Cyclone Local Statement").properties.description);
  assert.equal(hls.headline, "TROPICAL STORM FORCE WINDS HAVE REACHED THE NORTH CAROLINA COASTAL WATERS AND WILL MOVE ONSHORE THIS AFTERNOON");
  assert.equal(hls.distance, "About 150 miles east-southeast of Wilmington NC or about 200 miles east of Myrtle Beach SC");
  deq([hls.position, hls.intensity, hls.movement], ["33.4N 75.5W", "Storm Intensity 105 mph", "Movement Northwest or 315 degrees at 10 mph"]);
  assert.equal(hls.current.length, 3);
  assert.equal(hls.final, false);
  assert.equal(S.hlsRead("HLSMOB\n\n**ALL HAZARDS HAVE ENDED. THEREFORE, THIS WILL BE THE FINAL STATEMENT FOR ISAIAS**").final, true);
});

test("the storm card comes up for a major storm and stays down otherwise", async () => {
  // the six scenarios, through the page's own fetch path
  const florence = await stormScenario("florence-coast");
  const m = florence.model;
  assert.equal(m.tier, "storm");
  deq([...m.rules], ["C1", "N2", "N3"]);
  assert.match(m.why, /^C1: a tropical watch or warning \(Storm Surge Warning at the point, Hurricane Warning at the point, Storm Surge Warning on the beach zone, Hurricane Warning on the beach zone\)$/);
  deq({ name: m.storm.name, type: m.storm.type, category: m.storm.category, mph: m.storm.mph, kt: m.storm.kt, ATCF: m.storm.ATCF, adv: m.storm.adv },
    { name: "Florence", type: "Hurricane", category: 2, mph: 105, kt: 90, ATCF: "AL062018", adv: "57" });
  deq({ ...m.storm.nearest }, { miles: 7, dir: "S", when: "2018-09-14T12:00:00.000Z" }, "TCM 57's point for 8 a.m. Friday, at the house");
  // The category is the forecast advisory's knots only while it is the public advisory's own and says
  // what the public advisory's mph say: an intermediate 57A at 115 mph is a Category 3 that TCM 57's
  // 90 knots called a 2, under a stamp naming 57A. Then it is the public advisory's mph, on NHC's steps
  const S0 = florence.S;
  const cat = (edit) => { const x = S0.stormRead(florence.L, florence.point, florence.beach, florence.storms.map((s) => s.name === "Florence" ? { ...s, ...edit(s) } : s), florence.now).storm; return [x.category, x.kt]; };
  deq(cat(() => ({ adv: "57A", mph: 115 })), [3, null], "57A strengthened past the last full advisory's knots");
  deq(cat(() => ({ adv: "57A", mph: 105 })), [2, 90], "an intermediate that changed nothing keeps the knots");
  deq(cat(() => ({ adv: "58", mph: 105 })), [2, null], "a forecast advisory for another number is not this one's");
  deq(cat((s) => ({ mph: 110, tcm: { ...s.tcm, kt: 96 } })), [3, 96], "96 knots is a 3 that the advisory writes as 110 mph");
  deq([95, 96, 110, 111, 129, 130, 156, 157, 73, 74].map(S0.ssMph), [1, 2, 2, 3, 3, 4, 4, 5, null, 1]);
  deq({ ...m.storm.now }, { miles: 145, dir: "ESE" });
  assert.equal(m.storm.track.length, 8);
  deq(m.hazards.map((h) => h.key), ["wind", "rain", "surge", "tornado"], "the worst first, the house's own segment");
  assert.ok(m.hazards.every((h) => h.where === "point"));
  assert.ok(m.alerts.filter((a) => /Hurricane|Storm Surge/.test(a.event)).every((a) => !("ends" in a)), "a tropical warning's end is never said");
  assert.equal(m.alerts.find((a) => a.event === "Flash Flood Watch").ends, "2018-09-15T18:00:00-04:00");
  // what to do is the TCV's own ACT line for the worst hazard, never the Flash Flood Watch's paragraph
  // on what a watch means, which was the instruction until October 10 2026
  assert.equal(m.instruction, "Now is the time to shelter from life-threatening wind. Be ready to move to the safest place inside your shelter if necessary.");
  deq([m.instructionFrom, m.instructionAt], ["Hurricane Warning · TCVILM", "2018-09-13T10:55:00-04:00"]);
  assert.equal(m.asOf, "2018-09-13T10:55:00-04:00", "the Weather Service's time is the TCV's, not the Flood Watch's 11:35");
  assert.equal(m.storm.asOf, "2018-09-13T14:44:00+00:00", "and the advisory keeps its own");
  // the beach's worse numbers ride beside the house's, labelled as the beach's
  deq({ ...m.hazards.find((h) => h.key === "surge").beach }, { peak: "The potential for 6-9 feet above ground somewhere within surge prone areas", from: "Hurricane Warning · TCVILM", asOf: "2018-09-13T10:55:00-04:00" });
  assert.equal(m.hazards[0].beach.peak, "70-90 mph with gusts to 115 mph");
  assert.equal(m.hazards.find((h) => h.key === "rain").beach, undefined, "the same rain at both is said once");
  assert.ok(m.hazards.every((h) => !("level" in h)), "no TCV impacts word stands as a level");
  assert.equal(m.statement.intensity, "Storm Intensity 105 mph");
  deq([m.statement.where, m.statement.asOf], ["point", "2018-09-13T11:08:00-04:00"]);
  assert.equal(m.hazards[0].from, "Hurricane Warning · TCVILM", "the segment is said as its strongest product's");
  deq(m.alerts.map((a) => a.vtec[0] || null), ["HU.W.1006", "SS.W.1006", "HU.W.1006", "SS.W.1006", "FF.A.0006", null], "warnings first, the house's before the beach's, the hurricane's before the surge's");
  deq(m.systems.map((s) => s.name).sort(), ["Florence", "Helene", "Isaac", "Joyce"], "four systems out, one linked");
  deq(m.told.slice(0, 1).map((t) => ({ ...t })), [{ kind: "Storm", name: "Florence" }]);
  deq(m.told.filter((t) => t.kind !== "Alert" && t.kind !== "Storm").map((t) => t.kind), ["Windy", "Rain", "Surge", "Tornado"]);
  // the strip keeps its job, less the storm statement the card takes in
  const strip = florence.S.stormStrip(florence.point, m).map((a) => a.event);
  deq(strip, ["Storm Surge Warning", "Hurricane Warning", "Flash Flood Watch"]);
  assert.equal(florence.S.stormStrip(florence.point, { tier: null }).length, 4, "with no card the strip is as it was");
  deq(florence.storms.map((s) => s.name), ["Isaac", "Florence", "Helene", "Joyce"], "newest advisory per storm, the correction over its original");
  assert.equal(florence.beach.length, 2, "the beach zone gives its tropical warnings and nothing else");

  const debby = (await stormScenario("debby-flood-coast")).model;
  assert.equal(debby.tier, "storm");
  assert.match(debby.why, /^C1: .*Tropical Storm Warning on the beach zone\)$/, "the warning was on the beach alone");
  assert.equal(debby.hazards[0].key, "rain", "Debby's worst was the rain");
  assert.equal(debby.hazards[0].peak, "Additional 4-8 inches, with locally higher amounts");
  assert.equal(debby.hazards[0].where, "beach", "and it is said as the beach's");
  assert.equal(debby.storm.category, null, "a tropical storm has no category");
  assert.equal(debby.instruction, "Heed any flood watches and warnings. Failure to take action will likely result in serious injury or loss of life.", "the beach TCV's ACT line for the rain");

  const farm = (await stormScenario("isaias-farm-today")).model;
  assert.equal(farm.tier, "named");
  deq([...farm.rules], ["N2", "N3"]);
  deq({ ...farm.storm.nearest }, { miles: 33, dir: "N", when: "2026-10-12T00:00:00.000Z" }, "WPC's point for 8 p.m. Sunday");
  assert.equal(farm.storm.category, null);
  deq(farm.hazards.map((h) => [h.key, h.peak, h.window, h.from]), [["wind", "Southeast winds 20 to 30 mph with gusts up to 50 mph expected.", "From 5 PM this afternoon to 11 AM EDT Sunday.", "Wind Advisory"]]);
  assert.equal(farm.alerts[0].ends, "2026-10-11T11:00:00-04:00");

  const coast = (await stormScenario("isaias-coast-today")).model;
  assert.equal(coast.tier, null, "the coast today: tropical moisture, an ordinary Coastal Flood Advisory, Isaias 329 miles off");
  assert.equal(coast.why, "no rule: Isaias 329 mi at nearest, 2 alerts at the place");
  deq(coast.alerts, []);
  deq(coast.told, []);

  const bz = await stormScenario("blizzard-farm"), blizzard = bz.model;
  assert.equal(blizzard.tier, "storm");
  deq([...blizzard.rules], ["F3"]);
  assert.match(blizzard.why, /^F3: a winter storm warning with WPC's Winter Storm Severity Index at major here/);
  assert.equal(blizzard.storm, null, "no storm advisory, and none invented");
  deq([blizzard.hazards[0].key, blizzard.hazards[0].label, blizzard.hazards[0].peak], ["snow", "Snow", null], "what it is for, and never how much");
  deq(JSON.parse(JSON.stringify(blizzard.held)), { "KRLX.WS.W.1": { rule: "F3", end: "2027-01-24T06:00:00Z" } }, "and the warning that raised it is held, with its end");
  assert.equal(bz.asked.filter((u) => /mapservices\.weather\.noaa\.gov/.test(u)).length, 1, "the farm asks WPC's index once, with a Winter Storm Warning up");
  // RLX's real January 5 2025 warning, with WPC's index at Major at the farm (its 06Z cycle), and its real
  // January 23 2026 warning, with the index at Moderate there through the whole storm: the strip's alone
  const jan25 = (await stormScenario("snow-ice-farm")).model;
  deq([jan25.tier, ...jan25.rules, jan25.wssi.impact], ["storm", "F3", "MAJOR"]);
  // its Major was Day 2's (Moderate on Day 1), a day the warning is in effect from its noon start
  deq(jan25.wssi.days.map((d) => d.impact), ["MODERATE", "MAJOR", "WINTER WEATHER AREA"]);
  assert.match(jan25.why, /^F3: a winter storm warning with WPC's Winter Storm Severity Index at major here while it stands/);
  deq(jan25.hazards.map((h) => [h.key, h.label, h.peak, h.from]), [["snow", "Snow and ice", null, "Winter Storm Warning"]]);
  deq(jan25.told.filter((t) => t.kind !== "Alert").map((t) => t.kind), ["Snow", "Freezing rain"], "the card has said the snow and the ice");
  const jan26 = await stormScenario("ice-farm");
  deq([jan26.model.tier, jan26.model.wssi.impact], [null, "MODERATE"], "a Winter Storm Warning with the index at Moderate stays the strip's");
  assert.equal(jan26.S.stormStrip(jan26.point, jan26.model).map((a) => a.event).join(), "Winter Storm Warning", "and the strip still shows it");
  const isaFarm = await stormScenario("isaias-farm-today");
  assert.equal(isaFarm.asked.filter((u) => /mapservices/.test(u)).length, 0, "with no Winter Storm Warning the index is never asked for");

  const quiet = (await stormScenario("quiet-distant")).model;
  assert.equal(quiet.tier, null, "a Category 4 about 900 miles out, with nothing in effect at the house");
  deq(quiet.systems.map((s) => [s.name, s.miles]), [["Erin", 326]]);
});

test("under a storm the page says it once, in plain words, and every source keeps its own time", async () => {
  // a scenario's wall clock on this machine, whatever zone the tests run in (TZ=UTC as well)
  const L = (s) => new Date(s).getTime();
  const at = (sc, wall) => ({ shift: L(wall) - Date.parse(sc.st.when.slice(0, 16) === wall ? sc.st.when : wall + sc.st.when.slice(-6)), now: new Date(L(wall)) });
  const flo = await stormScenario("florence-coast"), S = flo.S, m = flo.model, F = at(flo, "2018-09-13T11:45");
  // the headline: the storm and when it is closest, from the card's model alone, and what the card
  // says is handed down for the cards under it
  const story = S.stormStory(m, F.now, F.shift);
  assert.equal(story.html, "<em>Hurricane Florence</em> is closest Friday morning.");
  deq(story.told.map((t) => t.kind), ["Windy", "Rain", "Surge", "Tornado"]);
  assert.ok(story.told.every((t) => t.time == null), "what the card says has no hour");
  // the warnings it stands on, named, with the hurricane's first
  assert.equal(S.stormWarns(m), "Hurricane Warning · Storm Surge Warning");
  // what to do, as written
  assert.equal(S.stormSay(m.instruction, Date.parse(m.instructionAt) + F.shift, +F.now),
    "Now is the time to shelter from life-threatening wind. Be ready to move to the safest place inside your shelter if necessary.");
  // each source with its own time, never one joined stamp
  deq([...S.stormStamps(m, F.now, F.shift)], ["Weather Service 10:55 am", "advisory 57 10:44 am"]);
  deq([...S.stormStamps(m, new Date(L("2018-09-14T09:00")), F.shift)], ["Weather Service 10:55 am Thu", "advisory 57 10:44 am Thu"], "a day old, the day is said");
  // and the card's joined lines keep each dot whole with the part after it, so a 320 phone breaks
  // between the parts and never ends a line on a lone dot ("Weather Service 10:55 am ·" / "advisory 57")
  const nb = (x) => x.replace(/\u00A0/g, " ");
  assert.equal(nb(S.stormDots(S.stormStamps(m, F.now, F.shift))), "<span>Weather Service 10:55 am</span> <span>· advisory 57 10:44 am</span>");
  assert.equal(S.stormDots(S.stormWarns(m).split(" · ")), "<span>Hurricane Warning</span> <span>· Storm Surge Warning</span>");
  assert.equal(S.stormDots(["Winter Storm Warning"]), "<span>Winter Storm Warning</span>", "one part, no dot");
  // a thunderstorm overhead still leads the headline under the storm: the cards under it leave a storm
  // overhead to the headline, and "Head inside." was said nowhere. What the card says is still the told
  const over = S.stormStory(m, F.now, F.shift, "<em>Storms overhead.</em> Head inside.");
  assert.equal(over.html, "<em>Storms overhead.</em> Head inside. <em>Hurricane Florence</em> is closest Friday morning.");
  deq(over.told, story.told);
  // a storm closest now says so, and the remnants are plural
  assert.equal(S.stormStory({ ...m, storm: { ...m.storm, nearest: { ...m.storm.nearest, when: m.storm.track[0].when } } }, F.now, F.shift).html, "<em>Hurricane Florence</em> is closest now.");

  const deb = await stormScenario("debby-flood-coast"), D = at(deb, "2024-08-07T11:40");
  assert.equal(S.stormStory(deb.model, D.now, D.shift).html, "<em>Tropical Storm Debby</em> is closest Thursday morning.");
  assert.equal(S.stormWarns(deb.model), "Tropical Storm Warning at the beach", "the warning was the beach's alone");
  // and every number Debby's card has is the beach zone's, said as the beach's: with the advisories
  // down the title and the headline read as the house's
  const debBare = S.stormRead(deb.L, deb.point, deb.beach, null, deb.now);
  assert.equal(debBare.storm, null);
  assert.equal(S.stormHero(debBare).text, "4–8 inches of rain at the beach");
  assert.equal(S.stormStory(debBare, D.now, D.shift).html, "<em>Tropical Storm Warning</em> at the beach.");
  deq(S.stormGust(deb.model), { mph: 45, beach: true });
  deq(S.stormGust(m), { mph: 105, beach: false }, "Florence's gusts were the house's");
  assert.match(S.stormLineHtml({ ...deb.model, tier: "named" }, D.now, D.shift).replace(/<[^>]+>/g, ""), /· gusts to 45 at the beach$/);
  // the strip leaves the card's own alerts' words to it, and keeps Debby's Flood Watch at the house
  deq([...S.stormCover(m)], ["Hurricane Warning", "Storm Surge Warning"]);
  deq([...S.stormCover(deb.model)], ["Tropical Storm Warning"]);
  assert.equal(S.stormSay(deb.model.instruction, Date.parse(deb.model.instructionAt) + D.shift, +D.now),
    "Heed any flood watches and warnings. Failure to take action will likely result in serious injury or loss of life.");
  deq([...S.stormStamps(deb.model, D.now, D.shift)], ["Weather Service 10:58 am", "advisory 21 10:55 am"]);

  // a storm with no name: the warning's own sentence is its title, whole and never rebuilt into numbers,
  // and the headline is the warning in plain words. RLX's old products have no WHAT line, so the 2016
  // warning's is its headline, in sentence case
  const bz = await stormScenario("blizzard-farm"), B = at(bz, "2027-01-22T13:30");
  deq({ ...S.stormHero(bz.model, +B.now, B.shift), hz: undefined }, { text: "Winter storm warning remains in effect until 1 AM EST Sunday", quote: true, short: null, name: "Winter storm" },
    "with no shorter sentence of its own, a title too long for three lines would be the warning's name");
  const sif = await stormScenario("snow-ice-farm"), J = at(sif, "2025-01-05T05:40");
  assert.equal(S.stormHero(sif.model, +J.now, J.shift).text, "Total snow accumulations between 4 and 10 inches and ice accumulations between one tenth and one half of an inch.");
  assert.equal(S.stormHero(sif.model, +J.now, J.shift).short, "Heavy mixed precipitation expected.", "and its WHAT line's shorter first sentence, for a title the long one will not fit");
  assert.equal(S.stormHero(sif.model).hz, sif.model.hazards[0], "its lane is the one the title speaks for");
  // issued at 5:24 for noon, it says its start: "until 6 a.m. Tuesday" read as on now under a bar that
  // started at noon. A start the next day takes its day, and a midnight is the day it ends
  assert.equal(S.stormStory(sif.model, J.now, J.shift).html, "<em>Winter storm</em> from noon until 6 a.m. Tuesday.");
  const sif13 = at(sif, "2025-01-05T13:10");
  assert.equal(S.stormStory(sif.model, sif13.now, J.shift).html, "<em>Winter storm</em> until 6 a.m. Tuesday.", "once it has begun, until its end alone");
  const begins = (b) => S.stormStory({ ...sif.model, alerts: sif.model.alerts.map((a) => ({ ...a, begin: b })) }, J.now, J.shift).html;
  assert.equal(begins(new Date(L("2025-01-06T07:00") - J.shift).toISOString()), "<em>Winter storm</em> from 7 a.m. Monday until 6 a.m. Tuesday.");
  assert.equal(begins(new Date(L("2025-01-06T00:00") - J.shift).toISOString()), "<em>Winter storm</em> from midnight until 6 a.m. Tuesday.", "Sunday's midnight, said on Sunday");
  // The sentence ends on one period: a clock ending in "a.m." or "p.m." carries its own, and from midnight
  // on a warning's last day the headline read "Winter storm until 6 a.m.." (sentence)
  const real = (wall) => new Date(L(wall) - J.shift).toISOString();
  const spans = (b, e, wall = "2025-01-05T05:40") => S.stormStory({ ...sif.model, alerts: sif.model.alerts.map((a) => ({ ...a, begin: b && real(b), ends: real(e) })) }, at(sif, wall).now, J.shift).html;
  assert.equal(S.stormStory(sif.model, at(sif, "2025-01-07T00:30").now, J.shift).html, "<em>Winter storm</em> until 6 a.m.", "read after midnight on its last day");
  assert.equal(S.stormStory(sif.model, at(sif, "2025-01-07T04:10").now, J.shift).html, "<em>Winter storm</em> until 6 a.m.");
  assert.equal(spans("2025-01-05T12:00", "2025-01-05T16:00"), "<em>Winter storm</em> from noon until 4 p.m.", "an end later the same day");
  assert.equal(spans("2025-01-05T12:00", "2025-01-05T19:30"), "<em>Winter storm</em> from noon until 7:30 p.m.");
  assert.equal(spans(null, "2025-01-05T16:00", "2025-01-05T13:10"), "<em>Winter storm</em> until 4 p.m.");
  assert.equal(spans("2025-01-05T12:00", "2025-01-06T02:00"), "<em>Winter storm</em> from noon until 2 a.m.", "an end after midnight, tonight's: the small hours are the night before's");
  assert.equal(spans("2025-01-05T12:00", "2025-01-06T00:00"), "<em>Winter storm</em> from noon until midnight.");
  for (const [b, e] of [["2025-01-05T12:00", "2025-01-05T16:00"], ["2025-01-05T12:00", "2025-01-06T02:00"], [null, "2025-01-07T06:00"]])
    for (const wall of ["2025-01-05T05:40", "2025-01-05T13:10", "2025-01-06T01:00", "2025-01-07T00:30"])
      assert.doesNotMatch(spans(b, e, wall), /\.\.$/, `${b} to ${e} read at ${wall}`);
  // and a day is said once, the small hours tonight's: a 1 am Monday start read on Sunday morning said
  // "from 1 a.m. Monday until noon Monday", Monday twice and Sunday night called Monday
  assert.equal(spans("2025-01-06T01:00", "2025-01-06T12:00"), "<em>Winter storm</em> from 1 a.m. until noon Monday.", "1 am tonight, until noon Monday");
  assert.equal(spans("2025-01-06T07:00", "2025-01-06T18:00"), "<em>Winter storm</em> from 7 a.m. until 6 p.m. Monday.", "Monday once");
  assert.equal(spans("2025-01-07T01:00", "2025-01-07T12:00"), "<em>Winter storm</em> from 1 a.m. until noon Tuesday.", "Monday night's small hours, on the day they are named by, once");
  assert.equal(spans("2025-01-06T01:00", "2025-01-06T12:00", "2025-01-05T02:30"), "<em>Winter storm</em> from 1 a.m. until noon Monday.",
    "read in Saturday night's small hours, Sunday night's 1 am is named, once");
  assert.equal(spans("2025-01-05T23:00", "2025-01-06T03:00"), "<em>Winter storm</em> from 11 p.m. until 3 a.m.", "the whole of it tonight");
  assert.equal(spans("2025-01-05T23:00", "2025-01-06T03:00", "2025-01-04T13:00"), "<em>Winter storm</em> from 11 p.m. Sunday until 3 a.m. Monday.", "and read the day before, each its own day");
  deq([S.stormUntil(L("2025-01-06T01:00"), L("2025-01-05T05:40")), S.stormUntil(L("2025-01-06T01:00"), L("2025-01-04T22:00")), S.stormUntil(L("2025-01-06T05:00"), L("2025-01-05T05:40"))],
    ["1 a.m.", "1 a.m. Monday", "5 a.m. Monday"], "the small hours run to five, as stormPart's do");
  // the long sentence's relative words take their day, the way the instruction's do: "Overnight" stays
  // the product's own, and "this evening" read the next morning is the evening it meant
  const evening = { ...sif.model, alerts: sif.model.alerts.map((a) => ({ ...a, quote: "Additional snow accumulations of 1 to 2 inches this evening." })) };
  assert.equal(S.stormHero(evening, +J.now, J.shift).text, "Additional snow accumulations of 1 to 2 inches this evening.", "read the same day, as written");
  assert.equal(S.stormHero(evening, +at(sif, "2025-01-06T07:30").now, J.shift).text, "Additional snow accumulations of 1 to 2 inches Sunday evening.", "read the next morning, its day named");
  // with no sentence at all the title is the warning's name, said in plain words
  assert.equal(S.stormHero({ ...sif.model, alerts: sif.model.alerts.map((a) => ({ ...a, quote: null })) }), null);
  assert.equal(S.stormStory(bz.model, B.now, B.shift).html, "<em>Winter storm</em> until 1 a.m. Sunday.");
  assert.equal(S.stormWarns(bz.model), "Winter Storm Warning");
  // RLX's old capitals in sentence case, cut to the first instruction, and its own typo never shown
  const bzSay = S.stormSay(bz.model.instruction, Date.parse(bz.model.instructionAt) + B.shift, +B.now);
  assert.equal(bzSay, "Only travel in an emergency.");
  assert.doesNotMatch(bzSay, /expect early third/i);
  deq([...S.stormStamps(bz.model, B.now, B.shift)], ["Weather Service 12:49 pm"], "no advisory, none stamped");
  assert.equal(S.stormHero(flo.model), null, "a named storm is its name");
  // the storm's lead warning stands for a warning for the sentence cards, so they say only what to do
  deq([S.stormLead(m).event, S.stormLead(bz.model).event, S.stormLead(deb.model).event], ["Hurricane Warning", "Winter Storm Warning", "Tropical Storm Warning"]);
  assert.match(flo.html, /const warning=outdoorWarning\(alerts\)\|\|\(stormDay\?stormLead\(sm\):null\);/);
  // and nothing green sits under a storm: the Sun card's sentence loses its green, Tonight is neutral
  assert.match(flo.html, /ul\.className="lead "\+\(sunAdvice\?stormDay&&sunAdvice\.cls==="go"\?"":sunAdvice\.cls:""\);/);

  // the named storm's one line: plain words, miles from WPC's track and the gusts from RLX's alert
  const isa = await stormScenario("isaias-farm-today"), I = at(isa, "2026-10-10T16:20");
  const line = S.stormLineHtml(isa.model, I.now, I.shift).replace(/<svg[\s\S]*?<\/svg>/, "").replace(/<[^>]+>/g, "").replace(/ /g, " ");
  assert.equal(line, "Isaias's remnants pass 33 mi north Sunday evening · gusts to 50");
  assert.doesNotMatch(S.stormLineHtml(isa.model, I.now, I.shift), /post-tropical/i);
  assert.match(S.stormLineHtml(isa.model, I.now, I.shift), /<span class="nw">Sunday evening<\/span> <span class="nw">· gusts to 50<\/span>$/, "the dot rides with the gusts");
  assert.equal(S.stormPart(L("2026-10-11T02:00"), new Date(L("2026-10-10T23:00"))), "tonight", "the small hours are tonight's");
  assert.equal(S.stormPart(L("2026-10-11T02:00"), new Date(L("2026-10-10T09:00"))), "tonight", "and from the morning, still tonight's");
  assert.equal(S.stormPart(L("2026-10-12T02:00"), new Date(L("2026-10-10T09:00"))), "Sunday night");
  assert.equal(S.stormPart(L("2026-10-10T18:00"), new Date(L("2026-10-10T09:00"))), "this evening");

  // what to do leaves out what is not an instruction
  assert.equal(S.stormSay("Additional information can be found at https://www.weather.gov/rlx as well as on our X and Facebook pages."), null);
  assert.equal(S.stormSay("Use extra caution when driving, especially if operating a high profile vehicle. Secure outdoor objects. Additional information can be found at https://www.weather.gov/rlx as well as on our X and Facebook pages."),
    "Use extra caution when driving, especially if operating a high profile vehicle. Secure outdoor objects.");
  assert.equal(S.stormSay("A Flash Flood Watch means that conditions may develop that lead to flash flooding."), null, "a sentence on what a product means is no instruction");
  assert.equal(S.stCalm("ONLY TRAVEL IN AN EMERGENCY IN RALEIGH COUNTY ON SATURDAY."), "Only travel in an emergency in Raleigh County on Saturday.");
});

test("a product's relative words take their day once they would name the wrong one", async () => {
  const { S } = await stormSandbox("2018-09-13T15:45:00Z");
  const L = (s) => new Date(s).getTime(), thu = L("2018-09-13T10:55");
  assert.equal(S.relDay("early this evening until Friday afternoon", thu, L("2018-09-13T11:45")), "early this evening until Friday afternoon", "the same day, said as written");
  assert.equal(S.relDay("Begins late this morning", thu, L("2018-09-13T21:30")), "Begins late Thursday morning", "the stretch has passed");
  assert.equal(S.relDay("Hurricane force early this evening", thu, L("2018-09-13T21:30")), "Hurricane force early Thursday evening");
  assert.equal(S.relDay("until early this evening", thu, L("2018-09-14T08:00")), "until early Thursday evening", "read the next day");
  assert.equal(S.relDay("Leave tonight. Return tomorrow afternoon.", thu, L("2018-09-14T08:00")), "Leave Thursday night. Return Friday afternoon.");
  assert.equal(S.relDay("FROM 5 PM THIS AFTERNOON TO 11 AM EDT SUNDAY", thu, L("2018-09-13T21:00")), "FROM 5 PM THURSDAY AFTERNOON TO 11 AM EDT SUNDAY", "capitals stay capitals");
  assert.equal(S.relDay("late tonight", thu, L("2018-09-14T08:00"), true), "late Thu night");
  assert.equal(S.relDay("today", thu, L("2018-09-14T08:00")), "Thursday");
  assert.equal(S.relDay("this evening", NaN, L("2018-09-14T08:00")), "this evening", "with no time written, nothing is changed");
});

test("the storm card's rules: high to come up, and never on distance, severity or a lone warning", async () => {
  const { STORMS, wssiAnswer } = await STORM_FIX();
  const flo = await stormScenario("florence-coast");
  const { S, L: coastL } = flo, farmL = S.LOCS.sp;
  const live = JSON.parse(await readFile(new URL("tools/storm-fixtures/feed/live-2026-10-10.json", root), "utf8")).features;
  const row = (k, edit = (p) => p) => S.alertRow({ properties: edit(structuredClone(live[k].properties)) });
  const at = Date.parse("2026-10-10T20:20:00Z");
  const read = (L, alerts, storms = null, now = at, beach = null) => S.stormRead(L, alerts, beach, storms, now);
  // a lone tornado warning, an observed one, is the strip's: no storm is linked
  assert.equal(read(coastL, [row("tornado-warning")]).tier, null);
  // with Florence seven miles off, the same warning is the full card (C4)
  const nearFlo = row("tornado-warning", (p) => ({ ...p, ends: "2018-09-13T17:00:00-04:00", expires: "2018-09-13T17:00:00-04:00" }));
  const c4 = S.stormRead(coastL, [nearFlo], [], flo.storms, flo.now);
  deq([c4.tier, ...c4.rules], ["storm", "C4", "N3"]);
  // and a farm: a High Wind Warning is enough (F2); a Freeze Warning, CAP Severe as it is, is nothing
  deq([...read(farmL, [row("high-wind-warning")]).rules], ["F2"]);
  assert.equal(read(farmL, [row("freeze-warning")]).tier, null);
  assert.equal(read(farmL, [row("cancelled")]).tier, null);
  // an upgraded watch never counts, a cached alert without VTEC never raises the card, nor an old storm
  const hu = flo.point.find((a) => a.event === "Hurricane Warning");
  assert.equal(S.stormRead(coastL, [{ ...hu, vtec: ["/O.CAN.KILM.HU.W.1006.000000T0000Z-000000T0000Z/"] }], [], [], flo.now).tier, null);
  assert.equal(S.stormRead(coastL, [{ event: "Hurricane Warning", severity: "Extreme", ends: null, expires: "2018-09-13T19:00:00-04:00", desc: hu.desc, inst: "" }], [], [], flo.now).tier, null,
    "an alert from a cache written before VTEC was kept");
  assert.equal(S.stormRead(coastL, [], [], [{ type: "Hurricane", name: "Florence", adv: "57", lat: 34.2, lon: -77.8, mph: 105 }], flo.now).tier, null,
    "a storm from the old tropics list has no advisory time");
  // the beach zone counts only for its tropical products
  const surf = S.alertRow(JSON.parse(await readFile(new URL("tools/storm-fixtures/isaias/alerts-zone-NCZ108.json", root), "utf8")).features.find((f) => f.properties.event === "High Surf Advisory"));
  assert.equal(read(coastL, [], null, Date.parse("2026-10-10T20:20:00Z"), [surf]).tier, null);
  // a tropical storm watch alone is the light card (N1); a warning on the beach the full one
  const tsw = flo.beach.find((a) => a.event === "Hurricane Warning");
  const watch = { ...tsw, event: "Tropical Storm Watch", vtec: ["/O.CON.KILM.TR.A.1006.000000T0000Z-000000T0000Z/"] };
  const n1 = S.stormRead(coastL, [], [watch], [], flo.now);
  deq([n1.tier, ...n1.rules], ["named", "N1"]);
  // distance alone never: Florence seven miles off with nothing in effect, then any alert at all
  assert.equal(S.stormRead(coastL, [], [], flo.storms, flo.now).tier, null);
  const rip = { ...surf, event: "Rip Current Statement", vtec: ["/O.CON.KILM.RP.S.0019.000000T0000Z-181014T0000Z/"], ends: "2018-09-13T20:00:00-04:00", expires: "2018-09-13T20:00:00-04:00" };
  deq([...S.stormRead(coastL, [rip], [], flo.storms, flo.now).rules], ["N3"]);
  // an advisory from more than 12 hours ago links nothing: the farm the next morning
  const farmNext = await stormScenario("isaias-farm-today", (st) => st, "2026-10-11T09:40:00Z");
  assert.equal(farmNext.model.tier, null, "17 hours after WPC's advisory 16, the Wind Advisory alone");
  // an emergency, by its damage tag or its words, and never by an emergency manager's report
  // (its VTEC end the night after `at`, so a latch from it is this season's: one ended more than 30 days
  // before now is last winter's, and is let go)
  const ffw = (extra, par = {}) => ({ id: "x", event: "Flash Flood Warning", vtec: ["/O.EXT.KILM.FF.W.0014.000000T0000Z-261011T0600Z/"], ends: null, expires: null,
    desc: "* Flash Flood Warning for... * At 805 PM EDT, Emergency management reported flash flooding. " + extra, inst: "", headline: null, par });
  assert.equal(read(farmL, [ffw("")]).tier, null, "an ordinary flash flood warning");
  deq([...read(coastL, [ffw("This is a FLASH FLOOD EMERGENCY FOR BLADENBORO.")]).rules], ["C2"]);
  deq([...read(farmL, [ffw("", { flashFloodDamageThreat: "CATASTROPHIC" })]).rules], ["F1"]);
  // Winter (October 10 2026). At the farm a Winter Storm Warning is the card only with WPC's Winter Storm
  // Severity Index at Major or Extreme at the point (F3), and its words are never read for amounts: every
  // grammar written for them misread another office's phrasing. At the coast any winter storm, blizzard,
  // ice storm or high wind warning is the card (C3), titled in the warning's own sentence
  // (the warning runs from 8 am October 10 to 8 am the 11th, inside Day 1 of the index's 18Z cycle)
  const wsw = (what, extra = {}) => ({ id: "w", event: "Winter Storm Warning", vtec: ["/O.NEW.KRLX.WS.W.0002.261010T1200Z-261011T1200Z/"], ends: null, expires: null,
    desc: `* WHAT...${what}\n\n* WHEN...From 8 AM Saturday to 8 AM EDT Sunday.`, inst: "", par: {}, ...extra });
  const Wx = (level) => S.wssiRead(wssiAnswer(level, "2026-10-10T18:00:00Z"));
  const farmAt = (alerts, wssi, held = null) => S.stormRead(farmL, alerts, null, null, at, { wssi, held });
  const foot = wsw("Heavy snow expected. Total snow accumulations of 12 to 18 inches.");
  assert.equal(farmAt([foot], null).tier, null, "a foot and a half in its words and no index: the strip's");
  for (const lv of ["WINTER WEATHER AREA", "MINOR", "MODERATE"]) assert.equal(farmAt([foot], Wx(lv)).tier, null, lv);
  for (const lv of ["MAJOR", "EXTREME"]) deq([...farmAt([foot], Wx(lv)).rules], ["F3"], lv);
  deq([...farmAt([wsw("Heavy snow expected. Total snow accumulations of 2 to 4 inches.")], Wx("MAJOR")).rules], ["F3"], "the index decides, never the words");
  assert.equal(S.stormRead(farmL, [{ ...foot, vtec: ["/O.NEW.KRLX.WS.W.0002.261010T1200Z-261015T1200Z/"] }], null, null, Date.parse("2026-10-13T18:30:00Z"), { wssi: Wx("MAJOR") }).tier, null,
    "an index whose Major day is over is no reading, though the warning still stands");
  // and a Major on Day 3 is another storm's: tonight's warning, Moderate on its own day, stays the strip's
  assert.equal(farmAt([foot], S.wssiRead(wssiAnswer(["MODERATE", null, "MAJOR"], "2026-10-10T18:00:00Z"))).tier, null, "a Day-3 Major beside a Day-1 warning");
  deq([...farmAt([foot], S.wssiRead(wssiAnswer(["MAJOR", null, "MODERATE"], "2026-10-10T18:00:00Z"))).rules], ["F3"], "a Day-1 Major on the warning's own day");
  assert.equal(farmAt([{ ...foot, event: "Winter Weather Advisory", vtec: ["/O.NEW.KRLX.WW.Y.0002.270115T1200Z-270116T1200Z/"] }], Wx("EXTREME")).tier, null, "an advisory is not a warning");
  deq([...read(coastL, [wsw("Heavy snow expected. Total snow accumulations of 2 to 4 inches.")]).rules], ["C3"], "at the coast any winter storm warning");
  // every text a grammar misread, read as nothing but itself: never F3 without the index, and at the coast
  // the title is the warning's own sentence ("An inch of ice", "000 feet of snow" and "0.18 to 24 inches"
  // were the grammar's)
  for (const what of ["Total snow accumulations between 4 and 7 inches and ice accumulations of a light glaze to a few hundredths of an inch.",
    "Total snow accumulations ranging from 2 to 4 inches below 3,000 feet with 4 to 7 inches above 3,000 feet.",
    "Additional ice accumulations around one quarter of an inch, with up to an inch of snow.",
    "Total ice accumulations up to one quarter to one third of an inch, along with less than an inch of snow and sleet.",
    "Total snow and sleet accumulations between 12 and 18 inches.", "Ice accumulations around one to a quarter inch.", "Total snow accumulations of over a foot."]) {
    assert.equal(farmAt([wsw("Heavy mixed precipitation expected. " + what)], null).tier, null, what);
    const c = read(coastL, [wsw("Heavy mixed precipitation expected. " + what)]);
    deq([c.tier, ...c.rules, S.stormHero(c).text], ["storm", "C3", what]);
    deq(c.hazards.map((h) => h.peak), [null], "and its lane says no number");
  }
  // Once a warning has raised the card it holds it while that same warning stands (its office, product
  // and number), through NEW, CON, EXT, EXA, EXB and COR: the index steps down a level between updates
  // of one warning, and RLX's January 2016 warning took the card down at the height of the snow when an
  // update said "additional 3 to 6 inches". Until it is cancelled, runs out or is upgraded
  const raised = farmAt([foot], Wx("MAJOR"));
  deq(raised.held, { "KRLX.WS.W.2": { rule: "F3", end: "2026-10-11T12:00:00Z" } }, "held with the rule that raised it and its VTEC end");
  const upd = (act, extra = {}) => wsw("Heavy snow. Additional snow accumulations of 3 to 6 inches.", { id: "w2", vtec: [`/O.${act}.KRLX.WS.W.0002.000000T0000Z-270116T1200Z/`], ...extra });
  for (const act of ["CON", "EXT", "EXA", "EXB", "COR"]) {
    const m = farmAt([upd(act)], Wx("MODERATE"), raised.held);
    deq([m.tier, ...m.rules], ["storm", "F3"], `${act}: held`);
    assert.match(m.why, /^F3: held while the same warning stands \(Winter Storm Warning at the point\)$/);
    deq(m.held, { "KRLX.WS.W.2": { rule: "F3", end: "2027-01-16T12:00:00Z" } }, "and handed on, with the update's end");
  }
  deq([...farmAt([upd("CON")], null, raised.held).rules], ["F3"], "and through a failed index");
  for (const [alerts, why] of [[[upd("CAN")], "cancelled"], [[upd("EXP")], "run out"], [[upd("UPG")], "upgraded"],
    [[upd("CON", { ends: "2026-10-10T19:00:00Z" })], "past its end"], [[], "gone from the feed"],
    [[upd("CON", { vtec: ["/O.CON.KRLX.WS.W.0003.000000T0000Z-270116T1200Z/"] })], "another warning"],
    [[upd("CON", { vtec: ["/O.CON.KRLX.WS.A.0002.000000T0000Z-270116T1200Z/"] })], "a watch with the warning's number"],
    [[upd("CON", { vtec: ["/O.CON.KJKL.WS.W.0002.000000T0000Z-270116T1200Z/"] })], "another office's"]]) {
    const m = farmAt(alerts, Wx("MODERATE"), raised.held);
    assert.equal(m.tier, null, why);
    deq({ ...m.held }, {}, `${why}: and nothing is held`);
  }
  deq([...farmAt([upd("UPG"), wsw("Blizzard conditions.", { id: "bz", event: "Blizzard Warning", vtec: ["/O.NEW.KRLX.BZ.W.0001.270115T1200Z-270116T1200Z/"] })], null, raised.held).rules], ["F2"],
    "upgraded to a blizzard, the blizzard's own card");
  // A read with no point list (its request failed, alerts null) knows nothing of the house's warnings: what
  // is held is handed on as it was, and only its own end takes it off. A single timed-out request under storm
  // load wiped the latch, and the next update at Moderate took the card down at the height of the storm
  const failed = farmAt(null, null, raised.held);
  assert.equal(failed.tier, null, "with no list there is nothing to draw");
  deq(failed.held, raised.held, "but the latch is handed on unchanged");
  const back = farmAt([upd("CON")], Wx("MODERATE"), failed.held);
  deq([back.tier, ...back.rules], ["storm", "F3"], "Major, a failed fetch, then the same warning CON at Moderate: the card stays up");
  deq(S.stormRead(farmL, null, null, null, Date.parse("2026-10-11T12:30:00Z"), { held: raised.held }).held, {}, "past its VTEC end it is let go, list or none");
  deq(farmAt(null, null, { "KRLX.WS.W.2": "F3" }).held, { "KRLX.WS.W.2": { rule: "F3", end: null } }, "a latch kept before its end was, handed on");
  deq([...farmAt([upd("CON")], Wx("MODERATE"), { "KRLX.WS.W.2": "F3" }).rules], ["F3"], "and holding the card");
  deq(farmAt([], Wx("MODERATE"), failed.held).held, {}, "and a newer good list without the event lets it go");
  // an emergency held from an earlier update holds the card, and is never still said to be an emergency
  const emerg = read(farmL, [ffw("", { flashFloodDamageThreat: "CATASTROPHIC" })]);
  assert.equal(S.stormEmergency(emerg), true);
  const calmer = S.stormRead(farmL, [ffw("")], null, null, at, { held: emerg.held });
  deq([calmer.tier, ...calmer.rules, S.stormEmergency(calmer)], ["storm", "F1", false]);
  // A tropical warning's expiry is only the next advisory's time. One in a list fetched while it stood
  // still stands until a newer answer for that list decides, up to six hours past its own expiry: a cold
  // open painted Debby's renewed beach warning as ended, with "Raining now." under a tropical storm, and so
  // did the strip's timer at its 7 pm expiry, 7h20m after the 11:40 fetch, with the beach slower than
  // STORM_WAIT or failing, while the window was measured from the fetch
  const deb = await stormScenario("debby-flood-coast"), t0 = deb.now;
  const stale = deb.beach.map((a) => (a.vtec.some((v) => /\.TR\.W\./.test(v)) ? { ...a, expires: new Date(t0 - 36e5).toISOString() } : a));
  const debAt = (seen) => S.stormRead(coastL, deb.point, stale, deb.storms, t0, { seen }).tier;
  assert.equal(debAt(null), "named", "past its expiry, with nothing to say when it was fetched, it is over");
  assert.equal(debAt({ point: t0, beach: t0 - 2 * 36e5 }), "storm", "fetched two hours ago, while it stood: it stands");
  assert.equal(debAt({ point: t0, beach: t0 - 7 * 36e5 }), "storm", "fetched seven hours ago, expired an hour ago: it stands, bounded by its own expiry and not by the fetch");
  assert.equal(debAt({ point: t0, beach: t0 - (7 * 36e5 + 21 * 6e4) }), "storm", "Debby's own timings: fetched at 11:40, the strip's timer a minute past its 7 pm expiry");
  const older = deb.beach.map((a) => (a.vtec.some((v) => /\.TR\.W\./.test(v)) ? { ...a, expires: new Date(t0 - 6.5 * 36e5).toISOString() } : a));
  assert.equal(S.stormRead(coastL, deb.point, older, deb.storms, t0, { seen: { point: t0, beach: t0 - 8 * 36e5 } }).tier, "named", "six hours past its own expiry with no newer answer, it is over");
  assert.equal(debAt({ point: t0, beach: t0 - 30 * 6e4 }), "named", "fetched after its expiry: the answer said it was over");
  assert.equal(debAt({ point: t0 - 2 * 36e5, beach: t0 }), "named", "and only the list it came in counts");
  const ffaPast = deb.point.map((a) => (/Flood Watch/.test(a.event) ? { ...a, ends: new Date(t0 - 36e5).toISOString() } : a));
  assert.equal(S.stormRead(coastL, ffaPast, [], deb.storms, t0, { seen: { point: t0 - 2 * 36e5, beach: t0 } }).alerts.some((a) => /Flood Watch/.test(a.event)), false, "a watch with an end is over at its end");
  // the farm's linked warnings: a severe thunderstorm warning while Isaias is linked to the farm is the card (F4)
  const isa = await stormScenario("isaias-farm-today");
  const svr = { id: "s", event: "Severe Thunderstorm Warning", vtec: ["/O.NEW.KRLX.SV.W.0101.261010T2100Z-261010T2145Z/"], ends: "2026-10-10T17:45:00-04:00",
    expires: "2026-10-10T17:45:00-04:00", desc: "* WHAT...60 mph wind gusts.", inst: "", par: {} };
  deq([...isa.S.stormRead(farmL, [svr], null, isa.storms, isa.now).rules], ["F4", "N3"], "a warning naming nothing, with Isaias's track 33 miles off: linked by the track, the full card");
  deq([...isa.S.stormRead(farmL, [...isa.point, svr], null, isa.storms, isa.now).rules], ["F4", "N2", "N3"]);
  assert.equal(isa.S.stormRead(farmL, [svr], null, [], isa.now).tier, null, "and with no storm out, the strip's alone");
  // the ATCF number ties a tropical alert to its storm only in its own year
  const old = { ...tsw, sent: "2019-09-05T10:55:00-04:00" };
  const untied = S.stormRead(coastL, [], [old], flo.storms, flo.now);
  assert.equal(untied.systems.find((s) => s.name === "Florence").tied, false);
  assert.equal(STORMS["florence-coast"].expect.tier, "storm");
});

/* The winter backtest (October 10 2026): every winter storm, blizzard and ice storm warning RLX wrote for
   Raleigh County and ILM for Inland New Hanover from January 2014 to October 10 2026, cut to the place's
   own segment, from Iowa State's AFOS archive (tools/storm-corpus.mjs writes tools/storm-fixtures/corpus/),
   each run through the page's own stormRead the moment it was issued, in order, the warnings that held the
   card handed from one to the next. A winter warning's words are never read for amounts (every grammar
   written for them misread another office), so they are only quoted: the title is the segment's own
   sentence, or its headline, or nothing, and the farm's card never comes up on its words alone.

   With WPC's Winter Storm Severity Index as WPC's own archive has it for the farm's grid cell
   (tools/storm-corpus.mjs wssi writes corpus/wssi.json, from November 2020: 104 of the 176 segments since
   then were issued in a cycle the archive does not keep, and read no index), each cycle's three days read
   on their own and a Major counted only on a day the warning is in effect, the farm's card comes up for
   one storm in six winters, RLX's WS.W.0002 of January 5 to 7 2025: Major on Day 2 of the cycle out at
   10:24 UTC on the 5th (Moderate on Day 1), the first update the archive has a cycle for, and held through
   its last. Its January 23 to 26 2026 warning
   was Moderate at the farm through all eleven updates, and its February 2026 ones Minor. At the coast
   every winter storm, blizzard or ice storm warning is the card (C3), and the index was Major there for
   one of them, January 30 to February 1 2026 */
test("the winter backtest: twelve winters of the offices' own warnings, quoted and never read for numbers", async () => {
  const { corpus, WSSI_FILE } = await import(new URL("tools/storm-corpus.mjs", root));
  const { alertsFrom } = await import(new URL("tools/storm-fixtures.mjs", root));
  const { S } = await stormSandbox("2026-10-10T20:20:00Z");
  const readings = JSON.parse(await readFile(WSSI_FILE, "utf8")).readings;
  const all = corpus(), low = (x) => String(x || "").replace(/\s+/g, " ").trim().toLowerCase();
  assert.ok(all.filter((e) => e.place === "farm").length >= 280 && all.filter((e) => e.place === "coast").length >= 40, `the corpus is all there: ${all.length} segments`);
  assert.equal(Object.keys(readings).length, all.filter((e) => Date.parse(e.issued) >= Date.UTC(2020, 10, 1)).length, "an index reading, or its absence, for every segment since November 2020");
  assert.ok(Object.values(readings).every((r) => r.missing || (Array.isArray(r.days) && r.days.length === 3)), "and each one archived has its three days");
  const winter = (a) => a.vtec.some((v) => /\.(?:WS|BZ|IS)\.W\./.test(v)), fires = {}, list = [];
  let held = {}, place = null, quoted = 0;
  for (const e of all) {
    const L = S.LOCS[e.loc], rows = alertsFrom(e.product, e.zone).map(S.alertRow).filter(S.alertLive), where = `${e.place} ${e.issued} ${e.zone}`, text = low(e.product.productText);
    assert.ok(rows.some(winter), `${where}: its warning`);
    for (const a of rows.filter(winter)) {
      const q = S.stormQuote(a);
      if (q == null) continue;
      quoted++;
      assert.ok(text.includes(low(q)), `${where}: "${q}" is the segment's own words`);
      assert.ok(q.length >= 20 && q.length <= 200 && /^[A-Za-z0-9]/.test(q) && /[a-z]/i.test(q) && !/\*|\.\.\./.test(q), `${where}: never absurd: "${q}"`);
      assert.doesNotMatch(q.replace(/[.!?]+$/, ""), /(?:^|\s)[\d.,/–-]+$/, `${where}: never cut at a number: "${q}"`);
    }
    const at = Date.parse(e.issued) + 6e4;
    // on its words alone: never F3, and at the coast always the card
    const bare = S.stormRead(L, rows, [], [], at);
    assert.ok(!bare.rules.includes("F3"), `${where}: F3 never fires from the warning's words`);
    if (e.place === "coast") deq(bare.rules, ["C3"], `${where}: at the coast any winter warning is the card`);
    else assert.ok(bare.tier === null || bare.rules.join() === "F2", `${where}: ${bare.why}`);
    const hero = S.stormHero(bare, at);
    if (hero) assert.ok(text.includes(low(hero.text)) && !/\d\s*$/.test(hero.text), `${where}: the title is the warning's own words: "${hero.text}"`);
    // and with the index as WPC archived it, the latch handed on
    if (e.place !== place) { held = {}; place = e.place; }
    // each of the cycle's three days as WPC archived it, the 24 hours ending 24, 48 and 72 hours after the cycle
    const r = readings[`${e.place} ${e.issued}`], c0 = r && Date.parse(r.cycle.replace(/Z$/, ":00:00Z"));
    const wssi = r?.days ? { impact: r.impact, days: r.days.map((impact, i) => impact && { day: i + 1, impact, start: new Date(c0 + i * 864e5).toISOString(), end: new Date(c0 + (i + 1) * 864e5).toISOString() }).filter(Boolean) } : null;
    const m = S.stormRead(L, rows, [], [], at, { wssi, held });
    held = m.held;
    if (!m.rules.includes("F3")) continue;
    const ev = rows.flatMap((a) => a.vtec).map((x) => x.match(/\.(WS\.W)\.(\d{4})\./)).find(Boolean), key = `${e.place} ${e.season}`, id = `${ev[1]}.${ev[2]}`;
    if (!(fires[key] ||= []).includes(id)) fires[key].push(id);
    list.push(`F3 ${e.issued.slice(0, 16)} ${id} ${r?.days?.join("/") || r?.missing && "no archived cycle" || "-"}${/held/.test(m.why) ? " (held)" : ""}  ${S.stormHero(m, at)?.text}`);
  }
  if (process.env.PORCH_CORPUS) console.log(list.join("\n"));
  assert.ok(quoted >= 320, `nearly every segment has a sentence to quote: ${quoted}`);
  deq(fires, { "farm 2024-25": ["WS.W.0002"] }, "the farm's card comes up for RLX's January 2025 storm and no other");
  deq(list.map((x) => x.slice(3, 19)), ["2025-01-05T10:24", "2025-01-05T16:16", "2025-01-05T19:07", "2025-01-05T22:36", "2025-01-06T06:12", "2025-01-06T14:30", "2025-01-06T22:11", "2025-01-07T00:11", "2025-01-07T03:11", "2025-01-07T05:47"],
    "from its first Major to its last update, held between");
  // and the latch through RLX's biggest storm in the corpus, January 22 to 24 2016, whose card came and
  // went as its updates said "additional": given a Major at its first update (no archive goes back that
  // far), it stays up through every one of them
  const seq = all.filter((e) => e.place === "farm" && e.season === "2015-16" && /\.CON\.KRLX\.WS\.W\.0001\.|\.EXA\.KRLX\.WS\.W\.0001\.|\.NEW\.KRLX\.WS\.W\.0001\./.test(e.product.productText));
  assert.ok(seq.length >= 12, `${seq.length} updates`);
  let h = {};
  const ys = seq.map((e, i) => { const rows = alertsFrom(e.product, e.zone).map(S.alertRow).filter(S.alertLive);
    const m = S.stormRead(S.LOCS.sp, rows, [], [], Date.parse(e.issued) + 6e4, { wssi: i ? null : { impact: "MAJOR", days: [{ day: 1, impact: "MAJOR", start: "2016-01-22T00:00:00Z", end: "2016-01-25T00:00:00Z" }] }, held: h }); h = m.held; return m.rules.includes("F3") ? "Y" : "n"; }).join("");
  assert.equal(ys, "Y".repeat(seq.length), "the card stays up through the whole warning");
});

test("the storm card draws the Weather Service's hours as a timeline, and nothing it was not given", async () => {
  // the page's clock helpers beside the storm block, so the pill reads the way every pill does
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const helpers = [/const dirLong=[\s\S]*?%16\];/, /const clock=d=>\{[^\n]*\};/, /const xpClock=[^\n]*/, /const xpSpoken=[^\n]*/, /const xpOtherDay=[^\n]*/,
    /const xpWhen=[^\n]*/, /const xpSayDay=[^\n]*/, /const xpSaid=[^\n]*/, /const xpSaidAt=[^\n]*/].map(lift).join("\n");
  const src = html.slice(html.indexOf("/* ── the storm card"), html.indexOf("/* ── tide ─"));
  const run = (nowISO) => { const now = Date.parse(nowISO); class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
    const ctx = vm.createContext({ Date: Clock, location: { search: "" } });
    vm.runInContext([lift(/const LOCS=\{[\s\S]*?\n\};/), lift(/const toRad=x=>[^\n]*/), lift(/const distMi=[\s\S]*?asin\(Math\.sqrt\(a\)\)\};/),
      lift(/const dirTxt=[^\n]*/), helpers, ...stormHelpers(html, lift).filter((x) => !/^const clock=/.test(x)), src,
      "globalThis.S={stormPhrase,stormWindow,stormAbs,stormPeak,stormLanes,readStorm,stormRead,alertRow,alertLive,stormLane,LOCS};"].join("\n"), ctx);
    return ctx.S; };
  const W = run("2018-09-13T15:45:00Z");
  const L = (s) => new Date(s).getTime();                    // a wall-clock time, read as local
  const thu = L("2018-09-13T10:55");                         // TCVILM 57A was written Thursday at 10:55
  deq(W.stormPhrase("Saturday afternoon", thu), [L("2018-09-15T12:00"), L("2018-09-15T18:00")], "a part of a day is its whole stretch");
  deq(W.stormPhrase("early this evening", thu), [L("2018-09-13T18:00"), L("2018-09-13T21:00")]);
  deq(W.stormPhrase("late this morning", thu), [L("2018-09-13T09:00"), L("2018-09-13T12:00")]);
  deq(W.stormPhrase("early Saturday morning", thu), [L("2018-09-15T00:00"), L("2018-09-15T06:00")]);
  deq(W.stormPhrase("late tonight", thu), [L("2018-09-14T00:00"), L("2018-09-14T06:00")], "tonight is the product's night, never the reader's");
  deq(W.stormPhrase("11 AM EDT Sunday", thu), [L("2018-09-16T11:00"), L("2018-09-16T11:00")], "a clock time is a hard edge");
  assert.equal(W.stormPhrase("soon", thu), null, "a phrase it cannot read draws nothing");
  deq(W.stormWindow("until Saturday afternoon", thu), { start: null, end: [L("2018-09-15T12:00"), L("2018-09-15T18:00")], from: null, until: "Saturday afternoon" });
  deq(W.stormWindow("Begins late this morning", thu).end, null, "a window with no end has none");
  deq(W.stormWindow("From 5 PM this afternoon to 11 AM EDT Sunday.", thu).start, [L("2018-09-13T17:00"), L("2018-09-13T17:00")]);
  assert.equal(W.stormWindow("Through the weekend", thu), null);
  // read the same day the words are as written, and opened the next day they take their day, so a
  // statement opened tomorrow points at the evening it meant
  assert.equal(W.stormAbs("early this evening", thu, false, L("2018-09-13T11:45")), "early this evening");
  assert.equal(W.stormAbs("early this evening", thu, false, L("2018-09-14T08:00")), "early Thu evening");
  assert.equal(W.stormAbs("late tonight", thu, true, L("2018-09-14T08:00")), "late Thursday night");
  assert.equal(W.stormAbs("LATE THIS MORNING", thu, false, L("2018-09-13T21:30")), "late Thu morning", "and once the stretch has passed");
  assert.equal(W.stormAbs("Saturday afternoon", thu), "Sat afternoon");
  // each peak in the fewest of the Weather Service's own words
  assert.equal(W.stormPeak({ key: "wind", peak: "65-85 mph with gusts to 105 mph" }), "gusts to 105 mph");
  assert.equal(W.stormPeak({ key: "rain", peak: "Additional More than two feet" }), "more than two feet");
  assert.equal(W.stormPeak({ key: "rain", peak: "Additional 4-8 inches, with locally higher amounts" }), "4–8 inches");
  assert.equal(W.stormPeak({ key: "surge", peak: "The potential for 2-4 feet above ground somewhere within surge prone areas" }), "2–4 ft above ground");
  assert.equal(W.stormPeak({ key: "tornado", peak: "Situation is somewhat favorable for tornadoes", threat: "Potential for a few tornadoes" }), "a few possible");
  // a range keeps both ends and its words: "1 to 2 feet" and "up to 2 feet" of inundation were "2 ft"
  assert.equal(W.stormPeak({ key: "surge", peak: "1 to 2 feet of inundation above ground level" }), "1 to 2 ft above ground");
  assert.equal(W.stormPeak({ key: "surge", peak: "Up to 2 feet of inundation above ground level" }), "up to 2 ft above ground");
  assert.equal(W.stormPeak({ key: "wind", peak: "Southeast winds 20 to 30 mph" }), "20 to 30 mph");
  // a winter lane says what it is for and never how much: the numbers were rebuilt from the words, and
  // read "a few hundredths of an inch" as an inch of ice
  for (const [key, peak] of [["snow", "12 TO 18 INCHES."], ["snow", "Total snow and sleet accumulations between 3 and 8 inches"], ["ice", "ice accumulations between two tenths and one half of an inch"],
    ["ice", "ice accumulations of a light glaze to a few hundredths of an inch"], ["snow", "Total snow accumulations of 6 to 10 inches above 3000 feet"]])
    assert.equal(W.stormPeak({ key, peak }), null, peak);

  // Florence a day out, at 11:45: the shift is what puts the place's wall clock on this machine's
  const flo = await stormScenario("florence-coast");
  const S = run(flo.st.when), shift = L("2018-09-13T11:45") - Date.parse("2018-09-13T11:45:00-04:00"), now = L("2018-09-13T11:45");
  const tides = [{ t: "2018-09-13 14:10", v: "0.4", type: "L" }, { t: "2018-09-13 20:28", v: "5.1", type: "H" }, { t: "2018-09-18 09:00", v: "5", type: "H" }];
  const T = S.stormLanes(flo.model, now, { shift, tides });
  deq(T.lanes.map((l) => [l.key, l.peak, l.beach]), [["wind", "gusts to 105 mph", "gusts to 115 mph"], ["rain", "more than two feet", null], ["surge", "2–4 ft above ground", "6–9 ft above ground"]],
    "the beach's worse numbers beside the house's");
  deq(T.also.map((l) => [l.key, l.peak]), [["tornado", "a few possible"]], "the tornadoes have no hours, so no bar");
  const [wind, rain, surge] = T.lanes;
  deq(wind.segs.map((g) => [g.strong, g.a1, g.b0, g.b1]), [[0, L("2018-09-13T10:55"), L("2018-09-15T12:00"), L("2018-09-15T18:00")],
    [1, L("2018-09-13T21:00"), L("2018-09-14T12:00"), L("2018-09-14T18:00")]], "tropical-storm winds until Saturday afternoon, hurricane force from early this evening until Friday afternoon");
  deq(rain.segs.map((g) => [g.word, g.b0, g.b1]), [["Flash Flood Watch", L("2018-09-15T18:00"), L("2018-09-15T18:00")]], "the rain's hours are the watch's, to the minute");
  assert.equal(surge.segs[0].open, true, "the surge has no end yet");
  deq(surge.marks.map((m) => m.t), [L("2018-09-13T20:28")], "its high tides inside the chart");
  deq({ ...T.closest }, { t: L("2018-09-14T08:00"), miles: 7, dir: "S" }, "the closest forecast point, Friday 8 a.m.");
  assert.equal(T.t0, now);
  assert.ok(T.t1 - T.t0 >= 48 * 36e5 && T.t1 - T.t0 <= 72 * 36e5, "two days at least, never past three");
  assert.equal(T.beach, null, "the warnings are at the house");
  // the pill: the words, with the day named, and the stretch where an edge is only a part of a day
  const say = (t) => S.readStorm(T, L(t), now).parts.map((p) => p[0]);
  deq(say("2018-09-14T08:00"), ["Fri 8a", "closest, 7 mi S", "hurricane-force wind", "Flash Flood Watch", "storm surge"]);
  deq(say("2018-09-13T19:00"), ["7p", "hurricane-force wind from early this evening", "Flash Flood Watch", "storm surge"], "today goes unsaid");
  deq(say("2018-09-13T20:28"), ["8:28p", "hurricane-force wind from early this evening", "Flash Flood Watch", "storm surge", "high tide 8:28p"]);
  // and no TCV impacts word is ever said, on a pill or to a screen reader
  const IMPACT = /unfolding|being assessed|devastating|catastrophic|extensive|significant|limited|little to none/i;
  for (let t = T.t0; t <= T.t1; t += 36e5) { const r = S.readStorm(T, t, now); assert.doesNotMatch(r.parts.map((p) => p[0]).join(" ") + r.said, IMPACT); }
  deq(say("2018-09-15T15:00"), ["Sat 3p", "tropical-storm wind until Sat afternoon", "Flash Flood Watch", "storm surge"]);
  deq(say("2018-09-15T22:00"), ["Sat 10p", "storm surge"], "the watch's hours are over and the winds' window has closed");
  assert.match(S.readStorm(T, L("2018-09-14T08:00"), now).said, /^Friday 8 am, the closest point on the forecast track, 7 miles south, hurricane-force wind/);
  // A short-fuse warning issued during the storm is the strip's, never a lane's hours: a routine Flash
  // Flood Warning to 5:30 made the two feet of rain end that evening, and a 35-minute Tornado Warning
  // drew a red sliver at NOW on a row that still read "a few possible"
  const fuse = (event, k, ends) => W.alertRow({ properties: { id: "urn:x:" + k, event, severity: "Severe", sent: "2018-09-13T11:40:00-04:00", onset: "2018-09-13T11:40:00-04:00",
    ends, expires: ends, description: "* WHAT...Flash flooding caused by excessive rainfall.\n\n* WHEN...Until 530 PM EDT.", instruction: "Turn around, don't drown.",
    parameters: { VTEC: [`/O.NEW.KILM.${k}.0031.180913T1540Z-180913T2130Z/`] } } });
  for (const extra of [fuse("Flash Flood Warning", "FF.W", "2018-09-13T17:30:00-04:00"), fuse("Tornado Warning", "TO.W", "2018-09-13T12:15:00-04:00")]) {
    const X = S.stormLanes(S.stormRead(flo.L, [...flo.point, extra], flo.beach, flo.storms, flo.now), now, { shift, tides });
    deq(X.lanes.map((l) => l.key), ["wind", "rain", "surge"], extra.event);
    deq(X.lanes[1].segs.map((g) => [g.word, g.b1]), [["Flash Flood Watch", L("2018-09-15T18:00")]], `${extra.event}: the rain keeps the watch's hours`);
    deq(X.also.map((l) => [l.key, l.peak]), [["tornado", "a few possible"]], `${extra.event}: and the tornadoes no bar`);
  }
  // An areal or a river Flood Warning, or a Flood Advisory, is not the rain's hours either: a hazard from
  // the TCV takes a flood or flash flood watch's, or else the longest-running product for it, and never
  // the first warning's (an areal Flood Warning to 5:30 made the two feet of rain end that evening)
  for (const extra of [fuse("Flood Warning", "FA.W", "2018-09-13T17:30:00-04:00"), fuse("Flood Warning", "FL.W", "2018-09-14T08:00:00-04:00"), fuse("Flood Advisory", "FA.Y", "2018-09-13T15:00:00-04:00")]) {
    const X = S.stormLanes(S.stormRead(flo.L, [...flo.point, extra], flo.beach, flo.storms, flo.now), now, { shift, tides });
    deq(X.lanes.filter((l) => l.key === "rain").map((l) => l.segs.map((g) => [g.word, g.b1])), [[["Flash Flood Watch", L("2018-09-15T18:00")]]], `${extra.vtec[0]}: the rain keeps the watch's hours`);
  }
  // With no watch, a hazard from the TCV takes no product's hours at all: a 3-hour Flood Advisory ended
  // "more than two feet" at 2:30, an areal Flood Warning at 5:30, and a river's, whose end is its crest and
  // not the rain, ran the bar a week past the chart. The rain is the quiet row with no bar
  const unwatched = flo.point.filter((a) => !a.vtec.some((v) => /\.FF\.A\./.test(v)));
  const weekLong = { ...fuse("Flood Warning", "FL.W", "2018-09-20T08:00:00-04:00"), vtec: ["/O.NEW.KILM.FL.W.0045.180913T1540Z-180920T1200Z/"] };
  for (const extra of [[fuse("Flood Advisory", "FA.Y", "2018-09-13T14:30:00-04:00")], [fuse("Flood Warning", "FA.W", "2018-09-13T17:30:00-04:00")],
    [fuse("Flood Warning", "FA.W", "2018-09-13T17:30:00-04:00"), weekLong]]) {
    const U = S.stormLanes(S.stormRead(flo.L, [...unwatched, ...extra], flo.beach, flo.storms, flo.now), now, { shift, tides });
    const why = extra.map((x) => x.vtec[0].slice(10, 14)).join(" and ");
    assert.equal(U.lanes.some((l) => l.key === "rain" || l.key === "flood"), false, `${why}: no bar for the rain`);
    deq(U.also.map((l) => [l.key, l.peak]), [["rain", "more than two feet"], ["tornado", "a few possible"]], `${why}: its row says it, with no hours`);
  }
  // A lane from a product's hours starts at the product's start, never when it was sent: a watch or
  // warning issued ahead of its start drew from NOW (RLX's January 23 2026 warning, nine hours early).
  // Florence's Flash Flood Watch, issued ahead of its 8 pm start, draws from 8 pm, and NOW reads no watch
  const ahead = flo.point.map((a) => (a.vtec.some((v) => /\.FF\.A\./.test(v)) ? { ...a, onset: "2018-09-13T20:00:00-04:00", vtec: ["/O.NEW.KILM.FF.A.0006.180914T0000Z-180915T2200Z/"] } : a));
  const AT = S.stormLanes(S.stormRead(flo.L, ahead, flo.beach, flo.storms, flo.now), now, { shift, tides });
  deq(AT.lanes.find((l) => l.key === "rain").segs.map((g) => [g.word, g.a0, g.b1]), [["Flash Flood Watch", L("2018-09-13T20:00"), L("2018-09-15T18:00")]], "from its start");
  assert.ok(!S.readStorm(AT, now, now).parts.some((p) => /Flash Flood Watch/.test(p[0])), "and NOW reads no watch");
  // the VTEC begin stands in for an onset the alert does not carry
  const AV = S.stormLanes(S.stormRead(flo.L, ahead.map((a) => (/Flash Flood/.test(a.event) ? { ...a, onset: null } : a)), flo.beach, flo.storms, flo.now), now, { shift, tides });
  assert.equal(AV.lanes.find((l) => l.key === "rain").segs[0].a0, L("2018-09-13T20:00"));
  // A winter warning is one lane, named by what it is for and with no number, on its own hours from its
  // start: RLX's January 23 2026 warning, issued the evening before, starts at 7 Saturday morning
  const jan = S.stormRead(S.LOCS.sp, [{ id: "rlx-jan26", event: "Winter Storm Warning", vtec: ["/O.CON.KRLX.WS.W.0001.260124T1200Z-260126T1200Z/"], sent: "2026-01-23T22:03:00-05:00",
    onset: "2026-01-24T07:00:00-05:00", ends: "2026-01-26T07:00:00-05:00", expires: "2026-01-24T06:00:00-05:00", inst: "", par: {},
    desc: "* WHAT...Heavy mixed precipitation expected. Total snow and sleet accumulations between 3 and 8 inches and ice accumulations between two tenths and one half of an inch.\n\n* WHEN...From 7 AM Saturday to 7 AM EST Monday." }],
    [], [], Date.parse("2026-01-23T22:20:00-05:00"), { wssi: { impact: "MAJOR", days: [{ day: 1, impact: "MAJOR", start: "2026-01-24T00:00:00.000Z", end: "2026-01-25T00:00:00.000Z" }] } });
  const JT = S.stormLanes(jan, L("2026-01-23T22:20"), { shift: L("2026-01-23T22:20") - Date.parse("2026-01-23T22:20:00-05:00") });
  deq(JT.lanes.map((l) => [l.key, l.name, l.peak, l.hero, l.segs.map((g) => [g.word, g.a0, g.b1])]), [["snow", "Snow and ice", null, true, [["Winter Storm Warning", L("2026-01-24T07:00"), L("2026-01-26T07:00")]]]],
    "one lane, the warning's, from its start");
  // NOW, before it has begun, says it with its start, the way the headline does: it read "Now, no hours from
  // the Weather Service", which sounds like nothing was given
  const jNow = S.readStorm(JT, L("2026-01-23T22:20"), L("2026-01-23T22:20"));
  deq([jNow.parts.map((p) => p[0]), jNow.said], [["now", "Winter Storm Warning from Sat 7a"], "Now, Winter Storm Warning from Saturday at 7 am"], "NOW names the warning and its start: it has not begun");
  deq(S.readStorm(JT, L("2026-01-24T05:00"), L("2026-01-23T22:20")).parts.map((p) => p[0]), ["Sat 5a", "—"], "and an hour before it no window covers is still a dash");
  deq(S.readStorm(JT, L("2026-01-24T08:00"), L("2026-01-23T22:20")).parts.map((p) => p[0]), ["Sat 8a", "Winter Storm Warning"]);
  // and the real one: RLX's January 5 2025 warning, issued at 5:24 that morning for noon, through the
  // page's own fetch path (the fixture's onset is its VTEC begin, as the API's is)
  const sif = await stormScenario("snow-ice-farm"), SW = run(sif.st.when), sNow = L("2025-01-05T05:40");
  const ST = SW.stormLanes(sif.model, sNow, { shift: sNow - Date.parse("2025-01-05T05:40:00-05:00") });
  deq(ST.lanes.map((l) => [l.name, l.peak, l.segs.map((g) => [g.word, g.a0, g.b1])]), [["Snow and ice", null, [["Winter Storm Warning", L("2025-01-05T12:00"), L("2025-01-07T06:00")]]]]);
  const sRead = SW.readStorm(ST, sNow, sNow);
  deq([sRead.parts.map((p) => p[0]), sRead.said], [["now", "Winter Storm Warning from 12p"], "Now, Winter Storm Warning from noon"], "NOW reads the warning from noon, the pill and the spoken value");
  assert.doesNotMatch(sRead.said, /no hours from the Weather Service/);
  // and a start still to come is said, so the chart's spoken label is "from noon" and agrees with the bar:
  // it read "Winter Storm Warning until Tuesday at 6 am", as on now
  deq(ST.lanes[0].segs.map((g) => [g.from, g.fromSaid]), [["12p", "noon"]], "from noon");
  deq(JT.lanes[0].segs.map((g) => [g.from, g.fromSaid]), [["Sat 7a", "Saturday at 7 am"]], "a start on another day names it");
  deq(AT.lanes.find((l) => l.key === "rain").segs.map((g) => g.fromSaid), ["8 pm"], "Florence's Flash Flood Watch, from 8 pm");
  deq(SW.stormLanes(sif.model, L("2025-01-05T13:00"), { shift: sNow - Date.parse("2025-01-05T05:40:00-05:00") }).lanes[0].segs.map((g) => g.fromSaid), [null], "and once it has begun, no start");
  // an emergency's lane is still its own warning's hours: the card is that warning's
  const emer = S.stormLanes(S.stormRead(flo.L, [{ ...fuse("Flash Flood Warning", "FF.W", "2018-09-13T17:30:00-04:00"), desc: "* WHAT...Flash flooding. This is a FLASH FLOOD EMERGENCY for Porters Neck.\n\n* WHEN...Until 530 PM EDT." }], [], [], flo.now), now, { shift });
  deq(emer.lanes.map((l) => [l.key, l.segs[0].word, l.segs[0].b1]), [["flood", "Flash Flood Warning", L("2018-09-13T17:30")]]);

  // Debby: the tropical storm warning is the beach's, the rain is the house's Flood Watch, and the
  // wind and the tornadoes have no hours
  const deb = await stormScenario("debby-flood-coast");
  const D = run(deb.st.when).stormLanes(deb.model, L("2024-08-07T11:40"), { shift: L("2024-08-07T11:40") - Date.parse("2024-08-07T11:40:00-04:00") });
  deq(D.lanes.map((l) => l.key), ["rain", "surge"]);
  deq(D.also.map((l) => l.key), ["wind", "tornado"]);
  assert.equal(D.beach, "Tropical Storm Warning");
  // every number is the beach zone's, and its windows are said as the beach's on the pill; the rain's
  // hours are the house's own Flood Watch, and say so
  deq([...D.lanes, ...D.also].map((l) => [l.key, l.where, l.beach]), [["rain", "beach", null], ["surge", "beach", null], ["wind", "beach", null], ["tornado", "beach", null]]);
  deq(run(deb.st.when).readStorm(D, L("2024-08-08T08:00"), L("2024-08-07T11:40")).parts.map((p) => p[0]), ["Thu 8a", "closest, 115 mi WSW", "Flood Watch", "storm surge at the beach"]);
  assert.equal(D.lanes[0].segs[0].b1, L("2024-08-09T08:00"));
  // the blizzard: the warning's own hours, and an hour no window covers is a dash
  const bz = await stormScenario("blizzard-farm");
  const B = run(bz.st.when), BT = B.stormLanes(bz.model, L("2027-01-22T13:30"), { shift: L("2027-01-22T13:30") - Date.parse("2027-01-22T13:30:00-05:00") });
  // its lane says only SNOW, and the title is the warning's own words
  deq(BT.lanes.map((l) => [l.key, l.name, l.peak, l.hero, l.segs[0].b1]), [["snow", "Snow", null, true, L("2027-01-24T01:00")]]);
  assert.equal(BT.closest, null, "no storm, no track");
  deq(B.readStorm(BT, L("2027-01-24T03:00"), L("2027-01-22T13:30")).parts.map((p) => p[0]), ["Sun 3a", "—"]);
  // and the light tier and no tier draw no timeline
  const isa = await stormScenario("isaias-farm-today");
  assert.equal(run(isa.st.when).stormLanes(isa.model, Date.now()), null, "the named tier is one quiet line");
  assert.equal(S.stormLanes({ tier: null }, now), null);
  // it sits above the hours and the named line where the tropics list was; a shell takes both down
  assert.match(html, /<\/header>\n\n<section id="stormSection" hidden>/);
  assert.match(html, /renderAlerts\(stormStrip\(activeAlerts\(d\.alerts\),model\),\{card:model\?\.tier==="storm",cover:stormCover\(model\),due:stormDue\(d,model\)\}\);\n  paintStormDebug\(model\);/);
  const shells = html.slice(html.indexOf("function paintLoadingState("), html.indexOf("function setLoc("));
  assert.equal((shells.match(/paintStormCard\(null\);/g) || []).length, 2);
  // the card adds no motion and no colour that is not the page's
  const card = html.slice(html.indexOf("function paintStormCard("), html.indexOf("/* The hurricane centers' advisories"));
  assert.doesNotMatch(card, /animation|@keyframes|Math\.random/);
  // a window's ends are clean: each bar is clipped to a rounded rect, a part-of-a-day edge is a paler
  // band ended square, and the one gradient on a bar is the fade of a window with no end yet
  assert.match(card, /defs\+=`<clipPath id="\$\{id\}"><rect [^`]*rx="\$\{bh\/2\}"\/><\/clipPath>`;/);
  assert.match(card, /if\(g\.open\)\{\n        defs\+=`<linearGradient id="\$\{id\}f"/);
  assert.equal((card.match(/<linearGradient/g) || []).length, 2, "the open window's fade and the night band, nothing else");
  // and the marks say what they are, on the chart rather than only in the slider
  assert.match(card, /t:"hurricane force"/);
  assert.match(card, /t:l\.marks\.length>1\?"high tides":"high tide"/);
});

test("the storm card reads in its own lane after the paint, at both places", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  // The advisories never hold the forecast: the lane starts beside it, at both places, joins the
  // paint when it is in by then (and a first open waits STORM_WAIT for it, so the card is part of the
  // first frame and never pushes the hours down after them), and otherwise lands after it
  const refresh = html.slice(html.indexOf("async function refresh("), html.indexOf("\nconst SWAP="));
  assert.doesNotMatch(refresh, /fetchStorms|stormsP|L\.tropics/);
  // and the beach's answer is kept on its own the moment it is in (beachIn), for every paint, and so is
  // the farm's WSSI (wssiIn), which the lane asks for once the point's alerts are in
  assert.match(refresh, /const alertsP=fetchJSON\(`https:\/\/api\.weather\.gov\/alerts\/active\?point=\$\{L\.lat\},\$\{L\.lon\}`,6000\)\.then\(aj=>\(aj\.features\|\|\[\]\)\.map\(alertRow\)\.filter\(a=>alertLive\(a\)&&!quiet\.includes\(a\.event\)\)\)\.catch\(\(\)=>null\);\n[^\n]*\n  let pointAt=null;alertsP\.then\(a=>\{if\(a\)pointAt=Date\.now\(\)\}\);\n  const lane=stormLane\(L,alertsP\);let landed=null,beachIn,beachAt=null,wssiIn;\n  lane\.then\(g=>\{landed=g\},\(\)=>\{\}\);lane\.beach\.then\(b=>\{beachIn=b;beachAt=Date\.now\(\)\},\(\)=>\{\}\);lane\.wssi\.then\(w=>\{wssiIn=w\},\(\)=>\{\}\);\n  try\{/);
  // and it waits only when a rule could fire: at the coast the beach's answer is looked at first
  assert.match(refresh, /let wait=null;const waited=\(\)=>wait\|\|\(wait=new Promise\(r=>setTimeout\(r,STORM_WAIT\)\)\);\n    if\(!landed&&!LAST\)\{\n[\s\S]*?      if\(L\.kind==="coast"&&!stormWaits\(L,alerts,null\)\)await Promise\.race\(\[lane\.beach,waited\(\)\]\);\n      if\(stormWaits\(L,alerts,beachIn\)\)await Promise\.race\(\[lane,waited\(\)\]\);\n    \}/);
  // a cached beach whose tropical warning has reached its expiry waits for the beach's own answer, and
  // with the cache past its six hours the page's own reading for this place stands in for it
  assert.match(refresh, /const cache=readCache\(L\.id\),own=LAST&&LAST\.loc===L\.id\?\{data:LAST\.d,savedAt:LAST\.savedAt\}:null,kept=\(cache\|\|own\)\?\.data,keptAt=\(cache\|\|own\)\?\.savedAt\?\?null;/);
  assert.match(refresh, /if\(beachIn===undefined&&L\.kind==="coast"&&\(kept\?\.beach\|\|\[\]\)\.some\(a=>isTropical\(a\)&&!stormLive\(a,Date\.now\(\)\)\)\)await Promise\.race\(\[lane\.beach,waited\(\)\]\);/);
  assert.match(refresh, /storms=landed\?\.storms\?\?kept\?\.storms\?\?null,beach=beachIn\?\?landed\?\.beach\?\?kept\?\.beach\?\?null;/);
  // (the house's list is fetched when it came in, and a list whose request failed is the last good one,
  // read against now, kept at its own fetch time and marked as carried)
  assert.match(refresh, /const seen=\{point:alerts\?pointAt\?\?Date\.now\(\):carry\?kept\.seen\?\.point\?\?keptAt:null,beach:beachIn!=null\?beachAt:kept\?\.seen\?\.beach\?\?keptAt,\.\.\.\(carry\?\{carried:true\}:\{\}\)\};\n    const wssi=wssiIn!==undefined\?wssiIn:kept\?\.wssi\?\?latch\.wssi\?\?null;/);
  assert.match(refresh, /const carry=!alerts&&Array\.isArray\(kept\?\.alerts\)\?kept\.alerts\.filter\(a=>activeAlerts\(\[a\]\)\.length>0\n      \|\|isTropical\(a\)&&!a\.ends&&Date\.parse\(a\.expires\|\|""\)\+STORM_STALE>Date\.now\(\)\):null;/);
  // the latch and the last index are read out of this place's cache entry whatever its age, so a cold open
  // the next morning keeps a card the cache can no longer vouch for (readLatch), and a paint with no point
  // list carries them on
  assert.match(refresh, /const latch=readLatch\(L\.id\);/);
  assert.match(refresh, /,beach,wssi,seen,held:kept\?\.held\?\?latch\.held\?\?null\};/);
  assert.match(refresh, /render\(data,true\);\n    writeCache\(L\.id,data\);\n    if\(!landed\)stormRun\(L,request,lane\);/);
  assert.match(refresh, /if\(cached\)\{if\(beachIn\)\{cached\.data\.beach=beachIn;cached\.data\.seen=\{\.\.\.cached\.data\.seen,beach:beachAt\}\}render\(cached\.data,false,cached\.savedAt\);stormRun\(L,request,lane\)\}/);
  assert.match(html, /const STORM_WAIT=3000;/);
  assert.match(html, /\.then\(aj=>\(aj\.features\|\|\[\]\)\.map\(alertRow\)\.filter\(a=>alertLive\(a\)&&!quiet\.includes\(a\.event\)\)\)\.catch\(\(\)=>null\)/);
  assert.match(html, /async function stormRun\(L,request,lane\)\{\n  try\{\n    const got=await lane;\n    await PAINT;\n    if\(L!==LOC\|\|request!==REFRESH_ID\|\|!LAST\)return;/);
  // a late lane paints again only when it changes what the page says, and the card comes in with the
  // reader's view held
  assert.match(html, /const m=stormOf\(L,d,Date\.now\(\),LAST\.savedAt\);if\(Array\.isArray\(d\.alerts\)&&!d\.seen\?\.carried\)d\.held=m\.held;\n[^\n]*\n    if\(JSON\.stringify\(m\)!==was\)render\(d,LAST\.live,LAST\.savedAt\);/);
  // (and a late lane with no answer at all, no point list to ask on, keeps the last index)
  assert.match(html, /if\(got\.wssi!==undefined\)d\.wssi=got\.wssi;/);
  // the warnings holding the card are kept in memory and with the reading, so its cache keeps them, and
  // only a paint with a fresh point list writes them: a failed request wiped the latch, and a list carried
  // through one is no newer word on them
  assert.match(html, /const sm=stormOf\(LOC,d,Date\.now\(\),savedAt\),stormDay=sm\.tier==="storm";\n(?:[^\n]*\n){4}  if\(Array\.isArray\(d\.alerts\)&&!d\.seen\?\.carried\)\{STORM_HELD\[LOC\.id\]=sm\.held;d\.held=sm\.held\}/);
  assert.match(html, /seen:\{point:at\("point"\),beach:at\("beach"\),carried:!!d\.seen\?\.carried\}\}\);/);
  assert.match(html, /function paintStormCard\(model,d\)\{\n  const sec=document\.getElementById\("stormSection"\),line=document\.getElementById\("stormLine"\);\n  if\(!sec\|\|!line\)return;\n  keepView\(\(\)=>stormPaint\(model,d,sec,line\)\);/);
  // the view is held on what the card pushes, the first thing on screen at or under it, never the sky:
  // with the header's foot 150px down the screen, the hours under it jumped by the card
  assert.match(html, /function viewHold\(\)\{\n  const app=document\.querySelector\("\.app"\),kids=app\?\[\.\.\.app\.children\]:\[\],from=kids\.indexOf\(document\.getElementById\("stormSection"\)\);\n/);
  // the anchor is the first thing at or after the card whose top is on the screen or under it, never the
  // card once its top has gone off the screen: a card that grew moved the hours under a reader inside it
  assert.match(html, /const anchor=\(seen\.find\(\(\[,r\]\)=>r\.top>=0\)\|\|seen\.find\(\(\[e,r\]\)=>e\.id!=="stormSection"&&r\.bottom>0\)\|\|\[null\]\)\[0\];/);
  assert.match(html, /function keepView\(fn\)\{const done=viewHold\(\);fn\(\);done\(\)\}/);
  // and the headline turning to the storm's is held with the card: the hours moved 24px under a reader
  // scrolled partway when only the card was
  const rdr = html.slice(html.indexOf("function render(d,"), html.indexOf("/* The line boxes of the type in the header"));
  assert.ok(rdr.indexOf("const held=viewHold();") < rdr.indexOf('document.getElementById("verdict").innerHTML=dayRead.html;')
    && rdr.indexOf("paintStormCard(sm,d);\n  held();") > rdr.indexOf('document.getElementById("verdict").innerHTML=dayRead.html;'));
  // A first open waits for the lane only when a rule could fire, and every rule needs an alert at the
  // place: at the farm the point's, at the coast the point's or the beach zone's
  const { S: W } = await stormSandbox("2026-10-10T20:20:00Z");
  const at = Date.parse("2026-10-10T20:20:00Z"), farmL = W.LOCS.sp, coastL = W.LOCS.mb;
  const advisory = { event: "Wind Advisory", ends: "2026-10-11T15:00:00Z", vtec: ["/O.CON.KRLX.WI.Y.0008.261010T2100Z-261011T1500Z/"] };
  const tsw = { event: "Tropical Storm Warning", ends: null, expires: "2026-10-10T23:00:00Z", vtec: ["/O.CON.KILM.TR.W.1009.000000T0000Z-000000T0000Z/"] };
  assert.equal(W.stormWaits(farmL, [], null, at), false, "the farm with nothing in effect waits for nothing");
  assert.equal(W.stormWaits(farmL, null, null, at), false, "nor with the alerts down");
  assert.equal(W.stormWaits(farmL, [advisory], null, at), true, "a Wind Advisory could be the named line (N2, N3)");
  assert.equal(W.stormWaits(farmL, [{ ...advisory, ends: "2026-10-10T20:00:00Z" }], null, at), false, "an ended one could not");
  assert.equal(W.stormWaits(farmL, [{ event: "Wind Advisory" }], null, at), false, "an alert without VTEC never raises the card");
  assert.equal(W.stormWaits(coastL, [], null, at), false, "the coast with nothing at the point or the beach");
  assert.equal(W.stormWaits(coastL, [], [tsw], at), true, "Debby's warning was the beach's alone");
  assert.equal(W.stormWaits(farmL, [], [tsw], at), false, "the farm has no beach");
  assert.equal(W.stormWaits(coastL, [advisory], null, at), true);
  // and the beach's answer is kept on its own, so the coast can look at it before the advisories
  assert.match(html, /const lane=Promise\.all\(\[fetchStorms\(\),beach,wssi\]\)\.then\(\(\[storms,beach,wssi\]\)=>\(\{storms,beach,wssi\}\)\);\n  lane\.beach=beach;lane\.wssi=wssi;\n  return lane;/);
  // and the farm asks WPC's index only while a Winter Storm Warning stands at the point, and nothing else
  // ever asks it
  // (and the reading keeps when it was asked for and the warnings it was asked for, each with its hours)
  assert.match(html, /const wssi=L\.kind!=="coast"\?Promise\.resolve\(alerts\)\.then\(al=>\{if\(!Array\.isArray\(al\)\)return undefined;\n      if\(!al\.some\(a=>stormLive\(a,Date\.now\(\)\)&&vtecLive\(a\)\.some\(v=>v\.key==="WS\.W"\)\)\)return null;\n      const at=Date\.now\(\),of=wsFor\(al\);\n      return fetchJSON\(wssiUrl\(L\),6000\)\.then\(j=>\{const r=wssiRead\(j\);return r&&\{\.\.\.r,at,for:of\}\}\)\.catch\(\(\)=>null\)\},\(\)=>undefined\):Promise\.resolve\(null\);/);
  assert.equal((html.match(/wssiUrl\(/g) || []).length, 1);
  // A quoted title is fitted in one place (stormTitleFit), on the paint and again when the fonts land: the
  // ready hook beside moonNoteFit, and a face that lands later still, because fitted in the fallback face
  // Bricolage reflowed it to a line more. Three lines at most, 18px at the least (17 under 360), and a
  // sentence that will not fit gives way to the warning's shorter one, else its name, with the whole one
  // under the chart (#stormFull), never cut
  assert.match(html, /if\(hero\?\.quote\)\{nEl\.textContent="";stormTitleFit\(\)\}/);
  assert.match(html, /document\.fonts\.addEventListener\("loadingdone",\(\)=>keepView\(stormTitleFit\)\)/);
  assert.match(html, /const min=appW\(\)<360\?17:18,/);
  assert.match(html, /for\(const most of \[2,3\]\)for\(let px=26;px>=min;px-=px>20\?2:1\)\{tEl\.style\.fontSize=px\+"px";if\(lines\(\)<=most\)return true\}/);
  assert.match(html, /let shown=\[q\.text,q\.short\]\.filter\(Boolean\)\.find\(fits\);\n  if\(!shown\)\{head\.classList\.remove\("storm-quote"\);tEl\.style\.fontSize="";tEl\.textContent=shown=q\.name\}/);
  assert.match(html, /<p class="storm-full" id="stormFull" hidden><\/p>\n  <p class="storm-warns" id="stormWarns" hidden><\/p>/);
  // the lane, run: a Winter Storm Warning at the farm asks the index once, nothing else asks it, and a
  // failed answer is no reading (the warning stays the strip's unless it already holds the card)
  const { WSSI_REAL } = await STORM_FIX();
  const ws = { event: "Winter Storm Warning", ends: "2026-10-11T15:00:00Z", vtec: ["/O.CON.KRLX.WS.W.0002.000000T0000Z-261011T1500Z/"] };
  for (const [alerts, answer, want, asks, why] of [[[ws], () => WSSI_REAL.major, "MAJOR", 1, "a warning"], [[ws], () => { throw new Error("down"); }, null, 1, "a failed answer"],
    [[ws], () => WSSI_REAL.farm, null, 1, "an empty answer"], [[{ ...ws, vtec: ["/O.CON.KRLX.WS.A.0002.000000T0000Z-261011T1500Z/"] }], () => WSSI_REAL.major, null, 0, "a watch"],
    [[{ ...ws, ends: "2026-10-10T20:00:00Z" }], () => WSSI_REAL.major, null, 0, "an ended warning"], [null, () => WSSI_REAL.major, undefined, 0, "no point list (its request failed): no answer at all, and the last reading is kept"],
    [[], () => WSSI_REAL.major, null, 0, "nothing in effect"]]) {
    let n = 0;
    const { S: X } = await stormSandbox("2026-10-10T20:20:00Z", async (url) => { if (/mapservices\.weather\.noaa\.gov/.test(url)) { n++; return answer(); } throw new Error("offline"); });
    const got = await X.stormLane(X.LOCS.sp, Promise.resolve(alerts));
    deq([got.wssi === undefined ? "undefined" : got.wssi?.impact ?? null, n], [want === undefined ? "undefined" : want, asks], why);
    assert.equal((await X.stormLane(X.LOCS.mb, Promise.resolve(alerts))).wssi, null, "the coast never asks");
    assert.equal(n, asks);
  }
  // Everything the card stands on can end with the app left open, and the card comes down with it:
  // Debby's warning was the beach's, with the house's only timed alert two days longer. So the card's
  // own alerts (the statement and the beach's, which the strip never shows) arm the strip's timer
  const deb = await stormScenario("debby-flood-coast");
  const due = deb.S.stormDue({ alerts: deb.point, beach: deb.beach }, deb.model, deb.now);
  deq(due.map((a) => a.event).sort(), ["Flood Watch", "Tropical Cyclone Local Statement", "Tropical Storm Warning"]);
  assert.equal(Math.min(...due.map((a) => Date.parse(a.ends || a.expires))), Date.parse("2024-08-07T19:00:00-04:00"), "the beach's warning is due first, at its next advisory");
  deq(deb.S.stormDue({ alerts: deb.point, beach: deb.beach }, { tier: null }, deb.now), [], "with no card nothing is due");
  deq(deb.S.stormDue({ alerts: deb.point, beach: deb.beach }, deb.model, Date.parse("2024-08-08T09:00:00-04:00")).map((a) => a.event), ["Flood Watch"], "and an end already past is never waited for");
  // a tropical warning still standing a minute past its 7 pm expiry, the beach not yet answering (the
  // stale window is its own expiry plus six hours), is due at 1 am, when it is over unless a newer answer
  // has renewed it: a beach that never answers again cannot hold the card
  const t1901 = Date.parse("2024-08-07T19:01:00-04:00"), standing = deb.S.stormRead(deb.L, deb.point, deb.beach, deb.storms, t1901, { seen: { point: t1901, beach: deb.now } });
  assert.equal(standing.tier, "storm");
  deq(deb.S.stormDue({ alerts: deb.point, beach: deb.beach }, standing, t1901).filter((a) => a.event === "Tropical Storm Warning").map((a) => a.expires), ["2024-08-08T05:00:00.000Z"]);
  // the beach zone is the coast's, for its tropical products
  assert.match(html, /beach:"NCZ108",/);
  assert.match(html, /fetchJSON\(`https:\/\/api\.weather\.gov\/alerts\/active\?zone=\$\{L\.beach\}`,6000\)/);
  // the fixed reading: three spaces before a padded number, and a bin seen only once it has parsed
  assert.match(html, /Advisory Number\\\\s\+\(\\\\w\+\)/);
  assert.match(html, /if\(!s\|\|seen\[s\.bin\]\)continue;\n      seen\[s\.bin\]=1;out\.push\(s\);/);
  // the strip says no end for a tropical watch or warning, and the card's model is painted with it
  assert.match(html, /const until=\(a\.vtec\|\|\[\]\)\.some\(v=>\/\\\.\(\?:HU\|TR\|SS\)\\\.\[WA\]\\\.\/\.test\(v\)\)\?null:a\.ends\|\|a\.expires;/);
  // (with the view held: the storm statement leaving the strip as the card comes in is the header changing height)
  assert.match(html, /  keepView\(\(\)=>paintStorm\(d,sm\)\);\n  renderNowcast\(d\.nowcast,c\.weather_code,h\);/);
  // the card lands with the header, before the hours under it are drawn
  const rd = html.slice(html.indexOf("function render(d,"), html.indexOf("/* The line boxes of the type in the header"));
  assert.ok(rd.indexOf("paintStormCard(sm,d);") > rd.indexOf('document.getElementById("chips").innerHTML=') && rd.indexOf("paintStormCard(sm,d);") < rd.indexOf("/* hourly */"));
  assert.match(html, /<section id="stormDebug" hidden>/);
  const shells = html.slice(html.indexOf("function paintLoadingState("), html.indexOf("function setLoc("));
  assert.equal((shells.match(/paintStormDebug\(null\);/g) || []).length, 2, "both shells take the model down");
  // the strip in a sandbox: a hurricane warning with an expiry says no "until"
  const clock12 = html.match(/const clock12=d=>\{[\s\S]*?ap\};/)[0];
  const ctx = vm.createContext({});
  vm.runInContext(clock12 + "\n" + html.slice(html.indexOf("function alertGist("), html.indexOf("function alertStep(")) + "\nglobalThis.alertStrip=alertStrip;", ctx);
  const esc = (s) => String(s);
  ctx.esc = esc;
  assert.doesNotMatch(ctx.alertStrip([{ event: "Hurricane Warning", severity: "Extreme", ends: null, expires: "2026-10-11T20:00:00Z", vtec: ["/O.CON.KILM.HU.W.1006.000000T0000Z-000000T0000Z/"] }]).head, /until/);
  assert.match(ctx.alertStrip([{ event: "Flood Watch", severity: "Severe", ends: "2026-10-11T15:00:00Z", vtec: ["/O.CON.KILM.FA.A.0002.000000T0000Z-261011T1500Z/"] }]).head, /until/);

  // every end carries its day when it is not today, on the place's clock: "until 11:00 am" for a
  // Sunday end, read on a Saturday afternoon, was a Saturday morning that had passed
  const L = (s) => new Date(s).getTime(), shift = L("2026-10-10T16:20") - Date.parse("2026-10-10T16:20:00-04:00"), sat = Date.parse("2026-10-10T16:20:00-04:00");
  const wind = { event: "Wind Advisory", severity: "Moderate", sent: "2026-10-10T11:49:00-04:00", ends: "2026-10-11T11:00:00-04:00", vtec: ["/O.CON.KRLX.WI.Y.0008.261010T2100Z-261011T1500Z/"],
    desc: "* WHAT...Southeast winds 20 to 30 mph with gusts up to 50 mph expected.\n\n* WHEN...From 5 PM this afternoon to 11 AM EDT Sunday.", inst: "" };
  const said = (x) => x.head.replace(/<[^>]+>/g, "");
  assert.equal(said(ctx.alertStrip([wind], { now: sat, shift })), "Wind Advisory ·\u00A0until 11:00\u00A0am\u00A0Sun");
  assert.equal(said(ctx.alertStrip([{ ...wind, ends: "2026-10-10T19:00:00-04:00" }], { now: sat, shift })), "Wind Advisory ·\u00A0until 7:00\u00A0pm", "today's goes unsaid");
  // and the gist's relative words take their day once their stretch has passed
  assert.match(ctx.alertStrip([wind], { now: sat, shift }).body, /From 5 PM this afternoon to 11 AM EDT Sunday/);
  assert.match(ctx.alertStrip([wind], { now: Date.parse("2026-10-10T21:30:00-04:00"), shift }).body, /From 5 PM Saturday afternoon to 11 AM EDT Sunday/);
  // While a storm card is up the strip leads with the strongest tropical warning, and its body says only
  // what else is active, because the card carries the hazards and what to do
  const tcv = (ev, k) => ({ event: ev, severity: "Extreme", sent: "2018-09-13T10:55:00-04:00", ends: null, expires: "2018-09-13T19:00:00-04:00",
    vtec: [`/O.CON.KILM.${k}.1006.000000T0000Z-000000T0000Z/`], desc: "* WIND - LATEST LOCAL FORECAST: Equivalent Cat 1 Hurricane force wind", inst: "" });
  const ffa = { event: "Flash Flood Watch", severity: "Severe", sent: "2018-09-13T11:35:00-04:00", ends: "2018-09-15T18:00:00-04:00",
    vtec: ["/O.CON.KILM.FF.A.0006.000000T0000Z-180915T2200Z/"], desc: "* WHAT...Flash flooding", inst: "A Flash Flood Watch means that conditions may develop. Monitor later forecasts and be alert for possible Flash Flood Warnings." };
  const flo = [tcv("Storm Surge Warning", "SS.W"), tcv("Hurricane Warning", "HU.W"), ffa], thu = Date.parse("2018-09-13T11:45:00-04:00");
  const cover = ["Hurricane Warning", "Storm Surge Warning"], card = ctx.alertStrip(flo, { now: thu, shift, card: true, cover });
  assert.match(card.head, /^Hurricane Warning ·\u00A0\+2\u00A0more/, "Florence's Hurricane Warning was in the strip's +2 more");
  assert.doesNotMatch(card.body, /What to do|LATEST LOCAL FORECAST|conditions may develop/);
  assert.match(card.body, /also active: Storm Surge Warning, Flash Flood Watch/);
  assert.match(ctx.alertStrip(flo, { now: thu, shift }).head, /^Storm Surge Warning/, "with no card the strip is as it was");
  // a short-fuse warning issued during the storm enters on its own, with its own words and instruction
  const tor = { event: "Tornado Warning", severity: "Extreme", sent: "2018-09-13T12:10:00-04:00", ends: "2018-09-13T12:45:00-04:00",
    vtec: ["/O.NEW.KILM.TO.W.0031.180913T1610Z-180913T1645Z/"], desc: "* WHAT...A tornado.\n\n* WHERE...Porters Neck.", inst: "TAKE COVER NOW! Move to a basement or an interior room on the lowest floor." };
  const torn = ctx.alertStrip([...flo, tor], { now: thu, shift, card: true, cover });
  assert.match(torn.head, /^Tornado Warning ·\u00A0until 12:45\u00A0pm ·\u00A0\+3\u00A0more/);
  assert.match(torn.body, /What to do<\/b> TAKE COVER NOW!/);
  assert.match(torn.body, /also active: Hurricane Warning, Storm Surge Warning, Flash Flood Watch/);
  assert.notEqual(torn.lead, card.lead, "a new lead, so the strip enters again");
  // and a lead the card does not speak for keeps its own words: Debby's Flood Watch at the house
  const ffaLead = ctx.alertStrip([ffa], { now: thu, shift, card: true, cover: ["Tropical Storm Warning"] });
  // (its instruction through the card's own filter: the sentence on what a watch means is not something to do)
  assert.match(ffaLead.body, /What to do<\/b> Monitor later forecasts and be alert for possible Flash Flood Warnings\./);
  assert.doesNotMatch(ffaLead.body, /means/);
  // and an instruction that is only a link says nothing: the farm's Wind Advisory, October 10 2026, was
  // RLX's "Additional information can be found at https://www.weather.gov/rlx as well as on our X and
  // Facebook pages." and nothing else, so the strip has no "What to do" at all
  const rlx = JSON.parse(await readFile(new URL("tools/storm-fixtures/isaias/alerts-point-sp.json", root), "utf8")).features[0].properties.instruction;
  assert.match(rlx, /^Additional information can be found at https:\/\/www\.weather\.gov\/rlx/);
  const linkOnly = ctx.alertStrip([{ ...wind, inst: rlx }], { now: sat, shift });
  assert.doesNotMatch(linkOnly.body, /What to do|weather\.gov|Facebook/);
  assert.match(linkOnly.body, /From 5 PM this afternoon to 11 AM EDT Sunday/, "the gist stays");
  assert.match(ctx.alertStrip([{ ...wind, inst: "Use extra caution when driving. " + rlx }], { now: sat, shift }).body, /What to do<\/b> Use extra caution when driving\.<\/p>/);
  // a midnight belongs to the day it ends: 00:00 Sunday read on Saturday is tonight's midnight, said
  // with no day (it read "until 12:00 am Sun", a day late), and 00:00 Monday is Sunday's
  assert.equal(said(ctx.alertStrip([{ ...wind, ends: "2026-10-11T00:00:00-04:00" }], { now: sat, shift })), "Wind Advisory ·\u00A0until midnight");
  assert.equal(said(ctx.alertStrip([{ ...wind, ends: "2026-10-12T00:00:00-04:00" }], { now: sat, shift })), "Wind Advisory ·\u00A0until midnight\u00A0Sun");
  assert.equal(said(ctx.alertStrip([{ ...wind, ends: "2026-10-11T00:30:00-04:00" }], { now: sat, shift })), "Wind Advisory ·\u00A0until 12:30\u00A0am\u00A0Sun", "half past is Sunday's");
  // and every " · " rides with the words after it: the only places a strip can wrap are before a dot
  // or inside the event's own name, so a wrapped line never ends on a lone dot
  for (const x of [ctx.alertStrip([wind, ffa], { now: sat, shift }), torn]) {
    const h = said(x);
    assert.doesNotMatch(h, /· /, `no ordinary space after a dot: ${h}`);
    assert.doesNotMatch(h, /\u00A0·/, `and none tying a dot to the words before it: ${h}`);
    // only the dot is tied to its first word, and a clock to its am or pm and its day: the whole clause
    // made unbreakable put today's coast strip on three lines at 320 ("FLOOD WATCH" / "· UNTIL 11:00 AM
    // SUN" / "· +1 MORE"), where it had wrapped once, and a day of its own read "MON" alone on a line
    assert.doesNotMatch(h, /until\u00A0/, `the until clause can still wrap after "until": ${h}`);
  }
  // and the strip reads at night: cream type on the deeper rust is 4.5:1 and more, every word of it
  assert.match(html, /html\[data-theme=dark\] \.alert-strip\{background:#9A3317;/);
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const mixed = (a, b, t) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, "0")).join("");
  for (const t of [1, .78]) { const c = (lum(mixed("#FFF7F3", "#9A3317", t)) + .05) / (lum("#9A3317") + .05); assert.ok(c >= 4.5, `night strip at ${t}: ${c.toFixed(2)}:1`); }
});

/* The latch through the page's own refresh (October 11 2026). RLX's January 5 2025 warning raised the
   farm's card with WPC's index at Major on its second day. Two things took the card down for the rest of
   the same warning: a single point-alerts request that failed (under storm load api.weather.gov times out
   at six seconds), whose paint rewrote the latch as empty, and a cold open the next morning, when readCache
   would not vouch for yesterday's forecast and the latch went with it. Both times the next update was a CON
   with the index stepped down to Moderate, the step-down the latch is there for */
test("the storm card's latch survives a failed alerts fetch and a cold open the next morning", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const code = html.slice(html.indexOf("let REFRESH_ID=0;"), html.indexOf("\nconst SWAP=")).replace("const STORM_WAIT=3000;", "const STORM_WAIT=80;");
  const { corpus } = await import(new URL("tools/storm-corpus.mjs", root));
  const { alertsFrom, wssiAnswer } = await STORM_FIX();
  const seq = corpus().filter((e) => e.place === "farm" && e.season === "2024-25" && /KRLX\.WS\.W\.0002\./.test(e.product.productText));
  const seg = (iso) => { const e = seq.find((x) => x.issued === iso); assert.ok(e, iso); return alertsFrom(e.product, e.zone); };
  let level = null;
  const { S } = await stormSandbox("2025-01-05T10:40:00Z", async (url) => { if (/mapservices\.weather\.noaa\.gov/.test(url)) return wssiAnswer(level, "2025-01-05T06:00:00Z"); throw new Error("offline"); });
  const L = S.LOCS.sp, store = {};
  const run = async (iso, { point, last = null, cache = null, wssi }) => {
    const T = Date.parse(iso);
    level = wssi;
    class Clock extends Date { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } }
    const forecast = { current: { time: "2025-01-05T05:00", temperature_2m: 23 }, daily: {}, hourly: Object.fromEntries(["time", "temperature_2m", "apparent_temperature", "precipitation_probability", "weather_code", "wind_speed_10m", "wind_gusts_10m", "uv_index"].map((k) => [k, [k === "time" ? "2025-01-05T05:00" : 1]])) };
    const paints = [], node = () => ({ textContent: "", classList: { add() {}, remove() {}, contains: () => false }, setAttribute() {} });
    let lane = null;
    const ctx = vm.createContext({ Date: Clock, setTimeout, LOC: L, document: { getElementById: node }, navigator: { onLine: true },
      fetchJSON: (url) => url.includes("open-meteo.com") ? Promise.resolve(forecast) : url.includes("alerts/active?point") ? (point === "fail" ? Promise.reject(new Error("503")) : Promise.resolve({ features: point })) : Promise.reject(new Error("none")),
      alertRow: S.alertRow, alertLive: S.alertLive, isTropical: () => false, stormLive: (a, now) => !(Date.parse(a.ends || a.expires || "") <= now), stormWaits: S.stormWaits, STORM_STALE: 6 * 36e5,
      stormLane: (Lx, alertsP) => (lane = S.stormLane(Lx, alertsP)),
      /* render, as far as the latch goes: the model, and the latch written back only from a paint with a
         point list (the source holds render() to that, in "the storm card reads in its own lane") */
      render: (d) => { const m = S.stormRead(L, d.alerts, d.beach, d.storms, T, { wssi: d.wssi, held: d.held, seen: d.seen }); if (Array.isArray(d.alerts) && !d.seen?.carried) d.held = m.held; paints.push({ d, m }); },
      writeCache: (id, d) => { store["mbwx-" + id] = JSON.stringify({ savedAt: T, data: d }); }, cacheKey: (id) => "mbwx-" + id,
      localStorage: { getItem: (k) => store[k] ?? null }, readCache: () => cache, paintLoadingState: () => {}, PAINT: Promise.resolve(), LAST: last });
    vm.runInContext(code + "\n" + html.slice(html.indexOf("function activeAlerts("), html.indexOf("/* A warning that keeps the family in.")), ctx);
    await ctx.refresh();
    assert.equal(paints.length, 1, iso);
    /* and the lane landing after the paint, the way stormRun takes it in: the index's new answer (none at
       all with no point list), the latch from a paint with a list, and the cache written again */
    const got = await lane, d = paints[0].d;
    if (got.wssi !== undefined) d.wssi = got.wssi;
    const late = S.stormRead(L, d.alerts, d.beach, d.storms, T, { wssi: d.wssi, held: d.held, seen: d.seen });
    if (Array.isArray(d.alerts) && !d.seen?.carried) d.held = late.held;
    store["mbwx-sp"] = JSON.stringify({ savedAt: T, data: d });
    return { ...paints[0], late };
  };
  // 5:40 am: the warning (issued 5:24 for noon), the index Major on its second day: the card, and the latch
  const p1 = await run("2025-01-05T10:40:00Z", { point: seg("2025-01-05T10:24:00Z"), wssi: ["MODERATE", "MAJOR", "WINTER WEATHER AREA"] });
  deq([p1.late.tier, ...p1.late.rules], ["storm", "F3"]);
  deq(p1.d.held, { "KRLX.WS.W.2": { rule: "F3", end: "2025-01-07T11:00:00Z" } });
  // an hour on, the point's alerts time out: the paint is on the last good list, carried at its own fetch
  // time and marked so, and the latch and the last index are carried on unchanged, never rewritten as empty
  const here = (p, savedAt) => ({ data: p.d, savedAt }), last = (p, savedAt) => ({ d: p.d, savedAt, loc: "sp" });
  const p2 = await run("2025-01-05T11:40:00Z", { point: "fail", cache: here(p1, Date.parse("2025-01-05T10:40:00Z")), last: last(p1, Date.parse("2025-01-05T10:40:00Z")), wssi: "MODERATE" });
  deq([p2.d.alerts.map((a) => a.id), p2.d.seen.carried, p2.d.seen.point], [p1.d.alerts.map((a) => a.id), true, p1.d.seen.point], "the last good list, carried");
  deq(p2.d.held, p1.d.held, "the latch is carried through the failed request");
  deq(p2.d.wssi, p1.d.wssi, "and so is the last index: with no list nobody asked for a new one");
  deq([p2.m.tier, ...p2.m.rules, p2.late.tier], ["storm", "F3", "storm"], "the card stays up through the failed request, on the last good list");
  assert.match(p2.m.why, /^F3: held while the same warning stands/, "held, and never raised anew from a carried list");
  // the next good refresh: the same warning, CON, and the index stepped down to Moderate. The card stays up
  const p3 = await run("2025-01-05T16:30:00Z", { point: seg("2025-01-05T16:16:00Z"), cache: here(p2, Date.parse("2025-01-05T11:40:00Z")), last: last(p2, Date.parse("2025-01-05T11:40:00Z")), wssi: "MODERATE" });
  deq([p3.m.tier, ...p3.m.rules], ["storm", "F3"], "painted on the last index until the new one lands");
  deq([p3.d.wssi.impact, p3.late.tier, ...p3.late.rules], ["MODERATE", "storm", "F3"], "Major, a failed fetch, then CON at Moderate: the card stays up");
  assert.match(p3.late.why, /^F3: held while the same warning stands/);
  // and the next morning, a cold open: the cache is yesterday's, so readCache will not vouch for it and the
  // page has no reading of its own, but the latch is read out of the entry whatever its age
  const cold = { point: seg("2025-01-06T06:12:00Z"), wssi: ["MODERATE", "MODERATE", null] };
  const p4 = await run("2025-01-06T12:00:00Z", cold);
  deq(p4.d.held, p3.d.held, "the latch from the cache entry, a day old");
  deq([p4.m.tier, ...p4.m.rules, p4.late.tier, ...p4.late.rules], ["storm", "F3", "storm", "F3"], "a cold open the next morning with a CON update and a Moderate index keeps the card");
  assert.match(p4.late.why, /^F3: held while the same warning stands/);
  // without the entry, the card would have come down at the height of the storm
  for (const k in store) delete store[k];
  assert.equal((await run("2025-01-06T12:00:00Z", cold)).m.tier, null, "and with no entry at all, nothing to hold");
});

test("WPC's index raises only the warnings it was asked for, and a latch holds only this season's", async () => {
  const { wssiAnswer } = await STORM_FIX();
  const { S } = await stormSandbox("2025-01-05T15:00:00Z");
  const farm = S.LOCS.sp;
  const wsw = (vtec, ends, extra = {}) => ({ id: "w-" + vtec, event: "Winter Storm Warning", vtec: [vtec], ends, expires: ends, sent: "2025-01-05T10:24:00Z", onset: null,
    desc: "* WHAT...Heavy snow expected.\n\n* WHEN...Through tonight.", inst: "", par: {}, ...extra });
  // a reading as the lane keeps it: when it was asked for (`at`), and the warnings it was asked for, each with its hours
  const reading = (levels, list, at, cycle = "2025-01-05T06:00:00Z") => ({ ...S.wssiRead(wssiAnswer(levels, cycle)), at, for: S.wsFor(list) });
  const read = (list, wssi, now, seen, held = null) => S.stormRead(farm, list, null, null, now, { wssi, held, seen });
  // the farm's warning tonight only, then the office extends it into WPC's Day 3 (07Z Tuesday to 06Z Wednesday)
  const A = wsw("/O.NEW.KRLX.WS.W.0002.250105T1700Z-250106T0500Z/", "2025-01-06T05:00:00Z");
  const A2 = wsw("/O.EXT.KRLX.WS.W.0002.250105T1700Z-250108T1100Z/", "2025-01-08T11:00:00Z", { sent: "2025-01-05T20:50:00Z" });
  deq([...S.wsFor([A2])], ["KRLX.WS.W.2 2025-01-05T17:00:00.000Z 2025-01-08T11:00:00.000Z"], "an event with its hours");
  const t1 = Date.parse("2025-01-05T15:00:00Z"), t2 = Date.parse("2025-01-05T21:00:00Z");
  const R1 = reading(["MODERATE", "MODERATE", "MAJOR"], [A], t1);
  const p1 = read([A], R1, t1, { point: t1 });
  deq([p1.tier, { ...p1.held }], [null, {}], "a Day-3 Major beside tonight's warning: no card");
  // the refresh paints the extended warning before the new cycle lands: the Major the last refresh's reading put
  // on Day 3 raised it and latched it, and the new cycle's Moderate could not take it down
  const p2 = read([A2], R1, t2, { point: t2 });
  deq([p2.tier, { ...p2.held }], [null, {}], "a reading asked for the warning's old hours raises nothing for its new ones, and latches nothing");
  deq([...read([A2], R1, t2, null).rules], ["F3"], "(handed over as this list's own, the same reading would have)");
  const R2 = reading(["MODERATE", "MODERATE", "MODERATE"], [A2], t2 + 1500);
  assert.equal(read([A2], R2, t2 + 1500, { point: t2 }).tier, null, "and the new cycle, Moderate on every day: no card");
  // the lane's own reading raises it, by when it was asked (once this list was in) or by what it was asked for
  deq([...read([A2], reading(["MODERATE", "MODERATE", "MAJOR"], [A2], t2 + 1500), t2 + 1500, { point: t2 }).rules], ["F3"], "the lane's own Major raises it when it lands");
  deq([...read([A2], reading(["MODERATE", "MODERATE", "MAJOR"], [], t2), t2, { point: t2 }).rules], ["F3"], "asked once this list was in (seen.wssi at or after seen.point)");
  deq([...read([A2], { ...reading(["MODERATE", "MODERATE", "MAJOR"], [A2], t2 - 9e5) }, t2, { point: t2 }).rules], ["F3"], "asked for this same warning with these same hours");
  deq([...read([A2], reading(["MODERATE", "MODERATE", "MAJOR"], [A2], t2 - 9e5), t2, { point: t2, wssi: t2 }).rules], ["F3"], "seen.wssi, when given, is the reading's time");
  assert.equal(read([A2], { ...R1, at: undefined, for: undefined }, t2, { point: t2 }).tier, null, "a reading that cannot say what it was asked for raises nothing");
  // an older reading only keeps a warning already held
  const heldA = { "KRLX.WS.W.2": { rule: "F3", end: "2025-01-06T05:00:00Z" } };
  const kept = read([A2], R1, t2, { point: t2 }, heldA);
  deq([kept.tier, ...kept.rules, { ...kept.held }], ["storm", "F3", { "KRLX.WS.W.2": { rule: "F3", end: "2025-01-08T11:00:00Z" } }], "a held warning, extended, stays up on the old reading");
  assert.match(kept.why, /^F3: held while the same warning stands/);
  // and a list carried through a failed request raises nothing new, even on the lane's own reading, and hands
  // the latch on as it was
  const carried = read([A2], reading(["MODERATE", "MODERATE", "MAJOR"], [A2], t2), t2, { point: t2 - 36e5, carried: true });
  deq([carried.tier, { ...carried.held }], [null, {}], "a carried list raises nothing anew");
  const carriedHeld = read([A2], R2, t2, { point: t2 - 36e5, carried: true }, heldA);
  deq([carriedHeld.tier, ...carriedHeld.rules, { ...carriedHeld.held }], ["storm", "F3", heldA], "and keeps what is held, handed on as it was");
  // yesterday's reading, Day 2 Major, beside a new warning this morning (WS.W.3, on what was yesterday's Day 2):
  // a cold open painted on it raised and latched WS.W.3, and today's Moderate never took it down
  const Y = reading(["MODERATE", "MAJOR", null], [A], Date.parse("2025-01-05T10:40:00Z"));
  const W3 = wsw("/O.NEW.KRLX.WS.W.0003.250106T1700Z-250107T1100Z/", "2025-01-07T11:00:00Z", { sent: "2025-01-06T11:00:00Z" });
  const t3 = Date.parse("2025-01-06T12:00:00Z");
  const cold = read([W3], Y, t3, { point: t3 });
  deq([cold.tier, { ...cold.held }], [null, {}], "yesterday's Day-2 Major beside today's new warning: no card, nothing latched");
  deq([...read([W3], Y, t3, null).rules], ["F3"], "(as this list's own it would have)");
  assert.equal(read([W3], reading(["MODERATE", "MODERATE", null], [W3], t3 + 4000, "2025-01-06T06:00:00Z"), t3 + 4000, { point: t3 }).tier, null, "and today's Moderate: none");

  // VTEC event numbers restart every January. A latch from January 2025 beside RLX's next WS.W.0002 a year on,
  // at Moderate: last winter's, more than 30 days past its end, and dropped
  const last = { "KRLX.WS.W.2": { rule: "F3", end: "2025-01-07T11:00:00Z" } };
  const W26 = wsw("/O.NEW.KRLX.WS.W.0002.260105T1700Z-260107T1100Z/", "2026-01-07T11:00:00Z", { sent: "2026-01-05T10:24:00Z" });
  const n26 = Date.parse("2026-01-05T10:40:00Z"), R26 = reading(["MODERATE", "MODERATE", "MINOR"], [W26], n26, "2026-01-05T06:00:00Z");
  const next = read([W26], R26, n26, { point: n26 }, last);
  deq([next.tier, { ...next.held }], [null, {}], "last winter's latch: no card, and the entry is dropped");
  const nextCon = read([{ ...W26, vtec: ["/O.CON.KRLX.WS.W.0002.000000T0000Z-260107T1100Z/"] }], R26, Date.parse("2026-01-05T20:00:00Z"), { point: Date.parse("2026-01-05T20:00:00Z") }, last);
  deq([nextCon.tier, { ...nextCon.held }], [null, {}], "and through its updates");
  deq([...read([W26], { ...R26, days: R26.days.map((d) => ({ ...d, impact: "MAJOR" })) }, n26, { point: n26 }, last).rules], ["F3"], "next winter's own Major is its own card");
  // within 30 days, the year: a NEW in another year than the held one's end is a number used again, and an update
  // carries the same warning across the New Year
  const dec = { "KRLX.WS.W.2": { rule: "F3", end: "2025-12-31T23:00:00Z" } };
  const jan1 = Date.parse("2026-01-01T03:00:00Z");
  const ext = wsw("/O.EXT.KRLX.WS.W.0002.000000T0000Z-260101T1200Z/", "2026-01-01T12:00:00Z", { sent: "2026-01-01T02:50:00Z" });
  deq([...read([ext], null, jan1, { point: jan1 }, dec).rules], ["F3"], "the same warning extended across the New Year keeps its latch");
  const reused = wsw("/O.NEW.KRLX.WS.W.0002.260110T1700Z-260111T1100Z/", "2026-01-11T11:00:00Z", { sent: "2026-01-10T10:00:00Z" });
  const jan10 = read([reused], null, Date.parse("2026-01-10T11:00:00Z"), { point: Date.parse("2026-01-10T11:00:00Z") }, dec);
  deq([jan10.tier, { ...jan10.held }], [null, {}], "a NEW with a number used again, ten days into the new year, is another warning");
  deq([...read([{ ...reused, vtec: ["/O.NEW.KRLX.WS.W.0002.251231T1700Z-251231T2300Z/"], ends: "2025-12-31T23:00:00Z", sent: "2025-12-31T16:00:00Z" }], null, Date.parse("2025-12-31T18:00:00Z"), { point: Date.parse("2025-12-31T18:00:00Z") }, dec).rules], ["F3"],
    "(and the NEW that raised it, in its own year, is its own)");
  // a bare "F3" kept before the end was has no age to judge, and is read as it always was
  deq([...read([ext], null, jan1, { point: jan1 }, { "KRLX.WS.W.2": "F3" }).rules], ["F3"]);
});

/* The page's own refresh() and stormRun, with the storm card's block, in one sandbox on a clock the test moves:
   the forecast, the point's alerts, the beach's, the advisories and WPC's index are the test's (a delay on the
   index makes the lane slower than STORM_WAIT, which is 80 ms here), render is the page's own as far as the card
   goes (its model and its latch, lifted from render, and the strip's alerts and the storm's headline), and the
   cache is a store that a cold open, a new sandbox, reads again. A cold open paints the cache first when
   readCache vouches for it, the way the page boots */
async function pageRig(store = {}, loc = "sp") {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const { stormProducts } = await STORM_FIX();
  let T = 0;
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } }
  const net = { point: [], beach: [], wssi: null, wssiDelay: 0, products: null, asked: 0, zone: [], zoneDelay: 0 };
  const wall = () => new Date(T).toLocaleString("sv-SE", { timeZone: "America/New_York" }).replace(" ", "T").slice(0, 16);
  const hourly = () => Object.fromEntries(["time", "temperature_2m", "apparent_temperature", "precipitation_probability", "weather_code", "wind_speed_10m", "wind_gusts_10m", "uv_index"].map((k) => [k, [k === "time" ? wall() : 1]]));
  const fetchJSON = (url) => {
    if (/open-meteo\.com/.test(url)) { const j = { current: { time: wall(), temperature_2m: 23 }, daily: {}, hourly: hourly() };
      return net.forecastDelay ? new Promise((r) => setTimeout(() => r(j), net.forecastDelay)) : Promise.resolve(j); }
    if (/alerts\/active\?point/.test(url)) return net.point === "fail" ? Promise.reject(new Error("503")) : Promise.resolve({ features: structuredClone(net.point) });
    /* Beaufort's coastal waters (AMZ362), slow or failing on their own */
    if (/alerts\/active\?zone=AMZ/.test(url)) return new Promise((res, rej) => setTimeout(() => net.zone === "fail" ? rej(new Error("503")) : res({ features: structuredClone(net.zone) }), net.zoneDelay));
    if (/alerts\/active\?zone/.test(url)) return Promise.resolve({ features: structuredClone(net.beach) });
    if (/mapservices\.weather\.noaa\.gov/.test(url)) { net.asked++; return new Promise((r) => setTimeout(() => r(structuredClone(net.wssi)), net.wssiDelay)); }
    if (/api\.weather\.gov\/products/.test(url) && net.products) { const j = stormProducts(net.products, url); return j ? Promise.resolve(j) : Promise.reject(new Error("404")); }
    return Promise.reject(new Error("404"));
  };
  const node = () => ({ textContent: "", classList: { add() {}, remove() {}, contains: () => false }, setAttribute() {} });
  const ctx = vm.createContext({ Date: Clock, setTimeout, clearTimeout, location: { search: "" }, fetchJSON, navigator: { onLine: true },
    document: { getElementById: node, hidden: false }, paintLoadingState: () => {},
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
  const paint = [lift(/  const sm=stormOf\(LOC,d,Date\.now\(\),savedAt\),stormDay=sm\.tier==="storm";/),
    lift(/  if\(Array\.isArray\(d\.alerts\)&&!d\.seen\?\.carried\)\{STORM_HELD\[LOC\.id\]=sm\.held;d\.held=sm\.held\}/)].join("\n");
  vm.runInContext([lift(/const LOCS=\{[\s\S]*?\n\};/), lift(/const toRad=x=>[^\n]*/), lift(/const distMi=[\s\S]*?asin\(Math\.sqrt\(a\)\)\};/), lift(/const dirTxt=[^\n]*/), ...stormHelpers(html, lift),
    html.slice(html.indexOf("function activeAlerts("), html.indexOf("/* A warning that keeps the family in.")),
    html.slice(html.indexOf("/* ── the storm card"), html.indexOf("/* ── tide ─")),
    lift(/const locToday=[^\n]*/), html.slice(html.indexOf("const cacheKey=id=>"), html.indexOf("async function fetchJSON(")),
    html.slice(html.indexOf("let REFRESH_ID=0;"), html.indexOf("\nconst SWAP=")).replace("const STORM_WAIT=3000;", "const STORM_WAIT=80;"),
    `var LOC=LOCS.${loc},LAST=null,PAINT=Promise.resolve(),__paints=[],__lane=null;
     const __stormLane=stormLane;stormLane=(L,a)=>(__lane=__stormLane(L,a));
     function render(d,live,savedAt=0){
       savedAt=savedAt||(LAST?.d===d?LAST.savedAt:Date.now());
       LAST={d,live,savedAt,loc:LOC.id};
     ${paint}
       const w=new Date(new Date(Date.now()).toLocaleString("sv-SE",{timeZone:LOC.tz}).replace(" ","T")),shift=w-Date.now();
       __paints.push(JSON.parse(JSON.stringify({live,tier:sm.tier,rules:sm.rules,why:sm.why,held:sm.held,carried:!!d.seen?.carried,
         alerts:Array.isArray(d.alerts)?d.alerts.map(a=>a.event):null,strip:(stormStrip(activeAlerts(d.alerts),sm)||[]).map(a=>a.event),
         headline:stormDay?stormStory(sm,w,shift).html:null,zone:d.zone===undefined?undefined:(d.zone||[]).map(a=>a.event)})));
     }`].join("\n"), ctx);
  const settle = async () => { await vm.runInContext("__lane", ctx)?.then(() => {}, () => {}); for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 5)); };
  return {
    net, store,
    /* every paint so far, the ones a lane landing after the refresh made too */
    paints: () => JSON.parse(JSON.stringify(ctx.__paints)),
    /* the page opened at `iso`: the cached paint when readCache vouches for the entry, then the refresh */
    async open(iso, n = {}) {
      T = Date.parse(iso);
      vm.runInContext("{const c=readCache(LOC.id);if(c)render(c.data,false,c.savedAt)}", ctx);
      return this.refresh(iso, n, true);
    },
    async refresh(iso, n = {}, opening = false) {
      T = Date.parse(iso); Object.assign(net, n);
      const from = opening ? 0 : ctx.__paints.length;
      await ctx.refresh();
      await settle();
      const entry = JSON.parse(store["mbwx-" + loc] || "null");
      return { paints: ctx.__paints.slice(from), held: JSON.parse(JSON.stringify(vm.runInContext(`STORM_HELD.${loc}??null`, ctx))), entry };
    },
  };
}

test("on the page's own refresh, the index raises only its own list's warnings, and a failed alerts request keeps the card", async () => {
  const { STORMS, wssiAnswer } = await STORM_FIX();
  const SI = STORMS["snow-ice-farm"], f0 = SI.point[0];
  const feature = (vtec, ends, extra = {}) => ({ ...f0, properties: { ...f0.properties, ...extra, ends, expires: ends, parameters: { ...f0.properties.parameters, VTEC: [vtec] } } });
  const cards = (r) => r.paints.map((p) => p.tier);
  // RLX's warning tonight only, with WPC's Day 3 Major (Tuesday), then extended into Day 3 with the new cycle
  // at Moderate on every day
  const A = feature("/O.NEW.KRLX.WS.W.0002.250105T1700Z-250106T0500Z/", "2025-01-06T00:00:00-05:00", { id: "urn:rig:A" });
  const A2 = feature("/O.EXT.KRLX.WS.W.0002.250105T1700Z-250108T1100Z/", "2025-01-08T06:00:00-05:00", { id: "urn:rig:A2", messageType: "Update", sent: "2025-01-05T15:50:00-05:00" });
  const W1 = wssiAnswer(["MODERATE", "MODERATE", "MAJOR"], "2025-01-05T06:00:00Z"), W2 = wssiAnswer(["MODERATE", "MODERATE", "MODERATE"], "2025-01-05T18:00:00Z");
  for (const delay of [0, 1500]) {
    // an in-app refresh never waits for the lane: its first paint is on the last refresh's reading
    const store = {}, page = await pageRig(store);
    const r1 = await page.open("2025-01-05T15:00:00Z", { point: [A], wssi: W1 });
    deq(cards(r1), [null], "tonight's warning beside a Day-3 Major: no card");
    const r2 = await page.refresh("2025-01-05T21:00:00Z", { point: [A2], wssi: W2, wssiDelay: delay });
    assert.ok(r2.paints.length >= 1);
    deq([...new Set(cards(r2))], [null], `extended into Day 3, the new cycle Moderate and ${delay} ms behind: no card in any paint`);
    deq([r2.held, r2.entry.data.held], [{}, {}], "and nothing latched");
    deq(r2.entry.data.wssi.days.map((d) => d.impact), ["MODERATE", "MODERATE", "MODERATE"], "the new cycle is the reading once it lands");
  }
  {
    // a cold open inside six hours, with the lane slower than STORM_WAIT: the cache's paint, then the live one on
    // the cache's reading, then the new cycle
    const store = {};
    await (await pageRig(store)).open("2025-01-05T15:00:00Z", { point: [A], wssi: W1 });
    const cold = await (await pageRig(store)).open("2025-01-05T20:30:00Z", { point: [A2], wssi: W2, wssiDelay: 300 });
    deq(cold.paints.slice(0, 2).map((p) => [p.live, p.alerts.length]), [[false, 1], [true, 1]], "the cached paint and the live one");
    deq([...new Set(cards(cold))], [null], "a cold open with the lane slower than STORM_WAIT: no card in any paint");
    deq(cold.held, {});
  }
  {
    // the same from the start: a reading asked for tonight's warning, and the cold open the next day (the cache
    // too old to vouch for, the latch and the index read out of the entry whatever its age) with the extended
    // warning and the lane slower than STORM_WAIT
    const store = {};
    await (await pageRig(store)).open("2025-01-05T15:00:00Z", { point: [A], wssi: W1 });
    const cold = await (await pageRig(store)).open("2025-01-06T08:00:00Z", { point: [A2], wssi: W2, wssiDelay: 300 });
    deq([cold.paints[0].live, ...new Set(cards(cold))], [true, null], "no cached paint, and no card on the live one or after the index lands");
    deq(cold.held, {});
  }
  {
    // yesterday's reading, Day 2 Major, beside a new warning this morning on what was its Day 2, and today's index
    // at Moderate four seconds behind
    const store = {};
    await (await pageRig(store)).open("2025-01-05T15:00:00Z", { point: [A], wssi: wssiAnswer(["MODERATE", "MAJOR", null], "2025-01-05T06:00:00Z") });
    deq(JSON.parse(store["mbwx-sp"]).data.held, {}, "tonight's warning is not Day 2's");
    const W3 = feature("/O.NEW.KRLX.WS.W.0003.250106T1700Z-250107T1100Z/", "2025-01-07T06:00:00-05:00", { id: "urn:rig:W3", sent: "2025-01-06T06:00:00-05:00", onset: "2025-01-06T12:00:00-05:00" });
    const cold = await (await pageRig(store)).open("2025-01-06T12:00:00Z", { point: [W3], wssi: wssiAnswer(["MODERATE", "MODERATE", null], "2025-01-06T06:00:00Z"), wssiDelay: 300 });
    deq([...new Set(cards(cold))], [null], "yesterday's Day-2 Major beside today's new WS.W.3, today's Moderate behind it: no card");
    deq(cold.held, {}, "nothing latched");
    // and the lane's own Major, as slow, raises it when it lands
    const store2 = {};
    await (await pageRig(store2)).open("2025-01-05T15:00:00Z", { point: [A], wssi: wssiAnswer(["MODERATE", "MAJOR", null], "2025-01-05T06:00:00Z") });
    const raised = await (await pageRig(store2)).open("2025-01-06T12:00:00Z", { point: [W3], wssi: wssiAnswer(["MAJOR", "MODERATE", null], "2025-01-06T06:00:00Z"), wssiDelay: 300 });
    deq(cards(raised), [null, "storm"], "the live paint without it, then the card when the lane's own reading lands");
    deq(Object.keys(raised.held), ["KRLX.WS.W.3"]);
  }
  {
    // A failed point request keeps the card, the strip and the storm's headline, on the last good list. The farm:
    // RLX's January 5 2025 warning at Major, then the point's request times out an hour on
    const store = {}, page = await pageRig(store);
    const wind = feature("/O.NEW.KRLX.WI.Y.0004.250105T1100Z-250105T1700Z/", "2025-01-05T12:00:00-05:00", { id: "urn:rig:wind", event: "Wind Advisory", severity: "Moderate" });
    const r1 = await page.open("2025-01-05T10:40:00Z", { point: [...SI.point, wind], wssi: SI.wssi });
    const up = r1.paints.at(-1);
    deq([up.tier, up.strip, up.headline], ["storm", ["Winter Storm Warning", "Wind Advisory"], "<em>Winter storm</em> from noon until 6 a.m. Tuesday."]);
    const r2 = await page.refresh("2025-01-05T11:40:00Z", { point: "fail" });
    deq(r2.paints.map((p) => [p.tier, p.carried, p.strip, p.headline]), [["storm", true, ["Winter Storm Warning", "Wind Advisory"], up.headline]],
      "the farm: the card, the strip and the headline through the failed request");
    deq([r2.entry.data.seen.carried, r2.entry.data.seen.point, r2.entry.data.alerts.length], [true, r1.entry.data.seen.point, 2], "the last good list, carried at its own fetch time, and cached so");
    deq([r2.held, r2.entry.data.held], [up.held, up.held], "and the latch as it was");
    assert.equal(page.net.asked, 1, "with no list, nobody asks the index");
    // the outage runs past the advisory's end: it comes down, and the warning stays
    const r3 = await page.refresh("2025-01-05T17:20:00Z", { point: "fail" });
    deq(r3.paints.map((p) => [p.tier, p.strip]), [["storm", ["Winter Storm Warning"]]], "an alert whose end passes during the outage comes down");
    // a reopen inside six hours paints the carried list from the cache, and it is still carried
    const reopen = await (await pageRig(store)).open("2025-01-05T17:30:00Z", { point: "fail" });
    deq(reopen.paints.map((p) => [p.live, p.tier, p.carried]), [[false, "storm", true], [true, "storm", true]], "a reopen with the point still failing keeps the card");
    // and past the warning's own end, still failing, everything comes down
    const ended = await page.refresh("2025-01-07T11:30:00Z", { point: "fail" });
    deq(ended.paints.map((p) => [p.tier, p.strip, p.headline]), [[null, [], null]], "past the warning's end, nothing");
    // the next good list is the latch's word again
    const good = await page.refresh("2025-01-07T12:00:00Z", { point: [], wssi: null });
    deq([good.paints.at(-1).carried, good.held], [false, {}]);
  }
  {
    // the coast: Florence a day from landfall, the point's request failing an hour on with the beach answering.
    // A Coastal Flood Advisory that ends during the outage comes down with it
    const FL = STORMS["florence-coast"], store = {}, page = await pageRig(store, "mb");
    const cfy = { ...FL.point[0], properties: { ...FL.point[0].properties, id: "urn:rig:cfy", event: "Coastal Flood Advisory", severity: "Minor", ends: "2018-09-13T12:30:00-04:00", expires: "2018-09-13T12:30:00-04:00",
      parameters: { ...FL.point[0].properties.parameters, VTEC: ["/O.NEW.KILM.CF.Y.0031.180913T1500Z-180913T1630Z/"] } } };
    const r1 = await page.open("2018-09-13T15:45:00Z", { point: [...FL.point, cfy], beach: FL.beach, products: FL });
    const up = r1.paints.at(-1);
    deq([up.tier, up.headline], ["storm", "<em>Hurricane Florence</em> is closest Friday morning."]);
    assert.ok(up.strip.includes("Coastal Flood Advisory") && up.strip.includes("Hurricane Warning"), JSON.stringify(up.strip));
    const r2 = await page.refresh("2018-09-13T16:15:00Z", { point: "fail" });
    deq(r2.paints.map((p) => [p.tier, p.carried, p.headline, p.strip]), [["storm", true, up.headline, up.strip]], "the coast: the card, the strip and the headline through the failed request");
    const r3 = await page.refresh("2018-09-13T16:45:00Z", { point: "fail" });
    deq(r3.paints.map((p) => [p.tier, p.headline, p.strip.includes("Coastal Flood Advisory"), p.strip.includes("Hurricane Warning")]), [["storm", up.headline, false, true]],
      "the advisory's end passing during the outage takes it down, and the card stays");
  }
});

test("Beaufort is the third place: its readings, its scene in layers, its birds in the oak, its Halloween", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  // Jen's family on Coosaw Club Dr, Lady's Island, in the rotation after the coast and the farm
  assert.match(html, /bft:\{id:"bft",addrFull:"Coosaw Club Dr · Beaufort",addrShort:"Beaufort",\n      lat:32\.4938,lon:-80\.6151,scene:"lowcountry",kind:"coast",/);
  assert.match(html, /const LOC_ORDER=\["mb","sp","bft"\];/);
  // the loading shell knows it too, so a phone left on Beaufort opens on Beaufort
  assert.match(html, /bft:\{full:"Coosaw Club Dr · Beaufort",short:"Beaufort",lat:32\.4938,lon:-80\.6151,scene:"lowcountry",tide:true,fish:false,year:"The year · Beaufort",airport:"Beaufort MCAS",water:"Beaufort River"/);
  assert.match(html, /try\{var saved=localStorage\.getItem\("mbwx-loc"\);if\(PLACES\[saved\]\)id=saved\}catch\(e\)\{\}/);
  // its readings: NOAA's Beaufort station (predictions only, no gauge or thermometer), the Fripp Inlet wave
  // buoy's water temperature and the seas there, one county zone with the beach's surf products kept off
  assert.match(html, /tide:8667999,water:"Beaufort River",/);
  assert.match(html, /marine:\{lat:32\.28,lon:-80\.40\},buoy:"41067-frp2wave-4-nm-southeast-of",/);
  assert.match(html, /quietAlerts:\["Rip Current Statement","High Surf Advisory","Beach Hazards Statement"\],/);
  assert.doesNotMatch(html.slice(html.indexOf("bft:{id:\"bft\""), html.indexOf("const LOC_ORDER")), /beach:"/);
  // its year: NOAA's 1991-2020 normals at Marine Corps Air Station Beaufort
  assert.match(html, /bft:\{place:"Beaufort MCAS",name:"Beaufort",hi:\[60\.3,63\.7,69\.9,77\.0,84\.0,88\.9,91\.8,90\.3,85\.7,78\.1,69\.3,62\.7\],/);
  // the river's level, read off the station's own table: 0 at a low, 1 at a high, null outside it
  const tl = html.match(/function tideLevel\(preds,now=wallNow\(\)\.getTime\(\)\)\{[\s\S]*?\n\}/)[0];
  const ctx = vm.createContext({ clamp: (v, a, b) => Math.min(b, Math.max(a, v)), wallNow: () => new Date(0) });
  vm.runInContext(tl + ";this.tideLevel=tideLevel", ctx);
  const preds = [{ t: "2026-10-15 06:00", v: "1.0", type: "L" }, { t: "2026-10-15 12:12", v: "8.0", type: "H" }, { t: "2026-10-15 18:24", v: "1.4", type: "L" }];
  const at = (s) => new Date(s).getTime();
  assert.equal(ctx.tideLevel(preds, at("2026-10-15T06:00")), 0);
  assert.equal(ctx.tideLevel(preds, at("2026-10-15T12:12")), 1);
  assert.ok(Math.abs(ctx.tideLevel(preds, at("2026-10-15T09:06")) - .5) < .01, "half way up the flood is half full");
  assert.equal(ctx.tideLevel(preds, at("2026-10-15T05:00")), null);
  // the scene: Beaufort alone paints into five stacked layers, so a moving thing repaints only its own
  for (const id of ["sceneSky", "sceneMoss", "sceneNear", "sceneFx"]) assert.match(html, new RegExp(`<svg id="${id}" class="scene-layer"`));
  assert.match(html, /\.scene \.scene-layer\{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;will-change:transform\}/);
  // (the house writes its own sheets, so they are left up under its next paint, and its further sheets are its alone)
  assert.match(html, /if\(LOC\.scene!=="lowcountry"\)for\(const id of LOC\.view==="pond"\?\["sceneMoss"\]:\["sceneSky","sceneMoss","sceneNear","sceneLift","sceneFx"\]\)document\.getElementById\(id\)\.innerHTML="";/);
  assert.match(html, /if\(LOC\.view!=="pond"\)for\(const id of \["sceneFront","sceneWater","sceneRefl","sceneRipple","sceneTop"\]\)/);
  assert.match(html, /mossL\.innerHTML=`<g data-prop="moss">\$\{oakMoss\}<\/g>`;/);
  const lc = html.slice(html.indexOf("function lowcountryScene(c){"), html.indexOf("/* ── smooth path through points"));
  // what turns whole is a box of its own that the compositor turns (October 21 2026: the palmettos' crowns and the
  // boat in the moving sheet were most of Beaufort's graphics work, because WebKit repaints a sheet whole): the
  // boxes are placed as fractions of the frame, their drawings are the frame's own, placed in its width and height,
  // the crowns keep the beats they had as groups, and the water's band is a box too, under them
  // (#sceneFront, between the boxes and #sceneFx, is the house's still front sheet, empty at Beaufort)
  assert.match(html, /<svg id="sceneNear" class="scene-layer"[^>]*><\/svg><div id="sceneLift" class="scene-lift" aria-hidden="true"><\/div><svg id="sceneFront" class="scene-layer"[^>]*><\/svg><svg id="sceneFx"/);
  assert.match(html, /\.scene \.scene-lift\{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;container-type:size;overflow:hidden\}/);
  assert.match(html, /\.scene-lift \.lift>svg\{position:absolute;display:block;overflow:visible\}/);
  assert.match(html, /\.scene \.scene-lift:empty\{display:none\}/);
  assert.match(html, /@keyframes bftRockLift\{from\{transform:rotate\(calc\(var\(--rk,1deg\) \* -1\)\) translateY\(var\(--rty,\.25px\)\)\}/);
  assert.doesNotMatch(html, /\.scene-layer \.bft-boat-rock\[style\]|\.scene-layer :is\(\.bft-palm-crown/);
  // the box kit (liftKit) is shared with the house, and Beaufort takes it whole
  assert.match(lc, /const\{partsOf,boxOf,pct,origin,liftSvg,liftAt,liftIn\}=liftKit\(W,H\);/);
  const liftKitSrc = html.slice(html.indexOf("function liftKit(W,H){"), html.indexOf("/* Porters Neck's light schedule"));
  assert.match(liftKitSrc, /const liftSvg=\(b,inner\)=>`<svg viewBox="0 0 \$\{W\} \$\{H\}" style="[^`]*;left:\$\{\(-b\[0\]\/W\*100\)\.toFixed\(4\)\}cqw;top:\$\{\(-b\[1\]\/H\*100\)\.toFixed\(4\)\}cqh;width:100cqw;height:100cqh">/);
  assert.match(lc, /const crownBeat=beatsOf\(61,6,\.55\),headBeat=beatsOf\(62,3,1\.1\),skirtBeat=beatsOf\(63,3,1\.1\);/);
  assert.match(lc, /const beatOf=\(r,amtK\)=>\{const amt=swayAmt\*amtK\*\(\.8\+r\(\)\*\.5\),md=swayDur\*\(\.7\+r\(\)\*\.55\),dl=\(Date\.now\(\)\/1000\+r\(\)\*9\)%9;/);
  assert.match(lc, /liftL\.innerHTML=liftAt\(waterBox,liftSvg\(waterBox,`\n    \$\{bk\?"":glint\}\$\{waterFx\}\n    \$\{mist\}`\),null,"will-change:transform"\)\+palmCrowns\+boat;/);
  assert.match(lc, /animation:bftRockLift \$\{clamp\(5\.6-chopK\*2\.6,2\.8,5\.6\)\.toFixed\(1\)\}s ease-in-out/);
  assert.doesNotMatch(lc, /fxPalmTop|bft-boat-rock" style/);
  const bharness = await readFile(new URL("tools/beaufort/scene.mjs", root), "utf8");
  assert.match(bharness, /if \(crowns\.length !== 6\) bad\.push/);
  assert.match(bharness, /if \(worst > \.05\) bad\.push\(`a box's drawing lies/);
  // the daylight paper is worked out, never read back with getComputedStyle, which restyled the whole page
  assert.equal(html.match(/const gold=goldenHour\(altDeg,now,dark,root\);/g).length, 2);
  assert.equal(html.match(/lit=gold\?\.paper\|\|PAPER\.lit;/g).length, 2);
  assert.doesNotMatch(html, /getComputedStyle\(rootEl\)|const lit=getComputedStyle\(document\.documentElement\)/);
  // Josh's notes: the steeples behind the bridge, not a tree line; no curls; the white birds in the oak;
  // real sizes and nobody standing on anybody; and no boiled peanut sign
  assert.match(lc, /const bftSky=bftSkyline\(\{W,brX:W\*\.6,yFar,/);
  assert.match(lc, /const PERCH=\[\[0,58\],\[0,67\],\[0,76\],\[5,36\],\[5,47\],\[5,58\],\[5,69\],\[1,-28\],\[1,-41\],\[1,-54\],\[1,-66\]\]\.map\(/);
  assert.doesNotMatch(lc, /peanut|propBftSign/i);
  assert.doesNotMatch(html, /bftOakCurl\(/);
  // the tide is drawn: the flats come out as it falls, at the dock's own water
  assert.match(lc, /const dockX=W\*\.66,deckY=GY-\.5,yTide=deckY\+bftDockWater\(tide\);/);
  // the grass is rooted (Josh, October 16 2026: "at low tide like now, looks like it's floating"). Smooth
  // cordgrass stands on the marsh platform from about mean tide up, so on a spring high the river is up around
  // its stems and the picture is the one that was approved, and on every lower water the bank it stands on is
  // out of the river: none from BFT_GRASS_WET up, four units at dead low, never at an unknown tide's dead low
  const gm = html.match(/const BFT_GRASS_WET=[^\n]*\nconst bftGrassMud=[^\n]*/)[0];
  const gctx = vm.createContext({});
  vm.runInContext(`${html.match(/const bftDockClamp=[^\n]*/)[0]}\n${html.match(/const bftDockTide=[^\n]*/)[0]}\n${gm};this.wet=BFT_GRASS_WET;this.mud=bftGrassMud`, gctx);
  assert.equal(gctx.wet, .94);
  assert.equal(gctx.mud(1), 0, "a spring high: the river up around the stems, no bank out");
  assert.equal(gctx.mud(gctx.wet), 0);
  assert.equal(gctx.mud(0), 4, "dead low: four units of the bank out of the river");
  for (let t = 0; t < .94; t += .02) assert.ok(gctx.mud(t) > gctx.mud(t + .02) - 1e-9, `the bank goes under as the tide rises (${t.toFixed(2)})`);
  assert.ok(gctx.mud(.15) > 3 && gctx.mud(.15) < 3.6, "Josh's morning, near low, has most of the bank out");
  assert.equal(gctx.mud(null), gctx.mud(.5), "an unknown tide is mid water, as the dock's is");
  // the bank is the flats' own mud on the still picture, painted over the flats and under the palmettos'
  // trunks and the land; the grass keeps its draws and stays on the moving layer, where it sways; and every
  // ground the harness measures a tuft's foot against is tagged
  assert.match(lc, /const mudH=bftGrassMud\(tide\);/);
  assert.match(lc, /const grassBank=mudH>0&&flatL&&flatR\?BANKS\.map\(/);
  // each bank's outline is written once: the land and its flat are drawn from BANKS, the points the bank's mud
  // is measured off, so a change to the land's line cannot leave the mud on the old one
  assert.match(lc, /const BANKS=\[\{dir:1,top:\[\[-12,bankY-1\.4\],/);
  assert.match(lc, /const\[flatL,flatR\]=BANKS\.map\(flatOf\);/);
  assert.match(lc, /const\[landL,landR\]=BANKS\.map\(landOf\);/);
  assert.doesNotMatch(lc, /const landL=`|const landR=`|const flatL=|const flatR=/);
  // where the bank is out, the land's top line is only the lip inside the one mud, laid over in the mud's own
  // colour; the waterline glints in seeded broken lengths
  assert.match(lc, /<path d="\$\{b\.lip\}" fill="none" stroke="url\(#lcbank\$\{i\}\)"/);
  assert.match(lc, /const gr=mulberry\(dir>0\?7757:7759\)/);
  assert.match(lc, /tuftRun\(-6,W\*\.22,bankY\+\.5,5,8\);tuftRun\(W\*\.25,lEdge\+2,bankY\+1\.5,8,12\);tuftRun\(rEdge-2,W\*\.79,bankY\+1\.5,8,12\);tuftRun\(W\*\.84,W\+8,bankY,5,8\);/);
  assert.match(lc, /const wr=mulberry\(6611\);/);
  assert.match(lc, /const vr=mulberry\(dir>0\?7741:7753\)/);
  const still = lc.slice(lc.indexOf("  svg.innerHTML=`"), lc.indexOf("  skyL.innerHTML=`")), moving = lc.slice(lc.indexOf("  fx.innerHTML=`"));
  assert.match(still, /\$\{flats\}\n    \$\{grassMud\}\n    \$\{palmTrunks\}\n    <path data-ground="land" d="\$\{landL\}"/);
  assert.match(still, /\$\{grassFoot\}\$\{wrackSvg\}\n    \$\{oakShadow\}<g data-prop="live-oak">\$\{oakBack\}\$\{bftOakLight\("back"\)\}<\/g>/);
  assert.match(still, /<rect data-ground="water" x="0" y="\$\{yFar\}"/);
  assert.match(lc, /<path data-ground="mud" d="\$\{flatL\}"/);
  assert.match(lc, /`<path data-ground="mud" d="\$\{b\.fill\}" fill="url\(#lcbank\$\{i\}\)"\/>`/);
  assert.doesNotMatch(moving, /grassMud|grassFoot|wrackSvg/);
  assert.match(moving, /<g data-grass\$\{bandAt\(i\)\}>/);
  // the harness measures every tuft's foot, at the case's tide and at 0, .15, .5, .8 and 1, at every width
  const bscene = await readFile(new URL("tools/beaufort/scene.mjs", root), "utf8");
  assert.match(bscene, /\/\* the grass at every tide \*\/\n/);
  assert.match(bscene, /: \[0, \.15, \.5, \.8, 1\];\nasync function grassCheck\(page\)/);
  // the ground over a foot runs down to none at the wet line with no step, and a foot past the frame's edge is
  // not measured, because no phone shows it
  assert.match(bscene, /const need = t <= \.5 \? 1\.5 \+ \(\.5 - t\) \* 2 : t < BFT_GRASS_WET \? 1\.5 \* \(BFT_GRASS_WET - t\) \/ \(BFT_GRASS_WET - \.5\) : 0;/);
  assert.match(bscene, /if \(!xs\.length\) \{ off\+\+; continue; \}/);
  for (const n of ["this-morning", "grass-dead-low", "grass-mid-tide", "grass-flood-tide", "grass-spring-high"]) assert.match(bscene, new RegExp(`CASES\\.push\\((?:B\\(\\w+, \\w+, )?C\\("${n}"`));
  assert.match(bscene, /CASES\.push\(B\(true, false, C\("this-morning", "2026-10-16T08:35:00", \.15,/);
  // the jack-o'-lantern under the dock house roof, and the rest of Halloween, on the shared calendar
  assert.match(lc, /const hw=c\.halloween;/);
  assert.match(lc, /carved:c\.carved,seed:3,sheltered:true/);
  assert.match(lc, /c\.batColony\(8,/);
  assert.match(lc, /c\.witchFly\(witch\)/);
  // the red balloon on the rail, down in a storm or a gale, and the trick-or-treater out from under its string;
  // the skeleton at the helm rides the boat's rock
  assert.match(lc, /if\(!storm&&gust<35\)\{const bx=dockX\+BFT_BALLOON_AT\.x,by=deckY\+BFT_BALLOON_AT\.y;/);
  assert.match(lc, /c\.kidAt\(dockX\+80,deckY\)/);
  assert.match(lc, /const bones=c\.halloween\?inkAt\(BFT_BONES_AT\.x,BFT_BONES_AT\.y,BFT_BONES_AT\.s,1,inkRig\(rigBftBones\(/);
  assert.match(html, /@keyframes bftBalloonSway\{/);
  assert.match(html, /\.scene-lift \.bft-bones-wave\[style\]\{animation:bftBonesWave 24s ease-in-out infinite\}/);
  // the Hornet crosses only on a clear day, and never under reduced motion
  assert.match(lc, /const jetUp=!PRM&&sunAltDeg>5&&!wet&&!storm&&!fog&&cloud<70/);

  // the sun behind the oak (Josh, October 16 2026: "when the sun is behind the oak tree, like it is now, that tree
  // should really glow like it would in real life"). bftBacklight is a product of honest parts, never a switch
  const kit = html.slice(html.indexOf("/* ── Storybook ink: the drawing kit"), html.indexOf("/* ── the scene: arc, sun / moon"));
  const bctx = vm.createContext({});
  vm.runInContext(`${html.match(/function mulberry\(a\)\{[\s\S]*?\}\}/)[0]}\n${kit}\nObject.assign(globalThis,{bftBacklight,bftNear,bftDiscOpen,bftDiscPts,bftGlareGaps,bftInMass,bftOakLamps,bftRimMask,bftMossLevel,bftMossGlow,bftOakMossGroups,bftOakMossLayers,bftOakDraw,BFT_OAK_LEAF,BFT_OAK_MASSES,bftOakMass});`, bctx);
  const { bftBacklight: BL } = bctx;
  // this morning at 8:35, on a 390 phone (a frame of 320): the sun 12.5° up, drawn 4.8 left of the trunk and 55.4 up,
  // behind the middle of the crown with only a sliver of it showing, in clear humid air
  const S = [-4.84, -55.36], AM = { alt: 12.5, sun: S, cloud: 12, rh: 88 };
  const am = BL(AM);
  assert.equal(am.k, 1, "the sun behind the crown in a clear sky lights it at full strength");
  assert.ok(am.open > 0 && am.open < .2, `only a sliver of the disc shows through the crown (${am.open})`);
  assert.ok(am.shafts > 0 && am.shafts < .2, "in humid air the beams are a whisper");
  assert.ok(BL({ ...AM, mist: true }).shafts > am.shafts, "mist on the river holds more of them");
  assert.equal(BL({ ...AM, rh: 60 }).shafts, 0, "clear dry air shows no beams");
  assert.equal(am.shadow, 1);
  // the sky lets it through or it does not: half under thin cloud (and no beams), none overcast, in fog, rain or a storm
  assert.ok(Math.abs(BL({ ...AM, cloud: 55 }).k - .5) < .01, "thin cloud halves it");
  assert.equal(BL({ ...AM, cloud: 55 }).shafts, 0);
  for (const o of [{ cloud: 95 }, { fog: true }, { wet: true }, { storm: true }]) assert.equal(BL({ ...AM, ...o }).k, 0, JSON.stringify(o));
  // the sun up: none at night, under half strength on the horizon, no shadow until it is a degree up
  assert.equal(BL({ ...AM, alt: -2 }).k, 0);
  assert.equal(BL({ ...AM, sun: null }).k, 0, "no sun drawn, no light from it");
  const rim = BL({ ...AM, alt: -.5 });
  assert.ok(rim.k > .45 && rim.k < .6 && rim.shadow === 0, "the sun on the horizon lights it weakly and throws no shadow");
  // low enough to stand behind a crown: none from 36°
  assert.equal(BL({ ...AM, alt: 40 }).k, 0);
  // behind the oak on the screen: full while the disc touches the drawing, none once it is a disc and a half clear,
  // so at 10:45 this morning, the sun well over the crown, nothing
  assert.equal(BL({ ...AM, alt: 22, sun: [20, -120] }).k, 0);
  const edge = BL({ ...AM, alt: 22, sun: [14, -100] });
  assert.ok(edge.k > .3 && edge.k < .8 && edge.open === 1, "just over the crown's top it fades, its disc all clear");
  // a drawing hands its own distance from the sun: the palmettos at sunset
  assert.equal(BL({ ...AM, sun: [0, 0], gap: -3 }).k, 1);
  assert.equal(BL({ ...AM, sun: [0, 0], gap: 40 }).k, 0);
  // dew greens the moss from 92%
  assert.equal(am.dew, 0);
  assert.ok(BL({ ...AM, rh: 98 }).dew === 1);
  // forward scattering: full near the sun, none far from it
  assert.deepEqual([0, 26, 58, 90].map((d) => +bctx.bftNear(d, 26, 90).toFixed(2)), [1, 1, .5, 0]);
  // what hides the disc is tested against the leaves as the scallops draw them
  for (const m of bctx.BFT_OAK_LEAF) assert.ok(bctx.bftInMass(m[0], m[1], m), "a mass covers its own middle");
  assert.equal(bctx.bftDiscOpen(200, -150), 1, "a sun far from the oak is all open");
  assert.equal(bctx.bftDiscOpen(-30, -60), 0, "a sun deep in the crown is hidden");
  assert.ok(bctx.bftDiscPts(...S).length > 0, "this morning's sliver is where the glare goes");
  // the glare is a flat ellipse over each gap the disc shows through, none where it is hidden, one round a disc all clear
  assert.ok(bctx.bftGlareGaps(...S).length >= 1);
  assert.equal(bctx.bftGlareGaps(-30, -60).length, 0);
  const open = bctx.bftGlareGaps(200, -150);
  assert.equal(open.length, 1);
  assert.ok(Math.abs(open[0][0] - 200) < .5 && Math.abs(open[0][2] - open[0][3]) < 1 && open[0][2] > 12 && open[0][2] < 18, JSON.stringify(open[0]));
  // a lamp in the dark crown: at most two veil curtains, and only when the sun shows at all
  assert.ok(bctx.bftOakLamps(S, am.open).length >= 1 && bctx.bftOakLamps(S, am.open).length <= 2);
  assert.equal(bctx.bftOakLamps(S, 0).length, 0);
  // the rim is cut from the silhouette, cell by cell round the sun: white where the leaves are, black where they are again moved
  // away from it, so only the edges that face it keep a band
  const rm = bctx.bftRimMask("t", bctx.BFT_OAK_LEAF.map((m, i) => [`m${i}`, [m[0] - m[2], m[1] - m[3], m[0] + m[2], m[1] + m[3]]]), S, [[0, 13, 3], [13, 40, 2]]);
  assert.match(rm.body, /<use href="#m\d+" fill="#fff"\/>/);
  assert.match(rm.body, /<use href="#m\d+" fill="#000" transform="translate\(/);
  assert.match(rm.defs, /<clipPath id="t0_\d+">/);
  // the cells overlap, so no hairline of white shows along the seams where they meet
  assert.match(html, /const SEAM=\.6;\n  rings\.forEach\(\(\[r0,r1,w\],i\)=>\{const da=Math\.min\(\.15,SEAM\/Math\.max\(r0,4\)\);/);
  // the moss's light is in its own sway groups (it rides the sway and adds no animation), near beards most, none far
  const glowL = bctx.bftOakMossLayers("front", 1, "#4F515F", { S, edge: "#FFF", hairC: "#FFF" });
  assert.ok(glowL.some((g) => g.layers.some((l) => /bft-oak-glow/.test(l.open || ""))), "the front moss near the sun carries a halo");
  // the moss that sways repaints every frame in WebKit, where a stroke round every band cost about four frames a second,
  // so its light is fills alone; the still veil keeps its hairline
  assert.ok(glowL.every((g) => g.layers.every((l) => !/bft-oak-glow/.test(l.open || "") || /bft-oak-glow" stroke="none"/.test(l.open))));
  const veilL = bctx.bftOakMossLayers("veil", 1, "#4F515F", { S, k: 1, edge: "#FFF", hairC: "#FFF" });
  assert.ok(veilL.some((g) => g.layers.some((l) => /bft-oak-glow" stroke="#FFF"/.test(l.open || ""))));
  assert.equal(JSON.stringify(bctx.bftOakMossLayers("front", 1, "#4F515F")), JSON.stringify(bctx.bftOakMossLayers("front", 1, "#4F515F", null)), "no sun, the moss as it was");
  const far = bctx.bftOakMossGroups("front", 1).flatMap((e) => e.b).filter((b) => bctx.bftMossLevel("front", b, [500, -300]) > 0);
  assert.equal(far.length, 0, "no beard far from the sun is lit");
  // in the scene: the light is worked out each paint from where the sun is drawn, and only while it lights the oak
  assert.match(lc, /const BL=bftBacklight\(\{alt:sunAltDeg,sun:sunXY\?\[sunXY\[0\]-oakX,sunXY\[1\]-oakY\]:null,cloud,rh:humid,wet,storm,fog,/);
  assert.match(lc, /const bk=BL\.k>\.02\?BL\.k:0,/);
  // with no light from behind the oak is drawn exactly as it was, in one sheet; with it, the wood's hairline goes between the
  // wood and the leaves, the rim between the leaves and the veil, the back leaves' light on the still picture
  assert.match(lc, /const oakFront=\(bk\?oakAt\(oakL\.slice\(front0,front0\+1\)\)\+bftOakLight\("wood"\)\+oakAt\(oakL\.slice\(front0\+1,front0\+2\)\)\+bftOakLight\("crown"\)\+oakAt\(oakL\.slice\(front0\+2\)\)\n\s*:oakAt\(oakL\.slice\(front0\)\)\)/);
  assert.match(lc, /\$\{oakShadow\}<g data-prop="live-oak">\$\{oakBack\}\$\{bftOakLight\("back"\)\}<\/g>`;/);
  assert.match(lc, /<g data-prop="live-oak">\$\{oakFront\}\$\{treeBirds\}<\/g>\$\{blShafts\}\$\{blGlare\}/);
  // the sun's track on the far water goes behind the trunk while the sun is behind the oak
  assert.match(lc, /\$\{soarer\}\$\{jet\}\$\{bk\?glint:""\}`;/);
  assert.match(lc, /\$\{bk\?"":glint\}\$\{waterFx\}/);
  // nothing in it moves, nothing in it is a filter, and every draw is seeded
  const light = lc.slice(lc.indexOf("/* ── the sun behind the oak, the rest of it"), lc.indexOf("  let flies=\"\";"))
    + lc.slice(lc.indexOf("  function bftOakLight(kind){"), lc.indexOf("  /* the front of the oak, with the sun behind it"));
  assert.doesNotMatch(light, /animation|class=|filter=|<filter|Math\.random|feGaussian/);
  // the glare is never laid over a cloud that can drift across the disc
  assert.match(lc, /const gaps=cloudOver\?\[\]:bftGlareGaps\(S\[0\],S\[1\],13,oakGround\)/);
  // the palmettos, which the evening sun sets behind, by the same rule, their light in their own colours and lit edge
  assert.match(lc, /const b=bftBacklight\(\{alt:sunAltDeg,sun:\[0,0\],cloud,rh:humid,wet,storm,fog,gap:Math\.min\(crownGap,trunkGap\),rise:clamp\(\(groundAt\(sunXY\[0\]\)-\(sunXY\[1\]-13\)\)\/26,0,1\)\}\);/);
  // the scene's sun comes up out of the river and goes down into it, a little after and before the real sunrise and
  // sunset: its light is real while it is, so a disc still under the far line lights the oak at half, and none of
  // the disc shows below that line
  assert.match(lc, /ground:oakGround\}\);/);
  assert.ok(Math.abs(BL({ ...AM, ground: () => S[1] - 20 }).k - .5) < .01, "a disc still under the far line lights it at half");
  assert.ok(Math.abs(BL({ ...AM, ground: () => S[1] }).k - .75) < .01, "half of it up, three quarters of the light");
  assert.equal(BL({ ...AM, ground: () => S[1] - 20 }).open, 0, "and nothing of it shows");
  const half = bctx.bftDiscOpen(200, -150, 13, () => -150);
  assert.ok(half > .5 && half < .6, `the half under the far line is hidden (${half})`);
});

/* Beaufort's fishing water. Jen's family is "always looking at the tide for fishing and ... always looking at
   the wind", and the family boater is "always checking the wind and the waves". Josh was shown three ways drawn into the page
   and wrote "go with your pick." (October 16 2026): the fishing day, with the gusts line from the second drawing
   put back, because the row alone read ←22 on a day gusting 34 */
test("Beaufort's fishing water: the grass line, the stage of the water, the wind at the turns, the gusts where they matter, the offshore advisories and what is in season", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const pick = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i >= 0 && j > i, `found ${a} … ${b}`); return html.slice(i, j); };
  const ctx = vm.createContext({});
  vm.runInContext([
    html.match(/const dirLong=d=>[^\n]*\n[^\n]*/)[0],
    html.match(/const mdOf=d=>[^\n]*/)[0], html.match(/const inSeason=\(d,r\)=>[^\n]*/)[0],
    html.match(/const BOAT=\{[^\n]*/)[0],
    pick("function vtecOf(s){", "/* The feed keeps an alert"), html.match(/const DEAD_VTEC=[^\n]*/)[0], html.match(/const vtecLive=[^\n]*/)[0],
    pick("function floodSpans(", "/* The in-season row, under the chart"),
    "Object.assign(globalThis,{floodSpans,floodSay,tideStage,windAt,windTimes,windWords,windSpoken,gustSpans,zoneBars,runsIn,runsTall,runNote,RUNS,MARINE_EVENT,BOAT});",
  ].join("\n"), ctx);
  const at = (s) => new Date(s).getTime();
  const BFT = { grass: 8, bigFlood: 8.8, floodSeason: ["03-15", "11-30"] };
  // NOAA 8667999's own table on October 27 2026, the season's top: 9.35 ft at 10:17 am between lows of 0.13 and 0.29
  const P = [["2026-10-27T04:08", .13, "L"], ["2026-10-27T10:17", 9.35, "H"], ["2026-10-27T16:44", .29, "L"], ["2026-10-27T22:36", 8.10, "H"], ["2026-10-28T04:56", .07, "L"]]
    .map(([t, v, type]) => ({ time: new Date(t), v, type }));
  const interp = (t) => { let i = 0; while (i + 1 < P.length && P[i + 1].time.getTime() <= t) i++;
    const a = P[i], b = P[Math.min(i + 1, P.length - 1)]; if (a === b) return a.v;
    const f = Math.min(1, Math.max(0, (t - a.time.getTime()) / (b.time.getTime() - a.time.getTime()))); return a.v + (b.v - a.v) * (1 - Math.cos(Math.PI * f)) / 2; };

  // ── the grass line and its flood tides
  const spans = ctx.floodSpans(P, interp, at("2026-10-27T06:00"), at("2026-10-28T08:30"), 8);
  assert.equal(spans.length, 2, "both highs top the grass line, and only the highs that do");
  const hrs = (s) => (s.b - s.a) / 36e5;
  // NOAA's six-minute predictions keep a 9.2 ft high over 8 ft about 3.4 hours and an 8.3 about 1.6
  assert.ok(hrs(spans[0]) > 2.9 && hrs(spans[0]) < 3.6, `the big flood stands over the grass ${hrs(spans[0]).toFixed(2)} hours`);
  assert.ok(hrs(spans[1]) > .5 && hrs(spans[1]) < 1.4, `the night's small flood ${hrs(spans[1]).toFixed(2)} hours`);
  assert.ok(spans[0].a < at("2026-10-27T10:17") && spans[0].b > at("2026-10-27T10:17"));
  assert.equal(ctx.floodSpans(P.map((p) => ({ ...p, v: p.type === "H" ? 7.96 : p.v })), interp, at("2026-10-27T06:00"), at("2026-10-28T08:30"), 8).length, 0, "7.96 is under the line");
  // the slider's word for the grass, on the stop's own level and its own date: a flood tide in the guides'
  // season, a big one from 8.8, and out of it only "in the grass", because the water is there all year
  assert.equal(ctx.floodSay(9.35, at("2026-10-27T10:17"), BFT), "big flood tide");
  assert.equal(ctx.floodSay(8.79, at("2026-10-27T09:00"), BFT), "flood tide", "the edge of a big flood is a flood tide");
  assert.equal(ctx.floodSay(8, at("2026-10-27T08:50"), BFT), "flood tide", "8.0 is at the line, and in the grass");
  assert.equal(ctx.floodSay(7.99, at("2026-10-27T08:45"), BFT), "", "under the line nothing");
  assert.equal(ctx.floodSay(8.4, at("2026-11-30T23:30"), BFT), "flood tide", "a night flood on November 30 is in the season");
  assert.equal(ctx.floodSay(8.4, at("2026-12-01T00:30"), BFT), "in the grass", "and the same water past midnight is not: the word is the guides' season's");
  assert.equal(ctx.floodSay(9.2, at("2026-03-14T10:00"), BFT), "in the grass");
  assert.equal(ctx.floodSay(9.2, at("2026-03-15T10:00"), BFT), "big flood tide");
  assert.doesNotMatch(pick("const floodSay=", "function tideStage("), /tailing|biting|best|good fishing/i, "the word is the water's, never a call");

  // ── the stage words from the table's turns, never "slack" (at the bridge the flood runs on past the high)
  assert.equal(ctx.tideStage(at("2026-10-27T10:00"), P), "high water");
  assert.equal(ctx.tideStage(at("2026-10-27T10:47"), P), "high water", "within half an hour after a turn");
  assert.equal(ctx.tideStage(at("2026-10-27T08:40"), P), "last of the incoming");
  assert.equal(ctx.tideStage(at("2026-10-27T12:00"), P), "first of the outgoing");
  assert.equal(ctx.tideStage(at("2026-10-27T13:30"), P), "outgoing");
  assert.equal(ctx.tideStage(at("2026-10-27T15:30"), P), "last of the outgoing");
  assert.equal(ctx.tideStage(at("2026-10-27T17:00"), P), "low water");
  assert.equal(ctx.tideStage(at("2026-10-27T18:30"), P), "first of the incoming");
  assert.equal(ctx.tideStage(at("2026-10-28T08:00"), P), "", "past the table's last turn, nothing invented");
  assert.doesNotMatch(pick("function tideStage(", "function windAt("), /slack|flood tide|ebb\b/, "the stage words are the incoming and the outgoing, and never slack");

  // ── the wind: the chip's reading through the hour now is in, then the run's own hour, nothing past it
  const h = { time: ["2026-10-16T13:00", "2026-10-16T14:00", "2026-10-16T15:00"], wind: [5.8, 6, 6.1], gust: [10.3, 9.6, 10.3], dir: [238, 231, 208] };
  const c = { wind_speed_10m: 5.8, wind_gusts_10m: 10.3, wind_direction_10m: 238 };
  const now = at("2026-10-16T13:05");
  assert.deepEqual({ ...ctx.windAt(h, now, c, now) }, { w: 5.8, g: 10.3, d: 238 });
  assert.deepEqual({ ...ctx.windAt(h, at("2026-10-16T15:20"), c, now) }, { w: 6.1, g: 10.3, d: 208 });
  assert.equal(ctx.windAt(h, at("2026-10-16T17:00"), c, now), null, "past the run is no reading");
  // a cache written before the direction was asked for has none: its marks are the speed with no arrow
  assert.equal(ctx.windAt({ ...h, dir: undefined }, at("2026-10-16T14:30"), c, now).d, null, "a cache with no direction draws no vane");
  assert.equal(ctx.windAt({ ...h, dir: undefined }, at("2026-10-16T14:30"), c, now).w, 6, "and still has its speed");
  assert.equal(ctx.windAt({ ...h, wind: [5.8, null, 6.1] }, at("2026-10-16T14:30"), c, now), null, "a missing hour is no reading, never calm");
  // said the chip's way: calm under 1 mph, and the gust only when it runs 6 or more over
  assert.equal(ctx.windWords({ w: 5.8, g: 10.3 }), "6 mph");
  assert.equal(ctx.windWords({ w: 19.7, g: 31.3 }), "20, gusts 31 mph");
  assert.equal(ctx.windWords({ w: .4, g: 8 }), "calm, gusts 8 mph");
  assert.equal(ctx.windWords(null), "wind –", "a missing hour is a dash");
  assert.equal(ctx.windSpoken({ w: 19.7, g: 31.3, d: 357 }), "wind from the north 20 miles an hour, gusts 31");
  assert.equal(ctx.windSpoken(null), "wind unavailable");
  // the wind row speaks at now and at each turn of the table still ahead, and a turn too close gives way
  assert.deepEqual(Array.from(ctx.windTimes(P, at("2026-10-27T08:40"), at("2026-10-28T10:40"), 3 * 36e5)),
    [at("2026-10-27T08:40"), at("2026-10-27T16:44"), at("2026-10-27T22:36"), at("2026-10-28T04:56")], "now, then the turns; the 10:17 high, 1.6 hours after now, gives way to now");
  assert.deepEqual(Array.from(ctx.windTimes(P, at("2026-10-27T08:40"), at("2026-10-28T10:40"), 36e5)),
    [at("2026-10-27T08:40"), at("2026-10-27T10:17"), at("2026-10-27T16:44"), at("2026-10-27T22:36"), at("2026-10-28T04:56")], "with room, every turn ahead");
  assert.deepEqual(Array.from(ctx.windTimes(P, at("2026-10-27T08:40"), at("2026-10-27T09:00"), 3 * 36e5)), [at("2026-10-27T08:40")], "no turn on the chart is now alone");
  assert.deepEqual(Array.from(ctx.windTimes(P, at("2026-10-27T08:40"), at("2026-10-28T10:40"), 7 * 36e5)),
    [at("2026-10-27T08:40"), at("2026-10-27T16:44"), at("2026-10-28T04:56")], "each turn is measured from the column kept before it");

  // ── the gusts line: the hours whose gust reaches the boat's caution line (BOAT.iffyGust, 22) and runs 6 or more
  // over the wind (the chip's own rule), each stretch with its top gust, on the whole mph the chip prints
  assert.equal(ctx.BOAT.iffyGust, 22, "the boat's own caution line");
  const run = (pairs) => ({ time: pairs.map((_, i) => `2026-04-18T${String(14 + i).padStart(2, "0")}:00`), wind: pairs.map((p) => p[0]), gust: pairs.map((p) => p[1]), dir: pairs.map(() => 250) });
  const blowAt = at("2026-04-18T14:00"), end = at("2026-04-19T16:00");
  const chip = (w, g) => ({ wind_speed_10m: w, wind_gusts_10m: g, wind_direction_10m: 250 });
  const G = (pairs, ch = chip(...pairs[0]), t = blowAt, t1 = end) => Array.from(ctx.gustSpans(run(pairs), ch, t, t1), (s) => ({ a: new Date(s.a).getHours(), b: new Date(s.b).getHours(), top: s.top }));
  assert.deepEqual(G([[22, 34], [21, 33], [15, 24], [11, 18], [10, 16]]), [{ a: 14, b: 17, top: 34 }], "the afternoon's blow, to 34, until 5");
  assert.deepEqual(G([[10, 16], [9, 15], [10, 17]]), [], "an ordinary day has nothing");
  assert.deepEqual(G([[25, 30], [24, 29]]), [], "a hard wind with gusts under 6 over it is said by the row, not the gusts line");
  assert.deepEqual(G([[12, 21.6], [12, 21.4]]), [{ a: 14, b: 15, top: 22 }], "a 21.6 is the chip's 22, a 21.4 its 21");
  assert.deepEqual(G([[12, 25], [null, 30], [12, 26]]), [{ a: 14, b: 15, top: 25 }, { a: 16, b: 17, top: 26 }], "an hour the run does not carry ends a stretch, and never carries one on");
  assert.deepEqual(G([[12, 25], [12, 26], [12, 27]], chip(12, 25), blowAt, at("2026-04-18T15:30")), [{ a: 14, b: 15, top: 26 }], "cut at the chart's end");
  assert.equal(new Date(ctx.gustSpans(run([[12, 25], [12, 26]]), chip(12, 25), blowAt, at("2026-04-18T15:30"))[0].b).getMinutes(), 30);
  // the hour now is in is the chip's reading, and a stretch under way starts at now
  assert.deepEqual(G([[12, 14], [12, 25]], chip(13, 27), at("2026-04-18T14:20")), [{ a: 14, b: 16, top: 27 }], "the chip's gust is the hour now is in");
  assert.equal(ctx.gustSpans(run([[12, 14], [12, 25]]), chip(13, 27), at("2026-04-18T14:20"), end)[0].a, at("2026-04-18T14:20"));
  // the rule is the boat's caution line and the chip's 6, no new threshold, and never the hourly's windy line
  const gs = pick("function gustSpans(", "/* the coastal waters' advisories the wind row carries");
  assert.match(gs, /g>=BOAT\.iffyGust&&g-s>=6/);
  assert.doesNotMatch(gs.replace(/\/\*[\s\S]*?\*\//g, ""), /WINDY_GUST|\b(?:1\d|2\d|3\d)\b/, "no number of its own");

  // ── the coastal waters' advisories: the forecaster's call for the ocean off the sounds, never the house's strip
  for (const e of ["Small Craft Advisory", "Gale Watch", "Gale Warning", "Storm Warning", "Special Marine Warning", "Hurricane Force Wind Warning", "Hazardous Seas Watch"]) assert.match(e, ctx.MARINE_EVENT);
  for (const e of ["Rip Current Statement", "Coastal Flood Advisory", "Wind Advisory", "Small Craft Advisory for Rough Bar", "Tropical Storm Warning"]) assert.doesNotMatch(e, ctx.MARINE_EVENT);
  // their hours: from the VTEC begin (else the onset, else now), to `ends` (else the VTEC end), cut to the chart,
  // and one with no end runs to the chart's edge and on; one that has ended is not drawn
  const t0z = Date.parse("2026-10-16T13:05:00-04:00"), t1z = t0z + 26 * 36e5;
  const zb = (z, shift = 0) => Array.from(ctx.zoneBars(z, t0z, t1z, shift), (b) => ({ ev: b.a.event, s: b.s, e: b.e, end: b.end, open: b.open }));
  const sca = { event: "Small Craft Advisory", onset: "2026-10-17T05:00:00-04:00", ends: "2026-10-17T14:00:00-04:00", expires: "2026-10-17T14:00:00-04:00", vtec: ["/O.NEW.KCHS.SC.Y.0058.261017T0900Z-261017T1800Z/"] };
  const gale = { event: "Gale Watch", onset: "2026-10-17T14:00:00-04:00", ends: "2026-10-20T03:00:00-04:00", expires: "2026-10-17T05:00:00-04:00", vtec: ["/O.NEW.KCHS.GL.A.0007.261017T1800Z-261020T0700Z/"] };
  assert.deepEqual(zb([gale, sca]), [
    { ev: "Small Craft Advisory", s: Date.parse(sca.onset), e: Date.parse(sca.ends), end: Date.parse(sca.ends), open: false },
    { ev: "Gale Watch", s: Date.parse(gale.onset), e: t1z, end: Date.parse(gale.ends), open: true }], "in order, the watch running past the chart's edge, never stopped at its product's expiry");
  const inEffect = { event: "Small Craft Advisory", onset: "2026-10-16T08:00:00-04:00", ends: "2026-10-16T22:00:00-04:00", vtec: ["/O.CON.KCHS.SC.Y.0058.000000T0000Z-261017T0200Z/"] };
  assert.equal(zb([inEffect])[0].s, t0z, "one already under way starts at now");
  const noEnd = { event: "Gale Warning", onset: "2026-10-16T14:00:00-04:00", ends: null, expires: "2026-10-16T17:00:00-04:00", vtec: ["/O.NEW.KCHS.GL.W.0012.261016T1800Z-000000T0000Z/"] };
  assert.deepEqual(zb([noEnd])[0], { ev: "Gale Warning", s: Date.parse("2026-10-16T14:00:00-04:00"), e: t1z, end: null, open: true }, "no end given: to the edge and on, never the product's expiry");
  assert.equal(zb([{ ...sca, onset: null }])[0].s, Date.parse("2026-10-17T09:00:00Z"), "the VTEC begin first");
  assert.equal(zb([{ ...sca, ends: null }])[0].end, Date.parse("2026-10-17T18:00:00Z"), "and its end when the alert gives none");
  assert.deepEqual(zb([{ ...inEffect, ends: "2026-10-16T13:00:00-04:00", vtec: [] }]), [], "an advisory that has ended is not drawn");
  assert.deepEqual(zb([{ ...sca, event: "Rip Current Statement" }]), [], "and nothing but the zone's own marine products");
  assert.equal(zb([sca], 36e5)[0].s, Date.parse(sca.onset) + 36e5, "on the chart's wall clock");

  // ── what is in season: a calendar, never a bite, with cobia's May closure said. Only fish: Josh took the shrimp
  // and their baiting season out on October 21 2026 ("drop the shrimp too.... just stuff they would fish for").
  // Reds are in every month (SCDNR: year-round), bull reds from August to November, so a flood tide in the reds' season
  // never sits over a row without them. The months are SCDNR's month-by-month check of October 16 2026
  const names = (m) => Array.from(ctx.runsIn(ctx.RUNS.bft, m), (r) => r.name);
  assert.deepEqual(names(1), ["reds", "trout"]);
  assert.deepEqual(names(2), ["reds", "trout", "black drum"]);
  assert.deepEqual(names(4), ["reds", "trout", "flounder", "black drum", "cobia"]);
  assert.deepEqual(names(5), ["reds", "trout", "flounder", "sheepshead", "black drum", "cobia"]);
  assert.deepEqual(names(6), ["reds", "flounder", "black drum", "cobia", "sharks"]);
  assert.deepEqual(names(8), ["bull reds", "flounder", "tarpon", "sharks"]);
  assert.deepEqual(names(10), ["bull reds", "trout", "flounder", "sheepshead"]);
  assert.deepEqual(names(12), ["reds", "trout", "sheepshead"]);
  const fish = Object.keys(vm.runInContext("(" + pick("const RUN_FISH={", "/* each one registers for the close-up").replace(/^const RUN_FISH=/, "").replace(/;\s*$/, "") + ")",
    vm.createContext({ pBlob: () => 0, pTaper: () => 0, pDot: () => 0, runEye: () => [] })));
  for (const r of ctx.RUNS.bft) {
    assert.ok(fish.includes(r.id), `${r.name} is drawn`);
    assert.ok(r.m.length && r.m.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) && new Set(r.m).size === r.m.length, `${r.name}'s months are months`);
    assert.ok(!r.closed || r.closed.every((m) => r.m.includes(m)), `${r.name} is closed only in its own months`);
  }
  // no shrimp, no baiting season, and nothing in the row that is not a fish
  assert.ok(!ctx.RUNS.bft.some((r) => r.id === "shrimp" || r.bait), "only fish in season");
  assert.doesNotMatch(html, /SHRIMP_BAIT|baitOpen|baiting|shrimp:\{pal/);
  assert.equal(ctx.runNote(ctx.RUNS.bft.find((r) => r.id === "cobia"), 5), "closed");
  assert.equal(ctx.runNote(ctx.RUNS.bft.find((r) => r.id === "cobia"), 6), "");
  const preload = (html.match(/bft:\{full:[^\n]*runsTall:\[([\d,]*)\]\}/) || []).slice(1);
  assert.equal(preload.length, 1, "the preload holds the months whose row takes a second line");
  for (let m = 1; m <= 12; m++) {
    assert.equal(names(m).filter((n) => /^(bull )?reds$/.test(n)).length, 1, `month ${m} has its reds, once`);
    assert.equal(names(m).includes("bull reds"), m >= 8 && m <= 11, `month ${m}: bull reds only August to November`);
    assert.ok(names(m).length >= 1 && names(m).length <= 6, `month ${m} fits one row`);
    assert.equal(ctx.runsTall(ctx.RUNS.bft, m), m === 5, `month ${m}: only May says a closure`);
    assert.equal(preload[0].split(",").map(Number).includes(m), ctx.runsTall(ctx.RUNS.bft, m), `month ${m}: the preload's copy is runsTall's`);
  }
  assert.ok(ctx.runsIn(ctx.RUNS.bft, 5).find((r) => r.name === "cobia").closed.includes(5));
  const rr = pick("function renderRuns(", "/* how tall the wind row");
  assert.match(rr, /In season in \$\{MONTHS\[m-1\]\}: /);
  assert.doesNotMatch(rr, /by SCDNR's calendar/, "SCDNR publishes no monthly calendar");
  const cal = rr + pick("const RUNS={bft:", "/* the row's entries");
  assert.doesNotMatch(cal, /biting|running now|best|>go<|bag limit \d/i);
  // no bag limits, which change
  assert.doesNotMatch(cal, /per person|per boat/i);
  assert.doesNotMatch(html, /MOCK/);
  // the row's place is held from the first frame (the preload, the shell), so its fish push nothing
  assert.match(html, /<div class="runs" id="runsRow" hidden><\/div>/);
  assert.match(html, /document\.getElementById\("runsRow"\)\.hidden=!L\.windRow;/);
  assert.match(html, /\.runs\{display:flex;[^}]*min-height:54px;/);
  assert.doesNotMatch(html, /getElementById\("runsRow"\)\?\.remove\(\)/);

  // ── only Beaufort carries it: the grass line, the big flood, the season, the marine zone and the row are fields
  // of LOCS.bft, and the coast's call passes null, so its chart is drawn exactly as before
  const locs = pick("const LOCS={", "const LOC_ORDER=");
  assert.match(locs, /grass:8,bigFlood:8\.8,floodSeason:\["03-15","11-30"\],marineZone:"AMZ362",runs:true,/);
  assert.equal((locs.match(/grass:/g) || []).length, 1);
  assert.equal((locs.match(/marineZone:/g) || []).length, 1);
  // the one field asked of Open-Meteo, at every place, read only by Beaufort
  assert.match(html, /hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index&/);
  assert.match(html, /\.\.\.\(Array\.isArray\(wj\.hourly\.wind_direction_10m\)\?\{dir:wj\.hourly\.wind_direction_10m\.slice\(i0\)\}:\{\}\)/);
  const tide = pick("function renderTides(", "/* ── the moon over the farm");
  assert.match(tide, /const grass=day\?LOC\.grass:null,vTopD=day\?Math\.max\(vTop,grass\+\.9\):vTop;/);
  assert.match(tide, /tideSvg\.setAttribute\("viewBox",`0 0 \$\{W\} \$\{HT\}`\);/);
  assert.match(tide, /let windRow="",HT=H,windSaid="";\n  if\(day\)\{/);
  assert.match(tide, /band:\[topY-10,day\?HT-2:seaY\]/);
  // the slider's flood word is floodSay's, on the stop's own level and date
  assert.match(tide, /flood:floodSay\(v,t,LOC\)/);
  assert.doesNotMatch(tide, /grass\+\.8/, "the big flood is LOC.bigFlood, named, not a number in the chart");
  // no almanac windows on the tide: here they would be the tide by another name
  assert.doesNotMatch(tide, /solunar|fishWindows|Almanac/);
  // the flood tide's word is judged on each high's own date, not today's
  assert.match(tide, /floodWord=t=>!!day&&inSeason\(new Date\(t\),LOC\.floodSeason\)/);
  assert.doesNotMatch(tide, /inSeason\(locToday\(\),LOC\.floodSeason\)/);
  // the moving water is the curve's own slope and the slider's stage words, never drawn a second time
  assert.doesNotMatch(tide, /streaks|chevron/);
  // the wind lane: one number a column at now and the turns, the gusts line under it on the boat's rule, and the
  // advisories under that, named as offshore's, all in the page's own inks: no "g22" row, nothing in the
  // marker's red, and the hourly's windy line nowhere in it
  const wr = tide.slice(tide.indexOf("let windRow="), tide.indexOf("const tideSvg="));
  assert.match(wr, /windTimes\(P,nt0,t1,/);
  // now's column says the unit once, the chip's "mph", and gives it up rather than a turn of the tide
  assert.match(wr, /const unit=!cols\[1\]\|\|X\(cols\[1\]\.t\)-pairW\/2>=c0R\+6\*fs\?" mph":"";/);
  assert.doesNotMatch(wr, />g\$\{g\}<|css\.marker|WINDY_GUST|#[0-9A-F]{6}/i);
  assert.match(wr, /HT=H\+windRowH\(W\);/);
  assert.match(wr, /const gusts=gustSpans\(day\.h,day\.c,nt0,t1\),lfs=8\*fs,put=\[\];/);
  assert.match(wr, /txt=`gusts to \$\{s\.top\}`/);
  assert.match(wr, /fill="\$\{css\.soft\}" \$\{halo\}>\$\{p\.txt\}<\/text>/, "the gusts' words in the soft ink");
  assert.match(wr, /stroke="\$\{css\.faint\}" stroke-width="1"/, "and their hairline in the faint");
  assert.match(wr, /if\(put\.length\)HT\+=gustRowH\(W\);/, "a line only when it has something on it");
  // placed, not stamped: the strongest first, three characters clear, its words' middle over its own hours
  assert.match(wr, /\.sort\(\(p,q\)=>q\.top-p\.top\|\|p\.a-q\.a\)/);
  assert.match(wr, /keep=3\*lfs\*\.6/);
  // and a stretch's hairline is cut round its own words and well short of the next one's
  assert.match(wr, /const m=q===p\?4:keep;/);
  assert.match(wr, /const adv=zoneBars\(day\.zone,nt0,t1,TZSHIFT\);/);
  assert.match(wr, /const words="offshore "\+/);
  // said with the chart: every gusty stretch, the line's room or not
  assert.match(wr, /\.\.\.gusts\.map\(s=>`gusts to \$\{s\.top\} miles an hour /);
  assert.match(html, /const gustRowH=cw=>\{const f=\(cw<360\?1\.08:cw<520\?1\.16:1\)\*1\.22;return Math\.round\(8\*f\*1\.3\+4\*f\+3\)\};/);
  // the rows under the chart each stand clear of the one over it (Josh, October 21 2026: "crowded, especially
  // when there's an offshore warning. could be spacing"): the wind row ROW_AIR under the lows, the gusts and
  // the advisory's bar 3 more, its words further off the bar, and the in-season row well clear of them all
  assert.match(html, /const ROW_AIR=5;/);
  assert.match(wr, /const vy=H\+7\*fs\+ROW_AIR;/);
  assert.match(wr, /const gb=HT\+lfs\*\.9\+3,/);
  assert.match(wr, /const by=HT\+3,bh=2\.4\*fs,/);
  assert.match(html, /\.runs\{display:flex;[^}]*margin-top:18px;/);
  // and the band of a flood stops under its high's time, never through it, and the depth scale keeps out of it
  // where it can, lightly, never onto the tide line for it (at the coast there is no flood, and the scale is
  // placed as it always was)
  assert.match(tide, /top=fh\?fh\.ty\+11\*fs\*\.22\+2:/);
  assert.match(tide, /const washes=floods\.map\(f=>\[Math\.max\(X\(f\.a\),x0\),topY-10,Math\.min\(X\(f\.b\),xR\),bedY\]\);/);
  assert.match(tide, /\.length\*100\+inWash\(b\)\};/);
  assert.match(tide, /const floods=day\?floodSpans\(P,interp,t0,t1,grass\):\[\]/);
  // the loading shell holds the wind row's height at Beaufort, and only there (the preload's copy is windRowH's)
  assert.match(html, /box\("tideSvg",ch\+\(L\.windRow\?Math\.round\(13\*\(cw<360\?1\.08:cw<520\?1\.16:1\)\*1\.22\+8\):0\)\)/);
  assert.match(html, /const windRowH=cw=>Math\.round\(13\*\(cw<360\?1\.08:cw<520\?1\.16:1\)\*1\.22\+8\);/);
  assert.match(html, /box\("tideSvg",ch\+\(LOC\.grass\?windRowH\(cw\):0\)\)/);

  // ── the zone's own lane: the forecast never waits on it, a late answer paints again with the view held, and a
  // failed or timed-out request is no answer and no bar
  const lanes = pick("/* Beaufort's coastal-waters advisories (AMZ362), in a lane of their own", "async function refresh(){");
  assert.match(lanes, /const zoneLane=L=>L\.marineZone\?fetchJSON\(`https:\/\/api\.weather\.gov\/alerts\/active\?zone=\$\{L\.marineZone\}`,6000\)/);
  assert.match(lanes, /\.filter\(a=>alertLive\(a\)&&MARINE_EVENT\.test\(a\.event\)\)\)\.catch\(\(\)=>null\)/);
  assert.match(lanes, /if\(was===JSON\.stringify\(z\|\|\[\]\)\)return;\n    d\.zone=z;/, "a failed answer takes the last bars down; an unchanged one paints nothing");
  const rf = pick("async function refresh(){", "const SWAP=");
  assert.doesNotMatch(rf, /await zoneP|zoneP\]|,zoneP,/, "never in the forecast's Promise.all");
  assert.ok(rf.indexOf("const zoneP=zoneLane(L)") < rf.indexOf("  try{"), "asked beside the forecast, before it");
  assert.match(rf, /if\(L\.marineZone\)data\.zone=zoneIn!==undefined\?zoneIn:kept\?\.zone\?\?null;/);
  assert.match(rf, /if\(L\.marineZone&&zoneIn===undefined\)zoneRun\(L,request,zoneP\);/);
  assert.match(rf, /if\(cached&&L\.marineZone\)\{if\(zoneIn!==undefined\)cached\.data\.zone=zoneIn;else zoneRun\(L,request,zoneP\)\}\n    if\(cached\)\{/, "and the cached reading takes the zone's answer when the forecast fails");
  // the chart's paint holds the view at Beaufort, where its height follows what the lane says, and nowhere else
  const rn = pick("function render(d,live,savedAt=0){", "async function stormRun(");
  assert.match(rn, /const tideHold=LOC\.tide&&LOC\.grass\?viewHold\(\):null;/);
  assert.match(rn, /renderRuns\(LOC\.runs&&LOC\.tide\?RUNS\[LOC\.id\]:null,now\);\n  if\(tideHold\)tideHold\(\);/);
  assert.match(rn, /const tide=renderTides\(d\.tides,css,c\.wind_gusts_10m,c\.wind_speed_10m,levelFeet\(d\.water,now\),LOC\.grass\?\{h:full,c,zone:d\.zone\|\|\[\]\}:null\);/);
  // and the marine zone never reaches the house's strip
  assert.doesNotMatch(rf.slice(rf.indexOf("const alertsP="), rf.indexOf("const alertsP=") + 400), /zone/);

  // ── the slider says the stage, a flood tide in the grass's green and the wind at each stop, the gusts too, and
  // the hours before now, which have no wind row, say no wind; a stop without them reads exactly as the coast's
  const lift = (re) => html.match(re)[0];
  const rctx = vm.createContext({});
  vm.runInContext([lift(/const XP=\{\},XP_HOLD=[^\n]*/), lift(/const WMO=\{[^\n]*/), lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
    lift(/const hh=t=>\{[^\n]*\};/), lift(/const dayName=s=>[^\n]*;/), lift(/const mmdd=s=>[^\n]*;/), lift(/const clock=d=>\{[^\n]*\};/),
    html.slice(html.indexOf("const NORMALS={"), html.indexOf("const DOY=")),
    html.slice(html.indexOf("const precipKind="), html.indexOf("/* where the moon crosses the chart's own horizon")),
    lift(/const dirLong=d=>[^\n]*\n[^\n]*/), pick("const windWords=", "/* The gusty stretches the wind row says"),
    "globalThis.readTide=readTide;"].join("\n"), rctx);
  const read = (s, n) => JSON.parse(JSON.stringify(rctx.readTide(s, at(n), 0)));
  const big = read({ t: at("2026-10-27T10:17"), depth: 9.354, turn: "H", now: false, dir: "falling", stage: "high water", flood: "big flood tide", wind: { w: 14.2, g: 23.1, d: 45 } }, "2026-10-27T08:40");
  assert.deepEqual(big.parts, [["10:17a", ""], ["9.4 ft", "b"], ["high water", ""], ["big flood tide", "grass"], ["45", "vane"], ["14, gusts 23 mph", ""]]);
  assert.equal(big.said, "High tide at 10:17 am, 9.4 feet, big flood tide, wind from the northeast 14 miles an hour, gusts 23");
  const blow = read({ t: at("2026-10-17T14:00"), depth: 7.3, turn: null, now: false, dir: "rising", stage: "high water", flood: "", wind: { w: 19.9, g: 29.1, d: 358 } }, "2026-10-16T13:05");
  assert.deepEqual(blow.parts, [["Sat 2p", ""], ["~7.3 ft", "b"], ["high water", ""], ["358", "vane"], ["20, gusts 29 mph", ""]]);
  assert.equal(blow.said, "Saturday 2 pm, about 7.3 feet, high water, wind from the north 20 miles an hour, gusts 29");
  // a cache's hour with no direction: the speed with no vane
  assert.deepEqual(read({ t: at("2026-10-17T03:00"), depth: 5, turn: null, now: false, dir: "falling", stage: "outgoing", flood: "", wind: { w: 9, g: 12, d: null } }, "2026-10-16T13:05").parts.slice(3), [["9 mph", ""]]);
  // calm has no direction to point, and a missing hour is a dash with no vane
  assert.deepEqual(read({ t: at("2026-10-17T03:00"), depth: 5, turn: null, now: false, dir: "falling", stage: "outgoing", flood: "", wind: { w: .4, g: 3, d: 90 } }, "2026-10-16T13:05").parts.slice(3), [["calm", ""]]);
  assert.deepEqual(read({ t: at("2026-10-17T03:00"), depth: 5, turn: null, now: false, dir: "falling", stage: "outgoing", flood: "", wind: null }, "2026-10-16T13:05").parts.slice(3), [["wind –", ""]]);
  // the pill keeps a vane with its words, and the hourly's and the week's pills are untouched by it
  const show = pick("function xpShow(X,i){", "function xpHide(");
  assert.match(show, /c==="vane"\?"":a\[i-1\]\?\.\[1\]==="vane"\?`<span class="vane-p">\$\{vane\(a\[i-1\]\[0\]\)\}/);
  const past = read({ t: at("2026-10-16T12:00"), depth: 6.9, turn: null, now: false, dir: "rising", stage: "last of the incoming", flood: "", wind: undefined }, "2026-10-16T13:05");
  assert.deepEqual(past.parts, [["12p", ""], ["~6.9 ft", "b"], ["last of the incoming", ""]]);
  assert.equal(past.said, "noon, about 6.9 feet, last of the incoming");
  assert.deepEqual(read({ t: at("2026-10-16T18:15"), depth: 3.1, turn: null, now: false, dir: "falling" }, "2026-10-16T13:05").parts, [["6:15p", ""], ["~3.1 ft", "b"]]);

  // ── shipping, not a mock: no drawing, comment or constant says it is one, and the new sentences keep Josh's words
  assert.doesNotMatch(html, /\bMOCK\b|\bmock\b|option [ABC]\b/);
  const fishing = pick("/* ── Beaufort's fishing water", "/* ── tide ───");
  for (const s of (fishing.replace(/\/\*[\s\S]*?\*\//g, "").match(/`[^`]*`|"[^"]*"/g) || [])) assert.doesNotMatch(s, /;|—/, `no semicolon or em dash in the app's words: ${s}`);
});

test("Beaufort's coastal waters on the page's own refresh: never waited for, painted again when they land, and no bar when they fail", async () => {
  const sca = { properties: { id: "urn:rig:sca", event: "Small Craft Advisory", severity: "Minor", onset: "2026-10-17T05:00:00-04:00", ends: "2026-10-17T14:00:00-04:00", expires: "2026-10-17T14:00:00-04:00",
    description: "* WHAT...North winds 20 to 25 kt.", instruction: "", parameters: { VTEC: ["/O.NEW.KCHS.SC.Y.0058.261017T0900Z-261017T1800Z/"] }, affectedZones: [] } };
  const rip = { properties: { ...sca.properties, id: "urn:rig:rip", event: "Rip Current Statement", parameters: { VTEC: ["/O.NEW.KCHS.RP.S.0040.261016T1500Z-261017T0000Z/"] } } };
  const zones = (r) => r.paints.map((p) => p.zone);
  {
    // in time, the answer joins the first paint, and only the zone's own marine products are kept
    const page = await pageRig({}, "bft");
    const r = await page.open("2026-10-16T17:05:00Z", { zone: [sca, rip], forecastDelay: 30 });
    await new Promise((res) => setTimeout(res, 40));
    deq(zones(r), [["Small Craft Advisory"]], "one paint, the advisory in it");
    deq(r.entry.data.zone.map((a) => a.event), ["Small Craft Advisory"], "and cached with the forecast");
  }
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  {
    // slow: the forecast paints without it, and the answer paints again, into the reading and its cache
    const store = {}, page = await pageRig(store, "bft");
    const r = await page.open("2026-10-16T17:05:00Z", { zone: [sca], zoneDelay: 150 });
    deq(zones(r), [[]], "the forecast's paint never waits on the coastal waters");
    await wait(260);
    deq(page.paints().map((p) => p.zone), [[], ["Small Craft Advisory"]], "and the answer paints again when it lands");
    deq(JSON.parse(store["mbwx-bft"]).data.zone.map((a) => a.event), ["Small Craft Advisory"]);
    // a refresh with the same answer, late again: the last reading's bar stays up while it is out, and the answer
    // that changes nothing paints nothing
    const r2 = await page.refresh("2026-10-16T17:35:00Z", { zone: [sca], zoneDelay: 150 });
    deq(zones(r2), [["Small Craft Advisory"]], "still out: the last reading's bar, by its own hours");
    await wait(260);
    assert.equal(page.paints().length, 3, "the same answer paints nothing");
    // the next one fails, slowly: the bar the last reading carried comes down when it does
    const r3 = await page.refresh("2026-10-16T18:05:00Z", { zone: "fail", zoneDelay: 150 });
    deq(zones(r3), [["Small Craft Advisory"]]);
    await wait(260);
    deq(page.paints().at(-1).zone, [], "a zone that failed is no bar: the carried one comes down");
    assert.equal(JSON.parse(store["mbwx-bft"]).data.zone, null, "and the cache says so");
  }
  {
    // failing at once: the forecast's paint has no bar, and nothing else paints
    const page = await pageRig({}, "bft");
    const r = await page.open("2026-10-16T17:05:00Z", { zone: "fail" });
    await wait(40);
    deq(zones(r), [[]]);
    assert.equal(page.paints().length, 1);
  }
  {
    // a cold open on a cache that had the advisory, with the zone slow: the cached paint and the live one carry it,
    // and the zone's own answer, the advisory over, takes it down
    const store = {};
    await (await pageRig(store, "bft")).open("2026-10-16T17:05:00Z", { zone: [sca] });
    await wait(40);
    const cold = await pageRig(store, "bft");
    const r = await cold.open("2026-10-16T19:05:00Z", { zone: [], zoneDelay: 150 });
    deq(r.paints.map((p) => [p.live, p.zone]), [[false, ["Small Craft Advisory"]], [true, ["Small Craft Advisory"]]]);
    await wait(260);
    deq(cold.paints().at(-1).zone, [], "the zone's own answer decides");
  }
  // the coast and the farm never ask
  for (const loc of ["mb", "sp"]) {
    const page = await pageRig({}, loc);
    const r = await page.open("2026-10-16T17:05:00Z", { zone: [sca] });
    assert.ok(r.paints.every((p) => p.zone === undefined), `${loc} reads no coastal waters`);
  }
});

test("Porters Neck is the house from across the pond: it looks north, and its lights keep the family's hours", async () => {
  const [html, scene, pond, webkit] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("tools/scene.mjs", root), "utf8"),
    readFile(new URL("tools/pond.mjs", root), "utf8"),
    readFile(new URL("tools/webkit.mjs", root), "utf8"),
  ]);
  const fn = html.slice(html.indexOf("function pnPondScene(c){"), html.indexOf("/* ── the lowcountry: Beaufort, South Carolina"));
  assert.ok(fn.length > 1000, "the scene is extractable");
  // the switch-over, the way Denver was parked: the place carries its view and the way it faces, and the
  // marsh stays in the file reached by no place
  assert.match(html, /mb:\{id:"mb",[\s\S]*?view:"pond",faces:"north",/);
  assert.match(html, /if\(LOC\.view==="pond"\)\{\n    pnPondScene\(\{/);
  assert.ok(html.includes("/* marsh: hazy maritime treeline, loblollies, live oak, spartina bank, dock, heron */"), "the marsh is parked, not deleted");
  assert.doesNotMatch(html, /PN_SHOW|pnShow/);
  // it looks north, so east is on the right: the sun's arc, the moon, the time labels and the wind's bearing
  // are mirrored for a place that faces north, and for no other
  assert.match(html, /const mirrorSky=LOC\.faces==="north";/);
  assert.match(html, /const px=f=>pnArc\?pnArc\.x0\+\(1-f\)\*\(W-2\*pnArc\.x0\):30\+f\*arcSpan;/);
  assert.match(html, /const labL=f=>px\(f\)<W\/2;/);
  assert.match(html, /const pnArc=mirrorSky\?\{x0:28,y0:GY-70,top:20,k:1\}:null;/);
  assert.match(html, /return pnArc\?a<=6&&a>=-4:a<=6/);
  assert.doesNotMatch(html, /SUN_LOOK|sunPick|\?sun=|data-dial="horizon"|data-sun="1"|data-sun="3"|data-sun-arc/);
  assert.match(html, /data-sun-times="1"/);
  // beside each time a little sun half set on a fine horizon, an arrow over it up for sunrise and down
  // for sunset (Josh's pick of three, October 23 2026); the chevron it replaced is gone
  assert.match(html, /const TIME_ADV=6\.6,MARK_W=15\.5,STEM=1\.4,GAP=2,SUN_R=3\.4;/);
  assert.match(html, /return time\+sunMark\(a==="end"\?x-tw-GAP-MARK_W:x\+tw\+GAP,y,up\);/);
  assert.match(html, /fill="\$\{up\?"#F5C94D":"#F2A845"\}" stroke="currentColor"/);
  assert.doesNotMatch(html, /CHEV_W|CAP_MID|__sunmark/);
  // the times read left to right like a clock, as at the other places: sunrise on the left, sunset on the
  // right, though the house's sun rises on the right (Josh, October 23 2026)
  assert.match(html, /skyLabs=\{rise:place\("L",clock\(sunrise\),true\),set:place\("R",clock\(sunset\),false\)\}/);
  assert.doesNotMatch(html, /data-sun-mark|mark=b|"SUNRISE"/);
  assert.match(html, /const y0=Math\.max\(14,visTop\+14\);/);
  assert.match(html, /const fit=pnArc\?pnSunFit\(py\(f\),visTop,squash,x\):\{y:py\(f\),s:1\};/);
  assert.match(html, /data-light="long-shadow"/);
  assert.match(html, /data-light="glint"/);
  // the light on the pond is a few short arcs. a bar the full width of the water read as a seam.
  assert.match(fn, /const wGlass=wind<3&&!wet,wBlow=wind>=10\|\|gust>=22\|\|rainK>=\.65;/);
  assert.match(fn, /len=\(wBlow\?14:20\)\+r\(\)\*\(wBlow\?16:22\),x=r\(\)\*\(W-len\)/);
  assert.match(fn, /stroke-linecap="round"/);
  assert.doesNotMatch(fn, /width="\$\{W\+24\}" height="\$\{f1\(hgt\)\}"/);
  // a moon the sine would set into the roof takes the shallower rise and stays in the sky
  assert.match(html, /function pnMoonInRoof\(x,y\)/);
  assert.match(html, /if\(pnArc&&pnMoonInRoof\(x,y\)\)/);
  assert.match(html, /y=pnArc\.y0-Math\.pow\(altS,\.35\)\*\(pnArc\.y0-pnArc\.top\);/);
  assert.match(html, /if\(LOC\.faces==="north"\)windDir=\(360-windDir\)%360;/);
  assert.match(html, /if\(LOC\.faces==="north"\)weather=\{\.\.\.weather,wind_direction_10m:/);
  // the windows go off at 10:30, the pumpkin lights stay on all night. the strands come on at evening golden
  // hour, the sun at +6° on the way down, and go off at 10:00. the fire follows the strands.
  // the face in the window is not a lamp. the fountain is lit from sunset to sunrise, all night
  // (Josh, at 5:21 am: "the fountain lights stay on that nice glowy vibe all night").
  assert.match(html, /const PN_LIGHTS_OUT=22\*60\+30,PN_STRANDS_OUT=22\*60,PN_PUMPKIN_LIGHTS=true;/);
  assert.match(fn, /const lit=pnHouseLights\(sunAltDeg,localHour,localMin,rising\);/);
  assert.match(fn, /const lightsOn=lit\.windows,strandsOn=lit\.strands,pumpOn=lit\.pumpkins,fnLit=lit\.fountain;/);
  assert.match(fn, /const fountain=\(copy\)=>\{const lit=fnLit;/);
  assert.doesNotMatch(fn.slice(fn.indexOf("const fountain=(copy)=>"), fn.indexOf("const fountainSvg=")), /lightsOn/);
  // a gas fire table holds in a breeze: lit up to gusts of 33 (Josh, October 24 2026, out at it gusting 31)
  assert.match(fn, /const fireOn=strandsOn&&localHour>=15&&temp>=45&&temp<68&&!wet&&!storm&&!fog&&gust<33&&!THUNDER;/);
  {
    const ctx = vm.createContext({});
    const block = html.slice(html.indexOf("const PN_LIGHTS_OUT="), html.indexOf("function pnPeekGhost("));
    vm.runInContext(block + "\nglobalThis.pnHouseLights=pnHouseLights;", ctx);
    const on = (alt, hour, minute, rising = false) => ctx.pnHouseLights(alt, hour, minute, rising);
    const same = (got, windows, strands, pumpkins, msg) => {
      assert.equal(got.windows, windows, msg);
      assert.equal(got.strands, strands, msg);
      assert.equal(got.pumpkins, pumpkins, msg);
    };
    const dark = -2, day = 10;
    same(on(day, 15, 0), false, false, true, "by day, above golden hour");
    same(on(6, 7, 40, true), false, false, true, "morning golden hour stays dark");
    same(on(6, 17, 30, false), false, true, true, "evening golden hour turns the strands on");
    same(on(5, 17, 40, false), false, true, true, "under +6 on the way down");
    same(on(7, 17, 0, false), false, false, true, "still above +6");
    same(on(dark, 19, 40), true, true, true, "on from dusk");
    same(on(dark, 21, 59), true, true, true, "strands on at 9:59");
    same(on(dark, 22, 0), true, false, true, "strands off at 10:00, windows and pumpkins stay");
    same(on(dark, 22, 1), true, false, true, "strands off at 10:01");
    same(on(dark, 22, 29), true, false, true, "windows and pumpkins on at 10:29");
    // the pumpkin lights stay on all night, like the willow (Josh, October 23 2026); the windows go at 10:30
    same(on(dark, 22, 30), false, false, true, "windows off at 10:30, the pumpkin lights stay on");
    same(on(dark, 22, 40), false, false, true, "pumpkin string still on at 10:40");
    same(on(dark, 23, 10), false, false, true);
    same(on(dark, 0, 30, false), false, false, true, "on after midnight");
    same(on(dark, 2, 15), false, false, true, "on all night");
    same(on(dark, 5, 21), false, false, true, "and at 5:21 am");
    same(on(dark, 11, 50), false, false, true);
    for (const [alt, h, m, lit, msg] of [[day, 15, 0, false, "the fountain is dark by day"], [6, 17, 30, false, "and at golden hour"],
      [dark, 19, 40, true, "lit from sunset"], [dark, 22, 30, true, "past the windows' 10:30"], [dark, 0, 30, true, "after midnight"],
      [dark, 5, 21, true, "at 5:21 am"], [-.5, 7, 20, false, "dark again at sunrise"]])
      assert.equal(on(alt, h, m).fountain, lit, msg);
  }
  // the hot tub opens with the fire, and only from October 20 through April 15
  assert.match(html, /const PN_TUB=\["10-20","04-15"\];/);
  assert.match(html, /function pnTubSeason\(d\)\{return inSeason\(d,PN_TUB\)\}/);
  assert.match(fn, /const tubSeason=pnTubSeason\(locToday\(\)\);/);
  assert.match(fn, /const tubOn=tubSeason&&fireOn;/);
  assert.match(fn, /propPnTub\(\{open:tubOn\}\)/);
  assert.doesNotMatch(fn, /open:tubSeason|tubLit=/);
  assert.match(fn, /data-prop="tub-live"/);
  // the steam is a low soft breath over the water, and the aqua holds steady while the tub is open (Josh,
  // October 23 2026: "keep the aqua hot tub light lit vs pulsing")
  assert.match(html, /@keyframes pnSteam\{0%\{transform:translateY\(0\);opacity:\.55\}25%\{opacity:\.8\}100%\{transform:translateY\(-5px\);opacity:0\}\}/);
  assert.match(fn, /const lights=`<g data-hue="pnTubLagoon" opacity="\.9">\$\{wash\("pnTubLagoon"\)\}<\/g>`;/);
  assert.doesNotMatch(html, /pnTubHue|pn-tub-hue|pnTubMoon/);
  assert.doesNotMatch(fn, /tubLook|get\("tub"\)/);
  assert.doesNotMatch(html, /pnTubAmber|pnTubRose|pnTubAqua|pnTubChamp|\?tub=/);
  {
    const ctx = vm.createContext({});
    const block = html.slice(html.indexOf("const mdOf="), html.indexOf("const holidayOn="))
      + html.slice(html.indexOf("const PN_TUB="), html.indexOf("function pnPeekGhost("));
    vm.runInContext(block + "\nglobalThis.pnTubSeason=pnTubSeason;", ctx);
    const on = (iso) => ctx.pnTubSeason(iso);
    assert.equal(on("2026-10-19"), false, "the day before the season");
    assert.equal(on("2026-10-20"), true, "October 20 starts it");
    assert.equal(on("2026-10-22"), true);
    assert.equal(on("2026-01-15"), true, "midwinter is in");
    assert.equal(on("2026-04-15"), true, "April 15 is the last day");
    assert.equal(on("2026-04-16"), false);
    assert.equal(on("2026-07-04"), false);
  }
  {
    const ctx = vm.createContext({});
    const block = html.slice(html.indexOf("const PN_HA="), html.indexOf("INK.pnBackHouse"));
    vm.runInContext(block + "\nglobalThis.pnSunFit=pnSunFit;globalThis.pnMoonFit=pnMoonFit;", ctx);
    const ridge = 138 + -66 * 1.45, ray = 16.2 + 8.5;
    // Josh, October 23 2026: the noon sun sat on the ridge. Over the roof it keeps a little sky under it
    const noon = ctx.pnSunFit(20, 0, 1);
    assert.ok(noon.s >= .9 && noon.s < 1, `over the ridge a phone's sun is a few percent smaller (${noon.s})`);
    assert.ok(noon.y - ray * noon.s >= 2 - 1e-6, "noon rays clear the top of the frame");
    assert.ok(noon.y + 13 * noon.s <= ridge - 5 + 1e-6, "on a phone the whole disc sits clear above the ridge");
    // through the middle of the day it rides over the roof, never half behind it
    for (const x of [100, 140, 160, 200, 230, 240]) {
      const f = ctx.pnSunFit(45, 0, 1, x);
      assert.ok(f.y + 13 * f.s <= ridge - 5 + 1e-6, `a sun at x ${x} keeps sky between it and the ridge`);
    }
    // the moon keeps sky over the roof too (Josh, October 23 2026: "the moon is cut off above the house too"),
    // and its top stays under the top of the frame
    for (const x of [100, 160, 220]) {
      const y = ctx.pnMoonFit(30, 0, x, 11);
      assert.ok(y + 11 <= ridge - 4 + 1e-6, `a moon at x ${x} keeps sky between it and the ridge`);
      assert.ok(y - 11 >= 2 - 1e-6, "and its top stays in the frame");
    }
    assert.equal(ctx.pnMoonFit(80, 0, 300, 11), 80, "beside the roof the moon keeps its place");
    assert.match(html, /if\(pnArc\)y=pnMoonFit\(y,visTop,x,r\);/);
    const side = ctx.pnSunFit(60, 0, 1, 270);
    assert.equal(side.y, 60, "beside the roof the sun keeps its own path");
    assert.equal(side.s, 1);
    const wide = ctx.pnSunFit(20, 25.6, 1);
    assert.equal(wide.s, 1, "a moderate crop still holds a full sun");
    assert.ok(wide.y - ray >= 25.6, "rays stay under the crop");
    assert.ok(wide.y - 13 < ridge, "the top of the disc stays above the ridge");
    const short = ctx.pnSunFit(20, 31, 1);
    assert.ok(short.s < 1 && short.s > 0.5, "a short window draws the sun smaller");
    assert.ok(short.y - ray * short.s >= 31 - 1e-6, "the shorter sun's rays clear the crop");
    assert.ok(short.y - 13 * short.s < ridge, "the top of the smaller disc stays above the ridge");
    const low = ctx.pnSunFit(90, 0, 1, 20);
    assert.equal(low.y, 90, "a low sun keeps the path");
    assert.equal(low.s, 1, "a low sun stays full size");
  }
  assert.match(fn, /const peek=halloween\?pnPeekGhost\(hx,hy,S,BH\):"";/);
  assert.doesNotMatch(fn, /const ghost=/);
  assert.match(html, /data-peek="window"/);
  assert.doesNotMatch(html, /function pnOpt|PN_HB|PN_OPT|\?house=/);
  // the pumpkin lights hang in swags through October and go dark at 10:30, the wire left up
  assert.match(fn, /const pumpLights=PN_PUMPKIN_LIGHTS&&halloween\?/);
  assert.match(fn, /data-decor="pumpkin-lights" data-lit="\$\{pumpOn\?1:0\}"/);
  assert.match(fn, /const pumpSwag=\(x0,x1,seed\)/);
  assert.match(fn, /yH\+sag\*4\*t\*\(1-t\)/);
  assert.match(fn, /const n=\(b-a\)>36\?6:5;/);
  assert.doesNotMatch(fn.slice(fn.indexOf("const pumpSwag="), fn.indexOf("const pumpLights=")), /lightsOn|strandsOn/);
  // the surfboards stand in a rack centred on the blank west wall, tails on the patio, not on a palm
  assert.match(fn, /const bayL=hx\+u\(BH\.winL\[BH\.winL\.length-1\]\[1\]\+2\),bayR=hx\+u\(BH\.porch\[0\]\+\.05\),bS=1\.46;/);
  assert.match(fn, /const bX=\(bayL\+bayR\)\/2,bY=hy\+\.35;/);
  assert.match(fn, /data-prop="surfboards"/);
  assert.doesNotMatch(fn, /R0\.x\+3\.9|bS=\.56/);
  // one orange and one white pumpkin on each pillar, carved and lit from the carving day like every pumpkin
  assert.match(fn, /const pumpkins=halloween\?\[\[fx0,3,5\],\[fx1,4,7\]\]\.map\(\(\[x,so,sw\]\)=>pumpkinAt\(x-2\.1,capY,1,\{w:5,h:3\.9,carved,seed:so\}\)\+pumpkinAt\(x\+2\.4,capY,1,\{w:4\.3,h:3\.4,carved,seed:sw,white:true\}\)\)/);
  assert.match(html, /const carved=halloween&&mdOf\(today\)>=hol\.carved;/);
  // the fountain is mid-pond on the back door's line, and so are the steps and the gate; the hot tub sits
  // centred on the bank of four east windows
  assert.match(fn, /const doorX=hx\+u\(\(BH\.door\[0\]\+BH\.door\[1\]\)\/2\);/);
  assert.match(fn, /const fnX=doorX,/);
  // the fountain is the real one's fan (Josh, October 23 2026): thirteen jets mirrored about the door's line, a veil
  // round each, a hot heart and glints on the water after dark, the glitter as a few paths, and the same two animations
  assert.match(fn, /const FN_N=6,FN_H=37,FN_TAN=\.4;/);
  assert.match(fn, /for\(let k=-FN_N;k<=FN_N;k\+\+\)\{/);
  assert.match(fn, /url\(#pnFountainHot\)/);
  assert.match(fn, /const dotsPath=pts=>/);
  assert.doesNotMatch(html, /pnPlume/);
  // the lawn runs on from the fence to the sand and the water starts lower (Josh: "add some more grass by removing some water")
  assert.match(fn, /sandY=Y\(159\.5\),pondY=Y\(162\)/);
  // the heron wades the shallows by the house-side bank, not far out in the pond
  assert.match(fn, /const hrX=X\(257\),hrY=pondY\+5,hrS=\.44;/);
  assert.match(fn, /gx0=doorX-6\.2,gx1=doorX\+6\.2/);
  assert.match(fn, /const tbX=hx\+u\(\(BH\.winR\[0\]\[0\]\+BH\.winR\[BH\.winR\.length-1\]\[1\]\)\/2\)/);
  // every chair at the fire table is black, the one behind included
  assert.match(fn, /chair\(fX\+7,fY-3\.4,"side","black",-1\)\}\$\{chair\(fX-9,fY-3\.6,"side","black"\)/);
  assert.match(fn, /chair\(fX-17\.5,fY\+\.5,"side","black"\)\}\$\{chair\(fX\+17\.5,fY\+\.5,"side","black",-1\)/);
  assert.doesNotMatch(fn, /"side","wood"/);
  // the round bush is a black weeping willow for October, lit purple and orange by day and all night
  assert.match(html, /function propPnWillow\(\)/);
  assert.match(fn, /data-decor="light-tree" data-lit="1"/);
  assert.match(fn, /#C084FC/);
  assert.match(fn, /#FF8A2A/);
  assert.doesNotMatch(fn, /scallop\(0,-8,4,7\.2/);
  assert.doesNotMatch(fn, /if\(lightsOn\)\{glows/);
  assert.equal((html.match(/winR:\[\[[^\]]*\],\[[^\]]*\],\[[^\]]*\]\]/g) || []).length, 0, "no three-window east wall");
  assert.equal((html.match(/winR:\[\[[^\]]*\],\[[^\]]*\],\[[^\]]*\],\[[^\]]*\]\]/g) || []).length, 1, "four east windows");
  // the main roof is a trapezoid whose lower corners are the gables' outer eaves, the ridge 0.87 of
  // that span, white, and the only house lights are the V to the palms
  assert.match(html, /const PN_HA=\{l:-60,r:60,ridge:-66,eave:-30,roofL:-60,roofR:60,ridgeL:-52,ridgeR:52,/);
  assert.match(html, /strip\(\[B\.ridgeL-\.4,B\.ridge-\.9\],\[B\.ridgeR\+\.4,B\.ridge-\.9\],1\.6\)/);
  assert.match(html, /o:\{shade:\.4,lit:\.32\}/);
  assert.match(html, /peakL:\[-39\.6,-46\],peakR:\[39\.6,-46\],porch:\[-19\.2,19\.2\]/);
  assert.match(fn, /const BH=PN_HA;/);
  assert.doesNotMatch(html, /meet:1/);
  assert.doesNotMatch(html, /bulbs:"(?:row|swag)"/);
  assert.match(fn, /wall:"#F7F6F3",siding:"#E6E8EB",shake:"#F6F5F2"/);
  assert.match(fn, /hPal\.roof=dark\?mix\(air\("#E6EDF3",\.05\),"#7A90A6",\.42\):"#F4F6F5"/);
  assert.doesNotMatch(fn, /porchSwag|data-porch="swag"/);
  // the fence runs only between its two white pillars, which mark its ends
  assert.match(fn, /const fx0=X\(10\),fx1=X\(310\)/);
  assert.match(fn, /\$\{pillar\(fx0\)\}\$\{pillar\(fx1\)\}/);
  assert.match(fn, /M \$\{f1\(fx0\)\} \$\{f1\(fenceT\+\.9\)\}/);
  // the neighbours are very close and are left out: no other house is drawn
  assert.doesNotMatch(fn, /neighbour|Farmhouse|farmhouse/);
  assert.doesNotMatch(html, /propPnFarmhouse|INK\.pnFarmhouse/);
  // a sabal, a windmill palm and a sabal at each end, the windmill between the sabals, the strands a V from the door to the inner sabals
  assert.match(fn, /const PALMS=\[\[26,"s",7,47,-\.04\],\[39,"w",2,20\],\[52,"s",8,51,\.03\],\[266,"s",9,50,-\.03\],\[282,"w",1,20\],\[298,"s",10,46,\.05\]\]/);
  // the palms are planted in the bed behind the fence, not on the lawn in front of it (Josh, October 23 2026),
  // and their trunks are that much shorter, so the crowns stand where they stood
  assert.match(fn, /const pw=bftPalmWind\(gust,downwind\),ps=\.9,PALM_BACK=3;/);
  assert.match(fn, /const px=X\(x\),foot=fenceB-PALM_BACK,th=h-PALM_BACK\/ps;/);
  assert.match(fn, /crownY:foot\+by\*ps\+\(bh\*ps\+PALM_BACK\)\*/);
  assert.match(fn, /inkAt\(P\.x,P\.foot,ps,1,/);
  assert.match(fn, /return liftAt\(b,liftSvg\(b,g\),\[P\.x,P\.foot\]/);
  assert.match(fn, /const L0=PALMS\[2\],R0=PALMS\[3\];/);
  assert.match(fn, /const pts=\[\[L0\.x\+\.6,L0\.crownY\+7\],vtx,\[R0\.x-\.6,R0\.crownY\+7\]\];/);
  // nothing in it moves under reduced motion
  for (const m of fn.matchAll(/animation:(\w+)/g)) assert.ok(["swayTree", "pnFlick", "pnDrift", "pnSpray", "pnDrops", "drift"].includes(m[1]), m[1]);
  // the harness runs the house through its moments, the carved week's lit pillar pumpkins among them
  assert.match(scene, /name: "44-house-carved-week-night"[^\n]*"jack-o-lantern"[^\n]*candles: 6,/);
  assert.match(scene, /name: "27-house-halloween-night"[^\n]*"trick-or-treater"[^\n]*candles: 6,/);
  assert.match(scene, /name: "02-house-blow-west"[^\n]*\n[^\n]*to the right/);
  assert.match(pond, /node tools\/pond\.mjs/);
  // Nothing that moves is in #sceneSvg. In one sheet the house ran at 9 frames a second in WebKit (October 21 2026),
  // which repaints an SVG sheet whole while anything in it moves, so the still picture is laid out on still sheets
  // and what moves goes on its own, back to front as it was drawn in one: the palms and the fountain grass are boxes
  // the compositor sways, the flame, a guttering candle's pumpkin, the bats and the witch are #sceneFx, the light
  // on the ripples, the rain's rings and the fountain #sceneRipple, the gulls and the clouds #sceneSky
  assert.match(html, /<div class="scene"><svg id="sceneSvg"[^>]*><\/svg><svg id="sceneSky" class="scene-layer"[^>]*><\/svg><svg id="sceneMoss" class="scene-layer"[^>]*><\/svg><svg id="sceneNear" class="scene-layer"[^>]*><\/svg><div id="sceneLift" class="scene-lift" aria-hidden="true"><\/div><svg id="sceneFront" class="scene-layer"[^>]*><\/svg><svg id="sceneFx" class="scene-layer"[^>]*><\/svg><svg id="sceneWater" class="scene-layer"[^>]*><\/svg><svg id="sceneRefl" class="scene-layer"[^>]*><\/svg><svg id="sceneRipple" class="scene-layer"[^>]*><\/svg><svg id="sceneTop" class="scene-layer"[^>]*><\/svg><\/div>/);
  const skySheet = fn.slice(fn.indexOf('const skyPaint=()=>{sheet("sceneSvg").innerHTML=`'), fn.indexOf('  sheet("sceneSky").innerHTML='));
  assert.ok(skySheet.length > 1000, "the sky sheet's paint is extractable");
  assert.doesNotMatch(skySheet, /gulls|sceneClouds|palm|grass|fountain|bats|witchFly|breakUp|pondMoving|fireFlame|pumpkins|gateLanterns|heron|deer|animation/);
  assert.match(fn, /sheet\("sceneSky"\)\.innerHTML=gulls\+\(skyOver\?sunBody\+moonShown\+sideSky:""\)\+sceneClouds/);
  assert.match(fn, /document\.getElementById\("sceneLift"\)\.innerHTML=grassLift\+PALMS\.map\(palmLift\)\.join\(""\);/);
  assert.match(fn, /sheet\("sceneFx"\)\.innerHTML=fireWash\+fireFlame\+\(guttering\?pumpkins\+gateLanterns:""\)\+bats\+witchFly\(witch\)/);
  assert.match(fn, /sheet\("sceneRipple"\)\.innerHTML=pondMoving;/);
  for (const name of ["sceneNear", "sceneFront", "sceneWater", "sceneTop"]) {
    const from = fn.slice(fn.indexOf(`sheet("${name}").innerHTML=`)), body = from.slice(0, from.indexOf(";\n"));
    assert.ok(body.length > 20, name);
    assert.doesNotMatch(body, /palm|grass|gulls|sceneClouds|bats|witch|fireFlame|breakUp|pondMoving|rainRings|fountain/, `#${name} holds something that moves`);
  }
  // the boxed palms and grass carry no sway of their own (the box turns), and a guttering candle takes its pumpkin up whole
  assert.match(fn, /const palmLift=P=>\{const g=palmSvg\(P,"",true\)/);
  assert.match(fn, /const guttering=\/class="candle flicker"\/\.test\(pumpkins\+gateLanterns\);/);
  // the reflection's fade is its sheet's CSS mask, which the compositor applies (as an SVG mask the whole upside-down
  // picture was drawn again into a buffer on every repaint), and the sheets keep a colour of their own, so the sky's
  // colour transition repaints none of them
  assert.match(fn, /Object\.assign\(rf\.style,\{height:"calc\(100% \+ 40px\)",opacity:String\(reflOp\),webkitMaskImage:fade,maskImage:fade\}\);/);
  assert.doesNotMatch(html, /mask="url\(#pnReflFade\)"/);
  assert.match(html, /el\.style\.color=LOC\.view==="pond"&&el\.id!=="sceneTop"\?"#000":"";/);
  assert.match(fn, /<defs style="color:#000">/);
  // a first paint is written a part a frame, hidden, and shown whole; a paint over a picture already up, the
  // house's or another place's (a cached switch from the farm, which staged left a bare sky for three frames), in one
  assert.match(fn, /const up=document\.getElementById\("sceneSvg"\)\.childElementCount>0;\n  skyPaint\(\);/);
  assert.match(fn, /if\(staged\[0\]\.childElementCount\|\|up\)\{landPaint\(\);waterPaint\(\);return\}/);
  // rain falls in front of the house too, on the moving sheet with its own mask, and lands at the sand
  assert.match(fn, /const rainTop=hy\+u\(BH\.ridge\)\+2,rainLand=sandY;/);
  assert.match(fn, /\+\(nearRainL\?`<defs>\$\{nearRainL\.defs\}<\/defs>\$\{nearRainL\.drops\}`:""\)\+tubFx\};/);
  // the logical frame stays 320 by 194. A wide screen scales that picture and crops the sky
  assert.match(html, /const sceneH=W=>LOC\.view==="pond"\?194:/);
  assert.match(html, /const W=LOC\.view==="pond"\?320:Math\.max\(320,appW\(\)\/1\.22\)/);
  assert.match(html, /function pondFit\(\)/);
  assert.match(html, /H=L\.view==="pond"\?194:Math\.round/);
  assert.doesNotMatch(fn, /X\(-12\)|X\(332\)/);
  // and the harnesses hold it: no animation in #sceneSvg or a still sheet at the house, and WebKit's house cases
  assert.match(scene, /\["sceneSvg", "sceneNear", "sceneFront", "sceneWater", "sceneRefl", "sceneTop"\]/);
  for (const name of ["coast-night", "coast-rain", "coast-afternoon", "coast-blow", "coast-halloween"]) assert.match(webkit, new RegExp(`name: "${name}", loc: "mb"`));
  // the detailed drawings are the house. There is no animals query. The gulls are the house gull, and the
  // sliders come out on their own table, heads up out in the water. The dogs are not drawn. The great blue
  // heron is back (Josh, October 23 2026): the marsh's bird and its whole life, wading in the east water, with
  // its footfall rings, its splash and a reflection that moves with it, down in a storm and a downpour
  assert.doesNotMatch(html, /pnAnimalLook|\?animals=/);
  assert.doesNotMatch(fn, /pnDogsPlan|propPnHerder|propPnSpaniel|pnDoorShape|doorSil/);
  assert.doesNotMatch(fn, /heron-still|flightBird\("gull"|propPnHeron/);
  assert.match(fn, /const bird=inkRig\(rigHeron\(phase\),inkPal\(INK\.heron\)/);
  assert.match(fn, /const showHeron=!storm&&!\(wet&&rainK>=1\);/);
  assert.match(fn, /data-water-contact="heron-near"/);
  assert.match(fn, /data-water-contact="heron-bill"/);
  assert.match(fn, /head\(X\(92\),Y\(169\),\.82,1,0\)/);
  assert.match(html, /function propPnSliderUp\(\)/);
  assert.match(fn, /pnHouseGull\(/);
  assert.match(fn, /pnRigBat\(beat\)/);
  assert.match(fn, /propPnDoeLook\(/);
  assert.match(fn, /pnBackHouse\(\{night:houseNight,lit:lightsOn,shadowOp,B:BH\}\)/);
  assert.doesNotMatch(fn, /openLast/);
  const houseFn = html.slice(html.indexOf("function pnBackHouse({"), html.indexOf("function pnBackHouseGlow("));
  assert.doesNotMatch(houseFn, /openLast|lastOpen|"room"/);
  assert.match(houseFn, /B\.winR\.forEach\(\(\[w0,w1\],i\)=>R0\.parts\.push\(\.\.\.sashes\(w0,w1,i\+2\)\)\)/);
  assert.match(houseFn, /for\(const\[w0,w1\]of B\.winR\)cas\(w0,w1\)/);
  const peekFn = html.slice(html.indexOf("function pnPeekGhost("), html.indexOf("function pnWindowGhost("));
  assert.match(peekFn, /yT=Y\(t\)/);
  assert.match(peekFn, /pnWindowGhost\(\)/);
  assert.match(peekFn, /data-decor="ghostface" data-peek="window"/);
  assert.match(peekFn, /pnPeekClip/);
  assert.doesNotMatch(peekFn, /propGhostface/);
  // the rightmost east window is the house's own sash. Ghostface adds no glass, no frame and no vertical bar
  assert.doesNotMatch(peekFn, /mullW|mullion|data-glass|pnPeekGlass|railH|openLast/);
});

test("the pond sliders keep to their table, and the dogs are not drawn", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const src = html.slice(html.indexOf("function pnTurtlesPlan("), html.indexOf("function propPnDoeLook("));
  const ctx = vm.createContext({});
  vm.runInContext(src + "\nglobalThis.pnTurtlesPlan=pnTurtlesPlan;", ctx);
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const turtles = (o) => plain(ctx.pnTurtlesPlan({ sunAlt: 30, wet: false, storm: false, temp: 70, snowing: false, ...o }));
  assert.deepEqual(turtles({}), { heads: 2, bask: true, dim: false });
  assert.deepEqual(turtles({ sunAlt: 4, temp: 55 }), { heads: 1, bask: false, dim: false });
  assert.deepEqual(turtles({ temp: 40 }), { heads: 0, bask: false, dim: false });
  assert.deepEqual(turtles({ temp: null }), { heads: 0, bask: false, dim: false });
  assert.deepEqual(turtles({ wet: true }), { heads: 1, bask: false, dim: false });
  assert.deepEqual(turtles({ sunAlt: -5 }), { heads: 1, bask: false, dim: true });
  assert.deepEqual(turtles({ sunAlt: -5, wet: true }), { heads: 0, bask: false, dim: false });
  assert.deepEqual(turtles({ storm: true }), { heads: 0, bask: false, dim: false });
  assert.deepEqual(turtles({ snowing: true }), { heads: 0, bask: false, dim: false });
  assert.doesNotMatch(html, /pnDogsPlan|propPnHerder|propPnSpaniel|pnDoorShape|PN_DOGS|PN_HERDER|PN_SPANIEL|merle-herder|blenheim-spaniel|data-dogs|pn-wag|pnWag/);
  assert.match(html, /data-turtles="1"/);
});

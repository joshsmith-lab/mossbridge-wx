import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
  assert.match(worker, /mbwx-shell-v72/);
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
  assert.match(html, /tideSection"\)\.style\.display=coastal\?"":"none"/);
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
  assert.match(html, /feels:wj\.hourly\.apparent_temperature\?\.slice\(i0,i0\+24\)/);
  assert.match(html, /const showFeels=Math\.abs\(feels-temp\)>=3/);
  assert.match(html, /function setupHourlyPeek\(\)/);
  assert.match(html, /e\.key==="ArrowRight"/);
  assert.match(html, /if\(!HOURLY_PEEK\)return/);
  assert.match(html, /pop>=5\?`\$\{pop\} percent chance of \$\{kind\}`/);
  assert.match(html, /pointercancel",\(\)=>\{PEEK_TOUCH_X=null/);
  assert.match(html, /id="hourlyPeekLive" aria-live="polite"/);
  assert.match(html, /\.hourly-scroll\{margin:0;padding:0;overflow:hidden\}/);
  assert.match(html, /\.hourly-inner\{min-width:0;width:100%/);
  assert.match(html, /viewBox="0 0 700 160"/);
  assert.match(html, /const trendTemp=h\.temp\.map/);
  assert.match(html, /class="tline"[^>]*vector-effect="non-scaling-stroke"/);

  // The two tiny-looking masthead controls remain full touch targets and keyboard operable.
  assert.match(html, /id="locBtn" role="button" tabindex="0"/);
  assert.match(html, /id="refreshBtn" role="button" tabindex="0"/);
  assert.match(html, /min-height:44px/);
  assert.match(html, /keyboardClick\(document\.getElementById\("refreshBtn"\),refresh\)/);
});

test("overnight copy follows the night the family is actually in", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /const beforeSunrise=now<sunrise/);
  assert.match(html, /const nightEnd=beforeSunrise\?sunrise:tomorrowRise/);
  assert.match(html, /const fallbackDay=beforeSunrise\?0:Math\.min\(1/);
  assert.match(html, /const nightWhen=beforeSunrise\?"before morning":"tonight"/);
  assert.match(html, /beforeSunrise\?goldenWindow\(sunrise\)/);
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
});

test("the hourly labels step aside instead of printing through each other", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // On a phone an hour is about twelve pixels wide. The 78° beside a 79° high printed
  // straight through it, and a 62° sat under the 61° low. Labels are placed against boxes:
  // obstacles first (bars, key dots), then the high, now and the low, then every fourth hour
  // where it has room, then the rain odds, then the moon on the night band.
  assert.match(html, /const taken=\[\],hit=b=>taken\.some\(/);
  assert.match(html, /const keys=\[\.\.\.new Set\(\[hiI,0,loI\]\)\];/);
  // the high always keeps the space above its dot; now and the low may take the space under theirs
  assert.match(html, /if\(hit\(b\)&&i!==hiI\)\{const uy=below\(x,y,13,t,22\),under=box\(x,uy,13,t\)/);
  // and every label clears the line under both of its ends, not only its own dot
  assert.match(html, /const above=\(x,y,size,txt,gap\)=>\{const hw=txt\.length\*size\*\.3\+2;return Math\.min\(y-gap,yAt\(x-hw\)-5,yAt\(x\+hw\)-5\)\};/);
  // the hour right beside a key label would only repeat it
  assert.match(html, /if\(keys\.some\(k=>Math\.abs\(k-i\)<2\|\|\(Math\.abs\(k-i\)<=3\|\|Math\.abs\(X\(k\)-X\(i\)\)<64\)&&Math\.round\(h\.temp\[k\]\)===Math\.round\(h\.temp\[i\]\)\)\)continue;/);
  // with no room over or under its dot, a key label steps along the row away from what it hit
  assert.match(html, /for\(let st=4;st<=40;st\+=2\)\{const sx=x\+dir\*st/);
  // the rain odds give way to the line too; the bar already says it
  assert.match(html, /if\(hit\(b\)\|\|Math\.min\(\.\.\.ys\)<b\[3\]\+3&&Math\.max\(\.\.\.ys\)>b\[1\]-3\)continue;/);
  // a regular hour that has no room is left out, dot and all
  assert.match(html, /if\(hit\(b\)\|\|hit\(d\)\|\|prev&&prev\.t===t&&x-prev\.x<64\)continue;/);
  // the night tag is decoration: it gives way to the numbers. The band and the moon already say
  // it is dark, so the words are gone and the moon is placed against its own box
  assert.match(html, /!hit\(\[c0-7,15,c0\+7,29\]\)\)\{cx=c0;break\}/);
  assert.match(html, /<path d="M 4\.6 0 a 4\.6 4\.6 0 1 1-4\.6-4\.6 A 3\.6 3\.6 0 0 0 4\.6 0 Z"\/><\/g>`;/);
  assert.doesNotMatch(html, /AFTER DARK<\/text>/);
});

test("the page agrees with itself", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // the chart's NOW is the reading in the header, not the top-of-hour forecast
  assert.match(html, /temp:d\.hourly\.temp\.map\(\(t,i\)=>i\?t:now0\(t,"temperature_2m"\)\)/);
  // ink is judged against the cloud the text sits on as well as the bare gradient
  assert.match(html, /const cInk=Math\.min\(contrast\(INK_ON,field\),contrast\(INK_ON,lit\)\)/);
  // the headline never names an hour that has already started
  assert.match(html, /second=wetI===0\?\(maxPop>=70\?"Rain likely any time now\."/);
  // no sunscreen schedule when the rest of today's hourly UV stays under 3: the sun card steps
  // aside rather than say so, and the hour it starts from is the live reading
  assert.match(html, /if\(h\.time\.some\(\(t,i\)=>t\.slice\(0,10\)===today&&h\.uv\?\.\[i\]!=null\)\)return null;/);
  assert.match(html, /document\.getElementById\("sunCard"\)\.hidden=!sunAdvice;/);
  assert.match(html, /uv:d\.hourly\.uv&&d\.hourly\.uv\.map\(\(u,i\)=>i\?u:now0\(u,"uv_index"\)\)/);
  assert.doesNotMatch(html, /UV stays low|Sunscreen weather is over|The strong sun is done|Easy sun/);
  // a golden-hour range is never cut at its dash, and the low stays with its words
  assert.match(html, /\.gold-bit\{white-space:nowrap\}/);
  assert.match(html, /const lowTxt=`Low\\u00A0\$\{nightLow\}°`;/);
  assert.match(html, /`\$\{lowTxt\} \$\{nightWhen\}\.`;/);
  // under 35% the night says nothing about rain, the way the week does
  assert.doesNotMatch(html, /mostly dry \$\{nightWhen\}/i);
  assert.match(html, /<b>now until \$\{clock\(gw\.b\)\}<\/b>/);
  // the lit side of the moon is the light side on both themes
  assert.match(html, /\.moon-phase \.moon-lit\{fill:#FFF6E2\}/);
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
  assert.match(html, /renderScene\(sunrise,sunset,now,c,dark,LOC\.tide\?tideTrend\(d\.tides\):0\)/);
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
  assert.match(html, /class="heron-splash"/);
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
  assert.match(html, /isSnow\(code\)\?\(code===75\|\|code===86\?"heavy snow"/);
  assert.match(html, /code:wj\.hourly\.weather_code\.slice\(i0,i0\+24\)/);
  // and the odds word follows the odds: 35% snow is possible, not likely
  assert.match(html, /nightPop>=35&&nightSnow\?`Snow \$\{nightPop>=60\?"likely":"possible"\} \$\{nightWhen\}/);
  // and the weekend note calls a snowy Saturday's odds snow
  assert.match(html, /\$\{Math\.round\(\+P\[i\]\)\}% \$\{isSnow\(w\)\?"snow":isIce\(w\)\?"ice":"rain"\}/);
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

test("the almanac fishes the farm pond, the coast keeps sunscreen, and Denver dresses for comfort", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // solunar is folklore built on honest astronomy, and the code says so out loud
  assert.match(html, /function solunarWindows\(now\)/);
  assert.match(html, /The theory is folklore; the moon times are real/);
  // majors are two hours around transit and underfoot, minors one hour around rise and set
  assert.match(html, /const half=\(major\?60:30\)\*6e4/);
  // the farm card gets the windows; a warned storm takes them away
  assert.match(html, /const fishOn=!!LOC\.fish&&!storm/);
  assert.match(html, /id="wFishWrap"/);
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
  // the pond dimples during a bite window, off the same moon the card reads
  assert.match(html, /solunarWindows\(now\)\.some\(w=>now>=w\.start&&now<=w\.end\)/);
  // and the fish bite label says where the bite times come from (the footer used to), on screen
  // in four words and in full to a screen reader and on hover
  assert.match(html, /id="wFishWrap"[^>]*title="Bite windows: solunar tables, computed from the moon\."/);
  assert.match(html, /fish bite · by the moon<span class="sr-only">\. Bite windows: solunar tables, computed from the moon\.<\/span>/);
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
  // outside the window every override is removed, so noon is the plain paper again
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

  // the blanket rule that kills every animation and transition, including pseudo-elements
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)\{\s*\*,\*::after\{animation:none!important;transition:none!important\}/);
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

  assert.match(html, /function dayStory\(c,dy,h\)/);
  assert.match(html, /function bestOutsideWindow\(h,coastal,dy\)/);
  assert.match(html, /best:bestOutsideWindow\(h,!!LOC\.marine,dy\)/);
  // the window stays on today unless today is out of daylight or genuinely rough
  assert.match(html, /const bToday=pick\(cands\.filter\(c=>c\.isToday\)\)/);
  assert.match(html, /rough&&bTom&&bTom\.score<bToday\.score\*\.6/);
  // the window is a stat, printed once, on the card. It used to be appended to the verdict
  // paragraph as well, which said it twice and ran the headline to four lines on a phone.
  assert.doesNotMatch(html, /Best outside stretch:/);
  assert.match(html, /<p class="out-line" id="wWindowWrap" hidden><span id="wWindowLbl"><\/span> <b id="wWindow">/);
  // each place keeps its own plain-language answer to "when should I go out?". The coast
  // answers with the call itself, so its window sits beside the word, not on a line of its own
  assert.doesNotMatch(html, /windowLabel:"best window"/);
  assert.match(html, /windowLabel:"best time to piddle"/);
  assert.match(html, /windowLabel:"best time to head out"/);
  assert.match(html, /id="goldenband"/);
  assert.match(html, /one local wildlife cue at a time/);
  assert.match(html, /seasonalFlies/);
  assert.match(html, /function sunProtectionAdvice\(c,dy,h,now\)/);
  assert.match(html, /Sunscreen from /);
  assert.match(html, /Sunscreen until /);
  assert.doesNotMatch(html, /Sunscreen weather /);
  // the clock-and-warning sentence is reserved for 6+, WHO's "high" — measured on
  // the sun still to come, not the day's peak: an August day that peaked at 8 over
  // lunch is genuinely mild by late afternoon
  assert.match(html, /const ahead=Math\.max\(Number\(c\.uv_index\)\|\|0,\.\.\.slots\.filter\(slot=>slot\.time>=now\)/);
  // the bar already says mild, so the sentence keeps only the part for the kids
  assert.match(html, /if\(ahead<6\)return\{text:"Sunscreen if you're out a while\.",cls:"go"\}/);
  assert.match(html, /if\(peak>=6\)return\{text:"Sunscreen from 10 a\.m\. to 5 p\.m\."/);
  assert.doesNotMatch(html, /Mild sun today\./);
  assert.doesNotMatch(html, /Wear SPF 30\+/);
  assert.doesNotMatch(html, /Reapply after two hours/);
  assert.match(html, /class="wildlife heron"/);
  assert.match(html, /const owlAt=/);
  assert.match(html, /const frogAt=/);
  assert.match(html, /const crabAt=/);
  assert.doesNotMatch(html, /marshDeer/);
  assert.match(html, /one useful read, rather than another row of weather instruments/);
  assert.doesNotMatch(html, /id="eveWind"/);
  assert.match(html, /function dailyBrief\(dy,i\)/);
  // the week is two lines, not a stack of bars: highs and lows on one scale, the range washed
  // between them, drawn in by the same pen as the hourly chart; a tapped day opens its brief
  assert.doesNotMatch(html, /class="range-fill"/);
  assert.match(html, /<path class="rv-line2" d="\$\{loLine\}"/);
  assert.match(html, /<path class="tline" d="\$\{hiLine\}"/);
  assert.match(html, /week:\{state:PRM\?"done":"armed",seen:false,anims:\[\]\}/);
  assert.match(html, /class="wk-day\$\{cls\}" type="button" data-day="\$\{t\}" aria-expanded=/);
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
  assert.match(html, /const WEEK_H=132,WEEK_WET=35;/);
  assert.match(html, /else if\(pop>=WEEK_WET\)note="Maybe a passing shower\."/);
  // a missing sky is no glyph, never a sun; a week with no odds at all is not "mostly dry",
  // and the note never calls a weekend dry (see the weekend test)
  assert.match(html, /\$\{sky\?icon\(code,16\):""\}/);
  assert.match(html, /if\(!P\.some\(known\)\)return "rain odds unavailable";/);
  assert.doesNotMatch(html, /"mostly dry"|looks most likely/);
  // the tapped brief says nothing it was not told: no invented sky, no easy day on missing odds,
  // and an easy day is its sky and nothing more
  assert.match(html, /return `\$\{feel\}\$\{hasSky\?`, \$\{sky\}`:""\}\.\$\{note\?" "\+note:""\}`;/);
  assert.match(html, /else if\(!hasPop\)note="Rain odds unavailable\.";/);
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
    lift(/const WEEK_H=132,WEEK_WET=35;/),
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
    lift(/const WEEK_H=132,WEEK_WET=35;/),
    html.slice(html.indexOf("function dailyBrief("), html.indexOf("/* ── the week")),
    "globalThis.dailyBrief=dailyBrief;",
  ].join("\n"), ctx);
  const brief = (high, code, pop, wind = 10) => ctx.dailyBrief({ temperature_2m_max: [high], weather_code: [code],
    precipitation_probability_max: [pop], wind_speed_10m_max: [wind] }, 0);
  assert.equal(brief(85, 0, 10), "Warm, sunny.");
  assert.equal(brief(75, 1, 10), "Mild, mostly sunny.");
  assert.equal(brief(75, 2, 10), "Mild, partly sunny.");
  assert.equal(brief(60, 3, 10), "Cool, mostly cloudy.");
  assert.equal(brief(60, 45, 10), "Cool, foggy.");
  assert.equal(brief(95, 1, 10), "Hot, mostly sunny. Keep the middle of the day short.");
  assert.equal(brief(84, 95, 70), "Warm, storms possible. Watch for alerts.");
  assert.equal(brief(30, 66, 70), "Cold, freezing rain. Give the roads time.");
  assert.equal(brief(30, 75, 70), "Cold, heavy snow. Plan on slow going.");
  assert.equal(brief(30, 77, 40), "Cold, snow grains. Plan on slow going.");
  assert.equal(brief(30, 73, 40), "Cold, snow. Plan on slow going.");
  assert.equal(brief(70, 63, 80), "Mild, rain at times. Expect a wet stretch.");
  assert.equal(brief(70, 81, 50), "Mild, showers. Expect a wet stretch.");
  assert.equal(brief(70, 53, 30), "Mild, drizzle. Expect a wet stretch.");
  assert.equal(brief(70, 3, 60), "Mild, mostly cloudy. Expect a wet stretch.");
  assert.equal(brief(70, 3, 40), "Mild, mostly cloudy. Maybe a passing shower.");
  assert.equal(brief(70, 2, 10, 22), "Mild, partly sunny. Could get windy.");
  // a missing sky or chance is left unsaid: no invented sun, no easy day on missing odds
  assert.equal(brief(70, null, 10), "Mild.");
  assert.equal(brief(70, 2, null), "Mild, partly sunny. Rain odds unavailable.");
});

test("the sun card says it with the bar, and steps aside when today has nothing left", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };

  // the stat row is gone: the reading rides on the pin and a later peak is a ring with its hour
  assert.doesNotMatch(html, /id="uvPeak"|id="uvPin"|right now <b id="uvNow">|class="uv-bar"/);
  assert.match(html, /<svg id="uvSvg" class="uv-svg"/);
  // today means today: the ring is the highest hour still to come today, never tomorrow's
  assert.match(html, /for\(let i=1;i<h\.time\.length&&h\.time\[i\]\.slice\(0,10\)===dy\.time\[0\];i\+\+\)/);
  assert.doesNotMatch(html, /uvTomorrow/);
  // a ring within half a point of the pin would sit on it
  assert.match(html, /if\(uvI>=0&&uvPk-\(uvNow\?\?0\)<\.5\)uvI=-1;/);
  // labels are placed, not stamped: the peak's hour steps right of the reading or goes unsaid
  assert.match(html, /const tx=Math\.max\(clamp\(cx,tw\/2,W-tw\/2\),pinR\+6\+tw\/2\)/);
  assert.match(html, /if\(tx\+tw\/2<=W\+\.5\)marks\+=/);
  // the band with ink is the band of the number printed on the pin
  assert.match(html, /on=!pin\?-1:shown<3\?0:shown<6\?1:shown<11\?2:3;/);
  assert.match(html, /\.uv-scale span\.on\{color:var\(--ink\);font-weight:600\}/);
  // the charts' pen draws it in: one-shot, only on screen, never under reduced motion, and last
  // in page order, so it follows whichever chart above it is still drawing
  assert.match(html, /sun:\{state:PRM\?"done":"armed",seen:false,anims:\[\]\}\};/);
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
  assert.equal(coast("14:20", 8.4, [7.2, 4.9, 2.1, .6]).text, "Sunscreen until 5 p.m.");
  assert.equal(coast("09:05", 4.1, [5.8, 7, 7, 6.6, 5.1, 3.4, 1.8]).text, "Sunscreen until 4 p.m.", "a live 4.1 is inside the window");
  assert.equal(coast("07:05", 1.2, [2.6, 4, 6, 7, 7, 6.6, 5.1, 3.4, 1.8]).text, "Sunscreen from 9 a.m. to 4 p.m.");
  assert.equal(coast("14:40", 3.8, [3.6, 2.4, 1], 4.2).text, "Sunscreen if you're out a while.");
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
  // no hourly UV to read: the rule of thumb, off the daily peak, and nothing without one
  const noHourly = (max) => ctx.sunProtectionAdvice({ uv_index: null }, { time: [day], uv_index_max: max == null ? undefined : [max] }, { time: [`${day}T11:00`] }, at("11:10"));
  assert.equal(noHourly(7).text, "Sunscreen from 10 a.m. to 5 p.m.");
  assert.equal(noHourly(null), null);
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

test("tide chart reads as depth over the bottom", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // height is measured up from the chart datum, never autoscaled to the window
  assert.match(html, /const hiV=Math\.max\(\.\.\.vs\),base=Math\.min\(0,\.\.\.vs\)/);
  assert.match(html, /seaY=H-34/);
  // the old top rail with a height printed beside every extreme is gone
  assert.doesNotMatch(html, /labelRailY/);
  assert.doesNotMatch(html, /\$\{p\.v\.toFixed\(1\)\} ft/);
  // lows share one aligned row, and the skiff rocks with the chop
  assert.match(html, /lowY=H-9/);
  assert.match(html, /rockDeg=clamp\(2\.2\+g0\*\.13/);
  assert.match(html, /renderTides\(d\.tides,css,c\.wind_gusts_10m,c\.wind_speed_10m\)/);
  // the skiff's burgee flies on the real wind: limp in calm air, level by 15 mph, and the
  // gusts above the wind set its flutter; reduced motion holds the wind's angle, still
  assert.match(html, /const w0=Number\(wind\)\|\|0,flagDeg=-35\*\(1-clamp\(w0\/15,0,1\)\);/);
  assert.match(html, /const flutter=clamp\(1\.2\+\(g0-w0\)\*\.35,1\.2,6\)/);
  assert.match(html, /\$\{PRM\?`transform:rotate\(\$\{flagDeg\.toFixed\(1\)\}deg\)`/);
  // the taller skiff: a high label steps over it sooner and higher
  assert.match(html, /const onBoat=high&&lx<nx\+19&&lx\+lw>nx-23&&y-6>ny-22;/);
  assert.match(html, /const lift=onBoat\?Math\.max\(9,26-\(ny-y\)\):9;/);
  assert.match(html, /const chartH=w=>Math\.round\(152\+\(760-w\)\*\.09\)/);
  assert.match(html, /Ht=chartH\(W\)-22/);
  assert.match(html, /H=chartH\(W\)/);
  assert.match(html, /id="tideExplore" role="group" tabindex="0"/);
  assert.match(html, /function setupTidePeek\(\)/);
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
  // the raccoon forages at the waterline, not out in the channel: at base+7 its feet
  // hung sixteen units below the bank with nothing under them and it read as floating.
  // Its y is now the ground under its feet
  assert.match(html, /raccoon\(residentX,base\+2\.5,\.95,1\)/);
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
  // one place to look up the light at both ends of the night: a gold line, not a sentence
  assert.match(html, />Tonight into tomorrow</);
  assert.match(html, /id="goldTimes"/);
  assert.match(html, /class="gold-key">golden hour</);
  assert.match(html, /\.gold-key\{/);
  assert.doesNotMatch(html, /Golden Hour is /);
  assert.doesNotMatch(html, /Tomorrow morning's Golden Hour runs /);
  // the water card is named for the water Josh actually runs, and only while the boat goes out
  assert.match(html, /On the water · Figure 8/);
  assert.doesNotMatch(html, /On the water · Mason Inlet/);
  assert.match(html, /offTitle:"Outside · Porters Neck",boatSeason:\["03-15","10-31"\]/);
  assert.match(html, /const titleFor=\(L,day\)=>L\.boatSeason&&!inSeason\(day,L\.boatSeason\)\?L\.offTitle:L\.outTitle;/);
  assert.match(html, /outTitle:"Around the farm"/);
  assert.match(html, /outTitle:"Around Denver"/);
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

test("the outside call is go, iffy or no go, for the window you would be out in", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const ctx = vm.createContext({});
  vm.runInContext([
    lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
    lift(/const hh=t=>\{[^\n]*\};/),
    lift(/const clock=d=>\{[^\n]*\};/),
    lift(/const spanTxt=\(a,b\)=>\{[^\n]*\n[^\n]*\};/),
    lift(/const hourSpan=[^\n]*\nconst windowTxt=[^\n]*/),
    html.slice(html.indexOf("function bestOutsideWindow("), html.indexOf("function dayStory(")),
    "globalThis.boatCall=boatCall;globalThis.outsideCall=outsideCall;globalThis.bestOutsideWindow=bestOutsideWindow;globalThis.hourSpan=hourSpan;",
  ].join("\n"), ctx);
  const hours = (o = {}) => ({ time: ["2026-11-14T13:00", "2026-11-14T14:00", "2026-11-14T15:00", "2026-11-14T16:00"],
    gust: o.gust || [12, 12, 12, 12], pop: o.pop || [5, 5, 5, 5], code: o.code || [1, 1, 1, 1],
    temp: [66, 66, 66, 66], feels: o.feels || [66, 66, 66, 66] });
  const now = { wind_gusts_10m: 12, weather_code: 1, apparent_temperature: 66 }, run = { i: 1 };
  const boat = (o, seas = 2.4, r = run, c = now) => ctx.boatCall(hours(o), c, r, seas);
  // the boat keeps the water card's thresholds, and says only what tipped it
  assert.equal(boat().call, "go", "a warm, calm afternoon is a boat day");
  assert.equal(boat().why, undefined);
  assert.equal(boat({ gust: [40, 12, 12, 12] }).call, "go", "a blow outside the window does not cancel it");
  assert.deepEqual([boat({ gust: [12, 31, 12, 12] }).call, boat({ gust: [12, 31, 12, 12] }).tip], ["no", "gust"]);
  assert.equal(boat({ gust: [12, 31, 12, 12] }, null).call, "no", "wind strong enough decides without the seas");
  assert.deepEqual([boat({}, 5.2).call, boat({}, 5.2).tip], ["no", "seas"]);
  assert.deepEqual([boat({ gust: [12, 24, 12, 12] }).call, boat({ gust: [12, 24, 12, 12] }).why], ["iffy", "Stick to the ICW"]);
  assert.deepEqual([boat({}, 3.4).call, boat({}, 3.4).tip, boat({}, 3.4).why], ["iffy", "seas", "Stick to the ICW"]);
  assert.deepEqual([boat({}, null).call, boat({}, null).tip, boat({}, null).seas], ["iffy", "seas", null], "no seas reading is never a go");
  assert.equal(boat({ pop: [5, 70, 70, 5] }).why, "Rain likely");
  assert.equal(boat({ feels: [60, 44, 46, 48] }).why, "Cold, feels 44°");
  assert.deepEqual([boat({ code: [1, 1, 95, 1] }).call, boat({ code: [1, 1, 95, 1] }).why], ["no", "Thunder around 3p"]);
  assert.equal(boat({ code: [1, 66, 1, 1] }).why, "Freezing rain");
  assert.equal(boat({ code: [1, 73, 1, 1] }).why, "Snow");
  assert.equal(boat({}, 2.4, { i: 0 }, { ...now, wind_gusts_10m: 33 }).call, "no", "the hour under way reads the live gust");
  assert.equal(boat({}, 2.4, { i: 0 }, { ...now, weather_code: 95 }).why, "Thunder around 1p", "and the live sky");
  assert.equal(boat({}).gust, 12);
  // off the water: the farm says it in its own sentences, everywhere else says it plainly
  const out = (o, kind = "farm") => ctx.outsideCall(hours(o), now, run, kind);
  assert.deepEqual({ ...out() }, { call: "go" });
  assert.deepEqual({ ...out({ code: [1, 66, 1, 1], gust: [12, 31, 12, 12] }) }, { call: "no", why: "Icy. Stay off the hill until it turns over." }, "ice outranks wind");
  assert.deepEqual({ ...out({ gust: [12, 31, 12, 12] }) }, { call: "no", why: "Too windy. Chores can wait." });
  assert.deepEqual({ ...out({ code: [1, 73, 1, 1] }) }, { call: "iffy", why: "Snow coming down. Feed early and keep a path open." });
  assert.deepEqual({ ...out({ gust: [12, 24, 12, 12] }) }, { call: "iffy", why: "Windy up here." });
  assert.deepEqual({ ...out({ pop: [5, 55, 5, 5] }) }, { call: "iffy", why: "Showers around. Slip out between them." });
  assert.deepEqual({ ...out({ feels: [66, 34, 40, 40] }) }, { call: "iffy", why: "Cold one. Bundle up for the morning rounds." });
  assert.deepEqual({ ...out({ code: [1, 1, 95, 1] }) }, { call: "no", why: "Thunder around 3p" });
  assert.equal(out({ gust: [12, 24, 12, 12] }, "coast").why, "Windy");
  assert.equal(out({ gust: [12, 31, 12, 12] }, "coast").why, "Too windy");
  assert.equal(out({ pop: [5, 55, 5, 5] }, "trip").why, "Rain likely");
  assert.equal(out({ feels: [66, 34, 40, 40] }, "coast").why, "Cold, feels 34°");
  assert.equal(out({ code: [1, 66, 1, 1] }, "coast").why, "Freezing rain");
  assert.equal(out({ code: [1, 73, 1, 1] }, "coast").why, "Snow");
  // no ladder speaks for a warning or a storm overhead: the caller says those first
  assert.match(html, /const call=warning\?\{call:"no",why:warning\.event\}\n\s*:storm\?\{call:"no",why:"Thunderstorms"\}/);
  assert.match(html, /const BOAT=\{noGust:30,noSeas:5,iffyGust:22,iffySeas:3,wet:60,cold:50\};/);
  assert.match(html, /const CALL_WORD=\{go:"Go",iffy:"Iffy",no:"No go"\};/);

  // the window is in daylight, give or take civil twilight, and it is said on the hour
  const run24 = (from) => { const t0 = new Date(from).getTime(), time = [];
    for (let i = 0; i < 24; i++) { const d = new Date(t0 + i * 3.6e6);
      time.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`); }
    return { time, temp: time.map(() => 60), pop: time.map(() => 5), gust: time.map(() => 10) }; };
  const december = { time: ["2026-12-12", "2026-12-13"], sunrise: ["2026-12-12T07:10", "2026-12-13T07:11"], sunset: ["2026-12-12T17:04", "2026-12-13T17:04"] };
  const noon = ctx.bestOutsideWindow(run24("2026-12-12T13:00"), true, december);
  assert.equal(noon.text, "now–4p", "a window under way is said from now");
  assert.equal(noon.i, 0);
  assert.equal(noon.today, noon);
  const late = ctx.bestOutsideWindow(run24("2026-12-12T15:00"), true, december);
  assert.match(late.text, / tomorrow$/, "a December afternoon has no three hours of light left after three");
  assert.ok(new Date(late.end) <= new Date("2026-12-13T17:34"));
  assert.equal(late.today, null);
  assert.equal(ctx.bestOutsideWindow(run24("2026-12-12T15:00"), true).isToday, true, "without sunrise and sunset the old frame stands");
  assert.equal(ctx.hourSpan(new Date("2026-08-02T16:00"), new Date("2026-08-02T19:00")), "4–7p");
  assert.equal(ctx.hourSpan(new Date("2026-08-02T11:00"), new Date("2026-08-02T14:00")), "11a–2p");

  // The card says the call and nothing it has already said: no tide sentences, no next tide
  // (the tide eyebrow carries it), no "see the alert above", no wind arrow or speed (the chip
  // is now, the card is the window) and none of the old lead strings.
  assert.doesNotMatch(html, /id="wTide"|id="wWind"|id="wGust"|card-flex/);
  assert.doesNotMatch(html, /"Warning in effect"|See the alert above|watch the shallow spots|mind the shoals|reliable marine reading/);
  assert.doesNotMatch(html, /Light wind, easy air|Plan around the gusts|An easy day on the water/);
  // the seas are asked for two days, and only while the boat is going out
  assert.match(html, /L\.marine&&inSeason\(new Date\(\)\.toLocaleDateString\("en-CA",\{timeZone:L\.tz\}\),L\.boatSeason\)\?fetchJSON\(`https:\/\/marine-api/);
  assert.match(html, /daily=wave_height_max,wave_period_max&timezone=\$\{encodeURIComponent\(L\.tz\)\}&forecast_days=2&/);
  assert.match(html, /wave_height_next:or\(next\)/);
  assert.match(html, /const seasFor=w=>\{const v=w\.isToday\?m\?\.wave_height_max:m\?\.wave_height_next;/);
  // a warning takes the bite times and the piddle window with it
  assert.match(html, /const invited=!!best&&!warning&&!storm&&call\.call!=="no";/);
  assert.match(html, /document\.getElementById\("wWindowWrap"\)\.hidden=!LOC\.windowLabel\|\|!invited;/);
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

  // The first screen is now, the next day and the week, because the weekend is what the family
  // looks for. The week moved up from the foot of the page to sit right under the hours.
  const at = (s) => { const i = html.indexOf(s); assert.ok(i > 0, `${s} should be in the markup`); return i; };
  const order = ['<header class="sky"', "<b>Next 24 hours</b>", '<div class="week">', '<section id="outSection">', '<section id="tideSection">',
    '<section id="stormSection"', '<div class="cards">', '<p class="foot">'].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "sections run in page order");
  assert.match(html, /\.week\{padding:28px 20px 0\}/);
  // and the charts draw in down the page in the same order: REVEAL's keys are that order, and
  // each chart follows whichever chart above it is still drawing
  assert.match(html, /const REVEAL=\{hourly:\{[^}]*\},week:\{[^}]*\},\n  tide:\{[^}]*\},sun:\{[^}]*\}\};/);
  assert.match(html, /const order=Object\.keys\(REVEAL\);\n  for\(const u of order\.slice\(0,order\.indexOf\(k\)\)\)if\(REVEAL\[u\]\.state==="running"\)t0=Math\.max\(t0,REVEAL\[u\]\.t0\+420\);/);
  assert.match(html, /const RV_OF=\{hourlySvg:"hourly",weekSvg:"week",tideSvg:"tide",uvSvg:"sun"\};/);
  assert.match(html, /for\(const id in RV_OF\)io\.observe\(document\.getElementById\(id\)\)/);
  // and a chart the live paint has just pushed below the fold is measured again, not drawn to nobody
  assert.match(html, /if\(!\(b\.height>0&&Math\.min\(b\.bottom,innerHeight\)-Math\.max\(b\.top,0\)>=b\.height\*\.3\)\)\{R\.seen=false;return\}/);
  assert.ok(html.indexOf("renderWeek(wk,css,we);") > 0 && html.indexOf("renderWeek(wk,css,we);") < html.indexOf("if(LOC.tide)renderTides("),
    "the week is armed before the tide, or the tide would not see it running");
  assert.ok(html.indexOf("if(LOC.tide)renderTides(") < html.indexOf("if(uvBar)renderUV("),
    "the sun bar is armed after the tide, or it would not see the tide running");

  // The wind chip is the speed and an arrow into the wind; the compass point is only spoken,
  // and calm air gets no arrow at all. dirTxt stays for the tropics rows.
  const chips = html.slice(html.indexOf("const wNow=Math.round(c.wind_speed_10m)"), html.indexOf('document.getElementById("chips").innerHTML'));
  assert.match(chips, /\[vane\(c\.wind_direction_10m\),`<span class="sr-only">Wind from the \$\{dirLong\(c\.wind_direction_10m\)\}, <\/span>/);
  assert.match(chips, /wNow<1\?\[CI\.wind,"calm"\]/);
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
  assert.match(html, /gust:d\.hourly\.gust&&d\.hourly\.gust\.map\(\(g,i\)=>i\?g:now0\(g,"wind_gusts_10m"\)\)/);

  // The hourly note names the gold band and nothing else: the bars and the headline say the rain.
  assert.doesNotMatch(html, /staying mostly dry|blue bars show rain chance/);
  // The nowcast names what is falling. It said "Rain" through snow and freezing rain at the farm.
  assert.match(html, /const kind=isIce\(w\)\?"Freezing rain":isSnow\(w\)\?"Snow":"Rain";/);
  assert.match(html, /renderNowcast\(d\.nowcast,c\.weather_code,h\)/);
  assert.doesNotMatch(html, /"Rain now, ending ~"/);
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

  // The headline says what is coming, never the sky the label and the scene already show.
  const story = html.slice(html.indexOf("function dayStory("), html.indexOf("/* The farm's sun line"));
  const storyCode = story.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(storyCode, /breaks of sun|breaks in the sky|gray skies|plenty of sun|cloud cover|clear sky|c\.cloud_cover/);
  // and it says windy, the way the family does
  assert.doesNotMatch(storyCode, /blustery|breezy|wind-whipped/i);
  const lift = (re) => { const m = html.match(re); assert.ok(m, `${re} should be extractable`); return m[0]; };
  const ctx = vm.createContext({ bestOutsideWindow: () => null });
  vm.runInContext([
    lift(/const SNOW=\[[\s\S]*?const isWet=w=>WETC\.includes\(w\);/),
    lift(/const hh=t=>\{[^\n]*\};/),
    lift(/const spokenAt=t=>[^\n]*;/),
    lift(/const mdOf=[^\n]*\nconst inSeason=[^\n]*/),
    story,
  ].join("\n"), ctx);
  const dy = { time: ["2026-08-02"], temperature_2m_max: [90] };
  const hours = (from, o = {}) => {
    const t0 = new Date(from.slice(0, 13) + ":00:00Z").getTime();
    const time = Array.from({ length: 24 }, (_, i) => new Date(t0 + i * 3.6e6).toISOString().slice(0, 16));
    return { time, temp: time.map(() => 75), pop: time.map((_, i) => o.pop?.(i) ?? 5), gust: time.map((_, i) => o.gust?.(i) ?? 10) };
  };
  const tell = (c, o, loc = { id: "sp" }) => {
    ctx.LOC = loc;
    return ctx.dayStory({ relative_humidity_2m: 50, apparent_temperature: c.temperature_2m, ...c }, dy, hours(c.time, o)).html;
  };
  // after midnight the night is graded by the air it is in, not by the new day's forecast high
  assert.equal(tell({ time: "2026-08-02T01:15", temperature_2m: 70, weather_code: 1 }), "Mild tonight. Should stay dry.");
  assert.equal(tell({ time: "2026-08-02T19:15", temperature_2m: 84, weather_code: 1 }), "Warm this evening. Should stay dry.");
  // a night is warm from 74, where the Tonight card calls it warm, and under 40 it is cold
  assert.equal(tell({ time: "2026-08-02T23:10", temperature_2m: 78, weather_code: 2 }), "Warm tonight. Should stay dry.");
  assert.equal(tell({ time: "2026-08-02T19:15", temperature_2m: 35, weather_code: 1 }), "Cold this evening. Should stay dry.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 88, weather_code: 1, relative_humidity_2m: 80 }), "Warm and soupy today. Should stay dry.");
  // a live gust in hour 0 is a windy headline; one later in the day is named by its hour
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i ? 12 : 30) }), "Warm today. Dry, but windy now.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 3 }, { gust: (i) => (i === 3 ? 31 : 12) }), "Warm today. Dry, but windy by 4 p.m.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 1 }, { pop: (i) => (i === 2 ? 80 : 5) }), "Warm today. Rain likely around 3 p.m.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 1 }, { pop: (i) => (i === 2 ? 45 : 5) }), "Warm today. Showers possible around 3 p.m.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 1 }, { pop: () => 30 }), "Warm today. Maybe a stray shower.");
  assert.equal(tell({ time: "2026-08-02T13:00", temperature_2m: 80, weather_code: 63 }, { pop: (i) => (i < 3 ? 80 : 10) }), "Raining now. Should let up around 4 p.m.");
  assert.equal(tell({ time: "2026-08-02T15:00", temperature_2m: 70, weather_code: 45 }), "Foggy. Should stay dry.");
  assert.equal(tell({ time: "2026-08-02T08:00", temperature_2m: 70, weather_code: 45 }), "Foggy this morning. Should stay dry.");
  assert.match(tell({ time: "2026-08-02T08:00", temperature_2m: 31, weather_code: 66 }, { pop: () => 90 }), /^Freezing rain\. Expect ice on anything untreated\. Give yourself extra time on the roads\./);
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

test("the copy harness keeps looking at the days the call and the weekend are about", async () => {
  const shots = await readFile(new URL("tools/shots.mjs", root), "utf8");
  const fixtures = await readFile(new URL("tools/fixtures.mjs", root), "utf8");
  // each scenario is there for one day of the week or one season, so its date has to stay that day
  const when = (name) => { const m = shots.match(new RegExp(`name: "${name}", loc: "(\\w+)", when: "([^"]+)"`)); assert.ok(m, `${name} should be in tools/shots.mjs`); return { loc: m[1], d: new Date(m[2]) }; };
  const md = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const inSeason = (d) => md(d) >= "03-15" && md(d) <= "10-31";
  const sun = when("15-wet-week-shady-spring"), sat = when("16-saturday-porters-neck"), nov = when("17-off-season-saturday-porters-neck");
  const jan = when("18-january-porters-neck"), seas = when("19-no-seas-porters-neck");
  assert.equal(sun.d.getDay(), 0, "the eight-column week is a Sunday");
  assert.equal(sat.d.getDay(), 6, "the weekend-is-today scenario is a Saturday");
  assert.ok(sat.loc === "mb" && inSeason(sat.d));
  assert.ok(nov.d.getDay() === 6 && nov.loc === "mb" && !inSeason(nov.d), "a coast Saturday off season");
  assert.ok(jan.d.getMonth() === 0 && jan.loc === "mb" && !inSeason(jan.d), "a January coast day");
  assert.ok(seas.loc === "mb" && inSeason(seas.d) && /wave: null/.test(shots), "a boat-season day with no seas");
  // and each says what it is there to show, so the harness fails when it stops showing it
  assert.match(shots, /expect: \{ cols: 8, weekend: \["Sat", "Sun"\] \}/);
  assert.match(shots, /expect: \{ cols: 7, weekend: \["Today", "Sun"\], note: /);
  assert.match(shots, /out: "Outside · Porters Neck", marine: 0, detail: 0/);
  assert.match(shots, /call: "Iffy", why: \/\^Cold, feels \\d\+°\$\/, sun: "\(steps aside\)", marine: 0/);
  assert.match(shots, /out: "On the water · Figure 8", call: "Iffy", detail: \/seas unavailable\//);
  assert.match(shots, /if \(r\.url\(\)\.includes\("marine-api\.open-meteo\.com"\)\) marineAsks\+\+;/);
  // the readout prints what is seen: the compass point and the bite framing are spoken only
  assert.match(shots, /k\.querySelectorAll\("\.sr-only"\)\.forEach\(\(x\) => x\.remove\(\)\)/);
  for (const sel of ['"#waterLead .call-word"', '"#waterLead .call-when"', 'shown("callWhy")', '"#outSection .out-line:not([hidden])"', '"sunCard"', 'T("eveLead")', 'T("weekNote")'])
    assert.ok(shots.includes(sel), `the copy readout reads ${sel}`);
  // the fixtures serve the eight days the week needs and the two days of seas the call reads
  assert.match(fixtures, /export const DAYS = 8;/);
  assert.match(fixtures, /wave_height_max: \[w0, "waveNext" in o \? o\.waveNext : w0\]/);
});

test("installable assets exist", async () => {
  await Promise.all([
    access(new URL("icon-180.png", root)),
    access(new URL("icon-512.png", root)),
  ]);
});

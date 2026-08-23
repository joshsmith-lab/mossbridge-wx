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
  assert.match(worker, /mbwx-shell-v54/);
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
  assert.match(html, /pop>=5\?`\$\{pop\} percent chance of rain`/);
  assert.match(html, /pointercancel",\(\)=>\{PEEK_TOUCH_X=null/);
  assert.match(html, /id="hourlyPeekLive" aria-live="polite"/);

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

test("each location keeps its own clock", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // Every place carries its zone and the label it is quoted in.
  assert.match(html, /tz:"America\/New_York",tzLabel:"ET"/);
  assert.match(html, /tz:"America\/Denver",tzLabel:"MT"/);
  assert.doesNotMatch(html, /timezone=America%2FNew_York/);
  assert.match(html, /&timezone=\$\{encodeURIComponent\(L\.tz\)\}&forecast_days=7/);
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
  assert.match(html, /M 18\.6 34\.2 L 20\.2 40\.2/);
  assert.match(html, /class="heron-tarsus"/);
  assert.match(html, /@keyframes heronFace/);
  assert.match(html, /class="heron-lunge"/);
  // turn is late and brief; legs flip with the body; spear is a hip tip not a torn-off neck
  assert.match(html, /88\.2%\{transform:scaleX\(\.55\) rotate\(-5deg\)\}/);
  assert.doesNotMatch(html, /scaleX\(\.12\)/);
  assert.doesNotMatch(html, /rotate\(-80deg\)/);
  assert.match(html, /class="heron-splash"/);
  assert.match(html, /40\.8%,43\.6%\{transform:translate\(-1px,2\.8px\) rotate\(-20deg\)\}/);
  assert.match(html, /40\.8%,43\.6%\{transform:rotate\(-26deg\) translate\(0,3\.2px\)\}/);
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
  // the residents are solid ink now: no more grass reading through a bird
  assert.match(html, /const owlAt=\(x,y,s,opacity=\.96\)/);
  assert.match(html, /const frogAt=\(x,y,s,opacity=\.96\)/);
  assert.match(html, /const crabAt=\(x,y,s,opacity=\.96\)/);
  assert.match(html, /const raccoon=\(x,y,s,o=\.96\)/);
  // residents stay intact; the landscape gives each silhouette a quiet natural pocket
  assert.match(html, /Math\.abs\(x-residentX\)<26\)ht\*=\.28/);
  assert.match(html, /const animalLeft=barnX-48,animalRight=barnX\+48,rightTreeX=W\*\.955/);
  assert.match(html, /const yard=x>animalLeft-18&&x<animalRight\+22/);
  assert.match(html, /class="barn" data-scene-anchor="barn"/);
  assert.match(html, /deerAt\(animalRight\+14/);
  // the body has a waist: haunch, tuck, brisket — not a bean
  assert.match(html, /4\.6 12\.8 C 6\.0 12\.6 6\.8 10\.2 8\.4 8\.8/);
  assert.match(html, /deer\?"":dark\?fox\(animalRight-14/);
  // the small shorebird's bill sits against open water, not the dark bank
  assert.match(html, /oysterCatcher\(residentX,base\+9,1\.1,1\)/);
  // Shady Spring gets asymmetric Appalachian folds, a real gambrel barn, and bare winter trees
  assert.match(html, /const ridgeProfiles=\[/);
  assert.match(html, /const winter=month===11\|\|month<=1\|\|snowing/);
  assert.match(html, /a broken gambrel/);
  assert.match(html, /M 13\.4 16 L 22\.6 26\.5 M 22\.6 16 L 13\.4 26\.5/);

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
  assert.match(html, /barnX\+yard\*\.30,base\+13\.2,\.74,"scratch",19,-1/);
  assert.match(html, /barnX\+yard\*\.56,base\+12,\.88,"peck",15/);
  assert.match(html, /barnX\+yard\*\.82,base\+13,\.76,"look",23/);
  assert.match(html, /:\(!wet&&!storm\)\?chickens\(barnX,rightTreeX,base\)/);

  // light: the sun flattens near the horizon, the meteor waits for a clear night
  assert.match(html, /const squash=clamp\(\.9\+Math\.max\(0,sunAltDeg\)\/8\*\.1,\.9,1\)/);
  assert.match(html, /if\(night>\.55&&cloud<30&&!PRM\)/);
  assert.match(html, /const golden=altDeg>-4\.5&&altDeg<6\.5/);
  // only the low third of the sky scintillates, so the night is ~30 animations not 110
  assert.match(html, /const tw=s\.y>52/);
  // heat haze is a marsh-at-high-UV thing, never a decoration
  assert.match(html, /\(Number\(weather\.uv_index\)\|\|0\)>=8&&sunAltDeg>40&&!wet&&!storm&&!PRM/);

  // charts: the line draws in once, on live data, and the skiff sets with the tide
  assert.match(html, /if\(live&&!LINE_DRAWN&&!PRM\)/);
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
  assert.match(html, /Freezing rain is falling\. Expect ice on anything untreated\./);
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
  assert.match(html, /nightPop>=35&&nightSnow\?`Snow is likely at times/);
  assert.match(html, /isSnow\(dy\.weather_code\[wi\]\)\?"snow"/);
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
  assert.match(html, /comfort\?"What to wear":"Sun & heat"/);
  assert.match(html, /Warm coat, gloves, and waterproof shoes/);
  assert.match(html, /T-shirt weather\. Bring a light layer for tonight/);
  assert.match(html, /id="uvDetails"/);
  // the pond dimples during a bite window, off the same moon the card reads
  assert.match(html, /solunarWindows\(now\)\.some\(w=>now>=w\.start&&now<=w\.end\)/);
  // and the footer says where the bite times come from
  assert.match(html, /Bite windows: solunar tables, computed from the moon/);
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
  assert.match(html, /if\(!storm\|\|PRM\)return""/);
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
  assert.match(html, /function bestOutsideWindow\(h,coastal\)/);
  // the window stays on today unless today is out of daylight or genuinely rough
  assert.match(html, /const bToday=pick\(cands\.filter\(c=>c\.isToday\)\)/);
  assert.match(html, /rough&&bTom&&bTom\.score<bToday\.score\*\.6/);
  // the window is a stat, printed once, on the card. It used to be appended to the verdict
  // paragraph as well, which said it twice and ran the headline to four lines on a phone.
  assert.doesNotMatch(html, /Best outside stretch:/);
  assert.match(html, /<span id="wWindowLbl">best window<\/span><b id="wWindow">/);
  // each place keeps its own plain-language answer to "when should I go out?"
  assert.match(html, /windowLabel:"best window"/);
  assert.match(html, /windowLabel:"best time to piddle"/);
  assert.match(html, /windowLabel:"best time to head out"/);
  assert.match(html, /id="goldenband"/);
  assert.match(html, /one local wildlife cue at a time/);
  assert.match(html, /seasonalFlies/);
  assert.match(html, /function sunProtectionAdvice\(c,dy,h,now\)/);
  assert.match(html, /Sunscreen weather from /);
  assert.match(html, /Sunscreen weather until /);
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
  assert.match(html, /class="day-detail"/);
  assert.match(html, /moonPhaseIcon/);
  assert.doesNotMatch(html, /phaseName/);
  assert.match(html, /flight-wing/);
  assert.match(html, /deer-ear/);
  // "soupy" is earned, not decorative: real humidity sitting on real heat
  assert.match(html, /soupy\?", soupy":humid\?", humid":""/);
  assert.match(html, /id="sunTitle">Sun &amp; heat</);
  assert.doesNotMatch(html, />UV · sun exposure</);
  assert.doesNotMatch(html, />Evening outlook</);
});

test("Denver is an isolated third travel scene, not a rewrite of either family place", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /den:\{id:"den",addrFull:"Next up · Denver"/);
  assert.match(html, /lat:39\.7392,lon:-104\.9903,scene:"front-range",kind:"trip"/);
  assert.match(html, /const LOC_ORDER=\["mb","sp","den"\]/);
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
  assert.match(html, /renderTides\(d\.tides,css,c\.wind_gusts_10m\)/);
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
  assert.match(html, /32%,40%\{transform:rotate\(66deg\)\}/);
  assert.match(html, /deerGraze 48s/);
  assert.match(html, /@keyframes flagFlick/);
  assert.match(html, /class="buck-regard"/);
  assert.match(html, /class="buck-threeq"/);
  assert.doesNotMatch(html, /@keyframes buckTurn/);
  // hind leg: a gentle S, stifle then hock — not a lightning bolt
  assert.match(html, /M 5\.0 11\.4 L 5\.6 14\.8 L 4\.6 17\.4 L 4\.8 20\.8/);
  assert.doesNotMatch(html, /M 5\.0 11\.6 L 6\.2 14\.8 L 4\.0 17\.6/);
  assert.match(html, /21\.6 -13\.2/);
  // mule deer stands: ear and tail only. The graze clock hid the ears and read as a rodent.
  assert.match(html, /class="mule-head"/);
  assert.match(html, /!dark&&!deerOut&&!storm\?magpieAt/);
  assert.match(html, /:\(!wet&&!storm\)\?chickens/);
  assert.match(html, /:storm\?"":oysterCatcher/);
  assert.match(html, /raccoon\(residentX,base\+7,1\.36,1\)/);
  assert.match(html, /@keyframes perchHop/);
  assert.match(html, /@keyframes groundHop/);
  assert.match(html, /@keyframes cormSettle/);
  assert.match(html, /class="corm-neck"/);
  assert.match(html, /if\(wind<8\)waterWeather\+=ringAt/);
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
  // the water card is named for the water Josh actually runs
  assert.match(html, /On the water · Figure 8/);
  assert.doesNotMatch(html, /On the water · Mason Inlet/);
});

test("installable assets exist", async () => {
  await Promise.all([
    access(new URL("icon-180.png", root)),
    access(new URL("icon-512.png", root)),
  ]);
});

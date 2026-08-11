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
  assert.doesNotMatch(html, /marine=\{wave_height_max:2\.5,wave_period_max:5\}/);
  assert.match(worker, /controller\.abort\(\),4000/);
  assert.match(worker, /mbwx-shell-v32/);
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

  // Feels-like is real hourly data, revealed only when it differs enough to matter.
  assert.match(html, /hourly=temperature_2m,apparent_temperature,precipitation_probability/);
  assert.match(html, /feels:wj\.hourly\.apparent_temperature\?\.slice\(i0,i0\+24\)/);
  assert.match(html, /const showFeels=Math\.abs\(feels-temp\)>=3/);
  assert.match(html, /function setupHourlyPeek\(\)/);
  assert.match(html, /e\.key==="ArrowRight"/);
  assert.match(html, /id="hourlyPeekLive" aria-live="polite"/);

  // The two tiny-looking masthead controls remain full touch targets and keyboard operable.
  assert.match(html, /id="locBtn" role="button" tabindex="0"/);
  assert.match(html, /id="refreshBtn" role="button" tabindex="0"/);
  assert.match(html, /min-height:44px/);
  assert.match(html, /keyboardClick\(document\.getElementById\("refreshBtn"\),refresh\)/);
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
  assert.match(html, /Math\.abs\(x-residentX\)<20\)ht\*=\.28/);
  assert.match(html, /if\(yard\)ht\*=\.3/);
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
});

test("the almanac fishes the farm pond, and the coast keeps the sunscreen", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // solunar is folklore built on honest astronomy, and the code says so out loud
  assert.match(html, /function solunarWindows\(now\)/);
  assert.match(html, /The theory is folklore; the moon times are real/);
  // majors are two hours around transit and underfoot, minors one hour around rise and set
  assert.match(html, /const half=\(major\?60:30\)\*6e4/);
  // the farm card gets the windows; a warned storm takes them away
  assert.match(html, /const fishOn=!coastal&&!storm/);
  assert.match(html, /id="wFishWrap"/);
  // the ridge sun line states when, never what to wear; the kids' language stays coastal
  assert.match(html, /function ridgeSunLine\(c,dy,h,now\)/);
  assert.match(html, /LOC\.scene==="ridge"\?ridgeSunLine\(c,dy,h,now\):sunProtectionAdvice\(c,dy,h,now\)/);
  assert.match(html, /Strongest sun /);
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
  // the sun line uses a clean thread and one boundary bead, not stacked highlighter bars
  assert.match(html, /stroke="#E7A73D" stroke-width="2\.1"/);
  assert.match(html, /const boundary=a<\.5\?b:a,bx=px\(boundary\),by=py\(boundary\)/);
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
  // the farm calls it what the farm calls it; the boat keeps the boat's language
  assert.match(html, /coastal\?"best window":"best time to piddle"/);
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
  assert.match(html, />Sun &amp; heat</);
  assert.doesNotMatch(html, />UV · sun exposure</);
  assert.doesNotMatch(html, />Evening outlook</);
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

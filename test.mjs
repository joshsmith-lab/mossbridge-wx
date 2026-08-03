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
  assert.match(worker, /mbwx-shell-v15/);
});

test("plain-language and living-scene refinements stay in place", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /function dayStory\(c,dy,h\)/);
  assert.match(html, /function bestOutsideWindow\(h,coastal\)/);
  assert.match(html, /Best outside stretch:/);
  assert.match(html, /id="goldenband"/);
  assert.match(html, /one local wildlife cue at a time/);
  assert.match(html, /seasonalFlies/);
  assert.match(html, /function sunProtectionAdvice\(c,dy,h,now\)/);
  assert.match(html, /Wear SPF 30\+/);
  assert.doesNotMatch(html, /Wear broad-spectrum SPF 30\+/);
  assert.match(html, /Reapply after two hours outdoors/);
  assert.match(html, /class="wildlife heron"/);
  assert.match(html, /const owlAt=/);
  assert.match(html, /const frogAt=/);
  assert.match(html, /const crabAt=/);
  assert.doesNotMatch(html, /marshDeer/);
  assert.match(html, /one useful read, rather than another row of weather instruments/);
  assert.doesNotMatch(html, /id="eveWind"/);
  assert.match(html, /const labelTimeY=15,labelValueY=29,labelRailY=35/);
  assert.match(html, /function dailyBrief\(dy,i\)/);
  assert.match(html, /class="day-detail"/);
  assert.match(html, /moonPhaseIcon/);
  assert.doesNotMatch(html, /phaseName/);
  assert.match(html, /bird-wing/);
  assert.match(html, /deer-ear/);
  assert.match(html, /Golden Hour/);
  assert.match(html, />Sun &amp; heat</);
  assert.match(html, />Tonight</);
  assert.doesNotMatch(html, />UV · sun exposure</);
  assert.doesNotMatch(html, />Evening outlook</);
});

test("installable assets exist", async () => {
  await Promise.all([
    access(new URL("icon-180.png", root)),
    access(new URL("icon-512.png", root)),
  ]);
});

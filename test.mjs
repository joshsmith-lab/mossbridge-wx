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
});

test("installable assets exist", async () => {
  await Promise.all([
    access(new URL("icon-180.png", root)),
    access(new URL("icon-512.png", root)),
  ]);
});

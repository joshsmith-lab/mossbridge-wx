/**
 * Previews of Porters Neck from across the pond, for Josh. renderScene draws it when window.PN_SHOW is
 * {opt:"A"} at Porters Neck; without it the scene is today's marsh, unchanged. This serves the page on
 * the shared fixtures, sets PN_SHOW before the page loads, and writes the header (the sky and its scene)
 * for the preview and for today's scene, at a September noon, dusk and night and an October night.
 *
 *   TZ=America/New_York node tools/pn-mock.mjs                 # every option, every time, at 390
 *   TZ=America/New_York node tools/pn-mock.mjs A night         # only the shots whose tag matches
 *   PORCH_PN_WIDTHS=320,390 TZ=America/New_York node tools/pn-mock.mjs
 *
 * Writes tools/shots/pn/pn-<option>-<time>-<width>.png (the header) and pn-...-near.png (the lower half of
 * the scene alone, for the small things). Exits non-zero on a page error.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { serve, stage, ROOT } from "./fixtures.mjs";

const OUT = path.join(ROOT, "tools", "shots", "pn");
const FONT_DIR = process.env.PORCH_FONT_DIR || "";
const PORT = Number(process.env.PORCH_PORT || 8841);
const WIDTHS = (process.env.PORCH_PN_WIDTHS || "390").split(",").map(Number);
const ONLY = process.argv.slice(2);

/* late September and late October at Porters Neck. The September night is half past one, when the moon
   two days past full stands on the roof's ridge; most of the evening it is behind the roof */
const SEP = { sunrise: "07:03", sunset: "19:10", popCurve: () => 4, dailyPop: (p) => p.fill(8), uvMax: 6 };
const OCT = { sunrise: "07:27", sunset: "18:23", popCurve: () => 4, dailyPop: (p) => p.fill(8), uvMax: 4 };
const TIMES = [
  { name: "sep-noon", when: "2026-09-23T13:10:00",
    o: { ...SEP, baseTemp: 78, nowTemp: 82, feels: 84, rh: 58, isDay: 1, code: 1, cloud: 22, nowWind: 7, nowDir: 200, nowGust: 12, nowUv: 6.1, windAmp: 4, gustAmp: 5 } },
  { name: "sep-dusk", when: "2026-09-23T19:26:00",
    o: { ...SEP, baseTemp: 68, nowTemp: 66, feels: 66, rh: 66, isDay: 0, code: 0, cloud: 8, nowWind: 4, nowDir: 200, nowGust: 8, nowUv: 0, windAmp: 3, gustAmp: 2 } },
  { name: "sep-night", when: "2026-09-28T01:30:00",
    o: { ...SEP, baseTemp: 66, nowTemp: 64, feels: 64, rh: 72, isDay: 0, code: 0, cloud: 4, nowWind: 2, nowDir: 30, nowGust: 5, nowUv: 0, windAmp: 2, gustAmp: 1 } },
  { name: "oct-night", when: "2026-10-24T21:30:00",
    o: { ...OCT, baseTemp: 60, nowTemp: 58, feels: 58, rh: 72, isDay: 0, code: 0, cloud: 4, nowWind: 3, nowDir: 30, nowGust: 6, nowUv: 0, windAmp: 2, gustAmp: 1 } },
];
const OPTS = [["today", null], ["A", { opt: "A" }]];

let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.error("playwright is not installed"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const server = await serve(PORT, FONT_DIR);
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
let failed = false;
for (const T of TIMES) for (const [opt, show] of OPTS) for (const width of WIDTHS) {
  const tag = `${opt}-${T.name}-${width}`;
  if (ONLY.length && !ONLY.every((o) => tag.includes(o))) continue;
  const ctx = await browser.newContext({ viewport: { width, height: 932 }, deviceScaleFactor: 3, timezoneId: "America/New_York" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await stage(page, { now: new Date(T.when), loc: "mb", o: T.o, fontDir: FONT_DIR, port: PORT });
  if (show) await page.addInitScript((s) => { window.PN_SHOW = s; }, show);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => !document.getElementById("refreshBtn")?.classList.contains("spin")
      && document.getElementById("stamp")?.textContent !== "—", { timeout: 15000 });
  } catch { errs.push("the page never finished its first paint"); }
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(() => typeof finishReveal === "function" && finishReveal());
  const info = await page.evaluate(() => ({ anims: document.getAnimations().filter((a) => a.playState === "running").length,
    deer: document.querySelectorAll("#sceneSvg .deer, #sceneSvg .doe").length, fire: document.querySelectorAll("#sceneSvg .pn-flame").length }));
  await page.locator(".sky").screenshot({ path: path.join(OUT, `pn-${tag}.png`) }).catch((e) => errs.push("sky shot: " + e.message));
  /* and the lower half of the scene alone, for the small things (the fire table, the chairs, the dial, the does) */
  const box = await page.locator("#sceneSvg").boundingBox();
  if (box) await page.screenshot({ path: path.join(OUT, `pn-${tag}-near.png`), clip: { x: box.x, y: box.y + box.height * .45, width: box.width, height: box.height * .55 } }).catch((e) => errs.push("near shot: " + e.message));
  console.log(`${tag}: ${info.anims} animations, deer ${info.deer}, flames ${info.fire}${errs.length ? "\n  " + errs.join("\n  ") : ""}`);
  if (errs.length) failed = true;
  await ctx.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);

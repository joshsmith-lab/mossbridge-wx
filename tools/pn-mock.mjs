/**
 * Mockups of a redone Porters Neck scene, for Josh to choose from. The marsh branch of renderScene
 * reads window.PN_SHOW ({opt:"A"|"B"|"C"}); without it the scene is today's, unchanged. This serves
 * the page on the shared fixtures at Porters Neck, sets PN_SHOW before the page loads, and writes the
 * header (the sky and its scene) for each option and for today's scene, at three October times.
 *
 *   TZ=America/New_York node tools/pn-mock.mjs                 # every option, every time, at 390
 *   TZ=America/New_York node tools/pn-mock.mjs A night         # only the shots whose tag matches
 *   PORCH_PN_WIDTHS=320,390 TZ=America/New_York node tools/pn-mock.mjs
 *
 * Writes tools/shots/pn/pn-<option>-<time>-<width>.png. Exits non-zero on a page error.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { serve, stage, ROOT } from "./fixtures.mjs";

const OUT = path.join(ROOT, "tools", "shots", "pn");
const FONT_DIR = process.env.PORCH_FONT_DIR || "";
const PORT = Number(process.env.PORCH_PORT || 8841);
const WIDTHS = (process.env.PORCH_PN_WIDTHS || "390").split(",").map(Number);
const ONLY = process.argv.slice(2);

/* mid-October at Porters Neck: the sun up about 7:22 and down about 6:30 */
const OCT = { sunrise: "07:22", sunset: "18:30", popCurve: () => 4, dailyPop: (p) => p.fill(8), uvMax: 5 };
const TIMES = [
  { name: "noon", when: "2026-10-20T13:10:00",
    o: { ...OCT, baseTemp: 68, nowTemp: 72, feels: 72, rh: 55, isDay: 1, code: 1, cloud: 20, nowWind: 7, nowDir: 200, nowGust: 12, nowUv: 4.6, windAmp: 4, gustAmp: 5 } },
  { name: "dusk", when: "2026-10-20T18:44:00",
    o: { ...OCT, baseTemp: 62, nowTemp: 64, feels: 64, rh: 66, isDay: 0, code: 0, cloud: 8, nowWind: 4, nowDir: 200, nowGust: 8, nowUv: 0, windAmp: 3, gustAmp: 2 } },
  { name: "night", when: "2026-10-20T21:30:00",
    o: { ...OCT, baseTemp: 60, nowTemp: 60, feels: 60, rh: 72, isDay: 0, code: 0, cloud: 4, nowWind: 3, nowDir: 30, nowGust: 6, nowUv: 0, windAmp: 2, gustAmp: 1 } },
];
const OPTS = [["today", null], ["A", { opt: "A" }], ["B", { opt: "B" }], ["C", { opt: "C" }]];

let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.error("playwright is not installed"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const server = await serve(PORT, FONT_DIR);
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
let failed = false;
for (const T of TIMES) for (const [opt, show] of OPTS) for (const width of WIDTHS) {
  const tag = `${opt}-${T.name}-${width}`;
  if (ONLY.length && !ONLY.every((o) => tag.split("-").includes(o))) continue;
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
    deer: document.querySelectorAll("#sceneSvg .deer").length, fire: document.querySelectorAll("#sceneSvg .pn-flame").length }));
  await page.locator(".sky").screenshot({ path: path.join(OUT, `pn-${tag}.png`) }).catch((e) => errs.push("sky shot: " + e.message));
  console.log(`${tag}: ${info.anims} animations, deer ${info.deer}, flames ${info.fire}${errs.length ? "\n  " + errs.join("\n  ") : ""}`);
  if (errs.length) failed = true;
  await ctx.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);

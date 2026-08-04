/**
 * Copy and layout review for Porch Weather.
 *
 * Renders index.html across a spread of scenarios with mocked upstream data and
 * a shifted clock, writes screenshots to tools/shots/, and prints the copy the
 * app generated so wording changes are reviewable as text.
 *
 * For the scene and its motion, use tools/scene.mjs instead.
 *
 *   npm i playwright && npx playwright install chromium
 *   TZ=America/New_York node tools/shots.mjs
 *
 * Run it with TZ=America/New_York. The mocked data is written in local time, so
 * under any other zone the page and the fixture disagree about what time it is
 * and every sun, scene and golden-hour check is wrong.
 *
 * Set PORCH_FONT_DIR to a folder holding bricolage.woff2 and spline.woff2 when
 * Google Fonts is unreachable. Without the real faces the type metrics are wrong
 * and alignment work is misleading.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { serve, stage } from "./fixtures.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
const FONT_DIR = process.env.PORCH_FONT_DIR || "";
const PORT = Number(process.env.PORCH_PORT || 8799);

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed.\n  npm i playwright && npx playwright install chromium");
  process.exit(1);
}

const CASES = [
  { name: "01-day-porters-neck", loc: "mb", when: "2026-08-02T14:20:00",
    o: { baseTemp: 86, nowTemp: 93, feels: 101, rh: 66, isDay: 1, code: 1, cloud: 22, nowWind: 9, nowDir: 214, nowGust: 16, nowUv: 8.4, uvMax: 9, windAmp: 9, gustAmp: 14,
      popCurve: (i, hr) => (i >= 38 && i <= 44 ? 55 : hr > 14 && hr < 20 ? 22 : 5),
      dailyPop: (p) => { p[1] = 35; p[2] = 72; p[3] = 40; p[4] = 25; p[5] = 20; p[6] = 15; } } },
  { name: "02-night-porters-neck", loc: "mb", when: "2026-08-02T23:10:00",
    o: { baseTemp: 80, nowTemp: 78, feels: 82, rh: 84, isDay: 0, code: 2, cloud: 48, nowWind: 5, nowDir: 38, nowGust: 9, nowUv: 0, uvMax: 9, windAmp: 6, gustAmp: 9,
      popCurve: () => 8, dailyPop: (p) => p.fill(20) } },
  { name: "03-storm-porters-neck", loc: "mb", when: "2026-08-02T16:45:00",
    o: { baseTemp: 84, nowTemp: 81, feels: 88, rh: 88, isDay: 1, code: 95, cloud: 96, nowWind: 17, nowDir: 250, nowGust: 34, nowUv: 1.2, uvMax: 8, windAmp: 14, gustAmp: 26, nowcast: true,
      popCurve: (i, hr) => (hr >= 14 && hr <= 21 ? 78 : 20),
      dailyPop: (p) => { p[0] = 85; p[1] = 65; p[2] = 45; } } },
  { name: "04-morning-shady-spring", loc: "sp", when: "2026-08-02T09:05:00",
    o: { baseTemp: 70, nowTemp: 71, feels: 71, rh: 72, isDay: 1, code: 2, cloud: 55, nowWind: 7, nowDir: 305, nowGust: 12, nowUv: 4.1, uvMax: 7, windAmp: 7, gustAmp: 11,
      popCurve: (i, hr) => (hr >= 15 && hr <= 19 ? 30 : 8),
      dailyPop: (p) => { p.fill(25); p[3] = 45; } } },
  { name: "05-dusk-shady-spring", loc: "sp", when: "2026-08-02T19:58:00",
    o: { baseTemp: 70, nowTemp: 72, feels: 72, rh: 74, isDay: 1, code: 1, cloud: 18, nowWind: 5, nowDir: 290, nowGust: 9, nowUv: 0.4, uvMax: 7, windAmp: 6, gustAmp: 10,
      popCurve: () => 6, dailyPop: (p) => p.fill(15) } },
  { name: "06-dusk-porters-neck", loc: "mb", when: "2026-08-02T19:58:00",
    o: { baseTemp: 84, nowTemp: 86, feels: 92, rh: 70, isDay: 1, code: 1, cloud: 20, nowWind: 8, nowDir: 200, nowGust: 14, nowUv: 0.5, uvMax: 9, windAmp: 8, gustAmp: 13,
      popCurve: () => 10, dailyPop: (p) => p.fill(20) } },
  // should say "today": a fine afternoon must not be displaced by a calmer tomorrow morning
  { name: "07-fine-afternoon-shady-spring", loc: "sp", when: "2026-08-02T15:10:00",
    o: { baseTemp: 72, nowTemp: 78, feels: 78, rh: 52, isDay: 1, code: 1, cloud: 12, nowWind: 6, nowDir: 280, nowGust: 11, nowUv: 6.2, uvMax: 8, windAmp: 6, gustAmp: 10,
      popCurve: () => 5, dailyPop: (p) => p.fill(10) } },
  // should say "tomorrow": today is a washout, tomorrow is clear
  { name: "08-washout-porters-neck", loc: "mb", when: "2026-08-02T13:40:00",
    o: { baseTemp: 84, nowTemp: 88, feels: 97, rh: 80, isDay: 1, code: 3, cloud: 85, nowWind: 14, nowDir: 210, nowGust: 26, nowUv: 3.1, uvMax: 8, windAmp: 12, gustAmp: 22,
      popCurve: (i, hr) => (hr >= 13 && hr <= 20 ? 80 : 15),
      dailyPop: (p) => { p[0] = 85; p[1] = 20; } } },
];

mkdirSync(OUT, { recursive: true });
const server = await serve(PORT, FONT_DIR);
if (!FONT_DIR) console.warn("PORCH_FONT_DIR is unset: falling back to whatever Google Fonts returns. Type metrics may be wrong.\n");

const browser = await chromium.launch();
let failures = 0;
for (const cs of CASES) {
  for (const vp of [{ w: 390, h: 1500, tag: "phone" }, { w: 900, h: 1500, tag: "wide" }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, timezoneId: "America/New_York" });
    const page = await ctx.newPage();
    const now = new Date(cs.when);
    await stage(page, { now, loc: cs.loc, o: cs.o, fontDir: FONT_DIR, port: PORT });

    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(OUT, `${cs.name}-${vp.tag}.png`), fullPage: vp.tag === "wide" });

    if (vp.tag === "phone") {
      for (const [sel, suffix] of [[".sky", "hero"], ["#tideSection", "tide"]]) {
        try { await page.locator(sel).screenshot({ path: path.join(OUT, `${cs.name}-${suffix}.png`) }); } catch {}
      }
      try {
        if (await page.locator("#alertStrip.on").count()) {
          await page.locator("#alertStrip").click();
          await page.waitForTimeout(500);
          await page.locator("#alertStrip").screenshot({ path: path.join(OUT, `${cs.name}-alert.png`) });
        }
      } catch {}
      const copy = await page.evaluate(() => {
        const T = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
        return {
          verdict: T("verdict"), condition: T("condLabel"), stamp: T("stamp"),
          chips: [...document.querySelectorAll(".chip")].map((c) => c.textContent.trim()),
          water: T("waterLead"), wind: T("wWind"), window: T("wWindow"), fish: T("wFish"),
          sun: T("uvLead"), tonight: T("eveLead"),
          tideNote: T("tideNote"), hourlyNote: T("hourlyNote"), weekNote: T("weekNote"),
        };
      });
      console.log(`\n### ${cs.name}`);
      console.log(JSON.stringify(copy, null, 1));
    }
    if (errs.length) { failures++; console.log(`!! ${cs.name} ${vp.tag}: ${errs.join(" | ")}`); }
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(`\nwrote screenshots to ${OUT}`);
if (failures) { console.error(`${failures} scenario(s) logged page errors`); process.exit(1); }

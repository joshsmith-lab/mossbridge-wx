/**
 * The house at Porters Neck from across the pond (pnPondScene), in every light and weather it has to look
 * right in: shoots the sky block (the header with its scene) and a close crop of the lower scene for each
 * moment, so the picture can be reviewed at phone size without waiting for the weather.
 *
 *   TZ=America/New_York node tools/pond.mjs                 # every moment at 390 (the main four at every width)
 *   TZ=America/New_York node tools/pond.mjs night           # only the moments whose name matches
 *   PORCH_PN_WIDTHS=390,320,430 TZ=America/New_York node tools/pond.mjs
 *
 * Writes tools/shots/pond/pond-<moment>-<width>.png and pond-<moment>-<width>-near.png. Exits non-zero on a
 * page error.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { serve, stage, ROOT } from "./fixtures.mjs";

const OUT = path.join(ROOT, "tools", "shots", "pond");
const FONT_DIR = process.env.PORCH_FONT_DIR || "";
const PORT = Number(process.env.PORCH_PORT || 8841);
const WIDTHS = (process.env.PORCH_PN_WIDTHS || "390").split(",").map(Number);
const ONLY = process.argv.slice(2);

/* late September and October at Porters Neck. `main` moments are shot at every width; the rest at the first */
const SEP = { sunrise: "07:03", sunset: "19:10", popCurve: () => 4, dailyPop: (p) => p.fill(8), uvMax: 6 };
const OCT = { sunrise: "07:27", sunset: "18:23", popCurve: () => 4, dailyPop: (p) => p.fill(8), uvMax: 4 };
const HAL = { sunrise: "07:32", sunset: "18:16", popCurve: () => 4, dailyPop: (p) => p.fill(8), uvMax: 4 };
const calm = { windAmp: 2, gustAmp: 1 };
const TIMES = [
  { name: "sep-noon", main: true, when: "2026-09-23T13:10:00",
    o: { ...SEP, baseTemp: 78, nowTemp: 82, feels: 84, rh: 58, isDay: 1, code: 1, cloud: 22, nowWind: 7, nowDir: 200, nowGust: 12, nowUv: 6.1, windAmp: 4, gustAmp: 5 } },
  { name: "sep-dusk", main: true, when: "2026-09-23T19:26:00",
    o: { ...SEP, baseTemp: 68, nowTemp: 66, feels: 66, rh: 66, isDay: 0, code: 0, cloud: 8, nowWind: 4, nowDir: 200, nowGust: 8, nowUv: 0, windAmp: 3, gustAmp: 2 } },
  /* the full moon over the house's east end, the string lights still on */
  { name: "sep-night", main: true, when: "2026-09-26T21:30:00",
    o: { ...SEP, baseTemp: 66, nowTemp: 64, feels: 64, rh: 72, isDay: 0, code: 0, cloud: 4, nowWind: 2, nowDir: 30, nowGust: 5, nowUv: 0, ...calm } },
  /* half past ten: the string lights and the fire are off (Josh: off at 10 pm), the house still lit */
  { name: "sep-late", when: "2026-09-26T22:30:00",
    o: { ...SEP, baseTemp: 66, nowTemp: 64, feels: 64, rh: 72, isDay: 0, code: 0, cloud: 4, nowWind: 2, nowDir: 30, nowGust: 5, nowUv: 0, ...calm } },
  { name: "oct-night", main: true, when: "2026-10-24T21:30:00",
    o: { ...OCT, baseTemp: 60, nowTemp: 58, feels: 58, rh: 72, isDay: 0, code: 0, cloud: 4, nowWind: 3, nowDir: 30, nowGust: 6, nowUv: 0, ...calm } },
  { name: "sunrise", when: "2026-09-23T07:16:00",
    o: { ...SEP, baseTemp: 68, nowTemp: 64, feels: 64, rh: 86, isDay: 1, code: 1, cloud: 14, nowWind: 3, nowDir: 40, nowGust: 6, nowUv: .1, ...calm } },
  /* half an hour after sunrise: the morning's warmth on the right */
  { name: "golden-am", when: "2026-09-23T07:33:00",
    o: { ...SEP, baseTemp: 70, nowTemp: 66, feels: 66, rh: 82, isDay: 1, code: 1, cloud: 10, nowWind: 3, nowDir: 40, nowGust: 6, nowUv: .3, ...calm } },
  { name: "golden", when: "2026-09-23T18:40:00",
    o: { ...SEP, baseTemp: 76, nowTemp: 74, feels: 74, rh: 60, isDay: 1, code: 1, cloud: 12, nowWind: 5, nowDir: 200, nowGust: 9, nowUv: .3, windAmp: 3, gustAmp: 2 } },
  { name: "rain", when: "2026-09-23T19:40:00",
    o: { ...SEP, baseTemp: 72, nowTemp: 70, feels: 70, rh: 96, isDay: 0, code: 63, cloud: 100, nowWind: 10, nowDir: 60, nowGust: 18, nowUv: 0, windAmp: 6, gustAmp: 8, popCurve: () => 90, dailyPop: (p) => p.fill(90) } },
  { name: "storm", when: "2026-09-23T16:30:00",
    o: { ...SEP, baseTemp: 78, nowTemp: 76, feels: 80, rh: 88, isDay: 1, code: 95, cloud: 100, nowWind: 18, nowDir: 240, nowGust: 34, nowUv: 1, windAmp: 12, gustAmp: 18, popCurve: () => 90, dailyPop: (p) => p.fill(90) } },
  { name: "fog", when: "2026-09-24T07:50:00",
    o: { ...SEP, baseTemp: 70, nowTemp: 66, feels: 66, rh: 99, isDay: 1, code: 45, cloud: 100, nowWind: 1, nowDir: 90, nowGust: 3, nowUv: .2, ...calm } },
  /* a hard blow from the west-southwest (250): this view looks north, so everything streams to the RIGHT */
  { name: "blow-west", when: "2026-09-23T14:00:00",
    o: { ...SEP, baseTemp: 78, nowTemp: 78, feels: 78, rh: 55, isDay: 1, code: 2, cloud: 45, nowWind: 28, nowDir: 250, nowGust: 42, nowUv: 5, windAmp: 18, gustAmp: 26, windCurve: () => 28, gustCurve: () => 42, dirCurve: () => 250 } },
  /* and from the east-northeast (70): everything streams to the LEFT */
  { name: "blow-east", when: "2026-09-23T14:00:00",
    o: { ...SEP, baseTemp: 78, nowTemp: 78, feels: 78, rh: 55, isDay: 1, code: 2, cloud: 45, nowWind: 28, nowDir: 70, nowGust: 42, nowUv: 5, windAmp: 18, gustAmp: 26, windCurve: () => 28, gustCurve: () => 42, dirCurve: () => 70 } },
  { name: "halloween", when: "2026-10-31T19:30:00",
    o: { ...HAL, baseTemp: 62, nowTemp: 60, feels: 60, rh: 70, isDay: 0, code: 0, cloud: 5, nowWind: 3, nowDir: 30, nowGust: 6, nowUv: 0, ...calm } },
];

let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.error("playwright is not installed"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const server = await serve(PORT, FONT_DIR);
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
let failed = false;
for (const T of TIMES) for (const width of WIDTHS) {
  if (!T.main && width !== WIDTHS[0]) continue;
  const tag = `${T.name}-${width}`;
  if (ONLY.length && !ONLY.every((o) => tag.includes(o))) continue;
  const ctx = await browser.newContext({ viewport: { width, height: 932 }, deviceScaleFactor: 3, timezoneId: "America/New_York" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await stage(page, { now: new Date(T.when), loc: "mb", o: T.o, fontDir: FONT_DIR, port: PORT });
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
  await page.locator(".sky").screenshot({ path: path.join(OUT, `pond-${tag}.png`) }).catch((e) => errs.push("sky shot: " + e.message));
  /* and the lower half of the scene alone, for the small things (the fire table, the chairs, the dial, the does) */
  const box = await page.locator("#sceneSvg").boundingBox();
  if (box) await page.screenshot({ path: path.join(OUT, `pond-${tag}-near.png`), clip: { x: box.x, y: box.y + box.height * .45, width: box.width, height: box.height * .55 } }).catch((e) => errs.push("near shot: " + e.message));
  console.log(`${tag}: ${info.anims} animations, deer ${info.deer}, flames ${info.fire}${errs.length ? "\n  " + errs.join("\n  ") : ""}`);
  if (errs.length) failed = true;
  await ctx.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);

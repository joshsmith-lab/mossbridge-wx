/**
 * The Beaufort scene in the real page, in every weather, tide and October case, from the fixtures. Any
 * drawing still being made in tools/beaufort/parts/ is loaded into the page where the Storybook cast ends,
 * over index.html's own (index.html on disk is not changed). The fixtures' tide table drives the river.
 *
 *   TZ=America/New_York node tools/beaufort/scene.mjs              # every case
 *   TZ=America/New_York node tools/beaufort/scene.mjs noon night   # only the cases whose name matches
 *   PORCH_BFT_WIDTHS=390,430,760 ...                               # the widths to shoot (default 390,430)
 *   PORCH_BFT_PRM=1 ...                                            # under reduced motion (default: motion on, as on a phone)
 *
 * Writes tools/shots/beaufort/scene-<case>-<width>.png (the sky block, type and all),
 * scene-<case>-<width>-scene.png (the picture alone) and scene-<case>-<width>-water.png (the water
 * section, drawn in, with what its chart and slider say printed), and prints any page errors. The water
 * fails a word off the section or a page that scrolls sideways. PORCH_BFT_STOPS=1 also shoots the
 * water's pill at the stops a case names (`stops`).
 */
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { serve, stage, ROOT } from "../fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, "tools", "shots", "beaufort");
const FONT_DIR = process.env.PORCH_FONT_DIR || "";
const PORT = Number(process.env.PORCH_PORT || 8831);
const WIDTHS = (process.env.PORCH_BFT_WIDTHS || "390,430").split(",").map(Number);
const ONLY = process.argv.slice(2);
/* PORCH_BFT_STOPS=1 also shoots the water's pill at the stops a case names (`stops`) */
const SHOT_STOPS = !!process.env.PORCH_BFT_STOPS;
const D_STOPS = (cs) => cs.stops || null;

/* the fixtures' tide table: a high at 1:12 and every 12.4 hours after, a low 6.2 hours after each high.
   tidePhase shifts it, so a case can ask for the level it wants at its own time, on a rising tide: the
   low falls acos(1-2L)/π of the 6.2 hours before it. The shift is kept at or under zero so the table
   always starts before the case's time */
const phaseFor = (when, level) => {
  const d = new Date(when), t = d.getHours() + d.getMinutes() / 60;
  const since = 6.2 * Math.acos(1 - 2 * Math.min(1, Math.max(0, level))) / Math.PI;
  return ((((t - since - 7.4) % 12.4) + 12.4) % 12.4) - 12.4;
};
const C = (name, when, tide, note, o) => ({ name, when, tidePhase: phaseFor(when, tide), note, o });
const CASES = [
  C("noon-summer", "2026-08-02T13:10:00", .7, "a hot clear August noon on a rising tide: the eagle up, the gator out in the river",
    { baseTemp: 88, nowTemp: 92, feels: 101, rh: 62, isDay: 1, code: 1, cloud: 18, nowWind: 8, nowDir: 200, nowGust: 13, nowUv: 9.4, uvMax: 10, windAmp: 5, gustAmp: 8, popCurve: () => 5, dailyPop: (p) => p.fill(10) }),
  C("low-tide-morning", "2026-06-14T09:30:00", 0, "dead low on a warm June morning: the mud aprons and the oyster rakes out, the ibis working them, the float down its gangway",
    { baseTemp: 80, nowTemp: 79, feels: 82, rh: 78, isDay: 1, code: 1, cloud: 22, nowWind: 6, nowDir: 160, nowGust: 10, nowUv: 4.2, uvMax: 9, windAmp: 4, gustAmp: 6, popCurve: () => 8, dailyPop: (p) => p.fill(12), sunrise: "06:15", sunset: "20:29" }),
  C("high-tide-afternoon", "2026-06-14T16:10:00", 1, "a spring high: the spartina standing in the river, the float up by the deck",
    { baseTemp: 84, nowTemp: 86, feels: 92, rh: 64, isDay: 1, code: 2, cloud: 38, nowWind: 11, nowDir: 210, nowGust: 17, nowUv: 6, uvMax: 9, windAmp: 6, gustAmp: 9, popCurve: () => 10, dailyPop: (p) => p.fill(15), sunrise: "06:15", sunset: "20:29" }),
  C("golden-evening", "2026-08-02T19:55:00", .45, "golden hour over the river, the falling tide, the bridge going warm",
    { baseTemp: 84, nowTemp: 85, feels: 91, rh: 70, isDay: 1, code: 1, cloud: 14, nowWind: 7, nowDir: 200, nowGust: 12, nowUv: .4, uvMax: 9, windAmp: 6, gustAmp: 10, popCurve: () => 8, dailyPop: (p) => p.fill(12) }),
  C("warm-night", "2026-08-02T22:40:00", .3, "a warm clear August night: the bridge lamps on, fireflies, the dock light",
    { baseTemp: 80, nowTemp: 79, feels: 83, rh: 82, isDay: 0, code: 0, cloud: 8, nowWind: 4, nowDir: 38, nowGust: 7, nowUv: 0, uvMax: 9, windAmp: 4, gustAmp: 6, popCurve: () => 5, dailyPop: (p) => p.fill(10) }),
  C("rain-afternoon", "2026-08-02T15:00:00", .6, "steady rain: rings on the river, the crab out, the gator and the eagle in",
    { baseTemp: 80, nowTemp: 78, feels: 81, rh: 92, isDay: 1, code: 63, cloud: 96, nowWind: 14, nowDir: 230, nowGust: 24, nowUv: 1.4, uvMax: 7, windAmp: 10, gustAmp: 16, popCurve: () => 85, dailyPop: (p) => p.fill(85) }),
  C("storm", "2026-08-02T16:45:00", .5, "a thunderstorm over the river",
    { baseTemp: 84, nowTemp: 80, feels: 86, rh: 90, isDay: 1, code: 95, cloud: 98, nowWind: 18, nowDir: 250, nowGust: 36, nowUv: 1, uvMax: 8, windAmp: 14, gustAmp: 26, nowcast: true, popCurve: (i, hr) => (hr >= 14 && hr <= 21 ? 80 : 20), dailyPop: (p) => { p[0] = 85; p[1] = 60; } }),
  C("fog-morning", "2026-03-12T07:50:00", .5, "fog on the river: the bridge and Lady's Island gone into it",
    { baseTemp: 62, nowTemp: 58, feels: 58, rh: 98, isDay: 1, code: 45, cloud: 100, nowWind: 2, nowDir: 90, nowGust: 4, nowUv: .4, uvMax: 5, windAmp: 1, gustAmp: 2, popCurve: () => 10, dailyPop: (p) => p.fill(15), sunrise: "07:30", sunset: "19:23" }),
  C("windy-clear", "2026-04-18T14:00:00", .5, "a hard clear blow, 22 gusting 34: the windsock straight out, the flag stiff, chop on the river",
    { baseTemp: 74, nowTemp: 75, feels: 75, rh: 45, isDay: 1, code: 1, cloud: 20, nowWind: 22, nowDir: 250, nowGust: 34, nowUv: 7, uvMax: 8, windAmp: 12, gustAmp: 18, popCurve: () => 5, dailyPop: (p) => p.fill(8), sunrise: "06:48", sunset: "19:52", wave: 3.6, stops: ["now", "flood"] }),
  C("winter-morning", "2026-01-14T08:40:00", .2, "a raw January morning at 38°: no gator, the moss grey, the light low",
    { baseTemp: 46, nowTemp: 38, feels: 33, rh: 70, isDay: 1, code: 1, cloud: 20, nowWind: 9, nowDir: 330, nowGust: 16, nowUv: 1, uvMax: 3, windAmp: 6, gustAmp: 10, popCurve: () => 5, dailyPop: (p) => p.fill(8), sunrise: "07:23", sunset: "17:43" }),
];
/* the options Josh is choosing between, each on the noon case, drawn in only for the preview (BFT_SHOW) */
const NOON = CASES[0];
for (const [name, show, note] of [["option-dolphin", { dolphin: true }, "a bottlenose dolphin rolling in the river"],
  ["option-horse", { horse: "graze" }, "a Marsh Tacky grazing on the left bank"],
  ["option-jet", { jet: true }, "a jet crossing high, held until the family names their airframe"],
  ["option-shrimp", { shrimp: "up" }, "a shrimp trawler at the far shore, booms up"]])
  CASES.push({ ...NOON, name, show, note });
CASES.push(C("moon-night", "2026-08-27T22:30:00", .8, "a moonlit night near the full moon: the moon's light on the river, the birds asleep in the oak",
  { baseTemp: 80, nowTemp: 79, feels: 83, rh: 80, isDay: 0, code: 0, cloud: 6, nowWind: 5, nowDir: 60, nowGust: 8, nowUv: 0, uvMax: 9, windAmp: 4, gustAmp: 6, popCurve: () => 5, dailyPop: (p) => p.fill(10), sunrise: "06:52", sunset: "19:47" }));

/* Halloween at Beaufort: up through October on the place's own calendar, carved from the 24th, the
   trick-or-treater on the 31st, and all of it gone the morning of November 1 */
CASES.push(C("october-afternoon", "2026-10-10T15:30:00", .6, "Halloween is up: the pumpkins at the dock house, the black cat, the balloon, the skeleton at the helm",
  { baseTemp: 74, nowTemp: 76, feels: 76, rh: 60, isDay: 1, code: 1, cloud: 18, nowWind: 9, nowDir: 40, nowGust: 15, nowUv: 3.4, uvMax: 5, windAmp: 6, gustAmp: 10, sunrise: "07:21", sunset: "18:52", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));
CASES.push(C("october-moon", "2026-10-24T21:30:00", .5, "the carved week under a moon a night short of full: the lantern lit, the bats out, the witch crossing the moon, eyes in the grass",
  { baseTemp: 66, nowTemp: 64, feels: 64, rh: 75, isDay: 0, code: 0, cloud: 6, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "07:35", sunset: "18:36", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));
CASES.push(C("halloween-night", "2026-10-31T20:40:00", .4, "Halloween night: the trick-or-treater on the walkway",
  { baseTemp: 65, nowTemp: 63, feels: 63, rh: 80, isDay: 0, code: 0, cloud: 8, nowWind: 7, nowDir: 30, nowGust: 12, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "07:40", sunset: "18:29", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));
CASES.push(C("november-morning", "2026-11-01T09:30:00", .5, "the morning of November 1: every decoration down",
  { baseTemp: 64, nowTemp: 60, feels: 60, rh: 70, isDay: 1, code: 1, cloud: 18, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 2, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "06:41", sunset: "17:28", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));

/* The water mock (option A, October 16 2026): the fishing water on Beaufort's tide chart. Two cases of
   its own, a big flood tide on a fall morning and this morning as it is, and every case gets what the
   real Beaufort answers with: NOAA's own high and low table for 8667999 on the case's days where
   tools/beaufort/tides-8667999.json has them (node tools/beaufort/tides-fetch.mjs <day> adds a day), no
   gauge and no station thermometer (the station is predictions only), and the Fripp buoy's water at
   its 2023-2026 monthly mean unless the case says otherwise, twenty minutes old */
CASES.push(C("flood-morning", "2026-10-27T08:40:00", .8, "a big fall flood tide: 9.35 ft at 10:17, a northeast breeze, the grass under",
  { baseTemp: 70, nowTemp: 66, feels: 66, rh: 72, isDay: 1, code: 1, cloud: 20, nowWind: 12, nowDir: 45, nowGust: 19, nowUv: 2.2, uvMax: 5, windAmp: 6, gustAmp: 9, sunrise: "07:37", sunset: "18:33", popCurve: () => 5, dailyPop: (p) => p.fill(8), buoyTemp: 74.4, stops: ["now", "flood"] }));
CASES.push(C("today", "2026-10-16T07:40:00", .3, "this morning as it is: light southwest air, 77° water off Fripp, no flood until the 24th",
  { baseTemp: 74, nowTemp: 68, feels: 68, rh: 88, isDay: 1, code: 2, cloud: 40, nowWind: 3, nowDir: 225, nowGust: 6, nowUv: .3, uvMax: 5, windAmp: 5, gustAmp: 8, sunrise: "07:25", sunset: "18:50", popCurve: () => 5, dailyPop: (p) => p.fill(8), buoyTemp: 77.2, stops: ["now"] }));
CASES.push(C("december-flood", "2026-12-25T08:30:00", .8, "a Christmas morning spring high of 8.96 ft: water in the grass out of season, so no flood-tide word",
  { baseTemp: 52, nowTemp: 45, feels: 40, rh: 70, isDay: 1, code: 1, cloud: 15, nowWind: 10, nowDir: 320, nowGust: 18, nowUv: 1, uvMax: 3, windAmp: 6, gustAmp: 9, sunrise: "07:20", sunset: "17:22", popCurve: () => 5, dailyPop: (p) => p.fill(8), stops: ["now", "grass"] }));
const TIDES = (() => { try { return JSON.parse(readFileSync(path.join(HERE, "tides-8667999.json"), "utf8")); } catch { return {}; } })();
const WATER_CASES = ["december-flood", "noon-summer", "windy-clear", "october-afternoon", "winter-morning", "flood-morning", "today", "warm-night", "october-moon", "halloween-night", "november-morning", "moon-night", "fog-morning"];
const BUOY_MONTH = [52.7, 53.0, 59.7, 67.9, 75.3, 80.4, 85.6, 84.9, 81.1, 73.8, 66.1, 57.6];
for (const cs of CASES) {
  const day = cs.when.slice(0, 10);
  /* the real table only where the water is what the case is for: the scene cases that ask for a level
     (dead low, a spring high) keep the fixtures' shifted sine, so their river is the one they name */
  const real = WATER_CASES.includes(cs.name) && TIDES[day];
  cs.o = { noGauge: true, waterTemp: null, buoyTemp: BUOY_MONTH[+cs.when.slice(5, 7) - 1], buoyAge: 20, ...cs.o, ...(real ? { hilo: TIDES[day] } : {}) };
  if (cs.o.stops) cs.stops = cs.o.stops;
  /* the wind row reads the run hour by hour, and the fixtures' wind is a twelve-hour wave that a reading
     every six hours samples at the same height every time. So a water case without a shape of its own
     gets a day's: its own reading at three in the afternoon, a little over half of it before dawn, a slow
     drift from day to day, the gusts in the case's own ratio to the wind, and a slow veer */
  if (WATER_CASES.includes(cs.name) && !cs.o.windCurve) {
    const o = cs.o, k = (o.nowGust || o.nowWind * 1.5) / Math.max(1, o.nowWind);
    const w = (i, hr) => Math.max(1, o.nowWind * (.55 + .45 * (.5 + .5 * Math.sin((hr - 9) / 24 * 2 * Math.PI))) + 1.6 * Math.sin(i / 17));
    o.windCurve = (i, hr) => Math.round(w(i, hr));
    o.gustCurve = (i, hr) => Math.round(w(i, hr) * k);
    o.dirCurve = (i) => Math.round(((o.nowDir ?? 200) + 20 * Math.sin(i / 9)) % 360 + 360) % 360;
  }
}
CASES.find((c) => c.name === "october-afternoon").o.buoyTemp = 78.1;
/* this morning's own wind: shaped like Open-Meteo's run for the street on the morning of October 16 2026,
   as the research read it (light southwest air Friday, gusts to 17 around 7 pm, then the northerly surge,
   north to northeast at 16 to 21 by Saturday afternoon and gusting 29 to 35 into the evening, 35 at 11 pm
   from 38°), hour by hour from Friday midnight: [hour, from°, mph, gust] */
{
  const RUN = [[0, 225, 3, 6], [7, 225, 3, 6], [12, 230, 6, 12], [16, 230, 8, 15], [19, 235, 9, 17], [21, 260, 7, 13], [24, 300, 8, 15], [27, 315, 10, 19],
    [29, 330, 11, 22], [32, 350, 13, 25], [35, 375, 16, 28], [38, 390, 18, 30], [42, 395, 20, 33], [47, 398, 21, 35], [52, 400, 20, 33], [192, 400, 18, 30]];
  const at = (i, j) => { let a = RUN[0], b = RUN[RUN.length - 1]; for (let n = 0; n + 1 < RUN.length; n++) if (i >= RUN[n][0] && i <= RUN[n + 1][0]) { a = RUN[n]; b = RUN[n + 1]; break; }
    return a[j] + (b[j] - a[j]) * (b[0] === a[0] ? 0 : (i - a[0]) / (b[0] - a[0])); };
  Object.assign(CASES.find((c) => c.name === "today").o, { windCurve: (i) => Math.round(at(i, 2)), gustCurve: (i) => Math.round(at(i, 3)), dirCurve: (i) => Math.round(at(i, 1)) % 360 });
}

let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.error("playwright is not installed"); process.exit(1); }

/* the page as the preview serves it: index.html, with any drawing still being made in tools/beaufort/parts/
   loaded where the cast ends (each registers in LOOK, which is the cast's BFT) */
const html = () => {
  let h = readFileSync(path.join(ROOT, "index.html"), "utf8");
  let parts = "";
  try { for (const f of readdirSync(path.join(HERE, "parts")).filter((f) => f.endsWith(".js")).sort()) parts += `/* ── ${f} */\n` + readFileSync(path.join(HERE, "parts", f), "utf8") + "\n"; } catch {}
  const mark = "/* ── the scene: arc, sun / moon";
  if (!h.includes(mark)) throw new Error("no scene marker in index.html");
  return parts ? h.replace(mark, "const LOOK=BFT;\n" + parts + mark) : h;
};

mkdirSync(OUT, { recursive: true });
const server = await serve(PORT, FONT_DIR);
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
let failed = false;
for (const cs of CASES.filter((c) => !ONLY.length || ONLY.some((o) => c.name.includes(o)))) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 932 }, deviceScaleFactor: 3, timezoneId: "America/New_York", reducedMotion: process.env.PORCH_BFT_PRM ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
    await stage(page, { now: new Date(cs.when), loc: "bft", o: cs.o, tidePhase: cs.tidePhase, fontDir: FONT_DIR, port: PORT });
    if (cs.show) await page.addInitScript((show) => { window.BFT_SHOW = show; }, cs.show);
    await page.route(/localhost:\d+\/(index\.html)?(\?.*)?$/, (r) => r.fulfill({ contentType: "text/html", body: html() }));
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(() => !document.getElementById("refreshBtn")?.classList.contains("spin")
        && document.getElementById("stamp")?.textContent !== "—", { timeout: 15000 });
    } catch { errs.push("the page never finished its first paint"); }
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => typeof finishReveal === "function" && finishReveal());
    const info = await page.evaluate(() => ({ loc: typeof LOC !== "undefined" ? LOC.id : null, tide: typeof SCENE_TIDE !== "undefined" ? SCENE_TIDE : null,
      props: [...document.querySelectorAll(".scene :is([data-prop],[data-decor])")].map((n) => n.dataset.prop || "decor:" + n.dataset.decor),
      species: [...document.querySelectorAll(".scene [data-species]")].map((n) => n.dataset.species),
      running: document.getAnimations().filter((a) => a.playState === "running").length }));
    /* nothing stands on anything else: every animal's drawn box, measured on the screen, against every other's */
    const overlaps = await page.evaluate(() => {
      const els = [...document.querySelectorAll(".scene [data-species]")].filter((e) => !e.parentElement.closest("[data-species]") && e.dataset.species !== "bat");
      const B = els.map((e) => ({ n: e.dataset.species, r: e.getBoundingClientRect() }));
      const out = [];
      for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
        const a = B[i].r, b = B[j].r, w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) out.push(`${B[i].n} × ${B[j].n} (${w.toFixed(1)}×${h.toFixed(1)}px)`);
      }
      return out;
    });
    if (overlaps.length) errs.push("animals overlap: " + overlaps.join(", "));
    const tag = `${cs.name}-${width}`;
    await page.locator(".sky").screenshot({ path: path.join(OUT, `scene-${tag}.png`) }).catch((e) => errs.push("sky shot: " + e.message));
    await page.locator("#sceneSvg").screenshot({ path: path.join(OUT, `scene-${tag}-scene.png`) }).catch((e) => errs.push("scene shot: " + e.message));
    /* the water section, scrolled to and drawn in, the way a phone sees it, with what its chart says
       to a screen reader and what its slider says at each stop the chart names */
    await page.locator("#tideSection").scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate(() => typeof finishReveal === "function" && finishReveal());
    await page.waitForTimeout(150);
    await page.locator("#tideSection").screenshot({ path: path.join(OUT, `scene-${tag}-water.png`) }).catch((e) => errs.push("water shot: " + e.message));
    const water = await page.evaluate(() => {
      const X = typeof XP !== "undefined" && XP.tide, D = X && X.D, sec = document.getElementById("tideSection");
      const r = sec.getBoundingClientRect(), over = [...sec.querySelectorAll("text")].filter((t) => { const b = t.getBoundingClientRect(); return b.width && (b.left < r.left - .5 || b.right > r.right + .5); }).map((t) => t.textContent);
      return { note: document.getElementById("tideNote").textContent, label: document.getElementById("tideSvg").getAttribute("aria-label"),
        scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, over,
        stops: D ? [...new Set([D.start, ...(D.marks || [])])].sort((a, b) => a - b).map((i) => D.read(i).parts.map((p) => p[1] === "vane" ? `(vane ${p[0].split("|")[0]}°) ${p[0].split("|")[1]}` : p[0]).join(" · ")) : [],
        wind: [...document.querySelectorAll("#tideSvg text")].filter((t) => +t.getAttribute("y") > document.getElementById("tideSvg").viewBox.baseVal.height - 40).map((t) => t.textContent).join(" | "),
        run: document.getElementById("tideRun").getAttribute("aria-label") };
    });
    /* PORCH_BFT_PROBE=<file>: what an expression in that file says about the page, for debugging */
    if (process.env.PORCH_BFT_PROBE) console.log("  probe:", JSON.stringify(await page.evaluate(readFileSync(process.env.PORCH_BFT_PROBE, "utf8")).catch((e) => String(e))));
    console.log(`  water note: ${water.note}\n  water label: ${water.label}\n  water wind row: ${water.wind}\n  in season: ${water.run}\n  water stops:\n    ${water.stops.join("\n    ")}`);
    if (water.scroll) errs.push("the page scrolls sideways");
    if (water.over.length) errs.push("water words off the section: " + water.over.join(", "));
    if (SHOT_STOPS && D_STOPS(cs)) for (const k of D_STOPS(cs)) {
      await page.evaluate((k) => { const X = XP.tide; const i = k === "now" ? X.D.start : X.D.marks.find((m) => X.D.read(m).parts.some((p) => p[0].includes(k))) ?? X.D.start; xpShow(X, i); }, k);
      await page.waitForTimeout(80);
      await page.locator("#tideSection").screenshot({ path: path.join(OUT, `scene-${tag}-water-${k.replace(/\W+/g, "")}.png`) }).catch(() => {});
      await page.evaluate(() => xpHide(XP.tide));
    }
    console.log(`${tag}: loc ${info.loc}, tide ${info.tide == null ? "—" : info.tide.toFixed(2)}, props [${[...new Set(info.props)].join(" ")}], animals [${info.species.join(" ")}], ${info.running} animations`);
    if (info.running > 120) errs.push(`${info.running} animations running, over the scenes' ceiling of 120`);
    if (info.loc !== "bft") { errs.push(`the page opened at ${info.loc}, not Beaufort`); }
    if (errs.length) { failed = true; console.log("  " + errs.join("\n  ")); }
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(`wrote ${OUT}`);
process.exit(failed ? 1 : 0);

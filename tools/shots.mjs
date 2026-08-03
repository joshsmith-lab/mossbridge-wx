/**
 * Visual regression eyeballing for Porch Weather.
 *
 * Renders index.html across a spread of scenarios with mocked upstream data and
 * a fixed clock, writes screenshots to tools/shots/, and prints the copy the app
 * generated so wording changes are reviewable as text.
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
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const OUT = path.join(here, "shots");
const FONT_DIR = process.env.PORCH_FONT_DIR || "";
const PORT = Number(process.env.PORCH_PORT || 8799);

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed.\n  npm i playwright && npx playwright install chromium");
  process.exit(1);
}

const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png" };
const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  if (p.startsWith("/f/") && FONT_DIR) {
    const f = path.join(FONT_DIR, path.basename(p));
    if (existsSync(f)) { res.writeHead(200, { "Content-Type": "font/woff2" }); return res.end(readFileSync(f)); }
  }
  const f = path.join(ROOT, p);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "text/plain" });
  res.end(readFileSync(f));
});

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A week of plausible hourly and daily data shaped like the Open-Meteo response. */
function forecast(now, o) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const time = [], temp = [], pop = [], code = [], wind = [], gust = [], uv = [];
  for (let i = 0; i < 24 * 7; i++) {
    const t = new Date(start.getTime() + i * 3600e3), hr = t.getHours();
    const diurnal = Math.sin(((hr - 5) / 24) * 2 * Math.PI);
    time.push(iso(t));
    temp.push(Math.round(o.baseTemp + diurnal * 9));
    pop.push(Math.max(0, Math.round(o.popCurve(i, hr))));
    code.push(pop[i] >= 55 ? 80 : pop[i] >= 35 ? 3 : o.code);
    wind.push(Math.round(6 + Math.abs(diurnal) * o.windAmp));
    gust.push(Math.round(10 + Math.abs(diurnal) * o.gustAmp));
    uv.push(Math.max(0, +(Math.max(0, diurnal) * o.uvMax).toFixed(1)));
  }
  const dtime = [], dmax = [], dmin = [], dcode = [], dpop = [], dsun = [], dset = [], duv = [], dwmax = [];
  for (let d0 = 0; d0 < 7; d0++) {
    const d = new Date(start.getTime() + d0 * 864e5);
    const sl = temp.slice(d0 * 24, (d0 + 1) * 24), pl = pop.slice(d0 * 24, (d0 + 1) * 24), cl = code.slice(d0 * 24, (d0 + 1) * 24);
    dtime.push(day(d)); dmax.push(Math.max(...sl)); dmin.push(Math.min(...sl));
    dcode.push(Math.max(...cl)); dpop.push(Math.max(...pl));
    dsun.push(`${day(d)}T06:32`); dset.push(`${day(d)}T20:14`);
    duv.push(o.uvMax); dwmax.push(18);
  }
  if (o.dailyPop) o.dailyPop(dpop, dcode);
  return {
    current: {
      time: iso(now), interval: 900, temperature_2m: o.nowTemp, relative_humidity_2m: o.rh,
      apparent_temperature: o.feels, is_day: o.isDay, weather_code: o.code, cloud_cover: o.cloud,
      wind_speed_10m: o.nowWind, wind_direction_10m: o.nowDir, wind_gusts_10m: o.nowGust, uv_index: o.nowUv,
    },
    hourly: { time, temperature_2m: temp, precipitation_probability: pop, weather_code: code, wind_speed_10m: wind, wind_gusts_10m: gust, uv_index: uv },
    daily: { time: dtime, weather_code: dcode, temperature_2m_max: dmax, temperature_2m_min: dmin, sunrise: dsun, sunset: dset, precipitation_probability_max: dpop, wind_speed_10m_max: dwmax, uv_index_max: duv },
    minutely_15: o.nowcast
      ? { time: Array.from({ length: 12 }, (_, i) => iso(new Date(now.getTime() + i * 9e5))), precipitation: [0, 0, 0, 0.2, 0.6, 0.9, 0.4, 0.1, 0, 0, 0, 0] }
      : null,
  };
}

/** Semidiurnal highs and lows shaped like the NOAA predictions response. */
function tides(now) {
  const preds = [], t0 = new Date(now); t0.setHours(1, 12, 0, 0);
  for (let i = 0; i < 10; i++) {
    const t = new Date(t0.getTime() + i * 6.2 * 3600e3);
    preds.push({ t: `${day(t)} ${pad(t.getHours())}:${pad(t.getMinutes())}`, v: i % 2 ? "0.4" : "4.3", type: i % 2 ? "L" : "H" });
  }
  return { predictions: preds };
}

const SEVERE = (now) => [{
  properties: {
    event: "Severe Thunderstorm Warning", severity: "Severe",
    ends: new Date(now.getTime() + 45 * 6e4).toISOString(), expires: null,
    description: "The National Weather Service in Wilmington has issued a Severe Thunderstorm Warning.\n\n* WHAT...Sixty mph wind gusts and quarter size hail.\n\n* WHERE...Porters Neck and northeastern New Hanover County.\n\n* WHEN...Until 515 PM EDT.\n\n* IMPACTS...Expect damage to roofs, siding, and trees.",
    instruction: "Move to an interior room on the lowest floor of a building.",
  },
}];

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

const FONT_CSS =
  '@font-face{font-family:"Bricolage Grotesque";src:url(http://localhost:PORT/f/bricolage.woff2) format("woff2-variations");font-weight:200 800;font-display:block}' +
  '@font-face{font-family:"Spline Sans Mono";src:url(http://localhost:PORT/f/spline.woff2) format("woff2-variations");font-weight:300 700;font-display:block}';

mkdirSync(OUT, { recursive: true });
await new Promise((r) => server.listen(PORT, r));
if (!FONT_DIR) console.warn("PORCH_FONT_DIR is unset: falling back to whatever Google Fonts returns. Type metrics may be wrong.\n");

const browser = await chromium.launch();
let failures = 0;
for (const cs of CASES) {
  for (const vp of [{ w: 390, h: 1500, tag: "phone" }, { w: 900, h: 1500, tag: "wide" }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, timezoneId: "America/New_York" });
    const page = await ctx.newPage();
    const now = new Date(cs.when);

    // Shift Date rather than freezing it, so CSS animations keep running.
    await page.addInitScript((cfg) => {
      try { localStorage.setItem("mbwx-loc", cfg.id); } catch {}
      const off = cfg.t - Date.now(), RD = Date;
      const F = function (...a) { return a.length ? new RD(...a) : new RD(RD.now() + off); };
      F.now = () => RD.now() + off; F.parse = RD.parse; F.UTC = RD.UTC; F.prototype = RD.prototype;
      window.Date = F;
    }, { id: cs.loc, t: now.getTime() });

    if (FONT_DIR) {
      await page.route("**fonts.googleapis.com**", (r) => r.fulfill({ contentType: "text/css", body: FONT_CSS.replaceAll("PORT", String(PORT)) }));
      await page.route("**fonts.gstatic.com**", (r) => r.abort());
    }
    await page.route("**api.open-meteo.com**", (r) => r.fulfill({ json: forecast(now, cs.o) }));
    await page.route("**marine-api.open-meteo.com**", (r) => r.fulfill({ json: { daily: { wave_height_max: [2.4], wave_period_max: [6] } } }));
    await page.route("**tidesandcurrents.noaa.gov**", (r) => r.fulfill({ json: tides(now) }));
    await page.route("**api.weather.gov/alerts**", (r) => r.fulfill({ json: { features: cs.o.code >= 95 ? SEVERE(now) : [] } }));
    await page.route("**api.weather.gov/products**", (r) => r.fulfill({ json: { "@graph": [] } }));

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
          water: T("waterLead"), wind: T("wWind"), window: T("wWindow"),
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

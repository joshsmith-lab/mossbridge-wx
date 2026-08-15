/**
 * Shared upstream fixtures and static server for the Playwright harnesses.
 *
 * tools/shots.mjs reviews the generated copy; tools/scene.mjs reviews the scene
 * and its motion. Both need the same mocked Open-Meteo / NOAA / weather.gov
 * shapes, so they live here rather than being written twice and drifting.
 *
 * Everything is written in local time. Run the harnesses with
 * TZ=America/New_York or the page and the fixture disagree about what time it
 * is and every sun, scene and golden-hour check is wrong.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png" };

/** Serves the repo root, plus /f/*.woff2 out of PORCH_FONT_DIR when it is set. */
export function serve(port, fontDir = "") {
  const server = createServer((req, res) => {
    let p = req.url.split("?")[0];
    if (p === "/") p = "/index.html";
    if (p.startsWith("/f/") && fontDir) {
      const f = path.join(fontDir, path.basename(p));
      if (existsSync(f)) { res.writeHead(200, { "Content-Type": "font/woff2" }); return res.end(readFileSync(f)); }
    }
    const f = path.join(ROOT, p);
    if (!existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "text/plain" });
    res.end(readFileSync(f));
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

export const FONT_CSS = (port) =>
  `@font-face{font-family:"Bricolage Grotesque";src:url(http://localhost:${port}/f/bricolage.woff2) format("woff2-variations");font-weight:200 800;font-display:block}` +
  `@font-face{font-family:"Spline Sans Mono";src:url(http://localhost:${port}/f/spline.woff2) format("woff2-variations");font-weight:300 700;font-display:block}`;

const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A week of plausible hourly and daily data shaped like the Open-Meteo response. */
export function forecast(now, o) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const time = [], temp = [], apparent = [], pop = [], code = [], wind = [], gust = [], uv = [];
  const feelDelta = Number(o.feels) - Number(o.nowTemp);
  for (let i = 0; i < 24 * 7; i++) {
    const t = new Date(start.getTime() + i * 3600e3), hr = t.getHours();
    const diurnal = Math.sin(((hr - 5) / 24) * 2 * Math.PI);
    time.push(iso(t));
    temp.push(Math.round(o.baseTemp + diurnal * 9));
    /* Heat index and wind chill fade toward the gentler end of the daily cycle. The exact
       curve is less important than giving the touch explorer a plausible changing signal. */
    apparent.push(Math.round(temp[i] + feelDelta * (.3 + .7 * Math.max(0, diurnal))));
    pop.push(Math.max(0, Math.round(o.popCurve(i, hr))));
    const frozen = [56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(o.code);
    code.push(frozen ? o.code : pop[i] >= 55 ? 80 : pop[i] >= 35 ? 3 : o.code);
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
    dsun.push(`${day(d)}T${o.sunrise || "06:32"}`); dset.push(`${day(d)}T${o.sunset || "20:14"}`);
    duv.push(o.uvMax); dwmax.push(18);
  }
  if (o.dailyPop) o.dailyPop(dpop, dcode);
  return {
    current: {
      time: iso(now), interval: 900, temperature_2m: o.nowTemp, relative_humidity_2m: o.rh,
      apparent_temperature: o.feels, is_day: o.isDay, weather_code: o.code, cloud_cover: o.cloud,
      wind_speed_10m: o.nowWind, wind_direction_10m: o.nowDir, wind_gusts_10m: o.nowGust, uv_index: o.nowUv,
    },
    hourly: { time, temperature_2m: temp, apparent_temperature: apparent, precipitation_probability: pop, weather_code: code, wind_speed_10m: wind, wind_gusts_10m: gust, uv_index: uv },
    daily: { time: dtime, weather_code: dcode, temperature_2m_max: dmax, temperature_2m_min: dmin, sunrise: dsun, sunset: dset, precipitation_probability_max: dpop, wind_speed_10m_max: dwmax, uv_index_max: duv },
    minutely_15: o.nowcast
      ? { time: Array.from({ length: 12 }, (_, i) => iso(new Date(now.getTime() + i * 9e5))), precipitation: [0, 0, 0, 0.2, 0.6, 0.9, 0.4, 0.1, 0, 0, 0, 0] }
      : null,
  };
}

/**
 * Semidiurnal highs and lows shaped like the NOAA predictions response.
 * `phase` shifts the first extreme so a scenario can choose whether the water
 * is on its way in or on its way out right now.
 */
export function tides(now, phase = 0) {
  const preds = [], t0 = new Date(now); t0.setHours(1, 12, 0, 0);
  t0.setTime(t0.getTime() + phase * 3600e3);
  for (let i = 0; i < 10; i++) {
    const t = new Date(t0.getTime() + i * 6.2 * 3600e3);
    preds.push({ t: `${day(t)} ${pad(t.getHours())}:${pad(t.getMinutes())}`, v: i % 2 ? "0.4" : "4.3", type: i % 2 ? "L" : "H" });
  }
  return { predictions: preds };
}

export const SEVERE = (now) => [{
  properties: {
    event: "Severe Thunderstorm Warning", severity: "Severe",
    ends: new Date(now.getTime() + 45 * 6e4).toISOString(), expires: null,
    description: "The National Weather Service in Wilmington has issued a Severe Thunderstorm Warning.\n\n* WHAT...Sixty mph wind gusts and quarter size hail.\n\n* WHERE...Porters Neck and northeastern New Hanover County.\n\n* WHEN...Until 515 PM EDT.\n\n* IMPACTS...Expect damage to roofs, siding, and trees.",
    instruction: "Move to an interior room on the lowest floor of a building.",
  },
}];

/**
 * Point every upstream at a fixture and shift the page clock onto `now`.
 *
 * The clock is shifted rather than frozen: the scene runs off real `new Date()`
 * and solar position, not the API timestamps, and freezing it would also stop
 * every CSS animation we are here to look at.
 */
export async function stage(page, { now, loc, o, tidePhase = 0, fontDir = "", port }) {
  await page.addInitScript((cfg) => {
    try { localStorage.setItem("mbwx-loc", cfg.id); } catch {}
    const off = cfg.t - Date.now(), RD = Date;
    const F = function (...a) { return a.length ? new RD(...a) : new RD(RD.now() + off); };
    F.now = () => RD.now() + off; F.parse = RD.parse; F.UTC = RD.UTC; F.prototype = RD.prototype;
    window.Date = F;
  }, { id: loc, t: now.getTime() });

  if (fontDir) {
    await page.route("**fonts.googleapis.com**", (r) => r.fulfill({ contentType: "text/css", body: FONT_CSS(port) }));
    await page.route("**fonts.gstatic.com**", (r) => r.abort());
  }
  await page.route("**api.open-meteo.com**", (r) => r.fulfill({ json: forecast(now, o) }));
  await page.route("**marine-api.open-meteo.com**", (r) => r.fulfill({ json: { daily: { wave_height_max: [o.wave ?? 2.4], wave_period_max: [6] } } }));
  await page.route("**tidesandcurrents.noaa.gov**", (r) => r.fulfill({ json: tides(now, tidePhase) }));
  await page.route("**api.weather.gov/alerts**", (r) => r.fulfill({ json: { features: o.code >= 95 ? SEVERE(now) : [] } }));
  await page.route("**api.weather.gov/products**", (r) => r.fulfill({ json: { "@graph": [] } }));
}

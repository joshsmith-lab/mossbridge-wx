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
 * scene-<case>-<width>-scene.png (the picture alone) and scene-<case>-<width>-water.png (the water section,
 * with option C's grass line, wind row and in-season row), and with PORCH_BFT_FULL=1 the whole page too, and
 * prints any page errors, any animal standing on another, and any word in the water section off its chart.
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
/* The water section's cases run on the station's real table: NOAA's 2026 hilo predictions for 8667999,
   Beaufort, Beaufort River (api.tidesandcurrents.noaa.gov, MLLW, lst_ldt), so the curve, the grass line
   and the flood tides are the ones that day really has. `REAL` marks them; their river in the scene is
   that day's too. The water temperature is buoy 41067's own month (its 2023-2026 daily means, SECOORA
   ERDDAP), and the seas are made up, the size Open-Meteo gives on such a day */
const TIDES_2026 = JSON.parse(readFileSync(path.join(HERE, "fixtures", "tides-8667999-2026.json"), "utf8")).predictions;
/* the station has no thermometer (NOAA lists none at 8667999), so the buoy's is the one said */
const REAL = (o) => ({ tideTable: TIDES_2026, waterTemp: null, buoyAge: 22, ...o });
/* the hour of the run a case's wind is at: the diurnal fixture blows hardest at 11 and 11, so a day
   that builds and lays down is written out (in mph, on the hour) */
const ramp = (pts) => (i, hr) => { const t = i; let a = pts[0], b = pts[pts.length - 1];
  for (let k = 0; k + 1 < pts.length; k++) if (t >= pts[k][0] && t <= pts[k + 1][0]) { a = pts[k]; b = pts[k + 1]; break; }
  const f = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0; return Math.round(a[1] + (b[1] - a[1]) * f); };
const CASES = [
  C("noon-summer", "2026-08-02T13:10:00", .7, "a hot clear August noon on a rising tide: the eagle up, the gator out in the river",
    REAL({ baseTemp: 88, nowTemp: 92, feels: 101, rh: 62, isDay: 1, code: 1, cloud: 18, nowWind: 8, nowDir: 200, nowGust: 13, nowUv: 9.4, uvMax: 10, windAmp: 5, gustAmp: 8, popCurve: () => 5, dailyPop: (p) => p.fill(10),
      /* the sea breeze: south by southwest through the afternoon, backing southwest overnight */
      windCurve: ramp([[0, 5], [8, 4], [12, 8], [16, 12], [20, 8], [24, 5], [32, 4], [36, 8], [40, 12], [48, 6]]),
      gustCurve: ramp([[0, 9], [8, 8], [12, 13], [16, 19], [20, 14], [24, 9], [32, 8], [36, 13], [40, 19], [48, 10]]),
      dirCurve: ramp([[0, 235], [9, 230], [13, 200], [17, 175], [22, 205], [30, 235], [37, 200], [41, 175], [48, 220]]), buoyTemp: 85, wave: 2 })),
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
    REAL({ baseTemp: 74, nowTemp: 75, feels: 75, rh: 45, isDay: 1, code: 1, cloud: 20, nowWind: 22, nowDir: 250, nowGust: 34, nowUv: 7, uvMax: 8, windAmp: 12, gustAmp: 18, popCurve: () => 5, dailyPop: (p) => p.fill(8), sunrise: "06:48", sunset: "19:52",
      /* a front's west-southwesterly blow through the afternoon, laying down after dark and veering
         northwest behind it by morning */
      windCurve: ramp([[0, 9], [8, 14], [12, 20], [14, 22], [17, 21], [20, 15], [24, 11], [30, 9], [34, 12], [38, 13], [48, 8]]),
      gustCurve: ramp([[0, 15], [8, 22], [12, 31], [14, 34], [17, 33], [20, 24], [24, 18], [30, 15], [34, 19], [38, 20], [48, 13]]),
      dirCurve: ramp([[0, 230], [12, 245], [16, 255], [20, 270], [26, 295], [32, 320], [40, 330], [48, 335]]),
      buoyTemp: 68, wave: 4.6,
      /* MOCK: a Small Craft Advisory for AMZ362 the way Charleston writes one on a day like this, in the
         alerts API's shape. Not an archived product: the page does not fetch the zone yet */
      marineAlerts: (now) => [{ properties: { id: "mock-sca", event: "Small Craft Advisory", severity: "Minor",
        onset: "2026-04-18T08:00:00-04:00", ends: "2026-04-18T22:00:00-04:00", expires: "2026-04-18T22:00:00-04:00",
        description: "* WHAT...Southwest winds 20 to 25 kt with gusts up to 30 kt and seas 4 to 6 ft.\n\n* WHERE...Coastal waters from Edisto Beach SC to Savannah GA out 20 NM.\n\n* WHEN...Until 10 PM EDT this evening.",
        instruction: "Inexperienced mariners, especially those operating smaller vessels, should avoid navigating in these conditions.",
        parameters: { VTEC: ["/O.CON.KCHS.SC.Y.0031.000000T0000Z-260419T0200Z/"] }, affectedZones: ["https://api.weather.gov/zones/forecast/AMZ362"] } }] })),
  C("winter-morning", "2026-01-14T08:40:00", .2, "a raw January morning at 38°: no gator, the moss grey, the light low",
    REAL({ baseTemp: 46, nowTemp: 38, feels: 33, rh: 70, isDay: 1, code: 1, cloud: 20, nowWind: 9, nowDir: 330, nowGust: 16, nowUv: 1, uvMax: 3, windAmp: 6, gustAmp: 10, popCurve: () => 5, dailyPop: (p) => p.fill(8), sunrise: "07:23", sunset: "17:43",
      windCurve: ramp([[0, 6], [8, 9], [13, 12], [17, 10], [22, 6], [30, 5], [34, 8], [38, 11], [48, 7]]),
      gustCurve: ramp([[0, 11], [8, 16], [13, 21], [17, 17], [22, 11], [30, 9], [34, 14], [38, 18], [48, 12]]),
      dirCurve: ramp([[0, 320], [10, 330], [16, 340], [24, 350], [32, 370], [40, 390], [48, 400]]), buoyTemp: 52.7, wave: 2.2 })),
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
  REAL({ baseTemp: 74, nowTemp: 76, feels: 76, rh: 60, isDay: 1, code: 1, cloud: 18, nowWind: 9, nowDir: 40, nowGust: 15, nowUv: 3.4, uvMax: 5, windAmp: 6, gustAmp: 10, sunrise: "07:21", sunset: "18:52", popCurve: () => 5, dailyPop: (p) => p.fill(8),
    windCurve: ramp([[0, 6], [8, 7], [12, 10], [16, 9], [20, 6], [26, 5], [32, 6], [36, 9], [40, 11], [48, 7]]),
    gustCurve: ramp([[0, 11], [8, 12], [12, 16], [16, 15], [20, 11], [26, 9], [32, 11], [36, 15], [40, 18], [48, 12]]),
    dirCurve: ramp([[0, 30], [10, 40], [16, 55], [22, 45], [30, 35], [36, 50], [42, 70], [48, 80]]), buoyTemp: 78.4, wave: 2.4 })));
/* The year's biggest flood: NOAA's table has 9.35 ft at 10:17 am on October 27 2026 and 9.36 the next
   morning, the top of the season. A northeast wind on it, the wind that holds water in */
CASES.push(C("king-tide", "2026-10-27T08:40:00", .8, "the season's highest tide on a bright northeast morning: the spartina going under",
  REAL({ baseTemp: 66, nowTemp: 63, feels: 63, rh: 68, isDay: 1, code: 1, cloud: 12, nowWind: 13, nowDir: 45, nowGust: 21, nowUv: 1.6, uvMax: 4.6, windAmp: 6, gustAmp: 10, sunrise: "07:38", sunset: "18:33", popCurve: () => 5, dailyPop: (p) => p.fill(6),
    windCurve: ramp([[0, 10], [8, 13], [12, 15], [16, 14], [20, 10], [26, 8], [32, 9], [36, 12], [42, 11], [48, 8]]),
    gustCurve: ramp([[0, 17], [8, 21], [12, 24], [16, 22], [20, 16], [26, 13], [32, 15], [36, 19], [42, 18], [48, 13]]),
    dirCurve: ramp([[0, 40], [10, 45], [16, 60], [22, 50], [30, 40], [38, 55], [48, 70]]), buoyTemp: 74.6, wave: 3.1 })));
/* A May evening on the real table: the spring tide's 9.12 ft flood at 9:39 pm on May 16 2026, the evening
   high the spring floods fall on (the fall's are the morning's), a sea breeze laying down after dark, and
   the cobia in Port Royal Sound with May closed to keeping them, which the in-season row says */
CASES.push(C("may-evening", "2026-05-16T18:30:00", .7, "a warm May evening on the spring tide: the evening flood coming, the sea breeze laying down",
  REAL({ baseTemp: 80, nowTemp: 81, feels: 83, rh: 62, isDay: 1, code: 1, cloud: 15, nowWind: 12, nowDir: 160, nowGust: 18, nowUv: 1.2, uvMax: 9.5, windAmp: 6, gustAmp: 9, sunrise: "06:28", sunset: "20:13", popCurve: () => 5, dailyPop: (p) => p.fill(8),
    windCurve: ramp([[0, 5], [8, 6], [12, 9], [17, 13], [19, 12], [22, 7], [26, 5], [32, 5], [36, 9], [41, 14], [48, 8]]),
    gustCurve: ramp([[0, 9], [8, 10], [12, 14], [17, 19], [19, 18], [22, 12], [26, 9], [32, 9], [36, 14], [41, 21], [48, 13]]),
    dirCurve: ramp([[0, 220], [9, 200], [14, 170], [18, 160], [22, 190], [28, 225], [34, 210], [40, 165], [48, 185]]), buoyTemp: 75.3, wave: 2.1 })));
/* the water section after dark, on the carved week's real table: the morning's 8.3 ft flood ahead */
CASES.push(C("water-night", "2026-10-23T21:30:00", .5, "an October night on the real table, the next morning's flood tide on the chart",
  REAL({ baseTemp: 66, nowTemp: 64, feels: 64, rh: 75, isDay: 0, code: 0, cloud: 6, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "07:34", sunset: "18:37", popCurve: () => 5, dailyPop: (p) => p.fill(8),
    windCurve: ramp([[0, 6], [12, 9], [18, 7], [22, 6], [26, 4], [30, 0], [32, 3], [36, 8], [42, 12], [48, 9]]),
    gustCurve: ramp([[0, 10], [12, 15], [18, 12], [22, 10], [26, 7], [30, 3], [32, 6], [36, 13], [42, 19], [48, 14]]),
    dirCurve: ramp([[0, 30], [20, 30], [28, 20], [36, 60], [44, 90], [48, 100]]), buoyTemp: 75.6, wave: 2 })));
/* Today, from the real forecast: Open-Meteo's run at the house (fetched 7 am October 16 2026, wind direction
   and all), NOAA's table, the Fripp buoy's 77.2°, Open-Meteo's 1.3 ft of seas, and the Small Craft Advisory
   and Gale Watch Charleston had up for AMZ362 that morning (Sat 5 am to 2 pm, then Sat 2 pm to Tue 3 am),
   written here in the alerts API's shape. It is read at 1:05 pm, so the run's own 1 pm hour stands in
   for the reading the page would have then */
const OM_TODAY = JSON.parse(readFileSync(path.join(HERE, "fixtures", "open-meteo-bft-2026-10-16.json"), "utf8"));
const at13 = OM_TODAY.hourly.time.indexOf("2026-10-16T13:00"), hr13 = (k) => OM_TODAY.hourly[k][at13];
CASES.push(C("today", "2026-10-16T13:05:00", .5, "today, on the real forecast: light southwest, the northerly surge coming Saturday",
  REAL({ forecast: OM_TODAY, current: { time: "2026-10-16T13:00", temperature_2m: hr13("temperature_2m"), apparent_temperature: hr13("apparent_temperature"),
      weather_code: hr13("weather_code"), wind_speed_10m: hr13("wind_speed_10m"), wind_direction_10m: hr13("wind_direction_10m"), wind_gusts_10m: hr13("wind_gusts_10m"),
      uv_index: hr13("uv_index"), is_day: 1, cloud_cover: 6, relative_humidity_2m: 58 },
    baseTemp: 76, nowTemp: hr13("temperature_2m"), feels: hr13("apparent_temperature"), code: 0, popCurve: () => 0, buoyTemp: 77.2, wave: 1.3,
    marineAlerts: () => [
      { properties: { id: "mock-sca-1016", event: "Small Craft Advisory", severity: "Minor", onset: "2026-10-17T05:00:00-04:00", ends: "2026-10-17T14:00:00-04:00", expires: "2026-10-17T14:00:00-04:00",
        description: "* WHAT...North winds 20 to 25 kt with gusts up to 30 kt and seas 3 to 4 ft.", instruction: "", parameters: { VTEC: ["/O.NEW.KCHS.SC.Y.0058.261017T0900Z-261017T1800Z/"] }, affectedZones: [] } },
      { properties: { id: "mock-gale-1016", event: "Gale Watch", severity: "Moderate", onset: "2026-10-17T14:00:00-04:00", ends: "2026-10-20T03:00:00-04:00", expires: "2026-10-17T05:00:00-04:00",
        description: "* WHAT...Northeast winds 30 kt with gusts up to 40 kt and seas 5 to 9 ft possible.", instruction: "", parameters: { VTEC: ["/O.NEW.KCHS.GL.A.0007.261017T1800Z-261020T0700Z/"] }, affectedZones: [] } }] })));
CASES.push(C("october-moon", "2026-10-24T21:30:00", .5, "the carved week under a moon a night short of full: the lantern lit, the bats out, the witch crossing the moon, eyes in the grass",
  { baseTemp: 66, nowTemp: 64, feels: 64, rh: 75, isDay: 0, code: 0, cloud: 6, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "07:35", sunset: "18:36", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));
CASES.push(C("halloween-night", "2026-10-31T20:40:00", .4, "Halloween night: the trick-or-treater on the walkway",
  { baseTemp: 65, nowTemp: 63, feels: 63, rh: 80, isDay: 0, code: 0, cloud: 8, nowWind: 7, nowDir: 30, nowGust: 12, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "07:40", sunset: "18:29", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));
CASES.push(C("november-morning", "2026-11-01T09:30:00", .5, "the morning of November 1: every decoration down",
  { baseTemp: 64, nowTemp: 60, feels: 60, rh: 70, isDay: 1, code: 1, cloud: 18, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 2, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "06:41", sunset: "17:28", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));

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
    /* the water section fits its column at every width: no word on the tide chart or its wind row off the
       chart, none on top of another, and the in-season row inside the section's padding on one line */
    const waterFit = await page.evaluate(() => {
      const out = [], svg = document.getElementById("tideSvg"), sr = svg.getBoundingClientRect();
      const T = [...svg.querySelectorAll("text")].map((t) => ({ s: t.textContent, r: t.getBoundingClientRect() })).filter((t) => t.r.width > 0);
      for (const t of T) if (t.r.left < sr.left - .5 || t.r.right > sr.right + .5 || t.r.bottom > sr.bottom + .5) out.push(`"${t.s}" runs off the chart`);
      for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
        const a = T[i].r, b = T[j].r, w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 2) out.push(`"${T[i].s}" on "${T[j].s}"`);
      }
      const row = document.getElementById("runsRow");
      if (row && !row.hidden) {
        /* every month's row, not only this case's: the busiest (April and May, six of them) has to fit a
           320 phone on one line too, and the row's held height has to hold every one */
        const sec = document.getElementById("tideSection").getBoundingClientRect(), pad = 19.5;
        const check = (m) => {
          const runs = [...row.querySelectorAll(".run")].map((e) => e.getBoundingClientRect());
          for (const r of runs) if (r.left < sec.left + pad || r.right > sec.right - pad) out.push(`an in-season fish runs past the column${m ? " in month " + m : ""}`);
          if (new Set(runs.map((r) => Math.round(r.top))).size > 1) out.push(`the in-season row wraps${m ? " in month " + m : ""}`);
          /* the row is never taller than the height held for it before its fish land */
          if (row.getBoundingClientRect().height > parseFloat(getComputedStyle(row).minHeight) + .5) out.push(`the in-season row is taller than the height held for it${m ? " in month " + m : ""}`);
        };
        check(0);
        const keep = row.innerHTML;
        for (let m = 1; m <= 12; m++) { renderRuns(RUNS.bft, new Date(2026, m - 1, 15, 12)); check(m); }
        row.innerHTML = keep;
      }
      return out;
    });
    if (waterFit.length) errs.push("water: " + waterFit.join(", "));
    const tag = `${cs.name}-${width}`;
    await page.locator(".sky").screenshot({ path: path.join(OUT, `scene-${tag}.png`) }).catch((e) => errs.push("sky shot: " + e.message));
    await page.locator("#sceneSvg").screenshot({ path: path.join(OUT, `scene-${tag}-scene.png`) }).catch((e) => errs.push("scene shot: " + e.message));
    /* the water section, title, note, chart and the rows under it, as the phone shows it */
    await page.locator("#tideSection").screenshot({ path: path.join(OUT, `scene-${tag}-water.png`) }).catch((e) => errs.push("water shot: " + e.message));
    /* and the whole page, when asked (PORCH_BFT_FULL=1), to see the water section in its place */
    if (process.env.PORCH_BFT_FULL) await page.screenshot({ path: path.join(OUT, `scene-${tag}-page.png`), fullPage: true }).catch((e) => errs.push("page shot: " + e.message));
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

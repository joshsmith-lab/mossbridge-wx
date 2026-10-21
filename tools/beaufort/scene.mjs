/**
 * The Beaufort scene in the real page, in every weather, tide and October case, from the fixtures. Any
 * drawing still being made in tools/beaufort/parts/ is loaded into the page where the Storybook cast ends,
 * over index.html's own (index.html on disk is not changed). The fixtures' tide table drives the river.
 *
 *   TZ=America/New_York node tools/beaufort/scene.mjs              # every case
 *   TZ=America/New_York node tools/beaufort/scene.mjs noon night   # only the cases whose name matches
 *   PORCH_BFT_WIDTHS=390,430,760 ...                               # the widths to shoot (default 390,430)
 *   PORCH_BFT_PRM=1 ...                                            # under reduced motion (default: motion on, as on a phone)
 *   PORCH_BFT_GRASS_TIDES=0,.05,.1 ...                             # the tides the grass check paints again at (default 0,.15,.5,.8,1)
 *
 * Writes tools/shots/beaufort/scene-<case>-<width>.png (the sky block, type and all),
 * scene-<case>-<width>-scene.png (the picture alone) and scene-<case>-<width>-water.png (the water section:
 * the grass line, the wind row, the gusts line, the offshore advisories and the in-season row), and with
 * PORCH_BFT_FULL=1 the whole page too, and prints any page errors, any animal standing on another, and any
 * word or line in the water section off its chart or on another. It fails an animal overlap, more than 120
 * animations, a tuft of grass with nothing under its foot (grassCheck), and anything wrong in the water section.
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
      /* a Small Craft Advisory for AMZ362 the way Charleston writes one on a day like this, in the alerts
         API's shape. Made up, not an archived product */
      marineAlerts: (now) => [{ properties: { id: "fixture-sca-0418", event: "Small Craft Advisory", severity: "Minor",
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
   re-typed here in the alerts API's shape from the times posted, not the archived products. It is read at
   1:05 pm, so the run's own 1 pm hour stands in for the reading the page would have then. Its Saturday is
   two gusty stretches, 5 to 9 am to 25 and from 11 am to 31: where the line has room for one, it is the
   stronger */
const OM_TODAY = JSON.parse(readFileSync(path.join(HERE, "fixtures", "open-meteo-bft-2026-10-16.json"), "utf8"));
const at13 = OM_TODAY.hourly.time.indexOf("2026-10-16T13:00"), hr13 = (k) => OM_TODAY.hourly[k][at13];
CASES.push(C("today", "2026-10-16T13:05:00", .5, "today, on the real forecast: light southwest, the northerly surge coming Saturday",
  REAL({ forecast: OM_TODAY, current: { time: "2026-10-16T13:00", temperature_2m: hr13("temperature_2m"), apparent_temperature: hr13("apparent_temperature"),
      weather_code: hr13("weather_code"), wind_speed_10m: hr13("wind_speed_10m"), wind_direction_10m: hr13("wind_direction_10m"), wind_gusts_10m: hr13("wind_gusts_10m"),
      uv_index: hr13("uv_index"), is_day: 1, cloud_cover: 6, relative_humidity_2m: 58 },
    baseTemp: 76, nowTemp: hr13("temperature_2m"), feels: hr13("apparent_temperature"), code: 0, popCurve: () => 0, buoyTemp: 77.2, wave: 1.3,
    marineAlerts: () => [
      { properties: { id: "fixture-sca-1016", event: "Small Craft Advisory", severity: "Minor", onset: "2026-10-17T05:00:00-04:00", ends: "2026-10-17T14:00:00-04:00", expires: "2026-10-17T14:00:00-04:00",
        description: "* WHAT...North winds 20 to 25 kt with gusts up to 30 kt and seas 3 to 4 ft.", instruction: "", parameters: { VTEC: ["/O.NEW.KCHS.SC.Y.0058.261017T0900Z-261017T1800Z/"] }, affectedZones: [] } },
      { properties: { id: "fixture-gale-1016", event: "Gale Watch", severity: "Moderate", onset: "2026-10-17T14:00:00-04:00", ends: "2026-10-20T03:00:00-04:00", expires: "2026-10-17T05:00:00-04:00",
        description: "* WHAT...Northeast winds 30 kt with gusts up to 40 kt and seas 5 to 9 ft possible.", instruction: "", parameters: { VTEC: ["/O.NEW.KCHS.GL.A.0007.261017T1800Z-261020T0700Z/"] }, affectedZones: [] } }] })));
/* The same real run on Saturday night, the northeaster's gusts to 35 in the dark: the gusts line and the
   advisory bar in the night's inks, and a Gale Warning with no end given (made up, in the alerts API's shape),
   which runs to the chart's edge square, because a product's expiry is never the end of the wind. The run's
   own 9 pm hour is the reading, and its days start at Saturday */
const omAt = (om, iso) => { const day = iso.slice(0, 10), k = om.daily.time.indexOf(day), at = om.hourly.time.indexOf(iso.slice(0, 13) + ":00");
  const daily = Object.fromEntries(Object.entries(om.daily).map(([key, v]) => [key, v.slice(k)]));
  const hr = (key) => om.hourly[key]?.[at];
  return { forecast: { ...om, daily }, current: { time: iso.slice(0, 13) + ":00", temperature_2m: hr("temperature_2m"), apparent_temperature: hr("apparent_temperature"),
    weather_code: hr("weather_code"), wind_speed_10m: hr("wind_speed_10m"), wind_direction_10m: hr("wind_direction_10m"), wind_gusts_10m: hr("wind_gusts_10m"),
    uv_index: hr("uv_index"), relative_humidity_2m: hr("relative_humidity_2m") ?? 70, cloud_cover: hr("cloud_cover") ?? 20, is_day: hr("is_day") ?? 0 }, nowTemp: hr("temperature_2m"), feels: hr("apparent_temperature") }; };
CASES.push(C("gale-night", "2026-10-17T21:30:00", .5, "Saturday night on the real forecast: the northeaster gusting to 35, a gale offshore",
  REAL({ ...omAt(OM_TODAY, "2026-10-17T21:30"), baseTemp: 66, isDay: 0, code: 3, popCurve: () => 10, buoyTemp: 76.8, wave: 5.4,
    marineAlerts: () => [
      { properties: { id: "fixture-gale-1017", event: "Gale Warning", severity: "Moderate", onset: "2026-10-17T14:00:00-04:00", ends: null, expires: "2026-10-18T05:00:00-04:00",
        description: "* WHAT...Northeast winds 30 to 35 kt with gusts up to 40 kt and seas 7 to 9 ft.", instruction: "", parameters: { VTEC: ["/O.UPG.KCHS.GL.A.0007.261017T1800Z-261020T0700Z/", "/O.NEW.KCHS.GL.W.0012.261017T1800Z-000000T0000Z/"] }, affectedZones: [] } }] })));
/* A summer afternoon sea breeze with gusts to 25 and nothing offshore: the gusts line alone under the row */
CASES.push(C("sea-breeze", "2026-08-09T14:30:00", .5, "an August afternoon, the sea breeze gusting to 25, nothing offshore",
  REAL({ baseTemp: 86, nowTemp: 90, feels: 99, rh: 60, isDay: 1, code: 1, cloud: 20, nowWind: 15, nowDir: 190, nowGust: 24, nowUv: 8.8, uvMax: 10, windAmp: 6, gustAmp: 9, popCurve: () => 8, dailyPop: (p) => p.fill(12),
    windCurve: ramp([[0, 6], [8, 5], [11, 9], [14, 15], [17, 16], [20, 10], [24, 6], [32, 5], [35, 9], [38, 14], [48, 7]]),
    gustCurve: ramp([[0, 10], [8, 9], [11, 15], [14, 24], [17, 25], [19, 19], [24, 10], [32, 9], [35, 15], [38, 22], [48, 11]]),
    dirCurve: ramp([[0, 230], [10, 215], [14, 190], [18, 170], [22, 200], [30, 230], [36, 200], [40, 175], [48, 210]]), buoyTemp: 85.2, wave: 2.4 })));
CASES.push(C("october-moon", "2026-10-24T21:30:00", .5, "the carved week under a moon a night short of full: the lantern lit, the bats out, the witch crossing the moon, eyes in the grass",
  { baseTemp: 66, nowTemp: 64, feels: 64, rh: 75, isDay: 0, code: 0, cloud: 6, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "07:35", sunset: "18:36", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));
CASES.push(C("halloween-night", "2026-10-31T20:40:00", .4, "Halloween night: the trick-or-treater on the walkway",
  { baseTemp: 65, nowTemp: 63, feels: 63, rh: 80, isDay: 0, code: 0, cloud: 8, nowWind: 7, nowDir: 30, nowGust: 12, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "07:40", sunset: "18:29", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));
CASES.push(C("november-morning", "2026-11-01T09:30:00", .5, "the morning of November 1: every decoration down",
  { baseTemp: 64, nowTemp: 60, feels: 60, rh: 70, isDay: 1, code: 1, cloud: 18, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 2, uvMax: 4, windAmp: 5, gustAmp: 8, sunrise: "06:41", sunset: "17:28", popCurve: () => 5, dailyPop: (p) => p.fill(8) }));

/* the sun behind the oak */
/* Josh at about 8:35 on October 16 2026, "when the sun is behind the oak tree, like
   it is now, that tree should really glow like it would in real life". Each clear morning the sun crosses
   behind the crown for a while after sunrise, and the crown's rim, the moss's glow, the glare and the shade
   are drawn only while it is there and the sky lets it through (bftBacklight); the evening sun sets behind the
   palmettos the same way. glow and palms say whether the oak and the palmettos are lit from behind, and the
   harness fails a case where they are not what they should be */
const MORNING = { baseTemp: 72, nowTemp: 70, feels: 76, rh: 88, isDay: 1, code: 1, cloud: 12, nowWind: 3, nowDir: 220, nowGust: 6, nowUv: 1.2, uvMax: 5, windAmp: 4, gustAmp: 6,
  popCurve: () => 5, dailyPop: (p) => p.fill(8), sunrise: "07:27", sunset: "18:48" };
const B = (glow, palms, cs) => ({ ...cs, glow, palms });
CASES.push(B(true, false, C("this-morning", "2026-10-16T08:35:00", .15, "Josh's morning, October 16 2026 at 8:35: the sun low over Lady's Island behind the oak's crown, the crown rimmed and the moss lit, the tide near low, the flats out and the grass on its mud", { ...MORNING })));
CASES.push(B(true, false, C("sunrise-oak", "2026-10-16T07:50:00", .25, "just after sunrise: the sun low behind the trunk and the low limbs, the light warmer, beams in the mist", { ...MORNING, nowTemp: 66, feels: 66, rh: 94, nowUv: .3 })));
CASES.push(B(true, false, C("summer-morning", "2026-06-15T07:15:00", .5, "a June morning an hour after sunrise, the sun behind the crown's left side", { ...MORNING, baseTemp: 84, nowTemp: 78, feels: 82, rh: 86, nowUv: 1.6, uvMax: 10, sunrise: "06:15", sunset: "20:29" })));
CASES.push(B(true, false, C("thin-cloud", "2026-10-16T08:35:00", .15, "this morning under thin cloud: the rim and the glow half as strong, no beams", { ...MORNING, code: 2, cloud: 55 })));
CASES.push(B(false, false, C("overcast", "2026-10-16T08:35:00", .15, "this morning overcast: no rim, no glow, no shadow", { ...MORNING, code: 3, cloud: 95 })));
CASES.push(B(false, false, C("fog", "2026-10-16T08:35:00", .15, "this morning in fog: none of it", { ...MORNING, code: 45, cloud: 100, rh: 99 })));
CASES.push(B(false, false, C("clear-of-crown", "2026-10-16T10:45:00", .5, "later this morning, the sun clear of the crown: the oak in its ordinary light", { ...MORNING, nowTemp: 76, feels: 76, rh: 70, nowUv: 3.6 })));
CASES.push(B(false, true, C("palm-sunset", "2026-10-16T18:25:00", .6, "this evening, the sun going down behind the palmettos: their fronds lit through, their trunks dark", { ...MORNING, nowTemp: 72, feels: 72, rh: 70, nowUv: .1 })));
/* the grass at every tide */
/* the spartina stands on the marsh platform: on its wet mud when the water is down and in the river on a spring
   high, and never over air or over water it is not standing in (the grass check below walks every tuft) */
CASES.push(C("grass-dead-low", "2026-09-20T10:30:00", 0, "dead low on a September morning: the flats all the way out, the grass on the marsh's wet mud edge",
  { ...MORNING, baseTemp: 80, nowTemp: 79, feels: 82, rh: 74, nowUv: 5, uvMax: 7, sunrise: "07:09", sunset: "19:21" }));
CASES.push(C("grass-mid-tide", "2026-09-20T13:30:00", .5, "half tide: the flats half out, the mud edge under the grass still wet",
  { ...MORNING, baseTemp: 84, nowTemp: 83, feels: 87, rh: 64, nowUv: 7, uvMax: 7, sunrise: "07:09", sunset: "19:21" }));
CASES.push(C("grass-flood-tide", "2026-09-20T15:20:00", .8, "the flood near the top: the flats nearly under, the river just under the grass, a strip of wet bank still out",
  { ...MORNING, baseTemp: 84, nowTemp: 83, feels: 86, rh: 64, nowUv: 5, uvMax: 7, sunrise: "07:09", sunset: "19:21" }));
CASES.push(C("grass-spring-high", "2026-09-20T16:40:00", 1, "a spring high: the river up around the grass's stems, the flats under",
  { ...MORNING, baseTemp: 84, nowTemp: 82, feels: 85, rh: 66, nowUv: 3, uvMax: 7, sunrise: "07:09", sunset: "19:21" }));
/* what each water case's wind lane has to say: the gusts' words (an ordinary day none), the offshore
   advisory's words and whether its bar runs on past the chart, and the chart's spoken label */
const LANES = {
  "noon-summer": { gusts: [], zone: "" },
  "winter-morning": { gusts: [], zone: "" },
  "october-afternoon": { gusts: [], zone: "" },
  "may-evening": { gusts: [], zone: "" },
  "water-night": { gusts: [], zone: "" },
  "king-tide": { gusts: ["gusts to 24"], zone: "", said: ["gusts to 24 miles an hour from 9 am until 5 pm"] },
  "windy-clear": { gusts: ["gusts to 34"], zone: "offshore small craft advisory", open: false,
    said: ["Wind now from the west-southwest 22 miles an hour, gusts 34", "gusts to 34 miles an hour until 10 pm", "an offshore Small Craft Advisory now until 10 pm"] },
  "today": { gusts: ["gusts to 31"], zone: "offshore small craft advisory · gale watch", open: true,
    said: ["gusts to 25 miles an hour from Saturday at 5 am until 9 am", "gusts to 31 miles an hour from Saturday at 11 am,",
      "an offshore Small Craft Advisory from Saturday at 5 am until 2 pm", "an offshore Gale Watch from Saturday at 2 pm until Tuesday 3 am"] },
  "gale-night": { gusts: ["gusts to 35"], zone: "offshore gale warning", open: true, said: ["gusts to 35 miles an hour until Sunday 11 am", "an offshore Gale Warning now"] },
  "sea-breeze": { gusts: ["gusts to 25"], zone: "", said: ["gusts to 25 miles an hour until 7 pm"] },
};
for (const c of CASES) if (LANES[c.name]) c.lane = LANES[c.name];

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

/* The grass check. Every spartina tuft's foot, measured on the real page against what the still picture
   draws under it (the shapes tagged data-ground: the river, the flats, the bank's mud and the land, the
   topmost one at the point): the grass is rooted in the land or the mud, it stands in the river only from
   BFT_GRASS_WET up (a spring high, the water up around its stems), and it is never over air. Below the wet
   line, with the water under every stem, the ground also has to stand over each foot, so the foot is seen
   against the bank's own mud and never against the river behind it, which is how the grass read as floating
   at low water: 2.5 units at dead low, 1.5 at mean tide, and from there down to none at the wet line, with
   no step anywhere between. Only what the frame shows is measured: a foot past the frame's edge, which no
   phone shows, is left out, and so is any point of a foot that is. It is run at the case's own tide and
   then at each of GRASS_TIDES, the page painted again at that tide (tideLevel stood in for), at every width */
const GRASS_TIDES = process.env.PORCH_BFT_GRASS_TIDES ? process.env.PORCH_BFT_GRASS_TIDES.split(",").map(Number) : [0, .15, .5, .8, 1];
async function grassCheck(page) {
  return page.evaluate(async (tides) => {
    const measure = () => {
      const fx = document.getElementById("sceneFx");
      const grounds = ["sceneSvg", "sceneNear"].flatMap((id) => [...document.getElementById(id).querySelectorAll("[data-ground]")]);
      const toScreen = fx.getScreenCTM(), frame = document.querySelector(".scene").getBoundingClientRect();
      const kind = (x, y) => {
        const P = new DOMPoint(x, y).matrixTransform(toScreen);
        let top = "air";
        for (const g of grounds) if (g.isPointInFill(P.matrixTransform(g.getScreenCTM().inverse()))) top = g.dataset.ground;
        return top;
      };
      const seen = (x, y) => { const P = new DOMPoint(x, y).matrixTransform(toScreen); return P.x >= frame.left && P.x <= frame.right; };
      const feet = [...fx.querySelectorAll("[data-grass] path[fill='url(#blade)']")]
        .flatMap((p) => [...p.getAttribute("d").matchAll(/M (-?[\d.]+) (-?[\d.]+) Q/g)].map((m) => [+m[1] + .8, +m[2]]));
      /* how much ground has to stand over a foot: 2.5 units at dead low, 1.5 at mean tide, none from the wet line up */
      const t = SCENE_TIDE, wet = t >= BFT_GRASS_WET, bad = [];
      const need = t <= .5 ? 1.5 + (.5 - t) * 2 : t < BFT_GRASS_WET ? 1.5 * (BFT_GRASS_WET - t) / (BFT_GRASS_WET - .5) : 0;
      const ground = (k) => k === "land" || k === "mud";
      let off = 0;
      for (const [x, y] of feet) {
        /* the foot's two edges and its middle, those of them the frame shows */
        const xs = [-.7, 0, .7].map((dx) => x + dx).filter((sx) => seen(sx, y));
        if (!xs.length) { off++; continue; }
        const under = xs.map((sx) => kind(sx, y + .4));
        if (!under.every((k) => ground(k) || (wet && k === "water"))) { bad.push(`(${x.toFixed(1)}, ${y.toFixed(1)}) over ${under.join("/")}`); continue; }
        const hs = [];
        for (let h = .25; h < need; h += .25) hs.push(h);
        if (need > 0) hs.push(need);
        const behind = hs.flatMap((h) => xs.map((sx) => [h, kind(sx, y - h)])).find(([, k]) => !ground(k));
        if (behind) bad.push(`(${x.toFixed(1)}, ${y.toFixed(1)}) seen against ${behind[1]} ${behind[0].toFixed(2)} over its foot`);
      }
      return { tide: t, feet: feet.length - off, off, grounds: grounds.length, bad };
    };
    const out = [measure()];
    const own = tideLevel;
    try {
      for (const t of tides) { tideLevel = () => t; render(LAST.d, LAST.live, LAST.savedAt); await PAINT; out.push(measure()); }
    } finally { tideLevel = own; render(LAST.d, LAST.live, LAST.savedAt); await PAINT; }
    return out;
  }, GRASS_TIDES);
}

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
    /* what costs is what keeps running: the one-shot entrances (the strip's and the rain-soon bars'
       alertIn and grow, staggered and painted on the live paint) finish in about a second, so they
       are let finish before the count, the way tools/scene.mjs counts after its own waits */
    await page.evaluate(() => Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 4000))]));
    const info = await page.evaluate(() => ({ loc: typeof LOC !== "undefined" ? LOC.id : null, tide: typeof SCENE_TIDE !== "undefined" ? SCENE_TIDE : null,
      props: [...document.querySelectorAll(".scene :is([data-prop],[data-decor])")].map((n) => n.dataset.prop || "decor:" + n.dataset.decor),
      species: [...document.querySelectorAll(".scene [data-species]")].map((n) => n.dataset.species),
      running: document.getAnimations().filter((a) => a.playState === "running").length,
      byName: Object.entries(document.getAnimations().filter((a) => a.playState === "running").reduce((m, a) => { const k = a.animationName || a.id || "?"; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + " " + n).join(", ") }));
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
    /* the sun behind the oak, and behind the palmettos, only where the case says */
    const lit = await page.evaluate(() => ({ oak: document.querySelector('.scene [data-prop="sun-behind-oak"]')?.dataset.backlight || null,
      palms: [...document.querySelectorAll('.scene [data-prop="palmetto"][data-backlight]')].map((n) => n.dataset.backlight) }));
    if (cs.glow != null && !!lit.oak !== cs.glow) errs.push(`the oak is ${lit.oak ? "lit from behind (" + lit.oak + ")" : "not lit from behind"}, and should ${cs.glow ? "" : "not "}be`);
    if (cs.palms != null && !!lit.palms.length !== cs.palms) errs.push(`the palmettos are ${lit.palms.length ? "lit from behind (" + lit.palms.join(" ") + ")" : "not lit from behind"}, and should ${cs.palms ? "" : "not "}be`);
    if (lit.oak || lit.palms.length) info.backlight = `oak [${lit.oak || "-"}] palms [${lit.palms.join(" ") || "-"}]`;
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
      /* the wind lane under the lows: the gusts' hairlines and the advisories' bars touch no word and no
         other line, stay inside the chart's CHART_IN edges, and a bar sits nearer its own words under it
         than the gusts' words over it, so it never reads as their underline */
      const shapes = [...svg.querySelectorAll("[data-lane] line, line[data-lane], rect[data-lane], path[data-lane]")]
        .map((e) => ({ k: e.closest("[data-lane]").dataset.lane, r: e.getBoundingClientRect() })).filter((e) => e.r.width > 0);
      const k = sr.width / svg.viewBox.baseVal.width, inset = 16 * k;
      /* against a line a word is its ink, cap height over the baseline to its descenders, not the font's
         whole line box, which runs a few pixels over the capitals */
      const ink = [...svg.querySelectorAll("text")].filter((t) => t.getBoundingClientRect().width > 0).map((t) => {
        const r = t.getBoundingClientRect(), y = sr.top + +t.getAttribute("y") * k, f = +t.getAttribute("font-size") * k;
        return { s: t.textContent, r: { left: r.left, right: r.right, top: y - .76 * f, bottom: y + .24 * f } }; });
      for (const s of shapes) {
        if (s.r.left < sr.left + inset - 1 || s.r.right > sr.right - inset + 1) out.push(`a ${s.k} line runs past the chart's edge`);
        for (const t of ink) { const w = Math.min(s.r.right, t.r.right) - Math.max(s.r.left, t.r.left), h = Math.min(s.r.bottom, t.r.bottom) - Math.max(s.r.top, t.r.top);
          if (w > .5 && h > -2) out.push(`a ${s.k} line comes within 2px of "${t.s}"`); }
        for (const o of shapes) if (o !== s && o.k !== s.k) { const w = Math.min(s.r.right, o.r.right) - Math.max(s.r.left, o.r.left), h = Math.min(s.r.bottom, o.r.bottom) - Math.max(s.r.top, o.r.top);
          if (w > .5 && h > -3) out.push(`a ${s.k} line comes within 3px of a ${o.k} line`); }
      }
      /* one stretch's hairline ends well short of the next stretch's words, so two never read as one chain */
      const groups = [...svg.querySelectorAll('[data-lane="gusts"]')];
      for (const g of groups) for (const l of g.querySelectorAll("line")) { const lr = l.getBoundingClientRect();
        for (const o of groups) if (o !== g) { const tr = o.querySelector("text").getBoundingClientRect(), gap = Math.max(tr.left - lr.right, lr.left - tr.right);
          if (gap < 10) out.push(`a gusts hairline runs within ${gap.toFixed(1)}px of "${o.querySelector("text").textContent}"`); } }
      const gustWords = ink.filter((t) => /^gusts to \d+$/.test(t.s)), zoneWords = ink.filter((t) => /^offshore /.test(t.s)), bars = shapes.filter((s) => s.k === "zone");
      if (bars.length && gustWords.length && zoneWords.length) {
        const barTop = Math.min(...bars.map((b) => b.r.top)), barBot = Math.max(...bars.map((b) => b.r.bottom));
        const up = barTop - Math.max(...gustWords.map((t) => t.r.bottom)), down = zoneWords[0].r.top - barBot;
        if (!(up > down)) out.push(`the advisory's bar sits nearer the gusts' words (${up.toFixed(1)}px) than its own (${down.toFixed(1)}px)`);
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
    /* what the wind lane says, printed so a change in it is reviewable as text, and held to the case's own
       `lane` where it has one (the gusts' words, and the advisory's) */
    const lane = await page.evaluate(() => ({ gusts: [...document.querySelectorAll('#tideSvg [data-lane="gusts"] text')].map((t) => t.textContent),
      zone: document.querySelector('#tideSvg text[data-lane="zone"]')?.textContent || "",
      open: !!document.querySelector('#tideSvg path[data-lane="zone"]'), said: document.getElementById("tideSvg").getAttribute("aria-label") || "" }));
    if (cs.lane) {
      for (const g of cs.lane.gusts || []) if (!lane.gusts.includes(g)) errs.push(`the gusts line is missing "${g}": [${lane.gusts.join(", ")}]`);
      if (cs.lane.gusts && !cs.lane.gusts.length && lane.gusts.length) errs.push(`an ordinary day has a gusts line: [${lane.gusts.join(", ")}]`);
      if (cs.lane.zone != null && lane.zone !== cs.lane.zone) errs.push(`the advisory reads "${lane.zone}", not "${cs.lane.zone}"`);
      if (cs.lane.open != null && lane.open !== cs.lane.open) errs.push(`the advisory's bar ${lane.open ? "runs on" : "ends"} where it should not`);
      for (const w of cs.lane.said || []) if (!lane.said.includes(w)) errs.push(`the chart's spoken label does not say "${w}"`);
    }
    const tag = `${cs.name}-${width}`;
    await page.locator(".sky").screenshot({ path: path.join(OUT, `scene-${tag}.png`) }).catch((e) => errs.push("sky shot: " + e.message));
    await page.locator("#sceneSvg").screenshot({ path: path.join(OUT, `scene-${tag}-scene.png`) }).catch((e) => errs.push("scene shot: " + e.message));
    /* the water section, title, note, chart and the rows under it, as the phone shows it */
    await page.locator("#tideSection").screenshot({ path: path.join(OUT, `scene-${tag}-water.png`) }).catch((e) => errs.push("water shot: " + e.message));
    /* and the whole page, when asked (PORCH_BFT_FULL=1), to see the water section in its place */
    if (process.env.PORCH_BFT_FULL) await page.screenshot({ path: path.join(OUT, `scene-${tag}-page.png`), fullPage: true }).catch((e) => errs.push("page shot: " + e.message));
    console.log(`${tag}: loc ${info.loc}, tide ${info.tide == null ? "—" : info.tide.toFixed(2)}, props [${[...new Set(info.props)].join(" ")}], animals [${info.species.join(" ")}], ${info.running} animations${info.backlight ? ", backlight " + info.backlight : ""}`);
    if (lane.gusts.length || lane.zone) console.log(`  wind lane: [${lane.gusts.join(", ")}]${lane.zone ? ` · ${lane.zone}${lane.open ? " (runs on)" : ""}` : ""}`);
    if (process.env.PORCH_BFT_SAID) console.log(`  said: ${lane.said}`);
    if (process.env.PORCH_BFT_ANIMS) console.log(`  animations: ${info.byName}`);
    if (info.running > 120) errs.push(`${info.running} animations running, over the scenes' ceiling of 120`);
    if (info.loc !== "bft") { errs.push(`the page opened at ${info.loc}, not Beaufort`); }
    /* the grass is rooted, at the case's tide and at every one of GRASS_TIDES */
    const grass = await grassCheck(page).catch((e) => [{ tide: null, feet: 0, grounds: 0, bad: ["the grass check failed: " + e.message] }]);
    for (const g of grass) {
      const at = g.tide == null ? "—" : g.tide.toFixed(2);
      if (!g.feet || !g.grounds) errs.push(`grass at tide ${at}: ${g.feet} feet and ${g.grounds} ground shapes to measure them against`);
      if (g.bad.length) errs.push(`grass at tide ${at}: ${g.bad.length} of ${g.feet} feet floating: ${g.bad.slice(0, 6).join(", ")}${g.bad.length > 6 ? ", …" : ""}`);
    }
    console.log(`  grass: ${grass.map((g) => `${g.tide == null ? "—" : g.tide.toFixed(2)} ${g.bad.length ? g.bad.length + " floating" : "rooted"}`).join(" · ")} (${grass[0]?.feet ?? 0} feet in the frame, ${grass[0]?.off ?? 0} past its edge)`);
    /* the palmettos' crowns and the boat turn whole, each a box the compositor turns (October 21 2026): no sheet
       holds a crown or the boat, each crown half and the boat is a box of its own carrying its one turn (none
       under reduced motion), and every drawing in a box lies on the frame within a twentieth of a pixel, measured
       with the turns held off, because placed as a share of a small box it once landed a third of a pixel off */
    const lift = await page.evaluate((prm) => {
      const bad = [], main = document.getElementById("sceneSvg").getScreenCTM();
      for (const s of document.querySelectorAll(".scene svg")) if (!s.closest("#sceneLift") && s.querySelector(".bft-palm-crown,.bft-boat-rock")) bad.push(`#${s.id} still holds a crown or the boat`);
      const top = [...document.querySelectorAll("#sceneLift > .lift")];
      const crowns = top.filter((b) => b.querySelector(".bft-palm-crown")), boats = top.filter((b) => b.querySelector(".bft-boat-rock"));
      if (crowns.length !== 6) bad.push(`${crowns.length} crown boxes, not 6`);
      if (boats.length !== 1) bad.push(`${boats.length} boat boxes, not 1`);
      for (const b of [...crowns, ...boats]) {
        const own = b.getAnimations().map((a) => a.animationName), want = prm ? 0 : 1;
        if (own.length !== want) bad.push(`a ${b.querySelector(".bft-boat-rock") ? "boat" : "crown"} box turns ${own.length} times (${own.join(" ") || "none"}), not ${want}`);
      }
      const boxes = [...document.querySelectorAll("#sceneLift .lift")];
      boxes.forEach((b) => b.style.setProperty("transform", "none", "important"));
      let worst = 0;
      for (const s of document.querySelectorAll("#sceneLift svg")) { const m = s.getScreenCTM();
        worst = Math.max(worst, Math.abs(m.e - main.e), Math.abs(m.f - main.f), Math.abs(m.a - main.a) * 760, Math.abs(m.d - main.d) * 760); }
      boxes.forEach((b) => b.style.removeProperty("transform"));
      if (worst > .05) bad.push(`a box's drawing lies ${worst.toFixed(3)}px off the frame`);
      return { bad, boxes: boxes.length, worst };
    }, !!process.env.PORCH_BFT_PRM);
    errs.push(...lift.bad.map((b) => "lift: " + b));
    console.log(`  lift: ${lift.boxes} boxes, the drawings within ${lift.worst.toFixed(3)}px of the frame`);
    if (errs.length) { failed = true; console.log("  " + errs.join("\n  ")); }
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(`wrote ${OUT}`);
process.exit(failed ? 1 : 0);

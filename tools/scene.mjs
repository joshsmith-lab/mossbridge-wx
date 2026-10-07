/**
 * Scene and motion review for Porch Weather.
 *
 * tools/shots.mjs reviews the copy. This one reviews the picture: it forces the
 * scenes that are hard to wait for (golden hour, a warm clear night, a storm, a
 * fog morning, a hard blow) and reports, per scene:
 *
 *   - a screenshot of the sky block and of the scene on its own
 *   - how many CSS animations are still running, grouped by keyframe name
 *   - whether the page holds perfectly still under prefers-reduced-motion
 *   - how much layout and style recalculation the motion costs
 *
 *   npm i playwright && npx playwright install chromium
 *   TZ=America/New_York node tools/scene.mjs            # everything
 *   TZ=America/New_York node tools/scene.mjs golden fog # only matching scenes
 *
 * Run it with TZ=America/New_York: the scene runs off real `new Date()` and
 * solar position, so the wall clock is what puts the sun where it needs to be.
 *
 * On forcing time: this shifts `Date` the way tools/shots.mjs does rather than
 * using page.clock, because a faked clock also stops the CSS animations that
 * are the entire subject of this harness. Shifting keeps the compositor running
 * and still puts the sun, moon and season exactly where a scenario wants them.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LOC_TZ, serve, stage } from "./fixtures.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots", "scene");
const FONT_DIR = process.env.PORCH_FONT_DIR || "";
const PORT = Number(process.env.PORCH_PORT || 8801);
const PHONE_WIDTH = Number(process.env.PORCH_SCENE_WIDTH || 430);
const WILDLIFE_FRAMES = process.env.PORCH_WILDLIFE_FRAMES === "1";
const ONLY = process.argv.slice(2);

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed.\n  npm i playwright && npx playwright install chromium");
  process.exit(1);
}

/**
 * Wall-clock times are real Porters Neck / Shady Spring times, chosen so the
 * solar altitude lands where the scenario name says it does.
 * `tidePhase` shifts the tide fixture so a scene can be caught on a falling or
 * a rising tide.
 */
const CASES = [
  // ── marsh ──────────────────────────────────────────────────────────────
  { name: "01-marsh-calm-noon", loc: "mb", when: "2026-08-02T13:10:00", tidePhase: 0,
    note: "high sun, UV 9.6, 5 mph: water should be barely breathing, heat shimmer over the flat",
    o: { baseTemp: 88, nowTemp: 94, feels: 103, rh: 62, isDay: 1, code: 0, cloud: 6, nowWind: 5, nowDir: 200, nowGust: 8, nowUv: 9.6, uvMax: 10, windAmp: 4, gustAmp: 6,
      popCurve: () => 3, dailyPop: (p) => p.fill(8) } },
  { name: "02-marsh-windy-afternoon", loc: "mb", when: "2026-08-02T15:00:00", tidePhase: 3,
    note: "25 mph gusting 38: chop on the water, restless spartina, wave travelling downwind",
    o: { baseTemp: 82, nowTemp: 84, feels: 89, rh: 58, isDay: 1, code: 1, cloud: 26, nowWind: 25, nowDir: 235, nowGust: 38, nowUv: 6.4, uvMax: 8, windAmp: 16, gustAmp: 28,
      popCurve: () => 10, dailyPop: (p) => p.fill(15) } },
  { name: "03-marsh-golden-evening", loc: "mb", when: "2026-08-02T20:10:00", tidePhase: 0,
    note: "sun between +6 and -4: the ordinary dotted arc should warm quietly near the horizon",
    o: { baseTemp: 84, nowTemp: 86, feels: 92, rh: 70, isDay: 1, code: 1, cloud: 14, nowWind: 8, nowDir: 200, nowGust: 14, nowUv: 0.5, uvMax: 9, windAmp: 8, gustAmp: 13,
      popCurve: () => 8, dailyPop: (p) => p.fill(15) } },
  { name: "04-marsh-warm-clear-night", loc: "mb", when: "2026-08-02T23:10:00", tidePhase: 0,
    note: "78F, clear, August: fireflies, earthshine on the moon, the odd shooting star",
    o: { baseTemp: 79, nowTemp: 78, feels: 82, rh: 80, isDay: 0, code: 0, cloud: 8, nowWind: 4, nowDir: 38, nowGust: 7, nowUv: 0, uvMax: 9, windAmp: 5, gustAmp: 8,
      popCurve: () => 5, dailyPop: (p) => p.fill(10) } },
  { name: "05-marsh-storm-afternoon", loc: "mb", when: "2026-08-02T16:45:00", tidePhase: 0,
    note: "code 95: angled rain, splash ticks, the rare bolt behind the treeline",
    o: { baseTemp: 84, nowTemp: 81, feels: 88, rh: 88, isDay: 1, code: 95, cloud: 96, nowWind: 17, nowDir: 250, nowGust: 34, nowUv: 1.2, uvMax: 8, windAmp: 14, gustAmp: 26, nowcast: true,
      popCurve: (i, hr) => (hr >= 14 && hr <= 21 ? 78 : 20), dailyPop: (p) => { p[0] = 85; p[1] = 65; } } },
  { name: "06-marsh-fog-morning", loc: "mb", when: "2026-08-02T07:30:00", tidePhase: 0,
    note: "code 45: layered mist over the water, the marsh's best mood",
    o: { baseTemp: 74, nowTemp: 73, feels: 75, rh: 97, isDay: 1, code: 45, cloud: 88, nowWind: 3, nowDir: 120, nowGust: 6, nowUv: 0.6, uvMax: 7, windAmp: 4, gustAmp: 6,
      popCurve: () => 12, dailyPop: (p) => p.fill(20) } },
  { name: "07-marsh-drizzle-midday", loc: "mb", when: "2026-08-02T12:30:00", tidePhase: 0,
    note: "code 53: sparse, slow drops. Must not look like the downpour beside it",
    o: { baseTemp: 76, nowTemp: 77, feels: 80, rh: 90, isDay: 1, code: 53, cloud: 90, nowWind: 7, nowDir: 90, nowGust: 12, nowUv: 1.8, uvMax: 6, windAmp: 6, gustAmp: 10,
      popCurve: () => 60, dailyPop: (p) => p.fill(65) } },
  { name: "08-marsh-downpour-midday", loc: "mb", when: "2026-08-02T12:30:00", tidePhase: 0,
    note: "code 82: dense, fast, hard angle. Must not look like the drizzle beside it",
    o: { baseTemp: 76, nowTemp: 75, feels: 79, rh: 94, isDay: 1, code: 82, cloud: 98, nowWind: 21, nowDir: 240, nowGust: 33, nowUv: 1.1, uvMax: 6, windAmp: 14, gustAmp: 24,
      popCurve: () => 90, dailyPop: (p) => p.fill(90) } },
  // ── ridge ──────────────────────────────────────────────────────────────
  { name: "09-ridge-clear-day", loc: "sp", when: "2026-08-02T14:00:00",
    note: "hawk circling, hardwoods working, pond breathing",
    o: { baseTemp: 74, nowTemp: 79, feels: 79, rh: 50, isDay: 1, code: 1, cloud: 15, nowWind: 11, nowDir: 285, nowGust: 19, nowUv: 6.8, uvMax: 8, windAmp: 8, gustAmp: 14,
      popCurve: () => 6, dailyPop: (p) => p.fill(12) } },
  { name: "14-marsh-golden-morning", loc: "mb", when: "2026-08-02T06:35:00",
    note: "the other end of the day: rose and clean, and it should not look like the evening",
    o: { baseTemp: 76, nowTemp: 72, feels: 74, rh: 86, isDay: 1, code: 1, cloud: 16, nowWind: 5, nowDir: 30, nowGust: 9, nowUv: 0.4, uvMax: 9, windAmp: 6, gustAmp: 10,
      popCurve: () => 8, dailyPop: (p) => p.fill(15) } },
  { name: "15-ridge-golden-evening", loc: "sp", when: "2026-08-02T20:30:00",
    note: "amber, heavier, reaching further down the page than the morning does",
    o: { baseTemp: 72, nowTemp: 73, feels: 73, rh: 62, isDay: 1, code: 1, cloud: 14, nowWind: 6, nowDir: 290, nowGust: 11, nowUv: 0.3, uvMax: 8, windAmp: 6, gustAmp: 10,
      popCurve: () => 5, dailyPop: (p) => p.fill(10) } },
  { name: "11-ridge-evening-deer", loc: "sp", when: "2026-08-02T18:40:00",
    note: "sun low enough for the buck to come out: graze, ear flick, tail flick",
    o: { baseTemp: 72, nowTemp: 74, feels: 74, rh: 58, isDay: 1, code: 1, cloud: 12, nowWind: 6, nowDir: 290, nowGust: 10, nowUv: 1.4, uvMax: 8, windAmp: 6, gustAmp: 10,
      popCurve: () => 5, dailyPop: (p) => p.fill(10) } },
  { name: "12-ridge-snow-day", loc: "sp", when: "2026-01-14T11:20:00",
    note: "code 73: flakes drifting not streaking, dusting on the field, label says Snow",
    o: { baseTemp: 28, nowTemp: 27, feels: 18, rh: 84, isDay: 1, code: 73, cloud: 95, nowWind: 8, nowDir: 315, nowGust: 15, nowUv: 0.7, uvMax: 2,
      windAmp: 7, gustAmp: 12, sunrise: "07:36", sunset: "17:22",
      popCurve: () => 85, dailyPop: (p) => p.fill(85) } },
  { name: "13-marsh-freezing-rain", loc: "mb", when: "2026-01-14T08:10:00",
    note: "code 67: falls like rain because it is rain, but must never be called rain",
    o: { baseTemp: 33, nowTemp: 32, feels: 24, rh: 92, isDay: 1, code: 67, cloud: 97, nowWind: 12, nowDir: 40, nowGust: 21, nowUv: 0.4, uvMax: 2,
      windAmp: 9, gustAmp: 16, sunrise: "07:14", sunset: "17:20",
      popCurve: () => 90, dailyPop: (p) => p.fill(90) } },
  { name: "10-ridge-cold-night", loc: "sp", when: "2026-01-14T22:40:00",
    note: "24F January overcast: owl, no fireflies, everything slow",
    o: { baseTemp: 27, nowTemp: 24, feels: 16, rh: 76, isDay: 0, code: 3, cloud: 82, nowWind: 9, nowDir: 320, nowGust: 17, nowUv: 0, uvMax: 2, windAmp: 7, gustAmp: 13,
      sunrise: "07:36", sunset: "17:22",
      popCurve: () => 18, dailyPop: (p) => p.fill(25) } },
  { name: "16-ridge-warm-rain", loc: "sp", when: "2026-05-12T15:20:00",
    note: "warm rain: the frog should be readable beside the pond, with no grass through it",
    o: { baseTemp: 64, nowTemp: 64, feels: 63, rh: 91, isDay: 1, code: 61, cloud: 90, nowWind: 8, nowDir: 245, nowGust: 14, nowUv: 1.4, uvMax: 5,
      windAmp: 7, gustAmp: 12, sunrise: "06:14", sunset: "20:26",
      popCurve: () => 72, dailyPop: (p) => p.fill(70) } },
  { name: "24-marsh-night-rain", loc: "mb", when: "2026-05-12T22:20:00",
    note: "the only frame that puts the raccoon and the fiddler crab out together: neither may float, and the crab needs open water behind it",
    o: { baseTemp: 64, nowTemp: 63, feels: 63, rh: 95, isDay: 0, code: 63, cloud: 96, nowWind: 11, nowDir: 220, nowGust: 20, nowUv: 0, uvMax: 5,
      windAmp: 9, gustAmp: 17, sunrise: "06:11", sunset: "20:04",
      popCurve: () => 88, dailyPop: (p) => p.fill(88) } },
  { name: "25-marsh-thunder-nearby", loc: "mb", when: "2026-08-25T16:30:00",
    note: "the ordinary Wilmington August afternoon: rain in the grid cell, thunderstorms two hours out. The old rule drew no lightning at all here",
    o: { baseTemp: 84, nowTemp: 82, feels: 92, rh: 86, isDay: 1, code: 80, cloud: 92, nowWind: 13, nowDir: 235, nowGust: 24, nowUv: 1.6, uvMax: 8,
      windAmp: 11, gustAmp: 20,
      hourlyCode: (i, hr) => (hr >= 17 && hr <= 21 ? 95 : hr >= 14 ? 80 : 3),
      popCurve: (i, hr) => (hr >= 14 && hr <= 21 ? 72 : 20), dailyPop: (p) => { p[0] = 80; p[1] = 55; } } },
  // ── the holidays ───────────────────────────────────────────────────────
  // `decor` is what has to be set out (and nothing else), `candles` how many are lit. Each one
  // with decorations out also writes a close-up of them, because a pumpkin is seven pixels
  // across on a phone and has to hold up at both sizes.
  { name: "26-marsh-october-afternoon", loc: "mb", when: "2026-10-10T15:30:00", decor: ["ghostface", "pumpkin", "blood-moon", "black-cat"], candles: 0,
    note: "Halloween is up: two pumpkins on the dock, nothing carved yet, Ghostface in the oak's fork, the oystercatcher on the rake",
    o: { baseTemp: 71, nowTemp: 75, feels: 75, rh: 55, isDay: 1, code: 1, cloud: 18, nowWind: 9, nowDir: 40, nowGust: 15, nowUv: 3.4, uvMax: 5, windAmp: 6, gustAmp: 10,
      sunrise: "07:13", sunset: "18:44", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "27-marsh-halloween-night", loc: "mb", when: "2026-10-31T20:40:00", decor: ["ghostface", "jack-o-lantern", "pumpkin", "trick-or-treater", "bat", "witch", "black-cat", "eyes", "wisps"], candles: 1, bats: 6, witch: true,
    note: "Halloween night: the carved one lit, its light on the water, the candle guttering in a light breeze, and a trick-or-treater at the landward end of the dock, the black cat beside the lantern, eyes in the spartina and three marsh lights low over the water",
    o: { baseTemp: 63, nowTemp: 61, feels: 61, rh: 80, isDay: 0, code: 0, cloud: 8, nowWind: 7, nowDir: 30, nowGust: 12, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8,
      sunrise: "07:32", sunset: "18:18", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "28-marsh-halloween-cold-morning", loc: "mb", when: "2026-10-27T08:40:00", decor: ["ghostface", "jack-o-lantern", "pumpkin"], candles: 0,
    note: "a cold snap in the carved week: the cormorant on the middle piling beside the pumpkins, the black cat in and the dock left to it, and no candle by day",
    o: { baseTemp: 50, nowTemp: 45, feels: 41, rh: 70, isDay: 1, code: 1, cloud: 22, nowWind: 12, nowDir: 350, nowGust: 20, nowUv: 1.2, uvMax: 4, windAmp: 8, gustAmp: 12,
      sunrise: "07:28", sunset: "18:23", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "29-marsh-halloween-rain-night", loc: "mb", when: "2026-10-29T21:00:00", decor: ["ghostface", "jack-o-lantern", "pumpkin", "blood-moon"], candles: 0,
    note: "rain in the carved week: the pumpkins stay out and the candle is not lit, and the cat, the eyes and the marsh lights are in",
    o: { baseTemp: 64, nowTemp: 63, feels: 63, rh: 95, isDay: 0, code: 63, cloud: 96, nowWind: 11, nowDir: 60, nowGust: 19, nowUv: 0, uvMax: 3, windAmp: 8, gustAmp: 14,
      sunrise: "07:30", sunset: "18:20", popCurve: () => 85, dailyPop: (p) => p.fill(85) } },
  { name: "36-marsh-october-golden-evening", loc: "mb", when: "2026-10-10T18:25:00", decor: ["ghostface", "pumpkin", "black-cat"], candles: 0,
    note: "golden hour in October: Ghostface's mask and the pumpkins warm with the oak, and nothing is lit yet",
    o: { baseTemp: 71, nowTemp: 72, feels: 72, rh: 60, isDay: 1, code: 1, cloud: 18, nowWind: 8, nowDir: 40, nowGust: 13, nowUv: 0.2, uvMax: 5, windAmp: 6, gustAmp: 10,
      sunrise: "07:13", sunset: "18:44", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "37-marsh-october-fog-morning", loc: "mb", when: "2026-10-14T09:40:00", decor: ["ghostface", "pumpkin", "black-cat"], candles: 0,
    note: "code 45 in October: the fog takes the oak back and Ghostface greys with it, the mask still the palest thing in the crown",
    o: { baseTemp: 62, nowTemp: 61, feels: 61, rh: 99, isDay: 1, code: 45, cloud: 100, nowWind: 2, nowDir: 60, nowGust: 4, nowUv: 0.8, uvMax: 4, windAmp: 1, gustAmp: 2,
      sunrise: "07:17", sunset: "18:38", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "38-marsh-october-moon", loc: "mb", when: "2026-10-24T21:30:00", decor: ["ghostface", "jack-o-lantern", "pumpkin", "bat", "witch", "blood-moon", "black-cat", "eyes", "wisps"], candles: 1, moon: true, bats: 7, witch: true,
    note: "the moon a night short of full over the marsh in the carved week: Halloween's moon (HALLOWEEN_MOON) in its real place and phase, its light on the water in its own colour, the bats keeping off it and the witch crossing it",
    o: { baseTemp: 64, nowTemp: 62, feels: 62, rh: 75, isDay: 0, code: 0, cloud: 6, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8,
      sunrise: "07:30", sunset: "18:26", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "30-ridge-october-afternoon", loc: "sp", when: "2026-10-10T13:30:00", decor: ["corn-shock", "straw-bale", "pumpkin", "white-pumpkin", "michael-myers", "blood-moon", "scarecrow", "sheet-ghost", "black-cat"], candles: 0,
    note: "Halloween at the barn door: corn shock, bale, pumpkins, the hens working the yard beside it, the black cat on the rail, the scarecrow with its crow and the cheesecloth ghost in the hardwood",
    o: { baseTemp: 55, nowTemp: 57, feels: 57, rh: 60, isDay: 1, code: 1, cloud: 20, nowWind: 7, nowDir: 280, nowGust: 13, nowUv: 3.1, uvMax: 4, windAmp: 6, gustAmp: 10,
      sunrise: "07:25", sunset: "18:55", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "31-ridge-halloween-night", loc: "sp", when: "2026-10-31T20:15:00", decor: ["corn-shock", "straw-bale", "jack-o-lantern", "white-pumpkin", "michael-myers", "trick-or-treater", "bat", "witch", "scarecrow", "sheet-ghost", "black-cat", "eyes"], candles: 2, bats: 4, witch: true,
    note: "Halloween night at the farm: both carved pumpkins lit beside the barn lamps, a trick-or-treater at the door between them, the fox out and the owl up, the cat on the rail with its eyeshine, eyes at the woods' edge, the scarecrow across the pond with its crow gone and the ghost in the hardwood",
    o: { baseTemp: 48, nowTemp: 44, feels: 39, rh: 72, isDay: 0, code: 1, cloud: 15, nowWind: 10, nowDir: 300, nowGust: 18, nowUv: 0, uvMax: 3, windAmp: 7, gustAmp: 12,
      sunrise: "07:47", sunset: "18:27", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "33-ridge-october-night", loc: "sp", when: "2026-10-12T21:00:00", decor: ["corn-shock", "straw-bale", "pumpkin", "white-pumpkin", "michael-myers", "bat", "witch", "scarecrow", "sheet-ghost", "black-cat", "eyes"], candles: 0, bats: 6, witch: true,
    note: "an October night before the carving: the pumpkins are out and dark, and nothing at the door gives off light",
    o: { baseTemp: 52, nowTemp: 49, feels: 47, rh: 70, isDay: 0, code: 1, cloud: 20, nowWind: 6, nowDir: 280, nowGust: 11, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 9,
      sunrise: "07:27", sunset: "18:52", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "34-ridge-halloween-rain-night", loc: "sp", when: "2026-10-29T21:00:00", decor: ["corn-shock", "straw-bale", "jack-o-lantern", "white-pumpkin", "michael-myers", "blood-moon", "scarecrow", "sheet-ghost"], candles: 0,
    note: "rain in the carved week at the farm: nothing lit, and the near rain falls over the door the way it falls over the barn",
    o: { baseTemp: 52, nowTemp: 50, feels: 47, rh: 95, isDay: 0, code: 63, cloud: 96, nowWind: 11, nowDir: 230, nowGust: 20, nowUv: 0, uvMax: 3, windAmp: 8, gustAmp: 14,
      sunrise: "07:45", sunset: "18:30", popCurve: () => 85, dailyPop: (p) => p.fill(85) } },
  { name: "39-ridge-october-moon", loc: "sp", when: "2026-10-24T21:30:00", decor: ["corn-shock", "straw-bale", "jack-o-lantern", "white-pumpkin", "michael-myers", "bat", "witch", "blood-moon", "scarecrow", "sheet-ghost", "black-cat", "eyes"], candles: 2, moon: true, bats: 6, witch: true,
    note: "the same moon over the ridge in the carved week: Halloween's moon clear of the crest, its light on the pond in its own colour, and the witch crossing it",
    o: { baseTemp: 46, nowTemp: 43, feels: 40, rh: 72, isDay: 0, code: 0, cloud: 8, nowWind: 6, nowDir: 300, nowGust: 10, nowUv: 0, uvMax: 3, windAmp: 5, gustAmp: 8,
      sunrise: "07:43", sunset: "18:33", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  // nights where the moon sits where the witch once went wrong: under her band at the farm, so a
  // climb through it started in the barnyard and ran through the owl (and at 900 out of the barn,
  // past the loft); a full moon low in the east on the coast with a westerly; and a moon over the
  // coast's sunrise time that she cannot cross, where she once flew along its rim
  { name: "42-ridge-october-evening-westerly", loc: "sp", when: "2026-10-20T19:30:00", decor: ["corn-shock", "straw-bale", "pumpkin", "white-pumpkin", "michael-myers", "bat", "witch", "blood-moon", "scarecrow", "sheet-ghost", "black-cat", "eyes"], candles: 0, moon: true, bats: 7, witch: true, witchWidths: [900],
    note: "an early October evening at the farm with a westerly, the moon low under her band: she leaves it alone and climbs across open sky, never out of the barnyard",
    o: { baseTemp: 54, nowTemp: 52, feels: 52, rh: 70, isDay: 0, code: 0, cloud: 6, nowWind: 6, nowDir: 250, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8,
      sunrise: "07:38", sunset: "18:40", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "43-ridge-october-moonrise-westerly", loc: "sp", when: "2026-10-22T20:00:00", decor: ["corn-shock", "straw-bale", "pumpkin", "white-pumpkin", "michael-myers", "bat", "witch", "blood-moon", "scarecrow", "sheet-ghost", "black-cat", "eyes"], candles: 0, moon: true, bats: 7, witch: true, witchWidths: [900],
    note: "two nights on, a little later and a wind from due west: the moon still under her band, and nothing in the yard",
    o: { baseTemp: 54, nowTemp: 52, feels: 52, rh: 70, isDay: 0, code: 0, cloud: 6, nowWind: 6, nowDir: 270, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8,
      sunrise: "07:40", sunset: "18:37", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "44-marsh-full-moon-westerly", loc: "mb", when: "2026-10-26T21:30:00", decor: ["ghostface", "jack-o-lantern", "pumpkin", "bat", "witch", "blood-moon", "black-cat", "eyes", "wisps"], candles: 1, moon: true, bats: 7, witch: true,
    note: "Halloween's full moon low in the east with a westerly: under reduced motion she holds still clear of the sunrise time, the disc and the bats",
    o: { baseTemp: 64, nowTemp: 62, feels: 62, rh: 75, isDay: 0, code: 0, cloud: 6, nowWind: 6, nowDir: 250, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8,
      sunrise: "07:27", sunset: "18:23", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "45-marsh-october-moon-by-the-time", loc: "mb", when: "2026-10-20T21:00:00", decor: ["ghostface", "pumpkin", "bat", "witch", "blood-moon", "black-cat", "eyes", "wisps"], candles: 0, moon: true, bats: 7, witch: true,
    note: "the moon at the height of the sunrise time, where no straight line crosses it clear of the time: she leaves it alone, well over it, never on its rim",
    o: { baseTemp: 64, nowTemp: 62, feels: 62, rh: 75, isDay: 0, code: 0, cloud: 6, nowWind: 6, nowDir: 30, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8,
      sunrise: "07:22", sunset: "18:30", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  // Halloween night's trick-or-treater keeps the night itself, from sunset: out in a drizzle (with the
  // candles not lit, because they are not in the wet), in for the night in the rain, and on a cold
  // evening at the coast kept off the dock until dark, because the cormorant has the middle piling
  { name: "46-marsh-halloween-drizzle-night", loc: "mb", when: "2026-10-31T20:40:00", decor: ["ghostface", "jack-o-lantern", "pumpkin", "trick-or-treater", "bat", "witch"], candles: 0, bats: 2, witch: true,
    note: "a drizzly Halloween night on the coast: a drizzle does not keep a kid in, so the trick-or-treater is on the dock, and the candle is not lit in the wet",
    o: { baseTemp: 63, nowTemp: 61, feels: 61, rh: 96, isDay: 0, code: 53, cloud: 94, nowWind: 7, nowDir: 30, nowGust: 12, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8,
      sunrise: "07:32", sunset: "18:18", popCurve: () => 55, dailyPop: (p) => p.fill(55) } },
  { name: "47-ridge-halloween-rain-night", loc: "sp", when: "2026-10-31T20:15:00", decor: ["corn-shock", "straw-bale", "jack-o-lantern", "white-pumpkin", "michael-myers", "scarecrow", "sheet-ghost"], candles: 0,
    note: "rain on Halloween night at the farm: the trick-or-treater stays in, nothing is lit, and the door is left to the pumpkins",
    o: { baseTemp: 48, nowTemp: 45, feels: 40, rh: 96, isDay: 0, code: 63, cloud: 96, nowWind: 10, nowDir: 230, nowGust: 18, nowUv: 0, uvMax: 3, windAmp: 7, gustAmp: 12,
      sunrise: "07:47", sunset: "18:27", popCurve: () => 85, dailyPop: (p) => p.fill(85) } },
  { name: "48-marsh-halloween-cold-dusk", loc: "mb", when: "2026-10-31T18:22:00", decor: ["ghostface", "jack-o-lantern", "pumpkin", "bat"], candles: 1, bats: 2,
    note: "a raw Halloween evening on the coast, just after sunset: the candle is lit, and the cormorant has the middle piling until dark, so the trick-or-treater is not on the dock yet",
    o: { baseTemp: 50, nowTemp: 46, feels: 42, rh: 70, isDay: 0, code: 1, cloud: 12, nowWind: 8, nowDir: 350, nowGust: 13, nowUv: 0, uvMax: 4, windAmp: 6, gustAmp: 10,
      sunrise: "07:32", sunset: "18:18", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  // October dusk at each place, the sun a few degrees under: the bats are coming out, a couple at
  // first and more as it darkens, and the witch is not up yet, because she waits for the dark
  { name: "40-marsh-october-dusk", loc: "mb", when: "2026-10-10T19:02:00", decor: ["ghostface", "pumpkin", "bat", "black-cat"], candles: 0, bats: 7,
    note: "twenty minutes after sunset in October, calm and clear: the first bats out over the marsh, against the last of the light",
    o: { baseTemp: 70, nowTemp: 68, feels: 68, rh: 70, isDay: 0, code: 0, cloud: 8, nowWind: 5, nowDir: 40, nowGust: 9, nowUv: 0, uvMax: 5, windAmp: 4, gustAmp: 7,
      sunrise: "07:13", sunset: "18:44", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "41-ridge-october-dusk", loc: "sp", when: "2026-10-10T19:12:00", decor: ["corn-shock", "straw-bale", "pumpkin", "white-pumpkin", "michael-myers", "bat", "scarecrow", "sheet-ghost", "black-cat"], candles: 0, bats: 7,
    note: "October dusk at the farm: the bats come out over the far ridge, and the vulture has gone to roost",
    o: { baseTemp: 58, nowTemp: 56, feels: 56, rh: 66, isDay: 0, code: 1, cloud: 12, nowWind: 5, nowDir: 280, nowGust: 9, nowUv: 0, uvMax: 4, windAmp: 4, gustAmp: 7,
      sunrise: "07:25", sunset: "18:55", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "32-ridge-november-morning", loc: "sp", when: "2026-11-01T09:30:00", decor: [], candles: 0,
    note: "the morning after: everything Halloween put out has come down",
    o: { baseTemp: 50, nowTemp: 47, feels: 45, rh: 66, isDay: 1, code: 2, cloud: 35, nowWind: 6, nowDir: 250, nowGust: 11, nowUv: 1.8, uvMax: 3, windAmp: 5, gustAmp: 9,
      sunrise: "06:48", sunset: "17:26", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "35-marsh-november-small-hours", loc: "mb", when: "2026-11-01T00:30:00", decor: [], candles: 0,
    note: "half past midnight on November 1 2026, the night the clocks go back: Halloween is over, and the wall clock, which once ran an hour slow here and read October 31, reads November 1",
    o: { baseTemp: 60, nowTemp: 58, feels: 58, rh: 82, isDay: 0, code: 0, cloud: 10, nowWind: 6, nowDir: 20, nowGust: 10, nowUv: 0, uvMax: 4, windAmp: 5, gustAmp: 8,
      sunrise: "06:33", sunset: "17:17", popCurve: () => 5, dailyPop: (p) => p.fill(8) } },
  { name: "23-ridge-night-downpour", loc: "sp", when: "2026-05-12T22:40:00",
    note: "the hardest test of the ridge rain: dark theme, code 82, drops over a black fold",
    o: { baseTemp: 62, nowTemp: 61, feels: 61, rh: 96, isDay: 0, code: 82, cloud: 97, nowWind: 15, nowDir: 210, nowGust: 26, nowUv: 0, uvMax: 5,
      windAmp: 12, gustAmp: 22, sunrise: "06:14", sunset: "20:26",
      popCurve: () => 92, dailyPop: (p) => p.fill(90) } },
];

const cases = ONLY.length ? CASES.filter((c) => ONLY.some((q) => c.name.includes(q))) : CASES;
if (!cases.length) { console.error(`no scene matched ${ONLY.join(" ")}`); process.exit(1); }

mkdirSync(OUT, { recursive: true });
const server = await serve(PORT, FONT_DIR);
if (!FONT_DIR) console.warn("PORCH_FONT_DIR is unset: falling back to whatever Google Fonts returns.\n");

const browser = await chromium.launch(process.env.PORCH_CHROME_PATH
  ? { executablePath: process.env.PORCH_CHROME_PATH }
  : {});
const problems = [];

/** PNG byte streams can differ when Chrome re-encodes identical compositor output. Decode
 * both in the page and count meaningful per-pixel changes instead of comparing containers. */
async function pixelDelta(page, a, b) {
  return page.evaluate(async ([aa, bb]) => {
    const bitmap = async (s) => createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
    const [ia, ib] = await Promise.all([bitmap(aa), bitmap(bb)]);
    const canvas = document.createElement("canvas"); canvas.width = ia.width; canvas.height = ia.height;
    const cx = canvas.getContext("2d", { willReadFrequently: true });
    cx.drawImage(ia, 0, 0); const da = cx.getImageData(0, 0, ia.width, ia.height).data;
    cx.clearRect(0, 0, canvas.width, canvas.height); cx.drawImage(ib, 0, 0);
    const db = cx.getImageData(0, 0, ib.width, ib.height).data;
    let changed = 0, strong = 0, max = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i]-db[i]), Math.abs(da[i+1]-db[i+1]), Math.abs(da[i+2]-db[i+2]), Math.abs(da[i+3]-db[i+3]));
      if (d) changed++; if (d > 3) strong++; if (d > max) max = d;
    }
    return { changed, strong, max, total: da.length / 4 };
  }, [a.toString("base64"), b.toString("base64")]);
}

/** Open a scenario, wait for it to settle, and hand back the page. */
async function open(cs, { width, height = 932, reducedMotion, dpr = 2 }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: dpr,
    timezoneId: "America/New_York", reducedMotion,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) errs.push(`http ${r.status()}: ${r.url()}`); });
  await stage(page, { now: new Date(cs.when), loc: cs.loc, o: cs.o, tidePhase: cs.tidePhase || 0, fontDir: FONT_DIR, port: PORT });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.getElementById("refreshBtn")?.classList.contains("spin")
    && document.getElementById("stamp")?.textContent !== "—", { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(1500);
  // The charts' entrance is a one-shot sweep that waits for the chart to be on screen. It is
  // not idle motion, so settle it before counting animations, timing layout or taking shots.
  await page.evaluate(() => typeof finishReveal === "function" && finishReveal());
  return { ctx, page, errs };
}

/** Walk the animal's own clock, checking the contact and the long quiet rest. A ring
 * on an unrelated loop can look plausible in one screenshot and still describe nothing. */
async function animalContactCheck(page) {
  return page.evaluate(() => {
    const svg = document.getElementById("sceneSvg"), issues = [], checked = [];
    const point = (el, x, y) => new DOMPoint(x, y).matrixTransform(el.getScreenCTM());
    const centre = (el) => point(el, +el.getAttribute("cx"), +el.getAttribute("cy"));
    const opacity = (el) => Number(getComputedStyle(el).opacity);
    const animations = [...svg.querySelectorAll(".raccoon *, .heron *, .crab-run, .crab-run *, .frog *, [data-water-contact]")]
      .flatMap((el) => el.getAnimations()).filter((a, i, all) => all.indexOf(a) === i);
    const saved = animations.map((a) => [a, a.currentTime, a.playState]);
    animations.forEach((a) => a.pause());
    const at = (duration, fraction) => {
      for (const a of animations) {
        const t = a.effect.getTiming();
        if (t.duration === duration) a.currentTime = t.delay + duration * (2 + fraction);
      }
    };
    const clock = (duration, label) => {
      const same = animations.filter((a) => a.effect.getTiming().duration === duration);
      if (!same.length) { issues.push(`${label}: movement clock missing`); return; }
      const delays = same.map((a) => a.effect.getTiming().delay);
      if (Math.max(...delays) - Math.min(...delays) > 101) issues.push(`${label}: joint and water phases disagree`);
    };
    try {
      const raccoon = svg.querySelector('[data-species="raccoon"]');
      if (raccoon) {
        checked.push("raccoon on land");
        const water = svg.querySelector('rect[fill="url(#waterband)"]'), bank = svg.querySelector('[data-prop="raccoon-bank"] path');
        if (!water || !bank) issues.push("raccoon: water boundary or solid bank missing");
        else {
          let wet = 0, unsupported = 0;
          for (let i = 0; i <= 80; i++) {
            at(34000, i / 80);
            if (raccoon.getBoundingClientRect().bottom >= water.getBoundingClientRect().top) wet++;
            // Test within the inked soles, including the reaching paw, against the bank's fill.
            for (const [el, x, y] of [[raccoon, 11.6, 1], [raccoon.querySelector('.raccoon-paw > g'), -6.2, 1]]) {
              const p = point(el, x, y).matrixTransform(bank.getScreenCTM().inverse());
              if (!bank.isPointInFill(p)) unsupported++;
            }
          }
          if (wet) issues.push(`raccoon: feet meet water in ${wet} gesture frames`);
          if (unsupported) issues.push(`raccoon: unsupported feet in ${unsupported} gesture frames`);
        }
        if (svg.querySelector('[data-water-contact="raccoon"]')) issues.push("raccoon: dry-bank animal has a water ring");
      }
      const heron = svg.querySelector('[data-species="great-blue-heron"]');
      if (heron) {
        checked.push("heron footfalls and strike"); clock(150000, "heron");
        const near = svg.querySelector('[data-water-contact="heron-near"]'), far = svg.querySelector('[data-water-contact="heron-far"]'), bill = svg.querySelector('[data-water-contact="heron-bill"]');
        if (!near || !far || !bill) issues.push("heron: a water contact is missing");
        else {
          for (const [ring, joint, x, y, f, label] of [
            [near, '.heron-leg.near .heron-tarsus > g', 2.4, 3, .25, 'near foot'],
            [far, '.heron-leg.far .heron-tarsus > g', 6, 3, .30, 'far foot'],
            [bill, '.heron-scan > g', -27.4, -61.2, .408, 'bill']
          ]) {
            at(150000, f); at(97000, 0);
            const a = point(heron.querySelector(joint), x, y), b = centre(ring);
            if (Math.hypot(a.x-b.x, a.y-b.y) > 2 || opacity(ring) < .15) issues.push(`heron: ${label} misses its live ripple`);
            if (label === 'bill') {
              at(97000, .88); const p = point(heron.querySelector(joint), x, y);
              if (Math.hypot(p.x-b.x, p.y-b.y) > 3) issues.push("heron: head scan moves the bill clear of its splash");
            }
          }
          for (const f of [0, .2, .35, .55, .8]) {
            at(150000, f);
            if ([near, far, bill].some((el) => opacity(el) > .005)) issues.push("heron: water gestures during a rest");
          }
        }
      }
      const crab = svg.querySelector('[data-species="fiddler-crab"]');
      if (crab) {
        checked.push("crab steps and shallows"); clock(58000, "crab");
        const ring = svg.querySelector('[data-water-contact="crab"]'), legs = [...crab.querySelectorAll('.crab-leg')], support = [...crab.querySelectorAll('.crab-support')];
        if (!ring || legs.length !== 4 || support.length !== 4) issues.push("crab: water contact or one of its eight legs missing");
        else {
          for (const f of [.51, .55, .59, .785, .835, .885]) {
            at(58000, f);
            const a = point(crab, 0, 0), b = centre(ring);
            if (Math.hypot(a.x-b.x, a.y-b.y) > .5 || opacity(ring) < .15) issues.push("crab: moving feet miss the water disturbance");
            if (legs.some((el) => Math.abs(new DOMMatrix(getComputedStyle(el).transform).b) < .04)) issues.push("crab: rigid moving leg during a scuttle");
            if (support.some((el) => el.getAnimations().length || getComputedStyle(el).transform !== "none")) issues.push("crab: support legs leave their planted pose");
          }
          for (const f of [0, .25, .54, .70, .95]) {
            at(58000, f);
            if (opacity(ring) > .005 || legs.some((el) => Math.abs(new DOMMatrix(getComputedStyle(el).transform).b) > .001)) issues.push("crab: legs or water keep moving through a rest");
          }
        }
      }
      const frog = svg.querySelector('[data-species="frog"]');
      if (frog) {
        checked.push("frog pond contact"); clock(13000, "frog");
        const ring = svg.querySelector('[data-water-contact="frog"]'), throat = frog.querySelector('.frog-throat');
        if (!ring || !throat) issues.push("frog: throat or pond contact missing");
        else {
          at(13000, 0); const rest = throat.getBoundingClientRect().width;
          if (opacity(ring) > .005) issues.push("frog: pond ring continues through a rest");
          at(13000, .74);
          const a = point(frog, -3, 0), b = centre(ring);
          if (Math.hypot(a.x-b.x, a.y-b.y) > .5 || opacity(ring) < .15 || throat.getBoundingClientRect().width < rest * 1.15)
            issues.push("frog: calling gesture and pond ring disagree");
          at(13000, .96);
          if (opacity(ring) > .005) issues.push("frog: pond ring does not settle");
        }
      }
    } finally {
      for (const [a, time, state] of saved) { a.currentTime = time; if (state === "running") a.play(); }
    }
    return { checked, issues: [...new Set(issues)] };
  });
}
function reportAnimalContacts(cs, width, result) {
  if (result.checked.length) console.log(`    animal contact at ${width}: ${result.checked.join("; ")}${result.issues.length ? "; !! " + result.issues.join("; ") : ""}`);
  for (const issue of result.issues) problems.push(`${cs.name} ${width}: ${issue}`);
}

/** The witch crosses in the first 22% of her cycle and spends the rest off the frame's edge, so her
 * crossing is walked on her own clock: she must come in and go out wholly off the frame, keep her
 * hat inside its top, never touch a grounded animal or a decoration, never pass behind a sunrise or
 * sunset time, and never be hidden by a tree or the treeline for more than a sliver of her (only
 * the frame's own edge may cut her). When her path is routed across the moon (data-across) the
 * disc's centre has to be inside her at the closest step. Her clock (WITCH_RUN) has to agree with
 * the animation on screen, so the first crossing comes 2.4s after the app opens. */
async function walkWitch(page) {
  return page.evaluate(() => {
    const w = document.querySelector('#sceneSvg [data-fly="witch"]');
    if (!w) return null;
    const svg = document.getElementById("sceneSvg"), F = svg.getBoundingClientRect();
    const a = w.getAnimations().find((x) => x.animationName === "witchCross");
    if (!a) return { still: true };
    const D = a.effect.getComputedTiming().duration, dl = a.effect.getTiming().delay;
    const phaseNow = ((a.currentTime - dl) % D + D) % D, run = WITCH_RUN;
    const drift = (((Date.now() - run.t0 - phaseNow) % D) + D) % D;
    const ground = [...svg.querySelectorAll("[data-species],[data-decor]")].filter((el) => !["gull", "hawk", "bat"].includes(el.dataset.species)
      && !el.classList.contains("ff") && !/^(bat|witch|(blood|harvest)-moon)$/.test(el.dataset.decor || ""));
    const mp = w.dataset.across ? w.dataset.across.split(" ").map(Number) : null, M = svg.getScreenCTM();
    const moon = mp ? [M.a * mp[0] + M.e, M.d * mp[1] + M.f] : null;
    // a moon she leaves alone she passes well clear of, never along its rim
    const md = !mp && svg.querySelector("[data-disc]"), disc = md ? (([x, y, r]) => [M.a * x + M.e, M.d * y + M.f, r * M.a])(md.dataset.disc.split(" ").map(Number)) : null;
    let rim = 0;
    const was = a.currentTime; a.pause();
    const labels = [...svg.querySelectorAll("text.suntime")].map((t) => t.getBoundingClientRect());
    const mine = (e) => w.contains(e);
    // weather in front of her is weather, not scenery she went behind
    const weather = (e) => /url\(#(fogveil|mist)\)/.test(e.getAttribute("fill") || "") || !!e.closest(".nearrain,.splash,[class*=rain]");
    let best = null, hits = [], topCut = 0, ends = [], onLabel = 0, hidden = 0;
    for (let i = 0; i <= 80; i++) {
      a.currentTime = D * 5 + D * .22 * i / 80 + dl;
      const b = w.getBoundingClientRect();
      if (i === 0 || i === 80) ends.push(b.right <= F.left + 1 || b.left >= F.right - 1);
      if (b.right > F.left && b.left < F.right && b.top < F.top - 1) topCut++;
      if (labels.some((L) => L.right > b.left && L.left < b.right && L.bottom > b.top && L.top < b.bottom)) onLabel++;
      if (disc && Math.hypot(Math.min(Math.max(disc[0], b.left), b.right) - disc[0], Math.min(Math.max(disc[1], b.top), b.bottom) - disc[1]) < disc[2] + 1) rim++;
      for (const g of ground) {
        const A = g.getBoundingClientRect();
        const ov = Math.max(0, Math.min(A.right, b.right) - Math.max(A.left, b.left)) * Math.max(0, Math.min(A.bottom, b.bottom) - Math.max(A.top, b.top));
        if (ov > 2) hits.push(g.dataset.species || g.dataset.decor);
      }
      // how much of her, inside the frame, something in the scene stands in front of
      if (b.left > F.left + 2 && b.right < F.right - 2) {
        let on = 0, hid = 0;
        for (let u = 0; u < 12; u++) for (let v = 0; v < 6; v++) {
          const x = b.left + (u + .5) / 12 * b.width, y = b.top + (v + .5) / 6 * b.height;
          const stack = document.elementsFromPoint(x, y).filter((e) => svg.contains(e) && e !== svg && !weather(e));
          const k = stack.findIndex(mine);
          if (k < 0) continue;
          on++; if (k > 0) hid++;
        }
        if (on) hidden = Math.max(hidden, hid / on);
      }
      if (moon) {
        const dist = Math.hypot((b.left + b.right) / 2 - moon[0], (b.top + b.bottom) / 2 - moon[1]);
        if (!best || dist < best.dist) best = { dist, inside: moon[0] > b.left && moon[0] < b.right && moon[1] > b.top && moon[1] < b.bottom };
      }
    }
    a.currentTime = was; a.play();
    return { cycle: D / 1000, drift: Math.min(drift, D - drift) / 1000, lead: (run.t0 - run.open) / 1000, ends, topCut, onLabel, rim,
      hidden: Math.round(hidden * 100), hits: [...new Set(hits)], moon: !!moon, best };
  });
}
function reportWitch(cs, width, witch) {
  if (witch.still) return;
  console.log(`    witch at ${width}: a ${witch.cycle.toFixed(1)}s cycle, ${witch.moon ? `across the moon (${witch.best.dist.toFixed(1)}px from its centre)` : "no moon to cross"}`
    + `, at most ${witch.hidden}% of her behind the scenery${witch.hits.length ? "; !! touches " + witch.hits.join(", ") : ""}`);
  const at = `${cs.name} ${width}`;
  if (witch.ends.some((e) => !e)) problems.push(`${at}: the witch starts or ends her crossing inside the frame`);
  if (witch.topCut) problems.push(`${at}: the frame's top cuts the witch at ${witch.topCut} steps of her crossing`);
  if (witch.hits.length) problems.push(`${at}: the witch flies into ${witch.hits.join(", ")}`);
  if (witch.onLabel) problems.push(`${at}: the witch flies behind a sunrise or sunset time at ${witch.onLabel} steps of her crossing`);
  if (witch.rim) problems.push(`${at}: the witch passes along the rim of a moon she does not cross, at ${witch.rim} steps of her crossing`);
  if (witch.hidden > 15) problems.push(`${at}: a tree or the treeline hides ${witch.hidden}% of the witch`);
  if (witch.moon && !(witch.best.inside && witch.best.dist < 8)) problems.push(`${at}: the witch's path misses the moon (${witch.best.dist.toFixed(1)}px)`);
  if (witch.drift > .4 || Math.abs(witch.lead) > .05) problems.push(`${at}: the witch's crossing is off her clock (${witch.drift.toFixed(2)}s), so the first one is not 2.4s after opening`);
}

/** What Halloween has set out, whether it is lit, and whether it is in anyone's way. Decorations are
 * measured by what they paint (the candle's glow is light, not a thing), and nothing grounded may
 * stand in them: they are placed off the dock and the barn for exactly that reason. What Josh asked
 * for more of on October 3 2026 (the black cat, the eyes in the dark, the marsh lights, the
 * scarecrow, the cheesecloth ghost and the trick-or-treater) is walked through its own motion (the
 * tail's flick, the blink, the drift, the swing) and the whole of where it goes has to stay inside
 * the frame, off every animal, and a pixel clear of every other decoration. */
const MORE = /^(black-cat|eyes|wisps|scarecrow|sheet-ghost|trick-or-treater)$/;
async function decorCheck(page) {
  return page.evaluate((MOREs) => {
    const MORE = new RegExp(MOREs), svg = document.getElementById("sceneSvg"), frame = svg.getBoundingClientRect();
    const items = [...svg.querySelectorAll("[data-decor]")], SKY = /^(bat|witch|(blood|harvest)-moon)$/;
    const painted = (el) => el.firstElementChild.getBoundingClientRect();
    // the union of everywhere it goes, its own animations walked over 24 steps and put back
    const reach = (el) => {
      const an = el.getAnimations({ subtree: true }), was = an.map((a) => [a, a.currentTime, a.playState]);
      let u = null;
      const add = (b) => { u = u ? { left: Math.min(u.left, b.left), top: Math.min(u.top, b.top), right: Math.max(u.right, b.right), bottom: Math.max(u.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
      add(painted(el));
      for (let i = 0; i < 24 && an.length; i++) {
        for (const a of an) { a.pause(); a.currentTime = (a.effect.getTiming().delay || 0) + a.effect.getComputedTiming().duration * (i + .5) / 24; }
        add(painted(el));
      }
      for (const [a, t, st] of was) { a.currentTime = t; if (st === "running") a.play(); }
      return u;
    };
    const out = { kinds: [...new Set(items.map((el) => el.dataset.decor))].sort(), candles: svg.querySelectorAll(".candle").length,
      flicker: svg.querySelectorAll(".candle.flicker").length, clipped: [], hits: [] };
    const ground = items.filter((e) => !SKY.test(e.dataset.decor)).map((el) => [el, MORE.test(el.dataset.decor) ? reach(el) : painted(el)]);
    // the bats, the witch and the moon are in the sky and are looked at on their own below
    for (const [el, b] of ground) {
      if (b.left < frame.left - 2 || b.right > frame.right + 2 || b.top < frame.top - 2 || b.bottom > frame.bottom + 2) out.clipped.push(el.dataset.decor);
      for (const a of svg.querySelectorAll("[data-species]")) {
        if (["gull", "hawk"].includes(a.dataset.species) || a.classList.contains("ff")) continue;
        const A = a.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(A.right, b.right) - Math.max(A.left, b.left)) * Math.max(0, Math.min(A.bottom, b.bottom) - Math.max(A.top, b.top));
        if (overlap > 2) out.hits.push(`${el.dataset.decor} overlaps ${a.dataset.species} by ${Math.round(overlap)} px²`);
      }
    }
    // and the new ones stand clear of every other decoration, by a pixel at least
    for (const [el, k] of ground.filter(([e]) => MORE.test(e.dataset.decor)))
      for (const [o, b] of ground) {
        if (o === el) continue;
        if (Math.min(k.right, b.right) - Math.max(k.left, b.left) > -1 && Math.min(k.bottom, b.bottom) - Math.max(k.top, b.top) > -1)
          out.hits.push(`${el.dataset.decor} runs into ${o.dataset.decor}`);
      }
    // the marsh lights hang over the water, so each flame and the light it lays on the water keeps a
    // pixel off the oyster rake through all of its drift. The glow round it is light, not a thing
    const rake = svg.querySelector('[data-prop="rake"]');
    if (rake) {
      const R = rake.getBoundingClientRect();
      for (const w of svg.querySelectorAll(".wisp")) {
        const an = w.getAnimations(), was = an.map((a) => [a, a.currentTime, a.playState]);
        for (let i = 0; i < (an.length ? 24 : 1); i++) {
          for (const a of an) { a.pause(); a.currentTime = (a.effect.getTiming().delay || 0) + a.effect.getComputedTiming().duration * (i + .5) / 24; }
          for (const c of w.children) {
            if (c.tagName === "circle") continue;
            const b = c.getBoundingClientRect();
            if (Math.min(R.right, b.right) - Math.max(R.left, b.left) > -1 && Math.min(R.bottom, b.bottom) - Math.max(R.top, b.top) > -1)
              out.hits.push(`a marsh light ${c.tagName === "ellipse" ? "lays its light on" : "runs into"} the oyster rake`);
          }
        }
        for (const [a, t, st] of was) { a.currentTime = t; if (st === "running") a.play(); }
      }
    }
    out.hits = [...new Set(out.hits)];
    return out;
  }, MORE.source);
}
function reportDecor(cs, width, decor) {
  for (const h of decor.hits) problems.push(`${cs.name} ${width}: ${h}`);
  if (decor.clipped.length) problems.push(`${cs.name}: decorations clipped at ${width}px: ${decor.clipped.join(", ")}`);
}

/** Halloween's cobweb is on the glass, over the header, in the October window only. Every thread is
 * walked along its length and the spider is put at both ends of her swing, hanging and let all the
 * way down, and none of it may come within 3px of a word, a number, a chip, the place switch, the
 * live stamp or the alert strip. It never takes a tap: a point on a thread hands the tap to what is
 * under it, and the place switch and the stamp still answer at their middles. Her animations are put
 * back where they were. */
async function webCheck(page) {
  return page.evaluate(() => {
    const el = document.getElementById("cobweb"), svg = el && !el.hidden ? el.querySelector("svg") : null;
    if (!svg) return { on: false };
    // the screenshots above may have scrolled the header away, and a tap is asked for on screen
    const sy = scrollY; scrollTo({ top: 0, behavior: "instant" });
    const rg = document.createRange(), boxes = [];
    for (const e of document.querySelectorAll(".masthead,.now,#verdict,#chips,#nowcast,#alertStrip")) {
      const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let t; (t = tw.nextNode());) if (t.data.trim()) { rg.selectNodeContents(t); for (const b of rg.getClientRects()) boxes.push([b, `"${t.data.trim().slice(0, 20)}"`]); }
    }
    for (const e of document.querySelectorAll("#chips .chip,#nowcast.on,#alertStrip.on,.masthead svg,.live-dot")) boxes.push([e.getBoundingClientRect(), e.id || "a chip or a mark"]);
    const near = (x, y, pad) => boxes.find(([b]) => b.width && b.height && x > b.left - pad && x < b.right + pad && y > b.top - pad && y < b.bottom + pad);
    const meet = (r, pad) => boxes.find(([b]) => b.width && b.height && r.right > b.left - pad && r.left < b.right + pad && r.bottom > b.top - pad && r.top < b.bottom + pad);
    const hits = new Set(), taps = new Set(), sky = document.getElementById("sky").getBoundingClientRect();
    let pts = 0;
    for (const p of svg.querySelectorAll("path")) {
      if (p.closest(".web-swing")) continue;
      const M = p.getScreenCTM(), L = p.getTotalLength();
      for (let s = 0; s <= L; s += 1.5) {
        const q = p.getPointAtLength(s), x = M.a * q.x + M.c * q.y + M.e, y = M.b * q.x + M.d * q.y + M.f;
        if (y < sky.top || x > sky.right) continue;
        pts++;
        const b = near(x, y, 3); if (b) hits.add(`a thread within 3px of ${b[1]}`);
        if (pts % 7 === 0) { const top = document.elementFromPoint(x, y); if (top && el.contains(top)) taps.add("a thread takes the tap"); }
      }
    }
    for (const id of ["locBtn", "refreshBtn"]) {
      const b = document.getElementById(id).getBoundingClientRect(), top = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
      if (!top || !document.getElementById(id).contains(top)) taps.add(`#${id} no longer answers at its middle`);
    }
    const sp = svg.querySelector(".web-drop");
    let spider = null;
    if (sp) {
      const an = el.getAnimations({ subtree: true }), was = an.map((a) => [a, a.currentTime, a.playState]);
      // each from its own active time: past its wall-clock delay and a few whole cycles on, so f is
      // where in the cycle she is whatever the clock says (an even count keeps the swing's alternate
      // direction, so 0 and 1 are its two ends, and .76 is the bottom of her drop)
      const at = (name, f) => an.filter((a) => a.animationName === name).forEach((a) => { a.pause(); a.currentTime = (a.effect.getTiming().delay || 0) + a.effect.getComputedTiming().duration * (4 + f); });
      const reach = [];
      for (const sw of [0, 1]) for (const dr of [0, .76]) {
        at("webSwing", sw); at("webReel", dr); at("webDrop", dr);
        const r = sp.getBoundingClientRect(), line = svg.querySelector(".web-reel path").getBoundingClientRect();
        reach.push(r);
        const b = meet(r, 2); if (b) hits.add(`the spider within 2px of ${b[1]}${an.length ? ` (swing ${sw}, drop ${dr})` : ""}`);
        if (r.right > sky.right - 1) hits.add("the spider runs off the screen's edge");
        if (Math.abs(line.bottom - r.top) > 2.5) hits.add(`the spider is off the end of her dragline by ${(r.top - line.bottom).toFixed(1)}px`);
      }
      for (const [a, t, st] of was) { a.currentTime = t; if (st === "running") a.play(); }
      spider = { animations: an.map((a) => a.animationName).sort().join(" "), drop: +(Math.max(...reach.map((r) => r.top)) - Math.min(...reach.map((r) => r.top))).toFixed(1) };
      // a walk that never lets her down has not checked the pose that matters most
      if (an.length && spider.drop < 1) hits.add("the spider was never let down");
    }
    const at0 = svg.getBoundingClientRect();
    scrollTo({ top: sy, behavior: "instant" });
    const pe = getComputedStyle(el).pointerEvents;
    if (pe !== "none") taps.add(`the cobweb has pointer-events:${pe}`);
    return { on: true, R: +svg.dataset.web, pts, spider, hits: [...hits], taps: [...taps],
      box: { x: at0.left, y: at0.top, width: at0.width, height: at0.height } };
  });
}
function reportWeb(cs, width, web) {
  const want = cs.when.slice(5, 7) === "10";
  if (web.on !== want) { problems.push(`${cs.name} ${width}: the cobweb is ${web.on ? "up" : "not up"}, expected ${want ? "up" : "not up"}`); return; }
  if (!web.on) return;
  console.log(`    cobweb at ${width}: R ${web.R}px, ${web.pts} points of silk, ${web.spider ? `the spider (${web.spider.animations}, ${web.spider.drop}px of drop)` : "no spider"}`);
  if (!web.spider) problems.push(`${cs.name} ${width}: the cobweb has no spider`);
  for (const h of [...web.hits, ...web.taps]) problems.push(`${cs.name} ${width}: ${h}`);
}

for (const cs of cases) {
  console.log(`\n### ${cs.name}\n    ${cs.note}`);

  // ── the look, at phone width ──────────────────────────────────────────
  {
    const { ctx, page, errs } = await open(cs, { width: PHONE_WIDTH });
    for (const [sel, suffix] of [[".sky", "sky"], [".scene", "scene"], ["#tideSection", "tide"]]) {
      try { await page.locator(sel).screenshot({ path: path.join(OUT, `${cs.name}-${suffix}.png`) }); } catch {}
    }
    const species = await page.locator("#sceneSvg [data-species]").evaluateAll((els) =>
      [...new Set(els.map((el) => el.getAttribute("data-species")))].filter(Boolean));
    console.log(`    wildlife: ${species.join(", ") || "none"}`);
    const stormy = [95, 96, 99].includes(cs.o.code);
    if (!species.length && !stormy) problems.push(`${cs.name}: no wildlife in scene`);
    // The browser here is an Eastern phone, so at an Eastern place it reads its own clock and the
    // shift onto the place's wall clock is exactly zero, the night the clocks go back included.
    if (LOC_TZ[cs.loc] === "America/New_York") {
      const shift = await page.evaluate(() => TZSHIFT);
      if (shift !== 0) problems.push(`${cs.name}: a phone at home should read its own clock, but it is shifted ${shift / 36e5}h`);
    }
    const clipped=await page.evaluate(()=>{
      const frame=document.getElementById("sceneSvg").getBoundingClientRect(),out=[];
      for(const el of document.querySelectorAll("#sceneSvg [data-species]")){
        if(["gull","hawk"].includes(el.dataset.species)||el.classList.contains("ff"))continue;
        const b=el.getBoundingClientRect();
        if(b.left<frame.left-2||b.right>frame.right+2||b.top<frame.top-2||b.bottom>frame.bottom+2)
          out.push(el.dataset.species);
      }
      return out;
    });
    if(clipped.length)problems.push(`${cs.name}: wildlife clipped at ${PHONE_WIDTH}px: ${clipped.join(", ")}`);

    // ── the holiday: what is set out, whether it is lit, and whether it is in anyone's way ──
    // Decorations go up and come down on the calendar, so a scene outside the window must have
    // none. Inside it they are measured by what they paint (the candle's glow is light, not a
    // thing), and nothing grounded may stand in them: they are placed off the dock and the barn
    // for exactly that reason.
    const decor = await decorCheck(page);
    if (decor.kinds.length || cs.decor) {
      console.log(`    decor: ${decor.kinds.join(", ") || "none"}; ${decor.candles} lit${decor.flicker ? `, ${decor.flicker} guttering` : ""}`
        + `${decor.hits.length ? "; !! " + decor.hits.join("; ") : ""}`);
      // the moon is whichever one HALLOWEEN_MOON picks
      const pick = await page.evaluate(() => typeof HALLOWEEN_MOON === "undefined" ? null : HALLOWEEN_MOON);
      const want = (cs.decor || []).map((d) => /-moon$/.test(d) ? (pick ? `${pick}-moon` : null) : d).filter(Boolean).sort();
      if (want.join() !== decor.kinds.join()) problems.push(`${cs.name}: decorations are [${decor.kinds.join(", ")}], expected [${want.join(", ")}]`);
      if ((cs.candles ?? 0) !== decor.candles) problems.push(`${cs.name}: ${decor.candles} candles lit, expected ${cs.candles ?? 0}`);
      reportDecor(cs, PHONE_WIDTH, decor);
    }

    // ── Halloween's cobweb, on the glass over the header, clear of every word ──
    reportWeb(cs, PHONE_WIDTH, await webCheck(page));

    // ── Halloween's bats: out from sunset to dawn in October, kept in by heavy rain and storms ──
    // `bats` is the colony the scene should put up (none outside October, by day or in heavy
    // rain). Each bat is then walked through its whole loop with its wings at every stage of the
    // stroke, and at every step it has to stay inside the frame, off the moon's and the sun's
    // disc, off the times on the arc, clear of every animal and decoration, and in open sky: the
    // topmost thing at its body has to be a bat, never a tree, a fold or the treeline in front of it.
    {
      const bat = await page.evaluate(() => {
        const svg = document.getElementById("sceneSvg"), frame = svg.getBoundingClientRect();
        const colony = svg.querySelector(".bats"), list = [...svg.querySelectorAll(".bat")];
        const out = { colony: colony ? Number(colony.dataset.colony) : 0, placed: list.length, hits: [] };
        if (!list.length) return out;
        const k = frame.width / svg.viewBox.baseVal.width;
        const M = svg.getScreenCTM();
        const discs = [...[...svg.querySelectorAll("[data-disc]")].map((g) => {
          const [x, y, r] = g.dataset.disc.split(" ").map(Number); return [M.a * x + M.e, M.d * y + M.f, r * k];
        }), ...[...svg.querySelectorAll('ellipse[fill="url(#sunglow)"]')].map((c) => {
          const b = c.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, 13 * k];
        })];
        const texts = [...svg.querySelectorAll("text")].map((t) => t.getBoundingClientRect());
        // the witch flies through them on her way across, in front, so she is not in their way
        const others = [...svg.querySelectorAll("[data-species],[data-decor]")].filter((e) => !e.classList.contains("bat") && !/^(bat|witch|(blood|harvest)-moon)$/.test(e.dataset.decor || ""))
          .map((e) => [e.dataset.species || e.dataset.decor, e.getBoundingClientRect()]);
        const anims = list.flatMap((b) => b.getAnimations({ subtree: true }));
        anims.forEach((a) => a.pause());
        const meet = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        list.forEach((b, n) => {
          const fly = b.querySelector(".bat-fly").getAnimations()[0], wings = [...b.querySelectorAll(".bat-wing")].map((w) => w.getAnimations()[0]);
          const D = fly?.effect.getTiming().duration || 1, F = wings[0]?.effect.getTiming().duration || 1, why = new Set();
          for (let i = 0; i < 72; i++) {
            if (fly) fly.currentTime = D * i / 72;
            wings.forEach((w) => { if (w) w.currentTime = F * ((i * 5) % 12) / 12; });
            const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            if (r.left < frame.left - 1 || r.right > frame.right + 1 || r.top < frame.top - 1 || r.bottom > frame.bottom + 1) why.add("leaves the frame");
            for (const [dx, dy, dr] of discs) if (Math.hypot(Math.min(Math.max(dx, r.left), r.right) - dx, Math.min(Math.max(dy, r.top), r.bottom) - dy) < dr) why.add("crosses the moon or the sun");
            for (const t of texts) if (meet(r, t) > 2) why.add("crosses a time on the arc");
            for (const [name, o] of others) if (meet(r, o) > 2) why.add(`meets the ${name}`);
            // fog and mist are weather in front of it, not scenery it went behind
            const top = document.elementsFromPoint(cx, cy).find((e) => svg.contains(e) && e !== svg && !/url\(#(fogveil|mist)\)/.test(e.getAttribute("fill") || ""));
            if (top && !top.closest(".bat")) why.add("goes behind the scenery");
          }
          for (const w of why) out.hits.push(`bat ${n + 1} ${w}`);
        });
        anims.forEach((a) => a.play());
        return out;
      });
      const want = cs.bats ?? 0;
      if (bat.colony || want) {
        console.log(`    bats: ${bat.placed} of a colony of ${bat.colony}${bat.hits.length ? "; !! " + bat.hits.join("; ") : ", all in open sky"}`);
        if (bat.colony !== want) problems.push(`${cs.name}: a colony of ${bat.colony} bats, expected ${want}`);
        if (bat.placed * 2 < bat.colony) problems.push(`${cs.name}: only ${bat.placed} of ${bat.colony} bats found room in the sky`);
        for (const h of bat.hits) problems.push(`${cs.name}: ${h}`);
      }
    }

    // ── the moon: Halloween's in the October window, the ordinary one every other night ──
    // It keeps its place and its phase, so whether it is up is the sky's business, and a scene
    // marked `moon` is one where it has to be.
    const moon = await page.evaluate(() => ({ kind: document.querySelector("#sceneSvg [data-moon]")?.dataset.moon ?? null,
      pick: typeof HALLOWEEN_MOON === "undefined" ? null : HALLOWEEN_MOON }));
    if (moon.kind) {
      const want = cs.when.slice(5, 7) === "10" && moon.pick ? moon.pick : "ordinary";
      console.log(`    moon: ${moon.kind}`);
      if (moon.kind !== want) problems.push(`${cs.name}: the moon is ${moon.kind}, expected ${want}`);
    }
    if (cs.moon && !moon.kind) problems.push(`${cs.name}: the moon should be up`);

    // ── the witch: out on exactly the October nights, across the moon, clear of everything ──
    const witch = await walkWitch(page);
    if (!!witch !== !!cs.witch) problems.push(`${cs.name}: the witch is ${witch ? "out" : "not out"}, expected ${cs.witch ? "out" : "not out"}`);
    if (witch) reportWitch(cs, PHONE_WIDTH, witch);

    // The count that matters for battery is what is still running. One-shot entrances
    // (rise, wipe, grow) finish in under a second but linger in getAnimations() because
    // they use fill:both, so counting them makes an idle page look busy.
    const anim = await page.evaluate(() => {
      const all = document.getAnimations();
      const by = {};
      let running = 0;
      for (const a of all) {
        if (a.playState !== "running") continue;
        running++;
        by[a.animationName || "(web-animation)"] = (by[a.animationName || "(web-animation)"] || 0) + 1;
      }
      return { running, total: all.length, by };
    });
    const top = Object.entries(anim.by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(`    ${anim.running} running of ${anim.total}  ${top}`);
    if (anim.running > 120) problems.push(`${cs.name}: ${anim.running} animations still running`);

    // ── Ghostface keeps his eyes through the oak's sway ─────────────────
    // He stands still and the oak sways about a pixel either way over him, so at the far ends of
    // the sway a limb crosses the edge of an eye. Each eye is sampled on its own fill at both ends
    // of the sway, in this scene's wind and again at the oak's full throw in a gale (1.4°), and the
    // scene fails if the oak hides 40% of either. The oak is put back running as it was.
    if (cs.decor?.includes("ghostface")) {
      const gf = await page.evaluate(() => {
        const g = document.querySelector('#sceneSvg [data-decor="ghostface"]');
        const oak = [...document.querySelectorAll('#sceneSvg g[style*="swayTree"]')].find((n) => n.querySelector(".moss"));
        const a = oak?.getAnimations().find((x) => x.animationName === "swayTree");
        if (!g || !a) return null;
        g.scrollIntoView({ block: "center" });
        const feats = [...g.querySelectorAll("path")].slice(-3).sort((p, q) => p.getBoundingClientRect().top - q.getBoundingClientRect().top).slice(0, 2)
          .sort((p, q) => p.getBoundingClientRect().left - q.getBoundingClientRect().left);
        const hidden = (p) => {
          const b = p.getBoundingClientRect(), pt = p.ownerSVGElement.createSVGPoint(), m = p.getScreenCTM().inverse();
          let tot = 0, hid = 0;
          for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
            pt.x = b.left + (i + .5) / 24 * b.width; pt.y = b.top + (j + .5) / 24 * b.height;
            if (!p.isPointInFill(pt.matrixTransform(m))) continue;
            // only the oak counts as covering him: rain, fog and the sky's own layers are weather
            const top = document.elementsFromPoint(pt.x, pt.y).find((el) => g.contains(el) || oak.contains(el));
            if (!top) continue;
            tot++; if (oak.contains(top)) hid++;
          }
          return tot ? Math.round(hid / tot * 100) : 100;
        };
        const was = a.currentTime, { duration: D, delay: dl = 0 } = a.effect.getTiming();
        const ends = () => [2 * D + dl, D + dl - 1].map((t) => { a.currentTime = t; return feats.map(hidden); });
        a.pause();
        const wind = ends();
        const tw = [oak.style.getPropertyValue("--tsway"), oak.style.getPropertyValue("--tsway-neg")];
        oak.style.setProperty("--tsway", "1.4deg"); oak.style.setProperty("--tsway-neg", "-1.4deg");
        const gale = ends();
        oak.style.setProperty("--tsway", tw[0]); oak.style.setProperty("--tsway-neg", tw[1]);
        a.currentTime = was; a.play();
        return { tsway: tw[0], wind, gale };
      });
      if (!gf) problems.push(`${cs.name}: no swaying oak or no Ghostface to measure`);
      else {
        const say = (r) => r.map(([l, rr]) => `${l}%/${rr}%`).join(" ");
        console.log(`    ghostface eyes hidden (left/right, each end of the sway): ${say(gf.wind)} at ${gf.tsway}, ${say(gf.gale)} at 1.4deg`);
        for (const [label, r] of [["this wind", gf.wind], ["a gale", gf.gale]])
          if (r.flat().some((v) => v >= 40)) problems.push(`${cs.name}: the oak hides 40% or more of a Ghostface eye in ${label} (${say(r)})`);
      }
    }

    // ── nothing may be standing in the pond ────────────────────────────
    // Residents are positioned as fractions of the frame width, and the ridge pond
    // spans .13W to .73W, so an eyeballed fraction puts a rabbit in the water. The
    // marsh is exempt: its water band covers the whole lower frame and the heron is
    // supposed to be ankle deep in it.
    if (cs.loc === "sp") {
      const swimming = await page.evaluate(() => {
        const svg = document.getElementById("sceneSvg");
        const water = svg.querySelector('path[fill="url(#waterband)"]');
        if (!water) return [];
        const w = water.getBoundingClientRect(), out = [];
        for (const el of svg.querySelectorAll(".wildlife")) {
          if (el.dataset.species === "frog") continue; // a pond frog belongs at the waterline
          const b = el.getBoundingClientRect();
          const cx = b.left + b.width / 2, feet = b.bottom;
          if (cx > w.left && cx < w.right && feet > w.top + 1 && feet < w.bottom)
            out.push(`${el.getAttribute("class")} at x=${Math.round(cx - w.left)} into the pond`);
        }
        return out;
      });
      for (const s of swimming) problems.push(`${cs.name}: ${s}`);
      console.log(`    pond: ${swimming.length ? "!! " + swimming.join("; ") : "nothing standing in it"}`);

      // Grounded silhouettes need open landscape around them. In particular, the barn is
      // dark enough to turn a detailed deer or hen back into one large blob on a phone.
      const barnSmudges = await page.evaluate(() => {
        const barn = document.querySelector("#sceneSvg .barn");
        if (!barn) return [];
        const a = barn.getBoundingClientRect(), out = [];
        for (const el of document.querySelectorAll("#sceneSvg [data-species]")) {
          const species = el.getAttribute("data-species");
          if (!["deer", "fox", "owl", "hens"].includes(species)) continue;
          const b = el.getBoundingClientRect();
          const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if (overlap > 2) out.push(`${species} overlaps barn by ${Math.round(overlap)} px²`);
        }
        return out;
      });
      for (const s of barnSmudges) problems.push(`${cs.name}: ${s}`);
      console.log(`    backdrop: ${barnSmudges.length ? "!! " + barnSmudges.join("; ") : "grounded wildlife clear of barn"}`);

      // The forecast reports where the wind comes from. Read the fully rendered vane,
      // including its tiny gust quiver, and keep the arrowhead on that source bearing.
      const vane = await page.evaluate(() => {
        const el = document.querySelector("[data-vane-bearing]");
        if (!el) return null;
        const m = el.getCTM(), dx = -3.5 * m.c, dy = -3.5 * m.d;
        return { source: Number(el.dataset.vaneBearing), visual: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360 };
      });
      const vaneError = vane ? Math.abs(((vane.visual - cs.o.nowDir + 540) % 360) - 180) : 999;
      console.log(`    vane: ${vane?.source ?? "missing"}° source, ${vane ? vane.visual.toFixed(1) : "missing"}° rendered axis`);
      if (vaneError > 1.5) problems.push(`${cs.name}: vane is ${vaneError.toFixed(1)}° off the ${cs.o.nowDir}° wind source`);
    }

    // ── and nothing four-footed may float on the marsh ────────────────
    // The pond check above exempts the marsh because its water band covers the whole
    // lower frame and a heron is supposed to be ankle deep in it. That exemption is
    // what let the raccoon sit sixteen units out in the channel with its belly on the
    // water. Waders and the crab work the flat; the separate whole-cycle check below
    // requires the raccoon to stay fully on its solid bank, including its reaching paw.
    if (cs.loc === "mb") {
      const WADERS = ["great-blue-heron", "oystercatcher", "cormorant", "fiddler-crab"];
      const floating = await page.evaluate((waders) => {
        const svg = document.getElementById("sceneSvg");
        const water = svg.querySelector('rect[fill="url(#waterband)"]');
        if (!water) return [];
        const w = water.getBoundingClientRect(), out = [];
        for (const el of svg.querySelectorAll("[data-species]")) {
          const species = el.dataset.species;
          if (waders.includes(species)) continue;
          const b = el.getBoundingClientRect();
          if (b.bottom < w.top) continue;                 // entirely on the bank
          const under = (b.bottom - w.top) / b.height;
          if (under > 0.45) out.push(`${species} is ${Math.round(under * 100)}% below the waterline`);
        }
        return out;
      }, WADERS);
      for (const f of floating) problems.push(`${cs.name}: ${f}`);
      console.log(`    waterline: ${floating.length ? "!! " + floating.join("; ") : "nothing four-footed is floating"}`);
    }

    reportAnimalContacts(cs, PHONE_WIDTH, await animalContactCheck(page));

    // ── a bolt and the sky wash are one event ─────────────────────────
    // They used to be two: the wash cycled every 7s and the bolt every 37s, so the sky lit
    // with nothing under it and the bolt struck into a sky that stayed dark, for as long as
    // nobody sat and watched a storm scene. Walk the storm cycle on one clock and check that
    // no two bolts fire together and that no bolt fires into an unlit sky.
    if (await page.locator(".bolt").count()) {
      const sync = await page.evaluate(() => {
        const bolts = [...document.querySelectorAll(".bolt")].map((e) => e.getAnimations()[0]).filter(Boolean);
        const flashEl = document.getElementById("flash");
        const flash = flashEl.getAnimations()[0];
        if (!bolts.length || !flash) return null;
        const all = [...bolts, flash];
        all.forEach((a) => a.pause());
        // One shared clock. Each effect's own delay is what spreads the beats apart, so
        // setting a common iteration progress would cancel exactly what is under test.
        const P = flash.effect.getTiming().duration, N = 1200;
        let overlaps = 0, dark = 0, lit = 0;
        for (let i = 0; i < N; i++) {
          all.forEach((a) => { a.currentTime = P * 5 + P * (i / N); });
          const on = bolts.filter((b) => Number(getComputedStyle(b.effect.target).opacity) > 0.1).length;
          const wash = Number(getComputedStyle(flashEl).opacity);
          if (on > 1) overlaps++;
          if (on >= 1) { lit++; if (wash < 0.05) dark++; }
        }
        all.forEach((a) => a.play());
        return { bolts: bolts.length, period: P / 1000, overlaps, dark, litPct: +(lit / N * 100).toFixed(1) };
      });
      if (!sync) problems.push(`${cs.name}: bolts drawn with no storm clock behind them`);
      else {
        if (sync.overlaps) problems.push(`${cs.name}: ${sync.overlaps} samples with two bolts at once`);
        // a few samples land in the dip between return strokes, when the sky dims too
        if (sync.dark > sync.litPct * 6) problems.push(`${cs.name}: bolts strike into an unlit sky`);
        console.log(`    lightning: ${sync.bolts} bolts on a ${sync.period}s clock, lit ${sync.litPct}% of it, `
          + `${sync.overlaps ? "!! " + sync.overlaps + " overlapping" : "never two at once"}, `
          + `${sync.dark > sync.litPct * 6 ? "!! striking into a dark sky" : "always with the wash"}`);
      }
    }

    // ── what the motion costs: layout must stay flat while things move ──
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Performance.enable");
    const read = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const a = await read();
    await page.waitForTimeout(6000);
    const b = await read();
    const layouts = b.LayoutCount - a.LayoutCount, styles = b.RecalcStyleCount - a.RecalcStyleCount;
    console.log(`    over 6s: ${layouts} layouts, ${styles} style recalcs, ${((b.LayoutDuration - a.LayoutDuration) * 1000).toFixed(1)}ms in layout`);
    if (layouts > 12) problems.push(`${cs.name}: ${layouts} layouts in 6s of idle motion (layout thrash)`);

    if (WILDLIFE_FRAMES) {
      const subject=cs.name.includes("deer")?"deer":cs.name.includes("night-rain")?"fiddler-crab":
        cs.name.includes("cold-night")?"owl":cs.name.includes("warm-clear-night")?"raccoon":
        cs.name.includes("fog-morning")?"great-blue-heron":"";
      if(subject){
        await page.evaluate(()=>document.getAnimations().forEach(a=>a.pause()));
        for(const [label,fraction] of [["rest",0],["first",.4],["gesture",.8],["return",.9]]){
          await page.evaluate(({subject,fraction})=>{
            const animal=document.querySelector(`#sceneSvg [data-species="${subject}"]`);
            const root=animal?.closest(".crab-run")||animal;
            for(const a of root?.getAnimations({subtree:true})||[]){
              const duration=a.effect?.getComputedTiming().duration;
              if(Number.isFinite(duration))a.currentTime=a.effect.getTiming().delay+(2+fraction)*duration;
            }
          },{subject,fraction});
          await page.locator(".scene").screenshot({path:path.join(OUT,`${cs.name}-${subject}-${label}.png`)});
        }
      }
    }

    if (errs.length) problems.push(`${cs.name} ${PHONE_WIDTH}: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // ── the look at the widest the app ever gets ──────────────────────────
  {
    const { ctx, page, errs } = await open(cs, { width: 760, height: 1200 });
    try { await page.locator(".sky").screenshot({ path: path.join(OUT, `${cs.name}-sky-760.png`) }); } catch {}
    reportWeb(cs, 760, await webCheck(page));
    reportAnimalContacts(cs, 760, await animalContactCheck(page));
    if (cs.decor?.length) reportDecor(cs, 760, await decorCheck(page));
    if (errs.length) problems.push(`${cs.name} 760: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // ── the decorations close up, and at the narrowest phone ─────────────────
  if (cs.decor?.length) {
    for (const width of [320, 390, PHONE_WIDTH].filter((w, i, a) => a.indexOf(w) === i)) {
      const { ctx, page, errs } = await open(cs, { width, dpr: width === 390 ? 2 : 5 });
      const box = await page.evaluate(() => {
        const bs = [...document.querySelectorAll("#sceneSvg [data-decor]")].filter((el) => !/^(bat|witch|(blood|harvest)-moon)$/.test(el.dataset.decor))
          .map((el) => el.getBoundingClientRect());
        if (!bs.length) return null;
        const x0 = Math.min(...bs.map((b) => b.left)), y0 = Math.min(...bs.map((b) => b.top));
        const x1 = Math.max(...bs.map((b) => b.right)), y1 = Math.max(...bs.map((b) => b.bottom));
        return { x: x0 - 26, y: y0 - 18, width: x1 - x0 + 52, height: y1 - y0 + 30 };
      });
      if (box && width !== 390) await page.screenshot({ path: path.join(OUT, `${cs.name}-decor-${width}.png`), clip: box });
      const web = await webCheck(page);
      reportAnimalContacts(cs, width, await animalContactCheck(page));
      if (width !== PHONE_WIDTH) { reportWeb(cs, width, web); reportDecor(cs, width, await decorCheck(page)); }
      if (web.on) await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      if (web.on && width !== 390) await page.screenshot({ path: path.join(OUT, `${cs.name}-web-${width}.png`), clip: { x: Math.max(0, web.box.x - 12), y: 0, width: Math.min(width, web.box.width + 12), height: web.box.height + 4 } });
      if (width === 320) try { await page.locator(".scene").screenshot({ path: path.join(OUT, `${cs.name}-scene-320.png`) }); } catch {}
      if (errs.length) problems.push(`${cs.name} decor ${width}: ${errs.join(" | ")}`);
      await ctx.close();
    }
  }

  // ── the witch's crossing at the phone widths the main run does not look at ──
  if (cs.witch) for (const width of [320, 390, ...(cs.witchWidths || [])].filter((w) => w !== PHONE_WIDTH)) {
    const { ctx, page, errs } = await open(cs, { width });
    const witch = await walkWitch(page);
    if (!witch) problems.push(`${cs.name} ${width}: the witch is not out`);
    else reportWitch(cs, width, witch);
    if (errs.length) problems.push(`${cs.name} witch ${width}: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // ── reduced motion: nothing may move, at all ──────────────────────────
  {
    const { ctx, page, errs } = await open(cs, { width: PHONE_WIDTH, reducedMotion: "reduce" });
    // SVG turbulence and blur filters are intentionally nondeterministic in system Chrome.
    // They are static texture/softness, not scene motion, so omit them from a byte-for-byte
    // stillness check; all transforms and opacity remain under test.
    await page.evaluate(() => {
      document.querySelector(".grain")?.remove();
      document.querySelectorAll("svg [filter]").forEach((el) => el.removeAttribute("filter"));
    });
    const running = await page.evaluate(() => document.getAnimations().length);
    // she holds still beside the moon, never over it, so its real phase still shows
    const rest = await page.evaluate(() => {
      const svg = document.getElementById("sceneSvg"), w = svg.querySelector('[data-fly="witch"]'), m = svg.querySelector("[data-disc]");
      if (!w || !m) return null;
      const [x, y, r] = m.dataset.disc.split(" ").map(Number), M = svg.getScreenCTM(), cx = M.a * x + M.e, cy = M.d * y + M.f, b = w.getBoundingClientRect();
      return { gap: Math.hypot(Math.min(Math.max(cx, b.left), b.right) - cx, Math.min(Math.max(cy, b.top), b.bottom) - cy), r: r * M.a };
    });
    if (rest) console.log(`    reduced motion: the witch holds still ${rest.gap.toFixed(1)}px off the moon's ${rest.r.toFixed(1)}px disc`);
    if (rest && rest.gap < rest.r) problems.push(`${cs.name}: under reduced motion the witch holds still over the moon's disc and hides its phase`);
    // and wherever she holds, she is not on a sunrise or sunset time, a bat, an animal, a decoration
    // or behind the scenery
    const held = await page.evaluate(() => {
      const svg = document.getElementById("sceneSvg"), w = svg.querySelector('[data-fly="witch"]');
      if (!w) return null;
      const b = w.getBoundingClientRect(), on = [];
      const meet = (A) => Math.max(0, Math.min(A.right, b.right) - Math.max(A.left, b.left)) * Math.max(0, Math.min(A.bottom, b.bottom) - Math.max(A.top, b.top));
      for (const t of svg.querySelectorAll("text.suntime")) if (meet(t.getBoundingClientRect()) > 0) on.push(`the time ${t.textContent}`);
      for (const e of svg.querySelectorAll(".bat")) if (meet(e.getBoundingClientRect()) > 0) on.push("a bat");
      for (const e of svg.querySelectorAll("[data-species],[data-decor]")) {
        if (e.classList.contains("bat") || ["gull", "hawk"].includes(e.dataset.species) || e.classList.contains("ff") || /^(bat|witch|(blood|harvest)-moon)$/.test(e.dataset.decor || "")) continue;
        if (meet(e.getBoundingClientRect()) > 2) on.push(e.dataset.species || e.dataset.decor);
      }
      const weather = (e) => /url\(#(fogveil|mist)\)/.test(e.getAttribute("fill") || "") || !!e.closest(".nearrain,.splash,[class*=rain]");
      let n = 0, hid = 0;
      for (let u = 0; u < 12; u++) for (let v = 0; v < 6; v++) {
        const st = document.elementsFromPoint(b.left + (u + .5) / 12 * b.width, b.top + (v + .5) / 6 * b.height).filter((e) => svg.contains(e) && e !== svg && !weather(e));
        const k = st.findIndex((e) => w.contains(e));
        if (k < 0) continue; n++; if (k > 0) hid++;
      }
      return { on: [...new Set(on)], hidden: n ? Math.round(100 * hid / n) : 0 };
    });
    if (held) console.log(`    reduced motion: the witch holds still ${held.on.length ? "on " + held.on.join(", ") : "clear of the times, the bats and the scenery"}, ${held.hidden}% of her behind it`);
    if (held?.on.length) problems.push(`${cs.name}: under reduced motion the witch holds still on ${held.on.join(", ")}`);
    if (held && held.hidden > 15) problems.push(`${cs.name}: under reduced motion the scenery hides ${held.hidden}% of the still witch`);
    const one = await page.locator(".sky").screenshot({ path: path.join(OUT, `${cs.name}-prm.png`) });
    await page.waitForTimeout(1400);
    const two = await page.locator(".sky").screenshot();
    const delta = await pixelDelta(page, one, two), still = delta.strong === 0;
    console.log(`    reduced motion: ${running} animations, ${still ? "held still" : "STILL MOVING"}${delta.changed ? ` (${delta.changed} noisy px, ${delta.strong} meaningful, max Δ${delta.max})` : ""}`);
    if (running) problems.push(`${cs.name}: ${running} animations survive prefers-reduced-motion`);
    if (!still) problems.push(`${cs.name}: sky is not static under prefers-reduced-motion`);
    if (errs.length) problems.push(`${cs.name} prm: ${errs.join(" | ")}`);
    await ctx.close();
  }
}

await browser.close();
server.close();
console.log(`\nwrote scene shots to ${OUT}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error("  ! " + p);
  process.exit(1);
}
console.log("no problems found");

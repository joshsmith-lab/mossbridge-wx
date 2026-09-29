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
const ONLY = process.argv.slice(2);

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
      dailyPop: (p) => { p[0] = 85; p[1] = 65; p[2] = 45; } },
    // thunder reported now is thunder in the now pill
    expect: { xp: { hourly: /^now 81° feels 88° thunder \d+%/ } } },
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
  // a fine farm afternoon: nothing to plan around, so the card is the bite line and nothing else
  { name: "07-fine-afternoon-shady-spring", loc: "sp", when: "2026-08-02T15:10:00",
    o: { baseTemp: 72, nowTemp: 78, feels: 78, rh: 52, isDay: 1, code: 1, cloud: 12, nowWind: 6, nowDir: 280, nowGust: 11, nowUv: 6.2, uvMax: 8, windAmp: 6, gustAmp: 10,
      popCurve: () => 5, dailyPop: (p) => p.fill(10) } },
  // a washout at the coast: the headline carries it, and the water section says only the water
  { name: "08-washout-porters-neck", loc: "mb", when: "2026-08-02T13:40:00",
    o: { baseTemp: 84, nowTemp: 88, feels: 97, rh: 80, isDay: 1, code: 3, cloud: 85, nowWind: 14, nowDir: 210, nowGust: 26, nowUv: 3.1, uvMax: 8, windAmp: 12, gustAmp: 22,
      popCurve: (i, hr) => (hr >= 13 && hr <= 20 ? 80 : 15),
      dailyPop: (p) => { p[0] = 85; p[1] = 20; } } },
  // after midnight, "Tonight" means the hours still left before this morning's sunrise
  { name: "09-after-midnight-porters-neck", loc: "mb", when: "2026-08-02T01:15:00",
    o: { baseTemp: 80, nowTemp: 76, feels: 79, rh: 88, isDay: 0, code: 1, cloud: 20, nowWind: 4, nowDir: 35, nowGust: 7, nowUv: 0, uvMax: 9, windAmp: 5, gustAmp: 8,
      popCurve: () => 3, dailyPop: (p) => p.fill(10) } },
  // and the water two feet over the tide table, the way it ran on September 27 2026
  { name: "13-shoulder-season-porters-neck", loc: "mb", when: "2026-09-28T14:40:00",
    note: "UV peaks at 4: the mild sentence, no schedule — a moderate day must not read like July",
    o: { baseTemp: 72, nowTemp: 76, feels: 78, rh: 60, isDay: 1, code: 1, cloud: 24, nowWind: 8, nowDir: 40, nowGust: 13, nowUv: 3.8, uvMax: 4.2,
      windAmp: 7, gustAmp: 11, sunrise: "07:04", sunset: "18:59", surge: 1.9,
      popCurve: () => 8, dailyPop: (p) => p.fill(12) },
    expect: { say: null, tide: /^77° · seas ~2 ft$/, level: "Running 2 ft above the tide table.", marine: 1,
      xp: { tide: /^now ~\d+\.\d ft$/, tideHour: / by the table$/ } } },
  // the week as lines: a late-September swing from a cool snap to a warm run
  { name: "14-week-porters-neck", loc: "mb", when: "2026-09-24T17:10:00",
    o: { baseTemp: 66, nowTemp: 68, feels: 68, rh: 70, isDay: 1, code: 3, cloud: 70, nowWind: 15, nowDir: 5, nowGust: 30, nowUv: .6, uvMax: 6,
      windAmp: 8, gustAmp: 14, sunrise: "07:02", sunset: "19:06",
      popCurve: () => 4, dailyPop: (p) => p.splice(0, 8, 20, 4, 1, 0, 1, 6, 5, 10),
      dailyTemps: (hi, lo, c) => { hi.splice(0, 8, 70, 67, 80, 82, 82, 84, 85, 83); lo.splice(0, 8, 63, 57, 53, 59, 61, 68, 72, 70); c.splice(0, 8, 61, 3, 2, 1, 2, 3, 3, 2); } },
    // with the boat season switched on: gusting 30 at five is the evening you are in, never tomorrow's
    boat: true, expect: { sayTitle: "The boat", say: "Too windy for the boat.", sayCls: "no", tide: /^77° · seas ~2 ft$/ } },
  // a wet, stormy week: three-digit heat, 100% odds, a storm and a washout next to dry days.
  // A Sunday, so it is also the eight-column week: next Saturday and Sunday are days 7 and 8
  { name: "15-wet-week-shady-spring", loc: "sp", when: "2026-08-02T12:20:00",
    o: { baseTemp: 84, nowTemp: 90, feels: 97, rh: 70, isDay: 1, code: 2, cloud: 40, nowWind: 6, nowDir: 250, nowGust: 12, nowUv: 8, uvMax: 9,
      windAmp: 6, gustAmp: 10, popCurve: () => 10, dailyPop: (p) => p.splice(0, 8, 35, 85, 100, 45, 10, 0, 65, 20),
      dailyTemps: (hi, lo, c) => { hi.splice(0, 8, 96, 101, 88, 84, 83, 86, 90, 87); lo.splice(0, 8, 74, 76, 71, 66, 64, 66, 70, 68); c.splice(0, 8, 2, 95, 63, 80, 1, 0, 81, 2); } },
    expect: { cols: 8, weekend: ["Sat", "Sun"], moon: true, say: null, fish: true, xp: { week: /^Mon 8\/3 101° \/ 76° thunder 85%$/ } } },
  // a Saturday with the boat season switched on: the weekend is today and tomorrow, so the note
  // names only Sunday, and the water is an easy day in words
  { name: "16-saturday-porters-neck", loc: "mb", when: "2026-09-26T10:30:00",
    o: { baseTemp: 74, nowTemp: 75, feels: 75, rh: 58, isDay: 1, code: 1, cloud: 18, nowWind: 7, nowDir: 60, nowGust: 12, nowUv: 4.6, uvMax: 5.8,
      windAmp: 7, gustAmp: 10, sunrise: "07:03", sunset: "19:02", popCurve: () => 6, dailyPop: (p) => p.splice(0, 7, 8, 45, 20, 10, 5, 10, 15),
      dailyTemps: (hi, lo, c) => { hi.splice(0, 7, 79, 81, 77, 75, 78, 80, 82); lo.splice(0, 7, 64, 67, 62, 58, 60, 63, 65); c.splice(0, 7, 1, 80, 3, 2, 1, 2, 2); } },
    boat: true, expect: { cols: 7, weekend: ["Today", "Sun"], note: /^Sun \d+° 45% rain$/, sayTitle: "The boat", say: "Easy out there.", sayCls: "go",
      tide: /^77° · seas ~2 ft$/ } },
  // a Saturday in mid-November: no boat sentence, and the seas and the water are read all the same
  { name: "17-off-season-saturday-porters-neck", loc: "mb", when: "2026-11-14T11:15:00",
    o: { baseTemp: 58, nowTemp: 61, feels: 61, rh: 55, isDay: 1, code: 2, cloud: 35, nowWind: 9, nowDir: 330, nowGust: 15, nowUv: 2.9, uvMax: 3.2,
      windAmp: 7, gustAmp: 10, sunrise: "06:48", sunset: "17:09", waterTemp: 63.1, popCurve: () => 5, dailyPop: (p) => p.fill(10),
      dailyTemps: (hi, lo, c) => { hi.splice(0, 7, 62, 60, 58, 62, 65, 61, 57); lo.splice(0, 7, 46, 43, 40, 44, 49, 45, 39); } },
    // and the card says "Sunscreen if you're out a while." at 2.9: the 3.1 still to come crosses into
    // moderate, so its ring stays, or the only UV on the page read LOW under a sunscreen sentence
    expect: { cols: 7, weekend: ["Today", "Sun"], say: null, tide: /^63° · seas ~2 ft$/, level: null, marine: 1,
      sun: "Sunscreen if you're out a while.", uvBar: /^UV 2\.9 now, low, peaking at 3\.1 around noon\.$/ } },
  // a cold, clear January morning on the coast: the headline owns the cold, the water section says
  // only the water, and the sun card steps aside. The station's thermometer is down: no water at all
  { name: "18-january-porters-neck", loc: "mb", when: "2027-01-14T08:40:00",
    o: { baseTemp: 32, nowTemp: 28, feels: 20, rh: 58, isDay: 1, code: 0, cloud: 4, nowWind: 11, nowDir: 340, nowGust: 19, nowUv: 0.6, uvMax: 2.4,
      windAmp: 7, gustAmp: 10, sunrise: "07:22", sunset: "17:25", waterTemp: null, popCurve: () => 3, dailyPop: (p) => p.fill(5),
      dailyTemps: (hi, lo, c) => { hi.splice(1, 6, 44, 51, 55, 47, 40, 36); lo.splice(1, 6, 26, 33, 39, 31, 25, 21); c.splice(1, 6, 1, 2, 3, 3, 1, 0); } },
    expect: { say: null, tide: /^seas ~2 ft$/, sun: "(steps aside)", marine: 1, xp: { year: /^Jan 57° \/ 36° rain 3\.8 in$/ } } },
  // the boat season on, with the marine run answering but carrying no seas: never green, and said once
  { name: "19-no-seas-porters-neck", loc: "mb", when: "2026-09-15T10:10:00",
    o: { baseTemp: 76, nowTemp: 77, feels: 78, rh: 62, isDay: 1, code: 1, cloud: 20, nowWind: 6, nowDir: 190, nowGust: 10, nowUv: 5.2, uvMax: 6.4,
      windAmp: 6, gustAmp: 8, sunrise: "06:56", sunset: "19:21", wave: null, popCurve: () => 6, dailyPop: (p) => p.fill(10),
      dailyTemps: (hi, lo, c) => { hi.splice(1, 6, 83, 84, 81, 79, 82, 84); lo.splice(1, 6, 68, 70, 67, 64, 66, 69); c.splice(1, 6, 1, 2, 2, 1, 1, 2); } },
    boat: true, expect: { sayTitle: "The boat", say: "Seas unavailable.", sayCls: "caution", tide: /^77°$/ } },
  // the gauge two feet over the table half an hour before the 1:36p high: the skiff rides the curve
  // with "+2 ft" beside it, and the high's time steps over both
  { name: "21-surge-at-high-porters-neck", loc: "mb", when: "2026-09-27T13:05:00",
    o: { baseTemp: 74, nowTemp: 78, feels: 78, rh: 70, isDay: 1, code: 3, cloud: 70, nowWind: 14, nowDir: 45, nowGust: 22, nowUv: 3, uvMax: 5,
      windAmp: 9, gustAmp: 13, sunrise: "07:04", sunset: "18:59", surge: 2.1, popCurve: () => 10, dailyPop: (p) => p.fill(15) },
    expect: { level: "Running 2 ft above the tide table.", tide: /^77° · seas ~2 ft$/, xp: { tide: /^now ~\d+\.\d ft$/, tideHour: / by the table$/ } } },
  // a winter northwester blowing the water out a foot and a half under the table at the 7:24a low:
  // the skiff stays on the curve at the low and "−1.5 ft" keeps off the bed and the line
  { name: "22-blown-out-low-porters-neck", loc: "mb", when: "2027-01-14T07:10:00",
    o: { baseTemp: 36, nowTemp: 33, feels: 24, rh: 55, isDay: 1, code: 0, cloud: 5, nowWind: 16, nowDir: 320, nowGust: 28, nowUv: 0.2, uvMax: 2.4,
      windAmp: 8, gustAmp: 12, sunrise: "07:22", sunset: "17:25", surge: -1.6, waterTemp: 48, popCurve: () => 3, dailyPop: (p) => p.fill(5) },
    expect: { level: "Running 1.5 ft below the tide table.", tide: /^48° · seas ~2 ft$/, xp: { tide: /^now ~−?\d+\.\d ft$/, tideHour: / by the table$/ } } },
  // the water two feet over the table at the 7:24a low, the September 27 case the level exists for:
  // stamped beside the bow the tag sat on the rising flank, so it is placed where the line is not
  { name: "23-surge-at-low-porters-neck", loc: "mb", when: "2027-01-14T07:24:00",
    o: { baseTemp: 44, nowTemp: 46, feels: 41, rh: 80, isDay: 1, code: 3, cloud: 80, nowWind: 18, nowDir: 60, nowGust: 26, nowUv: 0.2, uvMax: 2.4,
      windAmp: 8, gustAmp: 12, sunrise: "07:22", sunset: "17:25", surge: 2.1, waterTemp: 50, popCurve: () => 12, dailyPop: (p) => p.fill(15) },
    expect: { level: "Running 2 ft above the tide table." } },
  // a northeaster blowing the water out a foot under the table at the 1:36p high, where the tag sat
  // on the falling flank
  { name: "25-blown-out-high-porters-neck", loc: "mb", when: "2026-09-27T13:36:00",
    o: { baseTemp: 70, nowTemp: 72, feels: 72, rh: 60, isDay: 1, code: 2, cloud: 40, nowWind: 16, nowDir: 330, nowGust: 26, nowUv: 3.5, uvMax: 5,
      windAmp: 9, gustAmp: 13, sunrise: "07:04", sunset: "18:59", surge: -1, popCurve: () => 4, dailyPop: (p) => p.fill(5) },
    expect: { level: "Running 1 ft below the tide table." } },
  // the water half a foot under the table an hour before the 7:48p low: the boat sits close to the
  // bed, and the tag goes beside it, never on it or on the line
  { name: "27-under-the-table-near-low-porters-neck", loc: "mb", when: "2026-09-27T18:46:00",
    o: { baseTemp: 76, nowTemp: 74, feels: 74, rh: 70, isDay: 1, code: 2, cloud: 35, nowWind: 12, nowDir: 330, nowGust: 20, nowUv: 0.3, uvMax: 6,
      windAmp: 6, gustAmp: 9, sunrise: "07:03", sunset: "19:07", surge: -0.5, waterTemp: 76, popCurve: () => 5, dailyPop: (p) => p.fill(10) } },
  // a wet weekend of one kind, 40% and 100%: the noun is said once, so at 320 the note stays on the
  // title's line
  { name: "26-wet-weekend-porters-neck", loc: "mb", when: "2026-08-06T14:20:00",
    o: { baseTemp: 84, nowTemp: 88, feels: 95, rh: 70, isDay: 1, code: 2, cloud: 40, nowWind: 9, nowDir: 200, nowGust: 16, nowUv: 7, uvMax: 9,
      windAmp: 6, gustAmp: 9, sunrise: "06:25", sunset: "20:08", popCurve: () => 10,
      dailyPop: (p, c) => { p.fill(10); p[2] = 40; p[3] = 100; c[2] = 80; c[3] = 63; },
      dailyTemps: (hi) => { hi.splice(2, 2, 100, 101); } },
    expect: { note: /^Sat 100° 40% · Sun 101° 100% rain$/ } },
  // a wet weekend of two kinds at the farm, rain then snow: both nouns are said, and at 320 the
  // note still stays on the title's line
  { name: "28-rain-then-snow-weekend-shady-spring", loc: "sp", when: "2027-01-15T12:20:00",
    o: { baseTemp: 38, nowTemp: 41, feels: 36, rh: 70, isDay: 1, code: 3, cloud: 80, nowWind: 8, nowDir: 250, nowGust: 14, nowUv: 1.5, uvMax: 2,
      windAmp: 5, gustAmp: 8, sunrise: "07:30", sunset: "17:25", popCurve: () => 10,
      dailyPop: (p, c) => { p.fill(10); p[1] = 60; p[2] = 100; c[1] = 63; c[2] = 73; },
      dailyTemps: (hi, lo) => { hi.splice(1, 2, 44, 34); lo.splice(1, 2, 33, 24); } },
    expect: { note: /^Sat 44° 60% rain · Sun 34° 100% snow$/ } },
  // a cold October morning at the farm: the card speaks for the morning rounds, in amber, over the bite times
  { name: "20-cold-morning-shady-spring", loc: "sp", when: "2026-10-22T07:40:00",
    o: { baseTemp: 44, nowTemp: 31, feels: 27, rh: 80, isDay: 1, code: 0, cloud: 5, nowWind: 4, nowDir: 320, nowGust: 8, nowUv: 0.2, uvMax: 3.5,
      windAmp: 5, gustAmp: 8, sunrise: "07:32", sunset: "18:40", popCurve: () => 3, dailyPop: (p) => p.fill(5),
      dailyTemps: (hi, lo, c) => { hi.splice(0, 8, 53, 58, 61, 57, 55, 60, 63, 59); lo.splice(0, 8, 29, 33, 38, 41, 35, 34, 39, 42); c.splice(0, 8, 0, 1, 2, 3, 3, 2, 1, 2); } },
    expect: { moon: true, sayTitle: "Piddling", say: "Cold one. Bundle up for the morning rounds.", sayCls: "caution", fish: true, year: /^The year · Shady Spring \/ \d+° cooler this week$/,
      xp: { year: /^Oct 64° \/ 44° rain 2\.7 in snow 1 in$/ } } },
];

/* labels are placed, not stamped: on the tide, the moon and the year every word sits inside its
   chart and clear of every other word, whatever the water or the moon is doing, and the skiff's
   level tag rides on the water, never on the bed under it (seaY is H-34). Run at every width,
   because an hour or a tide is a few pixels narrower at 320 and that is where they meet. */
async function crowded(page) {
  const out = await page.evaluate(() => ["tideSvg", "moonSvg", "yearSvg"].flatMap((id) => {
    const svg = document.getElementById(id); if (!svg || !svg.getBoundingClientRect().height) return [];
    const vb = svg.viewBox.baseVal, boxes = [...svg.querySelectorAll("text")].map((e) => ({ t: e.textContent, b: e.getBBox() })).filter((x) => x.t.trim());
    const out = boxes.filter(({ b }) => b.x < -1 || b.y < -1 || b.x + b.width > vb.width + 1 || b.y + b.height > vb.height + 1).map((x) => `${id} "${x.t}" off the chart`);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].b, c = boxes[j].b, w = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x), h = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y);
      if (w > 1 && h > 1) out.push(`${id} "${boxes[i].t}" runs into "${boxes[j].t}"`);
    }
    if (id === "tideSvg") {
      const tag = boxes.find((x) => /^[+−][\d.]+ ft$/.test(x.t)), sea = vb.height - 34;
      if (tag && tag.b.y + tag.b.height > sea + .5) out.push(`tideSvg "${tag.t}" sits on the bed (${(tag.b.y + tag.b.height).toFixed(1)} under ${sea})`);
      /* and never on the tide line: its paper halo cut the water at now. The tag's ink runs from its
         baseline up its cap height (no descenders), and the line's own edge is 1.2 off its path */
      const el = [...svg.querySelectorAll("text")].find((e) => /^[+−][\d.]+ ft$/.test(e.textContent)), line = svg.querySelector(".wline");
      if (el && line) {
        const fs = parseFloat(el.getAttribute("font-size")), base = +el.getAttribute("y"), b = el.getBBox(), top = base - .72 * fs, pad = 2 + 1.2;
        const L = line.getTotalLength();
        for (let d = 0; d <= L; d += 1) { const q = line.getPointAtLength(d);
          if (q.x > b.x - pad && q.x < b.x + b.width + pad && q.y > top - pad && q.y < base + pad) { out.push(`tideSvg "${el.textContent}" sits on the tide line at ${q.x.toFixed(0)},${q.y.toFixed(0)}`); break; } }
        /* and never on the boat it is about: the skiff rides the curve and the tag rides beside it
           (Josh's pick, September 28 2026), so the two are measured on the screen, where the boat's
           scale and roll are already applied */
        const boat = [...svg.querySelectorAll("g[transform]")].find((g) => /scale\(1\.15\)/.test(g.getAttribute("transform")));
        if (boat) { const tb = el.getBoundingClientRect(), bb = boat.getBoundingClientRect();
          if (tb.left < bb.right && tb.right > bb.left && tb.top < bb.bottom && tb.bottom > bb.top) out.push(`tideSvg "${el.textContent}" sits on the boat`); }
      }
    }
    return out;
  }));
  /* the hourly axis is words in a row too: the hour beside NOW gives way to it */
  const hr = await page.evaluate(() => { const b = [...document.querySelectorAll("#hrLabels span")].filter((e) => e.textContent).map((e) => ({ t: e.textContent, r: e.getBoundingClientRect() }));
    return b.slice(1).flatMap((x, i) => x.r.left < b[i].r.right - .5 ? [`hourly axis "${b[i].t}" runs into "${x.t}"`] : []); });
  return [...out, ...hr];
}

/* a reading never covers what it reads: at every stop of every chart the pill stays clear of the
   stop's rings (it rises over the top of a chart, the week's warmest day, July on the coast, a hot
   hour under a two-line pill) and clear of the section's title above it */
async function pillClear(page) {
  return page.evaluate(() => Object.values(XP).filter((X) => X.D).flatMap((X) => {
    const out = [], eb = X.box.closest("section,.week").querySelector(".eyebrow").getBoundingClientRect();
    for (let i = 0; i < X.D.x.length; i++) {
      xpShow(X, i); const p = X.peek.getBoundingClientRect();
      for (const c of X.D.svg.querySelectorAll(".xp-cursor circle")) {
        const b = c.getBoundingClientRect(), w = Math.min(b.right, p.right) - Math.max(b.left, p.left), h = Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top);
        if (w > 1 && h > 1) { out.push(`${X.k} pill "${X.peek.textContent}" covers its ring`); break; }
      }
      if (p.top < eb.bottom - 1) out.push(`${X.k} pill "${X.peek.textContent}" runs into the title`);
      /* at the water's now the skiff is the mark, and it has no ring: the pill clears its box */
      const skiff = X.k === "tide" && i === X.D.start && X.D.svg.querySelector(".boat-flag")?.closest('g[transform*="scale(1.15)"]');
      if (skiff) { const b = skiff.getBoundingClientRect(), w = Math.min(b.right, p.right) - Math.max(b.left, p.left), h = Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top);
        if (w > 1 && h > 1) out.push(`tide pill "${X.peek.textContent}" covers the skiff by ${h.toFixed(1)}px`); }
    }
    xpHide(X); return out.slice(0, 3);
  }));
}

const cases = ONLY.length ? CASES.filter((c) => ONLY.some((q) => c.name.includes(q))) : CASES;
if (!cases.length) { console.error(`no screenshot matched ${ONLY.join(" ")}`); process.exit(1); }

mkdirSync(OUT, { recursive: true });
const server = await serve(PORT, FONT_DIR);
if (!FONT_DIR) console.warn("PORCH_FONT_DIR is unset: falling back to whatever Google Fonts returns. Type metrics may be wrong.\n");

const browser = await chromium.launch(process.env.PORCH_CHROME_PATH
  ? { executablePath: process.env.PORCH_CHROME_PATH }
  : {});
let failures = 0;
for (const cs of cases) {
  for (const vp of [{ w: 390, h: 1500, tag: "phone" }, { w: 900, h: 1500, tag: "wide" }, { w: 320, h: 1500, tag: "narrow" }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, timezoneId: "America/New_York" });
    const page = await ctx.newPage();
    const now = new Date(cs.when);
    await stage(page, { now, loc: cs.loc, o: cs.o, fontDir: FONT_DIR, port: PORT });

    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
    // the seas are asked for every day of the year, so count the asks rather than the answers
    let marineAsks = 0;
    page.on("request", (r) => { if (r.url().includes("marine-api.open-meteo.com")) marineAsks++; });

    // the boat season is off until Josh says, so a scenario that shows the boat's sentence serves
    // the page with the season switched back on, and fails if there was nothing to switch
    if (cs.boat) await page.route("**/index.html", async (r) => {
      const res = await r.fetch(), src = await res.text(), on = src.replace("boatSeason:null", 'boatSeason:["03-15","10-31"]');
      if (on === src) errs.push("no boatSeason:null to switch on");
      await r.fulfill({ response: res, body: on });
    });
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(1400);
    // settle the charts' entrance (a one-shot sweep that waits to be on screen) before looking
    await page.evaluate(() => typeof finishReveal === "function" && finishReveal());
    for (const m of [...await crowded(page), ...await pillClear(page)]) { failures++; console.log(`!! ${cs.name} at ${vp.w}: ${m}`); }
    /* the narrowest phone is only measured: its words are the ones that crowd, and every title keeps
       its note on its own line */
    if (vp.tag === "narrow") {
      const wrapped = await page.evaluate(() => [...document.querySelectorAll(".eyebrow")].filter((e) => e.offsetParent && !e.closest("[hidden]")).flatMap((e) => {
        const b = e.querySelector("b"), sp = e.querySelector("span"); if (!b || !sp || !sp.textContent.trim()) return [];
        return Math.abs(sp.getBoundingClientRect().top - b.getBoundingClientRect().top) > 4 ? [`"${b.textContent}" note "${sp.textContent}" drops under its title`] : [];
      }));
      for (const m of wrapped) { failures++; console.log(`!! ${cs.name} at 320: ${m}`); }
      if (errs.length) { failures++; console.log(`!! ${cs.name} ${vp.tag}: ${errs.join(" | ")}`); }
      await ctx.close(); continue;
    }
    await page.screenshot({ path: path.join(OUT, `${cs.name}-${vp.tag}.png`), fullPage: vp.tag === "wide" });

    if (vp.tag === "phone") {
      for (const [sel, suffix] of [[".sky", "hero"], ["#tideSection", "tide"]]) {
        if (await page.locator(sel).isVisible())
          await page.locator(sel).screenshot({ path: path.join(OUT, `${cs.name}-${suffix}.png`) });
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
        /* what is on screen: the compass point and the bite windows' framing are spoken only */
        const seen = (el) => { if (!el) return null; const k = el.cloneNode(true); k.querySelectorAll(".sr-only").forEach((x) => x.remove()); return k.textContent.replace(/\s+/g, " ").trim(); };
        const shown = (id) => { const e = document.getElementById(id); return !e || e.hidden ? null : seen(e); };
        const sunOff = document.getElementById("sunCard")?.hidden;
        return {
          verdict: T("verdict"), condition: T("condLabel"), stamp: T("stamp"),
          feels: document.getElementById("feelsRow")?.hidden ? null : T("feels"),
          chips: [...document.querySelectorAll(".chip")].map(seen),
          nowcast: document.getElementById("nowcast")?.classList.contains("on") ? T("ncText") : null,
          // the water: the note beside its title, and the gauge against the table, said with the chart
          // and marked by the skiff
          water: getComputedStyle(document.getElementById("tideSection")).display === "none" ? null : { note: T("tideNote"),
            level: (document.getElementById("tideSvg").getAttribute("aria-label").match(/Running .+? the tide table\./) || [null])[0],
            tag: [...document.querySelectorAll("#tideSvg text")].map((x) => x.textContent).find((s) => /^[+−]\d/.test(s)) || null },
          // the farm's moon: its phase and the almanac's fishing times it speaks
          moon: document.getElementById("moonSection").hidden ? null : { note: T("moonNote"), said: document.getElementById("moonSvg").getAttribute("aria-label") },
          // the sentence card, when there is something to say: its title, its sentence and colour
          card: document.getElementById("sayCard").hidden ? null : { title: T("sayTitle"), say: T("saySay"),
            cls: document.getElementById("saySay").className.replace("lead", "").trim() || null },
          // the year at the foot
          year: document.getElementById("yearSection").hidden ? null : T("yearTitle") + " / " + T("yearNote"),
          // the sun card steps aside when nothing is left today; the bar speaks its reading
          sun: sunOff ? "(steps aside)" : T("uvLead"),
          uvBar: sunOff || document.getElementById("uvDetails")?.style.display === "none"
            ? null : document.getElementById("uvSvg")?.getAttribute("aria-label"),
          tonight: T("eveLead"),
          tideNote: getComputedStyle(document.getElementById("tideSection")).display === "none" ? null : T("tideNote"),
          hourlyNote: T("hourlyNote"), weekNote: T("weekNote"),
          // the week's days, with the weekend's banded columns in brackets
          week: [...document.querySelectorAll("#weekRows .wk-day")].map((d) => { const n = d.querySelector(".wk-name").textContent; return d.classList.contains("we") ? `[${n}]` : n; }).join(" "),
          /* each chart's pill where it starts (the hours and the water and the moon at now, the week
             tomorrow, the year this month), and the water an hour on, as the finger would read them */
          xp: Object.fromEntries(Object.entries(XP).filter(([, X]) => X.D).flatMap(([k, X]) => {
            const say = (i) => X.D.read(i).parts.map((q) => q[0]).join(" "), out = [[k, say(k === "week" ? 1 : X.D.start)]];
            if (k === "tide") { const t = X.D.t[X.D.start] + 36e5, i = X.D.t.findIndex((v) => v >= t); if (i >= 0) out.push(["tideHour", say(i)]); }
            return out;
          })),
        };
      });
      console.log(`\n### ${cs.name}`);
      console.log(JSON.stringify(copy, null, 1));

      if (cs.name === "01-day-porters-neck") {
        const box = await page.locator("#hourlySvg").boundingBox();
        if (!box) { failures++; console.log("!! hourly explorer: chart has no box"); }
        else {
          const target = await page.evaluate(() => {
            const { D } = XP.hourly, h = LAST.d.hourly;
            const i = h.temp.findIndex((t, i) => i > 0 && Math.abs(Math.round(h.feels?.[i]) - Math.round(t)) >= 3);
            return { i, share: i < 0 ? 0 : D.x[i] / D.W };
          });
          if (target.i < 0) { failures++; console.log("!! hourly explorer: fixture has no meaningful feels-like difference"); }
          await page.mouse.move(box.x + target.share * box.width, box.y + box.height / 2);
          const peek = page.locator("#hourlyExplore .xp-peek:not([hidden])");
          const peekText = await peek.count() ? await peek.innerText() : "";
          if (!/feels \d+°/.test(peekText)) { failures++; console.log(`!! hourly explorer: missing meaningful feels-like readout (${peekText || "hidden"})`); }
          await page.locator("#hourlyExplore").screenshot({ path: path.join(OUT, `${cs.name}-peek.png`) });
          await page.mouse.move(5, 5);
          await page.locator("#hourlyExplore .xp-key").focus();
          await page.evaluate(() => { XP.hourly.D.read = ((read, h) => (i) => { h.pop[1] = 3; return read(i); })(XP.hourly.D.read, LAST.d.hourly); });
          await page.keyboard.press("ArrowRight");
          const spoken = await page.locator("#hourlyExplore .xp-key").getAttribute("aria-valuetext");
          if (!/degrees/.test(spoken || "")) { failures++; console.log("!! hourly explorer: arrow key did not speak an hour"); }
          const visibleRain = await page.locator("#hourlyExplore .xp-peek span:last-child").textContent();
          if (visibleRain !== "dry" || !/dry$/.test(spoken || "")) {
            failures++; console.log(`!! hourly explorer: 3% mismatch (${visibleRain} / ${spoken})`);
          }
        }
        await page.locator("#tideExplore .xp-key").blur();
        const tideBox = await page.locator("#tideSvg").boundingBox();
        await page.mouse.move(tideBox.x + tideBox.width * .58, tideBox.y + tideBox.height / 2);
        const tidePeek = page.locator("#tideExplore .xp-peek:not([hidden])");
        if (!await tidePeek.count() || !/ft/.test(await tidePeek.innerText())) {
          failures++; console.log("!! tide explorer: missing depth readout");
        }
        await page.locator("#tideExplore").screenshot({ path: path.join(OUT, `${cs.name}-tide-peek.png`) });
      }
      if (cs.name === "09-after-midnight-porters-neck" && !/before morning/.test(copy.tonight || "")) {
        failures++; console.log(`!! after-midnight Tonight card describes the wrong night (${copy.tonight})`);
      }
      /* what a scenario is there to show: the week's columns and its banded days, the water's
         sentence, readings and level line, the farm's card, and whether the seas were asked for */
      const ex = cs.expect || {}, days = copy.week.split(" "), fail = (m) => { failures++; console.log(`!! ${cs.name}: ${m}`); };
      if (ex.cols && days.length !== ex.cols) fail(`${days.length} week columns, expected ${ex.cols}`);
      if (ex.weekend) { const we = days.filter((d) => d.startsWith("[")).map((d) => d.slice(1, -1));
        if (we.join() !== ex.weekend.join()) fail(`weekend banded ${we.join(" ") || "nowhere"}, expected ${ex.weekend.join(" ")}`); }
      if (ex.note && !ex.note.test(copy.weekNote || "")) fail(`week note "${copy.weekNote}"`);
      const card = copy.card || {};
      if ("say" in ex && (card.say ?? null) !== ex.say) fail(`sentence "${card.say}", expected "${ex.say}"`);
      if (ex.sayCls && card.cls !== ex.sayCls) fail(`sentence coloured ${card.cls}, expected ${ex.sayCls}`);
      if (ex.sayTitle && card.title !== ex.sayTitle.toUpperCase() && card.title !== ex.sayTitle) fail(`sentence card titled "${card.title}", expected "${ex.sayTitle}"`);
      if (ex.tide && !ex.tide.test(copy.water?.note || "")) fail(`water note "${copy.water?.note}"`);
      if ("level" in ex && (copy.water?.level ?? null) !== ex.level) fail(`level "${copy.water?.level}", expected "${ex.level}"`);
      if (ex.level && !copy.water?.tag) fail("the skiff carries no level tag");
      if (ex.moon && !copy.moon) fail("no moon at the farm");
      if ("fish" in ex && /none clear/.test(copy.moon?.said || "none clear") === ex.fish) fail(`fishing times "${copy.moon?.said}"`);
      if (ex.year && !ex.year.test(copy.year || "")) fail(`year "${copy.year}"`);
      if (ex.sun && copy.sun !== ex.sun) fail(`sun card "${copy.sun}", expected "${ex.sun}"`);
      if (ex.uvBar && !ex.uvBar.test(copy.uvBar || "")) fail(`sun bar "${copy.uvBar}"`);
      if ("marine" in ex && marineAsks !== ex.marine) fail(`${marineAsks} marine requests, expected ${ex.marine}`);
      for (const [k, re] of Object.entries(ex.xp || {})) if (!re.test(copy.xp[k] || "")) fail(`${k} pill "${copy.xp[k]}"`);
    }
    if (errs.length) { failures++; console.log(`!! ${cs.name} ${vp.tag}: ${errs.join(" | ")}`); }
    await ctx.close();
  }
}

// A fresh farm load must identify itself before any forecast request comes back. This catches
// the old flash of Wrightsville Beach tides and a marsh description under Shady Spring.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "America/New_York" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.addInitScript(() => localStorage.setItem("mbwx-loc", "sp"));
  await page.route("**api.open-meteo.com**", (r) => r.abort());
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  const shell = await page.evaluate(() => ({
    // no reading, no slider: every chart's is off and out of the Tab order
    keys: [...document.querySelectorAll(".xp-key")].every((k) => k.disabled),
    tide: getComputedStyle(document.getElementById("tideSection")).display,
    scene: document.getElementById("sceneSvg").getAttribute("aria-label"),
    moon: !document.getElementById("moonSection").hidden,
    year: document.getElementById("yearTitle").textContent,
    // and its hover text names the farm's airport, never the last place's
    yearSrc: document.getElementById("yearTitle").title,
    // the sun bar is drawn only from a reading, so its scale words go with it
    uvScale: getComputedStyle(document.getElementById("uvDetails")).display,
  }));
  if (!shell.keys || shell.tide !== "none" || !shell.scene.includes("Appalachian") || !shell.moon || shell.year !== "The year · Shady Spring" || !/Beckley airport/.test(shell.yearSrc) || shell.uvScale !== "none") {
    failures++; console.log(`!! location-correct loading shell: ${JSON.stringify(shell)}`);
  }
  if (errs.length) { failures++; console.log(`!! loading hourly explorer: ${errs.join(" | ")}`); }
  await ctx.close();
}
await browser.close();
server.close();
console.log(`\nwrote screenshots to ${OUT}`);
if (failures) { console.error(`${failures} problem(s): page errors or a scenario that did not show what it is there for`); process.exit(1); }

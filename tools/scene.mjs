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
import { serve, stage } from "./fixtures.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots", "scene");
const FONT_DIR = process.env.PORCH_FONT_DIR || "";
const PORT = Number(process.env.PORCH_PORT || 8801);
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
    note: "sun between +6 and -4: the gold arc segment should be lit and breathing",
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
async function open(cs, { width, height = 932, reducedMotion }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2,
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
  return { ctx, page, errs };
}

for (const cs of cases) {
  console.log(`\n### ${cs.name}\n    ${cs.note}`);

  // ── the look, at phone width ──────────────────────────────────────────
  {
    const { ctx, page, errs } = await open(cs, { width: 430 });
    for (const [sel, suffix] of [[".sky", "sky"], [".scene", "scene"], ["#tideSection", "tide"]]) {
      try { await page.locator(sel).screenshot({ path: path.join(OUT, `${cs.name}-${suffix}.png`) }); } catch {}
    }

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
          const b = el.getBoundingClientRect();
          const cx = b.left + b.width / 2, feet = b.bottom;
          if (cx > w.left && cx < w.right && feet > w.top + 1 && feet < w.bottom)
            out.push(`${el.getAttribute("class")} at x=${Math.round(cx - w.left)} into the pond`);
        }
        return out;
      });
      for (const s of swimming) problems.push(`${cs.name}: ${s}`);
      console.log(`    pond: ${swimming.length ? "!! " + swimming.join("; ") : "nothing standing in it"}`);

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

    if (errs.length) problems.push(`${cs.name} 430: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // ── the look at the widest the app ever gets ──────────────────────────
  {
    const { ctx, page, errs } = await open(cs, { width: 760, height: 1200 });
    try { await page.locator(".sky").screenshot({ path: path.join(OUT, `${cs.name}-sky-760.png`) }); } catch {}
    if (errs.length) problems.push(`${cs.name} 760: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // ── reduced motion: nothing may move, at all ──────────────────────────
  {
    const { ctx, page, errs } = await open(cs, { width: 430, reducedMotion: "reduce" });
    // SVG turbulence and blur filters are intentionally nondeterministic in system Chrome.
    // They are static texture/softness, not scene motion, so omit them from a byte-for-byte
    // stillness check; all transforms and opacity remain under test.
    await page.evaluate(() => {
      document.querySelector(".grain")?.remove();
      document.querySelectorAll("svg [filter]").forEach((el) => el.removeAttribute("filter"));
    });
    const running = await page.evaluate(() => document.getAnimations().length);
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

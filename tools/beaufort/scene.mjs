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
 * Writes tools/shots/beaufort/scene-<case>-<width>.png (the sky block, type and all) and
 * scene-<case>-<width>-scene.png (the picture alone), prints any page errors, and fails an animal overlap,
 * more than 120 animations or a tuft of grass with nothing under its foot (grassCheck).
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
    { baseTemp: 74, nowTemp: 75, feels: 75, rh: 45, isDay: 1, code: 1, cloud: 20, nowWind: 22, nowDir: 250, nowGust: 34, nowUv: 7, uvMax: 8, windAmp: 12, gustAmp: 18, popCurve: () => 5, dailyPop: (p) => p.fill(8), sunrise: "06:48", sunset: "19:52" }),
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
    /* the sun behind the oak, and behind the palmettos, only where the case says */
    const lit = await page.evaluate(() => ({ oak: document.querySelector('.scene [data-prop="sun-behind-oak"]')?.dataset.backlight || null,
      palms: [...document.querySelectorAll('.scene [data-prop="palmetto"][data-backlight]')].map((n) => n.dataset.backlight) }));
    if (cs.glow != null && !!lit.oak !== cs.glow) errs.push(`the oak is ${lit.oak ? "lit from behind (" + lit.oak + ")" : "not lit from behind"}, and should ${cs.glow ? "" : "not "}be`);
    if (cs.palms != null && !!lit.palms.length !== cs.palms) errs.push(`the palmettos are ${lit.palms.length ? "lit from behind (" + lit.palms.join(" ") + ")" : "not lit from behind"}, and should ${cs.palms ? "" : "not "}be`);
    if (lit.oak || lit.palms.length) info.backlight = `oak [${lit.oak || "-"}] palms [${lit.palms.join(" ") || "-"}]`;
    const tag = `${cs.name}-${width}`;
    await page.locator(".sky").screenshot({ path: path.join(OUT, `scene-${tag}.png`) }).catch((e) => errs.push("sky shot: " + e.message));
    await page.locator("#sceneSvg").screenshot({ path: path.join(OUT, `scene-${tag}-scene.png`) }).catch((e) => errs.push("scene shot: " + e.message));
    console.log(`${tag}: loc ${info.loc}, tide ${info.tide == null ? "—" : info.tide.toFixed(2)}, props [${[...new Set(info.props)].join(" ")}], animals [${info.species.join(" ")}], ${info.running} animations${info.backlight ? ", backlight " + info.backlight : ""}`);
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
    if (errs.length) { failed = true; console.log("  " + errs.join("\n  ")); }
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(`wrote ${OUT}`);
process.exit(failed ? 1 : 0);

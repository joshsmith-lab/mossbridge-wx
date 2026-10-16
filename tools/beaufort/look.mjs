/**
 * Look at one of the Beaufort scene's drawings, close up and at phone size. The drawing kit (part,
 * pBlob, pTaper, scallop, curlT, inkUnit, inkRig, inkAt, joint) and the whole Storybook cast, Beaufort's
 * drawings among it (each registered in BFT), come straight out of index.html. A new drawing can be made
 * in a file of its own in tools/beaufort/parts/, which is loaded over the cast in the same scope, so it
 * can use anything the kit or the cast defines (rigEgret, rigHeron, propOak, INK.heron ...).
 *
 *   node tools/beaufort/look.mjs palmetto                      # every state, close up and at phone size
 *   node tools/beaufort/look.mjs palmetto --state windy        # one state
 *   node tools/beaufort/look.mjs gator ".gator-jaw=rotate(-8deg)"   # a pose, the way tools/rig.mjs takes them
 *   node tools/beaufort/look.mjs palmetto --scale 4            # the close-up's scale (default: fits ~620px)
 *   node tools/beaufort/look.mjs palmetto --state calm --plate # also write the close-up alone, for a review page
 *
 * A drawing registers what it draws in BFT (a part file in LOOK, the same object):
 *
 *   LOOK.palmetto = {
 *     pal: INK.palmetto,                // the day palette: role -> colour, plus ink, shade, lit
 *     box: [-24, -78, 48, 82],          // x, y, w, h in the drawing's own units, enclosing every state
 *     s: 1,                             // the scale the scene draws it at (default 1)
 *     dist: .1,                         // how far off it stands, 0 near to 1 at the horizon (default .1)
 *     o: { line: 1.05, heavy: .55 },    // inkUnit options the scene will use (optional)
 *     states: { calm: { wind: 0 }, gale: { wind: 30 } },   // optional, default one state
 *     draw: (st) => layersOrParts,      // a rig (layers) or a plain list of parts
 *     extra: (st, k) => "<svg markup>", // optional: markup drawn under the ink in the drawing's units
 *     css: "@keyframes ...",            // optional CSS
 *   };
 *
 * Writes tools/shots/beaufort/look-<name>.png (and .html). Panels: the close-up on paper; then at
 * phone size (one scene unit is 1.22 CSS px on a 390 or 430 phone, shot at 3x like an iPhone)
 * against a summer noon, a golden evening and a moonlit night, each lit the way renderScene
 * lights the scene; and a size check beside the scene's great blue heron at its scene size.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
const from = html.indexOf("/* ── Storybook ink: the drawing kit");
const to = html.indexOf("/* ── the scene: arc, sun / moon");
if (from < 0 || to < 0) { console.error("could not find the kit and cast sections in index.html"); process.exit(1); }
const partsDir = path.join(HERE, "parts");
/* each part file is loaded on its own, in its own copy of the kit's scope, so one drawing's
   unfinished file never stops another from being looked at */
let partFiles = [];
try { partFiles = readdirSync(partsDir).filter((f) => f.endsWith(".js")).sort(); } catch {}
const args = process.argv.slice(2);
const name = args[0];
if (!name) { console.error("usage: node tools/beaufort/look.mjs <name> [--state s] [--scale n] [\".class=transform\" ...]"); process.exit(1); }
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const poses = args.slice(1).filter((a, i, all) => a.includes("=") && !["--state", "--scale"].includes(all[i - 1]));
const plate = args.includes("--plate");

const mulberry = (a) => () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
/* Beaufort's drawings live in index.html's cast (each registers in BFT). A drawing still being made can
   sit in tools/beaufort/parts/ as a file of its own, registering in LOOK (which is BFT), and is loaded
   on its own over the cast, so an unfinished file never stops another from being looked at */
let cast = null;
const loadErrs = [];
const sources = [null, ...partFiles];
for (const f of sources) {
  try {
    const extra = f ? `\n/* ── ${f} */\n${readFileSync(path.join(partsDir, f), "utf8")}` : "";
    const cast0 = html.slice(from, to), reg = /\nconst BFT=\{\}/.test(cast0) ? "" : "const BFT={};";
    const c = new Function("mulberry", `${reg}${cast0}\nconst LOOK=BFT;${extra}\n;return {inkRig, inkUnit, inkAt, INK, LOOK, rigHeron};`)(mulberry);
    if (c.LOOK[name]) { cast = c; break; }
  } catch (e) { loadErrs.push(`${f || "index.html"}: ${e.stack || e}`); }
}
if (!cast) { console.error(`nothing called "${name}" in BFT or in any of: ${partFiles.join(", ") || "(no part files)"}` + (loadErrs.length ? "\nwhat did not load:\n" + loadErrs.join("\n") : "")); process.exit(1); }
const L = cast.LOOK[name];
if (!L) { console.error(`nothing called "${name}" in LOOK. Registered: ${Object.keys(cast.LOOK).join(", ") || "(none)"}`); process.exit(1); }

/* the scene's light, as renderScene works it out: tone() takes every colour toward the golden hour's
   warmth, the overcast grey and the night's blue; air() fades with distance into the sky's haze */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const LIGHTS = {
  noon: { sky: "linear-gradient(#5E9FCB,#A9D0E2 70%,#D9E6DC)", haze: "#B4D3DE", warm: null, gold: 0, night: 0, ink: "#2A2130", shade: "#3A2350", lit: "#FFF1CC", litOp: .5, light: [.3, -1], water: "#7FB2C9" },
  golden: { sky: "linear-gradient(#6E7FB0,#D99A88 62%,#F2C27E)", haze: "#D9A58F", warm: "#FFA24E", gold: 1, night: 0, ink: "#2A2130", shade: "#3A2350", lit: "#FFCF8C", litOp: .6, light: [1, -.25], water: "#A99AAE" },
  night: { sky: "linear-gradient(#0E1A2C,#1F3346)", haze: "#2A3A52", warm: null, gold: 0, night: 1, ink: "#0A1020", shade: "#050A18", lit: "#B9CCEE", litOp: .28, light: [-.6, -1], water: "#1E3346" },
};
const tone = (c, lt) => { let t = c; if (lt.warm) t = mix(t, lt.warm, .3 * lt.gold); if (lt.night) t = mix(t, "#15223D", .62 * lt.night); return t; };
const air = (c, d, lt) => mix(tone(c, lt), lt.haze, d * .72);
const litPal = (pal, lt, d) => {
  const o = {};
  for (const [k, v] of Object.entries(pal)) o[k] = isHex(v) && !["ink", "shade", "lit"].includes(k) ? air(v, d, lt) : v;
  return { ...o, ink: mix(lt.ink, lt.haze, d * .7), shade: lt.shade, lit: lt.lit, litOp: (pal.litOp ?? .5) * (lt.night ? .55 : 1), shadeOp: pal.shadeOp ?? .32 };
};

const states = L.states || { default: {} };
const pick = opt("--state");
const list = Object.entries(states).filter(([k]) => !pick || k === pick);
if (!list.length) { console.error(`no state "${pick}". States: ${Object.keys(states).join(", ")}`); process.exit(1); }
const [bx, by, bw, bh] = L.box || [-40, -40, 80, 44];
const s0 = L.s ?? 1, dist = L.dist ?? .1;
const big = +(opt("--scale") || Math.max(1, Math.min(14, 620 / (bw * s0)))) ;
const asLayers = (r) => (r && r[0] && (r[0].parts || r[0].layers)) ? r : [{ parts: r }];
const ink = (st, pal, s, o = {}) => cast.inkRig(asLayers(L.draw(st)), pal, { s, light: [1, -.5], ...(L.o || {}), ...o });
const PHONE = 1.22;

const css = `svg g[class]{transform-box:view-box;transform-origin:0 0}` + (L.css || "") +
  poses.map((p) => { const [sel, t] = p.split("="); return `.pose ${sel}{transform:${t}}`; }).join("");
const fig = (inner, w, h, vb, bg, label) => `<figure><svg width="${w}" height="${h}" viewBox="${vb}" style="background:${bg}">${inner}</svg><figcaption>${label}</figcaption></figure>`;
const pad = 6;
let body = "";
for (const [sk, st] of list) {
  const closePal = { ...L.pal, ink: L.pal.ink || "#2A1B33", shade: L.pal.shade || "#3A2350", lit: L.pal.lit || "#FFE6B0" };
  const S = big * s0;
  const vb = `${(bx - pad / big) * s0} ${(by - pad / big) * s0} ${(bw + 2 * pad / big) * s0} ${(bh + 2 * pad / big) * s0}`;
  let row = fig(`<g class="pose">${L.extra ? cast.inkAt(0, 0, s0, 1, L.extra(st, LIGHTS.noon)) : ""}${cast.inkAt(0, 0, s0, 1, ink(st, closePal, S, { light: [1, -.5] }))}</g>`,
    Math.round((bw + 2 * pad / big) * S), Math.round((bh + 2 * pad / big) * S), vb, "#E8DCC4", `${name} · ${sk} · close up ×${f2(big)}`);
  for (const [lk, lt] of Object.entries(LIGHTS)) {
    const pal = litPal(L.pal, lt, dist);
    const w = Math.max(120, (bw + 24) * s0), h = Math.max(70, (bh + 24) * s0);
    const vbp = `${(bx * s0) - (w - bw * s0) / 2} ${(by * s0) - (h - bh * s0) / 2} ${w} ${h}`;
    const groundY = 0;
    const water = `<rect x="${(bx * s0) - w}" y="${groundY}" width="${w * 3}" height="${h}" fill="${lt.water}" opacity=".55"/>`;
    row += fig(`${L.ground === false ? "" : water}<g class="pose">${L.extra ? cast.inkAt(0, 0, s0, 1, L.extra(st, lt)) : ""}${cast.inkAt(0, 0, s0, 1, ink(st, pal, s0 * PHONE, { light: lt.light }))}</g>`,
      Math.round(w * PHONE), Math.round(h * PHONE), vbp, lt.sky, `${lk}, phone size`);
  }
  /* beside the scene's great blue heron at its scene size (.84), on the same water */
  {
    const lt = LIGHTS.noon, pal = litPal(L.pal, lt, dist), hp = litPal(cast.INK.heron, lt, .05);
    const gap = 16, hw = 40, w = bw * s0 + hw + gap * 3, h = Math.max(bh * s0, 70) + 16;
    const left = bx * s0 - hw - gap * 2;
    const vbp = `${left} ${Math.min(by * s0, -66) - 8} ${w} ${h}`;
    row += fig(`<rect x="${left}" y="0" width="${w}" height="${h}" fill="${lt.water}" opacity=".55"/>`
      + cast.inkAt(bx * s0 - gap - 6, 9 * .84, .84, 1, cast.inkRig(cast.rigHeron(() => ""), hp, { s: .84 * PHONE, light: lt.light }))
      + `<g class="pose">${L.extra ? cast.inkAt(0, 0, s0, 1, L.extra(st, lt)) : ""}${cast.inkAt(0, 0, s0, 1, ink(st, pal, s0 * PHONE, { light: lt.light }))}</g>`,
      Math.round(w * PHONE), Math.round(h * PHONE), vbp, lt.sky, "beside the heron, phone size");
  }
  body += `<div class="row">${row}</div>`;
}
function f2(v) { return Math.round(v * 100) / 100; }
const page = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#2a2a2a;color:#ddd;font:12px monospace}
.row{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}figure{margin:0}${css}</style>${body}`;
const out = path.join(ROOT, "tools", "shots", "beaufort");
mkdirSync(out, { recursive: true });
const tag = pick ? `${name}-${pick}` : name;
writeFileSync(path.join(out, `look-${tag}.html`), page);

let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.error("playwright is not installed.\n  npm i playwright && npx playwright install chromium"); process.exit(1); }
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
const pg = await browser.newPage({ viewport: { width: 1400, height: 400 }, deviceScaleFactor: 3 });
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e)));
await pg.setContent(page);
await pg.screenshot({ path: path.join(out, `look-${tag}.png`), fullPage: true });
/* the close-up alone, on the app's own wash, for the review page */
if (plate) {
  await pg.evaluate(() => { const f = document.querySelector("figure svg"); f.style.background = "#EFF2ED"; });
  await pg.locator("figure svg").first().screenshot({ path: path.join(out, `plate-${tag}.png`) });
}
await browser.close();
if (errs.length) console.error("page errors:\n" + errs.join("\n"));
console.log(`wrote ${path.join(out, `look-${tag}.png`)}`);

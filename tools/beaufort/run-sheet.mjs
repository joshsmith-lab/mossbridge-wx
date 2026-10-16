/**
 * The water mock's fish row, every species on one sheet: close up, then at the size the row draws
 * them (1 unit to the CSS pixel, shot at 3x like an iPhone) on the day paper and the night paper.
 *
 *   node tools/beaufort/run-sheet.mjs        # writes tools/shots/beaufort/run-sheet.png
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
const from = html.indexOf("/* ── Storybook ink: the drawing kit"), to = html.indexOf("/* ── the scene: arc, sun / moon");
const mulberry = (a) => () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const cast0 = html.slice(from, to), reg = /\nconst BFT=\{\}/.test(cast0) ? "" : "const BFT={};";
const C = new Function("mulberry", `${reg}${cast0}\n;return {inkRig, inkAt, RUN_RIG, RUN_INK, runPal: typeof runPal==="function"?runPal:null};`)(mulberry);
const keys = Object.keys(C.RUN_RIG);
const O = { line: .8, heavy: .35, shade: 1.3, lit: .65, light: [-.5, -1] };
const draw = (k, s, night) => C.inkRig(C.RUN_RIG[k](), C.runPal ? C.runPal(k, night) : C.RUN_INK[k], { ...O, s });
let close = "", small = "";
for (const k of keys) {
  close += `<figure><svg width="${44 * 7}" height="${26 * 7}" viewBox="-22 -13 44 26" style="background:#FAFAF6">${draw(k, 7, false)}</svg><figcaption>${k}</figcaption></figure>`;
}
for (const [bg, night] of [["#F2F5EE", false], ["#0C1F28", true]]) {
  let row = "";
  for (const k of keys) row += `<svg width="46" height="28" viewBox="-23 -14 46 28" style="background:${bg}">${draw(k, 1, night)}</svg>`;
  small += `<div class="row">${row}</div>`;
}
const page = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#2a2a2a;color:#ddd;font:12px monospace}
.grid{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0}.row{display:flex;gap:0;margin-top:12px}</style><div class="grid">${close}</div>${small}`;
const out = path.join(ROOT, "tools", "shots", "beaufort");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "run-sheet.html"), page);
const { chromium } = await import("playwright");
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
const pg = await browser.newPage({ viewport: { width: 1000, height: 400 }, deviceScaleFactor: 3 });
await pg.setContent(page);
await pg.screenshot({ path: path.join(out, "run-sheet.png"), fullPage: true });
await browser.close();
console.log("wrote " + path.join(out, "run-sheet.png"));

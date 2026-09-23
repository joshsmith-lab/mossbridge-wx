/**
 * Look at one animal from the Storybook cast, straight out of index.html.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/rig.mjs deer                                   # rest pose, close up and phone size
 *   node tools/rig.mjs deer ".deer-head=rotate(100deg)" ".deer-nod=rotate(-40deg)"   # a pose
 *   node tools/rig.mjs heron --scale 3
 *
 * The rig functions (rigDeer, rigHeron, ...) and the INK palettes live in the "Storybook cast"
 * section of index.html, painted by the kit in "Storybook ink: the drawing kit". This loads
 * exactly that code, so what you see here is what the scene draws, lit by a plain day light.
 * Change a shape by looking at it here, at close range and at phone size, not by nudging
 * numbers and hoping. Writes tools/shots/rig-<name>.png.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(HERE, "..", "index.html"), "utf8");
const from = html.indexOf("/* ── Storybook ink: the drawing kit");
const to = html.indexOf("/* ── the scene: arc, sun / moon");
if (from < 0 || to < 0) { console.error("could not find the kit and cast sections in index.html"); process.exit(1); }
const [name, ...rest] = process.argv.slice(2);
if (!name) { console.error("usage: node tools/rig.mjs <deer|heron|raccoon|oystercatcher|...> [\".class=transform\" ...] [--scale n]"); process.exit(1); }
const scaleArg = rest.indexOf("--scale"), big = scaleArg >= 0 ? +rest[scaleArg + 1] : 5;
const poses = rest.filter((a, i) => a.includes("=") && (scaleArg < 0 || i !== scaleArg + 1));

const src = html.slice(from, to);
const mulberry = (a) => () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const cast = new Function("mulberry", `${src}; return {inkRig, inkAt, INK, rigs: {${
  [...src.matchAll(/^const (rig\w+)=/gm)].map((m) => m[1]).join(",")}}};`)(mulberry);
const key = Object.keys(cast.rigs).find((k) => k.toLowerCase() === "rig" + name.toLowerCase() || k.toLowerCase().startsWith("rig" + name.toLowerCase().slice(0, 4)));
const palKey = Object.keys(cast.INK).find((k) => k.toLowerCase().startsWith(name.toLowerCase().slice(0, 4)));
if (!key || !palKey) { console.error(`no rig for "${name}". Rigs: ${Object.keys(cast.rigs).join(", ")}`); process.exit(1); }
const pal = { ...cast.INK[palKey], ink: "#2A2130", shade: "#3A2350", lit: "#FFE6B0" };
const rig = () => cast.rigs[key]((p) => "");
const draw = (s) => cast.inkAt(0, 0, s, 1, cast.inkRig(rig(), pal, { s, light: [1, -.5] }));
const css = `svg g[class]{transform-box:view-box;transform-origin:0 0}` +
  poses.map((p) => { const [sel, t] = p.split("="); return `.pose ${sel}{transform:${t}}`; }).join("");
const fig = (inner, w, h, ox, oy, bg, label) => `<figure><svg width="${w}" height="${h}" viewBox="${-ox} ${-oy} ${w} ${h}" style="background:${bg}">${inner}</svg><figcaption>${label}</figcaption></figure>`;
const page = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#2a2a2a;color:#ddd;font:12px monospace;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}figure{margin:0}${css}</style>
${fig(`<g class="pose">${draw(big)}</g>`, 100 * big, 96 * big, 50 * big, 84 * big, "#E8DCC4", `${key} ×${big}${poses.length ? " " + poses.join(" ") : ""}`)}
${fig(`<rect x="-200" y="0" width="400" height="30" fill="#6d8b4a"/><g class="pose">${draw(1)}</g>`, 160, 100, 80, 80, "linear-gradient(#A9CADB,#E6E2CE)", "phone scale ×1")}`;
const out = path.join(HERE, "shots");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, `rig-${name}.html`), page);

let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.error("playwright is not installed.\n  npm i playwright && npx playwright install chromium"); process.exit(1); }
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
const pg = await browser.newPage({ viewport: { width: 100 * big + 220, height: 96 * big + 60 }, deviceScaleFactor: 2 });
await pg.setContent(page);
await pg.screenshot({ path: path.join(out, `rig-${name}.png`), fullPage: true });
await browser.close();
console.log(`wrote ${path.join(out, `rig-${name}.png`)}`);

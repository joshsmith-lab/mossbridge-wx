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
 *
 * The holidays' props are drawn with the same kit and can be looked at the same way:
 *
 *   node tools/rig.mjs pumpkin | lantern | lantern-lit | lumina | cornshock | bale | loft-head | ghostface | witch | trick-or-treater
 *   node tools/rig.mjs cat | sheet-ghost | scarecrow
 *   node tools/rig.mjs cat ".cat-tail=rotate(-17deg)"                                   # the tail at the top of its flick
 *
 * and so can the bat that flies over both scenes in October, in the air rather than on the grass,
 * at phone size against the dusk and the night it flies in:
 *
 *   node tools/rig.mjs bat
 *   node tools/rig.mjs bat ".bat-wl=rotate(34deg) scaleX(.74)" ".bat-wr=rotate(-34deg) scaleX(.74)"   # the top of a stroke
 *
 * and the black widow who hangs under Halloween's cobweb on the glass, at phone size against a
 * day sky and a night one, with the edge the day and the night give her:
 *
 *   node tools/rig.mjs spider
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
const scaleArg = rest.indexOf("--scale"), big = scaleArg >= 0 ? +rest[scaleArg + 1] : /^(spider|cat|sheet-ghost)/i.test(name) ? 3 : /^scarecrow/i.test(name) ? 2 : /^loft/i.test(name) ? 9 : /^(pumpkin|lantern|lumina|cornshock|bale|bat)/i.test(name) ? 14 : 5;
const poses = rest.filter((a, i) => a.includes("=") && (scaleArg < 0 || i !== scaleArg + 1));

const src = html.slice(from, to);
const mulberry = (a) => () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const cast = new Function("mulberry", `${src}; return {inkRig, inkAt, INK, rigs: {${
  [...src.matchAll(/^const (rig\w+)=/gm)].map((m) => m[1]).join(",")}}, props: {${
  [...src.matchAll(/^const (prop\w+)=/gm)].map((m) => m[1]).join(",")}}};`)(mulberry);
/* a prop is a list of parts rather than a rig, so it is wrapped as a rig of one layer */
const PROPS = {
  /* The farm's approved fish, close up and at its moon-chart size. */
  fish: ["fish", (c) => c.rigFish(), {}, [38, 24, 19, 12], { phone: 0.7,
    o: { line: 0.8, heavy: 0.35, shade: 1.3, lit: 0.65, light: [-0.5, -1] },
    skies: ["#D3E3DF", "#0D222B"],
    skyPal: [{}, { body: "#A1B391", mark: "#E2DDC0", fin: "#BC9966", ink: "#172633", lit: "#FFF3D0" }] }],
  pumpkin: ["pumpkin", (c) => c.propPumpkin(10, 7, { seed: 3 })],
  lantern: ["pumpkin", (c) => c.propPumpkin(10, 7, { carved: true, seed: 3 })],
  "lantern-lit": ["pumpkin", (c) => c.propPumpkin(10, 7, { carved: true, seed: 3 }), { carve: "candleLit", eyeRing: "rindLit" }],
  lumina: ["lumina", (c) => c.propPumpkin(6, 4.4, { seed: 9 })],
  cornshock: ["cornShock", (c) => c.propCornShock(5)],
  bale: ["bale", (c) => c.propBale()],
  /* the head in the loft window is drawn at ten times the October loft's units, so it gets that frame */
  "loft-head": ["myers", (c) => c.propLoftHead(), {}, [66, 58, 33, 58]],
  /* Ghostface in the live oak is drawn at ten units to the screen pixel and is three units (the
     robe, the hood, then the mask), so the phone panel draws him at a tenth, with the scene's lines */
  ghostface: ["ghostface", (c) => c.propGhostface(), {}, [170, 190, 85, 75], { phone: 0.1, o: { line: 0.5, heavy: 0.25, shade: 0.7, lit: 0.45 } }],
  /* the bat is a rig (its wings turn at the shoulders), drawn in the sky at the size the scene
     draws its nearer bats, with the scene's lines, over an October dusk and an October night */
  bat: ["bat", (c) => c.rigBat(), {}, [30, 14, 15, 7], { phone: 0.66, o: { line: 0.8, heavy: 0.3, shade: 0, lit: 0.6 },
    skies: ["linear-gradient(#4E4A78,#B9708A 70%,#E8A070)", "linear-gradient(#0F1A2C,#1E3042)"] }],
  /* the witch on her broom is drawn at five units to the screen pixel, so the phone panel draws her
     at a fifth, with the lines the scene gives her. The night panel takes her colours down toward
     black the way the scene does after dark (night), and lights her from the moon */
  witch: ["witch", (c) => c.propWitch(), {}, [180, 92, 100, 72], { phone: 0.2, o: { line: 0.75, heavy: 0.35, shade: 0.6, lit: 0.45 },
    night: { ink: "#0A1020", shade: "#050A18", lit: "#B9CCEE", litOp: 0.75, dark: ["#090B14", 0.45] } }],
  /* the black widow is drawn at ten units to the screen pixel and the cobweb shows her at eleven
     (WEB.sp), so the phone panels draw her at that, with the lines the cobweb gives her, against a
     day sky and a night one, each with its own edge */
  spider: ["spider", (c) => c.propSpider(), {}, [120, 140, 60, 6], { phone: 0.11, o: { line: 0.55, heavy: 0.3, shade: 0.8, lit: 0.6, light: [-.55, -1] }, frame: [24, 18, 12, 3],
    skies: ["linear-gradient(#5C9FC6,#9ECBDC)", "linear-gradient(#0B1A28,#15293A)"], skyPal: [{ ink: "#060407", shade: "#000000", lit: "#E9DCCB" }, { ink: "#060407", shade: "#000000", lit: "#C9D6F2", litOp: 0.95, glint: "#DCE6FA" }], skyLit: [0.6, 1.1] }],
  /* Halloween night's trick-or-treater is drawn at ten units to the screen pixel, so the phone panel
     draws the kid at a tenth, with the scene's lines, and the night panel takes the colours down
     toward the night's blue the way the scene's tone() does after dark */
  "trick-or-treater": ["trickOrTreater", (c) => c.propTrickOrTreater(), {}, [140, 132, 60, 124], { phone: 0.1, o: { line: 0.7, heavy: 0.3, shade: 0.9, lit: 0.5 },
    night: { ink: "#0A1020", shade: "#050A18", lit: "#B9CCEE", litOp: 0.3, dark: ["#15223D", 0.62] } }],
  /* More Halloween. The black cat, the cheesecloth ghost and the scarecrow are drawn at ten units to
     the unit the scene places them in, so each phone panel draws them at the scale the scene does,
     with its lines. The cat's night panel is the eyeshine it has from sunset, the ghost's is the
     night it hangs in, and the scarecrow carries its crow, as it does by day */
  cat: ["blackCat", (c) => c.propBlackCat(), {}, [140, 200, 50, 128], { phone: 0.072, o: { line: 0.65, heavy: 0.3, shade: 0.8, lit: 0.5 },
    night: { ink: "#0A1020", shade: "#050A18", lit: "#B9CCEE", litOp: 0.5, eye: "#B8F25A", eyeRing: "#B8F25A", dark: ["#15223D", 0.5] } }],
  "sheet-ghost": ["cheesecloth", (c) => c.propCheeseclothGhost(), {}, [110, 175, 55, 12], { phone: 0.078, o: { line: 0.6, heavy: 0.3, shade: 0.8, lit: 0.5 },
    night: { ink: "#0A1020", shade: "#050A18", lit: "#B9CCEE", litOp: 0.4, dark: ["#15223D", 0.55] } }],
  scarecrow: ["scarecrow", (c) => c.propScarecrow(true), {}, [250, 270, 125, 262], { phone: 0.076, o: { line: 0.6, heavy: 0.3, shade: 0.8, lit: 0.5 } }],
};
const prop = PROPS[name.toLowerCase()];
const key = prop ? name : Object.keys(cast.rigs).find((k) => k.toLowerCase() === "rig" + name.toLowerCase() || k.toLowerCase().startsWith("rig" + name.toLowerCase().slice(0, 4)));
const palKey = prop ? prop[0] : Object.keys(cast.INK).find((k) => k.toLowerCase().startsWith(name.toLowerCase().slice(0, 4)));
if (!key || !palKey) { console.error(`no rig for "${name}". Rigs: ${Object.keys(cast.rigs).join(", ")}; props: ${Object.keys(PROPS).join(", ")}`); process.exit(1); }
const pal = { ...cast.INK[palKey], ink: "#2A2130", shade: "#3A2350", lit: "#FFE6B0" };
for (const [role, from] of Object.entries(prop?.[2] || {})) pal[role] = pal[from];
/* a prop that is already layers ({parts}) is painted as it comes, unit by unit */
const rig = () => prop ? ((r) => r[0]?.parts || r[0]?.layers ? r : [{ parts: r }])(prop[1]({ ...cast.props, ...cast.rigs })) : cast.rigs[key]((p) => "");
const draw = (s, o = {}) => cast.inkAt(0, 0, s, 1, cast.inkRig(rig(), pal, { s, light: [1, -.5], ...o }));
const phone = prop?.[4] || {};
/* a night palette: every colour taken down toward the night's black the way the scene does it,
   with the eyes keeping their shine, then the moonlit ink and edge */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
const nightPal = ({ dark, ...n }) => ({ ...Object.fromEntries(Object.entries(pal).map(([k, v]) =>
  [k, dark && k !== "eye" && typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? mixHex(v, dark[0], dark[1]) : v])), ...n });
const css = `svg g[class]{transform-box:view-box;transform-origin:0 0}` +
  poses.map((p) => { const [sel, t] = p.split("="); return `.pose ${sel}{transform:${t}}`; }).join("");
const fig = (inner, w, h, ox, oy, bg, label) => `<figure><svg width="${w}" height="${h}" viewBox="${-ox} ${-oy} ${w} ${h}" style="background:${bg}">${inner}</svg><figcaption>${label}</figcaption></figure>`;
const page = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#2a2a2a;color:#ddd;font:12px monospace;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}figure{margin:0}${css}</style>
${prop ? fig(`<g class="pose">${draw(big, prop[4]?.o?.light ? { light: prop[4].o.light } : {})}</g>`, ...(prop[3] || [40, 34, 20, 29]).map((v) => v * big), "#E8DCC4", `${key} ×${big}`)
  : fig(`<g class="pose">${draw(big)}</g>`, 100 * big, 96 * big, 50 * big, 84 * big, "#E8DCC4", `${key} ×${big}${poses.length ? " " + poses.join(" ") : ""}`)}
${phone.skies ? phone.skies.map((bg, i) => fig(`<g class="pose">${phone.skyPal ? cast.inkAt(0, 0, phone.phone, 1, cast.inkRig(rig(), { ...pal, ...phone.skyPal[i] }, { s: phone.phone, light: [1, -.5], ...phone.o, ...(phone.skyLit ? { lit: phone.skyLit[i] } : {}) })) : draw(phone.phone, phone.o)}</g>`, ...(phone.frame || [40, 20, 20, 10]), bg, i ? "night, phone size" : phone.skyPal ? "day, phone size" : "dusk, phone size")).join("")
  : fig(`${phone.night ? "" : `<rect x="-200" y="0" width="400" height="30" fill="#6d8b4a"/>`}<g class="pose">${draw(phone.phone ?? 1, phone.o)}</g>`, 160, 100, 80, 80, "linear-gradient(#A9CADB,#E6E2CE)", "phone scale ×1")}
${phone.night ? fig(`<g class="pose">${cast.inkAt(0, 0, phone.phone, 1, cast.inkRig(rig(), nightPal(phone.night), { s: phone.phone, light: [0, -1], ...phone.o }))}</g>`, 160, 100, 80, 60, "linear-gradient(#0E1A2C,#1F3346)", "phone scale ×1, a moonlit night") : ""}`;
const out = path.join(HERE, "shots");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, `rig-${name}.html`), page);

let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.error("playwright is not installed.\n  npm i playwright && npx playwright install chromium"); process.exit(1); }
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
const pg = await browser.newPage({ viewport: { width: (prop ? (prop[3] || [40])[0] : 100) * big + 220, height: (prop ? (prop[3] || [0, 34])[1] : 96) * big + 60 }, deviceScaleFactor: 2 });
await pg.setContent(page);
await pg.screenshot({ path: path.join(out, `rig-${name}.png`), fullPage: true });
await browser.close();
console.log(`wrote ${path.join(out, `rig-${name}.png`)}`);

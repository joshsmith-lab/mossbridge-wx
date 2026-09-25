// The Storybook Ink kit, read straight out of index.html the way tools/rig.mjs reads it, so every
// outline, heavier shadow edge, crescent and lit rim in the icon is the app's own inkUnit().
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const html = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "index.html"), "utf8");
const from = html.indexOf("/* ── Storybook ink: the drawing kit");
const to = html.indexOf("/* ── the scene: arc, sun / moon");
if (from < 0 || to < 0) throw new Error("could not find the Storybook kit in index.html");
const src = html.slice(from, to);
export const mulberry = (a) => () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const K = new Function("mulberry", `${src}; return {inkUnit, inkAt, inkRig, part, pBlob, pTaper, pDot, taper, scallop, curlT, curlLine, curlPts, inkSpline, propCloud, propOak, INK};`)(mulberry);

/**
 * Export the home-screen icon from its master.
 *
 *   node tools/icon.mjs
 *
 * Rewrites icon-180.png and icon-512.png from icon.svg (drawn at 1024). Chrome renders the master
 * once at 1024, and each size is an area average of that render, every output pixel the mean of
 * the 1024 pixels it covers. Rendering straight at 180 composites the sun's ink, fill and lit rim
 * at the small size and leaves a pixel of khaki between the ink and the rim; averaging the full
 * render cannot. The PNGs are 8-bit RGB, opaque, with no colour chunks. A new export is a new
 * shell: bump CACHE in sw.js. If the Playwright package is present but its bundled browser is not,
 * set PORCH_CHROME_PATH.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync, deflateSync } from "node:zlib";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = 1024;

/* PNG in and out, 8-bit RGB or RGBA, non-interlaced: what Chrome writes and what the icon needs */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function decode(b) {
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), type = b[25], bpp = type === 6 ? 4 : 3, idat = [];
  if (b[24] !== 8 || (type !== 2 && type !== 6) || b[28] !== 0) throw new Error("expected an 8-bit RGB(A) non-interlaced PNG");
  for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) if (b.toString("latin1", o + 4, o + 8) === "IDAT") idat.push(b.subarray(o + 8, o + 8 + b.readUInt32BE(o)));
  const raw = inflateSync(Buffer.concat(idat)), s = w * bpp, px = Buffer.alloc(h * s), rgb = new Float64Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0, f = raw[y * (s + 1)]; x < s; x++) {
    const a = x >= bpp ? px[y * s + x - bpp] : 0, u = y ? px[(y - 1) * s + x] : 0, c = x >= bpp && y ? px[(y - 1) * s + x - bpp] : 0, p = a + u - c;
    const paeth = Math.abs(p - a) <= Math.abs(p - u) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - u) <= Math.abs(p - c) ? u : c;
    px[y * s + x] = raw[y * (s + 1) + 1 + x] + [0, a, u, (a + u) >> 1, paeth][f];
  }
  for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) rgb[i * 3 + k] = px[i * bpp + k];
  return { w, h, rgb };
}
function encode(w, h, rgb) {
  const s = w * 3, rows = [];
  for (let y = 0; y < h; y++) {
    /* each row takes the filter whose output is smallest, the usual PNG heuristic */
    const cur = rgb.subarray(y * s, (y + 1) * s), up = y ? rgb.subarray((y - 1) * s, y * s) : new Uint8Array(s);
    let best = null, score = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = Buffer.alloc(s + 1); out[0] = f; let sum = 0;
      for (let x = 0; x < s; x++) {
        const a = x >= 3 ? cur[x - 3] : 0, u = up[x], c = x >= 3 ? up[x - 3] : 0, p = a + u - c;
        const paeth = Math.abs(p - a) <= Math.abs(p - u) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - u) <= Math.abs(p - c) ? u : c;
        const v = (cur[x] - [0, a, u, (a + u) >> 1, paeth][f]) & 255;
        out[x + 1] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < score) { score = sum; best = out; }
    }
    rows.push(best);
  }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, "latin1"), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
/* area average: each output pixel is the mean of the source area it covers, fractional edges weighted */
function areaAverage({ w, rgb }, n) {
  const k = w / n, weights = Array.from({ length: n }, (_, o) => {
    const a = o * k, b = a + k, list = [];
    for (let i = Math.floor(a); i < Math.ceil(b); i++) list.push([i, (Math.min(b, i + 1) - Math.max(a, i)) / k]);
    return list;
  });
  const tmp = new Float64Array(w * n * 3), out = new Uint8Array(n * n * 3);
  for (let y = 0; y < w; y++) for (let x = 0; x < n; x++) for (const [i, wt] of weights[x]) for (let c = 0; c < 3; c++) tmp[(y * n + x) * 3 + c] += rgb[(y * w + i) * 3 + c] * wt;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { const acc = [0, 0, 0]; for (const [j, wt] of weights[y]) for (let c = 0; c < 3; c++) acc[c] += tmp[(j * n + x) * 3 + c] * wt; for (let c = 0; c < 3; c++) out[(y * n + x) * 3 + c] = Math.max(0, Math.min(255, Math.round(acc[c]))); }
  return out;
}

let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.error("playwright is not installed.\n  npm i playwright && npx playwright install chromium"); process.exit(1); }
const uri = "data:image/svg+xml;base64," + readFileSync(path.join(ROOT, "icon.svg")).toString("base64");
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH ? { executablePath: process.env.PORCH_CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: SRC, height: SRC }, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0"><img src="${uri}" width="${SRC}" height="${SRC}" style="display:block">`);
await page.waitForTimeout(200);
const full = decode(await page.screenshot());
await browser.close();
for (const n of [180, 512]) {
  writeFileSync(path.join(ROOT, `icon-${n}.png`), encode(n, n, areaAverage(full, n)));
  console.log(`wrote icon-${n}.png`);
}

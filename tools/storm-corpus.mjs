/**
 * The storm card's winter backtest corpus: every winter storm, blizzard and ice storm warning the two
 * offices wrote for the two family places from 2014 to October 10 2026, cut to the segment that holds
 * the place's zone, from Iowa State's AFOS archive (mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py).
 *
 *   node tools/storm-corpus.mjs              fetch WSWRLX and WSWILM from IEM and write the corpus
 *   node tools/storm-corpus.mjs <dir>        read <dir>/WSWRLX.txt and <dir>/WSWILM.txt instead
 *   node tools/storm-corpus.mjs wssi         write corpus/wssi.json, WPC's Winter Storm Severity Index at
 *                                            each place for every segment since November 2020 (below)
 *
 * The farm is RLX's Southeast Raleigh (WVZ516), Raleigh County (WVZ035) before the county was split;
 * the coast is ILM's Inland New Hanover (NCZ107). A segment is kept when it carries a WS.W, BZ.W or IS.W
 * VTEC line the page reads as live (alertLive: anything but CAN, EXP and UPG, so NEW, CON, EXT, EXA, EXB
 * and COR). IEM keeps no ISW or BZW products for either office: their ice storm and blizzard warnings
 * are in the WSW. Each kept segment is written verbatim, under the product's WMO and AWIPS lines and its
 * issuing block, and after a line naming the product, its issue time (UTC) and the zone:
 *
 *   %% WSWRLX 2016-01-22T17:49:00Z WVZ035
 *
 * one file per place per winter (July to June), tools/storm-fixtures/corpus/<farm|coast>-<2015-16>.txt.
 * test.mjs runs the page's own stormRead on every one (see "the winter corpus").
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "storm-fixtures", "corpus");
export const CORPUS = [
  { place: "farm", loc: "sp", pil: "WSWRLX", zones: ["WVZ516", "WVZ035"], note: "RLX, Southeast Raleigh (WVZ516; Raleigh, WVZ035, before the split)" },
  { place: "coast", loc: "mb", pil: "WSWILM", zones: ["NCZ107"], note: "ILM, Inland New Hanover (NCZ107)" },
];
const LIVE = ["NEW", "CON", "EXT", "EXA", "EXB", "COR"], KINDS = ["WS", "BZ", "IS"];
const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

export function expand(ugc) {
  const out = []; let st = null;
  for (const tok of ugc.replace(/\n/g, "").replace(/-\d{6}-$/, "-").split("-").filter(Boolean)) {
    let m = tok.match(/^([A-Z]{2}[ZC])(\d{3})(?:>(\d{3}))?$/);
    if (m) st = m[1]; else m = [null, null, ...(tok.match(/^(\d{3})(?:>(\d{3}))?$/) || []).slice(1)];
    if (!st || !m[2]) continue;
    for (let n = +m[2]; n <= +(m[3] || m[2]); n++) out.push(st + String(n).padStart(3, "0"));
  }
  return out;
}
/* a product's issue time: its WMO line's day, hour and minute, in the month and year of its issuing
   block, a month on or back where the UTC day has crossed one */
export function issued(text) {
  const wmo = text.match(/^[A-Z]{4}\d\d [A-Z]{4} (\d{2})(\d{2})(\d{2})/m), mnd = text.match(/^\d{3,4} [AP]M [A-Z]{3,4} [A-Z]{3} ([A-Z]{3}) (\d{1,2}) (\d{4})$/im);
  if (!wmo || !mnd) return null;
  const d = +wmo[1], day = +mnd[2];
  let y = +mnd[3], mo = MON[mnd[1].toUpperCase()];
  if (d < day - 15) { mo++; if (mo > 11) { mo = 0; y++; } } else if (d > day + 15) { mo--; if (mo < 0) { mo = 11; y--; } }
  return new Date(Date.UTC(y, mo, d, +wmo[2], +wmo[3]));
}
export const season = (t) => { const y = t.getUTCFullYear() - (t.getUTCMonth() < 6 ? 1 : 0); return `${y}-${String(y + 1).slice(2)}`; };

function cut(raw, { pil, zones }) {
  const out = [];
  for (const chunk of raw.split("\x01")) {
    const t = chunk.replace(/\x03/g, "").replace(/\r/g, "").replace(/^\s*\n?\d{3} *\n/, "").replace(/^\n+/, "");
    if (!/^[A-Z]{4}\d\d [A-Z]{4} \d{6}/.test(t)) continue;
    const at = issued(t);
    if (!at) continue;
    const lines = t.split("\n"), mndAt = lines.findIndex((l) => /^\d{3,4} [AP]M [A-Z]{3,4} [A-Z]{3} [A-Z]{3} \d{1,2} \d{4}$/i.test(l));
    const head = [lines[0], lines[1], "", ...lines.slice(2, mndAt + 1).filter((l, i) => i || l.trim())].join("\n").replace(/\n{3,}/g, "\n\n");
    for (const seg of t.split(/\n\$\$\n/)) {
      const m = seg.match(/(?:^|\n)([A-Z]{2}[ZC]\d{3}[\dA-Z>\-]*\n(?:[\dA-Z>]+(?:-[\dA-Z>]+)*-\n)*)/);
      if (!m) continue;
      const zone = zones.find((z) => expand(m[1]).includes(z));
      if (!zone) continue;
      const v = [...seg.matchAll(/\/O\.([A-Z]{3})\.[A-Z]{4}\.([A-Z]{2})\.W\.\d{4}\./g)];
      if (!v.some((x) => LIVE.includes(x[1]) && KINDS.includes(x[2]))) continue;
      const body = seg.slice(seg.indexOf(m[1])).replace(/\s+$/, "");
      out.push({ pil, at, zone, text: `${head}\n\n${body}\n\n$$\n` });
    }
  }
  return out;
}

async function main() {
  const dir = process.argv[2];
  /* the winters' files are written again; the index's readings (wssi.json) are left for "wssi" to redo */
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith(".txt")) rmSync(path.join(OUT, f));
  for (const c of CORPUS) {
    const raw = dir ? readFileSync(path.join(dir, c.pil + ".txt"), "utf8")
      : await (await fetch(`https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?pil=${c.pil}&fmt=text&sdate=2014-01-01&edate=2026-10-10&limit=9999`)).text();
    const by = new Map();
    for (const e of cut(raw, c).sort((a, b) => a.at - b.at)) {
      const k = season(e.at); if (!by.has(k)) by.set(k, []); by.get(k).push(e);
    }
    for (const [k, list] of by) {
      writeFileSync(path.join(OUT, `${c.place}-${k}.txt`),
        `# ${c.note}: winter storm, blizzard and ice storm warnings, the ${k} winter, verbatim from Iowa State's AFOS archive (tools/storm-corpus.mjs)\n`
        + list.map((e) => `%% ${e.pil} ${e.at.toISOString().replace(".000", "")} ${e.zone}\n${e.text}`).join("\n"));
    }
    console.log(c.place, [...by].map(([k, l]) => `${k}:${l.length}`).join(" "));
  }
}

/** the corpus as products: one per kept segment, with its place, zone, issue time and winter */
export function corpus() {
  const out = [];
  for (const f of readdirSync(OUT).filter((x) => x.endsWith(".txt")).sort()) {
    const c = CORPUS.find((x) => f.startsWith(x.place + "-"));
    for (const part of readFileSync(path.join(OUT, f), "utf8").split(/^%% /m).slice(1)) {
      const [first, ...rest] = part.split("\n"), [pil, iso, zone] = first.split(" "), text = rest.join("\n");
      out.push({ place: c.place, loc: c.loc, pil, zone, issued: iso, season: f.slice(c.place.length + 1, -4),
        product: { productText: "\n000\n" + text, issuanceTime: iso } });
    }
  }
  return out;
}

/* ── WPC's Winter Storm Severity Index, from its archive ──
   The farm's bar for a Winter Storm Warning is the index (index.html, wssiRead). The map service keeps no
   history, but WPC keeps an archive of the index's own grids from November 2020
   (ftp-wpc.ncep.noaa.gov/WSSI_Archive/David_Archive/<day>/<HH>_UTC/), and its WSSI_Maximum_Overall GeoTIFF
   is the three days' overall impact, the layer the page asks the service for. Each segment is given the
   cycle out when it was issued (a cycle's index goes out about a quarter of an hour after its hour), and
   the level its grid gives the place's own cell: 0 none, 1 Winter Weather Area, 2 Minor, 3 Moderate, 4
   Major, 5 Extreme. A cycle the archive does not have is said to be missing, never guessed. The grid is
   Lambert conformal on a sphere (6,371,200 m, standard parallel 25°N, central meridian 95°W), in 128-pixel
   tiles of LZW, read here without a library. */
export const WSSI_FILE = path.join(OUT, "wssi.json");
const WSSI_NAMES = [null, "WINTER WEATHER AREA", "MINOR", "MODERATE", "MAJOR", "EXTREME"];
const PLACES = { farm: [37.8215, -80.9942], coast: [34.2982, -77.7896] };
function lzw(src) {
  const out = []; let tab = [], bits = 9, pos = 0, prev = null;
  const reset = () => { tab = Array.from({ length: 258 }, (_, i) => (i < 256 ? [i] : [])); bits = 9; prev = null; };
  const code = () => { if (pos + bits > src.length * 8) return 257; let v = 0; for (let i = 0; i < bits; i++) v = (v << 1) | ((src[(pos + i) >> 3] >> (7 - ((pos + i) & 7))) & 1); pos += bits; return v; };
  reset();
  for (let c = code(); c !== 257; c = code()) {
    if (c === 256) { reset(); continue; }
    let e;
    if (prev == null) e = tab[c];
    else { e = c < tab.length ? tab[c] : [...prev, prev[0]]; tab.push([...prev, e[0]]); }
    for (const b of e) out.push(b);
    prev = e;
    if (tab.length + 1 >= 1 << bits && bits < 12) bits++;
  }
  return out;
}
function geotiff(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getUint16(0, true) !== 0x4949) throw new Error("not a little-endian TIFF");
  const at = v.getUint32(4, true), n = v.getUint16(at, true), tags = {};
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 };
  for (let i = 0; i < n; i++) {
    const e = at + 2 + 12 * i, tag = v.getUint16(e, true), type = v.getUint16(e + 2, true), count = v.getUint32(e + 4, true);
    if (!size[type]) continue;
    const off = size[type] * count <= 4 ? e + 8 : v.getUint32(e + 8, true), get = [, (o) => v.getUint8(o), (o) => v.getUint8(o), (o) => v.getUint16(o, true), , (o) => v.getUint32(o, true)];
    tags[tag] = type === 2 ? buf.slice(off, off + count).toString("latin1") : Array.from({ length: count }, (_, k) => (type === 12 ? v.getFloat64(off + 8 * k, true) : type === 4 ? v.getUint32(off + 4 * k, true) : get[type](off + size[type] * k)));
  }
  /* its GeoTIFF double parameters: the false origin's latitude and longitude, the two standard parallels,
     false easting and northing, the degree, and the sphere's axes */
  const g = tags[34736] || [];
  if (tags[259]?.[0] !== 5 || g[0] !== 25 || g[1] !== 265 || g[2] !== 25 || g[3] !== 25 || g[4] || g[5] || g[7] !== 6371200 || g[8] !== 6371200) throw new Error("not the WSSI grid this reads");
  const W = tags[256][0], TW = tags[322][0], TH = tags[323][0], px = tags[33550][0], [x0, y0] = tags[33922].slice(3, 5), tiles = {};
  const R = 6371200, p1 = (25 * Math.PI) / 180, l0 = (-95 * Math.PI) / 180, nn = Math.sin(p1), F = (Math.cos(p1) * Math.tan(Math.PI / 4 + p1 / 2) ** nn) / nn;
  const rho = (lat) => (R * F) / Math.tan(Math.PI / 4 + (lat * Math.PI) / 360) ** nn, rho0 = rho(25);
  return (lat, lon) => {
    const r = rho(lat), th = nn * ((lon * Math.PI) / 180 - l0), x = r * Math.sin(th), y = rho0 - r * Math.cos(th);
    const col = Math.floor((x - x0) / px), row = Math.floor((y0 - y) / px), t = Math.floor(row / TH) * Math.ceil(W / TW) + Math.floor(col / TW);
    tiles[t] ||= lzw(buf.subarray(tags[324][t], tags[324][t] + tags[325][t]));
    return tiles[t][(row % TH) * TW + (col % TW)];
  };
}
async function wssiMain() {
  (await import("node:dns")).setDefaultResultOrder("ipv4first");
  const get = async (url, n = 3) => { try { return await fetch(url); } catch (e) { if (n > 1) return get(url, n - 1); throw e; } };
  const cycles = new Map(), out = {};
  for (const e of corpus()) {
    const t = Date.parse(e.issued);
    if (t < Date.UTC(2020, 10, 1)) continue;
    const c = new Date(Math.floor((t - 20 * 6e4) / (6 * 36e5)) * 6 * 36e5), day = c.toISOString().slice(0, 10).replace(/-/g, ""), hh = c.toISOString().slice(11, 13);
    const key = `${day}_${hh}`;
    if (!cycles.has(key)) {
      const tif = async (f) => { const r = await get(`https://ftp-wpc.ncep.noaa.gov/WSSI_Archive/David_Archive/${day}/${hh}_UTC/${f}`); return r.ok ? geotiff(Buffer.from(await r.arrayBuffer())) : null; };
      /* and each of its three days, the 24 hours ending 24, 48 and 72 hours after the cycle (the service's
         Overall_Impact_Day_1, _2 and _3), because the farm's bar is a Major day inside the warning's hours */
      cycles.set(key, { max: await tif(`WSSI_Maximum_Overall_${day}_${hh}Z.tif`), days: await Promise.all([24, 48, 72].map((f) => tif(`WSSI_Overall_${day}_${hh}Z_fhr${f}.tif`))) });
    }
    const { max: read, days } = cycles.get(key), level = read ? read(...PLACES[e.place]) : null;
    out[`${e.place} ${e.issued}`] = { cycle: c.toISOString().replace(":00:00.000Z", "Z"), ...(read ? { impact: WSSI_NAMES[level] ?? null } : { missing: true }),
      ...(read && days.every(Boolean) ? { days: days.map((g) => WSSI_NAMES[g(...PLACES[e.place])] ?? null) } : {}) };
  }
  writeFileSync(WSSI_FILE, JSON.stringify({ source: "WPC's WSSI_Maximum_Overall GeoTIFFs and its three days' WSSI_Overall fhr24, fhr48 and fhr72 GeoTIFFs, ftp-wpc.ncep.noaa.gov/WSSI_Archive/David_Archive/, at each place's grid cell (tools/storm-corpus.mjs wssi)", readings: out }, null, 1) + "\n");
  const vals = Object.values(out);
  console.log(`${vals.length} segments, ${vals.filter((x) => x.missing).length} with no archived cycle; Major or Extreme: ${Object.entries(out).filter(([, x]) => x.impact === "MAJOR" || x.impact === "EXTREME").map(([k, x]) => `${k} ${x.impact}`).join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await (process.argv[2] === "wssi" ? wssiMain() : main());

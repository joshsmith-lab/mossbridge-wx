/**
 * Storm scenarios for the major-storm card, built from real products.
 *
 * Each scenario is what api.weather.gov would have answered at one moment: the active alerts at the
 * house (alerts/active?point=), at the coast the beach zone's (alerts/active?zone=NCZ108), the public
 * advisory list and its products (products/types/TCP) and the forecast advisories (products/types/TCM).
 * The text is the archived product, verbatim, from Iowa State's AFOS archive
 * (mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py), cut to the segments for the place's zones
 * (tools/storm-fixtures/<storm>/*.txt). The archive keeps products and not CAP alerts, so each alert
 * is put together the way the API puts one together from its segment: the indentation stripped, the
 * segment's headline as NWSheadline, its VTEC line, its VTEC begin as `onset` (the product's issue time
 * when the event is already under way, 000000T0000Z), its UGC expiry as `expires`, and no `ends` for a
 * tropical watch or warning. Severity, certainty and urgency are the values the API gives those
 * products; nothing here reads them. October 10 2026's two are the live API's own JSON, saved that
 * afternoon. The scenario's clock sits just after the newest product in it.
 *
 * At the farm a Winter Storm Warning also asks WPC's Winter Storm Severity Index at the point, its three
 * days in one identify request (mapservices.weather.noaa.gov ... wpc_wssi/MapServer/identify, layers 1 to
 * 3, Overall_Impact_Day_1, _2 and _3), and a scenario's `wssi` is that answer. tools/storm-fixtures/wssi/
 * keeps real ones, saved from the live service on October 11 2026: the farm's own (no results, as every
 * answer outside winter is) and a point in Montana under a Major area on Day 1 (Winter Weather Area, Minor,
 * Moderate and Major: the areas nest) and the Winter Weather Area and Minor on Day 2 (`*-days-*`), and the
 * same two points' answers from layer 4, the 72-hour layer the page asked until that day. The service
 * keeps no history, so a past storm's answer is put together in that same shape (wssiAnswer) from WPC's
 * own archive of the index (ftp-wpc.ncep.noaa.gov/WSSI_Archive/David_Archive/, from November 2020): each
 * day's level is the one its WSSI_Overall GeoTIFF for that cycle (fhr24, fhr48, fhr72) gives the farm's
 * grid cell, the times are the cycle's. Before November 2020, or in a cycle the archive does not keep,
 * there is no reading, and a level here is said to be made up.
 *
 * tools/fixtures.mjs serves one when a harness passes `o.storm` (a name here, or a scenario object):
 *   stage(page, { now, loc, o: { ...STORMS["florence-coast"].o, storm: "florence-coast" } })
 * Nothing changes for a scenario without it.
 */
import { readFileSync } from "node:fs";
import { corpus } from "./storm-corpus.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "storm-fixtures");
const text = (f) => readFileSync(path.join(DIR, f), "utf8");
const json = (f) => JSON.parse(text(f));

/* ── times ───────────────────────────────────────────── */
const TZ = "America/New_York";
/** an instant written the way the API writes one, on the office's clock: 2018-09-13T10:55:00-04:00 */
export function isoAt(d, tz = TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  const off = Math.round((local - d.getTime()) / 6e4), sg = off < 0 ? "-" : "+", a = Math.abs(off);
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}${sg}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
/** a product's DDHHMM (its WMO header, or a UGC expiry) in the month of `ref` */
const ddhhmm = (s, ref) => {
  const d = +s.slice(0, 2), h = +s.slice(2, 4), m = +s.slice(4, 6), r = new Date(ref);
  let y = r.getUTCFullYear(), mo = r.getUTCMonth();
  if (d < r.getUTCDate() - 15) { mo++; if (mo > 11) { mo = 0; y++; } }
  if (d > r.getUTCDate() + 15) { mo--; if (mo < 0) { mo = 11; y--; } }
  return new Date(Date.UTC(y, mo, d, h, m));
};
const vtecTime = (s) => (/^0{6}/.test(s) ? null : new Date(Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(7, 9), +s.slice(9, 11))));

/* ── products ────────────────────────────────────────── */
const PRODUCT_NAME = { TCP: "Public Tropical Cyclone Advisory", TCM: "Marine/Aviation Tropical Cyclone Advisory" };
/** an archived product as /products/{id} answers it */
export function product(file, ref, edit = (t) => t) {
  const t = edit(text(file)), [wmo, awips] = t.split("\n");
  const [wmoId, office, stamp] = wmo.trim().split(/\s+/);
  const code = awips.trim().slice(0, 3);
  return { id: `fixture-${awips.trim()}-${stamp}${/CCA/.test(wmo) ? "-cca" : ""}`, wmoCollectiveId: wmoId, issuingOffice: office,
    issuanceTime: isoAt(ddhhmm(stamp, ref), "UTC"), productCode: code, productName: PRODUCT_NAME[code] || code,
    productText: "\n000\n" + t };
}
const listItem = ({ productText, ...meta }) => ({ "@id": `https://api.weather.gov/products/${meta.id}`, ...meta });

/* ── alerts, put together from a product's segment the way the API does ── */
const EVENT = { "BZ.W": "Blizzard Warning", "IS.W": "Ice Storm Warning", "WS.A": "Winter Storm Watch", "WW.Y": "Winter Weather Advisory", "HU.W": "Hurricane Warning", "HU.A": "Hurricane Watch", "TR.W": "Tropical Storm Warning", "TR.A": "Tropical Storm Watch",
  "SS.W": "Storm Surge Warning", "SS.A": "Storm Surge Watch", "FF.A": "Flash Flood Watch", "FA.A": "Flood Watch", "WS.W": "Winter Storm Warning" };
/* the API's usual CAP values for these products; the storm card never reads them */
const CAP = { "HU.W": ["Extreme", "Likely", "Expected"], "SS.W": ["Extreme", "Likely", "Expected"], "TR.W": ["Severe", "Likely", "Expected"],
  "TR.A": ["Severe", "Possible", "Future"], "HU.A": ["Extreme", "Possible", "Future"], "SS.A": ["Extreme", "Possible", "Future"],
  "FF.A": ["Severe", "Possible", "Future"], "FA.A": ["Severe", "Possible", "Future"], "WS.W": ["Moderate", "Likely", "Expected"],
  HLS: ["Moderate", "Likely", "Expected"] };
function expand(ugc) {
  const out = []; let st = null;
  for (const tok of ugc.replace(/\n/g, "").replace(/-\d{6}-$/, "-").split("-").filter(Boolean)) {
    let m = tok.match(/^([A-Z]{2}[ZC])(\d{3})(?:>(\d{3}))?$/);
    if (m) st = m[1]; else m = [null, null, ...(tok.match(/^(\d{3})(?:>(\d{3}))?$/) || []).slice(1)];
    if (!st || !m[2]) continue;
    for (let n = +m[2]; n <= +(m[3] || m[2]); n++) out.push(st + String(n).padStart(3, "0"));
  }
  return out;
}
const strip = (s) => s.split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
function segmentsOf(prod) {
  const body = prod.productText.replace(/^\n000\n/, "");
  return body.split(/\n\$\$\n/).map((seg) => {
    /* the UGC block: zone codes, maybe over several lines, ending in the expiry DDHHMM */
    const m = seg.match(/(?:^|\n)([A-Z]{2}[ZC]\d{3}[\dA-Z>\-]*\n(?:[\dA-Z>]+(?:-[\dA-Z>]+)*-\n)*)/);
    if (!m) return null;
    const ugc = m[1], exp = (ugc.replace(/\n/g, "").match(/-(\d{6})-$/) || [])[1];
    return { ugc: expand(ugc), expires: exp, text: seg.slice(seg.indexOf(ugc) + ugc.length), vtec: [...seg.matchAll(/\/O\.[A-Z]{3}\.[A-Z]{4}\.[A-Z]{2}\.[A-Z]\.\d{4}\.\d{6}T\d{4}Z-\d{6}T\d{4}Z\//g)].map((x) => x[0]) };
  }).filter(Boolean);
}
const office = (prod) => (prod.productText.match(/National Weather Service ([A-Za-z .]+?) {1,2}(?:AL\d{6}|\n)/i) || [])[1]?.replace(/\s+$/, "") || "";
/** the alerts a segmented product (TCV, FFA, WSW) makes for one zone: one per VTEC line */
export function alertsFrom(prod, zone, { hasTcv = false } = {}) {
  const sent = new Date(prod.issuanceTime), awips = prod.productText.split("\n")[3].trim();
  return segmentsOf(prod).filter((s) => s.ugc.includes(zone)).flatMap((s) => {
    const lines = s.text.split("\n"), heads = [], h0 = lines.findIndex((l) => /^\.\.\./.test(l));
    let i = h0;
    while (i >= 0 && i < lines.length && /^\.\.\./.test(lines[i])) {        // the segment's ...HEADLINES..., each maybe two lines
      let h = lines[i]; while (!/\.\.\.\s*$/.test(h) || h.trim() === "...") h += " " + lines[++i].trim();
      heads.push(h.replace(/^\.\.\.|\.\.\.\s*$/g, "").replace(/\s+/g, " ").trim()); i++;
      while (i < lines.length && !lines[i].trim()) i++;
    }
    const area = lines.slice(lines.findIndex((l) => /\S/.test(l) && !/^\//.test(l)), h0).join("\n").split(/\nIncluding the cities|\nINCLUDING THE CITIES/)[0]
      .split("\n").filter((l) => l.trim() && !/^\d{3,4} [AP]M/.test(l)).join(" ").replace(/-\s*/g, "; ").replace(/;\s*$/, "").trim();
    let rest = lines.slice(i).join("\n").replace(/\n&&[\s\S]*$/, "");
    let inst = null;
    const pp = rest.search(/PRECAUTIONARY\/PREPAREDNESS ACTIONS\.\.\./);
    if (pp >= 0) { inst = strip(rest.slice(pp).replace(/^PRECAUTIONARY\/PREPAREDNESS ACTIONS\.\.\.\s*/, "")); rest = rest.slice(0, pp); }
    return s.vtec.map((v) => {
      const [, act, , phen, sig, , begin, end] = v.match(/\/O\.([A-Z]{3})\.([A-Z]{4})\.([A-Z]{2})\.([A-Z])\.(\d{4})\.(\d{6}T\d{4}Z)-(\d{6}T\d{4}Z)\//);
      const key = phen + "." + sig, ev = EVENT[key] || key, endsAt = vtecTime(end), [severity, certainty, urgency] = CAP[key] || ["Unknown", "Unknown", "Unknown"];
      /* the API's onset is the event's start: its VTEC begin, which is ahead of the issue time for a
         warning issued before it starts. Under way (000000T0000Z), the issue time is the latest it can be */
      const beginsAt = vtecTime(begin);
      const head = heads.find((x) => x.toUpperCase().includes(ev.toUpperCase())) || heads[0] || null;
      return { properties: {
        id: `urn:fixture:${awips}.${prod.issuanceTime}.${zone}.${key}`, areaDesc: area,
        affectedZones: s.ugc.map((z) => `https://api.weather.gov/zones/${z[2] === "C" ? "county" : "forecast"}/${z}`),
        sent: isoAt(sent), effective: isoAt(sent), onset: isoAt(beginsAt || sent), expires: s.expires ? isoAt(ddhhmm(s.expires, sent)) : null,
        ends: endsAt && !["HU", "TR", "SS"].includes(phen) ? isoAt(endsAt) : null,
        status: "Actual", messageType: act === "NEW" ? "Alert" : "Update", category: "Met", severity, certainty, urgency, event: ev,
        senderName: "NWS " + office(prod), headline: `${ev} issued by NWS ${office(prod)}`,
        description: strip(rest), instruction: hasTcv ? null : inst, response: sig === "W" ? "Execute" : "Prepare",
        parameters: { AWIPSidentifier: [awips], WMOidentifier: [prod.productText.split("\n")[2].trim()], NWSheadline: head ? [head] : [], VTEC: [v] },
      } };
    });
  });
}
/** an HLS as the API sends it: the alert "Tropical Cyclone Local Statement", no VTEC, no end */
export function hlsAlert(prod) {
  const t = prod.productText.replace(/^\n000\n/, ""), lines = t.split("\n"), awips = lines[1].trim();
  const ugc = lines[2], exp = (ugc.match(/-(\d{6})-$/) || [])[1], sent = new Date(prod.issuanceTime);
  const body = t.slice(t.indexOf("This product covers")).replace(/\n\$\$[\s\S]*$/, "");
  const head = (body.match(/\*\*([\s\S]+?)\*\*/) || [])[1];
  return { properties: {
    id: `urn:fixture:${awips}.${prod.issuanceTime}`, areaDesc: "", affectedZones: expand(ugc).map((z) => `https://api.weather.gov/zones/forecast/${z}`),
    sent: isoAt(sent), effective: isoAt(sent), onset: isoAt(sent), expires: exp ? isoAt(ddhhmm(exp, sent)) : null, ends: null,
    status: "Actual", messageType: "Update", category: "Met", severity: CAP.HLS[0], certainty: CAP.HLS[1], urgency: CAP.HLS[2],
    event: "Tropical Cyclone Local Statement", senderName: "NWS " + office(prod), headline: `Tropical Cyclone Local Statement issued by NWS ${office(prod)}`,
    description: awips + "\n\n" + strip(body), instruction: null, response: "Monitor",
    parameters: { AWIPSidentifier: [awips], WMOidentifier: [lines[0].trim()], NWSheadline: head ? [head.replace(/\s+/g, " ").trim()] : [] },
  } };
}

/* ── the Winter Storm Severity Index, as the map service answers a point ── */
const WSSI_LEVELS = ["WINTER WEATHER AREA", "MINOR", "MODERATE", "MAJOR", "EXTREME"];
/** the real answers: the farm's on October 11 2026 (no results), and a point in Montana under a Major area
    on Day 1; and the same two from layer 4, the three days at once, a shape the page no longer reads */
export const WSSI_REAL = { farm: json("wssi/farm-days-2026-10-11.json"), major: json("wssi/montana-days-2026-10-11.json"),
  layer4: { farm: json("wssi/farm-2026-10-11.json"), major: json("wssi/montana-2026-10-11.json") } };
/** an answer in the identify request's own shape for the cycle issued at `cycle` (a UTC hour): `levels` is
    each day's highest area, Day 1 to Day 3 (null for none), or one level for Day 1 alone. Each day is the
    24 hours from the cycle's own hour, and lists every area up to its level, the way they nest */
export function wssiAnswer(levels, cycle) {
  const c = new Date(cycle), p = (n) => String(n).padStart(2, "0");
  const day = (d) => `${p(d.getUTCHours())}Z ${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${String(d.getUTCFullYear()).slice(2)}`;
  const issue = new Date(+c + 15 * 6e4), issued = `${issue.getUTCFullYear()}-${p(issue.getUTCMonth() + 1)}-${p(issue.getUTCDate())} ${p(issue.getUTCHours())}${p(issue.getUTCMinutes())}Z`;
  const row = WSSI_REAL.major.results[0];
  const results = (Array.isArray(levels) ? levels : [levels]).flatMap((level, i) => {
    if (!level) return [];
    const a = new Date(+c + i * 864e5), b = new Date(+a + 864e5);
    return WSSI_LEVELS.slice(0, WSSI_LEVELS.indexOf(level) + 1).map((impact, k) => ({ ...row, layerId: i + 1, layerName: `Overall_Impact_Day_${i + 1}`,
      attributes: { ...row.attributes, objectid: String(k + 1), impact, valid_time: `${day(a)} - ${day(b)}`, issue_time: issued, start_time: day(a), end_time: day(b), idp_source: `WSSI_OVERALL_Day_${i + 1}` } }));
  });
  return { results };
}

/* ── the scenarios ───────────────────────────────────── */
const steady = (v) => () => v;
const fill = (v) => (p) => p.fill(v);

function florence() {
  const ref = "2018-09-13T15:45:00Z";
  const P = (f) => product("florence/" + f, ref);
  const tcv = P("TCVILM-131455.txt"), hls = P("HLSILM-131508.txt"), ffa = P("FFAILM-131535.txt");
  const tcp = ["TCPAT1-131444.txt", "TCPAT1-131158.txt", "TCPAT3-131437.txt", "TCPAT4-131456-CCA.txt", "TCPAT4-131438.txt", "TCPAT5-131437.txt"].map(P);
  const tcm = ["TCMAT1-131438.txt", "TCMAT3-131436.txt", "TCMAT4-131438.txt", "TCMAT5-131435.txt"].map(P);
  return {
    name: "florence-coast", loc: "mb", when: "2018-09-13T11:45:00-04:00",
    note: "Hurricane Florence a day from landfall at Wrightsville Beach: Hurricane and Storm Surge Warnings on both zones (TCV 57), the Flash Flood Watch, ILM's HLS 57, and Helene, Isaac and Joyce out in the Atlantic",
    expect: { tier: "storm", rules: ["C1", "N2", "N3"], storm: "Florence", category: 2, lead: "wind" },
    o: { baseTemp: 80, nowTemp: 81, feels: 88, rh: 92, isDay: 1, code: 63, cloud: 100, nowWind: 26, nowDir: 55, nowGust: 44, nowUv: 0.8, uvMax: 2,
      windAmp: 14, gustAmp: 30, sunrise: "06:56", sunset: "19:21", nowcast: true, popCurve: steady(90), dailyPop: fill(100) },
    point: [...alertsFrom(tcv, "NCZ107", { hasTcv: true }), ...alertsFrom(ffa, "NCZ107"), hlsAlert(hls)],
    beach: [...alertsFrom(tcv, "NCZ108", { hasTcv: true }), ...alertsFrom(ffa, "NCZ108"), hlsAlert(hls)],
    tcp, tcm,
  };
}
function debby() {
  const ref = "2024-08-07T15:40:00Z";
  const P = (f) => product("debby/" + f, ref);
  const tcv = P("TCVILM-071458.txt"), hls = P("HLSILM-071521.txt"), ffa = P("FFAILM-070145.txt");
  return {
    name: "debby-flood-coast", loc: "mb", when: "2024-08-07T11:40:00-04:00",
    note: "Tropical Storm Debby stalled off South Carolina: the Tropical Storm Warning is on the beach zone only (no NCZ107 segment in TCV 21), the Flood Watch at the house names Tropical Cyclone Debby, and the rain is the worst hazard",
    expect: { tier: "storm", rules: ["C1", "N2", "N3"], storm: "Debby", category: null, lead: "rain" },
    o: { baseTemp: 79, nowTemp: 78, feels: 84, rh: 96, isDay: 1, code: 65, cloud: 100, nowWind: 17, nowDir: 105, nowGust: 33, nowUv: 0.6, uvMax: 2,
      windAmp: 10, gustAmp: 22, sunrise: "06:28", sunset: "20:07", nowcast: true, popCurve: steady(95), dailyPop: fill(95) },
    point: [...alertsFrom(ffa, "NCZ107"), hlsAlert(hls)],
    beach: [...alertsFrom(tcv, "NCZ108", { hasTcv: true }), ...alertsFrom(ffa, "NCZ108"), hlsAlert(hls)],
    tcp: [P("TCPAT4-071455.txt")], tcm: [P("TCMAT4-071454.txt")],
  };
}
function erin() {
  const ref = "2025-08-18T16:30:00Z";
  const P = (f) => product("erin/" + f, ref);
  return {
    name: "quiet-distant", loc: "mb", when: "2025-08-18T12:30:00-04:00",
    note: "Hurricane Erin, a Category 4 about 900 miles out with its forecast track passing 326 miles off at its nearest point, and nothing in effect at the house",
    expect: { tier: null },
    o: { baseTemp: 84, nowTemp: 88, feels: 95, rh: 62, isDay: 1, code: 1, cloud: 20, nowWind: 9, nowDir: 60, nowGust: 15, nowUv: 8.6, uvMax: 9.4,
      windAmp: 8, gustAmp: 12, sunrise: "06:39", sunset: "19:57", popCurve: steady(8), dailyPop: fill(15) },
    point: [], beach: [],
    tcp: [P("TCPAT5-181447.txt"), P("TCPAT5-181520.txt")], tcm: [P("TCMAT5-181447.txt")],
  };
}
function blizzard() {
  /* the January 22 2016 warning for Raleigh and Fayette, 12 to 18 inches, set a year on: January 22
     2027 is a Friday too, so the text's own days still read true. WPC's index has no archive from 2016,
     so its Major here is made up, in the service's own shape: what the Weather Prediction Center would
     have said of RLX's "very heavy snow" is not known */
  const ref = "2027-01-22T18:30:00Z";
  const wsw = product("blizzard/WSWRLX-221749.txt", ref, (t) => t.replace(/\b2016\b/g, "2027").replace(/(\d{6}T\d{4}Z-)16(\d{4}T\d{4}Z)/g, "$127$2"));
  return {
    name: "blizzard-farm", loc: "sp", when: "2027-01-22T13:30:00-05:00",
    note: "RLX's real 12 to 18 inch Winter Storm Warning for Raleigh County (January 22 2016), re-dated to Friday January 22 2027, with a made-up Major from WPC's index: the full card",
    expect: { tier: "storm", rules: ["F3"], storm: null, lead: "snow" }, wssi: wssiAnswer("MAJOR", "2027-01-22T18:00:00Z"),
    o: { baseTemp: 22, nowTemp: 21, feels: 9, rh: 90, isDay: 1, code: 75, cloud: 100, nowWind: 12, nowDir: 40, nowGust: 28, nowUv: 0.4, uvMax: 1.2,
      windAmp: 8, gustAmp: 14, sunrise: "07:36", sunset: "17:39", popCurve: steady(95), dailyPop: fill(90) },
    point: alertsFrom(wsw, "WVZ035"), beach: [], tcp: [], tcm: [],
  };
}
function iceFarm() {
  /* RLX's January 23 2026 warning for Southeast Raleigh, from the winter corpus (tools/storm-corpus.mjs):
     3 to 8 inches of snow and sleet and two tenths to one half of an inch of ice, the Friday evening before
     it began. WPC's index had the farm at Moderate through the whole storm (its 00Z January 24 cycle here:
     the Winter Weather Area, then Moderate on both its other days), so the card stays down and the warning
     is the strip's */
  const e = corpus().find((x) => x.issued === "2026-01-24T03:03:00Z" && x.zone === "WVZ516");
  return {
    name: "ice-farm", loc: "sp", when: "2026-01-23T22:20:00-05:00",
    note: "RLX's real January 23 2026 Winter Storm Warning at the farm, with WPC's index at Moderate there: the strip's, and no card",
    expect: { tier: null }, wssi: wssiAnswer(["WINTER WEATHER AREA", "MODERATE", "MODERATE"], "2026-01-24T00:00:00Z"),
    o: { baseTemp: 27, nowTemp: 27, feels: 19, rh: 80, isDay: 0, code: 3, cloud: 100, nowWind: 7, nowDir: 60, nowGust: 14, nowUv: 0, uvMax: 1.4,
      windAmp: 5, gustAmp: 9, sunrise: "07:30", sunset: "17:36", popCurve: (i) => (i < 8 ? 10 : 90), hourlyCode: (i) => (i < 8 ? 3 : i < 22 ? 67 : 75),
      dailyPop: (p) => { p[0] = 30; p[1] = 100; p[2] = 95; } },
    point: alertsFrom(e.product, "WVZ516"), beach: [], tcp: [], tcm: [],
  };
}
function snowIceFarm() {
  /* RLX's January 5 2025 warning for Southeast Raleigh, from the winter corpus: 4 to 10 inches of snow
     and a tenth to a half inch of ice from noon, issued at 5:24 that morning, with WPC's index at Major
     at the farm on Day 2 of its 06Z cycle (Moderate on Day 1, the Winter Weather Area on Day 3), a day the
     warning is in effect. The card comes up before the warning starts, so its lane starts at noon, NOW
     reads the warning from noon, and the headline says when it starts */
  const e = corpus().find((x) => x.issued === "2025-01-05T10:24:00Z" && x.zone === "WVZ516");
  return {
    name: "snow-ice-farm", loc: "sp", when: "2025-01-05T05:40:00-05:00",
    note: "RLX's real January 5 2025 Winter Storm Warning at the farm, issued ahead of its noon start, with WPC's index at Major there: the full card, titled in the warning's own sentence",
    expect: { tier: "storm", rules: ["F3"], storm: null, lead: "snow" }, wssi: wssiAnswer(["MODERATE", "MAJOR", "WINTER WEATHER AREA"], "2025-01-05T06:00:00Z"),
    o: { baseTemp: 24, nowTemp: 23, feels: 14, rh: 70, isDay: 0, code: 3, cloud: 100, nowWind: 6, nowDir: 120, nowGust: 12, nowUv: 0, uvMax: 1.2,
      windAmp: 5, gustAmp: 9, sunrise: "07:37", sunset: "17:17", popCurve: (i) => (i < 6 ? 10 : 95), hourlyCode: (i) => (i < 6 ? 3 : i < 16 ? 75 : 67),
      dailyPop: (p) => { p[0] = 100; p[1] = 100; p[2] = 40; } },
    point: alertsFrom(e.product, "WVZ516"), beach: [], tcp: [], tcm: [],
  };
}
function longQuoteFarm() {
  /* RLX's February 17 2021 update for Southeast Raleigh, from the winter corpus, whose sentence is the
     corpus's longest at 153 characters: "Additional snow accumulations of 3 to 5 inches, ice accumulations of
     one tenth to three tenths of an inch and sleet accumulations of around half an inch." It will not fit
     three lines at a readable size on a phone, so the title is the warning's own shorter sentence ("Heavy
     mixed precipitation.") and the whole one is said under the chart. WPC's archive does not keep the 00Z
     February 18 cycle (the farm was Moderate the morning before and Minor that afternoon), so its Major
     here is made up, to put the sentence on a card */
  const e = corpus().find((x) => x.issued === "2021-02-18T03:04:00Z" && x.zone === "WVZ516");
  return {
    name: "long-quote-farm", loc: "sp", when: "2021-02-17T22:20:00-05:00",
    note: "RLX's real February 17 2021 Winter Storm Warning update at the farm, the corpus's longest sentence, with a made-up Major from WPC's index: the card, titled by the warning's shorter sentence",
    expect: { tier: "storm", rules: ["F3"], storm: null, lead: "snow" }, wssi: wssiAnswer("MAJOR", "2021-02-18T00:00:00Z"),
    o: { baseTemp: 27, nowTemp: 27, feels: 18, rh: 92, isDay: 0, code: 67, cloud: 100, nowWind: 8, nowDir: 110, nowGust: 16, nowUv: 0, uvMax: 1.6,
      windAmp: 5, gustAmp: 9, sunrise: "07:08", sunset: "18:08", popCurve: (i) => (i < 14 ? 95 : 60), hourlyCode: (i) => (i < 8 ? 67 : i < 14 ? 75 : 71),
      dailyPop: (p) => { p[0] = 100; p[1] = 100; p[2] = 30; } },
    point: alertsFrom(e.product, "WVZ516"), beach: [], tcp: [], tcm: [],
  };
}
/* October 10 2026, as the live API answered it about 4:20 that afternoon */
function isaiasLists() {
  const tcpList = json("isaias/list-TCP.json"), tcmList = json("isaias/list-TCM.json");
  const tcp = ["tcp-b36dca57.json", "tcp-b8d40800.json", "tcp-90c85a93.json"].map((f) => json("isaias/" + f));
  const tcm = [json("isaias/tcm-a33501d3.json")];
  return { tcp, tcm, tcpList, tcmList };
}
function isaiasFarm() {
  return {
    name: "isaias-farm-today", loc: "sp", when: "2026-10-10T16:20:00-04:00",
    note: "Today at the farm: RLX's Wind Advisory names the remnants of Isaias, and WPC's advisory 16 puts the remnant low about 33 miles off on Sunday evening",
    expect: { tier: "named", rules: ["N2", "N3"], storm: "Isaias", category: null },
    o: { baseTemp: 56, nowTemp: 57, feels: 49, rh: 80, isDay: 1, code: 3, cloud: 100, nowWind: 20, nowDir: 106, nowGust: 40, nowUv: 0.5, uvMax: 2,
      windAmp: 10, gustAmp: 28, sunrise: "07:28", sunset: "18:52", popCurve: (i, hr) => (hr >= 16 ? 70 : 40), dailyPop: (p) => { p[0] = 80; p[1] = 90; } },
    point: json("isaias/alerts-point-sp.json").features, beach: [], ...isaiasLists(),
  };
}
function isaiasCoast() {
  return {
    name: "isaias-coast-today", loc: "mb", when: "2026-10-10T16:20:00-04:00",
    note: "Today at the coast: a Flood Watch credited to tropical moisture and a Coastal Flood Advisory, with Isaias 329 miles off at its nearest: no card",
    expect: { tier: null },
    o: { baseTemp: 71, nowTemp: 71, feels: 71, rh: 94, isDay: 1, code: 51, cloud: 100, nowWind: 20, nowDir: 81, nowGust: 40, nowUv: 0.6, uvMax: 2,
      windAmp: 10, gustAmp: 26, sunrise: "07:12", sunset: "18:43", popCurve: steady(70), dailyPop: (p) => { p[0] = 90; p[1] = 85; } },
    point: json("isaias/alerts-point-mb.json").features, beach: json("isaias/alerts-zone-NCZ108.json").features, ...isaiasLists(),
  };
}

export const STORMS = Object.fromEntries([florence(), isaiasFarm(), isaiasCoast(), blizzard(), erin(), debby(), iceFarm(), snowIceFarm(), longQuoteFarm()].map((s) => [s.name, s]));

/* ── what stage() answers ───────────────────────────── */
/** the farm's Winter Storm Severity Index for a scenario: its own answer, else the farm's real empty one */
export const stormWssi = (st) => st?.wssi || WSSI_REAL.farm;
/** the alerts for a request: a zone query is the beach's, anything else the house's */
export const stormAlerts = (st, url) => (/[?&]zone=/.test(url) ? st.beach || [] : st.point || []);
/** a product list, or one product; null is a 404 */
export function stormProducts(st, url) {
  const u = new URL(url), m = u.pathname.match(/\/products\/types\/(TCP|TCM)/);
  if (m) {
    const own = (m[1] === "TCP" ? st.tcp : st.tcm) || [], extra = (m[1] === "TCP" ? st.tcpList : st.tcmList)?.["@graph"] || [];
    const items = [...own.map(listItem), ...extra.filter((x) => !own.some((p) => p.id === x.id))];
    return { "@graph": items.sort((a, b) => Date.parse(b.issuanceTime) - Date.parse(a.issuanceTime)) };
  }
  if (/\/products\/types\//.test(u.pathname)) return { "@graph": [] };
  const id = u.pathname.split("/").pop();
  return [...(st.tcp || []), ...(st.tcm || [])].find((p) => p.id === id) || null;
}

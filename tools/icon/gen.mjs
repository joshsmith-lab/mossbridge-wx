// The home-screen icon's builder: the Mark's half-set sun on the horizon, drawn part by part with
// the Storybook Ink kit (kit.mjs), from one options object. C1 is the polished Mark it grew from;
// C2 swaps the ring of dots for the header's own sun rays; C2_SHIP is what ships (C2 with the
// Mark's plum sky and mirrored wavelets). master() is icon.svg; build.mjs writes it.
//
//   import { build, C2_SHIP, merge } from "./gen.mjs";
//   build(merge(C2_SHIP, { hrays: { op: .8 } }))      // any key; null switches a part off
//
import { readFileSync } from "node:fs";
import { K, mulberry } from "./kit.mjs";
const { inkUnit, inkAt, part, pTaper, pDot, taper, curlT, curlLine, propCloud } = K;
const HERE = new URL(".", import.meta.url).pathname;
const S = 1024, CX = 512;
const f1 = (v) => Math.round(v * 10) / 10;
const stopList = (stops) => stops.map(([t, c, o]) => `<stop offset="${t}" stop-color="${c}"${o != null ? ` stop-opacity="${o}"` : ""}/>`).join("");
const vgrad = (id, stops, y1, y2) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}">${stopList(stops)}</linearGradient>`;
const dataUrl = (src) => (src.startsWith("data:") ? src : readFileSync(src.startsWith("/") ? src : HERE + src, "utf8").trim());

/* ── the base ─────────────────────────────────────────────────────────────────────────────── */
export const C1 = {
  // One ink for every outline: the scene's own line colour at a clear dusk (lineC in renderScene).
  ink: "#2A2130",
  // The horizon, in tile units (the tile is 1024 square, full bleed, no rounded corners).
  hz: 598,
  // Toward the light, screen space. Upper left: the lit rim sits upper left, the crescent and the
  // heavier line lower right. [0, -1] would light it from overhead (rim on top, no crescent).
  light: [-0.75, -1],

  sky: {
    // [t, colour] with t from 0 (top of the tile) to 1 (the horizon). Sampled off the dusk header
    // (tools/shots/06-dusk-porters-neck-hero.png), the top lifted one step so the tile separates
    // from a dark wallpaper.
    stops: [[0, "#3F6080"], [0.3, "#6F6A88"], [0.56, "#A97A8B"], [0.8, "#DC9B7E"], [1, "#F0B283"]],
    // the warm air around the low sun, a radial wash; r is in sun radii
    glow: { r: 2.1, stops: [[0, "#FFE3A0", 0.62], [0.4, "#FFD18A", 0.3], [1, "#FFC98A", 0]] },
    // flat rings of light around the sun, the storybook way to draw a glow: [[dr, colour, opacity]]
    bands: null,
  },

  sun: {
    R: 282,          // radius
    sink: 0,         // how far the centre sits below the horizon
    fill: "#F8C94C",
    line: 24,        // ink width
    heavyK: 0.85,    // the heavier edge: outline nudged away from the light by line * heavyK
    shade: { c: "#E8782C", w: 72, op: 0.62 },  // form-shadow crescent, far from the light
    lit: { c: "#FFF4D2", w: 20, op: 0.88 },    // lit rim, near the light
  },

  // The app's dotted sun path, closed into a ring over the sun. count visible dots, evenly spaced
  // from lift degrees above the horizon on one side to the same on the other (null lift = even
  // spacing, 180 / (count + 1)). gap is from the sun's edge to the dots' centres.
  dots: {
    count: 7, gap: 112, rad: 31, lift: null,
    fill: "#FFEBB8", line: 9.5,
    // the ends are the app's golden-hour dots (#D39A3C on the arc), a step brighter so they read as
    // gold rather than brown on the apricot band; the ink ring is what holds them there
    gold: { ends: 1, fill: "#E8A73E" },
  },

  // Optional parts, off in C1.
  rays: null,    // { n, gap, long, short, w, c, op, span }: unoutlined tapered brush strokes
  cloud: null,   // { x, y, s, seed, top, bot, shade, shadeW, shadeOp, lineK }: a propCloud
  ribbon: null,  // { pts:[[x,y,w]...], curl:[cx,cy,r0,turns,dir,a0,w0,w1], top, bot, shade, shadeW }

  water: {
    // [t, colour], 0 at the horizon to 1 at the foot of the tile: the sky turned over, the way the
    // marsh's water band is drawn (rose at the horizon, the header's slate below), held darker than
    // the header's so the gold reads on it, and lifted at the foot so it separates from a dark wallpaper
    stops: [[0, "#86697F"], [0.12, "#56597A"], [0.5, "#344C67"], [1, "#28415B"]],
    glow: null,  // [rx, ry, colour, opacity]: a soft light on the water under the sun
  },

  // The sun's track on the water: tapered brush bars, shorter and broken the deeper they go.
  // rows: [dy below the horizon, half length, thickness, centre gap (0 = one bar)], mirrored.
  refl: {
    fill: "#F8C94C",
    shade: { c: "#D8702A", op: 0.75, w: 7 },  // the painted underside of each bar
    wobble: 1.5, seed: 11,
    rows: [[16, 290, 26, 0], [62, 226, 22, 22], [108, 170, 19, 0], [152, 118, 16, 20], [194, 70, 12, 0], [234, 32, 9, 0]],
  },

  horizon: { w: 18, lip: null },  // lip: [colour, height, opacity], a lit line on the water side

  // Paper grain: one baked, non-repeating image over sky and water at separate strengths, with
  // the app's paperTex() recipe and no fleck finer than the 180 grid. It lives inside icon.svg;
  // master() below passes it in as a data URL, so the icon never depends on a file beside it.
  grain: { src: null, sky: 0.56, water: 0.4 },

  vignette: null,  // [colour, opacity] at the corners
};

/* ── C2: the header's sun ─────────────────────────────────────────────────────────────────────
   renderScene draws the sun as a sunglow ellipse (radius 38 over a 13px disc), sixteen tapered
   cream rays from 16.2 out, 8.5 long on every multiple of 45 degrees and 4.5 between, 2 wide at
   the base to .2 at the tip, fill #FFF3D2 at .85. Here the same numbers are taken over the icon's
   own radius, so the icon's sun is the header's sun drawn 21.7 times larger.
     hrays.n, r0, long, short, w0, w1   ray count round the full circle; base radius, lengths and
                                        widths in sun radii (the header's numbers over 13)
     hrays.c, op                        cream #FFF3D2, at .95 (the header's .85, a step up so the two
                                        low short rays still read on the apricot band at 58px)
     hrays.horizon                      the two rays that lie on the water line (off: at 1024 they are
                                        slivers along the horizon ink, at 58 they are noise)
     hrays.lenK, shortW, capStart, ink  tried and not used: shorter rays, thinner short rays, a flat
                                        base (reads as cut paper), an ink outline (reads as clip art)
     sky.glow                           the header's own sunglow stops, radius 38/13 of the sun
     sun.gloss                          optional: the header disc's gloss arc. Off: it is beyond the
                                        brief and doubles the kit's lit rim */
export const C2_PATCH = {
  dots: null,
  sky: { glow: { r: 2.923, stops: [[0, "#FFD86E", 0.55], [0.42, "#FFCB55", 0.22], [1, "#FFC94F", 0]] } },
  hrays: { n: 16, r0: 1.246, long: 0.654, short: 0.346, w0: 0.154, w1: 0.015, c: "#FFF3D2", op: 0.95, horizon: false },
};

/* deep merge for patches: objects merge, arrays and scalars replace, null switches a part off */
export function merge(base, patch) {
  if (patch === undefined) return base;
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const out = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(out[k], v);
  return out;
}

export const C2 = merge(C1, C2_PATCH);
/* C2 as shipped: Josh's pick, with two things from the Mark put back, the Mark's plum dusk sky
   (#4A3F6B at the top through #A45C74 to the apricot at the horizon) and its little wavelets,
   now as mirrored pairs */
export const C2_SHIP_PATCH = {
  sky: { stops: [[0, "#4A3F6B"], [0.513, "#A45C74"], [1, "#EC955F"]] },
  waves: { rows: [[128, 716, 80, 1], [168, 826, 64, 0]], c: "#6F8DA6", w: 8, op: 0.6, h: 14 },
};
export const C2_SHIP = merge(C2, C2_SHIP_PATCH);

/* ── the drawing ──────────────────────────────────────────────────────────────────────────── */
export function build(o) {
  const hz = o.hz, sun = o.sun, R = sun.R, cy = hz + (sun.sink || 0), light = o.light, INKC = o.ink;
  let defs = "", body = "";
  defs += vgrad("sky", o.sky.stops, 0, hz);
  defs += `<clipPath id="above"><rect x="0" y="0" width="${S}" height="${hz}"/></clipPath>`;
  defs += `<clipPath id="below"><rect x="0" y="${hz}" width="${S}" height="${S - hz}"/></clipPath>`;

  body += `<rect width="${S}" height="${hz}" fill="url(#sky)"/>`;
  if (o.sky.glow) {
    const g = o.sky.glow;
    defs += `<radialGradient id="glow" cx="${CX}" cy="${cy}" r="${f1(R * g.r)}" gradientUnits="userSpaceOnUse">${stopList(g.stops)}</radialGradient>`;
    body += `<rect width="${S}" height="${hz}" fill="url(#glow)"/>`;
  }
  if (o.sky.bands) for (const [dr, c, a] of o.sky.bands) body += `<circle cx="${CX}" cy="${cy}" r="${R + dr}" fill="${c}" opacity="${a}" clip-path="url(#above)"/>`;

  // rays in the app's manner: unoutlined brush strokes, long and short, symmetric about the centre
  if (o.rays) {
    const { n, gap, long, short, w, c, op = 1, span = 1 } = o.rays;
    let d = "";
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (1 - span) / 2 * Math.PI + (i + 0.5) / n * Math.PI * span;
      const lg = Math.min(i, n - 1 - i) % 2 === 0, r0 = R + gap, r1 = r0 + (lg ? long : short), ww = lg ? w : w * 0.8;
      const cc = Math.cos(a), ss = Math.sin(a);
      d += `<path d="${taper([[CX + cc * r0, cy + ss * r0, ww], [CX + cc * r1, cy + ss * r1, ww * 0.12]], { per: 2, capEnd: false })}"/>`;
    }
    body += `<g fill="${c}" opacity="${op}" clip-path="url(#above)">${d}</g>`;
  }

  // C2: the header's own rays (renderScene, "storybook rays"), scaled by the sun's radius. The
  // header draws 16 around the whole disc, 22.5 degrees apart, long on every multiple of 45 and
  // short between, so the one straight up is long and the fan is symmetric about it. Base and tip
  // widths, the gap and both lengths are the header's numbers over its 13px disc.
  if (o.hrays) {
    const h = o.hrays, n = h.n ?? 16, d0 = [];
    for (let i = 0; i < n; i++) {
      const deg = i / n * 360;                                     // 0 = right, 90 = down, as the header counts
      if (deg > 0.01 && deg < 179.99) continue;                    // below the horizon
      if (!h.horizon && (deg < 0.01 || Math.abs(deg - 180) < 0.01)) continue;  // the two lying on the water line
      const up = deg > 180 ? 360 - deg : deg;                      // elevation above the horizon, 0..180
      const lg = i % 2 === 0, a = deg * Math.PI / 180, c0 = Math.cos(a), s0 = Math.sin(a);
      const L = (lg ? h.long : h.short) * R * (typeof h.lenK === "function" ? h.lenK(up, lg) : (h.lenK ?? 1));
      const r0 = h.r0 * R, w0 = h.w0 * R * (lg ? 1 : (h.shortW ?? 1)), w1 = h.w1 * R;
      d0.push(taper([[CX + c0 * r0, cy + s0 * r0, w0], [CX + c0 * (r0 + L), cy + s0 * (r0 + L), w1]], { per: 2, capEnd: false, capStart: h.capStart ?? true }));
    }
    if (h.ink) body += `<g fill="none" stroke="${INKC}" stroke-width="${h.ink}" stroke-linejoin="round" opacity="${h.inkOp ?? 1}" clip-path="url(#above)">${d0.map((d) => `<path d="${d}"/>`).join("")}</g>`;
    body += `<g fill="${h.c}" opacity="${h.op}" clip-path="url(#above)">${d0.map((d) => `<path d="${d}"/>`).join("")}</g>`;
  }

  // the dotted sun path as a ring of dots, symmetric by construction
  if (o.dots) {
    const d = o.dots, n = d.count, lift = d.lift ?? 180 / (n + 1), rr = R + d.gap;
    let s = "";
    for (let i = 0; i < n; i++) {
      const deg = n === 1 ? 90 : lift + (180 - 2 * lift) * i / (n - 1), a = Math.PI + deg * Math.PI / 180;
      const x = CX + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const gold = d.gold && Math.min(i, n - 1 - i) < d.gold.ends;
      s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${d.rad}" fill="${gold ? d.gold.fill : d.fill}"${d.line ? ` stroke="${INKC}" stroke-width="${gold && d.gold.line ? d.gold.line : d.line}"` : ""}/>`;
    }
    body += s;
  }

  // the sun, painted by the kit: ink line heavier away from the light, a shadow crescent, a lit edge
  const sunPal = { body: sun.fill, ink: INKC, shade: sun.shade.c, lit: sun.lit.c, shadeOp: sun.shade.op, litOp: sun.lit.op };
  body += `<g clip-path="url(#above)">${inkUnit([pDot(CX, cy, R, "body")], sunPal, { s: 1, light, line: sun.line, heavy: sun.line * sun.heavyK, shade: sun.shade.w, lit: sun.lit.w })}</g>`;
  // optional: the header disc's gloss arc (#FFF8E6, 1.6 wide on a radius-9 arc inside the 13px disc)
  if (sun.gloss) {
    const k = R / 13, g = sun.gloss;
    body += `<path d="M ${f1(CX - 7.2 * k)} ${f1(cy - 4.6 * k)} A ${f1(9 * k)} ${f1(9 * k)} 0 0 1 ${f1(CX + 1.3 * k)} ${f1(cy - 9.4 * k)}" fill="none" stroke="${g.c}" stroke-width="${f1(1.6 * k * (g.wK ?? 1))}" stroke-linecap="round" opacity="${g.op}"/>`;
  }

  // a storybook cumulus (the app's propCloud), or a ribbon of cloud that ends in a curl
  const cloudPal = (c) => ({ body: "url(#cloudG)", ink: INKC, shade: c.shade, lit: "#FFF8EC", shadeOp: c.shadeOp ?? 0.45, litOp: c.litOp ?? 0 });
  if (o.cloud) {
    const c = o.cloud;
    defs += `<linearGradient id="cloudG" x1="0" y1="0" x2="0" y2="1">${stopList([[0, c.top], [1, c.bot]])}</linearGradient>`;
    body += inkAt(c.x, c.y, c.s, c.flip || 1, inkUnit(propCloud(c.seed), cloudPal(c), { s: c.s, light: [0, -1], line: sun.line * (c.lineK || 0.9), heavy: sun.line * 0.5, shade: c.shadeW, lit: c.litW || 0 }));
  }
  if (o.ribbon) {
    const c = o.ribbon;
    defs += `<linearGradient id="cloudG" x1="0" y1="0" x2="0" y2="1">${stopList([[0, c.top], [1, c.bot]])}</linearGradient>`;
    const P = [pTaper(c.pts, "body")];
    if (c.curl) P.push(part(curlT(...c.curl), "body"));
    body += inkUnit(P, cloudPal(c), { s: 1, light: [0, -1], line: sun.line * (c.lineK || 0.9), heavy: sun.line * 0.5, shade: c.shadeW, lit: c.litW || 0 });
  }

  // the water, the sky turned over
  defs += vgrad("water", o.water.stops, hz, S);
  body += `<rect x="0" y="${hz}" width="${S}" height="${S - hz}" fill="url(#water)"/>`;
  if (o.water.glow) { const [rx, ry, c, a] = o.water.glow; body += `<ellipse cx="${CX}" cy="${hz}" rx="${rx}" ry="${ry}" fill="${c}" opacity="${a}" clip-path="url(#below)"/>`; }

  // the reflection: brush bars under the sun, each row mirrored about the centre
  if (o.refl) {
    const r = o.refl, P = [], rnd = mulberry(r.seed || 11);
    for (const [dy, half, w, gap = 0] of r.rows) {
      const y = hz + dy, j = (rnd() - 0.5) * 2 * (r.wobble ?? 1.5);
      if (!gap) {
        const prof = [0.3, 0.86, 1, 0.86, 0.3];
        P.push(pTaper(prof.map((k, q) => [CX - half + half * q / 2, y + (q % 2 ? j : -j), w * k]), "refl", { per: 10 }));
      } else {
        const a = CX - half, b = CX - gap / 2, L = b - a, prof = [0.3, 0.82, 1, 0.9, 0.3];
        const left = prof.map((k, q) => [a + L * q / 4, y + (q % 2 ? j : -j), w * k]);
        P.push(pTaper(left, "refl", { per: 10 }));
        P.push(pTaper(left.map(([x, yy, ww]) => [2 * CX - x, yy, ww]).reverse(), "refl", { per: 10 }));
      }
    }
    body += r.shade
      ? inkUnit(P, { refl: r.fill, ink: null, shade: r.shade.c, lit: "#FFF8E0", shadeOp: r.shade.op, litOp: 0 }, { s: 1, light: [0, -1], line: 0, shade: r.shade.w, lit: 0 })
      : `<g fill="${r.fill}">${P.map((q) => `<path d="${q.d}"/>`).join("")}</g>`;
  }

  // the horizon, inked
  // the Mark's wavelets, drawn once on the left and mirrored, so the pair is exactly symmetric;
  // a curl ends the inner tip of any that asks for one
  if (o.waves) {
    const v = o.waves; let W = "";
    for (const [x, y, w, curl] of v.rows) {
      W += `<path d="M ${x} ${y} q ${w / 2} -${v.h} ${w} 0" fill="none" stroke="${v.c}" stroke-width="${v.w}" stroke-linecap="round" opacity="${v.op}"/>`;
      if (curl) W += `<path d="${curlLine(x + w + 12, y - 12, 13, .8, 1, 3.1)}" fill="none" stroke="${v.c}" stroke-width="${v.w * .85}" stroke-linecap="round" opacity="${v.op}"/>`;
    }
    body += W + `<g transform="matrix(-1 0 0 1 ${2 * CX} 0)">${W}</g>`;
  }
  body += `<rect x="0" y="${hz - o.horizon.w / 2}" width="${S}" height="${o.horizon.w}" fill="${INKC}"/>`;
  if (o.horizon.lip) { const [c, h, a = 0.6] = o.horizon.lip; body += `<rect x="0" y="${hz + o.horizon.w / 2}" width="${S}" height="${h}" fill="${c}" opacity="${a}"/>`; }

  // paper grain over everything, embedded so the SVG stands alone
  if (o.grain) {
    const g = o.grain;
    if (g.src && (g.sky || g.water)) {
      defs += `<image id="grainI" href="${dataUrl(g.src)}" x="0" y="0" width="${S}" height="${S}" preserveAspectRatio="none"/>`;
      if (g.sky) body += `<use href="#grainI" opacity="${g.sky}" clip-path="url(#above)"/>`;
      if (g.water) body += `<use href="#grainI" opacity="${g.water}" clip-path="url(#below)"/>`;
    }
  }
  if (o.vignette) {
    defs += `<radialGradient id="vig" cx="512" cy="512" r="724" gradientUnits="userSpaceOnUse"><stop offset=".62" stop-color="${o.vignette[0]}" stop-opacity="0"/><stop offset="1" stop-color="${o.vignette[0]}" stop-opacity="${o.vignette[1]}"/></radialGradient>`;
    body += `<rect width="${S}" height="${S}" fill="url(#vig)"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><defs>${defs}</defs>${body}</svg>`;
}

/* The master as it ships: C2_SHIP with the grain from icon.svg, every <use> inside a <mask> written
   out in full. macOS CoreSVG (Preview, sips, Xcode assets) draws a mask made of <use> as empty,
   which dropped the sun's lit rim and crescent there; Chrome draws it the same either way. */
export function master(grain) {
  const svg = build(merge(C2_SHIP, { grain: { src: grain } }));
  const out = svg.replace(/<mask\b[^>]*>[\s\S]*?<\/mask>/g, (mask) =>
    mask.replace(/<use href="#([\w-]+)"([^>]*)\/>/g, (_, id, attrs) => {
      const m = svg.match(new RegExp(`<g id="${id}">([\\s\\S]*?)</g>`));
      if (!m) throw new Error(`mask uses #${id}, which is not a plain group`);
      return `<g${attrs}>${m[1]}</g>`;
    }));
  if (/<mask\b[^>]*>(?:(?!<\/mask>)[\s\S])*<use/.test(out)) throw new Error("a mask still uses <use>");
  return out;
}

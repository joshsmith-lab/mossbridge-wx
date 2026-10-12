/**
 * Loading-screen mockups for Porch Weather. Nothing here changes the app.
 *
 * index.html is served as it is. Each direction is painted in the page after
 * the real loading shell, only for these screenshots. A cold open with the
 * forecast held back is the screen the family sees for that half second.
 *
 *   TZ=America/New_York node tools/load-mockups.mjs
 *
 * Measured on a mild October afternoon at Porters Neck, with motion reduced:
 * the line stays at 155px and the header moves about 3px (465 to 463).
 * Opacity only, no translation. Reduced motion swaps in one frame.
 *
 *   sky   The whole phone is the hour's own sky, one gradient, no shore and
 *         no empty charts. "Reading the sky…" stays in the real headline slot
 *         and the disc sits on the scene's own arc, so neither moves when the
 *         reading arrives. The lower sky fades to paper as the page fades in.
 *         Clouds, when the forecast has them, ease through the sky's existing
 *         colour transition.
 *   card  A still mark and the line, centred on the hour's paper. The shell
 *         is already laid out underneath at opacity 0, scene included, so the
 *         card fades away and the page fades up in the same places.
 *   fade  The header is the loaded header's height: the hour's sky, the line
 *         in its slot, a still horizon where the scene will be. The number is
 *         reserved and invisible. Everything under the header is the paper,
 *         titles included, and fades in once the charts are drawn.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, forecast, marine, coops, erddap, LOC_TZ } from "./fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tools", "load-mockups");
const PORT = Number(process.env.PORCH_PORT || 8731);
const HTML = readFileSync(path.join(ROOT, "index.html"), "utf8");
const MOON_KIND = HTML.match(/const HALLOWEEN_MOON="(\w+)"/)?.[1] || null;

const O = {
  baseTemp: 70, nowTemp: 72, feels: 72, rh: 58, isDay: 1, code: 1, cloud: 12,
  nowWind: 5, nowDir: 210, nowGust: 9, nowUv: 3.2, uvMax: 4.4,
  windAmp: 5, gustAmp: 8, popCurve: () => 4, waterTemp: 72,
};

const CASES = [
  { name: "current-day-porters-neck", dir: "current", loc: "mb", when: "2026-10-12T13:10:00", handoff: true },
  { name: "current-night-porters-neck", dir: "current", loc: "mb", when: "2026-10-12T21:40:00" },
  { name: "current-day-shady-spring", dir: "current", loc: "sp", when: "2026-10-12T13:10:00" },
  { name: "sky-day-porters-neck", dir: "sky", loc: "mb", when: "2026-10-12T13:10:00", handoff: true },
  { name: "sky-dusk-porters-neck", dir: "sky", loc: "mb", when: "2026-10-12T18:15:00" },
  { name: "sky-night-porters-neck", dir: "sky", loc: "mb", when: "2026-10-12T21:40:00" },
  { name: "sky-day-shady-spring", dir: "sky", loc: "sp", when: "2026-10-12T13:10:00" },
  { name: "sky-night-shady-spring", dir: "sky", loc: "sp", when: "2026-10-12T21:40:00" },
  { name: "card-day-porters-neck", dir: "card", loc: "mb", when: "2026-10-12T13:10:00", handoff: true },
  { name: "card-night-porters-neck", dir: "card", loc: "mb", when: "2026-10-12T21:40:00" },
  { name: "card-day-shady-spring", dir: "card", loc: "sp", when: "2026-10-12T13:10:00" },
  { name: "fade-day-porters-neck", dir: "fade", loc: "mb", when: "2026-10-12T13:10:00", handoff: true },
  { name: "fade-dusk-porters-neck", dir: "fade", loc: "mb", when: "2026-10-12T18:15:00" },
  { name: "fade-night-porters-neck", dir: "fade", loc: "mb", when: "2026-10-12T21:40:00" },
  { name: "fade-day-shady-spring", dir: "fade", loc: "sp", when: "2026-10-12T13:10:00" },
  { name: "fade-night-shady-spring", dir: "fade", loc: "sp", when: "2026-10-12T21:40:00" },
];

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  ({ chromium } = await import("/tmp/pw/node_modules/playwright/index.mjs"));
}

/** Paint one direction onto the real loading shell. Returns geometry for the handoff check. */
function applyDirection({ dir, moonKind }) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => "#" + [0, 1, 2].map((i) => {
    const A = hex(a), B = hex(b);
    return Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0");
  }).join("");
  const lum = (h) => {
    const c = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const blend = (alt) => { const t = clamp((alt + 3) / 9, 0, 1); return t * t * (3 - 2 * t); };
  const pad = (n) => String(n).padStart(2, "0");

  const ridge = !document.getElementById("moonSection").hidden;
  const now = new Date();
  const sp = sunPos(now);
  const alt = sp.alt * 180 / Math.PI;
  const stops = skyStops(alt, 0, false, false);
  const dark = alt < -3;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.documentElement.classList.add("load-mock", "load-" + dir);
  const root = document.documentElement.style;
  root.setProperty("--sky1", stops[0]);
  root.setProperty("--sky2", stops[1]);
  root.setProperty("--sky3", stops[2]);
  const field = mix(stops[0], stops[1], 0.55);
  const INK_ON = "#0B2530", LIT_ON = "#F7F4EA";
  const cInk = contrast(INK_ON, field), cLit = contrast(LIT_ON, field);
  const bright = cInk >= cLit;
  root.setProperty("--on-sky", bright ? INK_ON : LIT_ON);
  root.setProperty("--off-sky", bright ? LIT_ON : INK_ON);
  const need = clamp((4.6 - Math.max(cInk, cLit)) / 3.4, 0, 1);
  root.setProperty("--scrim", bright ? `rgba(255,255,255,${(need * 0.42).toFixed(3)})` : `rgba(4,16,22,${(0.1 + need * 0.34).toFixed(3)})`);
  goldenHour(alt, now, dark, root);
  if (!dark) {
    const day = daylightPaper(stops, ridge ? "ridge" : "marsh");
    const k = blend(alt);
    const base = { paper: "#FAFAF6", wash: "#EFF2ED", line: "#E3E7E1" };
    for (const key of ["paper", "wash", "line"]) root.setProperty("--" + key, mix(base[key], day[key], k));
  }
  document.getElementById("themeColor").setAttribute("content", stops[0]);

  const style = document.createElement("style");
  style.id = "load-mock-style";
  style.textContent = `
    html.load-mock .app > * { animation: none !important; }
    html.load-mock .live-dot, html.load-mock .live-dot::after { animation: none !important; opacity: .7; }
    html.load-mock .skel { animation: none !important; background: transparent !important; }
    /* one gradient for the whole phone; the header's own gradient would end
       mid-screen and leave a seam where the page continues */
    html.load-sky, html.load-sky body {
      background: linear-gradient(180deg, var(--sky1) 0%, var(--sky2) 38%, var(--sky3) 100%);
    }
    html.load-sky .sky { background: transparent; }
    html.load-sky .app > :not(header), html.load-fade .app > :not(header) { opacity: 0; }
    html.load-card .sky { background: transparent; color: var(--ink); }
    html.load-card .sky::before { display: none; }
    html.load-card .now, html.load-card #verdict, html.load-card .scene,
    html.load-card .chips, html.load-card .app > :not(header) { opacity: 0; }
    /* the mark, not the html element: html also carries the class load-card */
    .load-mark { position: fixed; left: 50%; top: 46%; transform: translate(-50%, -50%);
      z-index: 6; text-align: center; width: min(280px, 78vw); pointer-events: none; }
    .load-mark .verdict { margin: 16px 0 0; color: var(--ink); }
    .load-mark svg { display: block; margin: 0 auto; overflow: visible; }
    @media (prefers-reduced-motion: reduce) {
      html.load-mock .load-mark { transition: none !important; }
    }`;
  document.head.appendChild(style);

  document.querySelector(".now").style.visibility = "hidden";
  /* the feels line is a dash until the reading, and it leaves on a mild day, so
     reserving it shoves the scene down when the page arrives. One chip row is
     the usual wind chip, reserved so that row does not push the horizon. */
  document.getElementById("feelsRow").hidden = true;
  document.getElementById("chips").style.minHeight = "26px";
  document.getElementById("stamp").textContent = "";
  document.getElementById("refreshBtn").classList.remove("spin");
  for (const id of ["tideNote", "hourlyNote", "weekNote", "moonNote", "yearNote"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  }
  document.getElementById("uvLead").textContent = "";
  document.getElementById("eveLead").textContent = "";
  document.getElementById("moonTxt").textContent = "";
  document.querySelectorAll(".skel").forEach((el) => el.classList.remove("skel"));

  const aw = clamp(document.querySelector(".app").clientWidth || 760, 320, 760);
  const W = Math.max(320, aw / 1.22);
  const H = Math.round((ridge ? 168 : 150) + (760 - W) * 0.1);
  const GY = H - 30, arcTop = 24, arcSpan = W - 60;
  const px = (f) => 30 + f * arcSpan;
  const py = (f) => GY - Math.sin(Math.PI * f) * (GY - arcTop);
  const svg = document.getElementById("sceneSvg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const ch = Math.round(165 + (760 - (aw - 40)) * 0.09);
  const setBox = (id, h) => document.getElementById(id).setAttribute("viewBox", `0 0 ${aw - 40} ${h}`);
  setBox("hourlySvg", ch - 18);
  setBox("tideSvg", ch);
  setBox("moonSvg", ch + 16);
  setBox("yearSvg", 138 + 34 + (ridge ? 46 : 0));

  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let prev = sunPos(t0).alt, prevT = t0, rise = null, set = null;
  for (let m = 2; m <= 22 * 60; m += 2) {
    const t = new Date(t0.getTime() + m * 60000);
    const a = sunPos(t).alt;
    if (rise == null && prev < 0 && a >= 0) rise = new Date(prevT.getTime() + ((0 - prev) / (a - prev)) * (t - prevT));
    if (rise && set == null && prev >= 0 && a < 0) set = new Date(prevT.getTime() + ((0 - prev) / (a - prev)) * (t - prevT));
    prev = a; prevT = t;
  }
  const up = rise && set && now >= rise && now < set;
  const dayFrac = up ? (now - rise) / (set - rise) : 0;
  const lineC = dark ? "#C9D4DC" : "#2A2130";
  const shore = ridge
    ? (dark ? mix(stops[2], "#101820", 0.62) : mix(stops[1], "#6E7C68", 0.5))
    : (dark ? mix(stops[2], "#07141C", 0.58) : mix(stops[2], "#3E5C6C", 0.42));
  const shoreDeep = mix(shore, dark ? "#050C12" : "#1C303C", ridge ? 0.18 : 0.28);

  let body = "";
  if (up) {
    const f = clamp(dayFrac, 0, 1), x = px(f), y = py(f);
    const squash = clamp(0.9 + Math.max(0, alt) / 8 * 0.1, 0.9, 1);
    const warm = clamp((8 - alt) / 12, 0, 1);
    const disc = mix(mix(squash < 0.94 ? "#F0A03C" : "#F5C94D", "#E8752A", warm * 0.5), "#C8CFCE", 0);
    const cc = `cx="${x.toFixed(1)}" cy="${y.toFixed(1)}"`;
    let rays = "";
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, L = i % 2 ? 4.5 : 8.5, c0 = Math.cos(a), s0 = Math.sin(a) * squash;
      rays += `<path d="${taper([[x + c0 * 16.2, y + s0 * 16.2, 2], [x + c0 * (16.2 + L), y + s0 * (16.2 + L), 0.2]], { per: 2, capEnd: false })}"/>`;
    }
    body = `<ellipse ${cc} rx="38" ry="${(38 * squash).toFixed(0)}" fill="url(#sunglow)"/>
      <g fill="#FFF3D2" opacity=".85">${rays}</g>
      <ellipse ${cc} rx="13" ry="${(13 * squash).toFixed(2)}" fill="${disc}"/>
      <ellipse ${cc} rx="13" ry="${(13 * squash).toFixed(2)}" fill="none" stroke="${lineC}" stroke-width="1.1" opacity=".8"/>
      <path d="M ${(x - 7.2).toFixed(1)} ${(y - 4.6 * squash).toFixed(1)} A 9 ${(9 * squash).toFixed(1)} 0 0 1 ${(x + 1.3).toFixed(1)} ${(y - 9.4 * squash).toFixed(1)}" fill="none" stroke="#FFF8E6" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`;
  }
  const mp = moonPos(now);
  const moonUp = mp.alt > -0.05 && (!up || mp.alt > 0.21);
  if (moonUp) {
    const az = ((mp.az * 180) / Math.PI + 180 + 360) % 360;
    const f = clamp((az - 60) / 240, 0.02, 0.98);
    const x = px(f), y = GY - Math.sin(clamp(mp.alt, 0, Math.PI / 2)) * (GY - arcTop) * 1.05;
    const mph = moonPhase(now);
    const oct = now.getMonth() === 9;
    const hm = oct && moonKind ? halloweenMoon(moonKind, { altDeg: (mp.alt * 180) / Math.PI, sunAltDeg: alt, up, skyAlt: ridge ? 22 : 0 }) : null;
    const r = hm ? hm.r : 11;
    const ill = clamp(mph.fraction, 0, 1), waxing = mph.phase < 0.5;
    const k = (1 - 2 * ill) * r;
    const sweep = waxing ? (ill > 0.5 ? 0 : 1) : (ill > 0.5 ? 1 : 0);
    const term = `M ${x} ${y - r} A ${Math.max(0.01, Math.abs(k)).toFixed(2)} ${r} 0 0 ${sweep} ${x} ${y + r} A ${r} ${r} 0 0 ${waxing ? 0 : 1} ${x} ${y - r} Z`;
    const face = hm ? hm.lit : "#F4EFE0";
    const edge = hm ? hm.edge : "#FFF8E6";
    const glow = hm ? hm.glow[0] : "#E4EEF8";
    body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 2.6).toFixed(1)}" fill="${glow}" opacity="${hm ? 0.28 : 0.18}"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${hm ? hm.unlit : "#243848"}" opacity="${hm ? hm.unlitOp : 0.45}"/>
      <path d="${term}" fill="${face}"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="none" stroke="${edge}" stroke-width="1.15" opacity=".85"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 0.6).toFixed(2)}" fill="none" stroke="${lineC}" stroke-width="1.15"/>`;
  }

  /* sky stays open to the bottom of the phone. fade keeps a still horizon
     where the scene's ground will be, so the header already has its height. */
  const ground = dir === "sky" ? "" : ridge
    ? `<path d="M 0 ${(GY + 6).toFixed(1)} Q ${(W * 0.22).toFixed(1)} ${(GY - 16).toFixed(1)} ${(W * 0.46).toFixed(1)} ${(GY + 2).toFixed(1)} T ${W} ${(GY - 8).toFixed(1)} V ${H} H 0 Z" fill="${shore}"/>
       <path d="M 0 ${(GY + 4).toFixed(1)} Q ${(W * 0.3).toFixed(1)} ${(GY - 6).toFixed(1)} ${(W * 0.62).toFixed(1)} ${(GY + 8).toFixed(1)} T ${W} ${(GY + 1).toFixed(1)}" fill="none" stroke="${mix(shore, "#F4F0E4", 0.35)}" stroke-width="1.1" opacity=".7"/>`
    : `<rect x="0" y="${GY}" width="${W}" height="${H - GY}" fill="${shore}"/>
       <path d="M 0 ${GY} H ${W}" stroke="${mix("#F7F4EA", stops[2], dark ? 0.15 : 0.55)}" stroke-width="1.15" opacity=".8"/>
       <path d="M ${(W * 0.22).toFixed(1)} ${(GY + 8).toFixed(1)} q 4 -2.2 8 0 M ${(W * 0.58).toFixed(1)} ${(GY + 12).toFixed(1)} q 3.2 -1.8 6.4 0" fill="none" stroke="${mix("#F7F4EA", shore, 0.35)}" stroke-width="1.05" stroke-linecap="round" opacity=".55"/>`;

  let stars = "";
  const nightK = clamp((-alt - 2) / 8, 0, 1);
  if (nightK > 0.02) {
    stars = starField().map((s) => {
      const o = (s.o * nightK).toFixed(2);
      return `<circle cx="${s.x}%" cy="${(s.y * 0.62).toFixed(2)}%" r="${s.s.toFixed(2)}" fill="#FFF6E2" opacity="${o}"/>`;
    }).join("");
  }
  document.getElementById("skyFx").innerHTML = nightK > 0.02
    ? `<svg preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${stars}</svg>` : "";
  if (dir === "sky" && nightK > 0.02) {
    const field = document.createElement("div");
    field.className = "load-stars";
    field.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none";
    const wide = starField().map((s) => {
      const o = (s.o * nightK).toFixed(2);
      return `<circle cx="${s.x.toFixed(2)}%" cy="${(s.y * 1.15).toFixed(2)}%" r="${s.s.toFixed(2)}" fill="#FFF6E2" opacity="${o}"/>`;
    }).join("");
    field.innerHTML = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${wide}</svg>`;
    document.body.appendChild(field);
  }

  const golden = alt > -4.5 && alt < 6.5;
  svg.innerHTML = `<defs>
      <radialGradient id="sunglow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#FFD86E" stop-opacity="${golden ? 0.7 : 0.5}"/>
        <stop offset="1" stop-color="#FFD86E" stop-opacity="0"/>
      </radialGradient></defs>${body}${ground}`;

  if (dir === "card") {
    const card = document.createElement("div");
    card.className = "load-mark";
    const mark = up ? cardSun(lineC, mix) : cardMoon(now, alt, ridge, moonKind, lineC);
    card.innerHTML = `${mark}<p class="verdict">Reading the sky…</p>`;
    document.body.appendChild(card);
  }

  const verdict = document.getElementById("verdict").getBoundingClientRect();
  const skyBox = document.getElementById("sky").getBoundingClientRect();
  const sceneBox = document.querySelector(".scene").getBoundingClientRect();
  const hhmm = (d) => d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : null;
  return {
    alt: +alt.toFixed(2),
    dark,
    rise: hhmm(rise),
    set: hhmm(set),
    verdictTop: +verdict.top.toFixed(1),
    skyH: +skyBox.height.toFixed(1),
    sceneH: +sceneBox.height.toFixed(1),
    sceneW: +sceneBox.width.toFixed(1),
    skyW: +skyBox.width.toFixed(1),
    view: svg.getAttribute("viewBox"),
    words: document.getElementById("verdict").textContent,
    anim: document.getAnimations().filter((a) => a.playState === "running").length,
  };

  function cardSun(ink) {
    return `<svg width="92" height="78" viewBox="0 0 92 78" aria-hidden="true">
      <ellipse cx="46" cy="48" rx="30" ry="20" fill="#FFD86E" opacity=".28"/>
      <g fill="#FFF3D2" opacity=".9">
        <path d="M46 18 l2.1 9.2 l-2.1 -2.4 l-2.1 2.4 Z"/>
        <path d="M68 26 l-6.2 7.2 l1.6 -3.2 l-4.4 -.2 Z"/>
        <path d="M24 26 l6.2 7.2 l-1.6 -3.2 l4.4 -.2 Z"/>
        <path d="M76 44 l-9.4 1.4 l2.6 -2.2 l.4 -4.6 Z"/>
        <path d="M16 44 l9.4 1.4 l-2.6 -2.2 l-.4 -4.6 Z"/>
      </g>
      <clipPath id="halfsun"><rect x="0" y="0" width="92" height="48"/></clipPath>
      <g clip-path="url(#halfsun)">
        <circle cx="46" cy="48" r="16" fill="#F5C94D"/>
        <circle cx="46" cy="48" r="16" fill="none" stroke="${ink}" stroke-width="1.5"/>
        <path d="M 34 42 A 11 11 0 0 1 48 34" fill="none" stroke="#FFF8E6" stroke-width="1.7" stroke-linecap="round"/>
      </g>
      <path d="M 12 48 H 80" stroke="${ink}" stroke-width="1.35" stroke-linecap="round" opacity=".72"/>
      <path d="M 38 54 h 16" stroke="#E8B02F" stroke-width="2.1" stroke-linecap="round" opacity=".55"/>
      <path d="M 42 59 h 8" stroke="#E8B02F" stroke-width="1.5" stroke-linecap="round" opacity=".35"/>
    </svg>`;
  }
  function cardMoon(now, alt, ridge, moonKind, ink) {
    const mp = moonPos(now), mph = moonPhase(now);
    const oct = now.getMonth() === 9;
    const hm = oct && moonKind ? halloweenMoon(moonKind, { altDeg: (mp.alt * 180) / Math.PI, sunAltDeg: alt, up: false, skyAlt: ridge ? 22 : 0 }) : null;
    const face = hm ? hm.lit : "#F4EFE0";
    const unlit = hm ? hm.unlit : "#243848";
    const edge = hm ? hm.edge : "#FFF8E6";
    const glow = hm ? hm.glow[0] : "#E4EEF8";
    const r = 16, x = 46, y = 36;
    const ill = clamp(mph.fraction, 0, 1), waxing = mph.phase < 0.5;
    const k = (1 - 2 * ill) * r;
    const sweep = waxing ? (ill > 0.5 ? 0 : 1) : (ill > 0.5 ? 1 : 0);
    const term = `M ${x} ${y - r} A ${Math.max(0.01, Math.abs(k)).toFixed(2)} ${r} 0 0 ${sweep} ${x} ${y + r} A ${r} ${r} 0 0 ${waxing ? 0 : 1} ${x} ${y - r} Z`;
    return `<svg width="92" height="78" viewBox="0 0 92 78" aria-hidden="true">
      <circle cx="${x}" cy="${y}" r="28" fill="${glow}" opacity=".22"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="${unlit}" opacity="${hm ? 0.85 : 0.55}"/>
      <path d="${term}" fill="${face}"/>
      <circle cx="${x}" cy="${y}" r="${r + 0.4}" fill="none" stroke="${ink}" stroke-width="1.35"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${edge}" stroke-width="1.1" opacity=".8"/>
      <path d="M 14 62 H 78" stroke="${ink}" stroke-width="1.25" stroke-linecap="round" opacity=".45"/>
    </svg>`;
  }
}

mkdirSync(OUT, { recursive: true });
const server = await serve(PORT, "");
const browser = await chromium.launch(process.env.PORCH_CHROME_PATH
  ? { executablePath: process.env.PORCH_CHROME_PATH }
  : { executablePath: "/usr/bin/google-chrome", args: ["--disable-dev-shm-usage"] });

const notes = [];
for (const cs of CASES) {
  if (process.env.ONLY && !process.env.ONLY.split(",").includes(cs.name)) continue;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    timezoneId: "America/New_York",
    reducedMotion: cs.dir === "current" ? "no-preference" : "reduce",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.log("  pageerror", cs.name, err.stack || err.message));
  const when = new Date(cs.when);
  await page.addInitScript((cfg) => {
    try { localStorage.clear(); localStorage.setItem("mbwx-loc", cfg.id); } catch {}
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {});
    const off = cfg.t - Date.now(), RD = Date;
    const F = function (...a) { return a.length ? new RD(...a) : new RD(RD.now() + off); };
    F.now = () => RD.now() + off; F.parse = RD.parse; F.UTC = RD.UTC; F.prototype = RD.prototype;
    window.Date = F;
  }, { id: cs.loc, t: when.getTime() });

  let release;
  const gate = new Promise((r) => { release = r; });
  const tz = LOC_TZ[cs.loc];
  const answer = (url) => {
    if (/api\.open-meteo\.com/.test(url)) return forecast(when, O, tz, cs.loc);
    if (/marine-api/.test(url)) return marine(when, O, tz);
    if (/tidesandcurrents/.test(url)) return coops(url, when, O, 0);
    if (/erddap/.test(url)) return erddap(when, O);
    if (/alerts/.test(url)) return { features: [] };
    if (/products/.test(url)) return { "@graph": [] };
    return { features: [] };
  };
  await page.route(/open-meteo\.com|weather\.gov|tidesandcurrents|erddap|mapservices/, async (route) => {
    await gate;
    const url = route.request().url();
    if (/erddap/.test(url) && !answer(url)) return route.fulfill({ status: 404, body: "none" });
    return route.fulfill({ json: answer(url) });
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  if (cs.dir === "current") await page.waitForTimeout(700);
  const painted = cs.dir === "current" ? null : await page.evaluate(applyDirection, { dir: cs.dir, moonKind: MOON_KIND });

  const before = cs.dir === "current" ? null : await page.evaluate(() => {
    const v = document.getElementById("verdict").getBoundingClientRect();
    const s = document.getElementById("sky").getBoundingClientRect();
    return { verdictTop: +v.top.toFixed(1), skyH: +s.height.toFixed(1) };
  });
  const info = cs.dir === "current"
    ? await page.evaluate(() => ({
      words: document.getElementById("verdict").textContent,
      stamp: document.getElementById("stamp").textContent,
      temp: document.getElementById("bigTemp").innerText.replace(/\s+/g, " "),
      cond: document.getElementById("condLabel").innerText,
      tide: document.getElementById("tideNote")?.textContent || "",
      moon: !document.getElementById("moonSection").hidden,
      theme: document.documentElement.getAttribute("data-theme"),
      sky: getComputedStyle(document.documentElement).getPropertyValue("--sky1").trim(),
    }))
    : await page.evaluate(() => ({
      words: document.getElementById("verdict").textContent,
      theme: document.documentElement.getAttribute("data-theme"),
      sky1: getComputedStyle(document.documentElement).getPropertyValue("--sky1").trim(),
      anim: document.getAnimations().filter((a) => a.playState === "running" && !/shimmer|ping|rise/.test(a.animationName || "")).length,
    }));

  const file = path.join(OUT, cs.name + ".png");
  await page.screenshot({ path: file, fullPage: false });
  console.log(cs.name, JSON.stringify(painted ? { ...info, alt: painted.alt, sceneH: painted.sceneH, sceneW: painted.sceneW, skyW: painted.skyW, skyH: painted.skyH } : info));

  if (cs.handoff && cs.dir !== "current") {
  try {
    const marks = await page.evaluate(() => {
      const pad = (n) => String(n).padStart(2, "0");
      const now = new Date();
      const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let prev = sunPos(t0).alt, prevT = t0, rise = null, set = null;
      for (let m = 2; m <= 22 * 60; m += 2) {
        const t = new Date(t0.getTime() + m * 60000);
        const a = sunPos(t).alt;
        if (rise == null && prev < 0 && a >= 0) rise = new Date(prevT.getTime() + ((0 - prev) / (a - prev)) * (t - prevT));
        if (rise && set == null && prev >= 0 && a < 0) set = new Date(prevT.getTime() + ((0 - prev) / (a - prev)) * (t - prevT));
        prev = a; prevT = t;
      }
      const hh = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      return { rise: hh(rise), set: hh(set) };
    });
    O.sunrise = marks.rise; O.sunset = marks.set;
    O.isDay = 1;
    release();
    await page.waitForFunction(() => {
      const v = document.getElementById("verdict")?.textContent || "";
      return v.length > 0 && !v.startsWith("Reading the sky");
    }, null, { timeout: 8000 }).catch((e) => console.log("  handoff wait:", e.message));
    await page.evaluate(() => typeof PAINT !== "undefined" && PAINT).catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll(".load-mark,.load-stars,#load-mock-style").forEach((n) => n.remove());
      document.documentElement.classList.remove("load-mock", "load-sky", "load-card", "load-fade");
      document.querySelectorAll(".app > *").forEach((el) => { el.style.opacity = ""; });
      const now = document.querySelector(".now");
      if (now) now.style.visibility = "";
      const chips = document.getElementById("chips");
      if (chips) chips.style.minHeight = "";
    }).catch((e) => console.log("  handoff clear:", e.message));
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => {
      const v = document.getElementById("verdict").getBoundingClientRect();
      const s = document.getElementById("sky").getBoundingClientRect();
      return {
        verdictTop: +v.top.toFixed(1),
        skyH: +s.height.toFixed(1),
        words: document.getElementById("verdict").textContent,
      };
    });
    const dTop = +(after.verdictTop - before.verdictTop).toFixed(1);
    const dSky = +(after.skyH - before.skyH).toFixed(1);
    notes.push(`${cs.name}: headline ${before.verdictTop}px → ${after.verdictTop}px (${dTop >= 0 ? "+" : ""}${dTop}), header ${before.skyH}px → ${after.skyH}px (${dSky >= 0 ? "+" : ""}${dSky}). Loaded line: ${after.words}`);
    console.log("  handoff", notes[notes.length - 1]);
  } catch (e) {
    console.log("  handoff failed", e.message);
  }
  } else {
    release();
  }
  await ctx.close();
}

console.log("\nHANDOFF");
for (const n of notes) console.log(n);
await browser.close();
server.close();

/* ── Beaufort: the two wind instruments on the dock ──────────────────────────────────
   Jen's family flies, so they always check the wind, and the dock says it twice: an airfield's
   windsock (the aviation nod) and the South Carolina flag (the palmetto and the crescent).
   Both read the same wind, so they always agree with each other and with the scene.

   Both are drawn at ten drawing units to the scene unit (BFT_FLAG_U), the way the faces in the
   oak and the loft are, so the kit's tenth-of-a-unit rounding cannot step a horn of the crescent
   or a palmetto frond. Place them with inkAt(x, y, .1 * k, 1, inkRig(rig, pal, {...BFT_FLAG_INK,
   s: .1 * k * pxPerUnit, light})), k being the scale the dock is drawn at (1 in scene units). The
   sock takes knots and the flag mph: hand both the same sustained wind (bftFlagKnots converts).
   y=0 is the foot of the pole or the staff, on the deck. dir +1 blows toward +x, -1 toward -x:
   the geometry is mirrored, not flipped, so the light still comes from where the sun really is.

   The windsock is the striped airfield sock pilots read: a cone of five bands, orange at the mouth
   and the tail, on a swivel frame with a rigid hoop at the mouth. Each band is about three knots:
   the mouth fills first and the tail last, and at fifteen knots the whole sock stands straight out
   (the FAA's AC 150/5345-27 asks a sock to stand fully out at fifteen).
   In a calm it falls from the hoop. The flag flies on the same scale, so a sock standing level
   is a flag flying level, and a sock hanging limp is a flag hanging down the staff. */
const BFT_FLAG_U = 10;
const bftFlagClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const bftFlagSmooth = (t) => { t = bftFlagClamp(t, 0, 1); return t * t * (3 - 2 * t); };
const bftFlagMix = (a, b, t) => a + (b - a) * t;
const bftFlagR2 = (v) => Math.round(v * 100) / 100;
/* scene units to drawing units, widths and all */
const bftFlagPts = (pts) => pts.map((p) => p.map((v) => v * BFT_FLAG_U));
/* a closed outline from runs of points: each run a smooth curve, runs meeting at corners */
const bftFlagRuns = (runs) => runs.filter((r) => r.length > 1).map((pts, i) => {
  const d = inkSpline(bftFlagPts(pts));
  return i ? d.replace(/^M [^C]*/, "") : d;
}).join("") + " Z";
const bftFlagTaper = (pts, role, opts, x) => pTaper(bftFlagPts(pts), role, opts, x);
const bftFlagBlob = (pts, role, x) => pBlob(bftFlagPts(pts), role, x);
const bftFlagDot = (cx, cy, r, role, x) => pDot(cx * BFT_FLAG_U, cy * BFT_FLAG_U, r * BFT_FLAG_U, role, x);
/* an ellipse's outline as points, for a ring or a mouth */
const bftFlagEllipse = (cx, cy, rx, ry, n = 20) => Array.from({ length: n }, (_, i) => {
  const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
});
/* knots from mph, and the one scale both instruments read: 0 in a calm, 1 at fifteen knots */
const bftFlagKnots = (mph) => Math.max(0, +mph || 0) / 1.15078;
const bftFlagLevel = (kt) => bftFlagClamp((Math.max(0, +kt || 0)) / 15, 0, 1);

INK.bftFlags = {
  /* the state flag: the indigo of the Moultrie flag, its white, the canvas header at the hoist,
     and the folds (a deep indigo) and the sheen (the field lifted toward the sky) */
  flag: "#21438E", mark: "#F8F5EE", header: "#E4DED0", fold: "#0B1534", sheen: "#9FB6E2",
  staff: "#E7E2D6", finial: "#D6A23A", metal: "#4B4F59", pole: "#A6ABAF",
  /* the windsock: a warm fabric white, the FAA's orange, the orange inside the mouth in its own
     shadow, and the creases and stitched seams */
  sock: "#F6F1E6", orange: "#F26B1D", inside: "#9E4318", crease: "#5B2616",
  ink: "#2A1B33", shade: "#3A2350", lit: "#FFE2A8", shadeOp: .3, litOp: .42,
};
/* the ink a thing this small wants: a lighter line than the dock's (BFT_DOCK_O is .8), a smaller
   shadow crescent and lit edge */
const BFT_FLAG_INK = { line: .72, heavy: .35, shade: 1, lit: .55 };

/* ── the windsock ─────────────────────────────────────────────────────────────────────
   The sock's centreline leaves the rigid hoop level and bends down as far as the wind lets it.
   Band i fills over (3i - 1, 3i + 3) knots. The filled part droops less the harder it blows, and a
   band that has not filled yet hangs below it, slack, its tube fallen half shut. Both changes are
   eased over a band's length, centre to centre, so nothing steps at a seam. */
/* cut the loops out of an edge: on the inside of a tight bend the edge would run back on itself,
   and the cloth there is the inside of the elbow, not its outline. Every station keeps a point, so
   the bands can still be cut from the edge by station */
function bftSockTrim(E) {
  const P = E.map((p) => [p[0], p[1]]), n = P.length;
  const X = (a, b, c, d) => {
    const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], q = rx * sy - ry * sx;
    if (Math.abs(q) < 1e-9) return null;
    const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / q, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / q;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + rx * t, a[1] + ry * t] : null;
  };
  for (let i = 0; i < n - 3; i++) {
    for (let j = n - 2; j > i + 1; j--) {
      const x = X(P[i], P[i + 1], P[j], P[j + 1]);
      if (x) { for (let k = i + 1; k <= j; k++) P[k] = x; i = j; break; }
    }
  }
  return P;
}
function bftSockGeom(knots, dir = 1, lift = 0) {
  const kt = Math.max(0, +knots || 0), w = bftFlagLevel(kt), D = dir < 0 ? -1 : 1;
  const LEN = 8, BAND = LEN / 5, R0 = 1.3, R1 = .56, N = 80, ds = LEN / N;
  const hx = .95 * D, hy = -13.15 - lift;
  const fill = (i) => bftFlagSmooth((kt - 3 * bftFlagClamp(i, 0, 4) + 1) / 4);
  const a0 = Math.PI / 2 * Math.pow(1 - w, 1.1), slackK = bftFlagMix(.95, .3, w);
  const bandAng = (i) => a0 + (Math.PI / 2 - a0) * slackK * (1 - fill(i));
  const across = (s, f) => { const x = s / BAND - .5, i = Math.floor(x), t = bftFlagSmooth(x - i); return bftFlagMix(f(i), f(i + 1), t); };
  /* in a calm the cloth falls from the ring: it turns down sooner and starts to close at once */
  const calm = 1 - bftFlagSmooth(kt / 4);
  const ramp = bftFlagMix(.6, 1.25, 1 - w) * (1 - .12 * calm), close = bftFlagMix(1.1, .75, calm);
  /* a limp sock never hangs ruler-straight: a slight sway down its length */
  const th = (s) => across(s, bandAng) * bftFlagSmooth(s / ramp) + calm * .09 * Math.sin(s * .95 + .4) * bftFlagSmooth((s - 1.2) / 2.2);
  const C = [];
  let x = hx, y = hy;
  for (let j = 0; j <= N; j++) {
    const s = j * ds;
    if (j) { const tm = th(s - ds / 2); x += Math.cos(tm) * ds * D; y += Math.sin(tm) * ds; }
    const t = th(s), f = across(s, fill), slack = 1 - f;
    /* a slack band falls about half shut, smoothly: no beading */
    const collapse = 1 - .47 * slack * bftFlagSmooth(s / close);
    /* a full sock in a hard blow is never a cone of tin: the cloth ripples toward the tail */
    const ripple = bftFlagClamp((kt - 11) / 14, 0, 1) * .035 * Math.sin(s * 4.7 + 1.3) * bftFlagSmooth((s - 2) / 5);
    const r = (R0 + (R1 - R0) * s / LEN) * collapse * (1 + ripple);
    C.push({ s, x, y, t, f, r, ox: D * Math.sin(t), oy: -Math.cos(t), tx: D * Math.cos(t), ty: Math.sin(t) });
  }
  const tops = bftSockTrim(C.map((p) => [p.x + p.ox * p.r, p.y + p.oy * p.r]));
  const bots = bftSockTrim(C.map((p) => [p.x - p.ox * p.r, p.y - p.oy * p.r]));
  C.forEach((p, j) => { p.top = tops[j]; p.bot = bots[j]; p.mid = [(tops[j][0] + bots[j][0]) / 2, (tops[j][1] + bots[j][1]) / 2]; });
  return { kt, w, D, LEN, BAND, N, ds, hx, hy, R0, C, calm, at: (s) => C[Math.round(bftFlagClamp(s / ds, 0, N))] };
}
/* the near half of the cloth's round at one station, top to bottom, bulging toward the tail
   (we look at the sock from a little upwind, which is why we see into its mouth) */
const bftSockArc = (p, n = 7) => {
  const hx = p.top[0] - p.mid[0], hy = p.top[1] - p.mid[1], b = Math.hypot(hx, hy) * .3;
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = Math.PI * i / n;
    return [p.mid[0] + hx * Math.cos(a) + p.tx * b * Math.sin(a), p.mid[1] + hy * Math.cos(a) + p.ty * b * Math.sin(a)];
  });
};
/* a point across the cloth at a station: k=1 the top edge, -1 the bottom, 0 the middle */
const bftSockAcross = (p, k) => [p.mid[0] + (p.top[0] - p.mid[0]) * k, p.mid[1] + (p.top[1] - p.mid[1]) * k];
/* the stations between two lengths, each drawn in to k of its width by pinch(s) when given */
const bftSockSeg = (G, s0, s1, pinch) => G.C.slice(Math.round(s0 / G.ds), Math.round(s1 / G.ds) + 1).map((p) => {
  const k = pinch ? pinch(p.s) : 1;
  return k >= 1 ? p : { ...p, top: bftSockAcross(p, k), bot: bftSockAcross(p, -k) };
});
/* a length of the sock between two stations, as one closed outline */
function bftSockSpan(G, s0, s1, pinch) {
  const seg = bftSockSeg(G, s0, s1, pinch);
  return bftFlagRuns([seg.map((p) => p.top), bftSockArc(seg[seg.length - 1]), seg.slice().reverse().map((p) => p.bot), bftSockArc(seg[0]).reverse()]);
}
/* the creases a slack length takes: two long folds that drift round the cloth as they go (the
   twist), fading out where the cloth has filled; and in a calm, two drape folds off the hoop's
   lower rim */
function bftSockCreases(G, s0, s1) {
  const out = [], n = 10;
  const run = (k0, k1, a, b, wmax, op, slackOnly = true) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * (a + (b - a) * i / n), p = G.at(s), sl = slackOnly ? bftFlagSmooth((1 - p.f - .08) / .5) : 1;
      pts.push([...bftSockAcross(p, k0 + (k1 - k0) * i / n), Math.max(.012, wmax * sl * Math.pow(Math.sin(Math.PI * i / n), .8))]);
    }
    if (pts.some((p) => p[2] > .03)) out.push(bftFlagTaper(pts, "crease", {}, { noSil: true, op: bftFlagR2(op) }));
  };
  run(.5, .05, .04, .96, .12, .34);
  run(-.12, -.58, .1, 1, .1, .3);
  return out;
}
/* in a calm, two drape folds fall off the hoop's lower rim */
function bftSockDrape(G) {
  if (G.calm < .05) return [];
  return [[-.86, -.5, 1.5, .1], [-.55, -.12, 1.15, .085]].map(([k0, k1, len, wmax]) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const p = G.at(.06 + len * i / 8); pts.push([...bftSockAcross(p, k0 + (k1 - k0) * i / 8), Math.max(.012, wmax * Math.pow(Math.sin(Math.PI * (i + .6) / 9.2), .7))]); }
    return bftFlagTaper(pts, "crease", {}, { noSil: true, op: bftFlagR2(.42 * G.calm) });
  });
}
/* the stitched seam between two bands, round the near half of the cloth */
const bftSockSeam = (G, s, w = .07, op = .5) => bftFlagTaper(bftSockArc(G.at(s), 8).map((p, i) => [...p, i === 0 || i === 8 ? .015 : w]), "crease", {}, { noSil: true, op });
/* the underside in its own shadow, so the sock is a round tube and not a striped ribbon */
function bftSockBelly(G, s0, s1, pinch) {
  const seg = bftSockSeg(G, s0, s1, pinch);
  return part(bftFlagRuns([seg.map((p) => p.bot), seg.slice().reverse().map((p) => bftSockAcross(p, -.42))]), "shade", { noSil: true, op: .2 });
}
/**
 * rigBftWindsock(knots, dir, {pole, width}): the airfield windsock on its pole, 13 tall by default
 * (o.pole sets it, 4 at the least: the dock's guide piling wants about 17.8, BFT_DOCK_POLES.windsock),
 * the pole .44 across at its foot (o.width; the dock's own placeholder is .5), with the sock 8 long
 * and 2.6 across the mouth, in drawing units (ten to the scene unit). y=0 is the foot of the pole.
 * Joints: `bft-sock` turns at the hoop's centre (only the cloth: the frame and the hoop are rigid and
 * stay put), `bft-sock-tail` on the centreline at the seam between the third and fourth bands (the
 * slack tail working in the gusts). The tail is drawn first and the body over it, so the join is
 * the stitched seam there and never a sleeve slid into a tube.
 */
function rigBftWindsock(knots, dir = 1, { pole = 13, width = .44 } = {}) {
  const lift = Math.max(4, +pole || 13) - 13, Y = (y) => y - lift, pw = bftFlagClamp(+width || .44, .3, .7);
  const G = bftSockGeom(knots, dir, lift), D = G.D, U = BFT_FLAG_U;
  const split = 3 * G.BAND, under = split - 1.2;
  const band = (s0, s1, pinch) => part(bftSockSpan(G, s0, s1, pinch), "orange", { noSil: true });
  /* the tail's length under the body is drawn in a little, so when the tail works it never shows
     past the body's edges */
  const pinch = (s) => s >= split ? 1 : .8 + .2 * bftFlagSmooth((s - split + .55) / .45);
  /* the hoop: a rigid ring at the mouth, drawn over the cloth it holds open */
  const ring = (() => {
    const rx = G.R0 * .3 + .07, ry = G.R0 + .07, ix = rx - .16, iy = ry - .16, [cx, cy] = [G.hx * U, G.hy * U];
    const e = (a, b, sw) => `M ${f1(cx - a * U)} ${f1(cy)} A ${f1(a * U)} ${f1(b * U)} 0 1 ${sw} ${f1(cx + a * U)} ${f1(cy)} A ${f1(a * U)} ${f1(b * U)} 0 1 ${sw} ${f1(cx - a * U)} ${f1(cy)} Z`;
    return part(e(rx, ry, 0) + " " + e(ix, iy, 1), "metal", { noSil: true });
  })();
  /* the body, mouth to the third seam: the cloth, its bands and seams, then the inside of the mouth
     over the cloth's first span (seen from a little upwind) */
  const body = [
    part(bftSockSpan(G, 0, split), "sock"),
    band(0, G.BAND), band(2 * G.BAND, split),
    bftSockBelly(G, 0, split),
    bftSockSeam(G, G.BAND), bftSockSeam(G, 2 * G.BAND),
    ...bftSockCreases(G, .1, split), ...bftSockDrape(G),
    bftFlagBlob(bftFlagEllipse(G.hx, G.hy, G.R0 * .3, G.R0, 24), "inside"),
  ];
  /* the tail, from well under the body (so its own start, ink and shading lie under the body's
     cloth) to the end */
  const tail = [
    part(bftSockSpan(G, under, G.LEN, pinch), "sock"),
    band(under, split, pinch), band(4 * G.BAND, G.LEN),
    bftSockBelly(G, under, G.LEN, pinch),
    bftSockSeam(G, 4 * G.BAND),
    ...bftSockCreases(G, split, G.LEN),
  ];
  const tp = G.at(split);
  const top = Y(-12.95), sw = Math.max(.26, pw * .34 + .1);
  return [
    { parts: [
      bftFlagTaper([[0, .02, pw], [0, top / 2, pw * .84], [0, top, pw * .68]], "pole", { capStart: false }),
      bftFlagBlob([[-pw * 1.4, .02], [-pw * 1.36, -.2], [-pw * .45, -.3], [pw * .45, -.3], [pw * 1.36, -.2], [pw * 1.4, .02]], "metal"),
      /* the frame: two struts off the swivel to the top and the foot of the hoop */
      bftFlagTaper([[0, Y(-13.42), .2], [G.hx * .55, Y(-13.95), .17], [G.hx, Y(-14.38), .15]], "metal"),
      bftFlagTaper([[0, Y(-12.9), .2], [G.hx * .55, Y(-12.45), .17], [G.hx, Y(-11.92), .15]], "metal"),
    ] },
    { open: `<g class="bft-sock">`, pivot: [f1(G.hx * U), f1(G.hy * U)], layers: [
      { open: `<g class="bft-sock-tail">`, pivot: [f1(tp.x * U), f1(tp.y * U)], layers: [{ parts: tail }] },
      { parts: body },
    ] },
    { parts: [ring] },
    /* the swivel: a bearing on the pole's head, with a domed cap and a collar where it turns */
    { parts: [
      part(bftFlagRuns([[[-sw, Y(-12.74)], [-sw, Y(-13.46)]], [[-sw, Y(-13.46)], [-sw * .73, Y(-13.62)], [0, Y(-13.68)], [sw * .73, Y(-13.62)], [sw, Y(-13.46)]], [[sw, Y(-13.46)], [sw, Y(-12.74)]], [[sw, Y(-12.74)], [-sw, Y(-12.74)]]]), "metal"),
      bftFlagTaper([[-sw + .01, Y(-13.1), .07], [sw - .01, Y(-13.1), .07]], "pole", { capStart: false, capEnd: false }, { noSil: true, op: .55 }),
    ] },
  ];
}
/* where the joints are for a given wind, in drawing units, for the scene's keyframes */
function bftSockPivots(knots, dir = 1, { pole = 13 } = {}) {
  const G = bftSockGeom(knots, dir, Math.max(4, +pole || 13) - 13), tp = G.at(3 * G.BAND);
  return { sock: [f1(G.hx * BFT_FLAG_U), f1(G.hy * BFT_FLAG_U)], tail: [f1(tp.x * BFT_FLAG_U), f1(tp.y * BFT_FLAG_U)] };
}
/* a suggestion for the scene's keyframes, the burgee's way: the gusts over the wind decide how far
   the sock works, the wind how fast. Nothing moves in a calm. rotate(±sockDeg) on bft-sock (the
   cloth lifting and dropping in the hoop, never more than 2°), rotate(±tailDeg) on bft-sock-tail,
   at their own durations */
function bftSockMotion(knots, gustKnots) {
  const kt = Math.max(0, +knots || 0), g = Math.max(kt, +gustKnots || 0);
  if (kt < 1 && g < 3) return null;
  const spread = g - kt, slack = 1 - bftFlagLevel(kt);
  return {
    sockDeg: bftFlagR2(bftFlagClamp(.5 + spread * .12, .5, 2)), sockDur: bftFlagR2(bftFlagClamp(2.4 - g * .05, .9, 2.4)),
    tailDeg: bftFlagR2(bftFlagClamp(1.5 + spread * .3 + slack * 2, 1.5, 5)), tailDur: bftFlagR2(bftFlagClamp(1.1 - g * .025, .35, 1.1)),
  };
}

/* ── the South Carolina flag ──────────────────────────────────────────────────────────
   Indigo, with the white crescent in the upper hoist and the white palmetto in the middle, drawn
   from the state's own artwork (the crescent's horns open toward the upper fly; the palmetto is a
   round crown on a solid heart, the side and lower fronds arching down like a fountain, on a slim
   trunk that flares at its foot), a little bolder than the artwork so they survive a phone.
   The cloth is a sheet, its hoist pinned to the staff, mapped two ways and blended by the wind:
   hanging, a drape down the staff with one deep lengthwise pleat; and flying, out from the staff
   with its fly drooping as far as the wind lets it, in two to four soft waves. The waves deepen up
   to a fresh breeze, and a gale has more and flatter ones, its top and bottom edges out of step
   and its fly edge working. The design rides the sheet, so the crescent and the palmetto fold and
   wave with the cloth. */
function bftFlagSheet(mph, dir = 1, lift = 0) {
  const m = Math.max(0, +mph || 0), kt = bftFlagKnots(m), w = bftFlagLevel(kt), D = dir < 0 ? -1 : 1;
  const LEN = 8, H = 5.4, X0 = .13, Y0 = -13.2 - lift, N = 64;
  const e = bftFlagSmooth(w / .36);
  const a0 = 88 * Math.PI / 180 * Math.pow(1 - w, 1.15);
  /* a fresh breeze and up works the cloth harder, a gale finer and flatter */
  const hard = bftFlagClamp((m - 10) / 14, 0, 1), gale = bftFlagClamp((m - 18) / 14, 0, 1);
  const k = 2 + bftFlagClamp((m - 8) / 12, 0, 1) * .9 + gale * .9;
  const A = (.12 + .026 * Math.min(m, 18)) * e * (1 - .3 * gale);
  const cf = bftFlagMix(.74, .98, w), LT = LEN * (.975 - .018 * A * k);
  const tx = [0], ty = [0], bt = [0], cc = [1];
  for (let i = 1; i <= N; i++) {
    const u = (i - .5) / N, ph = Math.min(a0 * (.72 + .56 * u), 1.62);
    tx.push(tx[i - 1] + Math.cos(ph) * LT / N); ty.push(ty[i - 1] + Math.sin(ph) * LT / N);
    const uu = i / N, phu = Math.min(a0 * (.72 + .56 * uu), 1.62);
    bt.push(.5 * phu * (1 - (1 - uu) * (1 - uu))); cc.push(1 - (1 - cf) * uu);
  }
  const lerpA = (arr, u) => { const f = bftFlagClamp(u, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)), t = f - i; return arr[i] + (arr[i + 1] - arr[i]) * t; };
  /* the waves run down the cloth a little behind at the foot, more so in a hard blow */
  const phase = (u, v) => 2 * Math.PI * k * u - .5 + .6 * v + .9 * hard * v * v;
  const wave = (u, v) => A * Math.pow(Math.max(u, 0), .85) * (1 + .36 * hard * (v - .5)) * Math.sin(phase(u, v))
    + .22 * gale * A * Math.max(u, 0) * Math.sin(2 * Math.PI * 1.85 * k * u + 1.1 + 1.6 * v);
  /* the fly edge whips in a hard blow, finer in a gale */
  const whip = (u, v) => .17 * hard * (1 - .25 * gale) * bftFlagSmooth((u - .78) / .22) * Math.sin(2 * Math.PI * (1.2 + .8 * gale) * v + 2.4 * u + .8);
  /* flying: the top edge droops along its length, each column of cloth hangs off it, leaning back
     toward the staff the more the fly droops, and the waves lift and drop the columns */
  const fly = (u, v) => {
    const b = lerpA(bt, u), c = lerpA(cc, u);
    return [lerpA(tx, u) - Math.sin(b) * v * H * c + whip(u, v), lerpA(ty, u) + Math.cos(b) * v * H * c + wave(u, v)];
  };
  /* hanging: the cloth falls down the staff. The top edge falls from the head of the hoist and swells
     out over the folds, the foot falls from the foot of the hoist, and the fly hangs in a short
     diagonal hem. Below the head the middle of the cloth is gathered into one deep lengthwise pleat,
     so most of the palmetto is folded away and the crescent is what shows */
  const pleat = (u) => .84 * bftFlagSmooth((u - .2) / .34), P0 = .34, P1 = .97;
  const across = (u, v) => {
    const d = pleat(u), c = v < P0 ? v : v < P1 ? P0 + (v - P0) * (1 - d) : P0 + (P1 - P0) * (1 - d) + (v - P1);
    return c / (1 - (P1 - P0) * d);
  };
  const hang = (u, v) => {
    const xt = 1.34 * Math.sin(Math.min(u / .46, 1) * Math.PI / 2) - .1 * u + .05 * Math.sin(2 * Math.PI * 2.2 * u) * Math.sin(Math.PI * u), yt = 5.75 * u;
    const xb = .3 * u, yb = H + 1.45 * u, c = across(u, v);
    return [(1 - c) * xt + c * xb, (1 - c) * yt + c * yb];
  };
  const P = (u, v) => {
    const a = hang(u, v), b = fly(u, v);
    return [D * (X0 + bftFlagMix(a[0], b[0], e)), Y0 + bftFlagMix(a[1], b[1], e)];
  };
  return { m, kt, w, e, D, LEN, H, X0, Y0, A, k, hard, gale, P, phase, pleat, P0, P1, PF: (fx, fy) => P(fx / LEN, fy / H) };
}
/* the crescent in flag units (8 by 5.4, hoist at x=0, top at y=0): the outer round less a smaller
   one set toward the upper fly, so the horns open that way */
function bftFlagCrescent() {
  const c1 = [1.2, 1.27], r1 = .82, c2 = [1.47, 1.04], r2 = .6;
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(r1 * r1 - a * a);
  const mx = c1[0] + a * dx / d, my = c1[1] + a * dy / d;
  const A = [mx - h * dy / d, my + h * dx / d], B = [mx + h * dy / d, my - h * dx / d];
  const away = Math.atan2(-dy, -dx);
  const arc = (c, r, p0, p1, n) => {
    let a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]), a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    let sw = a1 - a0; while (sw <= 0) sw += Math.PI * 2;
    const mid = a0 + sw / 2, off = Math.abs(Math.atan2(Math.sin(mid - away), Math.cos(mid - away)));
    if (off > Math.PI / 2) sw -= Math.PI * 2;
    return Array.from({ length: n + 1 }, (_, i) => { const t = a0 + sw * i / n; return [c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]; });
  };
  return [arc(c1, r1, A, B, 26), arc(c2, r2, B, A, 20)];
}
/* the palmetto in flag units. The fronds of one side as [angle in degrees (0 toward the fly, -90
   up), length, droop]: the top ones are short and stand up, the side ones reach out and arch down,
   the lower ones hang, so the crown is a fountain about 1.4 times wider than tall. The other side is
   the mirror, the way the flag's tree is drawn, and the top frond stands alone */
const BFT_FLAG_FRONDS = [
  [-90, .78, 0],
  [-64, .92, .2], [-40, 1.08, .45], [-16, 1.2, .62], [8, 1.12, .78], [32, .96, .9],
];
const BFT_FLAG_CROWN = [4.12, 1.9];
function bftFlagPalmetto() {
  const [cx, cy] = BFT_FLAG_CROWN, out = [];
  /* the trunk, a touch bowed, flaring to a flat foot */
  out.push({ taper: [[4.05, 4.74, .64], [4.04, 4.54, .49], [4.0, 4.22, .42], [3.98, 3.6, .38], [4.02, 2.8, .34], [4.09, 2.15, .3], [4.12, 1.95, .28]] });
  const frond = (deg, len, droop, side) => {
    /* the spine leaves the heart at its angle and turns toward straight down as far as its droop says */
    const a0 = deg * Math.PI / 180, n = 24, S = [[0, 0, a0]];
    for (let i = 1; i <= n; i++) {
      const t = (i - .5) / n, a = a0 + (Math.PI / 2 - a0) * droop * Math.pow(t, 1.3), [x, y] = S[i - 1];
      S.push([x + Math.cos(a) * len / n, y + Math.sin(a) * len / n, a]);
    }
    const at = (t, k) => {
      const f = bftFlagClamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), r = f - i, A = S[i], B = S[i + 1];
      const x = A[0] + (B[0] - A[0]) * r, y = A[1] + (B[1] - A[1]) * r, a = A[2] + (B[2] - A[2]) * r;
      /* a blade: slim where it leaves the heart, broad toward its end */
      const tt = bftFlagClamp(t, 0, 1), wd = .14 + .05 * bftFlagSmooth(tt / .6) + .35 * bftFlagSmooth((tt - .5) / .45), ex = t > 1 ? (t - 1) * len : 0;
      return [cx + side * (x + Math.cos(a) * ex - Math.sin(a) * wd / 2 * k), cy + y + Math.sin(a) * ex + Math.cos(a) * wd / 2 * k];
    };
    /* each side a smooth run, the end three rounded lobes with two shallow notches between them */
    const L = [.05, .3, .55, .78, .94].map((t) => at(t, 1)), R = [.94, .78, .55, .3, .05].map((t) => at(t, -1));
    const n1 = at(.9, .4), n2 = at(.9, -.4);
    return { runs: [L, [L[4], at(1.0, .78), n1], [n1, at(1.05, 0), n2], [n2, at(1.0, -.78), R[0]], R, [R[R.length - 1], L[0]]] };
  };
  for (const [deg, len, droop] of BFT_FLAG_FRONDS) {
    out.push(frond(deg, len, droop, 1));
    if (deg > -89) out.push(frond(deg, len, droop, -1));
  }
  /* the heart: a solid dome over the inner part of every frond, so no blue reaches the hub */
  out.push({ blob: bftFlagEllipse(cx, cy + .04, .58, .37, 16).map(([x, y]) => [x, y > cy + .04 ? y - (y - cy - .04) * .25 : y]) });
  return out;
}
/**
 * rigBftFlag(mph, dir, {staff, width}): the South Carolina flag on a short white staff with a gilt
 * ball, in drawing units (ten to the scene unit). The flag is 8 by 5.4, its hoist's head 0.4 under
 * the staff's top; the staff is 13.6 tall by default (o.staff sets it, 10 at the least so a limp flag
 * clears the foot: the dock house's ridge wants about 12, BFT_DOCK_POLES.flag) and .36 across at its
 * foot (o.width). y=0 is the foot. Joint: `bft-flag` at the hoist (on the staff's edge, halfway up),
 * for the flutter: skewY or a small rotate keeps the hoist on the staff.
 */
function rigBftFlag(mph, dir = 1, { staff = 13.6, width = .36 } = {}) {
  const lift = Math.max(10, +staff || 13.6) - 13.6, Y = (y) => y - lift, sw = bftFlagClamp(+width || .36, .26, .6);
  const F = bftFlagSheet(mph, dir, lift), D = F.D, U = BFT_FLAG_U, N = 40;
  const P = F.P, PF = F.PF;
  const runU = (v, u0, u1, n = N) => Array.from({ length: n + 1 }, (_, i) => P(u0 + (u1 - u0) * i / n, v));
  const runV = (u, v0, v1, n = 12) => Array.from({ length: n + 1 }, (_, i) => P(u, v0 + (v1 - v0) * i / n));
  const field = part(bftFlagRuns([runU(0, 0, 1), runV(1, 0, 1), runU(1, 1, 0), runV(0, 1, 0)]), "flag");
  const header = part(bftFlagRuns([runU(0, 0, .034, 3), runV(.034, 0, 1), runU(1, .034, 0, 3), runV(0, 1, 0)]), "header", { noSil: true, op: .9 });
  const [o, i] = bftFlagCrescent();
  const crescent = part(bftFlagRuns([o.map(([x, y]) => PF(x, y)), i.map(([x, y]) => PF(x, y))]), "mark");
  const tree = bftFlagPalmetto().map((t) => t.runs ? part(bftFlagRuns(t.runs.map((r) => r.map(([x, y]) => PF(x, y)))), "mark") : t.taper
    ? (() => { /* a taper through the sheet: its edges, mapped, its foot square across */
      const pts = t.taper, L = [], R = [];
      pts.forEach((p, j) => {
        const a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
        let dx = j ? b[0] - a[0] : 0, dy = j ? b[1] - a[1] : -1; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        L.push(PF(p[0] - dy * p[2] / 2, p[1] + dx * p[2] / 2)); R.push(PF(p[0] + dy * p[2] / 2, p[1] - dx * p[2] / 2));
      });
      return part(bftFlagRuns([L, [L[L.length - 1], R[R.length - 1]], R.slice().reverse()]), "mark");
    })()
    : bftFlagBlob(t.blob.map(([x, y]) => PF(x, y)), "mark"));
  /* a brush stroke laid on the sheet: [u, v, width] in flag fractions and scene units, mapped */
  const onSheet = (pts, role, op) => op > .02 && pts.length > 2 ? bftFlagTaper(pts.map(([u, v, wd]) => [...P(u, v), wd]), role, {}, { noSil: true, op: bftFlagR2(op) }) : null;
  const folds = [], over = [];
  /* flying: a tapered fold down the shadow side of each trough, fading toward the hoist, and one
     soft sheen on the crest nearest the staff */
  if (F.e > .02) {
    const twoPiK = 2 * Math.PI * F.k;
    const uAt = (th, v) => (th + .5 - .6 * v - .9 * F.hard * v * v) / twoPiK;
    let sheen = false;
    for (let j = 0; j <= Math.ceil(F.k) + 1; j++) {
      for (const [th, role] of [[Math.PI + .45 + 2 * Math.PI * j, "fold"], [.15 + 2 * Math.PI * j, "sheen"]]) {
        if (role === "sheen" && sheen) continue;
        const n = 9, run = [];
        for (let q = 0; q <= n; q++) { const v = .03 + .94 * q / n, u = uAt(th, v); if (u > .07 && u < .975) run.push([u, v]); }
        if (run.length < 4) continue;
        const um = run[Math.floor(run.length / 2)][0], fade = bftFlagSmooth((um - .04) / .5);
        const wd = (role === "fold" ? .16 + .5 * F.A : .14 + .3 * F.A) * (.55 + .45 * fade);
        const pts = run.map(([u, v], q) => [u, v, Math.max(.015, wd * Math.pow(Math.sin(Math.PI * (q + .5) / run.length), .7))]);
        const op = (role === "fold" ? .16 + .55 * F.A : .1 + .2 * F.A) * fade * F.e * bftFlagClamp(F.A * 4, 0, 1);
        const p = onSheet(pts, role, op);
        if (p) { folds.push(p); if (role === "sheen") sheen = true; }
      }
    }
  }
  /* hanging: the pleat, gathered into a dark fold that hides most of the tree and comes to a point
     below the head of the hoist, its near crease, and one more fold down the drape */
  if (F.e < .98) {
    const h = 1 - F.e, n = 14, u0 = .3, apex = P(u0, (F.P0 + F.P1) / 2), e0 = [], e1 = [], crease = [], fold = [];
    for (let q = 0; q <= n; q++) {
      const u = u0 + .1 + (.99 - u0 - .1) * q / n;
      e0.push(P(u, F.P0)); e1.push(P(u, F.P1));
      crease.push([.24 + .75 * q / n, F.P0, Math.max(.015, .12 * bftFlagSmooth(q / n / .35) * (q === n ? .5 : 1))]);
      fold.push([.3 + .66 * q / n, .14, Math.max(.015, .1 * Math.sin(Math.PI * q / n))]);
    }
    if (h > .02) over.push(part(bftFlagRuns([[apex, ...e0], [e0[n], e1[n]], [...e1.slice().reverse(), apex]]), "fold", { noSil: true, op: bftFlagR2(.5 * h) }));
    over.push(onSheet(crease, "fold", .7 * h));
    folds.push(onSheet(fold, "fold", .4 * h));
  }
  /* over the white the folds are lighter, so the crescent and the tree still read as white */
  const overMarks = folds.filter((p) => p && p.role === "fold").map((p) => ({ ...p, op: bftFlagR2(p.op * .3) }));
  /* the snap hooks at the head and the foot of the hoist */
  const hooks = [Y(-13.2), Y(-7.8)].map((y) => part(bftFlagRuns([[[-.22 * D, y - .1], [.26 * D, y - .1]], [[.26 * D, y + .1], [-.22 * D, y + .1]]]), "metal", { noSil: true }));
  const fr = bftFlagClamp(sw * .95, .3, .45);
  return [
    { parts: [
      bftFlagTaper([[0, .02, sw], [0, Y(-13.55) / 2, sw * .86], [0, Y(-13.55), sw * .72]], "staff", { capStart: false }),
      bftFlagTaper([[0, Y(-13.5), fr * .47], [0, Y(-13.66), fr * .7], [0, Y(-13.72), fr * .41]], "finial", { capEnd: false }),
      bftFlagDot(0, Y(-13.7) - fr, fr, "finial"),
    ] },
    { open: `<g class="bft-flag">`, pivot: [f1(F.X0 * D * U), f1(Y(-10.5) * U)], layers: [
      { parts: [field, header, ...folds.filter(Boolean), crescent, ...tree, ...overMarks, ...over.filter(Boolean), ...hooks] },
    ] },
  ];
}
/* a suggestion for the flutter: skewY(±deg) on bft-flag about its pivot, which keeps the hoist on
   the staff and lifts and drops the fly, wider the further the gusts run over the wind, and quicker
   the harder it blows: a gale reads in the tempo, not in deeper waves */
function bftFlagMotion(mph, gustMph) {
  const m = Math.max(0, +mph || 0), g = Math.max(m, +gustMph || 0);
  if (m < 1.5 && g < 4) return null;
  return { skewDeg: bftFlagR2(bftFlagClamp(1 + (g - m) * .3 + m * .05, 1, 6)), dur: bftFlagR2(bftFlagClamp(1.5 - g * .035, .32, 1.5)) };
}

/* ── the looks ── */
const BFT_FLAG_STATES = { calm: { kt: 0, mph: 0 }, light: { kt: 6, mph: 7 }, fresh: { kt: 12, mph: 14 }, gale: { kt: 25, mph: 29 } };
LOOK.windsock = {
  pal: INK.bftFlags, box: [-14, -152, 112, 156], s: .1, dist: .04, o: BFT_FLAG_INK,
  states: BFT_FLAG_STATES,
  draw: (st) => rigBftWindsock(st.kt, st.dir ?? 1),
};
/* both on the one dock, the flag upwind of the sock, so they can be seen agreeing */
LOOK["dock-wind"] = {
  pal: INK.bftFlags, box: [-112, -152, 214, 156], s: .1, dist: .04, o: BFT_FLAG_INK,
  states: BFT_FLAG_STATES,
  draw: (st) => [
    { open: `<g transform="translate(-100 0)">`, pivot: [0, 0], layers: rigBftFlag(st.mph, st.dir ?? 1) },
    ...rigBftWindsock(st.kt, st.dir ?? 1),
  ],
};
LOOK.scflag = {
  pal: INK.bftFlags, box: [-10, -150, 100, 154], s: .1, dist: .04, o: BFT_FLAG_INK,
  states: BFT_FLAG_STATES,
  draw: (st) => rigBftFlag(st.mph, st.dir ?? 1),
};

/* Porch fish study. Pass Porch's existing drawing helpers to makeRigFish; the
   returned rigFish follows the same layers / joints contract as the other rigs.
   Faces right; approximately 30 × 14 local units before the ink edge. */

export const FISH_DAY = Object.freeze({
  body: "#73824A",
  mark: "#F0E5BF",
  fin: "#C48A47",
  tail: "#A88A4A",
  detail: "#485137",
  eyeRing: "#EFE2AD",
  eye: "#1B1720",
  ink: "#2A1B33",
  shade: "#3A2350",
  lit: "#FFE2A8",
  shadeOp: 0.32,
  litOp: 0.5,
});

export const FISH_SIZES = Object.freeze({
  logicalWidth: 30,
  logicalHeight: 14,
  chart: Object.freeze({ width: 24, scale: 0.8, minWidth: 22, maxWidth: 24 }),
  pond: Object.freeze({ width: 27, scale: 0.9, minWidth: 24, maxWidth: 28 }),
  tailPivot: Object.freeze([-8, 0]),
});

export function makeRigFish({ pBlob, pTaper, pDot }) {
  return function rigFish(phase = () => "") {
    return [
      /* The tail's deep open fork stays legible after shrinking. Its root sits
         under the body, so a small turn cannot open a gap at the joint. */
      { open: `<g class="fish-tail"${phase(1.4)}>`, pivot: [-8, 0], layers: [
        { parts: [
          pBlob([
            [-7.7, -1.6], [-10.5, -2.5], [-14.7, -5], [-14.4, -3.4],
            [-11.8, 0], [-14.5, 3.5], [-14.8, 5], [-10.4, 2.5],
            [-7.7, 1.6],
          ], "tail"),
        ] },
      ] },
      /* Two small fins break the silhouette without spines or fine ray lines. */
      { parts: [
        pBlob([
          [-4.4, -3.4], [-2.4, -5.3], [-0.3, -6.8], [1.6, -5.9],
          [4.4, -3.9], [1, -3.3],
        ], "fin"),
        pBlob([
          [-2.6, 3.2], [-0.8, 6.2], [1.8, 6.1], [4.1, 3.2],
        ], "fin"),
      ] },
      { parts: [
        /* Narrow at the tail, full through the shoulder, then a blunt little
           muzzle: recognizably a pond fish rather than a leaf or a shark. */
        pBlob([
          [-8.7, -1.5], [-5.6, -3.2], [-0.8, -4.4], [5.6, -4.2],
          [10.1, -2.7], [12.9, -0.9], [14.7, 0.1], [13.2, 1.9],
          [9.4, 3.8], [3.1, 4.7], [-3.1, 3.6], [-6.5, 1.9],
          [-8.7, 1.4],
        ], "body"),
        /* One cream underside; no scales or lateral stripe to muddy the icon. */
        pBlob([
          [-7.6, 0.6], [-3.5, 1.2], [1.9, 1.4], [7.8, 0.9],
          [13.7, 0.6], [12.6, 2.1], [8.8, 3.7], [3.2, 4.3],
          [-2.8, 3.2], [-6.4, 1.8],
        ], "mark"),
        pTaper([[7.6, -1.3, 0.18], [6.9, 0.2, 0.55], [7, 1.8, 0.2]], "detail"),
        pDot(10.5, -1.1, 1.15, "eyeRing"),
        pDot(10.7, -1.1, 0.72, "eye"),
      ] },
      /* One near fin reads as a warm brush-shaped stroke, not an extra limb. */
      { parts: [
        pBlob([[5.6, 1.8], [3.8, 2.1], [1.5, 3.9], [4.2, 3.8], [6.1, 2.4]], "fin"),
      ] },
    ];
  };
}

/* Scene integration, using the existing atmosphere and light:
     const rigFish = makeRigFish({pBlob, pTaper, pDot});
     INK.fish = FISH_DAY;
     inkAt(x, y, s, 1, inkCreature(rigFish(phase), INK.fish, x, y, s));

   For the chart, feed the same rig to inkRig with the chart's current light and
   palette treatment. FISH_DAY contains daylight colors, not a night override.
   Give .fish-tail the existing joint convention (view-box / origin 0 0). A small
   tail turn is enough at these sizes; retain the clear fork throughout it.
   Widths above describe the painted shape; leave about 2 px around the ink edge.
*/

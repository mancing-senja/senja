/** Clothes.
 *
 *  The bust used to be a flat rectangle of one colour with a wavy seam down
 *  each side and a two-pixel V at the throat, and the four "outfits" changed
 *  only that V. Every villager was wearing the same shirt in a different
 *  dye. On a portrait where the head is authored pixel by pixel, that flat
 *  slab is the first thing the eye gives up on.
 *
 *  A garment is identified almost entirely by two things at this size: the
 *  shape of its neckline and whether it hangs open. Sleeve length, hem, fit —
 *  all of it is below the crop or off the edge. So that is what is authored
 *  here, following the same rule the rest of this file learned the hard way:
 *  **the silhouette is a hand-written table, the fill is arithmetic.**
 *
 *  `neck` is the lower edge of the neckline, one entry per column across the
 *  chest. It is the garment's signature. Everything else — fabric shading,
 *  folds, weave, the rim of light down the lit edge — is generated, because
 *  those are the parts arithmetic is actually good at.
 *
 *  The set is drawn from what people are wearing now: boxy jackets over
 *  fitted knits, cardigans layered open over a tee, technical shells, and
 *  the oversized-but-considered proportion that replaced head-to-toe
 *  oversizing. Two are local rather than borrowed — the batik shirt and the
 *  fisherman's flannel are what people in this valley would actually own. */

import type { PixelCanvas } from './canvas';
import { C } from './palette';

export type GarmentId =
  | 'knit' | 'cardigan' | 'varsity' | 'hoodie' | 'overshirt'
  | 'puffer' | 'batik' | 'tank' | 'flannel' | 'trench';

/** How the shoulder is cut. Visible as the seam that crosses it. */
type Seam = 'raglan' | 'set' | 'none';

/** Surface pattern. Reads as one or two pixels of texture, no more — at this
 *  size anything busier turns to noise and the garment loses its shape. */
type Weave = 'plain' | 'knit' | 'quilt' | 'batik' | 'check';

export interface Garment {
  id: GarmentId;
  label: string;
  /** Lower edge of the neckline, one entry per column from SX-13 to SX+13.
   *  Rows below SHOULDER_Y. -1 means the garment does not reach this column,
   *  which is how a tank top's bare shoulders are cut. */
  neck: readonly number[];
  /** Thickness of the collar band, in rows. 0 is a raw edge — a tee or a
   *  tank. A band is the difference between a sweater and a bedsheet. */
  band: number;
  /** Half-width of the centre opening. 0 is a closed garment. */
  open: number;
  /** How far down the opening runs, in rows below SHOULDER_Y. */
  openTo: number;
  seam: Seam;
  weave: Weave;
  fasten: 'zip' | 'button' | 'none';
  /** Whether a second garment shows through the opening. An open jacket over
   *  bare fabric reads as a hole; over an inner layer it reads as a jacket. */
  layered: boolean;
}

/** Builds a neckline from a few numbers instead of twenty-seven.
 *
 *  `depth` at the centre easing out to nothing at `reach`. `power` bends it:
 *  1 is a straight V, 2 a soft U, 4 a wide shallow scoop. */
function curve(depth: number, reach: number, power: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 27; i++) {
    const d = Math.abs(i - 13);
    if (d > reach) { out.push(-1); continue; }
    const t = 1 - d / reach;
    out.push(Math.round(depth * Math.pow(t, power)));
  }
  return out;
}

/** A notch lapel: two straight edges that fall away from a high point at the
 *  shoulder, with the notch cut where they meet. Jackets and coats. */
function lapel(depth: number, reach: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 27; i++) {
    const d = Math.abs(i - 13);
    if (d > reach) { out.push(-1); continue; }
    // Straight, not curved — a lapel is a folded edge and folds are flat.
    out.push(Math.max(1, Math.round(depth - d * (depth - 1) / reach)));
  }
  return out;
}

export const GARMENTS: Record<GarmentId, Garment> = {
  /** Fitted crewneck. The clean piece the boxy layers get worn over. */
  knit: {
    id: 'knit', label: 'rajut',
    neck: curve(3, 6, 2), band: 2, open: 0, openTo: 0,
    seam: 'set', weave: 'knit', fasten: 'none', layered: false,
  },

  /** Open over a tee. The most-worn layer of the last few years and the one
   *  that reads best small, because the opening does the work. */
  cardigan: {
    id: 'cardigan', label: 'kardigan',
    neck: curve(5, 7, 1), band: 1, open: 2, openTo: 20,
    seam: 'set', weave: 'knit', fasten: 'button', layered: true,
  },

  /** Boxy jacket, ribbed collar, contrast raglan sleeves. Ninety-per-cent of
   *  what "structured oversized" means at portrait scale is this collar. */
  varsity: {
    id: 'varsity', label: 'varsity',
    neck: curve(2, 7, 3), band: 3, open: 2, openTo: 20,
    seam: 'raglan', weave: 'plain', fasten: 'button', layered: true,
  },

  /** The hood is a roll of fabric behind the neck, not a shape on the head —
   *  down, it sits as a thick band that pushes the shoulders up. */
  hoodie: {
    id: 'hoodie', label: 'hoodie',
    neck: curve(2, 9, 4), band: 4, open: 1, openTo: 8,
    seam: 'raglan', weave: 'plain', fasten: 'none', layered: false,
  },

  /** Worn open over a tee, collar points spread. */
  overshirt: {
    id: 'overshirt', label: 'kemeja luar',
    neck: lapel(4, 8), band: 1, open: 3, openTo: 22,
    seam: 'set', weave: 'plain', fasten: 'button', layered: true,
  },

  /** Technical shell. High collar, horizontal channels, a zip that catches
   *  the light — the gorpcore piece. */
  puffer: {
    id: 'puffer', label: 'jaket teknis',
    neck: curve(1, 8, 4), band: 5, open: 1, openTo: 22,
    seam: 'none', weave: 'quilt', fasten: 'zip', layered: false,
  },

  /** Collarless, patterned, worn open or closed. Local, and the one garment
   *  here nobody had to import. */
  batik: {
    id: 'batik', label: 'batik',
    neck: curve(3, 7, 2), band: 1, open: 2, openTo: 20,
    seam: 'set', weave: 'batik', fasten: 'button', layered: false,
  },

  /** Summer. Straps and a deep scoop, so the collarbone shows — the only
   *  garment here that changes the silhouette rather than the neckline. */
  tank: {
    id: 'tank', label: 'tanktop',
    neck: curve(6, 5, 2), band: 0, open: 0, openTo: 0,
    seam: 'none', weave: 'plain', fasten: 'none', layered: false,
  },

  /** Heavy check, worn open, sleeves pushed. What people who work near water
   *  actually own. */
  flannel: {
    id: 'flannel', label: 'flanel',
    neck: lapel(4, 8), band: 2, open: 2, openTo: 22,
    seam: 'set', weave: 'check', fasten: 'button', layered: true,
  },

  /** Long, structured, wide lapels. The one that reads as dressed. */
  trench: {
    id: 'trench', label: 'mantel',
    neck: lapel(5, 10), band: 2, open: 3, openTo: 24,
    seam: 'set', weave: 'plain', fasten: 'button', layered: true,
  },
};

export const GARMENT_IDS = Object.keys(GARMENTS) as GarmentId[];

/** Colours the garment is drawn in. The caller owns these, because a shirt's
 *  colour comes from the character and the season, not from the cut. */
export interface Cloth {
  lit: number;
  base: number;
  shade: number;
  deep: number;
  /** Collar band, plackets and cuffs. */
  trim: number;
  /** What shows through an opening. */
  inner: number;
  innerShade: number;
  /** Zip teeth and buttons. */
  metal: number;
  /** Skin, for the throat under an open collar. */
  skin: number;
  skinShade: number;
}

/** Paints a garment over an already-filled torso.
 *
 *  The torso arrives as flat fabric with its own left-to-right shading. This
 *  adds the parts that make it a specific garment: the neckline, the collar
 *  band, the opening and what shows through it, the shoulder seam, the weave
 *  and the rim of light down the lit edge.
 *
 *  `halfAt` is the torso's own silhouette, so nothing is painted into thin
 *  air — the caller owns the body shape and this only decorates it. */
export function drawGarment(
  c: PixelCanvas, g: Garment, cl: Cloth,
  sx: number, top: number, bottom: number,
  halfAt: (row: number) => number,
): void {
  const inside = (x: number, y: number): boolean => {
    const h = halfAt(y);
    return h > 0 && x >= sx - h && x <= sx + h;
  };
  const put = (x: number, y: number, col: number): void => {
    if (y < top || y >= bottom) return;
    if (!inside(x, y)) return;
    c.set(x, y, col);
  };

  // --- the neckline, and the throat behind it
  for (let i = 0; i < 27; i++) {
    const x = sx - 13 + i;
    const d = g.neck[i];
    if (d < 0) {
      // The garment does not reach here: bare shoulder. Only the tank cuts
      // this way, and only out past the strap.
      for (let y = top; y < top + 4; y++) {
        if (inside(x, y)) c.set(x, y, x > sx + 4 ? cl.skinShade : cl.skin);
      }
      continue;
    }
    // Above the neckline is skin — chest and the hollow of the throat.
    for (let y = top; y < top + d; y++) {
      put(x, y, x > sx + 4 ? cl.skinShade : cl.skin);
    }
    // The band itself, sitting on the neckline.
    for (let b = 0; b < g.band; b++) {
      put(x, top + d + b, b === 0 ? cl.trim : cl.lit);
    }
    // One row of shadow under the band, or the fabric reads as painted on.
    if (g.band > 0) put(x, top + d + g.band, cl.shade);
  }

  // --- the opening, and the layer underneath it
  //
  // A V, widest at the neckline and closing as it falls. Drawn as a constant
  // width it came out as a dark bar down the middle of the chest — every
  // character appeared to be wearing a tie. An unfastened front seen from
  // this crop is a wedge of the layer underneath, and the wedge is what
  // makes the jacket read as a jacket.
  if (g.open > 0) {
    const run = Math.min(bottom - top, g.openTo);
    for (let k = 1; k < run; k++) {
      const y = top + k;
      const t = k / run;
      const w = Math.round(g.open * (1 - t * 0.85));
      if (w < 0) continue;
      if (g.layered) {
        for (let x = sx - w; x <= sx + w; x++) {
          put(x, y, x > sx ? cl.innerShade : cl.inner);
        }
      }
      // The two folded edges. Without them an opening is a stripe of another
      // colour; with them it is cloth lying over cloth.
      put(sx - w - 1, y, cl.lit);
      put(sx + w + 1, y, cl.deep);
    }
  }

  // --- fastenings
  if (g.fasten === 'zip') {
    for (let y = top + g.band + 1; y < bottom; y += 1) {
      put(sx, y, y % 2 === 0 ? cl.metal : cl.deep);
    }
  } else if (g.fasten === 'button') {
    const x = g.open > 0 ? sx - g.open - 2 : sx;
    for (let y = top + g.band + 3; y < bottom; y += 5) put(x, y, cl.metal);
  }

  // --- where the arm leaves the body
  //
  // The torso is one shape, and without this it stays one shape: a trapezoid
  // with a flat hem, which is a poncho. A single shaded column at the armpit
  // on each side is enough to separate arm from chest at this size, and it
  // is the difference between a person wearing a coat and a coat standing on
  // its own.
  for (let y = top + 5; y < bottom; y++) {
    const h = halfAt(y);
    if (h < 12) continue;
    const off = Math.round(h * 0.62);
    put(sx - off, y, cl.shade);
    put(sx + off, y, cl.deep);
  }

  // --- shoulder seam
  if (g.seam === 'raglan') {
    // Runs from the neck out and down to the armpit: the seam that makes a
    // jacket read as boxy rather than as a shirt.
    for (let k = 0; k < 12; k++) {
      put(sx - 7 - k, top + 2 + k, cl.shade);
      put(sx + 7 + k, top + 2 + k, cl.deep);
    }
  } else if (g.seam === 'set') {
    for (let k = 0; k < 5; k++) {
      put(sx - 12 - k, top + 4 + k * 2, cl.shade);
      put(sx + 12 + k, top + 4 + k * 2, cl.deep);
    }
  }

  // --- weave. One or two pixels, never more.
  for (let y = top + 2; y < bottom; y++) {
    for (let x = sx - 24; x <= sx + 24; x++) {
      if (!inside(x, y)) continue;
      const cur = c.get(x, y);
      // Only texture the fabric. Texturing the collar, the opening or the
      // skin is how a knit stitch ends up crawling across someone's throat.
      if (cur !== cl.base && cur !== cl.lit && cur !== cl.shade) continue;
      switch (g.weave) {
        case 'knit':
          // Alternating stitches, offset row to row.
          if ((x + (y % 2) * 2) % 4 === 0 && y % 2 === 0) {
            c.set(x, y, cur === cl.lit ? cl.base : cl.shade);
          }
          break;
        case 'quilt':
          // One shadow line per channel, and nothing else. Adding a lit row
          // as well gave every channel a bright bar and a dark bar, and the
          // jacket came out as venetian blinds — full-contrast stripes right
          // across the chest, which beat the collar and the zip for
          // attention and left no shape to read.
          if ((y - top) % 6 === 5) c.set(x, y, cl.shade);
          break;
        case 'check':
          // Warp lines heavier than weft, which is what makes a check read
          // as woven rather than as graph paper.
          if ((x - sx + 64) % 7 === 0) c.set(x, y, cl.shade);
          else if ((y - top) % 7 === 0 && cur !== cl.shade) {
            c.set(x, y, cur === cl.lit ? cl.base : cl.shade);
          }
          break;
        case 'batik': {
          // Motifs on a lattice, not a scatter. A stamped cloth repeats, and
          // single stray pixels of a bright trim read as dust on the shirt
          // rather than as a pattern — which is exactly how the first
          // version came out. Two-pixel marks on a 5x4 grid instead.
          const mx = (x - sx + 64) % 5;
          const my = (y - top) % 4;
          if (my === 0 && mx < 2) c.set(x, y, cl.shade);
          else if (my === 2 && (mx === 3 || mx === 4)) c.set(x, y, cl.lit);
          break;
        }
        default:
          break;
      }
    }
  }

  // --- folds. Two soft creases falling from the armpits.
  for (let y = top + 6; y < bottom; y++) {
    const s = Math.round(Math.sin((y - top) * 0.4) * 2);
    const h = halfAt(y);
    if (h <= 0) continue;
    const lx = sx - Math.round(h * 0.55) + s;
    const rx = sx + Math.round(h * 0.55) - s;
    if (c.get(lx, y) === cl.base) c.set(lx, y, cl.shade);
    if (c.get(rx, y) === cl.shade || c.get(rx, y) === cl.base) c.set(rx, y, cl.deep);
  }

  // --- rim light down the lit edge
  //
  // One pixel, on the left only, and only where the silhouette is turning
  // away from the viewer. This is the cheapest thing in the file and the
  // single biggest step from "flat shape" to "lit object" — it is what
  // separates current pixel work from the same shape drawn in 2012.
  for (let y = top; y < bottom; y++) {
    const h = halfAt(y);
    if (h <= 0) continue;
    // Fades out down the arm. Run at full strength the whole way it drew a
    // bright line from collar to hem and the bust read as backlit — a
    // silhouette with a glow behind it rather than a shoulder catching a
    // lamp.
    const t = (y - top) / Math.max(1, bottom - top);
    if (t > 0.75) continue;
    const x = sx - h;
    const cur = c.get(x, y);
    if (cur === cl.base || cur === cl.lit || cur === cl.shade) {
      c.set(x, y, t < 0.45 ? cl.lit : cl.base);
    }
  }
}

/** A palette-index ramp for a garment, four steps from one base colour. */
export function clothFrom(
  base: number, shade: number, trim: number, inner: number,
  skin: number, skinShade: number, shift: (col: number, n: number) => number,
): Cloth {
  return {
    lit: shift(base, 1),
    base,
    shade,
    deep: shift(shade, -1),
    trim,
    inner,
    innerShade: shift(inner, -1),
    metal: C.StoneLt,
    skin,
    skinShade,
  };
}

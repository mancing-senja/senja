/** Code-generated foliage.
 *
 *  Trees, bushes and reeds are grown from a seed rather than hand-drawn:
 *  a handful of overlapping canopy lobes, shaded with an ordered dither
 *  along the light direction, then top-lit and outlined. Every tree in the
 *  world gets its own seed, so the treeline never tiles visibly — which is
 *  the thing that makes a small pixel map feel cheap. */

import { BAYER4, PixelCanvas, Rng, TRANSPARENT, tileNoise, valueNoise } from './canvas';
import { C } from './palette';

/** Light comes from the upper-left, consistently, everywhere. */
export const LIGHT_X = -0.55;
export const LIGHT_Y = -0.83;

/** Same direction as a unit 3-vector, for shading rounded volumes. */
const LX = -0.44;
const LY = -0.66;
const LZ = 0.61;

interface Ramp {
  dark: number;
  mid: number;
  lit: number;
  hi: number;
}

const LEAF_RAMPS: Ramp[] = [
  { dark: C.ForestDp, mid: C.Forest, lit: C.GrassDk, hi: C.Grass },
  { dark: C.ForestDp, mid: C.Forest, lit: C.Grass, hi: C.GrassLt },
  { dark: C.Forest, mid: C.GrassDk, lit: C.Grass, hi: C.LeafLt },
];

const AUTUMN_RAMP: Ramp = { dark: C.WoodDk, mid: C.Wood, lit: C.Amber, hi: C.SunGlow };

export interface TreeOpts {
  w?: number;
  h?: number;
  autumn?: boolean;
  /** 0 = sapling, 1 = full canopy. */
  scale?: number;
}

export function makeTree(seed: number, opts: TreeOpts = {}): PixelCanvas {
  const rng = new Rng(seed * 7919 + 13);
  const scale = opts.scale ?? 1;
  const w = opts.w ?? Math.round(38 * scale);
  const h = opts.h ?? Math.round(52 * scale);
  const c = new PixelCanvas(w, h);
  const ramp = opts.autumn ? AUTUMN_RAMP : rng.pick(LEAF_RAMPS);

  const cx = w / 2;
  // The crown starts low and overlaps the trunk. A tall bare trunk with a
  // small ball on top is the classic look of a tree nobody looked at twice.
  const trunkTop = Math.round(h * 0.62);
  const trunkW = Math.max(4, Math.round(w * 0.15));
  const lean = rng.range(-1.4, 1.4);

  // --- trunk, with a root flare and bark grain
  for (let y = trunkTop; y < h - 1; y++) {
    const t = (y - trunkTop) / (h - 1 - trunkTop);
    const x = cx + lean * (1 - t) - trunkW / 2;
    const flare = t > 0.78 ? Math.round((t - 0.78) * 12) : 0;
    for (let i = -flare; i < trunkW + flare; i++) {
      const px = Math.round(x + i);
      const edgeL = i <= 0;
      const edgeR = i >= trunkW - 1 + flare;
      let col = edgeL ? C.Wood : edgeR ? C.WoodDp : C.WoodDk;
      // Bark: short vertical grooves, biased to the shaded side.
      if (!edgeL && valueNoise(px * 0.9, y * 0.3, seed * 7) > 0.66) col = C.WoodDp;
      c.set(px, y, col);
    }
  }

  // --- branches forking up into the canopy. Even mostly hidden by leaves,
  // the few visible pixels are what stop the tree reading as a lollipop.
  const branches = rng.int(2, 4);
  for (let b = 0; b < branches; b++) {
    const side = b % 2 === 0 ? -1 : 1;
    const startY = trunkTop + rng.range(0, h * 0.10);
    let bx = cx + lean * 0.5;
    let by = startY;
    const steps = Math.round(rng.range(h * 0.14, h * 0.24));
    const dx = side * rng.range(0.5, 0.95);
    for (let s = 0; s < steps; s++) {
      bx += dx;
      by -= rng.range(0.7, 1.1);
      c.set(Math.round(bx), Math.round(by), C.WoodDk);
      c.set(Math.round(bx), Math.round(by) + 1, C.WoodDp);
    }
  }

  // --- canopy: overlapping leaf clumps rather than one silhouette. Each
  // clump is shaded on its own so the crown has internal structure.
  const canopyCy = trunkTop - h * 0.26;
  const spreadX = w * 0.34;
  const spreadY = h * 0.15;
  const clumps: Array<{ x: number; y: number; rx: number; ry: number }> = [];
  const n = rng.int(6, 9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.35, 0.35);
    const d = i === 0 ? 0 : rng.range(0.5, 1.05);
    clumps.push({
      x: cx + Math.cos(a) * spreadX * d,
      y: canopyCy + Math.sin(a) * spreadY * d - (i === 0 ? h * 0.07 : 0),
      rx: rng.range(w * 0.22, w * 0.32),
      ry: rng.range(h * 0.13, h * 0.19),
    });
  }

  for (const b of clumps) {
    // Scalloped edge: the clump radius wobbles with angle, so the outline
    // is leafy instead of circular.
    for (let y = Math.floor(b.y - b.ry - 2); y <= Math.ceil(b.y + b.ry + 2); y++) {
      for (let x = Math.floor(b.x - b.rx - 2); x <= Math.ceil(b.x + b.rx + 2); x++) {
        const dx = (x - b.x) / b.rx;
        const dy = (y - b.y) / b.ry;
        const ang = Math.atan2(dy, dx);
        const wob = 0.88 + 0.13 * Math.sin(ang * rng.int(5, 8) + b.x);
        if (dx * dx + dy * dy > wob * wob) continue;
        c.set(x, y, ramp.mid);
      }
    }
  }

  // --- shade every leaf pixel by how the light rakes across the crown
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (c.get(x, y) !== ramp.mid) continue;
      // Distance from the nearest clump centre gives each clump its own
      // rounded shading instead of one flat gradient over the whole crown.
      let best = 9e9;
      let bnx = 0;
      let bny = 0;
      for (const b of clumps) {
        const dx = (x - b.x) / b.rx;
        const dy = (y - b.y) / b.ry;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          bnx = dx;
          bny = dy;
        }
      }
      // Shade each clump as a sphere rather than by height alone. A purely
      // vertical falloff quantises into horizontal stripes across the whole
      // crown, which is the single most obvious tell of generated foliage.
      const r2 = Math.min(1, bnx * bnx + bny * bny);
      const nz = Math.sqrt(1 - r2);
      let lightDot = bnx * LX + bny * LY + nz * LZ;
      // A gentle bias so the bottom of the whole crown still sits in shade.
      lightDot += ((canopyCy - y) / (h * 0.6)) * 0.22;
      lightDot += (valueNoise(x * 0.55, y * 0.55, seed) - 0.5) * 0.52;
      // A strong ordered dither is what keeps the four-step ramp from
      // terracing into visible contour bands across a big crown.
      const bayer = ((y & 3) * 4 + (x & 3)) / 16 - 0.5;
      const v = lightDot + bayer * 0.42;
      c.set(x, y, v > 0.86 ? ramp.hi : v > 0.55 ? ramp.lit : v > 0.18 ? ramp.mid : ramp.dark);
    }
  }

  // --- a couple of short leaf sprays off the underside of the crown
  for (let i = 0; i < rng.int(1, 3); i++) {
    const b = rng.pick(clumps);
    const hx = Math.round(b.x + rng.range(-b.rx * 0.7, b.rx * 0.7));
    const hy = Math.round(b.y + b.ry);
    const len = rng.int(2, 3);
    for (let k = 0; k < len; k++) c.setUnder(hx, hy + k, ramp.dark);
  }

  // --- shadow pockets inside the crown, where one clump sits behind another
  for (let i = 0; i < rng.int(2, 4); i++) {
    const b = rng.pick(clumps);
    const gx = b.x + rng.range(-b.rx * 0.5, b.rx * 0.5);
    const gy = b.y + rng.range(0, b.ry * 0.7);
    // Dithered against the mid tone, never against transparency: punching
    // holes through the crown leaves outlined gaps once the outline pass
    // runs, which looks like a rendering bug rather than shade.
    c.ditherDisc(gx, gy, rng.range(1.4, 2.6), rng.range(1.0, 1.8), ramp.mid, ramp.dark, 0.75);
  }

  // Foliage is outlined in the darkest green rather than near-black: a hard
  // black keyline round every tree makes a whole wood look like stickers.
  c.outline(C.ForestDp, false);
  outlineTrunk(c, trunkTop);
  rimLight(c, ramp.hi, trunkTop);
  return c;
}

/** The trunk keeps a proper dark keyline — it needs to read against grass,
 *  and it is small enough that a hard outline does not dominate. */
function outlineTrunk(c: PixelCanvas, trunkTop: number): void {
  for (let y = trunkTop; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const v = c.get(x, y);
      if (v !== C.Wood && v !== C.WoodDk && v !== C.WoodDp) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]] as const) {
        if (c.get(x + dx, y + dy) === TRANSPARENT) c.set(x + dx, y + dy, C.InkDeep);
      }
    }
  }
}

/** Rim highlight along the upper-left of the crown: the first opaque pixel
 *  going down each column, but only on the lit side. A full top-row light
 *  reads as a sticker outline. */
function rimLight(c: PixelCanvas, hi: number, trunkTop: number): void {
  for (let x = 0; x < c.w * 0.66; x++) {
    for (let y = 0; y < Math.min(trunkTop, c.h); y++) {
      const v = c.get(x, y);
      if (v === TRANSPARENT || v === C.InkDeep || v === C.ForestDp) continue;
      c.set(x, y, hi);
      break;
    }
  }
}

/** A bare, half-drowned tree for the swamp. No canopy — the silhouette is
 *  the whole point, so the branches get the detail the leaves would. */
export function makeDeadTree(seed: number): PixelCanvas {
  const rng = new Rng(seed * 15731 + 29);
  const w = 26;
  const h = rng.int(34, 46);
  const c = new PixelCanvas(w, h);
  const cx = w / 2;
  const lean = rng.range(-2, 2);

  // Trunk, thinning toward the top.
  for (let y = h - 1; y > h * 0.12; y--) {
    const t = (h - 1 - y) / (h - 1);
    const tw = Math.max(1, Math.round(3.2 * (1 - t * 0.7)));
    const x = Math.round(cx + lean * t);
    for (let i = 0; i < tw; i++) {
      c.set(x + i, y, i === 0 ? C.Slate : i === tw - 1 ? C.WoodDp : C.WoodDk);
    }
  }

  // Branches: a few forks, each thinning as it goes.
  for (let b = 0; b < rng.int(3, 6); b++) {
    const startT = rng.range(0.35, 0.9);
    let bx = cx + lean * startT;
    let by = h - 1 - startT * (h - 1);
    const dir = rng.chance(0.5) ? -1 : 1;
    const len = rng.int(5, 12);
    let dx = dir * rng.range(0.6, 1.1);
    for (let s = 0; s < len; s++) {
      bx += dx;
      by -= rng.range(0.5, 1.0);
      dx *= 0.96;
      c.set(Math.round(bx), Math.round(by), s > len * 0.6 ? C.Slate : C.WoodDk);
      if (s < len * 0.4) c.set(Math.round(bx), Math.round(by) + 1, C.WoodDp);
    }
    // A twig off the end.
    if (rng.chance(0.6)) {
      for (let s = 0; s < 3; s++) {
        c.set(Math.round(bx + dir * s), Math.round(by - s), C.Slate);
      }
    }
  }

  c.outline(C.InkDeep, false);
  return c;
}

export function makeBush(seed: number): PixelCanvas {
  const rng = new Rng(seed * 104729 + 7);
  const w = rng.int(16, 24);
  const h = rng.int(11, 16);
  const c = new PixelCanvas(w, h);
  // Bushes are dense shade, so they sit *darker* than the field they stand
  // in. Shading them in the same greens as the grass leaves nothing but an
  // outline visible, which is exactly how it looked before.
  const ramp: Ramp = { dark: C.ForestDp, mid: C.Forest, lit: C.GrassDk, hi: C.Grass };
  const lobes = rng.int(3, 5);
  const blobs: Array<{ x: number; y: number; rx: number; ry: number }> = [];
  for (let i = 0; i < lobes; i++) {
    const x = (w / (lobes + 1)) * (i + 1) + rng.range(-2, 2);
    const y = h * 0.62 + rng.range(-2, 1);
    const b = { x, y, rx: rng.range(w * 0.2, w * 0.3), ry: rng.range(h * 0.3, h * 0.44) };
    blobs.push(b);
    c.disc(b.x, b.y, b.rx, b.ry, ramp.mid);
  }
  // Same spherical shading as the tree crowns, so the two read as the same
  // kind of plant at different sizes.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (c.get(x, y) !== ramp.mid) continue;
      let best = 9e9;
      let bnx = 0;
      let bny = 0;
      for (const b of blobs) {
        const dx = (x - b.x) / b.rx;
        const dy = (y - b.y) / b.ry;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; bnx = dx; bny = dy; }
      }
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, bnx * bnx + bny * bny)));
      let v = bnx * LX + bny * LY + nz * LZ;
      v += (valueNoise(x * 0.55, y * 0.55, seed) - 0.5) * 0.45;
      v += ((h * 0.62 - y) / h) * 0.25;
      const bayer = ((y & 3) * 4 + (x & 3)) / 16 - 0.5;
      v += bayer * 0.38;
      c.set(x, y, v > 0.88 ? ramp.hi : v > 0.58 ? ramp.lit : v > 0.22 ? ramp.mid : ramp.dark);
    }
  }
  // Berries, sometimes.
  if (rng.chance(0.45)) {
    for (let i = 0; i < rng.int(2, 5); i++) {
      const bx = rng.int(2, w - 3);
      const by = rng.int(Math.floor(h * 0.4), h - 3);
      if (c.get(bx, by) !== TRANSPARENT) c.set(bx, by, rng.chance(0.5) ? C.Red : C.Rose);
    }
  }
  c.outline(C.ForestDp, false);
  return c;
}

export function makeRock(seed: number): PixelCanvas {
  const rng = new Rng(seed * 31337 + 3);
  const w = rng.int(10, 18);
  const h = rng.int(7, 12);
  const c = new PixelCanvas(w, h);
  const cx = w / 2;
  const cy = h * 0.62;
  c.disc(cx, cy, w * 0.42, h * 0.38, C.SlateLt);
  // Faceted top-left highlight, bottom-right shade.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (c.get(x, y) !== C.SlateLt) continue;
      const nx = (x - cx) / (w * 0.5);
      const ny = (y - cy) / (h * 0.5);
      const d = nx * LIGHT_X + ny * LIGHT_Y + (valueNoise(x * 0.7, y * 0.7, seed) - 0.5) * 0.5;
      c.set(x, y, d > 0.45 ? C.Mist : d > -0.1 ? C.SlateLt : C.Slate);
    }
  }
  if (rng.chance(0.5)) {
    // A little moss on the shaded side.
    for (let i = 0; i < rng.int(3, 7); i++) {
      const mx = rng.int(1, w - 2);
      const my = rng.int(Math.floor(h * 0.5), h - 2);
      if (c.get(mx, my) !== TRANSPARENT) c.set(mx, my, C.GrassDk);
    }
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** Reeds along the shoreline. Drawn as thin arcs so they animate well
 *  when the renderer shears them for wind. */
export function makeReed(seed: number): PixelCanvas {
  const rng = new Rng(seed * 65537 + 11);
  const w = 12;
  const h = rng.int(12, 20);
  const c = new PixelCanvas(w, h);
  const blades = rng.int(3, 6);
  for (let i = 0; i < blades; i++) {
    const rootX = rng.range(3, w - 4);
    const bend = rng.range(-3.5, 3.5);
    const top = rng.range(h * 0.1, h * 0.45);
    const shade = rng.chance(0.4) ? C.Forest : rng.chance(0.5) ? C.GrassDk : C.Grass;
    for (let y = h - 1; y >= top; y--) {
      const t = (h - 1 - y) / (h - 1 - top);
      const x = rootX + bend * t * t;
      c.set(Math.round(x), y, shade);
      if (t > 0.75 && rng.chance(0.3)) c.set(Math.round(x) + 1, y, C.GrassLt);
    }
    // Cattail head.
    if (rng.chance(0.3)) {
      const x = Math.round(rootX + bend);
      for (let y = top - 3; y < top + 1; y++) {
        c.set(x, y, C.WoodDk);
        c.set(x + 1, y, C.Wood);
      }
    }
  }
  return c;
}

export function makeFlowerTuft(seed: number): PixelCanvas {
  const rng = new Rng(seed * 99991 + 5);
  const c = new PixelCanvas(12, 10);
  const petal = rng.pick([C.White, C.Rose, C.Lantern, C.SunGlow, C.Red]);
  for (let i = 0; i < rng.int(2, 4); i++) {
    const x = rng.int(2, 9);
    const y = rng.int(2, 6);
    c.set(x, y + 1, C.GrassDk);
    c.set(x, y + 2, C.GrassDk);
    c.set(x, y, petal);
    if (rng.chance(0.7)) {
      c.set(x - 1, y, petal);
      c.set(x + 1, y, petal);
      c.set(x, y - 1, petal);
    }
    c.set(x, y, C.SunGlow);
  }
  return c;
}

export function makeLilyPad(seed: number): PixelCanvas {
  const rng = new Rng(seed * 7717 + 23);
  const w = rng.int(9, 14);
  const h = Math.max(5, Math.round(w * 0.62));
  const c = new PixelCanvas(w, h + 2);
  c.disc(w / 2, h / 2 + 1, w * 0.45, h * 0.42, C.GrassDk);
  c.ditherDisc(w / 2 - 1, h / 2, w * 0.32, h * 0.3, C.GrassDk, C.Grass, 0.7);
  // The notch that makes a lily pad read as a lily pad.
  const a = rng.range(0, Math.PI * 2);
  c.line(
    Math.round(w / 2), Math.round(h / 2 + 1),
    Math.round(w / 2 + Math.cos(a) * w * 0.5), Math.round(h / 2 + 1 + Math.sin(a) * h * 0.5),
    TRANSPARENT,
  );
  if (rng.chance(0.3)) {
    c.set(Math.round(w / 2), Math.round(h / 2), C.White);
    c.set(Math.round(w / 2) + 1, Math.round(h / 2), C.Rose);
    c.set(Math.round(w / 2), Math.round(h / 2) - 1, C.Lantern);
  }
  return c;
}

/** 16x16 ground tiles, generated as a small set of variants so the field
 *  is textured without a visible repeat. */
/** Grass comes in three tones. The renderer picks between them with a
 *  low-frequency noise over tile coordinates, which gives the field large
 *  soft patches of light and shade — the thing that stops a big lawn from
 *  looking like one flat colour. */
export function makeGrassTile(seed: number, tone: 0 | 1 | 2): PixelCanvas {
  const rng = new Rng(seed * 5381 + 17 + tone * 977);
  const c = new PixelCanvas(16, 16);

  // Every tone shares the same two base colours. Only the amount of light
  // caught by the blades changes. Changing the base colour per tone gives
  // you visible rectangular blocks wherever the patches meet — the tile
  // grid shows straight through.
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // Tileable, so the texture continues into the next tile instead of
      // restarting at its edge. Plain tile-local noise put a visible seam
      // on every boundary and the whole field read as a grid.
      const n = tileNoise(x, y, 16, 0.19, 7 + seed * 131);
      c.set(x, y, n > 0.54 ? C.GrassDk : C.Forest);
    }
  }

  // Shaded patches get a dithered wash of the darker green; sunlit patches
  // get more lit blades. A 4x4 dither boundary reads as a soft edge where a
  // colour boundary reads as a seam.
  if (tone === 0) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (BAYER4[(y & 3) * 4 + (x & 3)] < 7) c.set(x, y, C.Forest);
      }
    }
  }

  // Blades wrap around the tile edge rather than keeping clear of it.
  // Insetting them left a blade-free lane down every seam, and a field of
  // that is a lattice of empty lines — the single loudest source of the
  // grid, louder than the noise seam was.
  const wrap = (px: number, py: number, col: number): void => {
    c.set(((px % 16) + 16) % 16, ((py % 16) + 16) % 16, col);
  };
  const blades = tone === 0 ? rng.int(1, 2) : tone === 1 ? rng.int(3, 4) : rng.int(5, 7);
  for (let i = 0; i < blades; i++) {
    const x = rng.int(0, 15);
    const y = rng.int(0, 15);
    wrap(x, y, C.GrassDk);
    wrap(x, y - 1, tone === 2 ? C.Grass : C.GrassDk);
    if (tone === 2 && rng.chance(0.6)) wrap(x + 1, y - 2, C.GrassLt);
    else if (rng.chance(0.4)) wrap(x + 1, y - 2, C.Grass);
  }
  return c;
}

/** A clump of taller blades, scattered as a prop. Breaks up the flatness
 *  of the field far more effectively than more tile variants would. */
export function makeTallGrass(seed: number): PixelCanvas {
  const rng = new Rng(seed * 2749 + 31);
  const w = 14;
  const h = rng.int(9, 14);
  const c = new PixelCanvas(w, h);
  for (let i = 0; i < rng.int(5, 9); i++) {
    const rootX = rng.range(2, w - 3);
    const bend = rng.range(-2.6, 2.6);
    const top = rng.range(0, h * 0.45);
    const dark = rng.chance(0.45);
    for (let y = h - 1; y >= top; y--) {
      const t = (h - 1 - y) / Math.max(1, h - 1 - top);
      const x = Math.round(rootX + bend * t * t);
      c.set(x, y, dark ? C.Forest : C.GrassDk);
      if (t > 0.7) c.set(x, y, dark ? C.GrassDk : C.Grass);
      if (t > 0.9 && rng.chance(0.5)) c.set(x, y, C.GrassLt);
    }
  }
  return c;
}

/** Pebbles for the waterline. Tiny, but a bare sand-to-water transition
 *  always looks unfinished. */
export function makePebbles(seed: number): PixelCanvas {
  const rng = new Rng(seed * 6421 + 13);
  const c = new PixelCanvas(16, 8);
  for (let i = 0; i < rng.int(3, 7); i++) {
    const x = rng.int(1, 14);
    const y = rng.int(1, 6);
    const big = rng.chance(0.35);
    const col = rng.chance(0.5) ? C.SlateLt : C.Slate;
    c.set(x, y, col);
    if (big) {
      c.set(x + 1, y, col);
      c.set(x, y + 1, C.Slate);
      c.set(x, y - 1, C.Mist);
    }
  }
  return c;
}

/** A ragged strip of grass along one edge of a tile, overlaid where soil
 *  meets field. Without it every dirt patch in the game is a rectangle,
 *  which is the fastest way to make a hand-made world look machine-made. */
export function makeFringe(seed: number, dir: 0 | 1 | 2 | 3): PixelCanvas {
  const rng = new Rng(seed * 7793 + dir * 613 + 5);
  const c = new PixelCanvas(16, 16);
  for (let i = 0; i < 16; i++) {
    const depth = Math.max(0, Math.round(
      1.3 + Math.sin(i * 0.9 + seed) * 0.9 + (rng.next() - 0.5) * 1.6,
    ));
    for (let d = 0; d < depth; d++) {
      // Matches the field's own two shades, so the fringe reads as grass
      // spilling over the edge rather than as an outline around the soil.
      const shade = d === depth - 1 ? C.Forest : C.GrassDk;
      switch (dir) {
        case 0: c.set(i, d, shade); break;            // grass above
        case 1: c.set(15 - d, i, shade); break;       // grass to the right
        case 2: c.set(i, 15 - d, shade); break;       // grass below
        default: c.set(d, i, shade); break;           // grass to the left
      }
    }
    // Occasional blade poking further into the soil.
    if (rng.chance(0.18)) {
      const d = depth + rng.int(1, 2);
      switch (dir) {
        case 0: c.set(i, d, C.GrassDk); break;
        case 1: c.set(15 - d, i, C.GrassDk); break;
        case 2: c.set(i, 15 - d, C.GrassDk); break;
        default: c.set(d, i, C.GrassDk); break;
      }
    }
  }
  return c;
}

export function makeDirtTile(seed: number, tilled: boolean): PixelCanvas {
  const rng = new Rng(seed * 2654435761 + 41);
  const c = new PixelCanvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = valueNoise((x + seed * 16) * 0.35, (y + seed * 16) * 0.35, 19);
      c.set(x, y, n > 0.6 ? C.Wood : n > 0.32 ? C.WoodDk : C.WoodDp);
    }
  }
  if (tilled) {
    // Furrows, with a lit crest and a shaded trough.
    for (let y = 1; y < 16; y += 4) {
      c.hline(0, y, 16, C.Wood);
      c.hline(0, y + 1, 16, C.WoodDp);
    }
  }
  for (let i = 0; i < rng.int(1, 4); i++) c.set(rng.int(0, 15), rng.int(0, 15), C.Slate);
  return c;
}

/** One planting bed, 32x20, covering a whole 2x1 plot. Drawn as a single
 *  object rather than as tiles so the furrows line up and the bed reads as
 *  something a person built. */
export function makePlotBed(seed: number): PixelCanvas {
  const rng = new Rng(seed * 3571 + 91);
  const w = 32;
  const h = 20;
  const c = new PixelCanvas(w, h);

  // Mounded soil with a soft, slightly irregular outline. The bed is
  // deliberately darker than the dry apron around it — turned, damp earth
  // reads that way, and it makes the plots findable at a glance.
  for (let y = 2; y < h - 1; y++) {
    const t = (y - 2) / (h - 3);
    const inset = Math.round(1.6 + Math.sin(t * Math.PI) * -1.2 + (rng.next() - 0.5) * 1.2);
    for (let x = inset; x < w - inset; x++) c.set(x, y, C.WoodDp);
  }
  // Grain and clods.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (c.get(x, y) !== C.WoodDp) continue;
      const n = valueNoise(x * 0.4, y * 0.4, seed * 3 + 5);
      if (n > 0.58) c.set(x, y, C.WoodDk);
    }
  }
  // Two furrows, broken up along their length. Unbroken lines across the
  // whole bed read as planks, not as turned earth.
  for (let k = 0; k < 2; k++) {
    const y = 7 + k * 6;
    for (let x = 3; x < w - 3; x++) {
      if (c.get(x, y) === TRANSPARENT) continue;
      if (valueNoise(x * 0.6, k * 4.0, 13) < 0.28) continue;
      c.set(x, y, C.Wood);
      if (c.get(x, y + 1) !== TRANSPARENT) c.set(x, y + 1, C.WoodDp);
    }
  }
  // A lit top lip and a shaded bottom edge, so the bed sits proud of the
  // soil around it.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (c.get(x, y) === TRANSPARENT) continue;
      c.set(x, y, C.Amber);
      break;
    }
    for (let y = h - 1; y >= 0; y--) {
      if (c.get(x, y) === TRANSPARENT) continue;
      c.set(x, y, C.InkDeep);
      break;
    }
  }
  return c;
}

export function makeSandTile(seed: number): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // Muted, not beach-holiday orange: this is lake silt, and a loud
      // sand band would cut the shoreline in half visually.
      const n = valueNoise((x + seed * 16) * 0.3, (y + seed * 16) * 0.3, 29);
      c.set(x, y, n > 0.68 ? C.Amber : n > 0.34 ? C.Wood : C.WoodDk);
    }
  }
  return c;
}

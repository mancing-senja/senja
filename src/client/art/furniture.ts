/** Furniture and interior surfaces.
 *
 *  Rooms are lit from a lamp, not from the sun, so the light direction here
 *  is softer and the contrast lower than outdoors. What still applies: a
 *  dark line and a light line at every plane change, and enough value steps
 *  that nothing terraces.
 *
 *  Each piece is drawn with its feet at the bottom of the canvas, so the
 *  same y-sorting the outdoor props use works indoors unchanged. */

import { BAYER4, PixelCanvas, Rng, valueNoise } from './canvas';
import { C } from './palette';

// ---------------------------------------------------------------- surfaces

/** The floor. Boards for wood-built rooms, flagstones for a keep.
 *
 *  The floor is deliberately a value step *lighter* than its wall. In a room
 *  seen from above, floor and wall have nearly the same silhouette, so value
 *  is the only thing telling you which is which — a keep whose flagstones
 *  match its masonry reads as one flat grey field. */
export function makeFloorTile(seed: number, style: 'cozy' | 'medieval' | 'cyber' | 'fantasy'): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  const [dark, mid, lit] = style === 'medieval'
    ? [C.StoneDk, C.StoneLt, C.StonePale]
    : style === 'cyber'
      ? [C.CyberVoid, C.CyberSlate, C.CyberSteel]
      : style === 'fantasy'
        ? [C.Ink, C.Forest, C.GrassDk]
        : [C.WoodDp, C.WoodDk, C.Wood];

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = valueNoise((x + seed * 16) * 0.35, y * (style === 'medieval' ? 0.35 : 0.9), 17);
      c.set(x, y, n > 0.62 ? lit : mid);
    }
  }

  if (style === 'medieval') {
    // Flagstones: a grid of big slabs, offset course by course, each with a
    // worn lit edge on the two sides the lamp reaches.
    const off = (seed * 5) % 8;
    for (let y = 0; y < 16; y += 8) {
      c.hline(0, y, 16, dark);
      for (let x = (off + y) % 8; x < 16; x += 8) c.vline(x, y, 8, dark);
      for (let x = 0; x < 16; x++) if (c.get(x, y + 1) !== dark) c.set(x, y + 1, lit);
    }
    return c;
  }

  // Board seams every five rows, with a lit edge above each.
  for (let y = 0; y < 16; y += 5) {
    c.hline(0, y, 16, dark);
    c.hline(0, y + 1, 16, lit);
  }
  // Butt joints, staggered.
  const joint = (seed * 7) % 16;
  for (let y = 0; y < 16; y += 5) {
    const jx = (joint + y * 3) % 16;
    for (let k = 1; k < 5; k++) c.set(jx, y + k, dark);
  }
  return c;
}

/** The wall band along the back and sides of a room. */
export function makeWallTile(seed: number, style: 'cozy' | 'medieval' | 'cyber' | 'fantasy'): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  const [dark, mid, lit] = style === 'medieval'
    ? [C.StoneShadow, C.StoneDk, C.Stone]
    : style === 'cyber'
      ? [C.InkDeep, C.CyberVoid, C.CyberSlate]
      : style === 'fantasy'
        ? [C.InkDeep, C.Ink, C.Purple]
        : [C.WoodDp, C.WoodDk, C.Wood];

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = valueNoise((x + seed * 16) * 0.3, (y + seed * 16) * 0.3, 23);
      c.set(x, y, n > 0.6 ? mid : dark);
    }
  }
  if (style === 'medieval') {
    // Ashlar courses.
    for (let y = 0; y < 16; y += 4) {
      c.hline(0, y, 16, dark);
      c.hline(0, y + 1, 16, lit);
      const off = ((y / 4) % 2) * 4;
      for (let x = off; x < 16; x += 8) c.vline(x, y, 4, dark);
    }
  } else if (style === 'cyber') {
    // Panel seams and a thin light strip.
    c.vline(0, 0, 16, C.CyberSlate);
    c.hline(0, 0, 16, C.CyberSlate);
    if (seed % 3 === 0) c.hline(0, 12, 16, C.NeonCyan);
  } else {
    // Vertical boards.
    for (let x = 0; x < 16; x += 4) {
      c.vline(x, 0, 16, dark);
      c.vline(x + 1, 0, 16, lit);
    }
  }
  // Where wall meets floor there is always a shadow.
  c.hline(0, 15, 16, C.InkDeep);
  return c;
}

/** A patterned rug. Small pattern, two colours plus a border. */
export function makeRugTile(seed: number): PixelCanvas {
  const rng = new Rng(seed * 5527 + 3);
  const c = new PixelCanvas(16, 16);
  const [a, b] = rng.pick([
    [C.Banner, C.Rose], [C.BannerBlue, C.WaterSh], [C.Forest, C.GrassDk],
    [C.Purple, C.Dusk], [C.Wood, C.Amber],
  ] as Array<[number, number]>);
  c.fill(a);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if ((x + y) % 6 === 0 || (x - y + 32) % 6 === 0) c.set(x, y, b);
    }
  }
  return c;
}

// -------------------------------------------------------------- furniture

export function makeBed(seed: number): PixelCanvas {
  const rng = new Rng(seed * 3167 + 7);
  const c = new PixelCanvas(24, 34);
  // Frame.
  c.rect(1, 4, 22, 29, C.WoodDp);
  c.rect(2, 5, 20, 27, C.WoodDk);
  // Headboard.
  c.rect(1, 0, 22, 6, C.WoodDk);
  c.hline(1, 0, 22, C.Wood);
  for (let x = 4; x < 20; x += 4) c.vline(x, 1, 4, C.WoodDp);
  // Mattress and blanket.
  c.rect(3, 6, 18, 24, C.Pale);
  c.hline(3, 6, 18, C.White);
  const blanket = rng.pick([C.Banner, C.BannerBlue, C.Forest, C.Purple]);
  c.rect(3, 15, 18, 15, blanket);
  c.hline(3, 15, 18, C.White);
  for (let y = 18; y < 30; y += 4) c.hline(4, y, 16, C.InkDeep);
  // Pillow.
  c.rect(5, 8, 14, 6, C.White);
  c.rect(6, 9, 12, 4, C.Pale);
  c.hline(5, 8, 14, C.White);
  // Feet.
  c.rect(2, 32, 3, 2, C.WoodDp);
  c.rect(19, 32, 3, 2, C.WoodDp);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeTable(seed: number): PixelCanvas {
  const rng = new Rng(seed * 9781 + 5);
  const c = new PixelCanvas(26, 20);
  // Top, seen slightly from above.
  c.rect(0, 2, 26, 8, C.WoodDk);
  c.rect(1, 3, 24, 6, C.Wood);
  c.hline(0, 2, 26, C.Amber);
  c.hline(0, 9, 26, C.WoodDp);
  for (let x = 3; x < 24; x += 5) c.vline(x, 3, 6, C.WoodDk);
  // Legs.
  for (const lx of [2, 21]) {
    c.rect(lx, 10, 3, 9, C.WoodDp);
    c.vline(lx, 10, 9, C.WoodDk);
  }
  // Something on it.
  if (rng.chance(0.6)) {
    c.rect(9, 0, 5, 3, C.Pale);      // a bowl
    c.hline(9, 0, 5, C.White);
  }
  if (rng.chance(0.5)) {
    c.rect(17, -1, 3, 4, C.Foam);    // a cup
    c.set(20, 0, C.Foam);
  }
  c.outline(C.InkDeep, false);
  return c;
}

export function makeChair(): PixelCanvas {
  const c = new PixelCanvas(12, 18);
  c.rect(1, 0, 10, 9, C.WoodDk);
  c.rect(2, 1, 8, 7, C.Wood);
  for (let y = 2; y < 8; y += 2) c.hline(2, y, 8, C.WoodDp);
  c.rect(1, 9, 10, 3, C.WoodDp);
  c.hline(1, 9, 10, C.Amber);
  for (const lx of [2, 8]) c.rect(lx, 12, 2, 6, C.WoodDp);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeChest(): PixelCanvas {
  const c = new PixelCanvas(18, 16);
  c.rect(0, 4, 18, 12, C.WoodDp);
  c.rect(1, 5, 16, 10, C.WoodDk);
  // Curved lid.
  for (let y = 0; y < 5; y++) {
    const inset = Math.max(0, 2 - y);
    for (let x = inset; x < 18 - inset; x++) c.set(x, y, y < 2 ? C.Wood : C.WoodDk);
  }
  c.hline(2, 0, 14, C.Amber);
  // Iron bands and a lock.
  for (const bx of [3, 13]) c.vline(bx, 0, 16, C.Slate);
  c.rect(8, 6, 3, 4, C.Gold);
  c.set(9, 8, C.InkDeep);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeShelf(seed: number): PixelCanvas {
  const rng = new Rng(seed * 6421 + 13);
  const c = new PixelCanvas(22, 28);
  c.rect(0, 0, 22, 28, C.WoodDp);
  c.rect(1, 1, 20, 26, C.WoodDk);
  for (let y = 7; y < 28; y += 8) {
    c.hline(1, y, 20, C.Wood);
    c.hline(1, y + 1, 20, C.WoodDp);
    // Books and jars on each shelf.
    let x = 3;
    while (x < 18) {
      const w = rng.int(2, 4);
      const col = rng.pick([C.Banner, C.BannerBlue, C.Forest, C.Purple, C.Amber, C.Pale]);
      for (let k = 0; k < w && x + k < 19; k++) {
        c.vline(x + k, y - 5, 5, k === 0 ? C.White : col);
      }
      x += w + rng.int(0, 1);
    }
  }
  c.outline(C.InkDeep, false);
  return c;
}

export function makeStove(): PixelCanvas {
  const c = new PixelCanvas(20, 26);
  c.rect(1, 6, 18, 20, C.Slate);
  c.rect(2, 7, 16, 18, C.SlateLt);
  c.rect(3, 8, 14, 16, C.Slate);
  // Firebox, lit.
  c.rect(5, 14, 10, 8, C.InkDeep);
  c.rect(6, 16, 8, 5, C.Fire);
  c.rect(7, 17, 6, 3, C.Lantern);
  c.hline(5, 14, 10, C.Slate);
  // Hotplate and flue.
  c.rect(0, 4, 20, 3, C.SlateLt);
  c.hline(0, 4, 20, C.Mist);
  c.rect(13, 0, 4, 5, C.Slate);
  c.vline(13, 0, 5, C.SlateLt);
  // A pot.
  c.rect(3, 1, 6, 3, C.Slate);
  c.hline(3, 1, 6, C.Mist);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeAnvil(): PixelCanvas {
  const c = new PixelCanvas(20, 18);
  // Stump.
  c.rect(4, 10, 12, 8, C.WoodDp);
  c.rect(5, 11, 10, 6, C.WoodDk);
  // Anvil body: horn, face, waist, base.
  c.rect(2, 4, 16, 3, C.SlateLt);
  c.hline(2, 4, 16, C.Mist);
  c.rect(6, 7, 8, 3, C.Slate);
  for (let i = 0; i < 4; i++) c.set(1 - 0 + i, 5 + (i > 1 ? 1 : 0), C.Slate);
  c.rect(4, 9, 12, 2, C.Slate);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeTerminalDesk(): PixelCanvas {
  const c = new PixelCanvas(24, 24);
  // Desk.
  c.rect(0, 12, 24, 4, C.CyberSlate);
  c.hline(0, 12, 24, C.CyberSteel);
  c.rect(1, 16, 3, 8, C.CyberVoid);
  c.rect(20, 16, 3, 8, C.CyberVoid);
  // Screens.
  for (const [sx, sw] of [[3, 9], [13, 8]] as const) {
    c.rect(sx, 2, sw, 10, C.InkDeep);
    c.frame(sx, 2, sw, 10, C.CyberSlate);
    c.rect(sx + 1, 3, sw - 2, 8, C.Ink);
    for (let y = 4; y < 10; y += 2) {
      const len = 2 + ((sx + y) % (sw - 3));
      for (let x = sx + 2; x < sx + 2 + len; x++) c.set(x, y, C.NeonMint);
    }
  }
  // Keyboard and a mug.
  c.rect(5, 10, 12, 2, C.CyberSteel);
  c.set(19, 10, C.Rose);
  c.set(19, 11, C.Rose);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeBarrelIn(): PixelCanvas {
  const c = new PixelCanvas(14, 18);
  c.disc(7, 3, 6, 2.6, C.WoodDp);
  c.rect(1, 3, 12, 13, C.WoodDk);
  c.vline(2, 3, 13, C.Wood);
  c.vline(3, 3, 13, C.Amber);
  c.vline(11, 3, 13, C.WoodDp);
  c.hline(1, 6, 12, C.Slate);
  c.hline(1, 12, 12, C.Slate);
  c.disc(7, 16, 6, 1.8, C.WoodDp);
  c.outline(C.InkDeep, false);
  return c;
}

export function makePlantPot(seed: number): PixelCanvas {
  const rng = new Rng(seed * 8123 + 9);
  const c = new PixelCanvas(16, 22);
  // Pot.
  for (let y = 14; y < 22; y++) {
    const t = (y - 14) / 8;
    const half = Math.round(5 - t * 1.5);
    for (let x = 8 - half; x <= 8 + half; x++) {
      c.set(x, y, x < 6 ? C.Orange : x > 10 ? C.Red : C.Wood);
    }
  }
  c.hline(2, 14, 12, C.Amber);
  // Leaves.
  for (let i = 0; i < rng.int(4, 7); i++) {
    const a = (i / 6) * Math.PI - Math.PI / 2 + rng.range(-0.3, 0.3);
    const len = rng.int(5, 10);
    for (let k = 0; k < len; k++) {
      const x = Math.round(8 + Math.cos(a) * k * 0.8);
      const y = Math.round(14 - Math.sin(Math.abs(a)) * k * 0.9 - k * 0.3);
      c.set(x, y, k > len - 3 ? C.GrassLt : C.GrassDk);
      c.set(x + 1, y, C.Forest);
    }
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** A standing lamp. The glow itself is drawn additively at runtime. */
export function makeLampIn(): PixelCanvas {
  const c = new PixelCanvas(14, 26);
  c.rect(6, 8, 2, 16, C.Slate);
  c.rect(4, 24, 6, 2, C.SlateLt);
  // Shade.
  for (let y = 0; y < 8; y++) {
    const half = 3 + y;
    for (let x = 7 - half; x <= 6 + half; x++) {
      c.set(x, y, x < 7 - half + 2 ? C.SunGlow : C.Amber);
    }
  }
  c.hline(0, 7, 14, C.Wood);
  // Light spilling out of the bottom.
  for (let x = 2; x < 12; x++) {
    if (BAYER4[(8 & 3) * 4 + (x & 3)] < 9) c.set(x, 8, C.Lantern);
  }
  c.outline(C.InkDeep, false);
  return c;
}

export function makeWindowIn(): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  c.rect(0, 0, 16, 16, C.WoodDp);
  c.rect(1, 1, 14, 14, C.WoodDk);
  c.rect(2, 2, 12, 12, C.WaterBr);
  c.rect(2, 2, 12, 5, C.Foam);
  c.vline(8, 2, 12, C.WoodDk);
  c.hline(2, 8, 12, C.WoodDk);
  c.hline(0, 15, 16, C.Wood);
  c.outline(C.InkDeep, false);
  return c;
}

export function makePainting(seed: number): PixelCanvas {
  const rng = new Rng(seed * 4409 + 17);
  const c = new PixelCanvas(18, 14);
  c.rect(0, 0, 18, 14, C.Gold);
  c.rect(1, 1, 16, 12, C.WoodDp);
  // A tiny landscape: sky, hill, water.
  c.rect(2, 2, 14, 5, rng.pick([C.Amber, C.WaterSh, C.Purple]));
  c.rect(2, 7, 14, 3, C.Forest);
  c.rect(2, 10, 14, 2, C.Water);
  c.set(5, 4, C.SunGlow);
  c.outline(C.InkDeep, false);
  return c;
}

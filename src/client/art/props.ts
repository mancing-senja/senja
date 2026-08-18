/** Built things: the cabin, the dock, lanterns, crates, signs — plus the
 *  small item art (fish, crops, bobber, ripples). */

import { BAYER4, PixelCanvas, Rng, TRANSPARENT } from './canvas';
import { C } from './palette';

export function makeCabin(): PixelCanvas {
  const w = 64;
  const h = 56;
  const c = new PixelCanvas(w, h);

  // Walls: horizontal log courses.
  const wallTop = 22;
  for (let y = wallTop; y < h - 2; y++) {
    const course = ((y - wallTop) / 3) | 0;
    const lit = course % 2 === 0;
    for (let x = 6; x < w - 6; x++) {
      c.set(x, y, lit ? C.Wood : C.WoodDk);
    }
    if ((y - wallTop) % 3 === 2) c.hline(6, y, w - 12, C.WoodDp);
  }
  // Light rakes across from the left.
  for (let y = wallTop; y < h - 2; y++) for (let x = 6; x < 14; x++) {
    if (c.get(x, y) === C.WoodDk) c.set(x, y, C.Wood);
    else if (c.get(x, y) === C.Wood) c.set(x, y, C.Amber);
  }

  // Roof: shingled, overhanging.
  for (let y = 0; y <= wallTop; y++) {
    const half = Math.round((y / wallTop) * (w / 2 - 1)) + 2;
    for (let x = w / 2 - half; x <= w / 2 + half; x++) {
      const shingle = ((y / 3) | 0) % 2 === 0;
      let col = shingle ? C.Rose : C.Purple;
      if (x < w / 2 - half + 4) col = shingle ? C.Red : C.Rose; // lit edge
      c.set(x, y, col);
    }
    if (y % 3 === 0) c.hline(w / 2 - half, y, half * 2 + 1, C.Dusk);
  }
  c.hline(2, wallTop, w - 4, C.WoodDp);
  c.hline(2, wallTop + 1, w - 4, C.WoodDk);

  // Door.
  const dx = 27;
  c.rect(dx, h - 20, 11, 18, C.WoodDp);
  c.rect(dx + 1, h - 19, 9, 16, C.WoodDk);
  c.vline(dx + 5, h - 19, 16, C.WoodDp);
  c.set(dx + 8, h - 11, C.Lantern);

  // Windows with warm light inside.
  for (const wx of [12, 44]) {
    c.rect(wx, h - 26, 10, 9, C.WoodDp);
    c.rect(wx + 1, h - 25, 8, 7, C.Lantern);
    c.vline(wx + 5, h - 25, 7, C.WoodDp);
    c.hline(wx + 1, h - 22, 8, C.WoodDp);
    c.rect(wx + 1, h - 25, 3, 3, C.SunGlow);
  }

  // Chimney.
  c.rect(46, 2, 8, 12, C.Slate);
  c.rect(47, 3, 6, 11, C.SlateLt);
  c.hline(45, 1, 10, C.Mist);

  c.outline(C.InkDeep, false);
  return c;
}

/** Village houses. Same construction as the cabin but parameterised, so a
 *  street of them reads as a street rather than as one asset repeated. */
export interface HouseStyle {
  w: number;
  h: number;
  roof: number;
  roofDark: number;
  wall: number;
  wallLit: number;
}

export const HOUSE_STYLES: HouseStyle[] = [
  { w: 56, h: 52, roof: C.Rose, roofDark: C.Purple, wall: C.WoodDk, wallLit: C.Wood },
  { w: 68, h: 58, roof: C.Forest, roofDark: C.ForestDp, wall: C.Wood, wallLit: C.Amber },
  { w: 48, h: 46, roof: C.Amber, roofDark: C.Wood, wall: C.WoodDk, wallLit: C.Wood },
  { w: 62, h: 50, roof: C.SlateLt, roofDark: C.Slate, wall: C.WoodDp, wallLit: C.WoodDk },
  { w: 44, h: 42, roof: C.Orange, roofDark: C.Red, wall: C.Wood, wallLit: C.Amber },
];

export function makeHouse(style: HouseStyle, seed: number): PixelCanvas {
  const rng = new Rng(seed * 40503 + 17);
  const { w, h } = style;
  const c = new PixelCanvas(w, h);
  const wallTop = Math.round(h * 0.40);

  // Walls: horizontal board courses, lit from the left.
  for (let y = wallTop; y < h - 2; y++) {
    const course = ((y - wallTop) / 3) | 0;
    for (let x = 5; x < w - 5; x++) {
      c.set(x, y, course % 2 === 0 ? style.wallLit : style.wall);
    }
    if ((y - wallTop) % 3 === 2) c.hline(5, y, w - 10, C.WoodDp);
  }
  for (let y = wallTop; y < h - 2; y++) {
    for (let x = 5; x < 12; x++) {
      if (c.get(x, y) === style.wall) c.set(x, y, style.wallLit);
    }
  }

  // Roof, overhanging both sides.
  for (let y = 0; y <= wallTop; y++) {
    const half = Math.round((y / wallTop) * (w / 2 - 1)) + 2;
    for (let x = w / 2 - half; x <= w / 2 + half; x++) {
      const shingle = ((y / 3) | 0) % 2 === 0;
      let col = shingle ? style.roof : style.roofDark;
      if (x < w / 2 - half + 4) col = shingle ? style.roof : style.roof;
      c.set(x, y, col);
    }
    if (y % 3 === 0) c.hline(w / 2 - half, y, half * 2 + 1, style.roofDark);
  }
  c.hline(1, wallTop, w - 2, C.WoodDp);
  c.hline(1, wallTop + 1, w - 2, C.WoodDk);

  // Door, offset a little so the houses are not all symmetrical.
  const dx = Math.round(w * rng.range(0.32, 0.56));
  c.rect(dx, h - 18, 11, 16, C.WoodDp);
  c.rect(dx + 1, h - 17, 9, 14, C.WoodDk);
  c.vline(dx + 5, h - 17, 14, C.WoodDp);
  c.set(dx + 8, h - 10, C.Lantern);

  // Windows, warm inside.
  const windows = w > 55 ? 2 : 1;
  for (let i = 0; i < windows; i++) {
    const wx = i === 0 ? 9 : w - 20;
    c.rect(wx, h - 24, 10, 9, C.WoodDp);
    c.rect(wx + 1, h - 23, 8, 7, C.Lantern);
    c.vline(wx + 5, h - 23, 7, C.WoodDp);
    c.hline(wx + 1, h - 20, 8, C.WoodDp);
    c.rect(wx + 1, h - 23, 3, 3, C.SunGlow);
  }

  // Chimney, on one side or the other.
  const cx = rng.chance(0.5) ? Math.round(w * 0.25) : Math.round(w * 0.68);
  c.rect(cx, 2, 7, Math.round(wallTop * 0.55), C.Slate);
  c.rect(cx + 1, 3, 5, Math.round(wallTop * 0.55) - 1, C.SlateLt);
  c.hline(cx - 1, 1, 9, C.Mist);

  c.outline(C.InkDeep, false);
  return c;
}

export function makeRowboat(): PixelCanvas {
  const w = 32;
  const h = 24;
  const c = new PixelCanvas(w, h);

  const boat = [
    "................................",
    "................................",
    ".............777777.............",
    "..........777888888777..........",
    "........77888aaaaaa88877........",
    "......7788aaaa7777aaaa8877......",
    ".....788aaaaaa7777aaaaaa887.....",
    "....788aaaaaaa7777aaaaaaa887....",
    "...788aaaaaaaa7777aaaaaaaa887...",
    "..788aaaaaaaaa7777aaaaaaaaa887..",
    "..788aaaaaaaaa7777aaaaaaaaa887..",
    "...788aaaaaaaa7777aaaaaaaa887...",
    "....788aaaaaaa7777aaaaaaa887....",
    ".....788aaaaaa7777aaaaaa887.....",
    "......7788aaaa7777aaaa8877......",
    "........77888aaaaaa88877........",
    "..........777888888777..........",
    ".............777777.............",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
  ];
  c.stamp(0, 0, boat);

  // Outline
  c.outline(C.InkDeep, true);
  return c;
}

/** The community board in the square: two posts, a plank face, and a row of
 *  pinned notes. It is the physical anchor for the room's shared records. */
export function makeNoticeBoard(): PixelCanvas {
  const c = new PixelCanvas(30, 30);
  // Posts.
  c.rect(3, 16, 3, 14, C.WoodDk);
  c.rect(24, 16, 3, 14, C.WoodDk);
  c.vline(3, 16, 14, C.Wood);
  c.vline(24, 16, 14, C.Wood);
  // Board face, planked.
  c.rect(1, 4, 28, 15, C.WoodDk);
  for (let y = 4; y < 19; y += 4) c.hline(1, y, 28, C.Wood);
  c.frame(1, 4, 28, 15, C.WoodDp);
  c.hline(1, 4, 28, C.Amber);
  // Little roof so the notes stay dry.
  for (let y = 0; y <= 3; y++) {
    const half = 12 + y;
    for (let x = 15 - half; x <= 14 + half; x++) c.set(x, y, y < 2 ? C.Rose : C.Purple);
  }
  // Pinned notes.
  for (const [nx, ny, w, h] of [[4, 7, 8, 6], [14, 6, 7, 8], [22, 9, 5, 5]] as const) {
    c.rect(nx, ny, w, h, C.White);
    c.hline(nx, ny, w, C.Pale);
    for (let l = 1; l < h - 1; l += 2) c.hline(nx + 1, ny + l, w - 2, C.Mist);
    c.set(nx + (w >> 1), ny, C.Red);
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** The village well — the thing that makes a cluster of houses a village. */
export function makeWell(): PixelCanvas {
  const c = new PixelCanvas(24, 32);
  // Stone ring.
  c.disc(12, 25, 9, 5, C.Slate);
  c.disc(12, 24, 8, 4.2, C.SlateLt);
  c.disc(12, 24, 6, 3, C.InkDeep);
  for (let i = 0; i < 24; i++) {
    if ((i / 3 | 0) % 2 === 0) c.set(i, 21, C.Mist);
  }
  // Posts and roof.
  c.rect(4, 6, 2, 16, C.WoodDk);
  c.rect(18, 6, 2, 16, C.WoodDk);
  for (let y = 0; y <= 7; y++) {
    const half = Math.round((y / 7) * 11) + 1;
    for (let x = 12 - half; x <= 12 + half; x++) {
      c.set(x, y, ((y / 2) | 0) % 2 === 0 ? C.Rose : C.Purple);
    }
  }
  // Bucket on a rope.
  c.vline(12, 8, 6, C.Pale);
  c.rect(10, 14, 5, 4, C.WoodDk);
  c.hline(10, 14, 5, C.Wood);
  c.outline(C.InkDeep, false);
  return c;
}

/** Fence segment. `dir` 0 = running east-west, 1 = north-south. */
export function makeFence(dir: 0 | 1): PixelCanvas {
  const c = dir === 0 ? new PixelCanvas(16, 14) : new PixelCanvas(8, 18);
  if (dir === 0) {
    c.rect(2, 2, 2, 12, C.WoodDk);
    c.rect(12, 2, 2, 12, C.WoodDk);
    c.hline(0, 5, 16, C.Wood);
    c.hline(0, 6, 16, C.WoodDp);
    c.hline(0, 9, 16, C.Wood);
    c.hline(0, 10, 16, C.WoodDp);
    c.hline(2, 2, 2, C.Amber);
    c.hline(12, 2, 2, C.Amber);
  } else {
    c.rect(3, 0, 2, 18, C.WoodDk);
    c.vline(3, 0, 18, C.Wood);
    c.hline(1, 5, 6, C.Wood);
    c.hline(1, 11, 6, C.Wood);
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** A market stall, for the middle of the square. */
export function makeStall(): PixelCanvas {
  const c = new PixelCanvas(38, 34);
  // Awning stripes.
  for (let x = 0; x < 38; x++) {
    const stripe = ((x / 4) | 0) % 2 === 0;
    for (let y = 4; y < 12; y++) {
      c.set(x, y + Math.round(Math.sin(x * 0.45) * 0.6), stripe ? C.Red : C.White);
    }
  }
  c.hline(0, 3, 38, C.WoodDp);
  // Posts.
  c.rect(2, 10, 2, 22, C.WoodDk);
  c.rect(34, 10, 2, 22, C.WoodDk);
  // Counter and goods.
  c.rect(1, 22, 36, 4, C.Wood);
  c.hline(1, 22, 36, C.Amber);
  c.rect(1, 26, 36, 6, C.WoodDk);
  for (let i = 0; i < 5; i++) {
    const x = 5 + i * 7;
    c.disc(x, 20, 2.2, 2, i % 2 === 0 ? C.Red : C.Orange);
    c.set(x - 1, 19, C.Rose);
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** Dock planking. `dir` 0 = running north-south, 1 = east-west. */
export function makeDockTile(seed: number, dir: 0 | 1): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  const rng = new Rng(seed * 8191 + dir * 977);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const along = dir === 0 ? y : x;
      const across = dir === 0 ? x : y;
      const plank = (across / 4) | 0;
      let col = plank % 2 === 0 ? C.Wood : C.WoodDk;
      if (across % 4 === 3) col = C.WoodDp;
      if (along % 16 === 0) col = C.WoodDp;
      c.set(x, y, col);
    }
  }
  // Grain: short strokes running with the planks. Random dots read as
  // dirt on the screen rather than as wood.
  for (let i = 0; i < 4; i++) {
    const x = rng.int(0, 15);
    const y = rng.int(0, 13);
    const len = rng.int(2, 4);
    for (let k = 0; k < len; k++) {
      if (dir === 0) c.set(x, y + k, C.WoodDp);
      else c.set(x + k, y, C.WoodDp);
    }
  }
  return c;
}

export function makeDockPost(): PixelCanvas {
  const c = new PixelCanvas(6, 14);
  c.rect(1, 0, 4, 14, C.WoodDk);
  c.vline(1, 0, 14, C.Wood);
  c.vline(4, 0, 14, C.WoodDp);
  c.hline(1, 0, 4, C.Amber);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeLantern(): PixelCanvas {
  const c = new PixelCanvas(10, 28);
  // Post.
  c.rect(4, 8, 2, 20, C.WoodDk);
  c.vline(4, 8, 20, C.Wood);
  // Arm and housing.
  c.hline(4, 8, 3, C.WoodDk);
  c.rect(2, 9, 6, 8, C.Slate);
  c.rect(3, 10, 4, 6, C.Lantern);
  c.rect(3, 10, 2, 2, C.White);
  c.hline(2, 8, 6, C.SlateLt);
  c.hline(2, 17, 6, C.Slate);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeCrate(): PixelCanvas {
  const c = new PixelCanvas(14, 14);
  c.rect(0, 2, 14, 12, C.WoodDk);
  c.rect(1, 3, 12, 10, C.Wood);
  c.frame(1, 3, 12, 10, C.WoodDp);
  c.line(1, 3, 12, 12, C.WoodDp);
  c.line(12, 3, 1, 12, C.WoodDp);
  c.hline(1, 3, 12, C.Amber);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeBarrel(): PixelCanvas {
  const c = new PixelCanvas(12, 16);
  c.disc(6, 3, 5, 2.4, C.WoodDp);
  c.rect(1, 3, 10, 12, C.WoodDk);
  c.vline(2, 3, 12, C.Wood);
  c.vline(3, 3, 12, C.Amber);
  c.vline(9, 3, 12, C.WoodDp);
  c.hline(1, 6, 10, C.Slate);
  c.hline(1, 11, 10, C.Slate);
  c.disc(6, 15, 5, 1.6, C.WoodDp);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeSign(): PixelCanvas {
  const c = new PixelCanvas(16, 18);
  c.rect(7, 8, 2, 10, C.WoodDk);
  c.rect(1, 2, 14, 8, C.Wood);
  c.frame(1, 2, 14, 8, C.WoodDp);
  c.hline(2, 4, 8, C.WoodDp);
  c.hline(2, 6, 10, C.WoodDp);
  c.outline(C.InkDeep, false);
  return c;
}

export function makeBucket(full: boolean): PixelCanvas {
  const c = new PixelCanvas(12, 12);
  c.rect(2, 3, 8, 9, C.Slate);
  c.rect(3, 4, 6, 7, C.SlateLt);
  c.vline(3, 4, 7, C.Mist);
  if (full) {
    c.rect(3, 4, 6, 2, C.WaterBr);
    c.hline(3, 4, 6, C.Foam);
  }
  c.line(2, 3, 6, 0, C.Slate);
  c.line(6, 0, 10, 3, C.Slate);
  c.outline(C.InkDeep, false);
  return c;
}

// ------------------------------------------------------------------ items

export interface FishArt {
  body: number;
  belly: number;
  fin: number;
  /** Body proportions, so species are told apart by silhouette and not
   *  only by colour: 'round' bream, 'long' eels, 'flat' rays, 'normal'. */
  shape?: 'normal' | 'long' | 'round' | 'flat' | 'spiny'
    | 'ribbon' | 'fan' | 'bulb' | 'arrow';
  /** Extra markings. */
  marks?: 'none' | 'stripes' | 'spots' | 'band' | 'mesh' | 'ocelli' | 'blotch';
}

export const FISH_LOOKS: Record<string, FishArt> = {
  wader: { body: C.Forest, belly: C.GrassLt, fin: C.GrassDk, marks: 'spots' },
  nila: { body: C.SlateLt, belly: C.Pale, fin: C.Slate, shape: 'round', marks: 'stripes' },
  sepat: { body: C.Mist, belly: C.White, fin: C.SlateLt, shape: 'flat', marks: 'band' },
  gabus: { body: C.ForestDp, belly: C.GrassDk, fin: C.Forest, shape: 'long', marks: 'spots' },
  betok: { body: C.GrassDk, belly: C.LeafLt, fin: C.Forest, shape: 'spiny' },
  lele: { body: C.WoodDp, belly: C.Wood, fin: C.WoodDk, shape: 'long' },
  sunfish: { body: C.Amber, belly: C.SunGlow, fin: C.Orange, shape: 'round' },
  tawes: { body: C.Pale, belly: C.White, fin: C.Mist, shape: 'round', marks: 'stripes' },
  moonperch: { body: C.SlateLt, belly: C.Pale, fin: C.Mist, marks: 'band' },
  emberkoi: { body: C.Orange, belly: C.Lantern, fin: C.Red, shape: 'round', marks: 'spots' },
  duskeel: { body: C.Purple, belly: C.Rose, fin: C.Dusk, shape: 'long' },
  glassfin: { body: C.WaterBr, belly: C.Foam, fin: C.WaterSh, marks: 'none' },
  belida: { body: C.Slate, belly: C.SlateLt, fin: C.Ink, shape: 'flat', marks: 'spots' },
  arwana: { body: C.Lantern, belly: C.SunGlow, fin: C.Amber, shape: 'long', marks: 'stripes' },
  seluang: { body: C.Foam, belly: C.White, fin: C.WaterBr },
  patin: { body: C.Mist, belly: C.Pale, fin: C.SlateLt, shape: 'long' },
  jelawat: { body: C.GrassLt, belly: C.LeafLt, fin: C.GrassDk, shape: 'round' },
  hampala: { body: C.SunGlow, belly: C.White, fin: C.Red, marks: 'stripes' },
  bawal: { body: C.Rose, belly: C.Pale, fin: C.Red, shape: 'flat' },
  ikanhantu: { body: C.Dusk, belly: C.Purple, fin: C.Ink, shape: 'long', marks: 'band' },
  bintangair: { body: C.White, belly: C.Foam, fin: C.WaterBr, shape: 'round', marks: 'spots' },
  oldboot: { body: C.WoodDk, belly: C.Wood, fin: C.WoodDp, shape: 'flat' },
  kaleng: { body: C.SlateLt, belly: C.Mist, fin: C.Slate, shape: 'flat' },

  gurame: { body: C.SlateLt, belly: C.Pale, fin: C.Slate, shape: 'round', marks: 'mesh' },
  nilem: { body: C.Mist, belly: C.White, fin: C.SlateLt, marks: 'mesh' },
  bader: { body: C.Pale, belly: C.White, fin: C.Mist, shape: 'flat', marks: 'stripes' },
  lukas: { body: C.GrassDk, belly: C.GrassLt, fin: C.Forest, marks: 'blotch' },
  keting: { body: C.WoodDk, belly: C.Wood, fin: C.WoodDp, shape: 'spiny' },
  baung: { body: C.Wood, belly: C.SkinSh, fin: C.WoodDp, shape: 'long', marks: 'blotch' },
  tambakan: { body: C.Rose, belly: C.Pale, fin: C.Purple, shape: 'round', marks: 'band' },
  sepatsiam: { body: C.Mist, belly: C.White, fin: C.SlateLt, shape: 'flat', marks: 'stripes' },
  lais: { body: C.Pale, belly: C.White, fin: C.Mist, shape: 'ribbon' },
  toman: { body: C.ForestDp, belly: C.Orange, fin: C.Forest, shape: 'long', marks: 'blotch' },
  kelabau: { body: C.SkinSh, belly: C.Skin, fin: C.Wood, shape: 'round', marks: 'mesh' },
  betutu: { body: C.WoodDp, belly: C.WoodDk, fin: C.Ink, shape: 'bulb', marks: 'blotch' },
  sili: { body: C.Forest, belly: C.GrassDk, fin: C.ForestDp, shape: 'ribbon', marks: 'ocelli' },
  tengadak: { body: C.Pale, belly: C.White, fin: C.Red, shape: 'round' },
  genggehek: { body: C.Foam, belly: C.White, fin: C.WaterBr, shape: 'arrow', marks: 'stripes' },
  waderpari: { body: C.GrassLt, belly: C.White, fin: C.GrassDk, marks: 'stripes' },
  paray: { body: C.Foam, belly: C.White, fin: C.WaterSh, shape: 'arrow' },
  beunteur: { body: C.Amber, belly: C.SunGlow, fin: C.Wood, marks: 'spots' },
  hampalaraja: { body: C.SunGlow, belly: C.White, fin: C.Red, shape: 'arrow', marks: 'stripes' },
  jambal: { body: C.Mist, belly: C.Pale, fin: C.Slate, shape: 'long' },

  lelebulan: { body: C.Slate, belly: C.SlateLt, fin: C.Ink, shape: 'long', marks: 'spots' },
  udanggalah: { body: C.Orange, belly: C.SunGlow, fin: C.Red, shape: 'arrow', marks: 'stripes' },
  sidatmuda: { body: C.ForestDp, belly: C.GrassDk, fin: C.Ink, shape: 'ribbon' },
  ikankaca: { body: C.Pale, belly: C.White, fin: C.Foam, shape: 'flat', marks: 'mesh' },
  betikapi: { body: C.Red, belly: C.Orange, fin: C.Lantern, shape: 'fan', marks: 'ocelli' },
  kepitingrawa: { body: C.Red, belly: C.Rose, fin: C.WoodDp, shape: 'bulb', marks: 'spots' },
  gabusraja: { body: C.Ink, belly: C.Forest, fin: C.GrassDk, shape: 'long', marks: 'blotch' },

  ikanperisai: { body: C.Stone, belly: C.StoneLt, fin: C.StoneShadow, shape: 'flat', marks: 'mesh' },
  lelemenara: { body: C.StoneDk, belly: C.Stone, fin: C.StoneShadow, shape: 'long', marks: 'blotch' },
  ikanlonceng: { body: C.Gold, belly: C.StonePale, fin: C.StoneDk, shape: 'bulb' },
  koipusaka: { body: C.Banner, belly: C.StonePale, fin: C.Gold, shape: 'round', marks: 'spots' },
  ikankunci: { body: C.StoneLt, belly: C.StonePale, fin: C.Gold, shape: 'arrow', marks: 'band' },
  guramibatu: { body: C.StoneDk, belly: C.Stone, fin: C.StoneShadow, shape: 'round', marks: 'mesh' },
  belutparit: { body: C.StoneShadow, belly: C.StoneDk, fin: C.BannerBlue, shape: 'ribbon', marks: 'ocelli' },

  ikansolder: { body: C.CyberSteel, belly: C.StonePale, fin: C.Orange, marks: 'blotch' },
  sirippanel: { body: C.CyberSlate, belly: C.CyberSteel, fin: C.NeonCyan, shape: 'flat', marks: 'mesh' },
  ikankabel: { body: C.CyberVoid, belly: C.CyberSlate, fin: C.NeonMint, shape: 'ribbon', marks: 'stripes' },
  parineon: { body: C.CyberSlate, belly: C.NeonCyan, fin: C.NeonMagenta, shape: 'flat', marks: 'ocelli' },
  ikanglitch: { body: C.NeonMagenta, belly: C.NeonMint, fin: C.NeonCyan, shape: 'arrow', marks: 'blotch' },
  bawalkrom: { body: C.StonePale, belly: C.White, fin: C.CyberSteel, shape: 'round' },
  lelevoltase: { body: C.CyberVoid, belly: C.CyberSteel, fin: C.NeonCyan, shape: 'long', marks: 'spots' },
  ikanpendingin: { body: C.WaterBr, belly: C.Foam, fin: C.CyberSteel, shape: 'bulb', marks: 'mesh' },

  ikanlentera: { body: C.Arcane, belly: C.ArcaneLt, fin: C.SunGlow, shape: 'bulb', marks: 'ocelli' },
  sisikkabut: { body: C.ArcaneLt, belly: C.White, fin: C.Mist, marks: 'mesh' },
  ikanakar: { body: C.Forest, belly: C.GrassDk, fin: C.WoodDk, shape: 'fan', marks: 'blotch' },
  ikandoa: { body: C.White, belly: C.SunGlow, fin: C.ArcaneLt, shape: 'fan' },
  naganilamuda: { body: C.Arcane, belly: C.NeonMint, fin: C.ArcaneLt, shape: 'long', marks: 'band' },
  ikanpurnama: { body: C.SunGlow, belly: C.White, fin: C.ArcaneLt, shape: 'round', marks: 'ocelli' },
  ikanbisik: { body: C.Mist, belly: C.White, fin: C.ArcaneLt, shape: 'arrow' },
  sidatcahaya: { body: C.NeonMint, belly: C.White, fin: C.Arcane, shape: 'ribbon', marks: 'stripes' },

  jaringsobek: { body: C.Mist, belly: C.Pale, fin: C.Slate, shape: 'flat', marks: 'mesh' },
  botolkaca: { body: C.Foam, belly: C.White, fin: C.WaterSh, shape: 'bulb' },
  rantaikarat: { body: C.WoodDk, belly: C.Wood, fin: C.WoodDp, shape: 'ribbon', marks: 'mesh' },
  papandermaga: { body: C.Wood, belly: C.WoodDk, fin: C.WoodDp, shape: 'flat', marks: 'stripes' },

  // --- Benteng Lama. Stone colours and heraldic accents; these live in the
  // cold water of the moat and under the walls.
  lelemail: { body: C.Stone, belly: C.StoneLt, fin: C.StoneDk, shape: 'long', marks: 'stripes' },
  koibenteng: { body: C.Gold, belly: C.SunGlow, fin: C.Banner, shape: 'round', marks: 'spots' },
  ikanpanji: { body: C.BannerBlue, belly: C.Pale, fin: C.Gold, marks: 'band' },

  // --- Dermaga Neon. Warm outfall water, chrome and circuitry.
  kromsirip: { body: C.CyberSteel, belly: C.StonePale, fin: C.NeonCyan, marks: 'stripes' },
  ikanstatik: { body: C.CyberSlate, belly: C.NeonMint, fin: C.NeonMagenta, shape: 'flat', marks: 'spots' },
  nikelmas: { body: C.Gold, belly: C.StonePale, fin: C.CyberSteel, shape: 'round' },

  // --- Rimbun Cahaya. Everything here glows a little.
  ikanrembulan: { body: C.ArcaneLt, belly: C.White, fin: C.Arcane, shape: 'round', marks: 'spots' },
  sisikembun: { body: C.NeonMint, belly: C.White, fin: C.Foam, marks: 'stripes' },
  naganila: { body: C.Arcane, belly: C.ArcaneLt, fin: C.NeonMint, shape: 'long', marks: 'band' },
};

/** A fish, drawn to size. Used for the catch card and the shop list. */
/** How a fish grows into its grade.
 *
 *  A grade is drawn, not tinted. See escalate() below for what each tier
 *  adds; the short version is that the silhouette changes at every step,
 *  because a fish you can identify as legendary from its shadow is
 *  legendary and one you can only identify from its colour is the same
 *  fish with a filter on. */
export function makeFish(
  look: FishArt, seed: number, w = 22, h = 12, tier = 0,
): PixelCanvas {
  const rng = new Rng(seed * 6151 + 37);
  const c = new PixelCanvas(w, h);
  const cy = h / 2;
  const noseX = 1;
  const shape = look.shape ?? 'normal';
  const tailX = Math.round(w * (
    shape === 'ribbon' ? 0.88 : shape === 'long' ? 0.80
      : shape === 'round' || shape === 'bulb' ? 0.64
        : shape === 'arrow' ? 0.76 : 0.70));
  const girth =
    shape === 'round' ? 0.50
      : shape === 'bulb' ? 0.52
        : shape === 'fan' ? 0.34
          : shape === 'ribbon' ? 0.14
            : shape === 'long' ? 0.24
              : shape === 'flat' ? 0.46
                : shape === 'arrow' ? 0.30 : 0.40;

  // --- body: a tapered spindle, not an ellipse. The taper toward the nose
  // and the wrist in front of the tail are what make it read as a fish.
  for (let x = noseX; x < tailX; x++) {
    const t = (x - noseX) / (tailX - noseX);
    const fat =
      shape === 'long' || shape === 'ribbon'
        ? Math.sin(Math.pow(t, 0.5) * Math.PI) * 0.7 + 0.3
        // A bulb is widest right behind the head and falls away fast; an
        // arrow is the reverse. Those two profiles alone read as different
        // animals before any colour is applied.
        : shape === 'bulb' ? Math.sin(Math.pow(t, 1.6) * Math.PI)
          : shape === 'arrow' ? Math.sin(Math.pow(t, 0.42) * Math.PI)
            : Math.sin(Math.pow(t, 0.75) * Math.PI);
    const half = Math.max(0.6, fat * h * girth * (1 - t * 0.25));
    for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) {
      c.set(x, y, look.body);
    }
  }

  // --- belly: lighter underside, dithered so the transition stays pixel art
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (c.get(x, y) !== look.body) continue;
      const t = (y - cy) / (h * 0.42);
      const bayer = ((y & 3) * 4 + (x & 3)) / 16 - 0.5;
      if (t + bayer * 0.35 > 0.30) c.set(x, y, look.belly);
    }
  }

  // --- markings, laid on before the fins so the fins stay clean
  if (look.marks === 'stripes') {
    for (let x = Math.round(w * 0.18); x < tailX; x += 4) {
      for (let y = 0; y < h; y++) if (c.get(x, y) === look.body) c.set(x, y, look.fin);
    }
  } else if (look.marks === 'spots') {
    for (let i = 0; i < 5; i++) {
      const sx = Math.round(rng.range(w * 0.2, tailX - 1));
      const sy = Math.round(rng.range(cy - h * 0.28, cy + h * 0.1));
      if (c.get(sx, sy) === look.body) {
        c.set(sx, sy, look.fin);
        if (rng.chance(0.5)) c.set(sx + 1, sy, look.fin);
      }
    }
  } else if (look.marks === 'band') {
    const bx = Math.round(w * 0.42);
    for (let x = bx; x < bx + 3; x++) {
      for (let y = 0; y < h; y++) if (c.get(x, y) === look.body) c.set(x, y, look.fin);
    }
  } else if (look.marks === 'mesh') {
    // A net of scales. Every other pixel on a diagonal lattice, which at
    // this size reads as texture rather than as a pattern you can count.
    for (let x = Math.round(w * 0.16); x < tailX; x++) {
      for (let y = 0; y < h; y++) {
        if (c.get(x, y) !== look.body) continue;
        if ((x + y) % 3 === 0) c.set(x, y, look.fin);
      }
    }
  } else if (look.marks === 'ocelli') {
    // Two or three eye spots along the flank: a dark centre inside a lit
    // ring. The ring is what stops them reading as dirt.
    for (let i = 0; i < 3; i++) {
      const sx = Math.round(w * (0.34 + i * 0.14));
      const sy = Math.round(cy - h * 0.06);
      if (c.get(sx, sy) === TRANSPARENT) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (c.get(sx + dx, sy + dy) === TRANSPARENT) continue;
          c.set(sx + dx, sy + dy, look.belly);
        }
      }
      c.set(sx, sy, C.InkDeep);
    }
  } else if (look.marks === 'blotch') {
    // Irregular patches. Camouflage, and the only marking that is allowed
    // to break the body's silhouette lines.
    for (let i = 0; i < 4; i++) {
      const bx = Math.round(rng.range(w * 0.18, tailX - 2));
      const by = Math.round(rng.range(cy - h * 0.3, cy + h * 0.2));
      const bw = rng.int(2, 4);
      const bh = rng.int(1, 3);
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          if (c.get(x, y) === look.body) c.set(x, y, look.fin);
        }
      }
    }
  }

  // --- dorsal fin. Spiny species get a sawtooth ridge instead of a sail.
  const dFrom = Math.round(w * (shape === 'long' ? 0.30 : 0.26));
  const dTo = Math.round(w * (shape === 'long' ? 0.70 : 0.52));
  for (let x = dFrom; x < dTo; x++) {
    const t = (x - dFrom) / Math.max(1, dTo - dFrom);
    const base = shape === 'fan' ? 0.52
      : shape === 'round' ? 0.30
        : shape === 'long' || shape === 'ribbon' ? 0.10 : 0.22;
    let up = Math.round(Math.sin(t * Math.PI) * h * base) + 1;
    if (shape === 'spiny') up = 1 + ((x - dFrom) % 2 === 0 ? 2 : 0);
    for (let k = 1; k <= up; k++) c.set(x, Math.round(cy - h * girth * 0.85) - k + 1, look.fin);
  }

  // --- pelvic fin, small, underneath and behind the middle
  for (let i = 0; i < Math.max(2, Math.round(w * 0.12)); i++) {
    c.set(Math.round(w * 0.42) + i, Math.round(cy + h * 0.30) + (i > 1 ? 1 : 0), look.fin);
  }

  // --- tail: forked, with the fork deepening toward the tip
  for (let x = tailX; x < w - 1; x++) {
    const t = (x - tailX) / Math.max(1, w - 1 - tailX);
    const spread = 0.8 + t * h * 0.42;
    const notch = t * h * 0.16;
    for (let y = Math.round(cy - spread); y <= Math.round(cy + spread); y++) {
      if (Math.abs(y - cy) < notch) continue;
      c.set(x, y, look.fin);
    }
  }

  // --- gill line, eye, and a single specular pixel
  const gx = Math.round(w * 0.22);
  for (let y = Math.round(cy - h * 0.22); y <= Math.round(cy + h * 0.20); y++) {
    if (c.get(gx, y) !== TRANSPARENT) c.set(gx, y, look.fin);
  }
  const ex = Math.round(w * 0.12);
  const ey = Math.round(cy - h * 0.14);
  c.set(ex, ey, C.InkDeep);
  c.set(ex + 1, ey, C.White);

  // --- a few scale speckles along the flank
  for (let i = 0; i < rng.int(2, 5); i++) {
    const sx = Math.round(rng.range(w * 0.25, w * 0.62));
    const sy = Math.round(rng.range(cy - h * 0.24, cy));
    if (c.get(sx, sy) === look.body) c.set(sx, sy, look.belly);
  }

  if (tier > 0) escalate(c, look, w, h, cy, tier, rng);

  c.outline(C.InkDeep, false);
  return c;
}

/** Grows a fish into its grade.
 *
 *  The first version had one extra cut for "rare" and used tint alone for
 *  everything below it, which meant Biasa, Bagus and Langka were the same
 *  sprite in three colours — the bottom half of the ladder had no art at
 *  all. Each tier now changes the silhouette, and the changes compound:
 *  brighter fins, then a sheen and a taller dorsal, then a crest and
 *  trailing filaments, then barbels and a lit eye, then spines the whole
 *  length of the back and a split tail.
 *
 *  Escalation has to happen in the outline, not the palette. */
function escalate(
  c: PixelCanvas, look: FishArt, w: number, h: number,
  cy: number, tier: number, rng: Rng,
): void {
  const lit = C.White;
  const bright = shiftUp(look.fin);

  // --- tier 1: the fins catch more light, and a few scales spark.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (c.get(x, y) === look.fin && rng.chance(0.30)) c.set(x, y, bright);
    }
  }
  for (let i = 0; i < 2 + tier; i++) {
    const sx = Math.round(rng.range(w * 0.22, w * 0.60));
    const sy = Math.round(rng.range(cy - h * 0.26, cy + h * 0.05));
    if (c.get(sx, sy) === look.body) c.set(sx, sy, lit);
  }
  if (tier < 2) return;

  // --- tier 2: a sheen along the flank, and a taller dorsal.
  for (let x = Math.round(w * 0.20); x < Math.round(w * 0.66); x++) {
    const y = Math.round(cy - h * 0.20 + Math.sin((x / w) * 4) * 1.2);
    const v = c.get(x, y);
    if (v === look.body || v === look.belly) c.set(x, y, lit);
  }
  ridge(c, look, h, cy, Math.round(w * 0.28), Math.round(w * 0.54), 0.20, bright);
  if (tier < 3) return;

  // --- tier 3: a real crest, filaments off the tail, a lit back edge.
  ridge(c, look, h, cy, Math.round(w * 0.26), Math.round(w * 0.58), 0.32, lit);
  filaments(c, look, w, h, cy, 3, rng);
  rimLight(c, look, w, lit);
  if (tier < 4) return;

  // --- tier 4: barbels at the jaw, more filaments, an eye that carries.
  const jaw = Math.round(w * 0.14);
  for (let k = 0; k < 3; k++) {
    c.set(jaw - k, Math.round(cy + h * 0.18) + k, look.fin);
    c.set(jaw - k, Math.round(cy + h * 0.32) + k, bright);
  }
  filaments(c, look, w, h, cy, 5, rng);
  const ex = Math.round(w * 0.12);
  const ey = Math.round(cy - h * 0.14);
  c.set(ex, ey, lit);
  c.set(ex - 1, ey, bright);
  c.set(ex + 1, ey, bright);
  c.set(ex, ey - 1, bright);
  if (tier < 5) return;

  // --- tier 5: spines the whole length of the back, and a split tail.
  for (let x = Math.round(w * 0.20); x < Math.round(w * 0.68); x += 2) {
    const top = topOf(c, x);
    if (top < 1) continue;
    c.set(x, top - 1, look.fin);
    c.set(x, top - 2, lit);
  }
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    const y = Math.round(cy + k * Math.max(2, h * 0.22));
    for (let i = 0; i < 4; i++) {
      const x = w - 3 + i;
      if (x >= c.w) break;
      c.set(x, y + (i > 1 ? Math.sign(k) : 0), i > 2 ? bright : look.fin);
    }
  }
}

/** One ramp step brighter, for fins and crests. Kept local so the fish art
 *  does not have to reach into the portrait's ramp table. */
function shiftUp(col: number): number {
  const RAMPS: number[][] = [
    [C.InkDeep, C.Ink, C.Slate, C.SlateLt, C.Mist, C.Pale, C.White],
    [C.WoodDp, C.WoodDk, C.Wood, C.SkinSh, C.Skin, C.SunGlow],
    [C.ForestDp, C.Forest, C.GrassDk, C.Grass, C.GrassLt, C.LeafLt],
    [C.WaterDp, C.Water, C.WaterSh, C.WaterBr, C.Foam],
    [C.Dusk, C.Purple, C.Rose, C.Red, C.Orange, C.Amber, C.SunGlow],
    [C.StoneShadow, C.StoneDk, C.Stone, C.StoneLt, C.StonePale],
    [C.CyberVoid, C.CyberSlate, C.CyberSteel, C.NeonCyan],
    [C.Arcane, C.ArcaneLt],
  ];
  for (const r of RAMPS) {
    const i = r.indexOf(col);
    if (i >= 0) return r[Math.min(r.length - 1, i + 1)];
  }
  return col;
}

/** The topmost non-empty row of a column, or -1. */
function topOf(c: PixelCanvas, x: number): number {
  for (let y = 0; y < c.h; y++) if (c.get(x, y) !== TRANSPARENT) return y;
  return -1;
}

/** A crest, grown from the back rather than floated above it.
 *
 *  Two mistakes worth keeping a note of. The first cut measured up from
 *  the body centre, which put the crest in mid-air over the thin-bodied
 *  species — a hat hovering above an eel; a fin has to start on the pixel
 *  the body actually ends on. The second filled it solid, which reads as
 *  a lump of flesh rather than a fin. Real dorsals are rays with membrane
 *  between them, and the height has to answer to how deep the body is at
 *  that column or an eel ends up wearing a sail.
 */
function ridge(
  c: PixelCanvas, look: FishArt, h: number, cy: number,
  from: number, to: number, height: number, tipCol: number,
): void {
  void cy;
  for (let x = from; x < to; x++) {
    const base = topOf(c, x);
    if (base < 1) continue;
    const depth = bodyDepth(c, x);
    if (depth < 2) continue;
    const t = (x - from) / Math.max(1, to - from);
    // Rays: every other column runs full height, the ones between stop
    // short. That alternation is what separates a fin from a bump.
    const ray = x % 2 === 0 ? 1 : 0.55;
    const up = Math.max(1, Math.round(
      Math.sin(t * Math.PI) * Math.min(h * height, depth * 0.9) * ray,
    ));
    for (let k = 1; k <= up; k++) {
      const y = base - k;
      if (y < 0) break;
      c.set(x, y, k === up ? tipCol : look.fin);
    }
  }
}

/** How many rows of fish sit in this column. */
function bodyDepth(c: PixelCanvas, x: number): number {
  let n = 0;
  for (let y = 0; y < c.h; y++) if (c.get(x, y) !== TRANSPARENT) n++;
  return n;
}

/** Streamers off the tail. Odd lengths — trailers all the same length read
 *  as a comb rather than as something living. */
function filaments(
  c: PixelCanvas, look: FishArt, w: number, h: number,
  cy: number, n: number, rng: Rng,
): void {
  for (let k = 0; k < n; k++) {
    const y = Math.round(cy + (k - (n - 1) / 2) * Math.max(2, h * 0.22));
    const len = rng.int(2, 4) + (k === Math.floor(n / 2) ? 2 : 0);
    for (let i = 0; i < len; i++) {
      const x = w - 2 + i;
      if (x >= c.w) break;
      c.set(x, y, look.fin);
    }
  }
}

/** Lights the topmost pixel of each column — the one detail that makes
 *  something look like it is generating light rather than merely being a
 *  bright colour. */
function rimLight(c: PixelCanvas, look: FishArt, w: number, lit: number): void {
  for (let x = 1; x < w - 1; x++) {
    const y = topOf(c, x);
    if (y < 0) continue;
    const v = c.get(x, y);
    if (v === look.body || v === look.belly) c.set(x, y, lit);
  }
}

export interface CropArt {
  stem: number;
  fruit: number;
  fruitHi: number;
}

export const CROP_LOOKS: Record<string, CropArt> = {
  tomat: { stem: C.GrassDk, fruit: C.Red, fruitHi: C.Rose },
  labu: { stem: C.Forest, fruit: C.Orange, fruitHi: C.Amber },
  terong: { stem: C.GrassDk, fruit: C.Purple, fruitHi: C.Rose },
  jagung: { stem: C.Grass, fruit: C.SunGlow, fruitHi: C.Lantern },
};

/** Four growth stages in one 16x18 cell, bottom-aligned to the soil. */
export function makeCrop(look: CropArt, stage: number): PixelCanvas {
  const c = new PixelCanvas(16, 18);
  const baseY = 17;
  if (stage === 0) {
    c.set(8, baseY - 1, C.GrassLt);
    c.set(7, baseY - 1, C.Grass);
    c.set(8, baseY, C.GrassDk);
    return c;
  }
  const height = [0, 4, 8, 12, 13][Math.min(stage, 4)];
  c.vline(8, baseY - height, height, look.stem);
  c.vline(7, baseY - height + 1, Math.max(0, height - 1), look.stem);
  // Leaves fan out as it grows.
  const leaves = Math.min(3, stage);
  for (let i = 0; i < leaves; i++) {
    const y = baseY - 2 - i * 3;
    const len = 2 + i;
    for (let d = 1; d <= len; d++) {
      c.set(8 - d, y, C.GrassDk);
      c.set(7 + d + 1, y - 1, C.Grass);
    }
  }
  if (stage >= 3) {
    const fy = baseY - height + 3;
    c.disc(6, fy, 2.2, 2.2, look.fruit);
    c.disc(10, fy + 3, 2.4, 2.4, look.fruit);
    c.set(5, fy - 1, look.fruitHi);
    c.set(9, fy + 2, look.fruitHi);
  }
  c.outline(C.InkDeep, false);
  return c;
}

export function makeBobber(): PixelCanvas {
  const c = new PixelCanvas(5, 6);
  c.disc(2, 3, 2, 2.2, C.Red);
  c.hline(0, 3, 5, C.White);
  c.set(1, 2, C.Rose);
  c.set(2, 1, C.InkDeep);
  c.outline(C.InkDeep, false);
  return c;
}

/** Expanding ripple rings, four frames. */
export function makeRipple(frame: number): PixelCanvas {
  const w = 24;
  const h = 12;
  const c = new PixelCanvas(w, h);
  const t = frame / 4;
  const rx = 2 + t * 9;
  const ry = rx * 0.44;
  const col = frame < 2 ? C.Foam : C.WaterBr;
  for (let a = 0; a < 64; a++) {
    const ang = (a / 64) * Math.PI * 2;
    c.set(Math.round(w / 2 + Math.cos(ang) * rx), Math.round(h / 2 + Math.sin(ang) * ry), col);
  }
  return c;
}

/** Soft round glow, drawn additively under lanterns and fireflies.
 *
 *  Built as concentric bands with the dither applied to the *band choice*
 *  rather than to whether a pixel is drawn at all. Skipping pixels by a
 *  Bayer threshold leaves visible stripes radiating out of every lamp. */
export function makeGlow(size: number): PixelCanvas {
  const c = new PixelCanvas(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - r + 0.5, y - r + 0.5) / r;
      if (d >= 1) continue;
      const f = 1 - d;
      const bayer = BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5;
      const level = f * f * 4.2 + bayer * 0.55;
      if (level < 0.30) continue;
      c.set(x, y, level > 2.6 ? C.White : level > 1.5 ? C.Lantern : level > 0.75 ? C.Amber : C.Orange);
    }
  }
  return c;
}

/** A one-pixel dot in every palette colour — the renderer uses these for
 *  solid fills (panels, shadows, bars) without needing a second shader. */
export function makeDots(count: number): PixelCanvas {
  const c = new PixelCanvas(count, 1);
  for (let i = 0; i < count; i++) c.set(i, 0, i);
  return c;
}

/** Shadow blob: solid, with a single dithered ring at the edge.
 *
 *  A fully dithered blob turns into a row of dashes as soon as it is
 *  stretched into a long cast shadow, which is exactly what it looked
 *  like under the cabin. Only the outermost ring may be dithered. */
export function makeShadow(w: number, h: number): PixelCanvas {
  const c = new PixelCanvas(w, h);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx + 0.5) / (w / 2);
      const ny = (y - cy + 0.5) / (h / 2);
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d >= 1) continue;
      if (d > 0.78) {
        // Feathered rim only.
        const bayer = BAYER4[(y & 3) * 4 + (x & 3)] / 16;
        if ((1 - d) / 0.22 < bayer) continue;
      }
      c.set(x, y, C.InkDeep);
    }
  }
  return c;
}

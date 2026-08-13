/** Bakes every sprite — hand-authored, generated, and font glyphs — into a
 *  single texture at boot. One texture means the whole frame can usually be
 *  drawn in a handful of draw calls, which matters on integrated graphics. */

import { PixelCanvas, TRANSPARENT } from './canvas';
import { makeNormalMap } from './normals';
import { C, PALETTE } from './palette';
import {
  makeAntenna, makeBanner, makeChainFence, makeCobbleTile, makeConcreteTile,
  makeCrystal, makeGlowMushroom, makeGrateTile, makeGroveTile, makeMasonryTile,
  makeNeonSign, makeNotice, makePipe, makePlaque, makeRuneStone, makeSpiritTree,
  makeTablet, makeTerminal, makeTorch, makeTower, makeWallSegment,
} from './genre';
import { GLYPH_H, glyph } from './font';
import { buildCharacterFrames, charKey } from './character';
import { buildPortraits, portraitKey } from './portrait';
import { seasonal, type Season } from '../world/season';
import {
  makeAnvil, makeBarrelIn, makeBed, makeChair, makeChest, makeFloorTile,
  makeLampIn, makePainting, makePlantPot, makeRugTile, makeShelf, makeStove,
  makeTable, makeTerminalDesk, makeWallTile, makeWindowIn,
} from './furniture';
import {
  makeBush, makeDeadTree, makeDirtTile, makeFlowerTuft, makeFringe, makeGrassTile,
  makeLilyPad, makePebbles, makePlotBed, makeReed, makeRock, makeSandTile,
  makeTallGrass, makeTree,
} from './nature';
import {
  BLOCK_SPECS, HOUSE_SPECS, makeCyberBlock, makeTownhouse, makeWaterTank,
} from './buildings';
import {
  makeCampfire, makeGatehouse, makeKeepHall, makeMilestone, makePylon,
} from './keep';
import {
  CROP_LOOKS, FISH_LOOKS, makeBarrel, makeBobber, makeBucket,
  makeCabin, makeCrate, makeCrop, makeDockPost, makeDockTile, makeDots, makeFence,
  makeFish, makeGlow, makeLantern, makeNoticeBoard, makeRipple,
  makeShadow, makeSign, makeStall, makeWell,
} from './props';

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Atlas {
  canvas: HTMLCanvasElement;
  /** Same size, same frame layout, surface directions instead of colours.
   *  Sampled at the identical UV so no extra bookkeeping is needed. */
  normals: HTMLCanvasElement;
  frames: Map<string, Frame>;
  w: number;
  h: number;
}

const ATLAS_W = 1024;
/** Taller, not wider.
 *
 *  The 1024-square sheet was already about 95% full before the roster grew
 *  to eighty-six species; three sprites each tipped it over and the packer
 *  threw. Growing the height doubles the space for eight megabytes of
 *  texture instead of the sixteen a 2048 square would cost, and the packer
 *  fills in shelves top to bottom so the extra room is exactly where it
 *  gets used. Both dimensions stay powers of two. */
const ATLAS_H = 2048;
const PAD = 1;

class ShelfPacker {
  private x = PAD;
  private y = PAD;
  private shelfH = 0;

  constructor(private w: number, private h: number) {}

  place(w: number, h: number): Frame {
    if (this.x + w + PAD > this.w) {
      this.x = PAD;
      this.y += this.shelfH + PAD;
      this.shelfH = 0;
    }
    if (this.y + h + PAD > this.h) {
      throw new Error(`Atlas penuh: butuh ${w}x${h} di ${this.y}`);
    }
    const f = { x: this.x, y: this.y, w, h };
    this.x += w + PAD;
    this.shelfH = Math.max(this.shelfH, h);
    return f;
  }
}

/** How many random variants of each scatter prop to bake. More variants =
 *  less visible repetition; these numbers are tuned so the atlas stays
 *  under a megabyte of VRAM. */
export const VARIANTS = {
  tree: 10,
  bush: 6,
  rock: 6,
  reed: 6,
  flower: 5,
  lily: 4,
  grass: 6,
  dirt: 3,
  sand: 3,
  dock: 3,
  fringe: 4,
  tallgrass: 6,
  pebbles: 4,
  deadtree: 5,
  house: 6,
  block: 5,
  tank: 3,
  // genre districts
  cobble: 4,
  masonry: 3,
  tower: 4,
  wallseg: 3,
  banner: 4,
  concrete: 4,
  sign: 6,
  antenna: 3,
  grove: 4,
  mushroom: 5,
  crystal: 4,
  rune: 3,
  spirittree: 4,
  marker: 3,
  floor: 3,
  rug: 5,
  furn: 3,
};

/** Sprites drawn by a person, keyed by atlas name. Anything present here
 *  wins over the generated version — see art/handdrawn.ts. */
export type Overrides = ReadonlyMap<string, PixelCanvas>;

export function buildAtlas(
  overrides: Overrides = new Map(), season?: Season,
): Atlas {
  const packer = new ShelfPacker(ATLAS_W, ATLAS_H);
  const frames = new Map<string, Frame>();
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

  const normals = document.createElement('canvas');
  normals.width = ATLAS_W;
  normals.height = ATLAS_H;
  const nctx = normals.getContext('2d', { willReadFrequently: false })!;
  // Flat, facing the viewer. Anything the packer never writes to still
  // reads as an unlit surface rather than as a hole.
  nctx.fillStyle = 'rgb(128,128,255)';
  nctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  /** Sprite name prefixes that are cells of a continuous floor rather than
   *  objects standing on it. They are lit flat: rounding each one from its
   *  own outline gives every tile a bevel, and the ground comes out as a
   *  quilt of embossed squares. */
  const SURFACE = [
    'grass', 'dirt', 'till', 'sand', 'cobble', 'masonry', 'concrete',
    'grate', 'grove', 'floor', 'iwall', 'dockv', 'dockh', 'rug', 'dots',
  ];
  const isSurface = (name: string): boolean =>
    SURFACE.some((p) => name.startsWith(p));

  /** Sprites that are made of leaves. Only these follow the season: a green
   *  hoodie does not turn orange in autumn, and recolouring every green in
   *  the palette is what makes a seasonal filter read as a broken monitor. */
  const FOLIAGE = [
    'grass', 'fringe', 'tree', 'bush', 'reed', 'grove', 'shrub', 'hedge',
    'canopy', 'leaf', 'vine', 'lily',
  ];
  const isFoliage = (name: string): boolean =>
    FOLIAGE.some((p) => name.startsWith(p));

  const add = (name: string, pc: PixelCanvas): void => {
    let art = overrides.get(name) ?? pc;
    if (season && isFoliage(name)) art = recolour(art, season);
    const f = packer.place(art.w, art.h);
    ctx.putImageData(art.toImageData(), f.x, f.y);
    const nm = makeNormalMap(art, isSurface(name) ? 'surface' : 'object');
    nctx.putImageData(new ImageData(nm.data, nm.w, nm.h), f.x, f.y);
    frames.set(name, f);
  };

  // --- characters
  for (const cf of buildCharacterFrames()) {
    add(charKey(cf.look, cf.dir, cf.pose), cf.canvas);
  }
  // Conversation portraits. Same Look record as the world sprite, so the
  // face in the panel is always the person standing in front of you.
  for (const pf of buildPortraits(season)) {
    add(portraitKey(pf.look, pf.mood), pf.canvas);
  }

  // --- terrain
  for (let tone = 0; tone < 3; tone++) {
    for (let i = 0; i < VARIANTS.grass; i++) {
      add(`grass${tone}_${i}`, makeGrassTile(i + 1, tone as 0 | 1 | 2));
    }
  }
  for (let i = 0; i < VARIANTS.dirt; i++) {
    add(`dirt${i}`, makeDirtTile(i + 1, false));
    add(`till${i}`, makeDirtTile(i + 1, true));
  }
  for (let i = 0; i < VARIANTS.sand; i++) add(`sand${i}`, makeSandTile(i + 1));
  for (let d = 0; d < 4; d++) {
    for (let i = 0; i < VARIANTS.fringe; i++) {
      add(`fringe${d}_${i}`, makeFringe(i + 1, d as 0 | 1 | 2 | 3));
    }
  }
  for (let i = 0; i < 3; i++) add(`bed${i}`, makePlotBed(i + 1));
  for (let i = 0; i < VARIANTS.dock; i++) {
    add(`dockv${i}`, makeDockTile(i + 1, 0));
    add(`dockh${i}`, makeDockTile(i + 1, 1));
  }

  // --- scatter
  for (let i = 0; i < VARIANTS.tree; i++) {
    // Varying the size across the set matters more than varying the shape:
    // a wood where every tree is the same height reads as wallpaper.
    const scale = 0.78 + (i % 5) * 0.12;
    add(`tree${i}`, makeTree(i + 1, { autumn: i % 5 === 4, scale }));
  }
  for (let i = 0; i < 4; i++) {
    // Smaller trees for the far treeline; the reduced palette contrast is
    // applied at draw time, not baked, so they still tint with the sky.
    add(`treefar${i}`, makeTree(i + 91, { scale: 0.62 }));
  }
  for (let i = 0; i < VARIANTS.bush; i++) add(`bush${i}`, makeBush(i + 1));
  for (let i = 0; i < VARIANTS.deadtree; i++) add(`deadtree${i}`, makeDeadTree(i + 1));
  for (let i = 0; i < VARIANTS.rock; i++) add(`rock${i}`, makeRock(i + 1));
  for (let i = 0; i < VARIANTS.reed; i++) add(`reed${i}`, makeReed(i + 1));
  for (let i = 0; i < VARIANTS.flower; i++) add(`flower${i}`, makeFlowerTuft(i + 1));
  for (let i = 0; i < VARIANTS.tallgrass; i++) add(`tallgrass${i}`, makeTallGrass(i + 1));
  for (let i = 0; i < VARIANTS.pebbles; i++) add(`pebbles${i}`, makePebbles(i + 1));
  for (let i = 0; i < VARIANTS.lily; i++) add(`lily${i}`, makeLilyPad(i + 1));

  // --- built things
  // --- genre districts
  for (let i = 0; i < VARIANTS.cobble; i++) add(`cobble${i}`, makeCobbleTile(i + 1));
  for (let i = 0; i < VARIANTS.masonry; i++) add(`masonry${i}`, makeMasonryTile(i + 1));
  for (let i = 0; i < VARIANTS.tower; i++) add(`tower${i}`, makeTower(i + 1));
  for (let i = 0; i < VARIANTS.wallseg; i++) add(`wallseg${i}`, makeWallSegment(i + 1));
  for (let i = 0; i < VARIANTS.banner; i++) add(`banner${i}`, makeBanner(i + 1));
  add('torch', makeTorch());
  add('keephall', makeKeepHall(1));
  add('gatehouse', makeGatehouse(1));
  add('milestone', makeMilestone(1));
  add('campfire', makeCampfire());
  add('pylon', makePylon(1));

  for (let i = 0; i < VARIANTS.concrete; i++) add(`concrete${i}`, makeConcreteTile(i + 1));
  add('grate', makeGrateTile());
  const NEON = [C.NeonCyan, C.NeonMagenta, C.NeonMint];
  for (let i = 0; i < VARIANTS.sign; i++) {
    add(`sign${i}`, makeNeonSign(i + 1, {
      w: 18 + (i % 3) * 8,
      h: 14 + (i % 2) * 8,
      colour: NEON[i % NEON.length],
    }));
  }
  add('pipe', makePipe());
  for (let i = 0; i < VARIANTS.antenna; i++) add(`antenna${i}`, makeAntenna(i + 1));
  add('chainfence', makeChainFence());

  // Lore markers: one form per district voice.
  for (let i = 0; i < VARIANTS.marker; i++) {
    add(`plaque${i}`, makePlaque(i + 1));
    add(`terminal${i}`, makeTerminal(i + 1));
    add(`tablet${i}`, makeTablet(i + 1));
    add(`notice${i}`, makeNotice(i + 1));
  }

  for (let i = 0; i < VARIANTS.grove; i++) add(`grove${i}`, makeGroveTile(i + 1));
  for (let i = 0; i < VARIANTS.mushroom; i++) add(`mushroom${i}`, makeGlowMushroom(i + 1));
  for (let i = 0; i < VARIANTS.crystal; i++) add(`crystal${i}`, makeCrystal(i + 1));
  for (let i = 0; i < VARIANTS.rune; i++) add(`rune${i}`, makeRuneStone(i + 1));
  for (let i = 0; i < VARIANTS.spirittree; i++) add(`spirittree${i}`, makeSpiritTree(i + 1));

  // --- interiors
  for (const st of ['cozy', 'medieval', 'cyber', 'fantasy'] as const) {
    for (let i = 0; i < VARIANTS.floor; i++) {
      add(`floor_${st}${i}`, makeFloorTile(i + 1, st));
      add(`iwall_${st}${i}`, makeWallTile(i + 1, st));
    }
  }
  for (let i = 0; i < VARIANTS.rug; i++) add(`rug${i}`, makeRugTile(i + 1));
  // Every interior sprite gets an `f_` prefix. Without it `bed0` would
  // collide with the farm plot beds and silently replace them — the atlas
  // is one flat namespace.
  for (let i = 0; i < VARIANTS.furn; i++) {
    add(`f_bed${i}`, makeBed(i + 1));
    add(`f_table${i}`, makeTable(i + 1));
    add(`f_shelf${i}`, makeShelf(i + 1));
    add(`f_plant${i}`, makePlantPot(i + 1));
    add(`f_painting${i}`, makePainting(i + 1));
  }
  add('f_chair', makeChair());
  add('f_chest', makeChest());
  add('f_stove', makeStove());
  add('f_anvil', makeAnvil());
  add('f_terminal', makeTerminalDesk());
  add('f_barrel', makeBarrelIn());
  add('f_lamp', makeLampIn());
  add('f_window', makeWindowIn());

  add('cabin', makeCabin());
  for (let i = 0; i < HOUSE_SPECS.length; i++) add(`house${i}`, makeTownhouse(HOUSE_SPECS[i], i + 1));
  for (let i = 0; i < BLOCK_SPECS.length; i++) add(`block${i}`, makeCyberBlock(BLOCK_SPECS[i], i + 1));
  for (let i = 0; i < VARIANTS.tank; i++) add(`tank${i}`, makeWaterTank(i + 1));
  add('well', makeWell());
  add('board', makeNoticeBoard());
  add('fence0', makeFence(0));
  add('fence1', makeFence(1));
  add('stall', makeStall());
  add('dockpost', makeDockPost());
  add('lantern', makeLantern());
  add('crate', makeCrate());
  add('barrel', makeBarrel());
  add('sign', makeSign());
  add('bucket0', makeBucket(false));
  add('bucket1', makeBucket(true));

  // --- items
  let fishSeed = 1;
  for (const [name, look] of Object.entries(FISH_LOOKS)) {
    add(`fish_${name}`, makeFish(look, fishSeed++, 22, 12));
    // One big sprite per grade. Sharing a sprite across the bottom three
    // grades left half the ladder with no art at all — the same fish in
    // three colours. Only the big size is graded: the small one is a feed
    // icon and crests and filaments are illegible at 22 pixels.
    const fishSeedForSpecies = fishSeed++;
    for (let tier = 0; tier < 6; tier++) {
      add(`fishg${tier}_${name}`, makeFish(look, fishSeedForSpecies, 40, 22, tier));
    }
  }
  for (const [name, look] of Object.entries(CROP_LOOKS)) {
    for (let s = 0; s <= 4; s++) add(`crop_${name}_${s}`, makeCrop(look, s));
  }
  add('bobber', makeBobber());
  for (let i = 0; i < 4; i++) add(`ripple${i}`, makeRipple(i));
  add('glow16', makeGlow(16));
  add('glow32', makeGlow(32));
  add('glow64', makeGlow(64));
  add('dots', makeDots(PALETTE.length));
  add('shadow', makeShadow(16, 8));
  add('shadowbig', makeShadow(28, 12));

  // --- font glyphs, baked white so they can be tinted to any palette colour
  const CHARSET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
    '.,:;!?\'"-+=/\\()[]<>*%#_~@&|^$°×•→↑♥★✿';
  for (const ch of CHARSET) {
    const g = glyph(ch);
    if (!g) continue;
    const pc = new PixelCanvas(g.w, GLYPH_H);
    for (let y = 0; y < GLYPH_H; y++) {
      const bits = g.rows[y] ?? 0;
      for (let x = 0; x < g.w; x++) if (bits & (1 << x)) pc.set(x, y, C.White);
    }
    frames.set(`g_${ch}`, packer.place(g.w, GLYPH_H));
    const f = frames.get(`g_${ch}`)!;
    ctx.putImageData(pc.toImageData(), f.x, f.y);
  }

  return { canvas, normals, frames, w: ATLAS_W, h: ATLAS_H };
}

/** A copy of a sprite with its foliage colours moved into the season.
 *
 *  Works on palette indices, before anything becomes RGBA, so a leaf that
 *  was three greens is three autumn tones and still only three colours. A
 *  tint applied afterwards could only darken — multiplying green by anything
 *  never reaches orange. */
function recolour(src: PixelCanvas, season: Season): PixelCanvas {
  const out = new PixelCanvas(src.w, src.h);
  for (let i = 0; i < src.px.length; i++) {
    const v = src.px[i];
    out.px[i] = v === TRANSPARENT ? v : seasonal(season, v);
  }
  return out;
}

/** Bakes every sprite — hand-authored, generated, and font glyphs — into a
 *  single texture at boot. One texture means the whole frame can usually be
 *  drawn in a handful of draw calls, which matters on integrated graphics. */

import { PixelCanvas } from './canvas';
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
  frames: Map<string, Frame>;
  w: number;
  h: number;
}

const ATLAS_W = 1024;
const ATLAS_H = 1024;
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
};

export function buildAtlas(): Atlas {
  const packer = new ShelfPacker(ATLAS_W, ATLAS_H);
  const frames = new Map<string, Frame>();
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

  const add = (name: string, pc: PixelCanvas): void => {
    const f = packer.place(pc.w, pc.h);
    ctx.putImageData(pc.toImageData(), f.x, f.y);
    frames.set(name, f);
  };

  // --- characters
  for (const cf of buildCharacterFrames()) {
    add(charKey(cf.look, cf.dir, cf.pose), cf.canvas);
  }
  // Conversation portraits. Same Look record as the world sprite, so the
  // face in the panel is always the person standing in front of you.
  for (const pf of buildPortraits()) {
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
    add(`fishbig_${name}`, makeFish(look, fishSeed++, 40, 22));
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

  return { canvas, frames, w: ATLAS_W, h: ATLAS_H };
}

/** The characters.
 *
 *  One authored body per facing, then everything that makes a person look
 *  like a *different* person — hair, headwear, outfit, skin, colours — is
 *  applied on top in code. That way twelve distinct villagers cost one
 *  sprite of authoring each direction rather than thirty-six, and adding a
 *  thirteenth is a row of data.
 *
 *  Animation: walk is four frames (leg swap plus a one-pixel torso bob),
 *  and idle is not a still frame. A character standing perfectly rigid is
 *  the thing that makes a world look switched off, so idle breathes on a
 *  slow two-frame cycle and blinks every few seconds. */

import { PixelCanvas, TRANSPARENT } from './canvas';
import { C } from './palette';

export const CH_W = 16;
export const CH_H = 24;

/** Marker colours in the authored art, swapped per look at bake time. */
const M_HAT = C.Amber;      // 'n'
const M_HAT_SH = C.Wood;    // '8'
const M_SKIN = C.Skin;      // '6'
const M_SKIN_SH = C.SkinSh; // '7'
const M_HAIR = C.WoodDk;    // '9'
const M_SHIRT = C.WaterSh;  // 'j'
const M_SHIRT_DIM = C.Water;// 'i'
const M_TRIM = C.White;     // 'v' — collar
const M_PANTS = C.Slate;    // '2'
const M_BOOT = C.WoodDp;    // 'a'

/** Rows 19..22 are the leg block that the walk cycle swaps out. */
const LEGS_TOP = 19;
/** Rows of the face, used to place eyes and the blink. */
const EYE_ROW = 9;

const FRONT = [
  '................',
  '.....888888.....',
  '....nnnnnnnn....',
  '....nnnnnnnn....',
  '...n88nnnn88n...',
  '.nnnnnnnnnnnnnn.',
  '.88888888888888.',
  '...9966666699...',
  '...9666666669...',
  '...9606666069...',
  '...9666666669...',
  '....66666666....',
  '......7777......',
  '...jjjjjjjjjj...',
  '..jjjvvvvvvjjj..',
  '..6jjjjjjjjjj6..',
  '..6jjjjjjjjjj6..',
  '..6iiiiiiiiii6..',
  '...aaaaaaaaaa...',
  '....22222222....',
  '....222..222....',
  '....222..222....',
  '....aaa..aaa....',
  '................',
];

const BACK = [
  '................',
  '.....888888.....',
  '....nnnnnnnn....',
  '....nnnnnnnn....',
  '...n88nnnn88n...',
  '.nnnnnnnnnnnnnn.',
  '.88888888888888.',
  '...9999999999...',
  '...9999999999...',
  '...9999999999...',
  '...9999999999...',
  '....99999999....',
  '......7777......',
  '...jjjjjjjjjj...',
  '...jjjjjjjjjj...',
  '..6jjjjjjjjjj6..',
  '..6jjjjjjjjjj6..',
  '..6iiiiiiiiii6..',
  '...aaaaaaaaaa...',
  '....22222222....',
  '....222..222....',
  '....222..222....',
  '....aaa..aaa....',
  '................',
];

const SIDE = [
  '................',
  '....888888......',
  '...nnnnnnnn.....',
  '...nnnnnnnn.....',
  '..n88nnnn88.....',
  '.nnnnnnnnnnnn...',
  '.888888888888...',
  '...99666666.....',
  '...99606666.....',
  '...996666666....',
  '...99666666.....',
  '....777777......',
  '......7777......',
  '....jjjjjjjj....',
  '....jjvvvvjj....',
  '....jjjjjjjj6...',
  '....jjjjjjjj6...',
  '....iiiiiiii....',
  '....aaaaaaaa....',
  '....22222222....',
  '....222..222....',
  '....222..222....',
  '....aaa..aaa....',
  '................',
];

const LEGS_FRONT = [
  ['....22222222....', '....222..222....', '....222..222....', '....aaa..aaa....'],
  ['.....2222222....', '.....222.222....', '.....222.222....', '.....aa..aaa....'],
  ['....22222222....', '....222..222....', '....222..222....', '....aaa..aaa....'],
  ['....2222222.....', '....222.222.....', '....222.222.....', '....aaa..aa.....'],
];

const LEGS_SIDE = [
  ['....22222222....', '....222..222....', '....222..222....', '....aaa..aaa....'],
  ['...222222222....', '...22...2222....', '...22....222....', '...aa....aaa....'],
  ['....22222222....', '....22222222....', '....222222......', '....aaaaaa......'],
  ['....22222222....', '....2222..22....', '....222....2....', '....aaa...aa....'],
];

export type Pose =
  | 'idle' | 'idle2' | 'blink'
  | 'walk0' | 'walk1' | 'walk2' | 'walk3'
  | 'hold' | 'pull'
  | 'tend0' | 'tend1';

export const POSES: Pose[] = [
  'idle', 'idle2', 'blink', 'walk0', 'walk1', 'walk2', 'walk3', 'hold', 'pull',
  'tend0', 'tend1',
];

export type Dir = 'front' | 'back' | 'side';

// ---------------------------------------------------------------- looks

export type HeadGear = 'hat' | 'hood' | 'cap' | 'bare';
export type HairStyle = 'short' | 'bob' | 'tied' | 'crop';
export type Outfit = 'shirt' | 'jacket' | 'hoodie' | 'tunic';

export interface Look {
  id: string;
  skin: number;
  skinSh: number;
  hair: number;
  hairSh: number;
  hairStyle: HairStyle;
  head: HeadGear;
  headCol: number;
  headSh: number;
  outfit: Outfit;
  shirt: number;
  shirtDim: number;
  trim: number;
  pants: number;
  boot: number;
}

const SKINS: Array<[number, number]> = [
  [C.Skin, C.SkinSh],
  [C.SkinSh, C.Wood],
  [C.Wood, C.WoodDk],
];

const HAIRS: Array<[number, number]> = [
  [C.WoodDk, C.WoodDp],
  [C.InkDeep, C.Ink],
  [C.Wood, C.WoodDk],
  [C.Slate, C.InkDeep],
  [C.Red, C.Rose],
];

/** Twelve looks, deliberately spread across skin, hair, headwear and
 *  outfit so that two villagers on screen never read as recolours of each
 *  other. Index doubles as the network "hue", so remote players show up
 *  wearing the right thing. */
export const LOOKS: Look[] = [
  look('petani', 0, 0, 'short', 'hat', C.Amber, C.Wood, 'shirt', C.Red, C.Rose),
  look('nelayan', 1, 2, 'crop', 'cap', C.WaterSh, C.WaterDp, 'jacket', C.Grass, C.GrassDk),
  look('pedagang', 0, 3, 'tied', 'bare', 0, 0, 'tunic', C.Amber, C.Wood),
  look('pemuda', 2, 1, 'short', 'hood', C.Slate, C.Ink, 'hoodie', C.WaterBr, C.WaterSh),
  look('gadis', 0, 4, 'bob', 'bare', 0, 0, 'shirt', C.Purple, C.Dusk),
  look('tetua', 1, 3, 'crop', 'hat', C.Wood, C.WoodDk, 'tunic', C.Pale, C.Mist),
  look('kurir', 2, 1, 'crop', 'cap', C.Banner, C.Dusk, 'jacket', C.Orange, C.Wood),
  look('penjaga', 0, 3, 'short', 'cap', C.Stone, C.StoneDk, 'jacket', C.BannerBlue, C.WaterDp),
  look('peramu', 1, 0, 'bob', 'hood', C.Forest, C.ForestDp, 'hoodie', C.GrassDk, C.Forest),
  look('anak', 0, 2, 'short', 'bare', 0, 0, 'shirt', C.SunGlow, C.Amber),
  look('perantau', 2, 4, 'tied', 'hat', C.WoodDk, C.WoodDp, 'jacket', C.Rose, C.Purple),
  look('teknisi', 1, 1, 'crop', 'cap', C.CyberSteel, C.CyberSlate, 'hoodie', C.NeonCyan, C.CyberSteel),
];

function look(
  id: string, skinI: number, hairI: number, hairStyle: HairStyle,
  head: HeadGear, headCol: number, headSh: number,
  outfit: Outfit, shirt: number, shirtDim: number,
): Look {
  const [skin, skinSh] = SKINS[skinI];
  const [hair, hairSh] = HAIRS[hairI];
  return {
    id, skin, skinSh, hair, hairSh, hairStyle, head, headCol, headSh,
    outfit, shirt, shirtDim,
    trim: C.White,
    pants: outfit === 'tunic' ? C.WoodDk : C.Slate,
    boot: C.WoodDp,
  };
}

export const LOOK_COUNT = LOOKS.length;

// ---------------------------------------------------------------- assembly

function base(dir: Dir): string[] {
  return dir === 'front' ? FRONT : dir === 'back' ? BACK : SIDE;
}

/** Replaces the straw hat with whatever this character actually wears. */
function applyHead(c: PixelCanvas, dir: Dir, lk: Look): void {
  if (lk.head === 'hat') {
    c.replace(M_HAT, lk.headCol);
    c.replace(M_HAT_SH, lk.headSh);
    return;
  }

  // Strip the authored hat entirely, then rebuild.
  for (let y = 0; y <= 6; y++) {
    for (let x = 0; x < CH_W; x++) {
      const v = c.get(x, y);
      if (v === M_HAT || v === M_HAT_SH) c.set(x, y, TRANSPARENT);
    }
  }

  const wide = dir === 'side' ? [3, 12] : [3, 12];

  if (lk.head === 'bare') {
    // A skull of hair sitting on top of the head.
    for (let y = 4; y <= 6; y++) {
      for (let x = wide[0]; x <= wide[1]; x++) {
        const edge = y === 4 && (x <= wide[0] + 1 || x >= wide[1] - 1);
        if (edge) continue;
        c.set(x, y, y === 4 ? lk.hair : lk.hair);
      }
    }
    c.hline(wide[0] + 1, 3, wide[1] - wide[0] - 1, lk.hair);
    c.hline(wide[0] + 2, 3, 3, lk.hairSh);
    return;
  }

  if (lk.head === 'cap') {
    for (let y = 3; y <= 5; y++) {
      for (let x = wide[0] + 1; x <= wide[1] - 1; x++) c.set(x, y, lk.headCol);
    }
    c.hline(wide[0] + 1, 3, wide[1] - wide[0] - 1, lk.headCol);
    c.hline(wide[0], 6, wide[1] - wide[0] + 1, lk.headSh);
    // Peak, forward only.
    if (dir === 'front') c.hline(4, 7, 8, lk.headSh);
    else if (dir === 'side') c.hline(6, 7, 7, lk.headSh);
    return;
  }

  // Hood: sits back off the face and wraps the neck.
  for (let y = 3; y <= 7; y++) {
    for (let x = 2; x <= 13; x++) {
      const inFace = dir !== 'back' && y >= 6 && x >= 4 && x <= 11;
      if (inFace) continue;
      c.set(x, y, y <= 4 ? lk.headSh : lk.headCol);
    }
  }
  c.set(2, 8, lk.headCol);
  c.set(13, 8, lk.headCol);
  c.set(2, 9, lk.headSh);
  c.set(13, 9, lk.headSh);
}

/** Hair that shows below the headwear, and the silhouette that gives each
 *  character their shape from behind. */
function applyHair(c: PixelCanvas, dir: Dir, lk: Look): void {
  c.replace(M_HAIR, lk.hair);

  if (lk.head === 'hood') return; // nothing shows

  switch (lk.hairStyle) {
    case 'bob':
      // Falls to the jaw on both sides.
      for (let y = 7; y <= 12; y++) {
        c.set(3, y, lk.hair);
        c.set(12, y, y < 11 ? lk.hair : lk.hairSh);
        if (dir === 'back') for (let x = 4; x <= 11; x++) c.set(x, y, y < 11 ? lk.hair : lk.hairSh);
      }
      break;
    case 'tied':
      // A tail behind the head.
      for (let y = 8; y <= 14; y++) {
        c.set(dir === 'side' ? 3 : 13, y, lk.hair);
        c.set(dir === 'side' ? 2 : 14, y + 1, lk.hairSh);
      }
      break;
    case 'crop':
      // Close cut: only a rim at the temples.
      c.set(3, 7, lk.hairSh);
      c.set(12, 7, lk.hairSh);
      break;
    default:
      for (let y = 7; y <= 9; y++) {
        c.set(3, y, lk.hair);
        c.set(12, y, lk.hairSh);
      }
      break;
  }
}

function applyOutfit(c: PixelCanvas, dir: Dir, lk: Look): void {
  c.replace(M_SHIRT, lk.shirt);
  c.replace(M_SHIRT_DIM, lk.shirtDim);
  c.replace(M_TRIM, lk.trim);
  c.replace(M_PANTS, lk.pants);
  c.replace(M_BOOT, lk.boot);

  switch (lk.outfit) {
    case 'jacket': {
      // An open front with darker lapels.
      const cx = dir === 'side' ? 8 : 8;
      for (let y = 13; y <= 17; y++) {
        c.set(cx - 1, y, lk.shirtDim);
        c.set(cx, y, lk.trim);
      }
      if (dir !== 'back') {
        c.set(cx - 2, 14, lk.shirtDim);
        c.set(cx + 1, 14, lk.shirtDim);
      }
      break;
    }
    case 'hoodie': {
      // A bunched hood behind the shoulders and a pocket seam.
      for (let x = 4; x <= 11; x++) c.set(x, 12, lk.shirtDim);
      c.set(3, 13, lk.shirtDim);
      c.set(12, 13, lk.shirtDim);
      for (let x = 5; x <= 10; x++) c.set(x, 17, lk.shirtDim);
      break;
    }
    case 'tunic': {
      // Longer hem plus a belt, which also shortens the visible legs.
      for (let x = 3; x <= 12; x++) {
        c.set(x, 18, lk.shirt);
        c.set(x, 19, lk.shirtDim);
      }
      for (let x = 4; x <= 11; x++) c.set(x, 17, C.WoodDp);
      c.set(8, 17, C.Gold);
      break;
    }
    default:
      break;
  }
}

/** Lifts the arm on the side the rod is held. */
function raiseArm(c: PixelCanvas, dir: Dir, pull: boolean, lk: Look): void {
  const lift = pull ? 4 : 3;
  const armX = dir === 'side' ? 12 : 13;
  const from = 15;
  const to = dir === 'side' ? 16 : 17;
  for (let y = from; y <= to; y++) c.set(armX, y, TRANSPARENT);
  c.set(armX, from - lift, lk.skin);
  c.set(armX, from - lift + 1, lk.skin);
  c.set(armX, from - lift + 2, lk.skinSh);
  if (dir !== 'side') c.set(armX - 1, from - lift, lk.skinSh);
}

/** Both arms reach down and forward, and a tool shaft goes with them. The
 *  down-stroke pushes the hands lower and tilts the shaft — that swing is
 *  what turns "standing near a plot" into "working on it". */
function workArms(c: PixelCanvas, dir: Dir, down: boolean, lk: Look): void {
  const drop = down ? 3 : 1;
  const arms = dir === 'side' ? [12] : [2, 13];

  for (const armX of arms) {
    // Clear the arm where it hangs in the base sprite.
    for (let y = 15; y <= 17; y++) c.set(armX, y, TRANSPARENT);
    c.set(armX, 15 + drop, lk.skin);
    c.set(armX, 16 + drop, lk.skin);
    c.set(armX, 17 + drop, lk.skinSh);
  }

  // The tool: a shaft from the hands down to the soil, angled further over
  // on the down-stroke.
  const handX = dir === 'side' ? 12 : 13;
  const tilt = down ? 2 : 1;
  for (let k = 0; k < 5; k++) {
    c.set(handX + tilt + k, 17 + drop + k, C.WoodDk);
  }
  // Head of the tool.
  c.set(handX + tilt + 5, 22 + drop, C.Slate);
  c.set(handX + tilt + 4, 22 + drop, C.SlateLt);
}

/** Closes the eyes for one frame. Cheap, and the single most effective
 *  sign of life a standing character can give. */
function closeEyes(c: PixelCanvas, dir: Dir, lk: Look): void {
  if (dir === 'back') return;
  const cols = dir === 'side' ? [6] : [5, 10];
  for (const x of cols) {
    c.set(x, EYE_ROW, lk.skinSh);
    c.set(x, EYE_ROW - 1, lk.skin);
  }
}

function poseCanvas(dir: Dir, pose: Pose, lk: Look): PixelCanvas {
  const rows = base(dir);
  const legs = dir === 'side' ? LEGS_SIDE : LEGS_FRONT;

  let legFrame = 0;
  let bob = 0;
  switch (pose) {
    case 'walk0': legFrame = 0; bob = 0; break;
    case 'walk1': legFrame = 1; bob = -1; break;
    case 'walk2': legFrame = 2; bob = 0; break;
    case 'walk3': legFrame = 3; bob = -1; break;
    // The breath: the torso settles one pixel. Nothing else moves.
    case 'idle2': legFrame = 0; bob = 1; break;
    // Working: the whole torso drops as they bend to the ground and comes
    // back up. Two frames is enough — the arms do the rest.
    case 'tend0': legFrame = 0; bob = 1; break;
    case 'tend1': legFrame = 0; bob = 3; break;
    default: legFrame = 0; bob = 0;
  }

  const c = new PixelCanvas(CH_W, CH_H);

  for (let y = 0; y < LEGS_TOP; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      c.stamp(x, y + bob, [ch]);
    }
  }
  const legRows = legs[legFrame];
  for (let i = 0; i < legRows.length; i++) c.stamp(0, LEGS_TOP + i, [legRows[i]]);

  // Recolour and dress before the pose-specific edits, so those edits can
  // use the look's own colours.
  applyHead(c, dir, lk);
  applyHair(c, dir, lk);
  applyOutfit(c, dir, lk);
  c.replace(M_SKIN, lk.skin);
  c.replace(M_SKIN_SH, lk.skinSh);

  if (pose === 'hold' || pose === 'pull') raiseArm(c, dir, pose === 'pull', lk);
  if (pose === 'tend0' || pose === 'tend1') workArms(c, dir, pose === 'tend1', lk);
  if (pose === 'blink') closeEyes(c, dir, lk);

  c.outline(C.InkDeep, false);
  return c;
}

export interface CharFrame {
  dir: Dir;
  pose: Pose;
  look: number;
  canvas: PixelCanvas;
}

export function buildCharacterFrames(): CharFrame[] {
  const out: CharFrame[] = [];
  const dirs: Dir[] = ['front', 'back', 'side'];
  for (let i = 0; i < LOOKS.length; i++) {
    for (const dir of dirs) {
      for (const pose of POSES) {
        out.push({ dir, pose, look: i, canvas: poseCanvas(dir, pose, LOOKS[i]) });
      }
    }
  }
  return out;
}

export function charKey(look: number, dir: Dir, pose: Pose): string {
  return `ch_${look % LOOK_COUNT}_${dir}_${pose}`;
}

/** Swatch used by the community board and the roster. */
export function lookColour(i: number): number {
  return LOOKS[i % LOOK_COUNT].shirt;
}

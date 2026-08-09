/** Character portraits.
 *
 *  The world sprite is sixteen pixels wide. At that size a face is two dots
 *  and a suggestion, which is fine for someone walking across a field and
 *  useless for someone talking to you. So conversation gets a portrait.
 *
 *  **Features are authored, not computed.** Three earlier versions drew the
 *  eyes, nose and mouth from arithmetic — offsets, curves, ellipse normals —
 *  and every one of them came out subtly wrong in a way that is obvious on
 *  a face and nowhere else. A mouth one pixel too wide is a sneer. An iris
 *  half a pixel off centre is a squint. Faces have no tolerance, and code
 *  that positions features by formula has nothing but tolerance.
 *
 *  So the face is a stamp: a 23x17 grid of marker characters, drawn by hand,
 *  identical for every character. This is exactly what `character.ts`
 *  already does for the world sprite, and it is why the world sprites look
 *  right while the generated portraits did not.
 *
 *  What stays procedural is what arithmetic is actually good at: the skull
 *  silhouette (from an authored profile table), the shading ramp, hair, and
 *  clothing. Per-character variety comes from swapping colours and from a
 *  few pixels of skull width — never from moving the features around, which
 *  is what made twelve villagers look like twelve different mistakes.
 *
 *  Built from the same `Look` record as the world sprite, so a villager's
 *  portrait always matches the figure standing in front of you. */

import { PixelCanvas, Rng, TRANSPARENT } from './canvas';
import { C, RGB_PALETTE } from './palette';
import { LOOKS, LOOK_COUNT, type Look } from './character';

export const PORTRAIT_W = 48;
export const PORTRAIT_H = 64;

/** Expressions. Only three, but that is enough to make a conversation feel
 *  like it has a temperature. */
export type Mood = 'neutral' | 'warm' | 'cold';

// --- palette plumbing -------------------------------------------------

const RAMPS: readonly (readonly C[])[] = [
  [C.InkDeep, C.Ink, C.Slate, C.SlateLt, C.Mist, C.Pale, C.White],
  [C.WoodDp, C.WoodDk, C.Wood, C.SkinSh, C.Skin, C.SunGlow],
  [C.ForestDp, C.Forest, C.GrassDk, C.Grass, C.GrassLt, C.LeafLt],
  [C.WaterDp, C.Water, C.WaterSh, C.WaterBr, C.Foam],
  [C.Dusk, C.Purple, C.Rose, C.Red, C.Orange, C.Amber, C.SunGlow],
  [C.StoneShadow, C.StoneDk, C.Stone, C.StoneLt, C.StonePale],
  [C.CyberVoid, C.CyberSlate, C.CyberSteel, C.NeonCyan],
  [C.Arcane, C.ArcaneLt],
];

function shift(col: number, n: number): number {
  for (const ramp of RAMPS) {
    const i = ramp.indexOf(col);
    if (i < 0) continue;
    return ramp[Math.min(ramp.length - 1, Math.max(0, i + n))];
  }
  return col;
}

function luma(col: number): number {
  const p = RGB_PALETTE[col];
  return p.r * 0.299 + p.g * 0.587 + p.b * 0.114;
}

/** The darker of a Look's two hair tones.
 *
 *  `hairSh` is not reliably the darker one — black hair is stored as
 *  [InkDeep, Ink], where the "shade" is the lighter of the pair. Brows and
 *  lashes drawn from `hairSh` came out pink on the red-haired characters,
 *  which is a memorable way to learn that a field name is not a guarantee. */
function darkHair(lk: Look): number {
  return luma(lk.hair) <= luma(lk.hairSh) ? lk.hair : lk.hairSh;
}

// --- layout -----------------------------------------------------------

const SX = 24;
const HEAD_TOP = 4;
/** Half-width of the head, row by row from HEAD_TOP. Authored: a circular
 *  cranium, a straight run through the temples, then eight rows of jaw
 *  taper to a rounded chin. Computing this from a curve is what produced a
 *  slab with a square jaw. */
const PROFILE = [
  // Cranium. The step pattern matters as much as the shape: a circle of
  // radius 10 steps 2,1,1,1,0,1 across its top, and any other pattern
  // reads as a dent. The old 5,7,8,9,10 finished the arc in four rows and
  // put a visible corner at each temple.
  4, 6, 7, 8, 9, 9,
  // Temples, straight.
  10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
  // Jaw. One pixel per row is a clean 45 degrees, and a clean 45 is the
  // one edge pixel art always gets right.
  10, 9, 8, 7, 6, 5, 4, 3,
];
const CHIN = HEAD_TOP + PROFILE.length - 1;
const HEAD_H = PROFILE.length;
/** Widest row, and the pivot the form shading measures height from. */
const HEAD_MID = HEAD_TOP + 14;
const NECK_TOP = CHIN + 1;
const SHOULDER_Y = 40;

/** Where the authored face stamp lands. */
const FACE_X = SX - 11;
const FACE_Y = 12;

/** The face.
 *
 *  '.' leaves the skin underneath alone. Every other character is a marker
 *  swapped for one of this character's colours at stamp time.
 *
 *    a lit skin   b skin   c shaded skin   d deep skin
 *    h lash and brow        i eye white    j eye corner
 *    k iris       l pupil   m lip
 *
 *  Read it as a picture. The eyes are five wide with a three-row aperture,
 *  the irises sit one pixel inboard so both eyes look at the reader, and
 *  the nose is a two-row bridge shadow with a lit tip — never an outline,
 *  which at this size is a beak. */
const FACE: readonly string[] = [
  //  0    5    10   15   20
  //  |    |    |    |    |
  // Rows 12-14 are left empty: the brows are stamped separately per mood,
  // and a brow drawn here as well would survive under the mood's blanks and
  // flatten every expression back to neutral.
  '.......................', // 12
  '.......................', // 13
  '.......................', // 14
  '.....cccc.....cccc.....', // 15  socket
  '....hhhhh.....hhhhh....', // 16  lash line
  '....jkkij.....jikkj....', // 17  eye
  '....jlkij.....jiklj....', // 18  eye, pupil
  '....jkkij.....jikkj....', // 19  eye
  '....ccccc.....ccccc....', // 20  lower lid
  '............c..........', // 21  nose bridge
  '............c..........', // 22
  '..........abcc.........', // 23  nose tip, lit on the key side
  '..........ccd..........', // 24  nostril shadow
  '.......................', // 25
  '.......................', // 26  mouth is stamped per mood
  '.......................', // 27
  '.......................', // 28
];

/** Mood is three rows of brow and three of mouth. Nothing else moves —
 *  changing the eyes as well made the same person read as two people. */
const BROWS: Record<Mood, readonly string[]> = {
  neutral: [
    '.......................',
    '....hhhhh.....hhhhh....',
    '......hhh.....hhh......',
  ],
  // Inner ends up: sympathy, interest, pleasure.
  warm: [
    '........h.....h........',
    '....hhhh.......hhhh....',
    '....hh...........hh....',
  ],
  // Inner ends down: impatience, suspicion.
  cold: [
    '.......................',
    '....hh...........hh....',
    '....hhhh.......hhhh....',
  ],
};

/** A mouth at this size is one dark row and one lit row. The first version
 *  used a near-black five-wide bar with a bright band under it, and every
 *  villager looked like they were screaming. */
const MOUTHS: Record<Mood, readonly string[]> = {
  neutral: [
    '.......................',
    '.........mmmmm.........',
    '..........aa...........',
  ],
  warm: [
    '........m.....m........',
    '.........mmmmm.........',
    '.........aaaaa.........',
  ],
  cold: [
    '.......................',
    '.........mmmmm.........',
    '........c.....c........',
  ],
};

/** Eye colour is its own thing.
 *
 *  Deriving the iris from the hair gave the red-haired villagers red eyes,
 *  which is the sort of detail that stops reading as a person. */
const EYE_COLOURS: readonly C[] = [C.WoodDk, C.WaterSh, C.Forest, C.Wood, C.Slate];

/** Per-character proportions. Deliberately tiny: the head gets wider or
 *  narrower and the jaw longer or shorter, and that is all. Moving the
 *  features is what broke the earlier versions. */
interface Geom {
  wide: number;
  longJaw: number;
}

function geomFor(rng: Rng): Geom {
  return { wide: rng.range(0.94, 1.06), longJaw: rng.int(0, 2) };
}

function halfAt(row: number, g: Geom): number {
  const i = row - HEAD_TOP;
  if (i < 0) return 0;
  // The jaw stretch inserts rows just above the chin rather than scaling
  // the whole head, so a long face stays a face.
  const jawStart = PROFILE.length - 8;
  const j = i < jawStart ? i : Math.max(jawStart, i - g.longJaw);
  if (j >= PROFILE.length) return 0;
  return PROFILE[j] * g.wide;
}

export function makePortrait(lk: Look, mood: Mood, seed: number): PixelCanvas {
  const rng = new Rng(seed * 7451 + 19);
  const c = new PixelCanvas(PORTRAIT_W, PORTRAIT_H);
  const g = geomFor(rng);

  const eye = EYE_COLOURS[rng.int(0, EYE_COLOURS.length - 1)];

  drawBust(c, lk, g);
  drawNeck(c, lk, g);
  drawHead(c, lk, g);
  stampFace(c, lk, mood, g, eye);
  drawHair(c, lk, g, rng);
  drawHeadwear(c, lk, g);

  despeckle(c);
  outlineSoft(c);
  return c;
}

/** Isolated pixels, removed.
 *
 *  A single pixel that shares no colour with any neighbour is noise, and
 *  noise at this size reads as damage — the strand and sheen passes leave a
 *  scatter of them across the hair. Pixel art wants clusters: if a lone
 *  pixel's neighbours agree with each other, it joins them. */
function despeckle(c: PixelCanvas): void {
  const src = c.px.slice();
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= c.w || y >= c.h ? TRANSPARENT : src[y * c.w + x];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const v = at(x, y);
      if (v === TRANSPARENT) continue;
      const n = [at(x, y - 1), at(x - 1, y), at(x + 1, y), at(x, y + 1)];
      if (n.some((k) => k === v)) continue;
      // Nothing agrees with it. Take the majority of the neighbours, and
      // only when there actually is one.
      for (const k of n) {
        if (k === TRANSPARENT) continue;
        if (n.filter((m) => m === k).length >= 3) {
          c.set(x, y, k);
          break;
        }
      }
    }
  }
}

/** Selective outlining.
 *
 *  A pure black ring around everything is the loudest amateur tell in pixel
 *  art: it flattens the silhouette and it makes skin, cloth and hair all
 *  read as the same material. An outline is a shadow, so it takes its
 *  colour from what it borders — a dark warm brown against skin, a dark
 *  version of the shirt against cloth — and it lightens where the key light
 *  hits, along the top and the left. */
function outlineSoft(c: PixelCanvas): void {
  const src = c.px.slice();
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= c.w || y >= c.h ? TRANSPARENT : src[y * c.w + x];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (at(x, y) !== TRANSPARENT) continue;
      const below = at(x, y + 1);
      const right = at(x + 1, y);
      const above = at(x, y - 1);
      const left = at(x - 1, y);
      const fill = [above, left, right, below].find((v) => v !== TRANSPARENT);
      if (fill === undefined) continue;
      // This outline pixel sits on the lit side when the shape it borders
      // is below it or to its right.
      const lit = below !== TRANSPARENT || right !== TRANSPARENT;
      c.set(x, y, shift(fill, lit ? -2 : -3));
    }
  }
}

/** Four skin values. Two cannot describe a sphere. */
function skinRamp(lk: Look): [number, number, number, number] {
  return [shift(lk.skinSh, -1), lk.skinSh, lk.skin, shift(lk.skin, 1)];
}

function chinRow(g: Geom): number {
  return CHIN + g.longJaw;
}

function drawHead(c: PixelCanvas, lk: Look, g: Geom): void {
  const [deep, sh, base, hi] = skinRamp(lk);
  const chin = chinRow(g);

  for (let y = HEAD_TOP; y <= chin; y++) {
    const half = halfAt(y, g);
    if (half < 0.5) continue;
    const l = Math.round(SX - half);
    const r = Math.round(SX + half);
    // Pillow shading is the mistake this replaces: running a light band
    // down one edge of the outline and a dark band down the other puts the
    // light source at the viewer and leaves the head reading as a flat
    // cut-out with a rim. Both bands also sit parallel to the silhouette
    // and to each other, which is banding on top of it.
    //
    // Real form shading needs a direction. The key is upper-left, so the
    // value comes from a term that mixes x and y — that makes the
    // terminator sweep diagonally across the cheek, and it darkens the jaw
    // on *both* sides, because the jaw faces away from a light that is
    // above it.
    // The base tone has to own most of the face. Weighting the height term
    // as heavily as the width term swung the terminator across the middle
    // and put everything below the cheekbone in shadow, which reads as a
    // dirty face rather than a lit one — shadow is the minority note.
    const ny = (y - HEAD_MID) / (HEAD_H * 0.5);
    for (let x = l; x <= r; x++) {
      const nx = (x - SX) / half;
      const key = -nx * 0.66 - ny * 0.36;
      c.set(x, y, key > 0.45 ? hi : key > -0.30 ? base : key > -0.70 ? sh : deep);
    }
  }

  // Jaw and chin. The last four rows fall away, with a lit chin ball above
  // the shadow so the chin has a front plane.
  for (let y = chin - 3; y <= chin; y++) {
    const half = halfAt(y, g);
    const l = Math.round(SX - half);
    const r = Math.round(SX + half);
    for (let x = l; x <= r; x++) {
      if (y >= chin - 1) c.set(x, y, deep);
      else if (x >= r - 2) c.set(x, y, sh);
    }
  }

  // Ears, at eye height, small. An ear that reads clearly at this size is
  // an ear that is too big.
  for (const side of [-1, 1] as const) {
    const ex = Math.round(SX + side * halfAt(FACE_Y + 5, g));
    for (let y = FACE_Y + 4; y <= FACE_Y + 8; y++) {
      c.set(ex, y, side < 0 ? hi : sh);
      c.set(ex + side, y, side < 0 ? sh : deep);
    }
  }
}

function stampFace(
  c: PixelCanvas, lk: Look, mood: Mood, g: Geom, eye: number,
): void {
  const [deep, sh, base, hi] = skinRamp(lk);
  const dark = darkHair(lk);
  // Lashes are hair seen against skin — always the darkest note on a face,
  // never the hair's own colour.
  const lash = luma(dark) > 90 ? shift(dark, -2) : dark;

  const colFor = (ch: string): number => {
    switch (ch) {
      case 'a': return hi;
      case 'b': return base;
      case 'c': return sh;
      case 'd': return deep;
      case 'h': return lash;
      case 'i': return C.White;
      case 'j': return C.Pale;
      case 'k': return eye;
      case 'l': return C.InkDeep;
      // The lip line needs to survive being drawn on shaded skin. At one
      // step under the shade it matched the shadow it sat in and the mouth
      // vanished; at two it is a line rather than the near-black bar the
      // first version used, which read as a scream.
      case 'm': return shift(lk.skinSh, -2);
      default: return -1;
    }
  };

  const stamp = (rows: readonly string[], y0: number): void => {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let i = 0; i < row.length; i++) {
        const col = colFor(row[i]);
        if (col < 0) continue;
        const x = FACE_X + i;
        const y = y0 + r;
        // Never paint outside the head: a wide mouth on a narrow face would
        // otherwise hang off the jaw.
        if (Math.abs(x - SX) > halfAt(y, g)) continue;
        c.set(x, y, col);
      }
    }
  };

  stamp(FACE, FACE_Y);
  stamp(BROWS[mood], FACE_Y);
  // The mouth drops with a long jaw so it stays low on the face rather
  // than riding up into the middle of it.
  stamp(MOUTHS[mood], FACE_Y + 14 + g.longJaw);

  // Blush, and only when it means something. The skin ramp steps hard, so
  // a patch of `skinSh` on a light face is a bruise rather than a flush —
  // it goes on for a warm mood, where the expression explains it, and
  // nowhere else.
  if (mood !== 'warm') return;
  for (const side of [-1, 1] as const) {
    const bx = SX + side * 7;
    for (let dx = -1; dx <= 1; dx++) {
      const x = bx + dx;
      const y = FACE_Y + 11;
      const v = c.get(x, y);
      if (v !== base && v !== hi) continue;
      c.set(x, y, lk.skinSh);
    }
  }
}

function drawNeck(c: PixelCanvas, lk: Look, g: Geom): void {
  const [deep, sh] = skinRamp(lk);
  const top = NECK_TOP + g.longJaw;
  for (let y = top; y <= SHOULDER_Y + 1; y++) {
    // A trapezoid, not a post: the neck widens into the shoulders.
    const half = Math.round((4 + (y - top) * 0.4) * g.wide);
    for (let x = SX - half; x <= SX + half; x++) {
      // The jaw throws a shadow across the top of the neck that fades as it
      // falls. That shadow is what glues the head to the body — but the
      // skin ramp steps hard, so holding the deep tone down the whole neck
      // turned it into a dark brown post that read as a beard.
      const fall = y - top;
      c.set(x, y, fall < 2 ? deep : x > SX + half - 2 ? deep : sh);
    }
  }
}

function drawBust(c: PixelCanvas, lk: Look, g: Geom): void {
  const dim = lk.shirtDim;
  const lit = shift(lk.shirt, 1);
  for (let y = SHOULDER_Y; y < PORTRAIT_H; y++) {
    const t = (y - SHOULDER_Y) / (PORTRAIT_H - SHOULDER_Y);
    const half = Math.round((10 + Math.pow(t, 0.5) * 14) * g.wide);
    for (let x = SX - half; x <= SX + half; x++) {
      const nx = (x - SX) / half;
      // The boundary leans, following the slope of the shoulder. A vertical
      // seam down the middle of a chest is banding: the eye reads it as a
      // stripe painted on the shirt rather than as the body turning away.
      c.set(x, y, nx < -0.5 + t * 0.2 ? lit : nx > 0.5 - t * 0.25 ? dim : lk.shirt);
    }
  }
  for (let y = SHOULDER_Y + 3; y < PORTRAIT_H; y++) {
    const s = Math.round(Math.sin((y - SHOULDER_Y) * 0.35) * 2);
    c.set(SX - 13 + s, y, dim);
    c.set(SX + 12 - s, y, dim);
  }
  // The head casts onto the chest. Without it the bust reads as a backdrop
  // the head happens to be standing in front of.
  for (let y = SHOULDER_Y; y < SHOULDER_Y + 4; y++) {
    const w = 8 - (y - SHOULDER_Y);
    for (let x = SX - w; x <= SX + w; x++) c.set(x, y, shift(dim, -1));
  }

  const cy = SHOULDER_Y + 2;
  switch (lk.outfit) {
    case 'jacket':
      for (let i = 0; i < 8; i++) {
        c.set(SX - 4 - i, cy + i, dim);
        c.set(SX - 3 - i, cy + i, lk.trim);
        c.set(SX + 4 + i, cy + i, dim);
        c.set(SX + 3 + i, cy + i, lk.trim);
      }
      break;
    case 'hoodie':
      for (let y = 0; y < 4; y++) {
        for (let x = SX - 12 + y; x <= SX + 12 - y; x++) {
          c.set(x, cy - 2 + y, y < 2 ? dim : shift(dim, -1));
        }
      }
      break;
    case 'tunic':
      for (let x = SX - 6; x <= SX + 6; x++) {
        c.set(x, cy + 2, lk.trim);
        c.set(x, cy + 3, dim);
      }
      c.rect(SX - 1, cy + 4, 2, 2, C.Gold);
      break;
    default:
      for (let i = 0; i < 5; i++) {
        c.set(SX - 3 - i, cy + 2 + i, lk.trim);
        c.set(SX + 3 + i, cy + 2 + i, lk.trim);
      }
      break;
  }
}

/** Where the hairline falls at a column: lower over the middle of the brow,
 *  lifting at the temples. */
function hemAt(x: number): number {
  const nx = (x - SX) / 11;
  // Two clear rows of forehead between the hairline and the brows. Any
  // lower and the hair sits on the eyebrows, which reads as a helmet.
  return FACE_Y - 3 + Math.cos(nx * 1.4) * 2;
}

function drawHair(c: PixelCanvas, lk: Look, g: Geom, rng: Rng): void {
  const dark = darkHair(lk);
  // Take the highlight off the *lighter* of the pair. Black hair is stored
  // [InkDeep, Ink], so `shift(lk.hair, 1)` landed on Ink — exactly the tone
  // the cap is already drawn in. Every highlight strand disappeared and
  // every dark strand became a bar, which is why the black-haired villager
  // had scratch marks on her crown.
  const light = dark === lk.hair ? lk.hairSh : lk.hair;
  const hi = shift(light, 1);
  const covered = lk.head === 'hat' || lk.head === 'hood';
  const [, sh] = skinRamp(lk);

  if (lk.head !== 'hood') {
    // The cap sits proud of the skull — hair has thickness, and laying it
    // flat on the skull line makes it read as paint.
    for (let y = HEAD_TOP - 4; y <= FACE_Y + 4; y++) {
      const half = halfAt(Math.max(HEAD_TOP, y), g) + (y < HEAD_TOP + 6 ? 2.2 : 1.4);
      for (let x = Math.round(SX - half); x <= Math.round(SX + half); x++) {
        if (y > hemAt(x)) continue;
        c.set(x, y, lk.hairSh);
      }
    }

    // Strands walked down from the crown, drifting outward as the skull
    // widens. Straight vertical lines down a flat cap read as corduroy.
    // Strands near the centre have almost no outward drift, so they came
    // out as dead-straight vertical lines — corduroy, not hair. Each one
    // now gets a lateral wobble and its own stopping point, so no two run
    // the same length down the same column.
    const strands = rng.int(6, 9);
    for (let s = 0; s < strands; s++) {
      const t = s / Math.max(1, strands - 1);
      const startX = SX - 10 + t * 20;
      const bright = rng.chance(0.3);
      const tone = bright ? hi : rng.chance(0.5) ? lk.hair : dark;
      const stop = HEAD_TOP + rng.int(2, 12);
      const wob = rng.range(0.5, 1.4);
      const phase = rng.range(0, 6);
      let x = startX;
      for (let y = HEAD_TOP - 3; y <= Math.min(stop, FACE_Y + 4); y++) {
        x += ((startX - SX) / 10) * 0.4;
        const px = Math.round(x + Math.sin((y + phase) * 0.55) * wob);
        if (Math.abs(px - SX) > halfAt(Math.max(HEAD_TOP, y), g) + 2) break;
        if (y > hemAt(px)) break;
        c.set(px, y, tone);
      }
    }

    // The sheen: one band following the curve of the skull. This single
    // detail is most of what separates hair from a helmet — but only as a
    // continuous run. Dropping random pixels out of it left dashes and
    // brackets scattered over the crown that read as scratches, especially
    // on the black-haired characters where the highlight is barely lighter
    // than the hair.
    const shineL = SX - rng.int(7, 10);
    const shineR = SX + rng.int(4, 9);
    for (let x = shineL; x <= shineR; x++) {
      const nx = (x - SX) / 10;
      const y = HEAD_TOP + Math.round(nx * nx * 4);
      // Taper at both ends rather than stopping square.
      const edge = Math.min(x - shineL, shineR - x);
      c.set(x, y, edge === 0 ? lk.hair : hi);
    }

    // The hairline, and the shadow the fringe throws on the forehead. That
    // shadow is what seats hair *on* a head instead of beside it.
    for (let x = SX - 11; x <= SX + 11; x++) {
      const hem = Math.round(hemAt(x));
      if (Math.abs(x - SX) > halfAt(hem, g)) continue;
      c.set(x, hem, dark);
      if (c.get(x, hem + 1) !== TRANSPARENT) c.set(x, hem + 1, sh);
    }
  }

  if (covered) return;

  switch (lk.hairStyle) {
    case 'bob':
      // Chin length, curling in under the jaw.
      for (let y = FACE_Y - 4; y <= chinRow(g) - 1; y++) {
        const t = (y - (FACE_Y - 4)) / (chinRow(g) - 1 - (FACE_Y - 4));
        const out = 11.5 + Math.sin(t * 2.4) * 2 - t * t * 4;
        for (let k = 0; k < 3; k++) {
          c.set(Math.round(SX - out + k), y, k === 0 ? dark : lk.hair);
          c.set(Math.round(SX + out - k), y, k === 0 ? dark : lk.hairSh);
        }
      }
      break;
    case 'tied': {
      for (let y = FACE_Y - 2; y <= PORTRAIT_H - 2; y++) {
        const sway = Math.sin((y - FACE_Y) * 0.15) * 3;
        const x0 = Math.round(SX + 10 + sway);
        for (let k = 0; k < 4; k++) {
          c.set(x0 + k, y, k === 0 ? dark : k < 2 ? lk.hair : lk.hairSh);
        }
      }
      // The tie, painted only over hair. As a plain rect it landed on the
      // cheek of anyone with a narrow skull and read as a wound.
      for (let y = FACE_Y - 3; y < FACE_Y + 1; y++) {
        for (let x = SX + 8; x < SX + 13; x++) {
          const v = c.get(x, y);
          if (v !== lk.hair && v !== lk.hairSh && v !== dark && v !== hi) continue;
          c.set(x, y, y === FACE_Y - 3 ? C.Rose : C.Red);
        }
      }
      for (let y = FACE_Y - 2; y <= FACE_Y + 4; y++) c.set(SX - 11, y, lk.hair);
      break;
    }
    case 'crop':
      for (let y = FACE_Y - 4; y <= FACE_Y + 5; y++) {
        for (const side of [-1, 1] as const) {
          const x = Math.round(SX + side * (halfAt(y, g) + 1));
          c.set(x, y, side < 0 ? lk.hair : lk.hairSh);
        }
      }
      break;
    default:
      // Long, past the shoulders and widening as it falls.
      for (let y = FACE_Y - 4; y <= PORTRAIT_H - 1; y++) {
        const t = Math.max(0, (y - (FACE_Y - 4)) / 40);
        const out = 11.5 + t * 6;
        const thick = 3 + Math.round(t * 3);
        for (let k = 0; k < thick; k++) {
          c.set(Math.round(SX - out + k), y, k === 0 ? dark : k < 2 ? lk.hair : lk.hairSh);
          c.set(Math.round(SX + out - k), y, k === 0 ? dark : lk.hairSh);
        }
      }
      break;
  }
}

function drawHeadwear(c: PixelCanvas, lk: Look, g: Geom): void {
  if (lk.head === 'bare') return;
  const [, sh, base] = skinRamp(lk);

  if (lk.head === 'hat') {
    // The crown has to *overlap* the skull. A crown that stops above the
    // head leaves the brim reading as a stick balanced on top.
    const brimY = HEAD_TOP + 2;
    for (let y = HEAD_TOP - 7; y <= brimY; y++) {
      const t = (y - (HEAD_TOP - 7)) / (brimY - (HEAD_TOP - 7));
      const half = Math.round((6 + Math.pow(t, 0.7) * 6) * g.wide);
      for (let x = SX - half; x <= SX + half; x++) {
        c.set(x, y, (x - SX) / half < -0.25 ? lk.headCol : lk.headSh);
      }
    }
    // Brim, seen slightly from below, so it dips at the sides.
    for (let x = SX - 18; x <= SX + 18; x++) {
      const nx = (x - SX) / 18;
      const y = brimY + Math.round(nx * nx * 3);
      c.set(x, y, lk.headCol);
      c.set(x, y + 1, lk.headSh);
      c.set(x, y + 2, shift(lk.headSh, -1));
    }
    for (let x = SX - 10; x <= SX + 10; x++) c.set(x, brimY - 1, C.WoodDp);
    for (let x = SX - 12; x <= SX + 12; x++) {
      for (let y = brimY + 3; y <= FACE_Y; y++) {
        const v = c.get(x, y);
        if (v === base) c.set(x, y, sh);
        else if (v === lk.hair) c.set(x, y, lk.hairSh);
      }
    }
    return;
  }

  if (lk.head === 'cap') {
    const peakY = HEAD_TOP + 4;
    for (let y = HEAD_TOP - 5; y <= peakY; y++) {
      const t = (y - (HEAD_TOP - 5)) / (peakY - (HEAD_TOP - 5));
      const half = Math.round((7 + Math.pow(t, 0.6) * 5) * g.wide);
      for (let x = SX - half; x <= SX + half; x++) {
        c.set(x, y, (x - SX) / half < -0.3 ? lk.headCol : lk.headSh);
      }
    }
    for (let y = HEAD_TOP - 5; y <= peakY - 2; y++) c.set(SX - 2, y, shift(lk.headSh, -1));
    for (let x = SX - 15; x <= SX + 5; x++) {
      const nx = (x - SX) / 15;
      const y = peakY + 1 + Math.round(nx * nx * 2);
      c.set(x, y, lk.headSh);
      c.set(x, y + 1, C.InkDeep);
    }
    for (let x = SX - 12; x <= SX + 4; x++) {
      for (let y = peakY + 3; y <= peakY + 4; y++) {
        if (c.get(x, y) === base) c.set(x, y, sh);
      }
    }
    return;
  }

  // Hood: cloth draped over a sphere. An oval opening with a rolled lip,
  // not a trapezoid with a rectangular hole — that read as a cardboard mask.
  const faceCY = FACE_Y + 8;
  const inOpening = (x: number, y: number, grow = 0): boolean => {
    const ox = (x - SX) / (12 + grow);
    const oy = (y - faceCY) / (16 + grow);
    return ox * ox + oy * oy < 1;
  };

  for (let y = HEAD_TOP - 8; y <= SHOULDER_Y + 5; y++) {
    const t = (y - (HEAD_TOP - 8)) / (SHOULDER_Y + 5 - (HEAD_TOP - 8));
    const crown = t < 0.3
      ? 16 * Math.sqrt(Math.max(0, 1 - Math.pow((0.3 - t) / 0.34, 2)))
      : 16;
    const half = Math.round((crown + Math.max(0, t - 0.3) * 13) * g.wide);
    for (let x = SX - half; x <= SX + half; x++) {
      if (inOpening(x, y) && y < chinRow(g) + 2) continue;
      const nx = (x - SX) / Math.max(1, half);
      c.set(x, y, nx < -0.3 ? lk.headCol : nx > 0.5 ? shift(lk.headSh, -1) : lk.headSh);
    }
  }
  for (let y = HEAD_TOP - 8; y <= chinRow(g) + 2; y++) {
    for (let x = SX - 18; x <= SX + 18; x++) {
      if (inOpening(x, y) || !inOpening(x, y, 2)) continue;
      c.set(x, y, x < SX ? shift(lk.headCol, 1) : lk.headCol);
    }
  }
  for (let k = -2; k <= 2; k++) {
    const fx = SX + k * 6;
    for (let y = HEAD_TOP - 7; y <= SHOULDER_Y + 5; y++) {
      if (inOpening(fx, y, 3)) continue;
      const v = c.get(fx, y);
      if (v === lk.headSh || v === lk.headCol) c.set(fx, y, shift(lk.headSh, -1));
    }
  }
  // Hair at the hairline inside the opening, then one value of shade over
  // the brow. Crushing this to black turned the face into a cut-out
  // floating in a hole.
  for (let x = SX - 10; x <= SX + 10; x++) {
    const bottom = Math.round(hemAt(x));
    for (let y = HEAD_TOP - 6; y <= bottom; y++) {
      if (!inOpening(x, y) || c.get(x, y) === TRANSPARENT) continue;
      c.set(x, y, (x - SX) / 10 < -0.2 ? lk.hair : lk.hairSh);
    }
  }
  for (let x = SX - 12; x <= SX + 12; x++) {
    for (let y = HEAD_TOP; y <= FACE_Y + 1; y++) {
      if (c.get(x, y) === base) c.set(x, y, sh);
    }
  }
}

export interface PortraitFrame {
  look: number;
  mood: Mood;
  canvas: PixelCanvas;
}

export function buildPortraits(): PortraitFrame[] {
  const out: PortraitFrame[] = [];
  const moods: Mood[] = ['neutral', 'warm', 'cold'];
  for (let i = 0; i < LOOK_COUNT; i++) {
    for (const mood of moods) {
      out.push({ look: i, mood, canvas: makePortrait(LOOKS[i], mood, i + 1) });
    }
  }
  return out;
}

export function portraitKey(look: number, mood: Mood): string {
  return `pt_${look % LOOK_COUNT}_${mood}`;
}

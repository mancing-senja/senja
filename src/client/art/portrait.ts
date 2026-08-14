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
import { GARMENTS, clothFrom, drawGarment } from './garment';
import { wearFor, type Season } from '../world/season';

export const PORTRAIT_W = 64;
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

/** Centre column. The canvas is 64 wide rather than 48 because at 48 the
 *  shoulders reached the frame and long hair was cut off square against it —
 *  a straight vertical edge down the side of a person, which reads as damage
 *  rather than as a crop. Everything here is positioned relative to SX, so
 *  widening the canvas moved nothing. */
const SX = 32;
const HEAD_TOP = 5;
/** Half-width of the head, row by row from HEAD_TOP. Authored: a circular
 *  cranium, a straight run through the temples, then eight rows of jaw
 *  taper to a rounded chin. Computing this from a curve is what produced a
 *  slab with a square jaw. */
const PROFILE = [
  // A round head. Nearly as wide as it is tall.
  //
  // The version before this tapered continuously from the cheekbone down
  // to a two-pixel chin, and the result did not read as a person — a face
  // that narrows the whole way is a wedge, and a wedge is a mask. Look at
  // any of the references: the width holds near its maximum for most of
  // the head, the cheek stays full, and the jaw only turns in over the
  // last few rows, to a chin that is *blunt*.
  //
  // Full cheeks are what make a face read as healthy and human. A pointed
  // one reads as a doll however good the eyes on it are.
  5, 8, 10, 11, 12, 12,
  // Cheeks. Thirteen rows at full width — this long run is the whole fix.
  13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,
  // Jaw: in fast, and stopping blunt rather than at a point.
  12, 12, 11, 10, 8, 6,
];
const CHIN = HEAD_TOP + PROFILE.length - 1;
const NECK_TOP = CHIN + 1;
/** The round head is six rows shorter than the pointed one it replaced, so
 *  the shoulders come up to meet it. Left where it was, the neck ran a
 *  dozen rows and read as a post with a head balanced on top. */
const SHOULDER_Y = 37;

/** Where the authored face stamp lands. 27 columns, x11 to x37.
 *
 *  Shifted two pixels off the skull's centre. That offset *is* the
 *  three-quarter turn: every reference sheet has the head angled rather
 *  than square to the viewer, and a face dead-centre on its skull is the
 *  most immediate tell that a portrait was assembled rather than drawn. */
const TURN = 2;
const FACE_X = SX - 13 - TURN;
const FACE_Y = 15;
/** Top row of the eyes — the heavy upper lid, not the aperture. Sits just
 *  below the head's vertical middle, which is where anime puts them. */
const EYE_Y = 17;

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
  //  0    5    10   15   20   25
  //  |    |    |    |    |    |
  // Rows 15-16 are left empty: the brows are stamped separately per mood,
  // and a brow drawn here as well would survive under the mood's blanks and
  // flatten every expression back to neutral.
  '...........................', // 15  brow
  '...........................', // 16  brow
  // Two solid rows of upper lid. The references all have this — a heavy
  // lid over a big iris is what makes an anime eye look lidded and alive
  // rather than like a bead glued to a face.
  //
  // The far eye is six wide against the near eye's eight. That difference
  // is the three-quarter turn as far as the face is concerned: drawing
  // both eyes the same size on a turned head is what makes a portrait
  // read as facing two directions at once.
  '...hhhhhhhh.......hhhhhh...', // 17
  '...hhhhhhhh.......hhhhhh...', // 18
  '...jineekij.......jineej...', // 19  catchlight, then shadowed iris
  '...jkkllkkj.......jkllkj...', // 20  pupil
  '...jjKKKKjj.......jKKKKj...', // 21  iris floor, lit
  '....jjjjjj.........jjjj....', // 22  lower lid
  '...........................', // 23
  // Blush sits low and outboard on a full cheek — the references put it
  // out near the jaw, not up against the eye.
  '....ppp..............ppp...', // 24
  '....ppp......d.......ppp...', // 25  and the nose: one pixel
  '...........................', // 26
  '...........................', // 27  mouth is stamped per mood
  '...........................', // 28
  '...........................', // 29
];

/** Mood is three rows of brow and three of mouth. Nothing else moves —
 *  changing the eyes as well made the same person read as two people. */
const BROWS: Record<Mood, readonly string[]> = {
  neutral: [
    '...hhhhhhhh.......hhhhhh...',
    '...........................',
  ],
  // Inner ends up: sympathy, interest, pleasure. The inner half rides the
  // upper row, the outer half the lower one.
  warm: [
    '.......hhhh.......hhhh.....',
    '...hhhh................hh..',
  ],
  // Inner ends down: impatience, suspicion.
  cold: [
    '...hhhh................hh..',
    '.......hhhh.......hhhh.....',
  ],
};

/** A mouth at this size is one dark row and one lit row. The first version
 *  used a near-black five-wide bar with a bright band under it, and every
 *  villager looked like they were screaming. */
/** Two pixels, sometimes three. Every reference has a mouth this small —
 *  at this scale anything wider stops being a mouth and becomes an
 *  expression you did not ask for. */
const MOUTHS: Record<Mood, readonly string[]> = {
  neutral: [
    '...........................',
    '.............mm............',
    '...........................',
  ],
  warm: [
    '............m..m...........',
    '.............mm............',
    '............aaaa...........',
  ],
  cold: [
    '...........................',
    '............mmmm...........',
    '...........c....c..........',
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

export function makePortrait(
  lk: Look, mood: Mood, seed: number, season?: Season,
): PixelCanvas {
  const rng = new Rng(seed * 7451 + 19);
  const c = new PixelCanvas(PORTRAIT_W, PORTRAIT_H);
  const g = geomFor(rng);

  const eye = EYE_COLOURS[rng.int(0, EYE_COLOURS.length - 1)];

  drawBust(c, lk, g, season);
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

/** Four skin values: deep, shade, base, lit.
 *
 *  All four are now authored in the palette rather than reached by stepping
 *  an index. The old version stepped the *wood* ramp, so the deepest tone on
 *  a face was plank brown and every shadow ran toward mud. Skin in shadow
 *  goes red, not brown, and no amount of index arithmetic over a furniture
 *  ramp will produce that. */
function skinRamp(lk: Look): [number, number, number, number] {
  return [lk.skinDp, lk.skinSh, lk.skin, lk.skinLt];
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
    // Cel shading. Anime does not run a gradient across a cheek: it uses
    // flat colour and one hard-edged shadow *shape*, and reading that
    // shape as a shape is the entire effect. Soft form shading — even
    // correct form shading — reads as a different genre.
    //
    // The boundary is a straight vertical line at a fixed x, not a
    // fraction of the row's half-width. Following the silhouette would be
    // pillow shading, and it would also make the shadow a constant-width
    // band, which is banding. Because the head narrows toward the chin, a
    // fixed line tapers the shadow by itself.
    for (let x = l; x <= r; x++) {
      c.set(x, y, x > SX + 5 ? sh : base);
    }
  }

  // The fringe's shadow across the forehead. In anime this is the largest
  // and most recognisable shadow on a face — it is what seats hair *on* a
  // head rather than beside it. Hard edge, no falloff.
  for (let y = HEAD_TOP; y < EYE_Y - 1; y++) {
    const half = halfAt(y, g);
    for (let x = Math.round(SX - half); x <= Math.round(SX + half); x++) {
      if (c.get(x, y) === TRANSPARENT) continue;
      c.set(x, y, x > SX + 5 ? deep : sh);
    }
  }

  // Under the chin, and the jaw's own shadow. Two rows, hard edged.
  for (let y = chin - 1; y <= chin; y++) {
    const half = halfAt(y, g);
    for (let x = Math.round(SX - half); x <= Math.round(SX + half); x++) {
      if (c.get(x, y) === TRANSPARENT) continue;
      c.set(x, y, deep);
    }
  }

  // One placed highlight on the lit cheek. Anime puts a single small
  // light shape on a face, never a band down the edge.
  for (let k = 0; k < 3; k++) {
    for (let x = SX - 10 + k; x <= SX - 6 + k; x++) {
      if (c.get(x, EYE_Y + 5 + k) === base) c.set(x, EYE_Y + 5 + k, hi);
    }
  }

  // One ear, on the far side of the turn — the near one is hidden by the
  // angle of the head. Drawing both is what makes a turned portrait look
  // like it is facing two directions at once.
  const ex = Math.round(SX + halfAt(EYE_Y + 2, g));
  for (let y = EYE_Y + 1; y <= EYE_Y + 5; y++) {
    c.set(ex, y, sh);
    c.set(ex + 1, y, deep);
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
      // The catchlight. One pixel of pure white high in the iris, on the
      // side the light comes from. It is the smallest mark on the face and
      // the one that decides whether the eye is wet or painted on — every
      // anime reference has it and this file did not, which is most of why
      // the eyes read as flat discs.
      case 'n': return C.White;
      // Sclera. Drawn in Pale it read as grey and the eye looked dirty;
      // white sclera against a big saturated iris is the anime contrast.
      case 'j': return C.White;
      // The iris runs dark under the lid and light along its floor. That
      // vertical gradient inside a big iris is the second anime tell after
      // the size of the eye itself.
      case 'k': return eye;
      // The top of the iris, in shadow under the lid. The references run a
      // three-step gradient down a big iris — dark, mid, lit — and with
      // only mid and lit the eye reads as a flat disc with a bright strip
      // under it.
      case 'e': return shift(eye, -1);
      case 'K': return shift(eye, 2);
      case 'l': return C.InkDeep;
      // Blush. Anime wears it high on the cheekbone and openly — it is a
      // feature, not the faint flush a realistic portrait would use.
      case 'p': return C.Rose;
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
  // One row higher than the face stamp, so there are two clear rows of
  // forehead between the brow and the lash.
  stamp(BROWS[mood], FACE_Y - 1);
  // The mouth drops with a long jaw so it stays low on the face rather
  // than riding up into the middle of it.
  stamp(MOUTHS[mood], FACE_Y + 11 + g.longJaw);

  // A warm mood gets a second row of blush, so the same face reads as
  // pleased rather than merely present.
  if (mood !== 'warm') return;
  for (const side of [-1, 1] as const) {
    for (let dx = 0; dx < 5; dx += 2) {
      const x = SX + side * 4 + (side < 0 ? -dx : dx);
      const v = c.get(x, FACE_Y + 12);
      if (v !== base && v !== hi && v !== sh) continue;
      c.set(x, FACE_Y + 12, C.Rose);
    }
  }
  void deep;
}

function drawNeck(c: PixelCanvas, lk: Look, g: Geom): void {
  const [deep, sh, base] = skinRamp(lk);
  const top = NECK_TOP + g.longJaw;
  for (let y = top; y <= SHOULDER_Y + 1; y++) {
    // A trapezoid, not a post: the neck widens into the shoulders.
    const half = Math.round((4 + (y - top) * 0.4) * g.wide);
    for (let x = SX - half; x <= SX + half; x++) {
      // The jaw's shadow lands on the top row and nowhere else. The skin
      // ramp steps hard, so anything more than that turns the neck into a
      // dark column — which on the muted outfits read as a collar, or a
      // beard, on every character at once.
      const fall = y - top;
      c.set(x, y, fall === 0 ? deep : x > SX + half - 2 ? sh : base);
    }
  }
}

/** Half-width of the torso at a row. Shared with the garment pass, which
 *  needs the same silhouette so nothing gets painted into thin air. */
/** Half-width of the torso, row by row from SHOULDER_Y. Authored, for the
 *  same reason the skull is: the previous version widened by a square root
 *  all the way to the bottom of the frame, so every bust was a cone that got
 *  wider until it ran out of canvas. A shoulder slopes down and out from the
 *  neck for a few rows and then the arm hangs — it does not keep spreading. */
const BUST: readonly number[] = [
  // The slope off the neck.
  10, 13, 15, 17, 18, 19, 20, 20,
  // Shoulder point, and then the arms drop.
  21, 21, 21, 21, 21, 21,
  21, 21, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22,
];

function bustHalf(y: number, g: Geom): number {
  if (y < SHOULDER_Y) return 0;
  const i = Math.min(BUST.length - 1, y - SHOULDER_Y);
  return Math.round(BUST[i] * g.wide);
}

function drawBust(
  c: PixelCanvas, lk: Look, g: Geom, season?: Season,
): void {
  const dim = lk.shirtDim;
  const lit = shift(lk.shirt, 1);
  for (let y = SHOULDER_Y; y < PORTRAIT_H; y++) {
    const t = (y - SHOULDER_Y) / (PORTRAIT_H - SHOULDER_Y);
    const half = bustHalf(y, g);
    if (half <= 0) continue;
    for (let x = SX - half; x <= SX + half; x++) {
      const nx = (x - SX) / half;
      // The boundary leans, following the slope of the shoulder. A vertical
      // seam down the middle of a chest is banding: the eye reads it as a
      // stripe painted on the shirt rather than as the body turning away.
      c.set(x, y, nx < -0.5 + t * 0.2 ? lit : nx > 0.5 - t * 0.25 ? dim : lk.shirt);
    }
  }
  // The head casts onto the chest. Without it the bust reads as a backdrop
  // the head happens to be standing in front of.
  for (let y = SHOULDER_Y; y < SHOULDER_Y + 4; y++) {
    const w = 8 - (y - SHOULDER_Y);
    for (let x = SX - w; x <= SX + w; x++) c.set(x, y, shift(dim, -1));
  }

  // Then the garment itself: neckline, collar band, opening, seam, weave and
  // the rim of light down the lit edge. This used to be a two-pixel V and a
  // switch with four cases, and every villager was wearing the same shirt in
  // a different dye.
  const [skinDp, skinSh] = skinRamp(lk);
  // The season dresses them; the character only decides the colours. This is
  // the most human of the four things a season changes — a valley where the
  // light shifts but everyone wears the same coat all year is a valley where
  // nothing really happened.
  //
  // Keyed off the character, not rolled, so a villager keeps the same coat
  // all season instead of changing it every time you say hello.
  const wearing = season
    ? wearFor(season, hashId(lk.id))
    : lk.garment;
  drawGarment(
    c, GARMENTS[wearing],
    clothFrom(lk.shirt, dim, lk.trim, innerFor(lk), skinSh, skinDp, shift),
    SX, SHOULDER_Y, PORTRAIT_H,
    (y) => bustHalf(y, g),
  );
}

/** What shows through an open jacket.
 *
 *  A light inner layer against a dark outer one, or the reverse — the point
 *  is contrast, because an opening filled with a near-identical tone is
 *  invisible and the garment loses the thing that identifies it. */
function innerFor(lk: Look): number {
  // A step apart, not the opposite end of the scale. Reaching straight for
  // white against every dark jacket put a near-white wedge down the middle
  // of the chest, which outshouted the face directly above it.
  return luma(lk.shirt) < 110 ? C.Mist : C.Slate;
}

/** Where the hairline falls at a column: lower over the middle of the brow,
 *  lifting at the temples. */
/** The bottom row of the fringe, one entry per column from x-12 to x+12.
 *
 *  Four wedges, each rising to a point. This is the single most important
 *  piece of data in the file after the face: a fringe drawn as a smooth
 *  curve is a helmet, and no amount of strand texture on top will rescue
 *  it. The points reach row 19, which is the lash line, so a few pixels of
 *  hair fall in front of the eyes — which is where anime puts them. */
const BANG_HEM: readonly number[] = [
  // The tips stop at row 15, two clear rows above the lid at 17. Letting
  // them touch merged the fringe and the lash into one dark mass across
  // the face — worst on the dark-haired characters, where the whole band
  // read as a bar rather than as hair above eyes.
  10, 12, 14, 15, 13,
  10, 12, 14, 15, 13,
  10, 12, 14, 15, 14,
  10, 12, 14, 15, 13,
  10, 12, 14, 15, 13, 11, 9,
];

/** The outer silhouette of the hair mass, half-width per row from
 *  `HEAD_TOP - 4`.
 *
 *  Authored, like the fringe, and for the same reason. Deriving it from the
 *  skull plus a constant padding gives hair the exact shape of the head,
 *  which is a swimming cap. Real hair sits high off the crown, flares wider
 *  than the skull at the temples, and pushes out into tufts — and that
 *  outline is most of what identifies a character at a glance.
 *
 *  Rows above HEAD_TOP are the hair's own dome. Without them the cap
 *  clamped to the skull's top half-width for every row above it and came
 *  out as a flat-topped block: a box sitting on the head. */
const HAIR_SPAN: readonly number[] = [
  // The hair's own crown, above the skull. These are the widths a circle
  // of radius 17 actually has, because a dome that widens too slowly at
  // the top comes out flat, and a flat-topped mass reads as a helmet
  // however good the fringe under it is.
  7, 10, 12, 13,
  14, 15, 16, 17, 17, 18,
  // Temples, and this is where the volume lives.
  //
  // Four pixels of clearance over the skull was not enough: the mass still
  // hugged the head and read as paint on it. In the references the hair is
  // plainly a *bigger object* than the skull inside it — it bulges widest
  // just above the ear and only then falls away. Seven or eight pixels of
  // clearance, bulging rather than running parallel, is what turns a cap
  // into hair.
  19, 20, 21, 21, 21, 20,
  // Falling past the eyes, still wide.
  19, 18, 17, 15,
];

/** How much the hair mass is pressed down by whatever is on top of it.
 *
 *  A hat does not grow to fit the hair — it flattens it. Widening every cap
 *  to clear the new volume instead turned half the cast into sun hats, which
 *  is the wrong end of the problem: the hair under a cap is squashed, and
 *  only what escapes below the band keeps its full width. */
const COVERED_SQUASH = 0.72;

function hairSpanAt(y: number, g: Geom, squash = 1): number {
  const i = y - (HEAD_TOP - 4);
  if (i < 0) return 0;
  if (i >= HAIR_SPAN.length) return HAIR_SPAN[HAIR_SPAN.length - 1] * g.wide * squash;
  return HAIR_SPAN[i] * g.wide * squash;
}

function hemAt(x: number): number {
  const i = x - (SX - 13);
  if (i < 0 || i >= BANG_HEM.length) return HEAD_TOP + 6;
  return BANG_HEM[i];
}

function drawHair(c: PixelCanvas, lk: Look, g: Geom, rng: Rng): void {
  // Named, not deduced. Hair used to carry two tones with no guarantee which
  // was darker, so this had to compare luma and pick — and the highlight was
  // then reached by stepping an index, which on the near-black hair landed on
  // the tone the cap was already drawn in and vanished. Three authored tones
  // per range ends both problems.
  const dark = lk.hairSh;
  const light = lk.hair;
  const hi = lk.hairHi;
  const covered = lk.head === 'hat' || lk.head === 'hood';
  const [, sh] = skinRamp(lk);

  if (lk.head !== 'hood') {
    // Anime hair is not a cap with texture drawn on it — it is a set of
    // clumps, each a wedge with a point at the bottom. Random strands over
    // a flat cap is what the last three versions did, and it reads as
    // corduroy no matter how the strands are jittered, because the
    // silhouette underneath never changes.
    //
    // So the fringe hem is authored, one entry per column, as four wedges.
    // The hem is the shape; everything else is colour on top of it.
    const squash = lk.head === 'bare' ? 1 : COVERED_SQUASH;
    for (let y = HEAD_TOP - 4; y <= FACE_Y + 6; y++) {
      const half = hairSpanAt(y, g, squash);
      for (let x = Math.round(SX - half); x <= Math.round(SX + half); x++) {
        if (y > hemAt(x)) continue;
        c.set(x, y, light);
      }
    }

    // A tuft pass lived here and had to go: symmetrical wedges pushing out
    // at the temples read as cat ears, not as hair. The flare is in
    // HAIR_SPAN instead, where it is part of the silhouette rather than
    // stuck onto it.

    // Lock edges, drawn as swept diagonals rather than vertical lines.
    //
    // This is the whole difference between hair and a comb. The previous
    // version ran a straight dark column down each clump's leading side,
    // and across the brow the result was a picket fence — a row of upright
    // bars standing on a forehead. Hair does not hang in bars. It leaves a
    // parting and sweeps outward, so a lock's edge is a curve that starts
    // near the part and accelerates away from it.
    const part = SX - 4;
    for (let k = 0; k < BANG_HEM.length; k++) {
      const xTip = SX - 13 + k;
      const yTip = BANG_HEM[k];
      if (yTip <= BANG_HEM[Math.max(0, k - 1)]) continue;
      const xRoot = xTip + (xTip < part ? 4 : -4);
      const yRoot = HEAD_TOP + 1;
      const steps = Math.max(1, yTip - yRoot);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Squared, so the stroke leaves the parting slowly and swings out
        // hard near the tip — which is how a lock actually falls.
        const x = Math.round(xRoot + (xTip - xRoot) * t * t);
        const y = yRoot + i;
        if (c.get(x, y) === light) c.set(x, y, dark);
      }
    }

    // The parting. Off centre, because a centre part on every character in
    // the cast reads as a uniform.
    for (let y = HEAD_TOP - 2; y < HEAD_TOP + 5; y++) {
      const x = part + Math.round((y - HEAD_TOP) * 0.3);
      if (c.get(x, y) === light) c.set(x, y, dark);
    }

    // The tip of each wedge, darkened, so the point reads as a point.
    for (let k = 1; k < BANG_HEM.length - 1; k++) {
      const x = SX - 13 + k;
      if (BANG_HEM[k] <= BANG_HEM[k - 1] || BANG_HEM[k] < BANG_HEM[k + 1]) continue;
      c.set(x, BANG_HEM[k], dark);
      // No highlight above the tip. Lightening every tip put a row of short
      // dashes across the brow — the picket fence coming back in a paler
      // form. The dark point is enough to read as a point.
    }

    // The shine, as a broken arc following the skull.
    //
    // Broken, and that matters. A continuous band came out as a solid strip
    // of rectangles straight across the crown and read as a headband rather
    // than as light on hair. Every reference splits the highlight into
    // segments of unequal length with gaps between them, sitting where the
    // skull turns toward the light rather than at its top.
    //
    // Not under a hat. The crown is what carries a highlight, and with a hat
    // over it the segments landed down in the fringe instead and read as
    // scratches across the forehead.
    const shineY = HEAD_TOP + 2;
    const SEGMENTS: ReadonlyArray<readonly [number, number]> = covered
      ? []
      // Two long runs and one short, rather than three even ones. Even
      // spacing is a dashed line, and a dashed line reads as debris.
      : [[-11, -5], [-3, 2], [5, 7]];
    for (let si = 0; si < SEGMENTS.length; si++) {
      const [a, b] = SEGMENTS[si];
      for (let x = SX + a; x <= SX + b; x++) {
        const nx = (x - SX + 3) / 11;
        // A gentle arc. At four the curve stepped a row every couple of
        // pixels and broke each segment into a staircase of loose blocks,
        // which reads as debris on the hair rather than as light along it.
        const y = shineY + Math.round(nx * nx * 2);
        if (c.get(x, y) !== light && c.get(x, y) !== dark) continue;
        c.set(x, y, hi);
        // Two rows thick only on the segment facing the light, so the band
        // has weight where the skull is broadest and thins as it turns.
        if (si === 0 && c.get(x, y + 1) === light) c.set(x, y + 1, hi);
      }
    }

    // The shadow the fringe throws on the forehead. This is what seats
    // hair *on* a head instead of beside it.
    for (let k = 0; k < BANG_HEM.length; k++) {
      const x = SX - 13 + k;
      const y = BANG_HEM[k] + 1;
      if (Math.abs(x - SX) > halfAt(y, g)) continue;
      if (c.get(x, y) !== TRANSPARENT) c.set(x, y, sh);
    }
    void rng;
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
    const brimHalf = 18;
    for (let x = SX - brimHalf; x <= SX + brimHalf; x++) {
      const nx = (x - SX) / brimHalf;
      const y = brimY + Math.round(nx * nx * 3);
      c.set(x, y, lk.headCol);
      c.set(x, y + 1, lk.headSh);
      c.set(x, y + 2, shift(lk.headSh, -1));
    }
    for (let x = SX - 10; x <= SX + 10; x++) c.set(x, brimY - 1, C.WoodDp);
    // The brim's shadow. Darken by one ramp step, whatever is under it —
    // swapping hair for `hairSh` turned the entire fringe black on the
    // characters whose "shade" tone is the darker of their pair.
    for (let x = SX - 12; x <= SX + 12; x++) {
      for (let y = brimY + 3; y <= FACE_Y; y++) {
        const v = c.get(x, y);
        if (v === TRANSPARENT) continue;
        c.set(x, y, v === base ? sh : shift(v, -1));
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
  // Centred on the head, not on the face stamp. The round head is shorter
  // and wider than the pointed one, and the opening has to follow it or
  // the hood crops the chin off.
  const faceCY = Math.round((HEAD_TOP + CHIN) / 2) + 1;
  // An egg, not a circle, and offset the same two pixels the face is.
  //
  // A true circle cut in a flat shape is a porthole: the face inside stopped
  // reading as someone wearing a hood and started reading as a head posted
  // through a hole. A hood opening is wide across the brow, narrows toward
  // the chin, and sits on the same three-quarter turn as everything else on
  // this head.
  const inOpening = (x: number, y: number, grow = 0): boolean => {
    const ox = (x - SX + TURN) / (14 + grow);
    const dy = (y - faceCY) / (16.5 + grow);
    // Taper below the eyeline. Above it the opening keeps its full width.
    //
    // Gently. At 0.55 the opening closed in faster than the jaw does and
    // sliced the chin off flat, leaving a block of shadow under the mouth
    // where a chin should be — the hood was cutting the face, not framing
    // it.
    const taper = dy > 0 ? 1 + dy * 0.22 : 1;
    return (ox * taper) * (ox * taper) + dy * dy < 1;
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
  // Drape, radiating from the crown.
  //
  // These were five straight vertical lines at fixed columns, which on a
  // curved shape is corduroy — the same mistake the hair fringe made before
  // it was rewritten. Cloth over a head falls *away* from the highest point,
  // so every fold is a diagonal that spreads as it descends.
  const crownY = HEAD_TOP - 7;
  for (let k = -3; k <= 3; k++) {
    if (k === 0) continue;
    for (let y = crownY; y <= SHOULDER_Y + 5; y++) {
      const t = (y - crownY) / Math.max(1, SHOULDER_Y + 5 - crownY);
      // Spreading, and faster low down where the fabric hangs free.
      const fx = Math.round(SX + k * (2.5 + t * t * 7));
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

/** A small stable hash of the character id, so the same person draws the
 *  same garment from a season's list on every machine. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildPortraits(season?: Season): PortraitFrame[] {
  const out: PortraitFrame[] = [];
  const moods: Mood[] = ['neutral', 'warm', 'cold'];
  for (let i = 0; i < LOOK_COUNT; i++) {
    for (const mood of moods) {
      out.push({
        look: i, mood, canvas: makePortrait(LOOKS[i], mood, i + 1, season),
      });
    }
  }
  return out;
}

export function portraitKey(look: number, mood: Mood): string {
  return `pt_${look % LOOK_COUNT}_${mood}`;
}

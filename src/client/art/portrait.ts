/** Character portraits.
 *
 *  The world sprite is sixteen pixels wide. At that size a face is two dots
 *  and a suggestion, which is fine for someone walking across a field and
 *  useless for someone talking to you. So conversation gets a portrait.
 *
 *  This used to be a 40x44 head-and-shoulders drawn straight on, and it
 *  read like a passport photo: perfectly symmetrical, two values of skin,
 *  hair as a solid cap. Three things fix that, and all three are here.
 *
 *  **The head is turned.** Bilateral symmetry is the single loudest tell
 *  that a face was drawn by arithmetic. The skull is off-centre, the far
 *  eye is narrower and sits closer to the silhouette, and the nose breaks
 *  the centre line.
 *
 *  **Skin has four values, not two.** A lit plane on the brow and the far
 *  cheek, the base, a terminator down the near side, and a deep tone under
 *  the jaw and along the neck. A face is a sphere with a box hanging off
 *  it, and it only reads that way if the values say so.
 *
 *  **Hair has a sheen.** One broken band of a lighter tone across the
 *  crown, following the curve of the skull, is most of what separates hair
 *  from a helmet.
 *
 *  Built from the same `Look` record as the world sprite, so a villager's
 *  portrait always matches the figure standing in front of you — same skin,
 *  same hair, same hat, same shirt. Adding a thirteenth character still
 *  costs one row of data. */

import { PixelCanvas, Rng, valueNoise } from './canvas';
import { C, RGB_PALETTE } from './palette';
import { LOOKS, LOOK_COUNT, type Look } from './character';

export const PORTRAIT_W = 56;
export const PORTRAIT_H = 72;

/** Expressions. Only three, but that is enough to make a conversation feel
 *  like it has a temperature. */
export type Mood = 'neutral' | 'warm' | 'cold';

/** The palette's ramps, dark to light.
 *
 *  Shading wants "one step lighter than whatever this character's hair is",
 *  and the alternative to knowing the ramps is six more colour fields on
 *  every Look. A colour that is not in any ramp simply does not move, which
 *  is the right failure: no shading beats wrong shading. */
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

function luma(col: number): number {
  const p = RGB_PALETTE[col];
  return p.r * 0.299 + p.g * 0.587 + p.b * 0.114;
}

/** The darker of a Look's two hair tones.
 *
 *  `hairSh` is not reliably the darker one — black hair is stored as
 *  [InkDeep, Ink], where the "shade" is the lighter of the pair. Brows and
 *  lashes drawn from `hairSh` therefore came out pink on the red-haired
 *  characters, which is a memorable way to learn that a field name is not
 *  a guarantee. */
function darkHair(lk: Look): number {
  return luma(lk.hair) <= luma(lk.hairSh) ? lk.hair : lk.hairSh;
}

function shift(col: number, n: number): number {
  for (const ramp of RAMPS) {
    const i = ramp.indexOf(col);
    if (i < 0) continue;
    return ramp[Math.min(ramp.length - 1, Math.max(0, i + n))];
  }
  return col;
}

// --- geometry. Named, because "why is this 27" is a question that comes up
// every single time this file is opened.

/** Skull centre. Right of the canvas midline: the head is turned toward the
 *  text, so more of the back of it is on the near side. */
const SX = 30;
const HEAD_TOP = 10;
const CHIN = 46;
/** Face features sit left of the skull centre — that offset *is* the turn. */
const FX = SX - 3;
const EYE_Y = 30;
const NECK_TOP = CHIN - 2;
const SHOULDER_Y = 54;

/** Per-character proportions.
 *
 *  With one skull and one face layout, twelve portraits came out as one
 *  person in twelve wigs — every villager had the same jaw, the same eye
 *  spacing, the same distance from nose to mouth. Faces differ far more in
 *  proportion than in colour, so each Look rolls its own, once, from its
 *  seed. The numbers are small on purpose: two pixels of jaw width is
 *  plainly a different person, six is a caricature. */
interface Geom {
  /** Multiplier on skull half-width. */
  wide: number;
  /** Rows added to the jaw. */
  longJaw: number;
  /** Pixels added to the gap between the eyes. */
  eyeGap: number;
  /** Rows the mouth sits below its default. */
  mouthDrop: number;
  browThick: number;
}

function geomFor(rng: Rng): Geom {
  return {
    wide: rng.range(0.92, 1.08),
    longJaw: rng.int(-2, 2),
    eyeGap: rng.int(-1, 1),
    mouthDrop: rng.int(-1, 1),
    browThick: rng.chance(0.35) ? 1 : 2,
  };
}

export function makePortrait(lk: Look, mood: Mood, seed: number): PixelCanvas {
  const rng = new Rng(seed * 7451 + 19);
  const c = new PixelCanvas(PORTRAIT_W, PORTRAIT_H);
  const g = geomFor(rng);

  const skinHi = shift(lk.skin, 1);
  const skinDp = shift(lk.skinSh, -1);

  drawBust(c, lk);
  drawNeck(c, lk, g, skinDp);
  drawHead(c, lk, g, skinHi, skinDp);
  drawFace(c, lk, g, mood, skinHi, skinDp, rng);
  drawHair(c, lk, g, rng);
  drawHeadwear(c, lk, g);

  // Freckles or stubble, so two people wearing the same look still differ.
  if (rng.chance(0.45)) {
    for (let i = 0; i < rng.int(4, 10); i++) {
      const fx = FX + rng.int(-9, 10);
      const fy = EYE_Y + rng.int(4, 9);
      if (c.get(fx, fy) === lk.skin) c.set(fx, fy, lk.skinSh);
    }
  }

  c.outline(C.InkDeep, false);
  return c;
}

/** Half-width of the skull at a given row. An egg: circular across the
 *  cranium, tapering through the cheekbone to the jaw. */
function skullHalf(y: number, g: Geom): number {
  const chin = CHIN + g.longJaw;
  const t = (y - HEAD_TOP) / (chin - HEAD_TOP);
  if (t < 0.4) {
    // Top of the cranium, as a circle so the crown is round rather than
    // chopped flat.
    const u = (0.4 - t) / 0.46;
    return 15 * g.wide * Math.sqrt(Math.max(0, 1 - u * u));
  }
  return (15 - Math.pow(Math.min(1, (t - 0.4) / 0.6), 1.8) * 8) * g.wide;
}

function drawHead(
  c: PixelCanvas, lk: Look, g: Geom, skinHi: number, skinDp: number,
): void {
  const chin = CHIN + g.longJaw;
  for (let y = HEAD_TOP; y <= chin; y++) {
    const half = skullHalf(y, g);
    // The near side of a turned head shows more skull than the far side.
    const l = Math.round(half * 0.92);
    const r = Math.round(half * 1.06);
    for (let x = SX - l; x <= SX + r; x++) {
      const nx = (x - SX) / half;
      // Key light upper-left. Four values: lit plane, base, terminator,
      // and the core shadow riding the near edge.
      let col = lk.skin;
      if (nx > 0.72) col = skinDp;
      else if (nx > 0.3) col = lk.skinSh;
      else if (nx < -0.3 && y < EYE_Y + 2) col = skinHi;
      c.set(x, y, col);
    }
  }

  // Under the cheekbone, angled down and in toward the chin. This is the
  // plane change that stops a face reading as a balloon.
  for (let k = 0; k < 7; k++) {
    const y = EYE_Y + 6 + k;
    const half = skullHalf(y, g);
    for (let x = Math.round(SX + half * 0.1); x <= Math.round(SX + half); x++) {
      if (c.get(x, y) === lk.skin) c.set(x, y, lk.skinSh);
    }
  }
  // Chin: a lit ball with the jaw's shadow under it.
  c.hline(FX - 2, chin - 4, 5, shift(lk.skin, 1));
  for (let x = SX - 6; x <= SX + 6; x++) {
    if (c.get(x, chin) !== 0) c.set(x, chin, skinDp);
    if (c.get(x, chin - 1) === lk.skin) c.set(x, chin - 1, lk.skinSh);
  }

  // Near ear, tucked against the silhouette. The far one is hidden by the
  // turn, and drawing it anyway is what makes symmetric portraits look
  // like they are facing two directions at once.
  const earX = SX + Math.round(skullHalf(EYE_Y, g)) - 1;
  for (let y = EYE_Y; y <= EYE_Y + 6; y++) {
    c.set(earX, y, y === EYE_Y || y === EYE_Y + 6 ? lk.skinSh : lk.skin);
    c.set(earX + 1, y, skinDp);
  }
  c.set(earX, EYE_Y + 3, lk.skinSh);
}

function drawNeck(c: PixelCanvas, lk: Look, g: Geom, skinDp: number): void {
  // Narrower than the jaw, and never brighter than the face. A neck drawn
  // at jaw width in the face's own value reads as a tree trunk.
  const half = Math.round(4 * g.wide);
  // The jaw casts a shadow straight down the neck, so the neck is never
  // the same value as the face. Getting this wrong makes a head look
  // pasted onto a body — but running the deep tone the whole way down gave
  // everybody a heavy dark jaw that read as a beard.
  for (let y = NECK_TOP + g.longJaw; y <= SHOULDER_Y + 2; y++) {
    const cast = y < NECK_TOP + g.longJaw + 3;
    for (let x = FX - half; x <= FX + half; x++) {
      const nx = (x - FX) / half;
      c.set(x, y, cast || nx > 0.4 ? skinDp : nx < -0.5 ? lk.skinSh : shift(lk.skinSh, 0));
    }
  }
  // Where the neck meets the collar it drops away again.
  for (let x = FX - half; x <= FX + half; x++) c.set(x, SHOULDER_Y + 2, skinDp);
}

function drawBust(c: PixelCanvas, lk: Look): void {
  const dim = lk.shirtDim;
  for (let y = SHOULDER_Y; y < PORTRAIT_H; y++) {
    const t = (y - SHOULDER_Y) / (PORTRAIT_H - SHOULDER_Y);
    // Shoulders slope out fast then square off, which is what makes a bust
    // read as a body rather than as a triangle.
    const half = Math.round(11 + Math.pow(t, 0.55) * 17);
    for (let x = SX - half - 2; x <= SX + half; x++) {
      const nx = (x - SX) / half;
      c.set(x, y, nx < -0.5 ? shift(lk.shirt, 1) : nx > 0.45 ? dim : lk.shirt);
    }
  }
  // Fold shadows. Two is enough; cloth reads by having any at all.
  for (let y = SHOULDER_Y + 4; y < PORTRAIT_H; y++) {
    const s = Math.round(Math.sin((y - SHOULDER_Y) * 0.4) * 2);
    c.set(SX - 16 + s, y, dim);
    c.set(SX + 15 - s, y, dim);
  }

  const cy = SHOULDER_Y + 1;
  switch (lk.outfit) {
    case 'jacket':
      // Lapels: two diagonals from the collarbone out to the shoulders.
      for (let i = 0; i < 9; i++) {
        c.set(FX - 4 - i, cy + i, lk.shirtDim);
        c.set(FX - 3 - i, cy + i, lk.trim);
        c.set(FX + 4 + i, cy + i, lk.shirtDim);
        c.set(FX + 3 + i, cy + i, lk.trim);
      }
      break;
    case 'hoodie':
      // The hood bunched behind the neck.
      for (let y = 0; y < 4; y++) {
        for (let x = FX - 14 + y; x <= FX + 14 - y; x++) {
          c.set(x, cy - 1 + y, y < 2 ? lk.shirtDim : shift(lk.shirtDim, -1));
        }
      }
      for (let x = FX - 8; x <= FX + 8; x++) c.set(x, cy + 3, lk.shirtDim);
      break;
    case 'tunic':
      for (let x = FX - 7; x <= FX + 7; x++) {
        c.set(x, cy + 2, lk.trim);
        c.set(x, cy + 3, lk.shirtDim);
      }
      c.rect(FX - 1, cy + 4, 2, 2, C.Gold);
      break;
    default:
      for (let x = FX - 7; x <= FX + 7; x++) c.set(x, cy + 2, lk.trim);
      for (let i = 0; i < 5; i++) {
        c.set(FX - 2 - i, cy + 3 + i, lk.trim);
        c.set(FX + 2 + i, cy + 3 + i, lk.trim);
      }
      break;
  }
}

function drawFace(
  c: PixelCanvas, lk: Look, g: Geom, mood: Mood,
  skinHi: number, skinDp: number, rng: Rng,
): void {
  // Far eye is narrower and closer to the silhouette; near eye is wider.
  // That difference is the entire turn as far as the face is concerned.
  const farX = FX - 8 - g.eyeGap;
  const nearX = FX + 5 + g.eyeGap;
  // Lashes and brows follow the hair but never take its colour outright —
  // they are hair seen against skin, always the darkest note on the face.
  const dark = darkHair(lk);
  const lash = luma(dark) > 90 ? shift(dark, -2) : dark;
  const iris = shift(lash, 2);

  // Three rows, not four. At four the whites take over the face and every
  // villager reads as permanently startled.
  const eye = (ex: number, w: number): void => {
    c.rect(ex, EYE_Y, w, 3, C.Pale);
    c.rect(ex + 1, EYE_Y, w - 2, 3, C.White);
    // Iris, cropped by the upper lid the way a real one always is.
    const ix = ex + (w >= 5 ? 2 : 1);
    c.rect(ix, EYE_Y, 2, 3, iris);
    c.rect(ix, EYE_Y, 2, 1, lash);
    c.set(ix, EYE_Y + 1, C.InkDeep);
    c.set(ix + 1, EYE_Y + 1, C.InkDeep);
    // One specular pixel, upper left, matching the key light.
    c.set(ix, EYE_Y + 1, C.White);
    // Lash line, heavier at the outer corner, and a crease above it.
    for (let i = 0; i < w; i++) c.set(ex + i, EYE_Y - 1, lash);
    c.set(ex - 1, EYE_Y, lash);
    c.set(ex + w, EYE_Y, lash);
    for (let i = 1; i < w - 1; i++) c.set(ex + i, EYE_Y - 3, lk.skinSh);
    // Lower lid, one value down from the skin so the eye sits in a socket.
    for (let i = 0; i < w; i++) c.set(ex + i, EYE_Y + 3, lk.skinSh);
  };
  eye(farX + 1, 4);
  eye(nearX, 5);

  // Brows. These carry the expression more than the eyes do: raised inner
  // ends read as warmth, lowered inner ends as impatience.
  const brow = (ex: number, w: number, inner: 'l' | 'r'): void => {
    for (let i = 0; i < w; i++) {
      const t = i / (w - 1);
      const towardInner = inner === 'l' ? 1 - t : t;
      const lift = mood === 'warm'
        ? Math.round(towardInner * -1.6)
        : mood === 'cold'
          ? Math.round(towardInner * 1.6)
          : 0;
      // The arch: brows are not straight lines.
      const arch = Math.round(Math.sin(t * Math.PI) * -1);
      const y = EYE_Y - 6 + lift + arch;
      for (let k = 0; k < g.browThick; k++) c.set(ex + i, y + k, lash);
    }
  };
  brow(farX - 1, 6, 'r');
  brow(nearX, 7, 'l');

  // Nose. Drawn as a shadow on the near side plus a lit tip — an outlined
  // nose at this size looks like a beak.
  const noseY = EYE_Y + 7;
  for (let k = 0; k < 3; k++) c.set(FX + 2, noseY + k, lk.skinSh);
  c.set(FX + 2, noseY + 3, skinDp);
  c.set(FX + 1, noseY + 3, lk.skinSh);
  c.set(FX, noseY + 3, skinHi);
  c.set(FX - 1, noseY + 3, lk.skinSh);

  // Mouth. Upper lip is always in shadow, lower lip always catches light.
  //
  // A straight line with a shadow under it reads as a frown at this size,
  // which had every villager in the game looking miserable regardless of
  // their actual mood. Neutral now curves very slightly up and carries no
  // shadow; only the expressive moods get one.
  const mouthY = EYE_Y + 13 + g.mouthDrop + Math.round(g.longJaw * 0.5);
  const lip = C.WoodDk;
  if (mood === 'warm') {
    for (let i = -3; i <= 3; i++) {
      const dip = Math.abs(i) >= 2 ? -1 : 0;
      c.set(FX + i, mouthY + dip, lip);
    }
    c.hline(FX - 2, mouthY + 1, 5, shift(lk.skin, 1));
    // Smile creases, pulling the cheeks up.
    c.set(FX - 5, mouthY - 2, lk.skinSh);
    c.set(FX + 5, mouthY - 2, lk.skinSh);
    c.hline(FX - 2, mouthY + 2, 4, lk.skinSh);
  } else if (mood === 'cold') {
    for (let i = -3; i <= 3; i++) c.set(FX + i, mouthY + (Math.abs(i) >= 2 ? 1 : 0), lip);
    c.set(FX - 4, mouthY + 1, skinDp);
    c.set(FX + 4, mouthY + 1, skinDp);
    c.hline(FX - 1, mouthY + 2, 3, lk.skinSh);
  } else {
    for (let i = -2; i <= 2; i++) c.set(FX + i, mouthY + (Math.abs(i) === 2 ? -1 : 0), lip);
    c.hline(FX - 1, mouthY + 1, 3, shift(lk.skin, 1));
  }

  // Blush, dithered so it stays soft. Warm moods get more of it.
  const blush = mood === 'warm' ? 0.75 : 0.4;
  for (let y = EYE_Y + 6; y <= EYE_Y + 8; y++) {
    for (let x = FX - 10; x <= FX + 10; x++) {
      if (Math.abs(x - FX) < 5) continue;
      if (c.get(x, y) !== lk.skin) continue;
      if (valueNoise(x * 1.7, y * 1.7, 11) < blush) c.set(x, y, lk.skinSh);
    }
  }
  void rng;
}

function drawHair(c: PixelCanvas, lk: Look, g: Geom, rng: Rng): void {
  const hi = shift(lk.hair, 1);
  const covered = lk.head === 'hat' || lk.head === 'hood';

  if (lk.head !== 'hood') {
    // The cap of hair sits proud of the skull — hair has thickness, and
    // laying it flat on the skull line is what makes it read as paint.
    for (let y = HEAD_TOP - 4; y <= EYE_Y - 6; y++) {
      const half = skullHalf(Math.max(HEAD_TOP, y), g) + (y < HEAD_TOP + 6 ? 2.2 : 1.4);
      for (let x = Math.round(SX - half * 0.95); x <= Math.round(SX + half * 1.08); x++) {
        // Hairline: dips lower over the middle of the brow and lifts at the
        // temples, which is where a real one goes.
        const nx = (x - SX) / half;
        const dip = Math.cos(nx * 1.5) * 4 + valueNoise(x * 0.8, 3, 41) * 2;
        if (y > EYE_Y - 14 + dip) continue;
        c.set(x, y, nx < -0.25 ? lk.hair : lk.hairSh);
      }
    }

    // The sheen: one broken band following the curve of the skull. This is
    // the single detail that separates hair from a helmet.
    const bandY = HEAD_TOP + 3;
    for (let x = SX - 13; x <= SX + 10; x++) {
      const nx = (x - SX) / 13;
      const y = bandY + Math.round(nx * nx * 5);
      if (valueNoise(x * 1.3, 7, 53) < 0.32) continue;
      if (c.get(x, y) !== lk.hair && c.get(x, y) !== lk.hairSh) continue;
      c.set(x, y, hi);
      if (valueNoise(x * 1.1, 19, 53) > 0.6) c.set(x, y + 1, hi);
    }

    // Bangs: clumps of different length hanging over the forehead, each
    // with a lit left edge. Even lengths look like a wig.
    //
    // How much forehead they cover is the difference between twelve
    // characters and one character in twelve wigs, so it is set per style
    // and the clumps are swept to one side rather than hung straight down.
    const fringe = lk.hairStyle === 'crop' ? 0
      : lk.hairStyle === 'short' ? 2
        : lk.hairStyle === 'tied' ? 3 : 4;
    let bx = SX - 15;
    while (bx < SX + 13 && fringe > 0) {
      const wclump = rng.int(2, 4);
      // Sweep: clumps get longer across the brow in one direction, so the
      // fringe has a parting instead of a flat hem.
      const sweep = ((bx - (SX - 15)) / 28) * fringe;
      // Capped two rows above the brow. Bangs that reach the lashes read as
      // eyeshadow, which is very obvious on the pink-haired villagers.
      const drop = Math.min(fringe + 1, rng.int(0, fringe) + sweep);
      const nx = (bx - SX) / 15;
      const base = EYE_Y - 15 + Math.cos(nx * 1.5) * 4;
      for (let x = bx; x < bx + wclump; x++) {
        for (let y = HEAD_TOP - 2; y <= base + drop; y++) {
          if (Math.abs(x - SX) > skullHalf(Math.max(HEAD_TOP, y), g) + 2) continue;
          c.set(x, y, x === bx ? lk.hair : lk.hairSh);
        }
      }
      bx += wclump + rng.int(0, 1);
    }
  }

  if (covered) return;

  switch (lk.hairStyle) {
    case 'bob':
      // Chin-length, curling in. The near side hangs further forward
      // because the head is turned.
      for (let y = EYE_Y - 12; y <= CHIN + 2; y++) {
        const t = (y - (EYE_Y - 12)) / (CHIN + 2 - (EYE_Y - 12));
        const out = 15 + Math.sin(t * 2.2) * 2 - t * t * 3;
        for (let k = 0; k < 4; k++) {
          c.set(Math.round(SX - out + k), y, k === 0 ? lk.hair : lk.hairSh);
          c.set(Math.round(SX + out - k + 1), y, k === 0 ? lk.hairSh : shift(lk.hairSh, -1));
        }
      }
      break;
    case 'tied': {
      // A tail falling behind the near shoulder, plus the tie.
      for (let y = EYE_Y - 8; y <= PORTRAIT_H - 2; y++) {
        const sway = Math.sin((y - EYE_Y) * 0.16) * 3;
        const x0 = Math.round(SX + 13 + sway);
        for (let k = 0; k < 5; k++) {
          c.set(x0 + k, y, k === 0 ? lk.hair : k < 3 ? lk.hairSh : shift(lk.hairSh, -1));
        }
      }
      // Only over hair. Painted as a plain rect it landed on the cheek of
      // anyone with a narrow skull and read as a wound.
      for (let y = EYE_Y - 10; y < EYE_Y - 6; y++) {
        for (let x = SX + 11; x < SX + 16; x++) {
          if (c.get(x, y) !== lk.hair && c.get(x, y) !== lk.hairSh) continue;
          c.set(x, y, y === EYE_Y - 10 ? C.Rose : C.Red);
        }
      }
      // A few loose strands at the temple, so the tie does not look shaved.
      for (let y = EYE_Y - 6; y <= EYE_Y + 2; y++) c.set(SX - 15, y, lk.hair);
      break;
    }
    case 'crop':
      for (let y = EYE_Y - 12; y <= EYE_Y - 2; y++) {
        const half = skullHalf(y, g);
        c.set(Math.round(SX - half - 1), y, lk.hair);
        c.set(Math.round(SX + half + 1), y, lk.hairSh);
      }
      break;
    default:
      // Long, past the shoulders, wider at the bottom.
      for (let y = EYE_Y - 12; y <= PORTRAIT_H - 1; y++) {
        const t = Math.max(0, (y - (EYE_Y - 12)) / 40);
        const out = 15 + t * 6;
        for (let k = 0; k < 4 + Math.round(t * 3); k++) {
          c.set(Math.round(SX - out + k), y, k === 0 ? lk.hair : lk.hairSh);
          c.set(Math.round(SX + out - k + 1), y, k < 2 ? lk.hairSh : shift(lk.hairSh, -1));
        }
      }
      break;
  }
}

function drawHeadwear(c: PixelCanvas, lk: Look, g: Geom): void {
  if (lk.head === 'bare') return;

  if (lk.head === 'hat') {
    // Straw hat. The crown has to *overlap* the skull — a crown that stops
    // above the head leaves the brim reading as a stick balanced on top,
    // which is exactly how the first version of this looked.
    const brimY = HEAD_TOP + 3;
    for (let y = HEAD_TOP - 8; y <= brimY; y++) {
      const t = (y - (HEAD_TOP - 8)) / (brimY - (HEAD_TOP - 8));
      // Domed: narrow at the top, flaring where it meets the brim.
      const half = Math.round((8 + Math.pow(t, 0.7) * 7) * g.wide);
      for (let x = SX - half; x <= SX + half; x++) {
        c.set(x, y, (x - SX) / half < -0.25 ? lk.headCol : lk.headSh);
      }
    }
    // Brim, seen slightly from below: its far edge rides higher than its
    // near edge, and it dips at the sides.
    for (let x = SX - 24; x <= SX + 24; x++) {
      const nx = (x - SX) / 24;
      const y = brimY + Math.round(nx * nx * 3) - (nx < -0.5 ? 1 : 0);
      c.set(x, y, lk.headCol);
      c.set(x, y + 1, lk.headSh);
      c.set(x, y + 2, lk.headSh);
      c.set(x, y + 3, shift(lk.headSh, -1));
    }
    // Band, and the brim's shadow across the brow.
    for (let x = SX - 13; x <= SX + 13; x++) c.set(x, brimY - 1, C.WoodDp);
    for (let x = SX - 18; x <= SX + 18; x++) {
      for (let y = brimY + 4; y <= EYE_Y - 5; y++) {
        const v = c.get(x, y);
        if (v === lk.skin) c.set(x, y, lk.skinSh);
        else if (v === lk.hair) c.set(x, y, lk.hairSh);
        else if (v === shift(lk.hair, 1)) c.set(x, y, lk.hair);
      }
    }
    return;
  }

  if (lk.head === 'cap') {
    const peakY = HEAD_TOP + 6;
    for (let y = HEAD_TOP - 5; y <= peakY; y++) {
      const t = (y - (HEAD_TOP - 5)) / (peakY - (HEAD_TOP - 5));
      const half = Math.round((9 + Math.pow(t, 0.6) * 6) * g.wide);
      for (let x = SX - half; x <= SX + half; x++) {
        c.set(x, y, (x - SX) / half < -0.3 ? lk.headCol : lk.headSh);
      }
    }
    // Seam over the crown, and a button at the top.
    for (let y = HEAD_TOP - 5; y <= peakY - 2; y++) c.set(SX - 2, y, shift(lk.headSh, -1));
    c.set(SX - 2, HEAD_TOP - 6, lk.headSh);
    // Peak, thrown forward and to the far side.
    for (let x = SX - 21; x <= SX + 7; x++) {
      const nx = (x - SX) / 21;
      const y = peakY + 1 + Math.round(nx * nx * 2);
      c.set(x, y, lk.headSh);
      c.set(x, y + 1, C.InkDeep);
    }
    for (let x = SX - 17; x <= SX + 5; x++) {
      for (let y = peakY + 3; y <= peakY + 5; y++) {
        if (c.get(x, y) === lk.skin) c.set(x, y, lk.skinSh);
      }
    }
    return;
  }

  // Hood.
  //
  // The first version was a trapezoid with a rectangular hole punched in
  // it, which read as a cardboard mask. A hood is cloth draped over a
  // sphere: the opening is an oval, the cloth stands away from the head
  // rather than hugging it, and there is a thick rolled lip around the
  // face that catches the light.
  const faceCY = EYE_Y + 2;
  const openRX = 14;
  const openRY = 18;
  const inOpening = (x: number, y: number, grow = 0): boolean => {
    const ox = (x - FX) / (openRX + grow);
    const oy = (y - faceCY) / (openRY + grow);
    return ox * ox + oy * oy < 1;
  };

  for (let y = HEAD_TOP - 9; y <= SHOULDER_Y + 6; y++) {
    const t = (y - (HEAD_TOP - 9)) / (SHOULDER_Y + 6 - (HEAD_TOP - 9));
    // Round over the crown, then widening down onto the shoulders.
    const crown = t < 0.3 ? 20 * Math.sqrt(Math.max(0, 1 - Math.pow((0.3 - t) / 0.34, 2))) : 20;
    const half = Math.round((crown + Math.max(0, t - 0.3) * 16) * g.wide);
    for (let x = SX - half; x <= SX + half; x++) {
      if (inOpening(x, y) && y < CHIN + 2) continue;
      const nx = (x - SX) / Math.max(1, half);
      c.set(x, y, nx < -0.3 ? lk.headCol : nx > 0.5 ? shift(lk.headSh, -1) : lk.headSh);
    }
  }

  // The rolled lip around the opening: two rings, the outer one lit.
  for (let y = HEAD_TOP - 9; y <= CHIN + 2; y++) {
    for (let x = SX - 24; x <= SX + 24; x++) {
      if (inOpening(x, y)) continue;
      if (!inOpening(x, y, 2)) continue;
      c.set(x, y, x < FX ? shift(lk.headCol, 1) : lk.headCol);
    }
  }

  // Folds falling from the crown, so the cloth has a direction.
  for (let k = -2; k <= 2; k++) {
    const fx = SX + k * 7 - 2;
    for (let y = HEAD_TOP - 8; y <= SHOULDER_Y + 6; y++) {
      if (inOpening(fx, y, 3)) continue;
      const v = c.get(fx, y);
      if (v === lk.headSh || v === lk.headCol) c.set(fx, y, shift(lk.headSh, -1));
    }
  }

  // A little hair at the hairline, inside the opening. Without it the face
  // floats in the cowl like a mask on a stick.
  for (let x = SX - 12; x <= SX + 12; x++) {
    const nx = (x - SX) / 12;
    const hemBase = EYE_Y - 13 + Math.cos(nx * 1.5) * 3;
    for (let y = EYE_Y - 18; y <= hemBase; y++) {
      if (!inOpening(x, y)) continue;
      if (c.get(x, y) === 0) continue;
      c.set(x, y, nx < -0.2 ? lk.hair : lk.hairSh);
    }
  }

  // The dark inside a hood. Everything above the brow loses a value — but
  // only one. Crushing it to black turned the face into a cut-out floating
  // in a hole.
  for (let x = SX - 16; x <= SX + 16; x++) {
    for (let y = HEAD_TOP; y <= EYE_Y - 6; y++) {
      const v = c.get(x, y);
      if (v === lk.skin) c.set(x, y, lk.skinSh);
      else if (v === shift(lk.skin, 1)) c.set(x, y, lk.skin);
      else if (v === lk.hair) c.set(x, y, lk.hairSh);
      else if (v === lk.hairSh) c.set(x, y, shift(lk.hairSh, -1));
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

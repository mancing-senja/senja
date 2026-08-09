/** Character portraits.
 *
 *  The world sprite is sixteen pixels wide. At that size a face is two dots
 *  and a suggestion, which is fine for someone walking across a field and
 *  useless for someone talking to you. So conversation gets a portrait:
 *  the same person at 40x44, with room for brows, a nose, a mouth and the
 *  shape of their hair.
 *
 *  Built from the same `Look` record as the world sprite, so a villager's
 *  portrait always matches the figure standing in front of you — same skin,
 *  same hair, same hat, same shirt. Adding a thirteenth character still
 *  costs one row of data. */

import { PixelCanvas, Rng, valueNoise } from './canvas';
import { C } from './palette';
import { LOOKS, LOOK_COUNT, type Look } from './character';

export const PORTRAIT_W = 40;
export const PORTRAIT_H = 44;

/** Expressions. Only three, but that is enough to make a conversation feel
 *  like it has a temperature. */
export type Mood = 'neutral' | 'warm' | 'cold';

export function makePortrait(lk: Look, mood: Mood, seed: number): PixelCanvas {
  const rng = new Rng(seed * 7451 + 19);
  const c = new PixelCanvas(PORTRAIT_W, PORTRAIT_H);
  const cx = PORTRAIT_W / 2;

  // ---------------------------------------------------------- shoulders
  const shoulderY = 34;
  for (let y = shoulderY; y < PORTRAIT_H; y++) {
    const t = (y - shoulderY) / (PORTRAIT_H - shoulderY);
    const half = Math.round(9 + t * 11);
    for (let x = cx - half; x <= cx + half; x++) {
      const nx = (x - cx) / half;
      c.set(x, y, nx < -0.45 ? lk.shirt : nx > 0.5 ? lk.shirtDim : lk.shirt);
    }
  }
  // Collar, per outfit — the detail that distinguishes a jacket from a shirt
  // at portrait size.
  if (lk.outfit === 'jacket') {
    for (let i = 0; i < 6; i++) {
      c.set(cx - 3 - i, shoulderY + 1 + i, lk.shirtDim);
      c.set(cx + 3 + i, shoulderY + 1 + i, lk.shirtDim);
      c.set(cx - 2 - i, shoulderY + 1 + i, lk.trim);
      c.set(cx + 2 + i, shoulderY + 1 + i, lk.trim);
    }
  } else if (lk.outfit === 'hoodie') {
    for (let x = cx - 12; x <= cx + 12; x++) c.set(x, shoulderY, lk.shirtDim);
    for (let x = cx - 9; x <= cx + 9; x++) c.set(x, shoulderY + 1, lk.shirtDim);
  } else if (lk.outfit === 'tunic') {
    for (let x = cx - 5; x <= cx + 5; x++) c.set(x, shoulderY + 2, lk.trim);
    c.set(cx, shoulderY + 3, C.Gold);
  } else {
    for (let x = cx - 5; x <= cx + 5; x++) c.set(x, shoulderY + 1, lk.trim);
  }

  // ---------------------------------------------------------------- neck
  for (let y = 29; y < shoulderY + 1; y++) {
    for (let x = cx - 4; x <= cx + 4; x++) c.set(x, y, lk.skinSh);
  }
  for (let y = 29; y < shoulderY; y++) for (let x = cx - 3; x <= cx + 2; x++) c.set(x, y, lk.skin);

  // ---------------------------------------------------------------- head
  // An egg, wider at the temples than at the jaw.
  for (let y = 8; y <= 31; y++) {
    const t = (y - 8) / 23;
    const half = Math.round(11 - Math.pow(Math.max(0, t - 0.45) / 0.55, 1.6) * 4.5
      - Math.pow(Math.max(0, 0.2 - t) / 0.2, 2) * 2);
    for (let x = cx - half; x <= cx + half; x++) {
      const nx = (x - cx) / half;
      // Light from the upper left, same as everywhere else in the game.
      c.set(x, y, nx < -0.35 ? lk.skin : nx > 0.55 ? lk.skinSh : lk.skin);
    }
  }
  // Cheek and jaw shading.
  for (let y = 24; y <= 30; y++) {
    for (let x = cx + 3; x <= cx + 8; x++) {
      if (c.get(x, y) === lk.skin) c.set(x, y, lk.skinSh);
    }
  }

  // ---------------------------------------------------------------- face
  const eyeY = 20;
  const eyeL = cx - 5;
  const eyeR = cx + 4;

  // Brows. These carry the expression more than the eyes do.
  const browY = mood === 'cold' ? eyeY - 3 : eyeY - 4;
  for (let i = 0; i < 5; i++) {
    const lift = mood === 'warm' ? (i > 2 ? -1 : 0) : mood === 'cold' ? (i < 2 ? -1 : 0) : 0;
    c.set(eyeL - 2 + i, browY + lift, lk.hairSh);
    c.set(eyeR - 2 + i, browY + (mood === 'cold' ? (i > 2 ? -1 : 0) : lift), lk.hairSh);
  }

  // Eyes: white, iris, pupil, and a single specular pixel.
  for (const ex of [eyeL, eyeR]) {
    c.rect(ex - 2, eyeY - 1, 5, 3, C.White);
    c.rect(ex - 1, eyeY - 1, 3, 3, C.Slate);
    c.rect(ex, eyeY, 2, 2, C.InkDeep);
    c.set(ex, eyeY - 1, C.White);
    // Lash line.
    for (let i = -2; i <= 2; i++) c.set(ex + i, eyeY - 2, lk.hairSh);
  }

  // Nose: a shadow and a lit edge, no outline.
  c.set(cx - 1, eyeY + 4, lk.skinSh);
  c.set(cx - 1, eyeY + 5, lk.skinSh);
  c.set(cx, eyeY + 5, lk.skinSh);
  c.set(cx - 2, eyeY + 5, lk.skin);

  // Mouth.
  const mouthY = eyeY + 8;
  if (mood === 'warm') {
    c.set(cx - 3, mouthY, lk.skinSh);
    for (let i = -2; i <= 2; i++) c.set(cx + i, mouthY + 1, C.WoodDp);
    c.set(cx + 3, mouthY, lk.skinSh);
    // A hint of cheek lift.
    c.set(cx - 5, mouthY - 1, lk.skinSh);
    c.set(cx + 5, mouthY - 1, lk.skinSh);
  } else if (mood === 'cold') {
    for (let i = -2; i <= 2; i++) c.set(cx + i, mouthY, C.WoodDp);
    c.set(cx - 3, mouthY + 1, lk.skinSh);
    c.set(cx + 3, mouthY + 1, lk.skinSh);
  } else {
    for (let i = -2; i <= 1; i++) c.set(cx + i, mouthY, C.WoodDp);
  }

  // ---------------------------------------------------------------- hair
  drawHair(c, lk, cx, rng);

  // ------------------------------------------------------------ headwear
  drawHeadwear(c, lk, cx);

  // Freckles or stubble, so two people with the same look still differ.
  if (rng.chance(0.4)) {
    for (let i = 0; i < rng.int(3, 8); i++) {
      const fx = cx + rng.int(-8, 8);
      const fy = eyeY + rng.int(3, 7);
      if (c.get(fx, fy) === lk.skin) c.set(fx, fy, lk.skinSh);
    }
  }

  c.outline(C.InkDeep, false);
  return c;
}

function drawHair(c: PixelCanvas, lk: Look, cx: number, rng: Rng): void {
  const covered = lk.head === 'hat' || lk.head === 'hood';

  // The skull cap of hair, always present unless hidden by a hood.
  if (lk.head !== 'hood') {
    for (let y = 6; y <= 16; y++) {
      const t = (y - 6) / 10;
      const half = Math.round(11 - Math.pow(Math.max(0, 0.35 - t) / 0.35, 2) * 3);
      for (let x = cx - half; x <= cx + half; x++) {
        // Hairline: the fringe dips lower in the middle than at the temples.
        const dip = Math.round(Math.cos(((x - cx) / half) * 1.4) * 3);
        if (y > 12 + dip) continue;
        const n = valueNoise(x * 0.6, y * 0.6, 31);
        c.set(x, y, x < cx - 2 ? (n > 0.5 ? lk.hair : lk.hairSh) : lk.hairSh);
      }
    }
    // Lit strands across the crown.
    for (let i = 0; i < rng.int(3, 6); i++) {
      const sx = cx - 9 + i * 3;
      for (let y = 7; y < 11; y++) c.set(sx, y, lk.hair);
    }
  }

  if (covered) return;

  switch (lk.hairStyle) {
    case 'bob':
      for (let y = 12; y <= 30; y++) {
        const t = (y - 12) / 18;
        const out = Math.round(12 - t * 1.5);
        for (let k = 0; k < 3; k++) {
          c.set(cx - out + k, y, k === 0 ? lk.hair : lk.hairSh);
          c.set(cx + out - k, y, k === 0 ? lk.hairSh : lk.hairSh);
        }
      }
      break;
    case 'tied':
      // A tail behind the right shoulder.
      for (let y = 14; y <= 34; y++) {
        const sway = Math.round(Math.sin((y - 14) * 0.25) * 2);
        c.set(cx + 12 + sway, y, lk.hair);
        c.set(cx + 13 + sway, y, lk.hairSh);
        c.set(cx + 14 + sway, y, lk.hairSh);
      }
      c.rect(cx + 9, 14, 4, 3, C.Red);
      break;
    case 'crop':
      for (let y = 12; y <= 17; y++) {
        c.set(cx - 11, y, lk.hairSh);
        c.set(cx + 11, y, lk.hairSh);
      }
      break;
    default:
      for (let y = 12; y <= 22; y++) {
        c.set(cx - 11, y, lk.hair);
        c.set(cx - 10, y, lk.hairSh);
        c.set(cx + 11, y, lk.hairSh);
      }
      break;
  }
}

function drawHeadwear(c: PixelCanvas, lk: Look, cx: number): void {
  if (lk.head === 'bare') return;

  if (lk.head === 'hat') {
    // Straw hat: crown then a wide brim with a shadow beneath it.
    for (let y = 0; y <= 8; y++) {
      const half = Math.round(6 + y * 0.5);
      for (let x = cx - half; x <= cx + half; x++) {
        c.set(x, y, x < cx - 2 ? lk.headCol : lk.headSh);
      }
    }
    for (let x = cx - 17; x <= cx + 17; x++) {
      c.set(x, 9, lk.headCol);
      c.set(x, 10, lk.headSh);
      c.set(x, 11, lk.headSh);
    }
    // Brim shadow on the forehead.
    for (let x = cx - 11; x <= cx + 11; x++) {
      for (let y = 12; y <= 14; y++) {
        const v = c.get(x, y);
        if (v === lk.skin) c.set(x, y, lk.skinSh);
        else if (v === lk.hair) c.set(x, y, lk.hairSh);
      }
    }
    // Band.
    for (let x = cx - 7; x <= cx + 7; x++) c.set(x, 8, C.WoodDp);
    return;
  }

  if (lk.head === 'cap') {
    for (let y = 2; y <= 10; y++) {
      const half = Math.round(8 + y * 0.35);
      for (let x = cx - half; x <= cx + half; x++) {
        c.set(x, y, x < cx - 3 ? lk.headCol : lk.headSh);
      }
    }
    // Peak, forward and to the left.
    for (let x = cx - 13; x <= cx + 6; x++) {
      c.set(x, 11, lk.headSh);
      c.set(x, 12, C.InkDeep);
    }
    for (let x = cx - 12; x <= cx + 4; x++) {
      const v = c.get(x, 13);
      if (v === lk.skin) c.set(x, 13, lk.skinSh);
    }
    return;
  }

  // Hood: frames the face and wraps the neck.
  for (let y = 1; y <= 30; y++) {
    const t = (y - 1) / 29;
    const half = Math.round(12 + t * 5);
    for (let x = cx - half; x <= cx + half; x++) {
      const inFace = y > 12 && x > cx - 10 && x < cx + 10 && y < 30;
      if (inFace) continue;
      c.set(x, y, x < cx - 3 ? lk.headCol : lk.headSh);
    }
  }
  // The dark inside the hood, right against the face.
  for (let y = 12; y <= 16; y++) {
    for (let x = cx - 11; x <= cx + 11; x++) {
      const v = c.get(x, y);
      if (v === lk.skin || v === lk.hair) c.set(x, y, lk.skinSh);
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

/** Custom characters.
 *
 *  Everyone used to be one of twelve presets, picked at random and saved in
 *  localStorage. In an eight-person room that is a coin-flip away from two
 *  people being the same person, and there was nothing to do about it.
 *
 *  A look is now a set of choices — skin, hair colour, hair style, headwear,
 *  garment, and three cloth colours — that packs into one small integer. That
 *  integer is the whole appearance: save it, send it, decode it back into the
 *  same `Look` record the presets already produce, and every generator
 *  downstream (world sprite, portrait, garment) keeps working untouched.
 *
 *  **Why an integer rather than a JSON blob.** It has to survive three trips:
 *  localStorage, the wire, and a database column. Small and opaque beats
 *  structured for all three, and it makes "is this the same appearance?" a
 *  numeric comparison rather than a deep equal — which is what the atlas
 *  cache needs to decide whether it already has this person baked.
 *
 *  Field widths are deliberately generous where the option lists are likely
 *  to grow (garments, cloth colours) and tight where they are not (skin has
 *  three ranges and will not suddenly have thirty). */

import { C, HAIR_TONES, SKIN_TONES } from './palette';
import { GARMENT_IDS, type GarmentId } from './garment';
import type { HairStyle, HeadGear, Look, Outfit } from './character';

// --- the option lists ------------------------------------------------------

export const HAIR_STYLES: readonly HairStyle[] = ['short', 'bob', 'tied', 'crop'];
export const HEAD_GEAR: readonly HeadGear[] = ['bare', 'cap', 'hat', 'hood'];

/** Cloth colours offered for shirts, and the shade that goes under each.
 *
 *  Authored as pairs rather than reached by index arithmetic: the palette's
 *  ramps are not all the same length, and stepping blindly lands a "shadow"
 *  on a brighter colour than the base — which is how a shirt ends up glowing
 *  along its shaded side. */
export const CLOTH: ReadonlyArray<readonly [C, C]> = [
  [C.Ink, C.InkDeep],
  [C.Slate, C.Ink],
  [C.SlateLt, C.Slate],
  [C.Mist, C.SlateLt],
  [C.Pale, C.Mist],
  [C.Forest, C.ForestDp],
  [C.GrassDk, C.Forest],
  [C.WaterSh, C.Water],
  [C.WaterDp, C.Ink],
  [C.Purple, C.Dusk],
  [C.Rose, C.Purple],
  [C.Amber, C.Wood],
  [C.SunGlow, C.Amber],
  [C.Wood, C.WoodDk],
  [C.WoodDk, C.WoodDp],
  [C.CyberSteel, C.CyberSlate],
];

/** Trousers. Darker and duller than the shirt list on purpose — legs are six
 *  pixels of a sixteen-pixel sprite, and a bright colour down there pulls the
 *  eye away from the face. */
export const TROUSERS: readonly C[] = [
  C.InkDeep, C.Ink, C.Slate, C.WoodDp, C.WoodDk, C.ForestDp, C.WaterDp, C.Dusk,
];

export const BOOTS: readonly C[] = [
  C.InkDeep, C.WoodDp, C.WoodDk, C.Pale, C.Slate, C.Banner,
];

/** Headwear colours. Only consulted when headwear is not 'bare'. */
export const HEAD_COLS: ReadonlyArray<readonly [C, C]> = [
  [C.WoodDk, C.WoodDp],
  [C.Slate, C.Ink],
  [C.Forest, C.ForestDp],
  [C.Banner, C.Purple],
  [C.Amber, C.Wood],
  [C.Pale, C.Mist],
];

// --- the choices, and how they pack ---------------------------------------

export interface Choices {
  skin: number;
  hair: number;
  hairStyle: number;
  head: number;
  headCol: number;
  garment: number;
  shirt: number;
  pants: number;
  boot: number;
}

/** Bit widths, in packing order. The sum has to stay under 31 so the packed
 *  value survives every bitwise operation in JS as a signed 32-bit int —
 *  going over does not error, it silently wraps, and an appearance that
 *  silently wraps is an appearance that changes when you reload. */
const FIELDS: ReadonlyArray<readonly [keyof Choices, number, number]> = [
  // name          bits   count
  ['skin', 2, SKIN_TONES.length],
  ['hair', 3, HAIR_TONES.length],
  ['hairStyle', 2, HAIR_STYLES.length],
  ['head', 2, HEAD_GEAR.length],
  ['headCol', 3, HEAD_COLS.length],
  ['garment', 4, GARMENT_IDS.length],
  ['shirt', 4, CLOTH.length],
  ['pants', 3, TROUSERS.length],
  ['boot', 3, BOOTS.length],
];

const TOTAL_BITS = FIELDS.reduce((n, f) => n + f[1], 0);

export const OPTION_COUNT: Readonly<Record<keyof Choices, number>> =
  Object.fromEntries(FIELDS.map((f) => [f[0], f[2]])) as Record<keyof Choices, number>;

export function packLook(c: Choices): number {
  let out = 0;
  let shift = 0;
  for (const [key, bits, count] of FIELDS) {
    // Wrapped rather than clamped. A value out of range means a saved code
    // from an older build with a shorter list, and wrapping keeps that person
    // looking like *somebody* instead of resetting them to option zero.
    const v = ((Math.floor(c[key]) % count) + count) % count;
    out |= v << shift;
    shift += bits;
  }
  return out >>> 0;
}

export function unpackLook(code: number): Choices {
  const n = Math.abs(Math.floor(code)) >>> 0;
  const out = {} as Choices;
  let shift = 0;
  for (const [key, bits, count] of FIELDS) {
    const raw = (n >>> shift) & ((1 << bits) - 1);
    out[key] = raw % count;
    shift += bits;
  }
  return out;
}

/** How many distinct appearances the encoding can express. */
export function variantCount(): number {
  return FIELDS.reduce((n, f) => n * f[2], 1);
}

/** Bits used, for the test that guards the 31-bit ceiling. */
export function bitsUsed(): number {
  return TOTAL_BITS;
}

// --- turning choices into the Look every generator already understands -----

/** The world sprite has four outfit shapes; the portrait has ten garments.
 *  Mapping between them here keeps a custom character consistent head to toe
 *  instead of wearing a cardigan in conversation and a tunic in the field. */
function outfitFor(g: GarmentId): Outfit {
  switch (g) {
    case 'hoodie': return 'hoodie';
    case 'varsity':
    case 'puffer':
    case 'trench':
    case 'overshirt':
    case 'flannel': return 'jacket';
    case 'batik': return 'tunic';
    default: return 'shirt';
  }
}

export function lookFromCode(code: number, id = 'custom'): Look {
  const c = unpackLook(code);
  const [skinLt, skin, skinSh, skinDp] = SKIN_TONES[c.skin];
  const [hairSh, hair, hairHi] = HAIR_TONES[c.hair];
  const [shirt, shirtDim] = CLOTH[c.shirt];
  const head = HEAD_GEAR[c.head];
  const [headCol, headSh] = HEAD_COLS[c.headCol];
  const garment = GARMENT_IDS[c.garment];
  return {
    id,
    skinLt, skin, skinSh, skinDp,
    hair, hairSh, hairHi,
    hairStyle: HAIR_STYLES[c.hairStyle],
    head,
    // Zero when bare, because `drawHeadwear` returns early on 'bare' and a
    // stray colour left in the record is a colour someone will eventually
    // read and draw with.
    headCol: head === 'bare' ? 0 : headCol,
    headSh: head === 'bare' ? 0 : headSh,
    outfit: outfitFor(garment),
    garment,
    shirt,
    shirtDim,
    trim: C.White,
    pants: TROUSERS[c.pants],
    boot: BOOTS[c.boot],
  };
}

/** A random appearance, for the first time somebody opens the game.
 *
 *  Weighted away from headwear, because a hat hides the hair — and the hair is
 *  the loudest thing about a sixteen-pixel character. Handing a new player a
 *  hood by default hides the choice they are most likely to want to make.
 */
export function randomCode(rand: () => number = Math.random): number {
  const pick = (n: number): number => Math.floor(rand() * n);
  return packLook({
    skin: pick(SKIN_TONES.length),
    hair: pick(HAIR_TONES.length),
    hairStyle: pick(HAIR_STYLES.length),
    head: rand() < 0.6 ? 0 : pick(HEAD_GEAR.length),
    headCol: pick(HEAD_COLS.length),
    garment: pick(GARMENT_IDS.length),
    shirt: pick(CLOTH.length),
    pants: pick(TROUSERS.length),
    boot: pick(BOOTS.length),
  });
}

/** Four seasons.
 *
 *  The valley already had a day: a clock, a sun that moves, lamps that come
 *  on. What it did not have was a calendar — day forty looked exactly like
 *  day one, so nothing accumulated and there was no reason to still be here
 *  a month later.
 *
 *  A season is not a filter over the whole screen. Tinting everything the
 *  same way is the cheap version and it reads as a broken monitor: the
 *  brown of a plank does not go green in spring. What actually changes is
 *  narrow and specific —
 *
 *    - **foliage**, which is genuinely a different colour in each season
 *    - **the light**, in temperature rather than in brightness
 *    - **the air**: petals, heat, falling leaves, cold mist
 *    - **what people are wearing**, which is the most human of the four
 *    - **what is biting**, so a season is worth fishing through
 *
 *  The ground, the stone, the wood and the water keep their own colours,
 *  because they keep them in life.
 *
 *  Named in Indonesian even though this valley would only really know two of
 *  them. That is a deliberate liberty: the game wants a calendar to turn, and
 *  four turns of it read better than two. */

import { C } from '../art/palette';
import type { GarmentId } from '../art/garment';

export type SeasonId = 'semi' | 'panas' | 'gugur' | 'dingin';

/** In-game days per season. Short enough that a player who plays for a week
 *  sees the calendar turn at least once — a season nobody reaches is a
 *  season that does not exist. */
export const SEASON_DAYS = 7;

export interface Season {
  id: SeasonId;
  label: string;
  /** One line, shown when the season turns. */
  blurb: string;
  /** Foliage recoloured: which palette index replaces which. Only the green
   *  ramp; everything else keeps its own colour. */
  leaf: ReadonlyMap<C, C>;
  /** Light temperature. Multiplies the ambient, so it warms or cools rather
   *  than brightening — a season that changes exposure looks like a bug. */
  warmth: [number, number, number];
  /** What drifts through the air, and how much of it. */
  air: 'petal' | 'haze' | 'leaf' | 'mist';
  airRate: number;
  /** What people wear. The first entry is the most common. */
  wear: readonly GarmentId[];
  /** Multiplies a species' weight by where it likes to sit in the water.
   *  Warm seasons bring the surface fish up; cold ones push everything deep. */
  shallowBias: number;
  deepBias: number;
}

/** Foliage recolouring, written as explicit pairs rather than an index shift.
 *
 *  Shifting the green ramp by a step gives autumn a *darker green*, which is
 *  not what autumn is. Autumn leaves move to a different hue entirely, and
 *  only an explicit mapping can say so. */
function leaves(pairs: Array<[C, C]>): ReadonlyMap<C, C> {
  return new Map(pairs);
}

export const SEASONS: Record<SeasonId, Season> = {
  /** Everything is coming back and slightly too bright about it. */
  semi: {
    id: 'semi', label: 'Semi',
    blurb: 'Daun muda, air dingin, ikan naik ke permukaan.',
    leaf: leaves([
      [C.ForestDp, C.Forest],
      [C.Forest, C.GrassDk],
      [C.GrassDk, C.Grass],
      [C.Grass, C.GrassLt],
      [C.GrassLt, C.LeafLt],
    ]),
    warmth: [1.02, 1.03, 0.98],
    air: 'petal', airRate: 1,
    wear: ['cardigan', 'overshirt', 'knit', 'varsity', 'batik'],
    shallowBias: 1.3, deepBias: 0.9,
  },

  /** The long bright one. Nothing moves in the afternoon. */
  panas: {
    id: 'panas', label: 'Panas',
    blurb: 'Siang panjang. Ikan turun, nunggu sore.',
    leaf: leaves([
      [C.GrassLt, C.Grass],
      [C.Grass, C.GrassDk],
    ]),
    warmth: [1.06, 1.02, 0.92],
    air: 'haze', airRate: 0.5,
    wear: ['tank', 'batik', 'overshirt', 'knit'],
    shallowBias: 0.8, deepBias: 1.35,
  },

  /** The good one. */
  gugur: {
    id: 'gugur', label: 'Gugur',
    blurb: 'Airnya jernih. Musim paling enak buat mancing.',
    // The dark greens stay green. Turning the whole ramp to brown gave a
    // valley of mud with amber weeds in it — autumn is green grass with
    // amber and orange coming through it, not the death of everything.
    leaf: leaves([
      [C.Forest, C.WoodDk],
      [C.Grass, C.Amber],
      [C.GrassLt, C.Orange],
      [C.LeafLt, C.SunGlow],
    ]),
    warmth: [1.05, 0.99, 0.9],
    air: 'leaf', airRate: 1.4,
    wear: ['knit', 'flannel', 'varsity', 'cardigan', 'trench'],
    shallowBias: 1.15, deepBias: 1.15,
  },

  /** Cold, and the water goes quiet. */
  dingin: {
    id: 'dingin', label: 'Dingin',
    blurb: 'Air dingin, ikan diam di dasar. Yang naik biasanya besar.',
    // Cold is pale, not dark. The first version mapped every green a step or
    // two down the ramp, and the result at midday was a village at midnight:
    // the sun still up, the clock still reading SIANG, and the ground black.
    // Winter drains the colour out of foliage and cools it — it does not
    // turn the lights off. These pairs hold roughly the same brightness and
    // only move the hue.
    //
    // Matching luma is not enough, which took three attempts to accept. A
    // grass tile is built from Forest and GrassDk, and swapping those for
    // blue-greys of *identical* computed luma still read as night at midday:
    // the eye is far more sensitive to green than to blue, so equal
    // brightness on paper is not equal brightness on screen. Winter foliage
    // has to be mapped genuinely lighter to read as cold rather than as
    // dark.
    leaf: leaves([
      [C.ForestDp, C.SlateLt],
      [C.Forest, C.Mist],
      [C.GrassDk, C.Mist],
      [C.Grass, C.Pale],
      [C.GrassLt, C.Pale],
      [C.LeafLt, C.White],
    ]),
    warmth: [0.9, 0.95, 1.08],
    air: 'mist', airRate: 1.1,
    wear: ['puffer', 'trench', 'hoodie', 'knit', 'flannel'],
    shallowBias: 0.6, deepBias: 1.5,
  },
};

const ORDER: readonly SeasonId[] = ['semi', 'panas', 'gugur', 'dingin'];

/** Which season a given in-game day falls in. */
export function seasonForDay(day: number): Season {
  const i = Math.floor(day / SEASON_DAYS) % ORDER.length;
  return SEASONS[ORDER[((i % 4) + 4) % 4]];
}

/** Day within the current season, from 1. For the HUD. */
export function dayOfSeason(day: number): number {
  return (((day % SEASON_DAYS) + SEASON_DAYS) % SEASON_DAYS) + 1;
}

/** Recolours a palette index for the season. Anything not in the season's
 *  map comes back untouched, which is most of the palette — that is the
 *  point. */
export function seasonal(season: Season, col: C): C {
  return season.leaf.get(col) ?? col;
}

/** The garment someone wears this season.
 *
 *  Keyed off the character rather than rolled, so a villager does not change
 *  coat every time you talk to them — but weighted toward the front of the
 *  season's list, so a season has a look rather than an even spread. */
export function wearFor(season: Season, key: number): GarmentId {
  const n = season.wear.length;
  // Squared, so the first entries dominate. An even pick across five
  // garments gives every season the same crowd in different colours.
  const t = ((key * 2654435761) >>> 0) / 4294967296;
  const i = Math.min(n - 1, Math.floor(t * t * n));
  return season.wear[i];
}

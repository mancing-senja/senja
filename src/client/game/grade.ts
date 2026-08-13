/** Catch grades.
 *
 *  Every fish that bites is rolled a grade, and the grade is not a label
 *  stuck on afterwards — it changes the sprite, how hard the fish fights,
 *  how big it comes in, what it sells for, and how loud the catch is.
 *  Thirty-odd species times six grades is what makes the roster deep
 *  without writing five hundred near-identical rows of data, each of which
 *  would need its own sprite and none of which would look like anything.
 *
 *  The colour ladder is the one every player already knows how to read —
 *  grey, green, blue, violet, gold, then something that is obviously off
 *  the end of the scale. Borrowing it costs nothing and means a Mitos is
 *  legible as a Mitos the first time somebody sees one.
 *
 *  Rarity responds to *where and when* you fish. Deep water, a good spot
 *  and the small hours all raise the odds, so the way to chase a rare fish
 *  is to go somewhere for it rather than to cast more times in the same
 *  place. That is the difference between a rarity system and a slot
 *  machine. */

import { C } from '../art/palette';

export type GradeId = 'biasa' | 'bagus' | 'langka' | 'epik' | 'legendaris' | 'mitos';

export interface Grade {
  id: GradeId;
  label: string;
  /** Tier index, 0..5. Drives how hard luck bends the odds. */
  tier: number;
  colour: C;
  /** Relative odds at zero luck. */
  weight: number;
  /** Pushes the size roll toward the top of the species' range. */
  sizeBias: number;
  valueMul: number;
  fightMul: number;
  /** Additive glow radius behind the fish, in pixels. 0 = none. */
  glow: number;
  /** Draw the elaborate sprite — longer fins, rim light, filaments. */
  exalted: boolean;
  /** How big a deal the catch is: drives flash, particles and sound. */
  fanfare: number;
}

export const GRADES: Grade[] = [
  {
    id: 'biasa', label: 'Biasa', tier: 0, colour: C.Mist,
    weight: 1000, sizeBias: 0, valueMul: 1, fightMul: 1,
    glow: 0, exalted: false, fanfare: 0,
  },
  {
    id: 'bagus', label: 'Bagus', tier: 1, colour: C.GrassLt,
    weight: 300, sizeBias: 0.10, valueMul: 1.6, fightMul: 1.08,
    glow: 0, exalted: false, fanfare: 1,
  },
  {
    id: 'langka', label: 'Langka', tier: 2, colour: C.WaterBr,
    weight: 80, sizeBias: 0.22, valueMul: 2.8, fightMul: 1.22,
    glow: 16, exalted: false, fanfare: 2,
  },
  {
    id: 'epik', label: 'Epik', tier: 3, colour: C.ArcaneLt,
    weight: 18, sizeBias: 0.38, valueMul: 5.5, fightMul: 1.45,
    glow: 24, exalted: true, fanfare: 3,
  },
  {
    id: 'legendaris', label: 'Legendaris', tier: 4, colour: C.Lantern,
    weight: 3.5, sizeBias: 0.58, valueMul: 12, fightMul: 1.75,
    glow: 32, exalted: true, fanfare: 4,
  },
  {
    id: 'mitos', label: 'Mitos', tier: 5, colour: C.NeonMagenta,
    weight: 0.6, sizeBias: 0.80, valueMul: 30, fightMul: 2.2,
    glow: 48, exalted: true, fanfare: 5,
  },
];

export const COMMON = GRADES[0];

export function gradeById(id: GradeId): Grade {
  return GRADES.find((g) => g.id === id) ?? COMMON;
}

/** How far luck bends each tier's odds.
 *
 *  Deliberately modest. At full luck a Mitos is still roughly one cast in
 *  sixty — rare enough that finding one is a story, common enough that
 *  somebody who deliberately fishes the deep water at night will actually
 *  see one. Turning this up is the fastest way to make the whole ladder
 *  meaningless. */
const LUCK_BASE = 1.1;

/** Rolls a grade. `luck` is 0..1; `rand` is injectable so the roll can be
 *  tested without hoping. */
export function rollGrade(luck: number, rand: () => number = Math.random): Grade {
  const k = 1 + Math.max(0, Math.min(1, luck)) * LUCK_BASE;
  let total = 0;
  const weights = GRADES.map((g) => {
    const w = g.weight * Math.pow(k, g.tier);
    total += w;
    return w;
  });
  let r = rand() * total;
  for (let i = 0; i < GRADES.length; i++) {
    r -= weights[i];
    if (r <= 0) return GRADES[i];
  }
  return COMMON;
}

/** Where and when you are fishing, as a single 0..1 number.
 *
 *  Depth carries most of it, because depth is the thing the player controls
 *  directly by choosing where to stand and how far to cast. */
export function luckFrom(depth01: number, spotDepth: number, night: number): number {
  return Math.min(1, depth01 * 0.5 + spotDepth * 0.3 + night * 0.2);
}

/** The odds, for the journal. Returns percentages that sum to 100. */
export function gradeOdds(luck: number): Array<{ grade: Grade; pct: number }> {
  const k = 1 + Math.max(0, Math.min(1, luck)) * LUCK_BASE;
  const w = GRADES.map((g) => g.weight * Math.pow(k, g.tier));
  const total = w.reduce((a, b) => a + b, 0);
  return GRADES.map((g, i) => ({ grade: g, pct: (w[i] / total) * 100 }));
}

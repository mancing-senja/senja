/** Village tackle shop state.
 *
 * The stall is intentionally a small convenience layer on top of fishing,
 * not a second economy. Rod upgrades shave a little waiting time and nudge
 * landed fish toward the top of their normal size range; bait only tilts an
 * already-valid spot/time roll toward rarer fish for a handful of casts.
 * Nothing here makes an unupgraded rod wrong to use. */

const KEY = 'senja.tackle';

export interface RodStats {
  label: string;
  cost: number;
  waitMul: number;
  sizeBias: number;
}

export interface TackleState {
  rod: number;
  baitCasts: number;
}

export const RODS: readonly RodStats[] = [
  { label: 'Joran Bambu', cost: 0, waitMul: 1, sizeBias: 0 },
  { label: 'Joran Serat', cost: 90, waitMul: 0.90, sizeBias: 0.04 },
  { label: 'Joran Danau', cost: 220, waitMul: 0.82, sizeBias: 0.08 },
];

export const BAIT_COST = 18;
export const BAIT_CASTS = 6;

let state = load();

export function tackleState(): Readonly<TackleState> {
  return state;
}

export function rodStats(): RodStats {
  return RODS[state.rod] ?? RODS[0];
}

export function nextRod(): RodStats | null {
  return RODS[state.rod + 1] ?? null;
}

export function upgradeRod(): RodStats | null {
  const next = nextRod();
  if (!next) return null;
  state = { ...state, rod: Math.min(RODS.length - 1, state.rod + 1) };
  save();
  return next;
}

export function addBait(): void {
  // Enough room to buy a few bundles in advance, but not an unbounded number
  // accidentally from a held key or a controller that repeats input.
  state = { ...state, baitCasts: Math.min(60, state.baitCasts + BAIT_CASTS) };
  save();
}

/** One charge is a cast, not a catch. Pulling the line in early still used
 * the bait; that keeps it understandable and avoids rewarding menu-like
 * recasting until a good bite appears. */
export function consumeBaitCast(): boolean {
  if (state.baitCasts <= 0) return false;
  state = { ...state, baitCasts: state.baitCasts - 1 };
  save();
  return true;
}

/** Multiplier applied after time/spot/district/season have already decided
 * which fish make sense here. Common fish stay common; valuable fish get a
 * modest lift, and junk gets a small penalty. */
export function baitWeight(value: number): number {
  if (value <= 6) return 0.65;
  const rare = clamp01((value - 40) / 140);
  return 1 + rare * 0.65;
}

function load(): TackleState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { rod: 0, baitCasts: 0 };
    const parsed = JSON.parse(raw) as Partial<TackleState>;
    return {
      rod: clampInt(Number(parsed.rod ?? 0), 0, RODS.length - 1),
      baitCasts: clampInt(Number(parsed.baitCasts ?? 0), 0, 60),
    };
  } catch {
    return { rod: 0, baitCasts: 0 };
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private/sandboxed contexts. The session
    // still works; it just cannot carry tackle to the next visit.
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampInt(v: number, a: number, b: number): number {
  if (!Number.isFinite(v)) return a;
  const n = Math.floor(v);
  return n < a ? a : n > b ? b : n;
}

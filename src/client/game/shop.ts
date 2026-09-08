/** Village tackle shop state.
 *
 * Gear should change how fishing feels without becoming a gate. Rod, line and
 * hook are permanent comfort/mastery upgrades; bait is consumable and answers
 * a different question: "what am I trying to catch tonight?"
 *
 * Bait never creates an impossible species. It is applied last, after
 * time/spot/district/season have already decided what belongs in the water.
 */

const KEY = 'senja.tackle';

export interface RodStats {
  label: string;
  cost: number;
  waitMul: number;
  sizeBias: number;
}

export interface LineStats {
  label: string;
  cost: number;
  /** Extra seconds of bad tension before the fish can shake free. */
  slackGrace: number;
  /** Extra progress debt allowed before the fight is lost. */
  failGrace: number;
}

export interface HookStats {
  label: string;
  cost: number;
  /** Clean hook window in seconds after the real take. */
  cleanWindow: number;
  /** Total reaction window before the fish spits the hook. */
  biteWindow: number;
}

export type BaitId = 'cacing' | 'serangga' | 'udang' | 'kilau';

export interface BaitStats {
  id: BaitId;
  label: string;
  cost: number;
  casts: number;
  hint: string;
}

export interface TackleState {
  rod: number;
  line: number;
  hook: number;
  bait: BaitId;
  baits: Record<BaitId, number>;
}

export const RODS: readonly RodStats[] = [
  { label: 'Joran Bambu', cost: 0, waitMul: 1, sizeBias: 0 },
  { label: 'Joran Serat', cost: 90, waitMul: 0.90, sizeBias: 0.04 },
  { label: 'Joran Danau', cost: 220, waitMul: 0.82, sizeBias: 0.08 },
];

export const LINES: readonly LineStats[] = [
  { label: 'Senar Nilon', cost: 0, slackGrace: 0, failGrace: 0 },
  { label: 'Senar Kepang', cost: 75, slackGrace: 0.45, failGrace: 0.04 },
  { label: 'Senar Danau', cost: 185, slackGrace: 0.90, failGrace: 0.08 },
];

export const HOOKS: readonly HookStats[] = [
  { label: 'Kail Biasa', cost: 0, cleanWindow: 0.65, biteWindow: 2.10 },
  { label: 'Kail Tajam', cost: 65, cleanWindow: 0.78, biteWindow: 2.18 },
  { label: 'Kail Lingkar', cost: 170, cleanWindow: 0.90, biteWindow: 2.28 },
];

export const BAITS: readonly BaitStats[] = [
  { id: 'cacing', label: 'Cacing Tanah', cost: 12, casts: 6, hint: 'serbaguna · ikan tenang' },
  { id: 'serangga', label: 'Serangga Air', cost: 18, casts: 6, hint: 'ikan kecil · lincah' },
  { id: 'udang', label: 'Udang Sungai', cost: 26, casts: 5, hint: 'predator · ikan berat' },
  { id: 'kilau', label: 'Umpan Kilau', cost: 34, casts: 4, hint: 'langka · ikan aneh' },
];

const BAIT_IDS = BAITS.map((b) => b.id) as BaitId[];

let state = load();

export function tackleState(): Readonly<TackleState> {
  return state;
}

export function rodStats(): RodStats {
  return RODS[state.rod] ?? RODS[0];
}

export function lineStats(): LineStats {
  return LINES[state.line] ?? LINES[0];
}

export function hookStats(): HookStats {
  return HOOKS[state.hook] ?? HOOKS[0];
}

export function selectedBait(): BaitStats {
  return BAITS.find((b) => b.id === state.bait) ?? BAITS[0];
}

export function baitById(id: BaitId): BaitStats {
  return BAITS.find((b) => b.id === id) ?? BAITS[0];
}

export function baitCount(id: BaitId = state.bait): number {
  return state.baits[id] ?? 0;
}

export function cycleBait(): BaitStats {
  const i = Math.max(0, BAIT_IDS.indexOf(state.bait));
  state = { ...state, bait: BAIT_IDS[(i + 1) % BAIT_IDS.length] };
  save();
  return selectedBait();
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

export function nextLine(): LineStats | null {
  return LINES[state.line + 1] ?? null;
}

export function upgradeLine(): LineStats | null {
  const next = nextLine();
  if (!next) return null;
  state = { ...state, line: Math.min(LINES.length - 1, state.line + 1) };
  save();
  return next;
}

export function nextHook(): HookStats | null {
  return HOOKS[state.hook + 1] ?? null;
}

export function upgradeHook(): HookStats | null {
  const next = nextHook();
  if (!next) return null;
  state = { ...state, hook: Math.min(HOOKS.length - 1, state.hook + 1) };
  save();
  return next;
}

export function addBait(): BaitStats {
  const bait = selectedBait();
  const have = baitCount(bait.id);
  state = {
    ...state,
    baits: { ...state.baits, [bait.id]: Math.min(60, have + bait.casts) },
  };
  save();
  return bait;
}

/** One charge is a cast, not a catch. Pulling the line in early still uses
 * the bait; otherwise players can menu-recast until the desired roll appears.
 * Returns the bait that was actually on this cast, or null for bare hook. */
export function consumeBaitCast(): BaitId | null {
  const bait = selectedBait();
  const have = baitCount(bait.id);
  if (have <= 0) return null;
  state = {
    ...state,
    baits: { ...state.baits, [bait.id]: have - 1 },
  };
  save();
  return bait.id;
}

/** Targeting multiplier, deliberately modest.
 *
 * The world decides whether a fish belongs here first. Bait only reshapes the
 * valid pool, so Udang Sungai at Teluk Eceng does not magically summon a
 * deep-water monster the spot table has already suppressed.
 */
export function baitWeight(
  bait: BaitId,
  value: number,
  fight: number,
  maxCm: number,
  style: string,
): number {
  // Every real bait helps keep rubbish off the hook.
  if (value <= 6) return 0.55;

  switch (bait) {
    case 'cacing': {
      // Broad, cheap and forgiving. Good default for normal freshwater fish.
      const calm = style === 'tenang' || style === 'menyelam';
      const ordinary = value < 90;
      return 1 + (calm ? 0.26 : 0.08) + (ordinary ? 0.08 : -0.08);
    }
    case 'serangga': {
      // Surface/schooling fish: lots of motion, generally not huge.
      const active = style === 'lincah' || style === 'menggetar';
      const small = maxCm <= 42;
      return 0.82 + (active ? 0.42 : 0) + (small ? 0.24 : -0.08);
    }
    case 'udang': {
      // Strong fish and ambush predators. A little worse on tiny fish.
      const predator = style === 'mengendap' || style === 'menyelam' || fight >= 1.45;
      const big = maxCm >= 45;
      return 0.78 + (predator ? 0.40 : 0) + (big ? 0.28 : 0);
    }
    case 'kilau': {
      // Expensive specialist bait. It favours valuable/strange catches, but
      // never enough to make common fish disappear completely.
      const rare = clamp01((value - 55) / 145);
      const dramatic = style === 'lari' || fight >= 1.8;
      return 0.72 + rare * 0.66 + (dramatic ? 0.16 : 0);
    }
  }
}

function emptyBaits(): Record<BaitId, number> {
  return { cacing: 0, serangga: 0, udang: 0, kilau: 0 };
}

function isBaitId(v: unknown): v is BaitId {
  return typeof v === 'string' && BAIT_IDS.includes(v as BaitId);
}

function load(): TackleState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { rod: 0, line: 0, hook: 0, bait: 'cacing', baits: emptyBaits() };

    const parsed = JSON.parse(raw) as {
      rod?: unknown;
      line?: unknown;
      hook?: unknown;
      bait?: unknown;
      baits?: Partial<Record<BaitId, unknown>>;
      /** v1 migration: the old system only had one generic bait stack. */
      baitCasts?: unknown;
    };

    const baits = emptyBaits();
    if (parsed.baits) {
      for (const id of BAIT_IDS) baits[id] = clampInt(Number(parsed.baits[id] ?? 0), 0, 60);
    } else {
      // Preserve old purchases as Cacing Tanah instead of deleting inventory.
      baits.cacing = clampInt(Number(parsed.baitCasts ?? 0), 0, 60);
    }

    return {
      rod: clampInt(Number(parsed.rod ?? 0), 0, RODS.length - 1),
      line: clampInt(Number(parsed.line ?? 0), 0, LINES.length - 1),
      hook: clampInt(Number(parsed.hook ?? 0), 0, HOOKS.length - 1),
      bait: isBaitId(parsed.bait) ? parsed.bait : 'cacing',
      baits,
    };
  } catch {
    return { rod: 0, line: 0, hook: 0, bait: 'cacing', baits: emptyBaits() };
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

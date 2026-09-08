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
  /** Safe sustained pull. Above this the blank starts taking damage. */
  strength: number;
  /** How much of a sudden surge the rod absorbs before it reaches line/hook. */
  shockAbsorb: number;
}

export interface LineStats {
  label: string;
  cost: number;
  /** Extra seconds of bad tension before the fish can shake free. */
  slackGrace: number;
  /** Extra progress debt allowed before the fight is lost. */
  failGrace: number;
  /** Safe pull before the line starts failing under tension. */
  strength: number;
  /** Protection against rock/wood rubbing while loaded, 0..1. */
  abrasionResist: number;
  /** Stretch that cushions shock but slightly delays direct pressure, 0..1. */
  elasticity: number;
  /** Relative usable line capacity on the spool. */
  capacity: number;
}

export interface HookStats {
  label: string;
  cost: number;
  /** Clean hook window in seconds after the real take. */
  cleanWindow: number;
  /** Total reaction window before the fish spits the hook. */
  biteWindow: number;
  /** Pull before the hook can open/straighten under sustained overload. */
  strength: number;
}

export type BaitId = 'cacing' | 'serangga' | 'udang' | 'kilau';

export interface BaitStats {
  id: BaitId;
  label: string;
  cost: number;
  casts: number;
  hint: string;
}

export type GearPart = 'rod' | 'line' | 'hook';
export type DragId = 'longgar' | 'seimbang' | 'kencang';
export type RodActionId = 'light' | 'medium' | 'heavy';
export type HookSizeId = 'kecil' | 'sedang' | 'besar';

export interface DragStats {
  id: DragId;
  label: string;
  /** Share of the line's safe strength the reel will hold before slipping. */
  hold: number;
  /** How fast the spool gives line under excess load. */
  slip: number;
}

export interface RodActionStats {
  id: RodActionId;
  label: string;
  /** Trade raw load capacity for feel/control or vice versa. */
  loadMul: number;
  /** Extra flex that cushions shock before line/hook see it. */
  flex: number;
  /** How quickly the player can move tension toward/away from the fish. */
  control: number;
  /** How firmly a hook-set transfers into hard mouths. */
  hookSet: number;
}

export interface HookSizeStats {
  id: HookSizeId;
  label: string;
  /** Physical strength multiplier for the installed hook model. */
  strengthMul: number;
  /** Hook-set transfer; bigger hook penetrates hard mouths better. */
  hookSet: number;
  /** Relative bite chance for small / large fish. */
  smallFit: number;
  bigFit: number;
}

export interface GearCondition {
  rod: number;
  line: number;
  hook: number;
}

export interface TackleState {
  rod: number;
  line: number;
  hook: number;
  condition: GearCondition;
  drag: DragId;
  action: RodActionId;
  hookSize: HookSizeId;
  bait: BaitId;
  baits: Record<BaitId, number>;
}

export const RODS: readonly RodStats[] = [
  { label: 'Joran Bambu', cost: 0, waitMul: 1, sizeBias: 0, strength: 1.10, shockAbsorb: 0.18 },
  { label: 'Joran Serat', cost: 90, waitMul: 0.90, sizeBias: 0.04, strength: 1.62, shockAbsorb: 0.28 },
  { label: 'Joran Danau', cost: 220, waitMul: 0.82, sizeBias: 0.08, strength: 2.30, shockAbsorb: 0.38 },
];

export const LINES: readonly LineStats[] = [
  {
    label: 'Senar Nilon', cost: 0, slackGrace: 0, failGrace: 0,
    strength: 1.00, abrasionResist: 0.42, elasticity: 0.38, capacity: 1.00,
  },
  {
    label: 'Senar Kepang', cost: 75, slackGrace: 0.45, failGrace: 0.04,
    strength: 1.52, abrasionResist: 0.72, elasticity: 0.08, capacity: 1.12,
  },
  {
    label: 'Senar Danau', cost: 185, slackGrace: 0.90, failGrace: 0.08,
    strength: 2.18, abrasionResist: 0.90, elasticity: 0.22, capacity: 1.26,
  },
];

export const HOOKS: readonly HookStats[] = [
  { label: 'Kail Biasa', cost: 0, cleanWindow: 0.65, biteWindow: 2.10, strength: 0.98 },
  { label: 'Kail Tajam', cost: 65, cleanWindow: 0.78, biteWindow: 2.18, strength: 1.42 },
  { label: 'Kail Lingkar', cost: 170, cleanWindow: 0.90, biteWindow: 2.28, strength: 2.02 },
];

export const DRAGS: readonly DragStats[] = [
  { id: 'longgar', label: 'Drag Longgar', hold: 0.62, slip: 0.85 },
  { id: 'seimbang', label: 'Drag Seimbang', hold: 0.78, slip: 0.62 },
  { id: 'kencang', label: 'Drag Kencang', hold: 0.92, slip: 0.42 },
];

export const ROD_ACTIONS: readonly RodActionStats[] = [
  { id: 'light', label: 'Action Light', loadMul: 0.84, flex: 0.34, control: 1.12, hookSet: 0.90 },
  { id: 'medium', label: 'Action Medium', loadMul: 1.00, flex: 0.22, control: 1.00, hookSet: 1.00 },
  { id: 'heavy', label: 'Action Heavy', loadMul: 1.18, flex: 0.10, control: 0.91, hookSet: 1.14 },
];

export const HOOK_SIZES: readonly HookSizeStats[] = [
  { id: 'kecil', label: 'Kail Kecil', strengthMul: 0.86, hookSet: 0.94, smallFit: 1.18, bigFit: 0.84 },
  { id: 'sedang', label: 'Kail Sedang', strengthMul: 1.00, hookSet: 1.00, smallFit: 1.00, bigFit: 1.00 },
  { id: 'besar', label: 'Kail Besar', strengthMul: 1.18, hookSet: 1.12, smallFit: 0.74, bigFit: 1.20 },
];

const DRAG_IDS = DRAGS.map((d) => d.id) as DragId[];
const ROD_ACTION_IDS = ROD_ACTIONS.map((a) => a.id) as RodActionId[];
const HOOK_SIZE_IDS = HOOK_SIZES.map((h) => h.id) as HookSizeId[];

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

export function gearCondition(): Readonly<GearCondition> {
  return state.condition;
}

export function dragStats(): DragStats {
  return DRAGS.find((d) => d.id === state.drag) ?? DRAGS[1];
}

export function cycleDrag(): DragStats {
  const i = Math.max(0, DRAG_IDS.indexOf(state.drag));
  state = { ...state, drag: DRAG_IDS[(i + 1) % DRAG_IDS.length] };
  save();
  return dragStats();
}

export function rodActionStats(): RodActionStats {
  return ROD_ACTIONS.find((a) => a.id === state.action) ?? ROD_ACTIONS[1];
}

export function cycleRodAction(): RodActionStats {
  const i = Math.max(0, ROD_ACTION_IDS.indexOf(state.action));
  state = { ...state, action: ROD_ACTION_IDS[(i + 1) % ROD_ACTION_IDS.length] };
  save();
  return rodActionStats();
}

export function hookSizeStats(): HookSizeStats {
  return HOOK_SIZES.find((h) => h.id === state.hookSize) ?? HOOK_SIZES[1];
}

export function cycleHookSize(): HookSizeStats {
  const i = Math.max(0, HOOK_SIZE_IDS.indexOf(state.hookSize));
  state = { ...state, hookSize: HOOK_SIZE_IDS[(i + 1) % HOOK_SIZE_IDS.length] };
  save();
  return hookSizeStats();
}

/** Hook size changes which already-valid species are comfortable committing
 * to the bait. It never zeroes a species, so casual/default play stays open. */
export function hookSizeWeight(maxCm: number): number {
  const h = hookSizeStats();
  const small = maxCm <= 30;
  const big = maxCm >= 55;
  return small ? h.smallFit : big ? h.bigFit : 1;
}

export function brokenPart(): GearPart | null {
  if (state.condition.rod <= 0) return 'rod';
  if (state.condition.line <= 0) return 'line';
  if (state.condition.hook <= 0) return 'hook';
  return null;
}

/** Worn gear loses only a small share of rated strength before it finally
 * breaks. The warning/damage loop matters; condition is not a hidden stat
 * that makes a 40% item suddenly half as strong. */
export function conditionFactor(part: GearPart): number {
  return 0.82 + clamp01(state.condition[part] / 100) * 0.18;
}

export function damageTackle(part: GearPart, amount: number): number {
  const next = Math.max(0, state.condition[part] - Math.max(0, amount));
  state = { ...state, condition: { ...state.condition, [part]: next } };
  save();
  return next;
}

export function repairCost(): number {
  const missingRod = 100 - state.condition.rod;
  const missingLine = 100 - state.condition.line;
  const missingHook = 100 - state.condition.hook;
  const rodBase = Math.max(18, Math.round((rodStats().cost || 35) * 0.28));
  const lineBase = Math.max(12, Math.round((lineStats().cost || 24) * 0.25));
  const hookBase = Math.max(8, Math.round((hookStats().cost || 18) * 0.22));
  return Math.ceil(
    rodBase * missingRod / 100
    + lineBase * missingLine / 100
    + hookBase * missingHook / 100
  );
}

export function repairAll(): number {
  const cost = repairCost();
  state = { ...state, condition: { rod: 100, line: 100, hook: 100 } };
  save();
  return cost;
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
  state = {
    ...state,
    rod: Math.min(RODS.length - 1, state.rod + 1),
    condition: { ...state.condition, rod: 100 },
  };
  save();
  return next;
}

export function nextLine(): LineStats | null {
  return LINES[state.line + 1] ?? null;
}

export function upgradeLine(): LineStats | null {
  const next = nextLine();
  if (!next) return null;
  state = {
    ...state,
    line: Math.min(LINES.length - 1, state.line + 1),
    condition: { ...state.condition, line: 100 },
  };
  save();
  return next;
}

export function nextHook(): HookStats | null {
  return HOOKS[state.hook + 1] ?? null;
}

export function upgradeHook(): HookStats | null {
  const next = nextHook();
  if (!next) return null;
  state = {
    ...state,
    hook: Math.min(HOOKS.length - 1, state.hook + 1),
    condition: { ...state.condition, hook: 100 },
  };
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

function fullCondition(): GearCondition {
  return { rod: 100, line: 100, hook: 100 };
}

function isBaitId(v: unknown): v is BaitId {
  return typeof v === 'string' && BAIT_IDS.includes(v as BaitId);
}

function isDragId(v: unknown): v is DragId {
  return typeof v === 'string' && DRAG_IDS.includes(v as DragId);
}

function isRodActionId(v: unknown): v is RodActionId {
  return typeof v === 'string' && ROD_ACTION_IDS.includes(v as RodActionId);
}

function isHookSizeId(v: unknown): v is HookSizeId {
  return typeof v === 'string' && HOOK_SIZE_IDS.includes(v as HookSizeId);
}

function load(): TackleState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {
        rod: 0, line: 0, hook: 0, condition: fullCondition(),
        drag: 'seimbang', action: 'medium', hookSize: 'sedang',
        bait: 'cacing', baits: emptyBaits(),
      };
    }

    const parsed = JSON.parse(raw) as {
      rod?: unknown;
      line?: unknown;
      hook?: unknown;
      condition?: Partial<Record<GearPart, unknown>>;
      drag?: unknown;
      action?: unknown;
      hookSize?: unknown;
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
      condition: {
        rod: clampInt(Number(parsed.condition?.rod ?? 100), 0, 100),
        line: clampInt(Number(parsed.condition?.line ?? 100), 0, 100),
        hook: clampInt(Number(parsed.condition?.hook ?? 100), 0, 100),
      },
      drag: isDragId(parsed.drag) ? parsed.drag : 'seimbang',
      action: isRodActionId(parsed.action) ? parsed.action : 'medium',
      hookSize: isHookSizeId(parsed.hookSize) ? parsed.hookSize : 'sedang',
      bait: isBaitId(parsed.bait) ? parsed.bait : 'cacing',
      baits,
    };
  } catch {
    return {
      rod: 0, line: 0, hook: 0, condition: fullCondition(),
      drag: 'seimbang', action: 'medium', hookSize: 'sedang',
      bait: 'cacing', baits: emptyBaits(),
    };
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

import type { NpcMemoryData, NpcMindState } from '../../shared/npc-ai';
import type { Mind } from './dialogue';

const KEY = 'senja.minds.v1';
const MEMORY_SLOTS = 6;

type MindRecord = Record<string, NpcMindState>;

function cleanState(value: unknown): NpcMindState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<NpcMindState>;
  const memories = Array.isArray(raw.memories)
    ? raw.memories.filter(validMemory).slice(-MEMORY_SLOTS)
    : [];
  return {
    memories,
    met: finiteInt(raw.met, 0),
    lastDay: Number.isFinite(raw.lastDay) ? Math.floor(raw.lastDay as number) : -1,
  };
}

function validMemory(value: unknown): value is NpcMemoryData {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<NpcMemoryData>;
  return (
    (m.kind === 'meet' || m.kind === 'record' || m.kind === 'rare'
      || m.kind === 'promise' || m.kind === 'gift' || m.kind === 'absence')
    && Number.isFinite(m.day)
    && Number.isFinite(m.weight)
  );
}

function readCache(): MindRecord {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    // Backward compatibility: the original local save was an array of slim
    // mind records. Preserve it while moving to the profile-shaped object.
    if (Array.isArray(parsed)) {
      const out: MindRecord = {};
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as Record<string, unknown>;
        const id = typeof raw.id === 'string' ? raw.id : '';
        const state = cleanState(raw);
        if (id && state) out[id] = state;
      }
      return out;
    }
    if (!parsed || typeof parsed !== 'object') return {};
    const out: MindRecord = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!validId(id)) continue;
      const state = cleanState(value);
      if (state) out[id] = state;
    }
    return out;
  } catch {
    return {};
  }
}

function writeCache(record: MindRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // NPC memory is an enhancement. A browser with storage disabled still
    // gets conversations for the current session.
  }
}

function stateOf(mind: Mind): NpcMindState {
  return {
    memories: mind.memories.slice(-MEMORY_SLOTS),
    met: Math.max(0, Math.floor(mind.met)),
    lastDay: Number.isFinite(mind.lastDay) ? Math.floor(mind.lastDay) : -1,
  };
}

function mergeState(a: NpcMindState | undefined, b: NpcMindState): NpcMindState {
  const memories = new Map<string, NpcMemoryData>();
  for (const m of [...(a?.memories ?? []), ...b.memories]) {
    if (!validMemory(m)) continue;
    const key = `${m.kind}:${m.subject ?? ''}`;
    const prev = memories.get(key);
    if (!prev || m.day > prev.day || m.weight > prev.weight) memories.set(key, { ...m });
  }
  const kept = [...memories.values()]
    .sort((x, y) => y.weight - x.weight || y.day - x.day)
    .slice(0, MEMORY_SLOTS);
  return {
    memories: kept,
    met: Math.max(a?.met ?? 0, b.met),
    lastDay: Math.max(a?.lastDay ?? -1, b.lastDay),
  };
}

function apply(mind: Mind, state: NpcMindState): void {
  mind.memories = state.memories.map((m) => ({ ...m }));
  mind.met = Math.max(mind.met, state.met);
  mind.lastDay = Math.max(mind.lastDay, state.lastDay);
}

/** Hydrate newly constructed villagers from whatever the browser already
 * knows. This includes memories downloaded from Supabase before an indoor
 * resident was first instantiated. */
export function hydrateMinds(minds: Mind[]): void {
  const cached = readCache();
  for (const mind of minds) {
    const state = cached[mind.id];
    if (state) apply(mind, state);
  }
}

/** Merge the profile copy from Supabase into both live minds and the local
 * cache. Neither side blindly replaces the other, so an offline interaction
 * immediately before reconnect is not lost. */
export function mergeMinds(minds: Mind[], remote: Record<string, NpcMindState> | undefined): void {
  const cached = readCache();
  for (const [id, value] of Object.entries(remote ?? {})) {
    if (!validId(id)) continue;
    const state = cleanState(value);
    if (state) cached[id] = mergeState(cached[id], state);
  }
  for (const mind of minds) {
    cached[mind.id] = mergeState(cached[mind.id], stateOf(mind));
    apply(mind, cached[mind.id]);
  }
  writeCache(cached);
}

/** Save current live minds without erasing cached residents that have not
 * been instantiated in this session yet. */
export function cacheMinds(minds: Mind[]): void {
  const cached = readCache();
  for (const mind of minds) cached[mind.id] = mergeState(cached[mind.id], stateOf(mind));
  writeCache(cached);
}

/** Profile payload for Supabase. Includes cached unseen residents so a save
 * from outdoors cannot silently delete memories made indoors last session. */
export function exportMinds(minds: Mind[]): Record<string, NpcMindState> {
  const cached = readCache();
  for (const mind of minds) cached[mind.id] = mergeState(cached[mind.id], stateOf(mind));
  writeCache(cached);
  return cached;
}

function validId(id: string): boolean {
  return /^[a-z0-9:_-]{1,64}$/i.test(id);
}

function finiteInt(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : fallback;
}

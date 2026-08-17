/** Player profiles, persisted in Supabase.
 *
 * The client still owns an opaque random token; Senja does not collect an
 * email address or password. The database hashes that token before storing
 * it, so even the profile key itself is not kept in plaintext.
 *
 * The public Supabase key is intentionally safe to ship. Direct table access
 * is blocked by RLS; the only exposed operations are the two narrowly scoped
 * RPCs used below. Environment variables can override both values when the
 * project or key is rotated. */

import type { NpcMemoryData, NpcMindState } from '../shared/npc-ai.js';

export interface Profile {
  name: string;
  look: number;
  coins: number;
  caught: number;
  day: number;
  /** Species id → biggest centimetres and best grade tier seen. */
  log: Record<string, { count: number; best: number; bestGrade: number }>;
  /** Lore fragment ids already read. */
  lore: string[];
  /** NPC id → that villager's relationship with this player. */
  minds: Record<string, NpcMindState>;
  /** Unix ms, for pruning profiles nobody has touched in a long time. */
  seen: number;
}

const SUPABASE_URL = process.env.SENJA_SUPABASE_URL
  ?? 'https://fkboibzrpduyrucyadfo.supabase.co';
const SUPABASE_KEY = process.env.SENJA_SUPABASE_KEY
  ?? 'sb_publishable_JMzH_SKy7I4ZFvTa3dweEw_FTg24rC4';
/** CI smoke tests exercise networking but must never write test profiles to
 * the production Supabase project. */
const PERSISTENCE_DISABLED = process.env.SENJA_DISABLE_PERSISTENCE === '1';

const seenTokens = new Set<string>();

export function validToken(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t);
}

function emptyProfile(): Profile {
  return {
    name: '', look: 0, coins: 0, caught: 0, day: 0,
    log: {}, lore: [], minds: {}, seen: Date.now(),
  };
}

function asProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object') return emptyProfile();
  const raw = value as Record<string, unknown>;
  return {
    name: typeof raw.name === 'string' ? raw.name.slice(0, 24) : '',
    look: num(raw.look),
    coins: num(raw.coins),
    caught: num(raw.caught),
    day: num(raw.day),
    log: cleanLog(raw.log),
    lore: cleanLore(raw.lore),
    minds: cleanMinds(raw.minds),
    seen: num(raw.seen) || Date.now(),
  };
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Supabase ${name} gagal (${response.status}): ${detail}`);
  }
  return response.json();
}

export class Store {
  /** Writes that have left this process but have not finished committing yet. */
  private pendingWrites = new Set<Promise<unknown>>();

  async get(token: string): Promise<Profile> {
    if (!validToken(token) || PERSISTENCE_DISABLED) return emptyProfile();
    const data = await rpc('senja_get_profile', { p_token: token });
    seenTokens.add(token);
    return asProfile(data);
  }

  async merge(token: string, patch: Partial<Profile>): Promise<Profile> {
    if (!validToken(token) || PERSISTENCE_DISABLED) return emptyProfile();
    const request = rpc('senja_merge_profile', {
      p_token: token,
      p_patch: sanitizePatch(patch),
    });
    this.pendingWrites.add(request);
    try {
      const data = await request;
      seenTokens.add(token);
      return asProfile(data);
    } finally {
      this.pendingWrites.delete(request);
    }
  }

  /** Wait until every profile write already accepted by this process settles. */
  async flush(): Promise<void> {
    // Loop rather than snapshot once: a save can arrive while an earlier
    // batch is settling (for example during a graceful shutdown).
    while (this.pendingWrites.size > 0) {
      await Promise.allSettled([...this.pendingWrites]);
    }
  }

  get size(): number {
    return seenTokens.size;
  }
}

function sanitizePatch(patch: Partial<Profile>): Partial<Profile> {
  const out: Partial<Profile> = {};
  if (typeof patch.name === 'string') out.name = patch.name.slice(0, 24);
  if (Number.isFinite(patch.look)) out.look = num(patch.look);
  if (Number.isFinite(patch.coins)) out.coins = num(patch.coins);
  if (Number.isFinite(patch.caught)) out.caught = num(patch.caught);
  if (Number.isFinite(patch.day)) out.day = num(patch.day);
  if (patch.log && typeof patch.log === 'object') out.log = cleanLog(patch.log);
  if (Array.isArray(patch.lore)) out.lore = cleanLore(patch.lore);
  if (patch.minds && typeof patch.minds === 'object') out.minds = cleanMinds(patch.minds);
  return out;
}

function cleanLog(value: unknown): Profile['log'] {
  const result: Profile['log'] = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z_]{1,32}$/.test(id) || !raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    result[id] = {
      count: num(e.count),
      best: num(e.best),
      bestGrade: num(e.bestGrade),
    };
  }
  return result;
}

function cleanLore(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const id of value) {
    if (typeof id === 'string' && /^[a-z0-9_-]{1,32}$/.test(id)) unique.add(id);
    if (unique.size >= 256) break;
  }
  return [...unique];
}

function cleanMinds(value: unknown): Record<string, NpcMindState> {
  const result: Record<string, NpcMindState> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9:_-]{1,64}$/.test(id) || !raw || typeof raw !== 'object') continue;
    const state = raw as Record<string, unknown>;
    const memories: NpcMemoryData[] = [];
    if (Array.isArray(state.memories)) {
      for (const item of state.memories) {
        const memory = cleanMemory(item);
        if (memory) memories.push(memory);
        if (memories.length >= 6) break;
      }
    }
    result[id] = {
      memories,
      met: Math.min(100000, num(state.met)),
      lastDay: signedDay(state.lastDay),
    };
    if (Object.keys(result).length >= 256) break;
  }
  return result;
}

function cleanMemory(value: unknown): NpcMemoryData | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== 'meet' && kind !== 'record' && kind !== 'rare'
    && kind !== 'promise' && kind !== 'gift' && kind !== 'absence') return null;
  const subject = typeof raw.subject === 'string'
    ? raw.subject.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
    : undefined;
  return {
    kind,
    day: Math.max(-1, Math.min(100000, Math.floor(Number(raw.day) || 0))),
    weight: Math.max(0, Math.min(10, Number(raw.weight) || 0)),
    ...(subject ? { subject } : {}),
    ...(Number.isFinite(raw.value) ? { value: Math.max(-1000000, Math.min(1000000, Number(raw.value))) } : {}),
  };
}

function signedDay(v: unknown): number {
  return Number.isFinite(v) ? Math.max(-1, Math.min(100000, Math.floor(v as number))) : -1;
}

function num(v: unknown): number {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : 0;
}

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
    log: {}, lore: [], seen: Date.now(),
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
  async get(token: string): Promise<Profile> {
    if (!validToken(token) || PERSISTENCE_DISABLED) return emptyProfile();
    const data = await rpc('senja_get_profile', { p_token: token });
    seenTokens.add(token);
    return asProfile(data);
  }

  async merge(token: string, patch: Partial<Profile>): Promise<Profile> {
    if (!validToken(token) || PERSISTENCE_DISABLED) return emptyProfile();
    const data = await rpc('senja_merge_profile', {
      p_token: token,
      p_patch: sanitizePatch(patch),
    });
    seenTokens.add(token);
    return asProfile(data);
  }

  /** Kept as a compatibility seam for the previous file-backed store. */
  async flush(): Promise<void> {
    // Supabase writes are committed by merge(); there is no local buffer.
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

function num(v: unknown): number {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : 0;
}

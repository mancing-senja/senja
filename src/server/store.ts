/** Player profiles, kept on the server.
 *
 *  Everything a player had used to live in localStorage, which means it was
 *  never really theirs: it belonged to one browser on one machine. Clear the
 *  site data and a month of fishing is gone; open the game on a laptop and
 *  you are a stranger with no coins.
 *
 *  **There are no accounts and no passwords here, on purpose.** The client
 *  mints a random token on first run and sends it on connect; the server
 *  keys a profile off it. That gives progress that survives a cache clear
 *  and follows you to another device if you carry the token across, without
 *  this project storing a single credential. Rushing a password system into
 *  a game is how you end up leaking one, and a fishing game does not need
 *  to know who anybody is.
 *
 *  The store is a JSON file written atomically. That is honestly sized for
 *  what this is — a small cozy game with friends in a room. It holds
 *  everything in memory and rewrites the file on a timer, which is fine for
 *  hundreds of players and would be the wrong shape for thousands. When
 *  that day comes the interface below is the seam to swap. */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Everything worth carrying between sessions. Deliberately small: the
 *  world itself is regenerated from a seed, so only the player's own record
 *  has to travel. */
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

const DATA = process.env.SENJA_DATA ?? join(process.cwd(), 'data', 'players.json');
/** How often the file is rewritten, at most. Saving on every catch would
 *  hammer the disk for no benefit; a lost minute is an acceptable trade for
 *  a game where the interesting state is the journal. */
const FLUSH_MS = 20_000;

function emptyProfile(): Profile {
  return {
    name: '', look: 0, coins: 0, caught: 0, day: 0,
    log: {}, lore: [], seen: Date.now(),
  };
}

/** Tokens are opaque to us, but they arrive over the wire, so they are
 *  checked before being used as an object key. */
export function validToken(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t);
}

export class Store {
  private data = new Map<string, Profile>();
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private file = DATA) {
    this.load();
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
    // Never hold the process open just to run the save timer.
    this.timer.unref?.();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.file, 'utf8');
      const obj = JSON.parse(raw) as Record<string, Profile>;
      for (const [k, v] of Object.entries(obj)) {
        if (validToken(k) && v && typeof v === 'object') this.data.set(k, v);
      }
      console.log(`[senja] ${this.data.size} profil dimuat dari ${this.file}`);
    } catch {
      // No file yet, or an unreadable one. Starting empty is correct for
      // both — this must never stop the server coming up.
      console.log(`[senja] belum ada data pemain di ${this.file}, mulai kosong`);
    }
  }

  get(token: string): Profile {
    let p = this.data.get(token);
    if (!p) {
      p = emptyProfile();
      this.data.set(token, p);
      this.dirty = true;
    }
    p.seen = Date.now();
    return p;
  }

  /** Merges a client's report into the stored profile.
   *
   *  Counters only ever move forward. The client is not trusted to be
   *  authoritative — a stale tab or an out-of-order message must not be
   *  able to roll somebody's journal backwards. */
  merge(token: string, patch: Partial<Profile>): Profile {
    const p = this.get(token);
    if (typeof patch.name === 'string') p.name = patch.name.slice(0, 24);
    if (Number.isFinite(patch.look)) p.look = Math.max(0, Math.min(63, patch.look as number));
    if (Number.isFinite(patch.coins)) p.coins = Math.max(p.coins, patch.coins as number);
    if (Number.isFinite(patch.caught)) p.caught = Math.max(p.caught, patch.caught as number);
    if (Number.isFinite(patch.day)) p.day = Math.max(p.day, patch.day as number);

    if (patch.log && typeof patch.log === 'object') {
      for (const [id, e] of Object.entries(patch.log)) {
        if (!/^[a-z_]{1,32}$/.test(id) || !e || typeof e !== 'object') continue;
        const cur = p.log[id] ?? { count: 0, best: 0, bestGrade: 0 };
        p.log[id] = {
          count: Math.max(cur.count, num(e.count)),
          best: Math.max(cur.best, num(e.best)),
          bestGrade: Math.max(cur.bestGrade, num(e.bestGrade)),
        };
      }
    }
    if (Array.isArray(patch.lore)) {
      const set = new Set(p.lore);
      for (const id of patch.lore) {
        if (typeof id === 'string' && /^[a-z0-9_-]{1,32}$/.test(id)) set.add(id);
      }
      p.lore = [...set].slice(0, 256);
    }

    this.dirty = true;
    return p;
  }

  /** Atomic: write a sibling file, then rename over the real one. A crash
   *  mid-write leaves the previous save intact instead of a truncated one. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const obj: Record<string, Profile> = {};
      for (const [k, v] of this.data) obj[k] = v;
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(obj), 'utf8');
      renameSync(tmp, this.file);
    } catch (err) {
      // Keep the dirty flag set so the next tick tries again.
      this.dirty = true;
      console.warn('[senja] gagal simpan profil:', err);
    }
  }

  get size(): number {
    return this.data.size;
  }
}

function num(v: unknown): number {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : 0;
}

type Register = 'cozy' | 'medieval' | 'cyber' | 'fantasy';
type Phase = 'pagi' | 'siang' | 'senja' | 'malam';

export interface ThoughtActorSnapshot {
  id: string;
  name: string;
  register: Register;
  phase: Phase;
  rainAdjusted: boolean;
  activity: string;
  goal: string;
  destination: string;
  x: number;
  y: number;
}

interface ActiveThought {
  text: string;
  until: number;
}

const CACHE_KEY = 'senja.npcThoughts.ai.v1';
const NEAR_RADIUS = 132;
const HOLD_MS = 6200;
const MIN_REQUEST_GAP_MS = 1200;
const CACHE_LIMIT = 96;

let playerX = Number.NaN;
let playerY = Number.NaN;
let inFlight = false;
let nextRequestAt = 0;
const shown = new Set<string>();
const failed = new Set<string>();
const active = new Map<string, ActiveThought>();
let cache = loadCache();

/** Called by the actor renderer. Rendering is a useful lazy boundary: an NPC
 * that is neither on screen nor near the player cannot spend an Agnes call. */
export function observeThoughtPlayer(x: number, y: number): void {
  playerX = x;
  playerY = y;
}

/** The renderer already observes the local actor every frame for lazy AI.
 * Reuse that neutral position snapshot for the hand-drawn world map instead
 * of threading player coordinates through every HUD call site. */
export function observedPlayerPosition(): { x: number; y: number } | null {
  if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) return null;
  return { x: playerX, y: playerY };
}

export function observeThoughtNpc(npc: ThoughtActorSnapshot): void {
  // Vite's local preview/dev server does not host Vercel Functions. Skipping
  // provider calls there keeps CI/smoke tests offline and avoids a fake 404.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) return;
  if (Math.hypot(npc.x - playerX, npc.y - playerY) > NEAR_RADIUS) return;

  const key = thoughtKey(npc);
  if (shown.has(key) || failed.has(key)) return;

  const cached = cache[key];
  if (cached) {
    shown.add(key);
    active.set(npc.id, { text: cached, until: performance.now() + HOLD_MS });
    return;
  }

  const now = performance.now();
  if (inFlight || now < nextRequestAt) return;
  inFlight = true;
  shown.add(key);
  nextRequestAt = now + MIN_REQUEST_GAP_MS;
  void requestThought(npc, key).finally(() => {
    inFlight = false;
    nextRequestAt = Math.max(nextRequestAt, performance.now() + MIN_REQUEST_GAP_MS);
  });
}

export function aiThoughtFor(id: string): { text: string; seconds: number } | null {
  const item = active.get(id);
  if (!item) return null;
  const left = item.until - performance.now();
  if (left <= 0) {
    active.delete(id);
    return null;
  }
  return { text: item.text, seconds: left / 1000 };
}

async function requestThought(npc: ThoughtActorSnapshot, key: string): Promise<void> {
  const day = Math.max(0, Number(localStorage.getItem('senja.day') ?? 0) || 0);
  try {
    const response = await fetch('/api/npc-thought', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: npc.id,
        name: npc.name,
        register: npc.register,
        day,
        phase: npc.phase,
        rain: npc.rainAdjusted ? 0.6 : 0,
        activity: npc.activity,
        goal: npc.goal,
        destination: npc.destination,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`npc-thought ${response.status}`);
    const body = await response.json() as { thought?: unknown };
    const text = clean(body.thought);
    if (!text) throw new Error('npc-thought kosong');

    cache[key] = text;
    trimCache();
    saveCache();
    active.set(npc.id, { text, until: performance.now() + HOLD_MS });
  } catch (err) {
    // Background thoughts are never retried in this session. The NPC's
    // deterministic intent bubble remains the fallback and costs no quota.
    failed.add(key);
    console.warn('[senja] AI thought fallback:', err);
  }
}

function thoughtKey(npc: ThoughtActorSnapshot): string {
  const day = Math.max(0, Number(localStorage.getItem('senja.day') ?? 0) || 0);
  return [npc.id, day, npc.phase, npc.rainAdjusted ? 'rain' : 'dry', stableHash(npc.goal)].join(':');
}

function loadCache(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const text = clean(value);
      if (text) out[key.slice(0, 180)] = text;
    }
    return out;
  } catch { return {}; }
}

function saveCache(): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* cache is optional */ }
}

function trimCache(): void {
  const entries = Object.entries(cache);
  if (entries.length <= CACHE_LIMIT) return;
  cache = Object.fromEntries(entries.slice(entries.length - CACHE_LIMIT));
}

function clean(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    : '';
}

function stableHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

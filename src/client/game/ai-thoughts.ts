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

interface QueuedThought {
  id: string;
  key: string;
  text: string;
}

interface ActiveThought {
  id: string;
  text: string;
  until: number;
}

const CACHE_KEY = 'senja.npcThoughts.ai.v1';
const NEAR_RADIUS = 132;
// One crowd thought at a time: long enough to read, then a small quiet beat.
const HOLD_MS = 4000;
const BETWEEN_THOUGHTS_MS = 800;
const MIN_REQUEST_GAP_MS = 1200;
// Keep at most one thought visible and one waiting. This avoids spending a
// burst of provider calls on a crowd the player may immediately walk past.
const MAX_READY_THOUGHTS = 2;
const OBSERVED_GRACE_MS = 900;
const CACHE_LIMIT = 96;

let playerX = Number.NaN;
let playerY = Number.NaN;
let inFlight = false;
let nextRequestAt = 0;
let nextRevealAt = 0;
let current: ActiveThought | null = null;
const queue: QueuedThought[] = [];
const shown = new Set<string>();
const failed = new Set<string>();
const lastObservedAt = new Map<string, number>();
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

  const now = performance.now();
  lastObservedAt.set(npc.id, now);
  pumpQueue(now);

  const key = thoughtKey(npc);
  if (shown.has(key)) return;

  // A failed provider call may still get one deterministic turn through the
  // same crowd queue. It is not allowed to bypass the queue or retry Agnes.
  if (failed.has(key)) {
    if (!hasReadySlot()) return;
    shown.add(key);
    enqueueThought(npc.id, key, fallbackThought(npc));
    return;
  }

  const cached = cache[key];
  if (cached) {
    if (!hasReadySlot()) return;
    shown.add(key);
    enqueueThought(npc.id, key, cached);
    return;
  }

  // Do not pre-generate a whole crowd. At most one thought is on screen and
  // one is prepared behind it; the rest become eligible as the queue drains.
  if (!hasReadySlot() || inFlight || now < nextRequestAt) return;
  inFlight = true;
  shown.add(key);
  nextRequestAt = now + MIN_REQUEST_GAP_MS;
  void requestThought(npc, key).finally(() => {
    inFlight = false;
    nextRequestAt = Math.max(nextRequestAt, performance.now() + MIN_REQUEST_GAP_MS);
  });
}

export function aiThoughtFor(id: string): { text: string; seconds: number } | null {
  const now = performance.now();
  pumpQueue(now);
  if (!current || current.id !== id) return null;
  const left = current.until - now;
  if (left <= 0) return null;
  return { text: current.text, seconds: left / 1000 };
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
    enqueueThought(npc.id, key, text);
  } catch (err) {
    // Background thoughts are never retried in this session. The local
    // deterministic intent enters the exact same staggered queue instead.
    failed.add(key);
    enqueueThought(npc.id, key, fallbackThought(npc));
    console.warn('[senja] AI thought fallback:', err);
  }
}

function enqueueThought(id: string, key: string, text: string): void {
  const cleaned = clean(text);
  if (!cleaned) return;
  if (current?.id === id && current.text === cleaned) return;
  if (queue.some((item) => item.key === key)) return;
  queue.push({ id, key, text: cleaned });
  pumpQueue(performance.now());
}

function pumpQueue(now: number): void {
  if (current) {
    const seen = lastObservedAt.get(current.id) ?? 0;
    if (now < current.until && now - seen <= OBSERVED_GRACE_MS) return;
    current = null;
    nextRevealAt = Math.max(nextRevealAt, now + BETWEEN_THOUGHTS_MS);
  }

  if (now < nextRevealAt) return;
  while (queue.length) {
    const item = queue.shift()!;
    const seen = lastObservedAt.get(item.id) ?? 0;
    if (now - seen > OBSERVED_GRACE_MS) {
      // Walking past a crowd should not leave a backlog speaking off-screen.
      // Cached thoughts can become eligible again if the player comes back.
      shown.delete(item.key);
      continue;
    }
    current = { id: item.id, text: item.text, until: now + HOLD_MS };
    return;
  }
}

function hasReadySlot(): boolean {
  return queue.length + (current ? 1 : 0) < MAX_READY_THOUGHTS;
}

function fallbackThought(npc: ThoughtActorSnapshot): string {
  if (npc.rainAdjusted) return `Hujan begini... ${npc.goal}.`;
  if (npc.activity.toLowerCase().includes('mancing')) return 'Kayaknya enak mancing sebentar.';
  return `Hmm... aku mau ${npc.goal}.`;
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

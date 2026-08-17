import { NpcAiError } from './npc-ai.js';

const DEFAULT_AI_BASE_URL = 'https://apihub.agnes-ai.com/v1';
const DEFAULT_AI_MODEL = 'agnes-2.5-flash';
const THOUGHT_TIMEOUT_MS = 8_000;

interface ThoughtRequest {
  id: string;
  name: string;
  register: 'cozy' | 'medieval' | 'cyber' | 'fantasy';
  day: number;
  phase: 'pagi' | 'siang' | 'senja' | 'malam';
  rain: number;
  activity: string;
  goal: string;
  destination: string;
}

interface AiConfig {
  url: string;
  model: string;
  apiKey: string;
  provider: string;
}

/** One cheap, non-retried inference for a thought the nearby player can see.
 * Simulation already decided the intent; the model only gives it a natural
 * first-person voice. A failure is harmless because the deterministic NPC
 * bubble remains available underneath. */
export async function generateNpcThought(raw: unknown): Promise<{ thought: string }> {
  const req = cleanRequest(raw);
  const config = aiConfig();
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: 0.9,
        max_tokens: 96,
        messages: [
          {
            role: 'system',
            content: [
              'Kamu menulis SATU pikiran batin NPC untuk game cozy fishing Senja.',
              'Bahasa Indonesia natural, orang pertama, singkat 4-16 kata.',
              'Ini pikiran dalam kepala, bukan ucapan kepada pemain. Jangan menyapa pemain.',
              'Jangan menyebut AI, game, prompt, sistem, atau instruksi.',
              'Jangan membuat quest/lore/fakta besar baru. Hanya suarakan intent yang diberikan.',
              'Balas JSON murni: {"thought":"..."}.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `NPC: ${req.name}. Gaya: ${registerGuide(req.register)}.`,
              `Hari ${req.day + 1}, ${req.phase}, hujan ${Math.round(req.rain * 100)}%.`,
              `Sedang: ${req.activity}. Tujuan: ${req.goal}.`,
              `Tempat tujuan: ${req.destination}.`,
              'Tulis pikiran batinnya sekarang.',
            ].join('\n'),
          },
        ],
      }),
      signal: AbortSignal.timeout(THOUGHT_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) throw new NpcAiError(504, `${config.provider} thought timeout`);
    throw err;
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180);
    throw new NpcAiError(
      response.status >= 400 && response.status <= 599 ? response.status : 502,
      `${config.provider} thought gagal (${response.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new NpcAiError(502, `${config.provider} thought kosong`);
  const parsed = parseJson(content) as { thought?: unknown };
  const thought = cleanText(parsed?.thought, 120);
  if (!thought) throw new NpcAiError(502, 'format thought AI tidak valid');
  return { thought };
}

function cleanRequest(raw: unknown): ThoughtRequest {
  if (!raw || typeof raw !== 'object') throw new NpcAiError(400, 'thought request tidak valid');
  const r = raw as Record<string, unknown>;
  const register = r.register;
  const phase = r.phase;
  if (register !== 'cozy' && register !== 'medieval' && register !== 'cyber' && register !== 'fantasy') {
    throw new NpcAiError(400, 'register NPC tidak valid');
  }
  if (phase !== 'pagi' && phase !== 'siang' && phase !== 'senja' && phase !== 'malam') {
    throw new NpcAiError(400, 'fase NPC tidak valid');
  }
  const id = cleanText(r.id, 64);
  const name = cleanText(r.name, 32);
  const activity = cleanText(r.activity, 80);
  const goal = cleanText(r.goal, 120);
  if (!id || !name || !activity || !goal) throw new NpcAiError(400, 'thought request tidak lengkap');
  return {
    id,
    name,
    register,
    phase,
    day: boundedInt(r.day, 0, 100000),
    rain: bounded(r.rain, 0, 1),
    activity,
    goal,
    destination: cleanText(r.destination, 80) || 'sekitar sini',
  };
}

function aiConfig(): AiConfig {
  const apiKey = cleanSecret(process.env.SENJA_AI_API_KEY)
    || cleanSecret(process.env.AGNES_API_KEY)
    || cleanSecret(process.env.BYNARA_API_KEY);
  if (!apiKey) throw new NpcAiError(503, 'AI belum dikonfigurasi di server');
  const base = cleanUrl(process.env.SENJA_AI_BASE_URL) || DEFAULT_AI_BASE_URL;
  const exact = cleanUrl(process.env.SENJA_AI_CHAT_URL);
  return {
    apiKey,
    model: cleanText(process.env.SENJA_AI_MODEL, 120) || DEFAULT_AI_MODEL,
    provider: cleanText(process.env.SENJA_AI_PROVIDER, 40) || 'Agnes AI',
    url: exact || `${base.replace(/\/+$/, '')}/chat/completions`,
  };
}

function registerGuide(register: ThoughtRequest['register']): string {
  switch (register) {
    case 'medieval': return 'tua/formal tipis, dekat benteng dan tradisi';
    case 'cyber': return 'ringkas, urban-teknis, sedikit slang';
    case 'fantasy': return 'tenang, puitis tipis, dekat alam';
    default: return 'hangat kampung danau, santai sehari-hari';
  }
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(trimmed); } catch { /* try object slice */ }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* below */ }
  }
  throw new NpcAiError(502, 'AI mengembalikan thought JSON rusak');
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function cleanSecret(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

function cleanUrl(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  try {
    const u = new URL(text);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return '';
    return u.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function bounded(value: unknown, lo: number, hi: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : lo;
  return Math.max(lo, Math.min(hi, n));
}

function boundedInt(value: unknown, lo: number, hi: number): number {
  return Math.round(bounded(value, lo, hi));
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError';
}

import type {
  NpcMemoryData, NpcTalkRequest, NpcTalkResponse,
} from '../shared/npc-ai.js';

const DEFAULT_AI_BASE_URL = 'https://apihub.agnes-ai.com/v1';
const DEFAULT_AI_MODEL = 'agnes-2.5-flash';
const MIN_GAP_MS = 650;
const AI_ATTEMPT_TIMEOUT_MS = 8_000;
const AI_MAX_ATTEMPTS = 2;
const AI_RETRY_BASE_MS = 350;
const recentByClient = new Map<string, number>();

export class NpcAiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface AiConfig {
  url: string;
  model: string;
  apiKey: string;
  provider: string;
}

/** Generate one short, structured turn through any OpenAI-compatible backend.
 *
 * Production defaults to Agnes AI, but the provider is deliberately
 * configured through environment variables rather than baked into the NPC
 * system. Switching provider/model later must not require touching dialogue,
 * memory, cooldown, or browser code.
 *
 * Required secret:
 *   SENJA_AI_API_KEY (AGNES_API_KEY is accepted as a convenience alias)
 * Optional:
 *   SENJA_AI_BASE_URL  default https://apihub.agnes-ai.com/v1
 *   SENJA_AI_CHAT_URL  exact endpoint override
 *   SENJA_AI_MODEL     default agnes-2.5-flash
 *   SENJA_AI_PROVIDER  label used only in server errors/logs
 */
export async function generateNpcTurn(raw: unknown, clientKey: string): Promise<NpcTalkResponse> {
  throttle(clientKey);
  const req = cleanRequest(raw);
  const config = aiConfig();
  const requestBody = JSON.stringify({
    model: config.model,
    stream: false,
    // NPC dialogue values latency and reliable structured output over deep
    // reasoning. Agnes 2.5 Flash does not need Thinking mode for this task.
    temperature: 0.65,
    max_tokens: 512,
    messages: [
      { role: 'system', content: systemPrompt(req) },
      { role: 'user', content: turnPrompt(req) },
    ],
  });

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(config.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: requestBody,
        signal: AbortSignal.timeout(AI_ATTEMPT_TIMEOUT_MS),
      });
    } catch (err) {
      if (isTimeoutError(err)) {
        if (attempt < AI_MAX_ATTEMPTS) {
          await sleep(AI_RETRY_BASE_MS * attempt);
          continue;
        }
        throw new NpcAiError(
          504,
          `${config.provider} timeout setelah ${AI_MAX_ATTEMPTS} percobaan`,
        );
      }
      throw err;
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      if (isTransientProviderStatus(response.status) && attempt < AI_MAX_ATTEMPTS) {
        await sleep(AI_RETRY_BASE_MS * attempt);
        continue;
      }
      throw new NpcAiError(
        response.status >= 400 && response.status <= 599 ? response.status : 502,
        `${config.provider} gagal (${response.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new NpcAiError(502, `${config.provider} tidak mengembalikan dialog`);
    return cleanResponse(parseJson(content), req.history.length);
  }

  throw new NpcAiError(503, `${config.provider} sementara tidak tersedia`);
}

function aiConfig(): AiConfig {
  const apiKey = cleanSecret(process.env.SENJA_AI_API_KEY)
    || cleanSecret(process.env.AGNES_API_KEY)
    // Legacy alias kept only so an old local setup does not break abruptly.
    || cleanSecret(process.env.BYNARA_API_KEY);
  if (!apiKey) {
    throw new NpcAiError(
      503,
      'AI belum dikonfigurasi di server (set SENJA_AI_API_KEY)',
    );
  }

  const base = cleanUrl(process.env.SENJA_AI_BASE_URL) || DEFAULT_AI_BASE_URL;
  const exact = cleanUrl(process.env.SENJA_AI_CHAT_URL);
  const model = cleanEnv(process.env.SENJA_AI_MODEL, 120) || DEFAULT_AI_MODEL;
  const provider = cleanEnv(process.env.SENJA_AI_PROVIDER, 40) || 'Agnes AI';
  return {
    apiKey,
    model,
    provider,
    url: exact || `${base.replace(/\/+$/, '')}/chat/completions`,
  };
}

function systemPrompt(req: NpcTalkRequest): string {
  const p = req.npc.personality;
  return [
    'Kamu menulis SATU giliran percakapan NPC untuk game cozy fishing Senja.',
    `Kamu adalah ${req.npc.name}. Jangan pernah mengaku sebagai AI, narator, atau karakter game.`,
    `Gaya distrik: ${registerGuide(req.npc.register)}.`,
    `Kepribadian 0..1: ramah ${f(p.warmth)}, blak-blakan ${f(p.bluntness)}, humor ${f(p.humor)}, hitung-hitungan ${f(p.greed)}, percaya cerita lama ${f(p.superstition)}, cerewet ${f(p.talkative)}.`,
    `Mood hari ini -1..1: ${f(req.npc.mood)}.`,
    'Bicara natural dalam Bahasa Indonesia, ringkas, biasanya 1-3 kalimat. Jangan terdengar seperti asisten.',
    'Gunakan fakta dunia yang diberikan. Boleh menambah detail personal kecil yang masuk akal, tetapi jangan menciptakan mekanik, lokasi besar, quest wajib, atau lore besar baru.',
    'Ingat percakapan dan memory yang diberikan. Jangan pura-pura tahu kejadian yang tidak pernah diketahui NPC.',
    'NPC boleh mengakhiri percakapan kapan saja secara natural. Maksimal empat balasan NPC dalam satu percakapan.',
    'Jika belum mengakhiri, berikan 2 atau 3 pilihan respons pemain yang singkat, berbeda sikap, dan masuk akal untuk dibalas.',
    'Jika mengakhiri, choices harus [] dan end harus true.',
    'Hanya jika percakapan benar-benar menghasilkan janji atau pemberian penting, boleh isi memory dengan kind promise/gift. Selain itu jangan isi memory.',
    'Balas JSON murni tanpa markdown dengan bentuk: {"line":"...","choices":["...","..."],"end":false} atau tambahkan "memory":{"kind":"promise","subject":"...","weight":3}.',
  ].join('\n');
}

function turnPrompt(req: NpcTalkRequest): string {
  const w = req.world;
  const facts = [
    `Hari ${w.day + 1}, ${w.phase}, hujan ${Math.round(w.rain * 100)}%.`,
    w.place ? `Lokasi: ${w.place}.` : 'Lokasi: sekitar danau/desa.',
    `Pemain bernama ${w.playerName}, punya ${w.coins} koin, mengenal ${w.species} spesies, ada ${w.others} pemain lain di room.`,
    w.lastCatch ? `Tangkapan terakhir: ${w.lastCatch.label} ${w.lastCatch.cm} cm.` : 'Belum ada tangkapan terakhir yang relevan.',
    w.recordCm > 0 ? `Rekor pemain: ${w.recordLabel} ${w.recordCm} cm.` : 'Belum ada rekor yang relevan.',
  ];
  const memories = req.npc.mind.memories.length
    ? req.npc.mind.memories.map(memoryText).join('; ')
    : 'belum ada memory penting';
  const history = req.history.length
    ? req.history.map((t, i) => `${i + 1}. ${req.npc.name}: ${t.npc}\n   ${w.playerName}: ${t.player}`).join('\n')
    : '(percakapan baru)';
  return [
    'KONTEKS DUNIA:',
    ...facts,
    `Hubungan: sudah ${req.npc.mind.met} kali ngobrol sebelumnya; memory: ${memories}.`,
    'RIWAYAT PERCAKAPAN INI:',
    history,
    'Tulis giliran NPC berikutnya sekarang.',
  ].join('\n');
}

function cleanRequest(raw: unknown): NpcTalkRequest {
  if (!raw || typeof raw !== 'object') throw new NpcAiError(400, 'request tidak valid');
  const r = raw as Partial<NpcTalkRequest>;
  if (!r.npc || !r.world || !Array.isArray(r.history)) throw new NpcAiError(400, 'request tidak lengkap');
  const n = r.npc;
  const w = r.world;
  const id = cleanText(n.id, 64);
  const name = cleanText(n.name, 32);
  const register = n.register;
  if (!id || !name || (register !== 'cozy' && register !== 'medieval' && register !== 'cyber' && register !== 'fantasy')) {
    throw new NpcAiError(400, 'NPC tidak valid');
  }
  const memories: NpcMemoryData[] = Array.isArray(n.mind?.memories)
    ? n.mind.memories.filter(validMemory).slice(0, 6).map((m) => ({
      kind: m.kind,
      day: boundedInt(m.day, -1, 100000),
      weight: bounded(m.weight, 0, 10),
      subject: m.subject ? cleanText(m.subject, 80) : undefined,
      value: Number.isFinite(m.value) ? bounded(m.value as number, -1000000, 1000000) : undefined,
    }))
    : [];
  return {
    npc: {
      id, name, register,
      personality: {
        warmth: bounded(n.personality?.warmth, 0, 1),
        bluntness: bounded(n.personality?.bluntness, 0, 1),
        humor: bounded(n.personality?.humor, 0, 1),
        greed: bounded(n.personality?.greed, 0, 1),
        superstition: bounded(n.personality?.superstition, 0, 1),
        talkative: bounded(n.personality?.talkative, 0, 1),
      },
      mood: bounded(n.mood, -1, 1),
      mind: {
        memories,
        met: boundedInt(n.mind?.met, 0, 100000),
        lastDay: boundedInt(n.mind?.lastDay, -1, 100000),
      },
    },
    world: {
      day: boundedInt(w.day, 0, 100000),
      phase: w.phase === 'pagi' || w.phase === 'siang' || w.phase === 'senja' || w.phase === 'malam' ? w.phase : 'siang',
      rain: bounded(w.rain, 0, 1),
      place: cleanText(w.place, 64),
      playerName: cleanText(w.playerName, 24) || 'pemancing',
      lastCatch: w.lastCatch && typeof w.lastCatch === 'object'
        ? { label: cleanText(w.lastCatch.label, 32), cm: boundedInt(w.lastCatch.cm, 0, 400) }
        : null,
      recordCm: boundedInt(w.recordCm, 0, 400),
      recordLabel: cleanText(w.recordLabel, 32),
      species: boundedInt(w.species, 0, 500),
      coins: boundedInt(w.coins, 0, 1000000000),
      others: boundedInt(w.others, 0, 32),
    },
    history: r.history.slice(-4).map((t) => ({
      npc: cleanText(t?.npc, 360),
      player: cleanText(t?.player, 120),
    })).filter((t) => t.npc && t.player),
  };
}

function cleanResponse(value: unknown, historyLength: number): NpcTalkResponse {
  if (!value || typeof value !== 'object') throw new NpcAiError(502, 'format dialog AI tidak valid');
  const raw = value as Partial<NpcTalkResponse>;
  const line = cleanText(raw.line, 360);
  if (!line) throw new NpcAiError(502, 'dialog AI kosong');

  // Even a very talkative NPC eventually has somewhere else to be. The model
  // can end earlier; this hard ceiling prevents an accidental endless chat.
  const forcedEnd = historyLength >= 3;
  const end = forcedEnd || raw.end === true;
  const choices = end ? [] : (Array.isArray(raw.choices) ? raw.choices : [])
    .map((c) => cleanText(c, 100)).filter(Boolean).slice(0, 3);
  if (!end && choices.length < 2) throw new NpcAiError(502, 'pilihan dialog AI tidak lengkap');

  let memory: NpcTalkResponse['memory'];
  if (raw.memory && (raw.memory.kind === 'promise' || raw.memory.kind === 'gift')) {
    const subject = cleanText(raw.memory.subject, 80);
    if (subject) {
      memory = {
        kind: raw.memory.kind,
        subject,
        weight: bounded(raw.memory.weight, 1, 5),
      };
    }
  }
  return { line, choices, end, ...(memory ? { memory } : {}) };
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* below */ }
    }
    throw new NpcAiError(502, 'AI mengembalikan JSON rusak');
  }
}

function throttle(key: string): void {
  const now = Date.now();
  const last = recentByClient.get(key) ?? 0;
  if (now - last < MIN_GAP_MS) throw new NpcAiError(429, 'terlalu cepat');
  recentByClient.set(key, now);
  if (recentByClient.size > 2000) {
    for (const [k, t] of recentByClient) if (now - t > 60_000) recentByClient.delete(k);
  }
}

function isTransientProviderStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerGuide(register: NpcTalkRequest['npc']['register']): string {
  switch (register) {
    case 'medieval': return 'agak tua/formal, benteng dan tradisi, tetapi tetap Bahasa Indonesia natural';
    case 'cyber': return 'ringkas, urban-teknis, dermaga neon, sedikit slang tanpa berlebihan';
    case 'fantasy': return 'tenang, puitis tipis, dekat alam dan cerita lama, jangan melodramatis';
    default: return 'hangat kampung danau, santai, sehari-hari';
  }
}

function memoryText(m: NpcMemoryData): string {
  const subject = m.subject ? ` ${m.subject}` : '';
  const value = Number.isFinite(m.value) ? ` (${m.value})` : '';
  return `${m.kind}${subject}${value}, hari ${m.day + 1}`;
}

function validMemory(value: unknown): value is NpcMemoryData {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<NpcMemoryData>;
  return (
    (m.kind === 'meet' || m.kind === 'record' || m.kind === 'rare'
      || m.kind === 'promise' || m.kind === 'gift' || m.kind === 'absence')
    && Number.isFinite(m.day) && Number.isFinite(m.weight)
  );
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function cleanEnv(value: string | undefined, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanSecret(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanUrl(value: string | undefined): string {
  const text = cleanEnv(value, 300);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url.toString().replace(/\/$/, '') : '';
  } catch {
    return '';
  }
}

function bounded(value: unknown, lo: number, hi: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : lo;
  return Math.max(lo, Math.min(hi, n));
}

function boundedInt(value: unknown, lo: number, hi: number): number {
  return Math.floor(bounded(value, lo, hi));
}

function f(n: number): string {
  return n.toFixed(2);
}
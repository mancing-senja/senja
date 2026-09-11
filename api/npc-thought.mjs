// src/server/npc-ai.ts
var NpcAiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};

// src/server/npc-thought.ts
var DEFAULT_AI_BASE_URL = "https://apihub.agnes-ai.com/v1";
var DEFAULT_AI_MODEL = "agnes-2.5-flash";
var THOUGHT_TIMEOUT_MS = 8e3;
async function generateNpcThought(raw) {
  const req = cleanRequest(raw);
  const config = aiConfig();
  let response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: 0.9,
        max_tokens: 96,
        messages: [
          {
            role: "system",
            content: [
              "Kamu menulis SATU pikiran batin NPC untuk game cozy fishing Senja.",
              "Bahasa Indonesia natural, orang pertama, singkat 4-16 kata.",
              "Ini pikiran dalam kepala, bukan ucapan kepada pemain. Jangan menyapa pemain.",
              "Jangan menyebut AI, game, prompt, sistem, atau instruksi.",
              "Jangan membuat quest/lore/fakta besar baru. Hanya suarakan intent yang diberikan.",
              'Balas JSON murni: {"thought":"..."}.'
            ].join("\n")
          },
          {
            role: "user",
            content: [
              `NPC: ${req.name}. Gaya: ${registerGuide(req.register)}.`,
              `Hari ${req.day + 1}, ${req.phase}, hujan ${Math.round(req.rain * 100)}%.`,
              `Sedang: ${req.activity}. Tujuan: ${req.goal}.`,
              `Tempat tujuan: ${req.destination}.`,
              "Tulis pikiran batinnya sekarang."
            ].join("\n")
          }
        ]
      }),
      signal: AbortSignal.timeout(THOUGHT_TIMEOUT_MS)
    });
  } catch (err) {
    if (isTimeoutError(err)) throw new NpcAiError(504, `${config.provider} thought timeout`);
    throw err;
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180);
    throw new NpcAiError(
      response.status >= 400 && response.status <= 599 ? response.status : 502,
      `${config.provider} thought gagal (${response.status})${detail ? `: ${detail}` : ""}`
    );
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new NpcAiError(502, `${config.provider} thought kosong`);
  const parsed = parseJson(content);
  const thought = cleanText(parsed?.thought, 120);
  if (!thought) throw new NpcAiError(502, "format thought AI tidak valid");
  return { thought };
}
function cleanRequest(raw) {
  if (!raw || typeof raw !== "object") throw new NpcAiError(400, "thought request tidak valid");
  const r = raw;
  const register = r.register;
  const phase = r.phase;
  if (register !== "cozy" && register !== "medieval" && register !== "cyber" && register !== "fantasy") {
    throw new NpcAiError(400, "register NPC tidak valid");
  }
  if (phase !== "pagi" && phase !== "siang" && phase !== "senja" && phase !== "malam") {
    throw new NpcAiError(400, "fase NPC tidak valid");
  }
  const id = cleanText(r.id, 64);
  const name = cleanText(r.name, 32);
  const activity = cleanText(r.activity, 80);
  const goal = cleanText(r.goal, 120);
  if (!id || !name || !activity || !goal) throw new NpcAiError(400, "thought request tidak lengkap");
  return {
    id,
    name,
    register,
    phase,
    day: boundedInt(r.day, 0, 1e5),
    rain: bounded(r.rain, 0, 1),
    activity,
    goal,
    destination: cleanText(r.destination, 80) || "sekitar sini"
  };
}
function aiConfig() {
  const apiKey = cleanSecret(process.env.SENJA_AI_API_KEY) || cleanSecret(process.env.AGNES_API_KEY) || cleanSecret(process.env.BYNARA_API_KEY);
  if (!apiKey) throw new NpcAiError(503, "AI belum dikonfigurasi di server");
  const base = cleanUrl(process.env.SENJA_AI_BASE_URL) || DEFAULT_AI_BASE_URL;
  const exact = cleanUrl(process.env.SENJA_AI_CHAT_URL);
  return {
    apiKey,
    model: cleanText(process.env.SENJA_AI_MODEL, 120) || DEFAULT_AI_MODEL,
    provider: cleanText(process.env.SENJA_AI_PROVIDER, 40) || "Agnes AI",
    url: exact || `${base.replace(/\/+$/, "")}/chat/completions`
  };
}
function registerGuide(register) {
  switch (register) {
    case "medieval":
      return "tua/formal tipis, dekat benteng dan tradisi";
    case "cyber":
      return "ringkas, urban-teknis, sedikit slang";
    case "fantasy":
      return "tenang, puitis tipis, dekat alam";
    default:
      return "hangat kampung danau, santai sehari-hari";
  }
}
function parseJson(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
    }
  }
  throw new NpcAiError(502, "AI mengembalikan thought JSON rusak");
}
function cleanText(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function cleanSecret(value) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}
function cleanUrl(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    const u = new URL(text);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}
function bounded(value, lo, hi) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : lo;
  return Math.max(lo, Math.min(hi, n));
}
function boundedInt(value, lo, hi) {
  return Math.round(bounded(value, lo, hi));
}
function isTimeoutError(err) {
  return err instanceof DOMException && err.name === "TimeoutError";
}

// api/npc-thought.ts
var MAX_BODY = 8 * 1024;
async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("allow", "POST");
    res.end("POST only");
    return;
  }
  try {
    const body = await readJson(req);
    const thought = await generateNpcThought(body);
    sendJson(res, 200, thought);
  } catch (err) {
    const status = err instanceof NpcAiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "NPC thought AI gagal";
    if (status >= 500) console.warn("[senja] npc-thought:", err);
    sendJson(res, status, { error: message });
  }
}
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const raw of req) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > MAX_BODY) throw new NpcAiError(413, "thought request terlalu besar");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new NpcAiError(400, "JSON thought tidak valid");
  }
}
function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
}
export {
  handler as default
};

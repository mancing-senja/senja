/** Villager minds.
 *
 *  The problem with a list of three lines per NPC is not that it is short —
 *  it is that it is *fixed*. The same words in the same order tell you the
 *  person behind them is a lookup table.
 *
 *  So nobody here has a script. Each villager has a personality (six axes),
 *  a mood that drifts from day to day, and a small memory of things that
 *  actually happened. A line is assembled at the moment of speaking from
 *  those three things plus the state of the world right now — the hour, the
 *  weather, where you are standing, what you last pulled out of the lake.
 *
 *  Memory is deliberately small and lossy. Six slots, and new memories push
 *  out the least important old ones. Meeting you for the first time, seeing
 *  you land something enormous, or agreeing to meet at the swamp are worth
 *  keeping. "It rained on Tuesday" is not, and it is supposed to fall out.
 *  That is what makes the remembering feel like remembering rather than
 *  like a log file. */

import { Rng } from '../art/canvas';
import { REGISTERS, fill, type Register } from './registers';

export interface Personality {
  /** Ramah ←→ dingin. */
  warmth: number;
  /** Blak-blakan ←→ halus. */
  bluntness: number;
  humor: number;
  /** Hitung-hitungan ←→ pemurah. */
  greed: number;
  /** Percaya cerita lama ←→ realistis. */
  superstition: number;
  /** Cerewet ←→ irit bicara. */
  talkative: number;
}

export type MemoryKind =
  | 'meet'      // the first time you spoke
  | 'record'    // the biggest fish they know you landed
  | 'rare'      // a rare species they heard about
  | 'promise'   // something you two agreed to do
  | 'gift'      // you sold or gave them something notable
  | 'absence';  // you did not come by for a long time

export interface Memory {
  kind: MemoryKind;
  /** In-game day it happened. */
  day: number;
  /** Higher survives longer when the six slots fill up. */
  weight: number;
  subject?: string;
  value?: number;
}

const MEMORY_SLOTS = 6;

export interface Mind {
  id: string;
  name: string;
  /** Which district's voice this person speaks in. */
  register: Register;
  personality: Personality;
  memories: Memory[];
  /** How many separate conversations you have had. */
  met: number;
  /** Last in-game day they saw you. -1 = never. */
  lastDay: number;
  /** -1 muram .. +1 cerah. Redrawn each day from the id and the date. */
  mood: number;
  /** Remaining indices per topic bag, so a line cannot repeat until the
   *  whole pool for that topic has been used. */
  bags: Record<string, number[]>;
}

export interface TalkCtx {
  /** Whole in-game days elapsed. */
  day: number;
  /** Normalized time of day. */
  time: number;
  phase: 'pagi' | 'siang' | 'senja' | 'malam';
  rain: number;
  /** Named place the player is standing in, if any. */
  place: string;
  playerName: string;
  /** The player's most recent catch, if they have one. */
  lastCatch: { label: string; cm: number } | null;
  /** Biggest thing the player has ever landed. */
  recordCm: number;
  recordLabel: string;
  /** How many species the player has logged. */
  species: number;
  coins: number;
  /** How many other people are in the room right now. */
  others: number;
}

// ---------------------------------------------------------------- creation

export function makePersonality(seed: number): Personality {
  const r = new Rng(seed * 6971 + 13);
  return {
    warmth: r.next(),
    bluntness: r.next(),
    humor: r.next(),
    greed: r.next(),
    superstition: r.next(),
    talkative: r.next(),
  };
}

export function makeMind(
  id: string, name: string, seed: number, register: Register = 'cozy',
): Mind {
  return {
    id,
    name,
    register,
    personality: makePersonality(seed),
    memories: [],
    met: 0,
    lastDay: -1,
    mood: 0,
    bags: {},
  };
}

/** Mood is a function of who they are and what day it is, so it is stable
 *  within a day and different across days without needing to be stored. */
export function moodFor(mind: Mind, day: number): number {
  const r = new Rng(hash(mind.id) * 31 + day * 7919);
  const base = (mind.personality.warmth - 0.5) * 0.6;
  return clamp(base + (r.next() - 0.5) * 1.4, -1, 1);
}

// ---------------------------------------------------------------- memory

export function remember(mind: Mind, m: Memory): void {
  // Never store two of the same kind about the same subject; update instead.
  const same = mind.memories.find((x) => x.kind === m.kind && x.subject === m.subject);
  if (same) {
    same.day = m.day;
    same.weight = Math.max(same.weight, m.weight);
    same.value = m.value ?? same.value;
    return;
  }
  mind.memories.push(m);
  if (mind.memories.length > MEMORY_SLOTS) {
    // Forget the least important thing, and among equals the oldest. This
    // is the whole "keeps what matters, drops the rest" behaviour.
    mind.memories.sort((a, b) => a.weight - b.weight || a.day - b.day);
    mind.memories.shift();
  }
}

function recall(mind: Mind, kind: MemoryKind): Memory | undefined {
  return mind.memories.find((m) => m.kind === kind);
}

// ---------------------------------------------------------------- speaking

/** Draws an index from a per-topic bag, refilling and reshuffling when the
 *  bag empties. Guarantees you hear every line in a pool before you hear
 *  any of them twice. */
function draw(mind: Mind, topic: string, count: number, rng: Rng): number {
  let bag = mind.bags[topic];
  if (!bag || bag.length === 0) {
    bag = [];
    for (let i = 0; i < count; i++) bag.push(i);
    // Fisher-Yates with the caller's rng.
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    mind.bags[topic] = bag;
  }
  return bag.pop() ?? 0;
}

function pick(mind: Mind, topic: string, lines: string[], rng: Rng): string {
  return lines[draw(mind, topic, lines.length, rng)];
}

/** The main entry point: one freshly assembled line. */
export function speak(mind: Mind, ctx: TalkCtx): string {
  // Seeded per conversation so the same NPC on the same tick is stable, but
  // every new conversation rolls again.
  const rng = new Rng(hash(mind.id) + ctx.day * 131 + mind.met * 7717 + Math.floor(ctx.time * 1000));
  const p = mind.personality;
  const mood = mind.mood;

  const parts: string[] = [];

  // --- 1. opener: depends entirely on the relationship and the gap
  const gap = mind.lastDay < 0 ? -1 : ctx.day - mind.lastDay;
  if (mind.met === 0) {
    parts.push(firstMeeting(mind, ctx, rng));
  } else if (gap >= 3) {
    const R = REGISTERS[mind.register];
    parts.push(fill(pick(mind, `${mind.register}-gap`, R.gap, rng), ctx.playerName, ''));
    remember(mind, { kind: 'absence', day: ctx.day, weight: 2, value: gap });
  } else if (gap >= 1) {
    const R = REGISTERS[mind.register];
    parts.push(fill(pick(mind, `${mind.register}-newday`, R.newday, rng), ctx.playerName, ''));
  } else if (mind.met > 6 && p.talkative > 0.5) {
    const R = REGISTERS[mind.register];
    parts.push(fill(pick(mind, `${mind.register}-again`, R.again, rng), ctx.playerName, ''));
  }

  // --- 2. the core: a topic chosen by personality against world state
  parts.push(topicLine(mind, ctx, rng));

  // --- 3. a memory callback, when there is something worth bringing up
  if (mind.met > 0 && rng.chance(0.45)) {
    const m = memoryLine(mind, ctx, rng);
    if (m) parts.push(m);
  }

  // --- 4. closer, only for the talkative and only sometimes
  if (rng.chance(0.20 + p.talkative * 0.35)) {
    parts.push(closer(mind, ctx, mood, rng));
  }

  // Blunt people say less. Their sentences get trimmed, not rewritten —
  // the character shows in the edit.
  const limit = p.bluntness > 0.7 ? 2 : p.talkative > 0.6 ? 4 : 3;
  return parts.slice(0, limit).join(' ');
}

function firstMeeting(mind: Mind, ctx: TalkCtx, rng: Rng): string {
  remember(mind, { kind: 'meet', day: ctx.day, weight: 5, subject: ctx.playerName });
  const R = REGISTERS[mind.register];
  const line = pick(mind, `${mind.register}-meet`, R.meet, rng);
  // The name is appended rather than baked into the pool, so a line reads
  // naturally whether or not this particular person offers their name.
  const gives = mind.personality.warmth > 0.5 || mind.register === 'cozy';
  return gives ? `${fill(line, ctx.playerName, '')} Saya ${mind.name}.` : fill(line, ctx.playerName, '');
}

/** Weighted topic choice. The weights are the personality — a superstitious
 *  person brings up the old stories, a greedy one talks about prices. */
function topicLine(mind: Mind, ctx: TalkCtx, rng: Rng): string {
  const p = mind.personality;
  const R = REGISTERS[mind.register];
  const options: Array<[string, number]> = [
    ['weather', 1 + ctx.rain * 2.5],
    ['time', 1.2],
    ['fish', 1 + (ctx.lastCatch ? 1.4 : 0)],
    ['place', ctx.place ? 1.8 : 0],
    ['money', p.greed * 2],
    ['story', p.superstition * 2.4],
    ['joke', p.humor * 1.8],
    ['people', p.warmth * 1.4 + (ctx.others > 0 ? 1.2 : 0)],
    ['self', p.talkative * 1.3],
  ];
  const total = options.reduce((s, o) => s + o[1], 0);
  let r = rng.next() * total;
  let topic = 'weather';
  for (const [k, w] of options) {
    r -= w;
    if (r <= 0) { topic = k; break; }
  }

  const fish = ctx.lastCatch ? `${ctx.lastCatch.label} ${ctx.lastCatch.cm} senti` : 'ikan itu';
  const say = (key: string, pool: string[]): string =>
    fill(pick(mind, `${mind.register}-${key}`, pool, rng), ctx.playerName, fish);

  switch (topic) {
    case 'weather':
      return ctx.rain > 0.25 ? say('w-rain', R.rain) : say('w-dry', R.dry);

    case 'time':
      switch (ctx.phase) {
        case 'pagi': return say('t-pagi', R.pagi);
        case 'siang': return say('t-siang', R.siang);
        case 'senja': return say('t-senja', R.senja);
        default: return say('t-malam', R.malam);
      }

    case 'fish':
      return ctx.lastCatch ? say('f-recent', R.fishRecent) : say('f-general', R.fishGeneral);

    case 'place':
      return pick(mind, `p-${ctx.place}`, placeLines(ctx.place), rng);

    case 'money':
      return say('money', R.money);

    case 'story':
      return say('story', R.story);

    case 'joke':
      return say('joke', R.joke);

    case 'people':
      return ctx.others > 0 ? say('ppl-many', R.peopleMany) : say('ppl-few', R.peopleFew);

    default:
      return say('self', R.self);
  }
}

function placeLines(place: string): string[] {
  switch (place) {
    case 'Rawa Teduh': return [
      'Di rawa jangan lama-lama. Nyamuknya ganas.',
      'Airnya hitam bukan karena kotor. Memang begitu dari dulu.',
      'Kalau ada yang bergerak di bawah, jangan dilihat lama-lama.',
    ];
    case 'Tanjung Batu': return [
      'Batunya licin. Pelan-pelan.',
      'Dari ujung situ langsung dalam. Hati-hati.',
      'Kalau mau yang besar, ya di sini tempatnya.',
    ];
    case 'Teluk Eceng': return [
      'Eceng gondoknya makin banyak tiap tahun.',
      'Di sini ikannya kecil-kecil, tapi ga pernah kosong.',
      'Anak-anak biasanya main di sini.',
    ];
    case 'Muara Sungai': return [
      'Air sungai ketemu air danau. Ikan suka nunggu di situ.',
      'Kalau habis hujan, muaranya keruh. Justru bagus.',
    ];
    case 'Sungai Bening': return [
      'Airnya bening sampai kelihatan dasarnya.',
      'Arusnya pelan, tapi jangan diremehkan.',
    ];
    case 'Lubuk Dalam': return [
      'Itu yang paling dalam. Saya sendiri ga berani ke sana.',
      'Kata orang, dasarnya ga pernah ada yang lihat.',
    ];
    case 'Dermaga Tua': return [
      'Papannya sudah lapuk. Injak yang pinggir.',
      'Dermaga ini lebih tua dari saya.',
    ];
    default: return [
      'Tempat ini enak buat berhenti sebentar.',
      'Saya suka bagian danau yang ini.',
    ];
  }
}

/** A callback to something that actually happened between you two, said in
 *  this district's voice. */
function memoryLine(mind: Mind, ctx: TalkCtx, rng: Rng): string | null {
  const R = REGISTERS[mind.register];
  const candidates: string[] = [];

  const rec = recall(mind, 'record');
  if (rec && rec.value) {
    for (const l of R.memRecord) {
      candidates.push(fill(l, ctx.playerName, '', rec.subject ?? '', rec.value));
    }
  }

  const rare = recall(mind, 'rare');
  if (rare) {
    for (const l of R.memRare) {
      candidates.push(fill(l, ctx.playerName, '', rare.subject ?? '', rare.value ?? ''));
    }
  }

  const prom = recall(mind, 'promise');
  if (prom) {
    candidates.push(`Kita jadi ke ${prom.subject} kan?`);
  }

  const abs = recall(mind, 'absence');
  if (abs && abs.value && abs.value >= 3 && ctx.day - abs.day < 2) {
    for (const l of R.memAbsence) candidates.push(fill(l, ctx.playerName, ''));
  }

  const meet = recall(mind, 'meet');
  if (meet && mind.met > 4 && ctx.day - meet.day > 2) {
    candidates.push(`Sudah ${ctx.day - meet.day} hari sejak kita pertama bertemu.`);
  }

  if (ctx.species >= 8) {
    candidates.push(`Kudengar kau sudah mengenal ${ctx.species} jenis. Rajin.`);
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng.next() * candidates.length)];
}

function closer(mind: Mind, ctx: TalkCtx, mood: number, rng: Rng): string {
  const R = REGISTERS[mind.register];
  const pool = mood < -0.4 ? R.closeCold
    : mood > 0.4 && mind.personality.warmth > 0.5 ? R.closeWarm
    : R.closeFlat;
  const key = mood < -0.4 ? 'close-low' : mood > 0.4 ? 'close-high' : 'close-mid';
  return fill(pick(mind, `${mind.register}-${key}`, pool, rng), ctx.playerName, '');
}

// ---------------------------------------------------------------- events

/** Called when the player lands something, so villagers nearby have
 *  something real to bring up later. Only notable catches are stored. */
export function witnessCatch(
  mind: Mind, day: number, label: string, cm: number, isRecord: boolean, isRare: boolean,
): void {
  if (isRecord) {
    remember(mind, { kind: 'record', day, weight: 4, subject: label, value: cm });
  }
  if (isRare) {
    remember(mind, { kind: 'rare', day, weight: 4.5, subject: label, value: cm });
  }
}

export function makePromise(mind: Mind, day: number, place: string): void {
  remember(mind, { kind: 'promise', day, weight: 3.5, subject: place });
}

// ---------------------------------------------------------------- storage

const KEY = 'senja.minds.v1';

export function saveMinds(minds: Mind[]): void {
  try {
    const slim = minds.map((m) => ({
      id: m.id, memories: m.memories, met: m.met, lastDay: m.lastDay,
    }));
    localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    // Storage full or disabled; the villagers just start fresh next time.
  }
}

export function loadMinds(minds: Mind[]): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const slim = JSON.parse(raw) as Array<{
      id: string; memories: Memory[]; met: number; lastDay: number;
    }>;
    const byId = new Map(slim.map((s) => [s.id, s]));
    for (const m of minds) {
      const s = byId.get(m.id);
      if (!s) continue;
      m.memories = Array.isArray(s.memories) ? s.memories.slice(0, MEMORY_SLOTS) : [];
      m.met = Number(s.met) || 0;
      m.lastDay = Number.isFinite(s.lastDay) ? s.lastDay : -1;
    }
  } catch {
    // Corrupt save: ignore it rather than refusing to start.
  }
}

// ---------------------------------------------------------------- helpers

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

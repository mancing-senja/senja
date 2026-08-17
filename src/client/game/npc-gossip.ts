/** v4 activity memory + local NPC gossip, extended by v5 social curiosity.
 *
 * No AI calls happen here. The world produces facts deterministically, nearby
 * villagers exchange at most one first-hand fact per pair/phase, and v5 lets
 * some listeners visibly act on gossip by approaching its source. Agnes only
 * sees these facts later if the player starts a conversation. */

import { TILE } from '../../shared/constants';
import type { NpcMemoryData } from '../../shared/npc-ai';
import { isWalkable, type WorldMap } from '../world/map';
import { Npc } from './npc';
import { currentNpcWorld } from './npc-schedule';
import { rememberActivity, spreadGossip } from './npc-world-memory';

interface ObservationState {
  fishBubble: string;
  tendT: number;
  workStamp: string;
}

interface CuriosityState {
  key: string;
  sourceName: string;
  allowed: boolean;
  arrived: boolean;
  lingerT: number;
  done: boolean;
}

const liveNpcs = new Set<Npc>();
const zones = new WeakMap<Npc, string>();
const observed = new WeakMap<Npc, ObservationState>();
const curiosity = new WeakMap<Npc, CuriosityState>();
let gossipStamp = '';
const gossipedPairs = new Set<string>();
const GOSSIP_DISTANCE = 42;
const TEND_CONFIRM_SECONDS = 1.05;
const SOCIAL_NOTICE_DISTANCE = 180;
const SOCIAL_STOP_DISTANCE = 30;
const SOCIAL_SPEED = 18;
const SOCIAL_LINGER_SECONDS = 4.5;

// npc-farming.ts is loaded before this entry. Capturing the prototype here
// means outdoor updates first run schedule + farming, then v4/v5 observe the
// final action that actually appeared in the world.
const baseOutdoorUpdate = Npc.prototype.update;
Npc.prototype.update = function patchedGossipOutdoor(
  this: Npc,
  ...args: Parameters<Npc['update']>
): void {
  const startX = this.x;
  const startY = this.y;
  baseOutdoorUpdate.apply(this, args);
  const [dt, map] = args;
  liveNpcs.add(this);
  zones.set(this, 'world');
  observeActivity(this, dt);
  tryGossip(this);
  trySocialCuriosity(this, dt, map, startX, startY);
};

const baseIndoorUpdate = Npc.prototype.updateIn;
Npc.prototype.updateIn = function patchedGossipIndoor(
  this: Npc,
  ...args: Parameters<Npc['updateIn']>
): void {
  baseIndoorUpdate.apply(this, args);
  const [, interior] = args;
  liveNpcs.add(this);
  zones.set(this, `inside:${interior.id}`);
  tryGossip(this);
};

function observeActivity(npc: Npc, dt: number): void {
  const world = currentNpcWorld();
  const phase = phaseAt(world.time);
  const st = observationFor(npc);

  // Fishing gives us an exact outcome in the reaction bubble. Record only on
  // the edge where that concrete reaction first appears, not every frame it
  // remains visible.
  const fish = npc.bubbleKind === 'thought'
    ? npc.bubbleText.match(/^Nah, dapat\s+(.+?)\.?$/i)
    : null;
  if (fish) {
    if (st.fishBubble !== npc.bubbleText) {
      st.fishBubble = npc.bubbleText;
      rememberActivity(npc.mind, world.day, `mendapat ${stripDot(fish[1])} saat memancing`);
    }
  } else {
    st.fishBubble = '';
  }

  // Tending is deliberately phrased as "merawat" rather than claiming a
  // specific watering/harvest result. It is true whenever the work animation
  // genuinely persisted on screen, whether Wahyu is checking a shared bed or
  // Ki Lengan is tending his private grove patch.
  const work = workSubject(npc, phase);
  if (!work || npc.talking) {
    st.tendT = 0;
    return;
  }

  if (npc.action === 'tend') {
    st.tendT += dt;
    const stamp = `${world.day}:${phase}:${npc.mind.id}`;
    if (st.tendT >= TEND_CONFIRM_SECONDS && st.workStamp !== stamp) {
      st.workStamp = stamp;
      rememberActivity(npc.mind, world.day, work);
    }
  } else {
    st.tendT = 0;
  }
}

function tryGossip(npc: Npc): void {
  if (npc.talking) return;
  const world = currentNpcWorld();
  const phase = phaseAt(world.time);
  const stamp = `${world.day}:${phase}`;
  if (stamp !== gossipStamp) {
    gossipStamp = stamp;
    gossipedPairs.clear();
  }

  const here = zones.get(npc);
  if (!here) return;
  for (const other of liveNpcs) {
    if (other === npc || other.talking || zones.get(other) !== here) continue;
    if (Math.hypot(other.x - npc.x, other.y - npc.y) > GOSSIP_DISTANCE) continue;

    const pair = pairKey(npc, other);
    if (gossipedPairs.has(pair)) continue;

    // One small exchange per pair/phase. Prefer the NPC whose update is
    // running as speaker, then try the reverse direction. Received gossip is
    // never a source because spreadGossip only reads first-hand activity.
    if (spreadGossip(npc.mind, other.mind, world.day)
      || spreadGossip(other.mind, npc.mind, world.day)) {
      gossipedPairs.add(pair);
    }
  }
}

/** v5: hearing a first-hand story can alter what the listener does next.
 *
 * Curiosity is deterministic from personality + day/phase, so all movement is
 * still game logic. The listener only approaches the original source while
 * both are outdoors, close enough to plausibly notice each other, and neither
 * farming/fishing/conversation has priority. */
function trySocialCuriosity(
  npc: Npc,
  dt: number,
  map: WorldMap,
  startX: number,
  startY: number,
): void {
  const world = currentNpcWorld();
  const phase = phaseAt(world.time);
  if (world.rain > 0.3 || npc.talking || npc.bobber
    || npc.action === 'tend' || npc.action === 'cast' || npc.action === 'reel') return;

  const gossip = latestGossip(npc, world.day);
  if (!gossip?.subject) return;
  const parsed = parseGossip(gossip.subject);
  if (!parsed) return;

  const key = `${world.day}:${phase}:${gossip.subject}`;
  const st = curiosityFor(npc);
  if (st.key !== key) {
    st.key = key;
    st.sourceName = parsed.source;
    st.allowed = wantsToFollowGossip(npc, key);
    st.arrived = false;
    st.lingerT = 0;
    st.done = !st.allowed;
  }
  if (st.done || !st.allowed) return;

  const here = zones.get(npc);
  if (here !== 'world') return;
  const source = [...liveNpcs].find((other) => (
    other !== npc && other.name === st.sourceName && zones.get(other) === here
  ));
  if (!source) return;

  const dx = source.x - startX;
  const dy = source.y - startY;
  const dist = Math.hypot(dx, dy);
  if (dist > SOCIAL_NOTICE_DISTANCE) return;

  if (dist <= SOCIAL_STOP_DISTANCE) {
    // Hold the listener near the source instead of allowing its authored route
    // to carry it away during the small social beat.
    npc.x = startX;
    npc.y = startY;
    npc.action = 'wait';
    npc.animT = 0;
    npc.faceToward(source.x, source.y);
    if (!source.talking && !source.bobber
      && (source.action === 'idle' || source.action === 'wait')) {
      source.faceToward(npc.x, npc.y);
    }

    if (!st.arrived) {
      st.arrived = true;
      npc.noteEmergentContext(
        `baru mencari ${source.name} untuk menanyakan kabar yang kudengar`,
        world.day,
      );
    }
    st.lingerT += dt;
    if (st.lingerT >= SOCIAL_LINGER_SECONDS) st.done = true;
    return;
  }

  // Undo this frame's normal-route movement and spend the frame walking toward
  // the chosen person. This avoids doubling speed by moving once for schedule
  // and once again for emergent intent.
  const travel = Math.min(Math.max(0, dist - SOCIAL_STOP_DISTANCE), SOCIAL_SPEED * dt);
  const nx = startX + (dx / dist) * travel;
  const ny = startY + (dy / dist) * travel;
  if (!isWalkable(map, Math.floor(nx / TILE), Math.floor(ny / TILE))) {
    st.done = true;
    return;
  }

  npc.x = nx;
  npc.y = ny;
  npc.action = 'walk';
  npc.animT += dt;
  npc.faceToward(source.x, source.y);
}

function latestGossip(npc: Npc, day: number): NpcMemoryData | null {
  const memories = npc.mind.memories as unknown as NpcMemoryData[];
  return memories
    .filter((m) => m.kind === 'gossip' && m.day >= day - 1 && Boolean(m.subject))
    .sort((a, b) => b.day - a.day || b.weight - a.weight)[0] ?? null;
}

function parseGossip(subject: string): { source: string; fact: string } | null {
  const match = subject.match(/^([^:]{1,32}):\s*(.+)$/);
  if (!match) return null;
  const source = match[1].trim();
  const fact = match[2].trim();
  return source && fact ? { source, fact } : null;
}

function wantsToFollowGossip(npc: Npc, key: string): boolean {
  const p = npc.mind.personality;
  const chance = Math.min(0.82, 0.16 + p.warmth * 0.34 + p.talkative * 0.32);
  return stableHash(`${npc.mind.id}:${key}`) / 0xffffffff < chance;
}

function workSubject(npc: Npc, phase: string): string {
  if (phase === 'malam') return '';
  if (npc.mind.id === 'wahyu' && /kebun|petak/i.test(npc.destination)) {
    return 'merawat kebun pusat';
  }
  if (npc.mind.id === 'lengan' && /rimbun|kebun/i.test(npc.destination)) {
    return 'merawat kebun rimbun';
  }
  return '';
}

function observationFor(npc: Npc): ObservationState {
  let st = observed.get(npc);
  if (!st) {
    st = { fishBubble: '', tendT: 0, workStamp: '' };
    observed.set(npc, st);
  }
  return st;
}

function curiosityFor(npc: Npc): CuriosityState {
  let st = curiosity.get(npc);
  if (!st) {
    st = {
      key: '', sourceName: '', allowed: false, arrived: false, lingerT: 0, done: false,
    };
    curiosity.set(npc, st);
  }
  return st;
}

function pairKey(a: Npc, b: Npc): string {
  const x = a.mind.id;
  const y = b.mind.id;
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

function phaseAt(time: number): 'pagi' | 'siang' | 'senja' | 'malam' {
  const t = ((time % 1) + 1) % 1;
  if (t < 0.28) return 'malam';
  if (t < 0.45) return 'pagi';
  if (t < 0.66) return 'siang';
  if (t < 0.86) return 'senja';
  return 'malam';
}

function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stripDot(value: string): string {
  return value.trim().replace(/[.]+$/, '').slice(0, 64);
}

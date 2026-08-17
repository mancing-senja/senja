/** v4 activity memory + local NPC gossip.
 *
 * No AI calls happen here. The world produces facts deterministically, nearby
 * villagers exchange at most one first-hand fact per pair/phase, and Agnes
 * only sees those memories later if the player starts a conversation. */

import { Npc } from './npc';
import { currentNpcWorld } from './npc-schedule';
import { rememberActivity, spreadGossip } from './npc-world-memory';

interface ObservationState {
  fishBubble: string;
  tendT: number;
  workStamp: string;
}

const liveNpcs = new Set<Npc>();
const zones = new WeakMap<Npc, string>();
const observed = new WeakMap<Npc, ObservationState>();
let gossipStamp = '';
const gossipedPairs = new Set<string>();
const GOSSIP_DISTANCE = 42;
const TEND_CONFIRM_SECONDS = 1.05;

// npc-farming.ts is loaded before this entry. Capturing the prototype here
// means outdoor updates first run schedule + farming, then v4 observes the
// final action that actually appeared in the world.
const baseOutdoorUpdate = Npc.prototype.update;
Npc.prototype.update = function patchedGossipOutdoor(
  this: Npc,
  ...args: Parameters<Npc['update']>
): void {
  baseOutdoorUpdate.apply(this, args);
  const [dt] = args;
  liveNpcs.add(this);
  zones.set(this, 'world');
  observeActivity(this, dt);
  tryGossip(this);
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

function stripDot(value: string): string {
  return value.trim().replace(/[.]+$/, '').slice(0, 64);
}

import type { NpcMemoryData } from '../../shared/npc-ai';
import type { Mind } from './dialogue';
import { cacheMinds } from './mind-sync';

const MEMORY_SLOTS = 6;
const ACTIVITY_WEIGHT = 2;
const GOSSIP_WEIGHT = 1.25;
const MAX_GOSSIP = 2;

function memoriesOf(mind: Mind): NpcMemoryData[] {
  // dialogue.ts predates v4 and intentionally keeps its narrower MemoryKind.
  // At the persistence boundary the shared NpcMemoryData type is authoritative.
  return mind.memories as unknown as NpcMemoryData[];
}

/** Keep only the latest first-hand activity. Routine world events should add
 * flavour without crowding promises, notable catches, or relationship memory
 * out of the six persistent slots. */
export function rememberActivity(mind: Mind, day: number, subject: string): void {
  const clean = cleanSubject(subject);
  if (!clean) return;
  const memories = memoriesOf(mind);
  for (let i = memories.length - 1; i >= 0; i--) {
    if (memories[i].kind === 'activity') memories.splice(i, 1);
  }
  memories.push({ kind: 'activity', day, weight: ACTIVITY_WEIGHT, subject: clean });
  prune(memories);
  cacheMinds([mind]);
}

/** One-hop gossip only. A villager may pass on something they experienced
 * personally; gossip received from somebody else is never re-broadcast. This
 * keeps information local instead of turning the whole map into telepathy. */
export function spreadGossip(from: Mind, to: Mind, day: number): boolean {
  if (from === to) return false;
  const source = memoriesOf(from)
    .filter((m) => m.kind === 'activity' && m.day >= day - 1 && Boolean(m.subject))
    .sort((a, b) => b.day - a.day || b.weight - a.weight);
  if (!source.length) return false;

  const target = memoriesOf(to);
  for (const activity of source) {
    const subject = cleanSubject(`${from.name}: ${activity.subject ?? ''}`);
    if (!subject) continue;
    if (target.some((m) => m.kind === 'gossip' && m.subject === subject)) continue;

    // Keep gossip ephemeral: at most two rumours compete for memory space.
    const oldGossip = target
      .map((m, i) => ({ m, i }))
      .filter((x) => x.m.kind === 'gossip')
      .sort((a, b) => a.m.day - b.m.day || a.m.weight - b.m.weight);
    while (oldGossip.length >= MAX_GOSSIP) {
      const drop = oldGossip.shift();
      if (!drop) break;
      const at = target.indexOf(drop.m);
      if (at >= 0) target.splice(at, 1);
    }

    target.push({ kind: 'gossip', day, weight: GOSSIP_WEIGHT, subject });
    prune(target);
    cacheMinds([to]);
    return true;
  }
  return false;
}

function prune(memories: NpcMemoryData[]): void {
  while (memories.length > MEMORY_SLOTS) {
    let drop = 0;
    for (let i = 1; i < memories.length; i++) {
      const a = memories[i];
      const b = memories[drop];
      if (a.weight < b.weight || (a.weight === b.weight && a.day < b.day)) drop = i;
    }
    memories.splice(drop, 1);
  }
}

function cleanSubject(value: string): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

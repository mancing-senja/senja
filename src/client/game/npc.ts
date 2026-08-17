/** Villagers.
 *
 * Movement is a loop of waypoints with pauses, driven off the same Actor
 * shape the players use. Conversation is delegated to NpcConversation so a
 * villager can stop, face the player, wait on an AI turn and offer choices
 * without tangling asynchronous network state into movement.
 *
 * v2 adds deterministic daily routines. v3A makes those intentions visible
 * as thought bubbles and lets selected fishing villagers actually cast and
 * reel. v5 lets recent first-hand experience bend a small part of the next
 * routine. Movement decisions remain deterministic game logic; Agnes is still
 * reserved for language generation rather than steering actors frame-by-frame. */

import { TILE } from '../../shared/constants';
import type { Facing, PlayerAction } from '../../shared/protocol';
import {
  EAST_OUTPOST, SOUTH_OUTPOST, isWalkable, isWater, tileAt, type WorldMap,
} from '../world/map';
import { walkableI, type Interior } from '../world/interior';
import type { Draw } from '../render/draw';
import type { Actor } from './player';
import { Rng } from '../art/canvas';
import { makeMind, type Mind, type Personality, type TalkCtx } from './dialogue';
import type { Register } from './registers';
import { NpcConversation } from './npc-conversation';
import { hydrateMinds } from './mind-sync';
import {
  currentNpcWorld, resolveNpcSchedule, scheduleTalkPlace, type NpcScheduleState,
} from './npc-schedule';

export interface NpcDef {
  id: string;
  name: string;
  hue: number;
  /** Which district voice they speak in. Defaults to the cozy hub. */
  register?: Register;
  /** Loop of tile coordinates. A single point means they stand still. */
  route: Array<[number, number]>;
  /** What they are doing when stopped. */
  idle: PlayerAction['kind'];
  /** A nudge to the generated personality, so the cast is not uniformly
   * random — this one really is the grumpy one. */
  bias?: Partial<Personality>;
}

const SPEED = 20;
const THOUGHT_HOLD = 5.2;

type FishStage = 'ready' | 'cast' | 'wait' | 'reel';
interface NpcFish { label: string; min: number; max: number }
interface MemoryFishingRule {
  phases: NpcScheduleState['phase'][];
  minCm: number;
}

/** These are roles that already stand beside real water in the authored map.
 * Keeping the first autonomous pass to them avoids NPCs casting through hills
 * just because their biography happens to mention fishing. */
const FISH_PHASES: Record<string, NpcScheduleState['phase'][]> = {
  tarno: ['pagi', 'siang', 'senja'],
  ika: ['pagi', 'senja'],
  noor: ['senja', 'malam'],
  siul: ['senja', 'malam'],
};

/** v5 memory feedback. A notably good recent catch can make a fisher extend
 * their next session into one adjacent phase they normally skip. The memory
 * must be first-hand and at most one in-game day old, so success nudges a
 * routine instead of permanently rewriting the character. */
const MEMORY_FISHING_RULES: Record<string, MemoryFishingRule> = {
  tarno: { phases: ['malam'], minCm: 45 },
  ika: { phases: ['siang'], minCm: 32 },
  noor: { phases: ['siang'], minCm: 35 },
  siul: { phases: ['pagi'], minCm: 30 },
};

const FISH_POOLS: Record<string, NpcFish[]> = {
  tarno: [
    { label: 'Wader', min: 7, max: 14 }, { label: 'Nila', min: 14, max: 29 },
    { label: 'Patin', min: 27, max: 57 }, { label: 'Gabus', min: 24, max: 48 },
  ],
  ika: [
    { label: 'Tawes', min: 15, max: 31 }, { label: 'Hampala', min: 21, max: 43 },
    { label: 'Bawal', min: 19, max: 37 }, { label: 'Belut Senja', min: 32, max: 66 },
  ],
  noor: [
    { label: 'Krom Sirip', min: 17, max: 36 }, { label: 'Ikan Statik', min: 13, max: 29 },
    { label: 'Nikel Mas', min: 21, max: 42 }, { label: 'Ikan Kabel', min: 28, max: 55 },
  ],
  siul: [
    { label: 'Sisik Embun', min: 11, max: 23 }, { label: 'Ikan Rembulan', min: 22, max: 44 },
    { label: 'Ikan Lentera', min: 15, max: 29 }, { label: 'Ikan Bisik', min: 11, max: 21 },
  ],
};

export class Npc implements Actor {
  x: number;
  y: number;
  facing: Facing = 'down';
  action: PlayerAction['kind'] = 'idle';
  animT = 0;
  idleSeed = Math.random() * 10;
  bobber: { x: number; y: number } | null = null;
  autoFishingLine = true;
  bubbleText = '';
  bubbleT = 0;
  bubbleKind: 'chat' | 'thought' = 'thought';
  name: string;
  hue: number;

  private leg = 0;
  private waitT: number;
  private rng: Rng;
  private conversation: NpcConversation;
  private scheduleState: NpcScheduleState;
  private pendingThought = '';
  private thoughtDelay = 0;
  private fishStage: FishStage = 'ready';
  private fishT = 0;
  private fishSeq = 0;
  private recentActivity = '';
  private emergentContext = '';
  private emergentContextDay = -1;

  readonly mind: Mind;

  constructor(private def: NpcDef, seed: number) {
    this.name = def.name;
    this.hue = def.hue;
    const [tx, ty] = def.route[0];
    this.x = tx * TILE + 8;
    this.y = ty * TILE + 8;
    this.rng = new Rng(seed * 7717 + 3);
    this.waitT = this.rng.range(0.5, 4);
    this.scheduleState = resolveNpcSchedule(def.id, def.name, def.route, def.idle);
    this.action = this.scheduleState.idle;

    this.mind = makeMind(def.id, def.name, seed, def.register ?? 'cozy');
    if (def.bias) Object.assign(this.mind.personality, def.bias);
    hydrateMinds([this.mind]);
    this.conversation = new NpcConversation(this.name, this.hue, this.mind);
    this.queueIntentThought(true);
  }

  get standing(): boolean {
    return this.scheduleState.route.length <= 1;
  }

  get activity(): string {
    return this.isFishingIntent() ? 'memancing' : this.scheduleState.activity;
  }

  get goal(): string {
    return this.scheduleState.goal;
  }

  get destination(): string {
    return this.scheduleState.destination;
  }

  get sayT(): number {
    return this.conversation.sayT;
  }

  get talking(): boolean {
    return this.conversation.talking;
  }

  update(dt: number, map: WorldMap): void {
    this.step(dt, (tx, ty) => isWalkable(map, tx, ty), map);
  }

  updateIn(dt: number, it: Interior): void {
    this.step(dt, (tx, ty) => walkableI(it, tx, ty));
  }

  private refreshSchedule(): void {
    const next = resolveNpcSchedule(this.def.id, this.def.name, this.def.route, this.def.idle);
    if (next.key !== this.scheduleState.key) {
      this.scheduleState = next;
      this.leg = 0;
      this.waitT = Math.min(this.waitT, 0.6);
      this.stopFishing();
      this.queueIntentThought();
    } else {
      this.scheduleState = next;
    }
  }

  private step(
    dt: number,
    walk: (tx: number, ty: number) => boolean,
    map?: WorldMap,
  ): void {
    this.tickBubble(dt);
    this.refreshSchedule();

    if (this.conversation.update(dt)) {
      this.bubbleT = 0;
      this.bubbleText = '';
      this.action = 'idle';
      this.animT = 0;
      return;
    }

    this.tickPendingThought(dt);

    if (map && this.isFishingIntent()) {
      this.stepFishing(dt, map);
      return;
    }
    this.stopFishing();

    const route = this.scheduleState.route.length ? this.scheduleState.route : this.def.route;
    if (route.length <= 1) {
      this.action = this.scheduleState.idle;
      this.animT = 0;
      return;
    }

    if (this.waitT > 0) {
      this.waitT -= dt;
      this.action = this.scheduleState.idle;
      this.animT = 0;
      return;
    }

    const [tx, ty] = route[this.leg % route.length];
    const gx = tx * TILE + 8;
    const gy = ty * TILE + 8;
    const dx = gx - this.x;
    const dy = gy - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 2) {
      this.leg = (this.leg + 1) % route.length;
      this.waitT = this.rng.range(this.scheduleState.pauseMin, this.scheduleState.pauseMax);
      return;
    }

    const step = Math.min(dist, SPEED * this.scheduleState.speed * dt);
    const nx = this.x + (dx / dist) * step;
    const ny = this.y + (dy / dist) * step;

    if (walk(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
      this.x = nx;
      this.y = ny;
      this.action = 'walk';
      this.animT += dt;
      if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
      else this.facing = dy > 0 ? 'down' : 'up';
    } else {
      this.leg = (this.leg + 1) % route.length;
      this.waitT = this.rng.range(0.5, 2);
    }
  }

  private tickBubble(dt: number): void {
    if (this.bubbleT <= 0) return;
    this.bubbleT = Math.max(0, this.bubbleT - dt);
    if (this.bubbleT === 0) this.bubbleText = '';
  }

  private tickPendingThought(dt: number): void {
    if (!this.pendingThought) return;
    this.thoughtDelay -= dt;
    if (this.thoughtDelay > 0) return;
    const text = this.pendingThought;
    this.pendingThought = '';
    this.showThought(text);
  }

  /** Intent text is derived from game state. The renderer may replace ordinary
   * intent with its lazy Agnes phrasing, but the decision itself already exists
   * before any language request is made. */
  private queueIntentThought(initial = false): void {
    const s = this.scheduleState;
    this.pendingThought = s.rainAdjusted
      ? `Hujan begini... ${s.goal}.`
      : this.isMemoryDrivenFishing()
        ? 'Tadi hasilnya bagus. Aku mau coba mancing lagi.'
        : this.isFishingIntent()
          ? 'Kayaknya enak mancing sebentar.'
          : `Hmm... aku mau ${s.goal}.`;
    this.thoughtDelay = this.rng.range(initial ? 1.2 : 0.7, initial ? 6 : 4.5);
  }

  private showThought(text: string, hold = THOUGHT_HOLD): void {
    this.bubbleText = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    this.bubbleKind = 'thought';
    this.bubbleT = hold;
  }

  private isFishingIntent(): boolean {
    if (this.scheduleState.rainAdjusted) return false;
    const phases = FISH_PHASES[this.def.id];
    return Boolean(phases?.includes(this.scheduleState.phase) || this.isMemoryDrivenFishing());
  }

  private isMemoryDrivenFishing(): boolean {
    if (this.scheduleState.rainAdjusted) return false;
    const rule = MEMORY_FISHING_RULES[this.def.id];
    if (!rule?.phases.includes(this.scheduleState.phase)) return false;
    const day = currentNpcWorld().day;
    const memories = this.mind.memories as unknown as Array<{
      kind?: string; day?: number; subject?: string;
    }>;
    return memories.some((m) => {
      if (m.kind !== 'activity' || !Number.isFinite(m.day) || Number(m.day) < day - 1) return false;
      if (!/saat memancing/i.test(m.subject ?? '')) return false;
      const cm = Number((m.subject ?? '').match(/\b(\d{1,3})\s*cm\b/i)?.[1] ?? 0);
      return cm >= rule.minCm;
    });
  }

  private stepFishing(dt: number, map: WorldMap): void {
    this.animT = 0;
    this.fishT = Math.max(0, this.fishT - dt);

    if (this.fishStage === 'ready') {
      this.action = 'wait';
      if (this.fishT > 0) return;
      const target = this.findWaterTarget(map);
      if (!target) {
        this.action = this.scheduleState.idle;
        this.fishT = 3;
        return;
      }
      this.faceToward(target.x, target.y);
      this.bobber = target;
      this.action = 'cast';
      this.fishStage = 'cast';
      this.fishT = 0.65;
      return;
    }

    if (this.fishStage === 'cast') {
      this.action = 'cast';
      if (this.fishT > 0) return;
      this.fishStage = 'wait';
      this.action = 'wait';
      this.fishT = this.rng.range(5, 10.5);
      return;
    }

    if (this.fishStage === 'wait') {
      this.action = 'wait';
      if (this.fishT > 0) return;
      const fish = this.rollCatch();
      this.recentActivity = `baru dapat ${fish.label} ${fish.cm} cm`;
      this.showThought(`Nah, dapat ${fish.label} ${fish.cm} cm.`, 5.5);
      this.fishStage = 'reel';
      this.action = 'reel';
      this.fishT = 0.9;
      return;
    }

    this.action = 'reel';
    if (this.fishT > 0) return;
    this.bobber = null;
    this.fishStage = 'ready';
    this.action = 'wait';
    this.fishT = this.rng.range(3.5, 7.5);
  }

  private stopFishing(): void {
    this.bobber = null;
    this.fishStage = 'ready';
    this.fishT = 0;
  }

  private findWaterTarget(map: WorldMap): { x: number; y: number } | null {
    const ox = Math.floor(this.x / TILE);
    const oy = Math.floor(this.y / TILE);
    let found = false;
    let foundX = 0;
    let foundY = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let r = 2; r <= 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = ox + dx;
          const ty = oy + dy;
          if (!isWater(tileAt(map, tx, ty))) continue;
          const x = tx * TILE + 8;
          const y = ty * TILE + 8;
          const d = Math.hypot(x - this.x, y - this.y);
          if (d < bestD) {
            found = true;
            foundX = x;
            foundY = y;
            bestD = d;
          }
        }
      }
      if (found) break;
    }
    return found ? { x: foundX, y: foundY } : null;
  }

  private rollCatch(): { label: string; cm: number } {
    const world = currentNpcWorld();
    const pool = FISH_POOLS[this.def.id] ?? [{ label: 'Wader', min: 7, max: 13 }];
    const h = stableHash(`${this.def.id}:${world.day}:${this.scheduleState.phase}:${this.fishSeq++}`);
    const fish = pool[h % pool.length];
    const span = Math.max(1, fish.max - fish.min + 1);
    const cm = fish.min + ((h >>> 8) % span);
    return { label: fish.label, cm };
  }

  /** v5 modules can leave a short factual note about a decision that actually
   * happened. It is not a persistent memory by itself; it only enriches the
   * next player-triggered conversation for roughly one in-game day. */
  noteEmergentContext(text: string, day = currentNpcWorld().day): void {
    this.emergentContext = text.replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 80);
    this.emergentContextDay = day;
  }

  /** The latest autonomous action rides on the next conversation request. */
  talk(ctx: TalkCtx): void {
    this.scheduleState = resolveNpcSchedule(
      this.def.id, this.def.name, this.def.route, this.def.idle,
      { day: ctx.day, time: ctx.time, rain: ctx.rain },
    );
    this.stopFishing();
    this.pendingThought = '';
    this.bubbleT = 0;
    this.bubbleText = '';

    const extras: string[] = [];
    if (this.recentActivity) extras.push(this.recentActivity);
    if (this.emergentContext && this.emergentContextDay >= ctx.day - 1) {
      extras.push(this.emergentContext);
    }

    let place = scheduleTalkPlace(ctx.place, this.scheduleState);
    if (extras.length) {
      const suffix = ` | ${extras.join(' | ')}`.slice(0, 43);
      place = `${place.slice(0, Math.max(0, 63 - suffix.length))}${suffix}`.slice(0, 63);
    }
    this.conversation.start({ ...ctx, place });
  }

  faceToward(x: number, y: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
    else this.facing = dy > 0 ? 'down' : 'up';
  }

  drawPanel(d: Draw, playerX: number, playerY: number): void {
    this.conversation.draw(d, this.x, this.y, playerX, playerY);
  }
}

function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The cast. Routes are in tile coordinates. Each has a personality bias so
 * the village has a grump, a gossip and a soft touch rather than ten people
 * with randomly rolled temperaments. */
export function villagerDefs(v: {
  vx: number; vy: number; pierX: number; pierTipY: number;
  plotX: number; plotY: number; bayX: number; bayY: number;
  keepX: number; keepY: number;
  quayX: number; quayY: number;
  groveX: number; groveY: number;
}): NpcDef[] {
  const { vx, vy } = v;
  return [
    {
      id: 'umar', name: 'Pak Umar', hue: 0, idle: 'idle',
      route: [[vx - 4, vy + 6], [vx + 4, vy + 6], [vx + 4, vy + 9], [vx - 4, vy + 9]],
      bias: { warmth: 0.75, superstition: 0.8, talkative: 0.7, bluntness: 0.3 },
    },
    {
      id: 'rini', name: 'Bu Rini', hue: 2, idle: 'tend',
      route: [[vx + 5, vy + 8]],
      bias: { warmth: 0.9, greed: 0.7, talkative: 0.8, humor: 0.5 },
    },
    {
      id: 'sari', name: 'Sari', hue: 4, idle: 'idle',
      route: [[vx - 12, vy + 5], [vx - 2, vy + 5], [vx - 2, vy + 12], [vx - 12, vy + 12]],
      bias: { warmth: 0.7, humor: 0.75, superstition: 0.6, bluntness: 0.2 },
    },
    {
      id: 'joko', name: 'Joko', hue: 1, idle: 'idle',
      route: [[vx + 10, vy + 5], [vx + 15, vy + 5], [vx + 15, vy + 10], [vx + 10, vy + 10]],
      bias: { bluntness: 0.8, talkative: 0.35, greed: 0.55, superstition: 0.15 },
    },
    {
      id: 'tarno', name: 'Mbah Tarno', hue: 5, idle: 'wait',
      route: [[v.pierX, v.pierTipY]],
      bias: { warmth: 0.25, bluntness: 0.9, talkative: 0.2, superstition: 0.85 },
    },
    {
      id: 'ika', name: 'Ika', hue: 8, idle: 'wait',
      route: [[v.bayX, v.bayY]],
      bias: { warmth: 0.6, humor: 0.4, talkative: 0.5, greed: 0.2 },
    },
    {
      id: 'wahyu', name: 'Wahyu', hue: 10, idle: 'tend',
      route: [[v.plotX, v.plotY], [v.plotX + 8, v.plotY], [v.plotX + 8, v.plotY + 4], [v.plotX, v.plotY + 4]],
      bias: { warmth: 0.65, greed: 0.3, talkative: 0.6, bluntness: 0.4 },
    },
    {
      id: 'nur', name: 'Nur', hue: 3, idle: 'idle',
      route: [[vx - 8, vy + 13], [vx + 2, vy + 13]],
      bias: { warmth: 0.8, superstition: 0.5, talkative: 0.75, humor: 0.35 },
    },
    {
      id: 'bagas', name: 'Bagas', hue: 6, idle: 'idle',
      route: [[vx + 8, vy + 2], [vx + 14, vy + 2], [vx + 14, vy + 6]],
      bias: { greed: 0.85, humor: 0.6, talkative: 0.7, warmth: 0.5 },
    },
    {
      id: 'lastri', name: 'Lastri', hue: 9, idle: 'idle',
      route: [[vx - 15, vy + 8], [vx - 9, vy + 8], [vx - 9, vy + 3]],
      bias: { warmth: 0.85, bluntness: 0.25, talkative: 0.55, superstition: 0.4 },
    },
    {
      id: 'dara', name: 'Dara', hue: 7, idle: 'idle',
      route: [
        [EAST_OUTPOST.cx - 8, EAST_OUTPOST.cy + 5],
        [EAST_OUTPOST.cx + 7, EAST_OUTPOST.cy + 5],
        [EAST_OUTPOST.cx + 7, EAST_OUTPOST.cy + 8],
        [EAST_OUTPOST.cx - 8, EAST_OUTPOST.cy + 8],
      ],
      bias: { warmth: 0.8, humor: 0.7, talkative: 0.65, superstition: 0.25 },
    },
    {
      id: 'darto', name: 'Pak Darto', hue: 1, idle: 'idle',
      route: [[EAST_OUTPOST.cx + 2, EAST_OUTPOST.cy + 7], [EAST_OUTPOST.cx + 8, EAST_OUTPOST.cy + 7]],
      bias: { warmth: 0.55, bluntness: 0.7, talkative: 0.35, greed: 0.25 },
    },
    {
      id: 'maya', name: 'Maya', hue: 4, idle: 'idle',
      route: [
        [SOUTH_OUTPOST.cx - 8, SOUTH_OUTPOST.cy + 5],
        [SOUTH_OUTPOST.cx + 7, SOUTH_OUTPOST.cy + 5],
        [SOUTH_OUTPOST.cx + 7, SOUTH_OUTPOST.cy + 8],
        [SOUTH_OUTPOST.cx - 8, SOUTH_OUTPOST.cy + 8],
      ],
      bias: { warmth: 0.85, humor: 0.45, talkative: 0.7, superstition: 0.55 },
    },
    {
      id: 'raka', name: 'Raka', hue: 10, idle: 'idle',
      route: [[SOUTH_OUTPOST.cx - 8, SOUTH_OUTPOST.cy + 7], [SOUTH_OUTPOST.cx - 3, SOUTH_OUTPOST.cy + 7]],
      bias: { warmth: 0.5, bluntness: 0.55, talkative: 0.4, greed: 0.2 },
    },
    {
      id: 'gerald', name: 'Gerald', hue: 7, idle: 'idle', register: 'medieval',
      route: [[v.keepX - 8, v.keepY + 6], [v.keepX + 8, v.keepY + 6]],
      bias: { warmth: 0.35, bluntness: 0.75, talkative: 0.4, superstition: 0.5 },
    },
    {
      id: 'maret', name: 'Bunda Maret', hue: 5, idle: 'tend', register: 'medieval',
      route: [[v.keepX + 2, v.keepY - 3]],
      bias: { warmth: 0.8, superstition: 0.85, talkative: 0.65, bluntness: 0.2 },
    },
    {
      id: 'darun', name: 'Darun', hue: 10, idle: 'wait', register: 'medieval',
      route: [[v.keepX - 2, v.keepY - 11]],
      bias: { warmth: 0.3, bluntness: 0.85, talkative: 0.2, superstition: 0.7 },
    },
    {
      id: 'vex', name: 'Vex', hue: 11, idle: 'idle', register: 'cyber',
      route: [[v.quayX - 6, v.quayY + 4], [v.quayX + 6, v.quayY + 4], [v.quayX + 6, v.quayY + 8]],
      bias: { warmth: 0.4, bluntness: 0.8, talkative: 0.5, greed: 0.4 },
    },
    {
      id: 'noor', name: 'Noor', hue: 3, idle: 'wait', register: 'cyber',
      route: [[v.quayX - 11, v.quayY + 1]],
      bias: { warmth: 0.55, humor: 0.7, talkative: 0.6, superstition: 0.3 },
    },
    {
      id: 'kiran', name: 'Kiran', hue: 6, idle: 'idle', register: 'cyber',
      route: [[v.quayX + 9, v.quayY + 6], [v.quayX + 14, v.quayY + 6]],
      bias: { greed: 0.9, bluntness: 0.6, talkative: 0.7, warmth: 0.35 },
    },
    {
      id: 'ambu', name: 'Ambu', hue: 8, idle: 'idle', register: 'fantasy',
      route: [[v.groveX - 14, v.groveY - 8], [v.groveX - 14, v.groveY + 6]],
      bias: { warmth: 0.75, superstition: 0.95, talkative: 0.45, bluntness: 0.15 },
    },
    {
      id: 'siul', name: 'Siul', hue: 4, idle: 'wait', register: 'fantasy',
      route: [[v.groveX + 12, v.groveY + 2]],
      bias: { warmth: 0.6, humor: 0.6, superstition: 0.8, talkative: 0.35 },
    },
    {
      id: 'lengan', name: 'Ki Lengan', hue: 2, idle: 'tend', register: 'fantasy',
      route: [[v.groveX + 15, v.groveY - 9], [v.groveX + 20, v.groveY - 5]],
      bias: { warmth: 0.4, bluntness: 0.4, superstition: 0.9, talkative: 0.25 },
    },
  ];
}

export function nearestNpc(npcs: Npc[], x: number, y: number, r = 26): Npc | null {
  let best: Npc | null = null;
  let bestD = r;
  for (const n of npcs) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

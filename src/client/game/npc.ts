/** Villagers.
 *
 * Movement is a loop of waypoints with pauses, driven off the same Actor
 * shape the players use. Conversation is delegated to NpcConversation so a
 * villager can stop, face the player, wait on an AI turn and offer choices
 * without tangling asynchronous network state into movement.
 *
 * v2 adds a deterministic daily routine on top of those waypoints. The room
 * clock and weather decide what an NPC is doing; AI only receives that state
 * as context, so model latency never controls simulation or movement. */

import { TILE } from '../../shared/constants';
import type { Facing, PlayerAction } from '../../shared/protocol';
import { EAST_OUTPOST, SOUTH_OUTPOST, isWalkable, type WorldMap } from '../world/map';
import { walkableI, type Interior } from '../world/interior';
import type { Draw } from '../render/draw';
import type { Actor } from './player';
import { Rng } from '../art/canvas';
import { makeMind, type Mind, type Personality, type TalkCtx } from './dialogue';
import type { Register } from './registers';
import { NpcConversation } from './npc-conversation';
import { hydrateMinds } from './mind-sync';
import {
  resolveNpcSchedule, scheduleTalkPlace, type NpcScheduleState,
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

export class Npc implements Actor {
  x: number;
  y: number;
  facing: Facing = 'down';
  action: PlayerAction['kind'] = 'idle';
  animT = 0;
  idleSeed = Math.random() * 10;
  bobber: { x: number; y: number } | null = null;
  name: string;
  hue: number;

  private leg = 0;
  private waitT: number;
  private rng: Rng;
  private conversation: NpcConversation;
  private scheduleState: NpcScheduleState;

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
    // Registers this live Mind too. A profile may arrive after NPC objects
    // were created, and indoor residents may be created after the profile.
    hydrateMinds([this.mind]);
    this.conversation = new NpcConversation(this.name, this.hue, this.mind);
  }

  get standing(): boolean {
    return this.scheduleState.route.length <= 1;
  }

  /** Exposed for future HUD/debug surfaces without coupling them to the
   * schedule resolver. */
  get activity(): string {
    return this.scheduleState.activity;
  }

  get goal(): string {
    return this.scheduleState.goal;
  }

  get destination(): string {
    return this.scheduleState.destination;
  }

  /** Kept as a number because the main loop already uses it to decide whether
   * a villager currently owns the interaction key. Infinity means waiting on
   * the model or on a player choice. */
  get sayT(): number {
    return this.conversation.sayT;
  }

  /** Drives the nodding pose while a conversation is active. */
  get talking(): boolean {
    return this.conversation.talking;
  }

  update(dt: number, map: WorldMap): void {
    this.step(dt, (tx, ty) => isWalkable(map, tx, ty));
  }

  /** Same routine on a room's tiles. Residents pace around a table using
   * the identical schedule/waypoint logic — only collision changes. */
  updateIn(dt: number, it: Interior): void {
    this.step(dt, (tx, ty) => walkableI(it, tx, ty));
  }

  private refreshSchedule(): void {
    const next = resolveNpcSchedule(this.def.id, this.def.name, this.def.route, this.def.idle);
    if (next.key !== this.scheduleState.key) {
      this.scheduleState = next;
      this.leg = 0;
      // A phase change should become visible soon, but never snap an NPC.
      this.waitT = Math.min(this.waitT, 0.6);
    } else {
      this.scheduleState = next;
    }
  }

  private step(dt: number, walk: (tx: number, ty: number) => boolean): void {
    this.refreshSchedule();

    // Talking wins over the route. This is what makes the NPC actually stop
    // and attend to the player instead of continuing to pace mid-sentence.
    if (this.conversation.update(dt)) {
      this.action = 'idle';
      this.animT = 0;
      return;
    }

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

  /** Starts a conversation. The current job/goal is folded into the compact
   * place context sent to the model, keeping v2 compatible with the existing
   * /api/npc-talk contract and whichever SENJA_AI_MODEL is selected in Vercel. */
  talk(ctx: TalkCtx): void {
    this.scheduleState = resolveNpcSchedule(
      this.def.id, this.def.name, this.def.route, this.def.idle,
      { day: ctx.day, time: ctx.time, rain: ctx.rain },
    );
    this.conversation.start({
      ...ctx,
      place: scheduleTalkPlace(ctx.place, this.scheduleState),
    });
  }

  /** Faces whoever is talking to them. Fixed-route villagers are allowed to
   * turn too; standing still should not mean staring past the player. */
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

    // ---------------------------------------------------------- Pos Timur
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
      route: [
        [EAST_OUTPOST.cx + 2, EAST_OUTPOST.cy + 7],
        [EAST_OUTPOST.cx + 8, EAST_OUTPOST.cy + 7],
      ],
      bias: { warmth: 0.55, bluntness: 0.7, talkative: 0.35, greed: 0.25 },
    },

    // -------------------------------------------------------- Kampung Selatan
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
      route: [
        [SOUTH_OUTPOST.cx - 8, SOUTH_OUTPOST.cy + 7],
        [SOUTH_OUTPOST.cx - 3, SOUTH_OUTPOST.cy + 7],
      ],
      bias: { warmth: 0.5, bluntness: 0.55, talkative: 0.4, greed: 0.2 },
    },

    // ---------------------------------------------------------- Benteng Lama
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

    // --------------------------------------------------------- Dermaga Neon
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

    // -------------------------------------------------------- Rimbun Cahaya
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

/** The nearest villager within reach, for the talk prompt. */
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

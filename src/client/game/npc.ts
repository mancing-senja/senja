/** Villagers.
 *
 *  They are not quest givers and they do not sell anything. They exist so
 *  the place looks lived in: somebody sweeping outside a house, somebody
 *  standing at the end of the pier with a rod, somebody who says the same
 *  three things about the weather every time you talk to them.
 *
 *  Movement is a loop of waypoints with pauses, driven off the same Actor
 *  shape the players use — so they animate, y-sort and cast shadows through
 *  exactly the same code path. */

import { TILE } from '../../shared/constants';
import type { Facing, PlayerAction } from '../../shared/protocol';
import { C } from '../art/palette';
import { LINE_H, wrapText } from '../art/font';
import { isWalkable, type WorldMap } from '../world/map';
import type { Draw } from '../render/draw';
import type { Actor } from './player';
import { Rng } from '../art/canvas';
import {
  makeMind, moodFor, speak,
  type Mind, type Personality, type TalkCtx,
} from './dialogue';
import type { Register } from './registers';
import { PORTRAIT_H, PORTRAIT_W, portraitKey, type Mood as PortraitMood } from '../art/portrait';
import { view } from '../engine/view';

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
   *  random — this one really is the grumpy one. */
  bias?: Partial<Personality>;
}

const SPEED = 20;

/** How long a line stays up. Long enough to read twice without hurrying. */
const PANEL_HOLD = 6.5;

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

  /** Seconds left showing a speech bubble. */
  sayT = 0;
  private line = '';

  readonly mind: Mind;

  constructor(private def: NpcDef, seed: number) {
    this.name = def.name;
    this.hue = def.hue;
    const [tx, ty] = def.route[0];
    this.x = tx * TILE + 8;
    this.y = ty * TILE + 8;
    this.rng = new Rng(seed * 7717 + 3);
    this.waitT = this.rng.range(0.5, 4);
    this.action = def.idle;

    this.mind = makeMind(def.id, def.name, seed, def.register ?? 'cozy');
    if (def.bias) Object.assign(this.mind.personality, def.bias);
  }

  get standing(): boolean {
    return this.def.route.length <= 1;
  }

  update(dt: number, map: WorldMap): void {
    this.sayT = Math.max(0, this.sayT - dt);

    if (this.standing) {
      this.action = this.def.idle;
      this.animT = 0;
      return;
    }

    if (this.waitT > 0) {
      this.waitT -= dt;
      // Pausing means doing whatever this person does when they stop, not
      // standing to attention. Hardcoding 'idle' here quietly threw away the
      // `idle` field on every villager with a route — which is why the
      // farmers never actually farmed.
      this.action = this.def.idle;
      this.animT = 0;
      return;
    }

    const [tx, ty] = this.def.route[this.leg];
    const gx = tx * TILE + 8;
    const gy = ty * TILE + 8;
    const dx = gx - this.x;
    const dy = gy - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 2) {
      this.leg = (this.leg + 1) % this.def.route.length;
      this.waitT = this.rng.range(1.5, 6);
      return;
    }

    const step = Math.min(dist, SPEED * dt);
    const nx = this.x + (dx / dist) * step;
    const ny = this.y + (dy / dist) * step;

    // Villagers respect the same collision the player does. If they are
    // wedged, skip to the next waypoint rather than vibrating against a wall.
    if (isWalkable(map, Math.floor(nx / TILE), Math.floor(ny / TILE))) {
      this.x = nx;
      this.y = ny;
      this.action = 'walk';
      this.animT += dt;
      if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
      else this.facing = dy > 0 ? 'down' : 'up';
    } else {
      this.leg = (this.leg + 1) % this.def.route.length;
      this.waitT = this.rng.range(0.5, 2);
    }
  }

  /** Called when the player presses E next to them. The line is composed on
   *  the spot from personality, mood, memory and the state of the world —
   *  there is no script to run out of. */
  talk(ctx: TalkCtx): void {
    this.mind.mood = moodFor(this.mind, ctx.day);
    this.line = speak(this.mind, ctx);
    this.mind.met++;
    this.mind.lastDay = ctx.day;
    this.sayT = PANEL_HOLD;
  }

  /** Faces whoever is talking to them, so a conversation looks like one. */
  faceToward(x: number, y: number): void {
    if (this.standing) return;
    const dx = x - this.x;
    const dy = y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
    else this.facing = dy > 0 ? 'down' : 'up';
  }

  /** The conversation panel.
   *
   *  This used to be a small bubble over the villager's head, which meant a
   *  conversation looked like a label rather than like talking to somebody.
   *  Now it is a panel pinned to the bottom of the screen with the person's
   *  face in it — and the face changes with their mood, so you can see they
   *  are having a bad day before you finish reading the sentence.
   *
   *  Drawn in screen space, so it is called after the camera is parked at
   *  the origin rather than from the world pass. */
  drawPanel(d: Draw, playerX: number, playerY: number): void {
    if (this.sayT <= 0) return;
    // Walking away ends the conversation. Without this the panel of someone
    // you left behind stays on screen while you stand somewhere else
    // entirely, which reads as a bug even though the timer is honest.
    if (Math.hypot(this.x - playerX, this.y - playerY) > 90) {
      this.sayT = 0;
      return;
    }
    const a = Math.min(1, Math.min(this.sayT * 3, (PANEL_HOLD - this.sayT) * 5));
    if (a <= 0) return;

    const w = Math.min(view.w - 16, 300);
    const x = Math.round((view.w - w) / 2);
    const textX = x + PORTRAIT_W + 14;
    const lines = wrapText(this.line, w - PORTRAIT_W - 22);
    const h = Math.max(PORTRAIT_H + 12, lines.length * LINE_H + 24);
    const y = view.h - h - 8;

    d.panel(x, y, w, h, a, C.Amber);

    // Portrait, inset with its own frame so it reads as a picture rather
    // than as part of the background.
    const px = x + 6;
    const py = y + Math.round((h - PORTRAIT_H) / 2);
    d.rect(px - 1, py - 1, PORTRAIT_W + 2, PORTRAIT_H + 2, C.InkDeep, a);
    d.sprite(portraitKey(this.hue, this.portraitMood), px, py, { alpha: a });
    d.frameRect(px - 1, py - 1, PORTRAIT_W + 2, PORTRAIT_H + 2, C.Slate, a * 0.7);

    d.text(this.name, textX, y + 6, C.Lantern, a);
    d.rect(textX, y + 15, w - PORTRAIT_W - 22, 1, C.Slate, a * 0.5);
    for (let i = 0; i < lines.length; i++) {
      d.text(lines[i], textX, y + 20 + i * LINE_H, C.White, a * 0.97);
    }
  }

  /** Which of the three portrait expressions fits their mood right now. */
  private get portraitMood(): PortraitMood {
    if (this.mind.mood > 0.3) return 'warm';
    if (this.mind.mood < -0.3) return 'cold';
    return 'neutral';
  }
}

/** The cast. Routes are in tile coordinates. Each has a personality bias so
 *  the village has a grump, a gossip and a soft touch rather than ten
 *  people with randomly rolled temperaments. */
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

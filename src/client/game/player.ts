/** The local player controller, plus the interpolated stand-ins for
 *  everyone else in the room. */

import { PLAYER_SPEED, TILE } from '../../shared/constants';
import type { Facing, PlayerAction, PlayerState } from '../../shared/protocol';
import { CH_H, CH_W, type Pose, charKey } from '../art/character';
import { C } from '../art/palette';
import { Blend } from '../engine/batch';
import type { Input } from '../engine/input';
import { isWalkable, type WorldMap } from '../world/map';
import { walkableI, type Interior } from '../world/interior';
import type { Draw } from '../render/draw';
import { textWidth } from '../art/font';
import type { Lighting } from '../world/lighting';

/** Collision box at the feet, not the whole sprite — walking behind a tree
 *  should be possible, walking through its trunk should not. */
const FOOT_W = 8;
const FOOT_H = 5;

/** Display names stay friendly and are allowed to collide. Only while two
 * players with the same name share a room do remote name tags gain a tiny
 * connection suffix, so nobody has to permanently become "Dimas42" just
 * because another Dimas happens to be fishing tonight. */
const duplicatePlayerNames = new Set<string>();
window.addEventListener('senja:players', (e) => {
  const players = (e as CustomEvent<Array<{ name: string }>>).detail;
  duplicatePlayerNames.clear();
  if (!Array.isArray(players)) return;
  const counts = new Map<string, number>();
  for (const p of players) {
    const key = String(p?.name ?? '').trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [name, count] of counts) if (count > 1) duplicatePlayerNames.add(name);
});

export interface Actor {
  x: number;
  y: number;
  facing: Facing;
  action: PlayerAction['kind'];
  name: string;
  /** Index into LOOKS — which character this is, not just what colour. */
  hue: number;
  /** Seconds of accumulated walk animation. */
  animT: number;
  /** Per-character phase offset, so idles are not synchronised. */
  idleSeed: number;
  bobber: { x: number; y: number } | null;
  /** True while this actor has a line on screen. Only villagers set it. */
  talking?: boolean;
}

export class LocalPlayer implements Actor {
  x: number;
  y: number;
  facing: Facing = 'up';
  action: PlayerAction['kind'] = 'idle';
  animT = 0;
  idleSeed = Math.random() * 10;
  bobber: { x: number; y: number } | null = null;
  coins = 0;
  caught = 0;
  /** Set by the fishing system to lock movement during a cast. */
  locked = false;

  constructor(public name: string, public hue: number, map: WorldMap) {
    this.x = map.spawnX;
    this.y = map.spawnY;
  }

  update(dt: number, input: Input, map: WorldMap): void {
    if (this.locked) {
      this.animT = 0;
      return;
    }

    const a = input.axis();
    if (a.x === 0 && a.y === 0) {
      this.action = 'idle';
      this.animT = 0;
      return;
    }

    this.action = 'walk';
    this.animT += dt;

    // Facing prefers the dominant axis, and sticks to the horizontal when
    // moving diagonally — reads better with only three sprite directions.
    if (Math.abs(a.x) > 0.01) this.facing = a.x > 0 ? 'right' : 'left';
    else if (a.y !== 0) this.facing = a.y > 0 ? 'down' : 'up';

    const step = PLAYER_SPEED * dt;
    this.moveAxis(map, a.x * step, 0);
    this.moveAxis(map, 0, a.y * step);
  }

  /** Same controller, different collision source. Interiors are their own
   *  small map, so they cannot share `canStand`. */
  updateIndoors(dt: number, input: Input, it: Interior): void {
    const a = input.axis();
    if (a.x === 0 && a.y === 0) {
      this.action = 'idle';
      this.animT = 0;
      return;
    }
    this.action = 'walk';
    this.animT += dt;
    if (Math.abs(a.x) > 0.01) this.facing = a.x > 0 ? 'right' : 'left';
    else if (a.y !== 0) this.facing = a.y > 0 ? 'down' : 'up';

    const step = PLAYER_SPEED * dt;
    for (const [dx, dy] of [[a.x * step, 0], [0, a.y * step]] as const) {
      if (dx === 0 && dy === 0) continue;
      const nx = this.x + dx;
      const ny = this.y + dy;
      if (canStandIn(it, nx, ny)) {
        this.x = nx;
        this.y = ny;
      }
    }
  }

  /** Axis-separated movement so sliding along a wall feels smooth rather
   *  than sticking at corners. */
  private moveAxis(map: WorldMap, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (canStand(map, nx, ny)) {
      this.x = nx;
      this.y = ny;
      return;
    }
    // Try a reduced step so approaching a wall does not stop short of it.
    for (const f of [0.5, 0.25]) {
      const px = this.x + dx * f;
      const py = this.y + dy * f;
      if (canStand(map, px, py)) {
        this.x = px;
        this.y = py;
        return;
      }
    }
  }
}

export function canStandIn(it: Interior, x: number, y: number): boolean {
  const l = Math.floor((x - FOOT_W / 2) / TILE);
  const r = Math.floor((x + FOOT_W / 2 - 1) / TILE);
  const t = Math.floor((y - FOOT_H) / TILE);
  const b = Math.floor((y - 1) / TILE);
  for (let ty = t; ty <= b; ty++) {
    for (let tx = l; tx <= r; tx++) {
      if (!walkableI(it, tx, ty)) return false;
    }
  }
  return true;
}

export function canStand(map: WorldMap, x: number, y: number): boolean {
  const l = Math.floor((x - FOOT_W / 2) / TILE);
  const r = Math.floor((x + FOOT_W / 2 - 1) / TILE);
  const t = Math.floor((y - FOOT_H) / TILE);
  const b = Math.floor((y - 1) / TILE);
  for (let ty = t; ty <= b; ty++) {
    for (let tx = l; tx <= r; tx++) {
      if (!isWalkable(map, tx, ty)) return false;
    }
  }
  return true;
}

/** A remote player. Positions arrive at the server tick rate; everything
 *  between ticks is interpolated so nobody teleports. */
export class RemotePlayer implements Actor {
  x: number;
  y: number;
  private tx: number;
  private ty: number;
  facing: Facing = 'down';
  action: PlayerAction['kind'] = 'idle';
  animT = 0;
  idleSeed = Math.random() * 10;
  bobber: { x: number; y: number } | null = null;
  coins = 0;
  caught = 0;
  /** Fades in on join and out on leave. */
  fade = 0;
  leaving = false;

  constructor(public id: string, public name: string, public hue: number, s: PlayerState) {
    this.x = this.tx = s.x;
    this.y = this.ty = s.y;
    this.facing = s.facing;
    this.action = s.action;
  }

  applySnapshot(s: PlayerState): void {
    this.tx = s.x;
    this.ty = s.y;
    this.facing = s.facing;
    this.action = s.action;
    this.bobber = s.bobber;
    this.coins = s.coins;
    this.caught = s.caught;
  }

  update(dt: number): void {
    // Exponential smoothing, frame-rate independent.
    const k = 1 - Math.pow(0.0005, dt);
    const moved = Math.hypot(this.tx - this.x, this.ty - this.y);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    if (this.action === 'walk' || moved > 0.6) this.animT += dt;
    else this.animT = 0;
    this.fade = this.leaving
      ? Math.max(0, this.fade - dt * 2.5)
      : Math.min(1, this.fade + dt * 3);
  }
}

/** Exported so a test can assert which pose an actor is actually in —
 *  reading that off a screenshot of a sixteen-pixel sprite is guesswork. */
export function poseOf(a: Actor, clock: number): Pose {
  return poseFor(a, clock);
}

function poseFor(a: Actor, clock: number): Pose {
  switch (a.action) {
    case 'cast':
    case 'wait':
      return 'hold';
    case 'reel':
      return 'pull';
    case 'tend': {
      // A slow two-beat swing, offset per character so a row of villagers
      // working the plots does not move as one machine.
      const beat = (clock * 1.6 + a.idleSeed) % 2;
      return beat < 1.2 ? 'tend0' : 'tend1';
    }
    case 'walk': {
      const f = Math.floor(a.animT * 8) % 4;
      return (['walk0', 'walk1', 'walk2', 'walk3'] as const)[f];
    }
    default: {
      const phase = clock + a.idleSeed;
      // Mid-sentence, the head nods. A villager who talks without moving
      // reads as a vending machine — and the nod is faster than the breath,
      // so the two never look like the same animation.
      if (a.talking) return Math.floor(phase * 3.2) % 2 === 0 ? 'idle' : 'talk';
      // Standing still is still animated. A slow breath, plus a blink on a
      // per-character offset so a crowd never blinks in unison.
      const blinkCycle = 4.4 + (a.idleSeed % 2.6);
      if (phase % blinkCycle < 0.13) return 'blink';
      return Math.floor(phase * 0.7) % 2 === 0 ? 'idle' : 'idle2';
    }
  }
}

function dirFor(f: Facing): { dir: 'front' | 'back' | 'side'; flip: boolean } {
  if (f === 'up') return { dir: 'back', flip: false };
  if (f === 'down') return { dir: 'front', flip: false };
  return { dir: 'side', flip: f === 'left' };
}

/** A name is a social label, not an account identifier. The local player is
 * explicitly marked, and duplicate remote names get a temporary room number
 * derived from their connection id. The suffix disappears again when the
 * collision does, and is never written to the saved profile. */
function actorNameLabel(a: Actor): { text: string; mine: boolean } {
  if (a instanceof LocalPlayer) return { text: `${a.name} (kamu)`, mine: true };
  if (a instanceof RemotePlayer && duplicatePlayerNames.has(a.name.trim().toLowerCase())) {
    const short = a.id.replace(/^p/, '') || a.id.slice(-2);
    return { text: `${a.name} · ${short}`, mine: false };
  }
  return { text: a.name, mine: false };
}

export function drawActor(
  d: Draw, a: Actor, L: Lighting, clock: number, alpha = 1, showName = true,
): void {
  const { dir, flip } = dirFor(a.facing);
  const pose = poseFor(a, clock);
  const key = charKey(a.hue, dir, pose);
  const x = Math.round(a.x - CH_W / 2);
  const y = Math.round(a.y - CH_H);

  // Contact shadow plus a cast shadow leaning away from the sun. The
  // contact patch is what stops the character floating; the cast shadow is
  // what ties them to the time of day.
  const shadowA = (0.26 + (1 - L.night) * 0.22) * alpha;
  d.castShadow(a.x, a.y - 1, 11, 6, L.sunX, L.sunY, shadowA * 0.75);
  d.sprite('shadow', a.x - 8, a.y - 5, { tint: [0, 0, 0], flat: true, alpha: shadowA });

  d.sprite(key, x, y, { flipX: flip, alpha });

  // Warm rim on the sunlit side at dawn and dusk.
  if (L.rim > 0.3) {
    d.sprite(key, x - 1, y, {
      flipX: flip,
      tint: [L.sunColor[0], L.sunColor[1], L.sunColor[2]],
      alpha: alpha * (L.rim - 0.3) * 0.5,
      blend: Blend.Add,
      flat: true,
    });
  }

  const label = actorNameLabel(a);
  if ((showName || label.mine) && label.text) {
    const w = textWidth(label.text);
    const nx = Math.round(a.x - w / 2);
    const ny = y - 10;
    d.rect(nx - 2, ny - 1, w + 4, 9, C.InkDeep, 0.45 * alpha);
    d.text(label.text, nx, ny, label.mine ? C.Lantern : C.White, alpha);
  }
}

/** Rod and line, drawn from the hand to the bobber. Pure geometry — no
 *  sprite needed, and it means the line can sag correctly at any angle. */
export function drawFishingLine(d: Draw, a: Actor, time: number): void {
  if (!a.bobber) return;
  const hand = handPos(a);
  const bx = a.bobber.x;
  const by = a.bobber.y;

  // Rod: a short stiff segment out of the hand toward the bobber.
  const ang = Math.atan2(by - hand.y, bx - hand.x);
  const rodLen = 12;
  const rx = hand.x + Math.cos(ang) * rodLen;
  const ry = hand.y + Math.sin(ang) * rodLen - 4;
  plot(d, hand.x, hand.y, rx, ry, C.WoodDk);

  // Line: a slack catenary, wobbling very slightly.
  const sag = 4 + Math.sin(time * 1.7) * 0.8;
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = rx + (bx - rx) * t;
    const y = ry + (by - ry) * t + Math.sin(t * Math.PI) * sag;
    d.rect(x, y, 1, 1, C.Pale, 0.55);
  }
}

export function handPos(a: Actor): { x: number; y: number } {
  const up = a.facing === 'up';
  const side = a.facing === 'left' || a.facing === 'right';
  const dx = side ? (a.facing === 'right' ? 5 : -5) : 5;
  return { x: a.x + dx, y: a.y - (up ? 15 : 14) };
}

/** Mirrored copy of a character in the water — used when someone is
 *  standing out on the pier. */
export function drawActorReflection(d: Draw, a: Actor, time: number): void {
  const { dir, flip } = dirFor(a.facing);
  const key = charKey(a.hue, dir, poseFor(a, time));
  d.reflection(key, a.x, a.y, time, 0.3, 0.58, flip);
}

function plot(d: Draw, x0: number, y0: number, x1: number, y1: number, col: C): void {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    d.rect(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1, 1, col, 1);
  }
}
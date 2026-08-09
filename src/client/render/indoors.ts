/** Drawing a room.
 *
 *  Much simpler than the outdoor pass: no sky shader, no weather, no
 *  parallax. What it does need is its own light. A room is lit by a lamp,
 *  so it stays warm at noon and barely changes at midnight — walking inside
 *  should feel like stepping out of the weather. */

import { TILE } from '../../shared/constants';
import { view } from '../engine/view';
import { C } from '../art/palette';
import { VARIANTS } from '../art/atlas';
import { Blend } from '../engine/batch';
import { ITile, tileAtI, type Furniture, type Interior } from '../world/interior';
import type { Draw } from './draw';
import type { Renderable } from './scene';

/** Ambient light inside. Barely moves with the clock on purpose. */
export function indoorAmbient(night: number): [number, number, number] {
  const n = Math.min(1, Math.max(0, night));
  return [
    0.95 - n * 0.10,
    0.86 - n * 0.10,
    0.74 - n * 0.06,
  ];
}

export function drawRoom(d: Draw, it: Interior, time: number): void {
  const style = it.style === 'cozy' ? 'cozy' : it.style;

  for (let ty = 0; ty < it.h; ty++) {
    for (let tx = 0; tx < it.w; tx++) {
      const t = tileAtI(it, tx, ty);
      if (t === ITile.Void) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      const v = (tx * 3 + ty * 5) % VARIANTS.floor;

      switch (t) {
        case ITile.Wall:
          d.sprite(`iwall_${style}${v}`, x, y);
          break;
        case ITile.Rug:
          d.sprite(`floor_${style}${v}`, x, y);
          d.sprite(`rug${(tx + ty) % VARIANTS.rug}`, x, y);
          break;
        case ITile.Door:
          d.sprite(`floor_${style}${v}`, x, y);
          // The way out, marked by light coming under the door.
          d.rect(x + 2, y, TILE - 4, 3, C.Lantern, 0.35 + 0.15 * Math.sin(time * 2));
          d.rect(x, y + TILE - 2, TILE, 2, C.InkDeep, 0.5);
          break;
        default:
          d.sprite(`floor_${style}${v}`, x, y);
          break;
      }
    }
  }

  // Ambient occlusion where the floor meets the wall. One dark band does
  // more for the sense of an enclosed space than any amount of furniture.
  for (let ty = 0; ty < it.h; ty++) {
    for (let tx = 0; tx < it.w; tx++) {
      if (tileAtI(it, tx, ty) !== ITile.Wall) continue;
      if (tileAtI(it, tx, ty + 1) === ITile.Floor || tileAtI(it, tx, ty + 1) === ITile.Rug) {
        d.rect(tx * TILE, (ty + 1) * TILE, TILE, 3, C.InkDeep, 0.32);
        d.rect(tx * TILE, (ty + 1) * TILE + 3, TILE, 2, C.InkDeep, 0.16);
      }
      if (tileAtI(it, tx + 1, ty) === ITile.Floor) {
        d.rect((tx + 1) * TILE, ty * TILE, 3, TILE, C.InkDeep, 0.24);
      }
      if (tileAtI(it, tx - 1, ty) === ITile.Floor) {
        d.rect(tx * TILE - 3, ty * TILE, 3, TILE, C.InkDeep, 0.24);
      }
    }
  }
}

const SPRITE: Record<Furniture['kind'], (v: number) => string> = {
  bed: (v) => `f_bed${v % VARIANTS.furn}`,
  table: (v) => `f_table${v % VARIANTS.furn}`,
  shelf: (v) => `f_shelf${v % VARIANTS.furn}`,
  plant: (v) => `f_plant${v % VARIANTS.furn}`,
  painting: (v) => `f_painting${v % VARIANTS.furn}`,
  chair: () => 'f_chair',
  chest: () => 'f_chest',
  stove: () => 'f_stove',
  anvil: () => 'f_anvil',
  terminal: () => 'f_terminal',
  barrel: () => 'f_barrel',
  lamp: () => 'f_lamp',
  window: () => 'f_window',
  rug: () => 'f_chair',
};

export function furnitureRenderables(d: Draw, it: Interior): Renderable[] {
  return it.furniture.map((f) => ({
    // Wall-mounted things sort behind everything on the floor.
    y: f.kind === 'window' || f.kind === 'painting' ? -1 : f.y,
    draw: () => {
      const name = SPRITE[f.kind](f.variant);
      const frame = d.frame(name);
      if (!frame) return;
      // Furniture sits on the floor, so a contact shadow grounds it the
      // same way it does outdoors.
      if (f.solidW > 0) {
        d.sprite('shadow', f.x - 8, f.y - 5, { tint: [0, 0, 0], flat: true, alpha: 0.28 });
      }
      d.spriteFoot(name, f.x, f.y);
    },
  }));
}

/** Lamps, stoves and screens throw light. Drawn additively after everything
 *  so the room has a source rather than a flat wash. */
export function drawRoomLight(d: Draw, it: Interior, time: number): void {
  // Additive light over a pale floor saturates to white almost immediately.
  // A keep's flagstones are the lightest surface in the game, so its lamps
  // get pulled back; a dark neon shopfront can take the full glow.
  const surface = it.style === 'medieval' ? 0.62 : it.style === 'cyber' ? 1.1 : 1;

  for (const f of it.furniture) {
    let size = 0;
    let tint: [number, number, number] = [1, 0.82, 0.5];
    let power = 0;
    switch (f.kind) {
      case 'lamp': size = 64; power = 0.5; break;
      case 'stove': size = 64; tint = [1, 0.6, 0.3]; power = 0.42; break;
      case 'terminal': size = 32; tint = [0.5, 1, 0.85]; power = 0.34; break;
      case 'window': size = 32; tint = [0.8, 0.9, 1]; power = 0.22; break;
      default: continue;
    }
    const flicker = f.kind === 'stove'
      ? 0.85 + 0.15 * Math.sin(time * 4.3 + f.x)
      : 1;
    d.sprite(`glow${size}`, f.x - size / 2, f.y - 14 - size / 2, {
      tint, alpha: power * flicker * surface, blend: Blend.Add,
    });
  }
}

/** Everything outside the room's footprint is black, so the room reads as
 *  a space rather than as an island floating on the world. */
export function drawRoomVignette(d: Draw, it: Interior, camX: number, camY: number): void {
  const roomW = it.w * TILE;
  const roomH = it.h * TILE;
  if (camX < 0) d.rect(camX, camY, -camX, view.h, C.InkDeep, 1);
  if (camX + view.w > roomW) {
    d.rect(roomW, camY, camX + view.w - roomW, view.h, C.InkDeep, 1);
  }
  if (camY < 0) d.rect(camX, camY, view.w, -camY, C.InkDeep, 1);
  if (camY + view.h > roomH) {
    d.rect(camX, roomH, view.w, camY + view.h - roomH, C.InkDeep, 1);
  }
}

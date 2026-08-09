/** Draws the world: ground, props, entities, and the small living details
 *  (sway, fireflies, rain) that decide whether a static pixel map feels
 *  like a place or a screenshot. */

import { MAP_H, MAP_W, TILE } from '../../shared/constants';
import { view } from '../engine/view';
import { valueNoise } from '../art/canvas';
import { C } from '../art/palette';
import { VARIANTS } from '../art/atlas';
import { Tile, isWater, tileAt, type Prop, type WorldMap } from '../world/map';
import type { Lighting } from '../world/lighting';
import { Blend } from '../engine/batch';
import type { Draw } from './draw';

export interface Renderable {
  /** Sort key — the y of the object's feet. */
  y: number;
  draw: () => void;
}

const CANOPY_SPLIT = 0.55;

export function drawGround(
  d: Draw, map: WorldMap, camX: number, camY: number, time: number, L: Lighting,
): void {
  const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const tx1 = Math.min(MAP_W, Math.ceil((camX + view.w) / TILE) + 1);
  const ty1 = Math.min(MAP_H, Math.ceil((camY + view.h) / TILE) + 1);

  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      const i = ty * MAP_W + tx;
      if (i < 0 || i >= map.tiles.length) continue;
      const t = map.tiles[i] as Tile;
      const v = map.variant[i];
      const x = tx * TILE;
      const y = ty * TILE;

      switch (t) {
        case Tile.Water:
          break; // the sky/water shader already owns these pixels
        case Tile.River: {
          // The shader's flat far-water reads fine as river water; what it
          // lacks is a current. Streaks drifting downstream supply it.
          const drift = (time * 22 + tx * 7) % 16;
          d.rect(x, y, TILE, TILE, C.WaterSh, 0.16);
          for (let k = 0; k < 2; k++) {
            const sy = (y + drift + k * 8) % (y + TILE) + (y - (y % TILE));
            d.rect(x + 2 + ((tx * 5 + k * 7) % 10), sy, 4, 1, C.Foam, 0.22);
          }
          break;
        }
        case Tile.Swamp: {
          // Still, dark, and slightly green. Nothing moves here on purpose.
          d.rect(x, y, TILE, TILE, C.ForestDp, 0.55);
          d.rect(x, y, TILE, TILE, C.InkDeep, 0.22);
          const n = valueNoise(tx * 0.6, ty * 0.6 + time * 0.05, 23);
          if (n > 0.72) d.rect(x + ((tx * 3) % 12), y + ((ty * 5) % 12), 3, 1, C.Forest, 0.5);
          break;
        }
        case Tile.Cobble:
          d.sprite(`cobble${v % VARIANTS.cobble}`, x, y);
          break;
        case Tile.Concrete:
          d.sprite(`concrete${v % VARIANTS.concrete}`, x, y);
          break;
        case Tile.Grate:
          d.sprite('grate', x, y);
          break;
        case Tile.Grove:
          d.sprite(`grove${v % VARIANTS.grove}`, x, y);
          break;
        case Tile.Spirit: {
          // A still pool that lights itself. Painted opaque rather than as
          // a wash: the lake shader underneath is a *lake*, and letting it
          // show through turns the pool back into ordinary blue water.
          d.rect(x, y, TILE, TILE, C.Ink, 1);
          d.rect(x, y, TILE, TILE, C.Arcane, 0.5);
          // Slow, wide bands rather than chop — this water is meant to look
          // like it is thinking.
          const glow = 0.5 + 0.5 * Math.sin(time * 0.5 + ty * 0.55);
          d.rect(x, y + 4, TILE, 2, C.ArcaneLt, 0.10 + glow * 0.18);
          d.rect(x, y + 11, TILE, 1, C.NeonMint, 0.06 + glow * 0.12);
          if (valueNoise(tx * 0.7, ty * 0.7 + time * 0.08, 41) > 0.78) {
            d.rect(x + ((tx * 5) % 12), y + ((ty * 7) % 12), 2, 1, C.NeonMint, 0.6);
          }
          // A lit rim where the pool meets the bank.
          if (!isWater(tileAt(map, tx, ty - 1))) d.rect(x, y, TILE, 1, C.NeonMint, 0.4);
          if (!isWater(tileAt(map, tx, ty + 1))) d.rect(x, y + TILE - 1, TILE, 1, C.Arcane, 0.5);
          if (!isWater(tileAt(map, tx - 1, ty))) d.rect(x, y, 1, TILE, C.Arcane, 0.45);
          if (!isWater(tileAt(map, tx + 1, ty))) d.rect(x + TILE - 1, y, 1, TILE, C.Arcane, 0.45);
          break;
        }
        case Tile.Shallow: {
          // A translucent lightening over the shader water, breathing
          // slowly so the waterline never looks like a hard cut.
          const pulse = 0.5 + 0.5 * Math.sin(time * 0.9 + tx * 0.6);
          d.rect(x, y, TILE, TILE, C.Foam, 0.10 + pulse * 0.07);
          break;
        }
        case Tile.Sand:
          d.sprite(`sand${v % VARIANTS.sand}`, x, y);
          break;
        case Tile.Dirt:
        case Tile.Plot:
          // Plots get the plain soil here; the raised bed is drawn on top
          // as one object per plot so its furrows line up across tiles.
          d.sprite(`dirt${v % VARIANTS.dirt}`, x, y);
          break;
        case Tile.Dock:
          d.sprite(`dock${tx % 3 === 0 ? 'v' : 'v'}${v % VARIANTS.dock}`, x, y);
          break;
        default: {
          // Large soft patches of light and shade across the field, from a
          // low-frequency noise. Uniform grass is what makes a big lawn
          // look like a placeholder.
          // Jittering the threshold per tile breaks the boundary between
          // tones into a ragged edge instead of a straight line of tiles.
          const patch = valueNoise(tx * 0.075, ty * 0.075, 131)
            + (valueNoise(tx * 1.7, ty * 1.7, 17) - 0.5) * 0.13;
          const tone = patch > 0.60 ? 2 : patch > 0.38 ? 1 : 0;
          d.sprite(`grass${tone}_${v % VARIANTS.grass}`, x, y);
          break;
        }
      }
    }
  }

  // The spirit pool's bank. Its outline is an ellipse quantised to tiles,
  // which shows as a staircase unless something breaks the edge up. The
  // grass fringes already have the right raggedness, so they get reused as
  // a silhouette and flood-filled with the pool's own colour.
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      if ((map.tiles[ty * MAP_W + tx] as Tile) !== Tile.Grove) continue;
      const v = map.variant[ty * MAP_W + tx] % VARIANTS.fringe;
      const x = tx * TILE;
      const y = ty * TILE;
      const opts = { flat: true, tint: [0.30, 0.16, 0.52] as [number, number, number], alpha: 0.85 };
      if (tileAt(map, tx, ty - 1) === Tile.Spirit) d.sprite(`fringe0_${v}`, x, y, opts);
      if (tileAt(map, tx + 1, ty) === Tile.Spirit) d.sprite(`fringe1_${(v + 1) % VARIANTS.fringe}`, x, y, opts);
      if (tileAt(map, tx, ty + 1) === Tile.Spirit) d.sprite(`fringe2_${(v + 2) % VARIANTS.fringe}`, x, y, opts);
      if (tileAt(map, tx - 1, ty) === Tile.Spirit) d.sprite(`fringe3_${(v + 3) % VARIANTS.fringe}`, x, y, opts);
    }
  }

  // The pier's own shadow on the water. Without it the planks look like a
  // sticker laid on the lake instead of a structure standing above it.
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      if ((map.tiles[ty * MAP_W + tx] as Tile) !== Tile.Dock) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      if (isWater(tileAt(map, tx, ty + 1))) {
        d.rect(x + 1, y + TILE, TILE, 3, C.InkDeep, 0.30);
        d.rect(x + 2, y + TILE + 3, TILE, 2, C.InkDeep, 0.16);
      }
      if (isWater(tileAt(map, tx + 1, ty))) {
        d.rect(x + TILE, y + 2, 3, TILE, C.InkDeep, 0.26);
      }
      if (isWater(tileAt(map, tx - 1, ty))) {
        d.rect(x - 2, y + 2, 2, TILE, C.InkDeep, 0.16);
      }
    }
  }

  // Ragged grass fringe wherever soil or sand borders the field. This is
  // what removes the rectangles from every dirt patch on the map.
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      const i = ty * MAP_W + tx;
      const t = map.tiles[i] as Tile;
      // Cobble and grove edges get the same ragged grass overlap as soil,
      // so no district ends on a straight tile boundary.
      if (t !== Tile.Dirt && t !== Tile.Plot && t !== Tile.Sand
        && t !== Tile.Cobble && t !== Tile.Grove) continue;
      const v = map.variant[i] % VARIANTS.fringe;
      const x = tx * TILE;
      const y = ty * TILE;
      if (grassy(map, tx, ty - 1)) d.sprite(`fringe0_${v}`, x, y);
      if (grassy(map, tx + 1, ty)) d.sprite(`fringe1_${(v + 1) % VARIANTS.fringe}`, x, y);
      if (grassy(map, tx, ty + 1)) d.sprite(`fringe2_${(v + 2) % VARIANTS.fringe}`, x, y);
      if (grassy(map, tx - 1, ty)) d.sprite(`fringe3_${(v + 3) % VARIANTS.fringe}`, x, y);
    }
  }

  // Planting beds, one sprite per 2x1 plot.
  for (const plot of map.plots) {
    const x = plot.tx * TILE;
    const y = plot.ty * TILE;
    if (x < camX - 40 || x > camX + view.w + 40 || y < camY - 40 || y > camY + view.h + 40) continue;
    d.sprite(`bed${plot.i % 3}`, x, y - 2);
  }

  // Foam line right where land meets water, animated per column.
  for (let tx = tx0; tx < tx1 && tx < map.shore.length; tx++) {
    const row = map.shore[tx];
    const wob = Math.sin(time * 1.3 + tx * 0.8) * 1.5;
    const y = row * TILE + wob;
    d.rect(tx * TILE, y, TILE, 1, C.Foam, 0.32 + 0.18 * Math.sin(time * 2 + tx));
    d.rect(tx * TILE, y + 1, TILE, 1, C.WaterBr, 0.18);
  }

  void L;
}

function grassy(map: WorldMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const t = map.tiles[ty * MAP_W + tx] as Tile;
  return t === Tile.Grass || t === Tile.Blocked;
}

/** Props sway by drawing the top of the sprite offset by a pixel. Whole-
 *  sprite jitter looks like a glitch; splitting canopy from trunk reads as
 *  wind. */
export function propRenderable(d: Draw, p: Prop, time: number, L: Lighting): Renderable {
  return {
    y: p.y,
    draw: () => {
      switch (p.kind) {
        case 'tree': {
          const name = `tree${p.variant % VARIANTS.tree}`;
          const f = d.frame(name);
          if (!f) return;
          // A long shadow leaning away from the sun is most of what makes
          // the world feel lit rather than merely coloured.
          d.castShadow(p.x, p.y - 1, f.w * 0.55, 9, L.sunX, L.sunY, 0.36 * (1 - L.night * 0.55));
          const split = Math.round(f.h * CANOPY_SPLIT);
          const sway = Math.round(Math.sin(time * 0.7 + p.x * 0.05) * 1.2);
          const x = p.x - f.w / 2;
          const y = p.y - f.h;
          d.sprite(name, x + sway, y, { clip: { x: 0, y: 0, w: f.w, h: split } });
          d.sprite(name, x, y + split, { clip: { x: 0, y: split, w: f.w, h: f.h - split } });
          break;
        }
        case 'bush':
        case 'tallgrass':
        case 'reed':
        case 'flower': {
          const set = p.kind === 'bush' ? VARIANTS.bush
            : p.kind === 'reed' ? VARIANTS.reed
            : p.kind === 'tallgrass' ? VARIANTS.tallgrass
            : VARIANTS.flower;
          const name = `${p.kind}${p.variant % set}`;
          const f = d.frame(name);
          if (!f) return;
          if (p.kind === 'bush') {
            d.castShadow(p.x, p.y - 1, f.w * 0.6, 5, L.sunX, L.sunY, 0.22 * (1 - L.night * 0.6));
          }
          const sway = Math.round(Math.sin(time * 1.4 + p.x * 0.09 + p.y * 0.03) * 1.1);
          d.sprite(name, p.x - f.w / 2 + sway, p.y - f.h);
          break;
        }
        case 'pebbles': {
          const name = `pebbles${p.variant % VARIANTS.pebbles}`;
          d.spriteFoot(name, p.x, p.y);
          break;
        }
        // --- district props. Tall stone and steel get the same cast
        // shadow treatment as trees so they sit in the same world.
        case 'tower':
        case 'wallseg':
        case 'antenna':
        case 'spirittree': {
          const set = p.kind === 'tower' ? VARIANTS.tower
            : p.kind === 'wallseg' ? VARIANTS.wallseg
            : p.kind === 'antenna' ? VARIANTS.antenna
            : VARIANTS.spirittree;
          const name = `${p.kind}${p.variant % set}`;
          const f = d.frame(name);
          if (!f) return;
          d.castShadow(p.x, p.y - 1, f.w * 0.6, 8, L.sunX, L.sunY, 0.30 * (1 - L.night * 0.6));
          if (p.kind === 'spirittree') {
            const sway = Math.round(Math.sin(time * 0.6 + p.x * 0.05) * 1.1);
            const split = Math.round(f.h * CANOPY_SPLIT);
            d.sprite(name, p.x - f.w / 2 + sway, p.y - f.h, { clip: { x: 0, y: 0, w: f.w, h: split } });
            d.sprite(name, p.x - f.w / 2, p.y - f.h + split, { clip: { x: 0, y: split, w: f.w, h: f.h - split } });
          } else {
            d.spriteFoot(name, p.x, p.y);
          }
          break;
        }
        case 'banner':
        case 'sign':
        case 'mushroom':
        case 'crystal':
        case 'rune': {
          const set = p.kind === 'banner' ? VARIANTS.banner
            : p.kind === 'sign' ? VARIANTS.sign
            : p.kind === 'mushroom' ? VARIANTS.mushroom
            : p.kind === 'crystal' ? VARIANTS.crystal
            : VARIANTS.rune;
          const name = `${p.kind}${p.variant % set}`;
          const f = d.frame(name);
          if (!f) return;
          // Banners hang and stir; everything else is rigid.
          const sway = p.kind === 'banner'
            ? Math.round(Math.sin(time * 1.1 + p.x * 0.07) * 1.2)
            : 0;
          d.sprite(name, p.x - f.w / 2 + sway, p.y - f.h);
          break;
        }
        case 'plaque':
        case 'terminal':
        case 'tablet':
        case 'notice': {
          const name = `${p.kind}${p.variant % VARIANTS.marker}`;
          const f = d.frame(name);
          if (!f) return;
          d.castShadow(p.x, p.y - 1, f.w * 0.7, 4, L.sunX, L.sunY, 0.24 * (1 - L.night * 0.6));
          d.spriteFoot(name, p.x, p.y);
          break;
        }
        case 'ruinwall': {
          const name = `wallseg${p.variant % VARIANTS.wallseg}`;
          const f = d.frame(name);
          if (!f) return;
          d.castShadow(p.x, p.y - 1, f.w * 0.6, 7, L.sunX, L.sunY, 0.28 * (1 - L.night * 0.6));
          d.spriteFoot(name, p.x, p.y);
          break;
        }
        case 'milestone':
        case 'campfire':
        case 'pylon': {
          const f = d.frame(p.kind);
          if (!f) return;
          d.castShadow(p.x, p.y - 1, f.w * 0.6, 5, L.sunX, L.sunY, 0.26 * (1 - L.night * 0.6));
          d.spriteFoot(p.kind, p.x, p.y);
          break;
        }
        case 'keephall':
        case 'gatehouse': {
          const f = d.frame(p.kind);
          if (!f) return;
          d.castShadow(p.x, p.y - 2, f.w * 0.6, 12, L.sunX, L.sunY, 0.30 * (1 - L.night * 0.55));
          d.spriteFoot(p.kind, p.x, p.y);
          break;
        }
        case 'torch':
        case 'pipe':
        case 'chainfence': {
          d.spriteFoot(p.kind, p.x, p.y);
          break;
        }
        case 'lily': {
          const name = `lily${p.variant % VARIANTS.lily}`;
          const f = d.frame(name);
          if (!f) return;
          const bob = Math.round(Math.sin(time * 0.8 + p.x * 0.07) * 1.0);
          d.sprite(name, p.x - f.w / 2, p.y - f.h + bob);
          break;
        }
        case 'rock': {
          const name = `rock${p.variant % VARIANTS.rock}`;
          const f = d.frame(name);
          if (f) d.castShadow(p.x, p.y - 1, f.w * 0.7, 4, L.sunX, L.sunY, 0.24 * (1 - L.night * 0.6));
          d.spriteFoot(name, p.x, p.y);
          break;
        }
        case 'cabin': {
          const f = d.frame('cabin');
          if (f) d.castShadow(p.x, p.y - 2, f.w * 0.6, 14, L.sunX, L.sunY, 0.26 * (1 - L.night * 0.6));
          d.spriteFoot('cabin', p.x, p.y);
          break;
        }
        case 'block':
        case 'tank': {
          const set = p.kind === 'block' ? VARIANTS.block : VARIANTS.tank;
          const name = `${p.kind}${p.variant % set}`;
          const f = d.frame(name);
          if (!f) return;
          if (p.kind === 'block') {
            d.castShadow(p.x, p.y - 1, f.w * 0.7, 10, L.sunX, L.sunY, 0.34 * (1 - L.night * 0.5));
          }
          d.spriteFoot(name, p.x, p.y);
          break;
        }
        case 'house': {
          const name = `house${p.variant % VARIANTS.house}`;
          const f = d.frame(name);
          if (f) d.castShadow(p.x, p.y - 2, f.w * 0.6, 12, L.sunX, L.sunY, 0.26 * (1 - L.night * 0.6));
          d.spriteFoot(name, p.x, p.y);
          break;
        }
        case 'deadtree': {
          const name = `deadtree${p.variant % VARIANTS.deadtree}`;
          const f = d.frame(name);
          if (!f) return;
          const sway = Math.round(Math.sin(time * 0.5 + p.x * 0.04) * 0.9);
          d.sprite(name, p.x - f.w / 2 + sway, p.y - f.h);
          break;
        }
        default: {
          const f = d.frame(p.kind);
          if (f) d.castShadow(p.x, p.y - 1, f.w * 0.7, 4, L.sunX, L.sunY, 0.2 * (1 - L.night * 0.6));
          d.spriteFoot(p.kind, p.x, p.y);
          break;
        }
      }
    },
  };
}

/** Neon smearing down wet concrete.
 *
 *  This is the single detail that makes a cyberpunk street read as one: the
 *  ground is not lit by the sign, it *carries* the sign — a soft vertical
 *  column of the same hue, blurred and dimmer, running down from every
 *  emitter. Cheap to draw, and it does more than any amount of extra
 *  geometry. */
export function drawNeonWash(d: Draw, map: WorldMap, camX: number, camY: number, time: number): void {
  for (const p of map.props) {
    if (p.kind !== 'sign' && p.kind !== 'antenna') continue;
    if (p.x < camX - 60 || p.x > camX + view.w + 60) continue;
    if (p.y < camY - 80 || p.y > camY + view.h + 90) continue;

    const hue: [number, number, number] = p.kind === 'antenna'
      ? [1.0, 0.35, 0.65]
      : p.variant % 3 === 0 ? [0.15, 0.85, 1.0]
      : p.variant % 3 === 1 ? [1.0, 0.30, 0.65]
      : [0.55, 1.0, 0.82];

    // The wash only lands where there is actually wet ground under it.
    const tx = Math.floor(p.x / TILE);
    const startTy = Math.floor(p.y / TILE);
    const flicker = 0.82 + 0.18 * Math.sin(time * 7.3 + p.x * 0.9) * Math.sin(time * 2.1 + p.y);

    for (let k = 0; k < 4; k++) {
      const ty = startTy + k;
      const t = map.tiles[ty * MAP_W + tx] as Tile;
      if (t !== Tile.Concrete && t !== Tile.Grate) break;
      // Widens and fades with distance, and wobbles a little so it reads as
      // a reflection on water rather than as a painted stripe.
      // Falls off fast. A long even column reads as a laser beam; a short
      // one that dies within a few tiles reads as light on wet ground.
      const fade = Math.pow(1 - k / 4, 1.8) * 0.20 * flicker;
      const wob = Math.sin(time * 1.4 + k * 0.8 + p.x * 0.05) * (k * 0.5);
      const w = 5 + k * 3;
      d.rectRGB(p.x - w / 2 + wob, ty * TILE, w, TILE, hue[0], hue[1], hue[2], fade);
    }
  }
}

/** Anything standing in or over the water gets a mirrored copy. Drawn as a
 *  separate pass under the props, so reflections never sit on top of the
 *  things casting them. */
export function drawReflections(d: Draw, map: WorldMap, camX: number, camY: number, time: number): void {
  for (const p of map.props) {
    if (p.x < camX - 60 || p.x > camX + view.w + 60) continue;
    if (p.y < camY - 80 || p.y > camY + view.h + 80) continue;

    // The reflection lands below the object, so what matters is whether
    // *that* is open water — not whether the object itself is on a plank.
    const tx = Math.floor(p.x / TILE);
    const below = tileAt(map, tx, Math.floor(p.y / TILE) + 1);
    if (!isWater(below)) continue;

    let name: string | null = null;
    switch (p.kind) {
      case 'dockpost': name = 'dockpost'; break;
      case 'lantern': name = 'lantern'; break;
      case 'reed': name = `reed${p.variant % VARIANTS.reed}`; break;
      default: name = null;
    }
    if (!name) continue;
    d.reflection(name, p.x, p.y, time, 0.34);
  }
}

/** Warm pools of light under lanterns and cabin windows, drawn additively
 *  once the sun is low. */
export function drawLampLight(d: Draw, map: WorldMap, time: number, L: Lighting): void {
  const strength = L.night;
  for (const p of map.props) {
    const flicker = 0.88 + 0.12 * Math.sin(time * 3.1 + p.x * 0.4) * Math.sin(time * 1.7 + p.y * 0.2);
    let size = 32;
    let tint: [number, number, number] = [1, 0.82, 0.5];
    let power = 0.55;
    let lift = 20;
    let always = false;

    switch (p.kind) {
      case 'lantern': break;
      case 'cabin':
      case 'house': size = 64; break;
      case 'torch':
        size = 32;
        tint = [1, 0.62, 0.28];
        power = 0.62;
        lift = 14;
        break;
      case 'sign':
        // Signs burn day and night — that is what makes the district read
        // as a city rather than as a village with odd decorations. The halo
        // stays small: the light that sells it is the wash on the ground,
        // not a bloom the size of the sign itself.
        size = 16;
        power = 0.34;
        lift = 14;
        always = true;
        tint = p.variant % 3 === 0 ? [0.15, 0.9, 1.0]
          : p.variant % 3 === 1 ? [1.0, 0.32, 0.68]
          : [0.58, 1.0, 0.84];
        break;
      case 'mushroom':
        size = 16; tint = [0.55, 1.0, 0.8]; power = 0.5; lift = 6; always = true;
        break;
      case 'crystal':
        size = 32; tint = [0.72, 0.52, 1.0]; power = 0.42; lift = 10; always = true;
        break;
      case 'rune':
        size = 32; tint = [0.62, 0.36, 1.0]; power = 0.38; lift = 14; always = true;
        break;
      case 'spirittree':
        size = 64; tint = [0.6, 0.85, 1.0]; power = 0.32; lift = 30; always = true;
        break;
      default:
        continue;
    }

    const amount = always ? Math.max(0.35, strength) : strength;
    d.sprite(`glow${size}`, p.x - size / 2, p.y - lift - size / 2, {
      tint,
      alpha: amount * power * flicker,
      blend: Blend.Add,
    });
  }
}

// ------------------------------------------------------------------ particles

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  kind: 'firefly' | 'rain' | 'splash' | 'mote' | 'leaf' | 'spark' | 'smoke' | 'bird';
  seed: number;
}

export class Particles {
  private items: Particle[] = [];
  private acc = 0;

  spawnSplash(x: number, y: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 12 + Math.random() * 26;
      this.items.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.5 - 22,
        life: 0, maxLife: 0.45 + Math.random() * 0.3,
        kind: 'splash', seed: Math.random(),
      });
    }
  }

  /** Chimney smoke. Emitted by the renderer for every roof on screen, so
   *  the village looks occupied rather than abandoned. */
  spawnSmoke(x: number, y: number): void {
    this.items.push({
      x, y,
      vx: -3 - Math.random() * 4,
      vy: -7 - Math.random() * 5,
      life: 0, maxLife: 3.5 + Math.random() * 2,
      kind: 'smoke', seed: Math.random() * 100,
    });
  }

  spawnBird(camX: number, camY: number): void {
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.items.push({
      x: dir > 0 ? camX - 20 : camX + view.w + 20,
      y: camY + 10 + Math.random() * 60,
      vx: dir * (26 + Math.random() * 16),
      vy: -2 + Math.random() * 4,
      life: 0, maxLife: 26,
      kind: 'bird', seed: Math.random() * 100,
    });
  }

  spawnSpark(x: number, y: number, n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 10 + Math.random() * 30;
      this.items.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 10,
        life: 0, maxLife: 0.6 + Math.random() * 0.5,
        kind: 'spark', seed: Math.random(),
      });
    }
  }

  update(dt: number, camX: number, camY: number, L: Lighting, rain: number): void {
    // --- ambient spawners, budgeted per second and tied to the weather
    this.acc += dt;
    if (this.acc > 0.05) {
      this.acc = 0;
      if (L.night > 0.35 && rain < 0.3 && this.count('firefly') < 46) {
        this.items.push({
          x: camX + Math.random() * view.w,
          y: camY + view.h * 0.35 + Math.random() * view.h * 0.7,
          vx: 0, vy: 0,
          life: 0, maxLife: 6 + Math.random() * 6,
          kind: 'firefly', seed: Math.random() * 100,
        });
      }
      if (L.night < 0.3 && rain < 0.2 && this.count('mote') < 30) {
        this.items.push({
          x: camX + Math.random() * view.w,
          y: camY + Math.random() * view.h,
          vx: 4 + Math.random() * 6, vy: -1 - Math.random() * 3,
          life: 0, maxLife: 4 + Math.random() * 4,
          kind: 'mote', seed: Math.random() * 100,
        });
      }
      if (rain > 0.05) {
        const n = Math.ceil(rain * 7);
        for (let i = 0; i < n; i++) {
          this.items.push({
            x: camX + Math.random() * (view.w + 60) - 30,
            y: camY - 8,
            vx: -34, vy: 260 + Math.random() * 90,
            life: 0, maxLife: 1.2,
            kind: 'rain', seed: Math.random(),
          });
        }
      }
      if (L.night < 0.5 && Math.random() < 0.02 && this.count('bird') < 4) {
        this.spawnBird(camX, camY);
      }
      if (rain < 0.2 && Math.random() < 0.18 && this.count('leaf') < 8) {
        this.items.push({
          x: camX + Math.random() * view.w,
          y: camY - 6,
          vx: -6 - Math.random() * 8, vy: 9 + Math.random() * 7,
          life: 0, maxLife: 7,
          kind: 'leaf', seed: Math.random() * 100,
        });
      }
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.items.splice(i, 1);
        continue;
      }
      switch (p.kind) {
        case 'firefly': {
          const t = p.life;
          p.x += Math.sin(t * 1.3 + p.seed) * 9 * dt;
          p.y += Math.cos(t * 0.9 + p.seed * 1.7) * 7 * dt;
          break;
        }
        case 'mote':
          p.x += p.vx * dt;
          p.y += (p.vy + Math.sin(p.life * 2 + p.seed) * 4) * dt;
          break;
        case 'leaf':
          p.x += (p.vx + Math.sin(p.life * 2.2 + p.seed) * 14) * dt;
          p.y += p.vy * dt;
          break;
        case 'rain':
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'splash':
          p.vy += 150 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'spark':
          p.vy += 40 * dt;
          p.vx *= 0.94;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'smoke':
          // Rises, slows, and drifts with the wind as it thins out.
          p.vy *= 0.985;
          p.x += (p.vx + Math.sin(p.life * 1.4 + p.seed) * 5) * dt;
          p.y += p.vy * dt;
          break;
        case 'bird':
          p.x += p.vx * dt;
          p.y += (p.vy + Math.sin(p.life * 1.1 + p.seed) * 6) * dt;
          break;
      }
      // Cull anything that has drifted well off-camera.
      if (p.x < camX - 80 || p.x > camX + view.w + 80 || p.y > camY + view.h + 80) {
        this.items.splice(i, 1);
      }
    }
  }

  private count(kind: Particle['kind']): number {
    let n = 0;
    for (const p of this.items) if (p.kind === kind) n++;
    return n;
  }

  draw(d: Draw, L: Lighting): void {
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      const fade = Math.min(1, Math.min(t * 6, (1 - t) * 6));
      switch (p.kind) {
        case 'firefly': {
          const blink = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(p.life * 2.1 + p.seed)), 3);
          const a = fade * blink * L.night;
          d.sprite('glow16', p.x - 8, p.y - 8, {
            tint: [1, 0.95, 0.55], alpha: a * 0.5, blend: Blend.Add,
          });
          d.rect(p.x, p.y, 1, 1, C.Lantern, a);
          break;
        }
        case 'mote':
          d.rect(p.x, p.y, 1, 1, C.SunGlow, fade * 0.5);
          break;
        case 'leaf':
          d.rect(p.x, p.y, 2, 1, C.Amber, fade * 0.75);
          break;
        case 'rain':
          d.rect(p.x, p.y, 1, 4, C.Pale, 0.32 * fade);
          break;
        case 'splash':
          d.rect(p.x, p.y, 1, 1, C.Foam, fade);
          break;
        case 'spark':
          d.rect(p.x, p.y, 1, 1, p.seed > 0.5 ? C.Lantern : C.White, fade);
          break;
        case 'smoke': {
          const grow = 1 + t * 2.5;
          d.rect(p.x, p.y, Math.round(grow), Math.round(grow), C.Mist, fade * 0.30 * (1 - t * 0.5));
          break;
        }
        case 'bird': {
          // Two pixels flapping. At this scale that is a whole bird.
          const flap = Math.sin(p.life * 9 + p.seed) > 0 ? 0 : 1;
          const dir = p.vx > 0 ? 1 : -1;
          d.rect(p.x, p.y, 1, 1, C.Ink, fade * 0.8);
          d.rect(p.x - dir, p.y - flap, 1, 1, C.Ink, fade * 0.8);
          d.rect(p.x + dir, p.y - flap, 1, 1, C.Ink, fade * 0.8);
          break;
        }
      }
    }
  }
}

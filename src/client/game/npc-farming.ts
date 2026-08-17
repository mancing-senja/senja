/** v3B autonomous farming.
 *
 * NPC farming is intentionally conservative: villagers may help water crops
 * that a player already planted, but they never spend the player's seeds,
 * harvest the player's produce, or sell anything. The room server remains
 * authoritative for the plot mutation; this controller only decides which
 * visible villager walks over and performs the work animation. */

import { CROP_STAGES, TILE } from '../../shared/constants';
import type { PlotState } from '../../shared/protocol';
import { isWalkable, type WorldMap } from '../world/map';
import { currentNpcWorld } from './npc-schedule';
import type { Npc } from './npc';

interface FarmerState {
  target: number | null;
  workT: number;
  restT: number;
  holdX: number;
  holdY: number;
}

const states = new WeakMap<Npc, FarmerState>();
const FARMER_IDS = new Set(['wahyu']);
const WALK_SPEED = 22;
const WORK_SECONDS = 1.35;
const REST_SECONDS = 2.2;
const REACH = 12;

export function updateNpcFarming(
  dt: number,
  npcs: Npc[],
  map: WorldMap,
  plots: PlotState[],
  onWater: (plotIndex: number) => void,
): void {
  const world = currentNpcWorld();
  for (const npc of npcs) {
    if (!FARMER_IDS.has(npc.mind.id)) continue;
    const st = stateFor(npc);

    // At night, while talking, or while rain is already doing the watering,
    // the normal schedule owns the NPC again.
    const farmingTime = /kebun/i.test(npc.destination) && world.rain <= 0.25;
    if (!farmingTime || npc.talking) {
      reset(st);
      continue;
    }

    st.restT = Math.max(0, st.restT - dt);
    if (st.workT > 0 && st.target !== null) {
      const plot = map.plots[st.target];
      const plotState = plots[st.target];
      if (!plot || !needsWater(plotState)) {
        reset(st);
        continue;
      }

      // Hold position while the two-beat tend animation plays. Npc.update()
      // has already run this frame; pinning here prevents its route walker
      // from tugging Wahyu away from the plant mid-swing.
      npc.x = st.holdX;
      npc.y = st.holdY;
      npc.faceToward(plot.tx * TILE + TILE, plot.ty * TILE + TILE);
      npc.action = 'tend';
      npc.animT += dt;
      st.workT = Math.max(0, st.workT - dt);

      if (st.workT === 0) {
        if (needsWater(plots[st.target])) onWater(st.target);
        st.target = null;
        st.restT = REST_SECONDS;
      }
      continue;
    }

    if (st.restT > 0) continue;
    if (st.target === null || !needsWater(plots[st.target])) {
      st.target = nearestDryPlot(npc, map, plots);
    }
    if (st.target === null) continue;

    const plot = map.plots[st.target];
    if (!plot) {
      st.target = null;
      continue;
    }

    // Stand just below the bed rather than on top of the crop sprite.
    const gx = plot.tx * TILE + TILE;
    const gy = plot.ty * TILE + TILE + 9;
    const dx = gx - npc.x;
    const dy = gy - npc.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= REACH) {
      st.holdX = npc.x;
      st.holdY = npc.y;
      st.workT = WORK_SECONDS;
      npc.faceToward(plot.tx * TILE + TILE, plot.ty * TILE + TILE);
      npc.action = 'tend';
      npc.animT += dt;
      continue;
    }

    const step = Math.min(dist, WALK_SPEED * dt);
    const nx = npc.x + (dx / dist) * step;
    const ny = npc.y + (dy / dist) * step;
    if (!isWalkable(map, Math.floor(nx / TILE), Math.floor(ny / TILE))) {
      // Do not fight pathing forever. Let the normal schedule move him and
      // try another dry bed after a short pause.
      st.target = null;
      st.restT = 0.8;
      continue;
    }

    npc.x = nx;
    npc.y = ny;
    npc.action = 'walk';
    npc.animT += dt;
    if (Math.abs(dx) > Math.abs(dy)) npc.facing = dx > 0 ? 'right' : 'left';
    else npc.facing = dy > 0 ? 'down' : 'up';
  }
}

function stateFor(npc: Npc): FarmerState {
  let st = states.get(npc);
  if (!st) {
    st = { target: null, workT: 0, restT: 0, holdX: npc.x, holdY: npc.y };
    states.set(npc, st);
  }
  return st;
}

function reset(st: FarmerState): void {
  st.target = null;
  st.workT = 0;
  st.restT = 0;
}

function needsWater(plot: PlotState | undefined): boolean {
  return Boolean(
    plot?.crop && plot.stage >= 1 && plot.stage < CROP_STAGES && !plot.watered,
  );
}

function nearestDryPlot(npc: Npc, map: WorldMap, plots: PlotState[]): number | null {
  let best: number | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const plot of map.plots) {
    if (!needsWater(plots[plot.i])) continue;
    const x = plot.tx * TILE + TILE;
    const y = plot.ty * TILE + TILE + 9;
    const d = Math.hypot(x - npc.x, y - npc.y);
    if (d < bestD) {
      bestD = d;
      best = plot.i;
    }
  }
  return best;
}

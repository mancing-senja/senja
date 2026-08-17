/** v3B autonomous farming.
 *
 * This module is loaded as a second Vite entry after the game. It attaches a
 * narrow farming behaviour to the existing Npc/Net lifecycles without
 * threading another controller through main.ts.
 *
 * The rule is deliberately conservative: Wahyu may water crops that players
 * already planted, but he never tills, spends seeds, harvests, or sells.
 * Online mutations still go through the room server; offline play mutates the
 * same local plot cache main.ts already exposes to its debug bridge. */

import { CROP_STAGES, TILE } from '../../shared/constants';
import type { PlotState } from '../../shared/protocol';
import { isWalkable, type WorldMap } from '../world/map';
import { currentNpcWorld } from './npc-schedule';
import { Npc } from './npc';
import { Net } from './net';

interface FarmerState {
  target: number | null;
  workT: number;
  restT: number;
  holdX: number;
  holdY: number;
}

const states = new WeakMap<Npc, FarmerState>();
const FARMER_IDS = new Set(['wahyu']);
const WALK_SPEED = 28;
const WORK_SECONDS = 1.35;
const REST_SECONDS = 2.2;
const REACH = 12;
let activeNet: Net | null = null;

// Capture the room connection on its normal update path. The second module
// entry loads before the first animation frame, so this sees the same Net
// instance main.ts already created rather than opening another connection.
const baseNetUpdate = Net.prototype.update;
Net.prototype.update = function patchedNetUpdate(
  this: Net,
  ...args: Parameters<Net['update']>
): void {
  activeNet = this;
  baseNetUpdate.apply(this, args);
};

// Let the normal NPC state machine refresh schedule, conversation and thought
// state first. Farming then nudges only the farmer's movement/action for this
// frame. Because Wahyu's authored route already circles the field, the
// override stays local instead of dragging him across the world.
const baseNpcUpdate = Npc.prototype.update;
Npc.prototype.update = function patchedNpcUpdate(
  this: Npc,
  ...args: Parameters<Npc['update']>
): void {
  baseNpcUpdate.apply(this, args);
  const [dt, map] = args;
  updateFarmer(dt, this, map);
};

function updateFarmer(dt: number, npc: Npc, map: WorldMap): void {
  if (!FARMER_IDS.has(npc.mind.id)) return;
  const world = currentNpcWorld();
  const st = stateFor(npc);

  // At night, while talking, or while rain already waters the beds, the
  // ordinary daily schedule owns Wahyu again.
  const farmingTime = /kebun/i.test(npc.destination) && world.rain <= 0.25;
  if (!farmingTime || npc.talking) {
    reset(st);
    return;
  }

  const plots = plotStates();
  if (!plots.length) return;

  st.restT = Math.max(0, st.restT - dt);
  if (st.workT > 0 && st.target !== null) {
    const plot = map.plots[st.target];
    const plotState = plots[st.target];
    if (!plot || !needsWater(plotState)) {
      reset(st);
      return;
    }

    // Pin his feet during the two-beat tending animation. The base Npc update
    // ran a moment ago, so this prevents its route walker from pulling him
    // away from the bed while the watering action is visibly happening.
    npc.x = st.holdX;
    npc.y = st.holdY;
    npc.faceToward(plot.tx * TILE + TILE, plot.ty * TILE + TILE);
    npc.action = 'tend';
    npc.animT += dt;
    st.workT = Math.max(0, st.workT - dt);

    if (st.workT === 0) {
      waterPlot(st.target, plots);
      st.target = null;
      st.restT = REST_SECONDS;
    }
    return;
  }

  if (st.restT > 0) return;
  if (st.target === null || !needsWater(plots[st.target])) {
    st.target = nearestDryPlot(npc, map, plots);
  }
  if (st.target === null) return;

  const plot = map.plots[st.target];
  if (!plot) {
    st.target = null;
    return;
  }

  // Stand below the bed rather than trampling through the crop sprite.
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
    return;
  }

  const step = Math.min(dist, WALK_SPEED * dt);
  const nx = npc.x + (dx / dist) * step;
  const ny = npc.y + (dy / dist) * step;
  if (!isWalkable(map, Math.floor(nx / TILE), Math.floor(ny / TILE))) {
    // Let the authored route move him around the obstacle and try again.
    st.target = null;
    st.restT = 0.8;
    return;
  }

  npc.x = nx;
  npc.y = ny;
  npc.action = 'walk';
  npc.animT += dt;
  if (Math.abs(dx) > Math.abs(dy)) npc.facing = dx > 0 ? 'right' : 'left';
  else npc.facing = dy > 0 ? 'down' : 'up';
}

function plotStates(): PlotState[] {
  if (activeNet?.status === 'online') return activeNet.plots;
  const fn = (window as unknown as { __plots?: () => PlotState[] }).__plots;
  try {
    return typeof fn === 'function' ? fn() : [];
  } catch {
    return [];
  }
}

function waterPlot(i: number, plots: PlotState[]): void {
  const plot = plots[i];
  if (!needsWater(plot)) return;

  if (activeNet?.status === 'online') {
    // The room server validates the same idempotent `water` operation players
    // use, so several clients watching Wahyu cannot double-water a plot.
    activeNet.send({ t: 'plot', i, op: 'water' });
    return;
  }

  // Offline mirrors main.ts' local `water` half so solo play still works.
  plot.watered = true;
  plot.t = Date.now();
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

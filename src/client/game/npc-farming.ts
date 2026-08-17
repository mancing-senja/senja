/** v3B autonomous farming.
 *
 * This module is loaded as a second Vite entry after the game. It attaches a
 * narrow farming behaviour to the existing Npc/Net lifecycles without
 * threading another controller through main.ts.
 *
 * Two deliberately different farming loops live here:
 * - Wahyu helps the player's shared farm by watering already-planted crops.
 * - Ki Lengan tends a private herb garden inside Rimbun Cahaya. His work is
 *   visual/world activity only and never mutates player-owned plots.
 *
 * Online shared-farm mutations still go through the room server; offline play
 * mutates the same local plot cache main.ts already exposes to its debug bridge. */

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

interface GroveFarmerState {
  key: string;
  target: number | null;
  done: boolean[];
  workT: number;
  restT: number;
  holdX: number;
  holdY: number;
}

const sharedFarmStates = new WeakMap<Npc, FarmerState>();
const groveFarmStates = new WeakMap<Npc, GroveFarmerState>();
const WALK_SPEED = 28;
const WORK_SECONDS = 1.35;
const GROVE_WORK_SECONDS = 1.55;
const REST_SECONDS = 2.2;
const GROVE_REST_SECONDS = 2.8;
const REACH = 12;
let activeNet: Net | null = null;

/** Ki Lengan's authored route already lives on the east side of the grove.
 * These offsets form a small private herb bed around that route, safely away
 * from the spirit pool in the middle. One pass is completed per day phase. */
const GROVE_BEDS: ReadonlyArray<readonly [number, number]> = [
  [15, -9],
  [17, -8],
  [19, -6],
  [20, -5],
];

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
// state first. Farming then nudges only the relevant farmer's movement/action
// for this frame. This keeps conversation and the authored schedule in charge
// whenever the farming rules do not explicitly claim the NPC.
const baseNpcUpdate = Npc.prototype.update;
Npc.prototype.update = function patchedNpcUpdate(
  this: Npc,
  ...args: Parameters<Npc['update']>
): void {
  baseNpcUpdate.apply(this, args);
  const [dt, map] = args;
  if (this.mind.id === 'wahyu') updateSharedFarmer(dt, this, map);
  else if (this.mind.id === 'lengan') updateGroveFarmer(dt, this, map);
};

function updateSharedFarmer(dt: number, npc: Npc, map: WorldMap): void {
  const world = currentNpcWorld();
  const st = sharedStateFor(npc);

  // At night, while talking, or while rain already waters the beds, the
  // ordinary daily schedule owns Wahyu again.
  const farmingTime = /kebun/i.test(npc.destination) && world.rain <= 0.25;
  if (!farmingTime || npc.talking) {
    resetShared(st);
    return;
  }

  const plots = plotStates();
  if (!plots.length) return;

  st.restT = Math.max(0, st.restT - dt);
  if (st.workT > 0 && st.target !== null) {
    const plot = map.plots[st.target];
    const plotState = plots[st.target];
    if (!plot || !needsWater(plotState)) {
      resetShared(st);
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

  moveNpc(npc, dt, dx, dy, nx, ny);
}

function updateGroveFarmer(dt: number, npc: Npc, map: WorldMap): void {
  const world = currentNpcWorld();
  const phase = groveWorkPhase(world.time);
  const st = groveStateFor(npc);

  // Ki Lengan tends his own garden in daylight only. Rain means the plants
  // are already getting what they need; conversation always wins too.
  if (!phase || world.rain > 0.3 || npc.talking) {
    resetGroveWork(st);
    return;
  }

  const key = `${world.day}:${phase}`;
  if (st.key !== key) {
    st.key = key;
    st.target = null;
    st.done = GROVE_BEDS.map(() => false);
    st.workT = 0;
    st.restT = 0;
  }

  // Once every bed has been visited this phase, control falls back to the
  // normal schedule. He gets a finite job instead of tending forever.
  if (st.done.every(Boolean)) return;

  st.restT = Math.max(0, st.restT - dt);
  if (st.workT > 0 && st.target !== null) {
    const bed = groveBed(map, st.target);
    npc.x = st.holdX;
    npc.y = st.holdY;
    npc.faceToward(bed.x, bed.y);
    npc.action = 'tend';
    npc.animT += dt;
    st.workT = Math.max(0, st.workT - dt);

    if (st.workT === 0) {
      st.done[st.target] = true;
      st.target = null;
      st.restT = GROVE_REST_SECONDS;
    }
    return;
  }

  if (st.restT > 0) return;
  if (st.target === null) st.target = nextGroveBed(npc, map, st.done);
  if (st.target === null) return;

  const bed = groveBed(map, st.target);
  const dx = bed.x - npc.x;
  const dy = bed.y - npc.y;
  const dist = Math.hypot(dx, dy);

  if (dist <= REACH) {
    st.holdX = npc.x;
    st.holdY = npc.y;
    st.workT = GROVE_WORK_SECONDS;
    npc.faceToward(bed.x, bed.y);
    npc.action = 'tend';
    npc.animT += dt;
    return;
  }

  const step = Math.min(dist, WALK_SPEED * dt);
  const nx = npc.x + (dx / dist) * step;
  const ny = npc.y + (dy / dist) * step;
  if (!isWalkable(map, Math.floor(nx / TILE), Math.floor(ny / TILE))) {
    // A generated prop can make one approach awkward. Skip only that bed for
    // the current phase rather than trapping Ki Lengan against scenery.
    st.done[st.target] = true;
    st.target = null;
    st.restT = 0.6;
    return;
  }

  moveNpc(npc, dt, dx, dy, nx, ny);
}

function moveNpc(npc: Npc, dt: number, dx: number, dy: number, nx: number, ny: number): void {
  npc.x = nx;
  npc.y = ny;
  npc.action = 'walk';
  npc.animT += dt;
  if (Math.abs(dx) > Math.abs(dy)) npc.facing = dx > 0 ? 'right' : 'left';
  else npc.facing = dy > 0 ? 'down' : 'up';
}

function groveWorkPhase(time: number): 'pagi' | 'siang' | 'senja' | null {
  const t = ((time % 1) + 1) % 1;
  if (t >= 0.28 && t < 0.45) return 'pagi';
  if (t < 0.66) return 'siang';
  if (t < 0.86) return 'senja';
  return null;
}

function groveBed(map: WorldMap, i: number): { x: number; y: number } {
  const [dx, dy] = GROVE_BEDS[i] ?? GROVE_BEDS[0];
  return {
    x: (map.landmarks.groveX + dx) * TILE + 8,
    y: (map.landmarks.groveY + dy) * TILE + 8,
  };
}

function nextGroveBed(npc: Npc, map: WorldMap, done: boolean[]): number | null {
  let best: number | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < GROVE_BEDS.length; i++) {
    if (done[i]) continue;
    const bed = groveBed(map, i);
    const d = Math.hypot(bed.x - npc.x, bed.y - npc.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
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

function sharedStateFor(npc: Npc): FarmerState {
  let st = sharedFarmStates.get(npc);
  if (!st) {
    st = { target: null, workT: 0, restT: 0, holdX: npc.x, holdY: npc.y };
    sharedFarmStates.set(npc, st);
  }
  return st;
}

function groveStateFor(npc: Npc): GroveFarmerState {
  let st = groveFarmStates.get(npc);
  if (!st) {
    st = {
      key: '', target: null, done: GROVE_BEDS.map(() => false),
      workT: 0, restT: 0, holdX: npc.x, holdY: npc.y,
    };
    groveFarmStates.set(npc, st);
  }
  return st;
}

function resetShared(st: FarmerState): void {
  st.target = null;
  st.workT = 0;
  st.restT = 0;
}

function resetGroveWork(st: GroveFarmerState): void {
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

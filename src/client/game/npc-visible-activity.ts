/** Activity-first NPC presentation.
 *
 * Earlier NPC phases had good goals/memory but most of that resolved to route
 * walking. This layer makes the authored jobs win on screen: Wahyu owns a
 * small community crop loop, fishing sessions actually end, and workers spend
 * readable blocks of time doing their job instead of immediately pacing on.
 *
 * Loaded after npc-farming.ts and before npc-gossip.ts. That order matters:
 * existing shared-farm help runs first, this layer makes the final visible
 * action concrete, then gossip observes what the player actually saw. */

import { CROP_STAGES, TILE } from '../../shared/constants';
import type { ClientMsg, PlayerAction, PlotState } from '../../shared/protocol';
import { isWalkable, type WorldMap } from '../world/map';
import { Net } from './net';
import { Npc } from './npc';
import { currentNpcWorld } from './npc-schedule';

type FarmOp = 'till' | 'plant' | 'water' | 'harvest';
type Phase = 'pagi' | 'siang' | 'senja' | 'malam';

interface ActivityContext {
  activity: string;
  goal: string;
  destination?: string;
}

interface WahyuState {
  target: number | null;
  op: FarmOp | null;
  workT: number;
  restT: number;
  holdX: number;
  holdY: number;
  animT: number;
}

interface FishingSession {
  key: string;
  catches: number;
  target: number;
  lastCatchBubble: string;
  finishT: number;
  done: boolean;
  restX: number;
  restY: number;
  hasRestPoint: boolean;
}

interface DutyRule {
  action: PlayerAction['kind'];
  activity: string;
  goal: string;
  min: number;
  max: number;
}

interface DutyState {
  holdT: number;
  cooldownT: number;
  x: number;
  y: number;
  animT: number;
}

const activityContexts = new WeakMap<Npc, ActivityContext>();
const wahyuStates = new WeakMap<Npc, WahyuState>();
const fishingSessions = new WeakMap<Npc, FishingSession>();
const dutyStates = new WeakMap<Npc, DutyState>();

const WAHYU_PLOTS = [10, 11] as const;
const WAHYU_CROPS = ['tomat', 'jagung', 'cabai'] as const;
const FARM_WALK_SPEED = 27;
const FARM_REACH = 12;
const FARM_REST = 2.4;
const POST_FISH_SPEED = 16;
const FISHER_IDS = new Set(['tarno', 'ika', 'noor', 'siul']);

const DUTIES: Record<string, DutyRule> = {
  rini: { action: 'tend', activity: 'menata dagangan', goal: 'merapikan lapak sebelum melayani orang', min: 14, max: 24 },
  joko: { action: 'tend', activity: 'mengerjakan peralatan', goal: 'membereskan pekerjaan kampung di titik ini', min: 10, max: 18 },
  bagas: { action: 'tend', activity: 'mengurus dagangan', goal: 'menghitung dan menata barang dagangan', min: 12, max: 20 },
  darto: { action: 'wait', activity: 'berjaga', goal: 'mengawasi jalur pos timur', min: 14, max: 24 },
  raka: { action: 'tend', activity: 'mengerjakan tugas kampung', goal: 'menyelesaikan pekerjaan di titik ini', min: 10, max: 18 },
  gerald: { action: 'wait', activity: 'berjaga', goal: 'menjaga halaman benteng', min: 16, max: 26 },
  maret: { action: 'tend', activity: 'merawat benteng', goal: 'merapikan kebutuhan benteng', min: 14, max: 24 },
  darun: { action: 'wait', activity: 'berjaga di menara', goal: 'mengawasi sekitar benteng', min: 18, max: 30 },
  vex: { action: 'tend', activity: 'memeriksa sistem', goal: 'mengecek terminal dan perangkat dermaga', min: 12, max: 20 },
  kiran: { action: 'tend', activity: 'menata suku cadang', goal: 'merapikan stok untuk transaksi', min: 12, max: 20 },
  ambu: { action: 'tend', activity: 'merawat rimbun', goal: 'memeriksa tanaman dan cahaya di jalur', min: 12, max: 20 },
};

// Let renderer/Agnes see the activity that is really happening this frame,
// instead of a broad phase label such as "bekerja" while the actor is visibly
// planting or repairing something.
patchContextGetter('activity');
patchContextGetter('goal');
patchContextGetter('destination');

function patchContextGetter(key: keyof ActivityContext): void {
  const descriptor = Object.getOwnPropertyDescriptor(Npc.prototype, key);
  const baseGet = descriptor?.get;
  if (!baseGet) return;
  Object.defineProperty(Npc.prototype, key, {
    configurable: true,
    get: function contextualNpcGetter(this: Npc): string {
      const override = activityContexts.get(this)?.[key];
      return override || String(baseGet.call(this) ?? '');
    },
  });
}

let activeNet: Net | null = null;
const baseNetUpdate = Net.prototype.update;
Net.prototype.update = function visibleActivityNetUpdate(
  this: Net,
  ...args: Parameters<Net['update']>
): void {
  activeNet = this;
  baseNetUpdate.apply(this, args);
};

const baseNpcUpdate = Npc.prototype.update;
Npc.prototype.update = function visibleActivityNpcUpdate(
  this: Npc,
  ...args: Parameters<Npc['update']>
): void {
  // A context is only valid for one rendered frame; claimed behaviours below
  // renew it continuously while they remain active.
  activityContexts.delete(this);
  baseNpcUpdate.apply(this, args);

  const [dt, map] = args;
  if (this.talking) return;

  if (this.mind.id === 'wahyu' && updateWahyu(dt, this, map)) return;
  if (FISHER_IDS.has(this.mind.id) && updateFiniteFishing(dt, this, map)) return;
  updateDuty(dt, this);
};

function updateWahyu(dt: number, npc: Npc, map: WorldMap): boolean {
  const world = currentNpcWorld();
  const daylightJob = /kebun/i.test(npc.destination) && phaseAt(world.time) !== 'malam';
  const st = wahyuState(npc);

  if (!daylightJob || world.rain > 0.3) {
    resetWahyu(st);
    return false;
  }

  const plots = plotStates();
  if (!plots.length) return false;

  st.restT = Math.max(0, st.restT - dt);

  // Finish a job already claimed by this layer. Pinning the feet here is what
  // stops the old route walker from dragging Wahyu away halfway through work.
  if (st.workT > 0 && st.target !== null && st.op) {
    const plot = map.plots[st.target];
    if (!plot) {
      resetWahyu(st);
      return false;
    }
    npc.x = st.holdX;
    npc.y = st.holdY;
    npc.faceToward(plot.tx * TILE + TILE, plot.ty * TILE + TILE);
    npc.action = 'tend';
    st.animT += dt;
    npc.animT = st.animT;
    setFarmContext(npc, st.op, st.target, plots);

    st.workT = Math.max(0, st.workT - dt);
    if (st.workT === 0) {
      const op = st.op;
      const i = st.target;
      performNpcPlotOp(op, i, plots);
      npc.noteEmergentContext(farmCompletionText(op, plots[i]));
      npc.bubbleKind = 'chat';
      npc.bubbleText = farmCompletionBubble(op, plots[i]);
      npc.bubbleT = 2.8;
      st.target = null;
      st.op = null;
      st.restT = FARM_REST;
      st.animT = 0;
    }
    return true;
  }

  if (st.restT > 0) {
    activityContexts.set(npc, {
      activity: 'beristirahat sebentar di kebun',
      goal: 'melihat hasil pekerjaan sebelum lanjut',
      destination: 'kebun komunitas',
    });
    npc.action = 'wait';
    return true;
  }

  if (st.target === null || !st.op) {
    const job = findWahyuJob(plots);
    if (!job) {
      // Existing v3B may still be walking toward / watering a player crop.
      if (npc.action === 'tend') {
        activityContexts.set(npc, {
          activity: 'menyiram tanaman',
          goal: 'menyiram petak yang sedang kering',
          destination: 'kebun pusat',
        });
        return true;
      }
      return false;
    }
    st.target = job.i;
    st.op = job.op;
  }

  const plot = map.plots[st.target];
  if (!plot || !st.op) {
    st.target = null;
    st.op = null;
    return false;
  }

  const gx = plot.tx * TILE + TILE;
  const gy = plot.ty * TILE + TILE + 9;
  const dx = gx - npc.x;
  const dy = gy - npc.y;
  const dist = Math.hypot(dx, dy);
  setFarmContext(npc, st.op, st.target, plots);

  if (dist <= FARM_REACH) {
    st.holdX = npc.x;
    st.holdY = npc.y;
    st.workT = farmWorkSeconds(st.op);
    st.animT = 0;
    npc.faceToward(plot.tx * TILE + TILE, plot.ty * TILE + TILE);
    npc.action = 'tend';
    return true;
  }

  const step = Math.min(dist, FARM_WALK_SPEED * dt);
  const nx = npc.x + (dx / dist) * step;
  const ny = npc.y + (dy / dist) * step;
  if (!isWalkable(map, Math.floor(nx / TILE), Math.floor(ny / TILE))) {
    st.target = null;
    st.op = null;
    st.restT = 0.8;
    return false;
  }

  npc.x = nx;
  npc.y = ny;
  npc.action = 'walk';
  npc.animT += dt;
  npc.faceToward(gx, gy);
  return true;
}

function findWahyuJob(plots: PlotState[]): { i: number; op: FarmOp } | null {
  // His two community beds are intentionally small. The rest of the shared
  // farm remains fully player-owned; old v3B can still help water those crops.
  for (const i of WAHYU_PLOTS) {
    const p = plots[i];
    if (!p) continue;
    const mine = p.by === 'Wahyu';
    const unclaimed = !p.by;

    if (mine && p.crop && p.stage >= CROP_STAGES) return { i, op: 'harvest' };
    if (mine && p.crop && !p.watered && p.stage < CROP_STAGES) return { i, op: 'water' };
    if (unclaimed && p.stage === -1) return { i, op: 'till' };
    if ((unclaimed || mine) && p.stage === 0 && !p.crop) return { i, op: 'plant' };
  }
  return null;
}

function setFarmContext(npc: Npc, op: FarmOp, i: number, plots: PlotState[]): void {
  const crop = plots[i]?.crop || cropFor(i);
  const labels: Record<FarmOp, ActivityContext> = {
    till: { activity: 'mencangkul petak', goal: 'menyiapkan tanah untuk tanaman', destination: 'kebun komunitas' },
    plant: { activity: `menanam ${crop}`, goal: `menanam ${crop} di petak komunitas`, destination: 'kebun komunitas' },
    water: { activity: `menyiram ${crop}`, goal: `menjaga ${crop} tetap cukup air`, destination: 'kebun komunitas' },
    harvest: { activity: `memanen ${crop}`, goal: `memanen ${crop} yang sudah matang`, destination: 'kebun komunitas' },
  };
  activityContexts.set(npc, labels[op]);
}

function performNpcPlotOp(op: FarmOp, i: number, plots: PlotState[]): void {
  const p = plots[i];
  if (!p) return;
  const crop = cropFor(i);

  if (activeNet?.status === 'online') {
    activeNet.send({
      t: 'plot', i, op, crop: op === 'plant' ? crop : undefined, actor: 'wahyu',
    } as unknown as ClientMsg);
    return;
  }

  const now = Date.now();
  if (op === 'till' && p.stage === -1) {
    p.stage = 0;
    p.crop = null;
    p.t = now;
  } else if (op === 'plant' && p.stage === 0 && !p.crop && !p.by) {
    p.crop = crop;
    p.stage = 1;
    p.watered = false;
    p.by = 'Wahyu';
    p.t = now;
  } else if (op === 'water' && p.crop && !p.watered && p.by === 'Wahyu') {
    p.watered = true;
    p.t = now;
  } else if (op === 'harvest' && p.crop && p.stage >= CROP_STAGES && p.by === 'Wahyu') {
    p.crop = null;
    p.stage = 0;
    p.watered = false;
    p.by = '';
    p.t = now;
  }
}

function updateFiniteFishing(dt: number, npc: Npc, map: WorldMap): boolean {
  const world = currentNpcWorld();
  const phase = phaseAt(world.time);
  const key = `${world.day}:${phase}`;
  const st = fishingState(npc);

  if (st.key !== key) {
    st.key = key;
    st.catches = 0;
    st.target = 1 + (stableHash(`${npc.mind.id}:${key}:session`) % 2);
    st.lastCatchBubble = '';
    st.finishT = 0;
    st.done = false;
    st.hasRestPoint = false;
  }

  if (st.done) {
    suppressCoreFishing(npc);
    activityContexts.set(npc, {
      activity: 'selesai memancing',
      goal: 'menyimpan alat dan mengistirahatkan tangan',
      destination: npc.destination,
    });
    return moveToPostFishRest(dt, npc, map, st);
  }

  const catchBubble = npc.bubbleKind === 'thought' && /^Nah, dapat\s+/i.test(npc.bubbleText)
    ? npc.bubbleText
    : '';
  if (catchBubble && catchBubble !== st.lastCatchBubble) {
    st.lastCatchBubble = catchBubble;
    st.catches++;
    if (st.catches >= st.target) st.finishT = 1.15;
  } else if (!catchBubble) {
    st.lastCatchBubble = '';
  }

  if (st.finishT > 0) {
    st.finishT = Math.max(0, st.finishT - dt);
    if (st.finishT === 0) {
      st.done = true;
      chooseRestPoint(npc, map, st);
      npc.noteEmergentContext(`sudah selesai mancing setelah ${st.catches} tangkapan`, world.day);
    }
    return true;
  }

  // Only claim the actor while the core is actually fishing. Outside a normal
  // fishing phase, schedules and v5 memory decisions remain free to act.
  if (npc.bobber || npc.action === 'cast' || npc.action === 'reel') {
    activityContexts.set(npc, {
      activity: 'memancing',
      goal: `menyelesaikan sesi ${st.target} tangkapan lalu beranjak`,
      destination: npc.destination,
    });
    return true;
  }
  return false;
}

function suppressCoreFishing(npc: Npc): void {
  // TypeScript `private` fields are runtime properties. Freezing the internal
  // timer is deliberate here: merely hiding the bobber would let the old core
  // keep rolling invisible catches and pollute memory/conversation context.
  const raw = npc as unknown as { fishStage: string; fishT: number; bobber: { x: number; y: number } | null };
  raw.fishStage = 'ready';
  raw.fishT = 9999;
  raw.bobber = null;
  if (/^Nah, dapat\s+/i.test(npc.bubbleText)) {
    npc.bubbleText = '';
    npc.bubbleT = 0;
  }
}

function chooseRestPoint(npc: Npc, map: WorldMap, st: FishingSession): void {
  const ox = npc.x;
  const oy = npc.y;
  const candidates: Array<[number, number]> = [
    [0, TILE * 3], [TILE * 2, TILE * 2], [-TILE * 2, TILE * 2],
    [0, TILE * 2], [TILE, TILE], [-TILE, TILE],
  ];
  for (const [dx, dy] of candidates) {
    const x = ox + dx;
    const y = oy + dy;
    if (isWalkable(map, Math.floor(x / TILE), Math.floor(y / TILE))) {
      st.restX = x;
      st.restY = y;
      st.hasRestPoint = true;
      return;
    }
  }
  st.restX = ox;
  st.restY = oy;
  st.hasRestPoint = true;
}

function moveToPostFishRest(dt: number, npc: Npc, map: WorldMap, st: FishingSession): boolean {
  if (!st.hasRestPoint) chooseRestPoint(npc, map, st);
  const dx = st.restX - npc.x;
  const dy = st.restY - npc.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 2) {
    npc.action = 'wait';
    npc.animT = 0;
    return true;
  }

  const step = Math.min(dist, POST_FISH_SPEED * dt);
  const nx = npc.x + (dx / dist) * step;
  const ny = npc.y + (dy / dist) * step;
  if (!isWalkable(map, Math.floor(nx / TILE), Math.floor(ny / TILE))) {
    st.restX = npc.x;
    st.restY = npc.y;
    npc.action = 'wait';
    return true;
  }

  npc.x = nx;
  npc.y = ny;
  npc.action = 'walk';
  npc.animT += dt;
  npc.faceToward(st.restX, st.restY);
  return true;
}

function updateDuty(dt: number, npc: Npc): void {
  const rule = DUTIES[npc.mind.id];
  if (!rule || phaseAt(currentNpcWorld().time) === 'malam') return;
  if (npc.bobber || npc.action === 'cast' || npc.action === 'reel') return;

  const st = dutyState(npc);
  st.cooldownT = Math.max(0, st.cooldownT - dt);

  if (st.holdT > 0) {
    st.holdT = Math.max(0, st.holdT - dt);
    npc.x = st.x;
    npc.y = st.y;
    npc.action = rule.action;
    if (rule.action === 'tend') {
      st.animT += dt;
      npc.animT = st.animT;
    } else {
      npc.animT = 0;
    }
    activityContexts.set(npc, {
      activity: rule.activity,
      goal: rule.goal,
      destination: npc.destination,
    });
    if (st.holdT === 0) st.cooldownT = 5 + (stableHash(`${npc.mind.id}:${Date.now() >> 12}`) % 4);
    return;
  }

  // Start a work block only when the authored walker naturally pauses. This
  // keeps paths believable while turning a 1-5 second pause into a readable
  // 10-30 second job rather than constant pacing.
  if (st.cooldownT > 0 || (npc.action !== 'idle' && npc.action !== 'wait' && npc.action !== 'tend')) return;
  st.x = npc.x;
  st.y = npc.y;
  st.animT = 0;
  const span = Math.max(1, Math.round(rule.max - rule.min));
  st.holdT = rule.min + (stableHash(`${npc.mind.id}:${Math.round(npc.x)}:${Math.round(npc.y)}:${currentNpcWorld().day}`) % span);
  npc.action = rule.action;
  activityContexts.set(npc, {
    activity: rule.activity,
    goal: rule.goal,
    destination: npc.destination,
  });
}

function plotStates(): PlotState[] {
  if (activeNet?.status === 'online') return activeNet.plots;
  const fn = (window as unknown as { __plots?: () => PlotState[] }).__plots;
  try { return typeof fn === 'function' ? fn() : []; } catch { return []; }
}

function wahyuState(npc: Npc): WahyuState {
  let st = wahyuStates.get(npc);
  if (!st) {
    st = { target: null, op: null, workT: 0, restT: 0, holdX: npc.x, holdY: npc.y, animT: 0 };
    wahyuStates.set(npc, st);
  }
  return st;
}

function resetWahyu(st: WahyuState): void {
  st.target = null;
  st.op = null;
  st.workT = 0;
  st.restT = 0;
  st.animT = 0;
}

function fishingState(npc: Npc): FishingSession {
  let st = fishingSessions.get(npc);
  if (!st) {
    st = {
      key: '', catches: 0, target: 1, lastCatchBubble: '', finishT: 0,
      done: false, restX: npc.x, restY: npc.y, hasRestPoint: false,
    };
    fishingSessions.set(npc, st);
  }
  return st;
}

function dutyState(npc: Npc): DutyState {
  let st = dutyStates.get(npc);
  if (!st) {
    st = { holdT: 0, cooldownT: 0, x: npc.x, y: npc.y, animT: 0 };
    dutyStates.set(npc, st);
  }
  return st;
}

function farmWorkSeconds(op: FarmOp): number {
  return op === 'water' ? 1.5 : op === 'till' ? 2.3 : op === 'plant' ? 2 : 1.9;
}

function cropFor(i: number): string {
  const day = currentNpcWorld().day;
  return WAHYU_CROPS[stableHash(`wahyu:${day}:${i}`) % WAHYU_CROPS.length];
}

function farmCompletionText(op: FarmOp, p: PlotState | undefined): string {
  const crop = p?.crop || 'tanaman';
  if (op === 'till') return 'baru selesai mencangkul petak komunitas';
  if (op === 'plant') return `baru menanam ${crop} di kebun komunitas`;
  if (op === 'water') return `baru menyiram ${crop} di kebun komunitas`;
  return `baru memanen ${crop} dari kebun komunitas`;
}

function farmCompletionBubble(op: FarmOp, p: PlotState | undefined): string {
  const crop = p?.crop || 'tanaman';
  if (op === 'till') return 'Tanahnya sudah siap.';
  if (op === 'plant') return `${title(crop)} sudah kutanam.`;
  if (op === 'water') return `${title(crop)} sudah disiram.`;
  return `Panen ${crop} selesai.`;
}

function phaseAt(time: number): Phase {
  const t = ((time % 1) + 1) % 1;
  if (t < 0.28) return 'malam';
  if (t < 0.45) return 'pagi';
  if (t < 0.66) return 'siang';
  if (t < 0.86) return 'senja';
  return 'malam';
}

function title(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

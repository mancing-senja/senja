/** Interiors.
 *
 *  Doors that do not open are the fastest way to make a village read as a
 *  film set. So every house, the cabin and the keep hall have a room behind
 *  them, and walking into the door puts you in it.
 *
 *  Interiors are a *separate small map*, not a patch of the world map. That
 *  keeps the outdoor generator simple (it never has to leave holes in
 *  buildings), lets a room be lit on its own terms (warm lamplight at noon
 *  is normal indoors), and means a house on the neon quay can be furnished
 *  completely differently from one in the village without either generator
 *  learning about the other.
 *
 *  Rooms are generated from a seed like everything else, so twenty houses
 *  are twenty different rooms without twenty hand-made layouts. */

import { TILE } from '../../shared/constants';
import { Rng } from '../art/canvas';
import type { Register } from '../game/registers';
import type { NpcDef } from '../game/npc';

export const enum ITile {
  /** Outside the room's footprint — never drawn, never walkable. */
  Void = 0,
  Floor = 1,
  Rug = 2,
  Wall = 3,
  /** The tile you stand on to leave. */
  Door = 4,
}

export type FurnitureKind =
  | 'bed' | 'table' | 'chair' | 'chest' | 'shelf' | 'stove' | 'barrel'
  | 'rug' | 'plant' | 'lamp' | 'painting' | 'window' | 'anvil' | 'terminal';

export interface Furniture {
  kind: FurnitureKind;
  /** World pixels within the interior. */
  x: number;
  y: number;
  variant: number;
  solidW: number;
  solidH: number;
}

export interface Interior {
  id: string;
  /** Which register the room is decorated in. */
  style: Register;
  w: number;
  h: number;
  tiles: Uint8Array;
  /** 1 where a piece of furniture stands. Kept beside the tile grid rather
   *  than folded into it, because a table blocks walking but the floor under
   *  it is still floor — it has to keep drawing as floor. */
  blocked: Uint8Array;
  furniture: Furniture[];
  /** Where the player appears, in interior pixels. */
  spawnX: number;
  spawnY: number;
  /** Where they came from, to put them back outside. */
  returnX: number;
  returnY: number;
  /** Shown when you walk in. */
  label: string;
  /** Whoever lives here. Routes are in interior tile coordinates. */
  residents: NpcDef[];
}

export function tileAtI(it: Interior, tx: number, ty: number): ITile {
  if (tx < 0 || ty < 0 || tx >= it.w || ty >= it.h) return ITile.Void;
  return it.tiles[ty * it.w + tx] as ITile;
}

export function walkableI(it: Interior, tx: number, ty: number): boolean {
  const t = tileAtI(it, tx, ty);
  if (t !== ITile.Floor && t !== ITile.Rug && t !== ITile.Door) return false;
  return it.blocked[ty * it.w + tx] === 0;
}

/** Rooms get bigger with the building they belong to, but never so big that
 *  the camera loses the walls — a room you cannot see the edges of stops
 *  feeling like a room. */
export function buildInterior(
  id: string, style: Register, seed: number, size: 'small' | 'medium' | 'large',
  returnX: number, returnY: number, label: string,
): Interior {
  const rng = new Rng(seed * 2237 + 11);
  const w = size === 'large' ? rng.int(16, 19) : size === 'medium' ? rng.int(13, 15) : rng.int(10, 12);
  const h = size === 'large' ? rng.int(12, 14) : size === 'medium' ? rng.int(10, 12) : rng.int(8, 9);

  const tiles = new Uint8Array(w * h).fill(ITile.Void);
  const set = (tx: number, ty: number, t: ITile) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
    tiles[ty * w + tx] = t;
  };

  // Walls line the top and both sides; the floor runs to the bottom edge so
  // the doorway sits on it.
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const edge = tx === 0 || tx === w - 1 || ty === 0 || ty === 1 || ty === h - 1;
      set(tx, ty, edge ? ITile.Wall : ITile.Floor);
    }
  }

  // Doorway, centred on the bottom wall.
  const doorX = Math.floor(w / 2);
  set(doorX, h - 1, ITile.Door);
  set(doorX, h - 2, ITile.Floor);

  const furniture: Furniture[] = [];
  const put = (kind: FurnitureKind, tx: number, ty: number, sw = 6, sh = 4): void => {
    furniture.push({
      kind, x: tx * TILE + TILE / 2, y: ty * TILE + TILE,
      variant: rng.int(0, 2), solidW: sw, solidH: sh,
    });
  };

  // A rug, so the middle of the floor is not empty.
  if (rng.chance(0.7)) {
    const rw = rng.int(3, Math.max(3, Math.min(6, w - 6)));
    const rh = rng.int(2, 3);
    const rx = Math.floor((w - rw) / 2);
    const ry = Math.floor(h / 2);
    for (let ty = ry; ty < ry + rh; ty++) {
      for (let tx = rx; tx < rx + rw; tx++) {
        if (tiles[ty * w + tx] === ITile.Floor) set(tx, ty, ITile.Rug);
      }
    }
  }

  // --- furniture against the back wall, then the sides. Pushing things to
  // the walls is what makes a generated room read as arranged rather than
  // as scattered.
  const backY = 2;
  let bx = 2;
  const backItems: FurnitureKind[] = style === 'cyber'
    ? ['terminal', 'shelf', 'chest']
    : style === 'medieval'
      ? ['anvil', 'shelf', 'chest']
      : style === 'fantasy'
        ? ['shelf', 'plant', 'chest']
        : ['stove', 'shelf', 'chest'];
  for (const kind of backItems) {
    if (bx > w - 4) break;
    if (rng.chance(0.75)) {
      put(kind, bx, backY + 1, 7, 5);
      bx += 3;
    } else {
      bx += 2;
    }
  }

  // Bed in a corner.
  const bedLeft = rng.chance(0.5);
  put('bed', bedLeft ? 2 : w - 4, h - 4, 10, 6);

  // Table and chairs, offset from centre so the room is not symmetrical.
  const tx0 = Math.floor(w / 2) + rng.int(-2, 2);
  const ty0 = Math.floor(h / 2) + rng.int(-1, 1);
  if (tx0 > 2 && tx0 < w - 3) {
    put('table', tx0, ty0, 9, 6);
    if (rng.chance(0.8)) put('chair', tx0 - 2, ty0, 4, 3);
    if (rng.chance(0.6)) put('chair', tx0 + 2, ty0, 4, 3);
  }

  // Wall dressing: windows and a painting on the back wall, a lamp somewhere.
  for (let i = 0; i < rng.int(1, 3); i++) {
    const wx = 2 + rng.int(0, w - 5);
    put('window', wx, 2, 0, 0);
  }
  if (rng.chance(0.5)) put('painting', 2 + rng.int(0, w - 5), 2, 0, 0);
  // The lamp goes in the corner the bed is not in. Both defaulted to column
  // 2, which put a light source directly on top of the bed and left the
  // glow to swallow it whole.
  put('lamp', bedLeft ? w - 3 : 2, h - 6, 3, 3);
  if (rng.chance(0.6)) put('plant', bedLeft ? w - 3 : 2, h - 3, 4, 3);
  for (let i = 0; i < rng.int(0, 2); i++) {
    put('barrel', 2 + rng.int(0, w - 5), h - 3, 5, 4);
  }

  // Furniture footprints, rounded to tiles. Coarse on purpose: a bed you
  // can clip the corner of reads worse than one that takes the whole tile.
  const blocked = new Uint8Array(w * h);
  for (const f of furniture) {
    if (f.solidW <= 0) continue;
    const x0 = Math.floor((f.x - f.solidW / 2) / TILE);
    const x1 = Math.floor((f.x + f.solidW / 2 - 1) / TILE);
    const y0 = Math.floor((f.y - f.solidH) / TILE);
    const y1 = Math.floor((f.y - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        // Never seal the doorway or the tile in front of it.
        if (ty >= h - 2 && tx === doorX) continue;
        blocked[ty * w + tx] = 1;
      }
    }
  }

  return {
    id, style, w, h, tiles, blocked, furniture,
    spawnX: doorX * TILE + TILE / 2,
    spawnY: (h - 2) * TILE + TILE - 2,
    returnX, returnY,
    label,
    residents: residentsFor(id, style, rng, w, h, size, (tx, ty) => (
      tx > 0 && ty > 1 && tx < w - 1 && ty < h - 1 && blocked[ty * w + tx] === 0
    )),
  };
}

/** First names, by voice. Kept short: these are people you meet once and
 *  remember by face, and a long name crowds the conversation panel. */
const NAMES: Record<Register, string[]> = {
  cozy: [
    'Yanti', 'Slamet', 'Endah', 'Warto', 'Mira', 'Hasan', 'Tuti', 'Bambang',
    'Ningsih', 'Darto', 'Ratmi', 'Supri', 'Wati', 'Gunawan', 'Asih',
  ],
  medieval: [
    'Alder', 'Mira', 'Bran', 'Hesta', 'Rolf', 'Coren', 'Yswen', 'Dunn',
    'Marta', 'Osric', 'Belen', 'Havel',
  ],
  cyber: [
    'Nadi', 'Sev', 'Rook', 'Tala', 'Grin', 'Ozi', 'Mave', 'Dex',
    'Kera', 'Juno', 'Bit', 'Rasa',
  ],
  fantasy: [
    'Wangi', 'Lir', 'Emban', 'Rasi', 'Suket', 'Nala', 'Gung', 'Timur',
    'Aruna', 'Pucuk', 'Sasih',
  ],
};

/** Who is home.
 *
 *  Not every room has somebody in it — a village where every single door
 *  opens onto a person waiting for you reads as a set of shops. One or two
 *  residents, sometimes none, is what makes finding somebody feel like
 *  finding somebody. */
function residentsFor(
  roomId: string, style: Register, rng: Rng, w: number, h: number,
  size: 'small' | 'medium' | 'large',
  free: (tx: number, ty: number) => boolean,
): NpcDef[] {
  // A big hall is the district's landmark. Walking into the keep and
  // finding nobody there is a bug you cannot tell apart from an empty
  // house, so the large rooms always have somebody in them.
  const count = size === 'large'
    ? rng.int(2, 3)
    : rng.chance(0.22) ? 0 : rng.chance(0.65) ? 1 : 2;
  const pool = NAMES[style];
  const out: NpcDef[] = [];

  /** A tile nobody is standing on and nothing is standing on. Ten tries,
   *  then give up — a room packed wall to wall just gets fewer people. */
  const spot = (): [number, number] | null => {
    for (let k = 0; k < 10; k++) {
      const tx = 2 + rng.int(0, w - 5);
      const ty = 3 + rng.int(0, h - 6);
      if (free(tx, ty)) return [tx, ty];
    }
    return null;
  };

  for (let i = 0; i < count; i++) {
    // Draw without replacement. Two people in one small room answering to
    // the same name is the kind of thing you notice immediately.
    let name = pool[rng.int(0, pool.length - 1)];
    for (let k = 0; out.some((o) => o.name === name) && k < 8; k++) {
      name = pool[rng.int(0, pool.length - 1)];
    }
    const start = spot();
    if (!start) continue;

    // Half stand at a fixed spot — by the stove, at the table — and half
    // pace a short loop. A room where everybody paces looks like a waiting
    // area; a room where nobody moves looks like a diorama.
    const roam = rng.chance(0.45);
    const route: Array<[number, number]> = [start];
    if (roam) {
      for (let k = 0; k < 2; k++) {
        const next = spot();
        if (next) route.push(next);
      }
    }

    out.push({
      id: `${roomId}-${i}`,
      name,
      hue: rng.int(0, 11),
      register: style,
      route,
      // Somebody standing still indoors is usually doing something with
      // their hands, so standing residents get the work pose.
      idle: route.length > 1 ? 'idle' : rng.chance(0.55) ? 'tend' : 'idle',
      bias: {
        warmth: rng.range(0.25, 0.9),
        talkative: rng.range(0.2, 0.85),
        bluntness: rng.range(0.15, 0.8),
        superstition: rng.range(0.1, 0.9),
      },
    });
  }
  return out;
}

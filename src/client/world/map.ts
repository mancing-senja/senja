/** The world: a lake with a wandering coastline, a rocky point, a reed bay,
 *  a river running down out of the hills, a swamp, and a farm in the middle
 *  of it all.
 *
 *  Generated from a fixed seed rather than authored by hand, and generated
 *  identically on every client — so the server never has to send terrain,
 *  only the things that change (players, crops, weather). */

import { MAP_H, MAP_W, TILE, FARM_PLOT_COUNT } from '../../shared/constants';
import { Rng, valueNoise } from '../art/canvas';
import { VARIANTS } from '../art/atlas';
import { buildSpots, type Spot } from './spots';
import { districtForTile } from './districts';
import { LORE } from '../game/lore';

export const enum Tile {
  Water = 0,
  Shallow = 1,
  Sand = 2,
  Grass = 3,
  Dirt = 4,
  Plot = 5,
  Dock = 6,
  Blocked = 7,
  /** Inland water. Rendered by the same shader as the lake, with an
   *  overlay for the current or the murk. */
  River = 8,
  Swamp = 9,
  /** District ground: cobbled keep yard, wet concrete quay, glowing loam. */
  Cobble = 10,
  Concrete = 11,
  Grate = 12,
  Grove = 13,
  /** The luminous pool at the heart of the grove. */
  Spirit = 14,
}

export interface Prop {
  kind: 'tree' | 'bush' | 'rock' | 'reed' | 'flower' | 'lily' | 'cabin' | 'lantern'
      | 'crate' | 'barrel' | 'sign' | 'dockpost' | 'tallgrass' | 'pebbles' | 'deadtree'
      | 'house' | 'well' | 'fence0' | 'fence1' | 'stall' | 'board'
      | 'tower' | 'wallseg' | 'banner' | 'torch'
      | 'sign' | 'pipe' | 'antenna' | 'chainfence'
      | 'mushroom' | 'crystal' | 'rune' | 'spirittree' | 'block' | 'tank'
      | 'plaque' | 'terminal' | 'tablet' | 'notice' | 'keephall' | 'gatehouse' | 'milestone' | 'ruinwall' | 'campfire' | 'pylon';
  /** World pixel position of the prop's *base* (feet), for y-sorting. */
  x: number;
  y: number;
  variant: number;
  /** Half-width of the collision footprint in px; 0 = walk-through. */
  solidW: number;
  solidH: number;
  /** Trees and reeds sway; rocks do not. */
  sways: boolean;
  /** Lore fragment id, for the markers only. */
  lore?: string;
}

export interface Plot {
  i: number;
  tx: number;
  ty: number;
}

export interface WorldMap {
  tiles: Uint8Array;
  variant: Uint8Array;
  props: Prop[];
  plots: Plot[];
  spots: Spot[];
  /** Where a new player spawns: end of the pier, looking at the water. */
  spawnX: number;
  spawnY: number;
  /** Tile row of the waterline per column, for shoreline effects. */
  shore: Int16Array;
  dockX: number;
  /** Landmark tile coordinates, used to place the villagers' routes. */
  landmarks: {
    villageX: number; villageY: number;
    pierX: number; pierTipY: number;
    plotX: number; plotY: number;
    bayX: number; bayY: number;
    keepX: number; keepY: number;
    quayX: number; quayY: number;
    groveX: number; groveY: number;
  };
}

export const WORLD_SEED = 20260809;

export function tileAt(m: WorldMap, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return Tile.Blocked;
  return m.tiles[ty * MAP_W + tx] as Tile;
}

export function isWater(t: Tile): boolean {
  return t === Tile.Water || t === Tile.Shallow || t === Tile.River
    || t === Tile.Swamp || t === Tile.Spirit;
}

/** Walkable = not water, not blocked. Dock counts as walkable over water. */
export function isWalkable(m: WorldMap, tx: number, ty: number): boolean {
  const t = tileAt(m, tx, ty);
  return t !== Tile.Blocked && !isWater(t);
}

// --------------------------------------------------------------- layout

/** Fixed landmarks. Everything else is generated around them. The pastoral
 *  hub sits in the middle of the map; the genre districts take the ends. */
const PIER_TX = 74;
const POINT_TX = 52;   // rocky point, west of the pier
const BAY_TX = 116;    // reed bay, east
const CABIN_TX = 62;
const CABIN_TY = 30;
const PLOT_TX = 86;
const PLOT_TY = 38;
const RIVER_MOUTH_TX = 130;
const SWAMP_TX = 46;
const SWAMP_TY = 58;

/** The village: a street of houses around a square with a well, set back
 *  from the lake between the pier and the farm. */
const VILLAGE_TX = 92;
const VILLAGE_TY = 22;

/** District anchors. */
const KEEP_TX = 18;
const KEEP_TY = 30;
const QUAY_TX = 158;
const QUAY_TY = 26;
const GROVE_TX = 84;
const GROVE_TY = 82;

export function buildMap(): WorldMap {
  const rng = new Rng(WORLD_SEED);
  const tiles = new Uint8Array(MAP_W * MAP_H).fill(Tile.Grass);
  const variant = new Uint8Array(MAP_W * MAP_H);
  const shore = new Int16Array(MAP_W);
  const props: Prop[] = [];
  const plots: Plot[] = [];

  const set = (tx: number, ty: number, t: Tile) => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;
    tiles[ty * MAP_W + tx] = t;
  };
  const get = (tx: number, ty: number): Tile => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return Tile.Blocked;
    return tiles[ty * MAP_W + tx] as Tile;
  };

  // --- coastline. A wandering baseline, then two deliberate features: a
  // rocky point pushed north into the lake, and a bay scooped south.
  for (let tx = 0; tx < MAP_W; tx++) {
    const n = valueNoise(tx * 0.07, 0, 4) + valueNoise(tx * 0.23, 8, 9) * 0.4;
    let row = 12 + n * 3.4;

    // Rocky point: the land reaches out, so deep water sits close to shore.
    const dPoint = Math.abs(tx - POINT_TX) / 9;
    if (dPoint < 1) row -= (1 - dPoint * dPoint) * 8.5;

    // Reed bay: the shore falls back, leaving a wide shallow shelf.
    const dBay = Math.abs(tx - BAY_TX) / 13;
    if (dBay < 1) row += (1 - dBay * dBay) * 9;

    const r = Math.round(row);
    shore[tx] = r;
    for (let ty = 0; ty < MAP_H; ty++) {
      if (ty < r - 2) set(tx, ty, Tile.Water);
      else if (ty < r) set(tx, ty, Tile.Shallow);
      else if (ty < r + 2) set(tx, ty, Tile.Sand);
      else set(tx, ty, Tile.Grass);
    }
  }

  // The bay is shallow well out from the shore, not just at its edge.
  for (let tx = BAY_TX - 13; tx <= BAY_TX + 13; tx++) {
    if (tx < 0 || tx >= MAP_W) continue;
    const depth = Math.round(4 * (1 - Math.abs(tx - BAY_TX) / 14));
    for (let k = 0; k < depth; k++) {
      const ty = shore[tx] - 2 - k;
      if (get(tx, ty) === Tile.Water) set(tx, ty, Tile.Shallow);
    }
  }

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      variant[ty * MAP_W + tx] =
        Math.floor(valueNoise(tx * 0.7, ty * 0.7, 33) * 100) % VARIANTS.grass;
    }
  }

  // --- the river: down out of the south-east hills, into the lake
  const riverPath = carveRiver(set, get, rng);

  // --- the swamp: dark still pools in the south-west woods
  carveSwamp(set, get, props, rng);

  // --- the pier
  const dockShore = shore[PIER_TX];
  const dockTip = 3;
  for (let ty = dockTip; ty <= dockShore + 1; ty++) {
    for (let tx = PIER_TX; tx < PIER_TX + 3; tx++) set(tx, ty, Tile.Dock);
  }
  for (let tx = PIER_TX - 1; tx < PIER_TX + 4; tx++) {
    set(tx, dockTip, Tile.Dock);
    set(tx, dockTip + 1, Tile.Dock);
  }
  for (const [px, py] of [
    [PIER_TX - 1, dockTip], [PIER_TX + 3, dockTip],
    [PIER_TX, dockTip + 5], [PIER_TX + 2, dockTip + 5],
    [PIER_TX, dockShore], [PIER_TX + 2, dockShore],
  ] as const) {
    props.push({
      kind: 'dockpost', x: px * TILE + 8, y: py * TILE + TILE, variant: 0,
      solidW: 0, solidH: 0, sways: false,
    });
  }

  // --- a second, smaller jetty out into the reed bay
  const bayShore = shore[BAY_TX];
  for (let ty = bayShore - 5; ty <= bayShore; ty++) {
    for (let tx = BAY_TX; tx < BAY_TX + 2; tx++) set(tx, ty, Tile.Dock);
  }
  props.push({
    kind: 'dockpost', x: BAY_TX * TILE + 8, y: (bayShore - 5) * TILE + TILE,
    variant: 0, solidW: 0, solidH: 0, sways: false,
  });
  props.push({
    kind: 'dockpost', x: (BAY_TX + 1) * TILE + 8, y: (bayShore - 2) * TILE + TILE,
    variant: 0, solidW: 0, solidH: 0, sways: false,
  });

  // --- the rocky point: a scatter of boulders on the headland
  for (let i = 0; i < 22; i++) {
    const tx = POINT_TX + rng.int(-7, 7);
    const ty = shore[Math.max(0, Math.min(MAP_W - 1, tx))] + rng.int(0, 3);
    props.push({
      kind: 'rock', x: tx * TILE + rng.int(0, 12), y: ty * TILE + rng.int(4, 14),
      variant: rng.int(0, VARIANTS.rock - 1), solidW: 0, solidH: 0, sways: false,
    });
  }

  // --- the cabin
  props.push({
    kind: 'cabin', x: CABIN_TX * TILE + 32, y: CABIN_TY * TILE + 56, variant: 0,
    solidW: 28, solidH: 16, sways: false,
  });
  for (let ty = CABIN_TY + 1; ty < CABIN_TY + 4; ty++) {
    for (let tx = CABIN_TX; tx < CABIN_TX + 4; tx++) set(tx, ty, Tile.Blocked);
  }

  // --- paths tying the landmarks together
  carvePath(set, get, CABIN_TX * TILE + 34, (CABIN_TY + 4) * TILE, PIER_TX * TILE + 20, (dockShore + 2) * TILE);
  carvePath(set, get, PIER_TX * TILE + 20, (dockShore + 3) * TILE, PLOT_TX * TILE, (PLOT_TY - 2) * TILE);
  carvePath(set, get, PLOT_TX * TILE + 100, PLOT_TY * TILE, BAY_TX * TILE, (bayShore + 3) * TILE);
  carvePath(set, get, CABIN_TX * TILE, (CABIN_TY + 6) * TILE, SWAMP_TX * TILE + 40, (SWAMP_TY - 4) * TILE);
  carvePath(set, get, PLOT_TX * TILE + 60, (PLOT_TY + 6) * TILE, riverPath.bridgeX * TILE, riverPath.bridgeY * TILE);

  // --- farm plots
  for (let i = 0; i < FARM_PLOT_COUNT; i++) {
    const tx = PLOT_TX + (i % 6) * 2;
    const ty = PLOT_TY + Math.floor(i / 6) * 3;
    plots.push({ i, tx, ty });
    set(tx, ty, Tile.Plot);
    set(tx + 1, ty, Tile.Plot);
  }
  const apronCx = PLOT_TX + 5.5;
  const apronCy = PLOT_TY + 2;
  for (let ty = PLOT_TY - 3; ty <= PLOT_TY + 7; ty++) {
    for (let tx = PLOT_TX - 5; tx <= PLOT_TX + 15; tx++) {
      if (get(tx, ty) !== Tile.Grass) continue;
      const nx = (tx - apronCx) / 9.5;
      const ny = (ty - apronCy) / 4.6;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d < 0.82 + valueNoise(tx * 0.42, ty * 0.42, 61) * 0.42) set(tx, ty, Tile.Dirt);
    }
  }

  props.push({
    kind: 'sign', x: (PLOT_TX - 2) * TILE, y: (PLOT_TY - 1) * TILE + 16, variant: 0,
    solidW: 0, solidH: 0, sways: false,
  });

  // --- lanterns along the paths and the piers
  for (const [lx, ly] of [
    [PIER_TX - 1, dockTip + 1], [PIER_TX + 3, dockTip + 6],
    [CABIN_TX + 5, CABIN_TY + 4], [PLOT_TX - 3, PLOT_TY + 2], [PLOT_TX + 13, PLOT_TY],
    [POINT_TX, shore[POINT_TX] + 2], [BAY_TX + 2, bayShore + 1],
    [riverPath.bridgeX - 1, riverPath.bridgeY - 1], [SWAMP_TX + 6, SWAMP_TY - 4],
  ] as const) {
    props.push({
      kind: 'lantern', x: lx * TILE + 5, y: ly * TILE + 28, variant: 0,
      solidW: 2, solidH: 2, sways: false,
    });
  }

  props.push({ kind: 'crate', x: CABIN_TX * TILE + 66, y: CABIN_TY * TILE + 54, variant: 0, solidW: 6, solidH: 4, sways: false });
  props.push({ kind: 'barrel', x: CABIN_TX * TILE + 78, y: CABIN_TY * TILE + 56, variant: 0, solidW: 5, solidH: 4, sways: false });

  // --- genre districts, built before the generic scatter so their ground
  // is already claimed and ordinary trees do not wander into them.
  buildKeep(set, get, props, rng, shore);
  buildQuay(set, get, props, rng, shore);
  buildGrove(set, get, props, rng);

  buildVillage(set, get, props, rng);
  // Lanes out of the village are narrow — a two-tile track everywhere turns
  // the whole valley into one brown smear.
  carvePath(set, get, (VILLAGE_TX - 2) * TILE, (VILLAGE_TY + 11) * TILE, PLOT_TX * TILE + 40, (PLOT_TY - 3) * TILE, 1, 14);
  carvePath(set, get, (VILLAGE_TX - 17) * TILE, (VILLAGE_TY + 5) * TILE, PIER_TX * TILE + 40, (dockShore + 3) * TILE, 1, 10);

  scatter(rng, tiles, props);

  // --- reeds and lilies. The bay gets far more of both than open shore.
  for (let tx = 1; tx < MAP_W - 1; tx++) {
    const row = shore[tx];
    if (Math.abs(tx - PIER_TX) < 4) continue;
    // No reeds or lily pads growing out of a concrete quay, and no pebble
    // beach under a curtain wall.
    if (districtForTile(tx, row)) continue;
    const bayness = Math.max(0, 1 - Math.abs(tx - BAY_TX) / 14);
    if (rng.chance(0.45 + bayness * 0.5)) {
      props.push({
        kind: 'reed', x: tx * TILE + rng.int(0, 12), y: row * TILE + rng.int(-2, 6),
        variant: rng.int(0, VARIANTS.reed - 1), solidW: 0, solidH: 0, sways: true,
      });
    }
    if (rng.chance(0.15 + bayness * 0.55)) {
      props.push({
        kind: 'lily', x: tx * TILE + rng.int(0, 12), y: (row - rng.int(1, 3 + Math.round(bayness * 5))) * TILE,
        variant: rng.int(0, VARIANTS.lily - 1), solidW: 0, solidH: 0, sways: false,
      });
    }
    if (rng.chance(0.55)) {
      props.push({
        kind: 'pebbles', x: tx * TILE + rng.int(0, 8), y: (row + rng.int(0, 2)) * TILE + 8,
        variant: rng.int(0, VARIANTS.pebbles - 1), solidW: 0, solidH: 0, sways: false,
      });
    }
  }

  // --- reeds along the river banks too
  for (const [rx, ry] of riverPath.points) {
    if (!rng.chance(0.5)) continue;
    const side = rng.chance(0.5) ? -1 : 1;
    props.push({
      kind: 'reed', x: (rx + side * 2) * TILE + rng.int(0, 10), y: ry * TILE + rng.int(0, 12),
      variant: rng.int(0, VARIANTS.reed - 1), solidW: 0, solidH: 0, sways: true,
    });
  }

  // --- a wall of woods around the map so the edge never reads as a cut
  for (let tx = 0; tx < MAP_W; tx++) {
    for (let k = 0; k < 3; k++) {
      const ty = MAP_H - 1 - k;
      if (rng.chance(0.7)) {
        props.push({
          kind: 'tree', x: tx * TILE + rng.int(0, 15), y: ty * TILE + 16,
          variant: rng.int(0, VARIANTS.tree - 1), solidW: 6, solidH: 4, sways: true,
        });
      }
      set(tx, ty, Tile.Blocked);
    }
  }
  for (let ty = 18; ty < MAP_H; ty++) {
    for (const tx of [0, 1, MAP_W - 2, MAP_W - 1]) {
      if (rng.chance(0.75)) {
        props.push({
          kind: 'tree', x: tx * TILE + rng.int(0, 15), y: ty * TILE + 16,
          variant: rng.int(0, VARIANTS.tree - 1), solidW: 6, solidH: 4, sways: true,
        });
      }
      set(tx, ty, Tile.Blocked);
    }
  }

  for (const p of props) {
    if (p.solidW <= 0) continue;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor((p.y - 2) / TILE);
    const t = get(tx, ty);
    if (t === Tile.Grass || t === Tile.Dirt) set(tx, ty, Tile.Blocked);
  }

  // --- the trunk road.
  //
  // Until now the four districts were islands: you crossed blank grass to
  // get between them and nothing told you they belonged to the same place.
  // One road ties them together, and everything the road passes — a
  // milestone, a burnt-out outpost, a line of pylons — is there to make the
  // walk itself carry information about where you are going.
  const ROAD_Y = 44;
  const stops: Array<[number, number]> = [
    [KEEP_TX + 2, KEEP_TY + 13],
    [CABIN_TX, CABIN_TY + 6],
    [VILLAGE_TX - 16, VILLAGE_TY + 6],
    [PLOT_TX + 6, PLOT_TY - 4],
    [QUAY_TX - 16, QUAY_TY + 15],
  ];
  const roadPts: Array<[number, number]> = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, y0] = stops[i];
    const [x1, y1] = stops[i + 1];
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      // A road bends around the terrain rather than cutting straight; the
      // noise is what stops it reading as a ruler line across the map.
      const bend = (valueNoise(t * 6 + i * 3, 0, 137) - 0.5) * 7;
      const tx = Math.round(x0 + (x1 - x0) * t);
      const ty = Math.round(y0 + (y1 - y0) * t + bend);
      roadPts.push([tx, ty]);
      for (let j = -1; j <= 1; j++) {
        const t2 = get(tx + j, ty);
        if (t2 === Tile.Grass) set(tx + j, ty, Tile.Dirt);
        else if (t2 === Tile.Grove) set(tx + j, ty, Tile.Dirt);
      }
      // Cobble the stretch inside the keep district; concrete near the quay.
      const dz = districtForTile(tx, ty);
      if (dz?.id === 'benteng') {
        for (let j = -1; j <= 1; j++) if (get(tx + j, ty) === Tile.Dirt) set(tx + j, ty, Tile.Cobble);
      } else if (dz?.id === 'neon') {
        for (let j = -1; j <= 1; j++) if (get(tx + j, ty) === Tile.Dirt) set(tx + j, ty, Tile.Concrete);
      }
    }
  }
  // A spur south to the grove.
  carvePath(set, get, (GROVE_TX - 4) * TILE, (GROVE_TY - 14) * TILE,
            (PLOT_TX + 4) * TILE, (PLOT_TY + 8) * TILE, 1, 18);

  // Milestones every twenty-odd tiles, and roadside things in the gaps.
  for (let i = 12; i < roadPts.length; i += 26) {
    const [mx, my] = roadPts[i];
    if (get(mx, my + 2) !== Tile.Grass && get(mx, my + 2) !== Tile.Dirt) continue;
    props.push({
      kind: 'milestone', x: mx * TILE + 8, y: (my + 2) * TILE + 12,
      variant: 0, solidW: 4, solidH: 3, sways: false,
    });
  }

  // An abandoned outpost roughly midway between the keep and the village:
  // the same masonry as the keep, half fallen, with a cold campfire.
  {
    const ox = Math.round((KEEP_TX + CABIN_TX) / 2);
    const oy = ROAD_Y - 6;
    for (let i = 0; i < 4; i++) {
      props.push({
        kind: 'ruinwall', x: (ox + i * 2) * TILE, y: (oy + (i % 2)) * TILE + 16,
        variant: rng.int(0, VARIANTS.wallseg - 1), solidW: 12, solidH: 6, sways: false,
      });
    }
    props.push({
      kind: 'campfire', x: (ox + 3) * TILE, y: (oy + 4) * TILE + 10,
      variant: 0, solidW: 0, solidH: 0, sways: false,
    });
    for (let i = 0; i < 8; i++) {
      props.push({
        kind: 'rock', x: (ox + rng.int(-2, 8)) * TILE + rng.int(0, 12),
        y: (oy + rng.int(0, 6)) * TILE + rng.int(4, 14),
        variant: rng.int(0, VARIANTS.rock - 1), solidW: 0, solidH: 0, sways: false,
      });
    }
  }

  // A line of pylons marching in from the east, carrying the power the quay
  // still draws from a plant that shut down thirty years ago.
  {
    const py = ROAD_Y - 10;
    for (let i = 0; i < 7; i++) {
      const px = QUAY_TX - 6 - i * 9;
      if (px < PLOT_TX + 10) break;
      props.push({
        kind: 'pylon', x: px * TILE + 8, y: (py + (i % 2) * 2) * TILE + 20,
        variant: 0, solidW: 4, solidH: 3, sways: false,
      });
    }
  }

  // --- lore markers, positioned relative to their district's anchor so the
  // writing always sits on the thing it is about.
  const anchors: Record<string, [number, number]> = {
    benteng: [KEEP_TX, KEEP_TY],
    kolam: [VILLAGE_TX, VILLAGE_TY],
    neon: [QUAY_TX, QUAY_TY],
    rimbun: [GROVE_TX, GROVE_TY],
  };
  const FORM_PROP: Record<string, Prop['kind']> = {
    plaque: 'plaque', terminal: 'terminal', runestone: 'tablet', signpost: 'notice',
  };
  for (const f of LORE) {
    const [ax, ay] = anchors[f.region];
    const tx = ax + f.dx;
    const ty = ay + f.dy;
    // Never drop a readable object into water or inside a wall.
    if (isWater(get(tx, ty)) || get(tx, ty) === Tile.Blocked) continue;
    props.push({
      kind: FORM_PROP[f.form], x: tx * TILE + 8, y: ty * TILE + 14,
      variant: Math.abs(hashStr(f.id)) % VARIANTS.marker,
      solidW: 5, solidH: 4, sways: false, lore: f.id,
    });
  }

  props.sort((a, b) => a.y - b.y);

  const spots = buildSpots({
    pierX: (PIER_TX + 1) * TILE, pierY: (dockTip + 1) * TILE,
    pointX: POINT_TX * TILE, pointY: (shore[POINT_TX] - 4) * TILE,
    bayX: BAY_TX * TILE, bayY: (bayShore - 4) * TILE,
    mouthX: RIVER_MOUTH_TX * TILE, mouthY: (shore[RIVER_MOUTH_TX] - 2) * TILE,
    riverX: riverPath.midX * TILE, riverY: riverPath.midY * TILE,
    swampX: SWAMP_TX * TILE + 60, swampY: SWAMP_TY * TILE,
    deepX: (PIER_TX + 1) * TILE, deepY: -40,
  });

  return {
    tiles, variant, props, plots, shore, spots,
    dockX: PIER_TX,
    spawnX: (PIER_TX + 1) * TILE + 8,
    spawnY: (dockTip + 1) * TILE,
    landmarks: {
      villageX: VILLAGE_TX, villageY: VILLAGE_TY,
      pierX: PIER_TX + 2, pierTipY: dockTip + 1,
      plotX: PLOT_TX, plotY: PLOT_TY + 5,
      bayX: BAY_TX + 1, bayY: bayShore - 4,
      keepX: KEEP_TX, keepY: KEEP_TY,
      quayX: QUAY_TX, quayY: QUAY_TY,
      groveX: GROVE_TX, groveY: GROVE_TY,
    },
  };
}

// ================================================================ districts

/** Medieval: a ruined keep on the western headland. Curtain wall, two
 *  towers, a cobbled yard, banners still hanging, and a moat cut in from
 *  the lake so you can fish the walls. */
function buildKeep(
  set: (tx: number, ty: number, t: Tile) => void,
  get: (tx: number, ty: number) => Tile,
  props: Prop[],
  rng: Rng,
  shore: Int16Array,
): void {
  const kx = KEEP_TX;
  const ky = KEEP_TY;

  // Cobbled yard, edges eaten by noise so it looks laid rather than pasted.
  for (let ty = ky - 8; ty <= ky + 10; ty++) {
    for (let tx = kx - 12; tx <= kx + 14; tx++) {
      if (get(tx, ty) !== Tile.Grass) continue;
      const nx = (tx - kx) / 13;
      const ny = (ty - ky) / 9.5;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d < 0.85 + valueNoise(tx * 0.4, ty * 0.4, 71) * 0.35) set(tx, ty, Tile.Cobble);
    }
  }

  // The moat: a channel from the lake around the north and east of the yard.
  const moatTop = shore[Math.max(0, Math.min(shore.length - 1, kx))];
  for (let ty = moatTop; ty <= ky - 9; ty++) {
    for (let tx = kx - 3; tx <= kx + 3; tx++) {
      const wob = Math.round(Math.sin(ty * 0.4) * 2);
      if (get(tx + wob, ty) !== Tile.Blocked) set(tx + wob, ty, Tile.River);
    }
  }
  for (let tx = kx - 14; tx <= kx + 16; tx++) {
    const ty = ky - 9 + Math.round(Math.sin(tx * 0.3) * 1.5);
    for (let k = 0; k < 3; k++) {
      if (get(tx, ty + k) !== Tile.Blocked) set(tx, ty + k, Tile.River);
    }
  }

  // Curtain wall along the south and west of the yard, with a gap for the
  // gate. Walls block; the wall sprite is drawn as a prop on top.
  const wallCells: Array<[number, number]> = [];
  for (let tx = kx - 12; tx <= kx + 14; tx += 2) {
    if (tx > kx - 3 && tx < kx + 3) continue; // gateway
    wallCells.push([tx, ky + 10]);
  }
  for (let ty = ky - 6; ty <= ky + 10; ty += 2) wallCells.push([kx - 12, ty]);
  for (const [tx, ty] of wallCells) {
    props.push({
      kind: 'wallseg', x: tx * TILE + 16, y: ty * TILE + 16,
      variant: rng.int(0, VARIANTS.wallseg - 1), solidW: 16, solidH: 8, sways: false,
    });
    set(tx, ty, Tile.Blocked);
    set(tx + 1, ty, Tile.Blocked);
  }

  // Towers at the corners and one keeping the gate.
  for (const [tx, ty] of [[kx - 12, ky - 7], [kx + 14, ky + 10], [kx + 14, ky - 7]] as const) {
    props.push({
      kind: 'tower', x: tx * TILE + 16, y: ty * TILE + 20,
      variant: rng.int(0, VARIANTS.tower - 1), solidW: 14, solidH: 10, sways: false,
    });
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) set(tx + i, ty + j, Tile.Blocked);
  }

  // The great hall fills the middle of the yard, so it stops being a flat
  // expanse of cobble, and a gatehouse covers the gap in the wall.
  props.push({
    kind: 'keephall', x: (kx + 3) * TILE, y: (ky + 4) * TILE,
    variant: 0, solidW: 34, solidH: 18, sways: false,
  });
  for (let ty = ky + 1; ty <= ky + 4; ty++) {
    for (let tx = kx - 1; tx <= kx + 6; tx++) set(tx, ty, Tile.Blocked);
  }
  props.push({
    kind: 'gatehouse', x: kx * TILE, y: (ky + 11) * TILE + 8,
    variant: 0, solidW: 0, solidH: 0, sways: false,
  });

  // Banners on the standing stretches, torches along the yard.
  for (let i = 0; i < 6; i++) {
    const tx = kx - 10 + i * 4;
    props.push({
      kind: 'banner', x: tx * TILE + 8, y: (ky + 9) * TILE,
      variant: rng.int(0, VARIANTS.banner - 1), solidW: 0, solidH: 0, sways: true,
    });
  }
  for (let i = 0; i < 8; i++) {
    const tx = kx - 10 + i * 3;
    const ty = ky + (i % 2 === 0 ? -6 : 7);
    if (get(tx, ty) !== Tile.Cobble) continue;
    props.push({
      kind: 'torch', x: tx * TILE + 8, y: ty * TILE + 18,
      variant: 0, solidW: 0, solidH: 0, sways: false,
    });
  }

  // Fallen masonry scattered through the yard.
  for (let i = 0; i < 20; i++) {
    const tx = kx + rng.int(-11, 13);
    const ty = ky + rng.int(-7, 9);
    if (get(tx, ty) !== Tile.Cobble) continue;
    props.push({
      kind: 'rock', x: tx * TILE + rng.int(0, 12), y: ty * TILE + rng.int(6, 14),
      variant: rng.int(0, VARIANTS.rock - 1), solidW: 0, solidH: 0, sways: false,
    });
  }
}

/** Cyberpunk: a straight concrete quay cut into the eastern shore, lit by
 *  signs, with outfall pipes warming the water. */
function buildQuay(
  set: (tx: number, ty: number, t: Tile) => void,
  get: (tx: number, ty: number) => Tile,
  props: Prop[],
  rng: Rng,
  shore: Int16Array,
): void {
  const qx = QUAY_TX;
  const qy = QUAY_TY;

  // Square off the shoreline: the city does not do wandering coastlines.
  for (let tx = qx - 16; tx <= qx + 18; tx++) {
    if (tx < 0 || tx >= MAP_W) continue;
    const edge = qy;
    shore[tx] = edge;
    for (let ty = 0; ty < MAP_H; ty++) {
      if (ty < edge - 1) set(tx, ty, Tile.Water);
      else if (ty === edge - 1) set(tx, ty, Tile.Water);
      else if (ty === edge) set(tx, ty, Tile.Grate);
      else if (ty < edge + 16) set(tx, ty, Tile.Concrete);
    }
  }
  // Ragged inland edge where concrete gives way to grass again.
  for (let tx = qx - 16; tx <= qx + 18; tx++) {
    const depth = 10 + Math.round(valueNoise(tx * 0.3, 0, 97) * 6);
    for (let ty = qy + depth; ty < qy + 18; ty++) {
      if (get(tx, ty) === Tile.Concrete) set(tx, ty, Tile.Grass);
    }
  }

  // A wall of blocks set back from the water. The quay is the stage; the
  // buildings are the backdrop that tells you it is a city and not a yard.
  let bx = qx - 16;
  while (bx < qx + 18) {
    const variant = rng.int(0, VARIANTS.block - 1);
    const widthTiles = 4 + (variant % 3);
    const setback = qy + 10 + rng.int(0, 6);
    props.push({
      kind: 'block', x: bx * TILE + widthTiles * 8, y: setback * TILE,
      variant, solidW: widthTiles * 8, solidH: 10, sways: false,
    });
    for (let ty = setback - 2; ty <= setback; ty++) {
      for (let tx = bx; tx < bx + widthTiles; tx++) set(tx, ty, Tile.Blocked);
    }
    // Rooftop tank on the taller ones.
    if (rng.chance(0.45)) {
      props.push({
        kind: 'tank', x: bx * TILE + widthTiles * 8, y: (setback - 7) * TILE,
        variant: rng.int(0, VARIANTS.tank - 1), solidW: 0, solidH: 0, sways: false,
      });
    }
    // Real gaps between blocks: alleys. A continuous run of towers reads as
    // one dark wall, and the alleys are where the neon wash gets to land on
    // ground you can actually see.
    bx += widthTiles + rng.int(2, 4);
  }

  // Signs on masts along the quay.
  for (let i = 0; i < 9; i++) {
    const tx = qx - 14 + i * 4;
    props.push({
      kind: 'sign', x: tx * TILE + 8, y: (qy + 2 + (i % 3)) * TILE,
      variant: rng.int(0, VARIANTS.sign - 1), solidW: 3, solidH: 3, sways: false,
    });
  }
  // Outfall pipes, mouths at the water.
  for (let i = 0; i < 4; i++) {
    const tx = qx - 12 + i * 8;
    props.push({
      kind: 'pipe', x: tx * TILE, y: qy * TILE + 14,
      variant: 0, solidW: 0, solidH: 0, sways: false,
    });
  }
  // Antenna masts set back from the water.
  for (let i = 0; i < 4; i++) {
    const tx = qx - 12 + i * 9;
    props.push({
      kind: 'antenna', x: tx * TILE + 8, y: (qy + 9 + (i % 2) * 3) * TILE,
      variant: rng.int(0, VARIANTS.antenna - 1), solidW: 5, solidH: 4, sways: false,
    });
  }
  // Fencing along the back edge.
  for (let i = 0; i < 16; i++) {
    const tx = qx - 15 + i * 2;
    props.push({
      kind: 'chainfence', x: tx * TILE + 8, y: (qy + 13) * TILE + 20,
      variant: 0, solidW: 8, solidH: 3, sways: false,
    });
  }
  // Crates and barrels: a working dock, not a showroom.
  for (let i = 0; i < 14; i++) {
    const tx = qx + rng.int(-14, 16);
    const ty = qy + rng.int(2, 11);
    if (get(tx, ty) !== Tile.Concrete) continue;
    props.push({
      kind: rng.chance(0.5) ? 'crate' : 'barrel',
      x: tx * TILE + 8, y: ty * TILE + 14,
      variant: 0, solidW: 5, solidH: 4, sways: false,
    });
  }
}

/** Fantasy: a grove of luminous trees around a still, glowing pool. */
function buildGrove(
  set: (tx: number, ty: number, t: Tile) => void,
  get: (tx: number, ty: number) => Tile,
  props: Prop[],
  rng: Rng,
): void {
  const gx = GROVE_TX;
  const gy = GROVE_TY;

  for (let ty = gy - 12; ty <= gy + 11; ty++) {
    for (let tx = gx - 28; tx <= gx + 28; tx++) {
      if (get(tx, ty) !== Tile.Grass) continue;
      const nx = (tx - gx) / 29;
      const ny = (ty - gy) / 12.5;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d < 0.88 + valueNoise(tx * 0.95, ty * 0.95, 83) * 0.34) set(tx, ty, Tile.Grove);
    }
  }
  // The pool.
  for (let ty = gy - 5; ty <= gy + 5; ty++) {
    for (let tx = gx - 9; tx <= gx + 9; tx++) {
      const nx = (tx - gx) / 9.5;
      const ny = (ty - gy) / 5.5;
      const d = Math.sqrt(nx * nx + ny * ny);
      // High-frequency noise on the rim: at low frequency neighbouring
      // tiles agree and the ellipse quantises into long straight steps.
      if (d < 0.82 + valueNoise(tx * 1.35, ty * 1.35, 29) * 0.30) set(tx, ty, Tile.Spirit);
    }
  }

  // Rune stones ringing the pool.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const tx = Math.round(gx + Math.cos(a) * 13);
    const ty = Math.round(gy + Math.sin(a) * 8);
    if (get(tx, ty) !== Tile.Grove) continue;
    props.push({
      kind: 'rune', x: tx * TILE + 8, y: ty * TILE + 16,
      variant: rng.int(0, VARIANTS.rune - 1), solidW: 5, solidH: 4, sways: false,
    });
  }

  for (let i = 0; i < 34; i++) {
    const tx = gx + rng.int(-27, 27);
    const ty = gy + rng.int(-11, 10);
    if (get(tx, ty) !== Tile.Grove) continue;
    const roll = rng.next();
    if (roll < 0.32) {
      props.push({
        kind: 'spirittree', x: tx * TILE + 8, y: ty * TILE + 15,
        variant: rng.int(0, VARIANTS.spirittree - 1), solidW: 6, solidH: 4, sways: true,
      });
    } else if (roll < 0.62) {
      props.push({
        kind: 'mushroom', x: tx * TILE + rng.int(0, 12), y: ty * TILE + rng.int(8, 15),
        variant: rng.int(0, VARIANTS.mushroom - 1), solidW: 0, solidH: 0, sways: true,
      });
    } else {
      props.push({
        kind: 'crystal', x: tx * TILE + rng.int(0, 10), y: ty * TILE + rng.int(8, 15),
        variant: rng.int(0, VARIANTS.crystal - 1), solidW: 0, solidH: 0, sways: false,
      });
    }
  }
}

/** Houses along a street, a square with a well and a stall, and fenced
 *  gardens behind. Laid out by hand rather than scattered — a village is
 *  the one thing in this world that people built on purpose. */
function buildVillage(
  set: (tx: number, ty: number, t: Tile) => void,
  get: (tx: number, ty: number) => Tile,
  props: Prop[],
  rng: Rng,
): void {
  const vx = VILLAGE_TX;
  const vy = VILLAGE_TY;

  // The street: two tiles wide, running east-west through the square.
  for (let tx = vx - 16; tx <= vx + 16; tx++) {
    for (let k = 0; k < 2; k++) {
      if (get(tx, vy + 4 + k) === Tile.Grass) set(tx, vy + 4 + k, Tile.Dirt);
    }
  }
  // The square: a modest patch of packed earth around the well. Big enough
  // to gather in, small enough that the village still sits on grass.
  for (let ty = vy + 2; ty <= vy + 9; ty++) {
    for (let tx = vx - 5; tx <= vx + 5; tx++) {
      const nx = (tx - vx) / 5.5;
      const ny = (ty - (vy + 6)) / 3.6;
      if (nx * nx + ny * ny > 1) continue;
      if (get(tx, ty) === Tile.Grass) set(tx, ty, Tile.Dirt);
    }
  }

  // Houses: north side faces the street, south side sits behind it.
  const lots: Array<[number, number, number]> = [
    [vx - 15, vy + 1, 0], [vx - 9, vy, 1], [vx - 2, vy + 1, 2],
    [vx + 5, vy, 3], [vx + 12, vy + 1, 4],
    [vx - 13, vy + 10, 2], [vx - 5, vy + 11, 4], [vx + 3, vy + 10, 0],
    [vx + 11, vy + 11, 1],
  ];
  for (const [htx, hty, style] of lots) {
    const px = htx * TILE + 24;
    const py = hty * TILE + 52;
    props.push({
      kind: 'house', x: px, y: py, variant: style,
      solidW: 24, solidH: 14, sways: false,
    });
    // Block the footprint so nobody walks through a wall.
    for (let ty = hty; ty < hty + 3; ty++) {
      for (let tx = htx - 1; tx < htx + 4; tx++) set(tx, ty, Tile.Blocked);
    }
    // A single-tile path from the door out to the street.
    const doorY = hty + 3;
    const dir = hty < vy + 5 ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const ty = doorY + dir * k;
      if (get(htx + 1, ty) === Tile.Grass) set(htx + 1, ty, Tile.Dirt);
    }
    // A tree or a bush in the yard, so houses are not standing in a car park.
    if (rng.chance(0.75)) {
      props.push({
        kind: rng.chance(0.55) ? 'tree' : 'bush',
        x: (htx + rng.int(-2, 4)) * TILE + rng.int(0, 12),
        y: (hty + (dir > 0 ? -1 : 4)) * TILE + rng.int(8, 15),
        variant: rng.int(0, VARIANTS.tree - 1),
        solidW: 0, solidH: 0, sways: true,
      });
    }
    for (let i = 0; i < rng.int(1, 4); i++) {
      props.push({
        kind: 'flower',
        x: (htx + rng.int(-1, 4)) * TILE + rng.int(0, 12),
        y: (hty + 3) * TILE + rng.int(2, 14),
        variant: rng.int(0, VARIANTS.flower - 1), solidW: 0, solidH: 0, sways: true,
      });
    }
  }

  // The well and the stall, in the square.
  props.push({ kind: 'well', x: vx * TILE, y: (vy + 6) * TILE, variant: 0, solidW: 10, solidH: 6, sways: false });
  props.push({ kind: 'stall', x: (vx + 5) * TILE, y: (vy + 7) * TILE, variant: 0, solidW: 16, solidH: 6, sways: false });
  props.push({ kind: 'board', x: (vx - 4) * TILE, y: (vy + 8) * TILE, variant: 0, solidW: 12, solidH: 4, sways: false });

  // Fenced gardens behind the southern houses.
  for (const [htx, hty] of [[vx - 13, vy + 14], [vx + 3, vy + 14]] as const) {
    for (let i = 0; i < 6; i++) {
      props.push({
        kind: 'fence0', x: (htx + i) * TILE + 8, y: hty * TILE + 14,
        variant: 0, solidW: 8, solidH: 3, sways: false,
      });
    }
    for (let j = 0; j < 3; j++) {
      props.push({
        kind: 'fence1', x: htx * TILE + 4, y: (hty + j) * TILE + 18,
        variant: 0, solidW: 3, solidH: 8, sways: false,
      });
      props.push({
        kind: 'fence1', x: (htx + 6) * TILE + 4, y: (hty + j) * TILE + 18,
        variant: 0, solidW: 3, solidH: 8, sways: false,
      });
    }
  }

  // Street lanterns and a bit of clutter.
  for (let i = -2; i <= 2; i++) {
    props.push({
      kind: 'lantern', x: (vx + i * 7) * TILE + 5, y: (vy + 3) * TILE + 28,
      variant: 0, solidW: 2, solidH: 2, sways: false,
    });
  }
  for (let i = 0; i < 8; i++) {
    const tx = vx + rng.int(-14, 14);
    const ty = vy + rng.int(1, 12);
    if (get(tx, ty) !== Tile.Dirt) continue;
    props.push({
      kind: rng.chance(0.5) ? 'crate' : 'barrel',
      x: tx * TILE + 8, y: ty * TILE + 14, variant: 0,
      solidW: 5, solidH: 4, sways: false,
    });
  }
}

interface RiverPath {
  points: Array<[number, number]>;
  bridgeX: number;
  bridgeY: number;
  midX: number;
  midY: number;
}

/** Carves a river from the south-east corner up into the lake, with sandy
 *  banks and a plank bridge where the farm path needs to cross. */
function carveRiver(
  set: (tx: number, ty: number, t: Tile) => void,
  get: (tx: number, ty: number) => Tile,
  rng: Rng,
): RiverPath {
  const points: Array<[number, number]> = [];
  let x = MAP_W - 8;
  let y = MAP_H - 5;
  const targetX = RIVER_MOUTH_TX;

  while (y > 14) {
    const t = (MAP_H - 5 - y) / (MAP_H - 19);
    const drift = Math.sin(t * 5.2) * 6 + valueNoise(y * 0.12, 0, 71) * 6 - 3;
    x = Math.round(MAP_W - 8 + (targetX - (MAP_W - 8)) * t + drift);
    points.push([x, y]);

    const halfW = 1 + Math.round(t * 1.6);
    for (let i = -halfW; i <= halfW; i++) set(x + i, y, Tile.River);
    // Sandy banks, only where there was grass.
    for (const i of [-halfW - 1, halfW + 1]) {
      if (get(x + i, y) === Tile.Grass) set(x + i, y, Tile.Sand);
    }
    y -= 1;
  }

  // Bridge across a straightish stretch, roughly two thirds of the way down.
  const bi = Math.floor(points.length * 0.55);
  const [bx, by] = points[bi];
  for (let i = -4; i <= 4; i++) set(bx + i, by, Tile.Dock);
  for (let i = -4; i <= 4; i++) set(bx + i, by - 1, Tile.Dock);

  const [mx, my] = points[Math.floor(points.length * 0.3)];
  void rng;
  return { points, bridgeX: bx, bridgeY: by, midX: mx, midY: my };
}

/** A cluster of still, dark pools with dead trees standing in them. */
function carveSwamp(
  set: (tx: number, ty: number, t: Tile) => void,
  get: (tx: number, ty: number) => Tile,
  props: Prop[],
  rng: Rng,
): void {
  for (let ty = SWAMP_TY - 8; ty <= SWAMP_TY + 8; ty++) {
    for (let tx = SWAMP_TX - 6; tx <= SWAMP_TX + 16; tx++) {
      if (get(tx, ty) !== Tile.Grass) continue;
      const nx = (tx - (SWAMP_TX + 5)) / 11;
      const ny = (ty - SWAMP_TY) / 7;
      const d = Math.sqrt(nx * nx + ny * ny);
      const edge = valueNoise(tx * 0.32, ty * 0.32, 43);
      if (d < 0.55 + edge * 0.45) set(tx, ty, Tile.Swamp);
      else if (d < 0.85 + edge * 0.4) set(tx, ty, Tile.Dirt);
    }
  }
  // Dead trees standing in the water, and rotting stumps on the margin.
  for (let i = 0; i < 26; i++) {
    const tx = SWAMP_TX + rng.int(-4, 14);
    const ty = SWAMP_TY + rng.int(-7, 7);
    const t = get(tx, ty);
    if (t !== Tile.Swamp && t !== Tile.Dirt) continue;
    props.push({
      kind: 'deadtree', x: tx * TILE + rng.int(0, 12), y: ty * TILE + rng.int(6, 15),
      variant: rng.int(0, VARIANTS.deadtree - 1), solidW: 0, solidH: 0, sways: true,
    });
  }
}

function carvePath(
  set: (tx: number, ty: number, t: Tile) => void,
  get: (tx: number, ty: number) => Tile,
  x0: number, y0: number, x1: number, y1: number,
  width = 2, bow = 26,
): void {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * bow;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    for (let j = 0; j < width; j++) {
      // Paths stop at the water rather than paving over it.
      if (get(tx + j, ty) === Tile.Grass) set(tx + j, ty, Tile.Dirt);
    }
  }
}

/** Vegetation is placed by a "forest density" field rather than a flat
 *  per-tile chance. A uniform sprinkle of trees reads as decoration; real
 *  groves with clearings between them read as a place. */
function scatter(rng: Rng, tiles: Uint8Array, props: Prop[]): void {
  const nearOpen = (tx: number, ty: number): boolean => {
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const t = tiles[(ty + j) * MAP_W + (tx + i)];
        if (t === Tile.Dirt || t === Tile.Plot || t === Tile.Dock) return true;
      }
    }
    return false;
  };

  for (let ty = 17; ty < MAP_H - 3; ty++) {
    for (let tx = 2; tx < MAP_W - 2; tx++) {
      if (tiles[ty * MAP_W + tx] !== Tile.Grass) continue;
      // Districts dress themselves; pastoral trees stay out.
      if (districtForTile(tx, ty)) continue;

      // One low-frequency octave decides where copses are; a second breaks
      // up their edges. Weighting the big octave heavily is what produces
      // actual woods and actual clearings.
      const grove = valueNoise(tx * 0.055, ty * 0.055, 77);
      const detail = valueNoise(tx * 0.19, ty * 0.19, 91);
      let forest = grove * 0.75 + detail * 0.25;
      const edge = Math.min(tx, MAP_W - 1 - tx) / 16;
      const south = Math.max(0, (ty - 26) / (MAP_H - 26));
      forest += (1 - Math.min(1, edge)) * 0.30 + south * 0.22;

      const dens = Math.max(0, Math.min(1, (forest - 0.44) * 3.4));
      const open = nearOpen(tx, ty);

      if (!open && rng.chance(dens * 0.60)) {
        props.push({
          kind: 'tree', x: tx * TILE + rng.int(2, 13), y: ty * TILE + rng.int(8, 15),
          variant: rng.int(0, VARIANTS.tree - 1), solidW: 6, solidH: 4, sways: true,
        });
        continue;
      }
      if (rng.chance(dens * 0.28 + 0.02)) {
        props.push({
          kind: 'bush', x: tx * TILE + rng.int(0, 12), y: ty * TILE + rng.int(8, 15),
          variant: rng.int(0, VARIANTS.bush - 1), solidW: 0, solidH: 0, sways: true,
        });
        continue;
      }
      if (rng.chance(0.03)) {
        props.push({
          kind: 'rock', x: tx * TILE + rng.int(0, 10), y: ty * TILE + rng.int(6, 14),
          variant: rng.int(0, VARIANTS.rock - 1), solidW: 0, solidH: 0, sways: false,
        });
        continue;
      }
      if (rng.chance((1 - dens) * 0.16 + 0.02)) {
        props.push({
          kind: 'flower', x: tx * TILE + rng.int(0, 10), y: ty * TILE + rng.int(4, 14),
          variant: rng.int(0, VARIANTS.flower - 1), solidW: 0, solidH: 0, sways: true,
        });
        continue;
      }
      if (rng.chance(0.16 + dens * 0.30)) {
        props.push({
          kind: 'tallgrass', x: tx * TILE + rng.int(0, 12), y: ty * TILE + rng.int(8, 16),
          variant: rng.int(0, VARIANTS.tallgrass - 1), solidW: 0, solidH: 0, sways: true,
        });
      }
    }
  }
}


/** Stable small hash, used to pick a marker variant from its fragment id. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

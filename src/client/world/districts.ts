/** Genre districts.
 *
 *  The world is one continuous map, but it is not one aesthetic. Walk west
 *  and the palette cools into stone and banners; walk east and it drops
 *  into neon and wet concrete; walk south past the woods and it goes
 *  violet. The cozy lake stays the hub in the middle.
 *
 *  A district is *data*, not code: bounds, a tint, a fog colour, a fish
 *  table and a dialogue register. Adding the next genre means adding an
 *  entry here plus its art generators — nothing in the renderer, the
 *  fishing roll or the dialogue system needs to learn about it. */

import { TILE } from '../../shared/constants';

export type Genre = 'pastoral' | 'medieval' | 'cyber' | 'fantasy';
export type Register = 'cozy' | 'medieval' | 'cyber' | 'fantasy';

export interface District {
  id: string;
  label: string;
  genre: Genre;
  blurb: string;
  /** Bounds in tiles, inclusive. */
  tx0: number;
  ty0: number;
  tx1: number;
  ty1: number;
  /** Tiles over which the look fades in and out at the border. Without a
   *  soft edge the world reads as four screenshots taped together. */
  feather: number;
  /** Multiplied into the day/night ambient inside the district. */
  tint: [number, number, number];
  /** Horizon haze and near-water colour inside the district. */
  fog: [number, number, number];
  /** How strongly the tint replaces the natural ambient, 0..1. */
  strength: number;
  /** Self-lit districts stay readable at night instead of going black. */
  nightFloor: number;
  /** Species multipliers, layered on top of the spot's own table. */
  fish: Record<string, number>;
  register: Register;
}

export const DISTRICTS: District[] = [
  {
    id: 'benteng',
    label: 'Benteng Lama',
    genre: 'medieval',
    blurb: 'Batunya sudah lumutan, panjinya masih berdiri.',
    tx0: 2, ty0: 8, tx1: 38, ty1: 56,
    feather: 7,
    // Cool and slightly desaturated: stone country, not a different planet.
    tint: [0.82, 0.84, 0.96],
    fog: [0.52, 0.53, 0.62],
    strength: 0.55,
    nightFloor: 0.06,
    fish: {
      belida: 2.4, gabus: 2.0, patin: 1.8, duskeel: 1.6,
      lelemail: 3.2, koibenteng: 3.0, ikanpanji: 2.6,
      seluang: 0.5, sunfish: 0.4,
    },
    register: 'medieval',
  },
  {
    id: 'neon',
    label: 'Dermaga Neon',
    genre: 'cyber',
    blurb: 'Airnya hangat dari pipa. Ikannya juga sudah beda.',
    tx0: 140, ty0: 8, tx1: 178, ty1: 58,
    feather: 7,
    // Very cool and dark. The colour in this district comes from the signs,
    // not from the ambient — that is the whole point of neon.
    tint: [0.62, 0.72, 0.98],
    fog: [0.10, 0.20, 0.34],
    strength: 0.78,
    nightFloor: 0.30,
    fish: {
      kromsirip: 3.4, ikanstatik: 3.0, nikelmas: 2.6,
      glassfin: 2.0, bawal: 1.6, kaleng: 2.2,
      wader: 0.4, jelawat: 0.3, sunfish: 0.2,
    },
    register: 'cyber',
  },
  {
    id: 'rimbun',
    label: 'Rimbun Cahaya',
    genre: 'fantasy',
    blurb: 'Jamurnya menyala sendiri. Tidak ada yang tahu kenapa.',
    tx0: 54, ty0: 70, tx1: 116, ty1: 94,
    feather: 8,
    tint: [0.80, 0.78, 1.02],
    fog: [0.28, 0.22, 0.44],
    strength: 0.62,
    nightFloor: 0.22,
    fish: {
      ikanrembulan: 3.4, sisikembun: 3.0, naganila: 2.4,
      bintangair: 2.6, ikanhantu: 2.0, glassfin: 1.8,
      kaleng: 0.2, oldboot: 0.2,
    },
    register: 'fantasy',
  },
];

export interface DistrictBlend {
  /** Strongest district at this point, or null out in the pastoral hub. */
  district: District | null;
  /** 0..1 — how much of that district's look applies here. */
  weight: number;
}

/** Weight falls off smoothly across `feather` tiles outside the bounds, so
 *  the genres bleed into each other instead of switching at a hard line. */
export function districtAt(x: number, y: number): DistrictBlend {
  let best: District | null = null;
  let bestW = 0;
  for (const d of DISTRICTS) {
    const w = weightFor(d, x, y);
    if (w > bestW) {
      bestW = w;
      best = d;
    }
  }
  return { district: bestW > 0.002 ? best : null, weight: bestW };
}

function weightFor(d: District, x: number, y: number): number {
  const f = d.feather * TILE;
  const x0 = d.tx0 * TILE;
  const y0 = d.ty0 * TILE;
  const x1 = (d.tx1 + 1) * TILE;
  const y1 = (d.ty1 + 1) * TILE;

  // Signed distance outside the rect, per axis.
  const dx = Math.max(x0 - x, 0, x - x1);
  const dy = Math.max(y0 - y, 0, y - y1);
  const dist = Math.hypot(dx, dy);
  if (dist >= f) return 0;
  const t = 1 - dist / f;
  return t * t * (3 - 2 * t); // smoothstep
}

/** True when a tile is inside the district proper, used by the generator
 *  rather than by the renderer. */
export function inDistrict(d: District, tx: number, ty: number): boolean {
  return tx >= d.tx0 && tx <= d.tx1 && ty >= d.ty0 && ty <= d.ty1;
}

export function districtForTile(tx: number, ty: number): District | null {
  for (const d of DISTRICTS) if (inDistrict(d, tx, ty)) return d;
  return null;
}

export function byId(id: string): District | undefined {
  return DISTRICTS.find((d) => d.id === id);
}

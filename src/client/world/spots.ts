/** Fishing spots.
 *
 *  A lake with one pier is a mechanic. A world worth walking around needs
 *  places that fish differently: a shallow reed bay where only small fish
 *  live, a rocky point with deep water off the end, a swamp that only wakes
 *  up after dark. Each spot multiplies the species table, so where you cast
 *  matters as much as when. */

export interface Spot {
  id: string;
  label: string;
  /** Centre in world pixels, and the radius over which it applies. */
  x: number;
  y: number;
  r: number;
  /** Per-species multipliers on the roll. Anything unlisted stays at 1. */
  mult: Record<string, number>;
  /** Baseline depth for the rarity roll, 0..1. Casting further still helps. */
  depth: number;
  blurb: string;
}

export const DEFAULT_SPOT: Spot = {
  id: 'kolam',
  label: 'Kolam',
  x: 0, y: 0, r: 0,
  mult: {},
  depth: 0.35,
  blurb: 'Air terbuka.',
};

/** Built from the generated map so the spots always sit on real features. */
export function buildSpots(f: {
  pierX: number; pierY: number;
  pointX: number; pointY: number;
  bayX: number; bayY: number;
  mouthX: number; mouthY: number;
  riverX: number; riverY: number;
  swampX: number; swampY: number;
  deepX: number; deepY: number;
}): Spot[] {
  return [
    {
      id: 'dermaga', label: 'Dermaga Tua', x: f.pierX, y: f.pierY, r: 150,
      mult: {}, depth: 0.45,
      blurb: 'Papannya sudah lapuk, tapi ikannya masih mau lewat.',
    },
    {
      id: 'teluk', label: 'Teluk Eceng', x: f.bayX, y: f.bayY, r: 190,
      mult: {
        sepat: 3.5, betok: 3, seluang: 3, wader: 2.5, nila: 1.6,
        arwana: 0.2, belida: 0.2, ikanhantu: 0.1, duskeel: 0.4, patin: 0.3,
      },
      depth: 0.12,
      blurb: 'Dangkal, penuh eceng gondok. Ikannya kecil-kecil tapi rame.',
    },
    {
      id: 'tanjung', label: 'Tanjung Batu', x: f.pointX, y: f.pointY, r: 175,
      mult: {
        belida: 3, arwana: 2.6, patin: 2.4, duskeel: 2.2, bawal: 1.8, glassfin: 1.8,
        wader: 0.3, seluang: 0.3, sepat: 0.3,
      },
      depth: 0.9,
      blurb: 'Batunya langsung nyemplung ke air dalam.',
    },
    {
      id: 'muara', label: 'Muara Sungai', x: f.mouthX, y: f.mouthY, r: 150,
      mult: { hampala: 3, jelawat: 2.6, tawes: 2.4, nila: 2, bawal: 1.6, ikanhantu: 0.3 },
      depth: 0.5,
      blurb: 'Air sungai ketemu air danau. Ikannya nunggu di situ.',
    },
    {
      id: 'sungai', label: 'Sungai Bening', x: f.riverX, y: f.riverY, r: 200,
      mult: {
        hampala: 2.6, seluang: 2.6, wader: 2.2, tawes: 1.8, jelawat: 1.6,
        lele: 0.4, gabus: 0.5, ikanhantu: 0.15, belida: 0.4,
      },
      depth: 0.28,
      blurb: 'Arusnya pelan, airnya bening sampai kelihatan dasarnya.',
    },
    {
      id: 'rawa', label: 'Rawa Teduh', x: f.swampX, y: f.swampY, r: 210,
      mult: {
        gabus: 3.4, lele: 3.2, ikanhantu: 2.6, duskeel: 2.2, betok: 1.8,
        tawes: 0.3, seluang: 0.4, sunfish: 0.2, bintangair: 0.4,
      },
      depth: 0.72,
      blurb: 'Airnya gelap dan diam. Yang di bawah sana ga keliatan.',
    },
    {
      id: 'lubuk', label: 'Lubuk Dalam', x: f.deepX, y: f.deepY, r: 165,
      mult: {
        ikanhantu: 3.2, bintangair: 3, glassfin: 2.6, arwana: 2.4, belida: 2,
        wader: 0.2, seluang: 0.2, sepat: 0.2, oldboot: 0.3, kaleng: 0.3,
      },
      depth: 1,
      blurb: 'Jauh dari tepi, dasarnya turun dalam banget.',
    },
  ];
}

/** Nearest spot whose radius contains the point, or the open-water default. */
export function spotAt(spots: Spot[], x: number, y: number): Spot {
  let best: Spot | null = null;
  let bestD = Infinity;
  for (const s of spots) {
    const d = Math.hypot(x - s.x, y - s.y);
    if (d <= s.r && d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best ?? DEFAULT_SPOT;
}

/** The day/night model. One function of normalized time drives the sky
 *  shader, the sprite tint, the lantern glow, and the post grade — so the
 *  whole frame always agrees about what time it is. */

export interface Lighting {
  /** Multiplied into every sprite. */
  ambient: [number, number, number];
  skyZenith: [number, number, number];
  skyMid: [number, number, number];
  skyHorizon: [number, number, number];
  /** Sun/moon direction across the sky, x = -1 (east) .. 1 (west). */
  sunX: number;
  /** Height above the horizon, negative when set. */
  sunY: number;
  sunColor: [number, number, number];
  /** 0 by day, 1 at deep night. Drives stars and lantern strength. */
  night: number;
  /** Distance fog / haze colour at the horizon. */
  haze: [number, number, number];
  /** Warm rim light strength on the light-facing side of sprites. */
  rim: number;
  label: string;
}

type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

interface Keyframe {
  t: number;
  label: string;
  zenith: RGB;
  mid: RGB;
  horizon: RGB;
  ambient: RGB;
  sun: RGB;
  haze: RGB;
  night: number;
  rim: number;
}

/** Hand-tuned keys around the clock. Dusk gets three of the eight slots
 *  because that is the hour the game is named after and the one players
 *  will sit in — it deserves the most colour resolution. */
const KEYS: Keyframe[] = [
  {
    t: 0.0, label: 'dini hari',
    zenith: hex('#10131f'), mid: hex('#1c2233'), horizon: hex('#2e3852'),
    ambient: hex('#6b7ca8'), sun: hex('#b9c4d8'), haze: hex('#2e3852'), night: 1, rim: 0.1,
  },
  {
    t: 0.20, label: 'subuh',
    zenith: hex('#2e3852'), mid: hex('#8a4f7d'), horizon: hex('#e8825f'),
    ambient: hex('#9d92b0'), sun: hex('#f7b978'), haze: hex('#c25f6e'), night: 0.45, rim: 0.5,
  },
  {
    t: 0.28, label: 'pagi',
    zenith: hex('#4fa3a8'), mid: hex('#8fd4c4'), horizon: hex('#f9e3b0'),
    ambient: hex('#ffe6c4'), sun: hex('#ffe9a8'), haze: hex('#f9e3b0'), night: 0, rim: 0.55,
  },
  {
    t: 0.45, label: 'siang',
    zenith: hex('#3f8fb8'), mid: hex('#84c6da'), horizon: hex('#d8ece6'),
    ambient: hex('#ffffff'), sun: hex('#fff6dc'), haze: hex('#bcd9dc'), night: 0, rim: 0.35,
  },
  {
    t: 0.62, label: 'sore',
    zenith: hex('#3a6f96'), mid: hex('#f7b978'), horizon: hex('#f9e3b0'),
    ambient: hex('#ffdcae'), sun: hex('#ffe9a8'), haze: hex('#f7cf9a'), night: 0, rim: 0.6,
  },
  {
    t: 0.74, label: 'senja',
    zenith: hex('#4a3a6b'), mid: hex('#c25f6e'), horizon: hex('#f7b978'),
    ambient: hex('#ffc79a'), sun: hex('#ff9d5c'), haze: hex('#e8825f'), night: 0.12, rim: 0.85,
  },
  {
    t: 0.83, label: 'magrib',
    zenith: hex('#2e3852'), mid: hex('#8a4f7d'), horizon: hex('#c25f6e'),
    ambient: hex('#b58ba0'), sun: hex('#e8825f'), haze: hex('#8a4f7d'), night: 0.55, rim: 0.5,
  },
  {
    t: 0.92, label: 'malam',
    zenith: hex('#10131f'), mid: hex('#1c2233'), horizon: hex('#4a3a6b'),
    ambient: hex('#7386b4'), sun: hex('#b9c4d8'), haze: hex('#2e3852'), night: 1, rim: 0.15,
  },
];

function lerpKeys(t: number): Keyframe {
  const n = KEYS.length;
  let i = 0;
  while (i < n - 1 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i];
  const b = KEYS[(i + 1) % n];
  const span = (b.t <= a.t ? b.t + 1 : b.t) - a.t;
  const k = span <= 0 ? 0 : Math.min(1, Math.max(0, (t - a.t) / span));
  // Smoothstep between keys so nothing pops at the boundary.
  const s = k * k * (3 - 2 * k);
  return {
    t,
    label: s < 0.5 ? a.label : b.label,
    zenith: mix(a.zenith, b.zenith, s),
    mid: mix(a.mid, b.mid, s),
    horizon: mix(a.horizon, b.horizon, s),
    ambient: mix(a.ambient, b.ambient, s),
    sun: mix(a.sun, b.sun, s),
    haze: mix(a.haze, b.haze, s),
    night: a.night + (b.night - a.night) * s,
    rim: a.rim + (b.rim - a.rim) * s,
  };
}

export function lightingAt(time: number, rain = 0): Lighting {
  const t = ((time % 1) + 1) % 1;
  const k = lerpKeys(t);

  // The sun travels from east to west between 0.18 and 0.80, so it is
  // sitting on the horizon during the "senja" keyframe rather than still
  // high in the sky. Outside that window the same track carries the moon.
  const dayPhase = (t - 0.18) / 0.62;
  const sunX = Math.cos(Math.PI * (1 - dayPhase));
  const sunY = Math.sin(Math.PI * dayPhase);

  const desat = (c: RGB, amt: number): RGB => {
    const l = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
    return [c[0] + (l - c[0]) * amt, c[1] + (l - c[1]) * amt, c[2] + (l - c[2]) * amt];
  };

  const rainDim = 1 - rain * 0.28;
  const scale = (c: RGB, s: number): RGB => [c[0] * s, c[1] * s, c[2] * s];

  return {
    ambient: scale(desat(k.ambient, rain * 0.5), rainDim),
    skyZenith: scale(desat(k.zenith, rain * 0.6), rainDim),
    skyMid: scale(desat(k.mid, rain * 0.6), rainDim),
    skyHorizon: scale(desat(k.horizon, rain * 0.6), rainDim),
    sunX,
    sunY,
    sunColor: k.sun,
    night: Math.min(1, k.night + rain * 0.15),
    haze: scale(desat(k.haze, rain * 0.55), rainDim),
    rim: k.rim * (1 - rain * 0.6),
    label: k.label,
  };
}

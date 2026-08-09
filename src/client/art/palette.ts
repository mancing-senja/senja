/** One curated 32-colour palette for the whole game.
 *
 *  Everything — sprites, generated foliage, UI, shader output — is quantised
 *  to these ramps. A single shared palette is the cheapest way to make
 *  hand-authored and code-generated art look like they came from the same
 *  hand, which is the difference between "cozy" and "asset flip".
 *
 *  Ramps are ordered dark → light so generators can shade by index arithmetic.
 */

export const PALETTE: readonly string[] = [
  // --- 0-31: the pastoral core. These indices are frozen; everything
  // already drawn refers to them by number.
  // 0-5  ink & mist (outlines, night, fog)
  '#10131f', '#1c2233', '#2e3852', '#4a5a7b', '#7b8bab', '#b9c4d8',
  // 6-10 skin & wood
  '#f2c9a0', '#d59a6b', '#a06a45', '#6f4630', '#4a2e21',
  // 11-16 greens
  '#2a4a35', '#3d6b45', '#5b9455', '#7cb85f', '#a8d472', '#d6e88f',
  // 17-21 water
  '#14324a', '#1d4d68', '#2c7288', '#4fa3a8', '#8fd4c4',
  // 22-27 sky & sunset
  '#f9e3b0', '#f7b978', '#e8825f', '#c25f6e', '#8a4f7d', '#4a3a6b',
  // 28-31 accents
  '#ffe9a8', '#ff9d5c', '#d8586b', '#f4f0e4',

  // --- 32-39: medieval. A cool, desaturated stone ramp with the shadow
  // hue-shifted toward violet, plus three saturated accents reserved for
  // banners and gilding — never for whole surfaces.
  '#2a2532', '#4a4455', '#6e6879', '#9a95a6', '#c8c3d0',
  '#8f2d3a', '#2f5d8c', '#c8933c',

  // --- 40-45: cyberpunk. The base is nearly black and very cool; the neon
  // is deliberately only three colours, meant for thin strokes and glow.
  // Painting a wall in neon is what makes cyberpunk pixel art look cheap.
  '#0a1424', '#16283f', '#2b4463',
  '#21e6ff', '#ff3d97', '#8cffcf',

  // --- 46-47: arcane. Violet for crystal and rune, light violet for the
  // bloom on top of it. Spirit glow borrows the neon mint above.
  '#7a3fd4', '#b98cff',
];

/** Characters used in sprite string art. '.' is transparent. */
export const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL';

export const enum C {
  InkDeep = 0, Ink = 1, Slate = 2, SlateLt = 3, Mist = 4, Pale = 5,
  Skin = 6, SkinSh = 7, Wood = 8, WoodDk = 9, WoodDp = 10,
  ForestDp = 11, Forest = 12, GrassDk = 13, Grass = 14, GrassLt = 15, LeafLt = 16,
  WaterDp = 17, Water = 18, WaterSh = 19, WaterBr = 20, Foam = 21,
  SunGlow = 22, Amber = 23, Orange = 24, Rose = 25, Purple = 26, Dusk = 27,
  Lantern = 28, Fire = 29, Red = 30, White = 31,

  // medieval
  StoneShadow = 32, StoneDk = 33, Stone = 34, StoneLt = 35, StonePale = 36,
  Banner = 37, BannerBlue = 38, Gold = 39,

  // cyberpunk
  CyberVoid = 40, CyberSlate = 41, CyberSteel = 42,
  NeonCyan = 43, NeonMagenta = 44, NeonMint = 45,

  // fantasy
  Arcane = 46, ArcaneLt = 47,
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const RGB_PALETTE: readonly RGB[] = PALETTE.map(hexToRgb);

/** Normalized 0..1 triple, for passing a palette colour to a shader. */
export function col01(i: C | number): [number, number, number] {
  const c = RGB_PALETTE[i];
  return [c.r / 255, c.g / 255, c.b / 255];
}

/** Maps a palette char back to its index; -1 for transparent. */
export function charToIndex(ch: string): number {
  if (ch === '.' || ch === ' ') return -1;
  return CHARS.indexOf(ch);
}

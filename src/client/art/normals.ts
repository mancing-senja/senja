/** Normal maps, generated from the sprites themselves.
 *
 *  Every sprite in this game is drawn by code, which means the moment the
 *  colour is baked we still have the shape in hand — and a shape is all a
 *  normal map needs. So the atlas gets a twin: same layout, same frames,
 *  but each pixel holds a surface direction instead of a colour. The sprite
 *  shader then lights everything from the sun's actual position, and the
 *  whole world turns with the day instead of holding one baked-in noon.
 *
 *  The method is the one the pixel-art tools use (Laigter, Sprite DLight):
 *  take a distance transform of the silhouette, treat it as a height field,
 *  and read the normal off its gradient. Pixels near an edge are low and
 *  face outward; pixels deep inside are high and face the viewer. That is
 *  what makes a flat sprite read as a rounded object under a moving light.
 *
 *  Two additions on top of the plain silhouette version:
 *
 *  Internal edges count too. A colour change inside a sprite is a real
 *  boundary — a sleeve against a torso, a roof against a wall — and folding
 *  those into the distance field is the difference between a sprite that
 *  lights like a pillow and one that lights like an object with parts.
 *
 *  The falloff is spherical rather than linear. Linear gives a bevelled
 *  edge and a dead flat middle; the square root rounds it, which is the
 *  "soft" mode in Laigter and the one that suits a character. */

import { PixelCanvas, TRANSPARENT } from './canvas';

/** How far from an edge a pixel stops getting rounder, in pixels. Small,
 *  because the sprites are small — at 4 the average 16-wide character is
 *  fully rounded by its own centreline. */
const MAX_DIST = 4;

export interface NormalMap {
  w: number;
  h: number;
  /** RGB encoded 0..255, alpha 255 where the sprite is solid. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** Chamfer distance transform, two passes.
 *
 *  Exact Euclidean would be nicer and is not worth it: these sprites are
 *  tens of pixels across, and the difference never survives being clamped
 *  to MAX_DIST and quantised into a byte. */
function distanceField(c: PixelCanvas, edges: boolean, ignoreOutline = false): Float32Array {
  const { w, h } = c;
  const d = new Float32Array(w * h);
  const solid = (x: number, y: number): boolean => {
    if (ignoreOutline) {
      const wx = ((x % w) + w) % w;
      const wy = ((y % h) + h) % h;
      return c.get(wx, wy) !== TRANSPARENT;
    }
    return x >= 0 && y >= 0 && x < w && y < h && c.get(x, y) !== TRANSPARENT;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid(x, y)) { d[i] = 0; continue; }
      // Seed: an edge is any pixel touching the outside, and — when asked —
      // any pixel whose colour differs from its neighbour. A tiling surface
      // ignores its own outline, because that outline is not a real edge —
      // the next tile is right there.
      let onEdge = ignoreOutline ? false : (!solid(x - 1, y) || !solid(x + 1, y)
        || !solid(x, y - 1) || !solid(x, y + 1));
      if (!onEdge && edges) {
        const v = c.get(x, y);
        const cw = (px: number, py: number): number => (ignoreOutline
          ? c.get(((px % w) + w) % w, ((py % h) + h) % h)
          : c.get(px, py));
        onEdge = cw(x - 1, y) !== v || cw(x + 1, y) !== v
          || cw(x, y - 1) !== v || cw(x, y + 1) !== v;
      }
      d[i] = onEdge ? 0 : Infinity;
    }
  }

  const relax = (i: number, from: number, cost: number): void => {
    const v = d[from] + cost;
    if (v < d[i]) d[i] = v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - w, 1);
      if (x > 0 && y > 0) relax(i, i - w - 1, 1.414);
      if (x < w - 1 && y > 0) relax(i, i - w + 1, 1.414);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x < w - 1) relax(i, i + 1, 1);
      if (y < h - 1) relax(i, i + w, 1);
      if (x < w - 1 && y < h - 1) relax(i, i + w + 1, 1.414);
      if (x > 0 && y < h - 1) relax(i, i + w - 1, 1.414);
    }
  }
  return d;
}

/** What the sprite is, which decides how it should be lit.
 *
 *  'object' — a thing standing in the world. Rounds from its own outline.
 *  'surface' — one cell of a continuous floor. Must NOT round from its
 *  outline: doing that gives every tile its own bevel and the ground turns
 *  into a quilt of embossed squares, which is exactly what it looked like
 *  the first time this shipped. Surfaces take their relief from the colour
 *  changes inside them and nothing else. */
export type Relief = 'object' | 'surface';

export function makeNormalMap(c: PixelCanvas, relief: Relief = 'object'): NormalMap {
  const { w, h } = c;
  const surface = relief === 'surface';
  const dist = distanceField(c, true, surface);
  const reach = surface ? 1.6 : MAX_DIST;
  const height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const t = Math.min(1, dist[i] / reach);
    // Spherical, not linear. Linear leaves a bevel round the rim and a dead
    // flat middle; the square root rounds the whole thing.
    height[i] = Math.sqrt(t);
  }

  const data = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  // Sampling outside the sprite. An object has nothing out there, so zero
  // is right — that is what rounds its rim. A tiling surface has the *next
  // copy of itself* out there, so zero is a lie: it manufactures a cliff at
  // every tile boundary and the ground comes out as a grid of embossed
  // squares even after the outline is excluded from the distance field.
  // This was the second half of that bug, and the one that survived the
  // first fix.
  const at = (x: number, y: number): number => {
    if (surface) {
      const wx = ((x % w) + w) % w;
      const wy = ((y % h) + h) % h;
      return height[wy * w + wx];
    }
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return height[y * w + x];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (c.get(x, y) === TRANSPARENT) {
        // Flat and facing the viewer, so a sprite drawn without a normal
        // lookup is never lit into the negative.
        data[i] = 128; data[i + 1] = 128; data[i + 2] = 255; data[i + 3] = 0;
        continue;
      }
      // Sobel on the height field. Screen y runs downward, so the y
      // gradient is negated to keep "up on screen" pointing up in the map.
      const gx =
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy =
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      let nx = -gx;
      let ny = gy;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;

      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return { w, h, data };
}

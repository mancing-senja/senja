/** An indexed-colour pixel buffer plus the drawing primitives the art
 *  generators need. Working in palette indices (not RGBA) keeps every
 *  generated sprite inside the palette by construction — you cannot
 *  accidentally blend your way into an off-palette colour. */

import { RGB_PALETTE, charToIndex } from './palette';

export const TRANSPARENT = 255;

/** Small deterministic PRNG. Same seed → same tree, forever. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = (seed | 0) || 1;
  }

  next(): number {
    // xorshift32
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x | 0;
    return ((x >>> 0) % 100000) / 100000;
  }

  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.next() * arr.length))];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

export class PixelCanvas {
  readonly px: Uint8Array;

  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint8Array(w * h).fill(TRANSPARENT);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: number): void {
    x |= 0;
    y |= 0;
    if (!this.inside(x, y)) return;
    this.px[y * this.w + x] = c;
  }

  /** Only writes where the target is transparent — for drawing behind. */
  setUnder(x: number, y: number, c: number): void {
    x |= 0;
    y |= 0;
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    if (this.px[i] === TRANSPARENT) this.px[i] = c;
  }

  get(x: number, y: number): number {
    if (!this.inside(x, y)) return TRANSPARENT;
    return this.px[y * this.w + x];
  }

  fill(c: number): void {
    this.px.fill(c);
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  frame(x: number, y: number, w: number, h: number, c: number): void {
    for (let i = 0; i < w; i++) {
      this.set(x + i, y, c);
      this.set(x + i, y + h - 1, c);
    }
    for (let j = 0; j < h; j++) {
      this.set(x, y + j, c);
      this.set(x + w - 1, y + j, c);
    }
  }

  hline(x: number, y: number, w: number, c: number): void {
    for (let i = 0; i < w; i++) this.set(x + i, y, c);
  }

  vline(x: number, y: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) this.set(x, y + j, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Filled ellipse centred on (cx, cy). */
  disc(cx: number, cy: number, rx: number, ry: number, c: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1.0) this.set(x, y, c);
      }
    }
  }

  discUnder(cx: number, cy: number, rx: number, ry: number, c: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1.0) this.setUnder(x, y, c);
      }
    }
  }

  /** Ordered 4x4 Bayer dither between two palette indices.
   *  `t` 0 → all `a`, 1 → all `b`. Used for soft shading that still
   *  reads as pixel art rather than a gradient. */
  ditherDisc(cx: number, cy: number, rx: number, ry: number, a: number, b: number, t: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny > 1.0) continue;
        const th = BAYER4[(y & 3) * 4 + (x & 3)] / 16;
        this.set(x, y, t > th ? b : a);
      }
    }
  }

  /** 1px outline around every opaque pixel, drawn outward. */
  outline(c: number, includeDiagonals = false): void {
    const src = this.px.slice();
    const at = (x: number, y: number) =>
      x < 0 || y < 0 || x >= this.w || y >= this.h ? TRANSPARENT : src[y * this.w + x];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (at(x, y) !== TRANSPARENT) continue;
        let touch =
          at(x - 1, y) !== TRANSPARENT || at(x + 1, y) !== TRANSPARENT ||
          at(x, y - 1) !== TRANSPARENT || at(x, y + 1) !== TRANSPARENT;
        if (!touch && includeDiagonals) {
          touch =
            at(x - 1, y - 1) !== TRANSPARENT || at(x + 1, y - 1) !== TRANSPARENT ||
            at(x - 1, y + 1) !== TRANSPARENT || at(x + 1, y + 1) !== TRANSPARENT;
        }
        if (touch) this.set(x, y, c);
      }
    }
  }

  /** Replaces the topmost opaque pixel of each column with `c` — a cheap
   *  and very effective way to catch light on foliage and rooftops. */
  topLight(c: number, from = 0, to = this.w): void {
    for (let x = from; x < to; x++) {
      for (let y = 0; y < this.h; y++) {
        if (this.get(x, y) !== TRANSPARENT) {
          this.set(x, y, c);
          break;
        }
      }
    }
  }

  replace(from: number, to: number): void {
    for (let i = 0; i < this.px.length; i++) if (this.px[i] === from) this.px[i] = to;
  }

  /** Draws string art. Rows are palette chars, '.' is transparent. */
  stamp(x: number, y: number, rows: readonly string[]): void {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const c = charToIndex(row[i]);
        if (c >= 0) this.set(x + i, y + j, c);
      }
    }
  }

  /** Copies a region of another canvas, skipping transparent pixels. */
  blit(src: PixelCanvas, dx: number, dy: number, sx = 0, sy = 0, sw = src.w, sh = src.h): void {
    for (let j = 0; j < sh; j++) {
      for (let i = 0; i < sw; i++) {
        const c = src.get(sx + i, sy + j);
        if (c !== TRANSPARENT) this.set(dx + i, dy + j, c);
      }
    }
  }

  flipX(): PixelCanvas {
    const out = new PixelCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) out.set(this.w - 1 - x, y, this.get(x, y));
    }
    return out;
  }

  sub(x: number, y: number, w: number, h: number): PixelCanvas {
    const out = new PixelCanvas(w, h);
    out.blit(this, 0, 0, x, y, w, h);
    return out;
  }

  toImageData(): ImageData {
    const img = new ImageData(this.w, this.h);
    const d = img.data;
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i];
      const o = i * 4;
      if (c === TRANSPARENT) {
        d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;
      } else {
        const rgb = RGB_PALETTE[c];
        d[o] = rgb.r;
        d[o + 1] = rgb.g;
        d[o + 2] = rgb.b;
        d[o + 3] = 255;
      }
    }
    return img;
  }
}

export const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/** Value noise on a lattice — used for foliage clumping and grass variation. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (a: number, b: number) => {
    let n = a * 374761393 + b * 668265263 + seed * 1442695040888963407;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  };
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const n00 = h(xi, yi);
  const n10 = h(xi + 1, yi);
  const n01 = h(xi, yi + 1);
  const n11 = h(xi + 1, yi + 1);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

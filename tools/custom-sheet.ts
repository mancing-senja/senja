/** Renders a grid of custom characters, to look at rather than reason about.
 *
 *  Run: npx tsx tools/custom-sheet.ts [count] [scale] */

import { writeFileSync } from 'node:fs';
import { png } from './png';
import { framesForLooks } from '../src/client/art/character';
import { lookFromCode, randomCode } from '../src/client/art/custom';
import { RGB_PALETTE } from '../src/client/art/palette';

const COUNT = Number(process.argv[2] ?? 24);
const SCALE = Number(process.argv[3] ?? 6);

// Deterministic, so the sheet is comparable between runs.
let seed = 12345;
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const codes = Array.from({ length: COUNT }, () => randomCode(rand));
const looks = codes.map((c, i) => lookFromCode(c, `c${i}`));
// One idle front frame each.
const frames = framesForLooks(looks).filter((f) => f.dir === 'front' && f.pose === 'idle');

const cw = frames[0].canvas.w;
const ch = frames[0].canvas.h;
const cols = 8;
const rows = Math.ceil(frames.length / cols);
const W = cols * (cw + 2) * SCALE;
const H = rows * (ch + 2) * SCALE;
const out = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) {
  out[i * 4] = 58; out[i * 4 + 1] = 56; out[i * 4 + 2] = 68; out[i * 4 + 3] = 255;
}

frames.forEach((f, i) => {
  const ox = (i % cols) * (cw + 2) * SCALE;
  const oy = Math.floor(i / cols) * (ch + 2) * SCALE;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const v = f.canvas.get(x, y);
      if (v === 255) continue;
      const { r, g, b } = RGB_PALETTE[v];
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const p = ((oy + y * SCALE + sy) * W + ox + x * SCALE + sx) * 4;
          out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = 255;
        }
      }
    }
  }
});

writeFileSync('.shots/custom.png', png(W, H, out));
console.log(`${frames.length} custom characters -> .shots/custom.png (${W}x${H})`);
console.log('codes:', codes.slice(0, 8).join(', '), '...');

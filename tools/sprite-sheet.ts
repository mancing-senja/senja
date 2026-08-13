/** Dumps every world sprite to a PNG contact sheet.
 *
 *  Same reason as the portrait sheet: the walking figure is the thing on
 *  screen ninety per cent of the time, and no amount of reading the authored
 *  grid tells you whether it reads as a person.
 *
 *  Run: npx tsx tools/sprite-sheet.ts [scale] */

import { writeFileSync } from 'node:fs';
import { png } from './png';
import { buildCharacterFrames } from '../src/client/art/character';
import { RGB_PALETTE } from '../src/client/art/palette';

const SCALE = Number(process.argv[2] ?? 6);

const only = process.env.SPRITE_ONLY;
const frames = buildCharacterFrames()
  .filter((f) => !only || `${f.dir}:${f.pose}` === only);
const cw = Math.max(...frames.map((f) => f.canvas.w));
const ch = Math.max(...frames.map((f) => f.canvas.h));

// One row per look, so a character's whole set reads across.
const byLook = new Map<number, typeof frames>();
for (const f of frames) {
  const list = byLook.get(f.look) ?? [];
  list.push(f);
  byLook.set(f.look, list);
}
const looks = [...byLook.keys()].sort((a, b) => a - b);
const cols = Math.max(...[...byLook.values()].map((v) => v.length));

const W = cols * (cw + 1) * SCALE;
const H = looks.length * (ch + 1) * SCALE;
const out = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) {
  out[i * 4] = 58; out[i * 4 + 1] = 56; out[i * 4 + 2] = 68; out[i * 4 + 3] = 255;
}

looks.forEach((look, row) => {
  byLook.get(look)!.forEach((f, col) => {
    const ox = col * (cw + 1) * SCALE;
    const oy = row * (ch + 1) * SCALE;
    for (let y = 0; y < f.canvas.h; y++) {
      for (let x = 0; x < f.canvas.w; x++) {
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
});

const name = process.env.SPRITE_SHEET ?? '.shots/sprites.png';
writeFileSync(name, png(W, H, out));
console.log(`${frames.length} frames, ${cw}x${ch} each -> ${name} (${W}x${H})`);

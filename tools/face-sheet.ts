/** Dumps every portrait to a PNG contact sheet.
 *
 *  Portraits are pure code with no DOM behind them, so they can be built and
 *  looked at without the game running. Judging a face is the one thing that
 *  cannot be done by reading the source: you have to see it.
 *
 *  Run: npx tsx tools/face-sheet.ts [scale] */

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildPortraits, PORTRAIT_H, PORTRAIT_W } from '../src/client/art/portrait';
import { RGB_PALETTE } from '../src/client/art/palette';

const SCALE = Number(process.argv[2] ?? 5);
const COLS = Number(process.env.FACE_COLS ?? 9);

/** A minimal PNG writer. One dependency less than reaching for a library, and
 *  the format is four chunks. */
function png(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                         // filter: none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc = (b: Buffer): number => {
    let c = -1;
    for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const only = process.env.FACE_ONLY;
const frames = buildPortraits()
  .filter((f) => !only || only.split(',').includes(String(f.look)))
  .filter((f) => f.mood === (process.env.FACE_MOOD ?? 'neutral'));
const rows = Math.ceil(frames.length / COLS);
const W = COLS * PORTRAIT_W * SCALE;
const H = rows * PORTRAIT_H * SCALE;
const out = new Uint8Array(W * H * 4);
// A mid grey behind them, so both the light and the dark edges of a face can
// be judged. On black every dark outline vanishes and every portrait looks
// cleaner than it is.
for (let i = 0; i < W * H; i++) {
  out[i * 4] = 58; out[i * 4 + 1] = 56; out[i * 4 + 2] = 68; out[i * 4 + 3] = 255;
}

frames.forEach((f, i) => {
  const ox = (i % COLS) * PORTRAIT_W * SCALE;
  const oy = Math.floor(i / COLS) * PORTRAIT_H * SCALE;
  for (let y = 0; y < PORTRAIT_H; y++) {
    for (let x = 0; x < PORTRAIT_W; x++) {
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

const name = process.env.FACE_SHEET ?? '.shots/faces.png';
writeFileSync(name, png(W, H, out));
console.log(`${frames.length} portraits -> ${name} (${W}x${H})`);

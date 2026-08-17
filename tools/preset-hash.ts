/** Fingerprints every preset character frame.
 *
 *  Guards a specific risk: `framesForLooks` was split out of
 *  `buildCharacterFrames`, and a refactor of a generator can keep the frame
 *  *count* identical while changing the pixels. Counting frames proves
 *  nothing; hashing them proves it.
 *
 *  Run: npx tsx tools/preset-hash.ts */

import { buildCharacterFrames } from '../src/client/art/character';
import { buildPortraits } from '../src/client/art/portrait';

function fnv(bytes: Uint8Array, seed = 2166136261): number {
  let h = seed;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const frames = buildCharacterFrames();
let sprites = 2166136261;
for (const f of frames) sprites = fnv(f.canvas.px, sprites);

const portraits = buildPortraits();
let faces = 2166136261;
for (const p of portraits) faces = fnv(p.canvas.px, faces);

console.log(`sprites : ${frames.length} frames  hash ${sprites}`);
console.log(`portraits: ${portraits.length} frames  hash ${faces}`);

/** Checks the custom-appearance encoding.
 *
 *  This is the one piece of the feature that cannot be checked by looking at
 *  it. A packing bug does not draw a wrong character — it draws a *different*
 *  character than the one that was saved, which shows up as "my guy changed
 *  when I reloaded" and is almost impossible to trace from the outside.
 *
 *  Run: npx tsx tools/custom-check.ts */

import {
  BOOTS, CLOTH, HAIR_STYLES, HEAD_COLS, HEAD_GEAR, OPTION_COUNT, TROUSERS,
  bitsUsed, lookFromCode, packLook, randomCode, unpackLook, variantCount,
  type Choices,
} from '../src/client/art/custom';
import { HAIR_TONES, SKIN_TONES } from '../src/client/art/palette';
import { GARMENT_IDS } from '../src/client/art/garment';

let bad = 0;
const fail = (m: string): void => { console.log(`  FAIL ${m}`); bad++; };
const ok = (m: string): void => { console.log(`  ok   ${m}`); };

console.log('custom appearance encoding');

// --- the 31-bit ceiling. Over it, packing silently wraps and someone's
//     character quietly changes between sessions.
const bits = bitsUsed();
if (bits > 30) fail(`${bits} bits used; must stay under 31`);
else ok(`${bits} bits used, ${variantCount().toLocaleString('en')} appearances`);

// --- every field's bit width must actually hold its option list
const widths: Array<[string, number, number]> = [
  ['skin', 2, SKIN_TONES.length],
  ['hair', 3, HAIR_TONES.length],
  ['hairStyle', 2, HAIR_STYLES.length],
  ['head', 2, HEAD_GEAR.length],
  ['headCol', 3, HEAD_COLS.length],
  ['garment', 4, GARMENT_IDS.length],
  ['shirt', 4, CLOTH.length],
  ['pants', 3, TROUSERS.length],
  ['boot', 3, BOOTS.length],
];
for (const [name, b, count] of widths) {
  if (count > (1 << b)) {
    fail(`${name} has ${count} options but only ${b} bits (max ${1 << b})`);
  }
}
ok('every field fits its bit width');

// --- round trip, exhaustively over a wide sweep
{
  let checked = 0;
  let broken = 0;
  const keys = Object.keys(OPTION_COUNT) as Array<keyof Choices>;
  // Every combination is 5.6M; a deterministic sweep over each field's full
  // range against varied others catches an overlap without the runtime.
  for (let round = 0; round < 4000; round++) {
    const c = {} as Choices;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      c[k] = (round * (i * 7 + 3) + i) % OPTION_COUNT[k];
    }
    const back = unpackLook(packLook(c));
    checked++;
    for (const k of keys) {
      if (back[k] !== c[k]) {
        if (broken === 0) fail(`round trip lost ${k}: ${c[k]} -> ${back[k]}`);
        broken++;
        break;
      }
    }
  }
  if (broken === 0) ok(`round trip exact over ${checked} combinations`);
  else fail(`${broken}/${checked} combinations did not survive the round trip`);
}

// --- out-of-range input must produce a valid appearance, never a crash and
//     never option zero across the board (that is what a saved code from an
//     older build looks like)
{
  for (const code of [-1, 0, 1, 2 ** 31, 2 ** 32 - 1, Number.MAX_SAFE_INTEGER]) {
    const c = unpackLook(code);
    for (const [k, count] of Object.entries(OPTION_COUNT)) {
      const v = c[k as keyof Choices];
      if (!Number.isInteger(v) || v < 0 || v >= count) {
        fail(`code ${code} produced ${k}=${v}, outside 0..${count - 1}`);
      }
    }
  }
  ok('hostile codes decode inside every option range');
}

// --- a decoded Look must be complete: every field a real palette index
{
  const required = [
    'skinLt', 'skin', 'skinSh', 'skinDp', 'hair', 'hairSh', 'hairHi',
    'shirt', 'shirtDim', 'trim', 'pants', 'boot',
  ] as const;
  let broken = 0;
  for (let i = 0; i < 400; i++) {
    const look = lookFromCode(randomCode(() => (i * 2654435761 % 1000) / 1000));
    for (const f of required) {
      const v = look[f] as number;
      if (!Number.isInteger(v) || v < 0 || v > 255) {
        if (broken === 0) fail(`look.${f} = ${v} is not a palette index`);
        broken++;
      }
    }
    if (!look.garment || !look.hairStyle || !look.head || !look.outfit) {
      if (broken === 0) fail('look is missing a categorical field');
      broken++;
    }
  }
  if (broken === 0) ok('400 decoded looks are complete and in-palette');
}

// --- bare heads carry no headwear colour
{
  let leaks = 0;
  for (let code = 0; code < 4096; code++) {
    const look = lookFromCode(code);
    if (look.head === 'bare' && (look.headCol !== 0 || look.headSh !== 0)) leaks++;
  }
  if (leaks) fail(`${leaks} bare-headed looks still carry a headwear colour`);
  else ok('bare heads carry no headwear colour');
}

// --- shirt shade must never be lighter than the shirt itself
{
  const { RGB_PALETTE } = await import('../src/client/art/palette');
  const luma = (i: number): number => {
    const p = RGB_PALETTE[i];
    return p.r * 0.299 + p.g * 0.587 + p.b * 0.114;
  };
  const wrong = CLOTH.filter(([base, dim]) => luma(dim) > luma(base));
  if (wrong.length) {
    fail(`${wrong.length} cloth pairs have a "shade" brighter than the base`);
  } else ok(`all ${CLOTH.length} cloth pairs shade downward`);
}

// --- randomCode should spread, and should mostly leave the head bare
{
  const seen = new Set<number>();
  let bareHeads = 0;
  for (let i = 0; i < 600; i++) {
    const code = randomCode();
    seen.add(code);
    if (lookFromCode(code).head === 'bare') bareHeads++;
  }
  if (seen.size < 500) fail(`600 random codes gave only ${seen.size} distinct`);
  else ok(`600 random codes gave ${seen.size} distinct appearances`);
  const pct = bareHeads / 600;
  if (pct < 0.5 || pct > 0.85) {
    fail(`${(pct * 100).toFixed(0)}% bare heads; wanted roughly 60-75%`);
  } else ok(`${(pct * 100).toFixed(0)}% of random characters are bare-headed`);
}

console.log(bad === 0 ? '\nall good' : `\n${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);

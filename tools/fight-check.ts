/** Checks the fight styles behave differently from one another.
 *
 *  fishing.ts drags in the renderer, so the species table is read out of its
 *  source rather than imported. That is deliberate: the numbers being checked
 *  are the ones actually shipped, not a copy that can drift.
 *
 *  Run: npx tsx tools/fight-check.ts */

import { readFileSync } from 'node:fs';
import { STYLES, applyGrade, newFight, styleFor, type StyleId } from '../src/client/game/fight';
import type { Species } from '../src/client/game/fishing';

const src = readFileSync(new URL('../src/client/game/fishing.ts', import.meta.url), 'utf8');
const species: Species[] = [];
const re = /id: '([a-z0-9_]+)', label: '([^']+)', value: (\d+), minCm: (\d+), maxCm: (\d+),\s*weight: \[[^\]]+\], fight: ([\d.]+),/g;
for (let m = re.exec(src); m; m = re.exec(src)) {
  species.push({
    id: m[1], label: m[2], value: +m[3], minCm: +m[4], maxCm: +m[5],
    weight: [1, 1, 1, 1], fight: +m[6], blurb: '',
  });
}

let bad = 0;
const fail = (msg: string): void => { console.log(`  FAIL ${msg}`); bad++; };

console.log(`species read: ${species.length}`);
if (species.length < 80) fail(`expected the full table, got ${species.length}`);

// --- every species gets a style, and every style gets used
const count: Record<string, number> = {};
for (const sp of species) {
  const st = styleFor(sp);
  if (!st) fail(`${sp.id} has no style`);
  count[st.id] = (count[st.id] ?? 0) + 1;
  if (styleFor(sp).id !== st.id) fail(`${sp.id} is not stable`);
}
console.log('spread:', count);
for (const id of Object.keys(STYLES) as StyleId[]) {
  if (!count[id]) fail(`nothing fights '${id}' — the style is dead weight`);
}

// --- named fish keep their names
const named: Array<[string, StyleId]> = [
  ['lele', 'mengendap'], ['belut', 'mengendap'],
  ['seluang', 'lincah'], ['wader', 'lincah'],
  ['betok', 'menggetar'], ['gabus', 'menggetar'],
  ['tawes', 'menyelam'], ['nila', 'menyelam'],
];
for (const [id, want] of named) {
  const sp = species.find((s) => s.id === id);
  if (!sp) { console.log(`  (no '${id}' in the table, skipped)`); continue; }
  const got = styleFor(sp).id;
  if (got !== want) fail(`${id} should fight '${want}', fights '${got}'`);
}

/** Runs a style for a while and reports what the target actually did. */
function trace(id: StyleId, fight: number, tier: number): {
  range: number; speed: number; still: number; veiled: number; zone: number;
} {
  const st = STYLES[id];
  const s = newFight();
  const dt = 1 / 60;
  let lo = 1, hi = 0, moved = 0, still = 0, veiled = 0, zone = 0;
  let prev = s.target;
  const n = 60 * 30;
  for (let i = 0; i < n; i++) {
    s.t += dt;
    s.gainMul = 1;
    st.step(s, dt, fight);
    const tune = applyGrade(st, s, dt, tier);
    zone += tune.zone;
    if (s.veil > 0) veiled++;
    if (s.target < lo) lo = s.target;
    if (s.target > hi) hi = s.target;
    const d = Math.abs(s.target - prev);
    moved += d;
    if (d < 0.0008) still++;
    prev = s.target;
    if (!Number.isFinite(s.target) || s.target < 0 || s.target > 1) {
      fail(`${id} left the bar: ${s.target}`);
      break;
    }
  }
  return { range: hi - lo, speed: moved / (n / 60), still: still / n, veiled: veiled / n, zone: zone / n };
}

console.log('\n30s of each, fight 1.2, common:');
const t: Record<string, ReturnType<typeof trace>> = {};
for (const id of Object.keys(STYLES) as StyleId[]) {
  t[id] = trace(id, 1.2, 0);
  const x = t[id];
  console.log(
    `  ${id.padEnd(10)} range ${x.range.toFixed(2)}  travel/s ${x.speed.toFixed(2)}`
    + `  still ${(x.still * 100).toFixed(0)}%  zone ${x.zone.toFixed(3)}`,
  );
}

// --- the claims each style makes about itself
if (t.lari.range < 0.8) fail(`lari should sweep the bar, got ${t.lari.range.toFixed(2)}`);
if (t.menyelam.range < 0.7) fail(`menyelam should reach the ends, got ${t.menyelam.range.toFixed(2)}`);
if (t.mengendap.still < 0.25) fail(`mengendap should go dead still, only ${(t.mengendap.still * 100).toFixed(0)}%`);
// tenang is the slow one, but slow is not parked: it has to tour the bar.
if (t.tenang.range < 0.6) fail(`tenang should still visit the bar, got ${t.tenang.range.toFixed(2)}`);
if (t.tenang.still > 0.5) fail('tenang should keep moving');
// lincah rests between jumps. Total travel counts the jumps themselves, so
// stillness is the honest measure of it — the first version of this check
// compared travel against lari and read a snap as constant motion.
if (t.lincah.still < 0.5) fail('lincah should be still between jumps');
if (t.lincah.range < 0.7) fail('lincah should jump right across');

// --- gainMul: the stall has to actually stall
{
  const s = newFight();
  let low = 0;
  for (let i = 0; i < 60 * 20; i++) {
    s.t += 1 / 60; s.gainMul = 1;
    STYLES.mengendap.step(s, 1 / 60, 1.2);
    if (s.gainMul < 0.5) low++;
  }
  const pct = low / (60 * 20);
  console.log(`\nmengendap stalls the bar ${(pct * 100).toFixed(0)}% of the time`);
  if (pct < 0.2 || pct > 0.75) fail(`stall share ${(pct * 100).toFixed(0)}% is out of range`);
}

// --- grade escalation
console.log('\nzone by grade (tenang):');
let prevZone = Infinity;
for (let tier = 0; tier <= 5; tier++) {
  const x = trace('tenang', 1.2, tier);
  console.log(`  tier ${tier}: zone ${x.zone.toFixed(3)}  veiled ${(x.veiled * 100).toFixed(0)}%`);
  if (x.zone > prevZone) fail(`tier ${tier} is not tighter than the one below`);
  if (x.zone < 0.12) fail(`tier ${tier} zone ${x.zone.toFixed(3)} is too tight to hold`);
  prevZone = x.zone;
  if (tier >= 4 && x.veiled < 0.05) fail(`tier ${tier} should sometimes hide the zone`);
  if (tier < 4 && x.veiled > 0) fail(`tier ${tier} should never hide the zone`);
}

// --- a competent player still wins, and an idle one still loses.
//     This is the one that matters: six patterns are worthless if any of them
//     is unwinnable, and worse than worthless if all of them win themselves.
console.log('\nsimulated fights (chases the zone with a 180ms reaction lag):');
interface Play { won: boolean; secs: number; inZone: number }

/** Who is holding the rod.
 *
 *  'idle' is the real thing: nobody touches the key, so tension falls to zero
 *  and stays there. The first version of this check modelled idleness as
 *  holding the bar at 0.5, which is not idleness at all — keeping tension at
 *  0.5 means tapping the key continuously, and half the tuning went into
 *  punishing a player who was in fact playing. 'parker' is that player, kept
 *  as its own case: a lazy strategy that should still lose, just not fast. */
type Hands = 'chaser' | 'parker' | 'idle';

function play(id: StyleId, tier: number, who: Hands): Play {
  const st = STYLES[id];
  const s = newFight();
  const dt = 1 / 60;
  let tension = 0.5, progress = 0.28, slack = 0, held = 0;
  const lag: number[] = [];
  const cap = 60 * 120;
  for (let i = 0; i < cap; i++) {
    s.t += dt; s.gainMul = 1;
    st.step(s, dt, 1.2);
    const tune = applyGrade(st, s, dt, tier);
    lag.push(s.target);
    const seen = lag.length > 11 ? lag[lag.length - 11] : 0.5;
    // Holding space raises tension, letting go lowers it — the real control.
    const hold = who === 'idle'
      ? false
      : tension < (who === 'chaser' ? seen : 0.5);
    tension = Math.max(0, Math.min(1, tension + (hold ? 1 : -1) * dt * 0.7));
    // Mirrors fishing.ts: a line at either stop holds nothing.
    const pinned = tension <= 0.03 || tension >= 0.97;
    const inZone = Math.abs(tension - s.target) < tune.zone && !pinned;
    if (inZone) held++;
    progress += (inZone ? tune.gain : -tune.drain) * dt;
    slack = inZone ? Math.max(0, slack - dt * 0.6) : slack + dt * 0.5;
    if (progress >= 1) return { won: true, secs: i / 60, inZone: held / (i + 1) };
    if (progress <= -0.15 || slack > 4.0) {
      return { won: false, secs: i / 60, inZone: held / (i + 1) };
    }
  }
  return { won: false, secs: cap / 60, inZone: held / cap };
}
/** Twenty-five fights, because one is noise.
 *
 *  Every style is driven by random numbers, so a single simulated fight says
 *  almost nothing — an early run of bad luck reads as "unwinnable" and a lucky
 *  one hides a style that usually drags. Win *rate* and median duration are
 *  the claims worth making. */
const N = 40;
function sample(id: StyleId, tier: number, who: Hands): { rate: number; med: number } {
  const secs: number[] = [];
  let won = 0;
  for (let i = 0; i < N; i++) {
    const r = play(id, tier, who);
    if (r.won) won++;
    secs.push(r.secs);
  }
  secs.sort((a, b) => a - b);
  return { rate: won / N, med: secs[Math.floor(N / 2)] };
}

// A fight lasts long enough to be a fight and short enough that a common fish
// is not a chore. Rare ones are allowed to drag, and to be lost.
const WANT: Record<number, { lo: number; hi: number; rate: number }> = {
  0: { lo: 3.5, hi: 11, rate: 0.88 },
  3: { lo: 4.5, hi: 22, rate: 0.80 },
  5: { lo: 5.5, hi: 40, rate: 0.60 },
};
for (const id of Object.keys(STYLES) as StyleId[]) {
  const parts: string[] = [];
  for (const tier of [0, 3, 5]) {
    const r = sample(id, tier, 'chaser');
    const w = WANT[tier];
    parts.push(`t${tier} ${(r.rate * 100).toFixed(0)}% ${r.med.toFixed(1)}s`);
    if (r.rate < w.rate) {
      fail(`'${id}' tier ${tier} is won only ${(r.rate * 100).toFixed(0)}% of the time`);
    }
    if (r.med < w.lo) fail(`'${id}' tier ${tier} is over in ${r.med.toFixed(1)}s — too quick to be a fight`);
    if (r.med > w.hi) fail(`'${id}' tier ${tier} drags for ${r.med.toFixed(1)}s`);
  }
  const idle = sample(id, 0, 'idle');
  const park = sample(id, 0, 'parker');
  console.log(
    `  ${id.padEnd(10)} ${parts.join('  ')}`
    + `   idle ${(idle.rate * 100).toFixed(0)}% (${idle.med.toFixed(0)}s)`
    + `  parked ${(park.rate * 100).toFixed(0)}%`,
  );
  if (idle.rate > 0) fail(`'${id}' wins itself with no input ${(idle.rate * 100).toFixed(0)}% of the time`);
  if (idle.med > 20) fail(`'${id}' takes ${idle.med.toFixed(0)}s to punish an idle player`);
  // Holding dead centre is work, so it is allowed to take a while to fail —
  // but it must fail, or one thumb position beats eighty-six fish.
  if (park.rate > 0.06) fail(`'${id}' can be won by parking on the middle`);
}

console.log(bad === 0 ? '\nall good' : `\n${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);

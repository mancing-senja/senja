/** How a fish fights.
 *
 *  Every species used to fight the same way: the target drifted smoothly,
 *  you followed it, and the only difference between a Wader and a Marlin was
 *  how fast the drift was. Eighty-six species and one verb. Nothing you
 *  learned about one fish told you anything about the next.
 *
 *  So the pattern is the fish's, and the ferocity is the grade's. A Belut
 *  sulks and then explodes whether it is grey or gold; a gold one explodes
 *  harder, holds a narrower zone, and at the top disappears from the bar
 *  entirely for a second at a time. Those two axes stay separate on purpose
 *  — a player can learn "eels go still before they run" once and have it
 *  hold for every eel they ever hook. */

import type { Species } from './fishing';

export type StyleId =
  | 'tenang' | 'lincah' | 'menyelam' | 'menggetar' | 'mengendap' | 'lari';

export interface FightStyle {
  id: StyleId;
  label: string;
  /** One line, shown under the bar. Tells the player what to *do*, not what
   *  the fish is doing — they can see what it is doing. */
  hint: string;
  /** Half-width of the forgiving zone, before the grade narrows it. */
  zone: number;
  /** Progress per second while inside the zone. */
  gain: number;
  /** Progress lost per second while outside it. */
  drain: number;
  /** Moves the fish. Reads and writes `s`. */
  step(s: FightState, dt: number, fight: number): void;
}

export interface FightState {
  t: number;
  /** Where the fish is, 0..1 across the bar. */
  target: number;
  vel: number;
  /** Per-style scratch. Meaning differs by style; nothing else reads them. */
  phase: number;
  beat: number;
  /** Where the fish would rather be. Tours the bar on its own, slowly.
   *
   *  Without this every style resolved back toward the middle between beats,
   *  and a zone half a bar wide sitting over the middle means a player who
   *  never touches the key wins. The fish has to want to be somewhere. */
  home: number;
  homeVel: number;
  /** Set each frame by the style. Scales the gain — a fish that has gone
   *  dead still is not being reeled in, however well you are holding it. */
  gainMul: number;
  /** >0 hides the zone this frame. Only the top grades ever set it. */
  veil: number;
}

export function newFight(): FightState {
  return {
    t: 0, target: 0.5, vel: 0, phase: 0, beat: 0,
    home: 0.5, homeVel: 0, gainMul: 1, veil: 0,
  };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Keeps a wandering fish on the bar. Bouncing off the ends rather than
 *  sticking to them — a fish pinned at 0.0 is a fish you can park on and
 *  forget about. */
function drift(s: FightState, dt: number, damp: number): void {
  s.vel *= damp;
  s.target += s.vel * dt;
  if (s.target <= 0) { s.target = 0; s.vel = Math.abs(s.vel) * 0.6; }
  if (s.target >= 1) { s.target = 1; s.vel = -Math.abs(s.vel) * 0.6; }
}

/** Walks `home` up and down the bar and never lets it settle.
 *
 *  The speed floor is the point of it. A plain random walk spends most of its
 *  time somewhere near where it started, and where it started is the middle,
 *  which is exactly the spot an idle player is already holding. */
function tour(s: FightState, dt: number, speed: number): void {
  s.homeVel += (Math.random() - 0.5) * dt * speed * 4;
  const min = speed * 0.35;
  if (Math.abs(s.homeVel) < min) s.homeVel = s.homeVel >= 0 ? min : -min;
  s.homeVel = Math.max(-speed * 2, Math.min(speed * 2, s.homeVel));
  s.home += s.homeVel * dt;
  // Turn around before the wall, so the fish never parks against an end.
  if (s.home < 0.1) { s.home = 0.1; s.homeVel = Math.abs(s.homeVel); }
  if (s.home > 0.9) { s.home = 0.9; s.homeVel = -Math.abs(s.homeVel); }
}

export const STYLES: Record<StyleId, FightStyle> = {
  /** The original behaviour, kept for the fish it actually suits. Small,
   *  calm, close in. This is the one you fish while looking at the sunset. */
  tenang: {
    id: 'tenang', label: 'tenang',
    hint: 'santai aja, ikutin pelan',
    zone: 0.17, gain: 0.135, drain: 0.28,
    step(s, dt, fight) {
      tour(s, dt, 0.22 + 0.08 * fight);
      // Follows its own wandering without ever quite catching up, which is
      // what makes it read as swimming rather than as a slider being moved.
      s.target += (s.home - s.target) * Math.min(1, dt * 1.6);
      s.vel += (Math.random() - 0.5) * dt * 5 * fight;
      drift(s, dt, 0.9);
    },
  },

  /** Sits, then snaps somewhere else and sits again. The distance is the
   *  danger, not the speed — you have plenty of time to catch up, provided
   *  you notice it went. */
  lincah: {
    id: 'lincah', label: 'lincah',
    hint: 'nyentak, kejar begitu pindah',
    // The widest zone of the six, because being punished for a jump you could
    // not predict is a dice roll wearing a skill costume. What it asks is that
    // you notice and move, not that you move fast.
    zone: 0.22, gain: 0.170, drain: 0.20,
    step(s, dt, fight) {
      s.phase -= dt;
      if (s.phase <= 0) {
        // Two sizes of jump, and both are needed.
        //
        // It always lands out at one end, never near the middle, or a player
        // who parks on centre is right by accident every other jump. But if
        // every jump crossed the whole bar the chase would eat most of the
        // rest — tension crosses at 0.7 a second — and the fish would be
        // unanswerable rather than quick. So it mostly shuffles about within
        // the end it is already at, and now and then bolts for the other one.
        const near = s.home >= 0.5;
        const cross = Math.random() < 0.3;
        const high = cross ? !near : near;
        s.home = high ? 0.72 + Math.random() * 0.23 : 0.05 + Math.random() * 0.23;
        s.phase = (cross ? 1.5 : 0.85) + Math.random() * 1.1 / Math.max(0.4, fight);
        s.vel = 0;
      }
      // A fast slide, not a teleport — about a sixth of a second. Long enough
      // for the eye to follow it across, short enough to feel like a snap.
      s.target += (s.home - s.target) * Math.min(1, dt * 11);
      // Barely breathes between jumps, so the jump is the whole event.
      s.vel += (Math.random() - 0.5) * dt * 1.4;
      drift(s, dt, 0.86);
    },
  },

  /** Runs for the bottom, holds there against you, then gives up and comes
   *  back to the middle. The hold is the hard part: sitting at an extreme
   *  means sitting on a stick that wants to spring back. */
  menyelam: {
    id: 'menyelam', label: 'menyelam',
    hint: 'tahan di ujung sampai dia naik',
    zone: 0.21, gain: 0.145, drain: 0.22,
    step(s, dt, fight) {
      s.phase -= dt;
      if (s.phase <= 0) {
        s.beat = s.beat === 0 ? 1 : 0;
        s.phase = s.beat === 1
          ? 1.4 + Math.random() * 1.0        // down there
          : 1.8 + Math.random() * 1.2;       // back up
        if (s.beat === 1) s.vel = (Math.random() < 0.5 ? -1 : 1) * 0.9 * fight;
      }
      if (s.beat === 1) {
        // Driving for whichever end it set off toward, then pinning.
        const end = s.vel < 0 ? 0.06 : 0.94;
        s.target += (end - s.target) * Math.min(1, dt * 2.6);
        s.target += (Math.random() - 0.5) * dt * 0.3;
      } else {
        // Between dives it recovers toward a resting spot that is itself
        // moving. It used to recover to dead centre, and a fish that always
        // comes back to the middle can be waited out from the middle.
        tour(s, dt, 0.2);
        s.target += (s.home - s.target) * Math.min(1, dt * 1.3);
        s.target += (Math.random() - 0.5) * dt * 0.5;
      }
      s.target = clamp01(s.target);
    },
  },

  /** Never far, never still. A fast small shake on top of a slow wander:
   *  you can always reach it, but you can never quite settle on it. Spiny
   *  fish, catfish, anything that fights with its whole body. */
  menggetar: {
    id: 'menggetar', label: 'menggetar',
    hint: 'getarannya rapat, jangan kaku',
    // Narrow, but it never gets far from you, so the narrowness costs
    // attention rather than reach.
    zone: 0.23, gain: 0.145, drain: 0.21,
    step(s, dt, fight) {
      s.phase += dt * (9 + 5 * fight);
      // Two frequencies, so the shake never settles into a rhythm you can
      // sit on the average of.
      tour(s, dt, 0.13 + 0.05 * fight);
      const shake = Math.sin(s.phase) * 0.06 + Math.sin(s.phase * 2.3) * 0.025;
      s.target = clamp01(s.home + shake);
    },
  },

  /** Goes dead. Sits without moving and without giving you a centimetre —
   *  the bar stalls — and then leaves at speed. Sitting through the stall is
   *  the whole test: the temptation is to let go of a fish that has stopped
   *  fighting, which is exactly when it goes. */
  mengendap: {
    id: 'mengendap', label: 'mengendap',
    hint: 'diam dulu, abis ini lari',
    zone: 0.22, gain: 0.190, drain: 0.22,
    step(s, dt, fight) {
      s.phase -= dt;
      if (s.phase <= 0) {
        s.beat = s.beat === 0 ? 1 : 0;
        if (s.beat === 1) {
          s.phase = 1.2 + Math.random() * 0.9;        // the burst
          // Away from wherever it had settled, and hard. The burst is the
          // fish's one move; it does not spend it going nowhere.
          s.vel = (s.target < 0.5 ? 1 : -1) * (0.7 + 0.5 * fight);
        } else {
          s.phase = 1.6 + Math.random() * 1.4;        // playing dead
          s.vel = 0;
        }
      }
      if (s.beat === 0) {
        // Barely moving, and barely coming in. The gain is not zero, or a
        // slow fish would become an unwinnable one.
        s.gainMul = 0.35;
        s.target += (Math.random() - 0.5) * dt * 0.12;
        s.target = clamp01(s.target);
      } else {
        s.vel += (Math.random() - 0.5) * dt * 6 * fight;
        drift(s, dt, 0.95);
      }
    },
  },

  /** Long sweeps, end to end, at speed. It is not trying to trick you, it is
   *  simply stronger than you and going somewhere. Big open-water fish. */
  lari: {
    id: 'lari', label: 'lari',
    hint: 'ikut terus, jangan berhenti',
    zone: 0.22, gain: 0.125, drain: 0.26,
    step(s, dt, fight) {
      s.phase -= dt;
      if (s.phase <= 0) {
        s.beat = Math.random() < 0.5 ? 0 : 1;
        s.phase = 1.6 + Math.random() * 1.4;
      }
      const goal = s.beat === 0 ? 0.04 : 0.96;
      s.target += (goal - s.target) * Math.min(1, dt * (0.7 + 0.5 * fight));
      s.target += (Math.random() - 0.5) * dt * 0.6;
      s.target = clamp01(s.target);
    },
  },
};

/** Species that fight in a way worth knowing by name.
 *
 *  Named rather than derived, because the point of a pattern is that a
 *  player can learn it, and "the eel goes still" has to be true of the eel
 *  every time — not true of whichever fish a hash happened to land on. */
const NAMED: Record<string, StyleId> = {
  // Goes still, then leaves. The archetype the style was written for.
  belut: 'mengendap', sidat: 'mengendap', lele: 'mengendap',
  patin: 'mengendap', baung: 'mengendap',
  // Schooling minnows: never anywhere for long.
  seluang: 'lincah', wader: 'lincah', teri: 'lincah', impun: 'lincah',
  japuh: 'lincah', selar: 'lincah',
  // Spined and stubborn, fights with the whole body.
  betok: 'menggetar', sepat: 'menggetar', gabus: 'menggetar',
  toman: 'menggetar', keting: 'menggetar', sembilang: 'menggetar',
  // Sounds for the bottom the moment it feels the hook.
  gurame: 'menyelam', tawes: 'menyelam', nila: 'menyelam',
  bawal: 'menyelam', kakap: 'menyelam', kerapu: 'menyelam',
  // Open water, and stronger than you.
  tuna: 'lari', tenggiri: 'lari', layaran: 'lari', marlin: 'lari',
  tongkol: 'lari', cakalang: 'lari', barakuda: 'lari',
};

/** A small stable hash, so an unnamed species always fights the same way
 *  across sessions and across machines. */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** The style this species fights with.
 *
 *  Named first; otherwise read off how hard it pulls and how big it gets,
 *  with the hash only breaking ties. A fish's own numbers should decide how
 *  it feels, so that a 90 cm bruiser never draws the pattern for a minnow. */
export function styleFor(sp: Species): FightStyle {
  const named = NAMED[sp.id];
  if (named) return STYLES[named];

  const h = hash(sp.id);
  const big = sp.maxCm >= 60;
  if (sp.fight >= 1.7 && big) return STYLES.lari;
  if (sp.fight >= 1.3) return STYLES[h < 0.5 ? 'menyelam' : 'lari'];
  if (sp.fight >= 0.95) return STYLES[h < 0.55 ? 'menggetar' : 'menyelam'];
  if (sp.fight >= 0.6) return STYLES[h < 0.5 ? 'menggetar' : 'tenang'];
  return STYLES[h < 0.6 ? 'lincah' : 'tenang'];
}

/** What the grade does on top of the pattern.
 *
 *  Common fish fight their pattern plainly. The rarer it is, the less room
 *  the pattern leaves you: the zone tightens, it surges out of turn, and at
 *  the top it goes out of sight for a beat and you hold the line on memory.
 *
 *  Ferocity lives here and nowhere else, so that raising a grade's teeth
 *  never means editing six behaviours. */
export function applyGrade(
  style: FightStyle, s: FightState, dt: number, tier: number,
): { zone: number; gain: number; drain: number } {
  // Surges: a shove out of turn, on top of whatever the pattern was doing.
  if (tier >= 2 && Math.sin(s.t * 1.7 + tier) > 0.93) {
    s.vel += (s.target < 0.5 ? 1 : -1) * dt * 5 * (tier - 1);
    s.target = clamp01(s.target + (s.target < 0.5 ? 1 : -1) * dt * 0.5);
  }

  // Out of sight. Only Legenda and Mitos, only for about a second, and never
  // straight after a hook-up — vanishing before the player has found the fish
  // once is not a fight, it is a coin toss.
  if (tier >= 4 && s.t > 2.5) {
    const c = Math.sin(s.t * 0.9 + 1.3);
    s.veil = c > 0.62 ? 1 : 0;
  } else {
    s.veil = 0;
  }

  return {
    // Each tier takes a share of the zone rather than a fixed slice. A flat
    // subtraction collapsed the narrow styles into nothing while barely
    // touching the wide ones — menggetar's own shake ended up wider than the
    // zone it had to sit in, which is not a hard fight, it is an impossible
    // one. Proportional keeps every style recognisable at every grade.
    zone: Math.max(0.12, style.zone * (1 - tier * 0.075)),
    gain: style.gain * s.gainMul * (1 - tier * 0.05),
    drain: style.drain * (1 + tier * 0.10),
  };
}

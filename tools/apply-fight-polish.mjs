import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/client/game/fight.ts';
let s = readFileSync(path, 'utf8');

if (s.includes('gradeRecover: number;')) {
  console.log('fight cadence patch already applied');
  process.exit(0);
}

function rep(oldText, newText) {
  if (!s.includes(oldText)) throw new Error(`anchor missing: ${oldText.slice(0, 100)}`);
  s = s.replace(oldText, newText);
}

rep(
`  /** >0 hides the zone this frame. Only the top grades ever set it. */
  veil: number;
}`,
`  /** >0 hides the zone this frame. Only the top grades ever set it. */
  veil: number;
  /** Grade-level burst cadence. Rare fish surge hard, then expose a short
   * recovery window instead of applying an opaque continuous difficulty tax. */
  gradePulse: number;
  gradeRecover: number;
  gradeCooldown: number;
  surgeDir: -1 | 1;
}`,
);

rep(
`    home: 0.5, homeVel: 0, gainMul: 1, veil: 0,
  };`,
`    home: 0.5, homeVel: 0, gainMul: 1, veil: 0,
    gradePulse: 0, gradeRecover: 0, gradeCooldown: 0, surgeDir: 1,
  };`,
);

rep(
`      s.target += (s.home - s.target) * Math.min(1, dt * 11);
      // Barely breathes between jumps, so the jump is the whole event.
      s.vel += (Math.random() - 0.5) * dt * 1.4;`,
`      s.target += (s.home - s.target) * Math.min(1, dt * 11);
      // Travelling costs reel efficiency; matching the landing rewards the
      // player's reaction with a brief catch-up window.
      s.gainMul = Math.abs(s.home - s.target) > 0.12 ? 0.82 : 1.08;
      // Barely breathes between jumps, so the jump is the whole event.
      s.vel += (Math.random() - 0.5) * dt * 1.4;`,
);

rep(
`      if (s.beat === 1) {
        // Driving for whichever end it set off toward, then pinning.`,
`      if (s.beat === 1) {
        s.gainMul = 0.72;
        // Driving for whichever end it set off toward, then pinning.`,
);

rep(
`      } else {
        // Between dives it recovers toward a resting spot that is itself
        // moving. It used to recover to dead centre, and a fish that always`,
`      } else {
        s.gainMul = 1.10;
        // Between dives it recovers toward a resting spot that is itself
        // moving. It used to recover to dead centre, and a fish that always`,
);

rep(
`      const shake = Math.sin(s.phase) * 0.06 + Math.sin(s.phase * 2.3) * 0.025;
      s.target = clamp01(s.home + shake);`,
`      const amp = 1 + Math.min(0.35, Math.max(0, fight - 1) * 0.22);
      const shake = (Math.sin(s.phase) * 0.06 + Math.sin(s.phase * 2.3) * 0.025) * amp;
      s.target = clamp01(s.home + shake);`,
);

rep(
`      if (s.phase <= 0) {
        s.beat = Math.random() < 0.5 ? 0 : 1;
        s.phase = 1.6 + Math.random() * 1.4;
      }
      const goal = s.beat === 0 ? 0.04 : 0.96;
      s.target += (goal - s.target) * Math.min(1, dt * (0.7 + 0.5 * fight));`,
`      if (s.phase <= 0) {
        // Alternate ends so an open-water run can never choose its current
        // side twice and pretend to be a meaningful burst.
        s.beat = s.beat === 0 ? 1 : 0;
        s.phase = 1.6 + Math.random() * 1.4;
      }
      const goal = s.beat === 0 ? 0.04 : 0.96;
      const away = Math.abs(goal - s.target);
      s.gainMul = away > 0.20 ? 0.78 : 1.06;
      s.target += (goal - s.target) * Math.min(1, dt * (0.7 + 0.5 * fight));`,
);

const start = s.indexOf('export function applyGrade(');
if (start < 0) throw new Error('applyGrade missing');
const prefix = s.slice(0, start);
const newApply = `export function applyGrade(
  style: FightStyle, s: FightState, dt: number, tier: number,
): { zone: number; gain: number; drain: number } {
  // Rare-grade pressure is a discrete beat, not a sine condition that shoves
  // every frame. A surge has a start/end and then a readable recovery window.
  const wasPulse = s.gradePulse > 0;
  s.gradePulse = Math.max(0, s.gradePulse - dt);
  s.gradeRecover = Math.max(0, s.gradeRecover - dt);
  s.gradeCooldown = Math.max(0, s.gradeCooldown - dt);
  if (wasPulse && s.gradePulse <= 0) {
    s.gradeRecover = 0.52 + tier * 0.045;
  }

  if (
    tier >= 2
    && s.t > 1.5
    && s.gradeCooldown <= 0
    && Math.sin(s.t * 1.7 + tier) > 0.91
  ) {
    s.gradePulse = 0.26 + tier * 0.035;
    s.gradeCooldown = 2.6 + tier * 0.28;
    s.surgeDir = s.target < 0.5 ? 1 : -1;
    s.vel += s.surgeDir * (0.55 + tier * 0.12);
  }

  if (s.gradePulse > 0) {
    s.vel += s.surgeDir * dt * (1.1 + tier * 0.22);
    s.target = clamp01(
      s.target + s.surgeDir * dt * (0.10 + tier * 0.025),
    );
  }

  // Legenda/Mitos still get the memory beat, but never stacked on a surge or
  // its recovery. Difficulty layers sequence instead of producing spikes.
  if (
    tier >= 4
    && s.t > 2.5
    && s.gradePulse <= 0
    && s.gradeRecover <= 0
  ) {
    const c = Math.sin(s.t * 0.9 + 1.3);
    s.veil = c > 0.62 ? 1 : 0;
  } else {
    s.veil = 0;
  }

  const recoveryBonus = s.gradeRecover > 0 ? 1.10 + tier * 0.015 : 1;
  const pulseDrain = s.gradePulse > 0 ? 1.08 : 1;
  const pulseZone = s.gradePulse > 0 ? 0.96 : 1;

  return {
    zone: Math.max(0.12, style.zone * (1 - tier * 0.075) * pulseZone),
    gain: style.gain * s.gainMul * (1 - tier * 0.05) * recoveryBonus,
    drain: style.drain * (1 + tier * 0.10) * pulseDrain,
  };
}
`;

s = prefix + newApply;
writeFileSync(path, s);
console.log('fight cadence patch applied');

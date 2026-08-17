/** Music.
 *
 *  Ambience alone is not a soundtrack. Water and crickets tell you where
 *  you are; they do not tell you how to feel about it, and a game with only
 *  ambience feels like a film someone forgot to score.
 *
 *  So this is a small generative band: a pad holding the chord, a bass on
 *  the root, a melody picking its way through the scale with plenty of
 *  rests, and brushed percussion. It never repeats exactly, because the
 *  melody is re-rolled every bar against the current chord — but it always
 *  stays in key, so it never sounds like a mistake.
 *
 *  Everything is scheduled ahead of the audio clock rather than fired from
 *  animation frames. Timing from requestAnimationFrame audibly stutters;
 *  timing from AudioContext.currentTime does not. */

export type Mood = 'pastoral' | 'medieval' | 'cyber' | 'fantasy';

interface Palette {
  /** Semitone offsets from the root for each chord in the loop. */
  progression: number[][];
  /** Scale used by the melody, in semitones. */
  scale: number[];
  root: number;
  bpm: number;
  padType: OscillatorType;
  leadType: OscillatorType;
  bassType: OscillatorType;
  /** 0..1 chance a melody slot actually sounds. Space is the point. */
  density: number;
  padGain: number;
  leadGain: number;
  bassGain: number;
  /** Brushed percussion on/off. */
  percussion: boolean;
  /** Lowpass on the whole bus, in Hz. */
  tone: number;
}

const A_MINOR = 220;
const C_MAJOR = 261.63;

const PALETTES: Record<Mood, Palette> = {
  // Warm, unhurried, major-seventh. The sound of not needing to be anywhere.
  pastoral: {
    progression: [[0, 4, 7, 11], [-3, 2, 5, 9], [-5, 0, 4, 7], [2, 5, 9, 12]],
    scale: [0, 2, 4, 7, 9, 11, 12, 14, 16],
    root: C_MAJOR,
    bpm: 68,
    padType: 'triangle',
    leadType: 'sine',
    bassType: 'sine',
    density: 0.34,
    padGain: 0.055,
    leadGain: 0.075,
    bassGain: 0.10,
    percussion: true,
    tone: 2600,
  },
  // Modal and open-fifthed: dorian, no thirds in the pad. Reads as old
  // without resorting to a lute sample.
  medieval: {
    progression: [[0, 7, 12], [-2, 5, 10], [-4, 3, 8], [0, 7, 14]],
    scale: [0, 2, 3, 5, 7, 9, 10, 12, 14],
    root: A_MINOR,
    bpm: 60,
    padType: 'triangle',
    leadType: 'triangle',
    bassType: 'sine',
    density: 0.28,
    padGain: 0.05,
    leadGain: 0.06,
    bassGain: 0.11,
    percussion: false,
    tone: 1900,
  },
  // Minor, detuned, and slower than it feels. The pad does the work.
  cyber: {
    progression: [[0, 3, 7, 10], [0, 3, 7, 10], [-4, 0, 3, 8], [-2, 1, 5, 8]],
    scale: [0, 2, 3, 5, 7, 8, 10, 12, 15],
    root: A_MINOR * 0.5,
    bpm: 76,
    padType: 'sawtooth',
    leadType: 'square',
    bassType: 'sawtooth',
    density: 0.30,
    padGain: 0.030,
    leadGain: 0.045,
    bassGain: 0.09,
    percussion: true,
    tone: 1500,
  },
  // Suspended chords, no leading tone, wide intervals. Nothing resolves.
  fantasy: {
    progression: [[0, 5, 7, 12], [2, 7, 9, 14], [-3, 2, 4, 9], [0, 5, 7, 11]],
    scale: [0, 2, 5, 7, 9, 12, 14, 17, 19],
    root: C_MAJOR * 0.75,
    bpm: 56,
    padType: 'sine',
    leadType: 'sine',
    bassType: 'sine',
    density: 0.26,
    padGain: 0.06,
    leadGain: 0.07,
    bassGain: 0.075,
    percussion: false,
    tone: 3200,
  },
};

const LOOKAHEAD_MS = 120;
const SCHEDULE_AHEAD = 0.45;

function getTimeMods(label: string): { bpm: number, density: number } {
  if (label === 'pagi' || label === 'subuh') return { bpm: 1.15, density: 1.25 };
  if (label === 'sore' || label === 'senja') return { bpm: 0.9, density: 0.85 };
  if (label === 'malam' || label === 'magrib' || label === 'dini hari') return { bpm: 0.8, density: 0.65 };
  return { bpm: 1.0, density: 1.0 };
}

export class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private reverb: ConvolverNode | null = null;
  private wet: GainNode | null = null;

  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;

  private mood: Mood = 'pastoral';
  private target: Mood = 'pastoral';
  /** Cross-fade weight while a district hands over to another. */
  private blend = 1;

  private targetTimeLabel = 'siang';
  private currentBpmMod = 1.0;
  private currentDensityMod = 1.0;

  /** 0..1 — dimmed during a bite so the fish gets the stage. */
  private duck = 1;
  private duckUntil = 0;

  private night = 0;
  private volume = 0.85;
  muted = false;

  start(ctx: AudioContext, destination: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;

    this.bus = ctx.createGain();
    this.bus.gain.value = 0;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2400;
    this.filter.Q.value = 0.4;

    // A short synthetic hall. Without any reverb a synth melody sounds like
    // it is happening inside the speaker rather than out over the water.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 2.6, 2.4);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;

    this.bus.connect(this.filter);
    this.filter.connect(destination);
    this.filter.connect(this.wet);
    this.wet.connect(this.reverb);
    this.reverb.connect(destination);

    this.bus.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 4);
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  setMood(m: Mood): void {
    if (m === this.target) return;
    this.target = m;
    this.blend = 0;
  }

  setNight(n: number): void {
    this.night = n;
  }

  setTimeOfDay(label: string): void {
    this.targetTimeLabel = label;
  }

  /** Pulls the music down for a moment — used when a fish bites, so the
   *  hook lands in a gap rather than under a chord. */
  duckFor(seconds: number): void {
    if (!this.ctx) return;
    this.duckUntil = this.ctx.currentTime + seconds;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (!this.ctx || !this.bus) return;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(m ? 0 : this.volume, this.ctx.currentTime + 0.4);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;

    // Ease the mood cross-fade and the ducking.
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + 0.04);
      if (this.blend >= 1) this.mood = this.target;
    }
    const wantDuck = ctx.currentTime < this.duckUntil ? 0.35 : 1;
    this.duck += (wantDuck - this.duck) * 0.15;

    // Night closes the filter down: the same music, heard later.
    if (this.filter) {
      const p = PALETTES[this.mood];
      const target = p.tone * (1 - this.night * 0.42);
      this.filter.frequency.setTargetAtTime(target, ctx.currentTime, 0.4);
    }

    const targetMods = getTimeMods(this.targetTimeLabel);
    this.currentBpmMod += (targetMods.bpm - this.currentBpmMod) * 0.02;
    this.currentDensityMod += (targetMods.density - this.currentDensityMod) * 0.02;

    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step, this.nextNoteTime);
      const p = PALETTES[this.mood];
      const activeBpm = p.bpm * this.currentBpmMod;
      this.nextNoteTime += (60 / activeBpm) / 2; // eighth notes
      this.step++;
    }
  }

  private scheduleStep(step: number, when: number): void {
    const p = PALETTES[this.mood];
    const activeBpm = p.bpm * this.currentBpmMod;
    const activeDensity = Math.min(1, p.density * this.currentDensityMod);
    const bar = Math.floor(step / 8) % p.progression.length;
    const chord = p.progression[bar];
    const inBar = step % 8;
    const g = this.duck * (this.muted ? 0 : 1);
    if (g <= 0.01) return;

    // --- pad: re-struck at the top of each bar, held across it
    if (inBar === 0) {
      const dur = (60 / activeBpm) * 4;
      for (const semi of chord) {
        this.voice(p.padType, p.root * ratio(semi), when, dur, p.padGain * g, 0.9, 0.6);
      }
    }

    // --- bass: root on 1, fifth on 5
    if (inBar === 0 || inBar === 4) {
      const semi = inBar === 0 ? chord[0] : chord[Math.min(1, chord.length - 1)];
      this.voice(p.bassType, p.root * 0.5 * ratio(semi), when, (60 / activeBpm) * 1.6, p.bassGain * g, 0.02, 0.35);
    }

    // --- melody: chosen fresh each time, weighted toward chord tones so it
    // always sits inside the harmony even though it is never the same twice
    if (Math.random() < activeDensity) {
      const useChordTone = Math.random() < 0.55;
      const semi = useChordTone
        ? chord[Math.floor(Math.random() * chord.length)] + (Math.random() < 0.4 ? 12 : 0)
        : p.scale[Math.floor(Math.random() * p.scale.length)];
      const dur = (60 / activeBpm) * (Math.random() < 0.3 ? 1.0 : 0.5);
      this.voice(p.leadType, p.root * 2 * ratio(semi), when, dur, p.leadGain * g, 0.01, 0.5);
    }

    // --- brushed percussion, quiet and off the beat
    if (p.percussion && (inBar === 2 || inBar === 6)) {
      this.noiseHit(when, 0.05, 0.012 * g);
    }
    if (p.percussion && inBar === 0) {
      this.noiseHit(when, 0.12, 0.02 * g, 220);
    }
  }

  /** One note: two slightly detuned oscillators for width, through an
   *  envelope. Detuning is what stops a synth pad sounding like a test tone. */
  private voice(
    type: OscillatorType, freq: number, when: number, dur: number,
    gain: number, attack: number, release: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + attack + 0.005);
    g.gain.setTargetAtTime(0, when + dur * 0.6, release * 0.5);
    g.connect(this.bus);

    for (const detune of [-4, 5]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(g);
      o.start(when);
      o.stop(when + dur + release + 0.2);
    }
  }

  private noiseHit(when: number, dur: number, gain: number, cutoff = 6000): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = cutoff < 1000 ? 'lowpass' : 'highpass';
    bp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.bus);
    src.start(when);
  }
}

/** Exponentially decaying noise makes a serviceable hall impulse. */
function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function ratio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

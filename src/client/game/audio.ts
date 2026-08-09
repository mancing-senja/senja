/** Everything you hear is synthesised at runtime — no audio files ship
 *  with the game.
 *
 *  The ambience is a small generative system: a filtered noise bed for the
 *  lake, a wind layer that breathes, night crickets, day birds, and a slow
 *  pentatonic chime that only plays when it will not step on anything.
 *  Because it is all synthesis, the mix can follow the time of day exactly
 *  the way the lighting does. */

import { Music, type Mood } from './music';

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const ROOT = 261.63; // C4

export class Audio {
  /** The band. Ambience tells you where you are; this tells you how the
   *  place feels, and its absence is what made the world sound hollow. */
  readonly music = new Music();

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private started = false;

  muted = false;
  private nextChime = 6;
  private nextCritter = 2;
  private clock = 0;

  /** Must be called from a user gesture or the context stays suspended. */
  start(): void {
    if (this.started) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.started = true;

    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);
    // Fade in rather than starting at full volume in the player's ears.
    this.master.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 2.5);

    this.noiseBuf = makeNoiseBuffer(ctx, 3);

    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 1;
    this.ambientGain.connect(this.master);

    // --- lake bed: brown-ish noise, gently swept
    const water = ctx.createBufferSource();
    water.buffer = this.noiseBuf;
    water.loop = true;
    const waterLp = ctx.createBiquadFilter();
    waterLp.type = 'lowpass';
    waterLp.frequency.value = 520;
    waterLp.Q.value = 0.6;
    const waterHp = ctx.createBiquadFilter();
    waterHp.type = 'highpass';
    waterHp.frequency.value = 120;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0.13;
    water.connect(waterHp).connect(waterLp).connect(this.waterGain).connect(this.ambientGain);
    water.start();

    // Slow sweep so the water never sits perfectly still.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(waterLp.frequency);
    lfo.start();

    // --- wind: a second noise layer, band-limited and breathing
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const windBp = ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.frequency.value = 700;
    windBp.Q.value = 0.9;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    wind.connect(windBp).connect(this.windGain).connect(this.ambientGain);
    wind.start();

    // The band shares the context but hangs off the master directly, so
    // muting and the fade-in cover both at once.
    this.music.start(ctx, this.master);

    const breath = ctx.createOscillator();
    breath.frequency.value = 0.045;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.045;
    breath.connect(breathGain).connect(this.windGain.gain);
    breath.start();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.music.setMuted(this.muted);
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime + 0.25);
    }
  }

  /** Which band is playing. Set from the district the player is in. */
  setMood(m: Mood): void {
    this.music.setMood(m);
  }

  /** Ambience follows the clock: crickets at night, birds by day, and the
   *  water gets a touch louder in the rain. */
  update(dt: number, night: number, rain: number): void {
    if (!this.ctx || this.muted) return;
    this.clock += dt;

    this.music.setNight(night);

    if (this.waterGain) {
      this.waterGain.gain.value = 0.11 + rain * 0.16;
    }
    if (this.windGain) {
      this.windGain.gain.value = 0.04 + rain * 0.05;
    }

    this.nextCritter -= dt;
    if (this.nextCritter <= 0) {
      if (night > 0.5 && rain < 0.4) {
        this.cricket();
        this.nextCritter = 0.5 + Math.random() * 1.4;
      } else if (night < 0.3 && rain < 0.3) {
        if (Math.random() < 0.55) this.bird();
        this.nextCritter = 2.5 + Math.random() * 6;
      } else {
        this.nextCritter = 3;
      }
    }

    this.nextChime -= dt;
    if (this.nextChime <= 0) {
      this.chime();
      this.nextChime = 9 + Math.random() * 16;
    }
  }

  // ---------------------------------------------------------------- sfx

  blip(freq: number, dur: number, gain = 0.15): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  /** Rod whoosh: filtered noise with a rising sweep. */
  cast(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.35);
  }

  /** The bobber hitting the water. A pitch-dropping sine is the classic
   *  and still the most convincing cheap "plop". */
  plop(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.2);
  }

  bite(): void {
    // Drop the band for a moment so the bite cuts through.
    this.music.duckFor(2.2);
    this.plop();
    this.blip(880, 0.09, 0.12);
    window.setTimeout(() => this.blip(1180, 0.09, 0.1), 80);
  }

  catchJingle(rare: boolean): void {
    const notes = rare ? [0, 4, 7, 12, 16] : [0, 4, 7];
    notes.forEach((semi, i) => {
      window.setTimeout(() => this.tone(ROOT * Math.pow(2, semi / 12), 0.5, 0.12), i * 90);
    });
  }

  /** A soft plucked tone — used for the chimes and the catch jingle. */
  private tone(freq: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2.01;
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.master);
    o.start();
    o2.start();
    o.stop(ctx.currentTime + dur + 0.05);
    o2.stop(ctx.currentTime + dur + 0.05);
  }

  private chime(): void {
    const semi = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    this.tone(ROOT * Math.pow(2, semi / 12) * 0.5, 2.2, 0.055);
  }

  private cricket(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const base = 4200 + Math.random() * 900;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.055;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = base;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.05);
    }
  }

  private bird(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 0.11;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f = 1800 + Math.random() * 1400;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (0.7 + Math.random() * 0.7), t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.028, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.12);
    }
  }
}

function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Brown noise: integrated white, which sits much better under a scene
  // than raw white hiss.
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

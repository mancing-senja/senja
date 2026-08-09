/** Fishing.
 *
 *  Tuned to be unhurried on purpose: the bite window is generous, the reel
 *  is a hold-to-keep-tension bar you have to actively fumble to lose, and
 *  failure costs you nothing but the cast. The interesting variable is
 *  *what* you catch, which depends on the time of day and how far out the
 *  bobber landed — not on reflexes. */

import { TILE } from '../../shared/constants';
import { view } from '../engine/view';
import { C } from '../art/palette';
import { textWidth } from '../art/font';
import type { Input } from '../engine/input';
import type { Draw } from '../render/draw';
import type { Particles } from '../render/scene';
import { Tile, isWater, tileAt, type WorldMap } from '../world/map';
import { DEFAULT_SPOT, spotAt, type Spot } from '../world/spots';
import { districtAt, type District } from '../world/districts';
import type { LocalPlayer } from './player';
import { handPos } from './player';
import type { Audio } from './audio';

export interface Species {
  id: string;
  label: string;
  /** Base coin value at average size. */
  value: number;
  minCm: number;
  maxCm: number;
  /** Relative weight during each phase; index matches PHASES. */
  weight: [number, number, number, number];
  /** How hard it pulls. Only changes the reel feel, never the outcome much. */
  fight: number;
  blurb: string;
}

/** pagi | siang | senja | malam */
const PHASES = ['pagi', 'siang', 'senja', 'malam'] as const;

export const SPECIES: Species[] = [
  // --- common, all day, close in. The fish you actually catch most nights.
  {
    id: 'wader', label: 'Wader', value: 8, minCm: 6, maxCm: 14,
    weight: [6, 5, 3, 2], fight: 0.4,
    blurb: 'Kecil, ramai, ga pernah bikin kecewa.',
  },
  {
    id: 'seluang', label: 'Seluang', value: 7, minCm: 5, maxCm: 12,
    weight: [5, 4, 3, 2], fight: 0.3,
    blurb: 'Datang serombongan, pergi serombongan.',
  },
  {
    id: 'sepat', label: 'Sepat', value: 11, minCm: 8, maxCm: 18,
    weight: [4, 4, 4, 2], fight: 0.5,
    blurb: 'Suka nyempil di sela eceng gondok.',
  },
  {
    id: 'betok', label: 'Betok', value: 14, minCm: 9, maxCm: 20,
    weight: [3, 3, 3, 3], fight: 0.8,
    blurb: 'Siripnya tajam. Pegang yang bener.',
  },
  {
    id: 'nila', label: 'Nila', value: 18, minCm: 12, maxCm: 30,
    weight: [4, 5, 3, 1], fight: 0.9,
    blurb: 'Ikan kolam paling jujur.',
  },
  {
    id: 'tawes', label: 'Tawes', value: 20, minCm: 14, maxCm: 32,
    weight: [3, 4, 3, 1], fight: 0.9,
    blurb: 'Perak bersih, kayak duit receh gede.',
  },
  {
    id: 'sunfish', label: 'Ikan Matahari', value: 22, minCm: 10, maxCm: 24,
    weight: [3, 6, 3, 0.6], fight: 0.7,
    blurb: 'Sisiknya nangkep cahaya siang.',
  },
  {
    id: 'jelawat', label: 'Jelawat', value: 26, minCm: 18, maxCm: 40,
    weight: [2.5, 3, 3, 1], fight: 1.1,
    blurb: 'Makan daun jatuh, gede pelan-pelan.',
  },

  // --- evening and night
  {
    id: 'lele', label: 'Lele', value: 24, minCm: 20, maxCm: 45,
    weight: [1, 0.8, 3, 5], fight: 1.2,
    blurb: 'Nunggu di dasar sampai lampu nyala.',
  },
  {
    id: 'gabus', label: 'Gabus', value: 32, minCm: 22, maxCm: 50,
    weight: [1.5, 1.5, 3.5, 4], fight: 1.5,
    blurb: 'Predator sabar. Kamu juga harus sabar.',
  },
  {
    id: 'moonperch', label: 'Betik Bulan', value: 34, minCm: 14, maxCm: 30,
    weight: [0.8, 0.6, 3, 6], fight: 0.9,
    blurb: 'Cuma naik pas air udah gelap.',
  },
  {
    id: 'patin', label: 'Patin', value: 36, minCm: 25, maxCm: 60,
    weight: [1, 1.5, 3, 3.5], fight: 1.4,
    blurb: 'Berat, halus, ga banyak drama.',
  },
  {
    id: 'hampala', label: 'Hampala', value: 40, minCm: 20, maxCm: 45,
    weight: [2, 3, 3.5, 1], fight: 1.5,
    blurb: 'Nyamber umpan kayak lagi buru-buru.',
  },
  {
    id: 'emberkoi', label: 'Koi Bara', value: 48, minCm: 20, maxCm: 42,
    weight: [0.8, 1.5, 5, 2], fight: 1.3,
    blurb: 'Warnanya kayak langit jam enam sore.',
  },
  {
    id: 'bawal', label: 'Bawal', value: 44, minCm: 18, maxCm: 38,
    weight: [1.5, 2, 2.5, 2], fight: 1.2,
    blurb: 'Bulat, tebal, giginya bikin kaget.',
  },
  {
    id: 'duskeel', label: 'Belut Senja', value: 58, minCm: 30, maxCm: 70,
    weight: [0.4, 0.4, 3.5, 3], fight: 1.6,
    blurb: 'Panjang, sabar, lebih sabar dari kamu.',
  },
  {
    id: 'belida', label: 'Belida', value: 70, minCm: 30, maxCm: 65,
    weight: [0.4, 0.5, 1.5, 2], fight: 1.7,
    blurb: 'Pipih kayak pisau. Susah ketemu sekarang.',
  },

  // --- rare, deep water, mostly after dark
  {
    id: 'arwana', label: 'Arwana', value: 110, minCm: 35, maxCm: 80,
    weight: [0.3, 0.4, 0.9, 1.1], fight: 1.9,
    blurb: 'Naik ke permukaan sekali, terus ilang.',
  },
  {
    id: 'glassfin', label: 'Sirip Kaca', value: 95, minCm: 12, maxCm: 26,
    weight: [0.4, 0.5, 0.9, 1.2], fight: 1.1,
    blurb: 'Nyaris tembus pandang. Jarang keliatan.',
  },
  {
    id: 'ikanhantu', label: 'Ikan Hantu', value: 140, minCm: 40, maxCm: 95,
    weight: [0.05, 0.05, 0.5, 1.2], fight: 2.0,
    blurb: 'Katanya cuma cerita. Katanya.',
  },
  {
    id: 'bintangair', label: 'Bintang Air', value: 165, minCm: 10, maxCm: 22,
    weight: [0.05, 0.05, 0.3, 1.0], fight: 1.0,
    blurb: 'Kecil, terang, cuma muncul pas langit bersih.',
  },

  // --- Benteng Lama. Cold, still moat water under old stone.
  {
    id: 'lelemail', label: 'Lele Zirah', value: 52, minCm: 25, maxCm: 55,
    weight: [1.2, 1.0, 2.0, 3.0], fight: 1.5,
    blurb: 'Kulitnya keras kayak dilapis pelat.',
  },
  {
    id: 'koibenteng', label: 'Koi Benteng', value: 78, minCm: 22, maxCm: 48,
    weight: [1.5, 2.0, 2.2, 1.2], fight: 1.3,
    blurb: 'Katanya keturunan koi peliharaan penghuni benteng.',
  },
  {
    id: 'ikanpanji', label: 'Ikan Panji', value: 96, minCm: 18, maxCm: 40,
    weight: [0.8, 1.0, 1.6, 1.4], fight: 1.6,
    blurb: 'Siripnya berkibar persis panji di menara itu.',
  },

  // --- Dermaga Neon. Warm outfall water; nothing here is quite natural.
  {
    id: 'kromsirip', label: 'Krom Sirip', value: 64, minCm: 16, maxCm: 38,
    weight: [1.5, 1.5, 2.0, 2.6], fight: 1.4,
    blurb: 'Siripnya memantul cahaya papan reklame.',
  },
  {
    id: 'ikanstatik', label: 'Ikan Statik', value: 88, minCm: 12, maxCm: 30,
    weight: [1.0, 1.0, 1.8, 2.8], fight: 1.2,
    blurb: 'Kalau dipegang, tangan kesemutan sedikit.',
  },
  {
    id: 'nikelmas', label: 'Nikel Mas', value: 118, minCm: 20, maxCm: 44,
    weight: [0.6, 0.8, 1.2, 1.6], fight: 1.7,
    blurb: 'Berat ga wajar buat ukuran segitu.',
  },

  // --- Rimbun Cahaya. Only bite where the water lights itself.
  {
    id: 'sisikembun', label: 'Sisik Embun', value: 72, minCm: 10, maxCm: 24,
    weight: [1.6, 1.2, 1.6, 2.4], fight: 0.9,
    blurb: 'Sisiknya basah terus, walau sudah lama di darat.',
  },
  {
    id: 'ikanrembulan', label: 'Ikan Rembulan', value: 135, minCm: 20, maxCm: 46,
    weight: [0.4, 0.4, 1.4, 2.6], fight: 1.5,
    blurb: 'Cuma naik kalau air kolamnya lagi terang.',
  },
  {
    id: 'naganila', label: 'Naga Nila', value: 190, minCm: 45, maxCm: 110,
    weight: [0.15, 0.15, 0.8, 1.6], fight: 2.2,
    blurb: 'Panjang, pelan, dan sama sekali tidak takut.',
  },

  // --- junk
  {
    id: 'oldboot', label: 'Sepatu Butut', value: 2, minCm: 25, maxCm: 30,
    weight: [1, 1, 1, 1], fight: 0.3,
    blurb: 'Seseorang kehilangan ini. Lama sekali lalu.',
  },
  {
    id: 'kaleng', label: 'Kaleng Kosong', value: 1, minCm: 10, maxCm: 14,
    weight: [1, 1, 0.8, 0.8], fight: 0.2,
    blurb: 'Setidaknya danaunya jadi lebih bersih.',
  },
];

const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function speciesById(id: string): Species | undefined {
  return BY_ID.get(id);
}

function phaseIndex(time: number): number {
  const t = ((time % 1) + 1) % 1;
  if (t < 0.28) return 3;      // still dark
  if (t < 0.45) return 0;      // pagi
  if (t < 0.66) return 1;      // siang
  if (t < 0.86) return 2;      // senja
  return 3;                    // malam
}

export function phaseLabel(time: number): string {
  return PHASES[phaseIndex(time)];
}

/** Three things decide what bites: the hour, how far out the bobber landed,
 *  and which spot it landed in. The spot is the strongest of the three —
 *  that is what makes walking to the swamp at night worth doing. */
function rollSpecies(
  time: number, depth01: number, spot: Spot, district: District | null,
): Species {
  const p = phaseIndex(time);
  const weights = SPECIES.map((s) => {
    let w = s.weight[p];
    // Rare fish (high value) get their weight scaled up in deep water.
    const rarity = Math.min(1, s.value / 120);
    w *= 1 + rarity * depth01 * 2.2;
    // Junk is less likely the further you cast.
    if (s.id === 'oldboot' || s.id === 'kaleng') w *= 1 - depth01 * 0.6;
    w *= spot.mult[s.id] ?? 1;
    // The district multiplies on top of the spot. Standing at the neon quay
    // is a bigger change to what bites than the hour ever is.
    if (district) w *= district.fish[s.id] ?? 1;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SPECIES.length; i++) {
    r -= weights[i];
    if (r <= 0) return SPECIES[i];
  }
  return SPECIES[0];
}

export type FishState = 'idle' | 'aim' | 'cast' | 'wait' | 'bite' | 'reel' | 'card' | 'miss';

export interface Catch {
  species: Species;
  cm: number;
  coins: number;
  perfect: boolean;
}

const MAX_CAST = 96;
const MIN_CAST = 26;

export class Fishing {
  state: FishState = 'idle';
  private t = 0;
  private power = 0;
  private powerDir = 1;
  private bobX = 0;
  private bobY = 0;
  private fromX = 0;
  private fromY = 0;
  private flightT = 0;
  private flightDur = 0;
  private biteAt = 0;
  private depth01 = 0;
  private spot: Spot = DEFAULT_SPOT;
  private district: District | null = null;
  private pending: Species | null = null;

  /** Reel bar. `tension` is what the player steers; `target` drifts. */
  private tension = 0.5;
  private target = 0.5;
  private targetVel = 0;
  private progress = 0;
  private slack = 0;

  lastCatch: Catch | null = null;
  cardT = 0;
  /** Set for one frame when a catch lands, so main can flash the screen. */
  flash = 0;

  /** Where the bobber currently is, for the network and the line renderer. */
  get bobber(): { x: number; y: number } | null {
    return this.state === 'idle' || this.state === 'card' || this.state === 'aim'
      ? null
      : { x: this.bobX, y: this.bobY };
  }

  get busy(): boolean {
    return this.state !== 'idle';
  }

  /** Abandons whatever is in progress. Used when the player walks through a
   *  door — a rod still cast into a lake you are no longer standing beside
   *  would leave a bobber floating in another map. */
  cancel(p: LocalPlayer): void {
    this.state = 'idle';
    this.t = 0;
    this.pending = null;
    p.locked = false;
    p.action = 'idle';
  }

  /** Exposed for the dev harness, which drives the reel to verify the
   *  whole catch flow without a human on the keyboard. */
  get reel(): { tension: number; target: number; progress: number } {
    return { tension: this.tension, target: this.target, progress: this.progress };
  }

  update(
    dt: number, input: Input, p: LocalPlayer, map: WorldMap,
    time: number, particles: Particles, audio: Audio,
    onCatch: (c: Catch) => void, onCastNet: (x: number, y: number) => void,
  ): void {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);

    switch (this.state) {
      case 'idle': {
        if (input.pressed(' ') && facingWater(p, map)) {
          this.state = 'aim';
          this.power = 0;
          this.powerDir = 1;
          p.locked = true;
          p.action = 'cast';
          audio.blip(660, 0.05, 0.16);
        }
        break;
      }

      case 'aim': {
        // Power oscillates; release to cast. No penalty for overshooting —
        // it only changes where the bobber lands.
        this.power += this.powerDir * dt * 1.15;
        if (this.power >= 1) { this.power = 1; this.powerDir = -1; }
        if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
        if (!input.held(' ')) this.beginCast(p, map, particles, audio, onCastNet);
        break;
      }

      case 'cast': {
        this.flightT += dt;
        const k = Math.min(1, this.flightT / this.flightDur);
        this.bobX = this.fromX + (this.targetX - this.fromX) * k;
        this.bobY = this.fromY + (this.targetY - this.fromY) * k;
        if (k >= 1) {
          particles.spawnSplash(this.bobX, this.bobY, 8);
          audio.plop();
          this.state = 'wait';
          p.action = 'wait';
          this.t = 0;
          // Long enough that you look at the lake, short enough to stay a game.
          this.biteAt = 2.4 + Math.random() * 7.5;
        }
        break;
      }

      case 'wait': {
        this.bobY += Math.sin(this.t * 2.1) * dt * 2.4;
        if (input.pressed(' ')) {
          // Reeling in early is always allowed.
          this.reset(p);
          break;
        }
        if (this.t >= this.biteAt) {
          this.pending = rollSpecies(time, this.depth01, this.spot, this.district);
          this.state = 'bite';
          this.t = 0;
          particles.spawnSplash(this.bobX, this.bobY + 2, 5);
          audio.bite();
        }
        break;
      }

      case 'bite': {
        this.bobY += Math.sin(this.t * 22) * dt * 9;
        // Two full seconds to react. Generous by design.
        if (input.pressed(' ')) {
          this.state = 'reel';
          this.t = 0;
          this.tension = 0.5;
          this.target = 0.5;
          this.targetVel = 0;
          this.progress = 0.28;
          this.slack = 0;
          p.action = 'reel';
          audio.blip(520, 0.06, 0.2);
        } else if (this.t > 2.0) {
          this.state = 'miss';
          this.t = 0;
        }
        break;
      }

      case 'reel': {
        const fish = this.pending!;
        // The fish wanders; you follow it. Wandering is smooth, never jerky.
        this.targetVel += (Math.random() - 0.5) * dt * 9 * fish.fight;
        this.targetVel *= 0.92;
        this.target = clamp01(this.target + this.targetVel * dt);
        if (this.target <= 0 || this.target >= 1) this.targetVel *= -0.6;

        const pull = input.held(' ') ? 1 : -1;
        this.tension = clamp01(this.tension + pull * dt * 0.7);

        // Wide zone, slow drain: the reel is meant to be something you do
        // while looking at the lake, not a rhythm test. Losing a fish
        // should take sustained inattention, not a moment of it.
        const off = Math.abs(this.tension - this.target);
        const inZone = off < 0.28;
        this.progress += (inZone ? 0.42 : -0.10) * dt;
        this.slack = inZone ? Math.max(0, this.slack - dt * 0.6) : this.slack + dt * 0.5;

        this.bobX += (Math.random() - 0.5) * 12 * dt;
        this.bobY += (Math.random() - 0.5) * 8 * dt;

        if (this.progress >= 1) {
          this.land(fish, particles, audio, onCatch, p);
        } else if (this.progress <= -0.15 || this.slack > 4.0) {
          this.state = 'miss';
          this.t = 0;
          audio.blip(180, 0.18, 0.16);
        }
        break;
      }

      case 'miss': {
        if (this.t > 1.1) this.reset(p);
        break;
      }

      case 'card': {
        this.cardT += dt;
        if (input.pressed(' ', 'e', 'enter') || this.cardT > 5) this.reset(p);
        break;
      }
    }
  }

  private targetX = 0;
  private targetY = 0;

  private beginCast(
    p: LocalPlayer, map: WorldMap, particles: Particles, audio: Audio,
    onCastNet: (x: number, y: number) => void,
  ): void {
    const hand = handPos(p);
    const dist = MIN_CAST + this.power * (MAX_CAST - MIN_CAST);
    const dir = p.facing;
    let dx = 0;
    let dy = -1;
    if (dir === 'left') { dx = -1; dy = -0.35; }
    else if (dir === 'right') { dx = 1; dy = -0.35; }
    else if (dir === 'down') { dx = 0; dy = 1; }
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;

    let tx = hand.x + dx * dist;
    let ty = hand.y + dy * dist;

    // Walk the cast back until it is over water, so the bobber never lands
    // on the grass and leaves the player stuck.
    for (let i = 0; i < 24; i++) {
      if (isWater(tileAt(map, Math.floor(tx / TILE), Math.floor(ty / TILE)))) break;
      tx -= dx * 4;
      ty -= dy * 4;
    }

    this.fromX = hand.x;
    this.fromY = hand.y;
    this.targetX = tx;
    this.targetY = ty;
    this.bobX = hand.x;
    this.bobY = hand.y;
    this.flightT = 0;
    this.flightDur = 0.22 + dist / 400;
    this.state = 'cast';
    p.action = 'cast';

    // Where the bobber landed decides the spot, and the spot sets the
    // baseline depth. Casting further out from the shore adds to it.
    this.spot = spotAt(map.spots, tx, ty);
    this.district = districtAt(tx, ty).district;
    const shoreCol = map.shore[clampInt(Math.floor(tx / TILE), 0, map.shore.length - 1)];
    const fromShore = shoreCol * TILE - ty;
    this.depth01 = clamp01(this.spot.depth + clamp01(fromShore / 200) * 0.45);

    audio.cast();
    particles.spawnSpark(hand.x, hand.y, 3);
    onCastNet(tx, ty);
  }

  private land(
    fish: Species, particles: Particles, audio: Audio,
    onCatch: (c: Catch) => void, p: LocalPlayer,
  ): void {
    const roll = Math.random() * Math.random(); // small fish are common
    const cm = Math.round(fish.minCm + (fish.maxCm - fish.minCm) * (1 - roll));
    const sizeK = (cm - fish.minCm) / Math.max(1, fish.maxCm - fish.minCm);
    const perfect = this.slack < 0.35;
    const coins = Math.max(1, Math.round(fish.value * (0.6 + sizeK * 0.9) * (perfect ? 1.25 : 1)));

    this.lastCatch = { species: fish, cm, coins, perfect };
    this.state = 'card';
    this.cardT = 0;
    this.flash = 0.35;
    p.action = 'idle';
    particles.spawnSplash(this.bobX, this.bobY, 14);
    particles.spawnSpark(this.bobX, this.bobY - 6, 12);
    audio.catchJingle(fish.value >= 40);
    onCatch(this.lastCatch);
  }

  private reset(p: LocalPlayer): void {
    this.state = 'idle';
    this.t = 0;
    this.pending = null;
    p.locked = false;
    p.action = 'idle';
  }

  /** World-space bits: the bobber and its ripples. */
  drawWorld(d: Draw, time: number): void {
    if (!this.bobber) return;
    const ring = Math.floor((time * 3) % 4);
    d.spriteFoot(`ripple${ring}`, this.bobX, this.bobY + 6, { alpha: 0.5 });
    d.spriteFoot('bobber', this.bobX, this.bobY + 3);
    if (this.state === 'bite') {
      const bounce = Math.abs(Math.sin(this.t * 9)) * 3;
      d.textCentered('!', this.bobX, this.bobY - 16 - bounce, C.Lantern, C.InkDeep);
    }
  }

  /** Screen-space HUD. Drawn with the camera parked at the origin. */
  drawHud(d: Draw): void {
    const cx = view.w / 2;

    if (this.state === 'aim') {
      const w = 72;
      const x = cx - w / 2;
      const y = view.h - 34;
      d.rect(x - 2, y - 2, w + 4, 10, C.InkDeep, 0.55);
      d.rect(x, y, w, 6, C.Slate, 0.9);
      d.rect(x, y, Math.round(w * this.power), 6, C.Amber);
      d.rect(x + Math.round(w * this.power) - 1, y - 1, 2, 8, C.White);
      d.textCentered('lepas buat lempar', cx, y - 12, C.Pale, C.InkDeep);
    }

    if (this.state === 'wait') {
      d.textCentered('...', cx, view.h - 30, C.Pale, C.InkDeep, 0.7);
      const where = this.district ? `${this.district.label} · ${this.spot.label}` : this.spot.label;
      if (this.spot.id !== 'kolam' || this.district) {
        d.textCentered(where, cx, view.h - 20, C.Amber, C.InkDeep, 0.6);
      }
    }

    if (this.state === 'bite') {
      d.textCentered('TARIK!', cx, view.h - 34, C.Lantern, C.InkDeep);
    }

    if (this.state === 'reel') {
      const w = 96;
      const x = cx - w / 2;
      const y = view.h - 32;
      d.rect(x - 2, y - 2, w + 4, 14, C.InkDeep, 0.6);
      d.rect(x, y, w, 8, C.Slate, 0.95);

      // The zone you are trying to sit in.
      const zoneW = Math.round(w * 0.56);
      const zoneX = x + Math.round(this.target * w) - zoneW / 2;
      d.rect(zoneX, y, zoneW, 8, C.Forest, 0.9);
      d.rect(zoneX, y, zoneW, 1, C.Grass, 0.9);

      // Your tension marker.
      const mx = x + Math.round(this.tension * w);
      d.rect(mx - 1, y - 2, 3, 12, C.White);

      // Progress toward landing it.
      const pw = Math.max(0, Math.round(w * Math.min(1, this.progress)));
      d.rect(x, y + 10, w, 2, C.Slate, 0.8);
      d.rect(x, y + 10, pw, 2, C.Lantern);

      d.textCentered('tahan spasi', cx, y - 11, C.Pale, C.InkDeep, 0.85);
    }

    if (this.state === 'miss') {
      d.textCentered('lepas...', cx, view.h - 34, C.Mist, C.InkDeep);
    }

    if (this.state === 'card' && this.lastCatch) this.drawCard(d);
  }

  private drawCard(d: Draw): void {
    const c = this.lastCatch!;
    const w = 132;
    const h = 62;
    const pop = Math.min(1, this.cardT * 6);
    const ease = 1 - Math.pow(1 - pop, 3);
    const x = Math.round(view.w / 2 - w / 2);
    const y = Math.round(view.h / 2 - h / 2 - 14 + (1 - ease) * 8);
    const a = ease;

    d.panel(x, y, w, h, a, c.perfect ? C.Lantern : C.Slate);
    d.sprite(`fishbig_${c.species.id}`, x + 8, y + 18, { alpha: a });

    d.text(c.species.label, x + 54, y + 10, C.White, a);
    d.text(`${c.cm} cm`, x + 54, y + 22, C.Amber, a);
    d.text(`+${c.coins}`, x + 54, y + 34, C.Lantern, a);
    d.text('koin', x + 54 + textWidth(`+${c.coins}`) + 3, y + 34, C.SunGlow, a * 0.8);

    if (c.perfect) d.text('mulus!', x + 54, y + 46, C.Grass, a);
    else d.text(c.species.blurb.slice(0, 22), x + 8, y + 50, C.Mist, a * 0.8);

    d.textCentered('spasi', view.w / 2, y + h + 5, C.Mist, C.InkDeep, a * 0.7);
  }
}

function facingWater(p: LocalPlayer, map: WorldMap): boolean {
  const reach = 30;
  let dx = 0;
  let dy = -1;
  if (p.facing === 'left') dx = -1, dy = 0;
  else if (p.facing === 'right') dx = 1, dy = 0;
  else if (p.facing === 'down') dx = 0, dy = 1;
  for (let r = 6; r <= reach; r += 4) {
    const tx = Math.floor((p.x + dx * r) / TILE);
    const ty = Math.floor((p.y - 6 + dy * r) / TILE);
    const t = tileAt(map, tx, ty);
    if (isWater(t)) return true;
    if (t === Tile.Blocked) return false;
  }
  return false;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampInt(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

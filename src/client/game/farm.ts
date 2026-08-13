/** The farm half of the loop: sell what you caught, buy seeds, plant them
 *  in the shared plots, water, wait, harvest.
 *
 *  Plots are shared by everyone in the room on purpose. Watering a plot
 *  somebody else planted, and finding your tomatoes grown while you were
 *  away, is most of the reason to be in a room together at all. */

import { CROP_STAGES, TILE } from '../../shared/constants';
import type { PlotState } from '../../shared/protocol';
import { C } from '../art/palette';
import { CROP_LOOKS } from '../art/props';
import { textWidth } from '../art/font';
import { Blend } from '../engine/batch';
import type { Draw } from '../render/draw';
import type { Renderable } from '../render/scene';
import type { WorldMap } from '../world/map';
import type { Catch } from './fishing';
import type { LocalPlayer } from './player';

export const CROPS = Object.keys(CROP_LOOKS);

export const CROP_INFO: Record<string, { label: string; seed: number; sell: number }> = {
  tomat: { label: 'Tomat', seed: 10, sell: 26 },
  labu: { label: 'Labu', seed: 16, sell: 44 },
  terong: { label: 'Terong', seed: 13, sell: 34 },
  jagung: { label: 'Jagung', seed: 8, sell: 22 },
};

export interface Prompt {
  text: string;
  x: number;
  y: number;
}

export type FarmAction =
  | { kind: 'plot'; i: number; op: 'till' | 'plant' | 'water' | 'harvest'; crop?: string }
  | { kind: 'sell' }
  | { kind: 'buy'; crop: string };

const REACH = 22;

export interface LogEntry {
  count: number;
  best: number;
  /** Highest grade tier ever landed of this species. Optional on read:
   *  a log saved before grades existed has no such field. */
  bestGrade: number;
}

export class Farm {
  coins = 30;
  seeds: Record<string, number> = { tomat: 3, labu: 0, terong: 0, jagung: 2 };
  basket: Catch[] = [];
  harvested: Record<string, number> = {};
  selected = 0;

  /** Set each frame by `findPrompt`. */
  prompt: Prompt | null = null;
  private pendingAction: FarmAction | null = null;

  get selectedCrop(): string {
    return CROPS[this.selected % CROPS.length];
  }

  cycleCrop(): void {
    this.selected = (this.selected + 1) % CROPS.length;
  }

  /** What has been caught at least once, and the biggest of each. The log
   *  is the reason to keep casting once coins stop mattering. */
  log: Record<string, LogEntry> = {};

  addCatch(c: Catch): void {
    this.basket.push(c);
    const e = this.log[c.species.id] ?? { count: 0, best: 0, bestGrade: 0 };
    e.count++;
    e.best = Math.max(e.best, c.cm);
    // The best grade ever landed, so the journal can show the species at
    // its finest rather than always at its plainest.
    e.bestGrade = Math.max(e.bestGrade ?? 0, c.grade.tier);
    this.log[c.species.id] = e;
  }

  get basketValue(): number {
    let v = 0;
    for (const c of this.basket) v += c.coins;
    for (const [crop, n] of Object.entries(this.harvested)) {
      v += (CROP_INFO[crop]?.sell ?? 10) * n;
    }
    return v;
  }

  get basketCount(): number {
    let n = this.basket.length;
    for (const v of Object.values(this.harvested)) n += v;
    return n;
  }

  /** Works out what the player is standing next to and what pressing E
   *  would do there. Returns the action without performing it. */
  findPrompt(p: LocalPlayer, map: WorldMap, plots: PlotState[]): FarmAction | null {
    this.prompt = null;
    this.pendingAction = null;

    // --- shop counter: the crate outside the cabin
    const crate = map.props.find((pr) => pr.kind === 'crate');
    if (crate && near(p, crate.x, crate.y, 26)) {
      if (this.basketCount > 0) {
        this.prompt = { text: `[E] jual ${this.basketCount} — ${this.basketValue} koin`, x: crate.x, y: crate.y - 20 };
        this.pendingAction = { kind: 'sell' };
      } else {
        this.prompt = { text: 'keranjang kosong', x: crate.x, y: crate.y - 20 };
      }
      return this.pendingAction;
    }

    // --- seed sign by the plots
    const sign = map.props.find((pr) => pr.kind === 'sign');
    if (sign && near(p, sign.x, sign.y, 24)) {
      const crop = this.selectedCrop;
      const info = CROP_INFO[crop];
      this.prompt = {
        text: `[E] beli bibit ${info.label} ${info.seed}  [Q] ganti`,
        x: sign.x, y: sign.y - 22,
      };
      this.pendingAction = { kind: 'buy', crop };
      return this.pendingAction;
    }

    // --- plots
    let best: { i: number; d: number; tx: number; ty: number } | null = null;
    for (const plot of map.plots) {
      const cx = plot.tx * TILE + TILE;
      const cy = plot.ty * TILE + TILE;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < REACH && (!best || d < best.d)) best = { i: plot.i, d, tx: plot.tx, ty: plot.ty };
    }
    if (!best) return null;

    const st = plots[best.i];
    const px = best.tx * TILE + TILE;
    const py = best.ty * TILE;
    if (!st || st.stage === -1) {
      this.prompt = { text: '[E] cangkul', x: px, y: py };
      this.pendingAction = { kind: 'plot', i: best.i, op: 'till' };
    } else if (!st.crop) {
      const crop = this.selectedCrop;
      const have = this.seeds[crop] ?? 0;
      if (have > 0) {
        this.prompt = { text: `[E] tanam ${CROP_INFO[crop].label} (${have})  [Q] ganti`, x: px, y: py };
        this.pendingAction = { kind: 'plot', i: best.i, op: 'plant', crop };
      } else {
        this.prompt = { text: `bibit ${CROP_INFO[crop].label} habis  [Q] ganti`, x: px, y: py };
      }
    } else if (st.stage >= CROP_STAGES) {
      this.prompt = { text: `[E] panen ${CROP_INFO[st.crop]?.label ?? st.crop}`, x: px, y: py };
      this.pendingAction = { kind: 'plot', i: best.i, op: 'harvest', crop: st.crop };
    } else if (!st.watered) {
      this.prompt = { text: '[E] siram', x: px, y: py };
      this.pendingAction = { kind: 'plot', i: best.i, op: 'water' };
    } else {
      this.prompt = { text: `${CROP_INFO[st.crop]?.label ?? st.crop} lagi tumbuh`, x: px, y: py };
    }
    return this.pendingAction;
  }

  /** Applies the local half of an action. The server owns plot state, so
   *  planting only spends the seed here and the plot updates when the
   *  server echoes it back. */
  apply(a: FarmAction): boolean {
    switch (a.kind) {
      case 'sell': {
        if (this.basketCount === 0) return false;
        this.coins += this.basketValue;
        this.basket = [];
        this.harvested = {};
        return true;
      }
      case 'buy': {
        const info = CROP_INFO[a.crop];
        if (!info || this.coins < info.seed) return false;
        this.coins -= info.seed;
        this.seeds[a.crop] = (this.seeds[a.crop] ?? 0) + 1;
        return true;
      }
      case 'plot': {
        if (a.op === 'plant') {
          const crop = a.crop!;
          if ((this.seeds[crop] ?? 0) <= 0) return false;
          this.seeds[crop]--;
        }
        if (a.op === 'harvest' && a.crop) this.collect(a.crop);
        return true;
      }
    }
  }

  /** Called when the server confirms a harvest that this player triggered. */
  collect(crop: string): void {
    this.harvested[crop] = (this.harvested[crop] ?? 0) + 1;
  }

  /** Crops are entities, not tiles — they need to y-sort against players. */
  renderables(d: Draw, map: WorldMap, plots: PlotState[], time: number): Renderable[] {
    const out: Renderable[] = [];
    for (const plot of map.plots) {
      const st = plots[plot.i];
      if (!st || !st.crop || st.stage < 1) continue;
      const stage = Math.min(CROP_STAGES, st.stage);
      const name = `crop_${st.crop}_${stage}`;
      const x = plot.tx * TILE + TILE;
      const y = plot.ty * TILE + TILE + 2;
      const sway = Math.sin(time * 1.1 + plot.i) * 0.8;
      out.push({
        y,
        draw: () => {
          // Damp soil reads as watered without needing a second tileset.
          if (st.watered) {
            d.rect(plot.tx * TILE, plot.ty * TILE, TILE * 2, TILE, C.WaterDp, 0.18);
          }
          // A ready crop gets a faint halo so it is findable across the field.
          if (stage >= CROP_STAGES) {
            const pulse = 0.35 + 0.25 * Math.sin(time * 2.2 + plot.i);
            d.sprite('glow32', x - 16, y - 24, {
              tint: [1, 0.9, 0.6], alpha: pulse * 0.35, blend: Blend.Add,
            });
          }
          d.spriteFoot(name, x + sway, y);
        },
      });
    }
    return out;
  }

  drawPrompt(d: Draw): void {
    if (!this.prompt) return;
    const w = textWidth(this.prompt.text);
    const x = Math.round(this.prompt.x - w / 2);
    const y = Math.round(this.prompt.y - 6);
    d.rect(x - 3, y - 2, w + 6, 11, C.InkDeep, 0.6);
    d.frameRect(x - 3, y - 2, w + 6, 11, C.Slate, 0.5);
    d.text(this.prompt.text, x, y, C.White);
  }
}

function near(p: LocalPlayer, x: number, y: number, r: number): boolean {
  return Math.hypot(p.x - x, p.y - y) < r;
}

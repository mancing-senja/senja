/** The character creator.
 *
 *  Nine choices, packed into the integer `art/custom.ts` defines. The screen
 *  exists because thirteen million appearances are worth nothing if there is
 *  no way to pick one.
 *
 *  **The preview does not go through the atlas.** Everything else in the game
 *  is baked into one texture at boot, which is why it is fast and why nothing
 *  looks like an asset flip — but it also means changing an appearance costs a
 *  whole rebake. Rebaking on every arrow press would make the creator feel
 *  broken even if it were fast enough, because the response would be a stutter
 *  instead of a change.
 *
 *  So the preview is drawn as rectangles, straight from the generated
 *  PixelCanvas: 16x24 pixels at 5x is under four hundred rects, which the
 *  batcher does not notice. The atlas is only touched once, on confirm.
 *
 *  Every change is visible immediately and nothing is committed until Enter,
 *  so a player can wander through the whole space and back out unchanged. */

import { view } from '../engine/view';
import { C } from '../art/palette';
import { textWidth } from '../art/font';
import type { Draw } from '../render/draw';
import type { Input } from '../engine/input';
import { PixelCanvas } from '../art/canvas';
import { framesForLooks } from '../art/character';
import {
  OPTION_COUNT, lookFromCode, packLook, randomCode, unpackLook, type Choices,
} from '../art/custom';

/** The rows, in the order they are offered.
 *
 *  Hair before clothes, and skin before hair, because that is the order people
 *  build a character in: body, then head, then what it is wearing. Offering
 *  garment first means every later choice is made against a body you have not
 *  decided on yet.
 */
const ROWS: ReadonlyArray<readonly [keyof Choices, string]> = [
  ['skin', 'kulit'],
  ['hair', 'warna rambut'],
  ['hairStyle', 'gaya rambut'],
  ['head', 'tutup kepala'],
  ['headCol', 'warna topi'],
  ['garment', 'pakaian'],
  ['shirt', 'warna atasan'],
  ['pants', 'celana'],
  ['boot', 'sepatu'],
];

const PREVIEW_SCALE = 5;

export class Creator {
  open = false;
  private choices: Choices;
  private row = 0;
  /** Cached preview frame, rebuilt only when a choice actually changes. */
  private frame: PixelCanvas | null = null;
  private turn = 0;

  constructor(code: number) {
    this.choices = unpackLook(code);
  }

  get code(): number {
    return packLook(this.choices);
  }

  show(): void {
    this.open = true;
    this.row = 0;
    this.frame = null;
  }

  /** Returns the chosen code once, on the frame the player confirms. */
  update(dt: number, input: Input): number | null {
    if (!this.open) return null;
    this.turn += dt;

    if (input.pressed('arrowdown', 's')) this.row = (this.row + 1) % ROWS.length;
    if (input.pressed('arrowup', 'w')) {
      this.row = (this.row + ROWS.length - 1) % ROWS.length;
    }

    const key = ROWS[this.row][0];
    const count = OPTION_COUNT[key];
    if (input.pressed('arrowright', 'd')) {
      this.choices[key] = (this.choices[key] + 1) % count;
      this.frame = null;
    }
    if (input.pressed('arrowleft', 'a')) {
      this.choices[key] = (this.choices[key] + count - 1) % count;
      this.frame = null;
    }
    if (input.pressed('r')) {
      this.choices = unpackLook(randomCode());
      this.frame = null;
    }
    if (input.pressed('enter', ' ')) {
      this.open = false;
      return this.code;
    }
    return null;
  }

  private build(): PixelCanvas {
    if (this.frame) return this.frame;
    const look = lookFromCode(this.code, 'preview');
    // One frame is all the preview needs, but `framesForLooks` is the only
    // path that produces a character, and reaching past it into the private
    // pose builder would mean a second place that has to stay in step with
    // how a character is assembled.
    const front = framesForLooks([look]).find(
      (f) => f.dir === 'front' && f.pose === 'idle',
    );
    this.frame = front ? front.canvas : new PixelCanvas(16, 24);
    return this.frame;
  }

  draw(d: Draw): void {
    if (!this.open) return;

    // Fully opaque. At 0.92 the clock, the purse and the control hints all
    // read through it, and a screen you can see the game through does not
    // read as a screen.
    d.rect(0, 0, view.w, view.h, C.InkDeep, 1);

    const cx = Math.round(view.w / 2);
    d.textCentered('BIKIN KARAKTER', cx, 10, C.White, C.InkDeep);
    d.textCentered(
      'wasd/panah pilih  ·  r acak  ·  enter selesai',
      cx, 20, C.Mist, C.InkDeep, 0.8,
    );

    // --- the character, drawn pixel by pixel rather than from the atlas
    const canvas = this.build();
    const px = Math.round(view.w * 0.24) - (canvas.w * PREVIEW_SCALE) / 2;
    const py = 40;
    // A plinth, so the figure stands on something instead of floating in the
    // middle of a dim rectangle.
    d.rect(
      px - 6, py + canvas.h * PREVIEW_SCALE - 2,
      canvas.w * PREVIEW_SCALE + 12, 4, C.Slate, 0.5,
    );
    for (let y = 0; y < canvas.h; y++) {
      for (let x = 0; x < canvas.w; x++) {
        const v = canvas.get(x, y);
        if (v === 255) continue;
        d.rect(
          px + x * PREVIEW_SCALE, py + y * PREVIEW_SCALE,
          PREVIEW_SCALE, PREVIEW_SCALE, v,
        );
      }
    }

    // --- the rows
    const lx = Math.round(view.w * 0.45);
    const lw = view.w - lx - 12;
    let ly = 38;
    for (let i = 0; i < ROWS.length; i++) {
      const [key, label] = ROWS[i];
      const here = i === this.row;
      const count = OPTION_COUNT[key];
      const value = this.choices[key];

      if (here) d.rect(lx - 4, ly - 2, lw + 8, 11, C.Slate, 0.55);
      d.text(label, lx, ly, here ? C.White : C.Mist, here ? 1 : 0.75);

      // The value as a position rather than a name. "kulit 2/3" says nothing;
      // a row of pips says how much is left to look through, which is the only
      // thing a player actually wants to know here.
      const pipX = lx + lw - count * 5 - 14;
      for (let p = 0; p < count; p++) {
        // Unselected pips need to be visible, not merely present. At 0.6 alpha
        // over the dark backdrop only the lit one showed, so every row looked
        // like it had a single option.
        const on = p === value;
        d.rect(pipX + p * 5, ly + 1, 4, 5, on ? C.Lantern : C.SlateLt,
          on ? 1 : 0.85);
      }
      if (here) {
        // Arrows only on the active row: drawn on all nine they read as
        // decoration and stop meaning "this one moves".
        d.text('<', pipX - 8, ly, C.Lantern, 0.9);
        d.text('>', lx + lw - 10, ly, C.Lantern, 0.9);
      }
      ly += 12;
    }

    const code = `kode ${this.code.toString(36)}`;
    d.text(code, view.w - textWidth(code) - 8, view.h - 12, C.Slate, 0.8);
  }
}

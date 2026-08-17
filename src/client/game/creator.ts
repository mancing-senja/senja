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
import { MAX_NAME_LEN } from '../../shared/constants';
import {
  NAME_POOL, OPTION_COUNT, lookFromCode, packLook, randomCode, unpackLook,
  type Choices,
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
  ['lower', 'bawahan'],
];

const PREVIEW_SCALE = 5;

/** What the creator hands back on confirm. The name is separate from the
 *  packed code because it is a string, and stuffing it into an integer to keep
 *  one return value would be a worse trade than two fields. */
export interface Made {
  code: number;
  name: string;
}

export class Creator {
  open = false;
  private choices: Choices;
  private name_ = '';
  /** True while the name field has the keyboard. */
  private typing = false;
  private caret = 0;
  private row = 0;
  /** Cached preview frame, rebuilt only when a choice actually changes. */
  private frame: PixelCanvas | null = null;
  private turn = 0;

  constructor(code: number, name: string, private input: Input) {
    this.choices = unpackLook(code);
    this.name_ = clean(name) || NAME_POOL[0];

    // Typed names need the raw keys, which `Input` deliberately does not give
    // out — it reports a set of held keys, not a stream of characters. So the
    // field listens on `window` while it has focus, exactly as the chat box
    // does, and `input.capture` keeps the game's own bindings from firing at
    // the same time.
    window.addEventListener('keydown', (e) => {
      if (!this.open || !this.typing) return;
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
        this.stopTyping();
        e.preventDefault();
        return;
      }
      if (e.key === 'Backspace') {
        this.name_ = this.name_.slice(0, -1);
        e.preventDefault();
        return;
      }
      // One printable character at a time. Letters, digits, space and a few
      // marks people put in names; nothing that could confuse the renderer or
      // arrive at another player as a control code.
      if (e.key.length === 1 && /[A-Za-z0-9 ._-]/.test(e.key)
        && this.name_.length < MAX_NAME_LEN) {
        this.name_ += e.key;
      }
      e.preventDefault();
    });
  }

  get name(): string {
    return clean(this.name_) || NAME_POOL[0];
  }

  private startTyping(): void {
    this.typing = true;
    this.input.capture(true);
  }

  private stopTyping(): void {
    this.typing = false;
    this.input.capture(false);
  }

  get code(): number {
    return packLook(this.choices);
  }

  show(): void {
    this.open = true;
    this.row = 0;
    this.frame = null;
    this.stopTyping();
  }

  /** Returns the chosen code once, on the frame the player confirms. */
  update(dt: number, input: Input): Made | null {
    if (!this.open) return null;
    this.turn += dt;

    // Row 0 is the name; the appearance rows follow it. The name sits at the
    // top because it is the first thing anyone decides and the only choice
    // here that other players will actually read.
    // While the name field has focus every key is a character, so nothing
    // below this runs — otherwise typing "was" would walk the cursor through
    // three rows on the way.
    if (this.typing) {
      this.caret += dt;
      return null;
    }

    const total = ROWS.length + 1;
    if (input.pressed('arrowdown', 's')) this.row = (this.row + 1) % total;
    if (input.pressed('arrowup', 'w')) this.row = (this.row + total - 1) % total;

    const right = input.pressed('arrowright', 'd');
    const left = input.pressed('arrowleft', 'a');
    if (this.row === 0) {
      // Enter on the name row starts typing rather than confirming, so the
      // obvious key does the obvious thing when the cursor is on a text field.
      if (input.pressed('enter')) {
        this.startTyping();
        return null;
      }
      if (right || left) {
        // The arrows still cycle the suggestion pool, for anyone who would
        // rather pick than type.
        const at = NAME_POOL.indexOf(this.name);
        const step = right ? 1 : NAME_POOL.length - 1;
        this.name_ = NAME_POOL[((at < 0 ? 0 : at) + step) % NAME_POOL.length];
      }
    } else {
      const key = ROWS[this.row - 1][0];
      const count = OPTION_COUNT[key];
      if (right) {
        this.choices[key] = (this.choices[key] + 1) % count;
        this.frame = null;
      }
      if (left) {
        this.choices[key] = (this.choices[key] + count - 1) % count;
        this.frame = null;
      }
    }
    if (input.pressed('r')) {
      this.choices = unpackLook(randomCode());
      this.name_ = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
      this.frame = null;
    }
    if (input.pressed('enter', ' ')) {
      this.open = false;
      return { code: this.code, name: this.name };
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
      this.typing
        ? 'ketik nama  ·  enter/esc selesai ngetik'
        : 'wasd/panah pilih  ·  enter di nama buat ngetik  ·  r acak',
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
    let ly = 34;

    // Name first, and shown as the name rather than as pips: it is the one
    // choice on this screen that other players actually read.
    {
      const here = this.row === 0;
      if (here) d.rect(lx - 4, ly - 2, lw + 8, 11, C.Slate, 0.55);
      d.text('nama', lx, ly, here ? C.White : C.Mist, here ? 1 : 0.75);
      const blink = this.typing && (this.caret % 1) < 0.55 ? '_' : '';
      const n = (this.typing ? this.name_ : this.name) + blink;
      const nx = lx + lw - textWidth(n) - 10;
      if (this.typing) d.rect(nx - 3, ly - 2, textWidth(n) + 8, 11, C.Ink, 0.9);
      d.text(n, nx, ly, C.Lantern, here ? 1 : 0.8);
      if (here && !this.typing) {
        d.text('<', nx - 10, ly, C.Lantern, 0.9);
        d.text('>', lx + lw - 6, ly, C.Lantern, 0.9);
      }
      ly += 13;
    }

    for (let i = 0; i < ROWS.length; i++) {
      const [key, label] = ROWS[i];
      const here = i + 1 === this.row;
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
      ly += 11;
    }

    const code = `kode ${this.code.toString(36)}`;
    d.text(code, view.w - textWidth(code) - 8, view.h - 12, C.Slate, 0.8);
  }
}

/** Trims a typed name down to what the protocol and the renderer will take. */
function clean(s: string): string {
  return s.replace(/[^A-Za-z0-9 ._-]/g, '').trim().slice(0, MAX_NAME_LEN);
}

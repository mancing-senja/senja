/** Convenience layer over the sprite batch: named atlas frames, text, and
 *  solid rectangles, all sharing one texture and one batch. */

import { Blend, SpriteBatch } from '../engine/batch';
import { makeTextureFromCanvas, type GL } from '../engine/gl';
import type { Atlas, Frame } from '../art/atlas';
import { C, RGB_PALETTE } from '../art/palette';
import { GLYPH_H, LETTER_GAP, LINE_H, SPACE_W, glyph, textWidth } from '../art/font';

export interface SpriteOpts {
  tint?: [number, number, number];
  alpha?: number;
  flipX?: boolean;
  /** Mirrors vertically — how reflections are drawn. */
  flipY?: boolean;
  blend?: Blend;
  /** Ignores the sprite's own colours and fills with the tint. */
  flat?: boolean;
  /** Uniform scale; used for the catch card pop and for shadows. */
  scale?: number;
  /** Explicit destination size, overriding scale. Shadows stretch with it. */
  dw?: number;
  dh?: number;
  /** Sub-rectangle of the frame, in frame-local pixels. Used for the
   *  partial fills on progress bars. */
  clip?: { x: number; y: number; w: number; h: number };
}

export class Draw {
  readonly batch: SpriteBatch;
  private tex: WebGLTexture;
  private frames: Map<string, Frame>;
  private aw: number;
  private ah: number;
  /** Multiplied into every sprite drawn in world space. */
  ambient: [number, number, number] = [1, 1, 1];

  /** Points the normal-mapped key light at the sun.
   *
   *  The sun already moves across the sky for the sky shader and the cast
   *  shadows; this hands the same vector to the sprites so the whole world
   *  turns with it instead of holding one baked-in noon. Z is kept well
   *  positive so the light never rakes so flat that half of every sprite
   *  goes dark — this is a cozy game at dusk, not a horror one.
   *
   *  Pass 0 to switch it off, which is what the HUD does: a panel is a
   *  piece of paper on the screen, not an object in the world. */
  setSun(L: { sunX: number; sunY: number; sunColor: [number, number, number] }, amount: number): void {
    this.batch.setLight(
      -L.sunX, -Math.max(0.15, L.sunY), 0.85,
      L.sunColor[0], L.sunColor[1], L.sunColor[2], amount,
    );
  }

  /** Turns normal-mapped lighting off for the next flush. */
  setUnlit(): void {
    this.batch.setLight(0, 0, 1, 1, 1, 1, 0);
  }

  constructor(gl: GL, atlas: Atlas) {
    this.batch = new SpriteBatch(gl);
    this.tex = makeTextureFromCanvas(gl, atlas.canvas);
    this.batch.setNormalTexture(makeTextureFromCanvas(gl, atlas.normals));
    this.frames = atlas.frames;
    this.aw = atlas.w;
    this.ah = atlas.h;
  }

  frame(name: string): Frame | undefined {
    return this.frames.get(name);
  }

  has(name: string): boolean {
    return this.frames.has(name);
  }

  begin(camX: number, camY: number): void {
    this.batch.begin(camX, camY);
  }

  camera(camX: number, camY: number): void {
    this.batch.setCamera(camX, camY);
  }

  flush(): void {
    this.batch.flush();
  }

  /** Draws an atlas frame with its top-left at (x, y). */
  sprite(name: string, x: number, y: number, o: SpriteOpts = {}): void {
    const f = this.frames.get(name);
    if (!f) return;
    const clip = o.clip;
    const sx = f.x + (clip?.x ?? 0);
    const sy = f.y + (clip?.y ?? 0);
    const sw = clip?.w ?? f.w;
    const sh = clip?.h ?? f.h;
    const s = o.scale ?? 1;
    const tint = o.tint ?? this.ambient;
    this.batch.push(
      this.tex, this.aw, this.ah,
      sx, sy, sw, sh,
      Math.round(x), Math.round(y),
      Math.round(o.dw ?? sw * s), Math.round(o.dh ?? sh * s),
      tint[0], tint[1], tint[2], o.alpha ?? 1,
      o.blend ?? Blend.Alpha,
      o.flat ? 1 : 0,
      o.flipX ?? false,
      o.flipY ?? false,
    );
  }

  /** Frame drawn centred horizontally on x, with its bottom on y. */
  spriteFoot(name: string, x: number, y: number, o: SpriteOpts = {}): void {
    const f = this.frames.get(name);
    if (!f) return;
    const s = o.scale ?? 1;
    this.sprite(name, x - (f.w * s) / 2, y - f.h * s, o);
  }

  /** Mirrored, wobbling copy of a sprite in the water below it.
   *
   *  Drawn as a stack of thin horizontal slices, each shifted sideways by a
   *  travelling sine. One flipped quad would be a mirror; the per-slice
   *  shift is what makes it a reflection on moving water. */
  reflection(
    name: string, cx: number, waterY: number, time: number,
    alpha = 0.42, squash = 0.62, flipX = false,
  ): void {
    const f = this.frames.get(name);
    if (!f) return;
    const SLICE = 2;
    for (let r = 0; r < f.h; r += SLICE) {
      const k = Math.min(SLICE, f.h - r);
      // Depth below the waterline for this slice, in destination pixels.
      const depth = (f.h - r - k) * squash;
      const wobble = Math.sin(time * 1.8 - depth * 0.35 + cx * 0.06) * (0.6 + depth * 0.05);
      const fade = alpha * (1 - (depth / (f.h * squash)) * 0.55);
      if (fade <= 0.02) continue;
      this.sprite(name, cx - f.w / 2 + wobble, waterY + depth, {
        clip: { x: 0, y: r, w: f.w, h: k },
        flipY: true,
        flipX,
        alpha: fade,
        dw: f.w,
        dh: Math.max(1, Math.round(k * squash)),
        tint: [
          this.ambient[0] * 0.7 + 0.08,
          this.ambient[1] * 0.75 + 0.10,
          this.ambient[2] * 0.85 + 0.14,
        ],
      });
    }
  }

  /** Cast shadow on the ground: an ellipse stretched and leaned away from
   *  the sun. `sunY` near zero means a low sun and a long shadow. */
  castShadow(x: number, y: number, w: number, h: number, sunX: number, sunY: number, alpha: number): void {
    const lean = -sunX;
    const len = 1 + (1 - Math.min(1, Math.max(0, sunY))) * 2.6;
    const sw = Math.max(4, Math.round(w * (0.9 + Math.abs(lean) * len * 0.5)));
    const sh = Math.max(3, Math.round(h));
    this.sprite('shadowbig', x - sw / 2 + lean * len * w * 0.28, y - sh / 2, {
      tint: [0, 0, 0], flat: true, alpha, dw: sw, dh: sh,
    });
  }

  /** Solid rectangle in a palette colour. */
  rect(x: number, y: number, w: number, h: number, c: C | number, alpha = 1): void {
    const f = this.frames.get('dots');
    if (!f) return;
    const rgb = RGB_PALETTE[c];
    this.batch.push(
      this.tex, this.aw, this.ah,
      f.x + c, f.y, 1, 1,
      Math.round(x), Math.round(y), Math.round(w), Math.round(h),
      rgb.r / 255, rgb.g / 255, rgb.b / 255, alpha,
      Blend.Alpha, 0, false,
    );
  }

  /** Rectangle in an explicit colour, bypassing the palette. */
  rectRGB(x: number, y: number, w: number, h: number, r: number, g: number, b: number, alpha = 1): void {
    const f = this.frames.get('dots');
    if (!f) return;
    this.batch.push(
      this.tex, this.aw, this.ah,
      f.x + 31, f.y, 1, 1,
      Math.round(x), Math.round(y), Math.round(w), Math.round(h),
      r, g, b, alpha,
      Blend.Alpha, 1, false,
    );
  }

  /** A UI panel: drop shadow, fill, border, and a one-pixel highlight along
   *  the top edge. The bevel is what separates "a window" from "a grey
   *  rectangle somebody drew". */
  panel(x: number, y: number, w: number, h: number, alpha = 1, accent: C | number = C.Slate): void {
    this.rect(x + 2, y + 3, w, h, C.InkDeep, 0.35 * alpha);
    this.rect(x, y, w, h, C.Ink, 0.92 * alpha);
    this.rect(x + 1, y + 1, w - 2, 1, C.Slate, 0.5 * alpha);
    this.frameRect(x, y, w, h, accent, 0.75 * alpha);
    // Corner pips, so the border does not read as a plain box outline.
    this.rect(x, y, 1, 1, C.InkDeep, alpha);
    this.rect(x + w - 1, y, 1, 1, C.InkDeep, alpha);
    this.rect(x, y + h - 1, 1, 1, C.InkDeep, alpha);
    this.rect(x + w - 1, y + h - 1, 1, 1, C.InkDeep, alpha);
  }

  frameRect(x: number, y: number, w: number, h: number, c: C | number, alpha = 1): void {
    this.rect(x, y, w, 1, c, alpha);
    this.rect(x, y + h - 1, w, 1, c, alpha);
    this.rect(x, y, 1, h, c, alpha);
    this.rect(x + w - 1, y, 1, h, c, alpha);
  }

  /** Left-aligned text. Returns the advance width. */
  text(s: string, x: number, y: number, c: C | number, alpha = 1): number {
    const rgb = RGB_PALETTE[c];
    let cx = x;
    for (const ch of s) {
      if (ch === ' ') {
        cx += SPACE_W + LETTER_GAP;
        continue;
      }
      const f = this.frames.get(`g_${ch}`);
      const g = glyph(ch);
      if (!f || !g) {
        cx += SPACE_W + LETTER_GAP;
        continue;
      }
      this.batch.push(
        this.tex, this.aw, this.ah,
        f.x, f.y, f.w, GLYPH_H,
        Math.round(cx), Math.round(y), f.w, GLYPH_H,
        rgb.r / 255, rgb.g / 255, rgb.b / 255, alpha,
        Blend.Alpha, 1, false,
      );
      cx += g.w + LETTER_GAP;
    }
    return cx - x;
  }

  /** Text with a 1px drop shadow — the only reliable way to keep UI legible
   *  over a scene whose brightness changes all day. */
  textShadow(s: string, x: number, y: number, c: C | number, shadow: C | number, alpha = 1): number {
    this.text(s, x + 1, y + 1, shadow, alpha * 0.85);
    return this.text(s, x, y, c, alpha);
  }

  textCentered(s: string, cx: number, y: number, c: C | number, shadow?: C | number, alpha = 1): void {
    const w = textWidth(s);
    if (shadow !== undefined) this.textShadow(s, cx - w / 2, y, c, shadow, alpha);
    else this.text(s, cx - w / 2, y, c, alpha);
  }

  textLines(lines: string[], x: number, y: number, c: C | number, shadow?: C | number, alpha = 1): void {
    for (let i = 0; i < lines.length; i++) {
      if (shadow !== undefined) this.textShadow(lines[i], x, y + i * LINE_H, c, shadow, alpha);
      else this.text(lines[i], x, y + i * LINE_H, c, alpha);
    }
  }
}

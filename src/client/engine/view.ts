/** The live internal resolution.
 *
 *  A pixel game has two conflicting requirements: pixels must be square and
 *  whole (so the scale factor has to be an integer), and the game should
 *  fill whatever window it is given (which is never an exact multiple of a
 *  fixed buffer). Locking the buffer at 320x180 satisfies the first and
 *  fails the second — you get black bars on almost every real display.
 *
 *  So the buffer size is the thing that flexes. We pick the integer scale
 *  first, aiming for a buffer height near TARGET_H, then size the buffer to
 *  exactly cover the window at that scale. Wider screens see a little more
 *  world; nobody sees a stretched or shimmering pixel. */

/** Buffer height we aim for at zoom 1. Bigger number = more world on
 *  screen and smaller sprites. */
export const TARGET_H = 280;

/** Guard rails, so an ultrawide does not turn into a minimap and a tiny
 *  window does not turn into a keyhole. */
export const MIN_W = 300;
export const MAX_W = 760;
export const MIN_H = 170;
export const MAX_H = 440;

/** Player-facing zoom steps. Higher = bigger sprites, less world. */
export const ZOOM_STEPS = [0.7, 0.8, 0.9, 1.0, 1.15, 1.35, 1.6];
export const DEFAULT_ZOOM_INDEX = 3;

export const view = {
  /** Internal buffer size in game pixels. */
  w: 320,
  h: 180,
  /** Whole-number device pixels per game pixel. */
  scale: 3,
  dpr: 1,
};

export interface ViewFit {
  w: number;
  h: number;
  scale: number;
  /** CSS pixel size the canvas should be given. */
  cssW: number;
  cssH: number;
}

export function fitView(innerW: number, innerH: number, dpr: number, zoom = 1): ViewFit {
  const devW = Math.max(1, Math.round(innerW * dpr));
  const devH = Math.max(1, Math.round(innerH * dpr));

  const scale = Math.max(1, Math.round((devH * zoom) / TARGET_H));
  const w = clamp(Math.ceil(devW / scale), MIN_W, MAX_W);
  const h = clamp(Math.ceil(devH / scale), MIN_H, MAX_H);

  return {
    w,
    h,
    scale,
    cssW: (w * scale) / dpr,
    cssH: (h * scale) / dpr,
  };
}

export function applyView(fit: ViewFit, dpr: number): void {
  view.w = fit.w;
  view.h = fit.h;
  view.scale = fit.scale;
  view.dpr = dpr;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Hand-drawn art, dropped in from outside.
 *
 *  Everything else in this game is generated at boot and there are no image
 *  files in the repo. That is a real property worth keeping — it is why the
 *  whole thing is a 220 kB bundle and why nothing ever looks like an asset
 *  flip. But it has a hard ceiling: a face drawn by code is a face drawn by
 *  someone who cannot see it, and portraits are where that shows.
 *
 *  So portraits, and only portraits, can be overridden by a real drawing.
 *  Put a PNG in `public/art/portraits/`, list it in `index.json`, and the
 *  atlas uses it instead of the generated one. Miss a file and that
 *  character falls back to the generated portrait, so a half-finished set
 *  is a perfectly valid state to be in.
 *
 *  There are no requests at all unless `index.json` exists — the manifest
 *  is the switch. A game with no hand-drawn art boots exactly as it did
 *  before this file existed.
 *
 *  Drawings are quantised to the game's 48-colour palette on the way in.
 *  An off-palette portrait sitting in a strictly-palettised game reads as
 *  a screenshot pasted into a drawing, and the fix for a colour you need
 *  but do not have is to add it to the palette, not to exempt one sprite. */

import { RGB_PALETTE } from './palette';
import { PixelCanvas, TRANSPARENT } from './canvas';
import { PORTRAIT_H, PORTRAIT_W } from './portrait';

const DIR = 'art/portraits';

export interface Manifest {
  /** File names, relative to the portraits directory. */
  portraits?: string[];
}

/** Nearest palette entry, by squared distance in RGB.
 *
 *  Not perceptually ideal — Lab would be better — but the palette is small
 *  and widely spaced, and the failure mode of the cheap version is a colour
 *  landing one ramp step off, which nobody can see. */
function quantise(r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < RGB_PALETTE.length; i++) {
    const p = RGB_PALETTE[i];
    const dr = p.r - r;
    const dg = p.g - g;
    const db = p.b - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function toPixelCanvas(img: ImageBitmap): PixelCanvas {
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;

  const pc = new PixelCanvas(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      // Anything half transparent or more is treated as fully transparent.
      // Pixel art has no partial alpha, and letting it through would put a
      // soft halo around a sprite drawn against a hard-edged palette.
      pc.set(x, y, data[i + 3] < 128
        ? TRANSPARENT
        : quantise(data[i], data[i + 1], data[i + 2]));
    }
  }
  return pc;
}

/** File name to atlas key.
 *
 *  `petani.png`        → all three moods for that look
 *  `petani_warm.png`   → just the warm one
 *
 *  Names are the Look ids from character.ts, which is what makes a drawing
 *  land on the right villager. */
export function keysFor(file: string, lookIndex: (id: string) => number): string[] {
  const stem = file.replace(/\.png$/i, '');
  const [id, mood] = stem.split('_');
  const i = lookIndex(id);
  if (i < 0) return [];
  if (mood) return [`pt_${i}_${mood}`];
  return [`pt_${i}_neutral`, `pt_${i}_warm`, `pt_${i}_cold`];
}

export interface LoadResult {
  frames: Map<string, PixelCanvas>;
  /** Anything the artist should know about. Surfaced in the console rather
   *  than thrown: one bad file must not stop the game from booting. */
  problems: string[];
}

export async function loadHandDrawn(
  lookIndex: (id: string) => number,
): Promise<LoadResult> {
  const frames = new Map<string, PixelCanvas>();
  const problems: string[] = [];

  let manifest: Manifest;
  try {
    const res = await fetch(`${DIR}/index.json`, { cache: 'no-cache' });
    // A dev server answers unknown paths with index.html rather than a 404,
    // so "the manifest is missing" arrives as a 200 full of HTML. Checking
    // the content type makes that an expected case instead of something
    // that only works because JSON.parse happens to throw.
    if (!res.ok) return { frames, problems };
    if (!(res.headers.get('content-type') ?? '').includes('json')) {
      return { frames, problems };
    }
    manifest = (await res.json()) as Manifest;
  } catch {
    // No manifest, or it is not valid JSON. Either way there is no
    // hand-drawn art to load and the generated portraits stand.
    return { frames, problems };
  }

  const files = Array.isArray(manifest.portraits) ? manifest.portraits : [];
  await Promise.all(files.map(async (file) => {
    // The manifest is content the game did not write, so a name from it
    // never gets to walk out of its own directory.
    if (!/^[A-Za-z0-9_-]+\.png$/.test(file)) {
      problems.push(`${file}: nama file harus huruf/angka saja, .png`);
      return;
    }
    const keys = keysFor(file, lookIndex);
    if (keys.length === 0) {
      problems.push(`${file}: tidak ada karakter dengan id itu`);
      return;
    }
    try {
      const res = await fetch(`${DIR}/${file}`, { cache: 'no-cache' });
      if (!res.ok) {
        problems.push(`${file}: tidak ketemu (${res.status})`);
        return;
      }
      const img = await createImageBitmap(await res.blob());
      if (img.width !== PORTRAIT_W || img.height !== PORTRAIT_H) {
        problems.push(
          `${file}: ukurannya ${img.width}x${img.height}, harus ${PORTRAIT_W}x${PORTRAIT_H}`,
        );
        return;
      }
      const pc = toPixelCanvas(img);
      for (const k of keys) frames.set(k, pc);
    } catch (err) {
      problems.push(`${file}: gagal dibaca (${String(err)})`);
    }
  }));

  return { frames, problems };
}

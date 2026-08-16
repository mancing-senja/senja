/** Extra village crops.
 *
 * `CROP_LOOKS` is the registry the atlas reads when `buildAtlas()` runs.
 * Keeping the additions in a small module lets new crops reuse the existing
 * five-stage `makeCrop()` generator without duplicating sprite code. */

import { C } from './palette';
import { CROP_LOOKS, type CropArt } from './props';

export const EXTRA_CROP_LOOKS: Record<string, CropArt> = {
  cabai: { stem: C.GrassDk, fruit: C.Red, fruitHi: C.Lantern },
  kacangpanjang: { stem: C.Forest, fruit: C.Grass, fruitHi: C.GrassLt },
};

Object.assign(CROP_LOOKS, EXTRA_CROP_LOOKS);

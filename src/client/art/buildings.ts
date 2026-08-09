/** Buildings.
 *
 *  The previous houses were a box with a triangle on top, and the neon
 *  district had no buildings at all — only sign posts standing in a car
 *  park. Both were the weakest thing on screen.
 *
 *  What makes a pixel building read as architecture rather than as a shape:
 *
 *  - **Depth at every plane change.** Every place two surfaces meet gets a
 *    dark line and a light line. Eaves cast a shadow on the wall below;
 *    window reveals are darker on the inside than the frame.
 *  - **Enough value steps.** Three shades per material terraces. These use
 *    five, and reserve the lightest for edges only.
 *  - **Repetition with variation.** A window grid is what reads as a
 *    building; identical windows read as wallpaper. So every window rolls
 *    its own state — lit, dark, curtained, cracked.
 *  - **Clutter.** Real buildings have gutters, meter boxes, aircon units,
 *    cables, laundry, a stain under the drainpipe. The clutter is most of
 *    what sells the scale. */

import { BAYER4, PixelCanvas, Rng, TRANSPARENT, valueNoise } from './canvas';
import { C } from './palette';

// ================================================================ pastoral

export interface HouseSpec {
  w: number;
  h: number;
  wall: number;
  wallLit: number;
  wallDk: number;
  roof: number;
  roofLit: number;
  roofDk: number;
  /** Two storeys gets a second row of windows and a taller wall. */
  storeys: 1 | 2;
  /** Half-timbered adds dark beams across the render. */
  timber: boolean;
}

export const HOUSE_SPECS: HouseSpec[] = [
  { w: 62, h: 68, wall: C.Wood, wallLit: C.Amber, wallDk: C.WoodDk, roof: C.Rose, roofLit: C.Red, roofDk: C.Purple, storeys: 2, timber: false },
  { w: 54, h: 52, wall: C.WoodDk, wallLit: C.Wood, wallDk: C.WoodDp, roof: C.Forest, roofLit: C.GrassDk, roofDk: C.ForestDp, storeys: 1, timber: true },
  { w: 70, h: 72, wall: C.Pale, wallLit: C.White, wallDk: C.Mist, roof: C.Banner, roofLit: C.Red, roofDk: C.Dusk, storeys: 2, timber: true },
  { w: 48, h: 50, wall: C.Wood, wallLit: C.Amber, wallDk: C.WoodDk, roof: C.SlateLt, roofLit: C.Mist, roofDk: C.Slate, storeys: 1, timber: false },
  { w: 58, h: 62, wall: C.WoodDk, wallLit: C.Wood, wallDk: C.WoodDp, roof: C.Amber, roofLit: C.SunGlow, roofDk: C.Wood, storeys: 2, timber: false },
  { w: 66, h: 56, wall: C.Mist, wallLit: C.Pale, wallDk: C.Slate, roof: C.Orange, roofLit: C.Amber, roofDk: C.Red, storeys: 1, timber: true },
];

export function makeTownhouse(spec: HouseSpec, seed: number): PixelCanvas {
  const rng = new Rng(seed * 22093 + 7);
  const { w, h } = spec;
  const c = new PixelCanvas(w, h + 6);

  const roofH = Math.round(h * (spec.storeys === 2 ? 0.30 : 0.38));
  const wallTop = roofH;
  const groundY = h - 1;

  // ---------------------------------------------------------------- walls
  for (let y = wallTop; y <= groundY; y++) {
    for (let x = 4; x < w - 4; x++) {
      // Board courses with grain, lit from the left.
      const course = (y - wallTop) % 4;
      let col = course === 3 ? spec.wallDk : spec.wall;
      const n = valueNoise(x * 0.7, y * 0.35, seed * 3);
      if (n > 0.7 && course !== 3) col = spec.wallLit;
      if (n < 0.22) col = spec.wallDk;
      c.set(x, y, col);
    }
    // Corner posts, and the ambient occlusion that makes them corners.
    c.set(4, y, spec.wallDk);
    c.set(5, y, spec.wallLit);
    c.set(w - 5, y, spec.wallDk);
    c.set(w - 6, y, spec.wallDk);
  }

  // The wall is lit on its left third and falls off to the right.
  for (let y = wallTop; y <= groundY; y++) {
    for (let x = 4; x < 4 + Math.round(w * 0.22); x++) {
      const v = c.get(x, y);
      if (v === spec.wall) c.set(x, y, spec.wallLit);
      else if (v === spec.wallDk) c.set(x, y, spec.wall);
    }
    for (let x = w - 4 - Math.round(w * 0.18); x < w - 4; x++) {
      const v = c.get(x, y);
      if (v === spec.wallLit) c.set(x, y, spec.wall);
      else if (v === spec.wall) c.set(x, y, spec.wallDk);
    }
  }

  // Half timbering: dark beams framing panels of render.
  if (spec.timber) {
    const beam = C.WoodDp;
    for (const y of [wallTop + 2, Math.round((wallTop + groundY) / 2), groundY - 2]) {
      for (let x = 4; x < w - 4; x++) c.set(x, y, beam);
      for (let x = 4; x < w - 4; x++) c.set(x, y + 1, C.WoodDk);
    }
    for (let i = 0; i <= 3; i++) {
      const x = 6 + Math.round((i * (w - 14)) / 3);
      for (let y = wallTop + 2; y <= groundY - 2; y++) {
        c.set(x, y, beam);
        c.set(x + 1, y, C.WoodDk);
      }
    }
  }

  // ---------------------------------------------------------------- roof
  for (let y = 0; y <= roofH; y++) {
    const t = y / roofH;
    const half = Math.round(t * (w / 2 - 1)) + 3;
    for (let x = Math.round(w / 2 - half); x <= Math.round(w / 2 + half); x++) {
      // Shingle rows: three values, with a lit top edge per row.
      const row = Math.floor(y / 3);
      const stagger = (row % 2) * 2;
      const shingle = ((x + stagger) % 5 === 0);
      let col = row % 2 === 0 ? spec.roof : spec.roofDk;
      if (y % 3 === 0) col = spec.roofLit;
      if (shingle) col = spec.roofDk;
      // Falls off toward the right, same light as the walls.
      if (x > w * 0.66 && col === spec.roof) col = spec.roofDk;
      if (x < w * 0.3 && col === spec.roofDk) col = spec.roof;
      c.set(x, y, col);
    }
  }
  // Ridge cap and eaves board.
  for (let x = Math.round(w / 2 - 3); x <= Math.round(w / 2 + 3); x++) c.set(x, 0, spec.roofLit);
  for (let x = 2; x < w - 2; x++) {
    c.set(x, roofH, C.WoodDp);
    c.set(x, roofH + 1, C.WoodDk);
  }
  // Shadow the eaves throw onto the wall — the single strongest depth cue.
  for (let x = 4; x < w - 4; x++) {
    for (let k = 2; k <= 4; k++) {
      const y = roofH + k;
      const v = c.get(x, y);
      if (v === TRANSPARENT) continue;
      const shade = BAYER4[(y & 3) * 4 + (x & 3)] / 16;
      if (shade < 1 - (k - 1) * 0.3) c.set(x, y, spec.wallDk);
    }
  }

  // ---------------------------------------------------------------- windows
  const rows = spec.storeys === 2 ? 2 : 1;
  const perRow = w > 60 ? 3 : 2;
  for (let r = 0; r < rows; r++) {
    const wy = wallTop + 7 + r * Math.round((groundY - wallTop - 10) / rows);
    for (let i = 0; i < perRow; i++) {
      const wx = 9 + Math.round((i * (w - 26)) / Math.max(1, perRow - 1));
      window9(c, wx, wy, rng, spec);
    }
  }

  // ---------------------------------------------------------------- door
  const dw = 12;
  const dx = Math.round(w * rng.range(0.34, 0.58));
  const dy = groundY - 17;
  // Frame, reveal, then the door itself set back inside it.
  c.rect(dx - 1, dy - 1, dw + 2, 19, C.WoodDp);
  c.rect(dx, dy, dw, 18, C.WoodDk);
  c.rect(dx + 1, dy + 1, dw - 2, 16, C.Wood);
  for (let y = dy + 2; y < dy + 16; y += 3) c.hline(dx + 2, y, dw - 4, C.WoodDk);
  c.rect(dx + 2, dy + 2, 3, 6, C.WoodDp);       // upper panel shadow
  c.set(dx + dw - 3, dy + 9, C.Gold);            // handle
  c.hline(dx - 2, groundY - 1, dw + 4, C.Stone); // step
  c.hline(dx - 2, groundY, dw + 4, C.StoneDk);

  // ---------------------------------------------------------------- clutter
  // Foundation course.
  for (let x = 3; x < w - 3; x++) {
    c.set(x, groundY, C.StoneDk);
    c.set(x, groundY - 1, valueNoise(x * 0.8, 0, 5) > 0.5 ? C.Stone : C.StoneDk);
  }
  // Chimney with a cap.
  const cx = rng.chance(0.5) ? Math.round(w * 0.22) : Math.round(w * 0.72);
  const chH = Math.round(roofH * 0.8) + 6;
  c.rect(cx, 2, 8, chH, C.StoneDk);
  c.rect(cx + 1, 3, 6, chH - 1, C.Stone);
  c.vline(cx + 1, 3, chH - 1, C.StoneLt);
  for (let y = 5; y < chH; y += 3) c.hline(cx + 1, y, 6, C.StoneDk);
  c.hline(cx - 1, 1, 10, C.StoneLt);
  c.hline(cx - 1, 2, 10, C.StoneDk);

  // Drainpipe and the stain under it.
  const px = rng.chance(0.5) ? 6 : w - 8;
  for (let y = roofH + 2; y < groundY; y++) c.set(px, y, C.Slate);
  for (let y = roofH + 2; y < groundY; y += 6) c.set(px + 1, y, C.SlateLt);
  for (let y = groundY - 8; y < groundY; y++) {
    if (valueNoise(px, y * 0.6, 9) > 0.45) c.set(px + 1, y, spec.wallDk);
  }

  // A lamp or a hanging plant by the door.
  if (rng.chance(0.6)) {
    c.rect(dx - 5, dy + 2, 3, 4, C.WoodDp);
    c.rect(dx - 5, dy + 3, 3, 2, C.Lantern);
  } else {
    c.rect(dx + dw + 2, dy + 1, 5, 3, C.WoodDk);
    c.disc(dx + dw + 4, dy + 5, 3, 2.5, C.Forest);
    c.set(dx + dw + 3, dy + 4, C.Grass);
    c.set(dx + dw + 5, dy + 6, C.GrassDk);
  }

  // Moss where the wall meets the ground.
  for (let i = 0; i < rng.int(3, 8); i++) {
    c.set(rng.int(5, w - 6), groundY - rng.int(1, 3), C.Forest);
  }

  c.outline(C.InkDeep, false);
  return c;
}

/** A window with a frame, a sill, glass, and a state of its own. */
function window9(c: PixelCanvas, x: number, y: number, rng: Rng, spec: HouseSpec): void {
  const w = 11;
  const h = 12;
  // Reveal: the wall is thick, so the opening is darker than the frame.
  c.rect(x - 1, y - 1, w + 2, h + 2, C.WoodDp);
  c.rect(x, y, w, h, C.WoodDk);

  const lit = rng.chance(0.55);
  const glass = lit ? C.Lantern : C.Ink;
  c.rect(x + 1, y + 1, w - 2, h - 2, glass);

  if (lit) {
    // Warm falloff from the top-left of the pane, plus a curtain.
    c.rect(x + 1, y + 1, 4, 4, C.SunGlow);
    c.rect(x + 1, y + h - 4, w - 2, 3, C.Amber);
    if (rng.chance(0.4)) {
      c.rect(x + 1, y + 1, 3, h - 2, C.Rose);
      c.vline(x + 4, y + 1, h - 2, C.Red);
    }
  } else {
    // Dark glass still reflects the sky at the top.
    c.rect(x + 1, y + 1, w - 2, 3, C.Slate);
    c.rect(x + 1, y + 1, 3, 2, C.SlateLt);
  }

  // Muntins.
  c.vline(x + Math.floor(w / 2), y + 1, h - 2, C.WoodDk);
  c.hline(x + 1, y + Math.floor(h / 2), w - 2, C.WoodDk);

  // Sill, with its own shadow on the wall below.
  c.hline(x - 2, y + h, w + 4, C.Wood);
  c.hline(x - 2, y + h + 1, w + 4, C.WoodDp);
  for (let i = -2; i < w + 2; i++) {
    if (BAYER4[((y + h + 2) & 3) * 4 + ((x + i) & 3)] < 8) c.set(x + i, y + h + 2, spec.wallDk);
  }
  // Shutters, sometimes.
  if (rng.chance(0.35)) {
    for (const sx of [x - 3, x + w]) {
      c.rect(sx, y, 3, h, C.Forest);
      c.vline(sx + 1, y, h, C.GrassDk);
      for (let k = y + 1; k < y + h; k += 3) c.hline(sx, k, 3, C.ForestDp);
    }
  }
}

// ================================================================ cyberpunk

export interface BlockSpec {
  w: number;
  h: number;
  base: number;
  mid: number;
  lit: number;
  accent: number;
  /** Ground floor is a lit shopfront rather than more wall. */
  shopfront: boolean;
}

export const BLOCK_SPECS: BlockSpec[] = [
  { w: 68, h: 128, base: C.CyberVoid, mid: C.CyberSlate, lit: C.CyberSteel, accent: C.NeonCyan, shopfront: true },
  { w: 54, h: 96, base: C.CyberVoid, mid: C.CyberSlate, lit: C.CyberSteel, accent: C.NeonMagenta, shopfront: true },
  { w: 82, h: 150, base: C.Ink, mid: C.CyberSlate, lit: C.CyberSteel, accent: C.NeonMint, shopfront: false },
  { w: 46, h: 82, base: C.CyberVoid, mid: C.CyberSlate, lit: C.Slate, accent: C.NeonCyan, shopfront: true },
  { w: 74, h: 112, base: C.Ink, mid: C.CyberSteel, lit: C.Slate, accent: C.NeonMagenta, shopfront: false },
];

/** A city block: window grid, service clutter, roof gear, and one bright
 *  ground floor. Everything above the ground floor is deliberately dim —
 *  the district's colour comes from signs and from wet ground, not from
 *  the buildings themselves. */
export function makeCyberBlock(spec: BlockSpec, seed: number): PixelCanvas {
  const rng = new Rng(seed * 30011 + 13);
  const { w, h } = spec;
  const c = new PixelCanvas(w, h);

  const shopH = spec.shopfront ? 22 : 0;
  const bodyTop = 10;

  // ---------------------------------------------------------------- shell
  for (let y = bodyTop; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = valueNoise(x * 0.25, y * 0.18, seed);
      c.set(x, y, n > 0.68 ? spec.mid : n > 0.3 ? spec.base : C.InkDeep);
    }
  }
  // Vertical pilasters, so the facade has structure instead of noise.
  for (let x = 0; x < w; x += 9) {
    for (let y = bodyTop; y < h - shopH; y++) {
      c.set(x, y, spec.mid);
      c.set(x + 1, y, C.InkDeep);
    }
  }
  // Floor slabs.
  for (let y = bodyTop + 6; y < h - shopH; y += 13) {
    for (let x = 0; x < w; x++) {
      c.set(x, y, spec.lit);
      c.set(x, y + 1, C.InkDeep);
    }
  }
  // Lit left edge, dark right edge.
  for (let y = bodyTop; y < h; y++) {
    c.set(0, y, spec.lit);
    c.set(1, y, spec.mid);
    c.set(w - 1, y, C.InkDeep);
    c.set(w - 2, y, C.InkDeep);
  }

  // ---------------------------------------------------------------- windows
  const cols = Math.max(2, Math.floor((w - 8) / 9));
  const floors = Math.max(2, Math.floor((h - bodyTop - shopH - 8) / 13));
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < cols; i++) {
      const wx = 4 + i * 9;
      const wy = bodyTop + 9 + f * 13;
      if (wy + 8 > h - shopH) continue;

      const roll = rng.next();
      // Most windows are dark. A city where every light is on reads as a
      // Christmas tree; the dark ones are what make the lit ones mean
      // something.
      if (roll < 0.42) {
        c.rect(wx, wy, 6, 8, C.InkDeep);
        c.hline(wx, wy, 6, spec.base);
        c.rect(wx, wy, 6, 2, C.CyberSlate);
      } else if (roll < 0.72) {
        // Warm domestic light.
        c.rect(wx, wy, 6, 8, C.Amber);
        c.rect(wx, wy, 6, 3, C.Lantern);
        c.rect(wx + 1, wy + 4, 4, 2, C.Orange);
        if (rng.chance(0.35)) c.rect(wx + 1, wy + 2, 2, 4, C.WoodDp); // someone at the glass
      } else if (roll < 0.9) {
        // Screen light: cold, and one shade brighter at the top.
        c.rect(wx, wy, 6, 8, spec.accent === C.NeonMagenta ? C.Rose : C.WaterBr);
        c.rect(wx, wy, 6, 3, C.Foam);
      } else {
        // Broken or boarded.
        c.rect(wx, wy, 6, 8, C.InkDeep);
        for (let k = 0; k < 4; k++) c.set(wx + rng.int(0, 5), wy + rng.int(0, 7), spec.mid);
      }
      // Frame: dark on three sides, light on the sill.
      c.frame(wx - 1, wy - 1, 8, 10, C.InkDeep);
      c.hline(wx - 1, wy + 8, 8, spec.lit);
    }
  }

  // ---------------------------------------------------------------- ground
  if (spec.shopfront) {
    const y0 = h - shopH;
    c.rect(0, y0, w, shopH, C.InkDeep);
    // Glass frontage, lit from inside.
    c.rect(3, y0 + 5, w - 6, shopH - 9, C.CyberSlate);
    c.rect(4, y0 + 6, w - 8, shopH - 11, spec.accent === C.NeonCyan ? C.WaterSh : C.Purple);
    for (let x = 6; x < w - 6; x += 7) c.vline(x, y0 + 6, shopH - 11, C.InkDeep);
    // Shelves and stock inside.
    for (let k = 0; k < 3; k++) {
      const sy = y0 + 8 + k * 4;
      if (sy > y0 + shopH - 6) break;
      c.hline(5, sy, w - 10, C.CyberSteel);
      for (let x = 6; x < w - 7; x += 3) {
        c.set(x, sy - 1, rng.chance(0.5) ? C.NeonMint : C.Amber);
      }
    }
    // Awning, striped, with a lit lip.
    for (let x = 1; x < w - 1; x++) {
      const stripe = ((x / 4) | 0) % 2 === 0;
      c.set(x, y0 + 2, stripe ? spec.accent : C.InkDeep);
      c.set(x, y0 + 3, stripe ? C.InkDeep : spec.accent);
      c.set(x, y0 + 4, C.InkDeep);
    }
    c.hline(1, y0 + 1, w - 2, C.CyberSteel);
    // Door.
    const dx = Math.round(w * 0.62);
    c.rect(dx, y0 + 8, 9, shopH - 9, C.InkDeep);
    c.rect(dx + 1, y0 + 9, 7, shopH - 11, C.CyberSlate);
    c.vline(dx + 4, y0 + 9, shopH - 11, C.CyberSteel);
    // A vending machine outside, because they always are.
    if (rng.chance(0.6)) {
      c.rect(2, y0 + 9, 8, shopH - 10, C.CyberSlate);
      c.rect(3, y0 + 10, 6, shopH - 13, spec.accent);
      for (let k = 0; k < 3; k++) c.hline(3, y0 + 11 + k * 2, 6, C.InkDeep);
      c.rect(3, h - 4, 6, 2, C.CyberVoid);
    }
  }

  // ---------------------------------------------------------------- roof
  c.rect(0, bodyTop - 4, w, 4, spec.mid);
  c.hline(0, bodyTop - 4, w, spec.lit);
  c.hline(0, bodyTop - 1, w, C.InkDeep);
  // Parapet, water tank, aerials.
  for (let i = 0; i < rng.int(2, 5); i++) {
    const bx = rng.int(2, Math.max(3, w - 12));
    const bh = rng.int(4, 10);
    c.rect(bx, bodyTop - 4 - bh, 9, bh, spec.base);
    c.hline(bx, bodyTop - 4 - bh, 9, spec.mid);
    c.vline(bx, bodyTop - 4 - bh, bh, spec.lit);
  }
  for (let i = 0; i < rng.int(1, 4); i++) {
    const ax = rng.int(3, Math.max(4, w - 4));
    const ah = rng.int(6, 14);
    c.vline(ax, bodyTop - 4 - ah, ah, C.CyberSteel);
    if (rng.chance(0.5)) c.set(ax, bodyTop - 5 - ah, C.NeonMagenta);
  }

  // ---------------------------------------------------------------- service
  // Aircon units bolted to the facade.
  for (let i = 0; i < rng.int(2, 6); i++) {
    const ax = rng.int(3, Math.max(4, w - 9));
    const ay = bodyTop + 14 + rng.int(0, Math.max(1, h - shopH - bodyTop - 30));
    c.rect(ax, ay, 7, 5, C.CyberSlate);
    c.rect(ax + 1, ay + 1, 5, 3, C.CyberSteel);
    c.vline(ax + 3, ay + 1, 3, C.InkDeep);
    c.hline(ax, ay + 5, 7, C.InkDeep);
  }
  // Cables slung down the face.
  for (let i = 0; i < rng.int(1, 3); i++) {
    let cxp = rng.int(4, Math.max(5, w - 4));
    for (let y = bodyTop + 4; y < h - shopH; y++) {
      c.set(cxp, y, C.InkDeep);
      if (rng.chance(0.12)) cxp += rng.chance(0.5) ? 1 : -1;
      cxp = Math.max(1, Math.min(w - 2, cxp));
    }
  }
  // Laundry on a couple of the lower floors.
  if (rng.chance(0.5)) {
    const ly = bodyTop + 22 + rng.int(0, 20);
    for (let x = 4; x < w - 4; x++) c.set(x, ly, C.Slate);
    for (let i = 0; i < rng.int(2, 5); i++) {
      const lx = rng.int(5, Math.max(6, w - 8));
      const col = [C.Rose, C.Foam, C.SunGlow, C.Pale][rng.int(0, 3)];
      c.rect(lx, ly + 1, 3, rng.int(3, 6), col);
    }
  }
  // Grime running down from the sills.
  for (let x = 0; x < w; x++) {
    for (let y = bodyTop; y < h - shopH; y++) {
      if (valueNoise(x * 0.5, y * 0.12, seed * 7) > 0.82) {
        const v = c.get(x, y);
        if (v === spec.mid || v === spec.base) c.set(x, y, C.InkDeep);
      }
    }
  }

  c.outline(C.InkDeep, false);
  return c;
}

/** A rooftop water tank on legs, placed as its own prop so blocks can share
 *  a skyline without every one of them carrying the same silhouette. */
export function makeWaterTank(seed: number): PixelCanvas {
  const rng = new Rng(seed * 7639 + 3);
  const c = new PixelCanvas(22, 30);
  c.disc(11, 8, 9, 6, C.CyberSlate);
  c.rect(2, 8, 18, 12, C.CyberSlate);
  for (let y = 8; y < 20; y += 3) c.hline(2, y, 18, C.CyberSteel);
  c.vline(3, 8, 12, C.Slate);
  c.disc(11, 20, 9, 3, C.CyberVoid);
  for (const x of [4, 10, 16]) {
    c.vline(x, 20, 9, C.CyberSteel);
    c.set(x + 1, 24, C.InkDeep);
  }
  if (rng.chance(0.6)) c.set(11, 1, C.NeonMagenta);
  c.outline(C.InkDeep, false);
  return c;
}

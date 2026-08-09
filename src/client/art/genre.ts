/** Art generators for the genre districts.
 *
 *  Three rules carried through all of them, taken from how pixel art
 *  actually reads rather than from what looks good in isolation:
 *
 *  1. Every material gets a tight dark→mid→light ramp. Wide value jumps
 *     terrace; wide hue jumps turn to mud.
 *  2. Shadows shift cool, highlights shift warm. Stone shadow leans violet,
 *     torchlight leans orange — the same number of colours reads as more.
 *  3. Saturated colour is an *accent*. Neon lives on thin strokes and in
 *     the glow around them, never on a whole wall. A wall painted neon is
 *     the single fastest way to make cyberpunk pixel art look cheap. */

import { BAYER4, PixelCanvas, Rng, TRANSPARENT, valueNoise } from './canvas';
import { C } from './palette';

// ================================================================ medieval

/** Cobblestone road. Irregular stones with mortar between them; the
 *  irregularity is the whole texture. */
export function makeCobbleTile(seed: number): PixelCanvas {
  const rng = new Rng(seed * 9973 + 7);
  const c = new PixelCanvas(16, 16);
  c.fill(C.StoneShadow);

  // Scatter stone centres, then grow each one until it meets a neighbour.
  // Four big stones per tile, not seven small ones: at this scale more
  // centres stop reading as cobbles and start reading as gravel.
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < 4; i++) {
    pts.push([rng.range(0, 16), rng.range(0, 16), rng.range(0.85, 1.15)]);
  }
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let best = 1e9;
      let second = 1e9;
      let bi = 0;
      for (let i = 0; i < pts.length; i++) {
        const [px, py, w] = pts[i];
        // Wrap so the tile still tiles seamlessly against itself.
        const ddx = Math.min(Math.abs(x - px), 16 - Math.abs(x - px));
        const ddy = Math.min(Math.abs(y - py), 16 - Math.abs(y - py));
        const d = Math.hypot(ddx, ddy) / w;
        if (d < best) { second = best; best = d; bi = i; }
        else if (d < second) second = d;
      }
      // Near-equal distance to two centres means we are on a mortar seam.
      if (second - best < 1.4) continue;
      // Each stone takes one flat value with only a little grain, so the
      // shapes of the stones are what you see.
      const base = [C.StoneDk, C.Stone, C.StoneLt][bi % 3];
      const n = valueNoise(x * 0.35 + bi * 7, y * 0.35, 11);
      c.set(x, y, n > 0.72 ? C.StoneLt : n < 0.28 ? C.StoneDk : base);
    }
  }
  // Light catches the upper-left of each stone.
  for (let y = 15; y >= 0; y--) {
    for (let x = 15; x >= 0; x--) {
      if (c.get(x, y) === C.StoneShadow) continue;
      if (c.get(x - 1, y) === C.StoneShadow || c.get(x, y - 1) === C.StoneShadow) {
        c.set(x, y, C.StoneLt);
      }
    }
  }
  return c;
}

/** A block of fitted masonry, for keep walls. */
export function makeMasonryTile(seed: number): PixelCanvas {
  const rng = new Rng(seed * 4241 + 3);
  const c = new PixelCanvas(16, 16);
  c.fill(C.StoneDk);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    const offset = (row % 2) * 4;
    c.hline(0, y, 16, C.StoneShadow);
    for (let i = 0; i < 4; i++) {
      const x = (offset + i * 4) % 16;
      c.vline(x, y, 4, C.StoneShadow);
      // Face of the block, lit along the top-left.
      for (let by = y + 1; by < y + 4; by++) {
        for (let bx = x + 1; bx < x + 4; bx++) {
          const n = valueNoise(bx * 0.6, by * 0.6, seed * 3 + row);
          c.set(bx % 16, by, n > 0.66 ? C.Stone : C.StoneDk);
        }
      }
      c.set((x + 1) % 16, y + 1, C.StoneLt);
      c.set((x + 2) % 16, y + 1, C.Stone);
    }
  }
  for (let i = 0; i < rng.int(2, 5); i++) {
    // Moss in the joints, because a clean wall reads as new.
    c.set(rng.int(0, 15), rng.int(0, 15), C.Forest);
  }
  return c;
}

/** A ruined tower. Broken crown on purpose — a clean cylinder reads as a
 *  chess piece. */
export function makeTower(seed: number): PixelCanvas {
  const rng = new Rng(seed * 3313 + 11);
  const w = 34;
  const h = rng.int(58, 76);
  const c = new PixelCanvas(w, h);
  const cx = w / 2;
  const bodyTop = Math.round(h * 0.18);

  for (let y = bodyTop; y < h - 1; y++) {
    const t = (y - bodyTop) / (h - bodyTop);
    const half = Math.round(w * 0.34 + t * w * 0.05);
    for (let x = cx - half; x <= cx + half; x++) {
      const nx = (x - cx) / half;
      // Cylindrical shading: lit on the left, falling to shadow right.
      const lit = -nx * 0.75 + 0.35;
      const n = valueNoise(x * 0.55, y * 0.55, seed) - 0.5;
      const bayer = BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5;
      const v = lit + n * 0.5 + bayer * 0.34;
      c.set(x, y, v > 0.72 ? C.StonePale : v > 0.4 ? C.StoneLt : v > 0.05 ? C.Stone : C.StoneDk);
    }
    // Courses.
    if ((y - bodyTop) % 5 === 0) {
      for (let x = cx - half; x <= cx + half; x++) {
        if (c.get(x, y) !== TRANSPARENT) c.set(x, y, C.StoneShadow);
      }
    }
  }

  // Battlements, with a bite taken out of one side.
  const crownHalf = Math.round(w * 0.40);
  const gap = rng.int(0, 3);
  for (let i = 0; i < 5; i++) {
    if (i === gap) continue;
    const bx = Math.round(cx - crownHalf + i * (crownHalf * 2 / 5)) + 1;
    for (let y = bodyTop - 7; y < bodyTop; y++) {
      for (let x = bx; x < bx + 5; x++) {
        c.set(x, y, x < bx + 2 ? C.StoneLt : C.Stone);
      }
    }
  }
  for (let x = cx - crownHalf; x <= cx + crownHalf; x++) {
    c.set(x, bodyTop, C.StoneShadow);
    c.set(x, bodyTop - 1, C.StoneLt);
  }

  // Arrow slits.
  for (let k = 0; k < 3; k++) {
    const sy = bodyTop + 12 + k * 16;
    if (sy > h - 12) break;
    const sx = Math.round(cx + rng.range(-5, 5));
    for (let y = sy; y < sy + 7; y++) c.set(sx, y, C.InkDeep);
    c.set(sx - 1, sy, C.StoneShadow);
    c.set(sx + 1, sy, C.StoneShadow);
  }

  // Rubble at the base.
  for (let i = 0; i < rng.int(4, 9); i++) {
    const rx = Math.round(cx + rng.range(-w * 0.5, w * 0.5));
    const ry = h - 1 - rng.int(0, 3);
    c.set(rx, ry, C.Stone);
    c.set(rx + 1, ry, C.StoneDk);
  }

  c.outline(C.InkDeep, false);
  return c;
}

/** Curtain wall segment with a walkway on top. */
export function makeWallSegment(seed: number): PixelCanvas {
  const rng = new Rng(seed * 6151 + 5);
  const w = 32;
  const h = 40;
  const c = new PixelCanvas(w, h);
  for (let y = 8; y < h - 2; y++) {
    for (let x = 0; x < w; x++) {
      const row = ((y - 8) / 4) | 0;
      const seam = (y - 8) % 4 === 0 || (x + row * 3) % 7 === 0;
      const n = valueNoise(x * 0.5, y * 0.5, seed);
      c.set(x, y, seam ? C.StoneShadow : n > 0.6 ? C.StoneLt : n > 0.32 ? C.Stone : C.StoneDk);
    }
  }
  // Battlements.
  for (let i = 0; i < 4; i++) {
    const bx = i * 8 + 1;
    for (let y = 0; y < 8; y++) {
      for (let x = bx; x < bx + 5; x++) c.set(x, y, x < bx + 2 ? C.StoneLt : C.Stone);
    }
  }
  c.hline(0, 8, w, C.StonePale);
  c.hline(0, 9, w, C.StoneShadow);
  // Damage.
  if (rng.chance(0.5)) {
    const dx = rng.int(4, w - 10);
    c.disc(dx, rng.range(14, 26), rng.range(3, 6), rng.range(3, 5), TRANSPARENT);
  }
  for (let i = 0; i < rng.int(3, 8); i++) c.set(rng.int(0, w - 1), rng.int(10, h - 3), C.Forest);
  c.outline(C.InkDeep, false);
  return c;
}

/** Hanging banner. The cloth is the one place saturated colour belongs. */
export function makeBanner(seed: number): PixelCanvas {
  const rng = new Rng(seed * 7717 + 19);
  const w = 14;
  const h = 30;
  const c = new PixelCanvas(w, h);
  const cloth = rng.chance(0.5) ? C.Banner : C.BannerBlue;
  const dark = cloth === C.Banner ? C.Dusk : C.WaterDp;

  // Crossbar.
  c.rect(1, 0, w - 2, 2, C.WoodDk);
  c.hline(1, 0, w - 2, C.Wood);

  // Cloth with a swallowtail bottom and a soft fold down the middle.
  for (let y = 2; y < h - 5; y++) {
    for (let x = 3; x < w - 3; x++) {
      const fold = Math.sin((x - 3) / (w - 6) * Math.PI * 2 + y * 0.06);
      c.set(x, y, fold > 0.45 ? dark : fold < -0.5 ? C.White : cloth);
    }
  }
  for (let i = 0; i < 5; i++) {
    for (let x = 3; x < w - 3; x++) {
      const mid = Math.abs(x - w / 2 + 0.5);
      if (mid < i + 0.5) c.set(x, h - 6 + i, TRANSPARENT);
    }
  }
  // A gold device on the cloth.
  c.set(w >> 1, 8, C.Gold);
  c.set((w >> 1) - 1, 9, C.Gold);
  c.set((w >> 1) + 1, 9, C.Gold);
  c.set(w >> 1, 10, C.Gold);
  c.outline(C.InkDeep, false);
  return c;
}

/** Wall torch. The flame is drawn small; the light it throws is a separate
 *  additive sprite, which is what makes it feel like a light source. */
export function makeTorch(): PixelCanvas {
  const c = new PixelCanvas(8, 18);
  c.rect(3, 6, 2, 12, C.WoodDk);
  c.vline(3, 6, 12, C.Wood);
  c.rect(2, 4, 4, 3, C.Stone);
  c.hline(2, 4, 4, C.StoneLt);
  // Flame: warm core, cooler edge.
  c.disc(4, 2, 1.8, 2.4, C.Orange);
  c.disc(4, 2, 1.0, 1.6, C.Lantern);
  c.set(4, 1, C.White);
  c.set(4, 0, C.Fire);
  c.outline(C.InkDeep, false);
  return c;
}

// ================================================================ cyberpunk

/** Wet concrete slab. Very dark and cool so the neon has something to sit
 *  against; the puddles are where the signs get to reflect. */
export function makeConcreteTile(seed: number): PixelCanvas {
  const rng = new Rng(seed * 5051 + 13);
  const c = new PixelCanvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // Slate-dominant rather than void-dominant: the ground has to be
      // readable as a surface, or the neon has nothing to sit on.
      const n = valueNoise((x + seed * 16) * 0.32, (y + seed * 16) * 0.32, 53);
      c.set(x, y, n > 0.62 ? C.CyberSteel : n > 0.26 ? C.CyberSlate : C.CyberVoid);
    }
  }
  // Panel seams on a grid, with the odd stain.
  c.hline(0, 0, 16, C.CyberVoid);
  c.vline(0, 0, 16, C.CyberVoid);
  c.hline(0, 1, 16, C.CyberSteel);
  for (let i = 0; i < rng.int(1, 4); i++) {
    const px = rng.int(2, 12);
    const py = rng.int(2, 12);
    c.disc(px, py, rng.range(1.5, 3), rng.range(1, 2), C.CyberVoid);
  }
  // A puddle that catches a little sign light.
  if (rng.chance(0.4)) {
    const px = rng.int(3, 11);
    const py = rng.int(3, 11);
    c.ditherDisc(px, py, rng.range(2, 4), rng.range(1.5, 2.5), C.CyberSlate, C.CyberSteel, 0.6);
    c.set(px, py, rng.chance(0.5) ? C.NeonCyan : C.NeonMagenta);
  }
  return c;
}

/** Metal grating, for the quay edge. */
export function makeGrateTile(): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  c.fill(C.CyberVoid);
  for (let y = 0; y < 16; y += 4) {
    c.hline(0, y, 16, C.CyberSteel);
    c.hline(0, y + 1, 16, C.CyberSlate);
  }
  for (let x = 0; x < 16; x += 8) c.vline(x, 0, 16, C.CyberSteel);
  return c;
}

export interface SignSpec {
  w: number;
  h: number;
  colour: number;
}

/** A neon sign: a dark housing with a thin glowing tube bent into a shape.
 *  The tube is one pixel wide with a lighter core — that reads as glass
 *  full of light rather than as a painted stripe. */
export function makeNeonSign(seed: number, spec: SignSpec): PixelCanvas {
  const rng = new Rng(seed * 8191 + 23);
  const { w, h, colour } = spec;
  const c = new PixelCanvas(w, h + 10);

  // Housing and bracket.
  c.rect(0, 0, w, h, C.CyberVoid);
  c.frame(0, 0, w, h, C.CyberSlate);
  c.rect(w / 2 - 1, h, 2, 10, C.CyberSlate);

  const glyph = rng.int(0, 3);
  const pad = 3;
  const drawTube = (x: number, y: number) => {
    c.set(x, y, colour);
  };

  switch (glyph) {
    case 0: // a bar and a slash
      for (let x = pad; x < w - pad; x++) drawTube(x, pad + 1);
      for (let i = 0; i < h - pad * 2 - 2; i++) drawTube(pad + 2 + i, pad + 2 + i);
      break;
    case 1: // a ring
      for (let a = 0; a < 48; a++) {
        const ang = (a / 48) * Math.PI * 2;
        drawTube(
          Math.round(w / 2 + Math.cos(ang) * (w / 2 - pad - 1)),
          Math.round(h / 2 + Math.sin(ang) * (h / 2 - pad - 1)),
        );
      }
      break;
    case 2: // stacked bars, like text
      for (let r = 0; r < 3; r++) {
        const y = pad + 1 + r * Math.floor((h - pad * 2) / 3);
        const len = rng.int(Math.floor((w - pad * 2) * 0.4), w - pad * 2);
        for (let x = pad; x < pad + len; x++) drawTube(x, y);
      }
      break;
    default: { // a zigzag
      let y = pad + 1;
      let dir = 1;
      for (let x = pad; x < w - pad; x++) {
        drawTube(x, y);
        y += dir;
        if (y >= h - pad - 1 || y <= pad + 1) dir = -dir;
      }
      break;
    }
  }

  // Bloom: one dim ring around every lit pixel, in the same hue. This is
  // the difference between "glowing" and "brightly coloured".
  const src = c.px.slice();
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (src[y * c.w + x] !== colour) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= c.w || ny >= c.h) continue;
        if (src[ny * c.w + nx] === colour) continue;
        c.set(nx, ny, C.White);
      }
    }
  }
  // Knock the halo back down to a tinted grey so it does not read as snow.
  c.replace(C.White, colour === C.NeonCyan ? C.WaterBr : colour === C.NeonMagenta ? C.Rose : C.Foam);
  return c;
}

/** Outfall pipe spilling warm water into the lake. */
export function makePipe(): PixelCanvas {
  const c = new PixelCanvas(22, 20);
  c.rect(0, 2, 18, 10, C.CyberSlate);
  c.hline(0, 2, 18, C.CyberSteel);
  c.hline(0, 11, 18, C.CyberVoid);
  // Flange rings.
  for (const x of [5, 11]) {
    c.vline(x, 1, 12, C.CyberSteel);
    c.vline(x + 1, 1, 12, C.CyberVoid);
  }
  // Mouth.
  c.rect(17, 1, 4, 12, C.CyberVoid);
  c.vline(17, 1, 12, C.CyberSteel);
  // A little rust, so it is not showroom-new.
  c.set(3, 9, C.Orange);
  c.set(9, 10, C.Wood);
  c.outline(C.InkDeep, false);
  return c;
}

/** Antenna mast with a blinking lamp at the top. */
export function makeAntenna(seed: number): PixelCanvas {
  const rng = new Rng(seed * 2029 + 7);
  const w = 18;
  const h = rng.int(48, 70);
  const c = new PixelCanvas(w, h);
  const cx = w >> 1;
  // Lattice mast.
  for (let y = 4; y < h; y++) {
    const t = (y - 4) / (h - 4);
    const half = Math.round(1 + t * 4);
    c.set(cx - half, y, C.CyberSteel);
    c.set(cx + half, y, C.CyberSlate);
    if (y % 4 === 0) {
      for (let x = cx - half; x <= cx + half; x++) c.set(x, y, C.CyberSlate);
    }
    if (y % 8 === 0) {
      for (let i = 0; i <= half * 2; i++) c.set(cx - half + i, y - (i >> 1), C.CyberVoid);
    }
  }
  // Dish or crossarm.
  if (rng.chance(0.5)) {
    c.disc(cx + 4, 12, 4, 3.2, C.CyberSlate);
    c.disc(cx + 4, 12, 2.6, 2, C.CyberSteel);
  } else {
    c.hline(cx - 6, 10, 13, C.CyberSteel);
    c.hline(cx - 4, 14, 9, C.CyberSteel);
  }
  // Warning lamp.
  c.set(cx, 2, C.NeonMagenta);
  c.set(cx, 1, C.Rose);
  c.outline(C.InkDeep, false);
  return c;
}

/** Chain-link fence panel. */
export function makeChainFence(): PixelCanvas {
  const c = new PixelCanvas(16, 22);
  c.rect(0, 0, 2, 22, C.CyberSlate);
  c.rect(14, 0, 2, 22, C.CyberSlate);
  c.hline(0, 0, 16, C.CyberSteel);
  for (let y = 2; y < 21; y++) {
    for (let x = 2; x < 14; x++) {
      if ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0) c.set(x, y, C.CyberSteel);
    }
  }
  return c;
}

// ================================================================ fantasy

/** Glowing mushroom cluster. The cap colour is violet; the light it gives
 *  off is mint, because a light and the thing emitting it are rarely the
 *  same colour. */
export function makeGlowMushroom(seed: number): PixelCanvas {
  const rng = new Rng(seed * 1543 + 31);
  const w = 18;
  const h = 22;
  const c = new PixelCanvas(w, h);
  const count = rng.int(2, 4);
  for (let i = 0; i < count; i++) {
    const cx = rng.range(4, w - 4);
    const base = h - 1 - rng.int(0, 3);
    const stalk = rng.int(5, 10);
    const capR = rng.range(2.5, 4.5);

    for (let y = base; y > base - stalk; y--) {
      c.set(Math.round(cx), y, C.Pale);
      c.set(Math.round(cx) - 1, y, C.Mist);
    }
    const capY = base - stalk;
    c.disc(cx, capY, capR, capR * 0.72, C.Arcane);
    c.ditherDisc(cx - 0.8, capY - 0.6, capR * 0.7, capR * 0.5, C.Arcane, C.ArcaneLt, 0.75);
    // Spots that hold the light.
    for (let k = 0; k < rng.int(1, 4); k++) {
      c.set(Math.round(cx + rng.range(-capR, capR)), Math.round(capY + rng.range(-1, 1)), C.NeonMint);
    }
    // Underside glow.
    for (let x = Math.round(cx - capR); x <= Math.round(cx + capR); x++) {
      c.set(x, Math.round(capY + capR * 0.72), C.NeonMint);
    }
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** Crystal shard cluster. Flat facets, hard value steps — crystals read by
 *  their edges, so soft shading kills them. */
export function makeCrystal(seed: number): PixelCanvas {
  const rng = new Rng(seed * 6301 + 17);
  const w = 20;
  const h = 28;
  const c = new PixelCanvas(w, h);
  const shards = rng.int(2, 4);
  for (let i = 0; i < shards; i++) {
    const bx = rng.range(4, w - 4);
    const by = h - 2 - rng.int(0, 3);
    const tall = rng.int(9, 20);
    const half = rng.range(1.6, 3.4);
    const lean = rng.range(-2.5, 2.5);
    for (let k = 0; k < tall; k++) {
      const t = k / tall;
      const y = Math.round(by - k);
      const x = bx + lean * t;
      const hw = Math.max(0, half * (1 - t * 0.85));
      for (let dx = -Math.round(hw); dx <= Math.round(hw); dx++) {
        // Two facets: the left face catches light, the right sits in shade.
        const face = dx < 0 ? C.ArcaneLt : dx === 0 ? C.Arcane : C.Purple;
        c.set(Math.round(x + dx), y, face);
      }
      if (t > 0.7) c.set(Math.round(x), y, C.White);
    }
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** A standing rune stone. */
export function makeRuneStone(seed: number): PixelCanvas {
  const rng = new Rng(seed * 3697 + 13);
  const w = 18;
  const h = 30;
  const c = new PixelCanvas(w, h);
  for (let y = 4; y < h - 1; y++) {
    const t = (y - 4) / (h - 5);
    const half = Math.round(4 + t * 3);
    for (let x = w / 2 - half; x <= w / 2 + half; x++) {
      const nx = (x - w / 2) / half;
      const n = valueNoise(x * 0.6, y * 0.6, seed) - 0.5;
      const v = -nx * 0.6 + 0.3 + n * 0.5;
      c.set(x, y, v > 0.6 ? C.StoneLt : v > 0.2 ? C.Stone : C.StoneDk);
    }
  }
  // Carved runes, glowing faintly.
  for (let i = 0; i < rng.int(2, 4); i++) {
    const ry = 9 + i * 6;
    const rw = rng.int(3, 6);
    const rx = Math.round(w / 2 - rw / 2);
    for (let x = rx; x < rx + rw; x++) c.set(x, ry, C.Arcane);
    c.set(rx + (rw >> 1), ry + 1, C.ArcaneLt);
    c.set(rx + (rw >> 1), ry - 1, C.Arcane);
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** A tree whose leaves hold light. Same silhouette logic as the ordinary
 *  trees so the grove still feels like the same forest, one valley over. */
export function makeSpiritTree(seed: number): PixelCanvas {
  const rng = new Rng(seed * 8467 + 5);
  const w = 40;
  const h = 56;
  const c = new PixelCanvas(w, h);
  const cx = w / 2;
  const trunkTop = Math.round(h * 0.60);

  for (let y = trunkTop; y < h - 1; y++) {
    const t = (y - trunkTop) / (h - 1 - trunkTop);
    const half = Math.max(2, Math.round(2.5 + t * 3));
    for (let x = cx - half; x <= cx + half; x++) {
      const nx = (x - cx) / half;
      c.set(x, y, nx < -0.3 ? C.Mist : nx > 0.4 ? C.Slate : C.SlateLt);
    }
    if (y % 6 === 0) {
      for (let x = cx - half; x <= cx + half; x++) c.set(x, y, C.Arcane);
    }
  }

  const canopyCy = trunkTop - h * 0.26;
  const clumps: Array<{ x: number; y: number; rx: number; ry: number }> = [];
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = i === 0 ? 0 : rng.range(0.5, 1.05);
    clumps.push({
      x: cx + Math.cos(a) * w * 0.30 * d,
      y: canopyCy + Math.sin(a) * h * 0.14 * d,
      rx: rng.range(w * 0.20, w * 0.30),
      ry: rng.range(h * 0.11, h * 0.17),
    });
  }
  for (const b of clumps) c.disc(b.x, b.y, b.rx, b.ry, C.Arcane);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (c.get(x, y) !== C.Arcane) continue;
      if (y >= trunkTop) continue;
      const n2 = valueNoise(x * 0.5, y * 0.5, seed);
      const bayer = BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5;
      const v = n2 + bayer * 0.4 + ((canopyCy - y) / (h * 0.5)) * 0.3;
      c.set(x, y, v > 0.92 ? C.NeonMint : v > 0.66 ? C.ArcaneLt : v > 0.34 ? C.Arcane : C.Purple);
    }
  }
  // Motes hanging under the canopy.
  for (let i = 0; i < rng.int(3, 7); i++) {
    const mx = Math.round(cx + rng.range(-w * 0.35, w * 0.35));
    const my = Math.round(canopyCy + rng.range(h * 0.08, h * 0.22));
    c.setUnder(mx, my, C.NeonMint);
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** Ground for the grove: dark loam with luminous threads running through
 *  it, as if the light were coming up out of the soil. */
export function makeGroveTile(seed: number): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = valueNoise((x + seed * 16) * 0.22, (y + seed * 16) * 0.22, 67);
      c.set(x, y, n > 0.62 ? C.Forest : n > 0.34 ? C.ForestDp : C.Ink);
    }
  }
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = valueNoise((x + seed * 16) * 0.5, (y + seed * 16) * 0.5, 89);
      if (v > 0.86) c.set(x, y, C.Arcane);
      else if (v > 0.83) c.set(x, y, C.Purple);
    }
  }
  return c;
}

// ================================================================ lore

/** The four things in the world that carry writing. Each is small, waist
 *  height, and lit slightly brighter than its surroundings — a player has
 *  to notice it from across a courtyard without it shouting. */

/** A bronze plaque on a short stone plinth. */
export function makePlaque(seed: number): PixelCanvas {
  const rng = new Rng(seed * 4517 + 9);
  const c = new PixelCanvas(18, 22);
  // Plinth.
  c.rect(3, 13, 12, 9, C.StoneDk);
  c.rect(4, 14, 10, 7, C.Stone);
  c.hline(3, 13, 12, C.StoneLt);
  // Plate, tilted back so the top edge catches light.
  c.rect(1, 4, 16, 10, C.WoodDp);
  c.rect(2, 5, 14, 8, C.Gold);
  c.hline(2, 5, 14, C.SunGlow);
  c.hline(2, 12, 14, C.Wood);
  // Engraved lines, unreadable at this size — which is the point.
  for (let y = 7; y < 12; y += 2) {
    const len = rng.int(7, 11);
    for (let x = 4; x < 4 + len; x++) c.set(x, y, C.WoodDp);
  }
  // Verdigris in the corners.
  for (let i = 0; i < rng.int(2, 5); i++) c.set(rng.int(2, 15), rng.int(5, 12), C.Forest);
  c.outline(C.InkDeep, false);
  return c;
}

/** A wall terminal with a live screen. */
export function makeTerminal(seed: number): PixelCanvas {
  const rng = new Rng(seed * 8837 + 21);
  const c = new PixelCanvas(18, 26);
  // Post.
  c.rect(7, 16, 4, 10, C.CyberSlate);
  c.vline(7, 16, 10, C.CyberSteel);
  // Housing.
  c.rect(1, 2, 16, 15, C.CyberVoid);
  c.frame(1, 2, 16, 15, C.CyberSlate);
  c.hline(1, 2, 16, C.CyberSteel);
  // Screen: dark with scanlines and a few lit rows of "text".
  c.rect(3, 4, 12, 11, C.Ink);
  for (let y = 5; y < 14; y += 2) {
    const len = rng.int(3, 10);
    for (let x = 4; x < 4 + len; x++) c.set(x, y, C.NeonMint);
  }
  for (let y = 4; y < 15; y += 3) c.hline(3, y, 12, C.CyberSlate);
  // Bezel highlight and a status lamp.
  c.set(15, 15, C.NeonMagenta);
  c.set(2, 3, C.CyberSteel);
  c.outline(C.InkDeep, false);
  return c;
}

/** A carved tablet, older than the language on it. */
export function makeTablet(seed: number): PixelCanvas {
  const rng = new Rng(seed * 2311 + 5);
  const c = new PixelCanvas(16, 24);
  for (let y = 3; y < 24; y++) {
    const t = (y - 3) / 20;
    const half = Math.round(4 + t * 2.5);
    for (let x = 8 - half; x <= 8 + half; x++) {
      const nx = (x - 8) / half;
      const n = valueNoise(x * 0.7, y * 0.7, seed) - 0.5;
      const v = -nx * 0.6 + 0.3 + n * 0.6;
      c.set(x, y, v > 0.62 ? C.StonePale : v > 0.25 ? C.StoneLt : v > -0.1 ? C.Stone : C.StoneDk);
    }
  }
  // Glyphs, glowing faintly — the grove keeps its writing lit.
  for (let i = 0; i < rng.int(3, 5); i++) {
    const gy = 7 + i * 4;
    const gw = rng.int(3, 6);
    const gx = 8 - (gw >> 1);
    for (let x = gx; x < gx + gw; x++) c.set(x, gy, C.Arcane);
    c.set(gx + (gw >> 1), gy + 1, C.ArcaneLt);
  }
  // A chip out of one corner.
  if (rng.chance(0.6)) c.disc(rng.chance(0.5) ? 3 : 13, rng.range(5, 12), 2, 2.4, TRANSPARENT);
  c.outline(C.InkDeep, false);
  return c;
}

/** A wooden signpost with a nailed notice. */
export function makeNotice(seed: number): PixelCanvas {
  const rng = new Rng(seed * 6473 + 11);
  const c = new PixelCanvas(18, 26);
  c.rect(8, 10, 3, 16, C.WoodDk);
  c.vline(8, 10, 16, C.Wood);
  // Board, slightly crooked.
  const tilt = rng.chance(0.5) ? 0 : 1;
  c.rect(1, 2 + tilt, 16, 11, C.WoodDp);
  c.rect(2, 3 + tilt, 14, 9, C.Wood);
  c.hline(2, 3 + tilt, 14, C.Amber);
  for (let y = 5 + tilt; y < 11 + tilt; y += 2) {
    const len = rng.int(6, 12);
    for (let x = 3; x < 3 + len; x++) c.set(x, y, C.WoodDp);
  }
  // Nails.
  c.set(3, 4 + tilt, C.Slate);
  c.set(14, 4 + tilt, C.Slate);
  c.outline(C.InkDeep, false);
  return c;
}

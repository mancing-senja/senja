/** The buildings inside the keep.
 *
 *  The yard was a flat expanse of cobble with a wall around it, which read
 *  as a car park with battlements. What a fortress actually is, visually,
 *  is a *stack* of masses at different heights: wall, gatehouse, hall,
 *  tower. These are the two missing middle pieces.
 *
 *  Same stone language as the walls and towers throughout — ashlar courses,
 *  violet-leaning shadow, moss on the shaded side — so the hall reads as
 *  part of the fortress rather than as a cottage that wandered in. */

import { BAYER4, PixelCanvas, Rng, TRANSPARENT, valueNoise } from './canvas';
import { C } from './palette';

/** The great hall: the mass that fills the middle of the yard. */
export function makeKeepHall(seed: number): PixelCanvas {
  const rng = new Rng(seed * 5303 + 17);
  const w = 78;
  const h = 76;
  const c = new PixelCanvas(w, h);
  const roofH = 26;
  const groundY = h - 1;

  // --- walls: fitted ashlar, lit from the left
  for (let y = roofH; y <= groundY; y++) {
    for (let x = 5; x < w - 5; x++) {
      const row = ((y - roofH) / 5) | 0;
      const seam = (y - roofH) % 5 === 0 || (x + row * 3) % 9 === 0;
      const n = valueNoise(x * 0.4, y * 0.4, seed);
      let col = seam ? C.StoneShadow : n > 0.62 ? C.StoneLt : n > 0.3 ? C.Stone : C.StoneDk;
      if (x < w * 0.28 && col === C.Stone) col = C.StoneLt;
      if (x > w * 0.74 && col === C.StoneLt) col = C.Stone;
      if (x > w * 0.86) col = C.StoneDk;
      c.set(x, y, col);
    }
  }

  // Buttresses. The thing that makes a stone box read as load-bearing.
  for (const bx of [5, Math.round(w * 0.42), w - 9]) {
    for (let y = roofH + 4; y <= groundY; y++) {
      const flare = y > groundY - 8 ? 1 : 0;
      for (let i = -flare; i < 4 + flare; i++) {
        c.set(bx + i, y, i <= 0 ? C.StoneLt : i >= 3 ? C.StoneShadow : C.Stone);
      }
    }
    c.hline(bx - 1, roofH + 3, 6, C.StonePale);
  }

  // --- roof: steep and tiled, with a ridge cap
  for (let y = 0; y <= roofH; y++) {
    const t = y / roofH;
    const half = Math.round(t * (w / 2 - 2)) + 4;
    for (let x = Math.round(w / 2 - half); x <= Math.round(w / 2 + half); x++) {
      const row = (y / 3) | 0;
      const stagger = (row % 2) * 2;
      let col = row % 2 === 0 ? C.Dusk : C.Purple;
      if ((x + stagger) % 6 === 0) col = C.InkDeep;
      if (y % 3 === 0) col = C.Rose;
      if (x > w * 0.68 && col === C.Dusk) col = C.Purple;
      c.set(x, y, col);
    }
  }
  for (let x = Math.round(w / 2 - 5); x <= Math.round(w / 2 + 5); x++) c.set(x, 0, C.Rose);
  for (let x = 2; x < w - 2; x++) {
    c.set(x, roofH, C.StoneShadow);
    c.set(x, roofH + 1, C.StoneDk);
  }
  // Eaves shadow thrown down the wall.
  for (let x = 5; x < w - 5; x++) {
    for (let k = 2; k <= 4; k++) {
      if (c.get(x, roofH + k) === TRANSPARENT) continue;
      if (BAYER4[((roofH + k) & 3) * 4 + (x & 3)] / 16 < 1 - (k - 1) * 0.3) {
        c.set(x, roofH + k, C.StoneShadow);
      }
    }
  }

  // --- arched doorway, set deep into the wall
  const dx = Math.round(w * 0.5) - 8;
  const dy = groundY - 26;
  c.rect(dx - 2, dy - 2, 20, 28, C.StoneShadow);
  c.rect(dx, dy, 16, 26, C.StoneDk);
  for (let y = 0; y < 9; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, 81 - (9 - y) * (9 - y))));
    for (let x = 8 - half; x <= 7 + half; x++) c.set(dx + x, dy + y, C.InkDeep);
  }
  c.rect(dx + 1, dy + 8, 14, 17, C.InkDeep);
  // Door leaves with iron banding.
  c.rect(dx + 2, dy + 9, 12, 15, C.WoodDp);
  c.vline(dx + 8, dy + 9, 15, C.InkDeep);
  for (let y = dy + 11; y < dy + 23; y += 4) c.hline(dx + 2, y, 12, C.Slate);
  c.set(dx + 6, dy + 16, C.Gold);
  c.set(dx + 10, dy + 16, C.Gold);
  for (let k = 0; k < 3; k++) {
    c.hline(dx - 3 - k, groundY - k, 22 + k * 2, k === 0 ? C.StoneLt : C.Stone);
  }

  // --- tall lancet windows either side, lit because somebody still lives here
  for (const wx of [Math.round(w * 0.22), Math.round(w * 0.74)]) {
    const wy = roofH + 12;
    c.rect(wx - 1, wy - 1, 9, 24, C.StoneShadow);
    c.rect(wx, wy, 7, 22, C.InkDeep);
    for (let y = 0; y < 5; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 16 - (4 - y) * (4 - y))));
      for (let x = 3 - half; x <= 3 + half; x++) c.set(wx + x, wy + y, C.StoneDk);
    }
    if (rng.chance(0.7)) {
      c.rect(wx + 1, wy + 6, 5, 15, C.Amber);
      c.rect(wx + 1, wy + 6, 5, 4, C.Lantern);
      c.vline(wx + 3, wy + 6, 15, C.WoodDp);
    }
  }

  // --- weathering: moss up the shaded side, and one long crack
  for (let i = 0; i < rng.int(10, 20); i++) {
    const mx = rng.int(w - 14, w - 6);
    const my = rng.int(roofH + 4, groundY);
    if (c.get(mx, my) !== TRANSPARENT) c.set(mx, my, C.Forest);
  }
  let crackX = rng.int(12, w - 14);
  for (let y = roofH + 6; y < groundY - 6; y++) {
    if (c.get(crackX, y) !== TRANSPARENT) c.set(crackX, y, C.StoneShadow);
    if (rng.chance(0.3)) crackX += rng.chance(0.5) ? 1 : -1;
  }

  c.outline(C.InkDeep, false);
  return c;
}

/** A gatehouse: two short towers with an arch and a half-dropped
 *  portcullis between them. */
export function makeGatehouse(seed: number): PixelCanvas {
  const rng = new Rng(seed * 9781 + 3);
  const w = 56;
  const h = 52;
  const c = new PixelCanvas(w, h);
  const groundY = h - 1;

  const drawTower = (x0: number): void => {
    for (let y = 6; y <= groundY; y++) {
      for (let i = 0; i < 16; i++) {
        const n = valueNoise((x0 + i) * 0.5, y * 0.5, seed);
        let col = n > 0.6 ? C.StoneLt : n > 0.3 ? C.Stone : C.StoneDk;
        if ((y - 6) % 5 === 0) col = C.StoneShadow;
        if (i === 0) col = C.StoneLt;
        if (i >= 14) col = C.StoneShadow;
        c.set(x0 + i, y, col);
      }
    }
    for (let i = 0; i < 4; i++) {
      const bx = x0 + i * 4;
      for (let y = 0; y < 6; y++) {
        for (let x = bx; x < bx + 3; x++) c.set(x, y, x < bx + 1 ? C.StoneLt : C.Stone);
      }
    }
    c.hline(x0, 6, 16, C.StonePale);
    c.hline(x0, 7, 16, C.StoneShadow);
    const sx = x0 + 7;
    for (let y = 16; y < 24; y++) c.set(sx, y, C.InkDeep);
  };

  drawTower(0);
  drawTower(w - 16);

  // The span between the towers.
  for (let y = 10; y <= groundY; y++) {
    for (let x = 16; x < w - 16; x++) {
      const n = valueNoise(x * 0.5, y * 0.5, seed + 3);
      c.set(x, y, (y - 10) % 5 === 0 ? C.StoneShadow : n > 0.55 ? C.Stone : C.StoneDk);
    }
  }

  // Archway, then the portcullis hanging half way down it.
  const aw = w - 32;
  const acx = w / 2;
  for (let y = 0; y < 12; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, 144 - (12 - y) * (12 - y))) * (aw / 24));
    for (let x = acx - half; x <= acx + half; x++) c.set(x, groundY - 22 + y, C.InkDeep);
  }
  c.rect(acx - Math.round(aw / 2) + 2, groundY - 11, aw - 4, 11, C.InkDeep);
  for (let x = acx - Math.round(aw / 2) + 3; x < acx + Math.round(aw / 2) - 2; x += 3) {
    for (let y = groundY - 20; y < groundY - 12; y++) c.set(x, y, C.Slate);
  }
  for (let y = groundY - 20; y < groundY - 12; y += 3) {
    c.hline(acx - Math.round(aw / 2) + 3, y, aw - 6, C.SlateLt);
  }

  for (let i = 0; i < rng.int(6, 14); i++) {
    c.set(rng.int(1, w - 2), rng.int(groundY - 6, groundY), C.Forest);
  }

  c.outline(C.InkDeep, false);
  return c;
}

/** A milestone: a carved stone by the road with a distance on it. Small,
 *  but it is the object that tells you a road is a road and not a path
 *  somebody wore into the grass. */
export function makeMilestone(seed: number): PixelCanvas {
  const rng = new Rng(seed * 3121 + 7);
  const c = new PixelCanvas(12, 18);
  for (let y = 3; y < 18; y++) {
    const t = (y - 3) / 15;
    const half = Math.round(2.5 + t * 1.5);
    for (let x = 6 - half; x <= 6 + half; x++) {
      const nx = (x - 6) / half;
      const n = valueNoise(x * 0.8, y * 0.8, seed) - 0.5;
      const v = -nx * 0.6 + 0.3 + n * 0.5;
      c.set(x, y, v > 0.6 ? C.StoneLt : v > 0.2 ? C.Stone : C.StoneDk);
    }
  }
  // A rounded cap and two carved marks.
  c.disc(6, 4, 3, 2, C.StoneLt);
  for (let i = 0; i < 2; i++) c.hline(4, 8 + i * 3, 4, C.StoneShadow);
  if (rng.chance(0.5)) c.set(4, 15, C.Forest);
  c.outline(C.InkDeep, false);
  return c;
}

/** A cold campfire ring: stones, ash, one charred log. */
export function makeCampfire(): PixelCanvas {
  const c = new PixelCanvas(20, 14);
  // Ring of stones.
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    const x = Math.round(10 + Math.cos(ang) * 8);
    const y = Math.round(8 + Math.sin(ang) * 4.5);
    c.set(x, y, C.Stone);
    c.set(x, y - 1, C.StoneLt);
    c.set(x + 1, y, C.StoneDk);
  }
  // Ash and charcoal.
  c.disc(10, 8, 5.5, 3, C.Slate);
  c.disc(10, 8, 3.5, 2, C.InkDeep);
  // A log across it, burnt at one end.
  for (let i = 0; i < 9; i++) {
    c.set(6 + i, 8 - (i > 5 ? 1 : 0), i > 5 ? C.InkDeep : C.WoodDk);
  }
  c.outline(C.InkDeep, false);
  return c;
}

/** A transmission pylon. Reads as infrastructure at a glance, which is
 *  exactly what the walk toward the neon district needs. */
export function makePylon(seed: number): PixelCanvas {
  const rng = new Rng(seed * 1487 + 11);
  const w = 26;
  const h = 64;
  const c = new PixelCanvas(w, h);
  const cx = w >> 1;

  // Splayed lattice legs.
  for (let y = 14; y < h; y++) {
    const t = (y - 14) / (h - 14);
    const half = Math.round(2 + t * 8);
    c.set(cx - half, y, C.CyberSteel);
    c.set(cx + half, y, C.CyberSlate);
    if (y % 5 === 0) for (let x = cx - half; x <= cx + half; x++) c.set(x, y, C.CyberSlate);
    if (y % 9 === 0) {
      for (let i = 0; i <= half * 2; i++) c.set(cx - half + i, y - (i >> 1), C.InkDeep);
    }
  }
  // Cross arms.
  for (const [ay, len] of [[8, 11], [16, 9]] as const) {
    c.hline(cx - len, ay, len * 2 + 1, C.CyberSteel);
    c.hline(cx - len, ay + 1, len * 2 + 1, C.InkDeep);
    for (const ix of [cx - len, cx, cx + len]) {
      c.set(ix, ay - 1, C.Slate);
      c.set(ix, ay - 2, C.SlateLt);
    }
  }
  // Cables sagging off toward the next pylon.
  for (let x = 0; x < w; x++) {
    const sag = Math.round(Math.sin((x / w) * Math.PI) * 3);
    c.setUnder(x, 6 + sag, C.InkDeep);
  }
  if (rng.chance(0.5)) c.set(cx, 2, C.NeonMagenta);
  c.outline(C.InkDeep, false);
  return c;
}

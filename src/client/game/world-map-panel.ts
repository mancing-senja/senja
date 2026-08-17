import { MAP_H, MAP_W, TILE } from '../../shared/constants';
import { C } from '../art/palette';
import type { Draw } from '../render/draw';
import { view } from '../engine/view';
import { DISTRICTS } from '../world/districts';
import { EAST_OUTPOST, SOUTH_OUTPOST } from '../world/map';
import { observedPlayerPosition } from './ai-thoughts';

interface Mark {
  label: string;
  tx: number;
  ty: number;
  col: C;
  dx?: number;
  dy?: number;
}

/** Hand-map landmarks. They deliberately point to regions, not every secret
 * spot or NPC: enough to stop getting lost without turning exploration into
 * a checklist/GPS. */
const MARKS: Mark[] = [
  { label: 'Kampung Danau', tx: 92, ty: 22, col: C.Lantern, dx: -24, dy: 6 },
  { label: 'Dermaga', tx: 74, ty: 20, col: C.Foam, dx: -18, dy: -10 },
  { label: 'Kebun', tx: 86, ty: 38, col: C.GrassLt, dx: 5, dy: 4 },
  { label: 'Benteng Lama', tx: 18, ty: 30, col: C.StonePale, dx: 6, dy: 3 },
  { label: 'Dermaga Neon', tx: 158, ty: 26, col: C.NeonCyan, dx: 6, dy: 3 },
  { label: 'Rimbun Cahaya', tx: 84, ty: 82, col: C.ArcaneLt, dx: 6, dy: 3 },
  { label: 'Pos Timur', tx: EAST_OUTPOST.cx, ty: EAST_OUTPOST.cy, col: C.Amber, dx: -30, dy: 5 },
  { label: 'Kampung Selatan', tx: SOUTH_OUTPOST.cx, ty: SOUTH_OUTPOST.cy, col: C.GrassLt, dx: 6, dy: -9 },
];

export function drawWorldMapPanel(d: Draw): void {
  const w = 286;
  const h = 160;
  const x = Math.round(view.w / 2 - w / 2);
  const y = Math.round(view.h / 2 - h / 2);
  const mx = x + 17;
  const my = y + 23;
  const mw = 252;
  const mh = 135;
  const sx = mw / MAP_W;
  const sy = mh / MAP_H;

  d.panel(x, y, w, h, 1, C.Lantern);
  d.text('PETA SENJA', x + 8, y + 7, C.Lantern);
  d.text('bukan GPS — cuma biar ga nyasar', x + 74, y + 7, C.Mist, 0.75);

  // Paper-like dark land. The northern waterline is intentionally stylised;
  // the actual coast still has to be discovered on foot.
  d.rect(mx - 2, my - 2, mw + 4, mh + 4, C.InkDeep, 0.98);
  d.rect(mx, my, mw, mh, C.ForestDp, 0.78);
  d.rect(mx, my, mw, Math.round(25 * sy), C.WaterDp, 0.96);
  d.rect(mx, my + Math.round(20 * sy), mw, Math.max(1, Math.round(3 * sy)), C.Water, 0.45);

  // A remembered river line and swamp hint are enough to orient north/south
  // without reproducing every generated shoreline tile.
  const riverX = mx + Math.round(130 * sx);
  d.rect(riverX, my + Math.round(20 * sy), Math.max(1, Math.ceil(sx * 2)), Math.round(47 * sy), C.Water, 0.8);
  d.rect(mx + Math.round(41 * sx), my + Math.round(54 * sy), Math.round(12 * sx), Math.round(10 * sy), C.WaterSh, 0.45);

  // Genre districts use the same palette language as the world itself.
  for (const dz of DISTRICTS) {
    const col = dz.genre === 'medieval' ? C.Stone
      : dz.genre === 'cyber' ? C.NeonCyan
      : C.Arcane;
    const rx = mx + Math.round(dz.tx0 * sx);
    const ry = my + Math.round(dz.ty0 * sy);
    const rw = Math.max(2, Math.round((dz.tx1 - dz.tx0 + 1) * sx));
    const rh = Math.max(2, Math.round((dz.ty1 - dz.ty0 + 1) * sy));
    d.rect(rx, ry, rw, rh, col, 0.22);
    d.rect(rx, ry, rw, 1, col, 0.75);
  }

  // Settlements outside the three genre districts.
  markArea(d, mx, my, sx, sy, EAST_OUTPOST.cx, EAST_OUTPOST.cy, EAST_OUTPOST.reach, C.Amber);
  markArea(d, mx, my, sx, sy, SOUTH_OUTPOST.cx, SOUTH_OUTPOST.cy, SOUTH_OUTPOST.reach, C.GrassLt);

  for (const mark of MARKS) {
    const px = mx + Math.round(mark.tx * sx);
    const py = my + Math.round(mark.ty * sy);
    d.rect(px - 1, py - 1, 3, 3, mark.col, 0.95);
    d.text(mark.label, px + (mark.dx ?? 4), py + (mark.dy ?? -7), mark.col, 0.86);
  }

  drawPlayerMark(d, mx, my, sx, sy);

  d.text('utara / danau', mx + 4, my + 4, C.Foam, 0.65);
  d.text('k tutup   titik kuning = kamu', x + 8, y + h - 10, C.Mist, 0.78);
}

function markArea(
  d: Draw, mx: number, my: number, sx: number, sy: number,
  tx: number, ty: number, reach: number, col: C,
): void {
  const x = mx + Math.round((tx - reach) * sx);
  const y = my + Math.round((ty - reach) * sy);
  const w = Math.max(3, Math.round(reach * 2 * sx));
  const h = Math.max(3, Math.round(reach * 2 * sy));
  d.rect(x, y, w, h, col, 0.14);
  d.rect(x, y, w, 1, col, 0.55);
}

function drawPlayerMark(d: Draw, mx: number, my: number, sx: number, sy: number): void {
  const pos = observedPlayerPosition();
  if (!pos) return;

  // The game's debug snapshot already knows whether the actor currently uses
  // interior coordinates. Hide the world marker indoors instead of lying and
  // placing the player in the far west of the overworld.
  const dbg = (window as unknown as { __dbg?: () => { indoors?: unknown } }).__dbg?.();
  if (dbg?.indoors) {
    d.text('kamu lagi di dalam bangunan', mx + 68, my + 121, C.Lantern, 0.85);
    return;
  }

  const tx = Math.max(0, Math.min(MAP_W - 1, pos.x / TILE));
  const ty = Math.max(0, Math.min(MAP_H - 1, pos.y / TILE));
  const px = mx + Math.round(tx * sx);
  const py = my + Math.round(ty * sy);
  const pulse = Math.floor(performance.now() / 280) % 2 === 0;
  if (pulse) d.rect(px - 3, py - 3, 7, 7, C.Lantern, 0.22);
  d.rect(px - 2, py - 2, 5, 5, C.InkDeep, 0.9);
  d.rect(px - 1, py - 1, 3, 3, C.Lantern, 1);
  d.rect(px, py, 1, 1, C.White, 1);
}

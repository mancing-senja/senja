/** Shared between client and server. Keep dependency-free. */

/** Internal render resolution. Everything is drawn at this size, then
 *  integer-scaled up to the window so pixels stay square and crisp. */
export const VIEW_W = 320;
export const VIEW_H = 180;

export const TILE = 16;

/** World size in tiles. Big enough to hold several distinct fishing spots
 *  with real walking between them. */
export const MAP_W = 180;
export const MAP_H = 96;

export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** World y of the horizon line. The lake starts at the top edge of the map
 *  and the sky is drawn in the negative space above it, so standing at the
 *  end of the dock gives a real view out over the water. */
export const HORIZON_Y = 0;

/** How far above the world the camera may travel to show that sky. */
export const SKY_H = 96;

/** Server tick rate for authoritative state broadcast. */
export const TICK_HZ = 15;
export const TICK_MS = 1000 / TICK_HZ;

/** How often the client reports its position. */
export const INPUT_HZ = 20;

export const PLAYER_SPEED = 46; // px per second, deliberately unhurried

/** One in-game day in real seconds. Long enough that dusk lingers. */
export const DAY_LENGTH_S = 1200;

/** Day starts at this normalized time (0..1). 0.30 ≈ late morning. */
export const DAY_START = 0.3;

export const MAX_PLAYERS_PER_ROOM = 8;
export const MAX_CHAT_LEN = 120;
export const MAX_NAME_LEN = 14;

export const FARM_PLOT_COUNT = 12;

/** Growth time per crop stage, in in-game day fractions. */
export const CROP_STAGES = 4;

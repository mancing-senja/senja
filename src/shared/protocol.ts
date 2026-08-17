/** Wire protocol. JSON over WebSocket — the message volume here is tiny
 *  (8 players, 15 Hz) so binary packing would be premature. */

import type { NpcMindState } from './npc-ai';

export type Facing = 'down' | 'up' | 'left' | 'right';

export type PlayerAction =
  | { kind: 'idle' }
  | { kind: 'walk' }
  | { kind: 'cast' }
  | { kind: 'wait' }
  | { kind: 'reel' }
  | { kind: 'tend' };

export interface PlayerState {
  id: string;
  name: string;
  /** Palette index picked at join so players read as different people. */
  hue: number;
  x: number;
  y: number;
  facing: Facing;
  action: PlayerAction['kind'];
  /** Bobber position while fishing; null when the line is not in the water. */
  bobber: { x: number; y: number } | null;
  coins: number;
  caught: number;
  boat?: boolean;
}

export interface PlotState {
  /** Plot index into the fixed farm layout. */
  i: number;
  /** null = tilled but empty. */
  crop: string | null;
  /** 0..CROP_STAGES */
  stage: number;
  watered: boolean;
  /** Server time (ms) when this plot last advanced. */
  t: number;
  /** Who planted it — shown on hover. */
  by: string;
}

export interface WorldState {
  /** Normalized time of day, 0..1. Server-authoritative so everyone shares dusk. */
  time: number;
  /** 0 = clear, 1 = full rain. Eases between. */
  rain: number;
  plots: PlotState[];
}

/** One person's standing in the room, as shown on the village board. */
export interface BoardEntry {
  name: string;
  hue: number;
  caught: number;
  /** Their biggest fish so far. */
  bestSpecies: string;
  bestCm: number;
  /** How many distinct species they have landed. */
  species: number;
  /** Wall-clock ms of their last catch, for the "recently" list. */
  t: number;
  online: boolean;
}

/** Something worth a little floating notice above the lake. */
export interface FeedItem {
  id: number;
  text: string;
  /** Client renders these differently. */
  tone: 'catch' | 'join' | 'leave' | 'farm' | 'chat';
  who: string;
  t: number;
}

// ---------------------------------------------------------------- client → server

/** What a player carries between sessions. Small on purpose: the world
 *  regenerates from a seed, so only the player's own record travels. */
export interface ProfileData {
  name: string;
  look: number;
  coins: number;
  caught: number;
  day: number;
  log: Record<string, { count: number; best: number; bestGrade: number }>;
  lore: string[];
  /** NPC relationship state follows the player rather than the browser.
   * Optional keeps older servers/clients wire-compatible during deploys. */
  minds?: Record<string, NpcMindState>;
}

export type ClientMsg =
  | { t: 'join'; room: string; name: string; hue: number; token?: string }
  | { t: 'save'; profile: Partial<ProfileData> }
  | { t: 'move'; x: number; y: number; facing: Facing; action: PlayerAction['kind'] }
  | { t: 'cast'; bx: number; by: number }
  | { t: 'reel' }
  | { t: 'catch'; species: string; size: number; speciesCount?: number }
  | { t: 'sell' }
  | { t: 'plot'; i: number; op: 'till' | 'plant' | 'water' | 'harvest'; crop?: string }
  | { t: 'chat'; text: string }
  | { t: 'boat'; active: boolean }
  | { t: 'pong' };

// ---------------------------------------------------------------- server → client

export type ServerMsg
  = { t: 'welcome'; you: string; room: string; state: WorldState; players: PlayerState[] }
  | { t: 'joined'; player: PlayerState }
  | { t: 'left'; id: string }
  | { t: 'snapshot'; time: number; rain: number; players: PlayerState[] }
  | { t: 'plots'; plots: PlotState[] }
  | { t: 'feed'; item: FeedItem }
  | { t: 'you'; coins: number; caught: number }
  | { t: 'board'; entries: BoardEntry[] }
  | { t: 'full' }
  /** Sent once after joining, when the server recognises the token. */
  | { t: 'profile'; profile: ProfileData }
  | { t: 'ping' };

export function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

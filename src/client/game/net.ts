/** Client half of the room protocol.
 *
 *  The room code lives in the URL hash, so "mabar" is just sending someone
 *  the link you already have open. If the socket never comes up the game
 *  stays perfectly playable single-player — the network is an enhancement,
 *  not a dependency. */

import { INPUT_HZ } from '../../shared/constants';
import {
  safeParse,
  type BoardEntry,
  type ClientMsg,
  type FeedItem,
  type PlayerState,
  type PlotState,
  type ProfileData,
  type ServerMsg,
} from '../../shared/protocol';
import { RemotePlayer } from './player';
import { exportProfileMinds, mergeProfileMinds } from './mind-sync';

export type NetStatus = 'offline' | 'connecting' | 'online' | 'full';

export interface RoomPlayerSummary {
  name: string;
  hue: number;
  mine: boolean;
}

/** Tiny read-only bridge for deterministic NPC schedules. The room server
 * already owns time/weather; routines consume that same snapshot so two
 * players do not see the village living in different hours. */
export interface NpcWorldSnapshot {
  online: boolean;
  time: number;
  rain: number;
}

const npcWorld: NpcWorldSnapshot = { online: false, time: -1, rain: 0 };

export function npcWorldSnapshot(): NpcWorldSnapshot {
  return { ...npcWorld };
}

/** This player's save key.
 *
 *  Minted once, in the browser, and never shown to anybody. It is not an
 *  account: there is no password, nothing to reset, and the server learns
 *  nothing about who you are. What it buys is a profile that survives a
 *  cache clear and can be carried to another machine by copying one string
 *  — which is the whole of what a cozy fishing game needs, and none of the
 *  risk that comes with storing credentials.
 *
 *  crypto.randomUUID is available in every browser this game renders in;
 *  the fallback exists so a page opened over plain http on a LAN, where
 *  the crypto API is not exposed, still gets a stable key. */
export function playerToken(): string {
  const KEY = 'senja.token';
  let t = localStorage.getItem(KEY);
  if (t && /^[A-Za-z0-9_-]{16,64}$/.test(t)) return t;
  const uuid = globalThis.crypto?.randomUUID?.();
  t = (uuid ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
    .replace(/-/g, '')
    .slice(0, 32);
  localStorage.setItem(KEY, t);
  return t;
}

export class Net {
  private ws: WebSocket | null = null;
  private sendAcc = 0;
  private retryIn = 0;
  private retries = 0;

  status: NetStatus = 'offline';
  youId = '';
  room: string;
  players = new Map<string, RemotePlayer>();
  plots: PlotState[] = [];
  feed: FeedItem[] = [];
  /** The community board, as ranked by the server. */
  board: BoardEntry[] = [];
  /** Server clock. The client eases toward it rather than snapping. */
  serverTime = -1;
  serverRain = 0;

  onFeed: ((item: FeedItem) => void) | null = null;
  /** Fired once on connect when the server recognises this player. */
  onProfile: ((p: ProfileData) => void) | null = null;
  onPlots: ((plots: PlotState[]) => void) | null = null;

  constructor(private name: string, private hue: number) {
    this.room = readRoomFromUrl();
  }

  get url(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/room`;
  }

  connect(): void {
    if (this.ws) return;
    this.status = 'connecting';
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.send({
        t: 'join', room: this.room, name: this.name, hue: this.hue,
        token: playerToken(),
      });
    };

    ws.onmessage = (ev) => {
      const msg = safeParse<ServerMsg>(String(ev.data));
      if (msg) this.handle(msg);
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.status !== 'full') this.status = 'offline';
      npcWorld.online = false;
      this.players.clear();
      this.publishPlayers();
      this.scheduleRetry();
    };

    ws.onerror = () => {
      // onclose always follows; nothing to do here beyond not throwing.
    };
  }

  private scheduleRetry(): void {
    this.retries++;
    this.retryIn = Math.min(12, 1.5 * this.retries);
  }

  private handle(msg: ServerMsg): void {
    switch (msg.t) {
      case 'profile':
        if (msg.profile.name) this.name = msg.profile.name;
        if (Number.isFinite(msg.profile.look)) this.hue = msg.profile.look;
        // Relationship memory is part of the player profile, but the main
        // loop should not have to know which villagers currently exist.
        mergeProfileMinds(msg.profile.minds);
        this.onProfile?.(msg.profile);
        break;

      case 'welcome':
        this.status = 'online';
        this.youId = msg.you;
        this.room = msg.room;
        this.serverTime = msg.state.time;
        this.serverRain = msg.state.rain;
        npcWorld.online = true;
        npcWorld.time = msg.state.time;
        npcWorld.rain = msg.state.rain;
        this.plots = msg.state.plots;
        this.onPlots?.(this.plots);
        for (const p of msg.players) this.addPlayer(p, false);
        this.publishPlayers();
        break;

      case 'joined':
        this.addPlayer(msg.player);
        break;

      case 'left': {
        const rp = this.players.get(msg.id);
        if (rp) rp.leaving = true;
        this.publishPlayers();
        break;
      }

      case 'snapshot': {
        this.serverTime = msg.time;
        this.serverRain = msg.rain;
        npcWorld.online = true;
        npcWorld.time = msg.time;
        npcWorld.rain = msg.rain;
        const seen = new Set<string>();
        let changed = false;
        for (const s of msg.players) {
          if (s.id === this.youId) continue;
          seen.add(s.id);
          const rp = this.players.get(s.id);
          if (rp) {
            rp.applySnapshot(s);
          } else {
            this.addPlayer(s, false);
            changed = true;
          }
        }
        for (const [id, rp] of this.players) {
          if (!seen.has(id) && !rp.leaving) {
            rp.leaving = true;
            changed = true;
          }
        }
        if (changed) this.publishPlayers();
        break;
      }

      case 'plots':
        this.plots = msg.plots;
        this.onPlots?.(this.plots);
        break;

      case 'board':
        this.board = msg.entries;
        break;

      case 'feed':
        this.feed.push(msg.item);
        if (this.feed.length > 40) this.feed.shift();
        this.onFeed?.(msg.item);
        break;

      case 'full':
        this.status = 'full';
        npcWorld.online = false;
        break;

      case 'ping':
        this.send({ t: 'pong' });
        break;
    }
  }

  private addPlayer(s: PlayerState, publish = true): void {
    if (s.id === this.youId) return;
    this.players.set(s.id, new RemotePlayer(s.id, s.name, s.hue, s));
    if (publish) this.publishPlayers();
  }

  /** Keep the pixel HUD decoupled from the socket implementation. The HUD
   * only needs a tiny roster, so a browser event is enough and avoids
   * threading networking objects through the render context every frame. */
  private publishPlayers(): void {
    const detail: RoomPlayerSummary[] = [];
    if (this.status === 'online') {
      detail.push({ name: this.name, hue: this.hue, mine: true });
      for (const rp of this.players.values()) {
        if (!rp.leaving) detail.push({ name: rp.name, hue: rp.hue, mine: false });
      }
    }
    window.dispatchEvent(new CustomEvent<RoomPlayerSummary[]>('senja:players', { detail }));
  }

  update(dt: number, x: number, y: number, facing: PlayerState['facing'], action: PlayerState['action']): void {
    if (this.retryIn > 0) {
      this.retryIn -= dt;
      if (this.retryIn <= 0 && !this.ws) this.connect();
    }

    let rosterChanged = false;
    for (const [id, rp] of this.players) {
      rp.update(dt);
      if (rp.leaving && rp.fade <= 0) {
        this.players.delete(id);
        rosterChanged = true;
      }
    }
    if (rosterChanged) this.publishPlayers();

    if (this.status !== 'online') return;
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / INPUT_HZ) {
      this.sendAcc = 0;
      this.send({ t: 'move', x: Math.round(x), y: Math.round(y), facing, action });
    }
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Existing save call sites stay untouched. NPC memory is appended at
      // the network boundary, which also covers the pagehide save path.
      if (msg.t === 'save') msg.profile.minds = exportProfileMinds();
      this.ws.send(JSON.stringify(msg));
    }
  }

  chat(text: string): void {
    const clean = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!clean) return;
    // Show the sender's own line immediately in world-space. The room feed
    // remains the durable multiplayer log; this event is presentation only.
    window.dispatchEvent(new CustomEvent<string>('senja:local-chat', { detail: clean }));
    this.send({ t: 'chat', text: clean });
  }

  /** Shareable link for whoever you want to fish with. */
  shareUrl(): string {
    return `${location.origin}${location.pathname}#${this.room}`;
  }
}

const ROOM_KEY = 'senja.room';

function readRoomFromUrl(): string {
  const h = location.hash.replace('#', '').trim().toLowerCase();
  if (h) {
    const room = h.slice(0, 12);
    localStorage.setItem(ROOM_KEY, room);
    return room;
  }

  const remembered = localStorage.getItem(ROOM_KEY)?.trim().toLowerCase().slice(0, 12);
  if (remembered) {
    location.hash = remembered;
    return remembered;
  }

  const code = randomCode();
  localStorage.setItem(ROOM_KEY, code);
  location.hash = code;
  return code;
}

function randomCode(): string {
  const words = ['kolam', 'senja', 'teduh', 'sore', 'rindang', 'embun', 'lereng', 'petang'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}${Math.floor(Math.random() * 90 + 10)}`;
}

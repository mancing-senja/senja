/** Client half of the room protocol.
 *
 *  The room code lives in the URL hash, so "mabar" is just sending someone
 *  the link you already have open. If the socket never comes up the game
 *  stays perfectly playable single-player — the network is an enhancement,
 *  not a dependency. */

import { INPUT_HZ } from '../../shared/constants';
import {
  safeParse, type BoardEntry, type ClientMsg, type FeedItem, type PlayerState,
  type PlotState, type ServerMsg,
} from '../../shared/protocol';
import { RemotePlayer } from './player';

export type NetStatus = 'offline' | 'connecting' | 'online' | 'full';

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
  onPlots: ((plots: PlotState[]) => void) | null = null;

  constructor(private name: string, private hue: number) {
    this.room = readRoomFromUrl();
  }

  get url(): string {
    // Always same-origin, on a path the dev server (and any production
    // reverse proxy) forwards to the room server. Guessing a second port
    // used to work on localhost and broke the moment anyone shared a
    // tunnelled link with a friend.
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
      this.send({ t: 'join', room: this.room, name: this.name, hue: this.hue });
    };

    ws.onmessage = (ev) => {
      const msg = safeParse<ServerMsg>(String(ev.data));
      if (msg) this.handle(msg);
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.status !== 'full') this.status = 'offline';
      this.players.clear();
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
      case 'welcome':
        this.status = 'online';
        this.youId = msg.you;
        this.room = msg.room;
        this.serverTime = msg.state.time;
        this.serverRain = msg.state.rain;
        this.plots = msg.state.plots;
        this.onPlots?.(this.plots);
        for (const p of msg.players) this.addPlayer(p);
        break;

      case 'joined':
        this.addPlayer(msg.player);
        break;

      case 'left': {
        const rp = this.players.get(msg.id);
        if (rp) rp.leaving = true;
        break;
      }

      case 'snapshot': {
        this.serverTime = msg.time;
        this.serverRain = msg.rain;
        const seen = new Set<string>();
        for (const s of msg.players) {
          if (s.id === this.youId) continue;
          seen.add(s.id);
          const rp = this.players.get(s.id);
          if (rp) rp.applySnapshot(s);
          else this.addPlayer(s);
        }
        for (const [id, rp] of this.players) if (!seen.has(id)) rp.leaving = true;
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
        break;

      case 'ping':
        this.send({ t: 'pong' });
        break;
    }
  }

  private addPlayer(s: PlayerState): void {
    if (s.id === this.youId) return;
    this.players.set(s.id, new RemotePlayer(s.id, s.name, s.hue, s));
  }

  update(dt: number, x: number, y: number, facing: PlayerState['facing'], action: PlayerState['action']): void {
    if (this.retryIn > 0) {
      this.retryIn -= dt;
      if (this.retryIn <= 0 && !this.ws) this.connect();
    }

    for (const [id, rp] of this.players) {
      rp.update(dt);
      if (rp.leaving && rp.fade <= 0) this.players.delete(id);
    }

    if (this.status !== 'online') return;
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / INPUT_HZ) {
      this.sendAcc = 0;
      this.send({ t: 'move', x: Math.round(x), y: Math.round(y), facing, action });
    }
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  chat(text: string): void {
    this.send({ t: 'chat', text });
  }

  /** Shareable link for whoever you want to fish with. */
  shareUrl(): string {
    return `${location.origin}${location.pathname}#${this.room}`;
  }
}

function readRoomFromUrl(): string {
  const h = location.hash.replace('#', '').trim().toLowerCase();
  if (h) return h.slice(0, 12);
  // A stable default keeps "just open it and play" working, but a fresh
  // random room is written into the URL so sharing is unambiguous.
  const code = randomCode();
  location.hash = code;
  return code;
}

function randomCode(): string {
  const words = ['kolam', 'senja', 'teduh', 'sore', 'rindang', 'embun', 'lereng', 'petang'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}${Math.floor(Math.random() * 90 + 10)}`;
}

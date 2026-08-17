/** Room server.
 *
 *  Authoritative for the things everyone must agree on — the clock, the
 *  weather, and the state of the shared farm plots. Player positions are
 *  client-reported and only sanity-clamped: this is a co-op fishing game
 *  with friends, so the cost of cheating is nil and the cost of rubber-
 *  banding on a home connection is the whole mood. */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Store, validToken } from './store.js';
import {
  DAY_LENGTH_S, DAY_START, FARM_PLOT_COUNT, MAX_CHAT_LEN, MAX_NAME_LEN,
  MAX_PLAYERS_PER_ROOM, TICK_MS, WORLD_H, WORLD_W, CROP_STAGES,
} from '../shared/constants.js';
import {
  safeParse, type BoardEntry, type ClientMsg, type FeedItem, type PlayerState,
  type PlotState, type ServerMsg,
} from '../shared/protocol.js';

/** Deliberately not `PORT`: the dev runner sets that for the Vite client,
 *  and the two must not fight over the same socket. */
const PORT = Number(process.env.SENJA_PORT ?? process.env.PORT ?? 8787);
/** Shortest gap between two accepted saves from one connection. */
const SAVE_MIN_MS = 4000;

interface Client {
  ws: WebSocket;
  id: string;
  room: Room | null;
  state: PlayerState;
  alive: boolean;
  lastChat: number;
  /** The profile key this connection sent, if any. Absent for a client
   *  that never asked to be remembered. */
  token: string | null;
  lastSave: number;
}

interface Room {
  code: string;
  clients: Set<Client>;
  plots: PlotState[];
  /** Wall-clock ms when this room's day started. */
  born: number;
  rain: number;
  rainTarget: number;
  nextWeather: number;
  feedSeq: number;
  plotsDirty: boolean;
  /** The community board, keyed by stable player identity rather than
   *  display name. Two friends can both be named Dimas without sharing a row. */
  board: Map<string, BoardEntry>;
  boardDirty: boolean;
}

const store = new Store();
const rooms = new Map<string, Room>();
let nextId = 1;
let shuttingDown = false;

function makeRoom(code: string): Room {
  const plots: PlotState[] = [];
  for (let i = 0; i < FARM_PLOT_COUNT; i++) {
    plots.push({ i, crop: null, stage: -1, watered: false, t: Date.now(), by: '' });
  }
  return {
    code,
    clients: new Set(),
    plots,
    born: Date.now(),
    rain: 0,
    rainTarget: 0,
    nextWeather: Date.now() + 60_000,
    feedSeq: 1,
    plotsDirty: false,
    board: new Map(),
    boardDirty: false,
  };
}

/** Stable identity inside a room. A real browser profile keeps the same token
 *  across reconnects; a tokenless client falls back to its one connection. */
function playerKey(c: Client): string {
  return c.token ? `profile:${c.token}` : `connection:${c.id}`;
}

/** Ranked for display: most species first, then biggest fish, then count.
 *  Rewarding variety over raw volume keeps the board from being a list of
 *  whoever has been idling the longest. */
function boardEntries(r: Room): BoardEntry[] {
  const online = new Set([...r.clients].map(playerKey));
  return [...r.board.entries()]
    .map(([key, e]) => ({ ...e, online: online.has(key) }))
    .sort((a, b) => b.species - a.species || b.bestCm - a.bestCm || b.caught - a.caught)
    .slice(0, 12);
}

function roomTime(r: Room): number {
  const elapsed = (Date.now() - r.born) / 1000;
  return (DAY_START + elapsed / DAY_LENGTH_S) % 1;
}

function send(c: Client, msg: ServerMsg): void {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function broadcast(r: Room, msg: ServerMsg, except?: Client): void {
  const raw = JSON.stringify(msg);
  for (const c of r.clients) {
    if (c === except) continue;
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(raw);
  }
}

function feed(r: Room, tone: FeedItem['tone'], who: string, text: string): void {
  broadcast(r, {
    t: 'feed',
    item: { id: r.feedSeq++, tone, who, text, t: Date.now() },
  });
}

function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  // Strip control characters; keep it to one line.
  return s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

/** One process, one port, one deployment.
 *
 *  In development Vite serves the client and proxies /room here, which is
 *  two processes and exactly right for editing. In production that shape
 *  is a liability: two services to deploy, two to keep alive, and a CORS
 *  and WebSocket-upgrade problem sitting between them. So the built client
 *  is served from this same process and the socket lives at /room on the
 *  same origin — which is also what makes an instant tunnel work, since
 *  most of them will only forward one port.
 *
 *  If dist/ is not there, the static handler simply says so. That is the
 *  normal state during development and must not stop the socket coming up. */
const DIST = process.env.SENJA_DIST ?? join(process.cwd(), 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // The client is a single page: anything that is not a real file falls
  // back to index.html so a deep link still boots the game.
  const resolved = resolve(join(DIST, rel));
  // resolve() collapses any ".." the request smuggled in; if the result
  // escapes DIST the request was trying to read the rest of the disk.
  const safe = resolved.startsWith(resolve(DIST));

  const serve = (file: string): void => {
    try {
      const body = readFileSync(file);
      const ext = extname(file).toLowerCase();
      res.writeHead(200, {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        // Hashed asset names make long caching safe; index.html must not be
        // cached or a deploy never reaches anybody already holding a tab.
        'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('tidak ada');
    }
  };

  if (safe && existsSync(resolved) && statSync(resolved).isFile()) {
    serve(resolved);
    return;
  }
  const index = join(DIST, 'index.html');
  if (existsSync(index)) {
    serve(index);
    return;
  }
  res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('client belum di-build. jalankan: npm run build');
});

const wss = new WebSocketServer({ server: httpServer, path: '/room' });
httpServer.listen(PORT);

wss.on('connection', (ws) => {
  const client: Client = {
    ws,
    id: `p${nextId++}`,
    room: null,
    alive: true,
    lastChat: 0,
    token: null,
    lastSave: 0,
    state: {
      id: '', name: '', hue: 0, x: 0, y: 0, facing: 'down', action: 'idle',
      bobber: null, coins: 0, caught: 0,
    },
  };
  client.state.id = client.id;

  ws.on('message', (raw) => {
    const msg = safeParse<ClientMsg>(String(raw));
    if (!msg || typeof msg.t !== 'string') return;
    void handle(client, msg).catch((err) => {
      console.warn('[senja] gagal menangani pesan:', err);
    });
  });

  ws.on('close', () => {
    void store.flush();
    const r = client.room;
    if (!r) return;
    r.clients.delete(client);
    r.boardDirty = true;
    broadcast(r, { t: 'left', id: client.id });
    feed(r, 'leave', client.state.name, 'pamit dulu');
    if (r.clients.size === 0) {
      // Keep the room (and its crops) around briefly so a reconnect after a
      // dropped wifi does not wipe the farm.
      setTimeout(() => {
        if (r.clients.size === 0) rooms.delete(r.code);
      }, 10 * 60_000);
    }
  });

  ws.on('pong', () => {
    client.alive = true;
  });
});

async function handle(c: Client, msg: ClientMsg): Promise<void> {
  if (shuttingDown) return;

  if (msg.t === 'join') {
    const code = clean(msg.room, 12).toLowerCase() || 'kolam';
    let r = rooms.get(code);
    if (!r) {
      r = makeRoom(code);
      rooms.set(code, r);
    }
    if (r.clients.size >= MAX_PLAYERS_PER_ROOM) {
      send(c, { t: 'full' });
      return;
    }
    c.room = r;
    c.state.name = clean(msg.name, MAX_NAME_LEN) || 'pemancing';
    c.state.hue = Number.isFinite(msg.hue) ? Math.abs(Math.floor(msg.hue)) % 12 : 0;
    r.clients.add(c);

    // A returning player gets their record back before anything else, so
    // the first frame they see already has their coins and their journal
    // rather than briefly showing them as a stranger.
    if (validToken(msg.token)) {
      const token: string = msg.token;
      c.token = token;
      const p = await store.get(token);
      if (p.name) c.state.name = p.name;
      if (Number.isFinite(p.look)) c.state.hue = p.look % 12;
      c.state.coins = p.coins;
      c.state.caught = p.caught;
      send(c, {
        t: 'profile',
        profile: {
          name: p.name, look: p.look, coins: p.coins, caught: p.caught,
          day: p.day, log: p.log, lore: p.lore, minds: p.minds,
        },
      });
    }

    send(c, {
      t: 'welcome',
      you: c.id,
      room: code,
      state: { time: roomTime(r), rain: r.rain, plots: r.plots },
      players: [...r.clients].filter((o) => o !== c).map((o) => o.state),
    });
    broadcast(r, { t: 'joined', player: c.state }, c);
    feed(r, 'join', c.state.name, 'gabung');
    send(c, { t: 'board', entries: boardEntries(r) });
    r.boardDirty = true;
    return;
  }

  if (msg.t === 'save') {
    if (!c.token) return;
    // Rate limited. A save is a whole-profile merge, and a client that
    // sends one per frame would have the server rewriting its journal
    // sixty times a second for no gain.
    const now = Date.now();
    if (now - c.lastSave < SAVE_MIN_MS) return;
    c.lastSave = now;
    void store.merge(c.token, msg.profile ?? {}).catch((err) => {
      console.warn('[senja] gagal simpan profil:', err);
    });
    return;
  }

  const r = c.room;
  if (!r) return;

  switch (msg.t) {
    case 'move': {
      // Clamp rather than reject — a shove back into bounds is invisible,
      // a rejected update is a stutter.
      c.state.x = clampNum(msg.x, 0, WORLD_W);
      c.state.y = clampNum(msg.y, 0, WORLD_H);
      if (msg.facing === 'up' || msg.facing === 'down' || msg.facing === 'left' || msg.facing === 'right') {
        c.state.facing = msg.facing;
      }
      c.state.action = msg.action;
      break;
    }

    case 'cast':
      c.state.bobber = { x: clampNum(msg.bx, 0, WORLD_W), y: clampNum(msg.by, 0, WORLD_H) };
      break;

    case 'reel':
      c.state.bobber = null;
      break;

    case 'catch': {
      const species = clean(msg.species, 20);
      const size = clampNum(msg.size, 0, 400);
      c.state.caught++;
      feed(r, 'catch', c.state.name, `dapat ${species} ${Math.round(size)} cm`);

      const key = playerKey(c);
      const prev = r.board.get(key) ?? {
        name: c.state.name, hue: c.state.hue, caught: 0,
        bestSpecies: '', bestCm: 0, species: 0, t: 0, online: true,
      };
      // Name and look are presentation. The stable map key stays the same if
      // either changes, so renaming a profile never creates a second player.
      prev.name = c.state.name;
      prev.hue = c.state.hue;
      prev.caught++;
      prev.t = Date.now();
      prev.species = Math.max(prev.species, clampNum(msg.speciesCount ?? 0, 0, 200));
      if (size > prev.bestCm) {
        prev.bestCm = Math.round(size);
        prev.bestSpecies = species;
      }
      r.board.set(key, prev);
      r.boardDirty = true;
      break;
    }

    case 'sell': {
      // The client tracks its own coins; the server only mirrors the number
      // so other players can see it on the scoreboard.
      break;
    }

    case 'plot': {
      const i = Math.floor(msg.i);
      if (!Number.isFinite(i) || i < 0 || i >= r.plots.length) return;
      const plot = r.plots[i];
      const now = Date.now();
      switch (msg.op) {
        case 'till':
          if (plot.stage === -1) {
            plot.stage = 0;
            plot.crop = null;
            plot.t = now;
            r.plotsDirty = true;
          }
          break;
        case 'plant':
          if (plot.stage === 0 && !plot.crop) {
            plot.crop = clean(msg.crop, 12) || 'tomat';
            plot.stage = 1;
            plot.watered = false;
            plot.by = c.state.name;
            plot.t = now;
            r.plotsDirty = true;
            feed(r, 'farm', c.state.name, `nanam ${plot.crop}`);
          }
          break;
        case 'water':
          if (plot.crop && !plot.watered) {
            plot.watered = true;
            plot.t = now;
            r.plotsDirty = true;
          }
          break;
        case 'harvest':
          if (plot.crop && plot.stage >= CROP_STAGES) {
            feed(r, 'farm', c.state.name, `panen ${plot.crop}`);
            plot.crop = null;
            plot.stage = 0;
            plot.watered = false;
            plot.by = '';
            plot.t = now;
            r.plotsDirty = true;
          }
          break;
      }
      break;
    }

    case 'chat': {
      const now = Date.now();
      if (now - c.lastChat < 500) return; // basic flood guard
      c.lastChat = now;
      const text = clean(msg.text, MAX_CHAT_LEN);
      if (!text) return;
      feed(r, 'chat', c.state.name, text);
      break;
    }
  }
}

function clampNum(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : lo;
  return n < lo ? lo : n > hi ? hi : n;
}

/** One in-game day is DAY_LENGTH_S long, and a crop takes about a third of
 *  it to go from seedling to harvest — long enough to be worth coming back
 *  to, short enough to finish in one sitting after work. */
const STAGE_MS = (DAY_LENGTH_S * 1000) / 12;

setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.clients.size === 0) continue;

    // --- weather drifts slowly and rarely commits to rain
    if (now > r.nextWeather) {
      r.rainTarget = Math.random() < 0.25 ? 0.35 + Math.random() * 0.5 : 0;
      r.nextWeather = now + 90_000 + Math.random() * 180_000;
    }
    r.rain += (r.rainTarget - r.rain) * 0.02;
    if (r.rain < 0.005) r.rain = 0;

    // --- crops advance only while watered; rain waters everything for free
    for (const p of r.plots) {
      if (!p.crop || p.stage < 1 || p.stage >= CROP_STAGES) continue;
      const watered = p.watered || r.rain > 0.25;
      if (!watered) continue;
      if (now - p.t >= STAGE_MS) {
        p.stage++;
        p.t = now;
        p.watered = false;
        r.plotsDirty = true;
      }
    }

    broadcast(r, {
      t: 'snapshot',
      time: roomTime(r),
      rain: r.rain,
      players: [...r.clients].map((c) => c.state),
    });

    if (r.plotsDirty) {
      broadcast(r, { t: 'plots', plots: r.plots });
      r.plotsDirty = false;
    }

    if (r.boardDirty) {
      broadcast(r, { t: 'board', entries: boardEntries(r) });
      r.boardDirty = false;
    }
  }
}, TICK_MS);

/** Drop connections that stopped answering, so ghosts do not linger in a
 *  room and hold a player slot. */
setInterval(() => {
  for (const r of rooms.values()) {
    for (const c of r.clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }
}, 20_000);

async function shutdown(sig: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  // Stop accepting fresh work, then give every Supabase save that already
  // left this process a chance to commit before the process disappears.
  httpServer.close();
  wss.close();
  await store.flush();
  console.log(`[senja] keluar (${sig})`);
  process.exit(0);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    void shutdown(sig).catch((err) => {
      console.warn('[senja] gagal flush profil saat shutdown:', err);
      process.exit(1);
    });
  });
}

console.log(`[senja] server siap di http://localhost:${PORT} (socket di /room)`);
console.log('[senja] profil pemain disimpan di Supabase');
/** The heads-up layer: clock, purse, room code, the activity feed, and the
 *  chat line. Everything is drawn in the same 320x180 space as the game so
 *  the UI is made of the same pixels as the world — a DOM overlay would be
 *  sharper and would look completely wrong. */

import { MAX_CHAT_LEN } from '../../shared/constants';
import { view } from '../engine/view';
import type { BoardEntry, FeedItem } from '../../shared/protocol';
import { C, col01 } from '../art/palette';
import { LINE_H, textWidth, wrapText } from '../art/font';
import type { Draw } from '../render/draw';
import type { Lighting } from '../world/lighting';
import type { Input } from '../engine/input';
import { CROP_INFO } from './farm';
import { SPECIES } from './fishing';
import { GRADES } from './grade';
import { Blend } from '../engine/batch';
import { lookColour } from '../art/character';
import type { LoreFragment } from './lore';
import type { Farm } from './farm';
import type { NetStatus, RoomPlayerSummary } from './net';
import { drawWorldMapPanel } from './world-map-panel';

interface FeedLine {
  item: FeedItem;
  age: number;
}

/** Plain words for the fight number. "1.7" tells a player nothing; "kuat"
 *  tells them to hold on. */
function fightWord(f: number): string {
  if (f < 0.6) return 'lemah';
  if (f < 1.0) return 'sedang';
  if (f < 1.5) return 'kuat';
  if (f < 2.0) return 'berat';
  return 'ganas';
}

/** Trims a label to fit a column, with an ellipsis when it does not. */
function clipTo(text: string, px: number): string {
  if (textWidth(text) <= px) return text;
  let out = text;
  while (out.length > 1 && textWidth(out + '.') > px) out = out.slice(0, -1);
  return out + '.';
}

const FEED_HOLD = 11;
const FEED_FADE = 1.6;

export interface HudCtx {
  coins: number;
  room: string;
  time: number;
  phase: string;
  status: NetStatus;
  playerCount: number;
  caught: number;
  farm: Farm;
  L: Lighting;
  board: BoardEntry[];
  myName: string;
  /** Season name and which day of it, for the clock panel. */
  season: string;
  seasonDay: number;
}

// Board swatches come straight from the character looks, so a row is
// recognisably the person you can see standing across the square.

export class Ui {
  private lines: FeedLine[] = [];
  chatOpen = false;
  chatText = '';
  private helpT = 14;
  /** Set by the frame while the reel bar is up, so the help row gets out of
   *  the way of it. */
  reeling = false;

  /** Set by the frame while a full-screen screen owns the keyboard.
   *
   *  This class listens for keydown on `window` itself, and opening chat calls
   *  `input.capture(true)`, which clears the frame's pressed keys. So without
   *  this the character creator never saw its own Enter: chat swallowed the
   *  key and then wiped it, and the only visible symptom was a confirm that
   *  did nothing. */
  modal = false;
  /** True while a conversation panel is on screen. The controls hint lives
   *  in the same strip of screen, and two panels stacked there is unreadable. */
  talking = false;
  private toast = '';
  private toastT = 0;
  private roomPlayers: RoomPlayerSummary[] = [];
  showHelp = false;
  showPlayers = false;
  showMap = false;

  constructor(private input: Input, private onSend: (text: string) => void) {
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('senja:players', (e) => {
      const detail = (e as CustomEvent<RoomPlayerSummary[]>).detail;
      this.roomPlayers = Array.isArray(detail) ? detail : [];
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.chatOpen) {
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.showMap = !this.showMap;
        this.input.capture(this.showMap);
        if (this.showMap) {
          this.showPlayers = false;
          this.showHelp = false;
          this.showLog = false;
          this.inspecting = false;
          this.showBoard = false;
          this.reading = null;
        }
        return;
      }
      // The map is modal. Swallow gameplay shortcuts while it is open so
      // reading the map cannot make the character walk/fish behind it.
      if (this.showMap) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        this.showPlayers = !this.showPlayers;
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        void this.copyInvite();
        return;
      }
      if (this.modal) return;
      if (e.key === 'Enter' || e.key === 't' || e.key === 'T') {
        // Only open on Enter; t is a shortcut but must not fire while the
        // player is walking with a hand on the keyboard.
        if (e.key === 'Enter') {
          this.chatOpen = true;
          this.chatText = '';
          this.input.capture(true);
          e.preventDefault();
        }
      }
      return;
    }

    e.preventDefault();
    if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'Enter') {
      const text = this.chatText.trim();
      if (text) this.onSend(text);
      this.close();
    } else if (e.key === 'Backspace') {
      this.chatText = this.chatText.slice(0, -1);
    } else if (e.key.length === 1 && this.chatText.length < MAX_CHAT_LEN) {
      this.chatText += e.key;
    }
  }

  /** Copy the exact room URL. A keyboard gesture keeps the Clipboard API
   * permission model happy without introducing a DOM button into pixel UI. */
  private async copyInvite(): Promise<void> {
    const url = `${location.origin}${location.pathname}${location.hash}`;
    try {
      await navigator.clipboard.writeText(url);
      this.say('link room disalin');
    } catch {
      this.say('gagal salin link room');
    }
  }

  private close(): void {
    this.chatOpen = false;
    this.chatText = '';
    this.input.capture(false);
  }

  push(item: FeedItem): void {
    this.lines.push({ item, age: 0 });
    if (this.lines.length > 12) this.lines.shift();
  }

  say(text: string): void {
    this.toast = text;
    this.toastT = 2.4;
  }

  private place = '';
  private placeSub = '';
  private placeT = 0;

  /** Announces arriving somewhere. Fades in, holds, fades out — the only
   *  thing telling the player the world has named regions at all. */
  showPlace(label: string, blurb: string): void {
    this.place = label;
    this.placeSub = blurb;
    this.placeT = 4.2;
  }

  private drawPlace(d: Draw): void {
    const t = this.placeT;
    const a = Math.min(1, Math.min((4.2 - t) * 3, t * 1.4));
    if (a <= 0) return;
    const y = 40;
    d.textCentered(this.place, view.w / 2, y, C.Lantern, C.InkDeep, a);
    const w = Math.max(textWidth(this.place), 40);
    d.rect(view.w / 2 - w / 2 - 6, y + 9, w + 12, 1, C.Amber, a * 0.6);
    if (this.placeSub) {
      const lines = wrapText(this.placeSub, 190);
      for (let i = 0; i < lines.length; i++) {
        d.textCentered(lines[i], view.w / 2, y + 14 + i * LINE_H, C.Pale, C.InkDeep, a * 0.85);
      }
    }
  }

  update(dt: number): void {
    this.inspectT = this.inspecting ? this.inspectT + dt : 0;
    for (const l of this.lines) l.age += dt;
    while (this.lines.length && this.lines[0].age > FEED_HOLD + FEED_FADE) this.lines.shift();
    this.helpT = Math.max(0, this.helpT - dt);
    this.toastT = Math.max(0, this.toastT - dt);
    this.placeT = Math.max(0, this.placeT - dt);
  }

  draw(d: Draw, ctx: HudCtx): void {
    this.drawClock(d, ctx);
    this.drawPurse(d, ctx);
    this.drawRoom(d, ctx);
    if (this.showPlayers) this.drawPlayersPanel(d, ctx);
    this.drawFeed(d);
    if (this.placeT > 0) this.drawPlace(d);
    if (this.chatOpen) this.drawChatInput(d);
    if (this.toastT > 0) {
      const a = Math.min(1, this.toastT * 2);
      d.textCentered(this.toast, view.w / 2, view.h - 46, C.Lantern, C.InkDeep, a);
    }
    // Not while a fish is on. The reel bar sits exactly here, and nobody
    // fighting a Mitos needs telling which key walks.
    if (this.helpT > 0 && !this.chatOpen && !this.talking && !this.reeling && !this.showMap) {
      this.drawHelpHint(d);
    }
    if (this.showHelp) this.drawHelpPanel(d);
    if (this.showLog) this.drawLogPanel(d, ctx);
    if (this.showLog && this.inspecting) this.drawInspect(d, ctx);
    if (this.showBoard) this.drawBoardPanel(d, ctx);
    if (this.reading) this.drawLorePanel(d);
    if (this.showMap) drawWorldMapPanel(d);
  }

  showLog = false;
  /** Which page of the catch journal is open. */
  logPage = 0;
  /** Cursor within the page, 0..32. */
  logSel = 0;
  /** True while the species detail sheet is up. */
  inspecting = false;
  showBoard = false;

  /** The fragment currently being read, if any. */
  reading: LoreFragment | null = null;
  /** How many of the world's fragments have been found. */
  loreRead = 0;
  loreTotal = 0;

  /** A found piece of the valley's history. Deliberately plain: a page, a
   *  heading, and a line telling you how much of the story is still out
   *  there somewhere. */
  private drawLorePanel(d: Draw): void {
    const f = this.reading;
    if (!f) return;
    const w = 230;
    const h = 34 + f.body.length * LINE_H;
    const x = Math.round(view.w / 2 - w / 2);
    const y = Math.round(view.h / 2 - h / 2);
    const accent = f.form === 'terminal' ? C.NeonMint
      : f.form === 'runestone' ? C.Arcane
      : f.form === 'plaque' ? C.Gold
      : C.Amber;

    d.panel(x, y, w, h, 1, accent);
    d.text(f.title, x + 8, y + 6, accent);
    d.rect(x + 6, y + 16, w - 12, 1, C.Slate, 0.6);

    const body = f.form === 'terminal' ? C.NeonMint : C.Pale;
    for (let i = 0; i < f.body.length; i++) {
      d.text(f.body[i], x + 8, y + 21 + i * LINE_H, body, 0.95);
    }

    const count = `${this.loreRead}/${this.loreTotal}`;
    d.text(count, x + w - textWidth(count) - 8, y + 6, C.Mist, 0.8);
    d.textCentered('e tutup', view.w / 2, y + h - 10, C.Mist, C.InkDeep, 0.7);
  }

  /** The people actually connected right now. Kept separate from the
   * community board because a newcomer should appear here before catching
   * their first fish. */
  private drawPlayersPanel(d: Draw, ctx: HudCtx): void {
    const visible = this.roomPlayers.slice(0, 8);
    const extra = Math.max(0, this.roomPlayers.length - visible.length);
    let widest = textWidth(`PEMAIN · ${ctx.room}`);
    for (const p of visible) {
      const label = p.mine ? `${p.name} (kamu)` : p.name;
      widest = Math.max(widest, textWidth(label) + 18);
    }
    const w = Math.min(150, Math.max(94, widest + 16));
    const rows = Math.max(1, visible.length) + (extra > 0 ? 1 : 0);
    const h = 20 + rows * 10;
    const x = 4;
    const y = view.h - 18 - h;

    d.panel(x, y, w, h, 0.92, C.GrassLt);
    d.text(`PEMAIN · ${ctx.room}`, x + 6, y + 5, C.GrassLt, 0.95);
    d.rect(x + 5, y + 15, w - 10, 1, C.Slate, 0.5);

    if (visible.length === 0) {
      const empty = ctx.status === 'connecting' ? 'lagi nyambung...' : 'belum ada yang online';
      d.text(clipTo(empty, w - 12), x + 6, y + 20, C.Mist, 0.8);
      return;
    }

    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const ry = y + 20 + i * 10;
      const label = p.mine ? `${p.name} (kamu)` : p.name;
      d.rect(x + 6, ry + 1, 4, 5, lookColour(p.hue));
      d.rect(x + 13, ry + 2, 3, 3, C.Grass);
      d.text(clipTo(label, w - 25), x + 20, ry, p.mine ? C.Lantern : C.Pale, 0.92);
    }
    if (extra > 0) {
      d.text(`+${extra} lagi`, x + 20, y + 20 + visible.length * 10, C.Mist, 0.8);
    }
  }

  /** The community board: everyone in the room, ranked by how much of the
   *  lake they have actually seen rather than by how long they idled. */
  private drawBoardPanel(d: Draw, ctx: HudCtx): void {
    const w = 236;
    const h = 148;
    const x = Math.round(view.w / 2 - w / 2);
    const y = Math.round(view.h / 2 - h / 2);
    d.panel(x, y, w, h, 1, C.Amber);
    d.text('PAPAN KOMUNITAS', x + 8, y + 6, C.Lantern);
    d.text(ctx.room, x + w - textWidth(ctx.room) - 8, y + 6, C.Mist, 0.85);

    d.rect(x + 6, y + 17, w - 12, 1, C.Slate, 0.6);
    d.text('nama', x + 8, y + 20, C.Mist, 0.75);
    d.text('jenis', x + 108, y + 20, C.Mist, 0.75);
    d.text('rekor', x + 150, y + 20, C.Mist, 0.75);

    if (ctx.board.length === 0) {
      d.textCentered('belum ada yang dapat apa-apa', view.w / 2, y + 44, C.Mist, C.InkDeep, 0.8);
      d.textCentered('lempar kail dulu, nanti muncul di sini', view.w / 2, y + 56, C.Slate, C.InkDeep, 0.7);
    }

    for (let i = 0; i < Math.min(9, ctx.board.length); i++) {
      const e = ctx.board[i];
      const ry = y + 32 + i * 11;
      const mine = e.name === ctx.myName;
      if (mine) d.rect(x + 5, ry - 2, w - 10, 10, C.Slate, 0.35);
      d.text(`${i + 1}`, x + 8, ry, i === 0 ? C.Lantern : C.Slate, 0.9);
      d.rect(x + 20, ry + 1, 4, 5, lookColour(e.hue));
      d.text(e.name, x + 28, ry, mine ? C.Lantern : C.White, 0.95);
      d.text(`${e.species}`, x + 112, ry, C.GrassLt, 0.9);
      d.text(e.bestCm > 0 ? `${e.bestSpecies} ${e.bestCm}` : '-', x + 150, ry, C.Amber, 0.9);
      if (e.online) d.rect(x + w - 12, ry + 2, 3, 3, C.Grass);
    }

    d.textCentered('b tutup', view.w / 2, y + h - 10, C.Mist, C.InkDeep, 0.7);
  }

  /** The catch log: every species, greyed out until you have landed one.
   *  Rows are laid out in two columns so the whole roster fits one screen. */
  /** How many rows a journal page holds. Shared by the drawing and by the
   *  cursor, so the two can never disagree about where the page ends. */
  static readonly LOG_COLS = 3;
  static readonly LOG_ROWS = 11;
  static get LOG_PER_PAGE(): number { return Ui.LOG_COLS * Ui.LOG_ROWS; }

  /** Which species the journal cursor is on right now. */
  selectedSpecies(): (typeof SPECIES)[number] | null {
    const i = this.logPage * Ui.LOG_PER_PAGE + this.logSel;
    return SPECIES[i] ?? null;
  }

  /** The species sheet.
   *
   *  The journal answers "have I caught this"; it cannot answer "what is
   *  it, where does it live, and how big do they get" — which is the
   *  question anybody keeping a list actually has. So E on a row opens the
   *  fish at size, at the best grade you have ever landed it at, with the
   *  numbers that decide where you should go looking for a better one.
   *
   *  Nothing here is revealed for a species you have never caught. A
   *  reference book that tells you the answers before you find them is a
   *  spoiler, not a journal. */
  private drawInspect(d: Draw, ctx: HudCtx): void {
    const sp = this.selectedSpecies();
    if (!sp) return;
    const e = ctx.farm.log[sp.id];
    // Two columns with a hard divide between them. The first pass let the
    // blurb run under the whole panel width and it landed straight across
    // the bite-time bars — the two halves have to own their own space.
    const w = 224;
    const h = 148;
    const x = Math.round(view.w / 2 - w / 2);
    const y = Math.round(view.h / 2 - h / 2);
    const tier = e ? (e.bestGrade ?? 0) : 0;
    const grade = GRADES[Math.min(GRADES.length - 1, Math.max(0, tier))];
    const accent = e ? grade.colour : C.Slate;
    const LEFT = x + 8;
    const RIGHT = x + 110;

    d.panel(x, y, w, h, 1, accent);

    if (!e) {
      d.text('BELUM PERNAH KETANGKAP', LEFT, y + 8, C.Slate);
      d.textCentered('?', view.w / 2, y + 56, C.Slate, C.InkDeep, 0.9);
      d.textCentered(
        'catat sendiri, jangan dikasih tau',
        view.w / 2, y + 78, C.Slate, C.InkDeep, 0.7,
      );
      d.textCentered('e tutup', view.w / 2, y + h - 10, C.Mist, C.InkDeep, 0.7);
      return;
    }

    d.text(sp.label, LEFT, y + 7, C.White);
    d.text(grade.label.toLowerCase(), x + w - textWidth(grade.label) - 8, y + 7, accent, 0.95);
    d.rect(x + 6, y + 17, w - 12, 1, C.Slate, 0.6);
    d.rect(RIGHT - 8, y + 20, 1, h - 32, C.Slate, 0.35);

    // --- left: the fish, swimming, at the best grade you have landed it
    // at. A still sprite in a reference panel reads as a diagram; the same
    // bob the catch card uses reads as an animal.
    const t = this.inspectT;
    const bob = Math.sin(t * 2.4) * 1.5;
    const sway = Math.sin(t * 2.4 - 0.7) * 1.0;
    if (grade.glow > 0) {
      const gs = grade.glow > 32 ? 64 : 32;
      d.sprite(`glow${gs}`, LEFT + 40 - gs / 2, y + 40 - gs / 2, {
        tint: col01(accent), alpha: 0.26 + tier * 0.05, blend: Blend.Add,
      });
    }
    d.sprite(`fishg${tier}_${sp.id}`, LEFT + 20 + sway, y + 29 + bob, { alpha: 1 });

    // --- left: the grade ladder, with the ones you have landed lit.
    d.text('grade kamu', LEFT, y + 60, C.Mist, 0.8);
    for (let i = 0; i < GRADES.length; i++) {
      const gx = LEFT + i * 14;
      const got = i <= tier;
      d.rect(gx, y + 71, 12, 7, GRADES[i].colour, got ? 1 : 0.18);
      if (got) d.rect(gx, y + 71, 12, 1, C.White, 0.5);
    }

    // --- left: what it is. Two lines, inside the left column's width.
    const lines = wrapText(sp.blurb, 92);
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      d.text(lines[i], LEFT, y + 88 + i * LINE_H, C.Mist, 0.85);
    }

    // --- right: the numbers that say where to go looking for a bigger one.
    let ry = y + 24;
    const row = (k: string, v: string, col: C): void => {
      d.text(k, RIGHT, ry, C.Mist, 0.8);
      d.text(v, x + w - textWidth(v) - 8, ry, col, 0.95);
      ry += 11;
    };
    row('rekor kamu', `${e.best} cm`, C.Amber);
    row('ukuran jenis', `${sp.minCm}-${sp.maxCm}`, C.Pale);
    row('sudah dapat', `${e.count}x`, C.Pale);
    row('harga dasar', `${sp.value}`, C.Lantern);
    row('perlawanan', fightWord(sp.fight), C.Pale);

    // --- right: when it bites. Four bars beat four numbers — the shape of
    // the day is the actual answer to "when should I be out here".
    ry += 4;
    d.text('waktu gigit', RIGHT, ry, C.Mist, 0.8);
    ry += 11;
    const peak = Math.max(...sp.weight);
    const PH = ['pagi', 'siang', 'senja', 'malam'];
    for (let i = 0; i < 4; i++) {
      const by = ry + i * 10;
      d.text(PH[i], RIGHT, by, C.Pale, 0.85);
      const bx = RIGHT + 32;
      const bw = x + w - 8 - bx;
      d.rect(bx, by + 1, bw, 5, C.Slate, 0.55);
      const fill = Math.round((sp.weight[i] / peak) * bw);
      const best = sp.weight[i] >= peak - 0.001;
      d.rect(bx, by + 1, fill, 5, best ? C.Lantern : C.Water, 0.95);
    }

    d.textCentered('e tutup', view.w / 2, y + h - 10, C.Mist, C.InkDeep, 0.7);
  }

  /** Seconds the inspect sheet has been open, for its animation. */
  inspectT = 0;

  private drawLogPanel(d: Draw, ctx: HudCtx): void {
    // Paged, because the roster is eighty-six species and a single sheet
    // needed four hundred and seventy pixels of a hundred-and-fifty-pixel
    // panel. Three columns of eleven fits the box exactly; anything that
    // does not fit gets a page rather than being drawn off the bottom edge
    // where nobody can see it.
    const w = 306;
    const h = 156;
    const x = Math.round(view.w / 2 - w / 2);
    const y = Math.round(view.h / 2 - h / 2);
    const ROWS = Ui.LOG_ROWS;
    const perPage = Ui.LOG_PER_PAGE;
    const pages = Math.max(1, Math.ceil(SPECIES.length / perPage));
    const page = ((this.logPage % pages) + pages) % pages;

    d.panel(x, y, w, h, 1, C.Amber);
    d.text('CATATAN TANGKAPAN', x + 8, y + 6, C.Lantern);

    const known = Object.keys(ctx.farm.log).length;
    const label = `${known}/${SPECIES.length}`;
    d.text(label, x + w - textWidth(label) - 8, y + 6, C.Pale, 0.85);

    const from = page * perPage;
    const to = Math.min(SPECIES.length, from + perPage);
    for (let i = from; i < to; i++) {
      const s = SPECIES[i];
      const k = i - from;
      const cx = x + 8 + Math.floor(k / ROWS) * 98;
      const cy = y + 18 + (k % ROWS) * 11;
      const e = ctx.farm.log[s.id];
      if (k === this.logSel) {
        d.rect(cx - 2, cy - 2, 94, 10, C.Amber, 0.22);
      }
      if (e) {
        d.sprite(`fish_${s.id}`, cx, cy - 2, { scale: 1, alpha: 1, dw: 14, dh: 8 });
        // Names are longer than they were and the columns are narrower;
        // clipping beats overlapping the next column.
        d.text(clipTo(s.label, 58), cx + 17, cy, C.White, 0.95);
        d.text(`${e.best}`, cx + 90 - textWidth(`${e.best}`), cy, C.Amber, 0.9);
      } else {
        d.rect(cx + 2, cy + 1, 10, 5, C.Slate, 0.5);
        d.text('- - -', cx + 17, cy, C.Slate, 0.8);
      }
    }

    const nav = pages > 1
      ? `< ${page + 1}/${pages} >   a d halaman   w s pilih   e lihat   j tutup`
      : 'w s pilih   e lihat   j tutup';
    d.textCentered(nav, view.w / 2, y + h - 10, C.Mist, C.InkDeep, 0.7);
  }

  private drawClock(d: Draw, ctx: HudCtx): void {
    // A 24h clock derived from the shared world time — the point is that
    // everyone in the room is looking at the same sky.
    const mins = Math.floor(ctx.time * 24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(Math.floor(mins % 60)).padStart(2, '0');
    const label = `${hh}:${mm}`;

    const x = 4;
    const y = 4;
    // Taller than it was, for the calendar line. A world with a season needs
    // to say which one somewhere the player can find without asking.
    d.panel(x, y, 58, 30, 0.9);
    d.text(label, x + 5, y + 3, C.White);
    d.text(ctx.phase, x + 5, y + 12, C.Amber, 0.9);
    d.text(`${ctx.season} ${ctx.seasonDay}`, x + 5, y + 21, C.Mist, 0.85);

    // A tiny sun/moon arc that mirrors the real one in the sky.
    const cx = x + 44;
    const cy = y + 14;
    const sx = cx + ctx.L.sunX * 8;
    const sy = cy - Math.max(-2, ctx.L.sunY * 9);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      d.rect(cx - 8 + t * 16, cy - Math.sin(t * Math.PI) * 9, 1, 1, C.Slate, 0.5);
    }
    d.rect(sx - 1, sy - 1, 3, 3, ctx.L.night > 0.5 ? C.Pale : C.Lantern);
  }

  private drawPurse(d: Draw, ctx: HudCtx): void {
    const text = `${ctx.coins}`;
    const w = Math.max(44, textWidth(text) + 30);
    const x = view.w - w - 4;
    const y = 4;
    d.panel(x, y, w, 21, 0.9);
    d.rect(x + 5, y + 6, 5, 5, C.Lantern);
    d.rect(x + 6, y + 7, 2, 2, C.SunGlow);
    d.text(text, x + 14, y + 5, C.White);

    const basket = ctx.farm.basketCount;
    if (basket > 0) {
      d.text(`${basket} di keranjang`, x - textWidth(`${basket} di keranjang`) - 6, y + 4, C.Mist, 0.85);
    }
    const crop = ctx.farm.selectedCrop;
    const seeds = ctx.farm.seeds[crop] ?? 0;
    d.text(`${CROP_INFO[crop].label}: ${seeds}`, x + 4, y + 22, C.GrassLt, 0.8);
  }

  private drawRoom(d: Draw, ctx: HudCtx): void {
    const dot = ctx.status === 'online' ? C.Grass : ctx.status === 'connecting' ? C.Amber : C.Slate;
    const label = ctx.status === 'online'
      ? `${ctx.room} · ${ctx.playerCount} · p pemain · c undang`
      : ctx.status === 'connecting' ? 'nyambung...' : 'sendirian';
    const w = textWidth(label) + 15;
    const x = 4;
    const y = view.h - 15;
    d.panel(x, y, w, 12, 0.85);
    d.rect(x + 4, y + 4, 3, 3, dot);
    d.text(label, x + 10, y + 3, C.Pale, 0.9);
  }

  private drawFeed(d: Draw): void {
    const x = 4;
    let y = 30;
    for (const l of this.lines) {
      const fade = l.age < FEED_HOLD ? 1 : Math.max(0, 1 - (l.age - FEED_HOLD) / FEED_FADE);
      if (fade <= 0) continue;
      const { item } = l;
      const who = item.who ? `${item.who}` : '';
      const body = item.tone === 'chat' ? item.text : item.text;
      const color = item.tone === 'catch' ? C.Lantern
        : item.tone === 'farm' ? C.GrassLt
        : item.tone === 'chat' ? C.White
        : C.Mist;

      const lines = wrapText(item.tone === 'chat' ? `${who}: ${body}` : `${who} ${body}`, 150);
      for (const line of lines) {
        d.textShadow(line, x, y, color, C.InkDeep, fade * 0.95);
        y += LINE_H;
      }
      y += 1;
    }
  }

  private drawChatInput(d: Draw): void {
    const y = view.h - 29;
    d.panel(2, y, view.w - 4, 13, 1, C.Amber);
    const caret = Math.floor(performance.now() / 400) % 2 === 0 ? '_' : ' ';
    const shown = this.chatText.slice(-46);
    d.text(`> ${shown}${caret}`, 6, y + 3, C.White);
  }

  private drawHelpHint(d: Draw): void {
    const a = Math.min(1, this.helpT / 2);
    d.textCentered(
      'wasd jalan · spasi mancing · e aksi · k peta · h bantuan',
      view.w / 2, view.h - 26, C.Pale, C.InkDeep, a * 0.9,
    );
  }

  private drawHelpPanel(d: Draw): void {
    const w = 200;
    const h = 132;
    const x = Math.round(view.w / 2 - w / 2);
    const y = Math.round(view.h / 2 - h / 2);
    d.panel(x, y, w, h, 1, C.Amber);
    d.text('CARA MAIN', x + 8, y + 7, C.Lantern);
    const rows: Array<[string, string]> = [
      ['wasd / panah', 'jalan'],
      ['spasi', 'lempar kail, tarik, gulung'],
      ['e', 'cangkul, tanam, siram, panen, jual'],
      ['q', 'ganti bibit'],
      ['enter', 'ngobrol'],
      ['k', 'peta dunia'],
      ['j', 'catatan tangkapan'],
      ['b', 'papan komunitas'],
      ['v', 'naik / turun perahu'],
      ['p', 'lihat pemain online'],
      ['c', 'salin link room'],
      ['g', 'ganti karakter'],
      ['- / =', 'zoom keluar / masuk'],
      ['m', 'suara on/off'],
      ['h', 'tutup panel ini'],
    ];
    let ry = y + 20;
    for (const [k, v] of rows) {
      d.text(k, x + 8, ry, C.Amber, 0.95);
      d.text(v, x + 68, ry, C.Pale, 0.9);
      ry += LINE_H + 1;
    }
    d.text('kirim linknya ke temen — langsung satu room', x + 8, y + h - 11, C.Mist, 0.8);
  }
}

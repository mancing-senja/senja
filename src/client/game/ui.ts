/** The heads-up layer: clock, purse, room code, the activity feed, and the
 *  chat line. Everything is drawn in the same 320x180 space as the game so
 *  the UI is made of the same pixels as the world — a DOM overlay would be
 *  sharper and would look completely wrong. */

import { MAX_CHAT_LEN } from '../../shared/constants';
import { view } from '../engine/view';
import type { BoardEntry, FeedItem } from '../../shared/protocol';
import { C } from '../art/palette';
import { LINE_H, textWidth, wrapText } from '../art/font';
import type { Draw } from '../render/draw';
import type { Lighting } from '../world/lighting';
import type { Input } from '../engine/input';
import { CROP_INFO } from './farm';
import { SPECIES } from './fishing';
import { lookColour } from '../art/character';
import type { LoreFragment } from './lore';
import type { Farm } from './farm';
import type { NetStatus } from './net';

interface FeedLine {
  item: FeedItem;
  age: number;
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
}

// Board swatches come straight from the character looks, so a row is
// recognisably the person you can see standing across the square.

export class Ui {
  private lines: FeedLine[] = [];
  chatOpen = false;
  chatText = '';
  private helpT = 14;
  private toast = '';
  private toastT = 0;
  showHelp = false;

  constructor(private input: Input, private onSend: (text: string) => void) {
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.chatOpen) {
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
    this.drawFeed(d);
    if (this.placeT > 0) this.drawPlace(d);
    if (this.chatOpen) this.drawChatInput(d);
    if (this.toastT > 0) {
      const a = Math.min(1, this.toastT * 2);
      d.textCentered(this.toast, view.w / 2, view.h - 46, C.Lantern, C.InkDeep, a);
    }
    if (this.helpT > 0 && !this.chatOpen) this.drawHelpHint(d);
    if (this.showHelp) this.drawHelpPanel(d);
    if (this.showLog) this.drawLogPanel(d, ctx);
    if (this.showBoard) this.drawBoardPanel(d, ctx);
    if (this.reading) this.drawLorePanel(d);
  }

  showLog = false;
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
  private drawLogPanel(d: Draw, ctx: HudCtx): void {
    const w = 250;
    const h = 156;
    const x = Math.round(view.w / 2 - w / 2);
    const y = Math.round(view.h / 2 - h / 2);
    d.panel(x, y, w, h, 1, C.Amber);
    d.text('CATATAN TANGKAPAN', x + 8, y + 6, C.Lantern);

    const known = Object.keys(ctx.farm.log).length;
    const total = SPECIES.length;
    const label = `${known}/${total}`;
    d.text(label, x + w - textWidth(label) - 8, y + 6, C.Pale, 0.85);

    const perCol = Math.ceil(SPECIES.length / 2);
    for (let i = 0; i < SPECIES.length; i++) {
      const s = SPECIES[i];
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const cx = x + 8 + col * 120;
      const cy = y + 18 + row * 11;
      const e = ctx.farm.log[s.id];
      if (e) {
        d.sprite(`fish_${s.id}`, cx, cy - 2, { scale: 1, alpha: 1, dw: 14, dh: 8 });
        d.text(s.label, cx + 17, cy, C.White, 0.95);
        d.text(`${e.best}`, cx + 104 - textWidth(`${e.best}`), cy, C.Amber, 0.9);
      } else {
        d.rect(cx + 2, cy + 1, 10, 5, C.Slate, 0.5);
        d.text('- - -', cx + 17, cy, C.Slate, 0.8);
      }
    }
    d.textCentered('j tutup', view.w / 2, y + h - 10, C.Mist, C.InkDeep, 0.7);
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
    d.panel(x, y, 58, 21, 0.9);
    d.text(label, x + 5, y + 3, C.White);
    d.text(ctx.phase, x + 5, y + 12, C.Amber, 0.9);

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
      ? `${ctx.room} · ${ctx.playerCount}`
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
      'wasd jalan · spasi mancing · e pegang · j catatan · h bantuan',
      view.w / 2, view.h - 26, C.Pale, C.InkDeep, a * 0.9,
    );
  }

  private drawHelpPanel(d: Draw): void {
    const w = 200;
    const h = 114;
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
      ['j', 'catatan tangkapan'],
      ['b', 'papan komunitas'],
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
    d.text('link room di address bar — kirim ke temen', x + 8, y + h - 11, C.Mist, 0.8);
  }
}

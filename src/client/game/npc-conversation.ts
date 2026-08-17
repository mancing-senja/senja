import type { NpcTalkRequest, NpcTalkResponse, NpcTalkTurn } from '../../shared/npc-ai';
import { C } from '../art/palette';
import { LINE_H, textWidth, wrapText } from '../art/font';
import { PORTRAIT_H, PORTRAIT_W, portraitKey, type Mood as PortraitMood } from '../art/portrait';
import { view } from '../engine/view';
import type { Draw } from '../render/draw';
import { moodFor, remember, speak, type Mind, type TalkCtx } from './dialogue';
import { cacheMinds } from './mind-sync';

const PANEL_HOLD = 6.5;
// Temporary production test switch. While true, the same NPC can be queried
// repeatedly on the same in-game day and test requests do not mutate
// relationship counters/cooldowns or persist new AI-created memories.
const NPC_AI_REPEAT_TESTING = true;
const NPC_AI_CLIENT_TIMEOUT_MS = 20_000;
let active: NpcConversation | null = null;

/** One NPC's conversation UI/state. Kept outside Npc movement so the same
 * actor can keep its old route/animation code while dialogue becomes async. */
export class NpcConversation {
  private line = '';
  private choices: string[] = [];
  private selected = 0;
  private loading = false;
  private history: NpcTalkTurn[] = [];
  private ctx: TalkCtx | null = null;
  private fallback = '';
  private _sayT = 0;

  constructor(
    private readonly name: string,
    private readonly hue: number,
    private readonly mind: Mind,
  ) {}

  get sayT(): number {
    return this._sayT;
  }

  get talking(): boolean {
    return this._sayT > 0;
  }

  get hasChoices(): boolean {
    return !this.loading && this.choices.length > 0;
  }

  /** True means the owner must stand still this frame. */
  update(dt: number): boolean {
    if (this._sayT <= 0) return false;
    if (Number.isFinite(this._sayT)) {
      this._sayT = Math.max(0, this._sayT - dt);
      if (this._sayT <= 0 && active === this) active = null;
    }
    return true;
  }

  start(ctx: TalkCtx): void {
    if (active && active !== this) active.close();

    // Normal gameplay allows one full conversation per NPC per in-game day.
    // This is intentionally bypassed while testing provider reliability so E
    // can immediately start another AI request against the same nearby NPC.
    if (!NPC_AI_REPEAT_TESTING && this.mind.lastDay === ctx.day && this.mind.met > 0) {
      active = this;
      this.ctx = ctx;
      this.line = this.mind.personality.warmth > 0.55
        ? 'Kita lanjut ngobrol besok ya. Aku masih ada yang mesti dikerjakan.'
        : 'Cukup dulu hari ini. Besok lagi.';
      this.choices = [];
      this.loading = false;
      this._sayT = 3.8;
      return;
    }

    active = this;
    this.ctx = ctx;
    this.history = [];
    this.selected = 0;
    this.mind.mood = moodFor(this.mind, ctx.day);
    // Generate the deterministic line before incrementing `met`: first-meet
    // and absence callbacks depend on the old relationship state. It is used
    // only if the network/model path fails.
    this.fallback = speak(this.mind, ctx);
    if (!NPC_AI_REPEAT_TESTING) {
      this.mind.met++;
      this.mind.lastDay = ctx.day;
      cacheMinds([this.mind]);
    }
    this.line = '...';
    this.choices = [];
    this.loading = true;
    this._sayT = Infinity;
    void this.requestTurn();
  }

  choose(index: number): void {
    if (active !== this || this.loading || !this.ctx) return;
    const choice = this.choices[index];
    if (!choice) return;
    this.history.push({ npc: this.line, player: choice });
    this.selected = 0;
    this.line = '...';
    this.choices = [];
    this.loading = true;
    this._sayT = Infinity;
    void this.requestTurn();
  }

  chooseSelected(): void {
    this.choose(this.selected);
  }

  moveSelection(delta: number): void {
    if (active !== this || this.loading || this.choices.length === 0) return;
    this.selected = (this.selected + delta + this.choices.length) % this.choices.length;
  }

  close(): void {
    this._sayT = 0;
    this.loading = false;
    this.choices = [];
    if (active === this) active = null;
  }

  draw(d: Draw, xWorld: number, yWorld: number, playerX: number, playerY: number): void {
    if (this._sayT <= 0) return;
    if (Math.hypot(xWorld - playerX, yWorld - playerY) > 90) {
      this.close();
      return;
    }
    const a = Number.isFinite(this._sayT)
      ? Math.min(1, Math.min(this._sayT * 3, (PANEL_HOLD - Math.min(PANEL_HOLD, this._sayT)) * 5 + 0.08))
      : 1;
    if (a <= 0) return;

    const w = Math.min(view.w - 20, 350);
    const x = Math.round((view.w - w) / 2);
    const textW = w - PORTRAIT_W - 26;
    const dialogueLines = wrapText(this.loading ? '...' : this.line, textW);
    const choiceLines: Array<{ text: string; selected: boolean }> = [];
    if (!this.loading) {
      for (let i = 0; i < this.choices.length; i++) {
        const prefix = i === this.selected ? '> ' : '  ';
        const numbered = `${i + 1}. ${this.choices[i]}`;
        const wrapped = wrapText(numbered, textW - 8);
        for (let j = 0; j < wrapped.length; j++) {
          choiceLines.push({ text: `${j === 0 ? prefix : '  '}${wrapped[j]}`, selected: i === this.selected });
        }
      }
    }
    const hintRows = this.choices.length > 0 ? 1 : 0;
    const totalRows = dialogueLines.length + (choiceLines.length ? 1 + choiceLines.length : 0) + hintRows;
    const h = Math.max(46, totalRows * LINE_H + 20);
    const y = view.h - h - 6;

    d.panel(x, y, w, h, a, C.Amber);
    const nw = textWidth(this.name) + 12;
    d.panel(x + 4, y - 12, nw, 13, a, C.Amber);
    d.text(this.name, x + 10, y - 8, C.Lantern, a);

    let ty = y + 8;
    for (const line of dialogueLines) {
      d.text(line, x + 10, ty, C.White, a * 0.97);
      ty += LINE_H;
    }
    if (choiceLines.length) {
      ty += 2;
      for (const choice of choiceLines) {
        d.text(choice.text, x + 10, ty, choice.selected ? C.Lantern : C.Pale, a * 0.96);
        ty += LINE_H;
      }
      d.text('W/S pilih · E jawab · 1/2/3 cepat', x + 10, ty + 1, C.Mist, a * 0.78);
    }

    const px = x + w - PORTRAIT_W - 4;
    const py = view.h - PORTRAIT_H - 2;
    d.sprite(portraitKey(this.hue, this.portraitMood), px + 1, py + 2, {
      tint: [0, 0, 0], flat: true, alpha: a * 0.35,
    });
    d.sprite(portraitKey(this.hue, this.portraitMood), px, py, { alpha: a });
  }

  private async requestTurn(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const request: NpcTalkRequest = {
      npc: {
        id: this.mind.id,
        name: this.name,
        register: this.mind.register,
        personality: this.mind.personality,
        mood: this.mind.mood,
        mind: {
          memories: this.mind.memories,
          met: this.mind.met,
          lastDay: this.mind.lastDay,
        },
      },
      world: {
        day: ctx.day,
        phase: ctx.phase,
        rain: ctx.rain,
        place: ctx.place,
        playerName: ctx.playerName,
        lastCatch: ctx.lastCatch,
        recordCm: ctx.recordCm,
        recordLabel: ctx.recordLabel,
        species: ctx.species,
        coins: ctx.coins,
        others: ctx.others,
      },
      history: this.history,
    };

    try {
      const response = await fetch('/api/npc-talk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(NPC_AI_CLIENT_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`npc-talk ${response.status}`);
      const turn = await response.json() as NpcTalkResponse;
      if (active !== this || this.ctx !== ctx) return;
      this.applyTurn(turn, ctx.day);
    } catch (err) {
      console.warn('[senja] dialog AI fallback:', err);
      if (active !== this || this.ctx !== ctx) return;
      // On the first failed turn the old deterministic engine gives a fully
      // contextual line. If a later turn fails, end gracefully rather than
      // pretending the player's chosen answer never happened.
      this.line = this.history.length === 0
        ? this.fallback
        : 'Hmm. Kita sambung lain kali saja, ya.';
      this.choices = [];
      this.loading = false;
      this._sayT = PANEL_HOLD;
    }
  }

  private applyTurn(turn: NpcTalkResponse, day: number): void {
    const line = clean(turn.line, 360);
    const choices = Array.isArray(turn.choices)
      ? turn.choices.map((c) => clean(c, 100)).filter(Boolean).slice(0, 3)
      : [];
    this.line = line || this.fallback;
    this.loading = false;

    if (!NPC_AI_REPEAT_TESTING && turn.memory && (turn.memory.kind === 'promise' || turn.memory.kind === 'gift')) {
      const subject = clean(turn.memory.subject, 80);
      if (subject) {
        remember(this.mind, {
          kind: turn.memory.kind,
          day,
          weight: Math.max(1, Math.min(5, Number(turn.memory.weight) || 2)),
          subject,
        });
        cacheMinds([this.mind]);
      }
    }

    if (turn.end || choices.length < 2) {
      this.choices = [];
      this._sayT = PANEL_HOLD;
    } else {
      this.choices = choices;
      this.selected = 0;
      this._sayT = Infinity;
    }
  }

  private get portraitMood(): PortraitMood {
    if (this.mind.mood > 0.3) return 'warm';
    if (this.mind.mood < -0.3) return 'cold';
    return 'neutral';
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!active || !active.talking || !active.hasChoices) return;
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      active.moveSelection(-1);
    } else if (k === 's' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopImmediatePropagation();
      active.moveSelection(1);
    } else if (k === 'e' || e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      active.chooseSelected();
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      e.preventDefault();
      e.stopImmediatePropagation();
      active.choose(Number(e.key) - 1);
    }
  });
}

/** Keyboard + pointer state. Chat steals the keyboard while it is open,
 *  so movement keys are cleared on capture to avoid a stuck walk. */

export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();
  /** When true, game keybinds are ignored (text field has focus). */
  captured = false;

  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mouseClicked = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = norm(e.key);
      if (!this.captured && GAME_KEYS.has(k)) e.preventDefault();
      if (this.captured) return;
      this.down.add(k);
      this.pressedThisFrame.add(k);
    });

    window.addEventListener('keyup', (e) => {
      const k = norm(e.key);
      this.down.delete(k);
      this.releasedThisFrame.add(k);
    });

    // Losing focus mid-walk would otherwise leave the key latched down.
    window.addEventListener('blur', () => this.clear());

    target.addEventListener('pointermove', (e) => {
      const r = target.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    target.addEventListener('pointerdown', () => {
      this.mouseDown = true;
      this.mouseClicked = true;
    });
    window.addEventListener('pointerup', () => {
      this.mouseDown = false;
    });
  }

  capture(on: boolean): void {
    this.captured = on;
    if (on) this.clear();
  }

  clear(): void {
    this.down.clear();
    this.pressedThisFrame.clear();
  }

  held(...keys: string[]): boolean {
    return keys.some((k) => this.down.has(k));
  }

  pressed(...keys: string[]): boolean {
    return keys.some((k) => this.pressedThisFrame.has(k));
  }

  /** Call once at the end of each frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mouseClicked = false;
  }

  /** Normalized movement axis, already clamped to unit length. */
  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.held('a', 'arrowleft')) x -= 1;
    if (this.held('d', 'arrowright')) x += 1;
    if (this.held('w', 'arrowup')) y -= 1;
    if (this.held('s', 'arrowdown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = Math.SQRT1_2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }
}

function norm(k: string): string {
  return k.length === 1 ? k.toLowerCase() : k.toLowerCase();
}

const GAME_KEYS = new Set([
  'w', 'a', 's', 'd',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  ' ', 'e', 'q', 'tab', 'enter', 'b',
]);

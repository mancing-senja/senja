import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`anchor missing: ${label}`);
  return source.replace(oldText, newText);
}

const fishingPath = 'src/client/game/fishing.ts';
let fishing = readFileSync(fishingPath, 'utf8');

fishing = replaceOnce(
  fishing,
  `  private tackleWarning = '';
  private hookText = '';
`,
  `  private tackleWarning = '';
  /** Live coaching only; never changes drag automatically. */
  private dragAdvice = '';
  /** High-stick and lateral leverage are readable physical load, not RNG. */
  private highStick = 0;
  private sideLoad = 0;
  private hookText = '';
`,
  'fight coaching fields',
);

fishing = replaceOnce(
  fishing,
  `  get lineFeel(): { tension: number; rodAngle: number; dragSlip: number } {
    return this.state === 'reel'
      ? { tension: this.tension, rodAngle: this.rodAngle, dragSlip: this.dragSlip }
      : { tension: 0.35, rodAngle: 0.35, dragSlip: 0 };
  }
`,
  `  get lineFeel(): {
    tension: number; rodAngle: number; dragSlip: number;
    highStick: number; sideLoad: number;
  } {
    return this.state === 'reel'
      ? {
          tension: this.tension, rodAngle: this.rodAngle, dragSlip: this.dragSlip,
          highStick: this.highStick, sideLoad: this.sideLoad,
        }
      : { tension: 0.35, rodAngle: 0.35, dragSlip: 0, highStick: 0, sideLoad: 0 };
  }
`,
  'line feel debug',
);

fishing = replaceOnce(
  fishing,
  `    hookFit: number; habitat: number; fishX: number; fishY: number;
    hookHold: number; escape: string; warning: string;
    style: string; zone: number; veil: boolean;
`,
  `    hookFit: number; habitat: number; fishX: number; fishY: number;
    hookHold: number; escape: string; warning: string;
    dragAdvice: string; highStick: number; sideLoad: number;
    style: string; zone: number; veil: boolean;
`,
  'reel debug type',
);

fishing = replaceOnce(
  fishing,
  `      hookHold: this.hookHold,
      escape: this.escapeT > 0 ? this.escapeName : '',
      warning: this.tackleWarning,
      style: this.style.id,
`,
  `      hookHold: this.hookHold,
      escape: this.escapeT > 0 ? this.escapeName : '',
      warning: this.tackleWarning,
      dragAdvice: this.dragAdvice,
      highStick: this.highStick,
      sideLoad: this.sideLoad,
      style: this.style.id,
`,
  'reel debug values',
);

fishing = replaceOnce(
  fishing,
  `        const elasticCushion = this.lineStretch * 0.30;
        const lineLoad = rawLineLoad * (1 - elasticCushion);
        const hookLeverage = 1 + Math.max(0, 1 - this.hookFit) * 0.34;
        const hookLoad = transmitted * (1 - elasticCushion * 0.75) * (
          1 + (this.style.id === 'lincah' || this.style.id === 'menggetar' ? 0.08 : 0)
        ) * hookLeverage;

        // Reel drag protects the weakest link by letting line leave the spool
        // before the line itself reaches full failure load. Tighter drag lands
        // fish faster but transfers more shock into rod/hook.
        const drag = dragStats();
        const dragLimit = lineCap * drag.hold;
        const overDrag = Math.max(0, lineLoad - dragLimit);
        this.dragSlip = clamp01(overDrag / Math.max(0.12, dragLimit * 0.55));
        const slippedLineLoad = lineLoad - overDrag * drag.slip;
        const slippedRodLoad = rawLoad - overDrag * drag.slip * 0.55;
        const slippedHookLoad = hookLoad - overDrag * drag.slip * 0.45;
`,
  `        const elasticCushion = this.lineStretch * 0.30;

        // High-sticking is a real setup mistake now. Holding a loaded rod near
        // vertical bends the blank at a worse leverage angle; a stiff Heavy
        // action feels it most. Lowering the rod transfers pressure back into
        // the line instead of silently giving the player free lift power.
        this.highStick = clamp01((this.rodAngle - 0.74) / 0.26)
          * clamp01((this.tension - 0.68) / 0.32);
        const highStickPenalty = action.id === 'heavy' ? 0.22
          : action.id === 'light' ? 0.12 : 0.17;
        const rawRodLoad = rawLoad * (1 + this.highStick * highStickPenalty);

        // A fish pulling sideways also works the hook as a lever. The effect
        // stays modest because the player has no separate left/right control;
        // it exists to make violent lateral runs/headshakes physically distinct,
        // not to add an invisible punishment.
        const sideXLoad = -this.castUy;
        const sideYLoad = this.castUx;
        const lateralOffset = Math.abs(
          this.fishOffsetX * sideXLoad + this.fishOffsetY * sideYLoad,
        );
        this.sideLoad = clamp01(lateralOffset / 10);

        const lineLoad = rawLineLoad * (1 - elasticCushion);
        const hookLeverage = 1 + Math.max(0, 1 - this.hookFit) * 0.34;
        const sideHookLeverage = 1 + this.sideLoad * 0.08 + this.highStick * 0.05;
        const hookLoad = transmitted * (1 - elasticCushion * 0.75) * (
          1 + (this.style.id === 'lincah' || this.style.id === 'menggetar' ? 0.08 : 0)
        ) * hookLeverage * sideHookLeverage;

        // Reel drag protects the weakest link by letting line leave the spool
        // before the line itself reaches full failure load. Tighter drag lands
        // fish faster but transfers more shock into rod/hook.
        const drag = dragStats();
        const dragLimit = lineCap * drag.hold;
        const overDrag = Math.max(0, lineLoad - dragLimit);
        this.dragSlip = clamp01(overDrag / Math.max(0.12, dragLimit * 0.55));
        const slippedLineLoad = lineLoad - overDrag * drag.slip;
        const slippedRodLoad = rawRodLoad - overDrag * drag.slip * 0.55;
        const slippedHookLoad = hookLoad - overDrag * drag.slip * 0.45;
`,
  'high stick physics',
);

fishing = replaceOnce(
  fishing,
  `        this.tackleWarning = '';
        const spoolPct = this.lineOut / Math.max(0.1, line.capacity);
        if (this.hookHold < 0.38) {
`,
  `        this.tackleWarning = '';
        const spoolPct = this.lineOut / Math.max(0.1, line.capacity);

        // Contextual drag coaching never moves the reel for the player. It
        // only recommends the *next* F preset, so every suggestion is one tap:
        // Kencang -> Longgar under shock, Longgar -> Seimbang once stable,
        // Seimbang -> Kencang only when the fish is tired or spool is urgent.
        const overload = Math.max(rodRatio, lineRatio, hookRatio);
        const shockActive = this.escapeT > 0 || this.counterT > 0 || this.reserveBurstT > 0;
        const safeRecovery = !shockActive
          && !this.snagged
          && this.hookHold > 0.56
          && overload < 0.98
          && this.tension >= 0.24
          && this.tension <= 0.80;
        const finishWindow = !nearBank
          && safeRecovery
          && this.progress >= 0.70
          && this.fishStamina <= 0.50
          && spoolPct < 0.64;
        const spoolUrgent = spoolPct >= 0.84
          && !shockActive
          && this.hookHold > 0.58
          && overload < 1.02;
        this.dragAdvice = '';
        if (
          drag.id === 'kencang'
          && (shockActive || this.hookHold < 0.56 || overload >= 1.03)
        ) {
          this.dragAdvice = 'F: drag longgar · redam hentakan';
        } else if (drag.id === 'longgar' && safeRecovery && this.progress >= 0.46) {
          this.dragAdvice = 'F: drag seimbang · mulai ambil line';
        } else if (drag.id === 'seimbang' && (finishWindow || spoolUrgent)) {
          this.dragAdvice = spoolUrgent
            ? 'F: drag kencang · spool menipis'
            : 'F: drag kencang · ikan sudah lelah';
        }

        if (this.hookHold < 0.38) {
`,
  'drag coaching calculation',
);

fishing = replaceOnce(
  fishing,
  `        } else if (this.escapeT > 0) {
          this.tackleWarning = this.escapeName;
        } else if (this.counterT > 0) {
          this.tackleWarning = 'ikan melawan tekanan — turunkan joran';
        } else if (this.reserveBurstT > 0) {
          this.tackleWarning = 'tenaga terakhir — biarkan drag kerja';
`,
  `        } else if (this.escapeT > 0) {
          this.tackleWarning = this.dragAdvice
            ? \`${'${this.escapeName}'} · ${'${this.dragAdvice}'}\`
            : this.escapeName;
        } else if (this.counterT > 0) {
          this.tackleWarning = this.dragAdvice
            ? \`ikan melawan tekanan · ${'${this.dragAdvice}'}\`
            : 'ikan melawan tekanan — turunkan joran';
        } else if (this.reserveBurstT > 0) {
          this.tackleWarning = this.dragAdvice
            ? \`tenaga terakhir · ${'${this.dragAdvice}'}\`
            : 'tenaga terakhir — biarkan drag kerja';
`,
  'shock coaching warnings',
);

fishing = replaceOnce(
  fishing,
  `        } else if (this.landingT > 0.05 || (nearBank && landingSafe)) {
          this.tackleWarning = this.tension > 0.82
            ? 'dekat tepi — jangan angkat paksa'
            : 'dekat tepi — tahan stabil, serok pelan';
        } else if (recoveryActive && this.pumpBonus >= 0.42) {
`,
  `        } else if (this.highStick > 0.52 && rodRatio > 0.82) {
          this.tackleWarning = 'high-stick — turunkan joran, jangan tegakkan penuh';
        } else if (this.dragAdvice) {
          this.tackleWarning = this.dragAdvice;
        } else if (this.landingT > 0.05 || (nearBank && landingSafe)) {
          this.tackleWarning = this.tension > 0.82
            ? 'dekat tepi — jangan angkat paksa'
            : 'dekat tepi — tahan stabil, serok pelan';
        } else if (recoveryActive && this.pumpBonus >= 0.42) {
`,
  'high stick and drag warning priority',
);

fishing = replaceOnce(
  fishing,
  `    this.hookWear = 0;
    this.tackleWarning = '';
  }
`,
  `    this.hookWear = 0;
    this.tackleWarning = '';
    this.dragAdvice = '';
    this.highStick = 0;
    this.sideLoad = 0;
  }
`,
  'stress reset',
);

writeFileSync(fishingPath, fishing);

const smokePath = 'scripts/smoke.mjs';
let smoke = readFileSync(smokePath, 'utf8');
smoke = replaceOnce(
  smoke,
  `    || typeof fightInfo.reel.escape !== 'string'
  ) {
`,
  `    || typeof fightInfo.reel.escape !== 'string'
    || typeof fightInfo.reel.dragAdvice !== 'string'
    || typeof fightInfo.reel.highStick !== 'number'
    || typeof fightInfo.reel.sideLoad !== 'number'
  ) {
`,
  'smoke reel coaching fields',
);
smoke = replaceOnce(
  smoke,
  `    || typeof info.lineFeel.dragSlip !== 'number'
  ) {
`,
  `    || typeof info.lineFeel.dragSlip !== 'number'
    || typeof info.lineFeel.highStick !== 'number'
    || typeof info.lineFeel.sideLoad !== 'number'
  ) {
`,
  'smoke line feel leverage fields',
);
writeFileSync(smokePath, smoke);

const readmePath = 'README.md';
let readme = readFileSync(readmePath, 'utf8');
const marker = '## Drag coaching & rod leverage';
if (!readme.includes(marker)) {
  readme += `\n\n${marker}\n\n- **High-stick sekarang fisik:** joran yang hampir tegak saat tension tinggi menambah beban blank, terutama Action Heavy. Turunkan joran untuk melepas leverage buruk.\n- **Tarikan lateral ikut bekerja di kail:** run/headshake/cover pull memberi leverage kecil pada hook tanpa menambah kontrol arah baru.\n- **F tetap satu tombol drag:** game hanya memberi saran preset berikutnya (Longgar → Seimbang → Kencang) sesuai shock, spool, stamina, dan load. Drag tidak pernah berubah otomatis.\n- **Coaching tidak mengganti failure model:** senar/joran/kail tetap gagal karena overload berkelanjutan yang sudah diberi warning, bukan RNG instan.\n`;
}
writeFileSync(readmePath, readme);

console.log('drag coaching + rod leverage pass applied');

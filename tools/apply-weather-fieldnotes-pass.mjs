import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`anchor missing: ${label}`);
  return source.replace(oldText, newText);
}

const fishingPath = 'src/client/game/fishing.ts';
let fishing = readFileSync(fishingPath, 'utf8');

fishing = replaceOnce(
  fishing,
  `    // Rain is part of the same world the player can see. It never summons an\n    // impossible fish; it only reshapes the pool that this spot/time already\n    // allows. Light-active fish wake up in rain, while strong current fish get\n    // a smaller bonus where runoff is actually moving water.\n    const rain01 = clamp01(rain);\n    const weatherStyle = styleFor(s);\n    const surfaceActive = s.maxCm <= 42\n      && (weatherStyle.id === 'lincah' || weatherStyle.id === 'menggetar');\n    const currentFish = spot.current >= 0.45\n      && (weatherStyle.id === 'lari' || weatherStyle.id === 'menyelam' || s.fight >= 1.25);\n    if (surfaceActive) w *= 1 + rain01 * 0.28;\n    if (currentFish) w *= 1 + rain01 * 0.18;\n    if (deep > 0.72 && rain01 > 0.65) w *= 0.96;\n\n    // Feeding windows are readable combinations of conditions already in the\n`,
  `    // Rain is part of the same world the player can see. It never summons an\n    // impossible fish; it only reshapes the pool that this spot/time already\n    // allows. The helper is shared with the field journal so learned weather\n    // notes can never drift away from the actual roll.\n    const weather = weatherResponse(s, spot, rain);\n    const surfaceActive = weather.surfaceActive;\n    const currentFish = weather.currentFish;\n    w *= weather.mul;\n\n    // Feeding windows are readable combinations of conditions already in the\n`,
  'weather roll integration',
);

fishing = replaceOnce(
  fishing,
  `function rollSpecies(\n  time: number, depth01: number, spot: Spot, district: District | null,\n`,
  `interface SpeciesWeatherResponse {\n  mul: number;\n  surfaceActive: boolean;\n  currentFish: boolean;\n}\n\nfunction weatherResponse(fish: Species, spot: Spot, rain: number): SpeciesWeatherResponse {\n  const rain01 = clamp01(rain);\n  const weatherStyle = styleFor(fish);\n  const deep = Math.min(1, fish.maxCm / 90);\n  const surfaceActive = fish.maxCm <= 42\n    && (weatherStyle.id === 'lincah' || weatherStyle.id === 'menggetar');\n  const currentFish = spot.current >= 0.45\n    && (weatherStyle.id === 'lari' || weatherStyle.id === 'menyelam' || fish.fight >= 1.25);\n  let mul = 1;\n  if (surfaceActive) mul *= 1 + rain01 * 0.28;\n  if (currentFish) mul *= 1 + rain01 * 0.18;\n  if (deep > 0.72 && rain01 > 0.65) mul *= 0.96;\n  return { mul, surfaceActive, currentFish };\n}\n\n/** Public notebook seam: exactly the same weather multiplier used by RNG. */\nexport function weatherWeightForSpecies(fish: Species, spot: Spot, rain: number): number {\n  return weatherResponse(fish, spot, rain).mul;\n}\n\nfunction rollSpecies(\n  time: number, depth01: number, spot: Spot, district: District | null,\n`,
  'weather response helper',
);

fishing = replaceOnce(
  fishing,
  `  private nibbleMotion = 2.2;\n  private nibbleText = 'ada gerakan...';\n`,
  `  private nibbleMotion = 2.2;\n  private nibbleText = 'ada gerakan...';\n  /** Rain/turbidity can mask tiny surface tells, but never the committed bite. */\n  private nibbleClarity = 1;\n  private weatherCue = '';\n`,
  'nibble clarity fields',
);

fishing = replaceOnce(
  fishing,
  `    dragAdvice: string; highStick: number; sideLoad: number;\n    style: string; zone: number; veil: boolean;\n`,
  `    dragAdvice: string; highStick: number; sideLoad: number;\n    nibbleClarity: number; weatherCue: string;\n    style: string; zone: number; veil: boolean;\n`,
  'reel debug weather type',
);

fishing = replaceOnce(
  fishing,
  `      dragAdvice: this.dragAdvice,\n      highStick: this.highStick,\n      sideLoad: this.sideLoad,\n      style: this.style.id,\n`,
  `      dragAdvice: this.dragAdvice,\n      highStick: this.highStick,\n      sideLoad: this.sideLoad,\n      nibbleClarity: this.nibbleClarity,\n      weatherCue: this.weatherCue,\n      style: this.style.id,\n`,
  'reel debug weather values',
);

fishing = replaceOnce(
  fishing,
  `          if (this.feeding.id === 'runoff') this.nibbleMotion += 0.55;\n          else if (this.feeding.id === 'hatch') this.nibbleMotion += 0.35;\n          else if (this.feeding.id === 'deep-calm') this.nibbleMotion = Math.max(1, this.nibbleMotion - 0.25);\n\n          this.nibbleNeed = Math.max(1, Math.min(5, need));\n`,
  `          if (this.feeding.id === 'runoff') this.nibbleMotion += 0.55;\n          else if (this.feeding.id === 'hatch') this.nibbleMotion += 0.35;\n          else if (this.feeding.id === 'deep-calm') this.nibbleMotion = Math.max(1, this.nibbleMotion - 0.25);\n\n          // Rough water masks only the tiny investigative tells. Text and audio\n          // remain explicit, and the final committed bite is made stronger, so\n          // bad weather changes atmosphere/readability without shrinking the\n          // reaction window or creating an accessibility trap.\n          const weatherMask = clamp01(this.rain * 0.52 + this.turbidity * 0.62);\n          this.nibbleClarity = Math.max(0.62, 1 - weatherMask * 0.38);\n          this.weatherCue = weatherMask >= 0.58\n            ? 'hujan nutup riak'\n            : this.turbidity >= 0.34 ? 'air mulai keruh'\n              : this.rain >= 0.16 ? 'gerimis di pelampung' : '';\n\n          this.nibbleNeed = Math.max(1, Math.min(5, need));\n`,
  'weather nibble setup',
);

fishing = replaceOnce(
  fishing,
  `        this.bobY += Math.sin(this.t * 10) * dt\n          * (this.nibbleMotion + this.pendingGrade.tier * 0.25);\n`,
  `        this.bobY += Math.sin(this.t * 10) * dt\n          * (this.nibbleMotion + this.pendingGrade.tier * 0.25)\n          * this.nibbleClarity;\n`,
  'nibble visual masking',
);

fishing = replaceOnce(
  fishing,
  `          const heavy = Math.min(4, 1 + Math.floor(this.pending!.fight));\n          particles.spawnSplash(this.bobX, this.bobY + 3, 2 + heavy);\n          audio.blip(300 + this.nibbleDone * 34, 0.035, 0.08);\n`,
  `          const heavy = Math.min(4, 1 + Math.floor(this.pending!.fight));\n          const visibleSplash = Math.max(2, Math.round((2 + heavy) * this.nibbleClarity));\n          particles.spawnSplash(this.bobX, this.bobY + 3, visibleSplash);\n          // As visual noise rises, the tiny audio tick becomes slightly easier\n          // to hear. Players never have to rely on vision alone in heavy rain.\n          const cueVolume = 0.08 + (1 - this.nibbleClarity) * 0.07;\n          audio.blip(300 + this.nibbleDone * 34, 0.035, cueVolume);\n`,
  'nibble audiovisual cue',
);

fishing = replaceOnce(
  fishing,
  `              particles.spawnSplash(this.bobX, this.bobY + 2, 5 + heavy);\n              audio.bite();\n`,
  `              const commitSplash = 5 + heavy + Math.round((1 - this.nibbleClarity) * 4);\n              particles.spawnSplash(this.bobX, this.bobY + 2, commitSplash);\n              audio.bite();\n`,
  'committed bite emphasis',
);

fishing = replaceOnce(
  fishing,
  `      case 'bite': {\n        this.bobY += Math.sin(this.t * 22) * dt * 9;\n`,
  `      case 'bite': {\n        const commitClarity = 1 + (1 - this.nibbleClarity) * 0.38;\n        this.bobY += Math.sin(this.t * 22) * dt * 9 * commitClarity;\n`,
  'bite clarity motion',
);

fishing = replaceOnce(
  fishing,
  `    if (this.state === 'nibble') {\n      d.textCentered(this.nibbleText, cx, view.h - 34, C.Mist, C.InkDeep, 0.85);\n      d.textCentered('tunggu sampai nyantol', cx, view.h - 22, C.Pale, C.InkDeep, 0.65);\n    }\n`,
  `    if (this.state === 'nibble') {\n      d.textCentered(this.nibbleText, cx, view.h - 34, C.Mist, C.InkDeep, 0.85);\n      const read = this.weatherCue\n        ? \`${'${this.weatherCue}'} · tunggu tarik jelas\`\n        : 'tunggu sampai nyantol';\n      d.textCentered(read, cx, view.h - 22, C.Pale, C.InkDeep, 0.68);\n    }\n`,
  'nibble weather HUD',
);

fishing = replaceOnce(
  fishing,
  `    this.hookWear = 0;\n    this.tackleWarning = '';\n    this.dragAdvice = '';\n`,
  `    this.hookWear = 0;\n    this.tackleWarning = '';\n    this.nibbleClarity = 1;\n    this.weatherCue = '';\n    this.dragAdvice = '';\n`,
  'weather cue reset',
);

writeFileSync(fishingPath, fishing);

const uiPath = 'src/client/game/ui.ts';
let ui = readFileSync(uiPath, 'utf8');
ui = replaceOnce(
  ui,
  `import { mouthTypeForSpecies, SPECIES } from './fishing';\n`,
  `import { mouthTypeForSpecies, SPECIES, weatherWeightForSpecies } from './fishing';\n`,
  'journal weather import',
);

ui = replaceOnce(
  ui,
  `    d.text(\`gaya: ${'${style.label}'}\`, LEFT, y + 109, C.Pale, 0.88);\n    const habitat = bestSpot ? bestSpot.label : 'air terbuka';\n    d.text(\`cari: ${'${clipTo(habitat, 67)}'}\`, LEFT, y + 120, C.GrassLt, 0.88);\n    d.text(\`umpan: ${'${clipTo(bestBait.label, 61)}'}\`, LEFT, y + 131, C.Amber, 0.88);\n\n    const mouth = mouthTypeForSpecies(sp);\n    const hookAdvice = mouth === 'lunak' || sp.maxCm <= 30\n      ? 'kecil'\n      : mouth === 'keras' || sp.maxCm >= 55 ? 'besar' : 'sedang';\n    d.text(\`mulut: ${'${mouth}'}\`, LEFT, y + 142, C.Pale, 0.84);\n    d.text(\`kail: ${'${hookAdvice}'}\`, LEFT, y + 153, C.WaterBr, 0.84);\n`,
  `    d.text(\`gaya: ${'${style.label}'}\`, LEFT, y + 109, C.Pale, 0.88);\n    const habitat = bestSpot ? bestSpot.label : 'air terbuka';\n    d.text(\`cari: ${'${clipTo(habitat, 67)}'}\`, LEFT, y + 120, C.GrassLt, 0.88);\n    d.text(\`umpan: ${'${clipTo(bestBait.label, 61)}'}\`, LEFT, y + 131, C.Amber, 0.88);\n\n    // Weather notes unlock through repetition, not spoilers. The multiplier\n    // comes from fishing.ts itself, so this notebook always describes the same\n    // rain response the species roll actually uses.\n    let weatherNote = 'belum terbaca';\n    if (e.count >= 3 && ctx.spots.length > 0) {\n      let drizzleMul = -Infinity;\n      let heavyMul = -Infinity;\n      for (const spot of ctx.spots) {\n        drizzleMul = Math.max(drizzleMul, weatherWeightForSpecies(sp, spot, 0.45));\n        heavyMul = Math.max(heavyMul, weatherWeightForSpecies(sp, spot, 0.82));\n      }\n      weatherNote = heavyMul >= 1.17 ? 'hujan: aktif'\n        : drizzleMul >= 1.10 ? 'gerimis: aktif'\n          : heavyMul < 0.99 ? 'deras: turun' : 'hujan: netral';\n    }\n    d.text(clipTo(\`cuaca: ${'${weatherNote}'}\`, 92), LEFT, y + 142, C.WaterBr, 0.84);\n\n    const mouth = mouthTypeForSpecies(sp);\n    const hookAdvice = mouth === 'lunak' || sp.maxCm <= 30\n      ? 'kecil'\n      : mouth === 'keras' || sp.maxCm >= 55 ? 'besar' : 'sedang';\n    d.text(clipTo(\`${'${mouth}'} · kail ${'${hookAdvice}'}\`, 92), LEFT, y + 153, C.Pale, 0.84);\n`,
  'journal learned weather row',
);

writeFileSync(uiPath, ui);

const smokePath = 'scripts/smoke.mjs';
let smoke = readFileSync(smokePath, 'utf8');
smoke = replaceOnce(
  smoke,
  `    || typeof fightInfo.reel.sideLoad !== 'number'\n  ) {\n`,
  `    || typeof fightInfo.reel.sideLoad !== 'number'\n    || typeof fightInfo.reel.nibbleClarity !== 'number'\n    || typeof fightInfo.reel.weatherCue !== 'string'\n  ) {\n`,
  'smoke weather readability state',
);
writeFileSync(smokePath, smoke);

const readmePath = 'README.md';
let readme = readFileSync(readmePath, 'utf8');
const marker = '## Weather-readable bites & learned field notes';
if (!readme.includes(marker)) {
  readme += `\n\n${marker}\n\n- Hujan/air keruh sekarang sedikit menutupi riak nibble kecil, sementara committed bite justru dibuat lebih kuat.\n- Audio nibble naik sedikit saat visual surface cue tertutup cuaca; reaction window tidak dipendekkan.\n- Catatan Tangkapan membuka observasi cuaca setelah 3 tangkapan spesies yang sama.\n- Catatan cuaca memakai weather multiplier yang sama persis dengan RNG fishing, bukan flavour text terpisah.\n- Baris mulut + kail diringkas supaya informasi baru masuk tanpa memperbesar panel 320x180.\n`;
}
writeFileSync(readmePath, readme);

console.log('weather readability + field notes pass applied');

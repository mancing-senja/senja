/** Boot and main loop. */

import {
  CROP_STAGES, DAY_LENGTH_S, DAY_START, FARM_PLOT_COUNT, HORIZON_Y,
  SKY_H, WORLD_H, WORLD_W,
} from '../shared/constants';
import type { PlotState } from '../shared/protocol';

import { RenderTarget, createContext } from './engine/gl';
import { Input } from './engine/input';
import { DEFAULT_ZOOM_INDEX, ZOOM_STEPS, applyView, fitView, view } from './engine/view';
import { buildAtlas } from './art/atlas';
import {
  SEASON_DAYS, dayOfSeason, seasonForDay, type Season,
} from './world/season';
import { loadHandDrawn } from './art/handdrawn';
import type { PixelCanvas } from './art/canvas';
import { LOOKS, LOOK_COUNT, type Look } from './art/character';
import { lookFromCode, randomCode } from './art/custom';
import { Creator } from './game/creator';
import { col01, C } from './art/palette';
import { Draw } from './render/draw';
import {
  Particles, collectLamps, drawGround, drawLampLight, drawNeonWash, drawReflections,
  propRenderable,
  type Renderable,
} from './render/scene';
import { SkyWater } from './world/skywater';
import { Post } from './world/post';
import { lightingAt } from './world/lighting';
import { buildMap, isWater, tileAt } from './world/map';
import { buildInterior, type Interior } from './world/interior';
import {
  drawRoom, drawRoomLight, drawRoomVignette, furnitureRenderables, indoorAmbient,
} from './render/indoors';
import { DEFAULT_SPOT, spotAt } from './world/spots';
import { districtAt } from './world/districts';
import {
  LocalPlayer, drawActor, drawActorReflection, drawFishingLine, poseOf,
} from './game/player';
import { Fishing, phaseLabel, speciesById } from './game/fishing';
import { Farm } from './game/farm';
import { Net } from './game/net';
import { Ui } from './game/ui';
import { Npc, nearestNpc, villagerDefs } from './game/npc';
import { loadMinds, saveMinds, witnessCatch } from './game/dialogue';
import { LORE, loadRead, saveRead } from './game/lore';
import { Audio } from './game/audio';

/** How much of the sprite shading the normal maps do. Under a half the
 *  effect is invisible; over about 0.75 the palette starts banding, because
 *  a continuous light curve has only 48 colours to land on. */
const LIGHT_AMOUNT = 0.62;

const NAMES = ['Rian', 'Sari', 'Bayu', 'Nadia', 'Adit', 'Tari', 'Galih', 'Wulan', 'Dimas', 'Ayu'];

function playerName(): string {
  const saved = localStorage.getItem('senja.name');
  if (saved) return saved;
  const n = NAMES[Math.floor(Math.random() * NAMES.length)];
  localStorage.setItem('senja.name', n);
  return n;
}

/** The player's own appearance, as the packed code from `art/custom.ts`.
 *
 *  Kept separate from `senja.look`, which is the preset index and still what
 *  goes over the wire. Somebody who played before this existed keeps their
 *  preset until they open the creator, and somebody who opens the creator and
 *  backs out is unchanged. */
function playerFace(): number | null {
  const saved = localStorage.getItem('senja.face');
  if (saved === null) return null;
  const n = Number(saved);
  return Number.isFinite(n) ? n : null;
}

/** Which of the twelve character looks this player wears. Stored, so you
 *  are the same person every time you come back. */
function playerLook(): number {
  const saved = localStorage.getItem('senja.look');
  if (saved !== null) return Number(saved) % LOOK_COUNT;
  const h = Math.floor(Math.random() * LOOK_COUNT);
  localStorage.setItem('senja.look', String(h));
  return h;
}

function boot(handDrawn: ReadonlyMap<string, PixelCanvas>): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const gl = createContext(canvas);

  let season: Season = seasonForDay(
    Number(localStorage.getItem('senja.day') ?? 0),
  );
  // A saved custom appearance is baked into the slot above the presets, and
  // the player renders from that slot. No saved appearance means no extra
  // look and no extra pixels: the atlas is exactly what it was.
  let face = playerFace();
  const extraLooks = (): Look[] =>
    face === null ? [] : [lookFromCode(face, 'me')];
  const atlas = buildAtlas(handDrawn, season, extraLooks());
  const draw = new Draw(gl, atlas);
  const rt = new RenderTarget(gl, view.w, view.h);
  const skywater = new SkyWater(gl);
  const post = new Post(gl);

  const map = buildMap();
  const input = new Input(canvas);
  const audio = new Audio();
  const particles = new Particles();

  const name = playerName();
  const hue = playerLook();
  // The wire still carries the preset index — the protocol clamps it to
  // twelve — so remote players see a preset until that lands. Locally the
  // custom slot is used when there is one.
  const player = new LocalPlayer(name, face === null ? hue : LOOK_COUNT, map);
  const fishing = new Fishing();
  const farm = new Farm();
  /** The character creator. Opens on `G`, and unprompted the first time
   *  somebody arrives with no saved appearance — a game that hands you a
   *  random stranger and never mentions you can change it is a game where
   *  nobody knows they can. */
  const creator = new Creator(face ?? randomCode(), name, input);
  if (face === null) creator.show();
  const net = new Net(name, hue);

  const lm = map.landmarks;
  const npcs = villagerDefs({
    vx: lm.villageX, vy: lm.villageY,
    pierX: lm.pierX, pierTipY: lm.pierTipY,
    plotX: lm.plotX, plotY: lm.plotY,
    bayX: lm.bayX, bayY: lm.bayY,
    keepX: lm.keepX, keepY: lm.keepY,
    quayX: lm.quayX, quayY: lm.quayY,
    groveX: lm.groveX, groveY: lm.groveY,
  }).map((def, i) => new Npc(def, i + 1));
  // Villagers remember you across sessions. Walking back in after a week
  // and being greeted as a stranger is the thing this avoids.
  loadMinds(npcs.map((n) => n.mind));

  /** Whole in-game days elapsed. Drives "different every day" dialogue. */
  let dayCount = Number(localStorage.getItem('senja.day') ?? 0);

  /** Which pieces of the valley's history have been found. */
  const loreRead = loadRead();

  /** The room the player is standing in, or null when outdoors. Interiors
   *  are built on first entry and cached, so a house you have been in keeps
   *  its layout for the session. */
  let indoors: Interior | null = null;
  const rooms = new Map<string, Interior>();
  /** Residents, built once per room and kept for the session. They have to
   *  outlive the visit: an Npc carries its memory of you, and rebuilding one
   *  on every entry would mean everybody indoors greets you as a stranger
   *  forever. */
  const roomPeople = new Map<string, Npc[]>();
  const peopleIn = (it: Interior): Npc[] => {
    let p = roomPeople.get(it.id);
    if (!p) {
      p = it.residents.map((def, i) => new Npc(def, doorSeed(it.id) + i * 31));
      loadMinds(p.map((n) => n.mind));
      roomPeople.set(it.id, p);
    }
    return p;
  };
  /** Everyone who currently exists, indoors and out. saveMinds replaces the
   *  whole record, so handing it a subset would quietly wipe the memories of
   *  everybody left out of the call. */
  const allMinds = () => {
    const m = npcs.map((n) => n.mind);
    for (const p of roomPeople.values()) for (const n of p) m.push(n.mind);
    return m;
  };
  /** Set on any teleport. The camera eases everywhere else, but easing
   *  across a doorway means several seconds of flying over the map with the
   *  room's black surround filling the screen. */
  let snapCamera = false;
  /** Seconds before a doorway will take you again. Stepping out lands you
   *  next to the door you came from, and without this the very next frame
   *  would read that as walking in. */
  let doorCooldown = 0;

  const ui = new Ui(input, (text) => {
    net.chat(text);
    if (net.status !== 'online') {
      // Solo play still shows what you typed, so the box is never a dead end.
      ui.push({ id: Date.now(), tone: 'chat', who: name, text, t: Date.now() });
    }
  });
  net.onFeed = (item) => ui.push(item);

  /** The server's copy of this player wins on connect.
   *
   *  localStorage is per-browser: clear the site data and a month of
   *  fishing is gone, and opening the game on a laptop makes you a
   *  stranger with no coins. The stored profile is the real one; the local
   *  copy is a cache that keeps solo play working when there is no server. */
  net.onProfile = (p) => {
    if (p.name) {
      localStorage.setItem('senja.name', p.name);
      player.name = p.name;
    }
    if (Number.isFinite(p.look)) {
      localStorage.setItem('senja.look', String(p.look % LOOK_COUNT));
      player.hue = p.look % LOOK_COUNT;
    }
    farm.coins = Math.max(farm.coins, p.coins ?? 0);
    player.caught = Math.max(player.caught, p.caught ?? 0);
    dayCount = Math.max(dayCount, p.day ?? 0);
    localStorage.setItem('senja.day', String(dayCount));

    // Journals merge rather than replace: a catch landed offline a minute
    // ago must not be thrown away by a profile that predates it.
    for (const [id, e] of Object.entries(p.log ?? {})) {
      const cur = farm.log[id] ?? { count: 0, best: 0, bestGrade: 0 };
      farm.log[id] = {
        count: Math.max(cur.count, e.count ?? 0),
        best: Math.max(cur.best, e.best ?? 0),
        bestGrade: Math.max(cur.bestGrade ?? 0, e.bestGrade ?? 0),
      };
    }
    for (const id of p.lore ?? []) loreRead.add(id);
    saveRead(loreRead);
    ui.loreRead = loreRead.size;
    ui.say('progres dimuat');
  };

  /** Pushes this player's record up. Called on a timer and on the way out;
   *  the server rate-limits and merges forward, so sending too often is
   *  wasteful rather than harmful. */
  const pushProfile = (): void => {
    if (net.status !== 'online') return;
    net.send({
      t: 'save',
      profile: {
        name: player.name,
        look: player.hue,
        coins: farm.coins,
        caught: player.caught,
        day: dayCount,
        log: farm.log,
        lore: [...loreRead],
      },
    });
  };
  setInterval(pushProfile, 15000);
  // A closing tab is the most common way a session ends, and it is the one
  // moment a timer is guaranteed to miss.
  window.addEventListener('pagehide', pushProfile);

  ui.loreTotal = LORE.length;
  ui.loreRead = loreRead.size;

  /** Plots live locally when there is no server, so the farm works solo. */
  const localPlots: PlotState[] = [];
  for (let i = 0; i < FARM_PLOT_COUNT; i++) {
    localPlots.push({ i, crop: null, stage: -1, watered: false, t: Date.now(), by: '' });
  }
  const plots = (): PlotState[] => (net.status === 'online' ? net.plots : localPlots);

  net.connect();

  // --- local clock, used until (and if) the server's takes over
  let time = DAY_START;
  let rain = 0;
  let rainTarget = 0;
  let nextWeather = 70;
  let clock = 0;
  let lastSpot = '';
  let lastDistrict = '';
  let prevTime = time;

  // --- camera
  let camX = player.x - view.w / 2;
  let camY = player.y - view.h * 0.66;

  let zoomIndex = clampInt(
    Number(localStorage.getItem('senja.zoom') ?? DEFAULT_ZOOM_INDEX),
    0, ZOOM_STEPS.length - 1,
  );

  function resize(): void {
    // Two rules, and they fight each other. Pixels must be square and whole,
    // so the scale factor has to be an integer. And the game should fill
    // whatever window it is given, which is never an exact multiple of a
    // fixed buffer. The way out is to fix the *scale* and flex the *buffer*:
    // pick the integer scale, then make the internal resolution exactly big
    // enough to cover the window at that scale.
    //
    // The scale is computed in device pixels, not CSS pixels. On a display
    // with OS scaling (or browser zoom) a canvas sized in CSS pixels gets
    // resampled a second time by the compositor, and that second resample is
    // fractional — some game pixels land on three screen dots and some on
    // four. That is what makes a pixel game look like a badly resized JPEG.
    const dpr = window.devicePixelRatio || 1;
    const fit = fitView(window.innerWidth, window.innerHeight, dpr, ZOOM_STEPS[zoomIndex]);
    applyView(fit, dpr);

    rt.resize(view.w, view.h);

    canvas.width = view.w * fit.scale;
    canvas.height = view.h * fit.scale;
    canvas.style.width = `${fit.cssW}px`;
    canvas.style.height = `${fit.cssH}px`;
  }
  resize();
  window.addEventListener('resize', resize);
  // Moving the window to a monitor with a different scaling factor fires
  // this rather than a resize event.
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    .addEventListener('change', resize);

  // Audio can only start from a gesture.
  const kick = (): void => {
    audio.start();
    canvas.focus();
  };
  window.addEventListener('pointerdown', kick, { once: true });
  window.addEventListener('keydown', kick, { once: true });

  window.addEventListener('keydown', (e) => {
    if (ui.chatOpen) return;
    if (e.key === 'h' || e.key === 'H') ui.showHelp = !ui.showHelp;
    if (e.key === 'j' || e.key === 'J') {
      ui.showLog = !ui.showLog;
      ui.logPage = 0;
      ui.logSel = 0;
      ui.inspecting = false;
    }
    // Journal navigation. All guarded on the panel being open, so these
    // keys keep walking the player the rest of the time.
    if (ui.showLog) {
      const k = e.key.toLowerCase();
      if (k === 'e') {
        ui.inspecting = !ui.inspecting;
      } else if (!ui.inspecting) {
        if (k === 'a' || e.key === 'ArrowLeft') ui.logPage--;
        if (k === 'd' || e.key === 'ArrowRight') ui.logPage++;
        // Down the column first, then wrap into the next one — that is the
        // order the page is laid out in, so the cursor follows the eye.
        if (k === 'w' || e.key === 'ArrowUp') ui.logSel--;
        if (k === 's' || e.key === 'ArrowDown') ui.logSel++;
        const per = Ui.LOG_PER_PAGE;
        ui.logSel = ((ui.logSel % per) + per) % per;
      }
    }
    if (e.key === 'b' || e.key === 'B') ui.showBoard = !ui.showBoard;
    if (e.key === 'm' || e.key === 'M') audio.toggleMute();
    // Zoom. Changing it re-fits the buffer, so the pixel grid stays whole.
    if (e.key === '-' || e.key === '_') setZoom(zoomIndex - 1);
    if (e.key === '=' || e.key === '+') setZoom(zoomIndex + 1);
  });

  function setZoom(i: number): void {
    const next = clampInt(i, 0, ZOOM_STEPS.length - 1);
    if (next === zoomIndex) return;
    zoomIndex = next;
    localStorage.setItem('senja.zoom', String(zoomIndex));
    resize();
    ui.say(`zoom ${ZOOM_STEPS[zoomIndex].toFixed(2)}x  (${view.w}x${view.h})`);
  }

  let last = performance.now();
  let veilGone = false;

  /** Dev capture hook. Runs a step and a draw inline rather than waiting
   *  for the next animation frame, so it also works when the page is not
   *  being composited (a hidden tab never fires requestAnimationFrame). */
  (window as unknown as Record<string, unknown>).__snap = (setTime?: number, steps = 1): string => {
    for (let i = 0; i < steps; i++) {
      update(1 / 60);
      input.endFrame();
    }
    // Set the clock after stepping, or the world clock sync would drag it
    // straight back to the server's time before the frame is drawn.
    if (typeof setTime === 'number') time = setTime;
    render();
    return readFrame();
  };
  /** Advances the simulation without drawing — capturing a frame costs a
   *  full-resolution pixel readback, which is far too slow to drive a
   *  multi-second state machine with. */
  (window as unknown as Record<string, unknown>).__step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      // The animation clock lives in frame(), not update(), and frame() is
      // driven by requestAnimationFrame — which never fires in a headless
      // pane. Stepping without advancing it froze every clock-driven
      // animation under test while leaving the animT-driven walk cycle
      // running, so idle breath, blink, the work swing and the talking nod
      // all looked broken when they were only unticked.
      clock += 1 / 60;
      update(1 / 60);
      input.endFrame();
    }
  };
  /** Forces a catch of a named species at a named grade, so the card, the
   *  rare sprite and the celebration can be inspected without waiting for
   *  a one-in-two-thousand roll to come up. */
  (window as unknown as Record<string, unknown>).__catch = (
    speciesId: string, gradeId: string,
  ) => fishing.debugCatch(speciesId, gradeId, particles, audio, (c) => {
    farm.addCatch(c);
    player.caught++;
    ui.say(`${c.species.label} ${c.cm} cm  +${c.coins}`);
  }, player);
  /** Jumps the world clock, so the moving key light can be compared at
   *  four times of day without waiting out a real day cycle. */
  (window as unknown as Record<string, unknown>).__setTime = (t: number): void => {
    time = ((t % 1) + 1) % 1;
    prevTime = time;
  };
  (window as unknown as Record<string, unknown>).__plots = () => plots();
  (window as unknown as Record<string, unknown>).__map = () => map;
  (window as unknown as Record<string, unknown>).__npcs = () =>
    npcs.map((n) => ({
      name: n.name, action: n.action, talking: n.talking,
      pose: poseOf(n, clock),
      x: Math.round(n.x), y: Math.round(n.y),
    }));
  /** Jumps to a season, so all four can be looked at without playing
   *  through twenty-eight in-game days. */
  (window as unknown as Record<string, unknown>).__season = (id: string) => {
    const next = seasonForDay(
      ['semi', 'panas', 'gugur', 'dingin'].indexOf(id) * SEASON_DAYS,
    );
    if (next.id !== id) return `tidak ada musim ${id}`;
    season = next;
    draw.reload(buildAtlas(handDrawn, season));
    return `${season.label} — ${season.blurb}`;
  };

  /** Drops straight into a fight with a chosen species and grade, so the reel
   *  can be looked at without waiting on the odds. */
  (window as unknown as Record<string, unknown>).__fight = (
    speciesId: string, gradeId: string,
  ) => fishing.debugFight(speciesId, gradeId, player);

  (window as unknown as Record<string, unknown>).__dbg = () => ({
    fishing: fishing.state,
    indoors: indoors ? {
      id: indoors.id, w: indoors.w, h: indoors.h,
      people: peopleIn(indoors).map((n) => ({
        name: n.name, action: n.action, x: Math.round(n.x), y: Math.round(n.y),
      })),
    } : null,
    reel: fishing.reel,
    coins: farm.coins,
    basket: farm.basketCount,
    caught: player.caught,
    net: net.status,
    peers: net.players.size,
    room: net.room,
    px: Math.round(player.x),
    py: Math.round(player.y),
    time: Number(time.toFixed(3)),
  });
  (window as unknown as Record<string, unknown>).__tp = (tx: number, ty: number): void => {
    player.x = tx * 16;
    player.y = ty * 16;
    camX = clamp(player.x - view.w / 2, 0, WORLD_W - view.w);
    camY = clamp(player.y - view.h * 0.66, -SKY_H, WORLD_H - view.h);
    snapCamera = true;
  };

  function frame(now: number): void {
    // Clamp dt so a background tab does not fast-forward the whole day.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    update(dt);
    render();

    input.endFrame();

    if (!veilGone) {
      veilGone = true;
      document.getElementById('veil')?.classList.add('gone');
      window.setTimeout(() => document.getElementById('veil')?.remove(), 800);
    }
    requestAnimationFrame(frame);
  }

  function update(dt: number): void {
    // --- world clock: follow the server if there is one, else run locally
    if (net.status === 'online' && net.serverTime >= 0) {
      let diff = net.serverTime - time;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      time = (time + diff * Math.min(1, dt * 3) + dt / DAY_LENGTH_S + 1) % 1;
      rain += (net.serverRain - rain) * Math.min(1, dt * 2);
    } else {
      time = (time + dt / DAY_LENGTH_S) % 1;
      nextWeather -= dt;
      if (nextWeather <= 0) {
        rainTarget = Math.random() < 0.25 ? 0.4 + Math.random() * 0.4 : 0;
        nextWeather = 120 + Math.random() * 200;
      }
      rain += (rainTarget - rain) * dt * 0.25;
      if (rain < 0.005) rain = 0;

      // Solo growth, mirroring the server's rule.
      const stageMs = (DAY_LENGTH_S * 1000) / 12;
      for (const p of localPlots) {
        if (!p.crop || p.stage < 1 || p.stage >= CROP_STAGES) continue;
        if (!(p.watered || rain > 0.25)) continue;
        if (Date.now() - p.t >= stageMs) {
          p.stage++;
          p.t = Date.now();
          p.watered = false;
        }
      }
    }

    // A wrap past midnight is a new day: villagers greet you differently,
    // moods are redrawn, and yesterday becomes something to refer back to.
    if (time < prevTime - 0.5) {
      dayCount++;
      localStorage.setItem('senja.day', String(dayCount));
      const next = seasonForDay(dayCount);
      if (next.id !== season.id) {
        // Foliage and clothing are baked into the atlas rather than tinted
        // at draw time — a tint can only darken, and no amount of
        // multiplying green reaches the orange of an autumn leaf. So the
        // season turning means baking again. It happens once a week of
        // in-game days and takes a frame.
        season = next;
        draw.reload(buildAtlas(handDrawn, season));
        ui.say(`musim ${season.label.toLowerCase()} · ${season.blurb}`);
      } else {
        ui.say(`hari ke-${dayCount + 1} · ${season.label.toLowerCase()}`);
      }
    }
    prevTime = time;

    const L = lightingAt(time, rain);
    // Temperature, not exposure. A season that changes how bright the world
    // is reads as a bug; a season that changes what colour the light is
    // reads as a season.
    L.ambient[0] *= season.warmth[0];
    L.ambient[1] *= season.warmth[1];
    L.ambient[2] *= season.warmth[2];

    // While the creator is open it owns the keyboard and the world is paused.
    // Letting the player walk behind a full-screen overlay means arriving
     // somewhere unexpected on close, and the arrow keys would do two things
    // at once.
    // The creator owns the keyboard, including Enter — which Ui otherwise
    // grabs for chat before the frame ever runs.
    ui.modal = creator.open;
    if (creator.open) {
      const chosen = creator.update(dt, input);
      if (chosen !== null) {
        face = chosen.code;
        localStorage.setItem('senja.face', String(chosen.code));
        localStorage.setItem('senja.name', chosen.name);
        player.name = chosen.name;
        // The name travels on `join`, so a rename lands for other players on
        // the next connect rather than immediately. Saying so beats a silent
        // half-change.
        ui.say('karakter disimpan · nama tampil ke pemain lain setelah reconnect');
        // One rebake, on confirm only. The preview never touched the atlas.
        draw.reload(buildAtlas(handDrawn, season, extraLooks()));
        player.hue = LOOK_COUNT;
      }
      return;
    }
    // `G` for ganti karakter — the third key this has been on.
    //
    // `C` was already the one-key room invite ("c undang" in the HUD), so
    // binding the creator there meant pressing invite opened the character
    // screen. Moving to `K` collided with the world map that landed next.
    // Neither feature was edited either time; the collision alone was enough
    // to break them, which is the cheapest way to break somebody's work and
    // the hardest to notice.
    //
    // Free letters when this was written: f g i l n o u v x y z. `g` is the
    // only one with a mnemonic in Indonesian, and it is listed in the help
    // screen so the next person adding a binding can see it is taken.
    if (input.pressed('g') && !ui.chatOpen) creator.show();

    if (indoors) player.updateIndoors(dt, input, indoors);
    else player.update(dt, input, map);

    fishing.season = season;
    fishing.update(
      dt, input, player, map, time, particles, audio,
      (c) => {
        const prevBest = farm.log[c.species.id]?.best ?? 0;
        const isRecord = c.cm > prevBest && c.cm >= Math.max(20, prevBest);
        const isRare = c.species.value >= 90;
        farm.addCatch(c);
        player.caught++;

        // Anyone close enough to have seen it remembers it. Distance is the
        // whole rule — you cannot brag to someone who was not there.
        for (const n of npcs) {
          if (Math.hypot(n.x - player.x, n.y - player.y) > 140) continue;
          witnessCatch(n.mind, dayCount, c.species.label, c.cm, isRecord, isRare);
        }
        saveMinds(allMinds());
        net.send({
          t: 'catch', species: c.species.label, size: c.cm,
          speciesCount: Object.keys(farm.log).length,
        });
        net.send({ t: 'reel' });
        ui.say(`${c.species.label} ${c.cm} cm  +${c.coins}`);
      },
      (x, y) => net.send({ t: 'cast', bx: x, by: y }),
    );
    player.bobber = fishing.bobber;

    if (indoors) for (const n of peopleIn(indoors)) n.updateIn(dt, indoors);
    else for (const n of npcs) n.update(dt, map);

    // --- interaction. A villager standing next to you takes priority over
    // whatever plot happens to be underfoot.
    // Standing at the community board opens it, which is how anyone finds
    // out it exists in the first place.
    // --- doors. Handled before everything else: while indoors none of the
    // outdoor interactions exist, and while outdoors a doorway under your
    // feet is the most likely thing you meant to press E on.
    doorCooldown = Math.max(0, doorCooldown - dt);

    if (indoors) {
      const onDoor = Math.floor(player.y / 16) >= indoors.h - 1;
      if (onDoor && doorCooldown <= 0) {
        // Step out one tile clear of the threshold, not onto it.
        player.x = indoors.returnX;
        player.y = indoors.returnY + 16 + 12;
        player.facing = 'down';
        doorCooldown = 0.6;
        ui.showPlace('Keluar', '');
        audio.blip(420, 0.09, 0.12);
        indoors = null;
        snapCamera = true;
      }
    } else {
      const ptx = Math.floor(player.x / 16);
      const pty = Math.floor(player.y / 16);
      const door = doorCooldown > 0
        ? undefined
        : map.doors.find((dr) => dr.tx === ptx && dr.ty === pty);
      if (door) {
        let room = rooms.get(door.id);
        if (!room) {
          room = buildInterior(
            door.id, door.style, doorSeed(door.id), door.size,
            door.tx * 16 + 8, door.ty * 16, door.label,
          );
          rooms.set(door.id, room);
        }
        indoors = room;
        player.x = room.spawnX;
        player.y = room.spawnY;
        player.facing = 'up';
        fishing.cancel(player);
        ui.showPlace(room.label, '');
        audio.blip(520, 0.09, 0.12);
        snapCamera = true;
        doorCooldown = 0.6;
      }
    }

    // A readable marker beats everything else within reach: it is the
    // only interaction that is purely about the world rather than about
    // the loop.
    let marker: typeof map.props[number] | null = null;
    let markerD = 28;
    for (const p of map.props) {
      if (!p.lore) continue;
      const dd = Math.hypot(p.x - player.x, p.y - player.y);
      if (dd < markerD) { markerD = dd; marker = p; }
    }
    if (marker && input.pressed('e')) {
      const frag = LORE.find((f) => f.id === marker!.lore) ?? null;
      if (ui.reading) {
        ui.reading = null;
      } else if (frag) {
        ui.reading = frag;
        if (!loreRead.has(frag.id)) {
          loreRead.add(frag.id);
          saveRead(loreRead);
          ui.loreRead = loreRead.size;
          ui.say(`catatan ditemukan  ${loreRead.size}/${LORE.length}`);
        }
        audio.blip(560, 0.07, 0.12);
      }
    }
    if (marker && !ui.reading) {
      farm.prompt = { text: '[E] baca', x: marker.x, y: marker.y - 26 };
    }

    const boardProp = map.props.find((p) => p.kind === 'board');
    const atBoard = boardProp
      && Math.hypot(player.x - boardProp.x, player.y - boardProp.y) < 30;

    const who = indoors
      ? nearestNpc(peopleIn(indoors), player.x, player.y, 26)
      : atBoard || marker ? null : nearestNpc(npcs, player.x, player.y, 26);
    // findPrompt is what normally clears the prompt each frame, and it only
    // runs when nothing else has claimed the E key. Standing next to
    // somebody mid-conversation claims it without setting anything, so the
    // prompt has to be cleared here or last frame's caption stays up.
    farm.prompt = null;
    const action = who || atBoard || marker ? null : farm.findPrompt(player, map, plots());

    if (atBoard && !marker) {
      farm.prompt = { text: '[E] papan komunitas', x: boardProp!.x, y: boardProp!.y - 34 };
      if (input.pressed('e')) {
        ui.showBoard = !ui.showBoard;
        audio.blip(620, 0.06, 0.12);
      }
    }
    // A conversation is running if anybody nearby still has a line up.
    ui.talking = (indoors ? peopleIn(indoors) : npcs).some((n) => n.sayT > 0);

    if (who && who.sayT <= 0) {
      farm.prompt = { text: `[E] ngobrol sama ${who.name}`, x: who.x, y: who.y - 30 };
      if (input.pressed('e')) {
        who.faceToward(player.x, player.y);
        who.talk(talkCtx());
        saveMinds(allMinds());
        audio.blip(700, 0.05, 0.1);
      }
    }
    if (action && input.pressed('e')) {
      if (farm.apply(action)) {
        if (action.kind === 'plot') {
          net.send({ t: 'plot', i: action.i, op: action.op, crop: action.crop });
          if (net.status !== 'online') applyPlotLocally(action.i, action.op, action.crop);
          audio.blip(action.op === 'harvest' ? 720 : 480, 0.08, 0.14);
        } else if (action.kind === 'sell') {
          audio.catchJingle(false);
          ui.say('laku!');
        } else {
          audio.blip(600, 0.07, 0.14);
        }
      } else {
        audio.blip(200, 0.09, 0.12);
        ui.say(action.kind === 'buy' ? 'koin kurang' : 'ga bisa');
      }
    }
    if (input.pressed('q')) farm.cycleCrop();

    // Announce arriving at a named spot. Checked against the player rather
    // than the bobber so it fires while walking, not while fishing.
    // Crossing a district line is the bigger event, so it wins the banner.
    // Indoors none of this applies — you are in a room, not a region.
    const dz = indoors
      ? { district: null, weight: 0 }
      : districtAt(player.x, player.y);
    const dzId = dz.weight > 0.55 ? dz.district?.id ?? '' : '';
    if (dzId !== lastDistrict) {
      lastDistrict = dzId;
      if (dzId && dz.district) ui.showPlace(dz.district.label, dz.district.blurb);
    }
    // The band changes with the district, cross-fading over a few bars.
    audio.setMood(dz.weight > 0.5 && dz.district ? dz.district.genre : 'pastoral');

    const here = indoors ? DEFAULT_SPOT : spotAt(map.spots, player.x, player.y);
    if (here.id !== lastSpot) {
      lastSpot = here.id;
      if (here.id !== 'kolam' && !dzId) ui.showPlace(here.label, here.blurb);
    }

    net.update(dt, player.x, player.y, player.facing, player.action);
    particles.air = { kind: season.air, rate: season.airRate };
    particles.update(dt, camX, camY, L, rain);
    ui.update(dt);
    audio.update(dt, L.night, rain);

    // --- camera: the player sits below centre so there is sky to look at
    // Indoors the camera is bounded by the room, not the world — and a room
    // smaller than the viewport is centred rather than clamped to a corner.
    const bw = indoors ? indoors.w * 16 : WORLD_W;
    const bh = indoors ? indoors.h * 16 : WORLD_H;
    const targetX = bw <= view.w
      ? (bw - view.w) / 2
      : clamp(player.x - view.w / 2, 0, bw - view.w);
    const targetY = bh <= view.h
      ? (bh - view.h) / 2
      : clamp(player.y - view.h * 0.66, indoors ? 0 : -SKY_H, bh - view.h);
    if (snapCamera) {
      camX = targetX;
      camY = targetY;
      snapCamera = false;
    } else {
      const k = 1 - Math.pow(0.0015, dt);
      camX += (targetX - camX) * k;
      camY += (targetY - camY) * k;
    }
  }

  function applyPlotLocally(i: number, op: string, crop?: string): void {
    const p = localPlots[i];
    if (!p) return;
    const now = Date.now();
    if (op === 'till' && p.stage === -1) {
      p.stage = 0;
      p.t = now;
    } else if (op === 'plant' && p.stage === 0 && !p.crop) {
      p.crop = crop ?? 'tomat';
      p.stage = 1;
      p.watered = false;
      p.t = now;
    } else if (op === 'water' && p.crop) {
      p.watered = true;
      p.t = now;
    } else if (op === 'harvest' && p.crop && p.stage >= CROP_STAGES) {
      p.crop = null;
      p.stage = 0;
      p.watered = false;
      p.t = now;
    }
  }

  /** Everything a villager needs to know to say something specific rather
   *  than something generic. */
  function talkCtx() {
    const here = spotAt(map.spots, player.x, player.y);
    const last = farm.basket.length ? farm.basket[farm.basket.length - 1] : null;
    let recordCm = 0;
    let recordLabel = '';
    for (const [id, e] of Object.entries(farm.log)) {
      if (e.best > recordCm) {
        recordCm = e.best;
        recordLabel = speciesById(id)?.label ?? id;
      }
    }
    return {
      day: dayCount,
      time,
      phase: phaseLabel(time) as 'pagi' | 'siang' | 'senja' | 'malam',
      rain,
      place: here.id === 'kolam' ? '' : here.label,
      playerName: name,
      lastCatch: last ? { label: last.species.label, cm: last.cm } : null,
      recordCm,
      recordLabel,
      species: Object.keys(farm.log).length,
      coins: farm.coins,
      others: net.players.size,
    };
  }

  /** True when the character's feet are out over the lake — on the pier or
   *  standing at the waterline — which is when a reflection makes sense. */
  function overWater(x: number, y: number): boolean {
    const t = tileAt(map, Math.floor(x / 16), Math.floor(y / 16) + 1);
    return isWater(t);
  }

  /** The natural light of the hour, bent toward whichever district the
   *  camera is standing in. Blending rather than switching is what keeps
   *  the four genres feeling like one world. */
  function districtLighting(): ReturnType<typeof lightingAt> {
    const L = lightingAt(time, rain);
    L.ambient[0] *= season.warmth[0];
    L.ambient[1] *= season.warmth[1];
    L.ambient[2] *= season.warmth[2];
    const { district: dz, weight } = districtAt(player.x, player.y);
    if (!dz || weight <= 0.001) return L;

    const k = weight * dz.strength;
    const mix3 = (
      a: [number, number, number], b: [number, number, number], t: number,
    ): [number, number, number] => [
      a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
    ];

    // Self-lit districts refuse to go fully dark.
    const lift = dz.nightFloor * weight;
    const amb: [number, number, number] = [
      Math.max(L.ambient[0] * (1 - k) + L.ambient[0] * dz.tint[0] * k, lift),
      Math.max(L.ambient[1] * (1 - k) + L.ambient[1] * dz.tint[1] * k, lift),
      Math.max(L.ambient[2] * (1 - k) + L.ambient[2] * dz.tint[2] * k, lift),
    ];

    return {
      ...L,
      ambient: amb,
      haze: mix3(L.haze, dz.fog, k),
      skyHorizon: mix3(L.skyHorizon, dz.fog, k * 0.8),
      skyMid: mix3(L.skyMid, dz.fog, k * 0.5),
      rim: L.rim * (1 - k * 0.5),
    };
  }

  function render(): void {
    const L = districtLighting();
    const cx = Math.round(camX);
    const cy = Math.round(camY);

    rt.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (indoors) {
      // Indoors skips the sky, the weather and the whole outdoor scene.
      // The room is lit by its own lamps, so the clock barely reaches it.
      draw.ambient = indoorAmbient(L.night);
      draw.begin(cx, cy);
      drawRoom(draw, indoors, clock);

      const items: Renderable[] = furnitureRenderables(draw, indoors);
      for (const n of peopleIn(indoors)) {
        const near = Math.hypot(n.x - player.x, n.y - player.y) < 78;
        items.push({ y: n.y, draw: () => drawActor(draw, n, L, clock, 1, near) });
      }
      items.push({
        y: player.y,
        draw: () => drawActor(draw, player, L, clock, 1, false),
      });
      items.sort((a, b) => a.y - b.y);
      for (const it of items) it.draw();

      drawRoomLight(draw, indoors, clock);
      drawRoomVignette(draw, indoors, cx, cy);
      farm.drawPrompt(draw);
    } else {
      skywater.draw(
        view.w, view.h, cx, cy, clock, HORIZON_Y, L, rain,
        // The lake takes the local fog colour, so the water off the neon quay
        // is a different lake from the water off the keep.
        L.haze[0] < 0.35
          ? [L.haze[0] * 1.3 + 0.04, L.haze[1] * 1.2 + 0.10, L.haze[2] * 1.15 + 0.18]
          : mixRGB(col01(C.Water), col01(C.WaterSh), 0.45),
      );

      draw.ambient = L.ambient;
      draw.setSun(L, LIGHT_AMOUNT);
      draw.setLamps(collectLamps(map, cx, cy, L.night));
      draw.begin(cx, cy);

      drawGround(draw, map, cx, cy, clock, L);
      drawReflections(draw, map, cx, cy, clock);

      // Reflections of anyone standing out over the water, drawn before the
      // characters so a reflection never covers the person casting it.
      for (const rp of net.players.values()) {
        if (overWater(rp.x, rp.y)) drawActorReflection(draw, rp, clock);
      }
      if (overWater(player.x, player.y)) drawActorReflection(draw, player, clock);

      const items: Renderable[] = [];
      for (const p of map.props) {
        // Cheap cull: props are sorted by y, but the x test is what saves the
        // draw calls on a wide map.
        if (p.x < cx - 60 || p.x > cx + view.w + 60) continue;
        if (p.y < cy - 80 || p.y > cy + view.h + 80) continue;
        items.push(propRenderable(draw, p, clock, L));
      }
      for (const r of farm.renderables(draw, map, plots(), clock)) items.push(r);

      for (const n of npcs) {
        if (n.x < cx - 60 || n.x > cx + view.w + 60) continue;
        if (n.y < cy - 80 || n.y > cy + view.h + 80) continue;
        // Name tags only when you are close enough to talk to them. Ten
        // permanent labels across a village is a debug view, not a game.
        const near = Math.hypot(n.x - player.x, n.y - player.y) < 78;
        items.push({ y: n.y, draw: () => drawActor(draw, n, L, clock, 1, near) });
      }
      for (const rp of net.players.values()) {
        items.push({
          y: rp.y,
          draw: () => {
            drawActor(draw, rp, L, clock, rp.fade);
            drawFishingLine(draw, rp, clock);
          },
        });
      }
      items.push({
        y: player.y,
        draw: () => {
          drawActor(draw, player, L, clock, 1, false);
          drawFishingLine(draw, player, clock);
        },
      });

      items.sort((a, b) => a.y - b.y);
      for (const it of items) it.draw();

      fishing.drawWorld(draw, clock);
      drawLampLight(draw, map, clock, L);
      drawNeonWash(draw, map, cx, cy, clock);
      particles.draw(draw, L);
      farm.drawPrompt(draw);
    }

    // --- HUD, at full brightness and pinned to the screen
    draw.ambient = [1, 1, 1];
    draw.setUnlit();
    draw.camera(0, 0);
    // Conversation panels sit above the HUD but below the modal panels.
    for (const n of indoors ? peopleIn(indoors) : npcs) {
      n.drawPanel(draw, player.x, player.y);
    }
    fishing.drawHud(draw);
    ui.reeling = fishing.state === 'reel';
    ui.draw(draw, {
      season: season.label,
      seasonDay: dayOfSeason(dayCount),
      coins: farm.coins,
      room: net.room,
      time,
      phase: phaseLabel(time),
      status: net.status,
      playerCount: net.players.size + 1,
      caught: player.caught,
      farm,
      L,
      board: net.board,
      myName: name,
    });

    // Last, so it covers the HUD. Drawn before it, the clock and the coin
    // purse and the control hints all showed through a full-screen overlay,
    // which reads as a UI bug rather than as a screen.
    creator.draw(draw);
    draw.flush();

    // --- present
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    post.draw(
      rt.tex, view.w, view.h,
      0.55 + L.night * 0.35,
      0.55,
      [1, 1, 1],
      L.night,
      fishing.flash * 0.35,
    );
  }

  /** Grabs the frame straight off the GPU. `preserveDrawingBuffer` is off
   *  for performance, so toDataURL on the canvas would come back blank —
   *  reading the pixels in-frame is the only reliable way to capture. */
  function readFrame(): string {
    const w = canvas.width;
    const h = canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    // GL origin is bottom-left; flip into image order.
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      img.data.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return out.toDataURL('image/png');
  }

  requestAnimationFrame(frame);
}

/** Stable seed per door, so a room keeps its layout across sessions. */
function doorSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

function clampInt(v: number, a: number, b: number): number {
  const n = Number.isFinite(v) ? Math.round(v) : a;
  return n < a ? a : n > b ? b : n;
}

function mixRGB(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Hand-drawn portraits load before the atlas is baked, because the atlas
 *  is a single texture built once. Nothing is fetched unless the manifest
 *  exists, so a project with no drawings in it pays nothing for this. */
async function start(): Promise<void> {
  let handDrawn: ReadonlyMap<string, PixelCanvas> = new Map();
  try {
    const res = await loadHandDrawn(
      (id) => LOOKS.findIndex((l) => l.id === id),
    );
    handDrawn = res.frames;
    for (const p of res.problems) console.warn(`[senja] gambar: ${p}`);
    if (res.frames.size > 0) {
      console.info(`[senja] pakai ${res.frames.size} potret gambar tangan`);
    }
  } catch (err) {
    // Art is an enhancement. Failing to load it must never stop the game.
    console.warn('[senja] gagal muat gambar tangan:', err);
  }
  boot(handDrawn);
}

start().catch((err) => {
  const veil = document.getElementById('veil');
  if (veil) {
    veil.innerHTML = `<div style="max-width:min(90vw,560px);font-size:13px;line-height:1.6;opacity:.85">
      <b>gagal jalan</b><br>${String((err as Error)?.message ?? err)}</div>`;
  }
  throw err;
});

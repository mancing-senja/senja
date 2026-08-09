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
import { LOOK_COUNT } from './art/character';
import { col01, C } from './art/palette';
import { Draw } from './render/draw';
import {
  Particles, drawGround, drawLampLight, drawNeonWash, drawReflections, propRenderable,
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
import { LocalPlayer, drawActor, drawActorReflection, drawFishingLine } from './game/player';
import { Fishing, phaseLabel, speciesById } from './game/fishing';
import { Farm } from './game/farm';
import { Net } from './game/net';
import { Ui } from './game/ui';
import { Npc, nearestNpc, villagerDefs } from './game/npc';
import { loadMinds, saveMinds, witnessCatch } from './game/dialogue';
import { LORE, loadRead, saveRead } from './game/lore';
import { Audio } from './game/audio';

const NAMES = ['Rian', 'Sari', 'Bayu', 'Nadia', 'Adit', 'Tari', 'Galih', 'Wulan', 'Dimas', 'Ayu'];

function playerName(): string {
  const saved = localStorage.getItem('senja.name');
  if (saved) return saved;
  const n = NAMES[Math.floor(Math.random() * NAMES.length)];
  localStorage.setItem('senja.name', n);
  return n;
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

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const gl = createContext(canvas);

  const atlas = buildAtlas();
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
  const player = new LocalPlayer(name, hue, map);
  const fishing = new Fishing();
  const farm = new Farm();
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
    if (e.key === 'j' || e.key === 'J') ui.showLog = !ui.showLog;
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
      update(1 / 60);
      input.endFrame();
    }
  };
  (window as unknown as Record<string, unknown>).__plots = () => plots();
  (window as unknown as Record<string, unknown>).__map = () => map;
  (window as unknown as Record<string, unknown>).__npcs = () =>
    npcs.map((n) => ({ name: n.name, action: n.action, x: Math.round(n.x), y: Math.round(n.y) }));
  (window as unknown as Record<string, unknown>).__dbg = () => ({
    fishing: fishing.state,
    indoors: indoors ? { id: indoors.id, w: indoors.w, h: indoors.h } : null,
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
      ui.say(`hari ke-${dayCount + 1}`);
    }
    prevTime = time;

    const L = lightingAt(time, rain);

    if (indoors) player.updateIndoors(dt, input, indoors);
    else player.update(dt, input, map);

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
        saveMinds(npcs.map((n) => n.mind));
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

    if (!indoors) for (const n of npcs) n.update(dt, map);

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

    const who = atBoard || marker ? null : nearestNpc(npcs, player.x, player.y, 26);
    const action = who || atBoard || marker ? null : farm.findPrompt(player, map, plots());

    if (atBoard && !marker) {
      farm.prompt = { text: '[E] papan komunitas', x: boardProp!.x, y: boardProp!.y - 34 };
      if (input.pressed('e')) {
        ui.showBoard = !ui.showBoard;
        audio.blip(620, 0.06, 0.12);
      }
    }
    if (who) {
      farm.prompt = { text: `[E] ngobrol sama ${who.name}`, x: who.x, y: who.y - 30 };
      if (input.pressed('e')) {
        who.faceToward(player.x, player.y);
        who.talk(talkCtx());
        saveMinds(npcs.map((n) => n.mind));
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
    draw.camera(0, 0);
    // Conversation panels sit above the HUD but below the modal panels.
    for (const n of npcs) n.drawPanel(draw, player.x, player.y);
    fishing.drawHud(draw);
    ui.draw(draw, {
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

try {
  boot();
} catch (err) {
  const veil = document.getElementById('veil');
  if (veil) {
    veil.innerHTML = `<div style="max-width:min(90vw,560px);font-size:13px;line-height:1.6;opacity:.85">
      <b>gagal jalan</b><br>${String((err as Error)?.message ?? err)}</div>`;
  }
  throw err;
}

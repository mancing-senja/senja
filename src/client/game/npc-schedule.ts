import { DAY_LENGTH_S, DAY_START } from '../../shared/constants';
import type { PlayerAction } from '../../shared/protocol';
import { npcWorldSnapshot } from './net';

export type NpcPhase = 'pagi' | 'siang' | 'senja' | 'malam';

type TilePoint = [number, number];

interface RoleProfile {
  role: string;
  places: [string, string, string, string];
  activities: [string, string, string, string];
  goals: [string[], string[], string[], string[]];
}

export interface NpcScheduleState {
  key: string;
  phase: NpcPhase;
  role: string;
  destination: string;
  activity: string;
  goal: string;
  route: TilePoint[];
  idle: PlayerAction['kind'];
  speed: number;
  pauseMin: number;
  pauseMax: number;
  rainAdjusted: boolean;
}

const PHASES: NpcPhase[] = ['pagi', 'siang', 'senja', 'malam'];
const BOOT_AT = typeof performance !== 'undefined' ? performance.now() : 0;

/** Shared room time is authoritative when connected. Offline, this mirrors
 * main.ts: both clocks start at DAY_START and advance with DAY_LENGTH_S. */
export function currentNpcWorld(): { day: number; time: number; rain: number } {
  const shared = npcWorldSnapshot();
  const localTime = typeof performance !== 'undefined'
    ? (DAY_START + (performance.now() - BOOT_AT) / 1000 / DAY_LENGTH_S) % 1
    : DAY_START;
  const day = Math.max(0, Number(localStorage.getItem('senja.day') ?? 0) || 0);
  return {
    day,
    time: shared.online && shared.time >= 0 ? shared.time : localTime,
    rain: shared.online ? shared.rain : 0,
  };
}

export function resolveNpcSchedule(
  id: string,
  name: string,
  baseRoute: TilePoint[],
  baseIdle: PlayerAction['kind'],
  world: { day: number; time: number; rain: number } = currentNpcWorld(),
): NpcScheduleState {
  const phase = phaseAt(world.time);
  const pi = PHASES.indexOf(phase);
  const profile = PROFILES[id] ?? genericProfile(name);
  const rainy = world.rain > 0.3;
  const route = rotateRoute(baseRoute, pi);
  const goalPool = profile.goals[pi];
  const goal = goalPool[pickStable(`${id}:${world.day}:${phase}`, goalPool.length)] ?? 'menjalani hari dengan tenang';

  if (rainy && phase !== 'malam') {
    return {
      key: `${world.day}:${phase}:rain`, phase, role: profile.role,
      destination: profile.places[pi],
      activity: baseIdle === 'tend' ? 'merapikan kerjaan' : 'berteduh',
      goal: baseIdle === 'tend' ? goal : `menunggu hujan reda sambil ${goal}`,
      route: route.length ? [route[0]] : baseRoute,
      idle: baseIdle === 'tend' ? 'tend' : 'wait',
      speed: 0.75,
      pauseMin: 5,
      pauseMax: 10,
      rainAdjusted: true,
    };
  }

  return {
    key: `${world.day}:${phase}:dry`, phase, role: profile.role,
    destination: profile.places[pi],
    activity: profile.activities[pi],
    goal,
    route,
    idle: idleForPhase(baseIdle, phase),
    speed: phase === 'pagi' ? 1.05 : phase === 'siang' ? 1 : phase === 'senja' ? 0.9 : 0.65,
    pauseMin: phase === 'malam' ? 5 : phase === 'senja' ? 2.5 : 1.5,
    pauseMax: phase === 'malam' ? 11 : phase === 'senja' ? 7 : 5.5,
    rainAdjusted: false,
  };
}

/** Short enough to survive the server's 64-char place sanitizer. The AI sees
 * this beside the real location, so it can talk about what the NPC is doing
 * without a second inference call just to decide behaviour. */
export function scheduleTalkPlace(realPlace: string, state: NpcScheduleState): string {
  const where = realPlace || state.destination;
  return `${where} | ${state.activity}: ${state.goal}`.slice(0, 63);
}

function phaseAt(time: number): NpcPhase {
  const t = ((time % 1) + 1) % 1;
  if (t < 0.28) return 'malam';
  if (t < 0.45) return 'pagi';
  if (t < 0.66) return 'siang';
  if (t < 0.86) return 'senja';
  return 'malam';
}

function rotateRoute(route: TilePoint[], offset: number): TilePoint[] {
  if (route.length <= 1) return route;
  const n = offset % route.length;
  return [...route.slice(n), ...route.slice(0, n)];
}

function idleForPhase(base: PlayerAction['kind'], phase: NpcPhase): PlayerAction['kind'] {
  if (phase === 'malam' && base === 'idle') return 'wait';
  return base;
}

function pickStable(key: string, count: number): number {
  if (count <= 1) return 0;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % count;
}

function genericProfile(name: string): RoleProfile {
  return {
    role: 'warga setempat',
    places: ['sekitar rumah', 'lingkungan sekitar', 'tempat biasa berkumpul', 'sekitar rumah'],
    activities: ['bersiap', 'menjalani kegiatan', 'bersantai', 'beristirahat'],
    goals: [
      [`menyiapkan urusan ${name}`, 'melihat keadaan sekitar'],
      ['menyelesaikan pekerjaan hari ini', 'menjaga rutinitas tetap beres'],
      ['menyapa orang yang lewat', 'menikmati akhir hari'],
      ['pulang dan beristirahat', 'menutup urusan hari ini'],
    ],
  };
}

const PROFILES: Record<string, RoleProfile> = {
  umar: profile('warga senior kampung', 'kampung', 'keliling kampung', 'kampung', 'rumah', 'memeriksa keadaan kampung', 'menyelesaikan urusan warga', 'mencari kabar dari dermaga'),
  rini: profile('penjaga lapak', 'lapak kampung', 'lapak kampung', 'sekitar lapak', 'rumah', 'menyiapkan dagangan', 'melayani orang yang lewat', 'merapikan sisa dagangan'),
  sari: profile('warga kampung', 'jalan kampung', 'kampung', 'tempat berkumpul', 'rumah', 'melihat siapa yang sudah bangun', 'menyelesaikan urusan kampung', 'bertukar kabar dengan warga'),
  joko: profile('pekerja kampung', 'sisi timur kampung', 'sisi timur kampung', 'jalan kampung', 'rumah', 'mengecek pekerjaan pagi', 'membereskan pekerjaan utama', 'memastikan semuanya aman'),
  tarno: profile('pemancing tua', 'dermaga', 'ujung dermaga', 'ujung dermaga', 'dermaga', 'membaca air pagi', 'menunggu ikan yang tepat', 'mengamati perubahan air'),
  ika: profile('penjaga teluk', 'teluk', 'tepi teluk', 'teluk', 'teluk', 'mengecek keadaan teluk', 'mengawasi air dan perahu', 'memastikan teluk tenang'),
  wahyu: profile('petani', 'kebun', 'petak kebun', 'kebun', 'rumah', 'mengecek tanaman', 'merawat petak yang perlu', 'merapikan alat kebun'),
  nur: profile('warga kampung', 'jalan selatan kampung', 'kampung', 'jalan kampung', 'rumah', 'membantu urusan pagi', 'menyelesaikan keperluan kampung', 'menemui warga sebelum pulang'),
  bagas: profile('pedagang', 'jalan utara kampung', 'area dagang', 'jalan kampung', 'rumah', 'mencari peluang dagang', 'mengurus jual beli', 'menghitung hasil hari ini'),
  lastri: profile('warga kampung', 'sisi barat kampung', 'kampung', 'jalan kampung', 'rumah', 'mengecek rumah dan sekitar', 'mengurus kebutuhan harian', 'menyapa tetangga sebelum pulang'),
  dara: profile('pemandu pos timur', 'pos timur', 'jalur pos timur', 'pos timur', 'pos timur', 'mengecek jalur pagi', 'membantu orang yang lewat', 'memastikan jalur tetap aman'),
  darto: profile('penjaga pos', 'pos timur', 'pos timur', 'pos timur', 'pos timur', 'membuka pos', 'menjaga perlintasan', 'menutup urusan pos'),
  maya: profile('warga kampung selatan', 'kampung selatan', 'kampung selatan', 'jalan kampung', 'rumah', 'mengurus kebutuhan pagi', 'menyelesaikan pekerjaan kampung', 'bertemu warga sebelum malam'),
  raka: profile('pekerja kampung selatan', 'kampung selatan', 'kampung selatan', 'kampung selatan', 'rumah', 'menyiapkan pekerjaan', 'membereskan tugas utama', 'mengecek hasil kerja'),
  gerald: profile('penjaga benteng', 'benteng lama', 'halaman benteng', 'benteng lama', 'pos jaga', 'memeriksa halaman', 'menjaga benteng tetap tertib', 'mengecek penjagaan sore'),
  maret: profile('pengurus benteng', 'benteng lama', 'benteng lama', 'halaman benteng', 'ruang dalam', 'menyiapkan kebutuhan benteng', 'merawat apa yang perlu', 'merapikan urusan benteng'),
  darun: profile('penjaga menara', 'benteng lama', 'pos menara', 'pos menara', 'pos menara', 'memulai giliran jaga', 'mengawasi sekitar benteng', 'menyelesaikan giliran jaga'),
  vex: profile('teknisi dermaga', 'dermaga neon', 'jalur dermaga neon', 'dermaga neon', 'bengkel', 'mengecek sistem dermaga', 'menangani gangguan teknis', 'melakukan pemeriksaan akhir'),
  noor: profile('pengamat dermaga', 'dermaga neon', 'tepi dermaga neon', 'dermaga neon', 'dermaga neon', 'membaca kondisi air', 'mengamati lalu lintas dermaga', 'mencatat perubahan sore'),
  kiran: profile('pedagang suku cadang', 'dermaga neon', 'area dagang neon', 'dermaga neon', 'bengkel', 'mengecek stok', 'mencari transaksi bagus', 'menghitung hasil hari ini'),
  ambu: profile('penjaga rimbun', 'rimbun cahaya', 'jalur rimbun', 'rimbun cahaya', 'rimbun cahaya', 'mendengar keadaan rimbun', 'menjaga jalur tetap tenang', 'memeriksa cahaya menjelang malam'),
  siul: profile('pengamat rimbun', 'rimbun cahaya', 'tepi rimbun', 'rimbun cahaya', 'rimbun cahaya', 'mengamati embun pagi', 'memperhatikan perubahan alam', 'menunggu suara malam'),
  lengan: profile('perawat rimbun', 'rimbun cahaya', 'kebun rimbun', 'rimbun cahaya', 'rimbun cahaya', 'merawat tanaman pagi', 'menjaga tanaman tetap sehat', 'membereskan kebun sebelum malam'),
};

function profile(
  role: string,
  pagiPlace: string,
  siangPlace: string,
  senjaPlace: string,
  malamPlace: string,
  pagiGoal: string,
  siangGoal: string,
  senjaGoal: string,
): RoleProfile {
  return {
    role,
    places: [pagiPlace, siangPlace, senjaPlace, malamPlace],
    activities: ['bersiap kerja', 'bekerja', 'menutup kegiatan', 'beristirahat'],
    goals: [
      [pagiGoal, `${pagiGoal} dengan tenang`],
      [siangGoal, `${siangGoal} tanpa terburu-buru`],
      [senjaGoal, `${senjaGoal} sebelum gelap`],
      ['beristirahat setelah kegiatan', 'menjaga tenaga untuk besok'],
    ],
  };
}

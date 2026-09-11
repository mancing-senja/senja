/** Fishing.
 *
 *  Tuned to be unhurried on purpose: the bite window is generous, the reel
 *  is a hold-to-keep-tension bar you have to actively fumble to lose, and
 *  failure costs you nothing but the cast. The interesting variable is
 *  *what* you catch, which depends on the time of day and how far out the
 *  bobber landed — not on reflexes. */

import { TILE } from '../../shared/constants';
import { view } from '../engine/view';
import { C, col01 } from '../art/palette';
import { textWidth } from '../art/font';
import type { Input } from '../engine/input';
import type { Draw } from '../render/draw';
import { Blend } from '../engine/batch';
import type { Particles } from '../render/scene';
import { Tile, isWater, tileAt, type WorldMap } from '../world/map';
import { DEFAULT_SPOT, spotAt, type Spot } from '../world/spots';
import { districtAt, type District } from '../world/districts';
import type { LocalPlayer } from './player';
import { handPos } from './player';
import type { Audio } from './audio';
import type { Season } from '../world/season';
import {
  COMMON, gradeById, luckFrom, rollGrade, type Grade, type GradeId,
} from './grade';
import {
  STYLES, applyGrade, newFight, styleFor, type FightState, type FightStyle,
} from './fight';
import {
  baitById, baitWeight, brokenPart, conditionFactor, consumeBaitCast,
  damageTackle, dragStats, gearCondition, hookSizeFit, hookSizeStats, hookSizeWeight,
  hookStats, lineStats, rodActionStats, rodStats,
  type BaitId, type GearPart,
} from './shop';

export interface Species {
  id: string;
  label: string;
  /** Base coin value at average size. */
  value: number;
  minCm: number;
  maxCm: number;
  /** Relative weight during each phase; index matches PHASES. */
  weight: [number, number, number, number];
  /** How hard it pulls. Only changes the reel feel, never the outcome much. */
  fight: number;
  blurb: string;
}

/** pagi | siang | senja | malam */
const PHASES = ['pagi', 'siang', 'senja', 'malam'] as const;

export const SPECIES: Species[] = [
  // --- common, all day, close in. The fish you actually catch most nights.
  {
    id: 'wader', label: 'Wader', value: 8, minCm: 6, maxCm: 14,
    weight: [6, 5, 3, 2], fight: 0.4,
    blurb: 'Kecil, ramai, ga pernah bikin kecewa.',
  },
  {
    id: 'seluang', label: 'Seluang', value: 7, minCm: 5, maxCm: 12,
    weight: [5, 4, 3, 2], fight: 0.3,
    blurb: 'Datang serombongan, pergi serombongan.',
  },
  {
    id: 'sepat', label: 'Sepat', value: 11, minCm: 8, maxCm: 18,
    weight: [4, 4, 4, 2], fight: 0.5,
    blurb: 'Suka nyempil di sela eceng gondok.',
  },
  {
    id: 'betok', label: 'Betok', value: 14, minCm: 9, maxCm: 20,
    weight: [3, 3, 3, 3], fight: 0.8,
    blurb: 'Siripnya tajam. Pegang yang bener.',
  },
  {
    id: 'nila', label: 'Nila', value: 18, minCm: 12, maxCm: 30,
    weight: [4, 5, 3, 1], fight: 0.9,
    blurb: 'Ikan kolam paling jujur.',
  },
  {
    id: 'tawes', label: 'Tawes', value: 20, minCm: 14, maxCm: 32,
    weight: [3, 4, 3, 1], fight: 0.9,
    blurb: 'Perak bersih, kayak duit receh gede.',
  },
  {
    id: 'sunfish', label: 'Ikan Matahari', value: 22, minCm: 10, maxCm: 24,
    weight: [3, 6, 3, 0.6], fight: 0.7,
    blurb: 'Sisiknya nangkep cahaya siang.',
  },
  {
    id: 'jelawat', label: 'Jelawat', value: 26, minCm: 18, maxCm: 40,
    weight: [2.5, 3, 3, 1], fight: 1.1,
    blurb: 'Makan daun jatuh, gede pelan-pelan.',
  },

  // --- evening and night
  {
    id: 'lele', label: 'Lele', value: 24, minCm: 20, maxCm: 45,
    weight: [1, 0.8, 3, 5], fight: 1.2,
    blurb: 'Nunggu di dasar sampai lampu nyala.',
  },
  {
    id: 'gabus', label: 'Gabus', value: 32, minCm: 22, maxCm: 50,
    weight: [1.5, 1.5, 3.5, 4], fight: 1.5,
    blurb: 'Predator sabar. Kamu juga harus sabar.',
  },
  {
    id: 'moonperch', label: 'Betik Bulan', value: 34, minCm: 14, maxCm: 30,
    weight: [0.8, 0.6, 3, 6], fight: 0.9,
    blurb: 'Cuma naik pas air udah gelap.',
  },
  {
    id: 'patin', label: 'Patin', value: 36, minCm: 25, maxCm: 60,
    weight: [1, 1.5, 3, 3.5], fight: 1.4,
    blurb: 'Berat, halus, ga banyak drama.',
  },
  {
    id: 'hampala', label: 'Hampala', value: 40, minCm: 20, maxCm: 45,
    weight: [2, 3, 3.5, 1], fight: 1.5,
    blurb: 'Nyamber umpan kayak lagi buru-buru.',
  },
  {
    id: 'emberkoi', label: 'Koi Bara', value: 48, minCm: 20, maxCm: 42,
    weight: [0.8, 1.5, 5, 2], fight: 1.3,
    blurb: 'Warnanya kayak langit jam enam sore.',
  },
  {
    id: 'bawal', label: 'Bawal', value: 44, minCm: 18, maxCm: 38,
    weight: [1.5, 2, 2.5, 2], fight: 1.2,
    blurb: 'Bulat, tebal, giginya bikin kaget.',
  },
  {
    id: 'duskeel', label: 'Belut Senja', value: 58, minCm: 30, maxCm: 70,
    weight: [0.4, 0.4, 3.5, 3], fight: 1.6,
    blurb: 'Panjang, sabar, lebih sabar dari kamu.',
  },
  {
    id: 'belida', label: 'Belida', value: 70, minCm: 30, maxCm: 65,
    weight: [0.4, 0.5, 1.5, 2], fight: 1.7,
    blurb: 'Pipih kayak pisau. Susah ketemu sekarang.',
  },

  // --- rare, deep water, mostly after dark
  {
    id: 'arwana', label: 'Arwana', value: 110, minCm: 35, maxCm: 80,
    weight: [0.3, 0.4, 0.9, 1.1], fight: 1.9,
    blurb: 'Naik ke permukaan sekali, terus ilang.',
  },
  {
    id: 'glassfin', label: 'Sirip Kaca', value: 95, minCm: 12, maxCm: 26,
    weight: [0.4, 0.5, 0.9, 1.2], fight: 1.1,
    blurb: 'Nyaris tembus pandang. Jarang keliatan.',
  },
  {
    id: 'ikanhantu', label: 'Ikan Hantu', value: 140, minCm: 40, maxCm: 95,
    weight: [0.05, 0.05, 0.5, 1.2], fight: 2.0,
    blurb: 'Katanya cuma cerita. Katanya.',
  },
  {
    id: 'bintangair', label: 'Bintang Air', value: 165, minCm: 10, maxCm: 22,
    weight: [0.05, 0.05, 0.3, 1.0], fight: 1.0,
    blurb: 'Kecil, terang, cuma muncul pas langit bersih.',
  },

  // --- Benteng Lama. Cold, still moat water under old stone.
  {
    id: 'lelemail', label: 'Lele Zirah', value: 52, minCm: 25, maxCm: 55,
    weight: [1.2, 1.0, 2.0, 3.0], fight: 1.5,
    blurb: 'Kulitnya keras kayak dilapis pelat.',
  },
  {
    id: 'koibenteng', label: 'Koi Benteng', value: 78, minCm: 22, maxCm: 48,
    weight: [1.5, 2.0, 2.2, 1.2], fight: 1.3,
    blurb: 'Katanya keturunan koi peliharaan penghuni benteng.',
  },
  {
    id: 'ikanpanji', label: 'Ikan Panji', value: 96, minCm: 18, maxCm: 40,
    weight: [0.8, 1.0, 1.6, 1.4], fight: 1.6,
    blurb: 'Siripnya berkibar persis panji di menara itu.',
  },

  // --- Dermaga Neon. Warm outfall water; nothing here is quite natural.
  {
    id: 'kromsirip', label: 'Krom Sirip', value: 64, minCm: 16, maxCm: 38,
    weight: [1.5, 1.5, 2.0, 2.6], fight: 1.4,
    blurb: 'Siripnya memantul cahaya papan reklame.',
  },
  {
    id: 'ikanstatik', label: 'Ikan Statik', value: 88, minCm: 12, maxCm: 30,
    weight: [1.0, 1.0, 1.8, 2.8], fight: 1.2,
    blurb: 'Kalau dipegang, tangan kesemutan sedikit.',
  },
  {
    id: 'nikelmas', label: 'Nikel Mas', value: 118, minCm: 20, maxCm: 44,
    weight: [0.6, 0.8, 1.2, 1.6], fight: 1.7,
    blurb: 'Berat ga wajar buat ukuran segitu.',
  },

  // --- Rimbun Cahaya. Only bite where the water lights itself.
  {
    id: 'sisikembun', label: 'Sisik Embun', value: 72, minCm: 10, maxCm: 24,
    weight: [1.6, 1.2, 1.6, 2.4], fight: 0.9,
    blurb: 'Sisiknya basah terus, walau sudah lama di darat.',
  },
  {
    id: 'ikanrembulan', label: 'Ikan Rembulan', value: 135, minCm: 20, maxCm: 46,
    weight: [0.4, 0.4, 1.4, 2.6], fight: 1.5,
    blurb: 'Cuma naik kalau air kolamnya lagi terang.',
  },
  {
    id: 'naganila', label: 'Naga Nila', value: 190, minCm: 45, maxCm: 110,
    weight: [0.15, 0.15, 0.8, 1.6], fight: 2.2,
    blurb: 'Panjang, pelan, dan sama sekali tidak takut.',
  },

  // --- Kampung: shallows and reed beds. What you actually catch most nights.
  {
    id: 'gurame', label: 'Gurame', value: 28, minCm: 18, maxCm: 40,
    weight: [3, 4, 3, 1], fight: 1.0,
    blurb: 'Tenang, tebal, ga suka buru-buru.',
  },
  {
    id: 'nilem', label: 'Nilem', value: 13, minCm: 10, maxCm: 22,
    weight: [4, 4, 3, 1.5], fight: 0.6,
    blurb: 'Mulutnya nyedot lumut di batu.',
  },
  {
    id: 'bader', label: 'Bader', value: 15, minCm: 10, maxCm: 24,
    weight: [4, 4, 3, 1], fight: 0.7,
    blurb: 'Perak tipis, gampang lepas dari tangan.',
  },
  {
    id: 'lukas', label: 'Lukas', value: 17, minCm: 12, maxCm: 26,
    weight: [3, 4, 3, 1.5], fight: 0.8,
    blurb: 'Suka nunggu di bawah rakit bambu.',
  },
  {
    id: 'keting', label: 'Keting', value: 19, minCm: 12, maxCm: 28,
    weight: [2, 2, 3, 4], fight: 0.9,
    blurb: 'Patilnya kecil tapi bikin kapok.',
  },
  {
    id: 'baung', label: 'Baung', value: 38, minCm: 24, maxCm: 55,
    weight: [1, 1, 3, 4], fight: 1.4,
    blurb: 'Naik pas air keruh habis hujan.',
  },
  {
    id: 'tambakan', label: 'Tambakan', value: 21, minCm: 14, maxCm: 30,
    weight: [3, 3, 3, 1.5], fight: 0.8,
    blurb: 'Bibirnya tebal, kayak lagi cemberut.',
  },
  {
    id: 'sepatsiam', label: 'Sepat Siam', value: 12, minCm: 8, maxCm: 18,
    weight: [4, 4, 3, 2], fight: 0.4,
    blurb: 'Sepupu sepat yang lebih ramai.',
  },
  {
    id: 'lais', label: 'Lais', value: 34, minCm: 22, maxCm: 48,
    weight: [1.5, 1.5, 3, 3], fight: 1.2,
    blurb: 'Pipih panjang, licin luar biasa.',
  },
  {
    id: 'toman', label: 'Toman', value: 86, minCm: 40, maxCm: 95,
    weight: [1, 1, 2, 2.5], fight: 2.0,
    blurb: 'Anaknya oranye. Induknya bukan main.',
  },
  {
    id: 'kelabau', label: 'Kelabau', value: 42, minCm: 26, maxCm: 52,
    weight: [2, 2.5, 2.5, 1.5], fight: 1.3,
    blurb: 'Sisiknya gede, kayak uang logam lama.',
  },
  {
    id: 'betutu', label: 'Betutu', value: 66, minCm: 20, maxCm: 45,
    weight: [0.5, 0.5, 2, 3.5], fight: 1.1,
    blurb: 'Diam di dasar sampai kamu lupa dia ada.',
  },
  {
    id: 'sili', label: 'Sili', value: 54, minCm: 28, maxCm: 64,
    weight: [0.6, 0.6, 2.5, 3.5], fight: 1.5,
    blurb: 'Bentuknya belut, tabiatnya bukan.',
  },
  {
    id: 'tengadak', label: 'Tengadak', value: 30, minCm: 18, maxCm: 36,
    weight: [2.5, 3, 3, 1], fight: 1.0,
    blurb: 'Siripnya merah kalau kena senja.',
  },
  {
    id: 'genggehek', label: 'Genggehek', value: 16, minCm: 11, maxCm: 22,
    weight: [3.5, 3.5, 3, 1], fight: 0.7,
    blurb: 'Kecil, tapi larinya paling kencang.',
  },
  {
    id: 'waderpari', label: 'Wader Pari', value: 10, minCm: 7, maxCm: 15,
    weight: [5, 4.5, 3, 1.5], fight: 0.4,
    blurb: 'Punggungnya bergaris kayak jalur setapak.',
  },
  {
    id: 'paray', label: 'Paray', value: 9, minCm: 6, maxCm: 14,
    weight: [5, 4, 3, 2], fight: 0.35,
    blurb: 'Suka loncat sendiri kalau kaget.',
  },
  {
    id: 'beunteur', label: 'Beunteur', value: 11, minCm: 7, maxCm: 16,
    weight: [4.5, 4, 3, 2], fight: 0.5,
    blurb: 'Ramai di air dangkal berbatu.',
  },
  {
    id: 'hampalaraja', label: 'Hampala Raja', value: 72, minCm: 38, maxCm: 70,
    weight: [1.5, 2, 2.5, 1], fight: 1.9,
    blurb: 'Yang tua. Sudah pernah lepas sekali.',
  },
  {
    id: 'jambal', label: 'Jambal', value: 58, minCm: 30, maxCm: 72,
    weight: [1, 1.5, 2.5, 2.5], fight: 1.6,
    blurb: 'Berat, tenang, dan susah dibujuk.',
  },

  // --- Kampung after dark. These only come up once the light goes.
  {
    id: 'lelebulan', label: 'Lele Bulan', value: 46, minCm: 25, maxCm: 52,
    weight: [0.4, 0.3, 2, 5], fight: 1.3,
    blurb: 'Kumisnya panjang, ingatannya lebih panjang.',
  },
  {
    id: 'udanggalah', label: 'Udang Galah', value: 33, minCm: 12, maxCm: 26,
    weight: [1, 1, 2.5, 4], fight: 0.6,
    blurb: 'Bukan ikan. Tetap masuk keranjang.',
  },
  {
    id: 'sidatmuda', label: 'Sidat Muda', value: 62, minCm: 30, maxCm: 68,
    weight: [0.5, 0.4, 2, 4.5], fight: 1.6,
    blurb: 'Lahir jauh di laut, pulang ke sungai ini.',
  },
  {
    id: 'ikankaca', label: 'Ikan Kaca', value: 44, minCm: 8, maxCm: 16,
    weight: [0.6, 0.6, 2, 4], fight: 0.5,
    blurb: 'Tulangnya kelihatan kalau diangkat ke lampu.',
  },
  {
    id: 'betikapi', label: 'Betik Api', value: 52, minCm: 14, maxCm: 28,
    weight: [0.3, 0.3, 2.5, 4.5], fight: 1.0,
    blurb: 'Siripnya menyala sedikit di air gelap.',
  },
  {
    id: 'kepitingrawa', label: 'Kepiting Rawa', value: 26, minCm: 10, maxCm: 20,
    weight: [1.5, 1.5, 2, 3], fight: 0.7,
    blurb: 'Capitnya lebih cepat dari tanganmu.',
  },
  {
    id: 'gabusraja', label: 'Gabus Raja', value: 124, minCm: 45, maxCm: 88,
    weight: [0.3, 0.3, 1.2, 2.2], fight: 2.1,
    blurb: 'Yang paling sabar di rawa ini.',
  },

  // --- Benteng Lama. Cold moat water under old stone.
  {
    id: 'ikanperisai', label: 'Ikan Perisai', value: 68, minCm: 22, maxCm: 46,
    weight: [1, 1, 1.8, 2.4], fight: 1.6,
    blurb: 'Sisiknya tersusun rapi seperti pelat zirah.',
  },
  {
    id: 'lelemenara', label: 'Lele Menara', value: 74, minCm: 30, maxCm: 62,
    weight: [0.8, 0.8, 2, 2.8], fight: 1.7,
    blurb: 'Ditemukan di dasar parit, dekat pondasi.',
  },
  {
    id: 'ikanlonceng', label: 'Ikan Lonceng', value: 88, minCm: 16, maxCm: 34,
    weight: [0.8, 1, 1.6, 1.8], fight: 1.2,
    blurb: 'Kalau diangkat, siripnya berbunyi pelan.',
  },
  {
    id: 'koipusaka', label: 'Koi Pusaka', value: 132, minCm: 28, maxCm: 55,
    weight: [0.8, 1.2, 1.6, 1.0], fight: 1.5,
    blurb: 'Coraknya tidak berubah sejak benteng masih berdiri.',
  },
  {
    id: 'ikankunci', label: 'Ikan Kunci', value: 104, minCm: 14, maxCm: 30,
    weight: [0.5, 0.6, 1.2, 1.6], fight: 1.1,
    blurb: 'Bentuknya persis kunci gerbang yang hilang.',
  },
  {
    id: 'guramibatu', label: 'Gurami Batu', value: 59, minCm: 20, maxCm: 42,
    weight: [1.2, 1.4, 1.6, 1.2], fight: 1.3,
    blurb: 'Abu-abu seperti tembok yang menaunginya.',
  },
  {
    id: 'belutparit', label: 'Belut Parit', value: 77, minCm: 32, maxCm: 70,
    weight: [0.6, 0.6, 1.8, 2.6], fight: 1.8,
    blurb: 'Hidup di celah batu yang tidak ada yang ukur.',
  },

  // --- Dermaga Neon. Warm outfall water; nothing here is quite natural.
  {
    id: 'ikansolder', label: 'Ikan Solder', value: 70, minCm: 14, maxCm: 32,
    weight: [1.2, 1.2, 1.8, 2.4], fight: 1.2,
    blurb: 'Baunya seperti bengkel. Rasanya jangan tanya.',
  },
  {
    id: 'sirippanel', label: 'Sirip Panel', value: 82, minCm: 18, maxCm: 36,
    weight: [1, 1.2, 1.8, 2.4], fight: 1.4,
    blurb: 'Siripnya datar dan bersegi, seperti dicetak.',
  },
  {
    id: 'ikankabel', label: 'Ikan Kabel', value: 94, minCm: 26, maxCm: 58,
    weight: [0.8, 0.8, 1.6, 2.6], fight: 1.6,
    blurb: 'Panjang, berlapis, dan hangat waktu dipegang.',
  },
  {
    id: 'parineon', label: 'Pari Neon', value: 148, minCm: 24, maxCm: 50,
    weight: [0.5, 0.6, 1.4, 2.2], fight: 1.5,
    blurb: 'Melayang, bukan berenang.',
  },
  {
    id: 'ikanglitch', label: 'Ikan Glitch', value: 176, minCm: 12, maxCm: 28,
    weight: [0.3, 0.3, 1.0, 2.0], fight: 1.0,
    blurb: 'Warnanya tidak sama dua kali.',
  },
  {
    id: 'bawalkrom', label: 'Bawal Krom', value: 86, minCm: 18, maxCm: 38,
    weight: [1, 1.2, 1.6, 1.8], fight: 1.3,
    blurb: 'Memantulkan papan reklame di seberang.',
  },
  {
    id: 'lelevoltase', label: 'Lele Voltase', value: 112, minCm: 28, maxCm: 60,
    weight: [0.6, 0.6, 1.6, 2.8], fight: 1.9,
    blurb: 'Pegang di ekor. Serius.',
  },
  {
    id: 'ikanpendingin', label: 'Ikan Pendingin', value: 96, minCm: 20, maxCm: 42,
    weight: [1, 1, 1.4, 2.0], fight: 1.2,
    blurb: 'Dingin walau airnya hangat.',
  },

  // --- Rimbun Cahaya. Only bite where the water lights itself.
  {
    id: 'ikanlentera', label: 'Ikan Lentera', value: 126, minCm: 14, maxCm: 30,
    weight: [0.6, 0.5, 1.6, 2.8], fight: 1.0,
    blurb: 'Membawa cahayanya sendiri ke dasar.',
  },
  {
    id: 'sisikkabut', label: 'Sisik Kabut', value: 108, minCm: 16, maxCm: 34,
    weight: [1.2, 1.0, 1.6, 2.2], fight: 0.9,
    blurb: 'Batasnya kabur, seperti belum selesai digambar.',
  },
  {
    id: 'ikanakar', label: 'Ikan Akar', value: 88, minCm: 22, maxCm: 48,
    weight: [1.4, 1.2, 1.4, 1.8], fight: 1.4,
    blurb: 'Sirip belakangnya bercabang seperti akar.',
  },
  {
    id: 'ikandoa', label: 'Ikan Doa', value: 158, minCm: 18, maxCm: 38,
    weight: [0.4, 0.4, 1.4, 2.4], fight: 1.2,
    blurb: 'Yang menangkapnya konon berhenti meminta.',
  },
  {
    id: 'naganilamuda', label: 'Naga Nila Muda', value: 96, minCm: 25, maxCm: 52,
    weight: [0.6, 0.6, 1.4, 2.0], fight: 1.7,
    blurb: 'Belum panjang. Sudah tidak takut.',
  },
  {
    id: 'ikanpurnama', label: 'Ikan Purnama', value: 184, minCm: 22, maxCm: 46,
    weight: [0.2, 0.2, 1.0, 2.4], fight: 1.5,
    blurb: 'Hanya naik kalau bulannya bulat.',
  },
  {
    id: 'ikanbisik', label: 'Ikan Bisik', value: 142, minCm: 10, maxCm: 22,
    weight: [0.5, 0.4, 1.2, 2.2], fight: 0.8,
    blurb: 'Kecil dan tidak pernah membuat riak.',
  },
  {
    id: 'sidatcahaya', label: 'Sidat Cahaya', value: 206, minCm: 40, maxCm: 95,
    weight: [0.15, 0.15, 0.8, 1.8], fight: 2.3,
    blurb: 'Panjangnya diukur dari cerita, bukan dari meteran.',
  },

  // --- More of what the lake gives back.
  {
    id: 'jaringsobek', label: 'Jaring Sobek', value: 3, minCm: 20, maxCm: 40,
    weight: [1, 1, 1, 1], fight: 0.4,
    blurb: 'Punya siapa ini, tidak ada yang mengaku.',
  },
  {
    id: 'botolkaca', label: 'Botol Kaca', value: 4, minCm: 12, maxCm: 20,
    weight: [1, 1, 1, 1], fight: 0.3,
    blurb: 'Ada kertas di dalamnya. Sudah hancur.',
  },
  {
    id: 'rantaikarat', label: 'Rantai Karat', value: 6, minCm: 15, maxCm: 30,
    weight: [0.8, 0.8, 1, 1], fight: 0.6,
    blurb: 'Ujung satunya masih di dasar.',
  },
  {
    id: 'papandermaga', label: 'Papan Dermaga', value: 5, minCm: 25, maxCm: 45,
    weight: [1, 1, 1, 1], fight: 0.5,
    blurb: 'Dari dermaga yang mana, tidak jelas.',
  },

  // --- junk
  {
    id: 'oldboot', label: 'Sepatu Butut', value: 2, minCm: 25, maxCm: 30,
    weight: [1, 1, 1, 1], fight: 0.3,
    blurb: 'Seseorang kehilangan ini. Lama sekali lalu.',
  },
  {
    id: 'kaleng', label: 'Kaleng Kosong', value: 1, minCm: 10, maxCm: 14,
    weight: [1, 1, 0.8, 0.8], fight: 0.2,
    blurb: 'Setidaknya danaunya jadi lebih bersih.',
  },
];

const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function speciesById(id: string): Species | undefined {
  return BY_ID.get(id);
}

function phaseIndex(time: number): number {
  const t = ((time % 1) + 1) % 1;
  if (t < 0.28) return 3;      // still dark
  if (t < 0.45) return 0;      // pagi
  if (t < 0.66) return 1;      // siang
  if (t < 0.86) return 2;      // senja
  return 3;                    // malam
}

export function phaseLabel(time: number): string {
  return PHASES[phaseIndex(time)];
}

/** How dark it is, 0..1. Feeds the grade roll: the rare fish come up after
 *  the light goes, which is the whole reason to still be out there. */
function nightness(time: number): number {
  return phaseIndex(time) === 3 ? 1 : phaseIndex(time) === 2 ? 0.5 : 0;
}

type FeedingId = 'normal' | 'hatch' | 'drizzle' | 'runoff' | 'deep-calm';

interface FeedingCondition {
  id: FeedingId;
  label: string;
  waitMul: number;
  surfaceMul: number;
  currentMul: number;
  deepMul: number;
  preferredBait: BaitId | null;
}

const NORMAL_FEEDING: FeedingCondition = {
  id: 'normal',
  label: 'aktivitas normal',
  waitMul: 1,
  surfaceMul: 1,
  currentMul: 1,
  deepMul: 1,
  preferredBait: null,
};

/** Three things decide what bites: the hour, how far out the bobber landed,
 *  and which spot it landed in. The spot is the strongest of the three —
 *  that is what makes walking to the swamp at night worth doing. */
interface SpeciesWeatherResponse {
  mul: number;
  surfaceActive: boolean;
  currentFish: boolean;
}

function weatherResponse(fish: Species, spot: Spot, rain: number): SpeciesWeatherResponse {
  const rain01 = clamp01(rain);
  const weatherStyle = styleFor(fish);
  const deep = Math.min(1, fish.maxCm / 90);
  const surfaceActive = fish.maxCm <= 42
    && (weatherStyle.id === 'lincah' || weatherStyle.id === 'menggetar');
  const currentFish = spot.current >= 0.45
    && (weatherStyle.id === 'lari' || weatherStyle.id === 'menyelam' || fish.fight >= 1.25);
  let mul = 1;
  if (surfaceActive) mul *= 1 + rain01 * 0.28;
  if (currentFish) mul *= 1 + rain01 * 0.18;
  if (deep > 0.72 && rain01 > 0.65) mul *= 0.96;
  return { mul, surfaceActive, currentFish };
}

/** Public notebook seam: exactly the same weather multiplier used by RNG. */
export function weatherWeightForSpecies(fish: Species, spot: Spot, rain: number): number {
  return weatherResponse(fish, spot, rain).mul;
}

function rollSpecies(
  time: number, depth01: number, spot: Spot, district: District | null,
  season: Season, baited: BaitId | null, rain: number,
  feeding: FeedingCondition,
): Species {
  const p = phaseIndex(time);
  const weights = SPECIES.map((s) => {
    let w = s.weight[p];
    // Rare fish (high value) get their weight scaled up in deep water.
    const rarity = Math.min(1, s.value / 120);
    w *= 1 + rarity * depth01 * 2.2;
    // Junk is less likely the further you cast.
    if (s.id === 'oldboot' || s.id === 'kaleng') w *= 1 - depth01 * 0.6;
    w *= spot.mult[s.id] ?? 1;
    // The district multiplies on top of the spot. Standing at the neon quay
    // is a bigger change to what bites than the hour ever is.
    if (district) w *= district.fish[s.id] ?? 1;
    // The season, last and lightest. Warm water brings the surface fish up;
    // cold water pushes everything to the bottom, so winter gives up fewer
    // fish and better ones. Applied by where a species sits in the water
    // rather than per species, because eighty-six hand-tuned seasonal
    // multipliers would be eighty-six chances to make a fish disappear from
    // the game for a week without anyone noticing.
    const deep = Math.min(1, s.maxCm / 90);
    w *= deep * season.deepBias + (1 - deep) * season.shallowBias;

    // Rain is part of the same world the player can see. It never summons an
    // impossible fish; it only reshapes the pool that this spot/time already
    // allows. The helper is shared with the field journal so learned weather
    // notes can never drift away from the actual roll.
    const weather = weatherResponse(s, spot, rain);
    const surfaceActive = weather.surfaceActive;
    const currentFish = weather.currentFish;
    w *= weather.mul;

    // Feeding windows are readable combinations of conditions already in the
    // world. They bend an already-valid pool; they never bypass spot/district.
    if (surfaceActive) w *= feeding.surfaceMul;
    if (currentFish) w *= feeding.currentMul;
    if (deep > 0.68) w *= feeding.deepMul;
    if (baited && feeding.preferredBait === baited) w *= 1.10;

    // Bait is deliberately last. It can tilt a roll that already makes sense
    // here, but it never overrides a spot or district that suppresses a fish.
    if (baited) {
      const style = styleFor(s);
      w *= baitWeight(baited, s.value, s.fight, s.maxCm, style.id);
    }
    // Hook size is a preference, not a gate. A huge hook at Teluk Eceng
    // makes tiny fish less eager; a small hook is less attractive to monsters.
    w *= hookSizeWeight(s.maxCm);
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SPECIES.length; i++) {
    r -= weights[i];
    if (r <= 0) return SPECIES[i];
  }
  return SPECIES[0];
}

export type FishState =
  | 'idle' | 'aim' | 'cast' | 'wait' | 'nibble' | 'omen'
  | 'bite' | 'reel' | 'card' | 'miss';

export type CatchQualityId = 'kasar' | 'rapi' | 'mulus';

export interface Catch {
  species: Species;
  cm: number;
  coins: number;
  perfect: boolean;
  quality: CatchQualityId;
  qualityScore: number;
  grade: Grade;
}

/** A palette index as the 0..1 triple the sprite tint wants. */
function colTint(c: C): [number, number, number] {
  return col01(c);
}

const MAX_CAST = 96;
const MIN_CAST = 26;

function gearName(part: GearPart): string {
  return part === 'rod' ? 'joran' : part === 'line' ? 'senar' : 'kail';
}

export type MouthType = 'lunak' | 'normal' | 'keras';

export function mouthTypeForSpecies(fish: Species): MouthType {
  return mouthType(fish, styleFor(fish));
}

function mouthType(fish: Species, style: FightStyle): MouthType {
  if (fish.maxCm <= 28 && (style.id === 'lincah' || style.id === 'menggetar')) return 'lunak';
  if (style.id === 'menyelam' || style.id === 'lari' || fish.fight >= 1.65) return 'keras';
  return 'normal';
}

function mouthHint(mouth: MouthType): string {
  if (mouth === 'lunak') return 'mulut lunak · jangan paksa tension';
  if (mouth === 'keras') return 'mulut keras · hook bersih lebih penting';
  return 'mulut normal';
}

type EscapeKind = 'run' | 'jump' | 'dive' | 'headshake' | 'roll';
type FishEnergyPhase = 'fresh' | 'working' | 'tired' | 'spent';

interface EscapeBeat {
  at: number;
  label: string;
  kind: EscapeKind;
  mul: number;
  duration: number;
}

function escapeBeat(style: string, used: number): EscapeBeat | null {
  if (style === 'lari') {
    if (used === 0) {
      return { at: 0.38, label: 'first run — biarkan drag kerja', kind: 'run', mul: 1.22, duration: 1.8 };
    }
    if (used === 1) {
      return { at: 0.74, label: 'second run — jangan buru-buru', kind: 'run', mul: 1.18, duration: 1.5 };
    }
    return null;
  }
  if (used > 0) return null;
  if (style === 'menyelam') {
    return { at: 0.58, label: 'dive kedua — jangan sampai slack', kind: 'dive', mul: 1.20, duration: 1.7 };
  }
  if (style === 'mengendap') {
    return { at: 0.80, label: 'rolling dekat tepi — jangan paksa', kind: 'roll', mul: 1.24, duration: 1.25 };
  }
  if (style === 'lincah') {
    return { at: 0.48, label: 'ikan lompat — turunkan tekanan', kind: 'jump', mul: 1.14, duration: 1.15 };
  }
  if (style === 'menggetar') {
    return { at: 0.55, label: 'headshake — jangan tahan keras', kind: 'headshake', mul: 1.16, duration: 1.25 };
  }
  return { at: 0.70, label: 'ikan coba lari sekali lagi', kind: 'run', mul: 1.10, duration: 1.2 };
}

function spotHazardHint(spot: Spot): string {
  if (spot.abrasion >= 0.65) return 'batu tajam · senar tahan gesek';
  if (spot.cover >= 0.72) return 'cover rapat · jaga ikan tetap keluar';
  if (spot.current >= 0.60) return 'arus kuat · joran & senar lebih berat';
  if (spot.depth >= 0.85) return 'air dalam · beban fight lebih besar';
  return '';
}

type CastLaneId = 'open' | 'cover-edge' | 'current-seam' | 'dropoff';

interface CastLane {
  id: CastLaneId;
  label: string;
  waitMul: number;
  coverMul: number;
  currentMul: number;
  luckBonus: number;
}

const OPEN_LANE: CastLane = {
  id: 'open', label: 'air terbuka', waitMul: 1, coverMul: 1, currentMul: 1, luckBonus: 0,
};

function feedingCondition(
  time: number, rain: number, spot: Spot, lane: CastLane, depth: number,
): FeedingCondition {
  const phase = phaseIndex(time);
  if (rain >= 0.55 && spot.current >= 0.35) {
    return {
      id: 'runoff', label: 'runoff · arus bawa makanan',
      waitMul: 0.86, surfaceMul: 0.96, currentMul: 1.24, deepMul: 1.04,
      preferredBait: 'udang',
    };
  }
  if ((phase === 0 || phase === 2) && rain < 0.35 && depth < 0.68) {
    return {
      id: 'hatch', label: 'hatch serangga · permukaan aktif',
      waitMul: 0.84, surfaceMul: 1.22, currentMul: 1.02, deepMul: 0.95,
      preferredBait: 'serangga',
    };
  }
  if (rain >= 0.12) {
    return {
      id: 'drizzle', label: 'gerimis · ikan naik makan',
      waitMul: 0.92, surfaceMul: 1.12, currentMul: 1.06, deepMul: 0.99,
      preferredBait: 'cacing',
    };
  }
  if (phase === 1 && rain < 0.08 && depth >= 0.74 && lane.id === 'dropoff') {
    return {
      id: 'deep-calm', label: 'air tenang · ikan turun dalam',
      waitMul: 1.02, surfaceMul: 0.92, currentMul: 1, deepMul: 1.14,
      preferredBait: 'kilau',
    };
  }
  return NORMAL_FEEDING;
}

function castLaneFor(spot: Spot, depth: number): CastLane {
  if (spot.cover >= 0.62 && depth <= 0.58) {
    return {
      id: 'cover-edge', label: 'tepi cover',
      waitMul: 0.88, coverMul: 1.18, currentMul: 1, luckBonus: 0.015,
    };
  }
  if (spot.current >= 0.46 && depth >= 0.24 && depth <= 0.78) {
    return {
      id: 'current-seam', label: 'jalur arus',
      waitMul: 0.86, coverMul: 1, currentMul: 1.12, luckBonus: 0.025,
    };
  }
  if (depth >= 0.82) {
    return {
      id: 'dropoff', label: 'drop-off dalam',
      waitMul: 0.94, coverMul: 1, currentMul: 1.04, luckBonus: 0.07,
    };
  }
  return OPEN_LANE;
}

/** The fish's actual size is decided when it takes the bait, not after the
 * fight. Size therefore contributes to load and gear choice instead of being
 * cosmetic information revealed only on the result card. */
function rollCatchSize(fish: Species, grade: Grade): number {
  const roll = Math.random() * Math.random();
  const baseK = Math.min(1, (1 - roll) + grade.sizeBias * roll);
  const rod = rodStats();
  const k = Math.min(1, baseK + (1 - baseK) * rod.sizeBias);
  return Math.round(fish.minCm + (fish.maxCm - fish.minCm) * k);
}

export class Fishing {
  state: FishState = 'idle';
  private t = 0;
  private power = 0;
  private powerDir = 1;
  private bobX = 0;
  private bobY = 0;
  private fromX = 0;
  private fromY = 0;
  private flightT = 0;
  private flightDur = 0;
  private biteAt = 0;
  /** The fish investigates the bait before committing. The little pre-bite
   *  tells make waiting readable without turning fishing into a reflex test. */
  private nibbleNext = 0;
  private nibbleDone = 0;
  private nibbleNeed = 2;
  private nibbleGapMin = 0.30;
  private nibbleGapMax = 0.72;
  private nibbleMotion = 2.2;
  private nibbleText = 'ada gerakan...';
  /** Rain/turbidity can mask tiny surface tells, but never the committed bite. */
  private nibbleClarity = 1;
  private weatherCue = '';
  private depth01 = 0;
  private castLane: CastLane = OPEN_LANE;
  private feeding: FeedingCondition = NORMAL_FEEDING;
  private spot: Spot = DEFAULT_SPOT;
  private district: District | null = null;
  private pending: Species | null = null;
  private pendingCm = 0;
  private hookFit = 1;
  private habitatIntent = 0;
  private habitatDir: -1 | 1 = 1;
  private habitatText = '';
  /** World-space fish pull. The logical cast point stays stable while this
   * small offset lets the line/bobber show where the hooked fish is driving. */
  private fishOffsetX = 0;
  private fishOffsetY = 0;
  private fishTravel = 0;
  private castUx = 0;
  private castUy = -1;
  /** Which bait was consumed by this cast. Null means bare hook. */
  private baitedCast: BaitId | null = null;
  /** Set by the frame. Shifts what is biting without touching any species'
   *  own numbers. */
  season!: Season;

  /** Rolled the moment the fish takes, not when it lands — the grade has to
   *  be known during the fight, because it is what makes the fight hard. */
  private pendingGrade: Grade = COMMON;

  /** Reel bar. `tension` is what the player steers; `target` drifts. */
  private tension = 0.5;
  private target = 0.5;
  private progress = 0;
  private slack = 0;
  /** Staying on the fish builds momentum. It rewards a smooth reel without
   *  adding another button or making one missed beat cost the whole catch. */
  private momentum = 0;
  /** Optional one-button pump-and-reel mastery. Holding steady raises the rod;
   * releasing after a controlled lift opens a short recovery window. */
  private pumpCharge = 0;
  private pumpRecovery = 0;
  private pumpBonus = 0;
  private rodAngle = 0.35;
  private lastPullHeld = false;
  private pressureT = 0;
  private counterT = 0;
  private counterCooldown = 0;
  /** Physical load model. Risk meters rise only under sustained overload, so
   * one bad correction is a warning rather than an instant broken item. */
  private gearLoad = 0;
  /** Fish tire under steady pressure and recover a little when given slack.
   * This makes a long, clean fight calm down instead of only escalating. */
  private fishStamina = 1;
  private energyPhase: FishEnergyPhase = 'fresh';
  private reserveBurstT = 0;
  private reserveBurstUsed = false;
  private dragSlip = 0;
  private lineStretch = 0;
  private rain = 0;
  private waterCurrent = 0;
  private turbidity = 0;
  /** Approximate share of usable line currently off the spool. Unlike catch
   * progress it can move backwards during a run, so drag has a real cost. */
  private lineOut = 0;
  private spoolRisk = 0;
  private landingT = 0;
  private landingControl = 0.35;
  private escapeT = 0;
  private escapeUsed = 0;
  private escapeName = '';
  private escapeKind: EscapeKind = 'run';
  private escapeMul = 1;
  private snag = 0;
  private snagged = false;
  private hookHold = 1;
  private mouth: MouthType = 'normal';
  private rodRisk = 0;
  private lineRisk = 0;
  private hookRisk = 0;
  private rodWear = 0;
  private lineWear = 0;
  private hookWear = 0;
  private tackleWarning = '';
  /** Live coaching only; never changes drag automatically. */
  private dragAdvice = '';
  /** High-stick and lateral leverage are readable physical load, not RNG. */
  private highStick = 0;
  private sideLoad = 0;
  private hookText = '';
  private missText = 'lepas...';
  /** How this fish fights, chosen when it takes the hook. */
  private style: FightStyle = STYLES.tenang;
  private fight: FightState = newFight();

  lastCatch: Catch | null = null;
  cardT = 0;
  /** Set for one frame when a catch lands, so main can flash the screen. */
  flash = 0;

  /** Where the bobber currently is, for the network and the line renderer.
   * During a hooked fight this includes the fish's small world displacement,
   * so the existing rod/line renderer visibly follows runs and habitat pulls. */
  get bobber(): { x: number; y: number } | null {
    if (this.state === 'idle' || this.state === 'card' || this.state === 'aim') return null;
    return this.state === 'reel'
      ? { x: this.bobX + this.fishOffsetX, y: this.bobY + this.fishOffsetY }
      : { x: this.bobX, y: this.bobY };
  }

  get busy(): boolean {
    return this.state !== 'idle';
  }

  /** Minimal live values for the world-space rod/line renderer. */
  get lineFeel(): {
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

  /** Abandons whatever is in progress. Used when the player walks through a
   *  door — a rod still cast into a lake you are no longer standing beside
   *  would leave a bobber floating in another map. */
  cancel(p: LocalPlayer): void {
    this.state = 'idle';
    this.t = 0;
    this.pending = null;
    this.pendingCm = 0;
    this.baitedCast = null;
    this.momentum = 0;
    this.lineOut = 0;
    this.resetGearStress();
    this.hookHold = 1;
    this.mouth = 'normal';
    this.hookText = '';
    this.missText = 'lepas...';
    this.nibbleText = 'ada gerakan...';
    p.locked = false;
    p.action = 'idle';
  }

  /** Exposed for the dev harness, which drives the reel to verify the
   *  whole catch flow without a human on the keyboard. */
  get reel(): {
    tension: number; target: number; progress: number; momentum: number;
    pump: number; recovery: number; rodAngle: number; counter: number;
    load: number; stamina: number; phase: FishEnergyPhase; reserve: number;
    dragSlip: number; stretch: number; lineOut: number;
    landing: number; landingControl: number; snag: number;
    rain: number; waterCurrent: number; turbidity: number; castLane: string;
    feeding: string;
    hookFit: number; habitat: number; fishX: number; fishY: number;
    hookHold: number; escape: string; warning: string;
    dragAdvice: string; highStick: number; sideLoad: number;
    nibbleClarity: number; weatherCue: string;
    style: string; zone: number; veil: boolean;
  } {
    return {
      tension: this.tension, target: this.target, progress: this.progress,
      momentum: this.momentum,
      pump: this.pumpCharge,
      recovery: this.pumpRecovery,
      rodAngle: this.rodAngle,
      counter: this.counterT,
      load: this.gearLoad,
      stamina: this.fishStamina,
      phase: this.energyPhase,
      reserve: this.reserveBurstT,
      dragSlip: this.dragSlip,
      stretch: this.lineStretch,
      lineOut: this.lineOut,
      landing: this.landingT,
      landingControl: this.landingControl,
      snag: this.snag,
      rain: this.rain,
      waterCurrent: this.waterCurrent,
      turbidity: this.turbidity,
      castLane: this.castLane.id,
      feeding: this.feeding.id,
      hookFit: this.hookFit,
      habitat: this.habitatIntent,
      fishX: this.fishOffsetX,
      fishY: this.fishOffsetY,
      hookHold: this.hookHold,
      escape: this.escapeT > 0 ? this.escapeName : '',
      warning: this.tackleWarning,
      dragAdvice: this.dragAdvice,
      highStick: this.highStick,
      sideLoad: this.sideLoad,
      nibbleClarity: this.nibbleClarity,
      weatherCue: this.weatherCue,
      style: this.style.id,
      zone: Math.max(0.12, this.style.zone * (1 - this.pendingGrade.tier * 0.075)),
      veil: this.fight.veil > 0,
    };
  }

  update(
    dt: number, input: Input, p: LocalPlayer, map: WorldMap,
    time: number, rain: number, particles: Particles, audio: Audio,
    onCatch: (c: Catch) => void, onCastNet: (x: number, y: number) => void,
  ): void {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.rain = clamp01(rain);
    // Rain matters most where water is already moving. A still swamp does not
    // become a river just because it rains; a river mouth visibly loads up.
    this.waterCurrent = Math.min(
      1.25,
      this.spot.current * (1 + this.rain * (0.18 + this.spot.current * 0.52)),
    );
    this.turbidity = clamp01(
      this.rain * (0.26 + this.spot.current * 0.42 + this.spot.cover * 0.12),
    );

    switch (this.state) {
      case 'idle': {
        if (input.pressed(' ') && facingWater(p, map)) {
          const broken = brokenPart();
          if (broken) {
            this.missText = `${gearName(broken)} rusak — servis di kios`;
            this.state = 'miss';
            this.t = 0;
            audio.blip(170, 0.12, 0.14);
            break;
          }
          this.state = 'aim';
          this.power = 0;
          this.powerDir = 1;
          p.locked = true;
          p.action = 'cast';
          audio.blip(660, 0.05, 0.16);
        }
        break;
      }

      case 'aim': {
        // Power oscillates; release to cast. No penalty for overshooting —
        // it only changes where the bobber lands.
        this.power += this.powerDir * dt * 1.15;
        if (this.power >= 1) { this.power = 1; this.powerDir = -1; }
        if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
        if (!input.held(' ')) this.beginCast(p, map, particles, audio, onCastNet);
        break;
      }

      case 'cast': {
        this.flightT += dt;
        const k = Math.min(1, this.flightT / this.flightDur);
        this.bobX = this.fromX + (this.targetX - this.fromX) * k;
        this.bobY = this.fromY + (this.targetY - this.fromY) * k;
        if (k >= 1) {
          particles.spawnSplash(this.bobX, this.bobY, 8);
          audio.plop();
          this.state = 'wait';
          p.action = 'wait';
          this.t = 0;
          // Better rods are a comfort upgrade, not a different game. Even
          // the top tier still leaves enough quiet to look at the lake.
          this.feeding = feedingCondition(
            time, this.rain, this.spot, this.castLane, this.depth01,
          );
          const rainActivity = 1 - this.rain * 0.16;
          this.biteAt = (2.4 + Math.random() * 7.5)
            * rodStats().waitMul
            * rainActivity
            * this.castLane.waitMul
            * this.feeding.waitMul;
        }
        break;
      }

      case 'wait': {
        this.bobY += Math.sin(this.t * 2.1) * dt * 2.4;
        if (input.pressed(' ')) {
          // Reeling in early is always allowed.
          this.reset(p);
          break;
        }
        if (this.t >= this.biteAt) {
          this.pending = rollSpecies(
            time, this.depth01, this.spot, this.district, this.season,
            this.baitedCast, this.rain, this.feeding,
          );
          // Deep water, a good spot and the small hours all improve the
          // odds, so chasing a rare fish means going somewhere for it
          // rather than casting more times in the same place.
          this.pendingGrade = rollGrade(
            clamp01(
              luckFrom(this.depth01, this.spot.depth, nightness(time))
              + this.castLane.luckBonus,
            ),
          );
          this.pendingCm = rollCatchSize(this.pending, this.pendingGrade);

          // Don't jump straight from silence to TARIK. The fish noses the bait
          // first, with heavier/rarer fish tending to give one extra tell.
          // The player gets anticipation and information, not a smaller window.
          this.style = styleFor(this.pending);
          this.mouth = mouthType(this.pending, this.style);
          this.nibbleDone = 0;

          // The pre-bite now speaks the same language as the fight. A Wader
          // taps fast, a Gurame pulls down, an eel seems to stop touching the
          // bait before it finally commits. Players can start learning the
          // fish before the reel bar even appears.
          let need = 2 + (this.pending.fight >= 1.35 ? 1 : 0)
            + (this.pendingGrade.tier >= 3 ? 1 : 0);
          switch (this.style.id) {
            case 'lincah':
              need -= 1;
              this.nibbleGapMin = 0.18;
              this.nibbleGapMax = 0.34;
              this.nibbleMotion = 3.1;
              this.nibbleText = 'sentakan kecil cepat...';
              break;
            case 'menyelam':
              need += 1;
              this.nibbleGapMin = 0.34;
              this.nibbleGapMax = 0.56;
              this.nibbleMotion = 3.8;
              this.nibbleText = 'pelampung ditarik turun...';
              break;
            case 'menggetar':
              need += 1;
              this.nibbleGapMin = 0.16;
              this.nibbleGapMax = 0.30;
              this.nibbleMotion = 4.2;
              this.nibbleText = 'getaran rapat...';
              break;
            case 'mengendap':
              this.nibbleGapMin = 0.52;
              this.nibbleGapMax = 0.88;
              this.nibbleMotion = 1.4;
              this.nibbleText = 'sekali sentuh, lalu diam...';
              break;
            case 'lari':
              need += 1;
              this.nibbleGapMin = 0.22;
              this.nibbleGapMax = 0.40;
              this.nibbleMotion = 4.6;
              this.nibbleText = 'tarikan berat bergerak...';
              break;
            default:
              this.nibbleGapMin = 0.38;
              this.nibbleGapMax = 0.66;
              this.nibbleMotion = 2.0;
              this.nibbleText = 'gerakan pelan...';
              break;
          }
          // Feeding activity changes the *feel* of the take as well as the
          // odds. Hatch fish inspect faster, runoff bites are heavier, while
          // a deep calm take is slower and subtler.
          const feedTempo = this.feeding.id === 'hatch' ? 0.84
            : this.feeding.id === 'runoff' ? 0.90
              : this.feeding.id === 'drizzle' ? 0.94
                : this.feeding.id === 'deep-calm' ? 1.08 : 1;
          this.nibbleGapMin *= feedTempo;
          this.nibbleGapMax *= feedTempo;
          if (this.feeding.id === 'runoff') this.nibbleMotion += 0.55;
          else if (this.feeding.id === 'hatch') this.nibbleMotion += 0.35;
          else if (this.feeding.id === 'deep-calm') this.nibbleMotion = Math.max(1, this.nibbleMotion - 0.25);

          // Rough water masks only the tiny investigative tells. Text and audio
          // remain explicit, and the final committed bite is made stronger, so
          // bad weather changes atmosphere/readability without shrinking the
          // reaction window or creating an accessibility trap.
          const weatherMask = clamp01(this.rain * 0.52 + this.turbidity * 0.62);
          this.nibbleClarity = Math.max(0.62, 1 - weatherMask * 0.38);
          this.weatherCue = weatherMask >= 0.58
            ? 'hujan nutup riak'
            : this.turbidity >= 0.34 ? 'air mulai keruh'
              : this.rain >= 0.16 ? 'gerimis di pelampung' : '';

          this.nibbleNeed = Math.max(1, Math.min(5, need));
          this.nibbleNext = this.nibbleGapMin
            + Math.random() * (this.nibbleGapMax - this.nibbleGapMin);
          this.state = 'nibble';
          this.t = 0;
        }
        break;
      }

      case 'nibble': {
        // A tiny, nervous movement rather than the hard bite bounce.
        this.bobY += Math.sin(this.t * 10) * dt
          * (this.nibbleMotion + this.pendingGrade.tier * 0.25)
          * this.nibbleClarity;

        // Pulling on a nibble spooks the fish. This is the one new decision:
        // watch the float, don't mash the button. The cost is still only a cast.
        if (input.pressed(' ')) {
          this.missText = 'terlalu cepat...';
          this.state = 'miss';
          this.t = 0;
          audio.blip(210, 0.10, 0.12);
          break;
        }

        if (this.t >= this.nibbleNext) {
          this.nibbleDone++;
          const heavy = Math.min(4, 1 + Math.floor(this.pending!.fight));
          const visibleSplash = Math.max(2, Math.round((2 + heavy) * this.nibbleClarity));
          particles.spawnSplash(this.bobX, this.bobY + 3, visibleSplash);
          // As visual noise rises, the tiny audio tick becomes slightly easier
          // to hear. Players never have to rely on vision alone in heavy rain.
          const cueVolume = 0.08 + (1 - this.nibbleClarity) * 0.07;
          audio.blip(300 + this.nibbleDone * 34, 0.035, cueVolume);

          if (this.nibbleDone >= this.nibbleNeed) {
            if (this.pendingGrade.tier >= 5) {
              // Mitos gets a beat of impossible calm before the take. The
              // odds are still rare, but when it happens the lake announces
              // it before the result card does.
              this.state = 'omen';
              this.t = 0;
              this.flash = Math.max(this.flash, 0.18);
              audio.blip(145, 0.16, 0.14);
            } else {
              this.state = 'bite';
              this.t = 0;
              const commitSplash = 5 + heavy + Math.round((1 - this.nibbleClarity) * 4);
              particles.spawnSplash(this.bobX, this.bobY + 2, commitSplash);
              audio.bite();
            }
          } else {
            this.nibbleNext += this.nibbleGapMin
              + Math.random() * (this.nibbleGapMax - this.nibbleGapMin);
          }
        }
        break;
      }

      case 'omen': {
        // Stillness first, then one slow pulse. It is deliberately not an
        // extra reflex check: the player is being warned, not tested twice.
        this.bobY += Math.sin(this.t * 3.2) * dt * 0.7;
        if (this.t > 0.55 && this.t < 0.62) {
          particles.spawnSplash(this.bobX, this.bobY + 3, 3);
          audio.blip(190, 0.12, 0.12);
        }
        if (this.t >= 1.25) {
          this.state = 'bite';
          this.t = 0;
          particles.spawnSplash(this.bobX, this.bobY + 2, 11);
          particles.spawnSpark(this.bobX, this.bobY - 3, 8);
          audio.bite();
        }
        break;
      }

      case 'bite': {
        const commitClarity = 1 + (1 - this.nibbleClarity) * 0.38;
        this.bobY += Math.sin(this.t * 22) * dt * 9 * commitClarity;
        // The reaction window stays generous, but a cleaner hook gives you a
        // little head start in the fight. Skill changes feel, not eligibility.
        if (input.pressed(' ')) {
          const hook = hookStats();
          const clean = this.t <= hook.cleanWindow;
          const steady = this.t <= Math.min(hook.biteWindow - 0.45, hook.cleanWindow + 0.78);
          const action = rodActionStats();
          const size = hookSizeStats();
          this.hookFit = hookSizeFit(this.pendingCm);
          const fitHint = this.hookFit < 0.84
            ? (size.id === 'kecil' ? 'kail kekecilan'
              : size.id === 'besar' ? 'kail kebesaran'
                : 'ukuran kail kurang pas')
            : '';
          this.hookText = fitHint
            ? `${clean ? 'hook mantap!' : steady ? 'kena.' : 'nyaris telat...'} · ${fitHint}`
            : (clean ? 'hook mantap!' : steady ? 'kena.' : 'nyaris telat...');
          const timing = this.mouth === 'keras'
            ? (clean ? 1 : steady ? 0.86 : 0.68)
            : this.mouth === 'lunak'
              ? (clean ? 0.96 : 0.90)
              : (clean ? 1 : steady ? 0.94 : 0.82);
          const mouthFit = this.mouth === 'lunak'
            ? (action.id === 'light' ? 1.06 : action.id === 'heavy' ? 0.90 : 1)
              * (size.id === 'kecil' ? 1.06 : size.id === 'besar' ? 0.90 : 1)
            : this.mouth === 'keras'
              ? action.hookSet * size.hookSet
              : 1;
          this.hookHold = clamp01(timing * mouthFit * this.hookFit);
          this.state = 'reel';
          this.t = 0;
          this.tension = 0.5;
          this.target = 0.5;
          this.progress = clean ? 0.36 : steady ? 0.31 : 0.25;
          this.slack = 0;
          this.momentum = clean ? 0.16 : 0;
          this.resetGearStress();
          this.fight = newFight();
          p.action = 'reel';
          audio.blip(clean ? 610 : 520, 0.06, clean ? 0.24 : 0.2);
        } else if (this.t > hookStats().biteWindow) {
          this.missText = 'terlambat...';
          this.state = 'miss';
          this.t = 0;
        }
        break;
      }

      case 'reel': {
        const fish = this.pending!;

        this.reserveBurstT = Math.max(0, this.reserveBurstT - dt);
        this.counterT = Math.max(0, this.counterT - dt);
        this.counterCooldown = Math.max(0, this.counterCooldown - dt);
        this.escapeT = Math.max(0, this.escapeT - dt);
        if (this.escapeT <= 0) {
          const beat = escapeBeat(this.style.id, this.escapeUsed);
          if (beat && this.progress >= beat.at && this.fishStamina > 0.34) {
            this.escapeT = beat.duration;
            this.escapeName = beat.label;
            this.escapeKind = beat.kind;
            this.escapeMul = beat.mul;
            this.escapeUsed++;
            this.momentum = Math.max(0, this.momentum - 0.18);
            const splash = beat.kind === 'jump' ? 10
              : beat.kind === 'headshake' || beat.kind === 'roll' ? 8
              : beat.kind === 'dive' ? 5 : 6;
            particles.spawnSplash(this.bobX, this.bobY + 3, splash);
            if (beat.kind === 'jump' && this.pendingGrade.tier >= 2) {
              particles.spawnSpark(this.bobX, this.bobY - 5, 4 + this.pendingGrade.tier);
            }
            audio.blip(250 + this.escapeUsed * 40, 0.07, 0.12);
          }
        }

        const size01 = clamp01(
          (this.pendingCm - fish.minCm) / Math.max(1, fish.maxCm - fish.minCm),
        );
        this.energyPhase = this.fishStamina > 0.78 ? 'fresh'
          : this.fishStamina > 0.52 ? 'working'
            : this.fishStamina > 0.34 ? 'tired'
              : 'spent';

        // Energy falls in readable phases rather than one invisible linear
        // multiplier. Fresh fish feel explosive; tired/spent fish still pull,
        // but the angler can finally feel that steady pressure has paid off.
        const phasePower = this.energyPhase === 'fresh' ? 1.07
          : this.energyPhase === 'working' ? 1
            : this.energyPhase === 'tired' ? 0.91
              : 0.83;

        // Only genuinely large/strong fish keep a reserve. Once they are near
        // beaten and already fairly close to landing they spend it in one last
        // deterministic surge. Small fish never get this extra beat.
        const reserveEligible = (size01 >= 0.72 || this.pendingCm >= 65)
          && fish.fight >= 1.30;
        if (
          reserveEligible
          && !this.reserveBurstUsed
          && this.fishStamina <= 0.44
          && this.progress >= 0.62
          && this.escapeT <= 0
          && this.counterT <= 0
        ) {
          this.reserveBurstUsed = true;
          this.reserveBurstT = 1.35 + size01 * 0.45;
          this.momentum = Math.max(0, this.momentum - 0.24);
          this.lineOut += 0.025 + size01 * 0.025;
          particles.spawnSplash(this.bobX, this.bobY + 3, 7 + Math.round(size01 * 5));
          audio.blip(205, 0.10, 0.14);
        }

        const baseFight = fish.fight * this.pendingGrade.fightMul;
        const fight = baseFight
          * phasePower
          * (this.escapeT > 0 ? this.escapeMul : 1)
          * (this.counterT > 0 ? 1.12 : 1)
          * (this.reserveBurstT > 0 ? 1.16 + size01 * 0.08 : 1);

        // The species decides the pattern, the grade decides the teeth.
        // Everything that used to live here — one smooth wander plus a surge
        // for rare fish — is now one style out of six.
        const f = this.fight;
        f.t += dt;
        f.gainMul = 1;
        this.style.step(f, dt, fight);
        const tune = applyGrade(this.style, f, dt, this.pendingGrade.tier);

        // Microhabitat now has an actual direction in the fight. Fish hooked
        // beside cover try to get back into it; current-seam fish use the flow;
        // deep-water fish try to regain the drop-off. The pull is gentle until
        // a run/counter, so it reads as intent rather than a second random bar.
        const habitatActive = this.escapeT > 0 || this.counterT > 0;
        const habitatTarget = this.habitatDir > 0 ? 0.91 : 0.09;
        let habitatRate = 0;
        this.habitatText = '';
        if (this.castLane.id === 'cover-edge') {
          const suited = this.style.id === 'mengendap'
            || this.style.id === 'lari'
            || this.style.id === 'lincah';
          habitatRate = suited ? (habitatActive ? 2.4 : 0.38) : (habitatActive ? 1.2 : 0.16);
          this.habitatText = 'ikan cari cover';
        } else if (this.castLane.id === 'current-seam') {
          const suited = this.style.id === 'lari'
            || this.style.id === 'menyelam'
            || fish.fight >= 1.25;
          habitatRate = suited ? (habitatActive ? 1.9 : 0.30) : (habitatActive ? 0.9 : 0.12);
          this.habitatText = 'ikan pakai arus';
        } else if (this.castLane.id === 'dropoff') {
          const suited = this.style.id === 'menyelam' || fish.maxCm >= 55;
          habitatRate = suited ? (habitatActive ? 1.6 : 0.22) : (habitatActive ? 0.7 : 0.08);
          this.habitatText = 'ikan turun ke dalam';
        }
        const habitatGoal = habitatRate > 0 ? 1 : 0;
        this.habitatIntent += (habitatGoal - this.habitatIntent)
          * Math.min(1, dt * (habitatActive ? 3.2 : 1.2));
        if (habitatRate > 0) {
          f.target += (habitatTarget - f.target) * Math.min(1, dt * habitatRate);
        }
        this.target = clamp01(f.target);

        const action = rodActionStats();
        const pulling = input.held(' ');
        const pull = pulling ? 1 : -1;
        this.tension = clamp01(this.tension + pull * dt * 0.7 * action.control);

        // Rod angle follows pressure gradually rather than snapping with the
        // key. A light action responds quickly; a heavy action carries more
        // authority but takes longer to lower for the reel-down phase.
        const angleTarget = pulling ? 1 : 0.12;
        const angleSpeed = pulling
          ? (action.id === 'light' ? 3.6 : action.id === 'heavy' ? 2.4 : 3.0)
          : (action.id === 'light' ? 4.1 : action.id === 'heavy' ? 2.7 : 3.4);
        this.rodAngle += (angleTarget - this.rodAngle) * Math.min(1, dt * angleSpeed);

        // Fish react to sustained hard pressure. This is deterministic and
        // player-caused: keeping the rod pinned high for too long invites a
        // short counter-surge. A normal pump/recovery cadence never triggers it.
        const hardPressure = pulling
          && this.tension > 0.82
          && this.escapeT <= 0
          && !this.snagged;
        this.pressureT = hardPressure
          ? this.pressureT + dt
          : Math.max(0, this.pressureT - dt * 0.85);
        if (
          this.pressureT >= 1.25
          && this.counterCooldown <= 0
          && this.fishStamina > 0.45
        ) {
          this.counterT = 0.90;
          this.counterCooldown = 3.8;
          this.pressureT = 0;
          this.momentum = Math.max(0, this.momentum - 0.20);
          particles.spawnSplash(this.bobX, this.bobY + 3, 5);
          audio.blip(235, 0.07, 0.11);
        }

        // --- realistic tackle load ---------------------------------------
        // Species/grade give the fish's power; actual rolled size, depth and
        // current turn it into line load. Rod flex absorbs part of sudden
        // shock before it reaches the line and hook.
        const styleShock = this.style.id === 'lari' ? 1.12
          : this.style.id === 'menggetar' ? 1.08
          : this.style.id === 'menyelam' ? 1.06
          : this.style.id === 'mengendap' && f.beat === 1 ? 1.10
          : 1;
        const environment = 1
          + this.depth01 * 0.10
          + this.waterCurrent * this.castLane.currentMul * 0.18;
        const liftPressure = 1 + this.rodAngle * (
          0.025 + this.pumpCharge
            * (action.id === 'heavy' ? 0.065 : action.id === 'light' ? 0.040 : 0.052)
        );
        const rawLoad = fight
          * (0.68 + size01 * 0.42)
          * environment
          * styleShock
          * (0.64 + this.tension * 0.48)
          * liftPressure;

        const rod = rodStats();
        const line = lineStats();
        const hook = hookStats();
        const hookSize = hookSizeStats();
        const rodCap = rod.strength * action.loadMul * conditionFactor('rod');
        const lineCap = line.strength * conditionFactor('line');
        const hookCap = hook.strength * hookSize.strengthMul * conditionFactor('hook');

        // Cover is dangerous when the fish gets away from your marker; rock
        // hurts only while the line is loaded. A good abrasion-resistant line
        // meaningfully changes Tanjung Batu without being mandatory elsewhere.
        const offForGear = Math.abs(this.tension - this.target);
        const coverPressure = Math.min(
          1.2,
          this.spot.cover
            * this.castLane.coverMul
            * (1 + this.rain * 0.08)
            * clamp01(offForGear * 2.2),
        );
        const abrasionPressure = this.spot.abrasion
          * (1 - line.abrasionResist)
          * clamp01(this.tension * 1.15);
        const rodFlex = rod.shockAbsorb + action.flex;
        const transmitted = rawLoad * (1 - Math.min(0.60, rodFlex) * 0.24);
        const rawLineLoad = transmitted * (1 + coverPressure * 0.22 + abrasionPressure * 0.28);

        // Stretch stores part of a shock and releases it gradually. Nilon is
        // weak but forgiving; braid is strong and very direct. That makes line
        // choice situational instead of a straight price ladder.
        const stretchTarget = clamp01(
          (rawLineLoad / Math.max(0.1, lineCap) - 0.38) * 1.45,
        ) * line.elasticity;
        this.lineStretch += (stretchTarget - this.lineStretch) * Math.min(1, dt * 3.4);
        const elasticCushion = this.lineStretch * 0.30;

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

        const rodRatio = slippedRodLoad / Math.max(0.1, rodCap);
        const lineRatio = slippedLineLoad / Math.max(0.1, lineCap);
        const hookRatio = slippedHookLoad / Math.max(0.1, hookCap);
        this.gearLoad = Math.max(rodRatio, lineRatio, hookRatio);

        // Different surface behaviours demand different *pressure*, still with
        // the same hold/release control. A jump/headshake under hard tension
        // works the hook loose; a dive under zero pressure creates slack.
        if (this.escapeT > 0) {
          if (
            (this.escapeKind === 'jump' || this.escapeKind === 'headshake' || this.escapeKind === 'roll')
            && this.tension > 0.78
          ) {
            const k = this.escapeKind === 'jump' ? 0.10 : this.escapeKind === 'roll' ? 0.085 : 0.075;
            this.hookHold = Math.max(0, this.hookHold - dt * k * (1 + hookRatio * 0.35));
          }
          if (this.escapeKind === 'dive' && this.tension < 0.16) {
            this.slack += dt * 0.42;
            this.progress -= dt * 0.018;
          }
        }

        const rise = (ratio: number, seconds: number): number =>
          ratio > 1 ? dt * (0.45 + (ratio - 1) * 1.8) : -dt / seconds;
        this.rodRisk = Math.max(0, this.rodRisk + rise(rodRatio, 1.6));
        this.lineRisk = Math.max(0, this.lineRisk + rise(lineRatio, 1.2));
        this.hookRisk = Math.max(0, this.hookRisk + rise(hookRatio, 1.4));

        // Cover is now something the fish can actually reach rather than only
        // a hidden load multiplier. Falling behind near weeds/roots builds a
        // snag; tracking the fish with moderate pressure clears it.
        const habitatSnag = this.castLane.id === 'cover-edge'
          ? 1 + this.habitatIntent * 0.32
          : 1;
        const snagBuild = this.spot.cover
          * habitatSnag
          * clamp01(offForGear * 2.4)
          * (0.5 + this.fishStamina * 0.5);
        const safePressure = this.tension > 0.22 && this.tension < 0.82 && offForGear < tune.zone * 1.35;
        this.snag = Math.max(
          0,
          this.snag + dt * (snagBuild * 0.72 - (safePressure ? 0.58 : 0.08)),
        );
        this.snagged = this.snag >= 0.82;
        if (this.snagged && this.tension > 0.86) {
          this.lineRisk += dt * (0.22 + this.spot.abrasion * 0.35);
          this.lineWear += dt * 0.18;
        }

        // Soft mouths tear under hard sustained pressure; hard mouths punish
        // weak hook-sets instead. Neither is an instant random failure.
        if (this.mouth === 'lunak' && this.tension > 0.88) {
          const softProtection = 1 - Math.min(0.55, line.elasticity * 0.60 + action.flex * 0.35);
          this.hookHold = Math.max(
            0,
            this.hookHold - dt * (0.12 + hookRatio * 0.08) * softProtection,
          );
        } else if (this.mouth === 'keras' && this.hookHold < 0.9 && this.dragSlip > 0.35) {
          this.hookHold = Math.max(0, this.hookHold - dt * 0.035);
        } else {
          this.hookHold = Math.min(1, this.hookHold + dt * 0.006);
        }

        // Normal use creates tiny wear; meaningful damage comes from fishing
        // the wrong setup hard for a sustained period.
        this.rodWear += dt * Math.max(0, rodRatio - 0.72) * 0.10;
        this.lineWear += dt * (
          Math.max(0, lineRatio - 0.68) * 0.13 + abrasionPressure * 0.035
        );
        this.hookWear += dt * Math.max(0, hookRatio - 0.78) * 0.08;

        // Still forgiving: the reel is something you do while looking at the
        // lake, not a rhythm test. Losing a fish should take sustained
        // inattention, not a moment of it — the styles differ in what they
        // ask you to pay attention *to*, not in how sharp your hands are.
        const off = Math.abs(this.tension - this.target);
        // A line at either stop is not holding anything: slack at the bottom,
        // about to part at the top. Without this, letting go entirely beats a
        // fish that dives — the bar pins at zero and so does the fish, and
        // doing nothing at all counts as following it down.
        const pinned = this.tension <= 0.03 || this.tension >= 0.97;
        const inZone = off < tune.zone && !pinned;

        // --- pump-and-reel ------------------------------------------------
        // A controlled lift stores pressure. Releasing the key after enough
        // charge does not ask for a timed second button; it simply creates a
        // forgiving window where lowering the rod recovers line efficiently.
        // Continuous holding remains valid, just less efficient.
        const pumpSafe = inZone
          && this.tension >= 0.30
          && this.tension <= 0.84
          && this.escapeT <= 0
          && !this.snagged;
        if (pulling && pumpSafe) {
          const chargeRate = action.id === 'light' ? 0.80 : action.id === 'heavy' ? 0.58 : 0.68;
          this.pumpCharge = Math.min(1, this.pumpCharge + dt * chargeRate);
        } else if (pulling) {
          this.pumpCharge = Math.max(0, this.pumpCharge - dt * 0.22);
        }

        if (!pulling && this.lastPullHeld && this.pumpCharge >= 0.28) {
          this.pumpBonus = this.pumpCharge;
          this.pumpRecovery = 0.42 + this.pumpCharge * 0.58;
          this.pumpCharge = 0;
        }
        if (this.pumpRecovery > 0) {
          this.pumpRecovery = Math.max(0, this.pumpRecovery - dt);
          if (pulling || this.tension <= 0.10 || !inZone) {
            this.pumpRecovery = Math.max(0, this.pumpRecovery - dt * 1.6);
          }
        } else {
          this.pumpBonus = Math.max(0, this.pumpBonus - dt * 1.8);
        }
        this.lastPullHeld = pulling;

        // Smooth tracking now has a payoff beyond simply "not losing".
        // Momentum rises slowly enough that one correction does not erase it,
        // then adds at most 35% reel speed once the player settles in.
        this.momentum = inZone
          ? Math.min(1, this.momentum + dt * 0.24)
          : Math.max(0, this.momentum - dt * 0.52);

        // Steady pressure tires the fish. Giving it a lot of slack lets it
        // recover a little, but never all the way back to fresh in one fight.
        const pumpFatigue = pulling && pumpSafe
          ? this.pumpCharge * (action.id === 'heavy' ? 0.010 : 0.007)
          : 0;
        this.fishStamina = inZone
          ? Math.max(
              0.28,
              this.fishStamina - dt * (0.022 + this.momentum * 0.018 + pumpFatigue),
            )
          : Math.min(1, this.fishStamina + dt * 0.008);

        const fatigueBonus = this.energyPhase === 'spent' ? 1.25
          : this.energyPhase === 'tired' ? 1.18
            : this.energyPhase === 'working' ? 1.08
              : 1;
        const recoveryActive = this.pumpRecovery > 0
          && !pulling
          && inZone
          && this.tension > 0.10;
        const recoveryMul = recoveryActive ? 1 + this.pumpBonus * 0.28 : 1;
        const reelGain = tune.gain
          * (1 + this.momentum * 0.35)
          * fatigueBonus
          * recoveryMul;
        const dragLoss = this.dragSlip * 0.48;
        const stretchLoss = this.lineStretch * 0.12;
        const snagMul = this.snagged ? 0.18 : 1;
        this.progress += (
          inZone
            ? reelGain * snagMul * (1 - stretchLoss) - dragLoss * tune.gain
            : -tune.drain
        ) * dt;

        // Distance on the spool is independent from abstract fight progress.
        // Drag slip and a hard run send the fish away; smooth reeling actually
        // recovers line. This is what turns "loose drag" into a trade-off.
        const runTake = this.escapeT > 0 && this.escapeKind === 'run'
          ? 0.038 * (0.7 + this.fishStamina * 0.3)
          : 0;
        const reserveTake = this.reserveBurstT > 0
          ? 0.026 * (0.75 + size01 * 0.45)
          : 0;
        const habitatTake = this.castLane.id === 'current-seam'
          && this.habitatIntent > 0.35
          && habitatActive
          ? 0.012 * this.waterCurrent * this.habitatIntent
          : 0;
        this.lineOut += dt * (
          this.dragSlip * 0.085 + runTake + reserveTake + habitatTake
        );
        if (inZone && !this.snagged) {
          const pumpRetrieve = recoveryActive ? 0.20 * this.pumpBonus : 0;
          this.lineOut -= dt * reelGain * (0.56 + this.momentum * 0.24 + pumpRetrieve);
        }
        const spoolLimit = line.capacity;
        this.lineOut = Math.max(0, Math.min(spoolLimit * 1.35, this.lineOut));

        // Translate fight intent into a restrained world-space pull. This is
        // visual feedback, not a second collision system: logical spot/depth
        // stay at the cast point, while the bobber and existing fishing line
        // visibly follow the hooked fish.
        this.fishTravel += dt * (2.4 + fight * 0.9);
        const sideX = -this.castUy;
        const sideY = this.castUx;
        const spoolOut = clamp01(
          (this.lineOut / Math.max(0.1, spoolLimit) - 0.42) / 0.58,
        );
        let wantX = this.castUx * spoolOut * 6;
        let wantY = this.castUy * spoolOut * 6;

        if (this.castLane.id === 'cover-edge') {
          wantX += sideX * this.habitatDir * this.habitatIntent * 7;
          wantY += sideY * this.habitatDir * this.habitatIntent * 7;
        } else if (this.castLane.id === 'current-seam') {
          wantX += this.castUx * this.habitatIntent * 5;
          wantY += this.castUy * this.habitatIntent * 5;
        } else if (this.castLane.id === 'dropoff') {
          wantX += this.castUx * this.habitatIntent * 4;
          wantY += this.castUy * this.habitatIntent * 4;
        }

        if (this.escapeT > 0) {
          if (this.escapeKind === 'run') {
            wantX += this.castUx * 8 + sideX * this.habitatDir * 3;
            wantY += this.castUy * 8 + sideY * this.habitatDir * 3;
          } else if (this.escapeKind === 'jump') {
            const snap = Math.sin(this.fishTravel * 5.8) * 5;
            wantX += sideX * snap;
            wantY += sideY * snap;
          } else if (this.escapeKind === 'headshake') {
            const shake = Math.sin(this.fishTravel * 9.5) * 6;
            wantX += sideX * shake;
            wantY += sideY * shake;
          } else if (this.escapeKind === 'roll') {
            const rollX = Math.cos(this.fishTravel * 5.2) * 5;
            const rollY = Math.sin(this.fishTravel * 5.2) * 3;
            wantX += sideX * rollX + this.castUx * rollY;
            wantY += sideY * rollX + this.castUy * rollY;
          } else if (this.escapeKind === 'dive') {
            wantX += this.castUx * 3;
            wantY += this.castUy * 3;
          }
        }
        if (this.counterT > 0) {
          const kick = Math.sin(this.fishTravel * 7.2) * 4;
          wantX += sideX * kick;
          wantY += sideY * kick;
        }
        if (this.reserveBurstT > 0) {
          const reserveKick = 6 + size01 * 5;
          wantX += this.castUx * reserveKick
            + sideX * this.habitatDir * Math.sin(this.fishTravel * 6.4) * 3;
          wantY += this.castUy * reserveKick
            + sideY * this.habitatDir * Math.sin(this.fishTravel * 6.4) * 3;
        }

        const visualRate = this.escapeT > 0 || this.counterT > 0 || this.reserveBurstT > 0
          ? 8 : 4.5;
        this.fishOffsetX += (wantX - this.fishOffsetX) * Math.min(1, dt * visualRate);
        this.fishOffsetY += (wantY - this.fishOffsetY) * Math.min(1, dt * visualRate);

        const nearSpool = this.lineOut / Math.max(0.1, spoolLimit);
        this.spoolRisk = nearSpool >= 0.96
          ? this.spoolRisk + dt * (0.42 + (nearSpool - 0.96) * 5)
          : Math.max(0, this.spoolRisk - dt * 0.7);

        // Final metres are intentionally calmer, not a second minigame.
        // An active jump/roll/dive must finish first; otherwise the old logic
        // could quietly finish the landing while the fish was visibly surging.
        const nearBank = this.progress >= 0.90 && this.lineOut <= 0.18;
        const landingPressure = this.tension >= 0.24 && this.tension <= 0.80;
        const landingSafe = this.escapeT <= 0
          && !this.snagged
          && this.dragSlip < 0.22
          && this.hookHold > 0.18;
        this.landingT = nearBank && inZone && landingPressure && landingSafe
          ? Math.min(1, this.landingT + dt * 0.75)
          : Math.max(0, this.landingT - dt * (this.escapeT > 0 ? 0.90 : 0.45));

        // Landing quality is earned in the final metres. It does not decide
        // whether the catch is allowed; it only rewards controlled pressure.
        if (nearBank) {
          const cleanLanding = inZone
            && landingPressure
            && landingSafe
            && this.tension <= 0.78
            && this.dragSlip < 0.18;
          this.landingControl = cleanLanding
            ? Math.min(1, this.landingControl + dt * 0.62)
            : Math.max(
                0,
                this.landingControl - dt * (
                  this.tension > 0.86 || this.dragSlip > 0.32 ? 0.88 : 0.42
                ),
              );
        }
        if (nearBank && this.tension > 0.86) {
          this.hookHold = Math.max(
            0,
            this.hookHold - dt * (this.mouth === 'lunak' ? 0.055 : 0.022),
          );
        }
        this.slack = inZone ? Math.max(0, this.slack - dt * 0.6) : this.slack + dt * 0.5;

        // Warnings are resolved after all per-frame physics so they describe
        // what is dangerous *now*. Critical hook/spool/snag states beat the
        // softer shore prompt; landing advice must never hide a real failure.
        this.tackleWarning = '';
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
          this.tackleWarning = this.mouth === 'lunak'
            ? 'kail hampir sobek — kurangi tekanan'
            : 'kail kurang nancep — jaga tekanan halus';
        } else if (this.spoolRisk > 0.25) {
          this.tackleWarning = spoolPct >= 1
            ? 'senar di reel hampir habis — tahan larinya'
            : 'ikan makin jauh — mulai ambil line';
        } else if (this.snagged) {
          this.tackleWarning = this.tension > 0.86
            ? 'nyangkut — jangan ditarik paksa'
            : 'nyangkut — tekan sedang, arahkan keluar';
        } else if (this.escapeT > 0) {
          this.tackleWarning = this.dragAdvice
            ? `${this.escapeName} · ${this.dragAdvice}`
            : this.escapeName;
        } else if (this.counterT > 0) {
          this.tackleWarning = this.dragAdvice
            ? `ikan melawan tekanan · ${this.dragAdvice}`
            : 'ikan melawan tekanan — turunkan joran';
        } else if (this.reserveBurstT > 0) {
          this.tackleWarning = this.dragAdvice
            ? `tenaga terakhir · ${this.dragAdvice}`
            : 'tenaga terakhir — biarkan drag kerja';
        } else if (habitatActive && this.habitatIntent > 0.48 && this.habitatText) {
          this.tackleWarning = this.castLane.id === 'cover-edge'
            ? 'ikan lari ke cover — arahkan keluar'
            : this.castLane.id === 'current-seam'
              ? 'ikan ikut arus — ambil sudut pelan'
              : 'ikan turun ke drop-off — jaga tekanan';
        } else if (this.highStick > 0.52 && rodRatio > 0.82) {
          this.tackleWarning = 'high-stick — turunkan joran, jangan tegakkan penuh';
        } else if (this.dragAdvice) {
          this.tackleWarning = this.dragAdvice;
        } else if (this.landingT > 0.05 || (nearBank && landingSafe)) {
          this.tackleWarning = this.tension > 0.82
            ? 'dekat tepi — jangan angkat paksa'
            : 'dekat tepi — tahan stabil, serok pelan';
        } else if (recoveryActive && this.pumpBonus >= 0.42) {
          this.tackleWarning = 'joran turun — gulung senar';
        } else if (this.pumpCharge >= 0.72 && pulling) {
          this.tackleWarning = 'angkat stabil — siap turunkan joran';
        } else if (this.dragSlip > 0.28) {
          this.tackleWarning = `${drag.label.toLowerCase()} bunyi — ikan ambil senar`;
        } else if (this.lineRisk > 0.28) {
          this.tackleWarning = abrasionPressure > 0.10
            ? 'senar gesek struktur — kendurkan'
            : 'senar terlalu tegang — kendurkan';
        } else if (this.rodRisk > 0.38) {
          this.tackleWarning = 'joran terlalu terbebani — kendurkan';
        } else if (this.hookRisk > 0.34) {
          this.tackleWarning = 'kail mulai membuka — kendurkan';
        } else if (coverPressure > 0.48) {
          this.tackleWarning = 'ikan masuk cover — jaga tekanan';
        }

        this.bobX += (Math.random() - 0.5) * 12 * dt;
        this.bobY += (Math.random() - 0.5) * 8 * dt;

        if (this.spoolRisk > 1.25) {
          damageTackle('line', 18);
          this.commitWear('line');
          this.missText = 'senar habis dari reel — ikan terlalu jauh';
          this.state = 'miss';
          this.t = 0;
          audio.blip(130, 0.20, 0.16);
        } else if (this.hookHold <= 0.02) {
          this.commitWear();
          this.missText = this.mouth === 'lunak'
            ? 'kail sobek dari mulut ikan'
            : 'kail lepas — hook kurang dalam';
          this.state = 'miss';
          this.t = 0;
          audio.blip(165, 0.16, 0.14);
        } else if (this.rodRisk > 2.25) {
          damageTackle('rod', 100);
          this.commitWear('rod');
          this.missText = 'joran patah — beban terlalu besar';
          this.state = 'miss';
          this.t = 0;
          audio.blip(120, 0.20, 0.18);
        } else if (this.lineRisk > 1.45) {
          // A snapped line costs condition but not the entire spool. The next
          // cast is possible after an implied re-tie, unless wear had already
          // brought it to zero.
          damageTackle('line', 24 + Math.min(18, this.spot.abrasion * 18));
          this.commitWear('line');
          this.missText = 'senar putus — tekanan/gesekan terlalu tinggi';
          this.state = 'miss';
          this.t = 0;
          audio.blip(145, 0.18, 0.16);
        } else if (this.hookRisk > 1.75) {
          damageTackle('hook', 100);
          this.commitWear('hook');
          this.missText = 'kail melurus — terlalu ringan untuk ikan ini';
          this.state = 'miss';
          this.t = 0;
          audio.blip(155, 0.18, 0.16);
        } else if (this.progress >= 1 && this.lineOut <= 0.10 && this.landingT >= 0.55) {
          this.commitWear();
          this.land(fish, particles, audio, onCatch, p);
        } else if (this.progress >= 1) {
          // The fish is beaten, but still has line out. Keep it at the bank
          // rather than teleporting it into the catch card.
          this.progress = 0.995;
        } else if (
          this.progress <= -0.15 - lineStats().failGrace
          || this.slack > 4.0 + lineStats().slackGrace
        ) {
          this.commitWear();
          this.missText = this.tension >= 0.97 ? 'senar terlalu tegang...' : 'senar kendur...';
          this.state = 'miss';
          this.t = 0;
          audio.blip(180, 0.18, 0.16);
        }
        break;
      }

      case 'miss': {
        if (this.t > 1.1) this.reset(p);
        break;
      }

      case 'card': {
        this.cardT += dt;
        if (input.pressed(' ', 'e', 'enter') || this.cardT > 5) this.reset(p);
        break;
      }
    }
  }

  private targetX = 0;
  private targetY = 0;

  private beginCast(
    p: LocalPlayer, map: WorldMap, particles: Particles, audio: Audio,
    onCastNet: (x: number, y: number) => void,
  ): void {
    const hand = handPos(p);
    const dist = MIN_CAST + this.power * (MAX_CAST - MIN_CAST);
    const dir = p.facing;
    let dx = 0;
    let dy = -1;
    if (dir === 'left') { dx = -1; dy = -0.35; }
    else if (dir === 'right') { dx = 1; dy = -0.35; }
    else if (dir === 'down') { dx = 0; dy = 1; }
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;

    let tx = hand.x + dx * dist;
    let ty = hand.y + dy * dist;

    // Walk the cast back until it is over water, so the bobber never lands
    // on the grass and leaves the player stuck.
    for (let i = 0; i < 24; i++) {
      if (isWater(tileAt(map, Math.floor(tx / TILE), Math.floor(ty / TILE)))) break;
      tx -= dx * 4;
      ty -= dy * 4;
    }

    this.fromX = hand.x;
    this.fromY = hand.y;
    this.targetX = tx;
    this.targetY = ty;
    const castDx = tx - hand.x;
    const castDy = ty - hand.y;
    const castLen = Math.max(1, Math.hypot(castDx, castDy));
    this.castUx = castDx / castLen;
    this.castUy = castDy / castLen;
    this.bobX = hand.x;
    this.bobY = hand.y;
    this.flightT = 0;
    this.flightDur = 0.22 + dist / 400;
    this.baitedCast = consumeBaitCast();
    this.state = 'cast';
    p.action = 'cast';

    // Where the bobber landed decides the spot, and the spot sets the
    // baseline depth. Casting further out from the shore adds to it.
    this.spot = spotAt(map.spots, tx, ty);
    this.district = districtAt(tx, ty).district;
    const shoreCol = map.shore[clampInt(Math.floor(tx / TILE), 0, map.shore.length - 1)];
    const fromShore = shoreCol * TILE - ty;
    this.depth01 = clamp01(this.spot.depth + clamp01(fromShore / 200) * 0.45);
    this.castLane = castLaneFor(this.spot, this.depth01);
    this.habitatDir = this.spot.id === 'kolam'
      ? (tx >= hand.x ? 1 : -1)
      : (tx >= this.spot.x ? 1 : -1);
    // Long casts start with more line in the water. Capacity is deliberately
    // not filled by a normal cast; only a hooked fish can threaten the spool.
    const line = lineStats();
    this.lineOut = Math.min(
      line.capacity * 0.78,
      0.34 + this.power * 0.28 + this.depth01 * 0.10,
    );

    audio.cast();
    particles.spawnSpark(hand.x, hand.y, 3);
    onCastNet(tx, ty);
  }

  /** Test seam: land a specific species at a specific grade.
   *
   *  A Mitos is roughly one cast in two thousand, which is the correct
   *  rarity and a hopeless way to check that its card renders. */
  debugCatch(
    speciesId: string, gradeId: string, particles: Particles, audio: Audio,
    onCatch: (c: Catch) => void, p: LocalPlayer,
  ): string {
    const fish = SPECIES.find((f) => f.id === speciesId);
    if (!fish) return `tidak ada spesies ${speciesId}`;
    this.pendingGrade = gradeById(gradeId as GradeId);
    this.pendingCm = rollCatchSize(fish, this.pendingGrade);
    this.slack = 0;
    this.hookHold = 1;
    this.gearLoad = 0;
    this.landingControl = 1;
    this.bobX = p.x;
    this.bobY = p.y - 8;
    this.land(fish, particles, audio, onCatch, p);
    return `${fish.label} / ${this.pendingGrade.label}`;
  }

  /** Test seam: drop straight into the fight, for a chosen species and grade.
   *
   *  debugCatch skips to the card, which is no use for checking the reel
   *  itself — and reaching a Mitos fight by casting is the same two-thousand
   *  casts the card seam exists to avoid. */
  debugFight(speciesId: string, gradeId: string, p: LocalPlayer): string {
    const fish = SPECIES.find((f) => f.id === speciesId);
    if (!fish) return `tidak ada spesies ${speciesId}`;
    this.pending = fish;
    const grade = gradeById(gradeId as GradeId);
    // gradeById falls back to Biasa for anything it does not know, which in a
    // test seam is worse than useless: a typo'd grade quietly produces a
    // common fish and the screenshot proves nothing.
    if (grade.id !== gradeId) return `tidak ada grade ${gradeId}`;
    this.pendingGrade = grade;
    this.pendingCm = rollCatchSize(fish, grade);
    this.hookFit = hookSizeFit(this.pendingCm);
    this.style = styleFor(fish);
    this.mouth = mouthType(fish, this.style);
    this.fight = newFight();
    this.state = 'reel';
    this.t = 0;
    this.tension = 0.5;
    this.target = 0.5;
    this.progress = 0.28;
    this.slack = 0;
    this.momentum = 0;
    this.lineOut = Math.min(lineStats().capacity * 0.62, 0.52);
    this.resetGearStress();
    this.hookHold = 1;
    this.hookText = 'debug hook';
    const hand = handPos(p);
    this.fromX = hand.x;
    this.fromY = hand.y;
    this.castUx = 0;
    this.castUy = -1;
    this.bobX = p.x;
    this.bobY = p.y - 8;
    p.locked = true;
    p.action = 'reel';
    return `${fish.label} / ${this.pendingGrade.label} / ${this.style.label}`;
  }

  private land(
    fish: Species, particles: Particles, audio: Audio,
    onCatch: (c: Catch) => void, p: LocalPlayer,
  ): void {
    const grade = this.pendingGrade;
    // Size was rolled when the fish took the bait so it could influence the
    // physical fight. Debug/direct catches fall back to rolling here.
    const cm = this.pendingCm > 0 ? this.pendingCm : rollCatchSize(fish, grade);
    const sizeK = (cm - fish.minCm) / Math.max(1, fish.maxCm - fish.minCm);
    const slackScore = 1 - clamp01(this.slack / 1.4);
    const loadScore = 1 - clamp01((this.gearLoad - 0.72) / 0.80);
    const qualityScore = clamp01(
      this.landingControl * 0.45
      + this.hookHold * 0.25
      + slackScore * 0.20
      + loadScore * 0.10,
    );
    const quality: CatchQualityId = qualityScore >= 0.80
      ? 'mulus'
      : qualityScore >= 0.58 ? 'rapi' : 'kasar';
    const qualityMul = quality === 'mulus' ? 1.25 : quality === 'rapi' ? 1.10 : 1;
    const perfect = quality === 'mulus';
    const coins = Math.max(1, Math.round(
      fish.value * (0.6 + sizeK * 0.9) * qualityMul * grade.valueMul,
    ));

    this.lastCatch = { species: fish, cm, coins, perfect, quality, qualityScore, grade };
    this.state = 'card';
    this.cardT = 0;
    p.action = 'idle';

    // The celebration scales with the grade. A Biasa gets the splash it
    // always got; anything above that earns more of the screen, because a
    // rare catch that looks exactly like a common one is a rare catch the
    // player never finds out about.
    const f = grade.fanfare;
    const q = quality === 'mulus' ? 2 : quality === 'rapi' ? 1 : 0;
    this.flash = 0.35 + f * 0.16 + q * 0.035;
    particles.spawnSplash(this.bobX, this.bobY, 14 + f * 6 + q * 2);
    particles.spawnSpark(this.bobX, this.bobY - 6, 12 + f * 14 + q * 3);
    // Rings for the top grades — a second, slower wave so the burst has a
    // beat to it rather than being one puff.
    for (let i = 0; i < f - 1; i++) {
      particles.spawnSpark(this.bobX, this.bobY - 10 - i * 4, 8 + i * 4);
    }
    audio.catchJingle(fish.value >= 40 || f >= 2);
    onCatch(this.lastCatch);
  }

  private resetGearStress(): void {
    this.gearLoad = 0;
    this.fishStamina = 1;
    this.energyPhase = 'fresh';
    this.reserveBurstT = 0;
    this.reserveBurstUsed = false;
    this.pumpCharge = 0;
    this.pumpRecovery = 0;
    this.pumpBonus = 0;
    this.habitatIntent = 0;
    this.habitatText = '';
    this.fishOffsetX = 0;
    this.fishOffsetY = 0;
    this.fishTravel = 0;
    this.rodAngle = 0.35;
    this.lastPullHeld = false;
    this.pressureT = 0;
    this.counterT = 0;
    this.counterCooldown = 0;
    this.dragSlip = 0;
    this.lineStretch = 0;
    this.spoolRisk = 0;
    this.landingT = 0;
    this.landingControl = 0.35;
    this.escapeT = 0;
    this.escapeUsed = 0;
    this.escapeName = '';
    this.escapeKind = 'run';
    this.escapeMul = 1;
    this.snag = 0;
    this.snagged = false;
    this.rodRisk = 0;
    this.lineRisk = 0;
    this.hookRisk = 0;
    this.rodWear = 0;
    this.lineWear = 0;
    this.hookWear = 0;
    this.tackleWarning = '';
    this.nibbleClarity = 1;
    this.weatherCue = '';
    this.dragAdvice = '';
    this.highStick = 0;
    this.sideLoad = 0;
  }

  /** Persist accumulated wear once per fight, never once per frame. */
  private commitWear(skip?: GearPart): void {
    if (skip !== 'rod' && this.rodWear >= 0.35) damageTackle('rod', this.rodWear);
    if (skip !== 'line' && this.lineWear >= 0.35) damageTackle('line', this.lineWear);
    if (skip !== 'hook' && this.hookWear >= 0.35) damageTackle('hook', this.hookWear);
    this.rodWear = 0;
    this.lineWear = 0;
    this.hookWear = 0;
  }

  private reset(p: LocalPlayer): void {
    this.state = 'idle';
    this.t = 0;
    this.pending = null;
    this.pendingCm = 0;
    this.baitedCast = null;
    this.momentum = 0;
    this.lineOut = 0;
    this.resetGearStress();
    this.hookHold = 1;
    this.mouth = 'normal';
    this.hookText = '';
    this.missText = 'lepas...';
    p.locked = false;
    p.action = 'idle';
  }

  /** World-space bits: the bobber, wake and escape cues. */
  drawWorld(d: Draw, time: number): void {
    const visual = this.bobber;
    if (!visual) return;
    const bx = visual.x;
    const by = visual.y;
    const ring = Math.floor((time * 3) % 4);

    // During a fight the logical cast point stays put, but the hooked fish can
    // pull the float several pixels away. A short dotted wake makes that
    // displacement readable without drawing the fish itself through the water.
    if (this.state === 'reel') {
      const dx = bx - this.bobX;
      const dy = by - this.bobY;
      const dist = Math.hypot(dx, dy);
      if (dist > 1.5) {
        const dots = Math.min(5, Math.max(2, Math.ceil(dist / 2.5)));
        for (let i = 1; i <= dots; i++) {
          const k = i / (dots + 1);
          d.rect(
            this.bobX + dx * k,
            this.bobY + dy * k + 5,
            1, 1, C.WaterBr,
            0.18 + k * 0.28,
          );
        }
      }
    }

    const diving = this.state === 'reel'
      && this.escapeT > 0
      && this.escapeKind === 'dive';
    d.spriteFoot(`ripple${ring}`, bx, by + 6, { alpha: diving ? 0.28 : 0.5 });
    d.spriteFoot('bobber', bx, by + (diving ? 5 : 3), { alpha: diving ? 0.62 : 1 });

    if (this.state === 'nibble') {
      const twitch = Math.abs(Math.sin(this.t * 8)) * 1.5;
      d.textCentered('·', bx, by - 12 - twitch, C.Mist, C.InkDeep, 0.7);
    }
    if (this.state === 'omen') {
      const pulse = 0.35 + 0.4 * Math.abs(Math.sin(this.t * 2.5));
      d.textCentered('…', bx, by - 15, this.pendingGrade.colour, C.InkDeep, pulse);
    }
    if (this.state === 'bite') {
      const bounce = Math.abs(Math.sin(this.t * 9)) * 3;
      d.textCentered('!', bx, by - 16 - bounce, C.Lantern, C.InkDeep);
    }
    if (this.state === 'reel' && this.reserveBurstT > 0) {
      const pulse = 0.35 + 0.45 * Math.abs(Math.sin(this.reserveBurstT * 8));
      d.textCentered('!', bx, by - 18, C.Lantern, C.InkDeep, pulse);
      d.rect(bx - 5, by + 7, 3, 1, C.WaterBr, pulse * 0.6);
      d.rect(bx + 3, by + 7, 3, 1, C.WaterBr, pulse * 0.6);
    }
    if (this.state === 'reel' && this.escapeT > 0) {
      if (this.escapeKind === 'jump') {
        const hop = Math.abs(Math.sin(this.escapeT * 8)) * 4;
        d.textCentered('^', bx, by - 14 - hop, C.Pale, C.InkDeep, 0.9);
      } else if (this.escapeKind === 'dive') {
        d.textCentered('v', bx, by - 12, C.WaterBr, C.InkDeep, 0.82);
      } else if (this.escapeKind === 'headshake' || this.escapeKind === 'roll') {
        d.textCentered('~', bx, by - 13, C.Mist, C.InkDeep, 0.82);
      }
    }
  }

  /** Screen-space HUD. Drawn with the camera parked at the origin. */
  drawHud(d: Draw): void {
    const cx = view.w / 2;

    if (this.state === 'aim') {
      const w = 72;
      const x = cx - w / 2;
      const y = view.h - 34;
      d.rect(x - 2, y - 2, w + 4, 10, C.InkDeep, 0.55);
      d.rect(x, y, w, 6, C.Slate, 0.9);
      d.rect(x, y, Math.round(w * this.power), 6, C.Amber);
      d.rect(x + Math.round(w * this.power) - 1, y - 1, 2, 8, C.White);
      d.textCentered('lepas buat lempar', cx, y - 12, C.Pale, C.InkDeep);
    }

    if (this.state === 'wait') {
      d.textCentered('...', cx, view.h - 30, C.Pale, C.InkDeep, 0.7);
      const where = this.district ? `${this.district.label} · ${this.spot.label}` : this.spot.label;
      if (this.spot.id !== 'kolam' || this.district) {
        d.textCentered(where, cx, view.h - 20, C.Amber, C.InkDeep, 0.6);
      }
      let infoY = view.h - 40;
      const info = (text: string, colour: C, alpha = 0.64): void => {
        d.textCentered(text, cx, infoY, colour, C.InkDeep, alpha);
        infoY -= 10;
      };

      const hazard = spotHazardHint(this.spot);
      if (hazard) info(hazard, C.Mist, 0.62);
      if (this.castLane.id !== 'open') info(`lemparan: ${this.castLane.label}`, C.GrassLt);
      if (this.feeding.id !== 'normal') {
        const baitMatch = this.feeding.preferredBait === this.baitedCast
          ? ' · umpan cocok'
          : '';
        info(`${this.feeding.label}${baitMatch}`, C.GrassLt, 0.68);
      }

      if (this.rain >= 0.12) {
        const weather = this.rain >= 0.62
          ? (this.waterCurrent >= 0.55 ? 'hujan deras · arus naik & air keruh' : 'hujan deras · ikan lebih aktif')
          : (this.waterCurrent >= 0.50 ? 'hujan · arus mulai naik' : 'gerimis · permukaan lebih hidup');
        info(weather, C.WaterBr);
      }

      const c = gearCondition();
      if (Math.min(c.rod, c.line, c.hook) < 45) {
        info(
          `kondisi alat J${Math.round(c.rod)} S${Math.round(c.line)} K${Math.round(c.hook)}`,
          C.Amber, 0.68,
        );
      }

      if (this.baitedCast) {
        const bait = baitById(this.baitedCast);
        d.textCentered(`${bait.label.toLowerCase()} · ${bait.hint}`, cx, view.h - 10, C.Grass, C.InkDeep, 0.65);
      }
    }

    if (this.state === 'nibble') {
      d.textCentered(this.nibbleText, cx, view.h - 34, C.Mist, C.InkDeep, 0.85);
      const read = this.weatherCue
        ? `${this.weatherCue} · tunggu tarik jelas`
        : 'tunggu sampai nyantol';
      d.textCentered(read, cx, view.h - 22, C.Pale, C.InkDeep, 0.68);
    }

    if (this.state === 'omen') {
      const msg = this.t < 0.65 ? 'air mendadak diam...' : 'sesuatu besar bergerak...';
      d.textCentered(msg, cx, view.h - 34, this.pendingGrade.colour, C.InkDeep, 0.95);
      d.textCentered('jangan tarik dulu', cx, view.h - 22, C.Pale, C.InkDeep, 0.7);
    }

    if (this.state === 'bite') {
      d.textCentered('TARIK!', cx, view.h - 34, C.Lantern, C.InkDeep);
    }

    if (this.state === 'reel') {
      const w = 96;
      const x = cx - w / 2;
      const y = view.h - 32;
      d.rect(x - 2, y - 2, w + 4, 14, C.InkDeep, 0.6);
      d.rect(x, y, w, 8, C.Slate, 0.95);

      // The zone you are trying to sit in. Its width is the style's, narrowed
      // by the grade, and it has to be drawn at the width the rules actually
      // use — a bar that lies about where the edge is teaches nothing.
      const tier = this.pendingGrade.tier;
      const zone = Math.max(0.13, this.style.zone - tier * 0.026);
      const zoneW = Math.round(w * zone * 2);
      const zoneX = x + Math.round(this.target * w) - zoneW / 2;
      if (this.fight.veil > 0) {
        // Out of sight, top grades only. The zone is still there and still
        // moving; you are holding the line on where you last saw it. Drawn as
        // an outline rather than left blank — the player has to be able to
        // tell "hidden" from "gone", or the bar looks broken.
        d.frameRect(zoneX, y, zoneW, 8, C.Mist, 0.5);
      } else {
        d.rect(zoneX, y, zoneW, 8, C.Forest, 0.9);
        d.rect(zoneX, y, zoneW, 1, C.Grass, 0.9);
      }

      // Your tension marker. It goes red at either stop, because at the stops
      // it is holding nothing — slack at one end, about to part at the other —
      // and a bar that looks the same when it has stopped working is a bar
      // that teaches the player a lie.
      const mx = x + Math.round(this.tension * w);
      const stuck = this.tension <= 0.03 || this.tension >= 0.97;
      d.rect(mx - 1, y - 2, 3, 12, stuck ? C.Red : C.White);
      if (stuck) d.textCentered('senar lepas!', cx, y + 15, C.Red, C.InkDeep, 0.95);

      // Tiny rod-action meter: amber fills while lifting, green drains while
      // lowering/recovering. It teaches pump-and-reel visually without adding
      // another full HUD row or another control.
      const pumpValue = this.pumpRecovery > 0 ? this.pumpBonus : this.pumpCharge;
      d.rect(x + w + 4, y, 3, 8, C.Slate, 0.8);
      const pumpH = Math.max(0, Math.round(8 * clamp01(pumpValue)));
      if (pumpH > 0) {
        d.rect(
          x + w + 4, y + 8 - pumpH, 3, pumpH,
          this.pumpRecovery > 0 ? C.Grass : C.Amber, 0.95,
        );
      }

      // Progress toward landing it, in the grade's colour.
      //
      // Knowing something good is on the line *while you are fighting it*
      // is most of the tension. Finding out only from the card afterwards
      // makes every fight identical and the rare ones a lottery result
      // rather than a moment.
      const g = this.pendingGrade;
      const pw = Math.max(0, Math.round(w * Math.min(1, this.progress)));
      d.rect(x, y + 10, w, 2, C.Slate, 0.8);
      d.rect(x, y + 10, pw, 2, g.tier > 0 ? g.colour : C.Lantern);

      if (g.tier >= 2) {
        // A pulsing frame around the whole bar. Faster the rarer it is.
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(this.t * (2 + g.tier)));
        d.frameRect(x - 3, y - 3, w + 6, 16, g.colour, pulse);
        d.textCentered(
          g.tier >= 4 ? 'berat sekali!' : 'ada yang besar',
          cx, y - 21, g.colour, C.InkDeep, pulse,
        );
      }

      // What this fish does, and what to do about it, on one line. Naming the
      // pattern is what turns six behaviours into six things a player can
      // learn rather than six kinds of bad luck — but it went on its own line
      // under the bar at first, where the slack-line warning landed on top of
      // it. Below the bar belongs to the warning.
      d.textCentered(
        this.t < 0.9 && this.hookText
          ? `${this.hookText} · ${mouthHint(this.mouth)}`
          : `${this.style.label}: ${this.style.hint}`,
        cx, y - 11,
        this.t < 0.9 && this.hookText ? C.Lantern : C.Pale,
        C.InkDeep, 0.85,
      );

      if (this.tackleWarning) {
        const hard = this.gearLoad >= 1.15 || this.hookHold < 0.32 || this.snagged;
        d.textCentered(
          `${this.tackleWarning} · ${Math.round(this.gearLoad * 100)}%`,
          cx, y + 15, hard ? C.Red : C.Amber, C.InkDeep, 0.88,
        );
      } else if (!stuck && this.momentum >= 0.45) {
        const mul = (1 + this.momentum * 0.35).toFixed(1);
        d.textCentered(`ritme bagus ×${mul}`, cx, y + 15, C.Grass, C.InkDeep, 0.8);
      } else if (this.dragSlip > 0.12) {
        d.textCentered(
          `drag slip ${Math.round(this.dragSlip * 100)}% · biarkan lari`,
          cx, y + 15, C.Mist, C.InkDeep, 0.76,
        );
      } else if (this.lineStretch > 0.20) {
        d.textCentered(
          `senar meredam hentakan ${Math.round(this.lineStretch * 100)}%`,
          cx, y + 15, C.Mist, C.InkDeep, 0.74,
        );
      } else if (this.lineOut / Math.max(0.1, lineStats().capacity) > 0.64) {
        d.textCentered(
          `senar keluar ${Math.round(this.lineOut / Math.max(0.1, lineStats().capacity) * 100)}%`,
          cx, y + 15, C.Mist, C.InkDeep, 0.74,
        );
      } else if (this.energyPhase === 'spent') {
        d.textCentered('ikan habis tenaga · bawa ke tepi', cx, y + 15, C.Grass, C.InkDeep, 0.82);
      } else if (this.energyPhase === 'tired') {
        d.textCentered('ikan mulai berat · ambil line pelan', cx, y + 15, C.Grass, C.InkDeep, 0.78);
      } else if (this.gearLoad > 0.72) {
        d.textCentered(
          `beban alat ${Math.round(this.gearLoad * 100)}%`,
          cx, y + 15, C.Mist, C.InkDeep, 0.72,
        );
      }
    }

    if (this.state === 'miss') {
      d.textCentered(this.missText, cx, view.h - 34, C.Mist, C.InkDeep);
    }

    if (this.state === 'card' && this.lastCatch) this.drawCard(d);
  }

  private drawCard(d: Draw): void {
    const c = this.lastCatch!;
    const g = c.grade;
    const t = this.cardT;
    const w = 132;
    const h = 62;

    // Entrance. A rare card arrives slower and overshoots before it
    // settles — the overshoot is the whole reason it reads as landing
    // rather than as appearing. Timing carries more of "this is valuable"
    // than any amount of colour does.
    const speed = 6 - g.fanfare * 0.7;
    const pop = Math.min(1, t * speed);
    const ease = 1 - Math.pow(1 - pop, 3);
    const overshoot = Math.sin(Math.min(1, t * speed * 0.8) * Math.PI) * (1 + g.tier) * 0.9;
    const x = Math.round(view.w / 2 - w / 2);
    const y = Math.round(
      view.h / 2 - h / 2 - 14 + (1 - ease) * (8 + g.fanfare * 4) - overshoot,
    );
    const a = ease;
    const cx = x + 28;
    const cy = y + 29;

    // --- rays, behind everything. Spokes that turn slowly and breathe.
    if (g.tier >= 3) {
      const spokes = 6 + g.tier * 2;
      for (let i = 0; i < spokes; i++) {
        const ang = (i / spokes) * Math.PI * 2 + t * 0.5;
        const len = 14 + Math.sin(t * 2.6 + i) * 4 + g.tier * 2;
        for (let r = 6; r < len; r++) {
          const px = cx + Math.cos(ang) * r;
          const py = cy + Math.sin(ang) * r * 0.7;
          d.rect(px, py, 1, 1, g.colour, a * 0.34 * (1 - r / len));
        }
      }
    }

    // --- the burst rings, expanding out past the card edge.
    if (g.glow > 0) {
      for (let i = 0; i < g.tier - 1; i++) {
        const rt = Math.max(0, Math.min(1, t * 1.6 - i * 0.22));
        if (rt <= 0 || rt >= 1) continue;
        const r = 20 + rt * (60 + g.tier * 14);
        d.sprite('glow64', view.w / 2 - r, y + h / 2 - r, {
          tint: colTint(g.colour), alpha: (1 - rt) * 0.5, blend: Blend.Add,
        });
      }
    }

    const qualityAccent = c.quality === 'mulus' ? C.Grass
      : c.quality === 'rapi' ? C.WaterBr : C.Slate;
    d.panel(x, y, w, h, a, g.tier > 0 ? g.colour : qualityAccent);

    // --- glow behind the fish, breathing.
    if (g.glow > 0) {
      const gs = g.glow > 32 ? 64 : 32;
      const breathe = 0.85 + 0.15 * Math.sin(t * 3.1);
      d.sprite(`glow${gs}`, cx - gs / 2, cy - gs / 2, {
        tint: colTint(g.colour),
        alpha: (0.30 + g.tier * 0.06) * breathe,
        blend: Blend.Add,
      });
    }

    // --- the fish itself, alive rather than pinned to a board. A slow
    // vertical bob with a slight lag on the horizontal reads as swimming
    // in place; a static sprite in a frame reads as a specimen.
    const bob = Math.sin(t * 2.8) * 1.6;
    const sway = Math.sin(t * 2.8 - 0.7) * 1.1;
    const key = `fishg${g.tier}_${c.species.id}`;
    d.sprite(key, x + 8 + sway, y + 18 + bob, { alpha: a });
    if (g.tier >= 1) {
      d.sprite(key, x + 8 + sway, y + 18 + bob, {
        tint: colTint(g.colour),
        // Barely there, and weaker the higher the grade. The sprite now
        // carries the escalation itself — crest, filaments, spines — so
        // the tint only has to say which colour the grade is. Left at the
        // strength that suited a flat silhouette, it washed the top grades
        // out to white blobs with fins.
        alpha: a * (0.04 + g.tier * 0.012) * (0.8 + 0.2 * Math.sin(t * 3.4)),
        blend: Blend.Add,
        flat: true,
      });
    }

    // --- sparks orbiting the catch, for the top two grades.
    if (g.tier >= 4) {
      for (let i = 0; i < 5 + g.tier; i++) {
        const ang = (i / (5 + g.tier)) * Math.PI * 2 + t * 1.4;
        const rr = 16 + Math.sin(t * 2 + i * 1.3) * 4;
        const px = cx + Math.cos(ang) * rr;
        const py = cy + Math.sin(ang) * rr * 0.6;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 5 + i));
        d.rect(px, py, 1, 1, C.White, a * tw);
      }
    }

    // --- a shine sweeping across the card face, once, on arrival.
    if (g.tier >= 2) {
      const sweep = (t * 0.9) % 2.2;
      if (sweep < 1) {
        const head = x - 20 + sweep * (w + 40);
        for (let row = 1; row < h - 1; row++) {
          // The band leans, so it reads as light crossing a surface rather
          // than as a bar sliding sideways.
          const sx = head + (h - row) * 0.45;
          for (let k = 0; k < 5; k++) {
            const px = sx + k;
            if (px < x + 1 || px > x + w - 2) continue;
            d.rect(px, y + row, 1, 1, C.White, a * 0.16 * (1 - Math.abs(k - 2) / 2.5));
          }
        }
      }
    }

    // --- text, revealed in order. All four lines appearing at once is a
    // form being filled in; one after another is somebody telling you what
    // you caught.
    const line = (i: number): number => {
      const lt = Math.max(0, Math.min(1, (t - 0.10 - i * 0.09) * 7));
      return a * lt;
    };
    d.text(c.species.label, x + 54, y + 8, C.White, line(0));
    d.text(g.label.toLowerCase(), x + 54, y + 19, g.colour, line(1));
    d.text(`${c.cm} cm`, x + 54, y + 30, C.Amber, line(2));

    // The coins count up. Watching a number climb is the cheapest reward
    // animation there is and it never stops working.
    const cr = Math.max(0, Math.min(1, (t - 0.30) * 2.2));
    const shown = Math.round(c.coins * (1 - Math.pow(1 - cr, 3)));
    const coinTxt = `+${shown}`;
    d.text(coinTxt, x + 54, y + 41, C.Lantern, line(3));
    d.text('koin', x + 54 + textWidth(coinTxt) + 3, y + 41, C.SunGlow, line(3) * 0.8);

    if (c.quality === 'mulus') {
      d.text('landing mulus!', x + 54, y + 52, C.Grass, line(4));
    } else if (c.quality === 'rapi') {
      d.text('landing rapi', x + 54, y + 52, C.GrassLt, line(4));
    } else {
      d.text('landing kasar', x + 54, y + 52, C.Amber, line(4));
    }

    d.textCentered('spasi', view.w / 2, y + h + 5, C.Mist, C.InkDeep, a * 0.7);
  }
}

function facingWater(p: LocalPlayer, map: WorldMap): boolean {
  const reach = 30;
  let dx = 0;
  let dy = -1;
  if (p.facing === 'left') dx = -1, dy = 0;
  else if (p.facing === 'right') dx = 1, dy = 0;
  else if (p.facing === 'down') dx = 0, dy = 1;
  for (let r = 6; r <= reach; r += 4) {
    const tx = Math.floor((p.x + dx * r) / TILE);
    const ty = Math.floor((p.y - 6 + dy * r) / TILE);
    const t = tileAt(map, tx, ty);
    if (isWater(t)) return true;
    if (t === Tile.Blocked) return false;
  }
  return false;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampInt(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

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
import {
  COMMON, gradeById, luckFrom, rollGrade, type Grade, type GradeId,
} from './grade';

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

/** Three things decide what bites: the hour, how far out the bobber landed,
 *  and which spot it landed in. The spot is the strongest of the three —
 *  that is what makes walking to the swamp at night worth doing. */
function rollSpecies(
  time: number, depth01: number, spot: Spot, district: District | null,
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

export type FishState = 'idle' | 'aim' | 'cast' | 'wait' | 'bite' | 'reel' | 'card' | 'miss';

export interface Catch {
  species: Species;
  cm: number;
  coins: number;
  perfect: boolean;
  grade: Grade;
}

/** A palette index as the 0..1 triple the sprite tint wants. */
function colTint(c: C): [number, number, number] {
  return col01(c);
}

const MAX_CAST = 96;
const MIN_CAST = 26;

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
  private depth01 = 0;
  private spot: Spot = DEFAULT_SPOT;
  private district: District | null = null;
  private pending: Species | null = null;
  /** Rolled the moment the fish takes, not when it lands — the grade has to
   *  be known during the fight, because it is what makes the fight hard. */
  private pendingGrade: Grade = COMMON;

  /** Reel bar. `tension` is what the player steers; `target` drifts. */
  private tension = 0.5;
  private target = 0.5;
  private targetVel = 0;
  private progress = 0;
  private slack = 0;

  lastCatch: Catch | null = null;
  cardT = 0;
  /** Set for one frame when a catch lands, so main can flash the screen. */
  flash = 0;

  /** Where the bobber currently is, for the network and the line renderer. */
  get bobber(): { x: number; y: number } | null {
    return this.state === 'idle' || this.state === 'card' || this.state === 'aim'
      ? null
      : { x: this.bobX, y: this.bobY };
  }

  get busy(): boolean {
    return this.state !== 'idle';
  }

  /** Abandons whatever is in progress. Used when the player walks through a
   *  door — a rod still cast into a lake you are no longer standing beside
   *  would leave a bobber floating in another map. */
  cancel(p: LocalPlayer): void {
    this.state = 'idle';
    this.t = 0;
    this.pending = null;
    p.locked = false;
    p.action = 'idle';
  }

  /** Exposed for the dev harness, which drives the reel to verify the
   *  whole catch flow without a human on the keyboard. */
  get reel(): { tension: number; target: number; progress: number } {
    return { tension: this.tension, target: this.target, progress: this.progress };
  }

  update(
    dt: number, input: Input, p: LocalPlayer, map: WorldMap,
    time: number, particles: Particles, audio: Audio,
    onCatch: (c: Catch) => void, onCastNet: (x: number, y: number) => void,
  ): void {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);

    switch (this.state) {
      case 'idle': {
        if (input.pressed(' ') && facingWater(p, map)) {
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
          // Long enough that you look at the lake, short enough to stay a game.
          this.biteAt = 2.4 + Math.random() * 7.5;
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
          this.pending = rollSpecies(time, this.depth01, this.spot, this.district);
          // Deep water, a good spot and the small hours all improve the
          // odds, so chasing a rare fish means going somewhere for it
          // rather than casting more times in the same place.
          this.pendingGrade = rollGrade(
            luckFrom(this.depth01, this.spot.depth, nightness(time)),
          );
          this.state = 'bite';
          this.t = 0;
          particles.spawnSplash(this.bobX, this.bobY + 2, 5);
          audio.bite();
        }
        break;
      }

      case 'bite': {
        this.bobY += Math.sin(this.t * 22) * dt * 9;
        // Two full seconds to react. Generous by design.
        if (input.pressed(' ')) {
          this.state = 'reel';
          this.t = 0;
          this.tension = 0.5;
          this.target = 0.5;
          this.targetVel = 0;
          this.progress = 0.28;
          this.slack = 0;
          p.action = 'reel';
          audio.blip(520, 0.06, 0.2);
        } else if (this.t > 2.0) {
          this.state = 'miss';
          this.t = 0;
        }
        break;
      }

      case 'reel': {
        const fish = this.pending!;
        // The fish wanders; you follow it. Wandering is smooth, never jerky.
        const fight = fish.fight * this.pendingGrade.fightMul;
        this.targetVel += (Math.random() - 0.5) * dt * 9 * fight;
        // Rare fish run. A surge every few seconds is what turns a steady
        // drift into something you have to answer, and it is the only part
        // of the reel that ever asks for attention rather than patience.
        if (this.pendingGrade.tier >= 2) {
          const surge = Math.sin(this.t * 1.7 + this.pendingGrade.tier);
          if (surge > 0.93) this.targetVel += (this.target < 0.5 ? 1 : -1) * dt * 6;
        }
        this.targetVel *= 0.92;
        this.target = clamp01(this.target + this.targetVel * dt);
        if (this.target <= 0 || this.target >= 1) this.targetVel *= -0.6;

        const pull = input.held(' ') ? 1 : -1;
        this.tension = clamp01(this.tension + pull * dt * 0.7);

        // Wide zone, slow drain: the reel is meant to be something you do
        // while looking at the lake, not a rhythm test. Losing a fish
        // should take sustained inattention, not a moment of it.
        const off = Math.abs(this.tension - this.target);
        const inZone = off < 0.28;
        this.progress += (inZone ? 0.42 : -0.10) * dt;
        this.slack = inZone ? Math.max(0, this.slack - dt * 0.6) : this.slack + dt * 0.5;

        this.bobX += (Math.random() - 0.5) * 12 * dt;
        this.bobY += (Math.random() - 0.5) * 8 * dt;

        if (this.progress >= 1) {
          this.land(fish, particles, audio, onCatch, p);
        } else if (this.progress <= -0.15 || this.slack > 4.0) {
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
    this.bobX = hand.x;
    this.bobY = hand.y;
    this.flightT = 0;
    this.flightDur = 0.22 + dist / 400;
    this.state = 'cast';
    p.action = 'cast';

    // Where the bobber landed decides the spot, and the spot sets the
    // baseline depth. Casting further out from the shore adds to it.
    this.spot = spotAt(map.spots, tx, ty);
    this.district = districtAt(tx, ty).district;
    const shoreCol = map.shore[clampInt(Math.floor(tx / TILE), 0, map.shore.length - 1)];
    const fromShore = shoreCol * TILE - ty;
    this.depth01 = clamp01(this.spot.depth + clamp01(fromShore / 200) * 0.45);

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
    this.slack = 0;
    this.bobX = p.x;
    this.bobY = p.y - 8;
    this.land(fish, particles, audio, onCatch, p);
    return `${fish.label} / ${this.pendingGrade.label}`;
  }

  private land(
    fish: Species, particles: Particles, audio: Audio,
    onCatch: (c: Catch) => void, p: LocalPlayer,
  ): void {
    const grade = this.pendingGrade;
    // Small fish are common; a high grade drags the roll toward the top of
    // the species' range rather than past it, so a Mitos wader is still a
    // wader and the size numbers stay believable.
    const roll = Math.random() * Math.random();
    const k = Math.min(1, (1 - roll) + grade.sizeBias * roll);
    const cm = Math.round(fish.minCm + (fish.maxCm - fish.minCm) * k);
    const sizeK = (cm - fish.minCm) / Math.max(1, fish.maxCm - fish.minCm);
    const perfect = this.slack < 0.35;
    const coins = Math.max(1, Math.round(
      fish.value * (0.6 + sizeK * 0.9) * (perfect ? 1.25 : 1) * grade.valueMul,
    ));

    this.lastCatch = { species: fish, cm, coins, perfect, grade };
    this.state = 'card';
    this.cardT = 0;
    p.action = 'idle';

    // The celebration scales with the grade. A Biasa gets the splash it
    // always got; anything above that earns more of the screen, because a
    // rare catch that looks exactly like a common one is a rare catch the
    // player never finds out about.
    const f = grade.fanfare;
    this.flash = 0.35 + f * 0.16;
    particles.spawnSplash(this.bobX, this.bobY, 14 + f * 6);
    particles.spawnSpark(this.bobX, this.bobY - 6, 12 + f * 14);
    // Rings for the top grades — a second, slower wave so the burst has a
    // beat to it rather than being one puff.
    for (let i = 0; i < f - 1; i++) {
      particles.spawnSpark(this.bobX, this.bobY - 10 - i * 4, 8 + i * 4);
    }
    audio.catchJingle(fish.value >= 40 || f >= 2);
    onCatch(this.lastCatch);
  }

  private reset(p: LocalPlayer): void {
    this.state = 'idle';
    this.t = 0;
    this.pending = null;
    p.locked = false;
    p.action = 'idle';
  }

  /** World-space bits: the bobber and its ripples. */
  drawWorld(d: Draw, time: number): void {
    if (!this.bobber) return;
    const ring = Math.floor((time * 3) % 4);
    d.spriteFoot(`ripple${ring}`, this.bobX, this.bobY + 6, { alpha: 0.5 });
    d.spriteFoot('bobber', this.bobX, this.bobY + 3);
    if (this.state === 'bite') {
      const bounce = Math.abs(Math.sin(this.t * 9)) * 3;
      d.textCentered('!', this.bobX, this.bobY - 16 - bounce, C.Lantern, C.InkDeep);
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

      // The zone you are trying to sit in.
      const zoneW = Math.round(w * 0.56);
      const zoneX = x + Math.round(this.target * w) - zoneW / 2;
      d.rect(zoneX, y, zoneW, 8, C.Forest, 0.9);
      d.rect(zoneX, y, zoneW, 1, C.Grass, 0.9);

      // Your tension marker.
      const mx = x + Math.round(this.tension * w);
      d.rect(mx - 1, y - 2, 3, 12, C.White);

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

      d.textCentered('tahan spasi', cx, y - 11, C.Pale, C.InkDeep, 0.85);
    }

    if (this.state === 'miss') {
      d.textCentered('lepas...', cx, view.h - 34, C.Mist, C.InkDeep);
    }

    if (this.state === 'card' && this.lastCatch) this.drawCard(d);
  }

  private drawCard(d: Draw): void {
    const c = this.lastCatch!;
    const g = c.grade;
    const w = 132;
    const h = 62;
    // A rare card arrives slower and settles further. Timing is most of
    // what makes something feel valuable — the same panel snapping in
    // instantly reads as a receipt.
    const speed = 6 - g.fanfare * 0.7;
    const pop = Math.min(1, this.cardT * speed);
    const ease = 1 - Math.pow(1 - pop, 3);
    const x = Math.round(view.w / 2 - w / 2);
    const y = Math.round(view.h / 2 - h / 2 - 14 + (1 - ease) * (8 + g.fanfare * 4));
    const a = ease;

    // The burst: rings expanding out from behind the card, in the grade's
    // colour, for the top grades only.
    if (g.glow > 0) {
      for (let i = 0; i < 1 + g.tier - 1; i++) {
        const t = Math.max(0, Math.min(1, this.cardT * 1.6 - i * 0.22));
        if (t <= 0 || t >= 1) continue;
        const r = 20 + t * (60 + g.tier * 14);
        d.sprite('glow64', view.w / 2 - r, y + h / 2 - r, {
          tint: colTint(g.colour), alpha: (1 - t) * 0.5, blend: Blend.Add,
        });
        void r;
      }
    }

    d.panel(x, y, w, h, a, g.tier > 0 ? g.colour : c.perfect ? C.Lantern : C.Slate);

    // Glow behind the fish itself, so the sprite looks lit rather than
    // merely tinted.
    if (g.glow > 0) {
      const gs = g.glow > 32 ? 64 : 32;
      d.sprite(`glow${gs}`, x + 28 - gs / 2, y + 29 - gs / 2, {
        tint: colTint(g.colour), alpha: 0.30 + g.tier * 0.06, blend: Blend.Add,
      });
    }
    // The fish is drawn in its own colours, then given a *lit* pass of the
    // grade colour on top. Tinting the sprite itself was the obvious move
    // and the wrong one: tint multiplies, so a violet Naga Nila under a
    // green Bagus wash came out muddy green and stopped being a Naga Nila.
    // The species has to survive the grade, or the ladder eats the roster.
    const key = `${g.exalted ? 'fishrare' : 'fishbig'}_${c.species.id}`;
    d.sprite(key, x + 8, y + 18, { alpha: a });
    if (g.tier >= 1) {
      d.sprite(key, x + 8, y + 18, {
        tint: colTint(g.colour),
        // Weak on purpose. Additive light over a flat silhouette saturates
        // fast, and at the strength that looked right on a Langka the top
        // two grades came out as white blobs with fins.
        alpha: a * (0.05 + g.tier * 0.03),
        blend: Blend.Add,
        flat: true,
      });
    }

    d.text(c.species.label, x + 54, y + 8, C.White, a);
    d.text(g.label.toLowerCase(), x + 54, y + 19, g.colour, a);
    d.text(`${c.cm} cm`, x + 54, y + 30, C.Amber, a);
    d.text(`+${c.coins}`, x + 54, y + 41, C.Lantern, a);
    d.text('koin', x + 54 + textWidth(`+${c.coins}`) + 3, y + 41, C.SunGlow, a * 0.8);

    if (c.perfect) d.text('mulus!', x + 54, y + 52, C.Grass, a);
    else d.text(c.species.blurb.slice(0, 22), x + 8, y + 52, C.Mist, a * 0.8);

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

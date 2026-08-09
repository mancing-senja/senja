/** The history of the valley, told in objects.
 *
 *  A world is not built by writing a backstory; it is built by leaving
 *  evidence of one lying around. So none of this is delivered by a
 *  narrator. It is on a plaque bolted to a wall, on a terminal nobody
 *  turned off, on a stone somebody carved before the language shifted.
 *
 *  The fragments are deliberately partial and occasionally contradict each
 *  other, because the people who wrote them did not have the whole picture
 *  either. Read in any order they still add up: the grove was here first,
 *  the keep was built to guard a crossing that no longer exists, the
 *  village is what the keep's farmers became, and the quay is ninety years
 *  old and has already changed the fish. */

export type LoreRegion = 'benteng' | 'kolam' | 'neon' | 'rimbun';

export interface LoreFragment {
  id: string;
  region: LoreRegion;
  /** What the thing physically is. Drives which sprite is used. */
  form: 'plaque' | 'terminal' | 'runestone' | 'signpost';
  /** Shown as the panel heading. */
  title: string;
  body: string[];
  /** Tile position, resolved against the district anchor at build time. */
  dx: number;
  dy: number;
}

/** Offsets are relative to each district's anchor tile, so the markers
 *  follow the landmarks if those ever move. */
export const LORE: LoreFragment[] = [
  // ------------------------------------------------------------ Benteng
  {
    id: 'gerbang', region: 'benteng', form: 'plaque',
    title: 'Batu Gerbang',
    dx: -1, dy: 11,
    body: [
      'Dipahat di ambang gerbang, hurufnya sudah aus:',
      '"Yang lewat di sini membayar dengan garam,',
      'bukan dengan emas."',
      '',
      'Dulu ada penyeberangan di bawah tembok ini.',
      'Airnya sekarang terlalu tinggi.',
    ],
  },
  {
    id: 'menara', region: 'benteng', form: 'plaque',
    title: 'Papan Menara Timur',
    dx: 14, dy: -5,
    body: [
      'Menara ini tidak runtuh karena diserang.',
      'Menara ini runtuh sendiri, malam, tanpa suara,',
      'tiga tahun setelah orang terakhir pergi.',
      '',
      'Tidak ada yang tahu ke mana mereka pergi.',
      'Sebagian bilang: ke hilir. Sebagian bilang: dekat.',
    ],
  },
  {
    id: 'parit', region: 'benteng', form: 'runestone',
    title: 'Tanda Air',
    dx: -6, dy: -8,
    body: [
      'Ada tiga garis dipahat di batu ini,',
      'satu di atas yang lain.',
      '',
      'Yang paling bawah bertahun 112.',
      'Yang tengah, 340.',
      'Yang paling atas tidak bertahun, dan',
      'sekarang berada di bawah permukaan.',
    ],
  },
  {
    id: 'dapur', region: 'benteng', form: 'plaque',
    title: 'Daftar Dapur',
    dx: 7, dy: 6,
    body: [
      'Papan tugas dapur, masih terbaca sebagian:',
      '',
      'SENIN — Harun, Maret',
      'SELASA — Harun, Umar',
      'RABU — (dikerik habis)',
      '',
      'Nama Umar dan Maret masih ada di desa.',
    ],
  },

  // -------------------------------------------------------------- Kolam
  {
    id: 'dermaga', region: 'kolam', form: 'signpost',
    title: 'Tiang Dermaga',
    dx: 4, dy: 2,
    body: [
      'Dipaku di tiang dermaga, cat sudah mengelupas:',
      '',
      '"Dermaga ini dibangun dari kayu tembok benteng.',
      'Kalau papannya terasa terlalu tua untuk sebuah',
      'dermaga, memang begitu adanya."',
    ],
  },
  {
    id: 'sumur', region: 'kolam', form: 'plaque',
    title: 'Batu Sumur',
    dx: 0, dy: 6,
    body: [
      'Sumur ini digali oleh dua belas keluarga',
      'yang turun dari benteng setelah benteng kosong.',
      '',
      'Mereka tidak membawa apa-apa kecuali',
      'nama belakang dan cara memasak ikan.',
    ],
  },
  {
    id: 'ladang', region: 'kolam', form: 'signpost',
    title: 'Papan Ladang',
    dx: -3, dy: -2,
    body: [
      '"Petak ini milik bersama. Siapa yang lewat,',
      'boleh menyiram. Siapa yang menyiram,',
      'boleh memanen."',
      '',
      'Ditandatangani: seluruh desa, musim kedua.',
    ],
  },
  {
    id: 'rawa-tanda', region: 'kolam', form: 'runestone',
    title: 'Batu Peringatan Rawa',
    dx: 6, dy: -3,
    body: [
      'Batu ini ditaruh menghadap rawa,',
      'bukan menghadap jalan.',
      '',
      '"Air yang diam bukan air yang tidur."',
      '',
      'Tidak ada yang ingat siapa yang menaruhnya.',
    ],
  },

  // --------------------------------------------------------------- Neon
  {
    id: 'prasasti-quay', region: 'neon', form: 'plaque',
    title: 'Prasasti Dermaga',
    dx: -14, dy: 3,
    body: [
      'DERMAGA TIMUR — dibuka tahun ke-91',
      '',
      'Dibangun untuk melayani pabrik di hulu.',
      'Pabriknya tutup tahun ke-96.',
      'Dermaganya tidak pernah tutup.',
    ],
  },
  {
    id: 'terminal-air', region: 'neon', form: 'terminal',
    title: 'Terminal Pemantau Air',
    dx: -6, dy: 6,
    body: [
      '> SUHU AIR OUTFALL: +7.4 di atas danau',
      '> STATUS: dalam batas',
      '> BATAS TERAKHIR DIPERBARUI: tahun ke-93',
      '',
      '> CATATAN OPERATOR:',
      '> "batasnya yang diubah, bukan airnya"',
    ],
  },
  {
    id: 'terminal-ikan', region: 'neon', form: 'terminal',
    title: 'Terminal Survei Ikan',
    dx: 5, dy: 8,
    body: [
      '> SURVEI SPESIES, tahun ke-91 vs sekarang',
      '',
      '> wader ........ turun 80%',
      '> jelawat ....... hilang',
      '> krom sirip .... TIDAK ADA DI DAFTAR 91',
      '',
      '> tiga spesies tidak punya nama lama.',
    ],
  },
  {
    id: 'stiker', region: 'neon', form: 'terminal',
    title: 'Papan Buletin Blok',
    dx: 12, dy: 5,
    body: [
      'Layar rusak, tinggal satu baris yang menyala:',
      '',
      '"JANGAN MAKAN IKAN DARI MULUT PIPA"',
      '',
      'Di bawahnya, ditulis tangan dengan spidol:',
      '"terlambat"',
    ],
  },

  // ------------------------------------------------------------- Rimbun
  {
    id: 'batu-tua', region: 'rimbun', form: 'runestone',
    title: 'Batu Paling Tua',
    dx: -13, dy: -7,
    body: [
      'Huruf di batu ini bukan huruf yang dipakai',
      'di benteng, dan bukan huruf yang kita pakai.',
      '',
      'Yang bisa dibaca hanya satu kata,',
      'dan kata itu berarti: sebelum.',
    ],
  },
  {
    id: 'survei', region: 'rimbun', form: 'plaque',
    title: 'Patok Surveyor',
    dx: 12, dy: -9,
    body: [
      'Patok besi, dipasang oleh tukang ukur benteng.',
      '',
      '"Batas selatan lahan. Jangan menebang',
      'melewati patok ini. Bukan karena hukum.',
      'Kami sudah mencoba dua kali."',
    ],
  },
  {
    id: 'kolam-catatan', region: 'rimbun', form: 'runestone',
    title: 'Batu Tepi Kolam',
    dx: 0, dy: 7,
    body: [
      'Kolam ini sudah menyala sebelum ada',
      'yang menuliskan bahwa ia menyala.',
      '',
      'Air yang masuk tidak keluar.',
      'Permukaannya tidak pernah naik.',
    ],
  },
  {
    id: 'ki-lengan', region: 'rimbun', form: 'signpost',
    title: 'Papan Tulisan Tangan',
    dx: 16, dy: -4,
    body: [
      'Papan kayu, tulisannya masih basah:',
      '',
      '"Aku datang untuk semalam.',
      'Itu beberapa musim yang lalu.',
      'Jangan khawatirkan aku."',
      '',
      '— Ki Lengan',
    ],
  },
];

export function fragmentsFor(region: LoreRegion): LoreFragment[] {
  return LORE.filter((f) => f.region === region);
}

const KEY = 'senja.lore.v1';

/** Which fragments have been read. Persisted, so the count means something
 *  across sessions. */
export function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveRead(read: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...read]));
  } catch {
    // Storage unavailable; the reading still works, it just is not counted.
  }
}

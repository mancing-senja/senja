# Kontribusi ke Senja

Makasih sudah mampir. Baca ini dulu sebelum ngoding — ada satu hal di
proyek ini yang beda dari kebanyakan game, dan kalau ga tahu bisa bikin
kerjaan lu kebuang.

## Hal paling penting: ga ada file gambar

**Semua art di game ini di-generate lewat kode.** Ga ada satu pun `.png`,
`.aseprite`, atau spritesheet di repo ini. Pohon, rumah, ikan, karakter,
awan, air — semuanya digambar sama fungsi TypeScript pas game-nya boot,
terus dipanggang jadi satu texture atlas.

Artinya:

- **Nambah art = nulis generator**, bukan naruh file. Lihat
  `src/client/art/` buat contoh.
- Semua warna wajib dari palet 48 warna di `src/client/art/palette.ts`.
  Ga ada warna di luar palet. Ini yang bikin art dari sepuluh orang beda
  tetap kelihatan dari satu tangan.
- Kalau lu jago pixel art tapi ga mau ngoding — tetap kepake banget.
  Buka issue dengan label `art-direction`: kirim referensi, kritik yang
  jelek di mana, tunjukin ramp warna yang bener. Bagian tersulit di sini
  itu *tahu apa yang salah*, bukan ngetiknya.

Kenapa begini? Biar repo-nya tetap kecil, semua variasi bisa diacak dari
seed, dan ga ada yang harus punya lisensi Aseprite buat ikut.

## Jalanin lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Server room-nya ikut nyala di port 8787.

Buat main bareng satu wifi:

```bash
npm run lan
```

Cek juga sebelum bikin PR:

```bash
npm run typecheck
```

## Struktur kode

Baca [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) buat peta lengkapnya.
Singkatnya:

| Folder | Isinya |
| --- | --- |
| `src/client/art/` | Semua generator gambar + palet + font |
| `src/client/engine/` | WebGL2, batcher sprite, input, ukuran layar |
| `src/client/world/` | Peta, distrik, spot mancing, langit & air, cahaya |
| `src/client/render/` | Yang nempelin art ke layar |
| `src/client/game/` | Mancing, kebun, NPC, dialog, musik, UI, jaringan |
| `src/server/` | Server room (WebSocket) |
| `src/shared/` | Yang dipakai dua-duanya: konstanta + protokol |

## Resep: nambah sesuatu

### Nambah satu jenis ikan

1. `src/client/art/props.ts` → tambah entri di `FISH_LOOKS` (warna badan,
   perut, sirip, bentuk, corak).
2. `src/client/game/fishing.ts` → tambah entri di `SPECIES` (nilai, ukuran,
   bobot per waktu, seberapa kuat narik, satu kalimat deskripsi).
3. Kalau ikannya khas satu distrik, tambah pengalinya di `fish` pada
   distrik itu di `src/client/world/districts.ts`.

Selesai. Sprite-nya ke-generate sendiri, masuk catatan tangkapan sendiri.

### Nambah warga

`src/client/game/npc.ts` → tambah entri di `villagerDefs`: id, nama,
`hue` (indeks tampilan 0–11), rute (koordinat tile), dan `bias` watak.
Kalau dia tinggal di distrik bergenre, set `register`-nya.

Jangan nulis dialog buat mereka. Dialognya dirakit dari watak + mood +
ingatan. Kalau mau nambah kalimat, tambah ke kolam di
`src/client/game/registers.ts` — otomatis kepake semua NPC di register itu.

### Nambah distrik genre baru

`src/client/world/districts.ts` → satu entri data: batas wilayah, tint,
warna kabut, tabel ikan, register dialog. Terus tulis generator art-nya di
`src/client/art/`. Renderer, roll ikan, dan sistem dialog **ga perlu
diubah sama sekali** — itu memang tujuannya.

### Nambah catatan sejarah

`src/client/game/lore.ts`. Tulis fragmen baru dengan posisi relatif ke
anchor distriknya. Jangan bikin yang cuma menjelaskan; bikin yang ninggalin
pertanyaan. Fragmen yang saling bertentangan itu boleh dan malah bagus.

## Gaya kode

- TypeScript strict. `npm run typecheck` harus lolos.
- **Komentar jelasin *kenapa*, bukan *apa*.** `// tambah 1 ke x` ga guna.
  `// mulai dari 1 karena baris 0 itu header` itu guna. Banyak keputusan di
  repo ini kelihatan aneh sampai lu tahu alasannya — tulis alasannya.
- Ga ada dependency baru tanpa diskusi dulu di issue. Sekarang cuma `ws`.
- Bahasa: komentar & kode dalam bahasa Inggris, teks yang dilihat pemain
  dalam bahasa Indonesia.

## Kirim PR

1. Fork, bikin branch dari `main`.
2. Satu PR = satu hal. PR yang benerin tiga hal sekaligus susah di-review.
3. Kalau ngubah tampilan, **lampirkan screenshot sebelum/sesudah**. Ini
   game yang separuh nilainya di tampilan; deskripsi teks doang ga cukup.
4. Isi template PR-nya.

## Aturan sopan

Baca [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Singkatnya: kritik
karyanya, bukan orangnya. Yang baru nanya hal dasar itu wajar — kita semua
pernah di situ.

# Senja

Game mancing santai buat dimainin bareng. Satu danau, satu desa utama,
dua kampung kecil, dan beberapa distrik yang genrenya beda-beda. Buat orang
yang baru pulang kerja.

[![CI](https://github.com/mancing-senja/senja/actions/workflows/ci.yml/badge.svg)](https://github.com/mancing-senja/senja/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Mayoritas art runtime di-generate lewat kode** dari satu palet 48 warna.
> Ada beberapa PNG di `public/art/portraits/` sebagai palette/template buat
> authoring potret; sprite game tetap dipanggang ke atlas saat boot. Musiknya
> juga disintesis. Baca [CONTRIBUTING.md](CONTRIBUTING.md) sebelum ngoding.

## Jalanin

```bash
npm install
npm run dev
```

Buka http://localhost:5173. Dua proses jalan bareng: Vite buat client di
port 5173, dan server room di port 8787.

Kalau servernya mati, gamenya tetep jalan — mancing dan berkebun tetep bisa,
cuma sendirian.

## Mabar

Kode room ada di URL, di belakang `#`. Kirim link yang lagi kebuka ke temen,
mereka masuk ke room yang sama. Satu room maksimal 8 orang.

### Satu wifi

```bash
npm run lan
```

Vite nampilin alamat Network (misal `http://192.168.1.5:5173`). Kasih itu ke
temen — udah, gitu doang.

### Beda jaringan saat development

Butuh tunnel. Yang paling gampang, ga perlu daftar akun:

```bash
npx cloudflared tunnel --url http://localhost:5173
```

Dia bakal ngasih URL `https://xxx.trycloudflare.com`. Kirim ke temen, lengkap
sama `#kode-room`-nya.

**Cukup satu tunnel ke port 5173 doang.** Vite nge-proxy `/room` ke server
room, jadi ga perlu nge-expose port 8787 terpisah.

> Tunnel ini bikin game lu **bisa diakses siapa pun yang punya linknya**
> selama tunnelnya nyala. Matiin (Ctrl+C) kalau udah selesai.

### Deploy produksi

Produksi sekarang cuma butuh satu proses. Build client lalu server Node akan
melayani file hasil build dan WebSocket `/room` dari origin yang sama:

```bash
npm run serve
```

Secara default server memakai port 8787. Bisa diubah lewat `PORT` atau
`SENJA_PORT`.

## Kontrol

| Tombol | Fungsi |
| --- | --- |
| `WASD` / panah | jalan |
| `spasi` | lempar kail (tahan buat ngatur jauhnya), tarik pas nyantol, tahan buat gulung |
| `E` | cangkul, tanam, siram, panen, jual, ngobrol sama warga |
| `Q` | ganti bibit / pindah kategori di toko pancing |
| `R` | ganti jenis umpan aktif |
| `F` | ganti drag reel: Longgar / Seimbang / Kencang |
| `T` | ganti rod action: Light / Medium / Heavy |
| `Y` | ganti ukuran kail: Kecil / Sedang / Besar |
| `Enter` | chat sama pemain lain |
| `J` | catatan tangkapan |
| `B` | papan komunitas |
| `-` / `=` | zoom keluar / masuk |
| `H` | bantuan |
| `M` | suara on/off |

Ukuran layar nyesuaiin sendiri: skalanya selalu bilangan bulat (biar pixel
tetap kotak), dan resolusi internalnya yang dilebarin buat nutup jendela —
jadi ga ada bar hitam di laptop ukuran apapun, dan ga ada pixel renyek di
layar yang pakai display scaling.

## Isinya

- **86 jenis ikan × 6 grade = 516 kombinasi tangkapan.** Grade-nya Biasa,
  Bagus, Langka, Epik, Legendaris, dan Mitos. Jenis dan peluangnya dipengaruhi
  jam, kedalaman, spot, distrik, dan musim.
- **7 spot mancing** dengan isi beda-beda: Dermaga Tua, Teluk Eceng
  (dangkal, ikan kecil rame), Tanjung Batu (langsung dalam, ikan besar),
  Muara Sungai, Sungai Bening, Rawa Teduh, dan Lubuk Dalam.
- **4 area utama** dalam satu peta: desa pastoral sebagai hub, Benteng Lama
  (abad pertengahan), Dermaga Neon (cyberpunk), dan Rimbun Cahaya (fantasi).
  Tiap distrik genre punya warna, kabut, ikan, musik, dan gaya bicara sendiri.
- **Dua kampung tambahan** di timur dan selatan, sekarang sudah tersambung ke
  jaringan jalan dan punya warga yang berkegiatan di luar rumah.
- **Jalan utama dan jalur cabang** nyambungin area-area penting, lengkap sama
  tetenger, pos terbengkalai, dan barisan tiang listrik.
- **16 catatan sejarah** tersebar di prasasti, terminal, batu bertulis, dan
  papan. Dibaca pakai `E`; sebagian catatannya sengaja saling bertentangan.
- **23 warga outdoor** yang jalan, bekerja, ngobrol, dan punya watak masing-masing.
- **Papan komunitas** (`B`) — papan peringkat serumah: siapa dapat berapa
  jenis, rekor terbesar siapa, siapa lagi online.
- **Catatan tangkapan** (`J`) dipaging buat roster 86 spesies dan menyimpan
  hasil tangkapan yang sudah ditemukan.
- **Tackle realistis tapi tetap santai.** Joran, senar, dan kail punya rating
  kekuatan serta kondisi. Overload yang dibiarkan bisa bikin joran patah,
  senar putus, atau kail melurus; satu koreksi salah cuma memunculkan warning.
- **Lokasi ikut membebani alat.** Teluk/Rawa punya cover tinggi, Tanjung Batu
  abrasif ke senar, Muara/Sungai punya arus, dan Lubuk Dalam memberi beban
  ekstra karena kedalaman. Kios pancing punya tab servis untuk balikin kondisi.
- **Ikan punya stamina.** Tekanan yang stabil bikin ikan lelah perlahan sehingga
  fight panjang justru makin tenang, bukan makin brutal.
- **Drag reel realistis.** Longgar lebih aman tapi ikan bisa mengambil senar;
  Kencang lebih cepat menahan ikan tapi memindahkan lebih banyak shock ke alat.
- **Cover bisa benar-benar nyangkut.** Kalau tertinggal dari ikan di eceng/akar,
  snag akan naik; tekanan sedang dan tracking yang rapi bisa membebaskannya.
- **Karakter mulut ikan.** Ikan kecil tertentu bermulut lunak dan bisa sobek kalau
  dipaksa; ikan kuat bermulut keras lebih butuh hook-set yang bersih.
- **Rod action punya kompromi.** Light lebih responsif/fleksibel dan ramah mulut
  lunak; Heavy menahan beban lebih besar dan menancapkan kail lebih tegas ke
  mulut keras, tapi lebih kasar dan sedikit lambat dikoreksi.
- **Elastisitas senar nyata.** Nilon menyimpan shock lalu melepasnya pelan,
  kepang lebih direct, dan Senar Danau ada di tengah; stretch melindungi hook
  tapi sedikit mengurangi transfer reel.
- **Ukuran kail ikut memilih target.** Kail kecil lebih cocok ikan kecil,
  kail besar lebih cocok ikan besar dan kuat; salah ukuran menurunkan peluang
  bite/hook security tetapi tidak pernah mengunci spesies total.
- **Escape phase per perilaku.** Ikan lari bisa first/second run, penyelam bisa
  dive kedua, ikan pengendap bisa memberi sentakan terakhir dekat landing.
- **Line-out & spool capacity.** Drag yang slip dan ikan yang lari benar-benar
  mengambil senar; tiap tipe senar punya kapasitas relatif, dan membiarkan ikan
  sampai ujung reel bisa mengakhiri fight.
- **Respons escape berbeda.** Jump/headshake/rolling lebih aman jika tekanan
  diturunkan, dive jangan sampai slack, sedangkan run harus dibiarkan lewat drag
  sambil perlahan mengambil kembali line.
- **Shore landing.** Progress penuh belum langsung jadi tangkapan: ikan harus
  dibawa dekat tepi, line dipulihkan, lalu tekanan stabil sebentar untuk serok.
  Mengangkat terlalu keras dekat tepian bisa merusak hook hold.
- **Cuaca benar-benar masuk ke mancing.** Hujan yang terlihat di world
  mempercepat aktivitas ikan secara ringan, mengubah komposisi bite, menaikkan
  arus terutama di sungai/muara, dan membuat air lebih keruh. Spot tenang tidak
  mendadak berubah jadi sungai hanya karena hujan.
- **Cast lane punya reward dan risiko.** Lemparan bisa jatuh di air terbuka,
  tepi cover, jalur arus, atau drop-off dalam. Tepi cover/jalur arus cenderung
  lebih cepat menghasilkan aktivitas tetapi menambah pressure setempat;
  drop-off sedikit membantu peluang grade tanpa menjadikan cast jauh selalu
  pilihan terbaik.
- **Kebun bareng.** Petak-petaknya milik room, bukan milik orang. Tanaman
  temen bisa kamu siram, dan tumbuh terus walau kamu lagi ga main.
- **Siklus hari 20 menit.** Server yang pegang jamnya, jadi semua orang di
  room lihat senja yang sama persis.
- **Cuaca.** Hujan datang sendiri, nyiram semua tanaman gratis, dan bikin
  ikan lebih susah keliatan.
- **Empat musim.** Musim mengubah dedaunan, temperatur cahaya, partikel udara,
  pakaian warga, dan aktivitas ikan.

## Warga desa

Warga di sini ga punya naskah tetap. Tiap orang punya:

- **Watak** — enam sumbu: ramah, blak-blakan, humor, hitungan, percaya
  cerita lama, cerewet.
- **Mood harian** — diundi ulang tiap hari dari watak + tanggal.
- **Ingatan** — enam slot. Mereka bisa ingat pertama kali ketemu, rekor ikan
  yang mereka lihat kamu tarik, ikan langka, janjian, dan kalau kamu lama
  ga muncul.

Kalimat dirakit saat mereka ngomong dari watak + mood + ingatan + keadaan
sekarang. Tiap topik punya kantong kalimat yang diacak, jadi satu kalimat ga
akan keluar lagi sebelum isi kantongnya terpakai.

## Catatan teknis

Mayoritas sprite runtime digambar sebagai data lalu dipanggang jadi texture
atlas saat boot (`src/client/art/`). Pohon, semak, batu, rumput, dan petak
kebun di-generate dari seed. Palet utama dikunci di 48 warna supaya semua
area tetap terasa berasal dari dunia yang sama.

File PNG di `public/art/portraits/` adalah aset authoring/template potret,
bukan pengganti sistem atlas runtime.

Langit dan air satu shader (`world/skywater.ts`). Airnya mengambil warna
langit pada koordinat cermin yang bergoyang, jadi matahari terbenam otomatis
terpantul di danau.

Suara di-sintesis saat jalan pakai WebAudio. Musiknya generatif dan berubah
mengikuti area; volumenya juga turun sebentar waktu ikan nyantol.

### Struktur

```text
src/
  shared/      protokol + konstanta yang dipakai client dan server
  server/      server room, profile, static production server
  client/
    engine/    WebGL2, sprite batcher, input
    art/       palet, kanvas indexed-color, generator sprite, atlas
    world/     peta, pencahayaan, shader langit+air, post-process
    render/    lapisan gambar, scene, partikel
    game/      pemain, mancing, kebun, NPC, dialog, lore, musik, UI, jaringan
```

### Skrip

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | client Vite + server room |
| `npm run lan` | sama, tapi client kebuka buat jaringan lokal |
| `npm run build` | typecheck lalu build produksi |
| `npm run typecheck` | typecheck doang |
| `npm run serve` | build lalu jalankan server produksi satu proses |
| `npm run fight` | simulasi headless sistem fight ikan |
| `node scripts/smoke.mjs` | boot game di headless Chromium, gagal kalau ada error runtime |

### Verifikasi waktu development

Halaman menyediakan beberapa hook di `window` buat ngetes game dari console:
`__step(n)` maju simulasi, `__snap(waktu, langkah)` menghasilkan satu frame,
`__dbg()` membaca state, `__tp(tx, ty)` teleport pemain, dan `__catch(...)`
bisa dipakai untuk memaksa tangkapan saat menguji grade/journal.

## Ikut bangun

- [CONTRIBUTING.md](CONTRIBUTING.md) — cara jalanin, gaya kode, resep nambah ikan/warga/distrik
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — peta kode
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

Ga bisa ngoding tapi ngerti pixel art? Tetap kepake — buka issue label
`art-direction`, tunjukin yang jelek di mana dan kenapa.

## Lisensi

[MIT](LICENSE).

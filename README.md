# Senja

Game mancing santai buat dimainin bareng. Satu danau, satu desa, dan
beberapa distrik yang genrenya beda-beda. Buat orang yang baru pulang kerja.

[![CI](https://github.com/mancing-senja/senja/actions/workflows/ci.yml/badge.svg)](https://github.com/mancing-senja/senja/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Ga ada file gambar di repo ini.** Semua art di-generate lewat kode saat
> boot, dari satu palet 48 warna. Musiknya juga disintesis. Baca
> [CONTRIBUTING.md](CONTRIBUTING.md) sebelum ngoding.

## Jalanin

```bash
npm install
```

```bash
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

### Beda jaringan

Butuh tunnel. Yang paling gampang, ga perlu daftar akun:

```bash
npx cloudflared tunnel --url http://localhost:5173
```

Dia bakal ngasih URL `https://xxx.trycloudflare.com`. Kirim ke temen, lengkap
sama `#kode-room`-nya.

**Cukup satu tunnel ke port 5173 doang.** Socket room-nya di-proxy lewat
`/room` di origin yang sama, jadi ga usah nge-expose port 8787 terpisah —
dan itu penting, karena kebanyakan tunnel instan ga mau nerusin WebSocket
kalau portnya beda.

> Tunnel ini bikin game lu **bisa diakses siapa pun yang punya linknya**
> selama tunnelnya nyala. Matiin (Ctrl+C) kalau udah selesai.

### Deploy beneran

Kalau mau nyalain terus, server room-nya butuh reverse proxy yang nerusin
`/room` ke port 8787 dengan upgrade WebSocket. Contoh Caddy:

```
senja.example.com {
    reverse_proxy /room* localhost:8787
    reverse_proxy localhost:5173
}
```

## Kontrol

| Tombol | Fungsi |
| --- | --- |
| `WASD` / panah | jalan |
| `spasi` | lempar kail (tahan buat ngatur jauhnya), tarik pas nyantol, tahan buat gulung |
| `E` | cangkul, tanam, siram, panen, jual, ngobrol sama warga |
| `Q` | ganti bibit |
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

- **32 jenis ikan.** Yang naik tergantung jam, seberapa jauh kail dilempar,
  **spot**-nya, dan **distrik**-nya.
- **7 spot mancing** dengan isi beda-beda: Dermaga Tua, Teluk Eceng
  (dangkal, ikan kecil rame), Tanjung Batu (langsung dalam, ikan besar),
  Muara Sungai, Sungai Bening, Rawa Teduh (gelap, gabus & lele & ikan
  hantu), dan Lubuk Dalam (paling langka).
- **4 distrik bergenre** dalam satu peta: desa pastoral di tengah, Benteng
  Lama (abad pertengahan) di barat, Dermaga Neon (cyberpunk) di timur, dan
  Rimbun Cahaya (fantasi) di selatan. Tiap distrik punya warna, kabut, ikan,
  musik, dan gaya bicara warganya sendiri.
- **Jalan utama** nyambungin semuanya, lengkap sama tetenger, pos
  terbengkalai, dan barisan tiang listrik.
- **16 catatan sejarah** tersebar di prasasti, terminal, dan batu bertulis.
  Dibaca pakai `E`. Isinya satu sejarah yang nyambung, sebagian saling
  bertentangan.
- **Desa** dengan rumah-rumah, sumur, warung, papan komunitas, dan
  **19 warga** yang jalan-jalan sendiri.
- **Papan komunitas** (`B`) — papan peringkat serumah: siapa dapat berapa
  jenis, rekor terbesar siapa, siapa lagi online.
- **Catatan tangkapan** (`J`) — 32 slot, kebuka satu-satu.
- **Kebun bareng.** Petak-petaknya milik room, bukan milik orang. Tanaman
  temen bisa kamu siram, dan tumbuh terus walau kamu lagi ga main.
- **Siklus hari 20 menit.** Server yang pegang jamnya, jadi semua orang di
  room lihat senja yang sama persis.
- **Cuaca.** Hujan datang sendiri, nyiram semua tanaman gratis, dan bikin
  ikan lebih susah keliatan.

## Warga desa

Warga di sini ga punya naskah. Tiap orang punya:

- **Watak** — enam sumbu: ramah, blak-blakan, humor, hitungan, percaya
  cerita lama, cerewet. Mbah Tarno pendiam dan percaya takhayul; Bagas
  hitungan dan banyak omong. Watak ini yang nentuin mereka lebih sering
  ngomongin apa.
- **Mood harian** — diundi ulang tiap hari dari watak + tanggal. Orang yang
  sama bisa hangat hari ini dan males ngomong besok.
- **Ingatan** — enam slot doang, dan yang paling ga penting kebuang duluan.
  Yang disimpan: pertama kali ketemu kamu, rekor ikan terbesar yang mereka
  **lihat** kamu tarik (harus dekat — ga bisa pamer ke orang yang ga di
  sana), ikan langka, janjian, dan kalau kamu ilang berhari-hari.

Kalimatnya dirakit pas mereka ngomong, dari watak + mood + ingatan +
keadaan sekarang (jam, hujan, kamu lagi berdiri di spot mana, ikan terakhir
kamu apa). Tiap topik punya kantong kalimat yang diacak — satu kalimat ga
akan keluar lagi sebelum semua kalimat di topik itu kepakai. Ingatannya
disimpan di browser, jadi balik seminggu lagi mereka masih kenal kamu, dan
malah negur "kemana aja".

## Catatan teknis

Ga ada satupun file gambar atau suara di repo ini.

Semua sprite digambar sebagai data lalu dipanggang jadi satu texture atlas
pas booting (`src/client/art/`). Pohon, semak, batu, rumput, dan petak kebun
di-generate dari seed — jadi ga ada dua pohon yang sama persis, dan ga ada
pola ubin yang keliatan berulang. Palet dikunci di 48 warna
(`art/palette.ts`) supaya yang digambar tangan dan yang di-generate keliatan
dari tangan yang sama. 32 indeks pertama itu inti pastoral; 16 sisanya buat
distrik bergenre (batu & panji, neon, arkana).

Langit dan air satu shader (`world/skywater.ts`). Airnya harfiah langit yang
disampel di koordinat cermin yang bergoyang — makanya matahari terbenam
otomatis jatuh ke danau, dan pantulannya selalu cocok sama langit di atasnya.

Suara di-sintesis pas jalan pakai WebAudio. Ambient (`game/audio.ts`): bed
air, angin, jangkrik malam, burung siang. Musiknya (`game/music.ts`) band
generatif — pad nahan akor, bass di root, melodi diundi ulang tiap bar
terhadap akor yang lagi jalan, perkusi sikat. Empat mood ikut distrik, dan
musiknya nunduk sebentar pas ikan nyantol.

### Struktur

```
src/
  shared/      protokol + konstanta yang dipakai client dan server
  server/      server room: jam, cuaca, petak kebun, chat
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
| `npm run dev` | client + server room |
| `npm run lan` | sama, tapi client-nya kebuka buat jaringan lokal |
| `npm run build` | typecheck lalu build produksi |
| `npm run typecheck` | typecheck doang |
| `node scripts/smoke.mjs` | boot game di headless Chromium, gagal kalau ada error runtime |

### Verifikasi waktu development

Halaman ini nyediain beberapa hook di `window` buat ngedrive game dari
console tanpa tangan di keyboard: `__step(n)` maju simulasi tanpa gambar,
`__snap(waktu, langkah)` balikin PNG data URL satu frame, `__dbg()` balikin
state, dan `__tp(tx, ty)` mindahin pemain. Frame yang di-capture bisa
dilempar ke `POST /__shot` buat disimpen ke `.shots/` (plugin Vite, cuma
aktif waktu dev).


## Ikut bangun

- [CONTRIBUTING.md](CONTRIBUTING.md) — cara jalanin, gaya kode, resep nambah ikan/warga/distrik
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — peta kode
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

Ga bisa ngoding tapi ngerti pixel art? Tetap kepake — buka issue label
`art-direction`, tunjukin yang jelek di mana dan kenapa.

## Lisensi

[MIT](LICENSE).

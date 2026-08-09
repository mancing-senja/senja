# Ide issue buat yang baru gabung

Daftar ini buat maintainer: bikin issue dari sini pas repo sudah publik,
kasih label `good first issue`. Tiap butir sudah diusahakan cukup jelas
buat dikerjain tanpa perlu nanya-nanya dulu.

## Gampang, hasilnya kelihatan

1. **Tambah 3 jenis ikan baru.** `FISH_LOOKS` di `art/props.ts` + `SPECIES`
   di `game/fishing.ts`. Sprite dan slot catatan tangkapan ke-generate
   sendiri. Label: `good first issue`.

2. **Tambah tanaman kebun.** Sekarang cuma tomat, labu, terong, jagung.
   `CROP_LOOKS` di `art/props.ts` + `CROP_INFO` di `game/farm.ts`.

3. **Perbanyak kalimat warga.** `game/registers.ts`. Tiap topik yang
   kalimatnya cuma 3–4 bakal kerasa cepet berulang. Nambah ke kolam yang
   sudah ada ga perlu nyentuh kode lain sama sekali.

4. **Tulis catatan sejarah baru.** `game/lore.ts`. Bikin yang ninggalin
   pertanyaan, bukan yang menjelaskan. Boleh bertentangan sama catatan lain.

## Sedang

5. **Warung desa belum bisa jual-beli.** Sekarang cuma properti. Bikin
   jualan joran (ngurangin waktu nunggu) dan umpan (naikin peluang ikan
   langka buat beberapa lemparan). Lihat pola `Farm.apply()` di
   `game/farm.ts`.

6. **Halaman benteng masih terlalu kosong.** Tambah kandang kuda, reruntuhan
   kapel, tangga ke atas tembok. Generator batu sudah ada di `art/keep.ts`
   dan `art/genre.ts` — ikutin bahasa visualnya.

7. **Blok cyberpunk numpuk jadi tembok gelap.** Atur ulang jarak dan
   ketinggiannya di `buildQuay()` (`world/map.ts`) biar ada gang yang
   kelihatan dan siluet langitnya naik-turun.

8. **Animasi NPC masih sedikit.** Sekarang cuma jalan, diam (napas + kedip),
   dan pose mancing. Bikin animasi `tend` beneran buat yang berkebun
   (gerakan cangkul/nyiram 2 frame). Lihat `art/character.ts`.

## Susah

9. **Tepi air masih tangga kotak** (issue #18 di daftar tugas). Kolam roh
   dan rawa outline-nya ngikutin grid 16px, jadi elips kelihatan
   berundak. Perlu tile tepi isi-sebagian: panggang set mask (sudut, lurus,
   takik), terus pilih per tile dari pola tetangganya, kayak autotiler.

10. **Potret karakter belum kepasang.** `art/portrait.ts` sudah ada dan
    jalan, tapi belum dipanggil dari mana pun. Perlu didaftarin ke atlas,
    terus panel dialog diganti dari gelembung kecil jadi panel dengan
    potret di sebelah teksnya.

11. **Genre kelima.** Buktiin sistem distriknya bener: tambah satu entri di
    `world/districts.ts` plus generator art-nya, tanpa nyentuh renderer,
    roll ikan, atau sistem dialog. Kalau butuh ngubah salah satunya, berarti
    ada abstraksi yang bocor — laporin.

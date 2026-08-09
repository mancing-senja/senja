# Arsitektur Senja

Peta kode buat orang yang baru masuk. Fokus ke **kenapa** tiap bagian ada,
bukan cuma daftar file.

## Prinsip yang ngikat semuanya

1. **Ga ada aset di disk.** Semua gambar di-generate saat boot. Konsekuensinya
   kelihatan di mana-mana: variasi datang dari seed, bukan dari file; repo
   tetap kecil; dan nambah art artinya nulis fungsi.
2. **Satu palet, 48 warna.** Semua pixel di game wajib salah satu dari
   `PALETTE`. Ini yang bikin art buatan sepuluh orang tetap nyatu.
3. **Peta di-generate identik di semua klien.** Server ga pernah kirim
   medan — cuma kirim yang berubah (pemain, tanaman, cuaca, papan).
4. **Data, bukan cabang kode.** Distrik, ikan, warga, catatan sejarah —
   semuanya tabel data. Nambah genre kelima harusnya ga nyentuh renderer.

## Alur boot

```
main.ts
  └─ buildAtlas()          semua generator art jalan sekali, hasilnya
     │                     ditempel ke satu canvas 1024², jadi 1 texture
     ├─ buildMap()         medan + prop + spot + distrik, dari 1 seed
     ├─ new Net()          nyambung ke server room (opsional; solo tetap jalan)
     └─ loop 60 fps
```

## Layer render (urutan tiap frame)

```
1. SkyWater      shader fullscreen  → langit, bukit, danau + pantulan
2. drawGround    tile              → rumput, tanah, batu, beton, kolam roh
3. drawReflections                 → benda yang berdiri di atas air
4. renderables   y-sorted          → prop, tanaman, NPC, pemain
5. drawLampLight additive          → lentera, obor, papan neon, jamur
6. drawNeonWash  additive          → neon meleleh di beton basah
7. particles                       → hujan, kunang-kunang, asap, burung
8. UI            kamera di 0,0     → HUD, panel, gelembung dialog
9. Post          shader fullscreen → bloom, vignette, grading malam
```

Kenapa langit dan air satu shader: airnya **secara harfiah** langit yang
disampling di koordinat cermin. Makanya matahari terbenam otomatis jatuh ke
danau, dan pantulannya ga pernah beda sama langit di atasnya.

## Sistem yang perlu dijelasin

### Ukuran layar (`engine/view.ts`)

Dua aturan yang saling tabrakan: pixel harus kotak (skala wajib bilangan
bulat) dan layar harus penuh (ga pernah kelipatan pas). Solusinya: **skala
yang dikunci, buffer yang melar**. Pilih skala bulat dulu, terus bikin
resolusi internal sebesar yang dibutuhkan buat nutup jendela di skala itu.

Skalanya dihitung di **device pixel**, bukan CSS pixel. Kalau ga, layar
dengan display scaling bakal nge-resample kedua kalinya secara pecahan dan
pixelnya jadi ga rata.

### Distrik (`world/districts.ts`)

Satu peta, empat estetika. Tiap distrik punya batas, tint, kabut, tabel
ikan, dan register dialog. Bobotnya di-*feather* di perbatasan biar
genrenya berbaur, bukan potongan tempel.

### Pikiran NPC (`game/dialogue.ts` + `registers.ts`)

NPC ga punya naskah. Tiap orang punya:

- **Watak** — 6 sumbu, nentuin topik yang lebih sering muncul
- **Mood harian** — diundi ulang dari id + tanggal, stabil dalam sehari
- **Ingatan** — 6 slot, yang paling ga penting kebuang duluan

Kalimatnya dirakit saat ngomong dari watak + mood + ingatan + keadaan dunia.
`registers.ts` nentuin *gaya bicaranya* per distrik. Tiap topik punya
kantong acak: satu kalimat ga keluar lagi sebelum semua kalimat di topik
itu kepakai.

### Musik (`game/music.ts`)

Band generatif: pad nahan akor, bass di root, melodi diundi ulang tiap bar
terhadap akor yang lagi jalan, perkusi sikat. Empat mood ikut distrik.
Dijadwalin ke `AudioContext.currentTime`, bukan ke frame — timing dari
`requestAnimationFrame` kedengeran tersendat.

## Alat bantu dev

Di console browser, saat dev:

| Fungsi | Gunanya |
| --- | --- |
| `__snap(time?, steps?)` | Render satu frame, balikin PNG data URL |
| `__step(n)` | Maju simulasi tanpa gambar (jauh lebih cepat) |
| `__tp(tx, ty)` | Pindahin pemain ke koordinat tile |
| `__dbg()` | State: mancing, koin, jaringan, posisi |
| `__map()` | Objek peta lengkap |
| `__plots()` | Petak kebun sekarang |

`POST /__shot` (cuma saat dev) nyimpen data URL ke `.shots/` — buat lihat
hasil render tanpa perlu screenshot manual.

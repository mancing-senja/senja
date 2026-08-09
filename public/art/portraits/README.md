# Potret gambar tangan

Taruh PNG di folder ini, daftarkan di `index.json`, dan game bakal pakai
gambar itu buat panel ngobrol — bukan yang di-generate kode.

Kalau folder ini kosong (atau `index.json` gak ada), game jalan persis
kayak sebelumnya. Gak ada request sama sekali. Jadi aman ditinggal
setengah jadi: karakter yang belum digambar pakai potret generated.

## Spesifikasi

| | |
|---|---|
| Ukuran | **48 × 64 piksel**, pas. Beda ukuran ditolak dan muncul warning di console. |
| Format | PNG, transparansi keras (alpha < 50% dianggap kosong — gak ada tepi lembut) |
| Warna | Bebas gambar, tapi masuknya di-*snap* ke 48 warna palet game |

Soal warna: game ini seluruhnya pakai satu palet 48 warna. Potret yang
warnanya di luar palet bakal kelihatan kayak foto ditempel di gambar.
Kalau butuh warna yang gak ada, tambahin ke palet (`src/client/art/palette.ts`),
jangan kecualiin satu sprite.

Buka `palette.png` di folder ini buat ambil warnanya pakai eyedropper.

## Posisi di kanvas

Potret berdiri di belakang kotak dialog: mukanya nongol di atas tepi kotak,
badannya masuk ke bawah. Jadi:

- **Baris 4–32** — kepala. Ini yang selalu kelihatan. Kerjain paling serius di sini.
- **Baris 33–40** — leher.
- **Baris 40–64** — dada dan bahu. Ketutup kotak dialog. Cukup diisi, gak usah detail.

File `template/` isinya potret generated buat tiap karakter. Buka di
ibis Paint, kunci layernya, gambar di atasnya. Itu cara paling gampang
biar proporsinya nyambung sama sprite di dunia.

## Penamaan

| Nama file | Kena ke |
|---|---|
| `petani.png` | Semua ekspresi karakter `petani` |
| `petani_warm.png` | Cuma ekspresi ramah |
| `petani_cold.png` | Cuma ekspresi jutek |
| `petani_neutral.png` | Cuma ekspresi biasa |

Kalau cuma ada `petani.png`, ketiga ekspresi pakai gambar yang sama.
Mulai dari situ aja, ekspresinya nyusul.

Id karakter (dari `src/client/art/character.ts`):

`petani` · `nelayan` · `pedagang` · `pemuda` · `gadis` · `tetua` ·
`kurir` · `penjaga` · `peramu` · `anak` · `perantau` · `teknisi`

## index.json

```json
{
  "portraits": ["petani.png", "gadis_warm.png"]
}
```

Cuma nama file yang kedaftar yang dimuat. Nama harus huruf, angka,
`_`, `-`, dan berakhiran `.png`.

## Digambar di ibis Paint

1. Bikin kanvas **48 × 64**, latar transparan.
2. Import `template/<id>.png` sebagai layer paling bawah, turunin opacity-nya.
3. Matikan anti-alias di setting pena — pixel art gak boleh ada tepi lembut.
4. Gambar di layer baru di atasnya.
5. Export PNG. **Jangan** di-resize pas export.
6. Taruh di folder ini, tambahin namanya ke `index.json`.

Kalau 48 × 64 kekecilan buat digambar di HP: gambar di 480 × 640 (10×),
terus pas export pilih nearest-neighbour biar turun ke 48 × 64. Kalau
appnya gak punya opsi itu, gambar aja langsung di 48 × 64 sambil di-zoom.

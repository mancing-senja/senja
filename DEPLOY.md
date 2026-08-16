# Deploy

Yang dibutuhkan game ini dari sebuah host, satu baris: **satu proses yang
hidup terus, di satu port, yang bisa nahan WebSocket.**

Itu saja. Bukan serverless, bukan static-only. Alasannya di bawah.

> **Soal harga dan syarat free tier: cek sendiri di situsnya.** Ketentuan
> hosting berubah terus, dan dokumen ini nggak bisa dipercaya buat itu. Yang
> bisa dipercaya di sini cuma bagian teknisnya — bentuk host seperti apa yang
> cocok, dan apa yang rusak kalau nggak cocok.

---

## Kenapa static hosting nggak cukup

`vercel.json` ada di repo dan dia **sah** — tapi yang dia deploy cuma client.

Sudah diuji langsung:

| Kondisi | Halaman | `/room` | Status |
|---|---|---|---|
| Server Node jalan | 200 | socket ✓ | `net: online`, pemain saling lihat |
| Host statis saja | 200 | **404** | `net: offline`, sendirian |

Client nyari socket di origin yang sama, path `/room`:

```
`${proto}//${location.host}/room`
```

Kalau nggak ada yang jawab di situ, dia jatuh ke offline — mancing dan
berkebun tetap jalan, cuma nggak ada orang lain. Jadi Vercel = **preview
single-player**, bukan deploy multiplayer.

Serverless juga nggak bisa: fungsi itu request-response dan ada timeout,
sementara `src/server/index.ts` harus tetap hidup untuk memegang jam dunia,
daftar room, chat, dan petak kebun.

---

## Bentuk host yang cocok

Cari yang bisa **baca `Dockerfile`** dan **menjaga satu proses tetap hidup**.
Yang perlu diperhatikan cuma dua hal:

### 1. Tidur (sleep / scale-to-zero)

Banyak paket gratis mematikan proses setelah beberapa menit tanpa
pengunjung. Untuk game ini efeknya spesifik: **jam dunia berhenti**, dan
semua yang tersambung terputus.

Tapi bukan bencana. Client sudah punya:

- reconnect dengan backoff, dicap di 12 detik
- jam yang **di-ease** ke jam server (`dt * 3`), termasuk penanganan lewat
  tengah malam — jadi begitu server bangun, langitnya merayap balik ke posisi
  benar, tidak menyentak

Jadi host yang tidur tetap bisa dipakai buat main bareng teman. Yang pertama
buka nunggu ~30–60 detik, sisanya normal. Untuk dipakai orang asing kapan
saja, tidur itu masalah nyata.

Kalau host-nya punya opsi "jangan tidur", nyalakan. Di `fly.toml` itu sudah
diset:

```toml
auto_stop_machines = false
min_machines_running = 1
```

### 2. Disk permanen

Profil pemain (`players.json`) butuh disk yang tidak hilang. Kalau host-nya
tidak punya, **tidak apa-apa** — sudah diuji: server mulai kosong, tetap
jalan, tetap menerima join, dan tidak mati saat gagal menulis. Yang hilang
hanya koin dan catatan tangkapan setiap restart.

Kalau host-nya punya volume, arahkan `SENJA_DATA` ke sana.

---

## Variabel lingkungan

| Nama | Perlu? | Catatan |
|---|---|---|
| `PORT` | biasanya diisi host | Server baca `SENJA_PORT ?? PORT ?? 8787`. Sebagian besar host menyuntik `PORT` sendiri, jadi tidak perlu diapa-apakan. |
| `SENJA_DATA` | opsional | Path file profil. Default `data/players.json` relatif ke cwd. Arahkan ke volume kalau ada. |

Tidak ada secret, tidak ada API key, tidak ada database. Tidak ada yang perlu
dirahasiakan.

---

## Fly.io

`fly.toml` sudah disetel untuk ini: region **Singapura** (terdekat dari
Indonesia), volume untuk profil, dan mesin yang tidak pernah tidur.

```bash
fly launch --no-deploy
```

```bash
fly volumes create senja_data --size 1 --region sin
```

```bash
fly deploy
```

`fly launch` akan mengisi `app = ""` dengan nama yang benar-benar tersedia.

---

## Host lain yang membaca Dockerfile

Alurnya sama di mana-mana: hubungkan repo GitHub, host mendeteksi
`Dockerfile`, build, jalankan. Tidak perlu memasang CLI apa pun.

`Dockerfile` sudah diperiksa terhadap kebutuhan build sebenarnya:

- server hanya mengimpor `node:*` dan `ws`; `ws` ada di dependencies
- `npm run start` butuh `tsx`; `tsx` ada di dependencies
- `dist/` disalin utuh, termasuk `art/portraits`
- `SENJA_DATA` dan `PORT` dibaca dan konsisten dengan `internal_port`

Yang **belum** pernah diverifikasi: apakah image-nya benar-benar ter-build.
Docker tidak terpasang di mesin tempat ini ditulis. Kalau build pertama
gagal, lognya yang jadi petunjuk.

---

## Setelah live, uji ini

Semua tes multiplayer sebelum deploy dilakukan dengan **dua tab di satu
mesin** — latensi nol, satu NAT, tanpa TLS. Yang berikut ini baru bisa
dibuktikan setelah ada URL publik:

- [ ] handshake `wss://` lewat TLS host (bukan `ws://` localhost)
- [ ] dua client dari **jaringan berbeda** saling melihat
- [ ] jam dunia tetap sinkron saat latensi bergoyang
- [ ] reconnect setelah koneksi benar-benar putus
- [ ] cap payload / room / koneksi di mesin sungguhan (lihat PR #27)

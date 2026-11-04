# ARUSKAS — Personal Finance Management

ARUSKAS adalah aplikasi pencatatan keuangan pribadi berbasis web yang dapat dipasang sebagai PWA. Website dan Telegram Bot menggunakan satu backend dan satu database sehingga transaksi dari kedua kanal akan tersinkronisasi.

**Teknologi:** HTML, CSS, JavaScript Vanilla, GitHub Pages, Cloudflare Workers, Cloudflare D1, Cloudflare R2, Telegram Bot API.

> **Penting:** Project ini sudah berisi source code frontend, backend, skema database, webhook Telegram, dan panduan deployment. Project belum otomatis aktif hanya karena file diunggah ke GitHub. Kamu tetap harus membuat resource Cloudflare, mengisi ID database, memasukkan secret, mengatur URL API, dan memasang webhook Telegram. Jangan pernah memasukkan token Telegram atau secret Cloudflare ke file frontend atau repository.

## 1. Arsitektur

```text
Browser HP / Laptop
       |
       | HTTPS (Bearer session token)
       v
GitHub Pages — HTML/CSS/JavaScript PWA
       |
       | HTTPS API + CORS
       v
Cloudflare Worker — API, autentikasi, validasi, Telegram webhook
       |                                  ^
       |                                  | Telegram Bot API
       v                                  |
Cloudflare D1 — akun, kategori, transaksi, user, sesi, pairing
       |
       +---- Cloudflare R2 — foto bukti privat

Telegram User <----> Telegram Bot <---- webhook ----> Cloudflare Worker
```

- GitHub Pages hanya menyajikan file website statis.
- Worker menjalankan seluruh aturan bisnis dan autentikasi.
- D1 menyimpan data terstruktur.
- R2 menyimpan foto bukti secara privat. Foto tidak mempunyai URL publik.
- Telegram tidak mengakses D1 secara langsung; semua perintah diproses Worker.

## 2. Fitur yang tersedia

### Akun dan keamanan
- Registrasi username dan password.
- Browser menurunkan password dengan PBKDF2-HMAC-SHA-256 (600.000 iterasi) dan salt acak. Password asli tidak dikirim ke Worker; Worker menyimpan HMAC-SHA-256 dari hasil derivasi menggunakan secret `AUTH_PEPPER` yang tidak berada di database.
- Login, logout, sesi 12 jam atau 30 hari.
- Delapan recovery code sekali pakai ditampilkan saat registrasi; database hanya menyimpan hash-nya.
- Pembatasan percobaan login per username.
- Profil, username, mata uang, zona waktu, foto profil, dan ganti password.
- Semua endpoint data memverifikasi sesi dan membatasi query berdasarkan user ID.

### Keuangan
- Saldo awal beberapa akun: Tunai, Rekening Bank, E-Wallet, dan akun tambahan.
- Pemasukan dan pengeluaran dengan kategori, akun, tanggal, jam, penerima/sumber, keterangan, catatan, serta foto opsional.
- Nominal transaksi disimpan sebagai bilangan bulat; mata uang awal adalah IDR.
- Edit, hapus (soft delete), riwayat, pencarian, filter, dan pagination.
- Nomor struk unik dan tampilan struk yang dapat dicetak atau disimpan sebagai PDF melalui fitur cetak browser.
- Dashboard, grafik arus kas, kategori pengeluaran, ringkasan periode, dan laporan.
- Export CSV, Excel XLSX, PDF melalui cetak browser, serta backup JSON. Rincian laporan dibatasi 1.000 transaksi per permintaan; jika lebih, persempit periode sebelum ekspor.
- Import backup menambahkan data per 90 transaksi; tidak menghapus transaksi lama dan transaksi yang sudah pernah diimpor akan dilewati. Maksimal 10.000 transaksi per file backup.

### Telegram
- `/start`, `/menu`, `/masuk`, `/keluar`, `/saldo`, `/riwayat`, `/laporan`, `/batal`, `/hubungkan`, `/bantuan`.
- Laporan Telegram dapat dipilih untuk hari ini, minggu ini, bulan ini, bulan sebelumnya, tahun ini, atau rentang tanggal khusus. Riwayat menyediakan tombol untuk membuka detail transaksi.
- Menu inline keyboard.
- Input bertahap dengan konfirmasi sebelum menyimpan.
- Input cepat seperti `/keluar 25000 Makanan Beli sarapan`.
- Foto dapat dikirim saat proses input atau dengan caption perintah, misalnya `/keluar 25000 Makanan Beli sarapan`.
- Kalimat sederhana seperti `Pengeluaran 20 ribu untuk beli kopi` atau `Menerima 500 ribu dari gaji` dikenali secara terbatas dan selalu meminta konfirmasi sebelum disimpan.
- Bot hanya menerima transaksi dari chat Telegram pribadi (private chat), bukan grup.
- Pairing kode sekali pakai yang berlaku 5 menit.
- Webhook memverifikasi `X-Telegram-Bot-Api-Secret-Token`.
- Pengingat harian, mingguan, dan bulanan melalui Telegram jika pengguna mengaktifkannya dan akun Telegram sudah terhubung.

### PWA
- Manifest, ikon, service worker, dan tampilan responsif.
- Shell aplikasi dapat dibuka dari cache setelah pernah dimuat.
- API dan data pribadi **tidak** disimpan di cache offline. Pencatatan transaksi tetap memerlukan koneksi internet.
- PWA bukan APK Android native. Browser yang mendukung akan menampilkan tombol Install; pada iPhone/iPad gunakan Safari → Share → Add to Home Screen / Tambahkan ke Layar Utama.

## 3. Struktur project

```text
ARUSKAS/
├── index.html
├── manifest.webmanifest
├── sw.js
├── README.md
├── .gitignore
├── assets/
│   ├── css/style.css
│   ├── js/
│   │   ├── config.js
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── app.js
│   │   ├── dashboard.js
│   │   ├── transactions.js
│   │   ├── reports.js
│   │   ├── settings.js
│   │   └── telegram.js
│   └── icons/icon.svg
└── worker/
    ├── index.js
    ├── wrangler.toml
    ├── schema.sql
    ├── package.json
    ├── migrations/0001_init.sql
    └── tests/smoke-test.mjs
```

## 4. Persiapan

Yang perlu disiapkan:
1. Akun GitHub.
2. Akun Cloudflare.
3. Akun Telegram.
4. Komputer Windows/macOS/Linux untuk deployment CLI (opsional; dashboard Cloudflare juga dapat digunakan untuk beberapa langkah).
5. Node.js versi LTS dan terminal jika ingin memakai Wrangler CLI.

Tidak ada paket frontend yang perlu di-build. Chart.js, SheetJS, dan Lucide dimuat dari CDN saat halaman dibuka. Karena itu, grafik dan export XLSX memerlukan koneksi internet dan akses ke CDN tersebut.

### Tes lokal backend sebelum deploy (opsional, disarankan)

Gunakan Node.js 22 atau lebih baru. Dari terminal:

```bash
cd worker
npm run test:smoke
```

Tes ini menjalankan Worker dengan adapter SQLite lokal dan R2 tiruan untuk memeriksa autentikasi, isolasi dua pengguna, transaksi, saldo, laporan, upload file, backup, recovery code, dan pairing code. Tes ini **bukan** pengganti pengujian deployment nyata di Cloudflare; pengiriman Telegram sungguhan tetap harus diuji setelah token dan webhook milikmu dipasang.

## 5. Buat repository GitHub

1. Login ke [GitHub](https://github.com/).
2. Klik tombol **New repository**.
3. Isi nama repository: `aruskas`.
4. Untuk GitHub Free, pilih repository **Public** agar GitHub Pages tersedia.
5. Klik **Create repository**.
6. Ekstrak ZIP project ARUSKAS di komputer.
7. Unggah **isi folder ARUSKAS**, bukan folder pembungkus ZIP, ke root repository. Pastikan `index.html` berada langsung di root.
8. Buka repository → **Settings** → **Pages**.
9. Pada **Build and deployment**, pilih **Deploy from a branch**.
10. Pilih branch `main` dan folder `/(root)`, lalu klik **Save**.
11. Tunggu proses publikasi. Alamat website berbentuk `https://USERNAME.github.io/aruskas/`.

GitHub Pages hanya meng-host frontend. Jangan pernah mengunggah file secret, token bot, file `.dev.vars`, atau password ke repository.

## 6. Buat Cloudflare D1

### Cara melalui Dashboard
1. Login ke [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Pilih **Storage & databases** → **D1 SQL Database** (nama menu dapat berubah).
3. Klik **Create database**.
4. Beri nama `aruskas-db`.
5. Setelah dibuat, buka database tersebut dan salin **Database ID**.
6. Buka tab **Console** pada database.
7. Buka file `worker/migrations/0001_init.sql` di komputer.
8. Salin seluruh isinya, tempel ke Console D1, lalu jalankan.
9. Pastikan tabel seperti `users`, `accounts`, `categories`, `transactions`, dan `telegram_links` muncul.

### Cara melalui Wrangler CLI
Jalankan dari root folder project (folder yang berisi `index.html`, bukan folder `worker`):

```bash
npx wrangler@latest login
npx wrangler@latest d1 create aruskas-db
```

Simpan `database_id` yang ditampilkan. Setelah itu buka `worker/wrangler.toml` dan ganti nilai `GANTI_DENGAN_ID_D1_MILIKMU` dengan ID asli dari Cloudflare.

Kemudian masuk ke folder Worker dan jalankan migration:

```bash
cd worker
npx wrangler@latest d1 execute aruskas-db --remote --file=./migrations/0001_init.sql
```

Jangan jalankan migration berulang-ulang jika tabel sudah dibuat, kecuali kamu memang sedang menjalankan migration baru.

## 7. Buat Cloudflare R2

1. Di Cloudflare Dashboard, pilih **Storage & databases** → **R2 Object Storage**.
2. Buat bucket bernama `aruskas-files`.
3. Gunakan storage class **Standard**.
4. Jangan aktifkan public bucket atau public development URL. Foto bukti harus tetap privat.
5. Pastikan binding Worker bernama `BUCKET` mengarah ke bucket `aruskas-files`.

Dengan Wrangler CLI, jalankan dari root folder project:

```bash
npx wrangler@latest r2 bucket create aruskas-files
```

`worker/wrangler.toml` sudah berisi binding R2. Jika membuat bucket dengan nama berbeda, samakan `bucket_name` pada file tersebut.

## 8. Periksa konfigurasi Worker

Buka `worker/wrangler.toml`. Bagian pentingnya:

```toml
name = "aruskas-api"
main = "index.js"
compatibility_date = "2026-11-01"
workers_dev = true

[[d1_databases]]
binding = "DB"
database_name = "aruskas-db"
database_id = "GANTI_DENGAN_ID_D1_MILIKMU"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "aruskas-files"

[triggers]
crons = ["0 13 * * *"]

[vars]
ALLOWED_ORIGINS = "https://USERNAME.github.io,http://127.0.0.1:5500"
APP_NAME = "ARUSKAS"
```

Ganti:
- `GANTI_DENGAN_ID_D1_MILIKMU` dengan Database ID dari Cloudflare.
- `USERNAME` dengan username GitHub kamu. Isi origin saja, jangan masukkan `/aruskas/` karena CORS hanya memakai origin.
- Jika memakai custom domain, tambahkan origin custom domain dipisahkan koma.

**Binding harus persis:** D1 `DB`, R2 `BUCKET`. Nama binding tersebut dipakai oleh kode backend.

### Deploy Worker

Dari folder `worker`:

```bash
npx wrangler@latest deploy
```

Setelah selesai, Wrangler menampilkan URL Worker, misalnya `https://aruskas-api.NAMA-AKUN.workers.dev`. Simpan URL itu.

### Tambahkan secret

Masih dari folder `worker`, jalankan:

```bash
npx wrangler@latest secret put AUTH_PEPPER
npx wrangler@latest secret put TELEGRAM_BOT_TOKEN
npx wrangler@latest secret put TELEGRAM_WEBHOOK_SECRET
```

Masukkan pepper acak yang panjang (minimal 32 karakter) pada prompt pertama dan simpan salinan cadangannya secara aman. Jangan mengganti `AUTH_PEPPER` setelah pengguna mulai mendaftar; jika secret hilang, pengguna harus memulihkan akun dengan recovery code. Masukkan token bot pada prompt kedua. Untuk secret webhook, gunakan string acak panjang yang hanya berisi huruf, angka, `_`, atau `-`. Contoh pembuatan secret acak di PowerShell:

```powershell
-join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

Simpan nilai `TELEGRAM_WEBHOOK_SECRET` karena nilai yang sama dibutuhkan saat mendaftarkan webhook. Jangan menaruh nilai-nilai secret ini di GitHub, HTML, JavaScript frontend, atau screenshot publik.

Setelah mengubah `ALLOWED_ORIGINS` atau secret, deploy ulang:

```bash
npx wrangler@latest deploy
```

### Tes Worker

Buka URL berikut di browser:

```text
https://URL-WORKER-KAMU.workers.dev/api/health
```

Hasil yang benar adalah JSON dengan `ok: true` dan `service: "ARUSKAS API"`. Jika gagal, periksa binding D1/R2 dan deployment log.

## 9. Hubungkan frontend ke Worker

Buka file:

`assets/js/config.js`

Ganti URL contoh menjadi URL Worker kamu:

```javascript
window.ARUSKAS_CONFIG = {
  API_BASE_URL: 'https://aruskas-api.NAMA-AKUN.workers.dev'
};
```

Jangan menambahkan `/api` di akhir URL. Aplikasi akan menambahkan endpoint secara otomatis.

Setelah mengubah file, commit dan push ke repository GitHub. Tunggu GitHub Pages selesai memperbarui website.

### Tes lokal (opsional)

Dari root folder project:

```bash
python -m http.server 5500
```

Buka `http://127.0.0.1:5500`. Pastikan `http://127.0.0.1:5500` tercantum di `ALLOWED_ORIGINS` Worker. Untuk menghentikan server, tekan `Ctrl + C`.

## 10. Buat Telegram Bot

1. Buka Telegram dan cari akun resmi **@BotFather**.
2. Kirim `/newbot`.
3. Masukkan nama bot, misalnya `ARUSKAS Finance`.
4. Buat username bot yang diakhiri `bot`, misalnya `arus_kas_pribadi_bot`.
5. BotFather memberikan token. Salin token tersebut.
6. Simpan token ke Worker Secret `TELEGRAM_BOT_TOKEN` menggunakan langkah pada bagian 8.

### Daftarkan webhook Telegram

Webhook URL adalah:

`https://URL-WORKER-KAMU.workers.dev/telegram/webhook`

Di Windows PowerShell, jalankan script berikut. Masukkan token, secret webhook, dan URL Worker ketika diminta:

```powershell
$token = Read-Host "Token bot Telegram"
$secret = Read-Host "TELEGRAM_WEBHOOK_SECRET"
$worker = Read-Host "URL Worker, contoh https://aruskas-api.username.workers.dev"
$body = @{
  url = "$worker/telegram/webhook"
  secret_token = $secret
  allowed_updates = '["message","callback_query"]'
}
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -Body $body
```

Jika berhasil, Telegram mengembalikan `ok: true`. Periksa status webhook:

```powershell
$token = Read-Host "Token bot Telegram"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo"
```

Pastikan URL yang tampil sesuai URL Worker. Jika token pernah bocor, cabut dan buat token baru melalui BotFather, lalu perbarui Worker Secret.

## 11. Cara menghubungkan akun website dengan Telegram

1. Buka website ARUSKAS.
2. Buat akun atau login.
3. Buka menu **Integrasi Telegram**.
4. Klik **Buat kode pairing**.
5. Buka chat bot yang kamu buat di Telegram.
6. Kirim `/start` jika belum pernah memulai bot.
7. Kirim perintah yang ditampilkan website, misalnya `/hubungkan ARS-XXXXXXXXX`.
8. Jika berhasil, website akan menampilkan status **Akun Telegram sudah terhubung**.

Kode pairing berlaku 5 menit dan hanya dapat digunakan sekali. Username Telegram tidak dipakai sebagai identitas akun; backend mengikat akun berdasarkan `chat_id` yang telah diverifikasi dengan kode pairing.

## 12. Cara memakai aplikasi

### Website
- **Pemasukan:** pilih kategori, akun penerima, nominal, tanggal, jam, dan keterangan.
- **Pengeluaran:** pilih kategori, akun sumber, nominal, tanggal, jam, dan keterangan.
- **Foto:** opsional. Maksimal 5 MB per file; JPG, PNG, atau WEBP.
- **Struk:** buka menu Riwayat, klik ikon struk, lalu pilih Cetak / Simpan PDF.
- **Laporan:** pilih tanggal awal dan akhir, lalu klik Tampilkan. Unduh CSV atau Excel. PDF dibuat melalui dialog cetak browser; pilih **Save as PDF / Simpan sebagai PDF**.
- **Backup:** buka Laporan → Backup data. File JSON berisi akun, kategori, transaksi, dan preferensi, tetapi tidak menyertakan isi file foto R2. Impor memproses 90 transaksi per bagian dan dapat diulang jika koneksi terputus.
- **Impor:** pilih file backup JSON. Data lama tidak dihapus; transaksi yang sama dilewati agar tidak terduplikasi. Jika backup dipulihkan ke akun lain, nomor transaksi baru dibuat untuk menghindari benturan nomor unik.

### Telegram

```text
/menu
/masuk 500000 Gaji
/keluar 25000 Makanan Beli sarapan
/saldo
/riwayat
/laporan
/batal
/bantuan
```

Setelah `/laporan`, pilih periode dari tombol yang muncul atau masukkan tanggal mulai dan akhir. Kategori pada perintah singkat ditulis dengan kata awal nama kategori. Misalnya `Makanan` akan dicocokkan ke kategori `Makanan dan minuman`. Untuk kategori khusus dengan nama mirip, gunakan input bertahap melalui menu.

Untuk melampirkan foto dengan perintah cepat, kirim foto dengan caption seperti:

`/keluar 25000 Makanan Beli sarapan`

### Pengingat Telegram

1. Pastikan Telegram sudah terhubung.
2. Buka **Pengaturan**.
3. Aktifkan pengingat harian, mingguan, atau bulanan.
4. Klik **Simpan pengingat**.

Worker menjalankan Cron harian pada pukul 13.00 UTC (20.00 WIB). Pengingat dikirim melalui Telegram, bukan notifikasi browser. Jika bot belum terhubung, tidak ada pesan Telegram yang dapat dikirim.

## 13. Pengujian setelah deployment

Lakukan tes dengan dua akun berbeda agar pemisahan data benar-benar diperiksa.

| No. | Tes | Hasil yang diharapkan |
|---:|---|---|
| 1 | Buka `/api/health` | `ok: true` |
| 2 | Registrasi pengguna A | Akun tersimpan dan recovery code tampil satu kali |
| 3 | Logout lalu login pengguna A | Login berhasil |
| 4 | Buat akun keuangan | Akun tersimpan di D1 |
| 5 | Catat pemasukan | Nomor transaksi muncul |
| 6 | Catat pengeluaran tanpa foto | Tetap berhasil |
| 7 | Catat transaksi dengan foto | Foto tersimpan di R2 dan dapat dilihat setelah login |
| 8 | Edit transaksi | Data terbaru tampil, nomor struk tetap sama |
| 9 | Hapus transaksi | Transaksi hilang dari riwayat aktif dan saldo dihitung ulang |
| 10 | Buka struk | Detail sesuai transaksi |
| 11 | Unduh CSV dan XLSX | File dapat dibuka |
| 12 | Cetak laporan / struk | Dialog cetak browser terbuka dan dapat disimpan sebagai PDF |
| 13 | Ekspor backup JSON | File backup terunduh |
| 14 | Impor backup | Data ditambahkan tanpa menghapus data lama |
| 15 | Hubungkan Telegram | Pairing sukses dalam 5 menit |
| 16 | Kirim `/masuk` atau `/keluar` | Transaksi tersimpan dan muncul di website |
| 17 | Kirim foto Telegram | Foto tersimpan di R2 |
| 18 | Login pengguna B | Data pengguna A tidak terlihat |
| 19 | Coba akses ID transaksi pengguna A dari pengguna B | API menjawab tidak ditemukan / tidak berizin |
| 20 | Periksa repository | Tidak ada token atau secret |

## 14. Batasan paket gratis dan biaya

Tidak ada layanan yang dapat dijamin gratis selamanya. Batas gratis dapat berubah mengikuti kebijakan penyedia.

Berdasarkan dokumentasi resmi yang diperiksa pada 4 November 2026:

- **Workers Free:** 100.000 request per hari, CPU 10 ms per HTTP request dan Cron invocation, 50 subrequest per invocation, serta maksimal 5 Cron Trigger per akun.
- **D1 Free:** maksimal 10 database per akun; ukuran maksimal 500 MB per database dan 5 GB total penyimpanan akun; 5 juta rows read per hari; 100.000 rows written per hari; 50 query/subrequest per Worker invocation; Time Travel 7 hari.
- **R2 Standard Free tier:** 10 GB-month penyimpanan, 1 juta Class A operations, 10 juta Class B operations per bulan, dan egress gratis. Free tier hanya berlaku untuk Standard storage.
- **Penting tentang R2:** untuk mengaktifkan R2, Cloudflare meminta checkout subscription dan metode pembayaran yang valid. Kuota free tier tetap tersedia, tetapi penggunaan di atas kuota gratis dapat ditagihkan otomatis sesuai tarif R2. Project ini tidak mengaktifkan R2 atau paket berbayar atas nama kamu. Jika kamu tidak bersedia menambahkan metode pembayaran, jangan aktifkan R2; fitur foto berbasis R2 tidak akan dapat dipakai dengan stack ini.
- **GitHub Pages:** hosting website statis; GitHub Free mensyaratkan repository publik untuk Pages.

Perhatikan menu Billing / Usage Cloudflare. Jangan mengaktifkan paket Workers berbayar jika ingin tetap di paket gratis. Batasi ukuran dan jumlah foto, serta periksa penggunaan R2 secara berkala. Jika batas harian Workers/D1 tercapai, sebagian API bisa berhenti sampai kuota pulih. Kuota gratis bukan penyimpanan tanpa batas atau jaminan layanan gratis selamanya.

Dokumentasi resmi:
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare R2 getting started and subscription](https://developers.cloudflare.com/r2/get-started/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 15. Keamanan dan catatan penting

- Jangan pernah mengirim token bot, recovery code, password, atau Worker secret ke orang lain.
- Recovery code hanya tampil sekali saat registrasi. Simpan di password manager atau tempat offline yang aman.
- Opsi **Tetap masuk** menyimpan bearer session token di local storage browser. Pada perangkat bersama, hilangkan centang tersebut dan logout setelah selesai.
- Gunakan password unik dan panjang. Browser menggunakan PBKDF2-HMAC-SHA-256 600.000 iterasi; Worker memverifikasi hasilnya dengan HMAC yang dilindungi `AUTH_PEPPER`. Password asli tidak dikirim ke API. Simpan `AUTH_PEPPER` sebagai secret Cloudflare dan backup secara aman.
- Foto bukti hanya dapat diakses melalui endpoint Worker yang memeriksa sesi dan kepemilikan transaksi.
- CORS bukan pengganti autentikasi. Semua endpoint privat tetap memeriksa token sesi.
- Jangan membuat bucket R2 publik.
- Backup JSON tidak memuat binary foto. Foto tetap tersimpan privat di bucket R2. Untuk backup foto, salin seluruh isi bucket `aruskas-files` melalui R2 Dashboard atau klien S3-compatible, lalu simpan salinan secara aman. Jangan mengubah bucket menjadi public.
- Penghapusan transaksi menggunakan soft delete agar riwayat relasi tidak rusak.
- Service worker tidak menyimpan respons API, token, transaksi, atau foto di cache.

## 16. Troubleshooting

### Website menampilkan “Alamat API belum diatur”
Periksa `assets/js/config.js`. Pastikan `API_BASE_URL` berisi URL Worker yang benar tanpa `/api` di belakangnya.

### Browser menampilkan CORS error
Pastikan `ALLOWED_ORIGINS` berisi origin website yang benar, misalnya `https://USERNAME.github.io` (tanpa path repository). Deploy ulang Worker setelah mengubahnya.

### API health gagal / Worker error 1101
Periksa Worker logs dan pastikan binding D1 bernama `DB`, binding R2 bernama `BUCKET`, database ID benar, dan bucket sudah dibuat.

### Error `no such table`
Jalankan migration `0001_init.sql` pada database D1 remote yang benar.

### Foto gagal diunggah
Periksa binding R2, ukuran file (maksimal 5 MB), dan format JPG/PNG/WEBP. Pastikan bucket tidak dihapus.

### Bot tidak merespons
Periksa `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `getWebhookInfo`, URL webhook, dan Worker logs. Pastikan webhook memakai secret token yang sama dengan Worker Secret.

### XLSX tidak dapat diunduh
Pastikan koneksi internet aktif dan CDN SheetJS dapat dimuat. CSV tetap dapat diunduh tanpa library Excel.

### PDF
Tombol PDF membuka dialog cetak browser. Pilih printer **Save as PDF / Simpan sebagai PDF**.

---

**Status project:** source code dan skema database disertakan. Deployment Cloudflare, GitHub Pages, dan Telegram harus dilakukan pada akun milik pengguna. Project tidak mengklaim layanan sudah aktif sebelum langkah-langkah deployment dan pengujian di atas berhasil.

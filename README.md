# All Tools Nexora

All Tools Nexora v6.3.16 adalah website toolkit statis dengan 44 tool, lazy-loaded feature modules, dashboard admin, Supabase, dan 12 Vercel Functions. Source frontend tetap tanpa framework dan tidak memiliki dependency npm produksi.

## Menjalankan secara lokal

Node.js 18 atau lebih baru diperlukan.

```bash
cp .env.example .env
npm ci
npm test
npm run dev
```

Buka `http://127.0.0.1:4173`. Server lokal meniru seluruh rewrite API di `vercel.json` dan hanya menyajikan halaman serta asset publik.

### Termux

```bash
pkg update
pkg install git nodejs
git clone https://github.com/akidwush/all-tools-nexora.git
cd all-tools-nexora
cp .env.example .env
npm ci
npm test
npm run dev
```

## Struktur proyek

| Lokasi | Isi |
|---|---|
| `index.html`, `assets/` | UI publik, core runtime, dan feature modules |
| `admin/` | Login dan dashboard admin |
| `api/` | 12 entry point Vercel Functions |
| `lib/` | Handler, proxy, database, rate limit, dan validasi keamanan |
| `database/` | Skema lengkap, migrations, dan setup admin pertama |
| `scripts/` | Audit proyek, regression test, build, dan server lokal |
| `public/` | Output build sementara; tidak disimpan di Git |

`assets/js/core/tool-registry.js` adalah sumber daftar tool. `assets/module-manifest.json`, `lib/tool-health.js`, dan seed `database/schema.sql` wajib tetap sinkron; `npm run check` memverifikasi semuanya.

## Konfigurasi

Salin `.env.example` dan isi hanya layanan yang digunakan. Variable utama:

- Database/admin: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` atau `SUPABASE_SERVICE_ROLE_KEY`, serta `FEEDBACK_HASH_SALT`.
- Operasional: `HEALTH_CHECK_TOKEN` dan pengaturan timeout/cache opsional.
- Tool eksternal: `COINGECKO_API_KEY`, `GOOGLE_PAGESPEED_API_KEY`, `GOOGLE_SAFE_BROWSING_API_KEY`, `NASA_API_KEY`, `OCR_SPACE_API_KEY`, `FREECONVERT_API_KEY`, `BIGJPG_API_KEY`, dan `SVGTOXML_API_KEY`.
- SiteGrabber: `SITEGRABBER_API_BASE_URL` dan `SITEGRABBER_API_KEY`.
- Deploy Center: `NEXUS_DEPLOY_ACCESS_KEY`, kemudian token `VERCEL_TOKEN` atau `NETLIFY_TOKEN`.

Jangan memakai prefix publik untuk secret dan jangan menaruh key di HTML/JavaScript browser. Jika `FEEDBACK_HASH_SALT` kosong, server memakai salt acak per proses; konfigurasi nilai tetap tetap disarankan agar hash konsisten antar-instance.

## Database dan admin

Untuk instalasi baru, jalankan `database/schema.sql` melalui Supabase SQL Editor. Buat user di Supabase Authentication, ganti `GANTI_EMAIL_ADMIN` pada `database/setup-first-admin.sql`, lalu jalankan file tersebut.

Untuk database lama, jalankan migration yang belum pernah diterapkan dari `database/migrations/` sesuai urutan nomor. Backup database terlebih dahulu.

Big Image memerlukan `database/migrations/015_big_image_bigjpg.sql`. Migration tersebut membuat tabel job dan bucket `big-image-inputs` privat. Atur `BIGJPG_API_KEY` serta `BIGJPG_JOB_SECRET` di Vercel, lalu redeploy. Batas per-IP/global dapat disesuaikan melalui `BIGJPG_HOURLY_IP_LIMIT` dan `BIGJPG_DAILY_TASK_LIMIT`.

## Pemeriksaan dan build

```bash
npm run check
npm test
npm run build
```

- `npm run check` memeriksa sintaks, katalog, seed, manifest, rute, batas Functions, iframe sandbox, asset version, dan kemungkinan secret hardcoded.
- `npm test` menjalankan seluruh regression test di `scripts/test-*.js`.
- `npm run build` menjalankan kedua pemeriksaan lalu membuat `public/` dari source frontend.

Deploy ke Vercel menggunakan konfigurasi `vercel.json`. Seluruh secret harus diatur sebagai environment variable server-side.

## Batas dan keamanan

- VDeploy membatasi ZIP ke 3,2 MB agar payload base64 tidak melewati batas request Function.
- Proxy SVG dan arsip SiteGrabber dibatasi 4 MB.
- Upload Big Image dibatasi 4 MB, diverifikasi dari magic bytes PNG/JPG, disimpan sementara di bucket privat, serta dilindungi token HMAC dan rate limit.
- Konten legacy yang dijalankan lewat `srcdoc` berada dalam iframe sandbox tanpa akses same-origin.
- Header Content Security Policy membatasi sumber script, frame, object, worker, dan koneksi browser; kebijakan tetap mengizinkan provider yang memang dipakai tool legacy.
- Image Vectorizer memantau task konversi dan ekspor secara terpisah agar kegagalan kuota, kredensial, timeout, atau engine tidak lagi tertutup pesan dependency umum.
- Big Image memakai API key Bigjpg hanya pada server, memvalidasi URL publik, memantau task secara terpisah, dan membersihkan file sumber saat task selesai, gagal, dihentikan, atau kedaluwarsa.
- Sebagian tool bergantung pada API pihak ketiga dan tetap dapat mengalami kuota, perubahan kontrak, atau downtime.

Lihat [audit keamanan](docs/SECURITY_AUDIT.md) dan [riwayat perubahan](CHANGELOG.md).

## Lisensi

Belum ada file lisensi di repository. Tambahkan lisensi eksplisit sebelum distribusi ulang di luar ketentuan pemilik proyek.

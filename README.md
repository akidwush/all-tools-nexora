# All Tools Nexora

All Tools Nexora v6.3.18 adalah website toolkit statis dengan 46 tool, lazy-loaded feature modules, dashboard admin, Supabase, dan 12 Vercel Functions. Frontend tetap tanpa framework; backend Personal AI memakai dependency `@google/genai`.

## Menjalankan secara lokal

Node.js 20 atau lebih baru diperlukan.

```bash
cp .env.example .env
npm ci
sh scripts/fetch-ai-vendor.sh
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
sh scripts/fetch-ai-vendor.sh
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
- Tool eksternal: `COINGECKO_API_KEY`, `GOOGLE_PAGESPEED_API_KEY`, `GOOGLE_SAFE_BROWSING_API_KEY`, `NASA_API_KEY`, `OCR_SPACE_API_KEY`, `FREECONVERT_API_KEY`, `SVGTOXML_API_KEY`, dan `GEMINI_API_KEY` untuk Personal AI.
- SiteGrabber: `SITEGRABBER_API_BASE_URL` dan `SITEGRABBER_API_KEY`.
- Deploy Center: `NEXUS_DEPLOY_ACCESS_KEY`, kemudian token `VERCEL_TOKEN` atau `NETLIFY_TOKEN`.

Jangan memakai prefix publik untuk secret dan jangan menaruh key di HTML/JavaScript browser. Jika `FEEDBACK_HASH_SALT` kosong, server memakai salt acak per proses; konfigurasi nilai tetap tetap disarankan agar hash konsisten antar-instance.

SVG → Alight XML memakai API resmi `https://svgtoxml.vercel.app`: simpan key sebagai `SVGTOXML_API_KEY` di environment server/Vercel. Nexora memverifikasi key melalui `/api/v1/auth`, lalu meneruskan konversi ke `/api/v1/convert`; key tidak pernah dikirim ke browser.

## Database dan admin

Untuk instalasi baru, jalankan `database/schema.sql` melalui Supabase SQL Editor. Buat user di Supabase Authentication, ganti `GANTI_EMAIL_ADMIN` pada `database/setup-first-admin.sql`, lalu jalankan file tersebut.

Untuk database lama, jalankan migration yang belum pernah diterapkan dari `database/migrations/` sesuai urutan nomor. Backup database terlebih dahulu.

Migration `database/migrations/016_hero_video_settings.sql` mengaktifkan pengaturan video header. Setelah migration dijalankan, buka **Dashboard Admin → Ringkasan Sistem → Video Header**, isi URL MP4/WebM HTTPS langsung, lalu simpan. Pengaturan tersimpan di `app_settings.site.heroVideo` dan dibaca halaman publik tanpa mengekspos service-role key.

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

Video header mempertahankan mode hemat: desktop dapat memutar video muted saat terlihat, HP memakai kontrol manual, dan perangkat dengan Save Data, reduced motion, RAM/CPU rendah, atau jaringan 2G otomatis memakai background statis agar scrolling tetap ringan.

## Batas dan keamanan

- VDeploy membatasi ZIP ke 3,2 MB agar payload base64 tidak melewati batas request Function.
- Proxy SVG dan arsip SiteGrabber dibatasi 4 MB.
- Konten legacy yang dijalankan lewat `srcdoc` berada dalam iframe sandbox tanpa akses same-origin.
- Header Content Security Policy membatasi sumber script, frame, object, worker, dan koneksi browser; kebijakan tetap mengizinkan provider yang memang dipakai tool legacy.
- Image Vectorizer memantau task konversi dan ekspor secara terpisah agar kegagalan kuota, kredensial, timeout, atau engine tidak lagi tertutup pesan dependency umum.
- Sebagian tool bergantung pada API pihak ketiga dan tetap dapat mengalami kuota, perubahan kontrak, atau downtime.

Lihat [audit keamanan](docs/SECURITY_AUDIT.md) dan [riwayat perubahan](CHANGELOG.md).

## Lisensi

Belum ada file lisensi di repository. Tambahkan lisensi eksplisit sebelum distribusi ulang di luar ketentuan pemilik proyek.

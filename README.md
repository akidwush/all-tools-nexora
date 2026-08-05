# All Tools Nexora v6.3.9

Rilis stabilisasi untuk website All Tools Nexora. Fokus utama v6.3.9 adalah mengalirkan download TikTok melalui server tanpa membuat Blob besar di RAM browser, memvalidasi media sebelum history dicatat, dan memakai satu controller preview tanpa MutationObserver permanen.

## Perubahan utama

- Registry konsisten untuk 37 tools.
- Functional Audit pada Admin Dashboard.
- Tool Health mencakup 37/37 tools.
- Timeout dan retry terbatas untuk request API eksternal.
- Pesan gangguan yang jelas ketika API atau modul gagal.
- Lazy dispatcher tidak lagi berisiko rekursi.
- Bottom navigation admin menjadi 5 menu tanpa horizontal scroll.
- Menu Sosial, Health, Functional Audit, Visual QA, dan Audit Log dipindahkan ke panel Lainnya pada HP.
- Modal admin menjadi bottom sheet mobile.
- Tetap kompatibel dengan limit 12 Serverless Functions Vercel Hobby.

## Upgrade

Tidak ada migration SQL baru. Pastikan migration berikut sebelumnya sudah dijalankan:

```text
database/migrations/002_tool_health.sql
database/migrations/003_admin_dashboard.sql
database/migrations/004_analytics_feedback_audit.sql
database/migrations/005_visual_runtime_validation.sql
database/migrations/006_social_links.sql
```

## Validasi

```bash
npm install
npm run check
npm test
npm run build
```

## Environment Vercel

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY atau SUPABASE_SECRET_KEY
HEALTH_CHECK_TOKEN
DATABASE_TIMEOUT_MS
FEEDBACK_HASH_SALT
```

Tidak ada environment variable baru untuk v6.3.9.

## Endpoint

Jumlah function fisik tetap 12. Alias `/api/analytics`, `/api/database`, dan `/api/media-download` menggunakan rewrite di `vercel.json`; media download digabung ke handler tool-health agar tidak menambah function fisik.

Dashboard admin tersedia di:

```text
/admin
/admin/login
```

## v6.3.6

- Export screenshot Visual QA membersihkan URL aset lintas domain dari clone SVG dan memiliki fallback canvas aman saat browser menolak `toBlob()`.
- Katalog publik menerima tool kustom baru dari database, bukan hanya 37 ID registry bawaan.
- Dashboard admin menyediakan Tambah Tool, Edit, Nonaktifkan, dan Hapus untuk tool kustom.
- Tool bawaan tidak dihapus karena masih terhubung ke handler/module internal; gunakan status nonaktif untuk menyembunyikannya.
- Tool kustom wajib berupa tautan `http`/`https` dan dibersihkan dari markup HTML sebelum dirender.
- Tambah regression test `test-canvas-tool-crud-v636.js`.

## v6.3.5

- Memutus intrinsic minimum width pada rantai grid/panel TikTok dengan `min-width:0` dan `minmax(0,1fr)`.
- Membatasi semua foto dan video TikTok ke lebar panel dengan `max-width:100%`.
- Mengunci scroll utama TikTok ke sumbu vertikal agar media tidak membuat halaman melebar.
- Menjaga preview video/foto mobile di dalam tinggi viewport dan memperbaiki fallback galeri TikTok.
- Menambah regression test `test-tiktok-media-layout-v635.js`.

## v6.3.4

- Kartu publik tidak lagi memakai `content-visibility:auto` atau containment layout/paint yang membuat tinggi baris berubah saat scroll.
- All Tools tidak lagi melakukan auto-load melalui `IntersectionObserver` 320px; batch berikutnya dimuat melalui tombol dan di-append tanpa mengganti seluruh grid.
- Slot readiness badge dibuat saat kartu dirender; `MutationObserver` global di stability layer dihapus.
- Popup WhatsApp otomatis dan animasi compositor berat dinonaktifkan pada perangkat touch/reduced-motion.
- Kartu katalog statis di `index.html` dihapus; seluruh katalog berasal dari data registry/app.
- Tambah regression test `test-scroll-stability-v634.js`.

## v6.3.3

- All Tools dirender bertahap 12 kartu per batch.
- Hanya tab aktif yang dipertahankan di DOM.
- Blur kartu dimatikan pada HP dan off-screen card memakai content-visibility.
- Banner anime kembali aktif pada perangkat yang cukup kuat; Data Saver, 2G, reduced motion, dan perangkat rendah tetap memakai fallback ringan.


## TikTok Runtime Fix Tahap 2

- `/api/media-download` digabung ke fungsi `/api/tool-health` melalui rewrite agar jumlah Serverless Function tetap 12/12.
- Media di-stream dari sumber TikTok ke browser; browser tidak lagi menampung seluruh video sebagai Blob.
- Endpoint memvalidasi protokol, host, redirect, content type, timeout, filename, dan rate limit.
- History baru dicatat setelah probe server menyatakan media siap.
- Fallback iframe palsu dan MutationObserver preview dihapus.
- Pergantian format melepaskan decoder dan sumber video lama terlebih dahulu.

# Audit dan Patch Nexora HF3

## Temuan utama

1. Kalkulator gagal pada deployment dengan CSP produksi karena memakai `Function(...)` (setara evaluasi kode dinamis). Input valid seperti `(50*2)+20` selalu masuk ke pesan `Format tidak valid`.
2. Password Generator memakai `Math.random()` meski diposisikan sebagai generator aman. Sumber acak tersebut tidak sesuai untuk password.
3. URL video header tersimpan langsung di `index.html`, sedangkan `app_settings` di Supabase hanya ditampilkan read-only pada dashboard.
4. Animasi dasar sudah memiliki low-power mode, tetapi reduced-motion belum mematikan seluruh transisi/animasi dan beberapa hover masih memakai transisi terlalu umum.

## Perbaikan

- Parser kalkulator tanpa `eval`/`Function`, validasi panjang/karakter, penanganan kurung, unary, pangkat, modulo, dan hasil non-finite.
- Password Generator memakai Web Crypto dengan rejection sampling agar pemilihan karakter tidak bias.
- Dashboard dapat menyimpan `site.heroVideo.enabled` dan `site.heroVideo.url` melalui endpoint admin yang dilindungi sesi, role edit, same-origin, dan CSRF.
- Frontend mengambil settings publik melalui `/api/database?resource=settings`; service-role key tetap hanya di server.
- Video tidak dipaksa autoplay pada HP dan dinonaktifkan untuk Save Data, reduced motion, perangkat rendah, atau jaringan sangat lambat.
- Transisi hover dibatasi untuk mouse/fine pointer dan seluruh motion dinonaktifkan saat pengguna memilih reduced motion.

## Verifikasi

- Seluruh 44 kartu tool tetap sinkron dengan registry, seed Supabase, health catalog, dan route manifest.
- Seluruh 12 Vercel Functions tetap berada di bawah batas proyek.
- Regression suite, project audit, dan build wajib dijalankan sebelum push.
- Smoke test browser membuka kelompok downloader, maker, local tools, dan lazy modules tanpa error konsol. Fitur yang memanggil API pihak ketiga tetap memerlukan environment variable/kuota/provider yang aktif.

Snapshot endpoint produksi pada 14 Agustus 2026 menunjukkan Supabase `ready` dan schema tersedia. Pemeriksaan terbaru mencatat 34 tool `operational`, 10 `degraded`, 0 `offline`, dan 0 `unknown`. Status degraded berasal dari probe provider eksternal: API Nexray melewati ambang latensi 2,5 detik, sedangkan root probe TikWM/IkyyXD merespons HTTP 403 walaupun host dapat dijangkau. Patch tidak menyamarkan status ini; UI tetap memakai timeout, fallback, dan pesan error agar kegagalan provider tidak membuat halaman utama macet.

## Langkah Supabase dan Vercel

1. Backup database, lalu jalankan `database/migrations/016_hero_video_settings.sql` di Supabase SQL Editor.
2. Pastikan variable `SUPABASE_URL` dan salah satu `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` tersedia pada Production, Preview, dan Development di Vercel.
3. Jalankan `npm run check`, `npm test`, dan `npm run build`.
4. Push branch patch dan merge ke branch yang terhubung ke Production Vercel.
5. Buka dashboard admin, simpan URL video HTTPS langsung, lalu muat ulang halaman publik pada desktop dan HP.

Gunakan video MP4/WebM terkompresi, tanpa audio penting, durasi pendek, dan idealnya di bawah 5 MB. URL halaman YouTube/TikTok bukan URL video langsung dan tidak dapat dipakai pada elemen `<video>`.

# All Tools Nexora v6.1.1

Website tools modular dengan lazy loading, Get Code live audit, tool health monitoring, Supabase database, login admin, pengelolaan seluruh link sosial dari dashboard, analytics anonim, feedback management, dan audit log.

## Fitur v6.1.1

- Dashboard analytics periode 7, 30, dan 90 hari.
- Metrik page view, tool open, pengunjung unik, error, tren harian, dan ranking tools.
- Visitor ID, session ID, dan IP diproses sebagai hash; alamat IP mentah tidak disimpan.
- Feedback dapat dicari, difilter, diubah statusnya, diberi balasan publik, dan diberi catatan internal.
- Pengguna dapat melihat status serta balasan admin untuk laporan yang dibuat dari perangkatnya.
- Audit log mencatat login, logout, perubahan tool, dan perubahan feedback.
- Role `viewer` tetap read-only; `admin` dan `super_admin` dapat melakukan mutasi.
- Cookie sesi HttpOnly, CSRF, origin validation, rate limit login, dan validasi payload tetap aktif.
- WhatsApp, Instagram, TikTok, YouTube, Facebook, Telegram, Discord, dan GitHub disimpan di `social_links` dan dapat diedit dari menu **Sosial Media**.

## Setup database

Untuk upgrade dari v5.0:

1. Jalankan `database/migrations/004_analytics_feedback_audit.sql` melalui Supabase SQL Editor.
2. Jalankan `database/migrations/005_visual_runtime_validation.sql`.
3. Jalankan `database/migrations/006_social_links.sql`.
4. Tunggu deployment Vercel v6.1 selesai.
5. Buka `/admin`, lalu periksa menu Sosial Media, Analytics, Feedback, dan Audit Log.

Untuk instalasi baru, `database/schema.sql` memuat seluruh schema sampai v6.1.

## Environment Vercel

Minimal:

```env
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
DATABASE_TIMEOUT_MS=8000
FEEDBACK_HASH_SALT=random_long_value
HEALTH_CHECK_TOKEN=random_long_value
```

Legacy `SUPABASE_SERVICE_ROLE_KEY=eyJ...` tetap didukung. Tidak ada environment variable wajib baru pada v6.1.

## Endpoint v6.1.1

```text
POST /api/analytics (compatibility rewrite)
POST /api/feedback?mode=analytics (canonical)
GET  /api/admin/analytics
GET  /api/admin/feedback
PATCH /api/admin/feedback
GET  /api/admin/audit
GET  /api/admin/socials
PATCH /api/admin/socials
```

## Validasi

```bash
npm run check
npm test
npm run build
```

Build statis dibuat pada `public/`, sedangkan API Vercel tetap berada di folder `api/`.

v6.1.1 menggabungkan endpoint analytics ke function feedback dan endpoint database publik ke function health. Jumlah Serverless Functions menjadi tepat 12 sehingga kompatibel dengan Vercel Hobby. Alias `/api/analytics` dan `/api/database` tetap tersedia melalui rewrite.


## Visual QA v6.0

Dashboard admin menyediakan runtime JavaScript observer, smoke test seluruh modul lazy-load, screenshot browser, visual baseline, fingerprint comparison, dan riwayat validasi. Jalankan `database/migrations/005_visual_runtime_validation.sql` setelah deployment.

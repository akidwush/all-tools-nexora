# All Tools Nexora v5.1

Website tools modular dengan lazy loading, Get Code live audit, tool health monitoring, Supabase database, login admin, analytics anonim, feedback management, dan audit log.

## Fitur v5.1

- Dashboard analytics periode 7, 30, dan 90 hari.
- Metrik page view, tool open, pengunjung unik, error, tren harian, dan ranking tools.
- Visitor ID, session ID, dan IP diproses sebagai hash; alamat IP mentah tidak disimpan.
- Feedback dapat dicari, difilter, diubah statusnya, diberi balasan publik, dan diberi catatan internal.
- Pengguna dapat melihat status serta balasan admin untuk laporan yang dibuat dari perangkatnya.
- Audit log mencatat login, logout, perubahan tool, dan perubahan feedback.
- Role `viewer` tetap read-only; `admin` dan `super_admin` dapat melakukan mutasi.
- Cookie sesi HttpOnly, CSRF, origin validation, rate limit login, dan validasi payload tetap aktif.

## Setup database

Untuk upgrade dari v5.0:

1. Jalankan `database/migrations/004_analytics_feedback_audit.sql` melalui Supabase SQL Editor.
2. Tunggu deployment Vercel v5.1 selesai.
3. Buka `/admin`, lalu periksa menu Analytics, Feedback, dan Audit Log.

Untuk instalasi baru, `database/schema.sql` memuat seluruh schema sampai v5.1.

## Environment Vercel

Minimal:

```env
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
DATABASE_TIMEOUT_MS=8000
FEEDBACK_HASH_SALT=random_long_value
HEALTH_CHECK_TOKEN=random_long_value
```

Legacy `SUPABASE_SERVICE_ROLE_KEY=eyJ...` tetap didukung. Tidak ada environment variable wajib baru pada v5.1.

## Endpoint v5.1

```text
POST /api/analytics
GET  /api/admin/analytics
GET  /api/admin/feedback
PATCH /api/admin/feedback
GET  /api/admin/audit
```

## Validasi

```bash
npm run check
npm test
npm run build
```

Build statis dibuat pada `public/`, sedangkan API Vercel tetap berada di folder `api/`.

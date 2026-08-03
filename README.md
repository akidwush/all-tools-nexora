# All Tools Nexora v5.0

Website tools modular dengan lazy loading, Get Code live audit, tool health monitoring, Supabase database, serta login dan dashboard admin.

## Fitur v5.0

- Login admin menggunakan Supabase Auth email/password.
- Allowlist admin melalui tabel `admin_users` dengan role `super_admin`, `admin`, dan `viewer`.
- Cookie sesi HttpOnly, refresh token server-side, SameSite, CSRF token, origin validation, dan rate limit login.
- Dashboard `/admin` dengan ringkasan tools, feedback, database, dan tool health.
- Manajemen tools: nama, deskripsi, kategori, badge, icon, URL eksternal, status aktif, dan urutan.
- Perubahan tools aktif diterapkan ke halaman publik melalui `/api/database?resource=tools`.
- Elevated key modern `SUPABASE_SECRET_KEY` dan legacy `SUPABASE_SERVICE_ROLE_KEY` sama-sama didukung.

## Setup database v5.0

1. Jalankan `database/migrations/003_admin_dashboard.sql` melalui Supabase SQL Editor.
2. Buka Supabase **Authentication → Users → Add user**, lalu buat email dan password admin.
3. Buka `database/setup-first-admin.sql`, ganti `GANTI_EMAIL_ADMIN`, lalu jalankan melalui SQL Editor.
4. Login melalui `/admin/login`.

Untuk instalasi baru, `database/schema.sql` sudah memuat seluruh schema sampai v5.0.

## Environment Vercel

Minimal:

```env
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
DATABASE_TIMEOUT_MS=8000
FEEDBACK_HASH_SALT=random_long_value
HEALTH_CHECK_TOKEN=random_long_value
```

Legacy `SUPABASE_SERVICE_ROLE_KEY=eyJ...` tetap didukung. `SUPABASE_PUBLISHABLE_KEY` opsional; backend dapat memakai elevated key untuk berkomunikasi dengan Supabase Auth tanpa mengeksposnya ke browser.

## Validasi

```bash
npm run check
npm test
npm run build
```

Build statis dibuat pada `public/`, sedangkan API Vercel tetap berada di folder `api/`.

# Validasi Nexora v5.0 — Login dan Dashboard Admin

## Implementasi keamanan

- Supabase Auth email/password diproksi oleh API server-side.
- Access token dan refresh token disimpan pada cookie HttpOnly.
- Refresh sesi dilakukan server-side ketika access token kedaluwarsa.
- Mutation admin memakai CSRF double-submit token, SameSite cookie, validasi Origin, dan `Sec-Fetch-Site`.
- Login dibatasi enam percobaan per kombinasi IP dan email dalam 15 menit per instance.
- Admin wajib tercantum pada `public.admin_users` dan berstatus aktif.
- Role `viewer` hanya baca; `admin` dan `super_admin` dapat mengubah tools.
- Secret API key modern dikirim melalui header `apikey` tanpa `Authorization: Bearer`; legacy service role tetap didukung.

## Dashboard

- Ringkasan jumlah tools aktif/nonaktif.
- Ringkasan feedback baru dan total.
- Ringkasan tool health operational, degraded, offline, dan unknown.
- Daftar feedback terbaru dan app settings.
- Manajemen 37 tools dengan pencarian, filter, editor, status aktif, dan urutan.
- Mobile bottom navigation dan desktop sidebar.

## Database

- Migration baru: `database/migrations/003_admin_dashboard.sql`.
- Setup admin pertama: `database/setup-first-admin.sql`.
- Tabel `admin_users` terhubung ke `auth.users`.
- Katalog 37 tools di-seed tanpa menimpa perubahan admin saat migration dijalankan ulang.

## Endpoint baru

```text
GET/POST/DELETE /api/admin/auth
GET             /api/admin/dashboard
GET/PATCH       /api/admin/tools
```

## Hasil validasi

```text
npm run check  : LULUS
npm test       : LULUS
npm run build  : LULUS
```

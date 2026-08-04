# All Tools Nexora v6.3

Rilis stabilisasi untuk website All Tools Nexora. Fokus utama v6.3 adalah memperbaiki dispatcher lazy-load, memberi audit fungsional pada 37 tools, memperluas health monitoring, membatasi request yang menggantung, dan merapikan dashboard admin pada HP.

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

Tidak ada environment variable baru untuk v6.3.

## Endpoint

Jumlah function fisik tetap 12. Alias `/api/analytics` dan `/api/database` tetap menggunakan rewrite di `vercel.json`.

Dashboard admin tersedia di:

```text
/admin
/admin/login
```

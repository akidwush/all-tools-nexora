# All Tools Nexora — Developer Dika v3

Versi ini merupakan kelanjutan dari arsip `all-tools-nexora-developer-dika-fixed.zip`. Proyek tetap ringan untuk Termux, tetapi sekarang memiliki backend database yang benar-benar siap dipakai, health check koneksi Supabase nyata, dan laporan asset serta dynamic endpoint pada mesin Get Code HTML.

## Patch v3

- `/api/health` benar-benar menghubungi Supabase dan mengukur latency, bukan hanya memeriksa keberadaan environment variable.
- `/api/database` menyediakan pembacaan aman untuk `status`, `tools`, dan `settings` tanpa membocorkan service-role key ke browser.
- Helper database memiliki timeout, klasifikasi error, validasi URL, dan deteksi schema yang belum dijalankan.
- Skema Supabase idempotent, memiliki trigger `updated_at`, RLS, index, dan seed pengaturan publik.
- Mesin Get Code menghasilkan laporan terstruktur berisi asset HTML/CSS serta endpoint dinamis dari `fetch`, Axios, XHR, WebSocket, EventSource, beacon, dan form action.
- Laporan Get Code dapat disalin atau diunduh sebagai JSON.
- Build audit memverifikasi endpoint baru serta keberadaan fitur laporan Get Code.

## Jalankan di Termux

```bash
pkg install nodejs -y
cd all-tools-nexora-developer-dika-v3
npm run check
npm test
npm run build
npm run dev
```

Buka `http://127.0.0.1:4173` di browser HP.

## Aktifkan Supabase

1. Buat project Supabase.
2. Buka **SQL Editor**, lalu jalankan seluruh isi `database/schema.sql`.
3. Tambahkan environment berikut di Vercel:

```env
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service_role_key_server_only
DATABASE_TIMEOUT_MS=8000
FEEDBACK_HASH_SALT=random_string_panjang
```

4. Redeploy.
5. Buka `/api/health`. Koneksi berhasil ketika `database.status` bernilai `ready`, `connected` bernilai `true`, dan `schemaReady` bernilai `true`.

## Database API

Endpoint aman yang tersedia:

```text
GET /api/database?resource=status
GET /api/database?resource=tools
GET /api/database?resource=settings
POST /api/feedback
GET /api/health
```

`SUPABASE_SERVICE_ROLE_KEY` hanya digunakan di serverless function. Jangan menaruhnya di HTML, JavaScript browser, GitHub, atau screenshot publik.

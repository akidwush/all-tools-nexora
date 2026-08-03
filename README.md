# All Tools Nexora v4.2 — Tool Health Monitoring

Versi 4.2 dibangun di atas modularisasi v4.0 dan live audit v4.1. Upgrade ini menambahkan pemantauan kesehatan untuk 22 tools, penyimpanan statistik di Supabase, serta panel status langsung pada halaman utama.

## Fitur utama v4.2

- Endpoint baru: `GET /api/tool-health` dan `POST /api/tool-health`.
- Panel **Tool Health Monitoring** pada halaman utama.
- Status per tools:
  - `operational`;
  - `degraded`;
  - `offline`;
  - `unknown`.
- Metrik yang disimpan:
  - latency;
  - HTTP status;
  - persentase keberhasilan;
  - jumlah pemeriksaan;
  - kegagalan berturut-turut;
  - error terakhir;
  - waktu pemeriksaan dan keberhasilan terakhir.
- Pemeriksaan 22 tools memakai target dependency yang sudah ditentukan di server, bukan URL bebas dari pengguna.
- Target yang sama diperiksa sekali lalu hasilnya dibagikan ke tools yang memakai dependency tersebut.
- Cache Supabase mencegah pemeriksaan jaringan pada setiap kunjungan.
- Pemeriksaan otomatis hanya dilakukan jika data sudah kedaluwarsa.
- Pemeriksaan paksa dilindungi `HEALTH_CHECK_TOKEN`.
- `/api/health` sekarang turut menampilkan ringkasan tool health tanpa menjadikan gangguan API eksternal sebagai kegagalan inti website.

## SQL Supabase wajib

Untuk upgrade dari v4.1, jalankan file berikut melalui Supabase SQL Editor:

```text
database/migrations/002_tool_health.sql
```

Untuk instalasi baru, cukup jalankan:

```text
database/schema.sql
```

Tabel `tool_health` tidak memiliki policy anon. Browser membaca status melalui API server-side sehingga URL dependency dan statistik internal tidak dapat diambil langsung melalui Supabase anon key.

## Endpoint

### Ringkasan publik

```http
GET /api/tool-health?refresh=auto
```

API menggunakan cache. Jika data belum ada atau sudah melewati `HEALTH_STALE_MS`, server menjalankan pemeriksaan baru dan mencoba menyimpannya ke Supabase.

### Hanya membaca cache

```http
GET /api/tool-health?refresh=0
```

### Pemeriksaan paksa

```http
POST /api/tool-health
Authorization: Bearer HEALTH_CHECK_TOKEN
```

Pemeriksaan paksa ditolak jika token belum dipasang atau tidak cocok.

## Environment Variables

Konfigurasi lama tetap digunakan:

```env
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service_role_key_server_only
DATABASE_TIMEOUT_MS=8000
FEEDBACK_HASH_SALT=random_string_panjang
```

Tambahkan untuk v4.2:

```env
HEALTH_CHECK_TOKEN=random_token_panjang
HEALTH_CHECK_TIMEOUT_MS=4500
HEALTH_CHECK_CONCURRENCY=6
HEALTH_STALE_MS=900000
HEALTH_DEGRADED_LATENCY_MS=2500
```

Hanya `HEALTH_CHECK_TOKEN` yang perlu dibuat sendiri. Nilai tuning lain memiliki default dan bersifat opsional.

Jangan menaruh service role key atau health token di HTML, JavaScript browser, GitHub, atau screenshot publik.

## Menjalankan di Termux

```bash
pkg install nodejs -y
npm run check
npm test
npm run build
npm run dev
```

Buka:

```text
http://127.0.0.1:4173
```

`serve-local.js` mendukung:

```text
GET  /api/health
GET  /api/database?resource=status
POST /api/feedback
POST /api/audit
GET  /api/tool-health
POST /api/tool-health
```

## Validasi

```bash
npm run check
npm test
npm run build
```

Laporan lengkap tersedia di `V4_2_VALIDATION.md`.

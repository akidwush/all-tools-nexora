# All Tools Nexora v4.1 — Modular Lazy Load + Live Audit

Versi 4.1 mempertahankan modularisasi v4.0 dan meningkatkan mesin **Get Code HTML** dengan pemeriksaan jaringan nyata terhadap asset serta endpoint yang ditemukan pada source.

## Fitur utama v4.1

- `index.html` tetap ringan; payload fitur dimuat hanya ketika kartu tool dibuka.
- Get Code tetap mendeteksi asset HTML/CSS serta endpoint dari `fetch`, Axios, XHR, WebSocket, EventSource, beacon, form, dan data attribute.
- Tombol **Run Live Audit** menguji resource publik melalui `/api/audit`.
- Pemeriksaan live mencakup:
  - status HTTP;
  - latency;
  - redirect dan URL akhir;
  - `Content-Type` serta indikasi MIME mismatch;
  - indikasi risiko CORS untuk endpoint, module script, dan font lintas origin;
  - endpoint yang memerlukan autentikasi;
  - timeout, resource hilang, dan upstream error.
- Dashboard laporan menampilkan **Asset Readiness**, **API Readiness**, jumlah resource terjangkau, dan jumlah masalah.
- Hasil static report beserta live audit dapat disalin atau diunduh sebagai JSON.

## Probe aman

Live audit tidak mengirim data formulir dan tidak menjalankan request mutasi:

- asset serta endpoint `GET/HEAD` diperiksa dengan `HEAD`;
- jika server menolak `HEAD`, probe terbatas memakai `GET` dengan header `Range`;
- endpoint `POST`, `PUT`, `PATCH`, dan `DELETE` hanya diperiksa memakai `OPTIONS`;
- URL lokal, private network, reserved IP, kredensial URL, protokol non-HTTP, dan port berisiko diblokir;
- setiap redirect divalidasi ulang dan koneksi dipasang ke alamat IP publik hasil DNS untuk mengurangi risiko DNS rebinding;
- audit browser diproses per batch kecil dan dibatasi maksimal 120 resource per proses.

## Menjalankan di Termux

```bash
pkg install nodejs -y
cd all-tools-nexora-v4.1-live-audit
npm run check
npm test
npm run build
npm run dev
```

Buka:

```text
http://127.0.0.1:4173
```

`serve-local.js` mendukung endpoint berikut:

```text
GET  /api/health
GET  /api/database?resource=status
POST /api/feedback
POST /api/audit
```

## Request API audit

```json
{
  "target": "https://example.com/page",
  "items": [
    {
      "id": "asset-0",
      "type": "asset",
      "kind": "script",
      "method": "HEAD",
      "url": "https://example.com/assets/app.js",
      "scope": "internal"
    }
  ]
}
```

Setiap request API menerima maksimal 16 item secara default. Frontend Get Code otomatis membagi audit menjadi beberapa batch.

## Environment Variables

Konfigurasi Supabase tetap sama:

```env
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service_role_key_server_only
DATABASE_TIMEOUT_MS=8000
FEEDBACK_HASH_SALT=random_string_panjang
```

Tuning live audit bersifat opsional:

```env
AUDIT_TIMEOUT_MS=4000
AUDIT_MAX_ITEMS=16
AUDIT_CONCURRENCY=6
```

Jangan menaruh `SUPABASE_SERVICE_ROLE_KEY` di HTML, JavaScript browser, GitHub, atau screenshot publik.

## Validasi

```bash
npm run check
npm test
npm run build
```

Dokumentasi hasil validasi tersedia di `V4_1_VALIDATION.md`.

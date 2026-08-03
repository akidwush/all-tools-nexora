# Validasi Nexora v4.1 — Get Code Live Asset & Endpoint Audit

## Ruang lingkup

Patch ini dibangun di atas v4.0 modular + lazy-load. Perubahan difokuskan pada pemeriksaan jaringan nyata di mesin Get Code tanpa menggabungkan kembali payload ke `index.html`.

## Implementasi

### Backend

- Endpoint baru: `POST /api/audit`
- Library baru: `lib/audit.js`
- Batas payload: 220 KB
- Batas default: 16 resource per request
- Concurrency default: 6
- Timeout default: 4.000 ms per resource
- Rate limit proses: 20 batch per menit per alamat klien
- Metode non-idempotent tidak dijalankan; hanya diprobe dengan `OPTIONS`

### Proteksi SSRF

- hanya `http:` dan `https:`;
- URL dengan username/password ditolak;
- hostname lokal dan internal ditolak;
- IPv4/IPv6 privat, loopback, link-local, multicast, dokumentasi, dan reserved ditolak;
- port dibatasi ke 80, 443, 8080, dan 8443;
- seluruh alamat hasil DNS diperiksa;
- redirect divalidasi ulang;
- koneksi produksi menggunakan alamat publik yang sudah diperiksa sebagai pinned lookup.

### Frontend Get Code

- tombol **Run Live Audit**;
- progress batch dan status proses;
- status per asset/endpoint;
- HTTP status, latency, content type, redirect, probe method, CORS, dan MIME chips;
- Asset Readiness dan API Readiness;
- JSON report memuat hasil live audit;
- maksimal 120 resource per proses frontend.

## Pengujian otomatis

`npm test` mencakup:

- database request dan health check;
- klasifikasi private IP;
- blokir localhost dan protokol tidak aman;
- redirect chain;
- MIME validation;
- CORS evaluation;
- endpoint POST diprobe dengan OPTIONS;
- private target tidak pernah diteruskan ke fetch;
- scoring batch audit.

## Hasil validasi

```text
npm run check  : LULUS
npm test       : LULUS
npm run build  : LULUS
```

Build menghasilkan `public/` untuk file statis. Serverless function tetap berada pada folder `api/`.

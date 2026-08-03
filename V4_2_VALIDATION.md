# Validasi Nexora v4.2 — Tool Health Monitoring

## Ruang lingkup

Patch ini dibangun di atas Nexora v4.1. Modular lazy loading dan Get Code live audit dipertahankan. Perubahan difokuskan pada pemantauan kesehatan 22 tools dan dependency utama secara aman, ringan, dan persisten.

## Implementasi backend

- Endpoint baru: `/api/tool-health`.
- Library baru: `lib/tool-health.js`.
- Katalog tetap berisi 22 tools.
- Target probe ditentukan server-side dan tidak menerima URL bebas dari klien.
- Probe menggunakan `HEAD`; jika ditolak dengan `405/501`, sistem memakai `GET` terbatas dengan `Range`.
- Timeout default: 4.500 ms.
- Concurrency default: 6.
- Cache stale default: 15 menit.
- Latency di atas 2.500 ms diklasifikasikan `degraded`.
- Probe dependency yang sama dideduplikasi dalam satu proses.
- Pemeriksaan paksa dilindungi token dengan perbandingan timing-safe.
- Proses bersamaan pada instance serverless yang sama memakai satu active promise.

## Persistensi Supabase

Tabel baru `tool_health` menyimpan:

- tool ID dan nama;
- kategori;
- status;
- target type;
- HTTP status;
- latency;
- success rate;
- total pemeriksaan;
- jumlah pemeriksaan berhasil;
- consecutive failures;
- error terakhir;
- last checked dan last success;
- metadata terbatas.

Migration tersedia di `database/migrations/002_tool_health.sql`. Tabel memakai RLS tanpa policy anon dan hanya diakses melalui service role server-side.

## Implementasi frontend

- Widget status ditampilkan setelah kartu informasi perangkat.
- Ringkasan menampilkan jumlah normal, degraded, dan offline.
- Panel detail menampilkan seluruh tools, latency, success rate, HTTP status, serta error terakhir.
- Data browser dicache selama 5 menit untuk render awal yang cepat.
- Panel dapat ditutup dengan tombol, klik backdrop, atau tombol Escape.
- Tampilan mobile memakai bottom sheet; desktop memakai dialog tengah.

## Integrasi health check

`/api/health` sekarang menyertakan ringkasan tool health dari cache. Gangguan tool eksternal menghasilkan status `healthy-with-tool-warnings`, tetapi tidak mengubah HTTP website menjadi 503 selama database dan aplikasi utama tetap sehat.

## Pengujian otomatis

`npm test` mencakup:

- database request dan health response;
- SSRF guard serta live audit v4.1;
- probe HTTP 200;
- fallback HEAD ke GET;
- klasifikasi offline pada HTTP 503;
- klasifikasi degraded pada latency tinggi;
- concurrency dan ringkasan status;
- respons katalog ketika database belum tersedia;
- proteksi pemeriksaan paksa saat token belum dikonfigurasi.

## Hasil validasi

```text
npm run check  : LULUS
npm test       : LULUS
npm run build  : LULUS
```

Build menghasilkan folder `public/` untuk aset statis. Function serverless tetap berada di folder `api/`.

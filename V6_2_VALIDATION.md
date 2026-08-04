# Nexora v6.2 — Stability, Functional Audit, dan Mobile Redesign

## Fokus rilis

Rilis ini menghentikan penambahan fitur baru dan memprioritaskan stabilitas 37 tools yang sudah ada.

### Perbaikan inti

- Dispatcher lazy-load tidak lagi memanggil `window.showTool` secara rekursif setelah modul selesai dimuat.
- Registry tunggal mendokumentasikan 37 tool, handler, modul, mode, dan dependensinya.
- Tool health mencakup 37 tool, bukan hanya 22 tool.
- HTTP 401, 403, 404, 405, dan 429 dari API non-strict diperlakukan sebagai layanan terjangkau tetapi terbatas, bukan otomatis offline.
- Kartu tool menampilkan status Siap, Terbatas, Gangguan, atau Akses khusus.
- Tool berstatus offline ditahan sebelum membuka modul dan menampilkan pesan yang jelas.
- Functional Audit memeriksa kartu DOM, module loader, handler, dependensi, HTTP status, dan latency tanpa menjalankan upload/download atau mutasi.

## Mobile admin redesign

Bottom navigation dipadatkan menjadi lima menu:

1. Home
2. Tools
3. Insight
4. Inbox
5. Lainnya

Menu Lainnya menampung Sosial Media, Tool Health, Functional Audit, Visual QA, Audit Log, tautan website, dan logout.

Perbaikan responsive meliputi:

- tidak ada horizontal scroll pada bottom navigation;
- toolbar menjadi satu kolom di HP;
- modal menjadi bottom sheet penuh;
- tabel health memiliki area scroll yang jelas;
- card, spacing, typography, dan tombol disesuaikan untuk layar 360–430 px;
- ruang fitur menggunakan tombol kembali compact agar judul tidak terpotong.

## Compatibility

- Tidak menambah Serverless Function baru.
- Tetap 12/12 function untuk Vercel Hobby.
- Tidak membutuhkan migration SQL baru.
- Migration sampai `006_social_links.sql` tetap digunakan.

## Validasi

```text
npm run check
npm test
npm run build
```

Audit build wajib memverifikasi:

- 37/37 tool registry unik;
- 37/37 tool health catalog;
- seluruh modul lazy-load tersedia;
- dispatcher tanpa pola rekursif lama;
- bottom navigation tepat lima tombol;
- Functional Audit tersedia di dashboard;
- output Vercel tetap maksimum 12 functions.

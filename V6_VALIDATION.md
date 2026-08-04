# Nexora v6.0 — Runtime JavaScript Test, Screenshot, dan Visual Validation

## Ruang lingkup

Versi 6.0 dibangun di atas v5.1 dan mempertahankan modular lazy-load, live asset audit, tool health monitoring, login admin, analytics, feedback management, serta audit log.

## Runtime JavaScript observer

Setiap halaman utama memuat `assets/js/core/runtime-observer.js` sejak awal dokumen. Observer mencatat:

- JavaScript runtime error;
- unhandled promise rejection;
- `console.error` dan `console.warn`;
- resource yang gagal dimuat;
- event `nexora:tool-error`;
- long task browser;
- broken image;
- duplicate DOM ID;
- input tanpa label;
- horizontal overflow;
- resource timing dan ukuran transfer yang tersedia.

Pada halaman beranda, Visual QA dapat memuat dan menguji seluruh 13 paket modul lazy-load melalui `NexoraModules.ensure()` tanpa menekan satu per satu kartu tool.

## Screenshot browser

Dashboard admin memiliki panel **Visual QA** untuk route:

- `/`
- `/about`
- `/feedback`
- `/admin/login`
- `/admin`

Viewport tersedia:

- Mobile `390×844`
- Tablet `768×1024`
- Desktop `1440×900`

Screenshot dibuat di browser admin dari iframe same-origin. DOM dan stylesheet lokal diserialisasi ke SVG `foreignObject`, lalu dirender ke canvas dan dikompresi menjadi JPEG. Gambar same-origin atau CORS-compatible dimasukkan sebagai data URL. Resource cross-origin yang tidak mengizinkan CORS diganti placeholder agar canvas tidak terkontaminasi.

Screenshot dapat diunduh langsung dari dashboard. Proses tidak memerlukan Chromium serverless atau API screenshot pihak ketiga.

## Visual baseline dan perbandingan

Screenshot diturunkan menjadi fingerprint luminance `32×32`. Baseline menyimpan:

- route dan viewport;
- ukuran viewport;
- fingerprint;
- SHA-256 screenshot;
- thumbnail JPEG;
- toleransi perubahan visual.

Run berikutnya membandingkan fingerprint saat ini dengan baseline dan menghasilkan persentase visual difference. Status run:

- `pass`
- `warning`
- `fail`
- `error`

Runtime error atau modul gagal menghasilkan `fail`. Resource error, horizontal overflow, warning, atau visual difference di atas ambang menghasilkan `warning`/`fail` sesuai tingkatnya.

## Persistensi dan keamanan

Endpoint baru:

```text
GET  /api/admin/visual
POST /api/admin/visual
```

Data disimpan dalam:

- `visual_baselines`
- `visual_test_runs`

Semua akses membutuhkan sesi admin. Mutasi membutuhkan CSRF valid. Pembuatan baseline hanya diizinkan untuk `admin` dan `super_admin`. Perubahan baseline dicatat pada audit log.

Migration:

```text
database/migrations/005_visual_runtime_validation.sql
```

## Batasan yang disengaja

- Screenshot adalah hasil renderer browser berbasis DOM/SVG, bukan screenshot sistem operasi.
- Video, audio, iframe bersarang, dan resource cross-origin tanpa CORS tidak dimasukkan ke screenshot.
- Visual QA menguji pemuatan modul lazy-load, bukan menjalankan aksi berbahaya atau mutasi pada setiap tool.
- Hasil visual dapat sedikit berbeda antar browser karena font dan rendering engine.

## Validasi

```text
npm run check  : PASS
npm test       : PASS
npm run build  : PASS
```

Build menghasilkan `public/`. API serverless tetap berada di `api/`.

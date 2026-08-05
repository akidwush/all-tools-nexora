# Patch Notes v6.3.9 — TikTok Runtime Fix Tahap 2

## Perbaikan utama

- Download MP4/MP3/JPG tidak lagi memakai `response.blob()` dan `URL.createObjectURL()`.
- Browser memulai download ke endpoint same-origin `/api/media-download`; API mengalirkan body upstream langsung ke respons.
- Fallback iframe yang mencatat sukses palsu dihapus.
- History hanya dicatat setelah probe server berhasil memvalidasi respons media.
- Endpoint memiliki allowlist host TikTok, validasi redirect, HTTPS-only, sanitasi filename, timeout, dan rate limit.
- Endpoint digabung ke `/api/tool-health?mode=media-download`, sehingga jumlah fungsi Vercel tetap 12/12.
- `MutationObserver` preview dihapus; satu controller dipasang secara eksplisit saat preview dibuat.
- Video lama dihentikan dan sumbernya dilepas sebelum format diganti atau preview baru dibuat.
- Atribut `crossorigin=anonymous` pada foto preview dihapus agar CDN tanpa CORS tetap dapat ditampilkan.

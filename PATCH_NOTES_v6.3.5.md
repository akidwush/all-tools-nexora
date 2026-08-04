# Patch Notes v6.3.5 — TikTok Media Frame Fix

Patch ini diterapkan di atas v6.3.4.

## Root cause

`width:100%` pada media belum cukup karena parent grid mobile memakai track `1fr` dengan minimum intrinsik `auto`. Gambar TikTok yang lebar dapat membesarkan track, panel, dan scroll container sekaligus.

## Isi patch

- `assets/css/features/tiktok.css`: frame guard untuk seluruh rantai layout dan media TikTok.
- `scripts/test-tiktok-media-layout-v635.js`: regression test khusus overflow foto/video.
- Metadata versi dan dokumentasi validasi v6.3.5.

## Deploy

Tidak ada perubahan database, API, atau environment variable. Jalankan `npm run check`, `npm test`, dan `npm run build` sebelum push.

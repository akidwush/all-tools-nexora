# Patch Notes v6.3.7 — Deploy Cache & Mobile Media Guard

## Perbaikan fatal

- Asset lazy-load sekarang memakai query version `?v=6.3.7`. CSS TikTok dan JavaScript admin tidak lagi tertahan cache browser/Vercel setelah deploy.
- Core CSS selalu membatasi frame TikTok, image, video, dan grid media ke lebar parent. Media remote memakai `object-fit: contain`, `min-width: 0`, dan `overflow-x: hidden` sehingga tidak menabrak frame pada mobile.
- Tombol `Tambah Tool` memiliki binding langsung yang null-safe dan delegated fallback. Modal tetap bisa dibuka jika shell admin sempat tercampur dengan HTML cache lama.
- Script dan stylesheet inti/admin diberi cache-buster yang sama agar deployment atomik terlihat oleh browser.

## Verifikasi

```bash
npm run check
npm test
npm run build
```

Semua pemeriksaan harus berakhir dengan `lulus`.

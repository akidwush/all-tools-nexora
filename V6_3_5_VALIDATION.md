# Validasi Nexora v6.3.5

## Bug yang diperbaiki

Foto atau video TikTok dengan ukuran intrinsik besar dapat menentukan minimum width kolom grid. Pada mobile, aturan kolom `1fr` masih memakai minimum `auto`, sehingga panel preview melebar melewati viewport dan media menabrak frame.

## Perbaikan

- Parent `tt-room-content`, `tt-full-wrap`, `tt-result-grid`, `tt-panel`, dan `tt-preview-box` dapat menyusut dengan `min-width:0`.
- Grid satu kolom menggunakan `minmax(0,1fr)`.
- Media utama dan fallback gallery dibatasi ke `width/max-width:100%` serta `object-fit:contain`.
- Scroll room hanya vertikal; overflow horizontal diputus di sumber layout.
- Tinggi preview mobile memakai batas viewport kecil (`svh`) dengan fallback `vh`.

## Perintah validasi

```bash
npm run check
npm test
npm run build
```

## Hasil yang diharapkan

- Foto landscape, portrait, dan carousel TikTok tidak melewati sisi kanan panel.
- Video MP4 HD/standar/watermark tetap berada di tengah frame.
- Thumbnail carousel masih dapat digeser horizontal di dalam strip sendiri.
- Tidak ada horizontal scroll pada room TikTok.

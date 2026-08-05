# Patch Notes v6.3.12 — Resilient Services

## Fake Bank Jago

- Timeout API dipangkas menjadi 6,5 detik.
- Timeout/error otomatis mengaktifkan renderer canvas lokal.
- Object URL lama dilepas saat generate ulang.
- Hasil selalu diberi label simulasi dan bukan bukti saldo.

## FakeDev

- Fallback lokal yang berhasil sekarang berstatus sukses.
- Deskripsi tool menjelaskan alur API-first dan local-fallback.

## Nexus AI

- Worm Auto mendapat jalur khusus sebelum validasi model primer.
- Guard internal mengizinkan router Worm tanpa membuka model backup untuk pemilihan manual.
- Multi-model mendeteksi respons sibuk/error pendek.
- Model yang gagal menjalankan failover secara terpisah.
- Maksimal dua failover berjalan bersamaan.

## Validasi

- `npm run check`
- `npm test`
- `npm run build`
- Serverless Function tetap dalam batas Vercel Hobby.

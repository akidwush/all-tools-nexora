# Nexora v6.2.1 — WhatsApp Public Visibility Fix

## Perbaikan
- API publik sekarang menyertakan `is_active`.
- Loader sosial tidak lagi menolak baris ketika field `is_active` tidak dikirim, selama tidak eksplisit `false`.
- Saluran WhatsApp dan Minta Akses tampil sebagai CTA permanen di halaman publik.
- Semua tombol tetap memakai data dari dashboard admin/Supabase.
- Tombol access di popup tetap menambahkan pesan tool secara dinamis.

## Validasi
- `npm run check`
- `npm test`
- `npm run build`

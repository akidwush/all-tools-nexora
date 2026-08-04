# Validasi Nexora v6.1 — Social Link Control

## Yang berubah

- Seluruh tujuan WhatsApp yang sebelumnya berada di `index.html` dan `shell.js` dipindahkan ke tabel `public.social_links`.
- Dashboard admin memiliki menu **Sosial Media** untuk mengubah platform, judul, deskripsi, URL, icon, warna, urutan, dan status aktif.
- Role `viewer` tetap read-only. Hanya `admin` dan `super_admin` yang boleh menyimpan perubahan.
- Mutation API memakai sesi admin, CSRF double-submit, pemeriksaan Origin, dan audit log yang sama dengan fitur admin lain.
- WhatsApp Channel dipakai otomatis oleh menu, popup akses, dan notifikasi. WhatsApp Access dipakai otomatis oleh tombol permintaan akses.
- Instagram, TikTok, YouTube, Facebook, Telegram, Discord, dan GitHub sudah disiapkan dalam keadaan nonaktif sampai URL diisi admin.

## Urutan deployment

1. Jalankan `database/migrations/006_social_links.sql` di Supabase SQL Editor.
2. Push source v6.1 ke repository GitHub yang sudah terhubung ke Vercel.
3. Tunggu deployment selesai, lalu buka `/admin`.
4. Masuk ke **Sosial Media**, edit URL, lalu aktifkan platform yang ingin ditampilkan.

## Pemeriksaan lokal

```bash
npm run check
npm test
npm run build
```

## Uji manual

1. Login sebagai `viewer`: tombol edit harus nonaktif.
2. Login sebagai `admin` atau `super_admin`: ubah WhatsApp Channel dan simpan.
3. Buka halaman utama pada tab baru. Menu WhatsApp, popup akses, dan notifikasi harus memakai URL terbaru.
4. Isi Instagram, aktifkan, lalu refresh halaman utama. Instagram harus muncul di menu Nexus.
5. Nonaktifkan sebuah platform. Link tersebut tidak boleh tampil kepada pengunjung.
6. Buka Audit Log dan filter `Social Link` untuk memastikan perubahan tercatat.

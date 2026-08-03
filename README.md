# All Tools Nexora — Developer Dika

Versi ini sudah diperbaiki dari arsip clone lama agar dapat dijalankan sebagai proyek Vercel yang normal dan diberi database Supabase saat dibutuhkan.

## Perbaikan penting

- Menghapus loop `/api/app` dan error strict-mode yang membuat runtime gagal terus-menerus.
- Menghapus kredensial layanan pesan dari frontend.
- Mengganti pusat feedback dengan endpoint server-side yang tervalidasi.
- Mengganti halaman profil lama menjadi Developer Dika.
- Menambahkan konfigurasi Vercel, security headers, health check, validasi build, dan skema database.
- Aplikasi tetap dapat dibuka tanpa database; laporan disimpan sementara di perangkat sampai database aktif.

## Jalankan di Termux

```bash
pkg install nodejs -y
cd all-tools-nexora-developer-dika
npm run check
npm run dev
```

Buka `http://127.0.0.1:4173` di browser HP.

## Verifikasi sebelum deploy

```bash
npm run check
npm run build
```

Tidak ada `npm install` yang berat karena proyek tidak memakai dependency tambahan.

## Aktifkan database nanti

1. Buat project Supabase.
2. Jalankan `database/schema.sql` melalui Supabase SQL Editor.
3. Tambahkan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan `FEEDBACK_HASH_SALT` di Environment Variables Vercel.
4. Redeploy. Status koneksi dapat diperiksa melalui `/api/health`.

`SUPABASE_SERVICE_ROLE_KEY` hanya boleh disimpan di Vercel, jangan dimasukkan ke HTML atau JavaScript browser.

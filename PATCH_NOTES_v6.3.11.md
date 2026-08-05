# Patch Notes v6.3.11 — Resilient Image Tools

## Remove Background
- Upload gambar diproses melalui AI lokal di browser terlebih dahulu.
- Jika model AI tidak tersedia, tool turun ke pemisah background lokal tanpa memanggil API.
- API Nanzz hanya menjadi cadangan terakhir, bukan dependency wajib.
- Percobaan upload API dibatasi timeout dan jumlah attempt agar UI tidak menggantung.
- Pesan hasil membedakan AI lokal, fallback lokal, dan API cadangan.

## FakeDev
- HTTP 400 atau gangguan endpoint IkyyXD tidak lagi mematikan tool.
- Generator canvas lokal otomatis membuat profil dengan nama, bio, foto opsional, dan avatar inisial.
- Foto eksternal yang gagal dimuat otomatis diganti avatar inisial tanpa men-taint canvas.
- Status API tetap jujur: peringatan ditampilkan ketika fallback lokal dipakai.

## Deployment
- Cache asset dinaikkan ke v6.3.11.
- Tidak menambah Vercel Serverless Function; tetap 12/12.

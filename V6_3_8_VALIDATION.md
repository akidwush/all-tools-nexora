# Validasi Nexora v6.3.8

- Dispatcher lazy TikTok memanggil `openTiktokRoom` secara eksplisit.
- Preview video memprioritaskan sumber standar/ringan.
- Request preview mendukung pembatalan dengan `AbortController`.
- Penutupan room menghentikan media, menghapus `src`, dan membersihkan konten.
- Observer preview dibatasi ke overlay TikTok.
- `npm test` dan `npm run build` wajib lulus sebelum deploy.

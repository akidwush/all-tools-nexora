# Validasi Nexora v6.3.9

- [x] Tidak ada Blob penuh pada downloader TikTok.
- [x] Tidak ada fallback iframe atau pencatatan history palsu.
- [x] Streaming endpoint memakai fungsi serverless yang sudah ada.
- [x] Host dan redirect media divalidasi untuk mencegah SSRF.
- [x] Jumlah Vercel Functions tetap maksimal 12.
- [x] Preview memakai satu controller tanpa MutationObserver permanen.
- [x] Media dilepas saat format berubah dan room ditutup.
- [x] Test regresi dan production build dijalankan sebelum distribusi patch.

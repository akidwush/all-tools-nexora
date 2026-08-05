# Patch Notes v6.3.8 — TikTok Runtime Fix Tahap 1

## Diperbaiki

- TikTok sekarang dibuka langsung melalui `openTiktokRoom()` setelah modul lazy selesai dimuat, bukan melalui modal legacy `toolViewer`.
- Preview awal memprioritaskan MP4 standar yang lebih ringan; URL HD tetap tersedia untuk tombol download.
- Request preview lama dibatalkan saat pengguna menjalankan preview baru atau menutup TikTok Room.
- Video/audio langsung dihentikan dan `src` dilepas ketika room ditutup agar decoder dan jaringan tidak terus berjalan di background.
- Isi TikTok Room dibersihkan setelah animasi tutup sehingga media lama tidak tertahan di RAM.
- `MutationObserver` hanya mengawasi `#ttRoomOverlay`, bukan seluruh `document.body`.
- Cache version asset dinaikkan ke `6.3.8` agar browser mengambil JavaScript terbaru setelah deploy.

## Sengaja belum diubah pada tahap ini

- Download video masih menggunakan alur Blob di browser.
- Fallback iframe dan pencatatan history download belum direvisi.
- Duplikasi sistem kontrol preview belum disederhanakan.

Bagian tersebut masuk tahap kedua karena memerlukan perubahan jalur download dan pengujian lintas browser yang lebih luas.

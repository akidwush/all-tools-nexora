# Patch Notes v6.3.10 — Functional Audit & Visual QA Hotfix

## Perbaikan utama

- Functional Audit tidak lagi menganggap tool hilang hanya karena kartunya belum dirender oleh pagination/progressive grid.
- Ketersediaan tool sekarang diverifikasi melalui `window.NexoraToolCatalog`, lalu DOM hanya digunakan untuk mengetahui apakah kartu sedang terlihat.
- Selector audit mendukung `data-tool-id` dan `data-nx-room-tool`.
- Pesan palsu `Kartu tool tidak ditemukan di DOM.` diganti dengan pemeriksaan katalog publik yang akurat.
- Visual QA memiliki tiga tahap renderer: DOM penuh, DOM ketat tanpa aset eksternal, dan Safe Layout.
- Safe Layout menggambar struktur, panel, border, media placeholder, dan teks menggunakan canvas lokal tanpa mengambil aset lintas origin.
- Saat Safe Layout dipakai, hasil tetap dapat diekspor dan laporan memberi peringatan nonfatal beserta jenis renderer.
- Cache asset dinaikkan ke v6.3.10.

## Dampak

Tool seperti Fake Lobby, Windows Quotes, Nokia Message, Tanya Ustadz, dan ML Tools tidak lagi ditandai `Tidak Lengkap` hanya karena berada di luar 12 kartu pertama. Error `Tainted canvases may not be exported` tidak lagi menghentikan Visual QA.

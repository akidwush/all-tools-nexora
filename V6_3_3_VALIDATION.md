# NEXORA v6.3.3 — Mobile Hero Video Jank Fix

Perbaikan ini menghapus jalur fatal yang memaksa video banner H.264 60 FPS terus diputar pada HP modern.

## Perubahan

- Deteksi perangkat mobile tidak lagi bergantung hanya pada `deviceMemory` dan `hardwareConcurrency`.
- Perangkat `(max-width: 900px)` atau `(pointer: coarse)` memakai mode manual.
- Mode mobile tidak pernah autoplay.
- Video langsung dijeda saat pengguna mulai scroll, saat banner keluar viewport, saat tab disembunyikan, dan saat halaman ditutup.
- Desktop hanya autoplay ketika banner benar-benar terlihat.
- `src` tetap kosong sampai banner masuk viewport.
- Rule CSS `nx-anime-banner-enabled` yang memaksa `display:block!important` dihapus.
- Tombol play/pause manual ditambahkan agar banner anime tetap bisa digunakan.
- Data Saver, reduced motion, jaringan 2G, dan perangkat rendah tetap menonaktifkan video sepenuhnya.

## Target

- Tidak ada decode video berkelanjutan ketika pengguna membaca bagian All Tools.
- Scroll mobile tidak lagi berbagi main/compositor workload dengan video hero di luar viewport.
- Banner tetap terlihat dan dapat diputar secara manual.

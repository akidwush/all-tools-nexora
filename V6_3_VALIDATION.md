# Nexora v6.3 — Public Performance Optimization

## Perbaikan
- Katalog 37 tools dirender langsung dari data lokal tanpa menunggu Supabase.
- Sinkronisasi konfigurasi database berjalan setelah first paint.
- Splash dipangkas dari sekitar 5 detik menjadi kurang dari 1 detik.
- Video hero tidak lagi autoplay/preload pada HP; desktop memuatnya saat idle.
- Delapan preconnect API eksternal dihapus dari critical path.
- Runtime observer hanya dimuat saat Visual QA (`__nexora_visual_test=1`).
- Tool health publik membaca snapshot Supabase (`refresh=0`) dan tidak memicu 37 probe eksternal.
- Duplikasi request health antara widget dan stability layer dihapus.
- Social links memakai fallback/cache dan refresh setelah first paint.
- Analytics page-view ditunda dan memakai sendBeacon jika tersedia.
- Low-power mode menonaktifkan blur serta animasi berat di Android/data-saver/perangkat RAM rendah.
- Asset publik mendapat cache browser konservatif selama 1 jam.

## Kompatibilitas
- Serverless Functions tetap 12/12.
- Tidak ada migration SQL baru.
- Visual QA tetap berfungsi melalui query khusus.
- WhatsApp publik tetap tampil dari fallback dan database.

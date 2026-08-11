# Image Vectorizer HF9.2

- Verifikasi konfigurasi FreeConvert saat tool dibuka; UI tidak lagi mengklaim READY secara palsu.
- Pesan error membedakan API key belum terpasang/ditolak, quota/rate limit, timeout, dan upload network failure.
- Detail kegagalan upload ditampilkan agar debugging di HP tidak buta.
- Export URL detection dibuat lebih toleran dan timeout download SVG dinaikkan menjadi 30 detik.
- FREECONVERT_API_KEY tetap server-only.

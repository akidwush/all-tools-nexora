# World Classics Translation HF2

Hotfix lanjutan untuk World Classics V1. Screenshot kegagalan menunjukkan pesan yang berasal dari respons HTTP non-2xx layanan penerjemah. Kode V1 menyamakan semua penyebab menjadi `TRANSLATION_UNAVAILABLE`, sehingga screenshot itu sendiri tidak membuktikan apakah penyebabnya key, izin, kuota, format request, atau model.

Perubahan:

- Membedakan key invalid/expired/blocked, izin 403, model 404, kuota nol/harian/permintaan 429, konfigurasi akun/wilayah, request 400, serta provider 5xx.
- Menggunakan schema paragraf `responseSchema` untuk request terstruktur; tetap memvalidasi jumlah, ID dan isi setiap paragraf sebelum cache ditulis. Ini perbaikan kompatibilitas request, bukan klaim bahwa schema adalah penyebab pasti kegagalan production.
- Membersihkan spasi, pembungkus kutip, dan prefix assignment `GEMINI_API_KEY=` yang tidak sengaja ditempel ke nilai secret. Karakter kontrol/internal whitespace ditolak sebelum request provider.
- Setelah satu worker gagal, request lain yang berjalan dibatalkan dan bagian bab yang mengantre tidak diteruskan. Dua request awal masih bisa sudah terkirim. Tidak melakukan retry otomatis atau mengganti model/akun untuk menghindari batas kuota.
- Log Edge hanya memuat kode error aman, HTTP status provider dan model. Tidak memuat key, teks bab, pesan provider mentah, atau project ID.
- Pesan teks asli tidak digandakan. Tampilan Indonesia yang sudah dipilih dipertahankan setelah terjemahan selesai.
- Cache bust reader agar browser mengambil perbaikan terbaru.

## Pemasangan

```bash
cd ~/all-tools-nexora
bash ~/storage/downloads/APPLY_NEXORA_CLASSICS_TRANSLATION_HF2.sh
```

Setelah push, jalankan GitHub Actions → **World Classics — Verify and Deploy** → Run workflow → main. Frontend dan Edge sama-sama perlu versi baru; push frontend saja tidak memperbarui Edge. **Tidak ada SQL atau migration baru pada hotfix ini.**

Setelah deployment selesai, muat ulang reader dan coba tombol Terjemahkan bab sekali. Jika masih ditolak, pesan baru menunjukkan kategori masalah. Pada Supabase → Edge Functions → translate-classic → Logs, cari `[world-classics translation]` untuk HTTP status dan model.

| Kode di log | Tindakan admin |
|---|---|
| TRANSLATION_KEY_INVALID | Perbaiki nilai GEMINI_API_KEY pada repository Actions secret, lalu jalankan workflow agar diterapkan ke Supabase Edge |
| TRANSLATION_ACCESS_DENIED | Periksa key restrictions dan izin Generative Language API pada project pemilik key; key yang khusus browser/referrer tidak cocok untuk request server |
| TRANSLATION_MODEL_UNAVAILABLE | Atur repository Actions variable WORLD_CLASSICS_MODEL ke model yang tersedia untuk akun, lalu jalankan workflow |
| TRANSLATION_QUOTA_UNAVAILABLE / TRANSLATION_DAILY_QUOTA | Periksa kuota dan paket akun di AI Studio; kode tidak dapat menambah kuota akun |
| TRANSLATION_RATE_LIMIT | Tunggu sebelum mencoba lagi |
| TRANSLATION_REQUEST_REJECTED / TRANSLATION_ACCOUNT_SETUP | Periksa konfigurasi model/paket/wilayah; catat kode dan providerStatus dari log, jangan kirim secret |
| TRANSLATION_UNAVAILABLE / TRANSLATION_CONNECTION / TRANSLATION_TIMEOUT | Gangguan layanan, koneksi, atau waktu pemrosesan; coba kemudian atau gunakan bab lebih pendek |

GEMINI_API_KEY reader harus terpasang di **Supabase Edge Secrets**. Workflow mengambilnya dari GitHub Actions Secrets. Key yang hanya disimpan di Vercel tidak menjadi environment Edge secara otomatis. Default model dan batas kuota V1 tidak diubah oleh hotfix.

Verifikasi lokal: 13 kelompok tes Deno (termasuk matriks status provider, sanitasi error/log, normalization key, schema request, dan pembatalan worker), tes DOM reader, serta build/regression existing. Tidak ada akses ke credentials/project produksi dalam sesi pengerjaan; keberhasilan terjemahan nyata pada akun pengguna belum dapat dikonfirmasi.

Referensi resmi: https://ai.google.dev/gemini-api/docs/troubleshooting dan https://ai.google.dev/gemini-api/docs/structured-output .

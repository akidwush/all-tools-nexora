# Validasi Nexora v6.3.12

Target validasi:

- Fake Bank Jago menghasilkan simulasi lokal ketika API gagal.
- Hasil lokal memiliki watermark anti-penyalahgunaan.
- Worm Auto masuk ke `callWorm()` dan tidak ditolak sebagai backup model.
- Multi-model mengganti respons sibuk dengan failover per model.
- FakeDev local fallback berstatus sukses.
- Seluruh JavaScript valid.
- Production build berhasil.
- Jumlah Serverless Function tidak bertambah.

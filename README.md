# All Tools Nexora v6.3.12

Rilis ketahanan layanan untuk tool yang bergantung pada API eksternal. Fokus v6.3.12 adalah menjaga Fake Bank Jago dan Nexus AI tetap dapat digunakan ketika provider timeout, sibuk, berubah, atau gagal.

## Perubahan utama v6.3.12

- Fake Bank Jago memakai API sumber terlebih dahulu lalu otomatis membuat PNG simulasi lokal jika API timeout atau gagal.
- Hasil lokal Fake Bank diberi watermark besar `SIMULASI — BUKAN BUKTI SALDO`.
- Worm Auto tidak lagi ditolak sebagai “model backup” sebelum router Worm dijalankan.
- Worm mencoba route asli, core Nexus, DeepSeek, lalu backup publik secara otomatis.
- Multi-model memvalidasi respons “model sedang sibuk” dan menjalankan failover per model.
- Failover Multi-model dibatasi dua worker agar tidak membanjiri provider dari HP.
- FakeDev fallback lokal ditampilkan sebagai keberhasilan, bukan error/peringatan palsu.
- Tidak menambah Serverless Function; tetap kompatibel dengan batas Vercel Hobby.

## Upgrade

Tidak ada migration SQL atau environment variable baru.

```bash
npm install
npm run check
npm test
npm run build
```

## Environment Vercel

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY atau SUPABASE_SECRET_KEY
HEALTH_CHECK_TOKEN
DATABASE_TIMEOUT_MS
FEEDBACK_HASH_SALT
```

## Endpoint

Jumlah function fisik tetap maksimal 12. Alias `/api/analytics`, `/api/database`, dan `/api/media-download` menggunakan rewrite di `vercel.json`.

Dashboard admin:

```text
/admin
/admin/login
```

## Catatan

Tool yang memakai provider publik tetap dapat mengalami gangguan eksternal. v6.3.12 mencegah kegagalan tunggal langsung mematikan fitur dengan fallback lokal atau failover provider yang jujur.

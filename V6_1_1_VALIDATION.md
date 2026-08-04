# Validasi Nexora v6.1.1 — Vercel Hobby Function Limit Fix

## Masalah yang diperbaiki

Vercel Hobby menolak deployment v6.0 dan v6.1 karena source memiliki 14 file JavaScript di folder `api/`, sedangkan deployment hanya menerima maksimal 12 Serverless Functions.

## Perubahan arsitektur

- Handler publik analytics dipindahkan ke `lib/public-analytics.js` dan dijalankan melalui `api/feedback.js?mode=analytics`.
- Handler publik database dipindahkan ke `lib/public-database.js` dan dijalankan melalui `api/health.js?mode=database`.
- File `api/analytics.js` dan `api/database.js` dihapus.
- Alias lama `/api/analytics` dan `/api/database` tetap bekerja melalui `rewrites` pada `vercel.json`.
- Seluruh pemanggilan internal memakai endpoint gabungan yang canonical.
- Test baru memastikan jumlah function tidak pernah melewati `12`.

## Hasil

```text
Serverless Functions: 12/12
Migration baru: tidak ada
Environment baru: tidak ada
Database: tidak berubah
```

## Validasi

```bash
npm run check
npm test
npm run build
```

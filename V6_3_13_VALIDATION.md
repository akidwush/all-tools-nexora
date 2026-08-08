# Nexora v6.3.13 Validation — SiteGrabber-X API Integration

## Scope

- Menambahkan SiteGrabber-X API v1 ke workspace **Get Code HTML**.
- API key hanya dibaca server-side dari `SITEGRABBER_API_KEY`.
- Browser hanya memanggil endpoint same-origin `/api/sitegrabber`.
- Integrasi memakai rewrite ke `api/tool-health.js?mode=sitegrabber`, sehingga tidak menambah Vercel Function baru.
- Mendukung `single-page`, `full-website`, dan `asset-collector`.
- Job dipoll sampai selesai, kemudian clone ZIP, report JSON, dan reports ZIP dapat diambil.
- Capture mewajibkan konfirmasi izin dari UI dan mempertahankan guard SiteGrabber-X.
- Proxy menambahkan throttling per-IP untuk mengurangi penyalahgunaan quota API key bersama.

## Required Vercel Environment Variables

```env
SITEGRABBER_API_BASE_URL=https://sitegrabber-x-production.up.railway.app
SITEGRABBER_API_KEY=sgx_live_your_server_only_key
```

Jangan menaruh key di `NEXT_PUBLIC_*`, HTML, JavaScript frontend, atau Git.

## Validation

Run:

```bash
npm test
npm run build
```

Expected: all regression tests pass and Vercel serverless count remains within the Hobby limit.

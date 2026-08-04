# NEXORA v6.3.1 — Unlocked Tools Validation

## Perubahan

- `Upload TikTok HD` tidak lagi menampilkan popup Minta Akses.
- Kartu Upload TikTok HD membuka TikTok Studio resmi pada tab baru.
- `Web Encryption` tidak lagi berstatus restricted.
- Web Encryption menjadi tool lokal lazy-load berbasis Web Crypto API.
- Source HTML dienkripsi menggunakan AES-256-GCM.
- Kunci diturunkan dari password menggunakan PBKDF2-SHA256 180.000 iterasi.
- Hasil berupa satu file HTML mandiri yang dapat diunduh atau disalin.
- Event interceptor access-lock lama dihapus; markup kompatibilitas tetap tersembunyi dan tidak lagi dipanggil oleh kedua tool.
- Functional registry dan tool health sekarang mengklasifikasikan kedua tool sebagai tersedia.

## Batasan

- Upload langsung ke akun TikTok memerlukan autentikasi TikTok; integrasi ini membuka TikTok Studio resmi agar user menyelesaikan upload secara aman.
- Web Encryption adalah perlindungan client-side, bukan DRM absolut. Source asli dan password harus disimpan terpisah.

## Validasi

```text
Package version          : 6.3.1
Tool registry            : 37 tools
TikTok HD restricted     : false
Web Encryption restricted: false
Web Encryption crypto    : AES-GCM + PBKDF2-SHA256
Serverless Functions     : tetap 12/12
npm run check            : PASS
npm test                 : PASS
npm run build            : PASS
```

Tidak ada migration SQL atau environment variable baru.

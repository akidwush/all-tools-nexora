# Audit Keamanan dan Stabilitas

Tanggal audit: 12 Agustus 2026  
Versi hasil perbaikan: 6.3.18

## Ringkasan

Audit mencakup frontend, iframe tool, 12 Vercel Functions, proxy pihak ketiga, autentikasi admin, database, server lokal, build, dan regression test. Temuan fatal yang dapat diperbaiki tanpa mengubah produk telah ditutup dalam versi ini.

| Tingkat | Temuan | Perbaikan |
|---|---|---|
| Kritis | Modul browser yang sudah tidak terdaftar masih dikirim dan memuat kredensial API lama | Modul, CSS, dan referensi manifest/lazy loader dihapus |
| Kritis | HTML legacy dari payload dapat berjalan dalam iframe tanpa isolasi memadai | Semua iframe `srcdoc` memakai sandbox tanpa `allow-same-origin`; pesan lintas frame memvalidasi `event.source` |
| Tinggi | Server lokal dapat menyajikan `.env`, SQL, package metadata, dan source backend | Static file diubah menjadi whitelist halaman/asset publik; jalur privat selalu 404 |
| Tinggi | Server lokal tidak meniru sebagian besar rewrite dan membatasi semua JSON ke 64 KB | Seluruh rute manifest didukung; query, JSON/binary body, `.json()`/`.send()`, serta batas per endpoint ditambahkan |
| Tinggi | URL hasil FreeConvert dapat mengarah ke host/IP privat dan respons dibuffer tanpa batas aman | Resolusi publik, DNS pinning, HTTPS, redirect limit, timeout, dan batas 4 MB diterapkan |
| Tinggi | Redirect SiteGrabber dapat meneruskan bearer token ke origin lain | Redirect ditangani manual; mutasi/lintas-origin ditolak dan Authorization dihapus untuk download yang diizinkan |
| Tinggi | Deploy Center memuat JSZip dari CDN tanpa verifikasi isi | Dependensi CDN dikunci dengan SHA-512 Subresource Integrity, CORS anonim, dan tanpa referrer |
| Tinggi | ZIP 3,6 MB menjadi payload base64 yang berisiko melewati body Function 4,5 MB | Batas ZIP diturunkan menjadi 3,2 MB |
| Tinggi | Cache dan rate-limit `Map` dapat tumbuh tanpa batas pada instance yang hidup lama | Helper bounded store, expiry pruning, dan batas in-flight diterapkan |
| Sedang | Katalog UI memiliki 43 tool tetapi health catalog/seed hanya 42 | `svgalight` ditambahkan dan audit sinkronisasi otomatis dibuat |
| Sedang | Feedback tidak memiliki batas body dan fallback hash salt dapat ditebak | Body dibatasi 8 KB dan salt fallback dibuat acak per proses |
| Sedang | Test/build bergantung pada nomor rilis serta dokumen historis | Audit dinamis, test runner, dan build deterministik menggantikannya |
| Sedang | Situs tidak mengirim CSP dan metadata social sharing tidak lengkap | CSP kompatibel dipasang pada Vercel/server lokal; Open Graph dan Twitter Card dilengkapi |
| Sedang | Image Vectorizer hanya memantau task ekspor sehingga penyebab task induk hilang | Task convert dan export dipantau terpisah; kode kuota, autentikasi, timeout, dan provider diteruskan ke UI |
| Tinggi | Integrasi upscaler publik dapat membocorkan API key atau menguras kuota provider | Big Image memakai proxy server-only, token job HMAC, batas per-IP/global, dan tidak mengirim key ke browser |
| Tinggi | Bigjpg membutuhkan URL publik sehingga file pengguna berisiko diletakkan pada storage terbuka | Sumber disimpan di bucket Supabase privat, hanya dibagikan lewat signed URL terbatas waktu, lalu dibersihkan pada status terminal/cancel/expiry |
| Sedang | Health Big Image dapat terlihat siap walau akun Bigjpg menolak task dengan `requires_vip` | Status diubah menjadi key configured dengan capability belum terverifikasi; UI beralih ke enhancer lokal hingga 2× dan menyebut engine hasil secara eksplisit |

## Verifikasi

Jalankan:

```bash
npm run check
npm test
npm run build
npm audit --omit=dev
```

Regression test memeriksa konsistensi 44 tool, sintaks seluruh JavaScript, batas 12 Functions, isolasi iframe, bounded memory, ukuran payload, route emulation, dan penolakan akses file privat dari server lokal.

## Risiko tersisa

- Tool yang memakai API pihak ketiga mengikuti ketersediaan, kuota, dan kontrak provider tersebut.
- Big Image mencoba Bigjpg terlebih dahulu sehingga gambar dapat dikirim kepada provider sebelum fallback lokal digunakan. Kebijakan retensi provider tetap berlaku di luar bucket privat Nexora; pengguna harus memiliki hak atas gambar yang dikirim.
- Source HTML legacy berukuran besar masih dipertahankan untuk beberapa tool aktif. Sandbox membatasi haknya, tetapi migrasi bertahap ke komponen native akan membuat pemeliharaan lebih mudah.
- CSP aktif masih mengizinkan inline script/style dan sejumlah origin eksternal untuk kompatibilitas payload legacy. Migrasikan handler dan payload tersebut bertahap agar `'unsafe-inline'` serta allowlist yang tidak lagi diperlukan dapat dihapus.
- Token deployment memiliki hak tinggi. Gunakan token scoped, rotasi berkala, lindungi `NEXUS_DEPLOY_ACCESS_KEY`, dan audit aktivitas provider.
- Audit ini tidak menggantikan penetration test terhadap deployment produksi beserta konfigurasi akun/provider yang sebenarnya.

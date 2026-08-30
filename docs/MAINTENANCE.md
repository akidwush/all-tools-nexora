# Panduan edit cepat Nexora

Konfigurasi utama berada di `assets/config.js`. File itu menjadi sumber untuk branding, katalog publik, pemetaan modul lazy-load, dan target health check. Jangan menyalin data tool ke `app.js`, `lazy-loader.js`, `tool-registry.js`, atau `lib/tool-health.js`.

## Mengubah branding

Edit bagian `brand`:

- `name`: nama lengkap website.
- `shortName`: nama pendek untuk admin.
- `owner`: nama developer.
- `title`, `description`, `canonicalUrl`, dan `logoUrl`: metadata halaman.
- `aiName`: nama default Personal AI.

Jalankan `npm run check` setelah mengubahnya.

## Menambah tool

1. Tambahkan satu object baru pada kategori `downloader`, `maker`, `tools`, `vault`, atau `external` di `assets/config.js`.
2. Isi `id`, `icon`, `name`, `description`, `badge`, `runtime`, dan `health`.
3. Jika memakai modul yang sudah ada, isi `runtime.module` dengan nama modul tersebut.
4. Jika membuat modul baru, tambahkan daftar CSS/JS-nya satu kali pada bagian `modules`.
5. Handler UI tetap dibuat di file feature terkait. Konfigurasi hanya menghubungkan kartu, lazy loader, registry, dan health check.

`npm run sync` membuat ulang `assets/module-manifest.json`. Perintah `npm test`, `npm run check`, dan `npm run build` juga melakukan sinkronisasi otomatis.

## Aturan tampilan

Nexora memakai layout mobile sebagai tampilan universal. `ui.desktopMotion` dan `ui.customCursor` sengaja nonaktif. Video hero tetap ada dan hanya autoplay pada HP yang cukup kuat; desktop, mode hemat data, perangkat lemah, dan pengguna reduced-motion menampilkan frame video statis.

## Gerbang sebelum deploy

```bash
npm ci
npm run check
npm test
npm run build
```

Deploy folder proyek ke Vercel seperti biasa. Build menghasilkan folder `public/`.

# Validasi Nexora v6.3.6

## Bug Visual QA

Renderer memakai SVG `foreignObject` untuk memotret iframe. Aset eksternal yang ikut ter-load membuat bitmap hasil render menjadi cross-origin/tainted, sehingga `HTMLCanvasElement.toBlob()` melempar `SecurityError`.

Perbaikan membersihkan `url(...)`, font eksternal, media, dan elemen embed dari clone screenshot. Gambar yang dapat diambil dengan CORS diubah menjadi data URL. Jika browser tetap menolak export, renderer mengulang capture dengan mode aman tanpa aset media.

## Manajemen katalog tool

- `POST /api/admin/tools`: membuat tool kustom berbasis URL eksternal.
- `PATCH /api/admin/tools`: mengubah metadata dan status aktif.
- `DELETE /api/admin/tools`: menghapus tool kustom.
- Tool bawaan dilindungi dari DELETE karena handler/module-nya berada di source code.
- Public catalog menerima row database yang tidak ada di registry statis selama memiliki URL eksternal.

## Validasi

```bash
npm run check
npm test
npm run build
```

Tidak ada migration database baru yang wajib dijalankan; tabel `public.tools`, kolom `metadata`, dan grant service role dari migration sebelumnya sudah mencukupi.

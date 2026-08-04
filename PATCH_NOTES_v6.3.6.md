# Patch Notes v6.3.6 — Visual QA Canvas Guard & Tool Catalog CRUD

Patch ini diterapkan di atas v6.3.5.

## Perbaikan

- Visual QA tidak lagi gagal hanya karena gambar, background, font, atau media lintas domain men-taint canvas.
- Dashboard admin dapat menambahkan tool eksternal baru tanpa mengubah source code.
- Tool kustom dapat diedit, dinonaktifkan, dan dihapus.
- Renderer publik tidak lagi membuang tool database yang belum memiliki handler internal; tool tersebut dibuka sebagai external link.
- Markup katalog diberi escaping untuk mencegah nilai database masuk sebagai HTML/JavaScript mentah.

## Database

Tidak ada SQL migration baru. Data tool kustom disimpan pada tabel `tools` yang sudah tersedia, menggunakan `metadata.origin=admin` dan `metadata.kind=external-link`.

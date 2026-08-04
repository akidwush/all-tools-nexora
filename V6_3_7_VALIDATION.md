# Validasi Nexora v6.3.7

- `assets/js/core/lazy-loader.js` menambahkan `?v=6.3.7` pada setiap CSS/JS feature sebelum disisipkan ke DOM.
- `index.html` dan `admin/index.html` memberi cache-buster pada asset inti, stylesheet admin, dan script dashboard.
- Guard di `assets/css/core.css` tetap aktif walaupun `assets/css/features/tiktok.css` terlambat atau gagal dimuat: semua parent memakai `min-width:0`/`max-width:100%`, media memakai `width:100%`, dan grid media tidak dapat memperlebar viewport.
- `Tambah Tool` memakai `data-add-tool`, binding langsung yang aman terhadap elemen null, serta fallback event delegation.
- API CRUD tetap mempertahankan aturan v6.3.6: tool bawaan tidak dapat dihapus, tool kustom dapat dibuat/diedit/dihapus, dan URL eksternal wajib `http`/`https`.

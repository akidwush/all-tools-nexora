# NEXORA v6.3.4 — Public Scroll Stability Patch

Patch ini menyelesaikan sumber jank pada dashboard publik setelah perbaikan hero video v6.3.3.

## Perubahan

- `.tools-card` tidak lagi memakai `content-visibility:auto`, `contain:layout paint style`, atau `contain-intrinsic-size:168px`.
- Tab aktif memakai layout normal sehingga tinggi grid tidak berubah ketika kartu masuk viewport.
- Auto-load `IntersectionObserver` dengan `rootMargin:320px` dihapus.
- Tombol “Tampilkan tool lagi” memakai guard in-flight dan menambahkan kartu baru secara append-only.
- Slot `.nx-card-readiness` dibuat bersama markup kartu; status health tidak lagi menambahkan node setelah paint.
- `MutationObserver` body-wide pada stability layer dihapus.
- Popup WhatsApp otomatis disuppress pada pointer coarse, layar kecil, dan reduced-motion.
- Semua kartu katalog statis di `index.html` dihapus; enam grid publik dirender dari `toolsData`.

## Verifikasi

```text
npm run check
npm test
npm run build
```

Regression test tambahan:

```text
node scripts/test-scroll-stability-v634.js
```

Target runtime mobile: tidak ada auto batch saat tombol mendekati viewport, tidak ada perubahan tinggi kartu akibat content visibility, tidak ada badge yang di-append saat health response, dan popup WhatsApp tidak membuat layer compositor baru.

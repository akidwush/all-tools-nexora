# Nexora v6.3.4 — Patch scroll dashboard publik

Patch ini ditujukan untuk overlay ke repository `all-tools-nexora-main`.

## Perubahan inti

- Menghapus 74 kartu statis dari enam grid publik; kartu dibuat satu kali dari `toolsData`.
- Menghapus auto-load `IntersectionObserver` 320px dan mengganti batch menjadi tombol eksplisit.
- Batch berikutnya memakai append-only DOM update dengan guard `allLoadPending`.
- Menonaktifkan `content-visibility:auto`, containment layout/paint, dan intrinsic placeholder pada kartu publik.
- Menyediakan slot readiness badge saat kartu dibuat; tidak ada append badge setelah paint.
- Menghapus `MutationObserver` global dari stability layer.
- Menonaktifkan popup WhatsApp berat pada touch, layar kecil, dan reduced-motion.
- Menambah regression test scroll stability.

## Setelah overlay ke repo

```bash
npm run check
npm test
npm run build
git add -A
git commit -m "fix: stabilize public dashboard scrolling"
git push origin main
```

Jangan menyalin folder `public/` hasil build kembali ke source jika repository mengabaikannya; Vercel akan membangun ulang dari source saat deploy.

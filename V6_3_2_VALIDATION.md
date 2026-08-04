# NEXORA v6.3.2 — All Grid & Anime Banner Validation

## Fokus
- Menghilangkan scroll jank saat tab All menampilkan 37 tools.
- Mengurangi DOM aktif dari sekitar 74 kartu duplikat menjadi satu tab aktif.
- Merender tab All bertahap 12 kartu per batch.
- Memperbaiki typo selector `.tool-card` menjadi `.tools-card`.
- Menonaktifkan backdrop blur kartu pada HP.
- Mengaktifkan kembali banner anime secara adaptif tanpa memblokir render awal.

## Strategi
- `content-visibility:auto` dan containment pada setiap kartu.
- Progressive rendering dengan tombol dan IntersectionObserver.
- Grid tab lain dikosongkan sampai benar-benar dibuka.
- Video banner memakai `preload=metadata`, dimuat saat idle, dan tidak aktif pada Data Saver, 2G, reduced motion, RAM <=3 GB, atau CPU <=4 core.

## Target validasi
- Package version: 6.3.2
- Initial All batch: 12/37
- Serverless functions: <=12
- npm run check: PASS
- npm test: PASS
- npm run build: PASS

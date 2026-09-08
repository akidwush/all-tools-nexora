# Nexora Comic Reader — Translate All

Patch lanjutan dari repository `df90de56410500b6d56f57424d23d77f721f4e49` (Translation HF2). Implementasi memakai Supabase existing. Tidak menambah Vercel Function dan tidak mengubah sumber/katalog/search/detail/scanlation MangaDex.

## Hasil implementasi

| Bagian | Implementasi |
|---|---|
| TRANSLATE ALL BUTTON | Toolbar reader: Translate All, Cancel, Retry halaman gagal. Tidak ada floating panel besar. |
| READER MODES | Original bawaan; Indonesia aktif ketika hasil pertama siap. Pergantian mode menggunakan gambar yang sama. |
| OCR / VISION MODEL | Gemini multimodal mendeteksi teks Jepang vertikal, Korea, China, Inggris dan mengembalikan region JSON terstruktur. Bahasa terdeteksi disimpan; tidak ada confidence numerik buatan. |
| GEMINI MODEL | `gemini-2.5-flash`, masih tercantum sebagai model tersedia saat pengecekan 8 September 2026. Bisa diganti melalui variable GitHub `COMIC_TRANSLATION_MODEL`; tidak ada model dipilih caller. |
| PAGE PIPELINE | Server memverifikasi relasi manga/chapter dan rating safe/suggestive, meminta manifest resmi, memvalidasi host/filename, mengambil gambar maksimal 8 MB, memvalidasi dimensi sebelum decode, membuat salinan inferensi, OCR+translate, validasi JSON, cache. |
| IMAGE PROCESSING | JPEG/WebP memakai codec WASM terpin; PNG memakai pngjs. WASM dibundel sebagai data agar tidak memerlukan FFI, native addon, unduhan runtime atau filesystem. Tile inferensi maksimal 2048 px sisi panjang. Webtoon panjang dipotong maksimal 12 tile dalam satu page request. Maksimal 12 juta pixel/32000 px; gambar di luar batas ditolak dengan original tetap tersedia. |
| BOUNDING BOX | Koordinat x/y/width/height 0–1; tile panjang dinormalisasi kembali ke koordinat halaman. Respons di luar bounds ditolak. |
| OVERLAY SYSTEM | Overlay menempel pada container gambar; region saja yang ditutup. Latar hampir putih/gelap menurut region. Data original tidak ditimpa atau disimpan di Storage. |
| TEXT FITTING | Word wrap, pencarian ukuran font 10–26 px, overflow guard. Jika tidak muat, ada penanda dan pesan; ketuk bubble membuka teks lengkap. Tidak ada pemotongan diam-diam. |
| TRANSLATE SFX | Bawaan OFF; semua jenis region disimpan sekali, SFX disaring di reader. Mengubah SFX tidak memanggil model lagi. |
| SUPABASE TABLE | `comic_page_translations`, `comic_translation_jobs`, `comic_translation_leases`. Migration `202609070002_comic_translate_all.sql`. |
| TRANSLATION CACHE | Global JSONB; unique provider/chapter/page/hash/target. Dibaca hanya setelah otorisasi server dan ditulis service role. |
| IMAGE HASH | SHA-256 identitas canonical MangaDex: versi pipeline/provider/manga/chapter/index/hash manifest/filename. Bukan page title atau index saja. Manifest berubah berarti MISS. HD dan hemat memakai identitas full yang sama. |
| RESUME | Prepare membaca daftar halaman cached; hasil cached tidak menggunakan kuota model. Hasil sukses tidak hilang saat cancel, disconnect, atau buka ulang. Setiap start mempunyai ID job baru agar cancel lama tidak membatalkan job baru. |
| PARTIAL RESULTS | Setiap respons berhasil langsung bisa dipakai; tidak menunggu seluruh chapter. Prioritas cached dan halaman dekat posisi baca. |
| RATE LIMIT | Reuse `wc_take_quota` atomik. Guest 6 page MISS/menit, 60/hari, 4 job/jam; akun 20/menit, 300/hari, 12 job/jam. IP 24 page/menit, 16 job/jam. Project default 500 page MISS/hari, dapat diatur 1–10000 lewat `COMIC_TRANSLATION_DAILY_PAGES`. Request total juga dibatasi. |
| CONCURRENCY | Admin 1–3 (bawaan 2); RPC memeriksa slot per identitas dan maksimal 20 page in-flight project. Lease global menghindari page yang sama diproses bersamaan. |
| COST CONTROL | Client memberi jeda 11 detik untuk page MISS guest, 3,2 detik untuk akun. Cached pages tanpa jeda inferensi. Quota/server unavailable menghentikan antrean; page error lain maksimal satu retry. |
| JOB LIFETIME | Job idle kedaluwarsa setelah 10 menit. Request halaman aktif memperpanjang masa berlaku saat tersisa <5 menit. Lease inference 180 detik, deadline image+model 125 detik. Metadata job lama dibersihkan terbatas saat prepare. |
| VVIP AUTHORIZATION | Bearer diverifikasi lewat Supabase Auth. `tools.comicreader.access_level`, status aktif tool, profil, subscription aktif/belum expired/tidak suspended dan admin_users dibaca di server. Cache HIT juga melalui pemeriksaan ini. Membaca normal tetap memakai gerbang MangaDex existing. |
| ADMIN | Form pada dashboard existing, route PATCH existing, `requireAdmin(edit:true)` dan CSRF. Setting enabled, SFX default, concurrency. Ada audit admin. |
| RLS / SECURITY | Semua tabel baru RLS aktif dan tidak ada grants anon/authenticated. Jobs berisi identitas internal tetapi tidak dapat dibaca frontend. RPC hanya service_role. Tidak ada URL/prompt/image bebas pada request. Host tetap whitelist dan redirect fetch ditolak. |
| GUEST FALLBACK | Guest dapat translate dengan kuota lebih kecil; Original tetap tersedia jika backend gagal. Akun normal dibawa dari parent Nexora lewat satu transport existing. |

## Pengujian dan batas verifikasi

- `npm run build`: **lulus, 112/112 regression scripts**, 296 file public; masih 12/12 Vercel Functions.
- Deno: **21 kelompok tes lulus**, termasuk 8 kelompok komik; kedua entrypoint Edge lulus type-check.
- PGlite/PostgreSQL: migration dijalankan dua kali; permission anon/auth, service-role writes, uniqueness hash/bahasa, admission job atomik, concurrency, lease expiry, quota.
- Fixture antrean: 1, 10, 30, 55 halaman; partial success, satu halaman gagal, satu retry, cancel, resume, cache, offline, 429.
- Fixture Edge: Japanese/Korean/Chinese/English structured mapping, vertical-text instruction, dialogue/narration/thought/sign/SFX, dark region, no-text page, bounds invalid, image unavailable, source unavailable, provider error/timeout, invalid auth/VVIP, arbitrary URL rejection, hash refresh.
- Codec: benar-benar decode/resize/encode JPEG, PNG, WebP lokal dan split gambar panjang; image bomb ditolak sebelum decode. Tidak memakai provider asli pada tes ini.
- Mobile: DOM/contracts 360/375/390/412 px dan koordinat persen portrait/landscape, lazy overlay, dialog teks lengkap, toggle SFX dan mode. **Bukan screenshot/visual QA perangkat Android**: cloud browser menolak URL preview lokal dengan `ERR_BLOCKED_BY_CLIENT`.
- **Belum diuji dengan Gemini produksi atau komik live untuk akurasi OCR/terjemahan.** Tidak ada credential produksi yang dipakai di lingkungan pengerjaan. Kualitas region, teks vertikal dan balon padat bergantung hasil model; lowConfidence ditampilkan jika diberikan model. Jangan menganggap fixture sebagai bukti akurasi OCR.
- Batas CPU/memori aktual dan cold start Supabase belum dibenchmark di project produksi. Resize/codec lokal diuji; halaman ekstrem ditolak agar reader asli tetap bekerja.

## Deploy melalui GitHub Actions existing

1. Jalankan patch Termux dari folder repo. Script memeriksa konflik di worktree, menjalankan npm ci/build, membuat commit, dan push main tanpa force. `--check` hanya memeriksa penerapan; `--no-push` menyimpan commit lokal.
2. GitHub Actions → **Nexora Readers — Verify and Deploy** → Run workflow → main.
3. Workflow menjalankan build, regression, SQL/DOM tests, type-check dan Edge tests, kemudian **supabase db push** dan deploy enam function (empat Classics + dua Comic). **Tidak perlu menyalin migration ke SQL Editor.**
4. Gunakan secrets yang sudah tersedia: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `GEMINI_API_KEY`. Tidak ada secret baru yang wajib. Variable model/budget komik opsional; nilai bawaan disediakan workflow.
5. Setelah workflow hijau, buka ulang Comic Reader. Aktifkan/atur Translate All dari dashboard bila diperlukan. Periksa satu chapter pendek terlebih dahulu untuk memastikan quota/model akun dan region hasil live.

Push frontend saja tidak men-deploy Supabase. Workflow tetap manual-dispatch seperti sebelumnya, tidak menjalankan migration pada pull request. Vercel tetap memakai integrasi Git existing. Patch ini belum mengubah database, secrets atau deployment produksi dari lingkungan pengerjaan.

## Integrity lock yang direvisi secara sengaja

Permintaan fitur ini secara eksplisit mengubah Comic Reader. Hanya `assets/comic-reader/app.js` (event lifecycle + penolakan hasil chapter usang) dan `assets/comic-reader/index.html` (memuat addon) yang berubah di antara lima file canonical terkunci. Digest dua file diperbarui di check-project dan integrity test untuk mempertahankan gate. Shell iframe, CSS canonical, dan source/proxy MangaDex tetap sama. Tidak ada pengembalian Base64/srcdoc engine atau generic proxy.

## Referensi implementasi

- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/deprecations
- https://ai.google.dev/gemini-api/docs/image-understanding
- https://supabase.com/docs/guides/functions/limits
- Codec terpin dan lisensinya tercatat di `supabase/functions/_shared/comic/CODEC_LICENSES.md`.

## FILES CREATED

- `assets/comic-reader/translate-queue.js`
- `assets/comic-reader/translate.css`
- `assets/comic-reader/translate.js`
- `assets/js/admin/comic-translation.js`
- `docs/COMIC_TRANSLATE_ALL.md`
- `lib/comic-translation-settings.js`
- `scripts/test-comic-translate-all.js`
- `supabase/functions/_shared/comic/CODEC_LICENSES.md`
- `supabase/functions/_shared/comic/access.ts`
- `supabase/functions/_shared/comic/codec.ts`
- `supabase/functions/_shared/comic/handler.ts`
- `supabase/functions/_shared/comic/jpeg-wasm.ts`
- `supabase/functions/_shared/comic/service.ts`
- `supabase/functions/_shared/comic/source.ts`
- `supabase/functions/_shared/comic/vision.ts`
- `supabase/functions/_shared/comic/webp-wasm.ts`
- `supabase/functions/_shared/comic_test.ts`
- `supabase/functions/comic-translate-chapter/index.ts`
- `supabase/functions/comic-translate-page/index.ts`
- `supabase/migrations/202609070002_comic_translate_all.sql`
- `supabase/tests/comic-database.mjs`
- `supabase/tests/comic-reader.mjs`

## FILES MODIFIED

- `.github/workflows/world-classics.yml`
- `admin/index.html`
- `api/admin/dashboard.js`
- `assets/comic-reader/app.js`
- `assets/comic-reader/index.html`
- `assets/config.js`
- `assets/js/admin/dashboard.js`
- `assets/js/core/lazy-loader.js`
- `assets/js/shared/supabase-client.js`
- `assets/module-manifest.json`
- `index.html`
- `scripts/check-project.js`
- `scripts/test-comic-reader-integrity.js`
- `supabase/config.toml`
- `supabase/tests/package.json`

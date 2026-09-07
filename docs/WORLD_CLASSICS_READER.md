# Nexora World Classics Reader — Supabase V1

Implementasi lanjutan setelah patch Audit + Admin Branding V1. Perubahan logo/icon admin dari patch sebelumnya tetap dipertahankan. Tidak membuat backend reader Vercel baru: 12 Vercel Functions existing tetap 12.

## Cara memasang melalui Termux

1. Pastikan patch Audit + Admin Branding V1 sebelumnya sudah terpasang dan perubahan lokal telah di-commit.
2. Unduh `APPLY_NEXORA_WORLD_CLASSICS_V1.sh` ke Download.
3. Jalankan dari repository:

```bash
cd ~/all-tools-nexora
bash ~/storage/downloads/APPLY_NEXORA_WORLD_CLASSICS_V1.sh
```

Script memeriksa origin/main, membuat worktree sementara, memeriksa konflik, menjalankan npm ci + seluruh tes/build, lalu commit dan push tanpa force. `--check` hanya memeriksa penerapan; `--no-push` menerapkan dan commit lokal. Perubahan main dilakukan hanya setelah build berhasil. Script tidak memasang ulang patch branding.

Push memicu deployment frontend pada integrasi Vercel existing. Supabase perlu deployment terpisah melalui workflow di bawah, karena push frontend tidak otomatis menjalankan migration atau memasang Edge Functions.

## Aktifkan backend melalui GitHub Actions

Pada repository GitHub, Settings → Secrets and variables → Actions, tambahkan empat **repository secrets**:

- `SUPABASE_ACCESS_TOKEN`: personal access token Supabase untuk CLI, bukan anon key.
- `SUPABASE_PROJECT_REF`: reference project Supabase existing (20 karakter).
- `SUPABASE_DB_PASSWORD`: password database project existing.
- `GEMINI_API_KEY`: API key penerjemahan, diteruskan sebagai Edge Function secret.

Opsional repository variables: `WORLD_CLASSICS_ALLOWED_ORIGINS` (origin HTTPS dipisah koma; default `https://all-tools-nexora.vercel.app`), `WORLD_CLASSICS_MODEL` (default `gemini-2.5-flash`). Jika model tersebut tidak tersedia pada akun Anda, gunakan model yang mendukung structured JSON output. Model tidak dipilih browser.

Di Vercel, reuse `SUPABASE_URL` serta `SUPABASE_PUBLISHABLE_KEY` atau `SUPABASE_ANON_KEY` existing. Key publik wajib sesuai project Edge Functions. Jangan memasukkan service-role key ke variabel key publik. Jika variabel baru ditambahkan, redeploy frontend agar endpoint account membaca konfigurasi baru.

Buka Actions → **World Classics — Verify and Deploy** → Run workflow → branch `main`. Workflow menjalankan build, tes SQL/DOM, dan tes Deno terlebih dahulu; kemudian `supabase db push`, menyimpan secrets, dan deploy empat function menggunakan `--use-api` (tanpa Docker/CLI native di Android).

Jika project memiliki riwayat migration remote yang tidak ada di repository, `db push` dapat menolak melanjutkan. Sinkronkan riwayat migration existing dengan repository sebelum deploy; workflow tidak melakukan reset database atau repair riwayat otomatis.

`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` runtime disediakan Supabase pada Edge Functions. Service role tidak dikirim ke frontend. Tidak perlu Supabase Storage.

## Arsitektur dan implementasi

| Bagian yang diminta | Hasil |
|---|---|
| SUPABASE MIGRATIONS | `supabase/migrations/202609070001_world_classics_reader.sql`; transaksi SQL, bisa diterapkan dua kali |
| TABLES CREATED | 4 tabel fitur: `world_classics_cache`, `world_classics_translations`, `world_classics_bookmarks`, `world_classics_history`; 2 tabel internal: `world_classics_limits`, `world_classics_translation_jobs` |
| RLS POLICIES | Seluruh 6 tabel memakai RLS. Bookmarks/history `USING` dan `WITH CHECK auth.uid() = user_id`. Cache/translation/limiter/job tidak punya grant untuk anon/authenticated; hanya service role |
| INDEXES | Unique cache `(source,page_title,content_type)`; unique terjemahan `(source,page_title,target_language,translation_mode,original_hash)`; bookmark `(user_id)` dan unique user/source/page; history `(user_id,last_read_at DESC)`; indeks expiry limiter/cache |
| EDGE FUNCTIONS | `wikisource-search`, `wikisource-page`, `wikisource-chapters`, `translate-classic` |
| WIKISOURCE CACHE | Search 12 jam, chapter list 24 jam, page 3 hari. Revisi halaman diperiksa lagi setelah 15 menit. Jika sumber gagal, cache yang kedaluwarsa maksimal 7 hari dapat dipakai dengan pemberitahuan |
| TRANSLATION CACHE | SHA-256 dari JSON array paragraf asli yang dinormalisasi; mode dan target id bagian dari unique key; tidak punya TTL pendek. Cache HIT tidak memanggil provider atau mengonsumsi kuota terjemahan |
| GEMINI INTEGRATION | Secret Edge, prompt sistem tetap, canonical text comparison, chunk maksimal sekitar 6.500 karakter, maksimal dua request bersamaan, JSON schema, pemeriksaan ID dan kelengkapan setiap fragmen. Hasil tidak lengkap tidak disimpan |
| BOOKMARK SYNC | User login CRUD langsung ke Supabase dengan JWT user; bookmark cloud menjadi sumber utama saat sinkronisasi. Penghapusan cloud tidak dibangkitkan kembali dari cache lokal |
| READING HISTORY | Maksimal 100 item per user ditegakkan trigger SQL; lock transaksi per user; progress dibatasi 0–100. Scroll disimpan maksimal sekali per 5 detik dan saat keluar/berpindah bab |
| GUEST FALLBACK | Guest bebas mencari/membaca; bookmark/history localStorage. Cache perangkat maksimal 5 halaman dan sekitar 1,5 juta karakter JSON. Penyimpanan user A/B/tamu dipisah; token tidak disimpan di localStorage |
| RATE LIMIT | PostgreSQL RPC atomic fixed-window; 30 request/menit guest, 120 user; global 1.500/menit. Cache MISS terjemahan: 3/hari dan 30.000 karakter guest; 30/hari dan 200.000 karakter user; global 500.000 karakter/hari |
| SECURITY TEST | Tes lokal SQL/PGlite dan Deno membuktikan RLS, grants, whitelist, CORS, validasi, limiter, sanitasi, mode/hash, dan kegagalan provider. Tes produksi memerlukan project credentials |
| MOBILE TEST | DOM reader, kontrol, ruby, lifecycle dan kontrak CSS responsif diuji. Kontrol minimal 44px, toolbar membungkus, konten scroll tersendiri. Verifikasi visual Android/browser nyata belum dijalankan: akses browser ke preview lokal diblokir lingkungan |
| BUILD RESULT | Lihat `WORLD_CLASSICS_VERIFICATION.md` untuk hasil akhir yang benar-benar dijalankan |

Batas global karakter dapat diubah dengan Edge secret `WORLD_CLASSICS_DAILY_CHAR_LIMIT` (1 hingga 2.000.000). Kuota MISS yang telah digunakan tetap dihitung jika provider gagal, supaya retry spam tidak bebas biaya. Rate-limit request berlaku juga pada HIT. Guest diidentifikasi dengan hash IP forwarding + secret; keamanan akurasi IP bergantung pada header yang diset gateway Supabase. Batas global tetap berlaku sekalipun identitas IP dirotasi. CORS bukan pengganti autentikasi/rate limit.

## Auth existing, tanpa sistem login kedua

Project sebelumnya memakai Supabase Auth melalui cookie HttpOnly, belum memiliki supabase-js browser client. `NexoraSupabase` adalah singleton transport REST/Edge yang mengambil konfigurasi publik dari endpoint account existing. Action `reader-session` pada endpoint yang sama memerlukan sesi login, same-origin dan CSRF existing; hanya mengembalikan access JWT user normal ke memori browser. Refresh token tetap cookie HttpOnly. Reader tidak membuat akun atau menyimpan password. Semua pencarian, konten, terjemahan dan data reader berjalan langsung melalui Supabase.

Guest mengirim publishable/anon key pada header `apikey`, tanpa bearer palsu. Function menggunakan `verify_jwt=false` untuk akses guest, tetapi jika bearer dikirim, user diverifikasi lewat Supabase Auth; token tidak valid ditolak 401. Browser mencoba memperbarui access token melalui sesi existing sekali pada 401.

## Batas konten dan keamanan

Hanya china/japan/korea dengan domain internal zh/ja/ko.wikisource.org. Judul maksimal 240 karakter; query maksimal 120; namespace/URL/prompt arbitrer ditolak. Namespace di luar main juga difilter melalui `ns=0`. Bab maksimal 200.000 karakter/1.200 paragraf; terjemahan maksimal 60.000 karakter/600 paragraf dan tetap tunduk quota guest/user. Pilih subbab lebih pendek jika melebihi batas.

Discovery memakai `parse.links` dan `query.allpages` dengan prefix karya, tidak mengambil isi seluruh bab. Link namespace 0 yang terkait judul karya disertakan. Pagination `Muat bab lainnya` hanya berjalan saat diklik. Karya tanpa struktur prefix/link bab yang dikenali tetap dapat dibaca sebagai halaman lengkap; tidak ada klaim bahwa semua edisi Wikisource punya struktur bab seragam.

HTML dinormalisasi menggunakan parser DOM dan allowlist, lalu disanitasi lagi pada browser. Script, iframe, SVG aktif, event handler, unsafe style/URL dihapus; ruby/rt/rp, headings, lists dan footnotes tetap. Terjemahan dirender dengan textContent. Source label dan View Original dibuat dari whitelist internal; tidak mempercayai URL cache.

Jika terjemahan gagal, teks asli tetap tersedia. Jika Supabase gagal, chapter yang pernah dibuka dapat dibaca dari cache perangkat. Penyimpanan progress terakhir saat browser ditutup paksa hanya dijamin lokal; sinkronisasi best-effort dilanjutkan saat akun membuka reader lagi. Jika localStorage dinonaktifkan/penuh, reader tetap berjalan namun persistensi perangkat tidak dijamin.

## Menjalankan pengujian

```bash
npm ci
npm run build
npm ci --prefix supabase/tests
npm test --prefix supabase/tests
cd supabase/functions
deno check wikisource-search/index.ts wikisource-page/index.ts wikisource-chapters/index.ts translate-classic/index.ts
deno task test
```

Tes SQL memakai PostgreSQL/PGlite, roles anon/authenticated/service_role dan dua auth.uid berbeda. Supabase Auth jaringan dan provider dimock dalam tes unit, bukan diklaim sebagai tes produksi. Gunakan `node supabase/tests/live.mjs` setelah deploy untuk guest search/read/cache dan proteksi tabel nyata, dengan URL dan key publik melalui environment. Opsional `WC_LIVE_TRANSLATE=1` serta `WC_TEST_PAGE` pendek menguji terjemahan nyata; `WC_USER_A_TOKEN` dan `WC_USER_B_TOKEN` milik akun tes menguji RLS/bookmark/history produksi dan membersihkan row probe setelah selesai.

Referensi implementasi: [Supabase Auth Edge](https://supabase.com/docs/guides/functions/auth), [deployment Edge](https://supabase.com/docs/guides/functions/deploy), [MediaWiki Allpages](https://www.mediawiki.org/wiki/API:Allpages), [structured output](https://ai.google.dev/gemini-api/docs/structured-output).

## 6.4.0 HF35 Danbooru Android CDN recovery — 2026-08-28

- Fix: gambar dari `cdn.donmai.us` ditampilkan melalui image CDN HTTPS terverifikasi karena sebagian jaringan Android menerima sertifikat origin sebagai `NET::ERR_CERT_AUTHORITY_INVALID`.
- Performance: gallery memakai lebar 640 piksel dan viewer 1600 piksel; file tidak diproxy melalui Vercel dan gambar tetap lazy/async.
- Privacy/security: fallback hanya berlaku untuk hostname Danbooru yang persis, memakai `no-referrer`, serta tidak membawa query, cookie, API key, atau payload KuroNeko.
- Cache: versi lazy asset dinaikkan ke `danbooru-search-hf35` agar browser tidak memakai JavaScript lama.

## 6.4.0 HF34 Danbooru full file URL — 2026-08-27

- Fix: normalizer kini mengenali `result.full_file_url`, nama field URL gambar yang terbukti dikirim endpoint produksi KuroNeko.
- Regression: fixture mengikuti envelope produksi `status` + object `result` dengan `full_file_url`, `id`, `rating`, `source`, dan `tags`.
- Scope: tidak mengubah query, mode Safe, UI, API key, routing, atau fitur Nexora lain.

## 6.4.0 HF33 Danbooru direct-result recovery — 2026-08-27

- Fix: normalizer Danbooru kini menerima URL gambar tunggal dan array URL langsung selain object post bertingkat.
- Diagnose: kegagalan produksi `hatsune_miku` mencapai provider tetapi berhenti sebagai `DANBOORU_EMPTY_RESULT`; scalar result sebelumnya memang tidak pernah menjadi item gallery.
- Observability: schema yang belum dikenal hanya mencatat tipe dan nama key, tanpa nilai, URL gambar, query, payload mentah, atau API key.

## 6.4.0 HF32 Danbooru Search — 2026-08-27

- Fitur: menambahkan Danbooru Search dengan pencarian manual, mode Safe sebagai default, gallery universal dua kolom, thumbnail lazy, dan viewer detail ringan.
- API: route same-origin `/api/search/danbooru` meneruskan hanya `q` dan `mode` ke endpoint KuroNeko tetap; `KURONEKO_API_KEY` hanya ditambahkan di server.
- Response nyata: probe tanpa secret memverifikasi HTTP 401 dengan envelope `creator`, `message`, dan `status:false`; schema sukses belum diklaim tanpa key terkonfigurasi.
- Parser: response `result`/`data` serta koleksi gambar umum dinormalisasi terisolasi, tetapi hanya field dan URL yang benar-benar ada yang diteruskan ke UI.
- Security/performance: whitelist method/query, URL publik HTTPS, secret reflection guard, batas respons, no-store, timeout, rate limit, deduplikasi request aktif, cache sesi lima menit, serta tanpa proxy file gambar besar.
- Infrastruktur: katalog menjadi 57 tool dan route dimultipleks melalui `api/tool-health.js`, sehingga jumlah Vercel Functions tetap 12/12.

## 6.4.0 HF31 All In One Downloader — 2026-08-27

- Fitur: menambahkan All In One Downloader mobile-first dengan Paste, loading stabil, thumbnail lazy, metadata dinamis, pilihan media, Open/Download, dan Copy Link.
- API: route same-origin `/api/download/aio` meneruskan hanya URL tervalidasi menuju endpoint KuroNeko tetap; `KURONEKO_API_KEY` hanya ditambahkan di server.
- Parser: response `result`, `data`, `download(s)`, `media`, `items`, `links`, dan field turunannya dinormalisasi ke format internal tanpa mengarang platform, kualitas, format, ukuran, atau metadata yang tidak ada.
- Security: method/query whitelist, batas input/response, timeout, no-store, URL publik, rate limit, deduplikasi request aktif, sanitasi error, dan larangan fetch langsung ke URL pengguna.
- Infrastruktur: katalog menjadi 56 tool dan route tetap dimultipleks melalui `api/tool-health.js`, sehingga jumlah Vercel Functions tetap 12/12.

## 6.4.0 HF30 Alight Premium all-email — 2026-08-27

- Compatibility: Request Magic Link dan Apply Premium kini menerima alamat email valid dari provider mana pun, termasuk Gmail, Outlook, Yahoo, dan domain temp mail seperti GenMail.
- Validation: pembatas hard-code `@gmail.com` dihapus dari frontend dan proxy server; batas panjang, format local-part, hostname domain, karakter kontrol, dan multiple-`@` tetap ditolak.
- Privacy: alamat email tetap dikirim hanya melalui protected same-origin gateway Nexora menuju provider Alight Motion.
- Cache/QA: asset Alight Premium memakai cache-bust HF30 dan regression memastikan email non-Gmail diterima tanpa melemahkan validasi.

## 6.4.0 HF29 GenMail — 2026-08-27

- Fitur: menambahkan GenMail untuk mengambil domain, membuat email sementara, memeriksa inbox, dan membaca pesan melalui KuroNeko API.
- Security: `KURONEKO_API_KEY` hanya dibaca proxy server `/api/genmail`; action dan parameter di-whitelist, input dibatasi, request diberi timeout, dan error provider tidak diteruskan mentah.
- Parser: envelope `result`/`data` dan field turunannya dinormalisasi secara toleran tanpa membuat sender, subject, preview, identifier, atau isi pesan palsu.
- Email safety: HTML pesan dibersihkan di server dan browser; script, iframe, object/embed, event handler, URL berbahaya, form, serta media pelacak diblokir.
- Rate limit: daftar domain dicache 10 menit, request bersamaan digabung di server, refresh inbox manual memakai cooldown, dan request dibatalkan saat tab hidden atau tool ditinggalkan.
- Infrastruktur: katalog menjadi 55 tool, migration 028, README Bahasa Indonesia, dan route dimultipleks lewat `api/tool-health.js` sehingga tetap 12/12 Vercel Functions.
- QA: regression 79/79, audit 195 JavaScript, dan build 132 file lulus.

## 6.4.0 HF28 Puter provider recovery — 2026-08-27

- Diagnose: Qwen Image 2 Pro pada Puter dapat jatuh ke default Together `FLUX.1-schnell` karena ID canonical diubah menjadi lowercase sebelum dibandingkan secara case-sensitive oleh provider.
- Recovery: kegagalan ekstraksi URL Replicate dan fallback non-serverless Together kini otomatis mencoba GPT Image Mini satu kali.
- Guard: allowance, credit, autentikasi, safety, rate limit, dan pembatalan pengguna tetap tidak memicu request kedua.
- UX: respons JSON provider yang panjang diganti pesan singkat; status sukses tetap menyebut saat model cadangan dipakai.
- Cache/QA: cache-bust HF28 dan regression provider recovery memastikan dua error produksi tertangani tanpa menggandakan pemakaian pada error non-retryable.

## 6.4.0 HF27 Puter image model refresh — 2026-08-27

- Model: mengganti Gemini 2.5 Flash Image dengan Gemini 3.1 Flash Image Preview pada kualitas 1K.
- Model: mengganti Ideogram 3 dengan Ideogram 4 dan menambahkan Qwen Image 2 Pro.
- Compatibility: mempertahankan GPT Image Mini, GPT Image 2, Imagen 4 Fast, dan FLUX Schnell.
- Fix: Ideogram dan Qwen kini menerima dimensi piksel valid untuk Together AI; rasio kecil seperti `3x4` tidak lagi berubah menjadi gambar `64x64`.
- Cache/QA: cache-bust HF27 dan regression khusus memblokir ID lama serta memvalidasi tujuh model dan opsi provider.

## 6.4.0 HF26 Puter runtime diagnostics — 2026-08-27

- Fix: membaca error Puter bertingkat seperti `error.code`, `error.message`, dan status HTTP sehingga pesan allowance, konfirmasi email, login, rate limit, safety, jaringan, dan model tidak lagi disamarkan sebagai error umum.
- Fix: rasio dikirim sesuai kontrak setiap provider; GPT Image Mini memakai ukuran resmi OpenAI, GPT Image 2 memakai ukuran piksel, sedangkan Gemini, Imagen, FLUX, dan Ideogram memakai rasio sederhana.
- Recovery: fallback ke GPT Image Mini hanya berjalan saat model benar-benar tidak tersedia; allowance, login, safety, dan rate limit tidak diulang agar penggunaan tidak tergandakan.
- Visual: elemen hasil beratribut `hidden` benar-benar disembunyikan sehingga placeholder dan gambar lama tidak tampil bersamaan.
- Diagnose: console hanya mencatat model, kode, status, dan pesan provider; prompt serta identitas pengguna tidak masuk log.
- Cache: lazy loader dan asset Puter memakai cache-bust HF26.

## 6.4.0 HF25 Puter AI Image — 2026-08-27

- Fitur: menambahkan Nexora AI Image berbasis Puter untuk membuat gambar dari prompt, memilih model, rasio, preview, dan mengunduh hasil.
- Akun: login Puter hanya dibuka setelah pengguna menekan tombol; setiap pengguna memakai allowance Puter miliknya sendiri, termasuk pengguna VVIP Nexora.
- Privasi: tidak ada API key atau token Puter di source; Nexora tidak menyimpan password, prompt, maupun gambar hasil.
- Stabilitas: workspace memakai satu layout original yang sama di PC dan Android, tanpa media query desktop, backdrop blur, atau animasi berat.
- Infrastruktur: lazy module, CSP Puter, katalog 54 tool, health catalog, seed, migration 027, tautan langsung README, dan cache-bust HF25 aktif tanpa menambah Vercel Function.
- QA: regression khusus memvalidasi login eksplisit, user-pays, daftar model, batas prompt, CSP, routing, privasi, dan panduan Bahasa Indonesia.

## 6.4.0 HF24 Persistent Android cursor — 2026-08-27

- Android: dot dan ring merah kini dibuat pada perangkat sentuh, tampil sejak halaman dimuat, mengikuti `pointerdown`/`pointermove`, dan menetap pada posisi terakhir setelah jari terangkat.
- Desktop: cursor DLYYZ tetap mengikuti mouse; deteksi diperluas ke `any-pointer:fine` agar laptop hybrid dengan layar sentuh tidak kehilangan cursor.
- Stabilitas: listener sentuh bersifat pasif, hanya satu frame render aktif saat posisi berubah, dan tidak ada interval maupun jejak cursor bertumpuk.
- Cache: CSS dan runtime cursor memakai cache-bust HF24 agar Vercel dan browser tidak mempertahankan aturan desktop-only HF23.
- QA: regression HF24 memvalidasi posisi awal Android, persistensi setelah touch, kompatibilitas hybrid, dan tidak adanya handler yang menyembunyikan cursor saat jari dilepas.

## 6.4.0 HF23 DLYYZ red cursor — 2026-08-27

- Visual: menambahkan kursor merah DLYYZ berupa dot merah dan ring magnetik yang membesar pada elemen interaktif.
- Mobile: modul berhenti sebelum membuat DOM, listener, atau animation frame ketika perangkat tidak memiliki fine pointer; Android tetap memakai cursor native tanpa beban tambahan.
- Performa: ring hanya menganimasikan selisih posisi dan menghentikan `requestAnimationFrame` otomatis setelah gerak selesai; hover memakai event delegation tanpa listener per kartu.
- Aksesibilitas: reduced-motion membuat ring mengikuti posisi langsung dan seluruh elemen dekoratif bersifat `aria-hidden`.
- QA: regression khusus HF23 memvalidasi capability gate, cleanup listener, cache-bust, dan larangan touch allocation.

## 6.4.0 HF22 Original unified UI — 2026-08-27

- Visual: tampilan Android original menjadi satu-satunya sumber layout untuk PC, tablet, dan ponsel; kanvas 430 px dipusatkan pada monitor dan katalog tetap tiga kolom dengan kartu compact yang sama.
- Remove: media query desktop/tablet, hover/fine-pointer card tilt, custom cursor, pointer trail, FLIP ghost, dan animasi pembuka room desktop dihapus dari runtime publik.
- Stabilitas: glass depth tetap memakai gradient, border, dan shadow statis; tidak ada backdrop blur atau transform kartu permanen yang dapat memicu blank saat scroll cepat.
- Fitur: setiap workspace tool memakai cascade Android normal yang sama pada semua lebar viewport, sedangkan aturan layar sangat sempit tetap tersedia untuk mencegah clipping.
- Cache: seluruh CSS publik yang berubah dan Liquid Reactor memakai cache-bust HF22.
- QA: regression 72/72, audit 53 tool, 184 JavaScript, 12/12 Vercel Functions, dan build produksi 126 file lulus; tes khusus HF22 menolak kembalinya cabang visual desktop.

## 6.4.0 HF21 Android fling + hero loop — 2026-08-27

- Fix: hero video kini autoplay muted dan loop pada desktop maupun mobile, pulih setelah pause/ended, dan kembali berjalan ketika masuk viewport.
- Fix: mode `static` yang selalu mem-pause video pada perangkat sentuh dihapus; pengaturan admin untuk menonaktifkan hero tetap dihormati.
- Fix: layer latar page-sized, clipped membranes, atmosphere overlay, dan dekorasi pseudo-element kartu yang membebani raster Chrome Android dinonaktifkan khusus mobile/coarse pointer.
- Stabilitas: konten tab dan kartu mobile dipaksa tetap visible tanpa `content-visibility`, containment, backdrop blur, atau transform permanen; depth tetap dipertahankan dengan gradient dan shadow ringan.
- Cache: versi `core.css` dan `performance.js` dinaikkan agar deployment tidak memakai asset lama.
- QA: regression suite 71/71, audit 53 tool, 183 JavaScript, 12/12 Vercel Functions, dan build produksi 126 file lulus di atas HF20 Gemini.

## 6.4.0 Final mobile workflow — 2026-08-26

- Fix: fast-scroll Android tidak lagi menjalankan touch halo/trail pada aliran `pointermove`; layer fixed tidak dibuat pada coarse pointer.
- Fix: hero video desktop tetap hidup, sedangkan Android memakai frame terdekode yang dipause agar decoder tidak memicu blank viewport saat scroll cepat.
- Fix: Document AI dan Prompt Generator memakai tombol file native dengan pemanggilan picker langsung dalam gesture pengguna, kompatibel dengan Chrome dan WebView Android.
- Access: Document AI tersedia untuk akun FREE yang sudah login; kuota harian dan proteksi API tetap aktif.
- Cache: HTML, asset, dan API memakai `no-store`; cache persisten status tool, link sosial, dan negara dihapus agar deploy baru tidak tertahan data lama.
- Cleanup: header cache Vercel duplikat dan resolver versi lazy-module bertumpuk disederhanakan.
- QA: audit 53 tool, 12/12 Vercel Functions, regression suite 69/69, build produksi 126 file, dan smoke test kedua endpoint AI lulus.

## 6.3.18 AI configuration hotfix — 2026-08-25

- Fix: Document AI, Prompt Generator, dan Personal AI kini memakai resolver API key server-side yang sama serta mendukung `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_GEMINI_API_KEY`, dan `GOOGLE_API_KEY`.
- Fix: nilai environment yang terbungkus quote atau tidak sengaja ditempel sebagai `NAMA_VARIABLE=nilai` dinormalisasi tanpa mengirim key ke browser maupun log.
- Recover: model khusus yang tidak tersedia otomatis mencoba model Gemini stabil; error autentikasi dan kuota tetap fail-fast agar request tidak digandakan.
- Diagnose: health endpoint melaporkan status konfigurasi dan model aktif tanpa mengekspos secret, sedangkan error key invalid memberi petunjuk scope Vercel dan redeploy.
- QA: regression suite 65/65, audit 47 tool, 12/12 Vercel Functions, smoke test kedua route AI, dan build produksi lulus.

## HF11.1 — Mobile compositor recovery + health refresh

- Recover: mengembalikan baseline HF8 + HF9 + HF10 yang sempat tertimpa patch HF11 lama.
- Fix: room/iframe About Dev dan Feedback tidak lagi tetap ter-render saat tertutup.
- Fix: tab mobile memakai indikator statis pada perangkat touch untuk mencegah noda hitam/compositor smear.
- Fix: status health publik memakai `refresh=auto`, sehingga cache kosong/stale dapat diperiksa ulang oleh backend secara aman.
- Remove: popup/notifikasi WhatsApp transient dihapus dari HTML, CSS, shell, dan social-links. Link sosial/footer WhatsApp tetap tersedia.
- QA: regression suite 57/57 lulus, 46 tools, 145 JavaScript, 12/12 Vercel Functions.

# Changelog

## 6.3.18 HF6 — 2026-08-15

### Downloader recovery

- Mengganti single point of failure Instagram, Terabox, dan Spotify dengan provider cascade, timeout per sumber, circuit breaker, cache pendek, serta endpoint fallback yang dapat diatur lewat environment server.
- Menambahkan fallback daftar file Terabox resmi dan kode ekstraksi opsional; kegagalan direct-link tidak lagi menghilangkan seluruh hasil.
- Mengaktifkan Spotify best-effort MP3 melalui backend dengan fallback metadata/tautan resmi, sekaligus menghapus endpoint browser lama yang tidak konsisten.
- Mengganti health check URL palsu dengan probe layanan nyata dan menampilkan capability berdasarkan hasil aktual, bukan klaim statis.

### Rilis atomik

- Menambahkan regression test HF6 dan paket kumulatif siap Termux yang memvalidasi staging, checksum, test, build, lalu rollback semua file/commit bila satu tahap apply atau deploy gagal.

## 6.3.18 HF5 — 2026-08-15

### Mobile dan routing

- Menyinkronkan seluruh overlay penuh layar dengan `visualViewport` agar pinch zoom, rotasi, keyboard virtual, dan browser bar Android tidak menyisakan area hitam.
- Memulihkan deep-link `#tool-*` setelah refresh, back/forward, dan BFCache; body scroll juga dikembalikan ke nilai asal saat room ditutup.

### Downloader

- Menetapkan urutan runtime canonical untuk renderer downloader sehingga implementasi lama tidak lagi menimpanya.
- Menyamakan domain Terabox frontend/backend, menormalisasi respons provider bertingkat maupun URL string, serta membuang media duplikat.
- Mengizinkan host media Nexray pada proxy dan mengubah probe menjadi HEAD dengan fallback GET range agar unduhan Instagram, TikTok, dan Terabox lebih kompatibel.
- Mengarahkan fallback unduhan TikTok melalui proxy server dan memastikan status health yang kedaluwarsa tidak memblokir fitur publik.

### Admin dan validasi

- Menambahkan timeout pada login/dashboard, recovery UI dengan retry untuk gangguan API, dan refresh-safe route per bagian admin tanpa salah mengeluarkan sesi.
- Menambahkan regression test HF5; audit lengkap kini mencakup 50 rangkaian test, 44 tool, dan batas 12/12 Vercel Functions.

## 6.3.18 HF3 — 2026-08-14

### Perbaikan fungsi

- Mengganti kalkulator berbasis `Function(...)` yang diblokir CSP dengan parser matematika aman untuk operator `+ - × ÷ % ^` dan tanda kurung.
- Mengganti `Math.random()` pada Password Generator dengan `crypto.getRandomValues()` serta tombol salin tanpa inline JavaScript.
- Menambahkan pengaturan URL/aktif-nonaktif video header dari dashboard admin, validasi HTTPS, audit log, public settings endpoint yang sudah ada, dan migration Supabase `016_hero_video_settings.sql`.

### Performa dan animasi

- Video header membaca konfigurasi secara async dengan timeout pendek dan cache fallback, tetap manual pada HP, serta nonaktif pada perangkat/jaringan lemah.
- Membatasi transisi ke properti compositor-friendly, mematikan efek berat pada low-power mode, dan menghormati `prefers-reduced-motion` secara menyeluruh.
- Menambahkan cache-bust HF3 untuk runtime, CSS publik, dan dashboard admin yang berubah.

## 6.3.15 — 2026-08-12

### Perbaikan

- Memantau task konversi dan ekspor FreeConvert secara terpisah sehingga pesan `Dependent task(s) failed` tidak lagi menyembunyikan penyebab utama.
- Mengelompokkan kode kegagalan FreeConvert menjadi kuota, kredensial/izin, timeout, provider, dan konversi.
- Menambahkan CSP aktif untuk membatasi script, frame, object, worker, form, dan koneksi eksternal tanpa memutus provider aktif.
- Menghapus fallback `eval` dari pencarian renderer agar `unsafe-eval` tidak diperlukan.
- Melengkapi canonical URL, Open Graph, dan Twitter Card pada halaman utama.

## 6.3.14 — 2026-08-12

### Keamanan

- Menghapus modul Nexus AI dan Pix Vault yang tidak lagi terdaftar; salah satunya menyimpan kredensial API lama di payload browser.
- Mengisolasi seluruh tool `srcdoc` dalam iframe sandbox tanpa `allow-same-origin` dan memvalidasi sumber `postMessage`.
- Mengubah server lokal ke whitelist public asset, melengkapi seluruh rewrite Vercel, query parsing, response helper, dan batas body per endpoint.
- Membatasi Map cache/rate-limit agar tidak tumbuh tanpa batas.
- Mengamankan download FreeConvert dengan validasi DNS, koneksi pinned, redirect terbatas, dan respons maksimal 4 MB.
- Mengamankan redirect SiteGrabber agar token Authorization tidak diteruskan lintas origin dan membatasi respons.
- Mengunci JSZip eksternal pada Deploy Center dengan SHA-512 Subresource Integrity.
- Mengganti fallback salt feedback yang tetap dengan nilai acak per proses.

### Perbaikan

- Menambahkan `svgalight` ke health catalog dan seed database sehingga seluruh katalog konsisten 43 tool.
- Menurunkan ZIP VDeploy menjadi 3,2 MB agar encoding base64 tetap berada di bawah batas body Function.
- Menyamakan Image Vectorizer dengan implementasi FreeConvert Cloud pada UI dan SQL.
- Menambahkan batas body feedback dan kapasitas proses/cache pada layanan backend.

### Pemeliharaan

- Menyamakan versi asset ke 6.3.14.
- Mengganti audit/build historis dengan pemeriksaan berbasis registry dan manifest aktual.
- Menambahkan test runner, test server lokal, dan regression test keamanan.
- Menghapus catatan patch/validasi per-rilis yang usang dan merapikan README.

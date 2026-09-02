# All Tools Nexora

All Tools Nexora v6.4.0 adalah website toolkit statis dengan 65 tool, lazy-loaded feature modules, dashboard admin, Supabase opsional untuk fitur lama, dan 12 Vercel Functions. Frontend tetap tanpa framework; backend fitur AI memakai dependency server-side sesuai provider.

Konfigurasi branding, katalog tool, modul lazy-load, dan target health check sekarang dipusatkan di `assets/config.js`. Panduan edit manual tersedia di [docs/MAINTENANCE.md](docs/MAINTENANCE.md).

## Cara memakai Nexora AI Image

Fitur ini dipakai untuk membuat gambar dari tulisan. Contohnya, kamu bisa menulis “kucing memakai baju astronot”, lalu AI akan membuat gambarnya.

**[Buka Nexora AI Image di sini](https://all-tools-nexora.vercel.app/#tool-aiimage)**

Langkahnya mudah:

1. Buka link di atas.
2. Tekan tombol **Hubungkan Puter**.
3. Login atau buat akun Puter. Login dilakukan di Puter, jadi Nexora tidak melihat password kamu.
4. Tulis gambar yang kamu inginkan pada kotak prompt.
5. Pilih model dan ukuran gambar. Kalau bingung, pakai pilihan yang sudah terpasang.
6. Tekan **Buat Gambar**, lalu tunggu sampai gambarnya muncul.
7. Tekan **Unduh Gambar** untuk menyimpan hasil ke HP atau komputer.

Pilihan model yang tersedia:

- **GPT Image Mini:** paling hemat dan menjadi pilihan awal.
- **Gemini 3.1 Flash Image:** gambar 1K, cocok untuk hasil realistis dan mengikuti prompt panjang.
- **Imagen 4 Fast:** cepat untuk penggunaan umum.
- **FLUX Schnell:** cepat dan hemat untuk mencoba beberapa ide.
- **Ideogram 4:** cocok untuk poster, logo, dan gambar yang berisi tulisan.
- **Qwen Image 2 Pro:** cocok untuk gambar dengan detail tinggi.
- **GPT Image 2:** pilihan kualitas tinggi untuk hasil akhir.

FLUX Schnell dan Qwen Image 2 Pro masih bergantung pada provider tambahan milik Puter. Jika provider tersebut gagal mengirim gambar atau salah mengarahkan model, Nexora akan mencoba GPT Image Mini satu kali dan memberi tahu model yang akhirnya dipakai. Nexora tidak melakukan percobaan kedua untuk masalah saldo, login, rate limit, atau safety.

Hal penting yang perlu diketahui:

- Setiap pengguna harus menghubungkan akun Puter miliknya sendiri, termasuk pengguna VVIP Nexora.
- Gambar memakai allowance atau jatah dari akun Puter pengguna. Jatah developer Nexora tidak dipakai.
- Nexora tidak meminta API key Puter dan tidak menyimpan password, prompt, atau gambar hasil.
- Jika jatah habis, cek pemakaian akun Puter atau tunggu jatah tersedia lagi.
- Jika muncul pesan email belum dikonfirmasi, buka Puter dan konfirmasi alamat email akunmu.
- Jika muncul pesan permintaan terlalu cepat, tunggu sebentar sampai proses sebelumnya selesai.
- GPT Image Mini memakai ukuran potret atau lanskap terdekat yang didukung model. Nexora otomatis mengubah pilihan rasio ke format ukuran yang benar untuk setiap provider.
- Jangan membuat gambar yang melanggar hukum, merugikan orang lain, atau melanggar aturan Puter.

Fitur ini memakai sistem [User-Pays dari Puter](https://developer.puter.com/tutorials/free-unlimited-image-generation-api/). Harga dan batas pemakaian mengikuti [ketentuan Puter](https://developer.puter.com/pricing/).

## Cara memakai Nexora AI Video Generator

**[Buka Nexora AI Video Generator](https://all-tools-nexora.vercel.app/#tool-aivideo)**

Tool ini membuat video langsung melalui Puter.js dan allowance akun Puter pengguna. Nexora tidak memiliki API key provider, tidak membuat backend video, dan tidak menyimpan prompt, gambar referensi, atau hasil video.

1. Tekan **Hubungkan Puter**, lalu selesaikan login resmi Puter.
2. Pilih **Text to Video** untuk membuat video dari prompt saja, atau **Image to Video** untuk memakai gambar awal.
3. Tulis subjek, gerakan, kamera, dan suasana video.
4. Pilih model, durasi, serta rasio 9:16 atau 16:9.
5. Tekan **Generate Video** dan tunggu. Proses video dapat memerlukan beberapa menit.
6. Setelah selesai, gunakan player tanpa autoplay, lalu tekan **Download Video** atau **Open Video**.

Model yang dikonfirmasi dari dokumentasi resmi Puter saat implementasi adalah Sora 2, Sora 2 Pro, Veo 3.1 Fast, dan Veo 3.1. Sora mendukung durasi 4/8/12 detik, sedangkan Veo 3.1 mendukung 4/6/8 detik. Semua pilihan yang ditampilkan mendukung gambar referensi. Biaya dan ketersediaan tetap mengikuti allowance serta provider Puter milik pengguna.

## Cara memakai GenMail

GenMail membuat alamat email sementara. Fitur ini cocok saat kamu perlu menerima kode atau pesan tanpa memberikan email utama. Jangan memakai email sementara untuk akun penting karena alamat dan pesannya dapat berhenti tersedia kapan saja.

**[Buka GenMail di sini](https://all-tools-nexora.vercel.app/#tool-genmail)**

Cara memakainya:

1. Buka link GenMail di atas.
2. Tunggu sampai pilihan domain muncul.
3. Isi **Username** jika ingin nama sendiri. Kosongkan jika ingin nama acak.
4. Pilih domain, lalu tekan **Generate Email**.
5. Tekan **Copy Email** untuk menyalin alamatnya.
6. Gunakan alamat itu pada layanan yang ingin kamu coba.
7. Kembali ke GenMail, tekan **Open Inbox**, lalu tekan **Refresh Inbox**.
8. Pilih pesan yang masuk untuk membacanya.

## Cara memakai All In One Downloader

**[Buka All In One Downloader](https://all-tools-nexora.vercel.app/#tool-aiodownloader)**

Cara pakainya gampang:

1. Salin link video atau media yang memang boleh kamu unduh.
2. Buka fitur **All In One Downloader**.
3. Tempel link pada kotak URL. Tombol **Paste** bisa dipakai jika browser memberi izin clipboard.
4. Tekan **Ambil Media** dan tunggu sampai hasil tersedia.
5. Tekan **Buka Media** atau **Download** pada pilihan yang diberikan server.
6. Tekan **Copy Link** jika kamu hanya ingin menyalin link medianya.

Nexora tidak menjanjikan platform atau kualitas tertentu. Pilihan yang muncul mengikuti data nyata dari server downloader. Fitur ini tidak membypass akun privat, DRM, paywall, atau media yang dilindungi.

## Cara memakai Danbooru Search

**[Buka Danbooru Search](https://all-tools-nexora.vercel.app/#tool-danbooru)**

Cara pakainya:

1. Tulis tag atau nama karakter, misalnya `hatsune_miku` atau `furina`.
2. Biarkan mode **Safe** jika ingin hasil yang aman sebagai pilihan awal.
3. Tekan **Search**. Nexora tidak mencari otomatis saat kamu sedang mengetik.
4. Tekan salah satu gambar untuk membuka preview dan informasi yang memang tersedia.
5. Jika link gambar tersedia, gunakan **Open Image**, **Copy Image Link**, atau **Download**.

Gallery memakai thumbnail jika server memberikannya. Jika server hanya memberikan gambar asli, Nexora memakai URL itu langsung tanpa memindahkan file besar melalui Vercel. Hasil pencarian yang sama disimpan sebentar selama sesi agar jatah request tidak cepat habis. API key KuroNeko tetap berada di server Nexora.

## Cara memakai Anime to Real

**[Buka Anime to Real](https://all-tools-nexora.vercel.app/#tool-animetoreal)**

Anime to Real mengubah gambar anime menjadi gambar bergaya realistis. Kamu dapat memakai link gambar langsung atau memilih gambar dari galeri HP.

1. Untuk memakai link, tempel URL file gambar ke kotak **Image URL**. URL harus dimulai dengan `http://` atau `https://`.
2. Link Google Share dan Pinterest biasanya membuka halaman, bukan file gambar langsung. Jika link seperti itu gagal, tekan **Pilih Gambar** lalu pilih file dari galeri.
3. Format upload yang didukung adalah JPG, PNG, dan WebP. Gambar besar diperkecil otomatis sebelum dikirim.
4. Tekan **Convert** satu kali dan tunggu. Proses AI dapat membutuhkan waktu sekitar satu menit.
5. Jika berhasil, gunakan **Open Image**, **Download Result**, atau **Copy Link**.

API key KuroNeko hanya dibaca oleh server melalui `KURONEKO_API_KEY`. Browser tidak menerima key tersebut. Fitur ini tidak memakai database, Supabase client, Supabase Edge Function, atau Supabase Storage. Saat memilih file, gambar dibuat publik sementara melalui Litterbox selama maksimal satu jam agar KuroNeko dapat membacanya; Nexora tidak menyimpan file secara permanen.

Jika gambar asli tidak tampil tetapi URL sudah benar, kamu tetap boleh mencoba konversi. Jika provider menolak gambar, gunakan gambar publik lain dan jangan mencoba melewati pembatasan keamanan provider.

## Cara memakai Nexora AI Song Generator

**[Buka Nexora AI Song Generator](https://all-tools-nexora.vercel.app/#tool-aisong)**

1. Tulis ide, cerita, mood, vokal, dan suasana lagu pada **Describe your song**.
2. Isi **Song Title** dan **Style / Genre** bila dibutuhkan, atau pilih preset genre yang tersedia.
3. Tekan **Generate Song** satu kali lalu tunggu. Pembuatan dapat membutuhkan waktu hingga sekitar dua menit.
4. Jika audio tersedia, tekan Play pada player. Audio tidak berjalan otomatis.
5. Gunakan **Download Song**, **Open Audio**, atau **Copy Link** untuk hasilnya. Lyrics hanya muncul bila memang dikirim provider.

Route `/api/ai/song` memakai `KURONEKO_API_KEY` hanya di server. Generator tidak memakai Supabase, database runtime, Storage, migration, atau dependency baru, dan file audio tidak diproxy melalui Vercel.

Hal penting:

- Inbox tidak diperbarui setiap detik. Tekan **Refresh Inbox** seperlunya agar batas request tidak cepat habis.
- Email aktif disimpan hanya selama tab browser yang sama masih terbuka.
- Nexora membersihkan isi HTML email sebelum menampilkannya dan memblokir script, iframe, serta link berbahaya.
- API key KuroNeko hanya berada di server Nexora dan tidak dikirim ke browser pengguna.
- Jika muncul pesan batas request tercapai, tunggu beberapa saat atau sampai kuota KuroNeko tersedia lagi.

## Menjalankan secara lokal

Node.js 20 atau lebih baru diperlukan.

```bash
cp .env.example .env
npm ci
npm test
npm run dev
```

Buka `http://127.0.0.1:4173`. Server lokal meniru seluruh rewrite API di `vercel.json` dan hanya menyajikan halaman serta asset publik.

### Termux

```bash
pkg update
pkg install git nodejs
git clone https://github.com/akidwush/all-tools-nexora.git
cd all-tools-nexora
cp .env.example .env
npm ci
npm test
npm run dev
```

## Struktur proyek

| Lokasi | Isi |
|---|---|
| `index.html`, `assets/` | UI publik, core runtime, dan feature modules |
| `admin/` | Login dan dashboard admin |
| `api/` | 12 entry point Vercel Functions |
| `lib/` | Handler, proxy, database, rate limit, dan validasi keamanan |
| `database/` | Skema lengkap, migrations, dan setup admin pertama |
| `scripts/` | Audit proyek, regression test, build, dan server lokal |
| `assets/config.js` | Sumber utama branding, katalog, modul, dan health target |
| `public/` | Output build sementara; tidak disimpan di Git |

`assets/config.js` adalah satu-satunya sumber daftar tool dan branding. Registry browser serta health catalog membacanya langsung; `assets/module-manifest.json` dibuat ulang oleh `npm run sync`. `npm run check` memverifikasi konfigurasi, aset, route, dan seed database.

## Generator XML lokal

Enam generator native berikut dimuat per route dan tidak bergantung pada WordPress atau jaringan Nexora:

- `#tool-text2d` — 2D Text Animate / Text FX.
- `#tool-text3d` — 3D Text Animate.
- `#tool-textfxanimation` — Text FX Animation.
- `#tool-textvector` — Text to Vector dengan OpenType lokal di Web Worker.
- `#tool-trimpath` — Trimpath Generator.
- `#tool-logoanimate` — Logo Animate.

Preset, template XML, data huruf, dan 16 file font disimpan di `assets/vendor/nexora`, `assets/data/nexora`, dan `assets/fonts/nexora`. Semua akses member lokal dibuka, palet custom dibatasi 15 per perangkat, dan hasil tersimpan sebagai riwayat lokal. Logo Animate mempertahankan media placeholder bawaan template; ganti media logo di Alight Motion setelah impor XML.

## Konfigurasi

Salin `.env.example` dan isi hanya layanan yang digunakan. Variable utama:

- Database/admin: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` atau `SUPABASE_SERVICE_ROLE_KEY`, serta `FEEDBACK_HASH_SALT`.
- Operasional: `HEALTH_CHECK_TOKEN` dan pengaturan timeout/cache opsional.
- Tool eksternal: `COINGECKO_API_KEY`, `GOOGLE_PAGESPEED_API_KEY`, `GOOGLE_SAFE_BROWSING_API_KEY`, `NASA_API_KEY`, `OCR_SPACE_API_KEY`, `FREECONVERT_API_KEY`, `SVGTOXML_ENGINE_KEY`, `KURONEKO_API_KEY` untuk GenMail dan All In One Downloader, serta `GEMINI_API_KEY` untuk Personal AI, Document AI, dan Prompt Generator. Alias `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_GEMINI_API_KEY`, dan `GOOGLE_API_KEY` juga didukung. Model dapat dioverride lewat `GEMINI_MODEL`, `DOCUMENT_AI_MODEL`, atau `PROMPT_GENERATOR_MODEL`. Setelah mengubah environment Vercel, lakukan redeploy agar Function menerima nilai terbaru.
- SiteGrabber: `SITEGRABBER_API_BASE_URL` dan `SITEGRABBER_API_KEY`.
- Deploy Center: `NEXORA_DEPLOY_ACCESS_KEY`, kemudian token `VERCEL_TOKEN` atau `NETLIFY_TOKEN`.

Jangan memakai prefix publik untuk secret dan jangan menaruh key di HTML/JavaScript browser. Jika `FEEDBACK_HASH_SALT` kosong, server memakai salt acak per proses; konfigurasi nilai tetap tetap disarankan agar hash konsisten antar-instance.

SVG → Alight XML memakai API resmi `https://svgtoxml.vercel.app`: simpan key sebagai `SVGTOXML_ENGINE_KEY` di environment server/Vercel. Alias lama `SVGTOXML_API_KEY` tetap didukung, tetapi key resmi selalu diprioritaskan. Nexora memverifikasi key melalui `/api/v1/auth`, lalu meneruskan konversi ke `/api/v1/convert`; key tidak pernah dikirim ke browser.

## Database dan admin

Untuk instalasi baru, jalankan `database/schema.sql` melalui Supabase SQL Editor. Buat user di Supabase Authentication, ganti `GANTI_EMAIL_ADMIN` pada `database/setup-first-admin.sql`, lalu jalankan file tersebut.

Untuk database lama, jalankan migration yang belum pernah diterapkan dari `database/migrations/` sesuai urutan nomor. Backup database terlebih dahulu.

Migration `database/migrations/026_nexora_native_generators.sql` menambahkan enam generator XML lokal ke katalog database. Frontend tetap mempertahankan katalog bundle jika database belum diperbarui, tetapi migration ini perlu dijalankan sekali agar Dashboard Admin dan data Supabase ikut sinkron.

Migration `database/migrations/027_puter_ai_image.sql` menambahkan Nexora AI Image ke katalog database. Fitur berjalan langsung di browser melalui Puter, tidak memakai API key Nexora, dan tidak menambah Vercel Function.

Migration `database/migrations/028_genmail.sql` menambahkan GenMail ke katalog database. Isi `KURONEKO_API_KEY` di Environment Variables Vercel lalu redeploy. Key hanya dibaca oleh proxy server `/api/genmail`; GenMail tetap memakai 12 Function karena route ini dimultipleks melalui `api/tool-health.js`.

Migration `database/migrations/029_aio_downloader.sql` menambahkan All In One Downloader. Route `/api/download/aio` juga dimultipleks melalui `api/tool-health.js`, memakai `KURONEKO_API_KEY` yang sama, tidak mem-proxy file media besar, dan tidak menambah jumlah Vercel Function.

Migration `database/migrations/030_danbooru_search.sql` menambahkan Danbooru Search. Route `/api/search/danbooru` dimultipleks melalui `api/tool-health.js`, memakai `KURONEKO_API_KEY` yang sama, dan hanya meneruskan tag serta mode pencarian yang sudah divalidasi.

Migration `database/migrations/023_document_ai_vvip.sql` tetap mempertahankan kuota Document AI, tetapi v6.4.0 mengubah akses katalognya menjadi FREE. Jalankan ulang migration ini satu kali pada database lama agar Dashboard Admin menampilkan status yang sama dengan frontend.

Migration `database/migrations/016_hero_video_settings.sql` mengaktifkan pengaturan video header. Setelah migration dijalankan, buka **Dashboard Admin → Ringkasan Sistem → Video Header**, isi URL MP4/WebM HTTPS langsung, lalu simpan. Pengaturan tersimpan di `app_settings.site.heroVideo` dan dibaca halaman publik tanpa mengekspos service-role key.

## Nexora Novel Cover Generator

Tool `#tool-novelcover` membuat artwork cover novel melalui satu router server-side. Mode Auto memakai satu provider yang tersedia dan hanya melakukan fallback terbatas untuk timeout, rate limit, atau gangguan provider. Compare Mode harus dipilih secara manual dan dibatasi 2–4 provider.

## Nexora ElevenLabs Studio

Tool `#tool-elevenlabs` menyatukan Text to Speech, Voice Changer, Speech to Text, dan Sound FX dalam satu modul mobile-first. Browser hanya memanggil `/api/elevenlabs`; `ELEVENLABS_API_KEY` dibaca server-side dan tidak pernah dikirim ke frontend. Upload, audio hasil, dan transcript bersifat sementara serta tidak disimpan ke database.

Provider yang didukung: Ideogram, Recraft, fal.ai, Runware, Stability AI, OpenAI GPT Image, dan Hugging Face Inference Providers. Provider tanpa environment key otomatis dinonaktifkan. Reference image tidak disimpan oleh Nexora dan hanya diteruskan kepada provider yang dipilih.

Default generation adalah Artwork Only. Title dan author ditambahkan secara lokal melalui Nexora Composer, lalu dapat diekspor sebagai PNG atau JPEG.

## Pemeriksaan dan build

### Nexora Smart Cutout

Route tool mengikuti pola aplikasi statis: `#tool-smartcutout`. Model MediaPipe MagicTouch 6,23 MB dimuat saat gambar dipilih dan berjalan lokal melalui WebAssembly SIMD dengan fallback WebAssembly non-SIMD. Aset model dicache oleh browser. Gambar pengguna hanya berada di memori lokal; fitur ini tidak memakai Supabase, database, Storage, API inference, atau Vercel Function.

```bash
npm run check
npm test
npm run build
```

- `npm run check` memeriksa sintaks, katalog, seed, manifest, rute, batas Functions, iframe sandbox, asset version, dan kemungkinan secret hardcoded.
- `npm test` menjalankan seluruh regression test di `scripts/test-*.js`.
- `npm run build` menjalankan kedua pemeriksaan lalu membuat `public/` dari source frontend.

Deploy ke Vercel menggunakan konfigurasi `vercel.json`. Seluruh secret harus diatur sebagai environment variable server-side.

Video header tetap dipertahankan: HP yang cukup kuat memutar video muted saat terlihat, sedangkan desktop, perangkat lemah, mode hemat data, dan reduced-motion menampilkan frame video statis.

### Push dari Termux

Setelah menyalin isi ZIP final ke repository lokal:

```bash
cd all-tools-nexora
npm ci
npm test
npm run build
git add .
git commit -m "fix: final Android stability and AI workflow"
git push origin main
```

## Batas dan keamanan

- VDeploy membatasi ZIP ke 3,2 MB agar payload base64 tidak melewati batas request Function.
- Proxy SVG dan arsip SiteGrabber dibatasi 4 MB.
- Konten legacy yang dijalankan lewat `srcdoc` berada dalam iframe sandbox tanpa akses same-origin.
- Header Content Security Policy membatasi sumber script, frame, object, worker, dan koneksi browser; kebijakan tetap mengizinkan provider yang memang dipakai tool legacy.
- Image Vectorizer memantau task konversi dan ekspor secara terpisah agar kegagalan kuota, kredensial, timeout, atau engine tidak lagi tertutup pesan dependency umum.
- Sebagian tool bergantung pada API pihak ketiga dan tetap dapat mengalami kuota, perubahan kontrak, atau downtime.

Lihat [audit keamanan](docs/SECURITY_AUDIT.md) dan [riwayat perubahan](CHANGELOG.md).

## Lisensi

Belum ada file lisensi di repository. Tambahkan lisensi eksplisit sebelum distribusi ulang di luar ketentuan pemilik proyek.

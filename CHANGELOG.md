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

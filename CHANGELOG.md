# Changelog

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

## 6.3.18 — 2026-08-13

### Big Image Local AI

- Mengganti fallback Canvas dengan **ESRGAN Slim 2×** berbasis TensorFlow.js dan UpscalerJS yang berjalan langsung di browser melalui backend WebGL.
- Menambahkan tile inference adaptif (`32/48/64` sesuai profil perangkat), padding 4 px, `awaitNextFrame`, progress per tile, pembatalan via `AbortSignal`, dan normalisasi output exact 2×.
- Menambahkan kontrol **Auto** dan **Local AI**. Auto mencoba Bigjpg lebih dulu lalu berpindah ke ESRGAN lokal saat provider menolak; Local AI melewati upload cloud sepenuhnya.
- Mengunci skala 4×/8×/16× pada Local AI dan menampilkan engine secara eksplisit sebagai `LOCAL ESRGAN · WEBGL`, bukan sekadar `LOCAL`.
- Menambahkan installer aset AI pinned agar TensorFlow.js, UpscalerJS, model ESRGAN, dan weight disajikan dari origin Nexora sendiri saat deployment.
- Menambah regression test khusus vendor asset, WebGL, tiled inference, exact 2×, kontrol mode lokal, dan batas 12 Vercel Functions.

## 6.3.17 — 2026-08-12

### Perbaikan Big Image

- Mengklasifikasikan respons provider `requires_vip` sebagai pembatasan paket, bukan kegagalan generik.
- Menjadikan Bigjpg sebagai engine utama dan otomatis beralih ke Image Enhancer lokal hingga 2× ketika akses paket, kuota, kredensial, timeout, atau infrastruktur cloud menolak proses.
- Menonaktifkan pilihan 4×/8×/16× selama fallback lokal agar hasil tidak diklaim melebihi kemampuan engine yang dipakai.
- Mengganti indikator menyesatkan `BIGJPG READY` menjadi `BIGJPG KEY SET`; hak menjalankan task baru dinyatakan setelah submit provider berhasil.
- Menampilkan engine hasil secara eksplisit sebagai `BIGJPG AI` atau `LOCAL`, menjaga preview proporsional, serta membersihkan Object URL fallback saat reset/keluar tool.

## 6.3.16 — 2026-08-12

### Fitur

- Menambahkan **Big Image**, AI upscaler Bigjpg untuk ilustrasi/foto dengan skala 2×, 4×, 8×, dan 16×, lima tingkat reduksi noise, polling task, serta preview Before/After yang tetap proporsional di HP.
- Menambahkan upload sementara melalui bucket Supabase privat dan signed URL karena API Bigjpg menerima URL gambar, bukan file lokal langsung.

### Keamanan dan stabilitas

- Menjaga `BIGJPG_API_KEY` sepenuhnya di server, melindungi job dengan token HMAC, memvalidasi URL publik, memeriksa magic bytes PNG/JPG, serta membatasi upload 4 MB.
- Menambahkan rate limit per-IP dan global berbasis database, pembersihan sumber pada status terminal/cancel, serta pembersihan oportunistik untuk job yang ditinggalkan.
- Mempertahankan batas 12/12 Vercel Functions dengan multiplexing pada `api/tool-health.js` dan menyinkronkan katalog menjadi 44 tool.

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

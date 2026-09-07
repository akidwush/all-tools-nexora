# Audit publik/admin dan pengaturan logo Nexora

Tanggal: 7 September 2026. Basis: `c0cfb2ed8674bd11816e3f26f29795ca356fa2ff`.
ZIP unggahan cocok byte-per-byte dengan checkout GitHub pada commit tersebut.

## Hasil perbaikan

| Area | Temuan dan perubahan |
| --- | --- |
| Logo/ikon | Dashboard sebelumnya tidak menyediakan pengaturan logo. Ditambahkan unggah PNG/JPEG/WebP dari perangkat, URL HTTPS/path lokal, pratinjau, reset logo, dan favicon terpisah. |
| Penyimpanan | Logo disimpan pada `app_settings` dengan key `branding`, terpisah dari `site.heroVideo` agar simpan logo tidak menimpa video. Tidak membutuhkan migration SQL baru jika tabel app_settings sudah tersedia. |
| Sinkronisasi | Logo diterapkan di beranda, footer, About, Feedback, dashboard, dan login admin. Favicon mengikuti logo bila ikon terpisah dikosongkan. Muat ulang halaman untuk mengambil perubahan. |
| Validasi | Server mewajibkan admin dengan izin edit dan CSRF. URL aktif, credential dalam URL, path berbahaya, tipe data selain raster yang diizinkan, dan payload terlalu besar ditolak. Unggahan dikecilkan di browser, tidak perlu hosting gambar tambahan. |
| Logo gagal dimuat | Gambar UI kembali ke favicon bawaan tanpa loop error. Respons awal yang terlambat tidak menimpa logo yang baru disimpan. |
| Tautan sosial | Respons database sukses dengan daftar kosong kini menyembunyikan link. Sebelumnya link bawaan muncul kembali meskipun admin menonaktifkan semuanya. |
| Cache publik | Respons tools, settings, dan socials memakai no-store agar hasil admin tidak tertahan cache API. |
| Renderer duplikat | Hapus renderer lama Instagram, YouTube, Spotify, TikTok dan TikTok Quote dari app.js. Implementasi aktif tetap di modul canonical masing-masing. Helper caption, pencari judul/URL rekursif, renderer metadata, dan alias kompatibilitas yang tidak lagi dipakai turut dibersihkan. |
| Memori gambar | Blob URL unggahan canvas dibebaskan setelah gambar berhasil dibaca maupun gagal dibaca. |
| Preload | URL preload app.js disamakan dengan URL script yang benar sehingga browser tidak mengunduh dua versi URL untuk berkas yang sama. |
| Cache modul | Perbaiki escape regex Nexray pada lazy-loader agar cache version khusus modul dapat cocok. Ini tidak memperbaiki layanan Nexray eksternal yang sedang gagal. |
| Database | Timeout tetap bekerja ketika pemanggil juga mengirim AbortSignal; listener dilepas setelah request selesai. |
| Logout | Kegagalan logout/CSRF ditampilkan dan tidak lagi dianggap berhasil lalu mengarahkan pengguna ke login. |
| Feedback admin | Respons pencarian lama tidak menimpa hasil filter terbaru. |
| Inisialisasi admin | Event binding tidak dipasang berulang saat boot diulang. |
| Profil developer | Draft belum disimpan dipertahankan ketika admin berganti tab. Simpan ganda diblokir selama request berlangsung. |
| Form video | Mematikan video tidak lagi terhalang kewajiban mengisi URL. Path lokal yang diterima backend dapat diisi melalui form. |
| Membership | Tanggal kedaluwarsa kosong atau tidak valid tidak lagi ditampilkan sebagai VVIP aktif oleh daftar member. Ini menyamakan tampilan dengan pemeriksaan akses server. |
| Resource API | Nama properti bawaan JavaScript seperti constructor dan __proto__ ditolak oleh allowlist resource publik. |
| Metadata | Judul halaman .html dikenali dan canonical About/Feedback tidak lagi selalu ditimpa URL beranda. |

## Verifikasi

- Baseline: 108/108 suite bawaan lulus.
- Setelah patch: 110/110 suite lulus, termasuk dua suite perilaku baru untuk branding dan regresi audit.
- Build: 59 tool, 12/12 Vercel Functions. Batas performance bawaan tetap lulus (15 tag script statis, 8 stylesheet statis).
- Lock integritas Comic Reader, Abuse Shield, dan standalone apps tetap lulus tanpa mengubah lock.
- Uji DOM tambahan: boot dashboard, simpan logo/ikon beserta CSRF, preview setelah simpan, reset, akun read-only, propagasi ke empat halaman publik/login, dan renderer downloader canonical.
- Alur unggah turut diuji dengan image/canvas mock. Decode/resize pixel nyata di Chrome Android belum diuji dari lingkungan ini.
- Pemeriksaan produksi tanpa login: health HTTP 200; auth menyatakan authenticated=false; dashboard/tools/feedback/socials/analytics/audit/visual HTTP 401.
- Browser produksi dapat membuka beranda dan room Instagram. Browser cloud menolak akses server lokal, sehingga belum ada verifikasi screenshot versi patch di browser nyata.

Audit ini tidak menjamin setiap provider eksternal selalu berfungsi. Tidak tersedia sesi admin produksi atau secret provider untuk menjalankan semua mutasi/data produksi. Angka statistik dashboard masih mengikuti batas query yang sudah ada (feedback 500, profiles/subscriptions 5000); validasi skala data di atas batas itu dan transaksi membership lintas tabel memerlukan pekerjaan database tersendiri. Akses dari crawler sosial juga tidak selalu menjalankan JavaScript: Open Graph pada HTML awal tetap memakai metadata bawaan. Ikon tab dapat memiliki cache tersendiri pada browser/PWA yang sudah terpasang.

## Pemakaian patch Termux

1. Simpan `APPLY_NEXORA_AUDIT_BRANDING_V1.sh` ke Download.
2. Jalankan dari repository:

```bash
cd ~/all-tools-nexora
bash ~/storage/downloads/APPLY_NEXORA_AUDIT_BRANDING_V1.sh
```

Script mewajibkan branch main dan perubahan tracked/staged yang sudah bersih. Ia fetch origin, memilih basis fast-forward, menyiapkan worktree terpisah, menerapkan patch three-way, menginstal dependency lockfile, lalu menjalankan build yang mencakup seluruh tes. Setelah lulus, script membuat commit, memperbarui main secara fast-forward, lalu push origin main. Tidak ada force-push atau git reset terhadap pekerjaan pengguna. Git integration Vercel yang sudah terhubung akan memproses push sesuai konfigurasi project.

Jika hanya ingin memeriksa penerapan: tambahkan `--check`. Untuk build + commit tanpa push: tambahkan `--no-push`. Kedua opsi tidak mengubah keputusan izin platform; opsi hanya mengatur script saat pengguna menjalankannya.

Jika build/konflik gagal, worktree dan log disimpan; main tidak menerima patch. Jika push ditolak karena origin lebih baru, commit lokal dipertahankan dan script berhenti. Selesaikan perbedaan Git, jalankan build kembali, lalu push biasa. Script mencetak referensi backup HEAD sebelum pembaruan main dan hash commit patch. Untuk membatalkan patch yang sudah dipush, gunakan git revert terhadap hash commit patch, build kembali, lalu push.

## Mengganti logo

Buka Admin → Dashboard/Ringkasan → **Logo & Ikon Nexora**. Pilih gambar dari HP atau isi URL, lalu tekan **Simpan Logo & Ikon**. Kolom ikon boleh kosong agar mengikuti logo. Reset baru diterapkan setelah tombol Simpan ditekan. Video header tetap di form terpisah.

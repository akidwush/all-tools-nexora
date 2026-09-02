# Audit Keamanan Nexora

Tanggal audit: 2 September 2026  
Basis source: Nexora 6.4.0

## Model ancaman

Audit menganggap penyerang dapat menyalin seluruh HTML/CSS/JavaScript, membuka route tersembunyi, mengubah state browser, menghapus atribut `disabled`, memalsukan body/query, dan memanggil API Nexora secara langsung. Kode frontend diperlakukan sebagai data publik dan bukan batas keamanan.

Keputusan akses authoritative sekarang berjalan sebagai berikut:

1. browser memanggil route Nexora;
2. dispatcher memetakan route ke ID tool server;
3. server menolak origin browser yang tidak dipercaya;
4. server membaca `tools.access_level` dari database;
5. untuk VVIP, server memvalidasi cookie session HttpOnly melalui Supabase Auth;
6. server membaca profil, subscription aktif, masa berlaku, dan status suspend;
7. handler baru boleh memanggil provider.

Nilai `vip`, `isVip`, `role`, `isAdmin`, `credits`, `quota`, atau `userId` dari body browser tidak digunakan sebagai identitas maupun entitlement.

## Temuan dan perbaikan

| Tingkat | Temuan nyata | Perbaikan |
|---|---|---|
| Kritis | Route `_service` Danbooru, Anime-to-Real, AI Song, dan HD4 dipanggil sebelum pemeriksaan akses dinamis | Resolusi policy dan `authorizeTool()` kini selalu berjalan sebelum handler provider |
| Kritis | GenMail, AIO Downloader, Comic Reader, Document AI, dan Text-to-PDF belum seluruhnya masuk mapping VVIP server | Seluruh route server-backed dipetakan terpusat di `lib/server-access-policy.js` |
| Kritis | Admin dapat memberi label VVIP ke tool yang seluruh logic-nya berada di JS publik atau URL eksternal | Admin API menolak `access_level=vvip` dengan 422 sampai tool memiliki gerbang API Nexora; public catalogue menormalkan lock palsu menjadi Free |
| Tinggi | Client dapat mengganti query `tool` pada proxy media host bersama untuk mencoba memilih policy yang lebih ringan | Host Nexray memeriksa seluruh kandidat server tool, bukan mempercayai satu label dari browser |
| Tinggi | Login akun/admin belum konsisten menolak browser cross-site | Same-origin / `Sec-Fetch-Site` verification diterapkan; allowlist tambahan harus berupa exact origin |
| Tinggi | Helper entitlement tersebar dan error handling tidak seragam | Ditambahkan `requireAuthenticatedUser`, `requireEntitlement`, `requirePermission`, dan `authorizeTool` yang fail-closed |
| Tinggi | Tool lokal/external terlihat terlindungi UI padahal clone tetap memiliki logic tersebut | Hanya 28 ID server-backed yang boleh VVIP; migration 033 membersihkan status lama yang tidak enforceable |
| Tinggi | Build belum melakukan audit ulang setelah file dipindahkan ke `public/` | Build sekarang gagal jika secret-like token, private key, source map, atau file privat muncul pada bundle publik |
| Sedang | Account login/register/recovery belum memiliki limiter lokal terpusat | Fixed-window rate limit bounded ditambahkan tanpa menyimpan email/IP mentah sebagai key |
| Sedang | Alight Premium dan IPinfo belum memiliki limiter handler sendiri | Rate limit dan `Retry-After` ditambahkan; raw error provider Alight tidak lagi dikirim ke browser |
| Sedang | Validasi target SiteGrabber hanya memeriksa protocol | Validator publik yang memblokir localhost, private/reserved IP, kredensial URL, dan port berbahaya digunakan kembali |
| Sedang | CSP mengizinkan `base-uri` dan `form-action` ke HTTPS mana pun | Keduanya dipersempit ke `'self'`; CORP, HSTS, dan cross-domain policy header ditambahkan |

## Endpoint server-authorized

Policy server mencakup All-in-One Downloader; Instagram, TikTok, YouTube, Spotify, dan Terabox; Alight Premium; AI Song; Anime-to-Real; Auto PDF; BMKG; Comic Reader; Crypto Market; Danbooru; Document AI; ElevenLabs; HD4; GenMail; SiteGrabber; Image Vectorizer; IP Intelligence; Novel Cover; OCR; Prompt Generator; Space Explorer; SVG-to-Alight; VDeploy; dan Web Intelligence.

Metadata/configuration serta probe kesehatan yang tidak menjalankan provider tetap dapat dibaca publik. Saat sebuah tool diatur VVIP, operasi sebenarnya tetap meminta session dan entitlement server.

## Session dan admin

- Access/refresh token akun dan admin berada pada cookie HttpOnly.
- Cookie produksi memakai `Secure`; refresh dan CSRF memakai `SameSite=Strict`.
- Mutasi akun/admin memakai double-submit CSRF dan origin verification.
- Semua operasi `/api/admin/*` memanggil `requireAdmin()`; role edit tetap diperiksa server.
- Admin UI guard hanya untuk pengalaman pengguna dan tidak menjadi authorization.

## Secret dan build

Provider key hanya dibaca dari `process.env` pada `api/` atau `lib/`. Frontend tidak menerima nilai key. `scripts/audit-public-build.js` memeriksa hasil final `public/`, termasuk token Google/OpenAI/Hugging Face/GitHub/JWT, header authorization literal, private key, source map, serta file backend atau environment yang tidak boleh diterbitkan.

## Verifikasi

```bash
npm run check
npm test
npm run build
```

Regression `test-security-authorization-v7.js` mencakup clone origin, spoof body VIP/admin, session kosong (401), akun non-VVIP (403), session VVIP aktif, default-deny tool frontend, urutan guard dispatcher, downgrade proxy media, sinkronisasi SQL-policy, header, dan audit bundle publik.

## Konfigurasi manual

1. Jalankan `database/migrations/033_server_authorization_hardening.sql` pada Supabase production.
2. Biarkan `NEXORA_ALLOWED_ORIGINS` kosong untuk same-origin default. Isi hanya jika ada frontend resmi lain, dengan daftar exact origin dipisahkan koma. Jangan memakai `*`.
3. Pastikan secret Vercel hanya tersedia pada environment yang diperlukan lalu redeploy.
4. Rotasi credential yang pernah dipublikasikan di screenshot, repository, chat publik, atau bundle lama.

## Risiko tersisa

- Tampilan dan logic tool yang memang berjalan lokal di browser tetap dapat disalin; tool tersebut sengaja tidak boleh diberi status VVIP sampai operasinya dipindahkan ke server.
- Rate limit in-memory bekerja per instance Function. Untuk pembatasan global yang konsisten lintas region, gunakan store terdistribusi dan user-based quota pada tahap berikutnya.
- CSP masih membutuhkan inline script/style dan beberapa origin eksternal karena kompatibilitas tool legacy. Penghapusannya memerlukan migrasi frontend bertahap dan tidak dilakukan secara membabi buta.
- Origin check adalah defense-in-depth, bukan pengganti session, entitlement, admin role, quota, atau rate limit.
- Audit source tidak menggantikan penetration test deployment production dan pemeriksaan konfigurasi provider nyata.

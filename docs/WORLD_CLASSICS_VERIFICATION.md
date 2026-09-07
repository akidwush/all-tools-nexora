# Hasil verifikasi World Classics Reader V1

Tanggal: 7 September 2026. Implementasi melanjutkan checkpoint Audit + Admin Branding V1; audit branding sebelumnya tidak dikerjakan ulang.

| Pemeriksaan | Hasil yang dijalankan |
|---|---|
| Build frontend dan regresi existing | PASS: 111/111 skrip; 60 tool; tetap 12/12 Vercel Functions; artefak `public/` berhasil dibuat |
| Typecheck Edge | PASS: seluruh empat entrypoint memakai Deno strict |
| Unit/integration Edge dengan upstream mock | PASS: 10 kelompok tes; source/mode/input, sanitasi, ruby/footnotes, search HIT/MISS/expiry, page revision refresh, discovery, translation HIT/mode/hash, quota/lease/failure, HTTP auth/CORS/SSRF, paragraph chunk/merge |
| SQL engine / RLS | PASS: migration dua kali, grants anon, RLS user A/B pada bookmark/history, penolakan pindah owner, history maksimal 100, quota atomic fixed-window, expiry, lease dan unique cache |
| Frontend DOM | PASS: guest search/read/translate/bookmark/history, original saat provider gagal, mode terpisah, offline chapter, cloud write user login, pemisahan A/B/tamu, cleanup dan penundaan scroll writes |
| Auth transport | PASS: reuse endpoint account; privilege key ditolak; guest tanpa bearer; JWT user di memori; retry 401 sekali; logout membersihkan token; akses tabel/function terbatas |
| Mobile | PASS untuk DOM/kontrol dan kontrak CSS responsif. BELUM diverifikasi secara visual di browser Android nyata karena akses preview lokal browser diblokir lingkungan |
| Patch Termux | PASS: apply tiga arah, build, commit, push ke remote Git lokal, perubahan commit lokal tetap terjaga, repeated check, dan penolakan working tree kotor |
| Wikisource langsung | PASS: pencarian API Jepang mengembalikan HTTP 200 untuk 源氏物語; ini bukan tes Edge produksi |
| Live production Supabase / provider | BELUM DIJALANKAN: tidak tersedia access token Supabase, password DB, Gemini key, atau dua akun tes. Tes provider di atas memakai mock deterministik |
| Deployment produksi | BELUM DILAKUKAN: patch berisi workflow GitHub Actions untuk memasang migration, secret, dan Edge Functions pada project existing |

Migration: `202609070001_world_classics_reader.sql`. Empat tabel fitur dan dua tabel internal limiter/lease semuanya RLS-ready. Cache global hanya service role, indeks unik memisahkan sumber/title/type serta hash/mode terjemahan. TTL search 12 jam, chapters 24 jam, page 3 hari dengan pemeriksaan revision setiap 15 menit; terjemahan tidak memakai TTL pendek.

Source hanya Chinese/Japanese/Korean Wikisource dengan link asli. Bilingual mempertahankan ruby; hasil terjemahan berupa pemetaan index/original/translated. Tidak ada Storage, crawler, mass mirroring, generic arbitrary-URL proxy, atau backend reader Vercel baru.

`supabase/tests/live.mjs` disertakan untuk melanjutkan tes terhadap project setelah deployment. RLS lokal diuji menggunakan PostgreSQL/PGlite; hasil ini tidak disamakan dengan verifikasi konfigurasi production Supabase.

Langkah aktivasi, variabel yang dibutuhkan, kuota default, batas konten, dan detail semua komponen ada di `docs/WORLD_CLASSICS_READER.md`.

# Nexora Endpoint Maintenance

Endpoint Maintenance adalah control plane untuk **known providers**. Fitur ini bukan generic proxy, bukan visual programming engine, dan tidak dapat membuat provider baru.

## Storage dan effective config

Nexora memakai private `app_settings` yang sudah ada, key `endpoint_maintenance_v1`.

```
CODE DEFAULT
  ↓
validated private DB override
  ↓
effective provider config
```

Jika database override tidak tersedia/invalid, runtime kembali ke code default. Secret tidak disimpan pada `app_settings`.

History perubahan dibatasi dan disimpan bersama config private, sedangkan event administratif juga ditulis ke `admin_audit_logs`.

## Managed providers

### Comic Sources

- MangaDex
- Shinigami
- Voratoon
- Ainzscans
- MangaDotNet

Source lain tidak otomatis ditambahkan. DoujinDesu, APKomik, SoftKomik dan source bypass/protected/encrypted tetap tidak didukung.

### AI Providers

Daftar berasal langsung dari `lib/kuroneko-multiai.js` `PROVIDERS`. Claude Sonnet tidak ditambahkan karena tidak berada pada capability registry Nexora.

AI provider pada Sylvatica dapat mengubah mode, base URL pada host allowlist, relative provider path, timeout, health path, dan fallback provider dengan kategori capability utama yang sama. Fallback cycle ditolak.

### External Utilities

Registry eksplisit hanya memuat adapter aktif:

- AIO Downloader
- Danbooru Search
- Anime to Real
- AI Song
- HD4 Enhancer
- GenMail

Pixiv Search tidak dimasukkan karena current main tidak memiliki active server adapter Pixiv. Menemukan kata `pixiv` pada metadata/gallery tidak cukup untuk membuat endpoint maintenance.

## Not managed

Browser/local/official-stable integration tidak masuk control plane, termasuk Avatar Studio/DiceBear, Kokoro, HeadTTS, WebLLM, Transformers.js, PDF/local image tools, MediaWiki, Open Library, AniList dan Open-Meteo.

## Editable fields

Field hanya muncul bila provider mendukungnya:

- Mode: `active`, `maintenance`, `disabled`
- Base URL
- provider path
- timeout
- health path
- fallback provider (AI compatible only)
- API version hanya bila adapter suatu hari mendeklarasikan dukungan version switching

Parser, normalizer, request body template, arbitrary headers, signing, encryption dan JavaScript tidak editable. Jika response schema berubah, Nexora memerlukan code update.

## Host allowlist dan SSRF

Base URL wajib HTTPS, tanpa userinfo, tanpa custom port, dan hostname harus cocok dengan allowlist code provider.

Host baru **tidak dapat diaktifkan dari dashboard**. Tambahkan host melalui code review terlebih dahulu.

Candidate test memakai existing public-host/DNS validation Nexora. Localhost, private/reserved IP, link-local, metadata host, `file:`, `ftp:`, `data:` dan `javascript:` ditolak. Redirect diuji ulang dan harus tetap berada pada allowlist provider.

## Credentials

Credential disimpan hanya pada Vercel Environment Variables/secret store. Endpoint config hanya memiliki `credentialRef`, misalnya `KURONEKO_API_KEY`.

Admin hanya menerima:

- credential reference
- `Configured`
- `Missing`

Secret value tidak dikirim ke browser, database history atau audit log.

## Candidate testing

`Test Candidate` menjalankan health probe server-side tanpa mengganti production config.

AI/image/audio provider diuji dengan `HEAD`/non-generation probe; Nexora tidak mengirim prompt `Hello` hanya untuk health check.

Hasil nyata dapat memuat HTTP status, latency, checkedAt, resolved host dan normalized status.

## Save / apply

Save divalidasi ulang di server. Update `app_settings` dilakukan sebagai satu upsert, lalu config cache di-invalidasi.

Mode `maintenance` dan `disabled` ditegakkan server-side. UI hide/disable bukan security boundary.

## Rollback / reset

Setiap save mencatat before/after. Rollback memvalidasi historical config terhadap allowlist saat ini sebelum diterapkan.

`Reset to Default` menghapus override provider dan kembali memakai code default; default tidak diduplikasi ke database.

## Authorization

Endpoint admin memakai existing authenticated admin session, permission `editTools`, CSRF mutation guard, rate limit dan Admin Audit Log.

Logical route:

`/api/admin/dashboard?mode=endpoint-maintenance`

Tidak ada Vercel Function baru.

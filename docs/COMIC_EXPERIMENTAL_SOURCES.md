# Nexora Adult / Experimental Comic Sources

## Purpose

Adult / Experimental Comic Sources adalah area opt-in terpisah dari katalog Comic Reader publik. Source pada area ini tidak boleh ikut normal discovery, `All Sources`, rekomendasi, automatic source matching, fallback, prefetch, standard History atau standard Favorites.

Standard Comic Reader tetap:

- MangaDex
- Shinigami ID
- Voratoon
- Ainzscans
- MangaDotNet

## Classification

Source experimental menggunakan metadata eksplisit seperti:

- `category: adult-experimental`
- `adult: true`
- `experimental: true`
- `defaultEnabled: false`
- `optInRequired: true`
- `participatesInSearch: false`
- `participatesInFallback: false`

Istilah `policy: experimental` yang sudah ada pada beberapa provider standard berarti stabilitas/terms provider dan **bukan** klasifikasi adult.

## Opt-in and privacy

Preference disimpan hanya di perangkat:

- `nx_comic_experimental_sources_v1`
- `nx_comic_experimental_history_v1`
- `nx_comic_experimental_favorites_v1`
- `nx_comic_experimental_cache_v1`

Fresh browser tidak mengaktifkan source experimental.

Enabling membutuhkan dua langkah:

1. membuka informasi Adult / Experimental Sources;
2. explicit adult confirmation.

Preference ini hanya visibility preference dan bukan authorization/security boundary. Nexora tidak menyinkronkan preference, title, search term, history atau favorite experimental ke profile/Supabase.

`Clear Experimental Data` menghapus preference dan seluruh local experimental library/cache.

## Network isolation

Saat experimental mode OFF:

- client tidak meminta experimental source registry;
- tidak ada experimental search;
- tidak ada adult cover `<img>`;
- tidak ada adult prefetch;
- standard `All Sources` hanya memakai source standard;
- automatic source matching hanya memakai source standard.

Experimental API request wajib membawa `mode=experimental`. Server memvalidasi bahwa source memang terklasifikasi experimental dan tetap menerapkan global Admin Endpoint Maintenance.

LocalStorage tidak dapat melewati global admin `maintenance` / `disabled`.

## Deep links

Deep link `mode=experimental` tidak memuat provider/content jika preference OFF. User terlebih dahulu mendapat opt-in gate. Shared URL juga tidak melewati gate.

Experimental content tidak memiliki route katalog SEO terpisah dan tidak dimasukkan sitemap. Ketika experimental view aktif, client menambahkan `robots=noindex,nofollow` pada document iframe.

## History and favorites

Standard dan experimental menggunakan storage key berbeda.

Ketika experimental mode dimatikan:

- experimental UI langsung hilang;
- standard History/Favorites tetap bersih;
- local experimental data tidak otomatis dihapus.

Data hanya dihapus ketika user memilih `Clear Experimental Data`.

## Admin control

Endpoint Maintenance mempunyai group:

`EXPERIMENTAL COMIC SOURCES`

Admin mode tetap authoritative:

- ACTIVE
- MAINTENANCE
- DISABLED

Provider yang belum dapat diakses melalui normal legitimate HTTP flow dapat memiliki `activationSupported: false` dan `availability: unsupported`. Dashboard tidak boleh menjadikan parser/decryption/anti-bot logic sebagai editable config.

## DoujinDesu

DoujinDesu adalah provider pertama yang terdaftar pada arsitektur ini, tetapi current adapter **UNSUPPORTED**.

Capabilities saat ini:

- search: false
- detail: false
- chapters: false
- pages: false
- translationCompatible: false

Alasannya: current known flow menggunakan protected/internal behavior yang tidak layak diimplementasikan melalui bypass pada Nexora serverless.

Nexora tidak mengimplementasikan:

- Cloudflare / anti-bot bypass
- CAPTCHA workaround
- stolen/session cookies
- browser fingerprint spoofing
- runtime secret extraction
- signature forging
- encrypted-response bypass
- generic arbitrary URL proxy

Karena itu health status DoujinDesu adalah `UNSUPPORTED`, bukan fake `Online`.

Jika di masa depan upstream menyediakan normal documented/public HTTP flow, capabilities dapat diaktifkan melalui code review dan adapter normal yang mengembalikan schema Comic Reader existing. Perubahan parser/request format tetap CODE UPDATE REQUIRED.

## Translation

Experimental source default `translationCompatible: false`.

Adult pages tidak dikirim otomatis ke Translate All. MangaDex Translate All dan standard translation flow tidak berubah.

## Service worker / media cache

Tidak ada experimental cover/page yang ditambahkan ke precache. Current DoujinDesu adapter tidak mempunyai media endpoint dan tidak membuat upstream media request.

## Telemetry

Operational provider-level success/failure dapat dicatat. Search term, title dan chapter experimental tidak dikirim sebagai analytics payload hanya untuk telemetry.

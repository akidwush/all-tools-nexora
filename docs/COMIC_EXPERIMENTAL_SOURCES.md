# Nexora Adult / Experimental Comic Sources

## Purpose

Adult / Experimental Comic Sources adalah area opt-in yang terpisah dari Comic Reader publik. Source experimental tidak ikut normal Search, All Sources, recommendation, fallback, automatic source matching, standard History atau standard Favorites.

Standard sources tetap MangaDex, Shinigami ID, Voratoon, Ainzscans dan MangaDotNet.

## Opt-in and privacy

Experimental mode OFF by default. Enabling membutuhkan informasi adult/experimental dan explicit adult confirmation.

Local-only keys:

- `nx_comic_experimental_sources_v1`
- `nx_comic_experimental_history_v1`
- `nx_comic_experimental_favorites_v1`
- `nx_comic_experimental_cache_v1`

Preference, search term, History dan Favorites experimental tidak disinkronkan ke Supabase/account.

Standard `All Sources` tidak pernah menyertakan provider experimental.

## DoujinDesu status

DoujinDesu diregister sebagai:

- adult: true
- experimental: true
- defaultEnabled: false
- optInRequired: true
- participatesInSearch: false
- participatesInFallback: false
- participatesInExperimentalSearch: true
- translationCompatible: false
- availability: degraded (partial capability)

Capabilities current:

- Search: implemented through normal public HTML search request.
- Detail: implemented through normal public manga detail HTML.
- Chapters: implemented through normal public chapter-list HTML.
- Pages: disabled in the public capability registry.

Pages sengaja masih disabled. HakuNeko legacy HTML connector required browser/UI execution for reader pages, while current HaruNeko connector uses a protected API response with app-secret/device headers and a time-derived decode flow. Nexora does not copy that protected path.

The adapter contains a conservative static-page parser only for controlled diagnostics. It does not execute upstream JavaScript and the production capability remains `pages: false` until normal static page delivery is live-verified.

## Research boundary

Latest HaruNeko research shows current origin `https://doujin.desu.xxx` and API-backed manga/chapter/page contracts, but the current connector also supplies `X-App-Secret`, generated device identity and decrypts an `_enc_resp_` payload.

Nexora intentionally does **not** implement:

- X-App-Secret copying
- generated/fake device identity
- encrypted response decryption
- Cloudflare/CAPTCHA bypass
- browser fingerprint spoofing
- stolen cookies/session harvesting
- signature forging
- browser automation

The legitimate subset is independently implemented against normal website HTML behavior documented by the older HakuNeko WordPress/Mangastream connector.

If normal HTML access is blocked by anti-bot/protection at runtime, health/search return a normalized provider-unavailable state. Nexora will not fall back to the protected API.

## Health

After explicit opt-in, the UI may request one lightweight experimental health check. The probe uses GET only for status/headers and cancels the response body immediately because this upstream did not reliably answer HEAD. Before opt-in there are zero DoujinDesu network requests.

Admin Endpoint Maintenance uses the known host allowlist:

`doujin.desu.xxx`

Admin can change mode, safe base URL within the allowlist, timeout and health path. Parser/decode code cannot be edited from Admin.

## Deep links

Experimental deep links do not preload content while mode is OFF. They first show the opt-in gate.

## History / Favorites

Experimental History and Favorites are local-only and separate. Turning experimental mode OFF hides them without deleting them. `Clear Experimental Data` removes preference/history/favorites/cache.

## Translation

DoujinDesu remains `translationCompatible: false`. MangaDex Translate All is unchanged.

## Reader limitation

Chapter lists may be browsed when normal HTML parsing succeeds. Reader opening is blocked when the provider publishes `pages: false`, so the UI does not pretend full reader support.

## Live verification

Run one controlled probe:

```bash
COMIC_DOUJIN_LIVE=1 node scripts/test-comic-doujindesu-live.js
```

The test performs a lightweight health request, one safe search query (`My Land Lady`), one detail request and obtains chapters from the cached detail HTML. It does not download images or raw adult response dumps.

Optional static page probe:

```bash
COMIC_DOUJIN_LIVE=1 DOUJINDESU_PROBE_PAGES=1 node scripts/test-comic-doujindesu-live.js
```

A successful static page probe is evidence for a future code change; it does not auto-enable production pages.

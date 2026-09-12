# Nexora Multi-Source Comic Reader

## Scope

Nexora keeps one Comic Reader and one server dispatcher. MangaDex remains the default source and its existing search, detail, chapter reader, image proxy, resume/history, and Translate All flow remain the compatibility baseline. Multi-source V1 adds provider adapters behind the existing `/api/comics` route; no provider receives its own Vercel Function and no generic URL proxy is exposed.

V1 registry:

| ID | Label | API base | Policy | Language | Translate All |
| --- | --- | --- | --- | --- | --- |
| `mangadex` | MangaDex | `https://api.mangadex.org` | active | multilingual | yes |
| `shinigami` | Shinigami ID | `https://api.shngm.io/v1/` | experimental | id | no (V1) |
| `voratoon` | Voratoon | `https://api.voratoon.com/series/` | experimental | id | no (V1) |
| `ainzscans` | Ainzscans | `https://api.ainzscans01.com/api/` | experimental | id | no (V1) |
| `mangadotnet` | MangaDotNet | `https://mangadot.net/api/` | experimental | multilingual | no (V1) |

The non-MangaDex adapters are marked **experimental** because their public JSON behavior can change and the repository does not claim ownership of their content or an entitlement to a private API. Production operators should disable a source if its terms or runtime behavior no longer permit the integration.

Not implemented in V1: DoujinDesu, SoftKomik, APKomik, Kiryuu, and Komiku. Nexora does not include decryption, signed-token extraction/forging, CAPTCHA/Cloudflare bypass, browser automation, DRM bypass, or anti-bot workarounds.

## Architecture

The browser talks only to the existing Comic Reader API dispatcher:

```text
Comic Reader UI
  -> /api/comics?action=...&source=...
  -> existing api/health.js dispatcher (mode=comic-reader)
  -> lib/comic-reader.js
  -> comic source registry
  -> provider adapter
  -> fixed provider API origin
```

Provider logic lives under `lib/comic-sources/`:

- `registry.js`: provider registry, capability metadata, request-derived health, image-host allowlists.
- `normalizer.js`: normalized Manga/Chapter/Page models.
- `shared.js`: fixed-origin JSON fetch, timeout, bounded retry, Retry-After handling, cache, and input validation.
- `mangadex.js`, `shinigami.js`, `voratoon.js`, `ainzscans.js`, `mangadotnet.js`: provider adapters.

The UI never receives provider-specific raw response objects as its core model.

## Adapter contract

Conceptually each source supplies:

```js
{
  definition: { id, label, capabilities, languages, policy },
  search({ query, page, limit, ... }),
  getManga({ id, ... }),
  getChapters({ mangaId, ... }),
  getPages({ mangaId, chapterId, ... })
}
```

`capabilities` currently includes `search`, `detail`, `chapters`, `pages`, `languageFilter`, `pagination`, and `translationCompatible`. Frontend controls are capability-driven rather than assuming every source supports the same features.

## Normalized model

Manga:

```js
{
  source, id, slug, title, altTitles, coverUrl, description,
  authors, artists, genres, status, language, url, metadata
}
```

Chapter:

```js
{
  source, id, mangaId, title, number, volume, language,
  publishedAt, group, metadata
}
```

Page:

```js
{
  source, chapterId, index, url, width, height,
  refererRequired, metadata
}
```

Unavailable scalar data is `null`; adapters do not synthesize author, status, cover, or publication metadata. List fields use empty arrays when no values are supplied.

## Provider notes

### MangaDex

The existing implementation remains authoritative. Content ratings and current behavior are preserved. MangaDex pages continue through the existing page-image proxy, and existing Translate All remains enabled.

### Shinigami ID

The adapter uses only the fixed JSON API base `https://api.shngm.io/v1/`. The website domain is not a dependency. V1 uses bounded list pagination and local title filtering because the current connector contract documents `manga/list`, not a separate query endpoint. Chapter pages use `base_url + chapter.path + chapter.data[]`. No `page_size=9999` requests are made.

### Voratoon

The adapter uses `https://api.voratoon.com/series/` with the normal `Origin` and `Referer` headers required by the current public connector flow. It does not forward browser cookies, Authorization, admin tokens, or user credentials. Reader image requests that require a referer are routed through the existing page-image action and a provider host allowlist.

### Ainzscans

The adapter uses the fixed `https://api.ainzscans01.com/api/` JSON flow. Search/list is bounded to at most 50 items per request. Chapter pages come from `chapter.pages[].image_url`. If the API disappears or changes contract, the provider fails independently and other sources continue to work.

### MangaDotNet

The adapter uses the fixed `https://mangadot.net/api/` JSON endpoints for list, chapters, volumes, and images. It does not add a new HTML parser just to enrich detail metadata; detail therefore retains only values already known from normalized search context when the current JSON connector does not expose them. Language filtering is applied to chapter rows when requested.

## Search and source switching

The source selector defaults to MangaDex. `All Sources` performs only search, not background library crawling. It runs eligible providers with a concurrency limit of 2 using settled results, so one failed provider does not fail the whole search. Progress is represented by real `queued`, `loading`, `complete`, `failed`, or `cancelled` source states, not a fabricated percentage.

Results retain their source identity. Different providers are not merged simply because titles match. On manga detail, Nexora may discover alternate sources using normalized titles and, when available, authors. A title match is medium confidence; an author-assisted match can be high confidence. V1 never silently jumps to an equivalent chapter in another provider. Switching source returns to the matched manga detail.

## Provider health

Provider health starts as `unchecked`. A source becomes active/degraded/unavailable only from real requests observed in the running process/session. No uptime percentage or synthetic latency is displayed. The registry keeps a small rolling sample for runtime status; this is not a persistent monitoring service.

## Retry, timeout, and cache

Provider JSON requests have a bounded timeout (normally 10 seconds, hard-capped at 20 seconds) and at most two retries. Network failures and HTTP 502/503/504 can retry with bounded exponential backoff. HTTP 400/401/403/404 are not retried. HTTP 429 retries only when a valid `Retry-After` is present and respects it within a bounded wait.

Short-lived in-memory caches are used for search/list, detail, and chapters. Images are not bulk-cached, stored in Supabase, mirrored, or archived.

## Image proxy and SSRF controls

Nexora does not expose `/api/comics?url=...`. Provider/action/IDs are allowlisted and each provider has a fixed API origin. For referer-required pages, the server re-fetches the page manifest from the selected adapter using validated IDs, selects the requested page index, and verifies the resulting image hostname against that provider's allowlist before fetching it.

The pinned-DNS path accepts HTTPS, resolves public IPv4 A records, and rejects loopback, link-local/metadata, RFC1918 ranges, CGNAT, benchmark/documentation ranges, multicast/reserved ranges, and empty/private resolution. No `file:`, `ftp:`, localhost, arbitrary host, or internal Vercel target can be supplied by a browser parameter.

## Translate All compatibility

Translate All is deliberately unchanged for MangaDex. Existing OCR/Gemini/Supabase behavior, queue priority, concurrency, rate limiting, overlays, Original/Indonesia toggle, and persisted translation cache continue to use the existing MangaDex pipeline. Its cache identity already contains the `mangadex` provider alongside manga/chapter/page identity.

The four new V1 providers publish `translationCompatible: false`. Their reader stays fully usable in Original mode and the Translate All button is disabled with a source-specific explanation. This avoids pretending the existing MangaDex-only translation database contract supports cross-provider IDs. Future support can be added by widening the translation backend's provider contract and cache key deliberately rather than overloading chapter IDs.

## Source enable/disable

The source registry is the server-side authority. A provider should be removed/disabled in the registry (or connected to an existing server-enforced admin setting in a later change), not merely hidden in UI. This V1 does not add a UI-only admin toggle.

## HaruNeko reference

HaruNeko was used only as implementation research for current public connector shapes. Nexora adapters are independently written and intentionally omit any connector behavior involving anti-bot bypasses, decryption, runtime secret extraction, forged signatures, or browser automation. If substantive upstream code is ever copied in the future, its repository license and attribution must be followed explicitly.

## Tests

- `scripts/test-comic-multi-source.js`: fixture/normalizer contracts, routing, limits, retry policy, source registry, SSRF primitives, no generic proxy.
- `scripts/test-comic-sources-live.js`: opt-in tiny live check; it is skipped unless `COMIC_LIVE_TESTS=1` so build never depends on third-party uptime.
- Existing Comic Reader and Translate All regression suites remain mandatory.

Run:

```bash
node scripts/check-project.js
node scripts/test-comic-reader-v2.js
node scripts/test-comic-reader-mobile-ui.js
node scripts/test-comic-translate-all.js
node scripts/test-comic-multi-source.js
COMIC_LIVE_TESTS=1 node scripts/test-comic-sources-live.js   # optional
VERCEL=1 npm run build
```

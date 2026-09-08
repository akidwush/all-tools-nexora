# Nexora Readers Model HF1 — 8 September 2026

Production root cause: `comic-translate-page` received Gemini HTTP 404 for
`gemini-2.5-flash`, classified as `TRANSLATION_MODEL_UNAVAILABLE`. The function
hid that classification behind a generic message. The supplied runtime log
identifies the same execution as the failed page invocation. This is evidence
of model unavailability for that request/account, not proof of global retirement.

## Changes

- Shared model discovery uses Google's official paginated `models.list` with the
  existing server API key and requires `generateContent` support. Auto selection
  uses a reviewed allowlist of text/image-understanding models. Default preference
  is `gemini-3.5-flash`; the actual model must appear in the account's response.
- Explicit existing server settings remain preferred when available. A 404 retries
  at most two alternative listed models; models that failed are skipped for the
  cached selection's remaining lifetime (15 minutes). There is no alternate-model
  retry for quota, credentials, timeout or server outages. Concurrent page requests
  share discovery. Model metadata is memory-only and bounded to eight configurations.
- Both Comic Reader and World Classics use this resolver. Cache hits still bypass
  Gemini entirely. Stored model provenance reflects the actual model used.
- Comic errors now retain the safe, actionable provider classification message and
  log a correlation ID/code. Provider bodies, images, dialogue and credentials are
  never logged or returned in errors.
- Existing GitHub Actions now automatically verify/deploy on main pushes affecting
  Supabase or the workflow, while retaining manual Run workflow. PR runs never deploy.
- Before migrations/secrets/deployment, the runner uses the existing GEMINI_API_KEY
  to perform real Indonesian text translation and OCR/translation of a synthetic
  speech-bubble fixture through the production vision code. It validates JSON,
  mapping and recognizable Indonesian output. Both must succeed. The actually
  tested models are written to the subsequent Edge secrets configuration, so stale
  GitHub model variables cannot overwrite the successful selection.
- The live probe makes two small successful inference requests per deploy, plus
  bounded 404 fallback attempts if necessary. It uses no reader/user content.

## Verification

- Build: 112/112 regression checks passed; public output 296 files / 35.07 MB.
- Deno unit/integration tests: 27 groups passed, including actual image codecs,
  production-shaped 404 then successful OCR fallback, cached discovery, pagination,
  disallowed models/URLs, no extra calls on 429/403/503, cache/mode/hash isolation.
- Existing PostgreSQL/RLS and reader DOM suites passed, including mobile viewport
  checks at 360/375/390/412 px; this backend patch changes no reader layout.
- Type checking includes both comic endpoints, classic translation, and live probe.
- The Termux installer was exercised against a local Git remote: apply/build/commit/
  push, committed customization preservation, repeat detection and dirty-tree refusal.

The live Google checks could not be run in the repair workspace because production
credentials are only available to the existing GitHub Actions deployment. Successful
local tests do not certify live account quota, mobile visual quality or all chapters.
The new Actions probe gates Gemini availability and translation before deployment;
it is not an end-to-end browser/Supabase/MangaDex production test. Verify Translate
All on the original four-page chapter after the new workflow succeeds.

## Installation

Run `APPLY_NEXORA_READERS_MODEL_HF1.sh` in the clean `main` checkout in Termux.
It fetches main, uses an isolated worktree and three-way application, builds,
commits and pushes without force. Supports `--check` and `--no-push`.
The push triggers the updated Readers workflow. Existing GitHub secrets are reused.
No new SQL/migration, manual SQL Editor work, storage bucket or Vercel API is needed.
A provider quota/permission/probe failure now stops deployment with a safe code.

## Files

Created:
- `supabase/functions/_shared/translation-model.ts`
- `supabase/functions/_shared/translation-model_test.ts`
- `supabase/tests/translation-live.ts`
- `supabase/tests/fixtures/translation-probe.png`
- `docs/READERS_MODEL_HF1.md`

Modified:
- `.github/workflows/world-classics.yml`
- `supabase/functions/_shared/comic/handler.ts`
- `supabase/functions/_shared/comic/vision.ts`
- `supabase/functions/_shared/comic_test.ts`
- `supabase/functions/_shared/reader_test.ts`
- `supabase/functions/_shared/translation.ts`

Official references checked 8 September 2026:
- https://ai.google.dev/api/models
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash
- https://ai.google.dev/gemini-api/docs/deprecations

# All Tools Nexora v6.3.13 HF3 — Vercel Build Validator Fix

## Root cause
Vercel build stopped with:

`Rewrite /api/vdeploy belum tersedia.`

The HF2 validator checked `vercel.json` using an exact raw substring:

`vercelConfig.includes('"source": "/api/vdeploy"')`

That check is whitespace/format sensitive. A valid JSON configuration can therefore be reported as missing when its formatting differs.

## Fix
- Parse `vercel.json` with `JSON.parse`.
- Require a semantic rewrite object whose `source` is `/api/vdeploy`.
- Require its destination to contain `mode=vdeploy`.
- Added a regression test that rejects returning to the raw-string check.
- Verified the project audit also passes when `vercel.json` is minified.

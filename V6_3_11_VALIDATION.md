# Validasi Nexora v6.3.11

- `npm test`: lulus seluruh regression suite.
- `npm run build`: lulus dan menghasilkan folder `public/`.
- JavaScript syntax check: lulus untuk `app.js` dan `source-features.js`.
- Serverless function limit: 12/12.
- Remove Background: local-first, local fallback, API last-resort.
- FakeDev: API-first dengan canvas fallback ketika HTTP 400/network failure.
- Cache-busting asset: v6.3.11.

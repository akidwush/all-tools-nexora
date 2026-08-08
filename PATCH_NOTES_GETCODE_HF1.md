# Get Code + SiteGrabber Hotfix HF1

Root cause: tool health memeriksa `OPTIONS /api/audit`, tetapi endpoint audit hanya menerima POST. HTTP 405 tersimpan sebagai status offline dan stability layer memblokir kartu Get Code sebelum lazy module terbuka.

Fix:
- Health Get Code memeriksa lazy module `assets/js/features/get-code.js`.
- `/api/audit` menerima OPTIONS 204.
- Cached offline pada tool bermode module diturunkan menjadi degraded agar room tetap dapat dibuka.
- Cache shell/lazy-loader dibust ke `6.3.13-hf1`.
- Integrasi SiteGrabber-X v6.3.13 tetap utuh.

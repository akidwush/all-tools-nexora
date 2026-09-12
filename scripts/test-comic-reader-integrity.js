"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const locked = Object.freeze({
  "assets/js/features/comic-reader.js": "9f751be2e67f9ce72518f9d6d2544c4df31ea01b96dac617555934d68bb0cacc",
  "assets/comic-reader/index.html": "190b142c53f88502b6e7453e1ec095c9eaf9da78c7af37915dbc5afce2df1891",
  "assets/comic-reader/app.css": "db0da8f022d52f92d9acd4a6f2504073b4afaa07b547442544e7781e87c682c5",
  "assets/comic-reader/app.js": "97834555876f33406408b098b363ec8dcda147f90272c2eac6cab7ff83b2a0a0",
  "assets/comic-reader/translate.js": "be978a88666033e89d934576bda96935fb74b3a20f461f38b2578aec018219e8",
  "assets/css/features/comic-reader.css": "61e079135af952ecebfa5a10e3a88c01cc9eb441bf4c7aa5dc70df6dd2007b2a"
});

for (const [relative, expected] of Object.entries(locked)) {
  const absolute = path.join(root, relative);
  assert.ok(fs.existsSync(absolute), `Comic Reader lock: ${relative} hilang`);
  const actual = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  assert.equal(actual, expected, `Comic Reader lock: ${relative} berubah tanpa unlock eksplisit`);
}

const shell = fs.readFileSync(path.join(root, "assets/js/features/comic-reader.js"), "utf8");
assert.doesNotMatch(shell, /COMIC_READER_APP_B64|srcdoc|nxComicApiBridgeHandler|nx-comic-api-request/);
assert.match(shell, /\/assets\/comic-reader\/index\.html\?v=standalone-v1/);

console.log("Comic Reader integrity lock lulus: 6 file canonical terkunci; legacy Base64/srcdoc/bridge tidak dapat kembali diam-diam.");

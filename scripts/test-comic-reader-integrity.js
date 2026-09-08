"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const locked = Object.freeze({
  "assets/js/features/comic-reader.js": "9f751be2e67f9ce72518f9d6d2544c4df31ea01b96dac617555934d68bb0cacc",
  "assets/comic-reader/index.html": "c13f181903ff4d377e199866418070bd5615bb9d59b21a729c8d0955b1e160c9",
  "assets/comic-reader/app.css": "2a6ca41369f11c8583ec2f000408deb3834d9725b08d683416d5d3092142e9a6",
  "assets/comic-reader/app.js": "5fb8b6df36c1b0fd07e7b22b4d87654b26ba7a0f6c2b8524f2829d96d3ecbdfd",
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

console.log("Comic Reader integrity lock lulus: 5 file canonical terkunci; legacy Base64/srcdoc/bridge tidak dapat kembali diam-diam.");

"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const locked = Object.freeze({
  "assets/js/features/comic-reader.js": "9f751be2e67f9ce72518f9d6d2544c4df31ea01b96dac617555934d68bb0cacc",
  "assets/comic-reader/index.html": "448d1cdfea7ed368e53c8fbbd38237c05d1b23af8349756195d820c082913864",
  "assets/comic-reader/app.css": "2a6ca41369f11c8583ec2f000408deb3834d9725b08d683416d5d3092142e9a6",
  "assets/comic-reader/app.js": "02d1bcb2b95a735cca9dc1d9feeae0276b3326ea17bea7b579b3d526af0e15ac",
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

"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const locked = Object.freeze({
  "assets/js/features/comic-reader.js": "aa56bb59b41b0e57fd4a93eebd441738f6a3a40a15949cb427495277b4245ea5",
  "assets/comic-reader/index.html": "9653381ca0f4b0ae79ef33b1b326cd9896290976bae643f79e2289d2161558fc",
  "assets/comic-reader/app.css": "2c5165a4a4cdf3c1375278bd7dd0b845d1ddfdf160be5d60e15d893e981ef987",
  "assets/comic-reader/app.js": "8d40ab15e8d134e03aafb35721b5a6ebb6831e4b2c3c7358367c54549aeb3fb7",
  "assets/comic-reader/translate.js": "672a63ff4877e90df0e450311736a1395232bf96793b5c3c8893aa97ee98a4de",
  "assets/css/features/comic-reader.css": "49f665b05e4e2c0fb5cb36673c6e79a8298a3ac74890e040987e0f030bed76e2"
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

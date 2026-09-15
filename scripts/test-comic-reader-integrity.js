"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const locked = Object.freeze({
  "assets/js/features/comic-reader.js": "2c1bfbbcbcd8e7f09f15c9c9efc01d69b4ae922eaa9a7bb24846a52bd9c973fd",
  "assets/comic-reader/index.html": "6cc8f35397970586d134c69dfd7f604eb24bf8211f11c31e82367541ce0e6360",
  "assets/comic-reader/app.css": "d626a6645a65eac2afd0832796f348db6d2ac369808a0b3548d5aa50a449bdc7",
  "assets/comic-reader/app.js": "71da36884d09994278dfdde34ec1715fb5d70d8ed5881805a605842b0151fcbf",
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

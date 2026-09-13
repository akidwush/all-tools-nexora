"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const locked = Object.freeze({
  "assets/js/features/comic-reader.js": "4ab812b4e56f5912343a5c9592146685cda2661c2f215d834a53aef6e6320d5e",
  "assets/comic-reader/index.html": "5fafef538d7ea18e8c8d78fbb3d1ac9d0e98e9abbf4f9b08d133b8dea917848d",
  "assets/comic-reader/app.css": "cbb1fd3f8ec85bf7153e84a1c5e45b37fdb9dd670a827132daea0183061ef3d2",
  "assets/comic-reader/app.js": "d950eaa621809ea8e814473e7a461c59fe0e22fd4d1d1a05ca3bb8da253f2ef4",
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

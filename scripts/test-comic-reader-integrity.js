"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const locked = Object.freeze({
  "assets/js/features/comic-reader.js": "ee19bb36ded050e55c42c0eaf647bfb4d98451ef72e6ea5d196e564866073748",
  "assets/comic-reader/index.html": "d53e1ff4e2eb80e1fea6d9979e4715d14469c3bee8d0387ac05c1fb78e512e09",
  "assets/comic-reader/app.css": "0fbdf484b637a0e5b7861a188b9ae48da064203f672e5dc8e2689e369e7ac87a",
  "assets/comic-reader/app.js": "dcf8d1c9fecca1372e871aff8ebd2a9a821ea49527e65982a29f88645824340a",
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

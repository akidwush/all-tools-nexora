"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const locked = Object.freeze({
  "assets/js/features/comic-reader.js": "9f751be2e67f9ce72518f9d6d2544c4df31ea01b96dac617555934d68bb0cacc",
  "assets/comic-reader/index.html": "eec42e4c258e8e225921f661d55a04806d3ec846ec2c9bd9c829ce44006913c0",
  "assets/comic-reader/app.css": "07037a92196e953b22e53edc4af85465d818853b52141ddd9e0f588ba37a681a",
  "assets/comic-reader/app.js": "c3ec03dc111ad340c17e6754cf8c79dd44f984d01e417ef6ddc91eddd766728a",
  "assets/comic-reader/translate.js": "767c4da9127da71ea7ee67844605b3031d7c942a89a9ef21b663065c20e1f49e",
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

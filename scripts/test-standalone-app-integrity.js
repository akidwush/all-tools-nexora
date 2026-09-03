"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const locked = Object.freeze({
  "assets/js/features/imported-tools.js": "69a29d6268babe669519617546edda60539cd8bd926212773fcab3a248c3c638",
  "assets/css/features/imported-tools.css": "e9ea25e11f09d6fd52ad30b84d5fcaf05a0bc860f40309fdca2a7580234ff758",
  "assets/apps/ml-tools/index.html": "7406c525548bc682206c83dcabbd8a7b6a5007a0e533a80825be9b35d05850f0",
  "assets/apps/prompt-generator/index.html": "df7745ac283be41771d9bdc78d8806df4cea1678b3e8ee328bda8160396fd425",
  "assets/apps/quote-generator/index.html": "367eb73a66fcf6f1a1a598704128f465549ba94f35acadd8f28f5a3b39b38b7f",
  "assets/apps/cari-fakta/index.html": "2fdabaaec9f0cf16777ea222871e2179b3d067aecabbea595d00533a768ee759",
  "assets/js/features/tiktok-quote.js": "1ba9e81d2ef0414c940208464ab078b8c7060cf21d972f4185937caf881e123c",
  "assets/css/features/tiktok-quote.css": "1e26b073de0d8530bde67e82b58a41610c38b9716859c9fa7983fba5c946a847",
  "assets/apps/tiktok-quote/index.html": "6edbb3b6837a0301d6be956686990afb2d4ac41c80e1f4aaf565c1dcadc5a521",
  "assets/js/features/virus-scan.js": "cf59e0fcdf1b37b70fb48dc0d93e8ec81b7cc856294ea87ed12d164068615799",
  "assets/css/features/virus-scan.css": "bccd5ad39ea26b8971dc97e5c57fb95b8a77730d912e0ddce68336c75af56e24",
  "assets/apps/virus-scan/index.html": "f945b9728b1b7e3c745c8e5db6c4bf789b195542448888483fc820981aab4eba",
  "assets/js/features/unban-whatsapp.js": "a6425646d29c4ecfdbf694c429e115a5d7812da4dc752a5ef8631abb3d9d964d",
  "assets/apps/unban-whatsapp/index.html": "25e831e89d682629dfc2c8846a1d9295051cf067a921d00af60f2b69d8df97e7",
  "assets/js/features/deploy-center.js": "904ceecdd55c8f6bc45bc881c3ed95800f44a56cead883f2d8afaef9da9bc740",
  "assets/css/features/deploy-center.css": "0732e69ce7daa1b02e579aaa1d5b88d2dcdd24af6351390523f4a3a2c1d90c79",
  "assets/apps/deploy-center/index.html": "ad9b424fbd2a0397c9c8d7f6a4df2904a8b3257cba77c99e9db56ab097af9d26",
  "assets/apps/manifest.json": "4e96f7eb9780139ad173906ec112a777c248f1a6f374720e06a6da53f6e533a5"
});

for (const [relative, expected] of Object.entries(locked)) {
  const absolute = path.join(root, relative);
  assert.ok(fs.existsSync(absolute), `Standalone lock: ${relative} hilang`);
  const actual = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  assert.equal(actual, expected, `Standalone lock: ${relative} berubah tanpa unlock eksplisit`);
}

const legacyShells = [
  "assets/js/features/imported-tools.js",
  "assets/js/features/tiktok-quote.js",
  "assets/js/features/virus-scan.js",
  "assets/js/features/unban-whatsapp.js",
  "assets/js/features/deploy-center.js"
].map((relative) => fs.readFileSync(path.join(root, relative), "utf8")).join("\n");

assert.doesNotMatch(legacyShells, /(?:TTQUOTE_APP_B64|UNBAN_B64|VIRUS_SCAN_APP_B64|VD_B64|payload\s*:\s*["'][A-Za-z0-9+/=]{1000,}["'])/);
assert.doesNotMatch(legacyShells, /srcdoc\s*=|decodeUtf8Base64|decodeVirusApp|decodeBase64|URL\.createObjectURL\(new Blob/);
assert.doesNotMatch(fs.readFileSync(path.join(root,"assets/js/features/imported-tools.js"),"utf8"), /fakeovo|fake-ovo\/index/);
assert.equal(fs.existsSync(path.join(root,"assets/apps/fake-ovo/index.html")), false, "Standalone Fake OVO lama harus dibuang agar tidak dapat mengambil alih renderer baru");

const requiredUrls = [
  "/assets/apps/ml-tools/index.html?v=standalone-v1",
  "/assets/apps/prompt-generator/index.html?v=standalone-v1",
  "/assets/apps/quote-generator/index.html?v=standalone-v1",
  "/assets/apps/cari-fakta/index.html?v=standalone-v1",
  "/assets/apps/tiktok-quote/index.html?v=standalone-v1",
  "/assets/apps/virus-scan/index.html?v=standalone-v1",
  "/assets/apps/unban-whatsapp/index.html?v=standalone-v1",
  "/assets/apps/deploy-center/index.html?v=standalone-v1"
];
for (const url of requiredUrls) assert.ok(legacyShells.includes(url), `Standalone canonical URL hilang: ${url}`);

console.log(`Standalone Apps integrity lock lulus: ${Object.keys(locked).length} file terkunci; 8 embedded app legacy tidak dapat kembali sebagai Base64/srcdoc/blob.`);

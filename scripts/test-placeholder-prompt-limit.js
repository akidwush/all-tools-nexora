"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const scriptPath = path.join(root, "assets/js/features/placeholder-prompt-limit.js");
const cssPath = path.join(root, "assets/css/features/placeholder-prompt-limit.css");
const indexPath = path.join(root, "index.html");
const feature = require(scriptPath);

assert.equal(feature.WORD_LIMIT, 1000, "batas prompt harus tepat 1.000 kata");
assert.equal(feature.countWords(""), 0);
assert.equal(feature.countWords("  satu\n\tdua   tiga  "), 3, "spasi dan baris baru dihitung sebagai pemisah kata");
assert.equal(feature.countWords("halo, dunia! こんにちは"), 3, "kata Unicode dan tanda baca tetap dihitung stabil");

const thousandWords = Array.from({ length: 1000 }, (_, index) => `kata${index + 1}`).join(" ");
const overflowWords = `${thousandWords} kata1001 kata1002`;
assert.equal(feature.countWords(thousandWords), 1000);
assert.equal(feature.countWords(feature.truncateToWordLimit(overflowWords, 1000)), 1000);
assert.equal(feature.truncateToWordLimit(overflowWords, 1000), thousandWords, "paste panjang harus dipotong pada kata ke-1.000");
assert.equal(feature.truncateToWordLimit("satu  dua\ntiga", 1000), "satu  dua\ntiga", "format prompt di bawah batas harus dipertahankan");

const script = fs.readFileSync(scriptPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

assert.match(script, /removeAttribute\("maxlength"\)/, "maxlength karakter lama harus dilepas pada field target");
assert.match(script, /MutationObserver/, "field yang dirender secara lazy harus tetap terdeteksi");
assert.match(script, /Dimension\\s\+Presets/, "guard harus terbatas pada Placeholder Studio");
assert.match(css, /nx-placeholder-word-counter/, "counter 1.000 kata harus memiliki style terisolasi");
assert.match(index, /assets\/css\/features\/placeholder-prompt-limit\.css\?v=6\.4\.0-placeholder-limit1/);
assert.match(index, /assets\/js\/features\/placeholder-prompt-limit\.js\?v=6\.4\.0-placeholder-limit1/);

console.log("Placeholder Studio prompt limit: 1.000 kata, lazy-safe, dan scoped — OK");

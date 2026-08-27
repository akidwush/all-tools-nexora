"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(file, "utf8");
const publicCss = [
  "assets/css/core.css",
  "assets/css/components.css",
  "assets/css/account.css",
  "assets/css/personal-ai.css",
  "assets/css/mobile-usability.css",
  ...fs.readdirSync("assets/css/features")
    .filter(name => name.endsWith(".css"))
    .map(name => path.join("assets/css/features", name))
];

for (const file of publicCss) {
  const css = read(file);
  assert.doesNotMatch(css, /@media[^\{]*(?:min-width|hover\s*:\s*hover|pointer\s*:\s*fine)/i, `${file} masih memiliki cabang visual desktop.`);
  assert.doesNotMatch(css, /@media[^\{]*max-width\s*:\s*(?:4\d\d|[5-9]\d\d|[1-9]\d{3,})px/i, `${file} masih membatasi layout Android normal ke viewport kecil.`);
}

const html = read("index.html");
const core = read("assets/css/core.css");
const mobile = read("assets/css/mobile-usability.css");
const reactor = read("assets/js/core/liquid-reactor.js");

assert.match(mobile, /Android is the only visual source of truth/);
assert.match(mobile, /--nx-original-ui-width:430px/);
assert.match(mobile, /\.container\{[\s\S]*?max-width:var\(--nx-original-ui-width\)!important/);
assert.match(mobile, /#nxUniversalRoom \.nx-room-wrap\{[\s\S]*?max-width:var\(--nx-original-ui-width\)!important/);
assert.match(mobile, /@media all\{[\s\S]*?\.tools-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
assert.match(core, /HF16 — MOBILE PAINT-STABILITY \+ STATIC 3D GLASS[\s\S]*?@media all\{/);
assert.match(core, /HF21 — ANDROID FLING PAINT BUDGET[\s\S]*?@media all\{/);
assert.doesNotMatch(core + reactor, /custom-cursor|nx-liquid|nx-reactor-ghost|touch-follower|cursor-trail/);
assert.doesNotMatch(reactor, /matchMedia|pointermove|pointerdown|pointerup|captureFlip|animateFlip|setupCursorReactor/);
assert.match(reactor, /unifiedOriginalUi:true/);
assert.match(reactor, /enabled:false,reason:"unified-original-ui"/);
for (const asset of ["core.css", "components.css", "account.css", "personal-ai.css", "mobile-usability.css", "liquid-reactor.js"]) {
  assert.match(html, new RegExp(`${asset.replace(".", "\\.")}\\?v=[^\"']*hf22-original-unified1`), `${asset} belum cache-busted untuk HF22.`);
}

console.log("HF22 original unified UI lulus: PC dan Android memakai satu layout tanpa cabang visual desktop.");

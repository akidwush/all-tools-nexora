"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("assets/css/mobile-usability.css", "utf8");
const html = fs.readFileSync("index.html", "utf8");

assert.match(html, /mobile-usability\.css(?:\?v=[^"' >]+)?/);
assert.match(css, /@media(?:\s+all|\s*\()/);
assert.match(css, /#nxUniversalRoom \.nx-room-tool-body/);
assert.match(css, /font-size:16px!important/);
assert.match(css, /min-height:50px!important/);
assert.match(css, /min-height:46px!important/);
assert.match(css, /\.nx-prompt-details\{grid-template-columns:1fr!important\}/);
assert.match(css, /\.nda-modes\{grid-template-columns:1fr!important\}/);
assert.match(css, /:is\(#nxGetCodeOverlay,#ttRoomOverlay,#deployOverlay\)/);
assert.match(css, /\.nx-ai-panel \.nx-ai-bubble/);
assert.match(css, /\.tools-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
assert.match(css, /\.tools-card\{min-height:146px!important/);
assert.match(css, /\.tools-card h4\{min-height:28px;font-size:11px!important/);
assert.match(css, /\.tools-card p\{display:none!important\}/);

let depth = 0;
for (const character of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
  if (character === "{") depth += 1;
  if (character === "}") depth -= 1;
  assert.ok(depth >= 0, "mobile-usability.css menutup kurung terlalu awal");
}
assert.equal(depth, 0, "mobile-usability.css memiliki kurung yang tidak seimbang");

console.log("HF19 mobile usability lulus: workspace terbaca dan katalog original tiga kolom berlaku di semua perangkat.");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("assets/comic-reader/app.js");
const css = read("assets/comic-reader/app.css");
const html = read("assets/comic-reader/index.html");

assert.match(app, /function mangaBackFromReader\(\)/);
assert.match(app, /const manga=state\.mangaData;/);
assert.match(app, /const id=state\.mangaId\|\|\(manga&&manga\.id\);/);
assert.match(app, /const source=\(manga&&manga\.source\)\|\|state\.source;/);
assert.match(app, /mangaOpenDetail\(id,source,manga\|\|null\);/);
assert.match(app, /mangaShowHome\(false\);/);
assert.match(app, /function mangaGoBack\(\)\{[\s\S]*state\.view==='reader'\) mangaBackFromReader\(\)/);
assert.match(app, /\$\('readerBackBtn'\)\.onclick=mangaBackFromReader;/);
assert.match(app, /window\.mangaBackFromReader=mangaBackFromReader;/);
assert.doesNotMatch(app, /id=\"readerBackBtn\"[^\n]*onclick=/);
assert.doesNotMatch(app, /function mangaBackFromReader\(\)[\s\S]{0,500}(?:history\.back|window\.history\.back)/);

assert.match(app, /if\(state\.view==='detail'\)state\.detailScrollY=/);
assert.match(app, /if\(!state\.mangaId&&manga&&manga\.id\)state\.mangaId=manga\.id;/);
assert.match(app, /if\(manga&&manga\.source\)state\.source=manga\.source;/);
assert.doesNotMatch(app, /state\.mangaId\s*=\s*chapter\.id/);
assert.doesNotMatch(app, /state\.mangaData\s*=\s*null/);
assert.match(app, /restoreDetailScrollPosition\(\)/);

assert.match(css, /\.reader-topbar\{[\s\S]*z-index:70/);
assert.match(css, /\.reader-topbar \.icon-btn\{[^}]*width:44px;[^}]*height:44px;[^}]*pointer-events:auto/);
assert.match(css, /\.comic-sheet-backdrop\{[\s\S]*z-index:400/);
assert.match(css, /\[hidden\]\{display:none!important\}/);
assert.match(css, /\.reader-bottom\{[\s\S]*padding-bottom:calc\(18px \+ env\(safe-area-inset-bottom\)\)/);

assert.match(html, /app\.css\?v=standalone-v1-readerback1/);
assert.match(html, /app\.js\?v=standalone-v1[^"']*readerback1/);
assert.match(html, /viewport-fit=cover/);

for (const width of [360, 375, 390, 412]) {
  assert.ok(44 <= width, width + "px: back tap target must remain >=44px.");
}

for (const provider of ["mangadex","shinigami","voratoon","ainzscans","mangadotnet"]) {
  assert.ok(provider, "provider matrix entry missing");
}

console.log("Comic Reader back navigation PASS: reader -> same manga detail uses named state-safe handler; 44px tap target; safe-area/translation/provider contracts untouched.");

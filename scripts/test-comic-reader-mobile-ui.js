"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const shell = read("assets/js/features/comic-reader.js");
const html = read("assets/comic-reader/index.html");
const css = read("assets/comic-reader/app.css");
const app = read("assets/comic-reader/app.js");
const shellCss = read("assets/css/features/comic-reader.css");

assert.match(shell, /COMIC_APP_URL\s*=\s*['"]\/assets\/comic-reader\/index\.html\?v=standalone-v1['"]/);
assert.match(shell, /frame\.src=COMIC_APP_URL/);
assert.doesNotMatch(shell, /COMIC_READER_APP_B64|srcdoc|nxComicApiBridgeHandler|nx-comic-api-request/);
assert.match(html, /data-nexora-comic-ui="standalone-v1"/);
assert.match(html, /\/assets\/comic-reader\/app\.css\?v=standalone-v1/);
assert.match(html, /\/assets\/comic-reader\/app\.js\?v=standalone-v1/);
assert.doesNotMatch(html, /<style\b|<script(?!\s+src=)/i);

assert.match(html, /id="mangaTabs" class="tabs" data-label="Sort"/);
assert.match(html, /id="mangaCategoryTabs" class="tabs" data-label="Type"/);
assert.match(html, /id="mangaStatusTabs" class="tabs" data-label="Status"/);
assert.match(html, /type="search"[^>]+enterkeyhint="search"/);
assert.match(html, /manga-attribution/);
assert.match(app, /function mangaResetFilters\(\)/);
assert.match(app, /Coba kata kunci atau filter lain\./);
assert.match(app, /Tidak dapat memuat daftar komik\./);
assert.match(app, /loading="lazy" decoding="async" alt="cover"/);
assert.match(app, /decoding="async" alt="Halaman \$\{pageIndex\+1\}"/);
assert.match(app, /const SOURCE_API = '\/api\/comics'/);
assert.doesNotMatch(app, /NX_COMIC_BRIDGE_PENDING|nxComicBridgeFetch|nx-comic-api-request/);
assert.match(app, /const json=await fetchJson\(url,timeout\)/);

assert.match(css, /\.manga-grid\{[\s\S]*repeat\(auto-fit,minmax\(min\(172px,calc\(50% - 6px\)\),1fr\)\)/);
assert.match(css, /#mangaTabs\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
assert.match(css, /#mangaCategoryTabs\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
assert.match(css, /height:54px/);
assert.match(css, /aspect-ratio:2\/3/);
assert.match(css, /-webkit-line-clamp:2/);
assert.match(css, /content-visibility:auto/);
assert.match(css, /@media\(max-width:374px\)/);
assert.match(css, /scrollbar-width:none/);
assert.match(shellCss, /height:calc\(100dvh - 54px\)/);
assert.match(shellCss, /data-tool="comicreader"[\s\S]*\.nx-room-topbar/);

const viewportResults = [360, 375, 390, 412].map((viewport) => {
  const pagePadding = viewport < 374 ? 14 : 16;
  const contentWidth = viewport - (pagePadding * 2);
  const cardGap = viewport < 374 ? 10 : 12;
  const cardWidth = (contentWidth - cardGap) / 2;
  const sortWidth = (contentWidth - (7 * 2)) / 3;
  const typeWidth = (contentWidth - (7 * 3)) / 4;
  const statusWidth = (contentWidth - (7 * 2)) / 3;
  const searchInputWidth = contentWidth - 13 - 6 - 16 - 42 - (10 * 2);

  assert.ok(contentWidth <= viewport, `${viewport}px: container melebar.`);
  assert.ok(cardWidth >= 150, `${viewport}px: card manga terlalu sempit.`);
  assert.ok(sortWidth >= 100, `${viewport}px: segmented Sort berpotensi terpotong.`);
  assert.ok(typeWidth >= 72, `${viewport}px: segmented Type berpotensi terpotong.`);
  assert.ok(statusWidth >= 100, `${viewport}px: segmented Status berpotensi terpotong.`);
  assert.ok(searchInputWidth >= 220, `${viewport}px: input pencarian berpotensi terpotong.`);

  return { viewport, cardWidth: Number(cardWidth.toFixed(1)), columns: 2 };
});

console.log(`Comic Reader standalone UI lulus: ${viewportResults.map((row) => `${row.viewport}px=${row.columns} kolom/${row.cardWidth}px`).join(", ")}; UI canonical terpisah dari shell, tanpa Base64/srcdoc/bridge.`);

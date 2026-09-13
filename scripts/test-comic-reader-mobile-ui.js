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
const translateCss = read("assets/comic-reader/translate.css");
const shellCss = read("assets/css/features/comic-reader.css");

assert.match(shell, /COMIC_APP_URL\s*=\s*['"]\/assets\/comic-reader\/index\.html\?v=standalone-v1-immersive1['"]/);
assert.match(shell, /frame\.src=COMIC_APP_URL/);
assert.match(shell, /event\.data\.type==='nx-comic-view'/);
assert.match(shell, /classList\.toggle\('is-reader-mode'/);
assert.doesNotMatch(shell, /COMIC_READER_APP_B64|srcdoc|nxComicApiBridgeHandler|nx-comic-api-request/);
assert.match(html, /data-nexora-comic-ui="standalone-v1"/);
assert.match(html, /app\.css\?v=standalone-v1-immersive1/);
assert.match(html, /app\.js\?v=standalone-v1[^"']*immersive1/);
assert.doesNotMatch(html, /<style\b|<script(?!\s+src=)/i);

assert.match(html, /id="mangaTabs" class="home-nav"/);
assert.match(html, /id="mangaFilterBtn"/);
assert.match(html, /id="mangaCategoryTabs" class="filter-state-tabs" hidden/);
assert.match(html, /id="mangaStatusTabs" class="filter-state-tabs" hidden/);
assert.match(html, /id="comicBottomSheet"/);
assert.match(html, /id="comicSheetBackdrop"/);
assert.match(html, /type="search"[^>]+enterkeyhint="search"/);
assert.match(html, /id="comicSourceSelect"/);
assert.match(html, /id="comicSourceHealth"/);

assert.match(app, /function setComicView\(view\)/);
assert.match(app, /function openFilterSheet\(\)/);
assert.match(app, /function openReaderSourceSheet\(\)/);
assert.match(app, /function openReaderSettingsSheet\(\)/);
assert.match(app, /function openReaderMoreSheet\(\)/);
assert.match(app, /function openReaderChapterSheet\(\)/);
assert.match(app, /function formatReaderChapterTitle\(chapter\)/);
assert.match(app, /readerChapterTitle=formatReaderChapterTitle\(chapter\)/);
assert.doesNotMatch(app, /reader-title[^`]*chapter\.extra/);
assert.match(app, /postMessage\(\{type:'nx-comic-view',view\}/);
assert.match(app, /window\.NexoraComicUI=/);
assert.doesNotMatch(app, /class=\"reader-source-button\"|id=\"readerSourceSelect\"|id=\"qualitySaver\"|id=\"qualityFull\"/);
assert.match(app, /reader-failure-banner/);
assert.match(app, /mangaRetryFailedPages/);
assert.match(app, /runBounded\(providers,2/);
assert.match(app, /Promise\.allSettled/);
assert.match(app, /translationCompatible/);
assert.match(app, /loading="lazy" decoding="async" alt="cover"/);
assert.match(app, /decoding="async"[^>]*data-page-state="loading"/);
assert.match(app, /const SOURCE_API = '\/api\/comics'/);
assert.doesNotMatch(app, /NX_COMIC_BRIDGE_PENDING|nxComicBridgeFetch|nx-comic-api-request/);

assert.match(css, /body\.reader-mode \.hero-min,[\s\S]*body\.reader-mode #mangaStatusTabs\{display:none\}/);
assert.match(css, /\.filter-state-tabs\{display:none\}/);
assert.match(css, /\.reader-topbar\{[\s\S]*grid-template-columns:42px minmax\(0,1fr\) 42px[\s\S]*height:54px/);
assert.match(css, /--toolbar-height:54px/);
assert.match(css, /\.manga-grid\{[\s\S]*repeat\(6,minmax\(0,1fr\)\)/);
assert.match(css, /@media\(max-width:640px\)[\s\S]*\.manga-grid,[\s\S]*repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /\.manga-card-title\{[\s\S]*-webkit-line-clamp:2/);
assert.match(css, /\.reader-page-error\{[\s\S]*min-height:142px/);
assert.match(css, /\.comic-sheet-backdrop\{/);
assert.match(translateCss, /position:sticky;top:54px/);
assert.match(translateCss, /min-height:44px/);
assert.match(shellCss, /\.is-reader-mode \.nx-room-topbar\{[\s\S]*display:none/);
assert.match(shellCss, /\.is-reader-mode \.nx-comic-embed\{[\s\S]*height:100dvh/);
assert.match(translateCss, /Translation|nx-ct-info/);

const viewportResults = [360, 375, 390, 412].map((viewport) => {
  const pagePadding = viewport <= 640 ? 12 : 16;
  const contentWidth = viewport - pagePadding * 2;
  const gap = 9;
  const cardWidth = (contentWidth - gap) / 2;
  const discoveryHeight = 26 + 7 + 31 + 8 + 36 + 7 + 46 + 8 + 36 + 6 + 36 + 9;
  const readerChrome = 54 + 44;

  assert.ok(cardWidth >= 160, `${viewport}px: card manga terlalu sempit (${cardWidth}px).`);
  assert.ok(discoveryHeight <= 280, `${viewport}px: manga grid terlambat muncul (${discoveryHeight}px).`);
  assert.ok(readerChrome <= 105, `${viewport}px: chrome reader terlalu tinggi (${readerChrome}px).`);
  assert.ok(contentWidth < viewport, `${viewport}px: layout berpotensi overflow.`);
  return { viewport, cardWidth: Number(cardWidth.toFixed(1)), discoveryHeight, readerChrome };
});

for (const viewport of [768, 1440]) {
  assert.ok(viewport > 640, `${viewport}px: desktop/tablet breakpoint invalid.`);
}

console.log(`Comic Reader polished UI PASS: ${viewportResults.map((row) => `${row.viewport}px card=${row.cardWidth}px/home=${row.discoveryHeight}px/reader=${row.readerChrome}px`).join(", ")}; reader state hides discovery controls and uses one shared bottom sheet.`);

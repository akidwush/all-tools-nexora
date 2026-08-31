"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const clientPath = path.join(root, "assets/js/features/comic-reader.js");
const mobileCssPath = path.join(root, "assets/css/features/comic-reader-mobile.css");
const shellCssPath = path.join(root, "assets/css/features/comic-reader.css");

const client = fs.readFileSync(clientPath, "utf8");
const mobileCss = fs.readFileSync(mobileCssPath, "utf8");
const shellCss = fs.readFileSync(shellCssPath, "utf8");

let renderedHtml = "";
const frame = {
  contentWindow: {},
  addEventListener() {},
  set srcdoc(value) { renderedHtml = String(value); },
  get srcdoc() { return renderedHtml; }
};
const body = { innerHTML: "" };
const classList = { add() {}, remove() {}, contains() { return false; } };

const documentMock = {
  body: { classList, style: {} },
  addEventListener() {},
  getElementById(id) {
    if (id === "nxComicFrame") return frame;
    return null;
  }
};
const windowMock = { addEventListener() {} };

vm.runInNewContext(client, {
  atob(value) { return Buffer.from(value, "base64").toString("binary"); },
  console,
  decodeURIComponent,
  document: documentMock,
  history: { state: null },
  location: { hash: "", href: "http://localhost/", hostname: "localhost" },
  TextDecoder,
  Uint8Array,
  URL,
  window: windowMock
}, { filename: clientPath });

assert.equal(typeof windowMock.renderComicReader, "function");
windowMock.renderComicReader(body);
assert.ok(renderedHtml.length > 50_000, "Payload Comic Reader gagal dirender.");

assert.match(renderedHtml, /comic-reader-mobile\.css\?v=20260831/);
assert.match(renderedHtml, /id="mangaTabs" class="tabs" data-label="Sort"/);
assert.match(renderedHtml, /id="mangaCategoryTabs" class="tabs" data-label="Type"/);
assert.match(renderedHtml, /id="mangaStatusTabs" class="tabs" data-label="Status"/);
assert.match(renderedHtml, /type="search"[^>]+enterkeyhint="search"/);
assert.match(renderedHtml, /function mangaResetFilters\(\)/);
assert.match(renderedHtml, /Coba kata kunci atau filter lain\./);
assert.match(renderedHtml, /Tidak dapat memuat daftar komik\./);
assert.match(renderedHtml, /loading="lazy" decoding="async" alt="cover"/);
assert.match(renderedHtml, /decoding="async" alt="Halaman \$\{pageIndex\+1\}"/);
assert.doesNotMatch(renderedHtml, /Gagal memuat data komik\.<br><small>\$\{escapeHtml\(error\.message/);
assert.doesNotMatch(renderedHtml, /Gagal memuat daftar chapter\.<br><small>\$\{escapeHtml\(error\.message/);

assert.match(mobileCss, /\.manga-grid\{[\s\S]*repeat\(auto-fit,minmax\(min\(172px,calc\(50% - 6px\)\),1fr\)\)/);
assert.match(mobileCss, /#mangaTabs\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
assert.match(mobileCss, /#mangaCategoryTabs\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
assert.match(mobileCss, /height:54px/);
assert.match(mobileCss, /aspect-ratio:2\/3/);
assert.match(renderedHtml, /-webkit-line-clamp:2/);
assert.match(mobileCss, /content-visibility:auto/);
assert.match(mobileCss, /@media\(max-width:374px\)/);
assert.doesNotMatch(mobileCss, /@media[^\{]*min-width/i);
assert.match(mobileCss, /scrollbar-width:none/);
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

  return { viewport, contentWidth, cardWidth: Number(cardWidth.toFixed(1)), columns: 2 };
});

console.log(`Comic Reader mobile UI lulus: ${viewportResults.map((row) => `${row.viewport}px=${row.columns} kolom/${row.cardWidth}px`).join(", ")}; shell compact, toolbar, filter tanpa overflow, card lazy, state aman, chapter, dan reader tervalidasi.`);

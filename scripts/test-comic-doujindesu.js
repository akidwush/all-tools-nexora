"use strict";

const assert = require("node:assert/strict");
const adapter = require("../lib/comic-sources/doujindesu");
const registryModule = require("../lib/comic-sources/registry");
const { endpointRegistry } = require("../lib/endpoint-maintenance-registry");

const fixtureSearch = `
<!doctype html><html><head><title>Search</title></head><body>
<div class="entries"><article class="entry">
<a href="https://doujin.desu.xxx/manga/sample-series/" title="Sample Series">
<img data-src="https://doujin.desu.xxx/storage/upload/sample.webp" alt="">
<span>Sample Series</span>
</a>
</article></div>
</body></html>`;

const fixtureDetail = `
<!doctype html><html><head>
<meta property="og:title" content="Sample Series">
<meta property="og:description" content="Sample description">
<meta property="og:image" content="https://doujin.desu.xxx/storage/upload/sample.webp">
</head><body>
<section class="metadata"><h1 class="title">Sample Series</h1>
<a href="https://doujin.desu.xxx/author/sample-author/">Sample Author</a>
<a href="https://doujin.desu.xxx/genre/action/">Action</a>
</section>
<div id="chapter_list">
<div class="epsleft"><span class="lchx"><a href="https://doujin.desu.xxx/2026/09/01/sample-series-chapter-12/">Sample Series Chapter 12</a></span></div>
<div class="epsleft"><span class="lchx"><a href="https://doujin.desu.xxx/2026/08/01/sample-series-chapter-11/">Sample Series Chapter 11</a></span></div>
</div>
</body></html>`;

const fixtureReader = `
<!doctype html><html><body><div class="main">
<img data-src="https://doujin.desu.xxx/storage/upload/page-1.webp">
<img data-src="https://doujin.desu.xxx/storage/upload/page-2.webp">
</div></body></html>`;

const rows = adapter._test.parseMangaAnchors(fixtureSearch, "https://doujin.desu.xxx/", "Sample");
assert.equal(rows.length, 1);
assert.equal(rows[0].source, "doujindesu");
assert.equal(rows[0].id, "sample-series");
assert.equal(rows[0].coverUrl, "https://doujin.desu.xxx/storage/upload/sample.webp");

const detail = adapter._test.parseDetailHtml(fixtureDetail, "sample-series");
assert.equal(detail.title, "Sample Series");
assert.deepEqual(detail.authors, ["Sample Author"]);
assert.ok(detail.genres.includes("Action"));

const chapters = adapter._test.parseChaptersHtml(fixtureDetail, "sample-series");
assert.equal(chapters.length, 2);
assert.equal(chapters[0].source, "doujindesu");
assert.equal(chapters[0].number, "12");
assert.match(chapters[0].id, /^path:/);

const pages = adapter._test.parseStaticPageUrls(fixtureReader, chapters[0].id);
assert.equal(pages.length, 2);
assert.equal(pages[0].url, "https://doujin.desu.xxx/storage/upload/page-1.webp");
assert.equal(pages[0].refererRequired, true);

assert.equal(adapter.definition.adult, true);
assert.equal(adapter.definition.experimental, true);
assert.equal(adapter.definition.defaultEnabled, false);
assert.equal(adapter.definition.optInRequired, true);
assert.equal(adapter.definition.participatesInSearch, false);
assert.equal(adapter.definition.participatesInFallback, false);
assert.equal(adapter.definition.participatesInExperimentalSearch, true);
assert.equal(adapter.definition.capabilities.search, true);
assert.equal(adapter.definition.capabilities.detail, true);
assert.equal(adapter.definition.capabilities.chapters, true);
assert.equal(adapter.definition.capabilities.pages, false);
assert.equal(adapter.definition.capabilities.translationCompatible, false);
assert.deepEqual(adapter.definition.imageHostSuffixes, ["doujin.desu.xxx"]);

const endpoint = endpointRegistry().get("experimental-comic:doujindesu");
assert.ok(endpoint);
assert.equal(endpoint.defaultMode, "active");
assert.deepEqual(endpoint.allowedHosts, ["doujin.desu.xxx"]);
assert.equal(endpoint.activationSupported, true);
assert.ok(endpoint.editableFields.includes("baseUrl"));
assert.ok(endpoint.editableFields.includes("timeoutMs"));

const fakeLegacy = {
  list: async () => ({ items: [] }),
  detail: async () => ({ data: {} }),
  chapters: async () => ({ data: [], languages: [] }),
  manifest: async () => ({ images: [], quality: "saver" })
};
const standard = registryModule.createComicSourceRegistry(fakeLegacy);
assert.equal(standard.has("doujindesu"), false);
const internal = registryModule.createComicSourceRegistry(fakeLegacy, { includeExperimental: true });
assert.equal(internal.has("doujindesu"), true);
assert.equal(registryModule.publicSourceRegistry(internal, { scope: "standard" }).some((row) => row.id === "doujindesu"), false);
assert.equal(registryModule.publicSourceRegistry(internal, { scope: "experimental" }).some((row) => row.id === "doujindesu"), true);

assert.equal(
  adapter._test.parseMangaAnchors('<a href="http://127.0.0.1/manga/x">X</a>', "https://doujin.desu.xxx/", "").length,
  0,
  "Non-HTTPS/private-host manga URL harus diabaikan, bukan dilempar sebagai exception."
);
assert.equal(adapter._test.parseMangaAnchors('<a href="https://evil.example/manga/x">X</a>', "https://doujin.desu.xxx/", "").length, 0);

console.log("DoujinDesu adapter PASS: public HTML parser, normalized search/detail/chapters, same-origin cover/page policy, experimental isolation, pages remain capability=false.");

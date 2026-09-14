"use strict";

const assert = require("node:assert/strict");
const adapter = require("../lib/comic-sources/doujindesu");
const registryModule = require("../lib/comic-sources/registry");
const { endpointRegistry } = require("../lib/endpoint-maintenance-registry");

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
assert.deepEqual(endpoint.allowedHosts, [
  "doujin.desu.xxx",
  "sylvatica.my.id"
]);
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



async function runTests() {
  const fakeFetch = async (url, options) => {
    let responseBody = "{}";
    const bodyStr = options.body ? options.body : "";
    if (bodyStr.includes("/manga/chapters") || bodyStr.includes("/chapters")) {
        responseBody = JSON.stringify({
            data: [
                { id: "chap-1", title: "Chapter 1", chapter_number: "1", language: "id", slug: "ch-1" }
            ]
        });
    } else if (bodyStr.includes("title=test")) {
        responseBody = JSON.stringify({
            data: [
                { manga_slug: "test-manga", title: "Test Manga Title", cover_url: "https://doujin.desu.xxx/cover.webp", authors: ["Author A"], genres: ["Action"] }
            ],
            pagination: { hasMore: false }
        });
    } else if (bodyStr.includes("/manga/test-manga")) {
        responseBody = JSON.stringify({
            data: { manga_slug: "test-manga", title: "Test Manga Title", cover_url: "https://doujin.desu.xxx/cover.webp", authors: ["Author A"], genres: ["Action"] }
        });
    } else {
        responseBody = JSON.stringify({
            data: [
                { manga_slug: "test-manga", title: "Test Manga Title", cover_url: "https://doujin.desu.xxx/cover.webp", authors: ["Author A"], genres: ["Action"] }
            ],
            pagination: { hasMore: false }
        });
    }

    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => responseBody
    };
  };

  const searchRes = await adapter.search({ query: "test", fetchImpl: fakeFetch, timeoutMs: 10000 });
  assert.equal(searchRes.items.length, 1, "search response map failure");
  assert.equal(searchRes.items[0].id, "test-manga");
  assert.equal(searchRes.items[0].title, "Test Manga Title");
  assert.equal(searchRes.items[0].coverUrl, "https://doujin.desu.xxx/cover.webp");

  const mangaRes = await adapter.getManga({ id: "test-manga", fetchImpl: fakeFetch, timeoutMs: 10000 });
  assert.equal(mangaRes.id, "test-manga");
  assert.equal(mangaRes.title, "Test Manga Title");
  assert.deepEqual(mangaRes.authors, ["Author A"]);
  assert.ok(mangaRes.genres.includes("Action"));

  const chapRes = await adapter.getChapters({ mangaId: "test-manga", fetchImpl: fakeFetch, timeoutMs: 10000 });
  assert.equal(chapRes.chapters.length, 1);
  assert.equal(chapRes.chapters[0].id, "chap-1");
  assert.equal(chapRes.chapters[0].number, "1");

  console.log("DoujinDesu adapter PASS: API JSON mapping verified, experimental isolation and capabilities verified.");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

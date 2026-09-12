"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { handleComicReader, isPublicIpv4, resetComicReaderState } = require("../lib/comic-reader");
const { clearSourceCache, requestJson } = require("../lib/comic-sources/shared");
const { createComicSourceRegistry, isAllowedImageHost } = require("../lib/comic-sources/registry");
const shinigami = require("../lib/comic-sources/shinigami");
const voratoon = require("../lib/comic-sources/voratoon");
const ainzscans = require("../lib/comic-sources/ainzscans");
const mangadotnet = require("../lib/comic-sources/mangadotnet");

const root = path.resolve(__dirname, "..");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures/comic-sources", `${name}.json`), "utf8"));
const fixtures = {
  shinigami: fixture("shinigami"),
  voratoon: fixture("voratoon"),
  ainzscans: fixture("ainzscans"),
  mangadotnet: fixture("mangadotnet")
};

function response(payload, status = 200, headers = {}) {
  const map = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return map.get(String(name).toLowerCase()) || ""; } },
    async text() { return JSON.stringify(payload); },
    async json() { return payload; }
  };
}

const requested = [];
async function fixtureFetch(input, options = {}) {
  const url = new URL(input);
  requested.push({ url, options });
  if (url.hostname === "api.shngm.io") {
    if (url.pathname === "/v1/manga/list") return response(fixtures.shinigami.list);
    if (url.pathname === "/v1/manga/detail/komik-uji") return response(fixtures.shinigami.detail);
    if (url.pathname === "/v1/chapter/sh-1/list") return response(fixtures.shinigami.chapters);
    if (url.pathname === "/v1/chapter/detail/sh-ch-1") return response(fixtures.shinigami.pages);
  }
  if (url.hostname === "api.voratoon.com") {
    if (url.pathname === "/series/" || url.pathname === "/series") return response(fixtures.voratoon.list);
    if (url.pathname === "/series/komik-uji") return response(fixtures.voratoon.detail);
    if (url.pathname === "/series/komik-uji/chapters") return response(fixtures.voratoon.chapters);
    if (url.pathname === "/series/komik-uji/chapters/1") return response(fixtures.voratoon.pages);
  }
  if (url.hostname === "api.ainzscans01.com") {
    if (url.pathname === "/api/search") return response(fixtures.ainzscans.list);
    if (url.pathname === "/api/series/comic/komik-uji") return response(fixtures.ainzscans.detail);
    if (url.pathname === "/api/series/comic/komik-uji/chapter/chapter-1") return response(fixtures.ainzscans.pages);
  }
  if (url.hostname === "mangadot.net") {
    if (url.pathname === "/api/search") return response(fixtures.mangadotnet.list);
    if (url.pathname === "/api/manga/41/chapters/list") return response(fixtures.mangadotnet.chapters);
    if (url.pathname === "/api/manga/41/volumes") return response(fixtures.mangadotnet.volumes);
    if (url.pathname === "/api/chapters/501/images") return response(fixtures.mangadotnet.chapterPages);
    if (url.pathname === "/api/uploads/601/images") return response(fixtures.mangadotnet.uploadPages);
  }
  return response({ message: `Unhandled fixture ${url}` }, 404);
}

const mangaKeys = ["source", "id", "slug", "title", "altTitles", "coverUrl", "description", "authors", "artists", "genres", "status", "language", "url", "metadata"].sort();
const chapterKeys = ["source", "id", "mangaId", "title", "number", "volume", "language", "publishedAt", "group", "metadata"].sort();
const pageKeys = ["source", "chapterId", "index", "url", "width", "height", "refererRequired", "metadata"].sort();
function exactKeys(row, keys, label) { assert.deepEqual(Object.keys(row).sort(), keys, `${label}: raw provider field bocor ke normalized model`); }

async function testAdapter(adapter, args) {
  clearSourceCache();
  const search = await adapter.search({ query: "komik", page: 1, limit: 2, fetchImpl: fixtureFetch, timeoutMs: 1000 });
  assert.ok(search.items.length >= 1, `${adapter.definition.label}: SEARCH kosong`);
  exactKeys(search.items[0], mangaKeys, `${adapter.definition.id} Manga`);
  assert.ok(/^https:\/\//.test(search.items[0].coverUrl || ""), `${adapter.definition.label}: cover URL tidak ternormalisasi`);
  const detail = await adapter.getManga({ id: args.mangaId, slug: args.slug, titleHint: "Komik Uji", fetchImpl: fixtureFetch, timeoutMs: 1000 });
  exactKeys(detail, mangaKeys, `${adapter.definition.id} Detail`);
  const chapters = await adapter.getChapters({ mangaId: args.mangaId, fetchImpl: fixtureFetch, timeoutMs: 1000, limit: 100, language: "id" });
  assert.ok(chapters.length >= 1, `${adapter.definition.label}: CHAPTERS kosong`);
  exactKeys(chapters[0], chapterKeys, `${adapter.definition.id} Chapter`);
  const pages = await adapter.getPages({ mangaId: args.mangaId, chapterId: args.chapterId || chapters[0].id, fetchImpl: fixtureFetch, timeoutMs: 1000 });
  assert.ok(pages.length >= 1, `${adapter.definition.label}: PAGES kosong`);
  exactKeys(pages[0], pageKeys, `${adapter.definition.id} Page`);
  assert.ok(pages.every((page) => page.url.startsWith("https://")), `${adapter.definition.label}: page non-HTTPS`);
  return { search, detail, chapters, pages };
}

function captureResponse() {
  const captured = { headers: {} };
  return {
    captured,
    response: {
      setHeader(name, value) { captured.headers[String(name).toLowerCase()] = value; },
      status(value) { captured.status = value; return this; },
      json(value) { captured.payload = value; return value; },
      end(value) { if (value) captured.body = value; captured.ended = true; },
      send(value) { captured.body = value; return value; }
    }
  };
}
async function callApi(query) {
  const { captured, response: res } = captureResponse();
  await handleComicReader({ method: "GET", url: `/api/comics${query}`, headers: { host: "localhost", "x-forwarded-for": "8.8.8.8" }, socket: {} }, res, { fetchImpl: fixtureFetch, timeoutMs: 1000 });
  return captured;
}

(async () => {
  process.env.NODE_ENV = "test";
  const sh = await testAdapter(shinigami, { mangaId: "sh-1", slug: "komik-uji", chapterId: "sh-ch-1" });
  const vo = await testAdapter(voratoon, { mangaId: "komik-uji", chapterId: "1" });
  const ai = await testAdapter(ainzscans, { mangaId: "komik-uji", chapterId: "chapter-1" });
  const mdn = await testAdapter(mangadotnet, { mangaId: "41", chapterId: "chapter:501" });
  assert.equal(vo.pages[0].refererRequired, true, "Voratoon harus mempertahankan referer requirement");
  assert.equal(sh.pages[0].refererRequired, true);
  assert.equal(ai.detail.title, "Komik Uji");
  assert.equal(mdn.chapters[0].language, "id");

  clearSourceCache();
  const shinigamiChapterRequests = [];
  const pagedShinigamiFetch = async (input, options = {}) => {
    const url = new URL(input);
    shinigamiChapterRequests.push({ url, options });
    const page = Number(url.searchParams.get("page") || 1);
    const count = page < 3 ? 100 : 5;
    const start = (page - 1) * 100;
    const rows = Array.from({ length: count }, (_, index) => ({
      chapter_id: `sh-page-${start + index + 1}`,
      chapter_number: String(205 - (start + index)),
      chapter_title: null
    }));
    return response({ data: rows, meta: { page, total_page: 3 } });
  };
  const completeShinigamiChapters = await shinigami.getChapters({ mangaId: "sh-1", fetchImpl: pagedShinigamiFetch, timeoutMs: 1000 });
  assert.equal(completeShinigamiChapters.length, 205, "Shinigami chapter pagination tidak boleh berhenti di 100");
  assert.deepEqual(shinigamiChapterRequests.map((row) => row.url.searchParams.get("page")), ["1", "2", "3"]);
  assert.ok(shinigamiChapterRequests.every((row) => Number(row.url.searchParams.get("page_size")) === 100), "Chapter pagination harus bounded 100 per request");
  const shPages = await shinigami.getPages({ chapterId: "sh-ch-1", fetchImpl: fixtureFetch, timeoutMs: 1000 });
  assert.equal(shPages[0].refererRequired, true);
  assert.equal(shPages[0].metadata.referer, "https://app.shinigami.asia/");

  const shList = requested.find((row) => row.url.hostname === "api.shngm.io" && row.url.pathname.endsWith("/manga/list"));
  const voList = requested.find((row) => row.url.hostname === "api.voratoon.com" && /\/series\/?$/.test(row.url.pathname));
  const aiList = requested.find((row) => row.url.hostname === "api.ainzscans01.com" && row.url.pathname.endsWith("/search"));
  const mdnList = requested.find((row) => row.url.hostname === "mangadot.net" && row.url.pathname.endsWith("/api/search"));
  assert.ok(Number(shList.url.searchParams.get("page_size")) <= 50);
  assert.equal(shList.url.searchParams.get("q"), "komik", "Shinigami search harus dikirim ke API, bukan scan tiga halaman lokal");
  assert.ok(Number(voList.url.searchParams.get("take")) <= 50);
  assert.ok(Number(aiList.url.searchParams.get("limit")) <= 50);
  assert.ok(Number(mdnList.url.searchParams.get("limit")) <= 50);
  assert.match(voList.url.searchParams.get("filter") || "", /title=ilike=/, "Voratoon search harus memakai filter API");
  assert.equal(voList.options.headers.Origin, "https://v2.voratoon.com");
  assert.match(voList.options.headers.Referer, /^https:\/\/v2\.voratoon\.com\//);
  for (const row of requested) {
    assert.equal(row.options.headers.Authorization, undefined, "Authorization tidak boleh diteruskan ke provider");
    assert.equal(row.options.headers.Cookie, undefined, "Cookie tidak boleh diteruskan ke provider");
  }

  const fakeLegacy = { list: async () => ({ items: [] }), detail: async () => ({ data: {} }), chapters: async () => ({ data: [], languages: [] }), manifest: async () => ({ images: [], quality: "saver" }) };
  const registry = createComicSourceRegistry(fakeLegacy);
  assert.deepEqual([...registry.keys()], ["mangadex", "shinigami", "voratoon", "ainzscans", "mangadotnet"]);
  for (const id of registry.keys()) {
    const definition = registry.get(id).definition;
    assert.equal(definition.capabilities.search, true);
    assert.equal(typeof definition.capabilities.translationCompatible, "boolean");
  }
  assert.equal(registry.get("mangadex").definition.capabilities.translationCompatible, true);
  for (const id of ["shinigami", "voratoon", "ainzscans", "mangadotnet"]) assert.equal(registry.get(id).definition.capabilities.translationCompatible, false);

  assert.equal(isAllowedImageHost(voratoon.definition, "cdn.voratoon.com"), true);
  assert.equal(isAllowedImageHost(voratoon.definition, "voratoon.com"), true);
  assert.equal(isAllowedImageHost(voratoon.definition, "evil.example"), false);
  for (const privateIp of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "198.18.0.1"]) assert.equal(isPublicIpv4(privateIp), false, `SSRF range lolos: ${privateIp}`);
  assert.equal(isPublicIpv4("8.8.8.8"), true);
  assert.equal(isPublicIpv4("::1"), false);

  resetComicReaderState();
  const sources = await callApi("?action=sources");
  assert.equal(sources.status, 200);
  assert.deepEqual(sources.payload.sources.map((row) => row.id), ["mangadex", "shinigami", "voratoon", "ainzscans", "mangadotnet"]);
  assert.ok(sources.payload.sources.every((row) => row.health.status === "unchecked"));
  const sourceSearch = await callApi("?action=search&source=shinigami&q=komik&limit=2");
  assert.equal(sourceSearch.status, 200);
  assert.equal(sourceSearch.payload.items[0].source, "shinigami");
  const afterRequest = await callApi("?action=sources");
  assert.equal(afterRequest.payload.sources.find((row) => row.id === "shinigami").health.status, "active");
  const invalidSource = await callApi("?action=search&source=https%3A%2F%2F127.0.0.1&q=x");
  assert.equal(invalidSource.status, 400);
  assert.equal(invalidSource.payload.error, "COMIC_SOURCE_INVALID");

  let attempts = 0;
  const retry503 = await requestJson({ base: "https://fixed.example/api/", path: "./x", retries: 2, timeoutMs: 1000, fetchImpl: async () => { attempts += 1; return attempts < 3 ? response({}, 503) : response({ ok: true }); } });
  assert.equal(retry503.ok, true); assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(() => requestJson({ base: "https://fixed.example/api/", path: "./403", retries: 2, timeoutMs: 1000, fetchImpl: async () => { attempts += 1; return response({}, 403); } }));
  assert.equal(attempts, 1, "403 tidak boleh diretry");
  attempts = 0;
  await assert.rejects(() => requestJson({ base: "https://fixed.example/api/", path: "./429-no-header", retries: 2, timeoutMs: 1000, fetchImpl: async () => { attempts += 1; return response({}, 429); } }));
  assert.equal(attempts, 1, "429 tanpa Retry-After tidak boleh diretry");
  attempts = 0;
  const retry429 = await requestJson({ base: "https://fixed.example/api/", path: "./429-header", retries: 2, timeoutMs: 1000, fetchImpl: async () => { attempts += 1; return attempts === 1 ? response({}, 429, { "retry-after": "0.001" }) : response({ ok: true }); } });
  assert.equal(retry429.ok, true); assert.equal(attempts, 2);

  attempts = 0;
  await assert.rejects(() => requestJson({ base: "https://fixed.example/api/", path: "./500", retries: 2, timeoutMs: 1000, fetchImpl: async () => { attempts += 1; return response({}, 500); } }), /HTTP 500/);
  assert.equal(attempts, 1, "HTTP 500 tidak termasuk retry policy 502/503/504");
  await assert.rejects(() => requestJson({ base: "https://fixed.example/api/", path: "./invalid-json", retries: 0, timeoutMs: 1000, fetchImpl: async () => ({ ok: true, status: 200, headers: { get() { return ""; } }, async text() { return "not-json"; } }) }), /JSON valid/);
  await assert.rejects(() => requestJson({ base: "https://fixed.example/api/", path: "./timeout", retries: 0, timeoutMs: 1000, fetchImpl: async () => { const timeout = new Error("timeout"); timeout.name = "AbortError"; throw timeout; } }), /batas waktu/);
  const emptyChapters = await ainzscans.getChapters({ mangaId: "komik-uji", fetchImpl: async () => response({ ...fixtures.ainzscans.detail, units: [] }), timeoutMs: 1000 });
  assert.deepEqual(emptyChapters, [], "empty chapter harus tetap usable dan tidak crash");
  const readerClient = fs.readFileSync(path.join(root, "assets/comic-reader/app.js"), "utf8");
  assert.match(readerClient, /function mangaSwitchSource\(source\)[\s\S]*state\.loading=false[\s\S]*mangaResetFilters\(\)/, "Ganti source harus membatalkan load lama dan langsung reload katalog");
  assert.match(readerClient, /listGeneration/, "List source harus punya generation guard agar request lama tidak menimpa source baru");
  assert.match(readerClient, /referrerpolicy="no-referrer"/, "Cover provider harus menghindari foreign referrer saat direct image load");
  assert.match(readerClient, /onerror="mangaPageErrorHandler\(this\)"/, "broken image harus masuk retry handler");
  assert.match(readerClient, /window\.mangaPageErrorHandler[\s\S]*page-failed[\s\S]*Tekan untuk mencoba lagi/, "reader harus memiliki final broken-image retry state");

  const serverSource = fs.readFileSync(path.join(root, "lib/comic-reader.js"), "utf8");
  assert.doesNotMatch(serverSource, /searchParams\.get\(["']url["']\)/, "Comic dispatcher tidak boleh menerima arbitrary URL");
  assert.match(serverSource, /registry\.get\(source\)/);
  assert.match(serverSource, /isAllowedImageHost/);
  const apiFiles = fs.readdirSync(path.join(root, "api")).filter((name) => name.endsWith(".js"));
  assert.equal(apiFiles.length, 4, "Multi-source tidak boleh menambah Vercel Function file");

  console.log("Comic multi-source unit PASS: 4 provider fixtures SEARCH/DETAIL/CHAPTERS/PAGES, normalized models, fixed origins, bounded pagination, retry/429, registry health, SSRF and no-generic-proxy checks passed.");
})().catch((error) => { console.error(error); process.exit(1); });

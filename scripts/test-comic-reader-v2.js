"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { handleComicReader, resetComicReaderState } = require("../lib/comic-reader");

const root = path.resolve(__dirname, "..");
const mangaId = "11111111-1111-4111-8111-111111111111";
const chapterId = "22222222-2222-4222-8222-222222222222";

function responseCapture() {
  const captured = { headers: {} };
  return {
    captured,
    response: {
      setHeader(name, value) { captured.headers[name.toLowerCase()] = value; },
      status(value) { captured.status = value; return this; },
      json(value) { captured.payload = value; return value; },
      end() { captured.ended = true; }
    }
  };
}

function mockResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get(name) { return name === "content-type" ? "image/jpeg" : ""; } }, async json() { return payload; }, async arrayBuffer() { return Buffer.from("mock-cover"); } };
}

async function mockFetch(url) {
  const target = new URL(url);
  if (target.pathname === "/manga") return mockResponse({
    data: [{
      id: mangaId,
      attributes: { title: { id: "Komik Uji" }, originalLanguage: "ja", status: "ongoing" },
      relationships: [{ type: "cover_art", attributes: { fileName: "cover.jpg" } }]
    }],
    offset: 0, limit: 24, total: 1
  });
  if (target.pathname === `/manga/${mangaId}`) return mockResponse({
    data: {
      id: mangaId,
      attributes: { title: { id: "Komik Uji" }, description: { id: "Sinopsis uji." }, originalLanguage: "ja", status: "ongoing", year: 2026, tags: [] },
      relationships: [{ type: "cover_art", attributes: { fileName: "cover.jpg" } }, { type: "author", attributes: { name: "Nexora Author" } }]
    }
  });
  if (target.pathname === `/manga/${mangaId}/feed`) return mockResponse({
    data: [{
      id: chapterId,
      attributes: { chapter: "1", title: "Awal", translatedLanguage: "id", publishAt: "2026-08-25T00:00:00Z" },
      relationships: [{ type: "scanlation_group", attributes: { name: "Grup Uji" } }]
    }],
    total: 1
  });
  if (target.pathname === `/at-home/server/${chapterId}`) return mockResponse({
    baseUrl: "https://uploads.mangadex.org",
    chapter: { hash: "hash-uji", data: ["full-1.jpg"], dataSaver: ["saver-1.jpg"] }
  });
  return mockResponse({}, 404);
}

async function call(query) {
  const { captured, response } = responseCapture();
  await handleComicReader({ method: "GET", url: `/api/comics${query}`, headers: { host: "localhost", "x-forwarded-for": "203.0.113.70" }, socket: {} }, response, { fetchImpl: mockFetch, timeoutMs: 1000 });
  return captured;
}

(async () => {
  resetComicReaderState();
  const health = await call("");
  assert.equal(health.status, 200);
  assert.equal(health.payload.provider, "MangaDex");

  const list = await call("?action=list&tab=latest&page=1&type=manga");
  assert.equal(list.status, 200);
  assert.equal(list.payload.items[0].title, "Komik Uji");
  assert.match(list.payload.items[0].cover, /^\/api\/comics\?action=cover/);

  const search = await call("?action=search&q=komik");
  assert.equal(search.payload.items.length, 1);

  const detail = await call(`?action=detail&id=${mangaId}`);
  assert.equal(detail.payload.data.author, "Nexora Author");

  const chapters = await call(`?action=chapters&id=${mangaId}&lang=id`);
  assert.equal(chapters.payload.data[0].group, "Grup Uji");
  assert.match(chapters.payload.data[0].extra, /Grup Uji/);

  const pages = await call(`?action=pages&id=${chapterId}&quality=saver`);
  assert.equal(pages.payload.data.quality, "saver");
  assert.match(pages.payload.data.image[0], /data-saver\/hash-uji\/saver-1\.jpg/);

  const invalid = await call("?action=detail&id=not-a-uuid");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.payload.error, "COMIC_ID_INVALID");

  const client = fs.readFileSync(path.join(root, "assets/js/features/comic-reader.js"), "utf8");
  assert.match(client, /const SOURCE_API = '\/api\/comics'/);
  assert.match(client, /sandbox="allow-scripts allow-forms/);
  assert.doesNotMatch(client, /allow-same-origin/);
  assert.match(client, /MangaDex<\/a>/);
  assert.match(client, /quality:state\.readerQuality/);
  assert.match(fs.readFileSync(path.join(root, "assets/js/core/lazy-loader.js"), "utf8"), /comic-reader-v4/);

  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.ok(vercel.rewrites.some((row) => row.source === "/api/comics" && /comic-reader/.test(row.destination)));
  assert.match(fs.readFileSync(path.join(root, "serve-local.js"), "utf8"), /"\/api\/comics"/);
  assert.match(fs.readFileSync(path.join(root, "api/health.js"), "utf8"), /handleComicReader/);
  assert.match(fs.readFileSync(path.join(root, "lib/comic-reader.js"), "utf8"), /Access-Control-Allow-Origin/);

  console.log("Comic Reader v2 lulus: katalog, pencarian, detail, chapter, kredit scanlation, halaman saver, proxy same-origin, cache bust, dan route deploy tervalidasi.");
})().catch((error) => { console.error(error); process.exit(1); });

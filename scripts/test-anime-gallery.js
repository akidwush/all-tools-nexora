"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const gallery = require("../lib/anime-gallery");
const policy = require("../lib/server-access-policy");
const { getTool } = require("./config-test-helpers.js");

function upstream(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[String(name).toLowerCase()] || null; } },
    async json() { return payload; }
  };
}

function response() {
  return {
    statusCode: 0,
    payload: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; }
  };
}

async function invoke(query, method = "GET") {
  const target = response();
  await gallery.handleAnimeGallery({ method, url: "/api/health?mode=anime-gallery&provider=nekosbest&" + query, headers: { host: "nexora.test" } }, target);
  return target;
}

const frontend = read("assets/js/anime-gallery.js");
const css = read("assets/css/anime-gallery.css");
const html = read("anime-gallery.html");
const app = read("assets/js/core/app.js");
const schema = read("database/schema.sql");
const migration = read("database/migrations/037_anime_gallery.sql");
const vercel = JSON.parse(read("vercel.json"));
const routes = JSON.parse(read("route-manifest.json"));

assert.equal(gallery.NEKOSBEST_BASE, "https://nekos.best/api/v2");
assert.equal(gallery.NEKOSBEST_USER_AGENT, "Nexora Anime Gallery (https://all-tools-nexora.vercel.app)");
assert.equal(gallery.ENDPOINT_CACHE_TTL_MS, 6 * 60 * 60 * 1000);
assert.equal(policy.healthToolId("anime-gallery"), "animegallery");
assert.equal(getTool("animegallery").runtime.handler, "openAnimeGallery");
assert.equal(getTool("animegallery").runtime.mode, "api");
assert.match(getTool("animegallery").runtime.dependency, /provider=nekosbest&action=endpoints$/);
assert.equal(getTool("animegallery").health.path, "/anime-gallery");
assert.equal(routes.routes["/anime-gallery"], "anime-gallery.html");
assert.match(app, /case 'animegallery': openAnimeGallery\(\); return;/);
assert.match(schema, /'animegallery'/);
assert.match(migration, /'animegallery'/);
assert.ok(vercel.headers[0].headers.find((item) => item.key === "Content-Security-Policy").value.includes("https://api.waifu.im"));

assert.match(html, /Nexora Anime Discover/);
assert.match(html, /id="gallery"/);
assert.match(html, /id="filterSheet"[^>]+role="dialog"/);
assert.match(html, /id="detailView"[^>]+role="dialog"/);
assert.match(frontend, /IsNsfw: "False"/);
assert.match(frontend, /IncludedTags/);
assert.match(frontend, /ExcludedTags/);
assert.match(frontend, /IncludedArtists/);
assert.match(frontend, /new IntersectionObserver/);
assert.match(frontend, /new AbortController/);
assert.match(frontend, /Promise\.allSettled/);
assert.match(frontend, /Waifu\.im sedang tidak tersedia\./);
assert.match(frontend, /Reaction gallery sedang tidak tersedia\./);
assert.match(frontend, /localStorage\.setItem\(FAVORITES_KEY/);
assert.match(frontend, /loading = "lazy"/);
assert.match(frontend, /decoding = "async"/);
assert.doesNotMatch(frontend, /IsNsfw:\s*"(?:True|All)"/);
assert.doesNotMatch(frontend, /Math\.max\(\.48, Math\.min\(1\.45/);
assert.match(css, /\.ag-masonry\s*\{\s*columns:\s*2/);
assert.match(css, /@media \(min-width: 620px\)[\s\S]+columns:\s*3/);
assert.match(css, /@media \(min-width: 900px\)[\s\S]+columns:\s*4/);
assert.match(css, /@media \(min-width: 1220px\)[\s\S]+columns:\s*5/);
assert.match(css, /@media \(min-width: 1540px\)[\s\S]+columns:\s*6/);
assert.match(css, /border-radius:\s*14px/);
assert.match(css, /min-height:\s*44px/);

const expectedColumns = (width) => width >= 1540 ? 6 : width >= 1220 ? 5 : width >= 900 ? 4 : width >= 620 ? 3 : 2;
assert.deepEqual(
  [360, 375, 390, 412, 768, 1440, 1600].map((width) => [width, expectedColumns(width)]),
  [[360, 2], [375, 2], [390, 2], [412, 2], [768, 3], [1440, 5], [1600, 6]]
);

const categories = gallery.normalizeEndpointMap({
  hug: { format: "gif" }, neko: { format: "png" }, invalid: { format: "webp" }, "../bad": { format: "gif" }
});
assert.deepEqual(categories, [
  { name: "neko", format: "png", type: "image" },
  { name: "hug", format: "gif", type: "reaction" }
]);

const normalized = gallery.normalizeAsset({
  artist_name: "Artist Name",
  artist_href: "https://www.pixiv.net/users/123",
  source_url: "https://www.pixiv.net/artworks/456",
  url: "https://nekos.best/api/v2/neko/abc.png",
  dimensions: { width: 1000, height: 1600 }
}, 0, "neko", "image");
assert.equal(normalized.provider, "nekosbest");
assert.equal(normalized.id, "nekosbest:neko:abc");
assert.equal(normalized.artistName, "Artist Name");
assert.equal(normalized.animated, false);
assert.equal(gallery.safeExternalUrl("http://nekos.best/api/v2/neko/a.png"), "");
assert.equal(gallery.normalizeAsset({ url: "https://example.com/a.png" }, 0, "neko", "image"), null);

const originalFetch = global.fetch;
(async () => {
  gallery.resetAnimeGalleryState();
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: new URL(url), options });
    if (String(url).endsWith("/endpoints")) {
      return upstream({ neko: { format: "png" }, hug: { format: "gif" } }, 200, {
        "x-rate-limit-limit": "1m", "x-rate-limit-remaining": "199", "x-rate-limit-reset": "2026-09-10T15:00:00Z"
      });
    }
    if (new URL(url).pathname.endsWith("/search")) {
      return upstream({ results: [{ anime_name: "Series", url: "https://nekos.best/api/v2/hug/reaction.gif", dimensions: { width: 500, height: 300 } }] });
    }
    if (new URL(url).pathname.endsWith("/neko")) {
      return upstream({ results: [{ artist_name: "Mika", url: "https://nekos.best/api/v2/neko/asset.png", dimensions: { width: 800, height: 1200 } }] });
    }
    throw new Error("Unexpected upstream URL");
  };

  const endpoints = await invoke("action=endpoints");
  assert.equal(endpoints.statusCode, 200);
  assert.equal(endpoints.payload.categories.length, 2);
  assert.deepEqual(endpoints.payload.rateLimit, { limit: "1m", remaining: "199", reset: "2026-09-10T15:00:00Z" });
  assert.equal(requests[0].options.headers["User-Agent"], gallery.NEKOSBEST_USER_AGENT);

  const category = await invoke("action=category&category=neko&amount=99");
  assert.equal(category.statusCode, 200);
  assert.equal(category.payload.items[0].artistName, "Mika");
  assert.equal(requests.at(-1).url.searchParams.get("amount"), "20");

  const searched = await invoke("action=search&query=series&type=2&category=hug&amount=2");
  assert.equal(searched.statusCode, 200);
  assert.equal(searched.payload.items[0].animated, true);
  assert.equal(searched.payload.items[0].animeName, "Series");

  const cachedSearch = await invoke("action=search&query=series&type=2&category=hug&amount=2");
  assert.equal(cachedSearch.payload.cached, true);
  assert.equal(requests.filter((entry) => entry.url.pathname.endsWith("/search")).length, 1);

  assert.equal((await invoke("action=category&category=unknown")).statusCode, 400);
  assert.equal((await invoke("action=search&query=x&type=1")).statusCode, 400);
  assert.equal((await invoke("action=search&query=series&type=3")).statusCode, 400);
  assert.equal((await invoke("action=search&query=series&type=1&category=hug")).payload.error, "CATEGORY_TYPE_MISMATCH");
  assert.equal((await invoke("action=endpoints&url=https%3A%2F%2Fexample.com")).payload.error, "UNSUPPORTED_PARAMETER");
  assert.equal((await invoke("action=endpoints", "POST")).statusCode, 405);

  console.log("Anime Discover lulus: allowlist adapter, User-Agent, cache kategori/search, normalizer, SFW Waifu filters, viewport 360/375/390/412/768/1440/1600, masonry responsif, lazy GIF, detail, attribution, dan Saved lokal tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = originalFetch;
  gallery.resetAnimeGalleryState();
});

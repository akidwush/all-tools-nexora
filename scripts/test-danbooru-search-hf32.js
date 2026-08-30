"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const danbooru = require(path.join(root, "lib/kuroneko-danbooru.js"));
const { getTool } = require("./config-test-helpers.js");

function responsePayload(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[String(name).toLowerCase()] || null; } },
    text: async () => typeof payload === "string" ? payload : JSON.stringify(payload)
  };
}

function mockResponse() {
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

let requestNumber = 0;
async function invoke(query, fetchImpl, method = "GET", runtime = {}) {
  requestNumber += 1;
  const response = mockResponse();
  const url = new URL("https://nexora.test/api/search/danbooru?_service=danbooru-search&" + query);
  await danbooru.handleDanbooruSearch(
    { method, headers: { "x-forwarded-for": `198.51.100.${requestNumber}` } },
    response,
    url,
    { fetch: fetchImpl, ...runtime }
  );
  return response;
}

const frontend = read("assets/js/features/danbooru-search.js");
const css = read("assets/css/features/danbooru-search.css");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const dispatcher = read("api/tool-health.js");
const localServer = read("serve-local.js");
const envExample = read(".env.example");
const readme = read("README.md");
const schema = read("database/schema.sql");
const migration = read("database/migrations/030_danbooru_search.sql");
const manifest = JSON.parse(read("assets/module-manifest.json"));
const routes = JSON.parse(read("route-manifest.json"));
const vercel = JSON.parse(read("vercel.json"));

assert.equal(danbooru.UPSTREAM_URL, "https://sylvatica.my.id/api/search/danbooru");
assert.deepEqual([...danbooru.ALLOWED_QUERY], ["_service", "q", "mode"]);
assert.deepEqual([...danbooru.ALLOWED_MODES], ["safe", "nsfw"]);
assert.deepEqual(manifest.modules["danbooru-search"], { css: ["assets/css/features/danbooru-search.css"], js: ["assets/js/features/danbooru-search.js"] });
assert.equal(manifest.tools.danbooru, "danbooru-search");
assert.ok(routes.apiRoutes.includes("/api/search/danbooru"));
assert.ok(vercel.rewrites.some((entry) => entry.source === "/api/search/danbooru" && entry.destination === "/api/tool-health?_service=danbooru-search"));
assert.match(dispatcher, /handleDanbooruSearch/);
assert.match(dispatcher, /_service[^\n]+danbooru-search/);
assert.match(localServer, /"\/api\/search\/danbooru"[^\n]+service: "danbooru-search"/);
assert.match(localServer, /route\.service[^\n]+_service/);
assert.match(app, /case 'danbooru': renderDanbooruSearch\(body\); break;/);
assert.match(shell, /danbooru:\{renderer:'renderDanbooruSearch'/);
assert.match(lazy, /danbooru-search-hf35/);
assert.equal(getTool("danbooru").runtime.module, "danbooru-search");
assert.equal(getTool("danbooru").runtime.handler, "renderDanbooruSearch");
assert.equal(getTool("danbooru").runtime.mode, "api");
assert.equal(getTool("danbooru").health.path, "/assets/js/features/danbooru-search.js");
assert.match(schema, /'danbooru'/);
assert.match(migration, /'danbooru'/);
assert.match(migration, /add column if not exists access_level/);
assert.match(migration, /updated_at = now\(\);/);
assert.match(envExample, /^KURONEKO_API_KEY=$/m);
assert.match(readme, /#tool-danbooru/);

assert.match(frontend, /window\.renderDanbooruSearch\s*=/);
assert.match(frontend, /new AbortController\(\)/);
assert.match(frontend, /new URLSearchParams\(\{ q: value, mode: selectedMode \}\)/);
assert.match(frontend, /loading = "lazy"/);
assert.match(frontend, /decoding = "async"/);
assert.match(frontend, /function displayImageUrl/);
assert.match(frontend, /source\.hostname\.toLowerCase\(\) !== "cdn\.donmai\.us"/);
assert.match(frontend, /https:\/\/i0\.wp\.com\//);
assert.match(frontend, /displayImageUrl\(item\.thumbnail \|\| item\.imageUrl, 640\)/);
assert.match(frontend, /displayImageUrl\(imageUrl, 1600\)/);
assert.match(frontend, /referrerPolicy = "no-referrer"/);
assert.match(frontend, /if \(sessionState\.loading\) return/);
assert.match(frontend, /sessionState\.cache/);
assert.match(frontend, /body\.__nxCleanup/);
assert.match(frontend, /visibilitychange/);
assert.doesNotMatch(frontend, /sylvatica\.my\.id|KURONEKO_API_KEY|localStorage|sessionStorage|setInterval|autoplay/i);
assert.doesNotMatch(css, /@media|position\s*:\s*fixed|backdrop-filter|overflow-x\s*:\s*(?:scroll|auto)/i);
assert.match(css, /max-width:680px/);
assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /aspect-ratio:3\/4/);
assert.match(css, /min-height:48px/);

assert.equal(danbooru.normalizeQuery("hatsune miku"), "hatsune_miku");
assert.equal(danbooru.normalizeQuery("hatsune_miku"), "hatsune_miku");
assert.equal(danbooru.normalizeQuery("rating:safe hatsune_miku"), "rating:safe hatsune_miku");
assert.throws(() => danbooru.normalizeQuery(""), /DANBOORU_QUERY_REQUIRED/);
assert.throws(() => danbooru.normalizeQuery("x".repeat(201)), /DANBOORU_QUERY_TOO_LONG/);

const normalized = danbooru.normalizeDanbooruResponse({
  status: true,
  result: {
    data: {
      posts: [
        {
          id: 123,
          file_url: "https://cdn.example.com/original-1.jpg",
          preview_url: "https://cdn.example.com/preview-1.jpg",
          source: "https://artist.example.com/post/1",
          tag_string: "hatsune_miku vocaloid",
          image_width: 1200,
          image_height: 1600,
          rating: "safe"
        },
        {
          postId: "second",
          imageUrl: "https://cdn.example.com/original-2.png",
          thumbnailUrl: "https://cdn.example.com/preview-2.png",
          tags: ["furina", "genshin_impact"]
        }
      ]
    }
  }
});
assert.equal(normalized.items.length, 2);
assert.deepEqual(normalized.items[0], {
  id: "123",
  thumbnail: "https://cdn.example.com/preview-1.jpg",
  imageUrl: "https://cdn.example.com/original-1.jpg",
  sourceUrl: "https://artist.example.com/post/1",
  tags: ["hatsune_miku", "vocaloid"],
  width: 1200,
  height: 1600,
  rating: "safe"
});
assert.equal(Object.hasOwn(normalized.items[1], "rating"), false, "Field yang tidak ada tidak boleh dibuat");
const productionShape = danbooru.normalizeDanbooruResponse({
  status: true,
  result: {
    full_file_url: "https://cdn.example.com/full-production.jpg",
    id: 987,
    rating: "s",
    source: "https://artist.example.com/work/987",
    tags: ["hatsune_miku", "vocaloid"]
  }
});
assert.deepEqual(productionShape.items[0], {
  id: "987",
  imageUrl: "https://cdn.example.com/full-production.jpg",
  sourceUrl: "https://artist.example.com/work/987",
  tags: ["hatsune_miku", "vocaloid"],
  rating: "s"
});
assert.equal(danbooru.normalizeDanbooruResponse({ data: { images: [] } }).items.length, 0);
assert.deepEqual(danbooru.normalizeDanbooruResponse({ result: "https://cdn.example.com/direct.jpg" }), {
  items: [{ imageUrl: "https://cdn.example.com/direct.jpg" }]
});
assert.equal(danbooru.normalizeDanbooruResponse({ result: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"] }).items.length, 2);
assert.equal(danbooru.normalizeDanbooruResponse({ data: { posts: [{ file_url: "https://cdn.example.com/a.jpg?apikey=server-secret" }] } }, "server-secret").items.length, 0);
assert.equal(danbooru.safeExternalUrl("http://cdn.example.com/a.jpg"), "");
assert.equal(danbooru.safeExternalUrl("https://127.0.0.1/a.jpg"), "");
assert.doesNotMatch(JSON.stringify(danbooru.responseShape({ result: { "test_key_not_a_real_secret": "value" } }, "test_key_not_a_real_secret")), /test_key_not_a_real_secret/);

const oldKey = process.env.KURONEKO_API_KEY;

(async () => {
  danbooru.resetDanbooruState();
  delete process.env.KURONEKO_API_KEY;
  const missingKey = await invoke("q=hatsune_miku&mode=safe", async () => responsePayload({}));
  assert.equal(missingKey.statusCode, 503);
  assert.equal(missingKey.payload.error, "DANBOORU_CONFIGURATION_ERROR");

  process.env.KURONEKO_API_KEY = "test_key_not_a_real_secret";
  let upstreamUrl = null;
  const success = await invoke("q=hatsune%20miku&mode=safe", async (url) => {
    upstreamUrl = new URL(url);
    return responsePayload({ status: true, result: { posts: [{ file_url: "https://cdn.example.com/image.jpg", preview_url: "https://cdn.example.com/thumb.jpg" }] } });
  });
  assert.equal(success.statusCode, 200);
  assert.equal(success.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(upstreamUrl.origin + upstreamUrl.pathname, danbooru.UPSTREAM_URL);
  assert.equal(upstreamUrl.searchParams.get("q"), "hatsune_miku");
  assert.equal(upstreamUrl.searchParams.get("mode"), "safe");
  assert.equal(upstreamUrl.searchParams.get("apikey"), "test_key_not_a_real_secret");
  assert.equal(success.payload.data.items.length, 1);
  assert.doesNotMatch(JSON.stringify(success.payload), /test_key_not_a_real_secret|sylvatica\.my\.id/);

  const emptyQuery = await invoke("q=&mode=safe", async () => responsePayload({}));
  assert.equal(emptyQuery.statusCode, 400);
  const badMode = await invoke("q=furina&mode=unknown", async () => responsePayload({}));
  assert.equal(badMode.statusCode, 400);
  const injected = await invoke("q=furina&mode=safe&apikey=browser-key", async () => responsePayload({}));
  assert.equal(injected.statusCode, 400);
  assert.equal(injected.payload.error, "UNSUPPORTED_PARAMETER");

  const empty = await invoke("q=no_result&mode=safe", async () => responsePayload({ status: true, data: { posts: [] } }));
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.payload.data.items.length, 0);
  const notFound = await invoke("q=missing&mode=safe", async () => responsePayload({ status: false, message: "not found" }, 404));
  assert.equal(notFound.statusCode, 404);
  const unauthorized = await invoke("q=furina&mode=safe", async () => responsePayload({ creator: "Dandy", message: "API Key wajib diisi", status: false }, 401));
  assert.equal(unauthorized.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(unauthorized.payload), /Dandy|API Key wajib|test_key_not_a_real_secret/);
  const limited = await invoke("q=furina&mode=nsfw", async () => responsePayload({ status: false, message: "rate limit" }, 429));
  assert.equal(limited.statusCode, 429);
  const serverError = await invoke("q=server&mode=safe", async () => responsePayload({ status: false, message: "stack /srv/app.js" }, 500));
  assert.equal(serverError.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(serverError.payload), /srv|stack/);
  const invalidJson = await invoke("q=bad_json&mode=safe", async () => responsePayload("<html>offline</html>"));
  assert.equal(invalidJson.statusCode, 502);
  assert.equal(invalidJson.payload.error, "DANBOORU_INVALID_RESPONSE");

  const timeout = await invoke("q=slow&mode=safe", (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }), "GET", { timeoutMs: 5 });
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.payload.error, "DANBOORU_TIMEOUT");

  danbooru.resetDanbooruState();
  let calls = 0;
  const dedupFetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return responsePayload({ status: true, data: { images: [{ url: "https://cdn.example.com/shared.jpg" }] } });
  };
  const query = "q=shared&mode=safe";
  const [first, second] = await Promise.all([invoke(query, dedupFetch), invoke(query, dedupFetch)]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 1, "Query dan mode identik saat aktif harus berbagi satu request upstream");

  const post = await invoke("q=furina&mode=safe", async () => responsePayload({}), "POST");
  assert.equal(post.statusCode, 405);

  console.log("Danbooru Search HF32/HF35 lulus: secret server-only, full_file_url produksi, CDN TLS fallback, normalizer toleran, gallery dua kolom, viewer, cache sesi, timeout, dedup, dan 12-Function routing tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (oldKey === undefined) delete process.env.KURONEKO_API_KEY; else process.env.KURONEKO_API_KEY = oldKey;
});

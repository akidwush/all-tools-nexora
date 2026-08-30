"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const animeToReal = require(path.join(root, "lib/kuroneko-anime-to-real.js"));
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
  const url = new URL("https://nexora.test/api/ai/anime-to-real?_service=anime-to-real&" + query);
  await animeToReal.handleAnimeToReal(
    { method, headers: { "x-forwarded-for": `198.51.100.${requestNumber}` } },
    response,
    url,
    { fetch: fetchImpl, ...runtime }
  );
  return response;
}

const frontend = read("assets/js/features/anime-to-real.js");
const css = read("assets/css/features/anime-to-real.css");
const backend = read("lib/kuroneko-anime-to-real.js");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const dispatcher = read("api/tool-health.js");
const localServer = read("serve-local.js");
const schema = read("database/schema.sql");
const readme = read("README.md");
const manifest = JSON.parse(read("assets/module-manifest.json"));
const routes = JSON.parse(read("route-manifest.json"));
const vercel = JSON.parse(read("vercel.json"));

assert.equal(animeToReal.UPSTREAM_URL, "https://sylvatica.my.id/api/ai/animetoreal");
assert.deepEqual([...animeToReal.ALLOWED_QUERY], ["_service", "url"]);
assert.deepEqual(manifest.modules["anime-to-real"], { css: ["assets/css/features/anime-to-real.css"], js: ["assets/js/features/anime-to-real.js"] });
assert.equal(manifest.tools.animetoreal, "anime-to-real");
assert.ok(routes.apiRoutes.includes("/api/ai/anime-to-real"));
assert.ok(vercel.rewrites.some((entry) => entry.source === "/api/ai/anime-to-real" && entry.destination === "/api/tool-health?_service=anime-to-real"));
assert.match(dispatcher, /handleAnimeToReal/);
assert.match(dispatcher, /_service[^\n]+anime-to-real/);
assert.match(localServer, /"\/api\/ai\/anime-to-real"[^\n]+service: "anime-to-real"/);
assert.match(app, /case 'animetoreal': renderAnimeToReal\(body\); break;/);
assert.match(shell, /animetoreal:\{renderer:'renderAnimeToReal'/);
assert.match(lazy, /anime-to-real-hf3[67]/);
assert.equal(getTool("animetoreal").runtime.module, "anime-to-real");
assert.equal(getTool("animetoreal").runtime.handler, "renderAnimeToReal");
assert.equal(getTool("animetoreal").runtime.mode, "api");
assert.equal(getTool("animetoreal").health.path, "/assets/js/features/anime-to-real.js");
assert.match(schema, /'animetoreal'/);
assert.match(readme, /#tool-animetoreal/);
assert.equal((read(".env.example").match(/^KURONEKO_API_KEY=$/gm) || []).length, 1);
assert.equal(fs.existsSync(path.join(root, "database/migrations/031_anime_to_real.sql")), false, "Anime to Real tidak boleh menambah migration database");

assert.match(frontend, /window\.renderAnimeToReal\s*=/);
assert.match(frontend, /new AbortController\(\)/);
assert.match(frontend, /new URLSearchParams\(\{ url: value \}\)/);
assert.match(frontend, /navigator\.clipboard\.readText/);
assert.match(frontend, /image\.loading = "lazy"/);
assert.match(frontend, /image\.decoding = "async"/);
assert.match(frontend, /if \(sessionState\.loading\) return/);
assert.match(frontend, /body\.__nxCleanup/);
assert.match(frontend, /visibilitychange/);
assert.doesNotMatch(frontend, /sylvatica\.my\.id|KURONEKO_API_KEY|supabase|localStorage|sessionStorage|setInterval|autoplay/i);
assert.doesNotMatch(backend, /require\(["']\.\/database|supabase|fetch\(inputUrl\)|fetch\(userUrl\)/i);
assert.doesNotMatch(css, /@media|position\s*:\s*fixed|backdrop-filter|overflow-x\s*:\s*(?:scroll|auto)/i);
assert.match(css, /max-width:680px/);
assert.match(css, /aspect-ratio:4\/5/);
assert.match(css, /min-height:48px/);
assert.match(css, /max-width:100%/);
assert.match(css, /object-fit:contain/);

assert.equal(animeToReal.normalizeInputUrl("https://example.com/anime.png"), "https://example.com/anime.png");
assert.equal(animeToReal.normalizeInputUrl("http://example.com/anime.webp"), "http://example.com/anime.webp");
assert.throws(() => animeToReal.normalizeInputUrl(""), /ANIME_REAL_URL_REQUIRED/);
assert.throws(() => animeToReal.normalizeInputUrl("javascript:alert(1)"), /ANIME_REAL_URL_INVALID/);
assert.throws(() => animeToReal.normalizeInputUrl("http://127.0.0.1/private"), /ANIME_REAL_URL_INVALID/);
assert.throws(() => animeToReal.normalizeInputUrl("https://metadata.google.internal/latest"), /ANIME_REAL_URL_INVALID/);
assert.throws(() => animeToReal.normalizeInputUrl("https://user:pass@example.com/image.jpg"), /ANIME_REAL_URL_INVALID/);

assert.deepEqual(animeToReal.normalizeAnimeToRealResponse({ status: true, result: { data: { output_url: "https://cdn.example.com/real.jpg" } } }), {
  imageUrl: "https://cdn.example.com/real.jpg"
});
assert.deepEqual(animeToReal.normalizeAnimeToRealResponse({ result: "https://cdn.example.com/direct.png" }), {
  imageUrl: "https://cdn.example.com/direct.png"
});
assert.deepEqual(animeToReal.normalizeAnimeToRealResponse({ data: ["https://cdn.example.com/array.webp"] }), {
  imageUrl: "https://cdn.example.com/array.webp"
});
assert.deepEqual(animeToReal.normalizeAnimeToRealResponse({ result: { url: "https://example.com/original.png", transformed_image: "https://cdn.example.com/real.png" } }, "", "https://example.com/original.png"), {
  imageUrl: "https://cdn.example.com/real.png"
});
assert.deepEqual(animeToReal.normalizeAnimeToRealResponse({ result: { source: "https://example.com/source.png" } }), { imageUrl: null });
assert.deepEqual(animeToReal.normalizeAnimeToRealResponse({ output: "https://cdn.example.com/result.png?apikey=server-secret" }, "server-secret"), { imageUrl: null });
assert.equal(animeToReal.safeExternalUrl("http://cdn.example.com/result.jpg"), "");
assert.equal(animeToReal.safeExternalUrl("https://127.0.0.1/result.jpg"), "");
assert.doesNotMatch(JSON.stringify(animeToReal.responseShape({ result: { "test_key_not_a_real_secret": "value" } }, "test_key_not_a_real_secret")), /test_key_not_a_real_secret/);

const oldKey = process.env.KURONEKO_API_KEY;

(async () => {
  animeToReal.resetAnimeToRealState();
  delete process.env.KURONEKO_API_KEY;
  const missingKey = await invoke("url=https%3A%2F%2Fexample.com%2Fanime.jpg", async () => responsePayload({}));
  assert.equal(missingKey.statusCode, 503);
  assert.equal(missingKey.payload.error, "ANIME_REAL_CONFIGURATION_ERROR");

  process.env.KURONEKO_API_KEY = "test_key_not_a_real_secret";
  let upstreamUrl = null;
  const inputUrl = "https://images.example.com/anime.png?size=large";
  const success = await invoke("url=" + encodeURIComponent(inputUrl), async (url) => {
    upstreamUrl = new URL(url);
    return responsePayload({ status: true, result: { output: { image_url: "https://cdn.example.com/realistic.jpg" } } });
  });
  assert.equal(success.statusCode, 200);
  assert.equal(success.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(upstreamUrl.origin + upstreamUrl.pathname, animeToReal.UPSTREAM_URL);
  assert.equal(upstreamUrl.searchParams.get("url"), inputUrl);
  assert.equal(upstreamUrl.searchParams.get("apikey"), "test_key_not_a_real_secret");
  assert.equal(success.payload.data.imageUrl, "https://cdn.example.com/realistic.jpg");
  assert.doesNotMatch(JSON.stringify(success.payload), /test_key_not_a_real_secret|sylvatica\.my\.id/);

  const emptyUrl = await invoke("url=", async () => responsePayload({}));
  assert.equal(emptyUrl.statusCode, 400);
  const injected = await invoke("url=https%3A%2F%2Fexample.com%2Fa.jpg&apikey=browser-key", async () => responsePayload({}));
  assert.equal(injected.statusCode, 400);
  assert.equal(injected.payload.error, "UNSUPPORTED_PARAMETER");
  const privateUrl = await invoke("url=http%3A%2F%2F127.0.0.1%2Fprivate", async () => responsePayload({}));
  assert.equal(privateUrl.statusCode, 400);

  const unauthorized = await invoke("url=https%3A%2F%2Fexample.com%2Fa.jpg", async () => responsePayload({ creator: "KuroNeko", message: "API Key wajib diisi", status: false }, 401));
  assert.equal(unauthorized.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(unauthorized.payload), /KuroNeko|API Key wajib|test_key_not_a_real_secret/);
  const rejected = await invoke("url=https%3A%2F%2Fexample.com%2Fbad.jpg", async () => responsePayload({ status: false, message: "unsupported image" }, 422));
  assert.equal(rejected.statusCode, 400);
  const missing = await invoke("url=https%3A%2F%2Fexample.com%2Fmissing.jpg", async () => responsePayload({ status: false, message: "not found" }, 404));
  assert.equal(missing.statusCode, 404);
  const limited = await invoke("url=https%3A%2F%2Fexample.com%2Frate.jpg", async () => responsePayload({ status: false, message: "rate limit" }, 429));
  assert.equal(limited.statusCode, 429);
  const serverError = await invoke("url=https%3A%2F%2Fexample.com%2Fserver.jpg", async () => responsePayload({ status: false, message: "stack /srv/app.js" }, 500));
  assert.equal(serverError.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(serverError.payload), /srv|stack/);
  const invalidJson = await invoke("url=https%3A%2F%2Fexample.com%2Fjson.jpg", async () => responsePayload("<html>offline</html>"));
  assert.equal(invalidJson.statusCode, 502);
  assert.equal(invalidJson.payload.error, "ANIME_REAL_INVALID_RESPONSE");
  const empty = await invoke("url=https%3A%2F%2Fexample.com%2Fempty.jpg", async () => responsePayload({ status: true, result: {} }));
  assert.equal(empty.statusCode, 422);
  assert.equal(empty.payload.error, "ANIME_REAL_EMPTY_RESULT");

  const timeout = await invoke("url=https%3A%2F%2Fexample.com%2Fslow.jpg", (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }), "GET", { timeoutMs: 5 });
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.payload.error, "ANIME_REAL_TIMEOUT");

  animeToReal.resetAnimeToRealState();
  let calls = 0;
  const dedupFetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return responsePayload({ status: true, data: { output_url: "https://cdn.example.com/shared.jpg" } });
  };
  const query = "url=https%3A%2F%2Fexample.com%2Fshared.jpg";
  const [first, second] = await Promise.all([invoke(query, dedupFetch), invoke(query, dedupFetch)]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 1, "URL identik saat aktif harus berbagi satu request upstream");

  const unsupportedMethod = await invoke("url=https%3A%2F%2Fexample.com%2Fa.jpg", async () => responsePayload({}), "PUT");
  assert.equal(unsupportedMethod.statusCode, 405);

  console.log("Anime to Real HF36 lulus: KuroNeko server-only, tanpa Supabase, normalizer toleran, no-store, timeout, dedup, error aman, UI mobile, dan routing 12-Function tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (oldKey === undefined) delete process.env.KURONEKO_API_KEY; else process.env.KURONEKO_API_KEY = oldKey;
});

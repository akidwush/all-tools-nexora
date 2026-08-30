"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const aio = require(path.join(root, "lib/kuroneko-aio.js"));
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
async function invoke(query, fetchImpl, method = "GET") {
  requestNumber += 1;
  const response = mockResponse();
  const url = new URL("https://nexora.test/api/download/aio?mode=aio-download&" + query);
  await aio.handleAioDownload({ method, headers: { "x-forwarded-for": `198.51.100.${requestNumber}` } }, response, url, { fetch: fetchImpl });
  return response;
}

const frontend = read("assets/js/features/aio-downloader.js");
const css = read("assets/css/features/aio-downloader.css");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const dispatcher = read("api/tool-health.js");
const envExample = read(".env.example");
const readme = read("README.md");
const schema = read("database/schema.sql");
const migration = read("database/migrations/029_aio_downloader.sql");
const manifest = JSON.parse(read("assets/module-manifest.json"));
const routes = JSON.parse(read("route-manifest.json"));
const vercel = JSON.parse(read("vercel.json"));

assert.equal(aio.UPSTREAM_URL, "https://sylvatica.my.id/api/download/aio");
assert.deepEqual([...aio.ALLOWED_QUERY], ["mode", "url"]);
assert.deepEqual(manifest.modules["aio-downloader"], { css: ["assets/css/features/aio-downloader.css"], js: ["assets/js/features/aio-downloader.js"] });
assert.equal(manifest.tools.aiodownloader, "aio-downloader");
assert.ok(routes.apiRoutes.includes("/api/download/aio"));
assert.ok(vercel.rewrites.some((entry) => entry.source === "/api/download/aio" && entry.destination === "/api/tool-health?mode=aio-download"));
assert.match(dispatcher, /handleAioDownload/);
assert.match(app, /case 'aiodownloader': renderAioDownloader\(body\); break;/);
assert.match(shell, /aiodownloader:\{renderer:'renderAioDownloader'/);
assert.match(lazy, /aio-downloader-hf31/);
assert.equal(getTool("aiodownloader").runtime.module, "aio-downloader");
assert.equal(getTool("aiodownloader").runtime.handler, "renderAioDownloader");
assert.equal(getTool("aiodownloader").runtime.mode, "api");
assert.equal(getTool("aiodownloader").health.path, "/assets/js/features/aio-downloader.js");
assert.match(schema, /'aiodownloader'/);
assert.match(migration, /'aiodownloader'/);
assert.match(migration, /add column if not exists access_level/);
assert.match(migration, /updated_at = now\(\);/);
assert.match(envExample, /^KURONEKO_API_KEY=$/m);
assert.match(envExample, /^KURONEKO_AIO_TIMEOUT_MS=25000$/m);
assert.match(readme, /#tool-aiodownloader/);

assert.match(frontend, /window\.renderAioDownloader\s*=/);
assert.match(frontend, /new AbortController\(\)/);
assert.match(frontend, /new URLSearchParams\(\{ url: value \}\)/);
assert.match(frontend, /navigator\.clipboard\.readText/);
assert.match(frontend, /image\.loading = "lazy"/);
assert.match(frontend, /if \(sessionState\.loading\) return/);
assert.match(frontend, /body\.__nxCleanup/);
assert.match(frontend, /visibilitychange/);
assert.doesNotMatch(frontend, /sylvatica\.my\.id|KURONEKO_API_KEY|localStorage|sessionStorage|autoplay/i);
assert.doesNotMatch(css, /@media|position\s*:\s*fixed|backdrop-filter|overflow-x\s*:\s*(?:scroll|auto)/i);
assert.match(css, /max-width:620px/);
assert.match(css, /min-height:48px/);
assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto/);

assert.equal(aio.normalizeInputUrl("https://example.com/watch?v=1"), "https://example.com/watch?v=1");
assert.equal(aio.normalizeInputUrl("http://example.com/video"), "http://example.com/video");
assert.throws(() => aio.normalizeInputUrl("javascript:alert(1)"), /UNSAFE_URL/);
assert.throws(() => aio.normalizeInputUrl("http://127.0.0.1/private"), /UNSAFE_URL/);
assert.throws(() => aio.normalizeInputUrl("https://user:pass@example.com/private"), /UNSAFE_URL/);

const multiple = aio.normalizeAioDownloadResponse({
  status: true,
  result: {
    data: {
      title: "Judul nyata",
      uploader: "Pemilik nyata",
      platform: "Platform nyata",
      duration: "01:30",
      thumbnail: "https://cdn.example.com/thumb.jpg",
      downloads: [
        { download_url: "https://cdn.example.com/video-720.mp4", quality: "720p", format: "MP4", size: "12 MB" },
        { link: "https://cdn.example.com/audio.mp3", label: "Audio", format: "MP3" }
      ]
    }
  }
});
assert.equal(multiple.title, "Judul nyata");
assert.equal(multiple.author, "Pemilik nyata");
assert.equal(multiple.platform, "Platform nyata");
assert.equal(multiple.thumbnail, "https://cdn.example.com/thumb.jpg");
assert.equal(multiple.items.length, 2);
assert.equal(multiple.items[0].quality, "720p");
assert.equal(multiple.items[1].label, "Audio");

const single = aio.normalizeAioDownloadResponse({ data: { url: "https://cdn.example.com/only.mp4" } });
assert.deepEqual(single, { items: [{ id: "media-1", url: "https://cdn.example.com/only.mp4" }] });
const directArray = aio.normalizeAioDownloadResponse(["https://cdn.example.com/a.mp4", "https://cdn.example.com/b.mp3"]);
assert.equal(directArray.items.length, 2);
const absent = aio.normalizeAioDownloadResponse({ result: { media: [{ url: "https://cdn.example.com/file" }] } });
assert.equal(Object.hasOwn(absent, "platform"), false, "Metadata yang tidak diberikan tidak boleh dibuat");
assert.equal(Object.hasOwn(absent.items[0], "quality"), false, "Kualitas yang tidak diberikan tidak boleh dibuat");
assert.equal(aio.normalizeAioDownloadResponse({ data: { url: "https://cdn.example.com/file?apikey=server-secret" } }, "server-secret").items.length, 0, "Secret yang terpantul tidak boleh masuk response");

const oldKey = process.env.KURONEKO_API_KEY;
const oldTimeout = process.env.KURONEKO_AIO_TIMEOUT_MS;
delete process.env.KURONEKO_API_KEY;

(async () => {
  aio.resetAioState();
  const missingKey = await invoke("url=https%3A%2F%2Fexample.com%2Fmedia", async () => responsePayload({}));
  assert.equal(missingKey.statusCode, 503);
  assert.equal(missingKey.payload.error, "AIO_CONFIGURATION_ERROR");
  process.env.KURONEKO_API_KEY = "test_key_not_a_real_secret";
  let upstreamUrl = null;
  const success = await invoke("url=https%3A%2F%2Fexample.com%2Fwatch%3Fv%3D1", async (url) => {
    upstreamUrl = new URL(url);
    return responsePayload({ status: true, result: { data: { title: "Media", downloads: [{ url: "https://cdn.example.com/media.mp4" }] } } });
  });
  assert.equal(success.statusCode, 200);
  assert.equal(success.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(upstreamUrl.origin + upstreamUrl.pathname, aio.UPSTREAM_URL);
  assert.equal(upstreamUrl.searchParams.get("url"), "https://example.com/watch?v=1");
  assert.equal(upstreamUrl.searchParams.get("apikey"), "test_key_not_a_real_secret");
  assert.equal(success.payload.data.items.length, 1);
  assert.doesNotMatch(JSON.stringify(success.payload), /test_key_not_a_real_secret|sylvatica\.my\.id/);

  const invalid = await invoke("url=not-a-url", async () => responsePayload({}));
  assert.equal(invalid.statusCode, 400);
  const emptyInput = await invoke("url=", async () => responsePayload({}));
  assert.equal(emptyInput.statusCode, 400);
  const unsupportedParam = await invoke("url=https%3A%2F%2Fexample.com&apikey=browser-key", async () => responsePayload({}));
  assert.equal(unsupportedParam.statusCode, 400);
  assert.equal(unsupportedParam.payload.error, "UNSUPPORTED_PARAMETER");
  const privateUrl = await invoke("url=http%3A%2F%2F169.254.169.254%2Flatest", async () => responsePayload({}));
  assert.equal(privateUrl.statusCode, 400);

  const rejected = await invoke("url=https%3A%2F%2Fexample.com%2Funsupported", async () => responsePayload({ status: false, message: "unsupported internal detail" }, 400));
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.payload.error, "AIO_PROVIDER_REJECTED");
  assert.doesNotMatch(JSON.stringify(rejected.payload), /internal detail/);
  const unauthorized = await invoke("url=https%3A%2F%2Fexample.com%2Fprivate", async () => responsePayload({ status: false, message: "API Key invalid test_key_not_a_real_secret" }, 401));
  assert.equal(unauthorized.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(unauthorized.payload), /test_key_not_a_real_secret|API Key invalid/);
  const limited = await invoke("url=https%3A%2F%2Fexample.com%2Frate", async () => responsePayload({ status: false, message: "rate limit" }, 429));
  assert.equal(limited.statusCode, 429);
  const serverError = await invoke("url=https%3A%2F%2Fexample.com%2Fserver", async () => responsePayload({ status: false, message: "stack /srv/app.js" }, 500));
  assert.equal(serverError.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(serverError.payload), /srv|stack/);
  const invalidJson = await invoke("url=https%3A%2F%2Fexample.com%2Fbad-json", async () => responsePayload("<html>offline</html>"));
  assert.equal(invalidJson.statusCode, 502);
  assert.equal(invalidJson.payload.error, "AIO_INVALID_RESPONSE");
  const emptyResult = await invoke("url=https%3A%2F%2Fexample.com%2Fempty", async () => responsePayload({ status: true, data: { title: "Tanpa link" } }));
  assert.equal(emptyResult.statusCode, 422);
  assert.equal(emptyResult.payload.error, "AIO_EMPTY_RESULT");
  const network = await invoke("url=https%3A%2F%2Fexample.com%2Fnetwork", async () => { throw new Error("connect ECONNREFUSED internal-host"); });
  assert.equal(network.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(network.payload), /ECONNREFUSED|internal-host/);

  process.env.KURONEKO_AIO_TIMEOUT_MS = "5";
  const timeout = await invoke("url=https%3A%2F%2Fexample.com%2Fslow", (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.payload.error, "AIO_TIMEOUT");

  process.env.KURONEKO_AIO_TIMEOUT_MS = "25000";
  aio.resetAioState();
  let calls = 0;
  const dedupFetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return responsePayload({ status: true, data: { media: [{ url: "https://cdn.example.com/shared.mp4" }] } });
  };
  const query = "url=https%3A%2F%2Fexample.com%2Fsame";
  const [first, second] = await Promise.all([invoke(query, dedupFetch), invoke(query, dedupFetch)]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 1, "URL yang sama saat masih diproses harus berbagi satu request upstream");

  const post = await invoke("url=https%3A%2F%2Fexample.com", async () => responsePayload({}), "POST");
  assert.equal(post.statusCode, 405);

  console.log("All In One Downloader HF31 lulus: proxy server-only, parser toleran, no-store, timeout, dedup, error aman, UI mobile, dan routing 12-Function tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (oldKey === undefined) delete process.env.KURONEKO_API_KEY; else process.env.KURONEKO_API_KEY = oldKey;
  if (oldTimeout === undefined) delete process.env.KURONEKO_AIO_TIMEOUT_MS; else process.env.KURONEKO_AIO_TIMEOUT_MS = oldTimeout;
});

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const hd4 = require(path.join(root, "lib/kuroneko-hd4.js"));
const { getTool } = require("./config-test-helpers.js");

function upstreamResponse(payload, status = 200, headers = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value]));
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return normalized[String(name).toLowerCase()] || null; } },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
  };
}

function mockResponse() {
  return {
    statusCode: 0, payload: null, body: null, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end(payload) { if (payload != null) this.body = Buffer.from(payload); return this; }
  };
}

let requestNumber = 0;
async function invoke(params, fetchImpl, method = "GET", runtime = {}, body = {}) {
  requestNumber += 1;
  const response = mockResponse();
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const url = new URL("https://nexora.test/api/tools/hd4?_service=hd4-enhancer&" + query.toString());
  await hd4.handleHD4(
    { method, headers: { "x-forwarded-for": "198.51.100." + requestNumber, "content-type": "application/json" }, body },
    response,
    url,
    { fetch: fetchImpl, ...runtime }
  );
  return response;
}

const frontend = read("assets/js/features/hd4-enhancer.js");
const css = read("assets/css/features/hd4-enhancer.css");
const backend = read("lib/kuroneko-hd4.js");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const dispatcher = read("api/tool-health.js");
const localServer = read("serve-local.js");
const manifest = JSON.parse(read("assets/module-manifest.json"));
const routes = JSON.parse(read("route-manifest.json"));
const vercel = JSON.parse(read("vercel.json"));

assert.equal(hd4.UPSTREAM_URL, "https://sylvatica.my.id/api/tools/hd4");
assert.deepEqual([...hd4.ALLOWED_QUERY], ["_service", "url"]);
assert.deepEqual(manifest.modules["hd4-enhancer"], { css: ["assets/css/features/hd4-enhancer.css"], js: ["assets/js/features/hd4-enhancer.js"] });
assert.equal(manifest.tools.enhancer, "hd4-enhancer");
assert.ok(routes.apiRoutes.includes("/api/tools/hd4"));
assert.ok(vercel.rewrites.some((entry) => entry.source === "/api/tools/hd4" && entry.destination === "/api/tool-health?_service=hd4-enhancer"));
assert.match(dispatcher, /handleHD4/);
assert.match(dispatcher, /hd4-enhancer/);
assert.match(localServer, /"\/api\/tools\/hd4".+service: "hd4-enhancer"/);
assert.match(app, /case 'enhancer': renderHd4Enhancer\(body\); break;/);
assert.doesNotMatch(app, /function renderEnhancer\s*\(/);
assert.match(shell, /enhancer:\s+\{renderer:'renderHd4Enhancer'/);
assert.match(lazy, /hd4-enhancer-v2/);
assert.equal(getTool("enhancer").runtime.module, "hd4-enhancer");
assert.equal(getTool("enhancer").runtime.handler, "renderHd4Enhancer");
assert.equal(getTool("enhancer").runtime.mode, "api");
assert.equal(getTool("enhancer").name, "Nexora Image HD Enhancer V4");
assert.equal((read(".env.example").match(/^KURONEKO_API_KEY=$/gm) || []).length, 1);
assert.equal(fs.existsSync(path.join(root, "database/migrations/033_hd4.sql")), false);

assert.match(frontend, /window\.renderHd4Enhancer\s*=/);
assert.match(frontend, /new AbortController\(\)/);
assert.match(frontend, /new URLSearchParams\(\{ url: inputUrl \}\)/);
assert.match(frontend, /if \(sessionState\.loading\) return/);
assert.match(frontend, /body\.__nxCleanup/);
assert.match(frontend, /id="nxhd4File"/);
assert.match(frontend, /Pilih Gambar/);
assert.match(frontend, /prepareUpload/);
assert.match(frontend, /MAX_IMAGE_EDGE = 1600/);
assert.match(frontend, /method: useUpload \? "POST" : "GET"/);
assert.match(frontend, /JSON\.stringify\(\{ imageData: sessionState\.fileData \}\)/);
assert.match(frontend, /loading = "lazy"/);
assert.match(frontend, /decoding = "async"/);
assert.match(frontend, /Download/);
assert.match(frontend, /Open Image/);
assert.match(frontend, /Copy Link/);
assert.doesNotMatch(frontend, /sylvatica\.my\.id|KURONEKO_API_KEY|apikey|supabase|localStorage|sessionStorage|setInterval/i);
assert.doesNotMatch(backend, /require\(["']\.\/database|supabase|fetch\(inputUrl\)|fetch\(userUrl\)|setInterval/i);
assert.match(backend, /new URLSearchParams\(\{ url: inputUrl, apikey: apiKey \}\)/);
assert.match(backend, /decodeHD4Upload/);
assert.match(backend, /uploadTemporaryImage/);
assert.match(backend, /request\.method === "POST"/);
assert.match(backend, /redirect: "manual"/);
assert.match(css, /overflow-x:clip/);
assert.match(css, /max-width:100%/);
assert.match(css, /object-fit:contain/);
assert.match(css, /\.nxhd4-input-row\{[^}]*grid-template-columns:minmax\(0,1fr\) 72px/);
assert.match(css, /\.nxhd4-actions\{[^}]*grid-template-columns:1fr/);
assert.doesNotMatch(css, /@media[^{]*max-width/i);

assert.deepEqual(hd4.normalizeHD4Response({ status: true, result: { image_url: "https://cdn.example.com/enhanced.png" } }), { imageUrl: "https://cdn.example.com/enhanced.png" });
assert.deepEqual(hd4.normalizeHD4Response({ data: { output: "https://cdn.example.com/upscaled.webp" } }), { imageUrl: "https://cdn.example.com/upscaled.webp" });
assert.deepEqual(hd4.normalizeHD4Response("https://cdn.example.com/direct.jpg"), { imageUrl: "https://cdn.example.com/direct.jpg" });
assert.equal(hd4.normalizeHD4Response({ result: { image_url: "https://127.0.0.1/private.png" } }).imageUrl, null);
assert.equal(hd4.normalizeHD4Response({ result: { image_url: "https://cdn.example.com/result.png?apikey=secret-value" } }, "secret-value").imageUrl, null);
assert.doesNotMatch(JSON.stringify(hd4.responseShape({ "test_key_not_a_real_secret": "value" }, "test_key_not_a_real_secret")), /test_key_not_a_real_secret/);
for (const invalid of ["", "notaurl", "ftp://example.com/a.jpg", "http://127.0.0.1/a.jpg", "http://localhost/a.jpg", "https://user:pass@example.com/a.jpg"]) {
  assert.throws(() => hd4.normalizeInputUrl(invalid));
}

const oldKey = process.env.KURONEKO_API_KEY;

(async () => {
  hd4.resetHD4State();
  delete process.env.KURONEKO_API_KEY;
  const missingKey = await invoke({ url: "https://cdn.example.com/input.jpg" }, async () => upstreamResponse({}));
  assert.equal(missingKey.statusCode, 503);
  assert.equal(missingKey.payload.error, "HD4_CONFIGURATION_ERROR");

  process.env.KURONEKO_API_KEY = "test_key_not_a_real_secret";
  let upstreamUrl = null;
  const jsonSuccess = await invoke({ url: "https://cdn.example.com/input.jpg" }, async (url) => {
    upstreamUrl = new URL(url);
    return upstreamResponse({ status: true, result: { image_url: "https://cdn.example.com/enhanced.jpg" } }, 200, { "content-type": "application/json" });
  });
  assert.equal(jsonSuccess.statusCode, 200);
  assert.equal(jsonSuccess.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(upstreamUrl.origin + upstreamUrl.pathname, hd4.UPSTREAM_URL);
  assert.equal(upstreamUrl.searchParams.get("url"), "https://cdn.example.com/input.jpg");
  assert.equal(upstreamUrl.searchParams.get("apikey"), "test_key_not_a_real_secret");
  assert.equal(jsonSuccess.payload.data.imageUrl, "https://cdn.example.com/enhanced.jpg");
  assert.doesNotMatch(JSON.stringify(jsonSuccess.payload), /test_key_not_a_real_secret|sylvatica\.my\.id/);

  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const directImage = await invoke({ url: "https://cdn.example.com/input.png" }, async () => upstreamResponse(pngBytes, 200, { "content-type": "image/png", "content-length": String(pngBytes.length) }));
  assert.equal(directImage.statusCode, 200);
  assert.equal(directImage.headers["Content-Type"], "image/png");
  assert.deepEqual(directImage.body, pngBytes);

  const redirect = await invoke({ url: "https://cdn.example.com/redirect.jpg" }, async () => upstreamResponse("", 302, { location: "https://cdn.example.com/final.jpg" }));
  assert.equal(redirect.statusCode, 200);
  assert.equal(redirect.payload.data.imageUrl, "https://cdn.example.com/final.jpg");
  const textUrl = await invoke({ url: "https://cdn.example.com/text.jpg" }, async () => upstreamResponse("https://cdn.example.com/text-result.jpg", 200, { "content-type": "text/plain" }));
  assert.equal(textUrl.statusCode, 200);
  assert.equal(textUrl.payload.data.imageUrl, "https://cdn.example.com/text-result.jpg");

  const injected = await invoke(new URLSearchParams({ url: "https://cdn.example.com/a.jpg", apikey: "browser-key" }), async () => upstreamResponse({}));
  assert.equal(injected.statusCode, 400);
  assert.equal(injected.payload.error, "UNSUPPORTED_PARAMETER");
  const invalidInput = await invoke({ url: "javascript:alert(1)" }, async () => upstreamResponse({}));
  assert.equal(invalidInput.statusCode, 400);
  const privateInput = await invoke({ url: "http://169.254.169.254/latest/meta-data" }, async () => upstreamResponse({}));
  assert.equal(privateInput.statusCode, 400);

  const unauthorized = await invoke({ url: "https://cdn.example.com/unauthorized.jpg" }, async () => upstreamResponse({ creator: "provider", message: "API Key invalid test_key_not_a_real_secret", status: false }, 401, { "content-type": "application/json" }));
  assert.equal(unauthorized.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(unauthorized.payload), /test_key_not_a_real_secret|API Key invalid|provider/);
  const limited = await invoke({ url: "https://cdn.example.com/limited.jpg" }, async () => upstreamResponse({ status: false, message: "rate limit" }, 429, { "content-type": "application/json" }));
  assert.equal(limited.statusCode, 429);
  const serverError = await invoke({ url: "https://cdn.example.com/server.jpg" }, async () => upstreamResponse({ status: false, message: "stack \/srv\/app.js" }, 500, { "content-type": "application/json" }));
  assert.equal(serverError.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(serverError.payload), /srv|stack/);
  const invalidJson = await invoke({ url: "https://cdn.example.com/html.jpg" }, async () => upstreamResponse("<html>offline</html>", 200, { "content-type": "text/html" }));
  assert.equal(invalidJson.statusCode, 502);
  assert.equal(invalidJson.payload.error, "HD4_INVALID_RESPONSE");
  const emptyResult = await invoke({ url: "https://cdn.example.com/empty.jpg" }, async () => upstreamResponse({ status: true, result: {} }, 200, { "content-type": "application/json" }));
  assert.equal(emptyResult.statusCode, 422);

  const timeout = await invoke({ url: "https://cdn.example.com/slow.jpg" }, (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }), "GET", { timeoutMs: 5 });
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.payload.error, "HD4_TIMEOUT");

  hd4.resetHD4State();
  let stagedUrl = "";
  const uploadResult = await invoke({}, async (url) => {
    if (String(url).includes("litterbox.catbox.moe")) {
      return {
        ok: true,
        status: 200,
        headers: { get() { return null; } },
        text: async () => "https://litter.catbox.moe/temporary-hd4.jpg"
      };
    }
    stagedUrl = new URL(url).searchParams.get("url") || "";
    return upstreamResponse({ result: { image_url: "https://cdn.example.com/upload-enhanced.jpg" } }, 200, { "content-type": "application/json" });
  }, "POST", {}, { imageData: "data:image/jpeg;base64,/9j/" });
  assert.equal(uploadResult.statusCode, 200);
  assert.equal(stagedUrl, "https://litter.catbox.moe/temporary-hd4.jpg");
  assert.equal(uploadResult.payload.data.imageUrl, "https://cdn.example.com/upload-enhanced.jpg");
  assert.doesNotMatch(JSON.stringify(uploadResult.payload), /litter|temporary-hd4|test_key_not_a_real_secret/);

  const fakeUpload = await invoke({}, async () => upstreamResponse({}), "POST", {}, { imageData: "data:image/jpeg;base64,ZmFrZQ==" });
  assert.equal(fakeUpload.statusCode, 415);
  assert.equal(fakeUpload.payload.error, "HD4_UPLOAD_INVALID");
  const injectedUpload = await invoke({ url: "https://cdn.example.com/injected.jpg" }, async () => upstreamResponse({}), "POST", {}, { imageData: "data:image/jpeg;base64,/9j/" });
  assert.equal(injectedUpload.statusCode, 400);

  hd4.resetHD4State();
  let calls = 0;
  const sharedFetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return upstreamResponse({ result: { image_url: "https://cdn.example.com/shared.jpg" } }, 200, { "content-type": "application/json" });
  };
  const same = { url: "https://cdn.example.com/same.jpg" };
  const [first, second] = await Promise.all([invoke(same, sharedFetch), invoke(same, sharedFetch)]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 1, "Double tap harus berbagi satu request upstream");

  const put = await invoke({ url: "https://cdn.example.com/a.webp" }, async () => upstreamResponse({}), "PUT");
  assert.equal(put.statusCode, 405);

  console.log("Nexora Image HD Enhancer V4 lulus: URL, JPG/PNG/WebP, JSON/direct image/redirect, normalizer, timeout, dedup, download, mobile, keamanan, dan routing tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (oldKey === undefined) delete process.env.KURONEKO_API_KEY; else process.env.KURONEKO_API_KEY = oldKey;
});

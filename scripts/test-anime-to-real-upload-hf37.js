"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const anime = require(path.join(root, "lib/kuroneko-anime-to-real.js"));

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

let requestNumber = 20;
async function invoke(body, fetchImpl, runtime = {}, query = "") {
  requestNumber += 1;
  const response = mockResponse();
  const suffix = query ? `&${query}` : "";
  const url = new URL(`https://nexora.test/api/ai/anime-to-real?_service=anime-to-real${suffix}`);
  await anime.handleAnimeToReal({
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${requestNumber}` },
    body
  }, response, url, { fetch: fetchImpl, ...runtime });
  return response;
}

const frontend = read("assets/js/features/anime-to-real.js");
const backend = read("lib/kuroneko-anime-to-real.js");
const css = read("assets/css/features/anime-to-real.css");
const lazy = read("assets/js/core/lazy-loader.js");
const localServer = read("serve-local.js");
const readme = read("README.md");

assert.equal(anime.TEMP_UPLOAD_URL, "https://litterbox.catbox.moe/resources/internals/api.php");
assert.match(frontend, /id="natrFile"[^>]+type="file"[^>]+accept="image\/jpeg,image\/png,image\/webp/);
assert.match(frontend, /Pilih Gambar/);
assert.match(frontend, /Image URL/);
assert.match(frontend, /prepareUpload\(file\)/);
assert.match(frontend, /MAX_IMAGE_EDGE = 1600/);
assert.match(frontend, /new URLSearchParams\(\{ url: value \}\)/);
assert.match(frontend, /JSON\.stringify\(\{ imageData: sessionState\.fileData \}\)/);
assert.match(frontend, /method: usingFile \? "POST" : "GET"/);
assert.match(frontend, /URL\.createObjectURL\(file\)/);
assert.match(frontend, /URL\.revokeObjectURL\(objectUrl\)/);
assert.match(frontend, /FileReader/);
assert.doesNotMatch(frontend, /litterbox|catbox|sylvatica|KURONEKO_API_KEY|supabase|localStorage|sessionStorage/i);
assert.match(css, /grid-template-columns:auto minmax\(0,1fr\) auto/);
assert.match(css, /min-height:48px/);
assert.doesNotMatch(css, /@media|overflow-x\s*:\s*(?:auto|scroll)|position\s*:\s*fixed/i);
assert.match(lazy, /anime-to-real-hf37/);
assert.match(localServer, /anime-to-real[^\n]+return 3_600_000/);
assert.match(readme, /Pilih Gambar/);
assert.match(readme, /maksimal satu jam/);
assert.doesNotMatch(backend, /supabase|require\(["']\.\/database|fetch\(inputUrl\)|fetch\(userUrl\)/i);
assert.equal(fs.existsSync(path.join(root, "database/migrations/032_anime_to_real_upload.sql")), false);

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const imageData = `data:image/png;base64,${png.toString("base64")}`;
assert.deepEqual(anime.decodeUploadImage({ imageData }), { buffer: png, mime: "image/png" });
assert.throws(() => anime.decodeUploadImage({ imageData, apikey: "browser-key" }), (error) => error.code === "ANIME_REAL_UPLOAD_INVALID");
assert.throws(() => anime.decodeUploadImage({ imageData: imageData.replace("image/png", "image/jpeg") }), (error) => error.code === "ANIME_REAL_UPLOAD_INVALID");
assert.throws(() => anime.decodeUploadImage({ imageData: "data:image/gif;base64,R0lGODlh" }), (error) => error.code === "ANIME_REAL_UPLOAD_INVALID");
assert.throws(() => anime.decodeUploadImage({ imageData: `data:image/png;base64,${"A".repeat(3_400_001)}` }), (error) => error.code === "ANIME_REAL_UPLOAD_TOO_LARGE");

const oldKey = process.env.KURONEKO_API_KEY;

(async () => {
  process.env.KURONEKO_API_KEY = "test_key_not_a_real_secret";
  anime.resetAnimeToRealState();
  const calls = [];
  const success = await invoke({ imageData }, async (target, options) => {
    calls.push({ target: String(target), options });
    if (String(target) === anime.TEMP_UPLOAD_URL) return responsePayload("https://litter.catbox.moe/nexora-test.png");
    return responsePayload({ status: true, result: { output_url: "https://cdn.example.com/real-result.jpg" } });
  });
  assert.equal(success.statusCode, 200);
  assert.equal(success.payload.data.imageUrl, "https://cdn.example.com/real-result.jpg");
  assert.equal(success.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].target, anime.TEMP_UPLOAD_URL);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body.get("reqtype"), "fileupload");
  assert.equal(calls[0].options.body.get("time"), "1h");
  assert.ok(calls[0].options.body.get("fileToUpload") instanceof Blob);
  assert.doesNotMatch(calls[0].target, /test_key_not_a_real_secret/);
  const upstream = new URL(calls[1].target);
  assert.equal(upstream.origin + upstream.pathname, anime.UPSTREAM_URL);
  assert.equal(upstream.searchParams.get("url"), "https://litter.catbox.moe/nexora-test.png");
  assert.equal(upstream.searchParams.get("apikey"), "test_key_not_a_real_secret");
  assert.doesNotMatch(JSON.stringify(success.payload), /test_key_not_a_real_secret|litter\.catbox\.moe|sylvatica/);

  const injected = await invoke({ imageData }, async () => responsePayload({}), {}, "url=https%3A%2F%2Fexample.com%2Fa.png");
  assert.equal(injected.statusCode, 400);
  assert.equal(injected.payload.error, "UNSUPPORTED_PARAMETER");

  const wrongTypeResponse = mockResponse();
  await anime.handleAnimeToReal({ method: "POST", headers: { "content-type": "text/plain", "x-forwarded-for": "203.0.113.240" }, body: { imageData } }, wrongTypeResponse, new URL("https://nexora.test/api/ai/anime-to-real?_service=anime-to-real"), { fetch: async () => responsePayload({}) });
  assert.equal(wrongTypeResponse.statusCode, 415);

  anime.resetAnimeToRealState();
  const failedUpload = await invoke({ imageData }, async () => responsePayload("upload failed", 500));
  assert.equal(failedUpload.statusCode, 502);
  assert.equal(failedUpload.payload.error, "ANIME_REAL_UPLOAD_FAILED");
  assert.doesNotMatch(JSON.stringify(failedUpload.payload), /upload failed|catbox/);

  anime.resetAnimeToRealState();
  const uploadTimeout = await invoke({ imageData }, (_target, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }), { uploadTimeoutMs: 5 });
  assert.equal(uploadTimeout.statusCode, 504);
  assert.equal(uploadTimeout.payload.error, "ANIME_REAL_UPLOAD_TIMEOUT");

  anime.resetAnimeToRealState();
  let dedupCalls = 0;
  const dedupFetch = async (target) => {
    dedupCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (String(target) === anime.TEMP_UPLOAD_URL) return responsePayload("https://litter.catbox.moe/shared-test.png");
    return responsePayload({ status: true, data: { image_url: "https://cdn.example.com/shared-result.jpg" } });
  };
  const [first, second] = await Promise.all([invoke({ imageData }, dedupFetch), invoke({ imageData }, dedupFetch)]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(dedupCalls, 2, "dua upload identik aktif harus berbagi satu pipeline upload + AI");

  console.log("Anime to Real HF37 lulus: input URL tetap aktif, galeri Android, temporary upload satu jam, magic-byte, dedup, timeout, privacy, mobile UI, dan tanpa Supabase tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (oldKey === undefined) delete process.env.KURONEKO_API_KEY; else process.env.KURONEKO_API_KEY = oldKey;
});

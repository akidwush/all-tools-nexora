"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const aiSong = require(path.join(root, "lib/kuroneko-ai-song.js"));
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
async function invoke(params, fetchImpl, method = "GET", runtime = {}) {
  requestNumber += 1;
  const response = mockResponse();
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const url = new URL("https://nexora.test/api/ai/song?_service=ai-song&" + query.toString());
  await aiSong.handleAiSong(
    { method, headers: { "x-forwarded-for": "198.51.100." + requestNumber } },
    response,
    url,
    { fetch: fetchImpl, ...runtime }
  );
  return response;
}

const frontend = read("assets/js/features/ai-song.js");
const css = read("assets/css/features/ai-song.css");
const backend = read("lib/kuroneko-ai-song.js");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const dispatcher = read("api/tool-health.js");
const localServer = read("serve-local.js");
const schema = read("database/schema.sql");
const manifest = JSON.parse(read("assets/module-manifest.json"));
const routes = JSON.parse(read("route-manifest.json"));
const vercel = JSON.parse(read("vercel.json"));

assert.equal(aiSong.UPSTREAM_URL, "https://sylvatica.my.id/api/ai/aisong");
assert.deepEqual([...aiSong.ALLOWED_QUERY], ["_service", "prompt", "title", "tags"]);
assert.deepEqual(manifest.modules["ai-song"], { css: ["assets/css/features/ai-song.css"], js: ["assets/js/features/ai-song.js"] });
assert.equal(manifest.tools.aisong, "ai-song");
assert.ok(routes.apiRoutes.includes("/api/ai/song"));
assert.ok(vercel.rewrites.some((entry) => entry.source === "/api/ai/song" && entry.destination === "/api/tool-health?_service=ai-song"));
assert.match(dispatcher, /handleAiSong/);
assert.match(dispatcher, /_service[^\n]+ai-song/);
assert.match(localServer, /"\/api\/ai\/song"[^\n]+service: "ai-song"/);
assert.match(app, /case 'aisong': renderAiSong\(body\); break;/);
assert.match(shell, /aisong:\{renderer:'renderAiSong'/);
assert.match(lazy, /ai-song-v1/);
assert.deepEqual(getTool("aisong").runtime, {
  mode: "api", module: "ai-song", handler: "renderAiSong",
  dependency: "https://all-tools-nexora.vercel.app/api/ai/song"
});
assert.equal(getTool("aisong").name, "Nexora AI Song Generator");
assert.equal(getTool("aisong").health.path, "/assets/js/features/ai-song.js");
assert.doesNotMatch(schema, /'aisong', 'Nexora AI Song Generator'/);
assert.equal((read(".env.example").match(/^KURONEKO_API_KEY=$/gm) || []).length, 1);
assert.equal(fs.existsSync(path.join(root, "database/migrations/032_ai_song.sql")), false, "AI Song tidak boleh menambah migration database");
assert.match(read("scripts/check-project.js"), /databaseOptionalIds = new Set\(\["aisong", "aivideo"\]\)/);

assert.match(frontend, /window\.renderAiSong\s*=/);
assert.match(frontend, /new AbortController\(\)/);
assert.match(frontend, /new URLSearchParams\(\{ prompt: input\.prompt, title: input\.title, tags: input\.tags \}\)/);
assert.match(frontend, /if \(sessionState\.loading\) return/);
assert.match(frontend, /body\.__nxCleanup/);
assert.match(frontend, /audio\.pause\(\)/);
assert.match(frontend, /controls preload="metadata"/);
assert.match(frontend, /Download Song/);
assert.match(frontend, /Copy Link/);
assert.doesNotMatch(frontend, /sylvatica\.my\.id|KURONEKO_API_KEY|apikey|supabase|localStorage|sessionStorage|setInterval|autoplay/i);
assert.doesNotMatch(backend, /require\(["']\.\/database|supabase|fetch\(prompt\)|setInterval/i);
assert.doesNotMatch(css, /@media[^\{]*(?:min-width|max-width|hover\s*:|pointer\s*:)/i);
assert.match(css, /width:min\(100%,900px\)/);
assert.match(css, /max-width:100%/);
assert.match(css, /grid-template-columns:1fr/);
assert.match(css, /overflow-wrap:anywhere/);
assert.match(css, /min-height:52px/);

assert.deepEqual(aiSong.normalizeAISongResponse({
  status: "success",
  result: {
    title: "Waiting For You",
    audio_url: "https://cdn.example.com/waiting.mp3",
    cover_url: "https://cdn.example.com/waiting.jpg",
    duration: 204,
    lyrics: "Waiting here"
  }
}), {
  title: "Waiting For You",
  audioUrl: "https://cdn.example.com/waiting.mp3",
  coverUrl: "https://cdn.example.com/waiting.jpg",
  duration: "204",
  lyrics: "Waiting here",
  status: "success"
});
assert.deepEqual(aiSong.normalizeAISongResponse({ result: "https://cdn.example.com/direct.mp3" }), {
  title: null,
  audioUrl: "https://cdn.example.com/direct.mp3",
  coverUrl: null,
  duration: null,
  lyrics: null,
  status: null
});
assert.equal(aiSong.normalizeAISongResponse({ result: { audio_url: "http://unsafe.example.com/song.mp3" } }).audioUrl, null);
assert.equal(aiSong.normalizeAISongResponse({ result: { audio_url: "https://cdn.example.com/song.mp3?apikey=server-secret" } }, "server-secret").audioUrl, null);
assert.doesNotMatch(JSON.stringify(aiSong.responseShape({ result: { "test_key_not_a_real_secret": "value" } }, "test_key_not_a_real_secret")), /test_key_not_a_real_secret/);

const oldKey = process.env.KURONEKO_API_KEY;

(async () => {
  aiSong.resetAiSongState();
  delete process.env.KURONEKO_API_KEY;
  const missingKey = await invoke({ prompt: "Lagu pop emosional", title: "", tags: "" }, async () => responsePayload({}));
  assert.equal(missingKey.statusCode, 503);
  assert.equal(missingKey.payload.error, "AI_SONG_CONFIGURATION_ERROR");

  process.env.KURONEKO_API_KEY = "test_key_not_a_real_secret";
  let upstreamUrl = null;
  const success = await invoke({ prompt: "Lagu tentang seseorang yang menunggu", title: "Waiting For You", tags: "Pop, Emotional, Piano" }, async (url) => {
    upstreamUrl = new URL(url);
    return responsePayload({ status: "success", result: { title: "Waiting For You", audio_url: "https://cdn.example.com/song.mp3", cover_url: "https://cdn.example.com/cover.jpg", duration: "03:24", lyrics: "Still waiting" } });
  });
  assert.equal(success.statusCode, 200);
  assert.equal(success.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(upstreamUrl.origin + upstreamUrl.pathname, aiSong.UPSTREAM_URL);
  assert.equal(upstreamUrl.searchParams.get("prompt"), "Lagu tentang seseorang yang menunggu");
  assert.equal(upstreamUrl.searchParams.get("title"), "Waiting For You");
  assert.equal(upstreamUrl.searchParams.get("tags"), "Pop, Emotional, Piano");
  assert.equal(upstreamUrl.searchParams.get("apikey"), "test_key_not_a_real_secret");
  assert.equal(success.payload.data.audioUrl, "https://cdn.example.com/song.mp3");
  assert.doesNotMatch(JSON.stringify(success.payload), /test_key_not_a_real_secret|sylvatica\.my\.id/);

  const blankOptional = await invoke({ prompt: "Instrumental piano tenang", title: "", tags: "" }, async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("title"), "");
    assert.equal(parsed.searchParams.get("tags"), "");
    return responsePayload({ result: { audio: "https://cdn.example.com/piano.mp3" } });
  });
  assert.equal(blankOptional.statusCode, 200);

  const emptyPrompt = await invoke({ prompt: "", title: "Optional", tags: "Pop" }, async () => responsePayload({}));
  assert.equal(emptyPrompt.statusCode, 400);
  assert.equal(emptyPrompt.payload.error, "AI_SONG_PROMPT_REQUIRED");
  const longPrompt = await invoke({ prompt: "a".repeat(aiSong.MAX_PROMPT_LENGTH + 1), title: "", tags: "" }, async () => responsePayload({}));
  assert.equal(longPrompt.statusCode, 400);
  assert.equal(longPrompt.payload.error, "AI_SONG_PROMPT_TOO_LONG");
  const injected = await invoke(new URLSearchParams({ prompt: "valid prompt", apikey: "browser-key" }), async () => responsePayload({}));
  assert.equal(injected.statusCode, 400);
  assert.equal(injected.payload.error, "UNSUPPORTED_PARAMETER");

  const unauthorized = await invoke({ prompt: "unauthorized song" }, async () => responsePayload({ creator: "provider", message: "API Key invalid test_key_not_a_real_secret", status: false }, 401));
  assert.equal(unauthorized.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(unauthorized.payload), /test_key_not_a_real_secret|API Key invalid|provider/);
  const rejected = await invoke({ prompt: "rejected song" }, async () => responsePayload({ status: false, message: "invalid prompt details" }, 400));
  assert.equal(rejected.statusCode, 400);
  const providerGenerationError = await invoke({ prompt: "provider generation error" }, async () => responsePayload({ status: false, message: "Failed to generate song" }, 400));
  assert.equal(providerGenerationError.statusCode, 503);
  assert.equal(providerGenerationError.payload.error, "AI_SONG_UPSTREAM_ERROR");
  assert.equal(providerGenerationError.payload.message, "Server AI Song sedang tidak tersedia. Coba lagi nanti.");
  const limited = await invoke({ prompt: "limited song" }, async () => responsePayload({ status: false, message: "rate limit" }, 429));
  assert.equal(limited.statusCode, 429);
  const serverError = await invoke({ prompt: "server error song" }, async () => responsePayload({ status: false, message: "stack /srv/app.js" }, 500));
  assert.equal(serverError.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(serverError.payload), /srv|stack/);
  const invalidJson = await invoke({ prompt: "invalid json song" }, async () => responsePayload("<html>offline</html>"));
  assert.equal(invalidJson.statusCode, 502);
  assert.equal(invalidJson.payload.error, "AI_SONG_INVALID_RESPONSE");
  const emptyResult = await invoke({ prompt: "empty result song" }, async () => responsePayload({ status: true, result: { title: "No audio" } }));
  assert.equal(emptyResult.statusCode, 422);
  assert.equal(emptyResult.payload.error, "AI_SONG_EMPTY_RESULT");
  const networkError = await invoke({ prompt: "network error song" }, async () => { throw new Error("ECONNREFUSED internal-host"); });
  assert.equal(networkError.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(networkError.payload), /ECONNREFUSED|internal-host/);

  const timeout = await invoke({ prompt: "slow song" }, (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }), "GET", { timeoutMs: 5 });
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.payload.error, "AI_SONG_TIMEOUT");

  aiSong.resetAiSongState();
  let calls = 0;
  const dedupFetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return responsePayload({ result: { audio_url: "https://cdn.example.com/shared.mp3" } });
  };
  const sameInput = { prompt: "same generation request", title: "Same", tags: "Pop" };
  const [first, second] = await Promise.all([invoke(sameInput, dedupFetch), invoke(sameInput, dedupFetch)]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 1, "Double tap dengan input identik harus berbagi satu request upstream");

  const post = await invoke({ prompt: "valid prompt" }, async () => responsePayload({}), "POST");
  assert.equal(post.statusCode, 405);

  console.log("Nexora AI Song Generator lulus: 20 skenario input, proxy server-only, normalizer, audio, mobile, timeout, dedup, error aman, dan routing tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (oldKey === undefined) delete process.env.KURONEKO_API_KEY; else process.env.KURONEKO_API_KEY = oldKey;
});

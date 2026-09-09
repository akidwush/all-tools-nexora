"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const multi = require("../lib/kuroneko-multiai");
const { getTool } = require("./config-test-helpers");

assert.equal(multi.PUBLIC_PROVIDER_IDS.length, 27);
assert.equal(new Set(multi.PUBLIC_PROVIDER_IDS).size, 27);
assert.equal(multi.PUBLIC_PROVIDER_IDS.includes("deepseek"), true);
assert.equal(multi.PROVIDERS.deepseek.path, "/api/ai/deepsek");
assert.equal(multi.PROVIDERS.toonmix.method, "POST");
assert.equal(Object.values(multi.PROVIDERS).filter((item) => item.multiChat).length, 14);
assert.equal(Object.values(multi.PROVIDERS).filter((item) => item.multiChat && item.defaultSelected).length, 12);
assert.deepEqual(multi.validateInput(multi.PROVIDERS.imagenai, { q: "cat", style: "anime" }), { q: "cat", style: "anime" });
assert.throws(() => multi.validateInput(multi.PROVIDERS.imagenai, { q: "cat", style: "invented" }), /INVALID_OPTION/);
assert.throws(() => multi.validateInput(multi.PROVIDERS.aifilter, { url: "http:\/\/127.0.0.1\/secret" }), /INVALID_URL/);
assert.throws(() => multi.validateInput(multi.PROVIDERS.chatgpt, { prompt: "hi", endpoint: "https:\/\/evil.invalid" }), /UNSUPPORTED_PARAMETER/);

const runtimeFiles = ["lib/kuroneko-multiai.js", "assets/js/features/multi-ai.js", "assets/js/admin/multi-ai.js"];
for (const file of runtimeFiles) assert.doesNotMatch(read(file), /claude|anthropic/i, `${file} contains an excluded provider`);
assert.doesNotMatch(read("assets/js/features/multi-ai.js") + read("assets/js/admin/multi-ai.js"), /sylvatica\.my\.id|KURONEKO_API_KEY|localStorage|sessionStorage/i);
assert.match(read("assets/js/features/multi-ai.js"), /Promise\.allSettled/);
assert.match(read("assets/js/features/multi-ai.js"), /new AbortController/);
assert.match(read("assets/js/features/multi-ai.js"), /Stop All/);
assert.match(read("assets/js/features/multi-ai.js"), /Compare/);
assert.match(read("assets/js/features/multi-ai.js"), /Copy All/);
const multiCss = read("assets/css/features/multi-ai.css");
assert.match(multiCss, /@media\(max-width:560px\)/);
assert.match(multiCss, /\.nx-mai-results,\.nx-mai-results\.is-compare\{display:grid;grid-template-columns:1fr/);
assert.match(multiCss, /\.nx-mai-lab-form\{grid-template-columns:1fr\}/);
for (const width of [360, 375, 390, 412]) assert.ok(width <= 560, `mobile branch rules cover ${width}px`);
assert.equal(getTool("multiai").runtime.module, "multi-ai");
assert.equal(getTool("multiai").runtime.dependency, "https://all-tools-nexora.vercel.app/api/ai/provider");
assert.match(read("vercel.json"), /"source": "\/api\/ai\/provider"/);
assert.match(read("lib/server-access-policy.js"), /"multiai"/);
assert.match(read("lib/api-abuse-shield.js"), /multiai: \{ burst: 16, free: 60, vvip: 300 \}/);
assert.equal((read(".env.example").match(/^KURONEKO_API_KEY=$/gm) || []).length, 1);

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get() { return null; } }, text: async () => JSON.stringify(payload) };
}

(async () => {
  let called;
  const chat = await multi.invokeProvider("deepseek", { q: "Hello" }, "", {
    apiKey: "test-secret-never-log",
    fetch: async (url, options) => { called = { url: new URL(url), options }; return response({ status: true, result: { answer: "Halo!" } }); }
  });
  assert.equal(called.url.origin, "https://sylvatica.my.id");
  assert.equal(called.url.pathname, "/api/ai/deepsek");
  assert.equal(called.url.searchParams.get("q"), "Hello");
  assert.equal(called.url.searchParams.has("apikey"), false);
  assert.equal(called.options.headers["X-API-Key"], "test-secret-never-log");
  assert.equal(chat.text, "Halo!");
  assert.equal(chat.ok, true);

  const image = multi.normalizeResponse(multi.PROVIDERS.aiart, { creator: "Dandy", status: true, data: { url: "https://cdn.example.com/result.jpg" } });
  assert.deepEqual(image.images, [{ url: "https://cdn.example.com/result.jpg" }]);
  assert.equal(image.kind, "image");
  const documented = multi.normalizeResponse(multi.PROVIDERS.chatgpt, { status: true, creator: "Dandy", result: { message: "Hi" } });
  assert.equal(documented.text, "Hi");
  console.log("Multi-AI passed: 27-provider registry, allowlist, normalizer, secret transport, UI/admin/routes, and 360/375/390/412px branch rules.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

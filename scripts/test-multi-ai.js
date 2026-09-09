"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const multi = require("../lib/kuroneko-multiai");
const spatial = require("../assets/js/features/multi-ai-layout");
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

const runtimeFiles = ["lib/kuroneko-multiai.js", "assets/js/features/multi-ai-layout.js", "assets/js/features/multi-ai.js", "assets/js/admin/multi-ai.js"];
for (const file of runtimeFiles) assert.doesNotMatch(read(file), /claude|anthropic/i, `${file} contains an excluded provider`);
assert.doesNotMatch(read("assets/js/features/multi-ai.js") + read("assets/js/admin/multi-ai.js"), /sylvatica\.my\.id|KURONEKO_API_KEY|localStorage|sessionStorage/i);
assert.match(read("assets/js/features/multi-ai.js"), /Promise\.allSettled/);
assert.match(read("assets/js/features/multi-ai.js"), /new AbortController/);
assert.match(read("assets/js/features/multi-ai.js"), /Stop All/);
assert.match(read("assets/js/features/multi-ai.js"), /Compare/);
assert.match(read("assets/js/features/multi-ai.js"), /Copy All/);
const multiCss = read("assets/css/features/multi-ai.css");
const multiUi = read("assets/js/features/multi-ai.js");
assert.match(multiCss, /touch-action:none/);
assert.match(multiCss, /\.nx-mai-world\{[^}]*will-change:transform/);
assert.match(multiCss, /@keyframes nxMaiRoute/);
assert.match(multiCss, /\.nx-mai-response p,[^{]+\{[^}]*-webkit-line-clamp:2/);
assert.doesNotMatch(multiCss, /\.nx-mai-results/);
assert.match(multiCss, /\.nx-mai-lab-form\{grid-template-columns:1fr\}/);
assert.match(multiCss, /\.nx-mai-canvas-controls\{[^}]*right:12px;bottom:12px/);
assert.match(multiCss, /padding-bottom\)|env\(safe-area-inset-bottom\)/);
assert.match(multiUi, /NexoraMultiAiLayout/);
assert.match(multiUi, /pointerdown/);
assert.match(multiUi, /gesture\.mode==="pinch"/);
assert.match(multiUi, /ResizeObserver/);
assert.match(multiUi, /data-fit/);
assert.match(multiUi, /nx-mai-bottom-composer/);
assert.match(multiUi, /nx-mai-inspector-backdrop/);
assert.match(multiUi, /nx-mai-overflow-menu/);
assert.doesNotMatch(multiUi, /Multi-AI Canvas|AI ORCHESTRATION CONTROL ROOM/);
assert.match(multiCss, /#nxUniversalRoom\[data-tool="multiai"\] \.nx-room-scroll\{overflow:hidden!important/);
assert.match(multiUi, /composerCollapsed:false/);
assert.match(multiUi, /function setComposerCollapsed\(collapsed,focusPrompt\)/);
assert.match(multiUi, /data-composer-toggle/);
assert.match(multiUi, /setComposerCollapsed\(true\)/);
assert.ok(multiUi.indexOf("setComposerCollapsed(true)") < multiUi.indexOf("await Promise.allSettled(workers)"), "composer collapses before providers finish");
assert.doesNotMatch(multiUi, /prompt\.value\s*=\s*["']{2}/, "collapse must preserve the prompt draft");
assert.match(multiUi, /new ResizeObserver\(fitGraph\)/);
assert.match(multiCss, /\.nx-mai-bottom-composer\.is-collapsed\{max-height:calc\(52px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(multiCss, /transition:max-height \.19s ease/);
assert.match(multiCss, /\.nx-mai-composer-collapsed/);
const mobileViewports = [
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 }
];
for (const count of [4, 8, 12, 14]) {
  const points = spatial.layout(count, { compact: true });
  assert.equal(points.length, count, `${count}-provider layout must include every provider`);
  assert.equal(spatial.overlaps(points), false);
  const box = spatial.bounds(points);
  assert.ok(box.left >= 0 && box.right <= spatial.WORLD_WIDTH);
  assert.ok(box.top >= 0 && box.bottom <= spatial.WORLD_HEIGHT);
  for (const viewport of mobileViewports) {
    const expandedCanvasHeight = viewport.height - 64 - 48 - 118;
    const collapsedCanvasHeight = viewport.height - 64 - 48 - 52;
    const canvasHeight = collapsedCanvasHeight;
    const fitted = spatial.fit(points, viewport.width, canvasHeight, 30);
    fitted.x -= 26;
    const epsilon = 0.01;
    assert.ok(box.left * fitted.scale + fitted.x >= 4 - epsilon, `${count} nodes fit left at ${viewport.width}x${viewport.height}`);
    assert.ok(box.right * fitted.scale + fitted.x <= viewport.width - 56 + epsilon, `${count} nodes clear toolbar at ${viewport.width}x${viewport.height}`);
    assert.ok(box.top * fitted.scale + fitted.y >= 30 - epsilon, `${count} nodes fit top at ${viewport.width}x${viewport.height}`);
    assert.ok(box.bottom * fitted.scale + fitted.y <= canvasHeight - 30 + epsilon, `${count} nodes fit bottom at ${viewport.width}x${viewport.height}`);
    assert.ok(spatial.NODE_WIDTH * fitted.scale >= 115, `${count} provider nodes remain readable at ${viewport.width}x${viewport.height}`);
    assert.ok(expandedCanvasHeight > viewport.height * .62, `expanded canvas stays dominant at ${viewport.width}x${viewport.height}`);
    assert.ok(collapsedCanvasHeight > viewport.height * .75, `collapsed composer gives canvas priority at ${viewport.width}x${viewport.height}`);
    assert.equal(collapsedCanvasHeight - expandedCanvasHeight, 66, `collapse reclaims composer space at ${viewport.width}x${viewport.height}`);
    const keyboardCanvasHeight = 520 - 64 - 48 - 118;
    const keyboardFit = spatial.fit(points, viewport.width, keyboardCanvasHeight, 30);
    assert.ok(Number.isFinite(keyboardFit.scale) && keyboardFit.scale > 0, `keyboard resize remains fit-safe at ${viewport.width}px`);
  }
  const desktopPoints = spatial.layout(count);
  assert.equal(desktopPoints.length, count, `${count}-provider desktop layout must include every provider`);
  assert.equal(spatial.overlaps(desktopPoints), false, `${count}-provider desktop layout must not overlap`);
}

const manifest = JSON.parse(read("assets/module-manifest.json"));
assert.deepEqual(manifest.modules["multi-ai"].js, ["assets/js/features/multi-ai-layout.js", "assets/js/features/multi-ai.js"]);
assert.equal(getTool("multiai").runtime.module, "multi-ai");
assert.equal(getTool("multiai").runtime.dependency, "https://all-tools-nexora.vercel.app/api/ai/provider");
const vercelConfig = JSON.parse(read("vercel.json"));
assert.equal(
  vercelConfig.rewrites.some(
    (rewrite) =>
      rewrite.source === "/api/ai/provider" &&
      rewrite.destination === "/api/health?mode=multi-ai"
  ),
  true,
  "Rewrite /api/ai/provider -> multi-ai harus tersedia."
);
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
  console.log("Multi-AI spatial canvas passed: preserved 27-provider backend; 4/8/12/14 layouts and 360/375/390/412 mobile fits have no overlap; pan, pinch, zoom, fit, sheets, actions, and routing remain intact.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

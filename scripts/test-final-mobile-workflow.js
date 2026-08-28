"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync(file, "utf8");

const pkg = JSON.parse(read("package.json"));
const vercel = JSON.parse(read("vercel.json"));
const html = read("index.html");
const core = read("assets/css/core.css");
const performance = read("assets/js/core/performance.js");
const reactor = read("assets/js/core/liquid-reactor.js");
const lazy = read("assets/js/core/lazy-loader.js");
const app = read("assets/js/core/app.js");
const account = read("assets/js/core/account.js");
const documentClient = read("assets/js/features/document-ai.js");
const documentCss = read("assets/css/features/document-ai.css");
const documentServer = read("lib/document-ai.js");
const promptClient = read("assets/js/features/prompt-generator.js");
const promptCss = read("assets/css/features/prompt-generator.css");
const healthApi = read("api/health.js");

assert.equal(pkg.version, "6.4.0");

const globalHeaders = vercel.headers.find((entry) => entry.source === "/(.*)")?.headers || [];
assert.ok(globalHeaders.some((header) => header.key === "Cache-Control" && header.value === "no-store, no-cache, must-revalidate, max-age=0"));
assert.equal(vercel.headers.filter((entry) => ["/assets/(.*)", "/api/(.*)"].includes(entry.source)).length, 0, "Cache header duplikat tidak boleh kembali.");
for (const source of [app, read("assets/js/core/social-links.js"), read("assets/js/core/tool-health.js")]) {
  assert.doesNotMatch(source, /nexora_country_cache|nexora_social_links_v63|nexora_tool_health_v42/);
}

assert.match(reactor, /unifiedOriginalUi:true/);
assert.match(reactor, /enabled:false,reason:"unified-original-ui"/);
assert.doesNotMatch(reactor + core, /setupCursorReactor|cursor-trail|touch-follower|pointermove|captureFlip|animateFlip/);
assert.match(performance, /heroMode="auto"/);
assert.doesNotMatch(performance, /if\(mobileLike\)\{if\(!video\.paused\)video\.pause\(\);return;\}/);
assert.match(html, /<video[^>]*autoplay/i);

for (const [client, css, id] of [
  [documentClient, documentCss, "ndaChoose"],
  [promptClient, promptCss, "nxPromptChoose"]
]) {
  assert.match(client, new RegExp(`id=["']${id}["'][^>]*type=["']button["']`));
  assert.match(client, /function openFilePicker\(\)/);
  assert.match(client, /fileInput\.click\(\)/);
  assert.match(css, /left:-10000px!important/);
  assert.doesNotMatch(client, new RegExp(`for=["']${id === "ndaChoose" ? "ndaFile" : "nxPromptFile"}["']`));
}

assert.match(app, /item\.id === 'documentai' \? 'free'/);
assert.doesNotMatch(account, /defaultRestrictedTools=new Map\(\[\["documentai"/);
assert.doesNotMatch(documentServer, /VVIP_REQUIRED|khusus member VVIP/);
assert.doesNotMatch(healthApi, /authorizeTool\(request, response, "documentai"\)/);

assert.match(lazy, /ASSET_PATCHES\.find/);
assert.doesNotMatch(lazy, /prompt-generator[\s\S]{0,500}\? ASSET_VERSION[\s\S]{0,500}\? ASSET_VERSION/, "Resolver versi bertumpuk tidak boleh kembali.");

console.log("Final mobile workflow lulus: no-store, UI Android universal, picker native, Doc AI FREE, dan lazy resolver bersih.");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const endpoints = require("../lib/provider-endpoints");
const registryModule = require("../lib/endpoint-maintenance-registry");
const utilities = require("../lib/external-endpoint-registry");
const { validateFallback } = require("../lib/admin-endpoint-maintenance");

const registry = registryModule.endpointRegistry();
const ids = [...registry.keys()];

for (const id of ["comic:mangadex","comic:shinigami","comic:voratoon","comic:ainzscans","comic:mangadotnet"]) assert.ok(registry.has(id), id);
for (const id of ["utility:aio","utility:danbooru","utility:animetoreal","utility:aisong","utility:hd4","utility:genmail"]) assert.ok(registry.has(id), id);
assert.ok(ids.some((id) => id === "ai:gpt5"));
assert.ok(ids.some((id) => id === "ai:deepseek"));
assert.ok(!ids.some((id) => /claude|sonnet/i.test(id)));
assert.ok(!ids.some((id) => /doujin|apkomik|softkomik|kiryuu/i.test(id)));
assert.ok(!ids.some((id) => /avatar|dicebear|kokoro|headtts|webllm|transformers/i.test(id)));
assert.ok(!ids.some((id) => id === "utility:pixiv"), "Pixiv tidak boleh diinvent jika adapter server aktif tidak ada");

const shinigami = registry.get("comic:shinigami");
assert.equal(endpoints.normalizeBaseUrl("https://api.shngm.io/v1/", shinigami), "https://api.shngm.io/v1/");
for (const value of [
  "http://api.shngm.io/v1/",
  "https://localhost/v1/",
  "https://127.0.0.1/v1/",
  "https://169.254.169.254/v1/",
  "https://10.0.0.2/v1/",
  "ftp://api.shngm.io/v1/",
  "file:///etc/passwd",
  "https://evil.example/v1/"
]) assert.throws(() => endpoints.normalizeBaseUrl(value, shinigami));

for (const value of ["https://evil.example/a","//evil.example/a","/api/../secret","/%2e%2e/secret","/a\\b"]) {
  assert.throws(() => endpoints.normalizeRelativePath(value));
}
assert.equal(endpoints.normalizeRelativePath("/api/ai/gpt5?health=1"), "/api/ai/gpt5?health=1");

const gpt5 = registry.get("ai:gpt5");
const qwen = registry.get("ai:qwen");
const aiStore = { schemaVersion:1, overrides:{}, history:[] };
assert.doesNotThrow(() => validateFallback(gpt5, { ...endpoints.defaultConfig(gpt5), fallbackProvider:qwen.id }, aiStore, registry));
assert.throws(() => validateFallback(gpt5, { ...endpoints.defaultConfig(gpt5), fallbackProvider:"ai:aiart" }, aiStore, registry));

const cycleStore = { schemaVersion:1, overrides:{ [qwen.id]: { fallbackProvider:gpt5.id } }, history:[] };
assert.throws(() => validateFallback(gpt5, { ...endpoints.defaultConfig(gpt5), fallbackProvider:qwen.id }, cycleStore, registry));

(async()=>{
  await assert.rejects(
    endpoints.testCandidate(shinigami, endpoints.defaultConfig(shinigami), {
      lookup: async () => [{ address:"127.0.0.1", family:4 }],
      probe: async () => ({ httpStatus:200 })
    })
  );

  const result = await endpoints.testCandidate(shinigami, endpoints.defaultConfig(shinigami), {
    lookup: async () => [{ address:"104.21.1.2", family:4 }],
    probe: async () => ({ httpStatus:200, latencyMs:12 })
  });
  assert.equal(result.status, "online");
  assert.equal(result.httpStatus, 200);

  const dashboardApi = read("api/admin/dashboard.js");
  const admin = read("lib/admin-endpoint-maintenance.js");
  const providerCore = read("lib/provider-endpoints.js");
  const adminUi = read("assets/js/admin/endpoint-maintenance.js");
  const html = read("admin/index.html");
  const docs = read("docs/ENDPOINT_MAINTENANCE.md");

  assert.match(dashboardApi, /mode"\) === "endpoint-maintenance"/);
  assert.match(admin, /requireAdmin\(request, response, \{ edit: true \}\)/);
  assert.match(admin, /verifyMutationRequest/);
  assert.match(admin, /recordAdminAudit/);
  assert.match(admin, /endpoint\.test_failed/);
  assert.match(admin, /endpoint\.rollback/);
  assert.match(admin, /endpoint\.reset_default/);
  assert.match(providerCore, /key: SETTING_KEY/);
  assert.match(providerCore, /is_public: false/);
  assert.match(providerCore, /assertPublicUrl/);
  assert.match(providerCore, /ENDPOINT_HOST_NOT_ALLOWED/);
  assert.doesNotMatch(providerCore, /eval\(|new Function/);
  assert.match(adminUi, /Test Candidate/);
  assert.match(adminUi, /Reset to Default/);
  assert.match(html, /COMIC SOURCES/);
  assert.match(html, /endpoint-maintenance\.js/);
  assert.match(docs, /CODE DEFAULT/);
  assert.match(docs, /KURONEKO_API_KEY/);
  assert.doesNotMatch(JSON.stringify(utilities.listUtilityEndpointDefinitions()), /apikey|secretValue/i);

  const beforeFunctions = fs.readdirSync(path.join(root,"api")).filter((name)=>name.endsWith(".js")).length +
    fs.readdirSync(path.join(root,"api","admin")).filter((name)=>name.endsWith(".js")).length;
  assert.equal(beforeFunctions, 12, "Vercel Function count harus tetap 12");

  console.log("Endpoint Maintenance PASS: known-provider registry, host allowlist, SSRF/DNS guard, candidate test, fallback compatibility/cycle guard, private config store, admin auth/CSRF/audit, 12/12 Functions.");
})().catch((error)=>{console.error(error);process.exit(1);});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const events = [];
const sandbox = {
  window: {},
  CustomEvent: function CustomEvent(name, init) { this.type = name; this.detail = init?.detail; },
  console
};
sandbox.window.dispatchEvent = (event) => events.push(event.type);
vm.runInNewContext(read("assets/js/core/tool-registry.js"), sandbox, { filename: "tool-registry.js" });
const registry = sandbox.window.NexoraToolRegistry;
assert.ok(registry, "Tool registry tidak terpasang");
assert.equal(registry.version, "6.3.5");
assert.equal(registry.count, 37);
assert.equal(registry.list().length, 37);
assert.equal(new Set(registry.list().map((item) => item.id)).size, 37);
assert.ok(events.includes("nexora:tool-registry-ready"));

const healthCatalog = require(path.join(root, "lib/tool-health.js")).TOOL_CATALOG;
assert.equal(healthCatalog.length, 37);
assert.deepEqual(new Set(healthCatalog.map((item) => item.id)), new Set(registry.list().map((item) => item.id)));

const seed = read("database/migrations/003_admin_dashboard.sql");
const seedIds = [...seed.matchAll(/\('([a-z0-9_-]+)',\s*'[^']+'/g)].map((match) => match[1]).filter((id) => registry.get(id));
assert.equal(new Set(seedIds).size, 37, "Seed database harus memuat seluruh 37 tools");

const moduleManifest = JSON.parse(read("assets/module-manifest.json"));
for (const tool of registry.list()) {
  assert.ok(tool.handler, `${tool.id}: handler kosong`);
  if (tool.module) {
    assert.ok(moduleManifest.modules[tool.module], `${tool.id}: modul ${tool.module} tidak terdaftar`);
    for (const asset of [...(moduleManifest.modules[tool.module].css || []), ...(moduleManifest.modules[tool.module].js || [])]) {
      assert.ok(fs.existsSync(path.join(root, asset)), `${tool.id}: aset modul hilang ${asset}`);
    }
  }
  if (tool.dependency) assert.match(tool.dependency, /^https:\/\//, `${tool.id}: dependency wajib HTTPS`);
}

const index = read("index.html");
for (const asset of ["assets/js/core/network.js", "assets/js/core/tool-registry.js", "assets/js/core/stability.js", "assets/js/core/lazy-loader.js"]) {
  assert.ok(index.includes(asset), `index belum memuat ${asset}`);
}
assert.ok(index.indexOf('src="assets/js/core/network.js"') < index.indexOf('src="assets/js/core/app.js"'));
assert.ok(index.indexOf("tool-registry.js") < index.indexOf("stability.js"));
assert.ok(index.indexOf("stability.js") < index.indexOf("lazy-loader.js"));

const loader = read("assets/js/core/lazy-loader.js");
assert.ok(loader.includes("Selalu kembali ke dispatcher"));
assert.ok(!loader.includes("current!==lazyShowTool"), "Lazy loader masih berisiko rekursi");

const admin = read("admin/index.html");
assert.ok(admin.includes('data-panel="functional"'));
assert.ok(admin.includes('id="adminMoreSheet"'));
const bottomNav = admin.match(/<nav class="admin-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";
assert.equal((bottomNav.match(/<button/g) || []).length, 5, "Bottom navigation mobile harus 5 tombol");
assert.ok(admin.includes("functional-audit.js"));

const adminCss = read("assets/css/admin.css");
assert.ok(adminCss.includes("NEXORA v6.2"));
assert.ok(adminCss.includes("repeat(5,minmax(0,1fr))"));
assert.ok(adminCss.includes("admin-more-sheet"));
const network = read("assets/js/core/network.js");
for (const token of ["NexoraFetch", "REQUEST_TIMEOUT", "nexora:network-error"]) assert.ok(network.includes(token));
const stability = read("assets/js/core/stability.js");
for (const token of ["NexoraStability", "functional-audit-complete", "applyCardStatus", "fetchJson", "loadHealth"]) assert.ok(stability.includes(token));

const serverless = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (full.endsWith(".js")) serverless.push(full);
  }
})(path.join(root, "api"));
assert.ok(serverless.length <= 12, `Serverless functions ${serverless.length}/12`);

console.log("Nexora v6.2 tests lulus: 37-tool registry, functional audit, stable lazy dispatch, health catalog lengkap, mobile nav 5 menu, dan Vercel Hobby valid.");

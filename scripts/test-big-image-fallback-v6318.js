"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const pkg = JSON.parse(read("package.json"));
const { classifyProviderError } = require("../lib/bigjpg-upscaler");

assert.equal(pkg.version, "6.3.18");
assert.equal(classifyProviderError({ status: "requires_vip" }), "plan");
assert.equal(classifyProviderError({ status: "upgrade_required" }), "plan");
assert.equal(classifyProviderError({ status: "quota_limit" }), "quota");

const backend = read("lib/bigjpg-upscaler.js");
for (const token of [
  'category === "plan" ? 402',
  'providerTaskAccess: "unverified"',
  "providerCapabilityVerified: false",
  "requires_vip"
]) assert.ok(backend.includes(token), `Backend Bigjpg kehilangan ${token}`);

const ui = read("assets/js/features/big-image.js");
for (const token of [
  "official Bigjpg task API only",
  "Official Bigjpg",
  "BIGJPG API READY",
  "BIGJPG OFFICIAL",
  "providerReady",
  "validateUpscaledResult",
  "BIGJPG_RESULT_NOT_UPSCALED"
]) assert.ok(ui.includes(token), `UI Bigjpg-only kehilangan ${token}`);
for (const pattern of [/Local AI/i, /LOCAL ESRGAN/, /LOCAL RESIZE/, /local-esrgan/, /local-resize/, /NexoraLocalEnhance/, /runLocalFallback/, /data-engine-mode/]) {
  assert.doesNotMatch(ui, pattern, `UI Bigjpg masih memuat fallback lokal ${pattern}`);
}
assert.doesNotMatch(ui, /BIGJPG_API_KEY/);

const apiFiles = [];
(function walk(directory){
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (target.endsWith(".js")) apiFiles.push(target);
  }
})(path.join(root, "api"));
assert.equal(apiFiles.length, 12);

console.log("Big Image Bigjpg-only lulus: hasil hanya dari task API resmi, fallback lokal dihapus, error provider tetap jujur, dan 12-function limit terjaga.");

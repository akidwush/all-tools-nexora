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
]) assert.ok(backend.includes(token), `Backend fallback kehilangan ${token}`);

const ui = read("assets/js/features/big-image.js");
for (const token of [
  "nexora-big-image-provider-v6318",
  "shouldFallbackLocally",
  "runLocalFallback",
  "window.NexoraLocalEnhance",
  "activateLocalMode",
  "activateAutoMode",
  'data-engine-mode=\'auto\'',
  'data-engine-mode=\'local\'',
  'button.dataset.scale!=="1"',
  "LOCAL ESRGAN 2×",
  "LOCAL ESRGAN",
  'engine:"local-esrgan"'
]) assert.ok(ui.includes(token), `UI fallback kehilangan ${token}`);
assert.doesNotMatch(ui, /BIGJPG READY/);
assert.doesNotMatch(ui, /BIGJPG_API_KEY/);

const css = read("assets/css/features/big-image.css");
assert.ok(css.includes(".nbi-engine.is-warning"));
assert.ok(css.includes("button.is-unavailable"));

const apiFiles = [];
(function walk(directory){
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (target.endsWith(".js")) apiFiles.push(target);
  }
})(path.join(root, "api"));
assert.equal(apiFiles.length, 12);

console.log("Big Image v6.3.18 fallback tests lulus: requires_vip tetap aman, Auto/Local AI aktif, scale lokal terkunci, dan 12-function limit terjaga.");

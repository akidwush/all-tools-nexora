"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const app = read("assets/js/core/app.js");
const index = read("index.html");
const prepare = read("scripts/prepare-ai-vendor.js");
const pkg = JSON.parse(read("package.json"));

for (const token of [
  "revision: '6318-hf2'",
  "tensorflowFallback",
  "upscalerFallback",
  "modelFallback",
  "nxLoadVendorWithFallback",
  "cache: 'no-store'",
  "vendorSource: nxEsrganVendorSource",
  "modelSource: nxEsrganModelSource",
]) assert.ok(app.includes(token), `Runtime Local ESRGAN kehilangan ${token}`);

assert.ok(index.includes("assets/js/core/app.js?v=6.3.18-hf2"), "cache key app.js belum hf2");
assert.equal(pkg.scripts.prebuild, "node scripts/prepare-ai-vendor.js", "prebuild vendor AI belum aktif");

for (const token of [
  "@tensorflow/tfjs@4.22.0/dist/tf.min.js",
  "upscaler@1.0.0/dist/browser/umd/upscaler.min.js",
  "@upscalerjs/esrgan-slim@1.0.0-beta.10/models/x2/model.json",
  "group1-shard1of1.bin",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "weightsManifest",
  "Node.js 18+",
]) assert.ok(prepare.includes(token), `Build vendor recovery kehilangan ${token}`);

console.log("Big Image hf2 lulus: vendor AI diprovisi saat Vercel prebuild dan runtime ESRGAN memakai cache-bust hf2.");

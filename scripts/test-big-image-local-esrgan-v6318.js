"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const app = read("assets/js/core/app.js");
const ui = read("assets/js/features/big-image.js");
const fetcher = read("scripts/fetch-ai-vendor.sh");
const vendorReadme = read("assets/vendor/README.md");

for (const token of [
  "/assets/vendor/tfjs/tf.min.js",
  "/assets/vendor/upscaler/upscaler.min.js",
  "/assets/vendor/esrgan-slim/x2/model.json",
  "nxEnsureLocalEsrgan",
  "window.tf.setBackend('webgl')",
  "window.tf.getBackend() !== 'webgl'",
  "scale: 2",
  "patchSize",
  "padding",
  "awaitNextFrame: true",
  "signal",
  "sourceWidth * 2",
  "sourceHeight * 2",
  "NexoraLocalEnhanceInfo",
  "ESRGAN Slim 2x"
]) assert.ok(app.includes(token), `Local ESRGAN runtime kehilangan ${token}`);
assert.ok(app.includes("padding = 4"));
assert.ok(app.includes("profile.lowPower ? 32 : (profile.mobileLike ? 48 : 64)"));
assert.ok(app.includes("modelType: 'layers'"));
assert.ok(app.includes("inputRange: [0, 255]"));
assert.ok(app.includes("outputRange: [0, 255]"));
assert.doesNotMatch(app, /window\.tf\.mul\(input,\s*1\s*\/\s*255\)/);
assert.ok(app.includes("nxCanvasUpscaleExact2x"));
assert.ok(app.includes("lastEngine: nxEsrganLastEngine"));
assert.ok(app.includes("new Blob([bytes], { type: mime })"));
assert.doesNotMatch(app, /fetch\(dataUrl\)/);
assert.doesNotMatch(app.slice(app.indexOf("async function nxLocalEnhance"), app.indexOf("window.NexoraLocalEnhanceInfo")), /maxSide\s*=/);

assert.doesNotMatch(ui, /Local AI|LOCAL ESRGAN|NexoraLocalEnhance|runLocalFallback/);

for (const token of [
  "@tensorflow/tfjs@4.22.0",
  "upscaler@1.0.0",
  "@upscalerjs/esrgan-slim@1.0.0-beta.10",
  "group1-shard1of1.bin",
  "weightsManifest",
  "curl -fL",
  "wget -O"
]) assert.ok(fetcher.includes(token), `Fetcher vendor kehilangan ${token}`);
assert.ok(vendorReadme.includes("Inference tetap berlangsung di browser"));

console.log("Runtime ESRGAN internal tetap valid untuk Image Enhancer, tetapi telah dipisahkan sepenuhnya dari UI Big Image.");

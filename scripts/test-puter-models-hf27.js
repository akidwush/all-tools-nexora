"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const source = read("assets/js/features/puter-image.js");
const instrumented = source.replace(
  /\}\)\(\);\s*$/,
  "window.__puterModelTest={modelIds:MODEL_IDS,generationOptions:generationOptions};})();"
);
const sandbox = { window: {}, document: {}, console };
vm.runInNewContext(instrumented, sandbox, { filename: "puter-image.js" });

const test = sandbox.window.__puterModelTest;
const modelIds = JSON.parse(JSON.stringify(test.modelIds));
assert.deepEqual(modelIds, [
  "gpt-image-1-mini",
  "gpt-image-2",
  "google/gemini-3.1-flash-image-preview",
  "google/imagen-4.0-fast",
  "black-forest-labs/flux-schnell",
  "ideogram/ideogram-4.0",
  "Qwen/Qwen-Image-2.0-Pro"
]);

assert.doesNotMatch(source, /gemini-2\.5-flash-image|ideogram-3\.0/, "ID model lama belum dibuang");
assert.deepEqual(JSON.parse(JSON.stringify(test.generationOptions("google/gemini-3.1-flash-image-preview", "3:4"))), {
  model: "google/gemini-3.1-flash-image-preview", quality: "1K", ratio: { w: 3, h: 4 }
});
assert.deepEqual(JSON.parse(JSON.stringify(test.generationOptions("ideogram/ideogram-4.0", "9:16"))), {
  model: "ideogram/ideogram-4.0", ratio: { w: 576, h: 1024 }
});
assert.deepEqual(JSON.parse(JSON.stringify(test.generationOptions("Qwen/Qwen-Image-2.0-Pro", "16:9"))), {
  model: "Qwen/Qwen-Image-2.0-Pro", ratio: { w: 1024, h: 576 }
});

const readme = read("README.md");
for (const label of ["Gemini 3.1 Flash Image", "Ideogram 4", "Qwen Image 2 Pro", "GPT Image 2", "FLUX Schnell"]) {
  assert.match(readme, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `README belum menjelaskan ${label}`);
}
assert.match(read("assets/js/core/lazy-loader.js"), /puter-image-hf27/);
assert.match(read("index.html"), /hf27-models1/);

console.log("Puter HF27 lulus: Gemini 3.1, Ideogram 4, Qwen Image 2 Pro, model lama, ukuran Together, README, dan cache tervalidasi.");

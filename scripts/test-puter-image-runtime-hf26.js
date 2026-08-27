"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const source = read("assets/js/features/puter-image.js");
const instrumented = source.replace(/\}\)\(\);\s*$/, "window.__puterTest={errorDetails:errorDetails,errorMessage:errorMessage,canFallback:canFallback,generationOptions:generationOptions};})();");
const sandbox = { window: {}, document: {}, console };
vm.runInNewContext(instrumented, sandbox, { filename: "puter-image.js" });

const test = sandbox.window.__puterTest;
assert.ok(test, "Helper runtime Puter gagal dimuat untuk pengujian");

const allowance = { success: false, error: { code: "insufficient_funds", message: "Insufficient credits for image generation", status: 402 } };
assert.deepEqual(JSON.parse(JSON.stringify(test.errorDetails(allowance))), {
  code: "insufficient_funds",
  status: 402,
  message: "Insufficient credits for image generation"
});
assert.match(test.errorMessage(allowance), /Allowance atau credit Puter tidak cukup/);
assert.match(test.errorMessage({ error: { code: "email_must_be_confirmed", message: "Confirm email" } }), /Email akun Puter belum dikonfirmasi/);
assert.match(test.errorMessage({ error: { code: "rate_limited", message: "Too many concurrent requests", status: 429 } }), /Permintaan terlalu cepat/);
assert.match(test.errorMessage({ error: { code: "bad_request", message: "Image was filtered by safety policy" } }), /aturan keamanan/);
assert.equal(test.canFallback(allowance), false, "Saldo tidak boleh memicu request kedua");
assert.equal(test.canFallback({ error: { code: "bad_request", message: "Model not found: old-image-model" } }), true);

assert.deepEqual(JSON.parse(JSON.stringify(test.generationOptions("gpt-image-1-mini", "3:4"))), {
  model: "gpt-image-1-mini", quality: "low", ratio: { w: 1024, h: 1536 }
});
assert.deepEqual(JSON.parse(JSON.stringify(test.generationOptions("google/gemini-2.5-flash-image", "3:4"))), {
  model: "google/gemini-2.5-flash-image", ratio: { w: 3, h: 4 }
});
assert.deepEqual(JSON.parse(JSON.stringify(test.generationOptions("gpt-image-2", "9:16"))), {
  model: "gpt-image-2", quality: "low", ratio: { w: 576, h: 1024 }
});

assert.match(source, /console\.warn\("\[puter-image\] generation failed", \{ model: modelId, code:/);
assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*(?:prompt|value)/i, "Prompt tidak boleh dicatat ke console");
assert.match(read("assets/css/features/puter-image.css"), /\.npi \[hidden\]\{display:none!important\}/);
assert.match(read("assets/js/core/lazy-loader.js"), /puter-image-hf26/);
assert.match(read("index.html"), /hf26-puter-runtime2/);

console.log("Puter HF26 lulus: nested error, allowance guard, fallback aman, rasio provider, privasi log, hidden result, dan cache tervalidasi.");

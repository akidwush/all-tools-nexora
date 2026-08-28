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
  "window.__puterRecoveryTest={errorMessage:errorMessage,canFallback:canFallback};})();"
);
const sandbox = { window: {}, document: {}, console };
vm.runInNewContext(instrumented, sandbox, { filename: "puter-image.js" });

const test = sandbox.window.__puterRecoveryTest;
const replicateShape = { error: { code: "unknown_error", message: "Failed to extract image URL from Replicate response" } };
const togetherRoute = { error: { code: "upstream_bad_request", status: 400, message: "Unable to access non-serverless model black-forest-labs/FLUX.1-schnell" } };

assert.equal(test.canFallback(replicateShape), true, "Respons Replicate rusak harus memakai fallback");
assert.equal(test.canFallback(togetherRoute), true, "Routing Qwen ke non-serverless FLUX harus memakai fallback");
assert.match(test.errorMessage(replicateShape), /Provider model ini sedang bermasalah/);
assert.match(test.errorMessage(togetherRoute), /Provider model ini sedang bermasalah/);

for (const error of [
  { error: { code: "insufficient_funds", status: 402, message: "Insufficient credits" } },
  { error: { code: "rate_limited", status: 429, message: "Too many requests" } },
  { error: { code: "bad_request", status: 400, message: "Filtered by safety policy" } },
  { error: { code: "unauthorized", status: 401, message: "Authentication required" } }
]) assert.equal(test.canFallback(error), false, `Error ${error.error.code} tidak boleh memakai allowance kedua`);

assert.match(source, /Provider model pilihan sedang bermasalah\. Mencoba GPT Image Mini/);
assert.match(read("assets/js/core/lazy-loader.js"), /puter-image-hf28/);
assert.match(read("index.html"), /hf28-provider-recovery1/);

console.log("Puter HF28 lulus: error Replicate dan Qwen pulih, JSON ringkas, guard allowance/auth/safety/rate, dan cache tervalidasi.");

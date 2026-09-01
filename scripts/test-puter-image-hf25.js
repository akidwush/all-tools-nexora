"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const { getTool } = require("./config-test-helpers.js");

const feature = read("assets/js/features/puter-image.js");
const css = read("assets/css/features/puter-image.css");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const loader = read("assets/js/core/lazy-loader.js");
const schema = read("database/schema.sql");
const migration = read("database/migrations/027_puter_ai_image.sql");
const readme = read("README.md");
const index = read("index.html");
const vercel = JSON.parse(read("vercel.json"));
const manifest = JSON.parse(read("assets/module-manifest.json"));

assert.deepEqual(manifest.modules["puter-image"], {
  css: ["assets/css/features/puter-image.css"],
  js: ["assets/js/features/puter-image.js"]
});
assert.equal(manifest.tools.aiimage, "puter-image");

for (const source of [shell, schema, migration]) {
  assert.match(source, /aiimage|Nexora AI Image/, "Katalog atau route Puter belum sinkron");
}
assert.equal(getTool("aiimage").name, "Nexora AI Image");
assert.equal(getTool("aiimage").runtime.module, "puter-image");
assert.equal(getTool("aiimage").runtime.handler, "renderPuterImage");
assert.match(app, /case 'aiimage': renderPuterImage\(body\)/);
assert.match(shell, /aiimage:\{renderer:'renderPuterImage'/);
assert.match(index, /hf25-puter-image1/);

for (const token of [
  "https://js.puter.com/v2/",
  "puter.auth.isSignedIn()",
  "puter.auth.signIn()",
  "puter.auth.getUser()",
  "puter.auth.getMonthlyUsage()",
  "puter.ai.txt2img",
  "allowance",
  "maxlength=\"2000\"",
  "MODEL_IDS.indexOf",
  "body.__nxCleanup"
]) assert.ok(feature.includes(token), `Runtime Puter belum memuat ${token}`);

assert.equal((feature.match(/\.auth\.signIn\(/g) || []).length, 1, "Login Puter harus punya satu jalur eksplisit");
assert.ok(feature.indexOf('connect.addEventListener("click"') < feature.indexOf(".auth.signIn("), "signIn harus berada setelah handler klik pengguna");
assert.doesNotMatch(feature, /disable_safety_checker|api[_-]?key|access[_-]?token|localStorage|sessionStorage/i);
assert.doesNotMatch(css, /@media|backdrop-filter|content-visibility|position\s*:\s*fixed/i);
assert.match(css, /max-width:430px/);
assert.match(css, /min-height:48px/);

const csp = vercel.headers.flatMap((entry) => entry.headers || []).find((entry) => entry.key === "Content-Security-Policy")?.value || "";
for (const origin of ["https://js.puter.com", "https://api.puter.com", "https://*.puter.com"]) {
  assert.ok(csp.includes(origin), `CSP belum mengizinkan ${origin}`);
}

assert.match(readme, /https:\/\/all-tools-nexora\.vercel\.app\/#tool-aiimage/);
assert.match(readme, /Hubungkan Puter/);
assert.match(readme, /termasuk pengguna VVIP Nexora/);
assert.match(readme, /Nexora tidak melihat password/);
assert.match(readme, /64 tool/);

const serverless = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (full.endsWith(".js")) serverless.push(full);
  }
})(path.join(root, "api"));
assert.equal(serverless.length, 12, "Puter tidak boleh menambah Vercel Function");

console.log("Puter AI Image HF25 lulus: login eksplisit, user-pays, privasi, layout universal, CSP, README dan 12/12 Functions tervalidasi.");

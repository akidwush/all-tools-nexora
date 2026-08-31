"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const index = read("index.html");
const app = read("assets/js/core/app.js");
const css = read("assets/css/features/visual-website.css");
const client = read("assets/js/features/visual-website.js");
const manifest = JSON.parse(read("assets/visuals/manifest.json"));
const vercel = JSON.parse(read("vercel.json"));

assert.equal(manifest.name, "Nexora Visual Website");
assert.equal(manifest.source, "Takagi-Dev-content/Contents-Code");
assert.equal(manifest.count, 98, "Seluruh 98 visual HTML harus masuk katalog.");
assert.equal(manifest.demos.length, 98);
assert.equal(new Set(manifest.demos.map((demo) => demo.id)).size, 98, "ID visual harus unik.");
for (const demo of manifest.demos) {
  const absolute = path.join(root, decodeURIComponent(demo.path));
  assert.ok(fs.existsSync(absolute), `Visual hilang: ${demo.filename}`);
  assert.match(demo.filename, /\.html$/i);
  assert.ok(!/[\\/]/.test(demo.filename), `Nama visual tidak aman: ${demo.filename}`);
  assert.ok(fs.statSync(absolute).size > 100, `Visual kosong: ${demo.filename}`);
}

const csp = vercel.headers.flatMap((entry) => entry.headers || [])
  .find((header) => String(header.key).toLowerCase() === "content-security-policy")?.value || "";
const scriptHosts = new Set();
for (const demo of manifest.demos) {
  const html = read(`assets/visuals/demos/${demo.filename}`);
  const patterns = [
    /<script[^>]+\bsrc=["'](https?:\/\/[^"']+)["']/gi,
    /\bfrom\s+["'](https?:\/\/[^"']+)["']/gi,
    /["'][^"']+["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi
  ];
  for (const pattern of patterns) for (const match of html.matchAll(pattern)) scriptHosts.add(new URL(match[1]).origin);
}
for (const host of scriptHosts) assert.ok(csp.includes(host), `CSP belum mengizinkan dependency visual: ${host}`);

assert.match(index, /data-tab="visuals"/);
assert.match(index, /id="tab-visuals"/);
assert.match(index, /id="nxVisualRoom"/);
assert.match(index, /sandbox="allow-scripts allow-forms allow-pointer-lock allow-modals"/);
assert.match(index, /visual-website\.css\?v=6\.4\.0/);
assert.match(index, /visual-website\.js\?v=6\.4\.0/);
assert.match(client, /PAGE_SIZE\s*=\s*18/);
assert.doesNotMatch(client, /grid[^\n]*iframe/i, "Katalog tidak boleh menyalakan banyak iframe sekaligus.");
assert.match(client, /frame\.src\s*=\s*demo\.path/);
assert.match(css, /grid-template-columns:\s*repeat\(2,/);
assert.match(css, /env\(safe-area-inset-top\)/);

console.log("Nexora Visual Website lulus: 98 demo, katalog lazy mobile, pencarian, filter, dan room terisolasi tersedia.");

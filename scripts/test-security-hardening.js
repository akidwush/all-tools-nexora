"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { MAX_ARCHIVE_BYTES } = require("../lib/vdeploy");
const { MAX_SVG_BYTES, downloadPublicSvg } = require("../lib/freeconvert-vectorizer");
const { setBounded, takeFixedWindow } = require("../lib/memory-store");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

assert.ok(Math.ceil(MAX_ARCHIVE_BYTES / 3) * 4 + 20_000 < 4_500_000, "Payload VDeploy dapat melewati batas 4,5 MB");
assert.ok(MAX_SVG_BYTES <= 4_000_000, "Proxy SVG dapat melewati batas respons Function");
assert.equal(typeof downloadPublicSvg, "function");

const store = new Map();
for (let index = 0; index < 20; index += 1) setBounded(store, `key-${index}`, index, { maxEntries: 5 });
assert.equal(store.size, 5);
const windows = new Map();
for (let index = 0; index < 20; index += 1) takeFixedWindow(windows, `ip-${index}`, { limit: 2, maxEntries: 4 });
assert.equal(windows.size, 4);

for (const removed of ["nexus-ai.js", "pix-vault.js"]) {
  assert.equal(fs.existsSync(path.join(root, "assets/js/features", removed)), false, `${removed} masih tersimpan`);
}
for (const relative of [
  "assets/js/features/imported-tools.js", "assets/js/features/comic-reader.js",
  "assets/js/features/tiktok-quote.js", "assets/js/features/virus-scan.js"
]) {
  const source = read(relative);
  assert.match(source, /<iframe[^>]+sandbox=/i);
  assert.doesNotMatch(source, /allow-same-origin/i);
}

const siteGrabber = read("lib/sitegrabber-proxy.js");
for (const token of ["redirect: \"manual\"", "headers.delete(\"authorization\")", "MAX_ARCHIVE_BYTES = 4_000_000"]) {
  assert.ok(siteGrabber.includes(token), `SiteGrabber hardening hilang: ${token}`);
}
const database = read("lib/database.js");
assert.ok(database.includes("crypto.randomBytes(32)"));
assert.ok(!database.includes("all-tools-nexora-local-fallback"));
const deployCenter = read("assets/js/features/deploy-center.js");
assert.ok(deployCenter.includes("integrity=\"sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==\""));
assert.ok(deployCenter.includes("crossorigin=\"anonymous\""));

console.log("Security regression lulus: body limit, bounded memory, iframe isolation, SRI, redirect guard, dan salt acak aktif.");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const core = fs.readFileSync("assets/css/core.css", "utf8");
const app = fs.readFileSync("assets/js/core/app.js", "utf8");

assert.match(html, /<script type="application\/ld\+json">/);
assert.match(html, /"@type":"WebApplication"/);
assert.match(html, /<noscript><section class="nx-noscript-shell">/);
assert.match(html, /id="allGrid" aria-busy="true"/);

const ids = [...html.matchAll(/class="tools-card nx-prerender-card"[^>]*data-prerendered="true"[^>]*data-tool-id="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, 12, "first paint harus memiliki tepat 12 kartu prerender");
assert.equal(new Set(ids).size, 12, "ID kartu prerender tidak boleh duplikat");
for (const id of ids) assert.match(app, new RegExp(`id: '${id}'`), `kartu prerender ${id} tidak ada di katalog runtime`);

assert.match(core, /HF15 — meaningful prerender shell/);
assert.match(core, /#allGrid\[aria-busy="true"\] \.nx-prerender-card\{pointer-events:none\}/);
assert.match(core, /@media \(prefers-reduced-motion:reduce\)\{\.nx-prerender-status::before\{animation:none\}\}/);
assert.match(app, /container\.replaceChildren\(fragment\)/, "runtime harus mengganti prerender tanpa menduplikasi kartu");
assert.match(app, /container\.setAttribute\('aria-busy', 'false'\)/);
assert.match(html, /core\.css\?v=6\.3\.18-hf15-mobile-prerender1/);

console.log("HF15 prerender lulus: 12 kartu bermakna, JSON-LD, noscript, hydration replacement, dan reduced-motion aman.");

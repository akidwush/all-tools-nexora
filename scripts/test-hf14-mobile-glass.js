"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const core = read("assets/css/core.css");
const components = read("assets/css/components.css");
const motion = read("assets/js/core/liquid-reactor.js");
const html = read("index.html");
const vercel = JSON.parse(read("vercel.json"));

assert.match(core, /HF16 — MOBILE PAINT-STABILITY \+ STATIC 3D GLASS/);
assert.match(core, /@media \(min-width:320px\) and \(max-width:767px\)\{[\s\S]*?\.tools-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
assert.match(core, /@media \(max-width:767px\)\{[\s\S]*?#navTabs\{[\s\S]*?backdrop-filter:none!important/);
assert.match(core, /#navTabs\.nx-mobile-stable-tabs \.nav-tab\.active\{[\s\S]*?box-shadow:/);
assert.match(core, /@media \(max-width:767px\)\{[\s\S]*?\.tools-card\{[\s\S]*?backdrop-filter:none!important;[\s\S]*?transform:none!important;[\s\S]*?transform-style:flat!important/);
assert.match(core, /\.tools-card:active\{[\s\S]*?transform:none!important/);
assert.doesNotMatch(components, /\.tools-card\{position:relative;overflow:hidden;isolation:isolate\}/);
assert.match(motion, /nav\.classList\.add\('nx-mobile-stable-tabs'\)/);
assert.match(motion, /if\(coarse\)return;[\s\S]*?captureFlip\(\)/);
assert.match(html, /core\.css\?v=6\.3\.18-hf16-mobile-paint1/);
assert.match(html, /liquid-reactor\.js\?v=6\.3\.18-hf16-mobile-paint1/);

const assetHeaders = vercel.headers.find(entry => entry.source === "/assets/(.*)");
assert.ok(assetHeaders, "Header aset Vercel tidak ditemukan");
assert.ok(assetHeaders.headers.some(header => header.key === "Cache-Control" && header.value === "public, max-age=0, must-revalidate"));

console.log("HF16 mobile glass lulus: grid 3 kolom, tab statis berlapis, kartu tanpa compositor storm, dedup CSS, dan cache revalidation aktif.");

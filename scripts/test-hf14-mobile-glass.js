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
assert.doesNotMatch(core, /nx-mobile-stable-tabs/);
assert.match(core, /\.nx-mercury-indicator\{position:absolute;[\s\S]*?transition:transform 520ms/);
assert.match(core, /@media \(max-width:767px\)\{[\s\S]*?\.tools-card\{[\s\S]*?backdrop-filter:none!important;[\s\S]*?transform:none!important;[\s\S]*?transform-style:flat!important/);
assert.match(core, /\.tools-card:active\{[\s\S]*?transform:translate3d\(0,1px,0\) scale\(\.986\)!important/);
assert.doesNotMatch(components, /\.tools-card\{position:relative;overflow:hidden;isolation:isolate\}/);
assert.match(motion, /indicator=document\.createElement\('span'\)/);
assert.match(motion, /if\(coarse\)\{raf\(moveIndicator\);return;\}/);
assert.match(motion, /nexora:navigation-before[\s\S]*?captureFlip\(\)/);
assert.match(motion, /nexora:navigation-changed[\s\S]*?animateFlip/);
assert.match(html, /core\.css\?v=6\.3\.18-hf17-desktop-nav2/);
assert.match(html, /liquid-reactor\.js\?v=6\.3\.18-hf18-desktop-hero1/);

const assetHeaders = vercel.headers.find(entry => entry.source === "/assets/(.*)");
assert.ok(assetHeaders, "Header aset Vercel tidak ditemukan");
assert.ok(assetHeaders.headers.some(header => header.key === "Cache-Control" && header.value === "public, max-age=0, must-revalidate"));

console.log("HF16 mobile glass lulus: grid 3 kolom, tab statis berlapis, kartu tanpa compositor storm, dedup CSS, dan cache revalidation aktif.");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const core = read("assets/css/core.css");
const components = read("assets/css/components.css");
const motion = read("assets/js/core/liquid-reactor.js");
const html = read("index.html");
const vercel = JSON.parse(read("vercel.json"));

assert.match(core, /HF14 — MOBILE GLASS DEPTH RESTORATION/);
assert.match(core, /@media \(min-width:320px\) and \(max-width:767px\)\{[\s\S]*?\.tools-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
assert.match(core, /@media \(max-width:767px\)\{[\s\S]*?#navTabs\{[\s\S]*?backdrop-filter:blur\(16px\) saturate\(145%\)/);
assert.match(core, /@media \(max-width:767px\)\{[\s\S]*?\.nx-mercury-indicator\{[\s\S]*?display:block!important;[\s\S]*?box-shadow:/);
assert.match(core, /@media \(max-width:767px\)\{[\s\S]*?\.tools-card\{[\s\S]*?box-shadow:[\s\S]*?backdrop-filter:blur\(14px\) saturate\(146%\)/);
assert.match(core, /\.tools-card:active\{[\s\S]*?translate3d\(0,2px,0\) scale\(\.986\)/);
assert.doesNotMatch(core + motion, /nx-static-tabs/);
assert.doesNotMatch(components, /\.tools-card\{position:relative;overflow:hidden;isolation:isolate\}/);
assert.match(motion, /if\(coarse\)nav\.classList\.add\('nx-mobile-glass-tabs'\)/);
assert.match(motion, /positionIndicator\(coarse\)/);
assert.match(html, /core\.css\?v=6\.3\.18-hf15-mobile-prerender1/);
assert.match(html, /liquid-reactor\.js\?v=6\.3\.18-hf14-mobile-glass1/);

const assetHeaders = vercel.headers.find(entry => entry.source === "/assets/(.*)");
assert.ok(assetHeaders, "Header aset Vercel tidak ditemukan");
assert.ok(assetHeaders.headers.some(header => header.key === "Cache-Control" && header.value === "public, max-age=0, must-revalidate"));

console.log("HF14 mobile glass lulus: grid 3 kolom, mercury slider, kartu berlapis, dedup CSS, dan cache revalidation aktif.");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");
const html = read("index.html");
const css = read("assets/css/core.css");
const reactor = read("assets/js/core/liquid-reactor.js");

assert.match(html, /liquid-reactor\.js\?v=6\.4\.0-hf18-desktop-hero1-hf22-original-unified1/);
assert.match(reactor, /unifiedOriginalUi:true/);
assert.match(reactor, /enabled:false,reason:"unified-original-ui"/);
assert.doesNotMatch(css + reactor, /nx-custom-cursor-enabled|touch-follower|cursor-trail|setupCursorReactor|pointermove|pointerdown|pointerup|pointercancel/);
assert.doesNotMatch(css, /@media[^\{]*(?:hover\s*:\s*hover|pointer\s*:\s*fine)/);
assert.match(css, /@media all\{[\s\S]*?\.tools-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
for (const attribute of ["muted", "loop", "playsinline"]) assert.match(html, new RegExp(`<video[^>]*${attribute}`, "i"));
assert.match(html, /<video[^>]*autoplay/i);

console.log("Cursor Reactor checks passed: desktop cursor, trails, and pointer branches are absent; original 3-column UI is universal.");

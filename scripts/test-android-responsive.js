"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const html = read("index.html");
const core = read("assets/css/core.css");
const components = read("assets/css/components.css");
const performance = read("assets/js/core/performance.js");
const reactor = read("assets/js/core/liquid-reactor.js");

assert.match(core, /html\{min-height:100%;background-color:#050509;color-scheme:dark;overscroll-behavior-y:none\}/);
assert.match(core, /body\{[^}]*min-height:100dvh[^}]*background-color:#050509[^}]*overscroll-behavior-y:none/);
assert.match(core, /@media \(max-width:1023px\)\{\.tools-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(core, /@media \(max-width:370px\)\{[\s\S]*?\.tools-grid\{grid-template-columns:1fr!important\}/);
assert.match(components, /@media\(max-width:370px\)\{[\s\S]*?\.tools-grid\{grid-template-columns:1fr!important/);
assert.match(core, /\.user-card\{display:flex;flex-wrap:nowrap[^}]*height:94px[^}]*max-height:105px/);
assert.match(core, /\.user-info\{display:flex;[^}]*flex-flow:row nowrap[^}]*overflow-x:auto[^}]*scrollbar-width:none/);
assert.match(core, /\.user-info \.item\{[^}]*height:44px;min-height:44px/);
assert.match(core, /\.video-banner\{[^}]*aspect-ratio:16\/9/);
assert.match(core, /\.nx-membrane\{animation:none!important;filter:none!important/);
assert.match(reactor, /if\(reduced\|\|coarse\)return;/);
assert.match(performance, /interactionRetryUsed=true/);
assert.doesNotMatch(html + core + performance, /nx-hero-video-toggle|data-nx-hero-toggle|pauseVideo/);
for (const attribute of ["autoplay", "muted", "loop", "playsinline"]) {
  assert.match(html, new RegExp(`<video[^>]*${attribute}`, "i"));
}

console.log("Android responsive checks passed: dark root, compact Session Matrix, stable video, and exact grid breakpoints.");

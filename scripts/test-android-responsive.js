"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const html = read("index.html");
const core = read("assets/css/core.css");
const components = read("assets/css/components.css");
const performance = read("assets/js/core/performance.js");
const reactor = read("assets/js/core/liquid-reactor.js");

assert.match(core, /html\{min-height:100%;background-color:#050509;color-scheme:dark;overscroll-behavior-y:auto\}/);
assert.match(core, /body\{[^}]*min-height:100dvh[^}]*background-color:#050509[^}]*overscroll-behavior-y:auto[^}]*touch-action:pan-x pan-y/);
assert.doesNotMatch(core + components, /@media[^\{]*min-width/);
assert.match(core, /@media all\{[\s\S]*?\.tools-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
assert.doesNotMatch(components, /@media\(min-width:320px\) and \(max-width:767px\)\{[\s\S]*?\.tools-grid/);
assert.doesNotMatch(core + components, /@media[^\{]*(?:370|400|600|767)px[^\{]*\{[\s\S]{0,500}?\.tools-grid\{grid-template-columns:(?:1fr|repeat\(2,)/);
assert.match(core, /@media all\{[\s\S]*?\.tools-card\{[\s\S]*?min-width:0!important;[\s\S]*?min-height:146px!important;[\s\S]*?height:100%;[\s\S]*?padding:8px!important;[\s\S]*?border-radius:13px!important/);
assert.match(core, /\.tools-card p\{display:none!important\}/);
assert.doesNotMatch(components, /\.tools-card\{min-width:0!important;min-height:146px!important/);
assert.match(core, /\.user-card\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);grid-template-rows:repeat\(2,minmax\(0,1fr\)\)[^}]*height:74px[^}]*max-height:74px/);
assert.match(core, /\.user-info\{display:contents;[^}]*overflow:visible;mask-image:none;-webkit-mask-image:none/);
assert.match(core, /\.user-info \.item\{display:grid;grid-template-columns:17px minmax\(0,1fr\)[^}]*min-width:0;width:100%;height:100%;min-height:0/);
const mobileSessionRules = core.match(/@media all\{[\s\S]*?\n\}/)?.[0] || "";
assert.doesNotMatch(mobileSessionRules, /overflow-x:(?:auto|scroll)|flex-flow:row nowrap|min-width:max-content|width:max-content|scroll-snap-type/);
assert.match(core, /\.video-banner\{[^}]*aspect-ratio:16\/9/);
assert.match(core, /\.nx-membrane\{animation:none!important;filter:none!important/);
assert.match(reactor, /unifiedOriginalUi:true/);
assert.doesNotMatch(reactor, /coarse|fine|pointermove|captureFlip|animateFlip/);
assert.match(performance, /interactionRetryUsed=true/);
assert.doesNotMatch(html + core + performance, /nx-hero-video-toggle|data-nx-hero-toggle/);
assert.match(performance, /function suspendPlayback\(\)/);
for (const attribute of ["muted", "loop", "playsinline"]) {
  assert.match(html, new RegExp(`<video[^>]*${attribute}`, "i"));
}
assert.match(html, /<video[^>]*autoplay/i);
assert.match(performance, /heroMode="auto"/);
assert.doesNotMatch(performance, /if\(mobileLike\)\{if\(!video\.paused\)video\.pause\(\);return;\}/);

console.log("Android responsive checks passed: Android layout is the universal PC/mobile rendering source.");

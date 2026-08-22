"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");

const core = read("assets/css/core.css");
const ai = read("assets/css/personal-ai.css");
const reactor = read("assets/js/core/liquid-reactor.js");
const performance = read("assets/js/core/performance.js");
const html = read("index.html");

const mobileStart = core.indexOf("HF16 — MOBILE PAINT-STABILITY + STATIC 3D GLASS");
assert.ok(mobileStart > 0, "lapisan stabilitas mobile HF16 harus tersedia");
const mobile = core.slice(mobileStart);

assert.match(mobile, /\.tools-card\{[\s\S]*?-webkit-backdrop-filter:none!important;[\s\S]*?backdrop-filter:none!important/);
assert.match(mobile, /\.tools-card\{[\s\S]*?transform:none!important;[\s\S]*?transform-style:flat!important;[\s\S]*?will-change:auto!important/);
assert.match(mobile, /\.tools-card>\*,[\s\S]*?\.tools-card \.icon\{[\s\S]*?transform:none!important/);
assert.match(mobile, /\.video-banner video\{[\s\S]*?filter:none!important/);
assert.match(mobile, /\.touch-follower,[\s\S]*?\.cursor-trail\{[\s\S]*?display:none!important/);
assert.doesNotMatch(core, /\.tab-content:not\(\.active\)\{content-visibility:hidden\}/);

assert.match(reactor, /if\(reduced\|\|coarse\)\{[\s\S]*?mobileStable:coarse[\s\S]*?return;/);
assert.match(reactor, /if\(coarse\)return;[\s\S]*?captureFlip\(\)/);
assert.match(reactor, /nav\.classList\.add\('nx-mobile-stable-tabs'\)/);
assert.match(performance, /if\(mobileLike&&!video\.paused\)video\.pause\(\)/);
assert.match(performance, /mobileLike&&!heroVisible/);
assert.match(performance, /threshold:\[0,0\.01,0\.35\]/);
assert.match(ai, /@media\(max-width:767px\)\{[\s\S]*?\.nx-ai-launcher-orb::after\{animation:none\}/);

for (const asset of ["core.css", "performance.js", "liquid-reactor.js", "personal-ai.css"]) {
  assert.match(html, new RegExp(`${asset.replace(".", "\\.")}\\?v=6\\.3\\.18-hf16-mobile-paint1`));
}

console.log("HF16 paint stability lulus: layer kartu, touch follower, tab FLIP, video offscreen, AI orb, content visibility, dan cache bust aman.");

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
assert.doesNotMatch(core, /touch-follower|cursor-trail|pointer\s*:\s*fine|hover\s*:\s*hover/);
assert.doesNotMatch(mobile, /\.nx-mercury-indicator\{[\s\S]*?display:none!important/);
assert.doesNotMatch(core, /\.tab-content:not\(\.active\)\{content-visibility:hidden\}/);

assert.match(reactor, /unifiedOriginalUi:true/);
assert.doesNotMatch(reactor, /coarse|fine|captureFlip|animateFlip|pointermove/);
assert.match(reactor, /indicator=document\.createElement\(["']span["']\)/);
assert.doesNotMatch(performance, /if\(mobileLike\)\{if\(!video\.paused\)video\.pause\(\);return;\}/);
assert.match(performance, /heroMode="auto"/);
assert.match(performance, /threshold:\[0,0\.01,0\.35\]/);
assert.match(ai, /@media all\{[\s\S]*?\.nx-ai-launcher-orb::after\{animation:none\}/);

const assetVersions = {
      "core.css": "6.4.0-hf17-desktop-nav2",
  "performance.js": "6.4.0-hf18-desktop-hero3",
  "liquid-reactor.js": "6.4.0-hf18-desktop-hero1",
  "personal-ai.css": "6.4.0-hf16-mobile-paint1"
};
for (const [asset, version] of Object.entries(assetVersions)) {
  assert.match(html, new RegExp(`${asset.replace(".", "\\.")}\\?v=${version.replaceAll(".", "\\.")}`));
}

console.log("HF16 paint stability lulus: layer kartu statis, tanpa touch trail/FLIP desktop, hero loop, dan content visibility aman.");

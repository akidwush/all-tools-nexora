"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");
const html = read("index.html");
const css = read("assets/css/core.css");
const motion = read("assets/js/core/liquid-reactor.js");

assert.match(html, /liquid-reactor\.js\?v=6\.4\.0-hf18-desktop-hero1-hf22-original-unified1/);
for (const token of ["nx-mercury-indicator", "positionIndicator", "nexora:navigation-changed", "nexora:tools-rendered", "ArrowRight"]) {
  assert.ok((css + motion).includes(token), `runtime unified kehilangan ${token}`);
}
assert.doesNotMatch(css + motion, /nxLiquidAperture|nxAperture|setupAperture|captureFlip|animateFlip|nx-reactor-ghost|pointermove/);
assert.match(motion, /unifiedOriginalUi:true/);
for (const attribute of ["muted", "playsinline", "loop"]) assert.match(html, new RegExp(`<video[^>]*\\b${attribute}`, "i"));
assert.match(html, /<video[^>]*autoplay/i);

console.log("Liquid Reactor Step 2 lulus: navigasi asli tetap aktif tanpa cabang motion desktop.");

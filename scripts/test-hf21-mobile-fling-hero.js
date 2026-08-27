"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");

const html = read("index.html");
const core = read("assets/css/core.css");
const performance = read("assets/js/core/performance.js");

const hf21Start = core.indexOf("HF21 — ANDROID FLING PAINT BUDGET");
assert.ok(hf21Start > 0, "HF21 paint budget harus tersedia.");
const hf21 = core.slice(hf21Start);

assert.match(hf21, /@media all/);
assert.match(hf21, /\.bg-glow\{[\s\S]*?display:none!important/);
assert.match(hf21, /\.tab-content\.active,[\s\S]*?content-visibility:visible!important;[\s\S]*?visibility:visible!important;[\s\S]*?opacity:1!important/);
assert.match(hf21, /\.tools-card\{[\s\S]*?-webkit-backdrop-filter:none!important;[\s\S]*?backdrop-filter:none!important/);
assert.match(hf21, /\.tools-card::after\{[\s\S]*?display:none!important/);
assert.match(hf21, /html,body\{[\s\S]*?overflow-x:hidden!important/);

assert.match(html, /core\.css\?v=6\.4\.0-hf17-desktop-nav2-hf21-fling1-hf22-original-unified1/);
assert.match(html, /performance\.js\?v=6\.4\.0-hf18-desktop-hero3-hf21-mobile-loop1/);
assert.match(html, /<video[^>]*autoplay[^>]*loop[^>]*muted[^>]*playsinline/i);
assert.match(performance, /var heroMode="auto"/);
assert.match(performance, /video\.autoplay=true/);
assert.match(performance, /video\.addEventListener\("ended",schedulePlaybackRecovery\)/);
assert.match(performance, /video\.addEventListener\("pause",schedulePlaybackRecovery\)/);
assert.match(performance, /if\(video\.ended\)\{try\{video\.currentTime=0;/);
assert.match(performance, /if\(heroVisible\)\{ensureLoaded\(\);ensurePlayback\(\);\}/);
assert.doesNotMatch(performance, /heroMode=mobileLike\?"static":"auto"/);
assert.doesNotMatch(performance, /if\(mobileLike\)\{if\(!video\.paused\)video\.pause\(\);return;\}/);

console.log("HF21 lulus: hero autoplay loop mobile dan layer penyebab blank saat fast scroll dinonaktifkan.");

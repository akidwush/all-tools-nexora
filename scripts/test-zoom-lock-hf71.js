"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");

for (const file of ["index.html", "about.html", "feedback.html", "admin/index.html", "admin/login.html"]) {
  const html = read(file);
  assert.match(html, /maximum-scale=1/i, `${file}: maximum-scale belum dikunci`);
  assert.match(html, /user-scalable=no/i, `${file}: zoom pengguna belum dimatikan`);
}

const css = read("assets/css/core.css");
const stability = read("assets/js/core/stability.js");
assert.match(css, /touch-action:pan-x pan-y/);
assert.doesNotMatch(css, /touch-action:pan-x pan-y pinch-zoom/);
assert.match(stability, /\["gesturestart","gesturechange","gestureend"\]/);
assert.match(stability, /event\.touches&&event\.touches\.length>1/);
assert.match(stability, /document\.addEventListener\("dblclick",blockPageZoom/);
assert.match(stability, /passive:false/);

console.log("HF7.1 zoom lock lulus: pinch, gesture, dan double-tap zoom diblokir pada seluruh halaman utama.");

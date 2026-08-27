"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");

const html = read("index.html");
const css = read("assets/css/cursor-red.css");
const runtime = read("assets/js/core/cursor-red.js");

assert.match(html, /cursor-red\.css\?v=6\.4\.0-hf23-red-cursor1/);
assert.match(html, /cursor-red\.js\?v=6\.4\.0-hf23-red-cursor1/);
assert.match(css, /@media \(hover:hover\) and \(pointer:fine\)/);
assert.match(css, /#nxRedCursorDot[\s\S]*?background:#ff1a96/);
assert.match(css, /#nxRedCursorRing[\s\S]*?border:1px solid rgba\(255,26,150,\.52\)/);
assert.match(runtime, /var fine=window\.matchMedia\("\(hover:hover\) and \(pointer:fine\)"\)/);
assert.match(runtime, /function mount\(\)\{[\s\S]*?if\(mounted\|\|!fine\.matches\)return;[\s\S]*?createNode/);
assert.match(runtime, /document\.addEventListener\("pointermove",onPointerMove,\{passive:true\}\)/);
assert.match(runtime, /document\.removeEventListener\("pointermove",onPointerMove\)/);
assert.match(runtime, /if\(!frame\)frame=requestAnimationFrame\(render\)/);
assert.match(runtime, /touchAllocation:false/);
assert.doesNotMatch(runtime, /mousemove|touchmove|setInterval|cursor-trail|\.style\.(?:left|top)\s*=/);

console.log("HF23 red cursor lulus: visual DLYYZ aktif untuk mouse dan mengalokasikan nol runtime pada Android.");

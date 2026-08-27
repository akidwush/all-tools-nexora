"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const html = read("index.html");
const css = read("assets/css/core.css");
const components = read("assets/css/components.css");
const reactor = read("assets/js/core/liquid-reactor.js");
const cursorStart = reactor.indexOf("function setupCursorReactor");
const cursorEnd = reactor.indexOf("\n  function setupVisibility", cursorStart);
const cursorSource = reactor.slice(cursorStart, cursorEnd);

assert.match(html, /liquid-reactor\.js\?v=6\.4\.0-hf18-desktop-hero1/);
assert.match(css, /\.custom-cursor,[\s\S]*?\.touch-follower,[\s\S]*?\.cursor-trail\{[\s\S]*?position:fixed;[\s\S]*?pointer-events:none!important;[\s\S]*?user-select:none;[\s\S]*?will-change:transform,opacity/);
assert.match(css, /html\.nx-custom-cursor-enabled body \*\{cursor:none!important\}/);
assert.match(css, /@media \(pointer:coarse\),\(hover:none\)/);
assert.match(cursorSource, /if\(reduced\|\|coarse\|\|!fine\)\{/);
assert.doesNotMatch(cursorSource, /mobileTouch:coarse/);
assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.custom-cursor,[\s\S]*?\.touch-follower,[\s\S]*?\.cursor-trail\{display:none!important/);
for (const event of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
  assert.match(cursorSource, new RegExp(`addEventListener\\('${event}'[^;]+\\{passive:true\\}`));
}
assert.match(cursorSource, /function schedule\(\)\{if\(!frame\)frame=raf\(render\);\}/);
assert.match(cursorSource, /translate3d\('\+x\.toFixed/);
assert.match(cursorSource, /if\(trailCount>=limit\)return/);
assert.match(cursorSource, /trail\.addEventListener\('animationend'/);
assert.match(cursorSource, /touch\.classList\.add\('is-holding'\)/);
assert.doesNotMatch(cursorSource, /style\.(?:top|left)\s*=/);
assert.doesNotMatch(cursorSource, /preventDefault\(/);
assert.match(css, /@media \(pointer:coarse\),\(hover:none\)\{[\s\S]*?\.touch-follower,[\s\S]*?\.cursor-trail\{display:none!important;animation:none!important;will-change:auto!important/);
assert.match(css, /\.tools-card:active\{[\s\S]*?transform:translate3d\(0,1px,0\) scale\(\.986\)!important/);
assert.match(css, /\.tools-card:active::after\{[\s\S]*?scale\(1\.08\)/);
assert.match(coreAndComponents(), /@media \(min-width:320px\) and \(max-width:767px\)[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
for (const attribute of ["muted", "loop", "playsinline"]) assert.match(html, new RegExp(`<video[^>]*${attribute}`, "i"));
assert.match(html, /<video[^>]*autoplay/i);
assert.match(html, /data-src="https:\/\/files\.catbox\.moe\/4ijdle\.mp4"/);

function coreAndComponents() {
  return css + "\n" + components;
}

console.log("Cursor Reactor checks passed: desktop spring cursor, zero Android pointer trails, reduced motion, looping hero, and Android 3-column grid.");

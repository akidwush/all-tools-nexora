"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const read = file => fs.readFileSync(file, "utf8");

const html = read("index.html");
const css = read("assets/css/cursor-red.css");
const runtime = read("assets/js/core/cursor-red.js");

assert.match(html, /cursor-red\.css\?v=6\.4\.0-hf24-touch-cursor1/);
assert.match(html, /cursor-red\.js\?v=6\.4\.0-hf24-touch-cursor1/);
assert.match(css, /display:block/);
assert.match(css, /@media \(any-hover:hover\) and \(any-pointer:fine\)/);
assert.doesNotMatch(css, /@media[^\{]*(?:hover:\s*none|pointer:\s*coarse)[\s\S]*?#nxRedCursor(?:Dot|Ring)[^\}]*display:\s*none/i);

assert.match(runtime, /var coarse=window\.matchMedia\("\(any-pointer:coarse\)"\)/);
assert.match(runtime, /document\.addEventListener\("pointerdown",onPointerDown,\{passive:true\}\)/);
assert.match(runtime, /document\.addEventListener\("pointermove",onPointerMove,\{passive:true\}\)/);
assert.match(runtime, /if\(coarse\.matches&&!fine\.matches\)\{[\s\S]*?lastPointerType="touch";[\s\S]*?setVisible\(true\)/);
assert.match(runtime, /if\(lastPointerType==="mouse"&&!event\.relatedTarget\)setVisible\(false\)/);
assert.match(runtime, /touchPersistent:true/);
assert.doesNotMatch(runtime, /pointerup[\s\S]*?setVisible\(false\)|touchend[\s\S]*?setVisible\(false\)/);

class FakeClassList {
  constructor(){this.values = new Set();}
  add(value){this.values.add(value);}
  remove(value){this.values.delete(value);}
  toggle(value, enabled){enabled ? this.add(value) : this.remove(value);}
  contains(value){return this.values.has(value);}
}

class FakeElement {
  constructor(){this.id = ""; this.style = {}; this.classList = new FakeClassList();}
  setAttribute(){}
  closest(){return null;}
  remove(){}
}

const nodes = new Map();
const listeners = new Map();
let nextFrame = null;
const document = {
  readyState: "complete",
  hidden: false,
  body: {appendChild(node){nodes.set(node.id, node);}},
  documentElement: {classList: new FakeClassList()},
  createElement(){return new FakeElement();},
  getElementById(id){return nodes.get(id) || null;},
  addEventListener(type, handler){listeners.set(type, handler);},
  removeEventListener(type){listeners.delete(type);}
};
const window = {
  innerWidth: 360,
  innerHeight: 720,
  matchMedia(query){return {matches: query === "(any-pointer:coarse)", addEventListener(){}, removeEventListener(){}};}
};
const context = {
  window,
  document,
  Element: FakeElement,
  requestAnimationFrame(callback){nextFrame = callback; return 1;},
  cancelAnimationFrame(){nextFrame = null;}
};

vm.runInNewContext(runtime, context);
nextFrame();
const dot = nodes.get("nxRedCursorDot");
const ring = nodes.get("nxRedCursorRing");
assert.ok(dot && ring, "Android harus membuat dot dan ring.");
assert.equal(dot.classList.contains("is-visible"), true, "Cursor Android harus terlihat sejak load.");
assert.equal(listeners.has("pointerup"), false, "Jari terangkat tidak boleh memasang handler penyembunyi cursor.");

listeners.get("pointerdown")({pointerType: "touch", clientX: 123, clientY: 234});
nextFrame();
assert.match(dot.style.transform, /123\.00px,234\.00px/);
assert.equal(dot.classList.contains("is-visible"), true, "Cursor harus tetap terlihat setelah tap selesai.");
assert.equal(window.__NEXORA_RED_CURSOR__.touchPersistent, true);

console.log("HF24 touch cursor lulus: Android tampil sejak load, mengikuti sentuhan, dan menetap setelah jari terangkat.");

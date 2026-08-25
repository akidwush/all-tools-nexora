"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const toolIds = ["text2d", "text3d", "textfxanimation", "textvector", "trimpath", "logoanimate"];
const registry = read("assets/js/core/tool-registry.js");
const manifest = JSON.parse(read("assets/module-manifest.json"));
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const migration = read("database/migrations/026_flamo_native_generators.sql");
for (const id of toolIds) {
  assert.ok(registry.includes(`["${id}"`), `Registry harus memuat ${id}`);
  assert.ok(manifest.tools[id], `Manifest harus memetakan ${id}`);
  assert.ok(app.includes(`id: '${id}'`), `Katalog harus memuat ${id}`);
  assert.ok(shell.includes(`${id}:{renderer:`), `Universal room harus memuat ${id}`);
}
assert.match(migration, /external_url, is_active/);
assert.doesNotMatch(migration, /\bhref\b|\bactive\s*=/, "Migration harus memakai nama kolom katalog Nexora saat ini");

const expectedAssets = [
  "assets/css/features/flamo-generators.css",
  "assets/js/features/flamo/flamo-runtime.js",
  "assets/js/features/flamo/logo-engine.js",
  "assets/js/workers/flamo-vector-worker.js",
  "assets/vendor/flamo/opentype.min.js",
  "assets/vendor/flamo/3d-engine.js",
  "assets/vendor/flamo/text-2d-presets.js",
  "assets/vendor/flamo/text-style-data.js",
  "assets/vendor/flamo/text-2d-engine.js",
  "assets/vendor/flamo/text-fx-animation-engine.js",
  "assets/vendor/flamo/trimpath-font-metrics.js",
  "assets/vendor/flamo/trimpath-letters.js",
  "assets/vendor/flamo/trimpath-engine.js",
  "assets/data/flamo/logo/template-head.xml",
  "assets/data/flamo/logo/template-textblock.xml",
  "assets/data/flamo/logo/template-tail.xml",
  ...Array.from({ length: 16 }, (_, index) => `assets/fonts/flamo/font-${String(index + 1).padStart(2, "0")}.ttf`)
];
for (const file of expectedAssets) assert.ok(exists(file), `Asset lokal hilang: ${file}`);
for (const file of expectedAssets.filter((file) => /\.(?:js|xml)$/.test(file))) {
  assert.doesNotMatch(read(file), /universe\.flamocreative\.com|wp-json|admin-ajax\.php/i, `Asset integrasi tidak boleh mengarah ke WordPress lama: ${file}`);
}
const opentype = require(path.join(root, "assets/vendor/flamo/opentype.min.js"));
for (let index = 1; index <= 16; index += 1) {
  const font = fs.readFileSync(path.join(root, `assets/fonts/flamo/font-${String(index).padStart(2, "0")}.ttf`));
  assert.ok(font.length > 1024, `Font lokal ${index} terlalu kecil atau rusak`);
  assert.ok(["00010000", "4f54544f", "74727565"].includes(font.subarray(0, 4).toString("hex")), `Signature font lokal ${index} tidak valid`);
  const arrayBuffer = font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength);
  assert.ok(opentype.parse(arrayBuffer).getPath("NEXORA", 0, 0, 120).commands.length > 0, `Font lokal ${index} tidak menghasilkan path OpenType`);
}

const runtime = read("assets/js/features/flamo/flamo-runtime.js");
for (const token of ["MAX_PALETTES=15", "new Worker", "prefers-reduced-motion", "Download All", "__nxCleanup", "validXml"]) {
  const haystack = token === "prefers-reduced-motion" ? read("assets/css/features/flamo-generators.css") : runtime;
  assert.ok(haystack.includes(token), `Runtime Flamo harus memuat ${token}`);
}
assert.doesNotMatch(runtime, /universe\.flamocreative\.com|wordpress|member only|login/i);
assert.match(runtime, /if\(!preview\)return/, "Controller harus aman saat Text to Vector mengganti preview teks dengan SVG");
assert.ok(runtime.includes('<textarea id="inputText">Flamo\\nCreative</textarea>'), "Default teks 2D harus sama dengan Flamo");
for (const expected of [
  "input('spread','Spread (ms)','number',100",
  "input('stagger','Stagger (ms)','number',50",
  "input('layerDuration','Durasi layer (detik)','number',4",
  "input('endHold','End Hold (ms)','number',1000",
  "<textarea id=\"textInput\">FLAMO</textarea>",
  "input('letterSpacing','Letter Spacing','number',10",
  "input('padding','Padding','number',20",
  "]],'fillStroke'",
  "<textarea id=\"inputText\">Flamo Creative</textarea>",
  "input('stagger','Stagger (ms)','number',30",
  "input('endHold','End Hold (ms)','number',300",
  "colors:ctx.paletteTouched?ctx.colors:null"
]) assert.ok(runtime.includes(expected), `Default/adapter akurasi Flamo hilang: ${expected}`);
assert.match(read("assets/vendor/flamo/text-2d-engine.js"), /fastStart','slowStart','random','custom/);
assert.doesNotMatch(read("assets/vendor/flamo/text-2d-presets.js"), /status:'(?:soon|donate)'/, "Preset Coming Soon/donasi tidak boleh dibundel");

function fakeElement() {
  const classes = new Set();
  return {
    value: "", checked: false, disabled: false, innerHTML: "", textContent: "", dataset: {}, style: { setProperty() {} },
    classList: { add: (...names) => names.forEach((name) => classes.add(name)), remove: (...names) => names.forEach((name) => classes.delete(name)), toggle(name, on) { if (on === undefined ? !classes.has(name) : on) classes.add(name); else classes.delete(name); }, contains: (name) => classes.has(name) },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }
  };
}
function browserSandbox() {
  const elements = new Map();
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, fakeElement()); return elements.get(id); },
    querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, createElement() { return fakeElement(); }
  };
  const window = { document, TextDecoder, URLSearchParams, location: { search: "" }, parent: { postMessage() {} }, addEventListener() {}, matchMedia() { return { matches: false }; } };
  window.window = window;
  return { window, document, elements, TextDecoder, TextEncoder, URLSearchParams, location: window.location, parent: window.parent, matchMedia: window.matchMedia, atob: (value) => Buffer.from(value, "base64").toString("binary"), console, setTimeout, clearTimeout };
}

{
  const sandbox = browserSandbox();
  vm.createContext(sandbox);
  vm.runInContext(read("assets/vendor/flamo/3d-engine.js"), sandbox);
  const engine = sandbox.window.Flamo3DEngine;
  assert.equal(engine.presets.length, 7);
  const defaultXml = engine.generate({});
  assert.match(defaultXml, /title="flamo-creative#flip"/);
  assert.match(defaultXml, /totalTime="3049"/);
  for (const preset of ["flip", "popup", "long-shadow", "offsetGreen"]) {
    const xml = engine.generate({ text: "NEXORA", preset, filename: `test-${preset}`, fontName: "Exo", fontStyle: "700" });
    assert.match(xml, /^<\?xml|<scene\b/);
    assert.match(xml, /<scene\b[^>]*totalTime=/);
    assert.ok(xml.endsWith("\n") || xml.endsWith("</scene>"));
  }
}

{
  const sandbox = browserSandbox();
  vm.createContext(sandbox);
  for (const file of ["assets/vendor/flamo/text-2d-presets.js", "assets/vendor/flamo/text-style-data.js", "assets/vendor/flamo/text-2d-engine.js"]) vm.runInContext(read(file), sandbox);
  const engine = sandbox.window.Flamo2DTextEngine;
  assert.ok(engine.presets.length >= 8);
  assert.ok(!engine.presets.includes("neonGlow") && !engine.presets.includes("trimpath"), "Coming Soon/donasi tidak boleh menjadi preset aktif");
  const defaultXml = engine.generate({});
  assert.match(defaultXml, /title="flamo#blur"/);
  assert.match(defaultXml, /totalTime="4600"/);
  for (const preset of ["fadeBlur", "elastic", "randomInOut"]) {
    const xml = engine.generate({ text: "NEXORA", preset, filename: `two-${preset}`, styleEnabled: false });
    assert.match(xml, /Generated by Flamo 2D Text Animate Clean/);
    assert.match(xml, /<content>N<\/content>/);
  }
}

{
  const sandbox = browserSandbox();
  vm.createContext(sandbox);
  vm.runInContext(read("assets/vendor/flamo/text-fx-animation-engine.js"), sandbox);
  const engine = sandbox.window.FlamoTextFxAnimationEngine;
  assert.equal(engine.presets.length, 5);
  for (const preset of ["apple", "outin", "star"]) {
    const xml = engine.generate({ text: "NEXORA FX", preset, mode: "character", filename: `fx-${preset}` });
    assert.match(xml, /Generated by Flamo Text FX Animator/);
    assert.match(xml, /<scene\b/);
  }
}

{
  const sandbox = browserSandbox();
  vm.createContext(sandbox);
  for (const file of ["assets/vendor/flamo/trimpath-font-metrics.js", "assets/vendor/flamo/trimpath-letters.js", "assets/vendor/flamo/trimpath-engine.js"]) vm.runInContext(read(file), sandbox);
  const engine = sandbox.window.TrimpathEngine;
  for (const preset of ["biasa", "movein", "movefromleft"]) {
    const result = engine.generate({ text: "NEXORA", animPreset: preset, style: "orange", sizePx: 40, stagger: 60, extendLayer: true, colorMappingOn: true, mapping: "gradient", colors: ["#FFFFFF", "#7C3AED"], styleColors: ["#F97316", "#FACC15"], filename: `trim-${preset}` });
    assert.equal(result.missing.length, 0);
    assert.equal(result.layers.length, 6);
    assert.match(result.xml, /Generated by Flamo Trimpath Gen/);
  }
}

{
  const sandbox = browserSandbox();
  sandbox.fetch = async (url) => {
    const name = String(url).match(/template-(head|textblock|tail)\.xml/)?.[1];
    return name ? { ok: true, text: async () => read(`assets/data/flamo/logo/template-${name}.xml`) } : { ok: false };
  };
  vm.createContext(sandbox);
  vm.runInContext(read("assets/js/features/flamo/logo-engine.js"), sandbox);
  sandbox.window.FlamoLogoAnimateEngine.generate({ text: "NEXORA", filename: "logo-test" }).then((xml) => {
    assert.match(xml, /<media\b/);
    assert.match(xml, /<content>NEXORA<\/content>/);
  }).catch((error) => { throw error; });
}

console.log("Flamo native generator regression lulus: 6 route, preset nyata, asset/font lokal, worker vector, XML, palet 15, history dan cleanup tervalidasi.");

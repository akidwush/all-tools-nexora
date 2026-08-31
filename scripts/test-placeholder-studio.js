"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const source = read("assets/js/features/placeholder-studio.js");
const css = read("assets/css/features/placeholder-studio.css");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const config = require(path.join(root, "assets/config.js"));
const vercel = JSON.parse(read("vercel.json"));

const sandbox = {
  window: {},
  URLSearchParams,
  console,
  Number,
  Object,
  String,
  Math,
  Set,
  Array
};
vm.runInNewContext(source, sandbox, { filename: "placeholder-studio.js" });
const studio = sandbox.window.NexoraPlaceholderStudio;

assert.ok(studio, "Core Placeholder Studio harus diekspor untuk pengujian");
assert.deepEqual(Array.from(studio.CLASSIC_FORMATS), ["png", "jpg", "webp", "svg", "avif", "gif"]);
assert.deepEqual(Array.from(studio.PLACEHOLDER_STYLES), ["photographic", "artistic", "anime", "oil-painting", "3d-render", "cartoon"]);
assert.equal(studio.CLASSIC_FONTS.length, 12);
assert.equal(studio.DIMENSION_PRESETS.length, 5);

assert.equal(
  studio.buildClassicUrl({ width: 600, height: 400, background: "#1c1c1e", textColor: "#ffffff", text: "Nexora", format: "png", font: "lato", retina: 1 }),
  "https://placeholderimage.co/600x400/1c1c1e/ffffff/png?text=Nexora&font=lato"
);
assert.match(studio.buildClassicUrl({ width: 1080, height: 1920, background: "#abc", textColor: "fff", text: "Halo Dunia ✓", format: "webp", font: "poppins", retina: 2 }), /^https:\/\/placeholderimage\.co\/1080x1920@2x\/aabbcc\/ffffff\/webp\?text=Halo\+Dunia\+%E2%9C%93&font=poppins$/);
assert.equal(studio.normalizeHex("ABC"), "#aabbcc");
assert.equal(studio.normalizeHex("#nothex"), "");

assert.equal(
  studio.buildPromptUrl({ width: 1024, height: 768, prompt: "cyberpunk city at night", style: "anime", seed: 1 }),
  "https://placeholdr.dev/1024x768/cyberpunk%20city%20at%20night?style=anime&seed=1"
);
assert.match(studio.buildPromptUrl({ width: 128, height: 2048, prompt: "kucing/awan & bulan?", style: "3d-render", seed: 3 }), /kucing%2Fawan%20%26%20bulan%3F\?style=3d-render&seed=3$/);
assert.throws(() => studio.buildClassicUrl({ width: 999999, height: 400, background: "#000", textColor: "#fff", format: "png", font: "lato", retina: 1 }), /INVALID_DIMENSIONS/);
assert.throws(() => studio.buildPromptUrl({ width: 100, height: 400, prompt: "test", style: "anime", seed: 1 }), /INVALID_DIMENSIONS/);
assert.throws(() => studio.buildPromptUrl({ width: 512, height: 512, prompt: "", style: "anime", seed: 1 }), /EMPTY_PROMPT/);
assert.throws(() => studio.buildPromptUrl({ width: 512, height: 512, prompt: "test", style: "anime", seed: 4 }), /INVALID_SEED/);

const tool = config.tools.tools.find((item) => item.id === "placeholderstudio");
assert.ok(tool, "Placeholder Studio harus masuk registry config");
assert.equal(tool.runtime.module, "placeholder-studio");
assert.equal(tool.runtime.handler, "renderNexoraPlaceholderStudio");
assert.equal(tool.runtime.mode, "hybrid");
assert.ok(config.modules["placeholder-studio"]);
assert.match(shell, /placeholderstudio:\{renderer:'renderNexoraPlaceholderStudio'/);
assert.match(lazy, /placeholder-studio-v2/);

assert.match(source, /loading="eager" decoding="async" fetchpriority="high"/);
assert.doesNotMatch(source, /loading="lazy"/);
assert.match(source, /PREVIEW_TIMEOUT_MS=15000/);
assert.match(source, /ui\.image\.naturalWidth<1/);
assert.match(source, /ui\.image\.hidden=false;ui\.image\.classList\.add\('is-pending'\)/);
assert.match(source, /Preview tidak merespons, tetapi URL gambar tetap siap digunakan/);
assert.match(source, /navigator\.clipboard/);
assert.match(source, /fetch\(state\.resultUrl,\{mode:'cors'/);
assert.match(source, /state\.resultMode==='prompt'.+image\/svg\+xml/);
assert.match(source, /target='_blank'/);
assert.match(source, /URL copied/);
assert.match(source, /Math\.floor\(Math\.random\(\)\*3\)/);
assert.doesNotMatch(source, /supabase/i);
assert.doesNotMatch(source, /alert\s*\(/);

assert.match(css, /min-height:44px/);
assert.match(css, /@media\(max-width:390px\)/);
assert.match(css, /@media\(max-width:360px\)/);
assert.match(css, /max-width:100%/);
assert.match(css, /\.nps \[hidden\]\{display:none!important\}/);
assert.match(css, /\.nps-preview img\.is-pending\{opacity:0/);
assert.match(css, /\.nps-loading\{position:absolute/);

const globalHeaders = vercel.headers.find((entry) => entry.source === "/(.*)")?.headers || [];
const csp = globalHeaders.find((entry) => String(entry.key).toLowerCase() === "content-security-policy")?.value || "";
assert.match(csp, /connect-src[^;]+https:\/\/placeholderimage\.co/);
assert.match(csp, /connect-src[^;]+https:\/\/placeholdr\.dev/);

console.log("Nexora Placeholder Studio tests lulus: URL builder, provider limits, registry, lazy loader, CSP, download fallback, dan mobile UI tervalidasi.");

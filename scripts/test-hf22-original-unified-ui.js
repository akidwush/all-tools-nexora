"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const html = read("index.html");
const mobile = read("assets/css/mobile-usability.css");
const prompt = read("assets/css/features/prompt-generator.css");
const documentAi = read("assets/css/features/document-ai.css");
const reactor = read("assets/js/core/liquid-reactor.js");

// The mobile composition is intentionally unchanged, but it must not constrain
// tablet and desktop widths. The compact rules are active only on phone sizes.
assert.match(mobile, /Nexora mobile usability rules/);
assert.match(mobile, /@media\(max-width:600px\)\{[\s\S]*?\.container\{[\s\S]*?max-width:var\(--nx-original-ui-width\)!important/);
assert.doesNotMatch(mobile, /@media all\{[\s\S]*?max-width:var\(--nx-original-ui-width\)!important/);
assert.match(prompt, /@media\(max-width:900px\)\{\.nx-prompt-layout\{grid-template-columns:1fr/);
assert.match(prompt, /@media\(max-width:600px\)\{#nxUniversalRoom\[data-tool="promptgenerate"\]/);
assert.match(documentAi, /@media\(max-width:900px\)\{\.nda-workspace\{grid-template-columns:1fr/);
assert.match(documentAi, /@media\(max-width:600px\)\{\.tool-viewer:has\(\.nda\)/);
assert.doesNotMatch(prompt + documentAi, /@media all/);
assert.match(html, /mobile-usability\.css\?v=[^"']*responsive-desktop1/);
assert.match(html, /lazy-loader\.js\?v=[^"']*document-ai-responsive2[^"']*prompt-responsive2/);
assert.doesNotMatch(reactor, /custom-cursor|nx-liquid|nx-reactor-ghost|touch-follower|cursor-trail/);

console.log("Responsive layout tests lulus: UI mobile tetap terjaga sampai 600px dan layout tablet/desktop kembali memakai ruang layar.");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config-test-helpers.js");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mobileCss = fs.readFileSync(path.join(root, "assets/css/mobile-usability.css"), "utf8");

assert.equal(config.ui.customCursor, false);
assert.equal(fs.existsSync(path.join(root, "assets/css/cursor-red.css")), false);
assert.equal(fs.existsSync(path.join(root, "assets/js/core/cursor-red.js")), false);
assert.doesNotMatch(html, /cursor-red|nxRedCursor/i);
assert.doesNotMatch(mobileCss, /cursor\s*:\s*none/i);
assert.match(mobileCss, /html\.nx-desktop-static[\s\S]*animation:none!important/);

console.log("HF23 lulus: custom cursor dekoratif dihapus dan pointer native tetap tersedia di mobile maupun desktop.");

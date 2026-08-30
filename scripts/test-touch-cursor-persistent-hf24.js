"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config-test-helpers.js");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.equal(config.ui.customCursor, false);
assert.doesNotMatch(html, /cursor-red\.css|cursor-red\.js|nxRedCursor/i);
assert.equal(fs.existsSync(path.join(root, "assets/css/cursor-red.css")), false);
assert.equal(fs.existsSync(path.join(root, "assets/js/core/cursor-red.js")), false);

console.log("HF24 lulus: bug cursor sentuh persisten di Android tidak dapat muncul karena runtime cursor lama sudah dihapus.");

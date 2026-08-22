"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");

const html = read("index.html");
const css = read("assets/css/core.css") + read("assets/css/components.css");
const stability = read("assets/js/core/stability.js");
const ai = read("assets/js/core/personal-ai.js");

assert.doesNotMatch(css + stability, /--nx-vv-(?:width|height|left|top)/, "overlay tidak boleh mengikuti offset/ukuran pinch visualViewport");
assert.match(css, /#nxUniversalRoom[\s\S]*inset:0!important;width:auto!important;height:auto!important/);
assert.match(css, /overscroll-behavior-y:auto/, "pull-to-refresh browser harus diizinkan");
assert.match(css, /touch-action:pan-x pan-y/, "scroll vertikal/horizontal harus tetap diizinkan");
assert.doesNotMatch(css, /touch-action:pan-x pan-y pinch-zoom/, "pinch zoom harus dinonaktifkan");
assert.doesNotMatch(css, /#nxSafeReload/, "tombol refresh alternatif harus sudah dihapus");
assert.match(stability, /Math\.abs\(scale-1\)>0\.025/);
assert.match(stability, /function reconcileScrollLock\(forceUnlock\)/);
assert.match(stability, /body\.style\.removeProperty\("overflow"\)/);
assert.doesNotMatch(stability, /safeReload|nxSafeReload|nx_reload/, "stability tidak boleh membuat ulang tombol refresh");
assert.doesNotMatch(stability, /new MutationObserver/);
assert.match(stability, /document\.addEventListener\("click"/);
assert.match(ai, /if\(Math\.abs\(scale-1\)>0\.025\)return/);
assert.match(html, /core\.css\?v=6\.3\.18-hf14-mobile-glass1/);
assert.match(html, /stability\.js\?v=6\.3\.18-hf11\.1-health-auto/);

console.log("HF7/HF8 mobile recovery lulus: pinch zoom stabil, scroll lock pulih, pull-to-refresh browser aktif, dan tombol refresh tambahan tidak dibuat.");

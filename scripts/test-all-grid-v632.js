const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const app = read("assets/js/core/app.js");
const css = read("assets/css/core.css");
const perf = read("assets/js/core/performance.js");
const html = read("index.html");

assert.equal(pkg.version, "6.3.18");
assert.match(app, /const ALL_PAGE_SIZE = 12/);
assert.doesNotMatch(app, /allLoadObserver|rootMargin:\s*['"]320px/);
assert.match(app, /allLoadPending/);
assert.match(app, /options\.append/);
assert.match(app, /clearInactiveGrids/);
assert.match(app, /renderActiveTab/);
assert.match(app, /allTools\.slice\(0, allVisibleCount\)/);
assert.match(css, /\.tools-card\{[\s\S]*contain:none;/);
assert.match(css, /content-visibility:visible/);
assert.doesNotMatch(css, /\.tools-card\{\s*contain:layout paint style;/);
assert.match(css, /@media \(max-width:768px\)[\s\S]*\.tools-card\{[\s\S]*backdrop-filter:none!important/);
assert.match(css, /html\.nx-hero-video-manual \.video-banner video/);
assert.match(perf, /heroMode:heroMode/);
assert.match(perf, /video\.preload="metadata"/);
assert.doesNotMatch(perf, /Android\/i/);
assert.match(html, /data-nx-hero/);
assert.match(html, /HCYk\.mp4/);
assert.equal((html.match(/class="tools-card/g) || []).length, 0);
for (const id of ["allGrid", "downloaderGrid", "makerGrid", "toolsGrid", "vaultGrid", "externalGrid"]) {
    assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(app, /data-nx-status-slot/);

console.log("Nexora grid stability tests lulus: append-only batch, explicit load-more, stable card layout, dan data-driven catalog.");

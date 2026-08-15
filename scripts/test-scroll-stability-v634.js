const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('assets/js/core/app.js');
const coreCss = read('assets/css/core.css');
const componentsCss = read('assets/css/components.css');
const stability = read('assets/js/core/stability.js');
const shell = read('assets/js/core/shell.js');
const html = read('index.html');

assert.match(app, /let allRenderedCount = 0/);
assert.match(app, /let allLoadPending = false/);
assert.match(app, /container\.appendChild\(fragment\)/);
assert.doesNotMatch(app, /new IntersectionObserver/);
assert.doesNotMatch(app, /rootMargin:\s*['"]320px/);
assert.match(app, /data-nx-status-slot/);

assert.match(coreCss, /\.tools-card\{[\s\S]*contain:none;/);
assert.match(coreCss, /content-visibility:visible/);
assert.doesNotMatch(coreCss, /\.tools-card\{\s*contain:layout paint style;/);

assert.match(stability, /Status slots are rendered with the card/);
assert.doesNotMatch(stability, /new MutationObserver/);
assert.doesNotMatch(stability, /card\.appendChild\(badge\)/);

assert.match(shell, /function shouldSuppress\(\)/);
assert.match(shell, /pointer: coarse/);
assert.doesNotMatch(componentsCss, /#nx-wa-notif\{\s*display:none!important/);
assert.match(componentsCss, /#nx-wa-notif-icon,#nx-wa-notif-badge-dot\{animation:none!important;box-shadow:none!important\}/);
assert.match(componentsCss, /prefers-reduced-motion:reduce/);

assert.equal((html.match(/class="tools-card/g) || []).length, 0);
assert.match(html, /id="allGrid"[^>]*aria-busy="true"/);

console.log('Scroll stability regression tests lulus: no card containment jump, no observer auto-reflow, no late badge mutation, dan WhatsApp mobile tanpa animasi compositor berulang.');

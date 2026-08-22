const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');

const html = read('index.html');
const css = read('assets/css/core.css');
const motion = read('assets/js/core/liquid-reactor.js');
const shell = read('assets/js/core/shell.js');

assert.match(html, /liquid-reactor\.js\?v=6\.3\.18-hf17-desktop-nav1/);
for (const token of ['nxLiquidAperture', 'nx-mercury-indicator', 'nxCardForming', 'nxDropletRoomIn', 'prefers-reduced-motion:reduce']) assert.ok(css.includes(token), `CSS motion kehilangan ${token}`);
for (const token of ['requestAnimationFrame', 'IntersectionObserver', 'pointermove', 'positionIndicator', 'nexora:tool-room-open']) assert.ok(motion.includes(token), `runtime motion kehilangan ${token}`);
for (const event of ['nexora:tool-room-open', 'nexora:tool-room-close']) assert.ok(shell.includes(`new CustomEvent('${event}'`), `tool room harus memberi sinyal ${event}`);
for (const attribute of ['autoplay', 'muted', 'playsinline', 'loop']) assert.match(html, new RegExp(`<video[^>]*\\b${attribute}`, 'i'));

console.log('Liquid Reactor Step 2 tests lulus: desktop motion tetap tersedia dan jalur mobile stabil terpasang.');

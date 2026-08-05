const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const pkg = JSON.parse(read('package.json'));
const css = read('assets/css/features/tiktok.css');
const js = read('assets/js/features/tiktok.js');

assert.equal(pkg.version, '6.3.11');
assert.match(css, /\.tt-room-content\{[\s\S]*?max-width:100%!important;[\s\S]*?min-width:0!important;/);
assert.match(css, /\.tt-room-scroll\{[\s\S]*?overflow-y:auto;[\s\S]*?overflow-x:hidden;/);
assert.match(css, /\.tt-result-grid>\*\{width:100%;max-width:100%;min-width:0;/);
assert.match(css, /\.tt-result-grid\{[^}]*grid-template-columns:minmax\(0,1\.1fr\) minmax\(320px,\.9fr\)[^}]*overflow:hidden;/);
assert.match(css, /@media\(max-width:920px\)\{[\s\S]*?\.tt-result-grid\{grid-template-columns:minmax\(0,1fr\);\}/);
assert.doesNotMatch(css, /\.tt-result-grid\{grid-template-columns:1fr;/);
assert.match(css, /\.tt-preview-video,\s*#ttRoomOverlay \.tt-preview-img\{[^}]*width:100%;[^}]*max-width:100%;[^}]*object-fit:contain;/);
assert.match(css, /#ttRoomOverlay img,\s*#ttRoomOverlay video\{max-width:100%;\}/);
assert.match(css, /\.dl-media-item img,\s*#ttRoomOverlay \.dl-media-item video\{[^}]*width:100%;[^}]*max-width:100%;[^}]*object-fit:contain;/);
assert.match(css, /max-height:52svh/);
assert.match(js, /class="tt-preview-img"/);
assert.match(js, /class="tt-preview-video no-native-controls"/);

console.log('TikTok media layout regression tests lulus: preview foto, video, dan gallery tidak dapat memperlebar frame mobile.');

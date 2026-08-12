const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '6.3.17');

const loader = read('assets/js/core/lazy-loader.js');
assert.match(loader, /ASSET_VERSION\s*=\s*['"]6\.3\.17['"]/);
assert.match(loader, /var requestUrl = versioned\(url\)/);
assert.match(loader, /link\.href=requestUrl/);
assert.match(loader, /script\.src=requestUrl/);

const core = read('assets/css/core.css');
assert.match(core, /#ttRoomOverlay \.tt-preview-box\{position:relative;width:100%;overflow:hidden/);
assert.match(core, /#ttRoomOverlay \.tt-preview-video,[\s\S]*?width:100%!important;max-width:100%!important/);
assert.match(core, /#ttRoomOverlay \.dl-media-grid\{width:100%;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);

const index = read('index.html');
assert.ok(index.includes('assets/css/core.css?v=6.3.17'));
assert.ok(index.includes('assets/js/core/lazy-loader.js?v=6.3.17'));

const admin = read('admin/index.html');
assert.ok(admin.includes('id="addToolButton" data-add-tool="true"'));
assert.ok(admin.includes('../assets/js/admin/dashboard.js?v=6.3.17'));

const dashboard = read('assets/js/admin/dashboard.js');
assert.match(dashboard, /const addToolButton=\$\("#addToolButton"\);if\(addToolButton\)/);
assert.match(dashboard, /#addToolButton,\[data-add-tool\]/);

console.log('Nexora v6.3.17 tests lulus: cache-busted lazy assets, always-on TikTok media containment, and resilient Add Tool binding.');

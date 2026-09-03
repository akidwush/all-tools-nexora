const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '6.4.0');

const app = read('assets/js/core/app.js');
assert.match(app, /async function nxRemoveBackgroundLocalFirst\(/);
assert.match(app, /await nxAiRemoveBackground\(file, imageUrl/);
assert.match(app, /await nxLocalRemoveBg\(file, imageUrl\)/);
assert.match(app, /Model AI memakai mode ringan untuk Android/);
assert.match(app, /isnet_quint8/);
assert.match(app, /staticimgly\.com\/@imgly\/background-removal-data\/1\.7\.0\/dist/);

const source = read('assets/js/features/source-features.js');
assert.doesNotMatch(source, /renderFakeDev|nxBuildFakeDevFallback|api\.ikyyxd\.my\.id\/canvas\/fakedev/);
assert.equal(fs.existsSync(path.join(root,'assets/js/features/stable-maker-local.js')),false);

const sourceCss = read('assets/css/features/source-tools.css');
assert.match(sourceCss, /\.nx-source-status\.warning\{/);
const index = read('index.html');
assert.ok(index.includes('assets/js/core/app.js?v=6.4.0'));
assert.ok(index.includes('assets/js/core/lazy-loader.js?v=6.4.0'));

console.log('Nexora v6.4.0 tests lulus: Remove BG local-first aktif; maker provider rapuh sudah dibuang.');

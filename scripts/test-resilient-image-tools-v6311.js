const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '6.3.12');

const app = read('assets/js/core/app.js');
assert.match(app, /async function nxRemoveBackgroundLocalFirst\(/);
assert.match(app, /await nxAiRemoveBackground\(file, imageUrl/);
assert.match(app, /await nxLocalRemoveBg\(file, imageUrl\)/);
assert.match(app, /AI lokal menjadi mesin utama; API eksternal hanya dipakai sebagai cadangan terakhir/);
assert.match(app, /const output = await nxRemoveBackgroundLocalFirst\(file, url, updateStatus\)/);
assert.match(app, /updateStatus\('AI lokal gagal\. Mencoba API cadangan…'\)/);
assert.match(app, /maxAttempts:\s*6/);
assert.match(app, /nexoraTimeoutMs:\s*timeoutMs/);
assert.ok(
  app.indexOf('const output = await nxRemoveBackgroundLocalFirst') <
  app.indexOf("updateStatus('AI lokal gagal. Mencoba API cadangan…')"),
  'Remove BG harus mencoba mesin lokal sebelum API cadangan'
);

const source = read('assets/js/features/source-features.js');
assert.match(source, /async function nxBuildFakeDevFallback\(/);
assert.match(source, /const blob=await nxBuildFakeDevFallback\(nama,bio,image\)/);
assert.match(source, /generator lokal aktif/);
assert.match(source, /nexoraTimeoutMs:10000/);
assert.doesNotMatch(source, /Gagal mengambil FakeDev: \"\+error\.message/);

const sourceCss = read('assets/css/features/source-tools.css');
assert.match(sourceCss, /\.nx-source-status\.warning\{/);

const index = read('index.html');
assert.ok(index.includes('assets/js/core/app.js?v=6.3.12'));
assert.ok(index.includes('assets/js/core/lazy-loader.js?v=6.3.12'));

console.log('Nexora v6.3.12 tests lulus: Remove BG local-first dan FakeDev local fallback aktif.');

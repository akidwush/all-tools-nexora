const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const loader = read('assets/js/core/lazy-loader.js');
const tiktok = read('assets/js/features/tiktok.js');

assert.equal(pkg.version, '6.3.11');
assert.match(loader, /getcode:'openGetCodeRoom',tiktok:'openTiktokRoom'/);
assert.match(loader, /ASSET_VERSION\s*=\s*['"]6\.3\.11['"]/);
assert.match(tiktok, /var lightVideoUrl=stdUrl\|\|wmUrl\|\|hdUrl;/);
assert.match(tiktok, /previewUrl:lightVideoUrl,title:'TikTok MP4 HD'/);
assert.match(tiktok, /choices\.some\(function\(choice\)\{ return choice\.id==='std'; \}\) \? 'std'/);
assert.match(tiktok, /new AbortController\(\)/);
assert.match(tiktok, /signal:requestController\.signal/);
assert.match(tiktok, /window\.cleanupTiktokRuntime=cleanupTiktokRuntime/);
assert.match(tiktok, /media\.pause\(\)/);
assert.match(tiktok, /media\.removeAttribute\('src'\)/);
assert.match(tiktok, /if\(content\) content\.innerHTML='';/);
assert.match(tiktok, /window\.nxEnhanceTiktokPreviewControls/);
assert.doesNotMatch(tiktok, /mo\.observe\(document\.body/);

console.log('TikTok runtime hotfix tahap 1 tetap lulus: room dispatcher, preview ringan, abort request, cleanup media, dan controller manual.');

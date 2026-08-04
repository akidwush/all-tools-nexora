const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const sandbox = {
  window: { dispatchEvent() {} },
  CustomEvent: function CustomEvent(name) { this.type = name; },
  console
};
vm.runInNewContext(read('assets/js/core/tool-registry.js'), sandbox, { filename: 'tool-registry.js' });
const registry = sandbox.window.NexoraToolRegistry;

assert.equal(registry.version, '6.3.7');
assert.equal(registry.get('tiktokhd').restricted, false);
assert.equal(registry.get('tiktokhd').mode, 'external');
assert.equal(registry.get('tiktokhd').handler, 'openTikTokHdUpload');
assert.equal(registry.get('webencryption').restricted, false);
assert.equal(registry.get('webencryption').mode, 'module');
assert.equal(registry.get('webencryption').module, 'web-encryption');
assert.equal(registry.get('webencryption').handler, 'renderWebEncryption');

const shell = read('assets/js/core/shell.js');
assert.ok(shell.includes('window.openTikTokHdUpload'));
assert.ok(shell.includes('https://www.tiktok.com/tiktokstudio'));
assert.ok(!shell.includes('LOCKED_IDS'));
assert.ok(!shell.includes('requestDeveloperAccess'));

const app = read('assets/js/core/app.js');
assert.ok(app.includes("['downloader', 'maker', 'tools', 'vault', 'external']"));
assert.ok(app.includes("case 'webencryption': renderWebEncryption(body); break;"));
assert.ok(app.includes('window.openTikTokHdUpload && window.openTikTokHdUpload()'));

const index = read('index.html');
assert.ok(!index.includes('data-nexus-access-locked'));
// Catalog cards are intentionally rendered from app.js; index.html keeps only
// empty grid containers to avoid parsing a duplicate static catalog.
assert.ok(app.includes("id: 'tiktokhd'"));
assert.ok(app.includes("id: 'webencryption'"));

const manifest = JSON.parse(read('assets/module-manifest.json'));
assert.equal(manifest.tools.webencryption, 'web-encryption');
assert.deepEqual(manifest.modules['web-encryption'].js, ['assets/js/features/web-encryption.js']);
assert.deepEqual(manifest.modules['web-encryption'].css, ['assets/css/features/web-encryption.css']);

const encryption = read('assets/js/features/web-encryption.js');
for (const token of ['AES-GCM', 'PBKDF2', '180000', 'renderWebEncryption', 'crypto.subtle.encrypt', 'protectedDocument']) {
  assert.ok(encryption.includes(token), `Web Encryption belum lengkap: ${token}`);
}

const health = read('lib/tool-health.js');
assert.ok(health.includes('module-web-encryption'));
assert.ok(!health.includes('name: "Web Encryption", category: "external", target: { key: "core-shell", type: "restricted"'));

console.log('Nexora compatibility tests lulus: Upload TikTok HD dan Web Encryption sudah terbuka tanpa access lock.');

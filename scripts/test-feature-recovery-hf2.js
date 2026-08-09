const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
assert.doesNotMatch(index, /id="nxToolHealth"/);
assert.match(index, /assets\/js\/core\/lazy-loader\.js\?v=6\.3\.13-hf6/);

const app = read('assets/js/core/app.js');
assert.match(app, /async function nxLoadBgRemovalModule/);
assert.match(app, /isnet_quint8/);
assert.match(app, /device:\s*'cpu'/);
assert.match(app, /Model AI terlalu lama merespons/);
assert.match(app, /new Uint32Array\(w \* h\)/);

const registry = read('assets/js/core/tool-registry.js');
assert.match(registry, /\["removebg","Remove BG","local",null,"renderRemovebg",null\]/);

const vercel = JSON.parse(read('vercel.json'));
assert.ok(vercel.rewrites.some(item => item.source === '/api/vdeploy' && /mode=vdeploy/.test(item.destination)));
const healthApi = read('api/health.js');
assert.match(healthApi, /handleVDeploy/);

const deploy = require('../lib/vdeploy');
assert.equal(deploy.projectName('  Hello Project!!  '), 'hello-project');
assert.throws(() => deploy.extractZip(Buffer.from('not-a-zip')), /ZIP_INVALID|ZIP_EMPTY/);

console.log('HF2 lulus: kartu health publik dihapus, Remove BG diperkuat, dan backend Deploy Center dipulihkan.');

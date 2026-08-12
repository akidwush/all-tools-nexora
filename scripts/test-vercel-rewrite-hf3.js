const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
assert.ok(Array.isArray(config.rewrites), 'rewrites harus array');
assert.ok(config.rewrites.some((item) => item?.source === '/api/vdeploy' && String(item?.destination || '').includes('mode=vdeploy')),
  'rewrite /api/vdeploy harus mengarah ke mode=vdeploy');

// Guard: check-project tidak boleh kembali ke pencarian substring whitespace-sensitive.
const audit = fs.readFileSync(path.join(root, 'scripts/check-project.js'), 'utf8');
assert.doesNotMatch(audit, /vercelConfig\.includes\(['"]\\?"source\\?": \\"\/api\/vdeploy/);
assert.match(audit, /const vercel = json\("vercel\.json"\)/);
assert.match(audit, /for \(const rewrite of vercel\.rewrites \|\| \[\]\)/);
new vm.Script(audit, { filename: 'scripts/check-project.js' });

console.log('HF3 lulus: rewrite VDeploy divalidasi secara semantik, bukan berdasarkan whitespace JSON.');

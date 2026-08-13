const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const visual = read('assets/js/admin/visual-qa.js');
const toolsApi = read('api/admin/tools.js');
const dashboard = read('assets/js/admin/dashboard.js');
const app = read('assets/js/core/app.js');
const html = read('admin/index.html');

assert.equal(pkg.version, '6.3.18');
for (const token of ['sanitizeCanvasCss', 'renderFrameCanvas', 'canvasToBlob', 'safeFallback']) assert.ok(visual.includes(token), `Visual QA harus memuat ${token}`);
assert.match(visual, /removeAllUrls/);
assert.match(visual, /@font-face/);
for (const token of ['POST', 'PATCH', 'DELETE', 'TOOL_ID_EXISTS', 'BUILTIN_TOOL_PROTECTED', 'metadata', 'external-link', 'verifyMutationRequest']) assert.ok(toolsApi.includes(token), `Tools API harus memuat ${token}`);
for (const token of ['addToolButton', 'openNewToolEditor', 'data-delete-tool', 'method:creating?"POST":"PATCH"', 'method:"DELETE"']) assert.ok(dashboard.includes(token), `Dashboard harus memuat ${token}`);
for (const token of ['ID unik', 'Tambah Tool', 'editToolId', 'URL eksternal']) assert.ok(html.includes(token), `HTML admin harus memuat ${token}`);
assert.match(app, /if\s*\(!base\s*&&\s*!row\.external_url\)\s*continue/);
assert.match(app, /custom: !base/);
assert.match(app, /decodeURIComponent\('/);
assert.match(app, /escapeToolHtml/);

console.log('Canvas dan tool CRUD tests lulus: screenshot cross-origin punya fallback aman dan tool kustom dapat dikelola dari dashboard.');

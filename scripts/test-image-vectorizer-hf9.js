const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'assets/js/features/image-vectorizer.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/features/image-vectorizer.css'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'assets/vendor/vtracer/vtracer-loader.js'), 'utf8');

for (const token of [
  'VTRACER_LOCAL',
  '/assets/vendor/vtracer/vtracer-loader.js?v=hf11.1',
  'ColorImageConverter',
  'BinaryImageConverter',
  'new_with_string',
  'converter.tick()',
  'quantizeCanvas',
  'binarizeCanvas',
  'optimizeSvgText',
  'fidelityScore',
  'Adaptive HQ',
  'NO DAILY LIMIT',
  'Local vectorization',
  'function applyPreset(',
  'function buildParams(',
  'length_threshold:clamp(length,3.5,10)',
  'filter_speckle:Math.round(noise*noise)',
  'color_precision:Math.round(clamp(8-colorPrecision,0,7))',
  'path_precision:pathPrecision',
  'Cutout mosaic',
  'fit 100%'
]) assert.ok(ui.includes(token), `VTracer frontend missing: ${token}`);

for (const token of [
  'initVTracer',
  'WebAssembly.instantiateStreaming',
  'vtracer_webapp_bg.wasm',
  '__wbg_set_wasm'
]) assert.ok(loader.includes(token), `VTracer loader missing: ${token}`);

for (const forbidden of [
  '/api/tool-health?mode=image-vectorizer',
  'uploadDirect',
  'pollResult',
  "action:'prepare'",
  "action:'start'",
  "action:'result'",
  'FREECONVERT_API_KEY',
  'FREECONVERT READY',
  'FreeConvert sedang',
  'vtracer-webapp@0.4.0/+esm',
  'esm.sh/vtracer-webapp',
  'esm.run/vtracer-webapp'
]) assert.ok(!ui.includes(forbidden), `Cloud/CDN dependency still present: ${forbidden}`);

for (const file of [
  'assets/vendor/vtracer/vtracer-loader.js',
  'assets/vendor/vtracer/vtracer_webapp_bg.js',
  'assets/vendor/vtracer/vtracer_webapp_bg.wasm'
]) assert.ok(fs.existsSync(path.join(root, file)), `Vendor file missing: ${file}`);

for (const token of [
  'overflow-x:clip',
  '100dvh',
  '@media(max-width:720px)',
  '@media(max-width:430px)',
  'width:auto!important',
  'max-height:min(68dvh,720px)'
]) assert.ok(css.includes(token), `CSS missing: ${token}`);

console.log('Image Vectorizer HF11.2 regression lulus: self-hosted VTracer WASM, build-safe ESM vendor, adaptive tuning, tanpa FreeConvert API/CDN bundle.');

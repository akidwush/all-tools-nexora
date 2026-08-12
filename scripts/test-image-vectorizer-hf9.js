const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'assets/js/features/image-vectorizer.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/features/image-vectorizer.css'), 'utf8');

for (const token of [
  'VTRACER_SOURCES',
  'vtracer-webapp@0.4.0/+esm',
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

for (const forbidden of [
  '/api/tool-health?mode=image-vectorizer',
  'uploadDirect',
  'pollResult',
  "action:'prepare'",
  "action:'start'",
  "action:'result'",
  'FREECONVERT_API_KEY',
  'FREECONVERT READY',
  'FreeConvert sedang'
]) assert.ok(!ui.includes(forbidden), `Cloud dependency still present in frontend: ${forbidden}`);

for (const token of [
  'overflow-x:clip',
  '100dvh',
  '@media(max-width:720px)',
  '@media(max-width:430px)',
  'width:auto!important',
  'max-height:min(68dvh,720px)'
]) assert.ok(css.includes(token), `CSS missing: ${token}`);

console.log('Image Vectorizer HF11 regression lulus: VTracer WASM lokal, adaptive palette, parameter range aman, post-SVG optimizer, fidelity score, tanpa FreeConvert API pipeline.');

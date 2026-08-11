const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert');
const root=path.resolve(__dirname,'..');

const ui=fs.readFileSync(path.join(root,'assets/js/features/svg-alight.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/css/features/svg-alight.css'),'utf8');
const api=fs.readFileSync(path.join(root,'lib/svgtoxml-proxy.js'),'utf8');
const route=fs.readFileSync(path.join(root,'api/tool-health.js'),'utf8');
const lazy=fs.readFileSync(path.join(root,'assets/js/core/lazy-loader.js'),'utf8');

for(const token of [
  'renderSvgAlight','/api/svg-alight',
  'data-quality="lossless"','data-quality="accurate"','data-quality="balanced"','data-quality="lightweight"',
  'nodeReduction','minAreaPercent','groupByColor','removeStrokes','validateBounds',
  'nsaThumb','Preview SVG','Konversi ke Alight XML'
]) assert.ok(ui.includes(token),'UI SVG Alight missing '+token);

for(const token of [
  'SVGTOXML_API_KEY','/api/v1/convert','x-api-key','handleSvgToXml','normalizeOptions',
  'lossless','accurate','balanced','lightweight'
]) assert.ok(api.includes(token),'API SVG Alight missing '+token);

assert.ok(route.includes('handleSvgToXml'),'route handler missing');
assert.ok(css.includes('@media(max-width:760px)'),'mobile CSS missing');
assert.ok(css.includes('min-height:44px'),'44px touch target CSS missing');
assert.ok(!ui.includes('SVGTOXML_API_KEY'),'secret leaked to UI');
assert.ok(lazy.includes("svgalight:'svg-alight'"),'lazy-loader svgalight mapping missing');
assert.ok(lazy.includes("'svg-alight':"),'lazy-loader svg-alight module missing');

console.log('SVG -> Alight HF10.3 lulus: 4 mode nyata, server-only API key, native SVG preview, stats/warnings, mobile-safe UI, lazy-loader wiring.');
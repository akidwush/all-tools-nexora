const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert');const root=path.resolve(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'assets/js/features/svg-alight.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/css/features/svg-alight.css'),'utf8');const api=fs.readFileSync(path.join(root,'lib/svgtoxml-proxy.js'),'utf8');const route=fs.readFileSync(path.join(root,'api/tool-health.js'),'utf8');
for(const t of ['renderSvgAlight','/api/svg-alight','quality:\'lossless\'','NEXORA MUSE','Konversi ke Alight XML'])assert.ok(ui.includes(t),'UI missing '+t);
for(const t of ['SVGTOXML_API_KEY','/api/v1/convert','x-api-key','handleSvgToXml'])assert.ok(api.includes(t),'API missing '+t);
assert.ok(route.includes('handleSvgToXml'),'route handler missing');assert.ok(css.includes('@media(max-width:760px)'),'mobile CSS missing');assert.ok(!ui.includes('SVGTOXML_API_KEY'),'secret leaked to UI');

const lazy=fs.readFileSync(path.join(root,'assets/js/core/lazy-loader.js'),'utf8');
const indexHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/module-manifest.json'),'utf8'));
for(const t of [
  "'svg-alight': {css:['assets/css/features/svg-alight.css'],js:['assets/js/features/svg-alight.js']}",
  "svgalight:'svg-alight'",
  "ASSET_VERSION = '6.3.13-hf10.2'"
]) assert.ok(lazy.includes(t),'Lazy loader SVG Alight missing '+t);
assert.equal(manifest.tools.svgalight,'svg-alight','Module manifest svgalight mapping missing');
assert.ok(manifest.modules['svg-alight'],'Module manifest svg-alight module missing');
assert.ok(indexHtml.includes('lazy-loader.js?v=6.3.13-hf10.2'),'Lazy-loader cache bust HF10.2 missing');
assert.ok(indexHtml.includes('app.js?v=6.3.13-hf10.2'),'App cache bust HF10.2 missing');
assert.ok(indexHtml.includes('shell.js?v=6.3.13-hf10.2'),'Shell cache bust HF10.2 missing');
const app=fs.readFileSync(path.join(root,'assets/js/core/app.js'),'utf8');
assert.ok(app.includes("case 'svgalight': renderSvgAlight(body);"),'Dispatcher svgalight missing');

console.log('SVG -> Alight Motion Anime Atelier test lulus: server-only key, API v1 proxy, lossless conversion, anime UI, mobile layout.');

const fs2=require("node:fs");
const path2=require("node:path");
assert.ok(
  fs2.existsSync(path2.join(__dirname,"..","database","migrations","014_nexora_svg_alight.sql")),
  "Migration 014 SVG Alight belum tersedia"
);

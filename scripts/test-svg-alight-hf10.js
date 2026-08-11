const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert');const root=path.resolve(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'assets/js/features/svg-alight.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/css/features/svg-alight.css'),'utf8');const api=fs.readFileSync(path.join(root,'lib/svgtoxml-proxy.js'),'utf8');const route=fs.readFileSync(path.join(root,'api/tool-health.js'),'utf8');
for(const t of ['renderSvgAlight','/api/svg-alight','quality:\'lossless\'','NEXORA MUSE','Konversi ke Alight XML'])assert.ok(ui.includes(t),'UI missing '+t);
for(const t of ['SVGTOXML_API_KEY','/api/v1/convert','x-api-key','handleSvgToXml'])assert.ok(api.includes(t),'API missing '+t);
assert.ok(route.includes('handleSvgToXml'),'route handler missing');assert.ok(css.includes('@media(max-width:760px)'),'mobile CSS missing');assert.ok(!ui.includes('SVGTOXML_API_KEY'),'secret leaked to UI');
console.log('SVG -> Alight Motion Anime Atelier test lulus: server-only key, API v1 proxy, lossless conversion, anime UI, mobile layout.');

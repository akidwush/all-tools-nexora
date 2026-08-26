const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("assets/js/core/app.js");
const stability = read("assets/js/core/stability.js");
const lazy = read("assets/js/core/lazy-loader.js");
const registry = read("assets/js/core/tool-registry.js");
const shell = read("assets/js/core/shell.js");
const source = read("assets/js/features/source-features.js");
const deploy = read("assets/js/features/deploy-center.js");
const deployCss = read("assets/css/features/deploy-center.css");
const manifest = JSON.parse(read("assets/module-manifest.json"));

for (const file of [
  "assets/js/core/app.js",
  "assets/js/core/stability.js",
  "assets/js/core/lazy-loader.js",
  "assets/js/core/tool-registry.js",
  "assets/js/core/shell.js",
  "assets/js/features/source-features.js",
  "assets/js/features/deploy-center.js"
]) {
  assert.doesNotThrow(() => new Function(read(file)), `${file} harus valid secara sintaks`);
}

// Semua kartu publik dapat dioperasikan dengan mouse maupun keyboard.
assert.match(app, /role="button" tabindex="0" aria-label="Buka/);
assert.match(app, /event\.key !== 'Enter' && event\.key !== ' '/);
assert.doesNotMatch(app, /isExternal \|\| item\.link/);

// Status kesehatan harus dimuat walau panel health lama sudah tidak ada.
assert.match(stability, /function initializeStatus\(\)/);
assert.match(stability, /schedule\(function\(\)\{loadHealth\(false\);\}/);
assert.match(stability, /\/api\/tool-health\?refresh=auto/);
assert.doesNotMatch(stability, /refresh="\+\(force\?"force"/);

// Aplikasi eksternal tidak lagi mengunduh bundle lokal ratusan KB/MB.
assert.equal(manifest.tools.zxvai, undefined);
assert.equal(manifest.tools.fotolink, undefined);
assert.doesNotMatch(lazy, /zxvai:'openNexusAI'/);
assert.doesNotMatch(lazy, /fotolink:'openPix'/);
assert.match(registry, /\["zxvai","ZxVAI","external",null,null,"https:\/\/zxvaiapk\.netlify\.app\/"\]/);
assert.match(registry, /\["fotolink","Foto To Link","external",null,null,"https:\/\/pixvault-bykz\.netlify\.app\/"\]/);

// Fitur yang bergantung API memiliki jalur pemulihan nyata.
assert.match(source, /async function nxBuildCertificateFallback\(nama\)/);
assert.match(source, /<h2>Sertifikat Custom<\/h2>/);
assert.match(source, /renderer sertifikat lokal aktif/);
assert.doesNotMatch([app, registry, shell, source].join("\n"), /Sertifikat Tolol/);
assert.match(deploy, /fallback\.id="deployFallback"/);
assert.match(deploy, /https:\/\/vercel\.com\/new/);
assert.match(deploy, /https:\/\/app\.netlify\.com\/drop/);
assert.match(deploy, /Salin perintah Termux/);
assert.match(deployCss, /#deployFallback\.show\{display:grid\}/);

// Batas gambar mencegah buffer berukuran ekstrem pada perangkat Android.
assert.match(app, /const patchSize = profile\.lowPower \? 32 : \(profile\.mobileLike \? 48 : 64\)/);
assert.match(app, /const padding = 4/);
assert.match(app, /const maxSide = profile\.lowPower \? 1280 : \(profile\.mobileLike \? 1440 : 1800\)/);
assert.match(app, /const max = profile\.lowPower \? 1100 : \(profile\.mobileLike \? 1280 : 1500\)/);
assert.match(app, /if \(!profile\.lowPower\)/);

assert.ok(read("index.html").includes("v=6.4.0"));
assert.ok(fs.existsSync(path.join(root, "database/migrations/007_public_tool_cleanup.sql")));

console.log("Nexora HF3 recovery tests lulus: status kartu, routing, fallback, aksesibilitas, cache, dan batas memori aktif.");

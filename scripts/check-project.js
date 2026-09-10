"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
require("./sync-config.js").syncConfig({ silent: true });
const failures = [];
const fail = (message) => failures.push(message);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => {
  try { return JSON.parse(read(relative)); }
  catch (error) { fail(`${relative}: JSON tidak valid (${error.message})`); return {}; }
};
const sameSet = (left, right) => left.length === right.length && left.every((item) => right.includes(item));

// Frozen Comic Reader architecture. Any accidental replacement/revert aborts the build.
const COMIC_READER_LOCK = Object.freeze({
  "assets/js/features/comic-reader.js": "9f751be2e67f9ce72518f9d6d2544c4df31ea01b96dac617555934d68bb0cacc",
  "assets/comic-reader/index.html": "c13f181903ff4d377e199866418070bd5615bb9d59b21a729c8d0955b1e160c9",
  "assets/comic-reader/app.css": "2a6ca41369f11c8583ec2f000408deb3834d9725b08d683416d5d3092142e9a6",
  "assets/comic-reader/app.js": "5fb8b6df36c1b0fd07e7b22b4d87654b26ba7a0f6c2b8524f2829d96d3ecbdfd",
  "assets/css/features/comic-reader.css": "61e079135af952ecebfa5a10e3a88c01cc9eb441bf4c7aa5dc70df6dd2007b2a"
});
for (const [relative, expected] of Object.entries(COMIC_READER_LOCK)) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) { fail(`COMIC READER LOCK: file hilang: ${relative}`); continue; }
  const actual = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  if (actual !== expected) fail(`COMIC READER LOCK: ${relative} berubah. Build diblokir agar UI/engine tidak tertimpa.`);
}

const abuseShieldSource = read("lib/api-abuse-shield.js");
if (!/FIRST_PARTY_PROOF_REQUIRED/.test(abuseShieldSource)) fail("API Abuse Shield kehilangan fail-closed no-origin guard.");
if (!/rpc\/nexora_consume_api_quota/.test(abuseShieldSource)) fail("API Abuse Shield kehilangan durable quota RPC.");
if (!/HttpOnly; SameSite=Strict/.test(abuseShieldSource)) fail("API Abuse Shield cookie tidak dikunci HttpOnly + SameSite=Strict.");
if (!fs.existsSync(path.join(root, "database/migrations/034_api_abuse_shield.sql"))) fail("Migration 034 API Abuse Shield hilang.");

// Frozen API Abuse Shield core. A refactor must deliberately update this lock.
const API_ABUSE_SHIELD_LOCK = Object.freeze({
  "lib/api-abuse-shield.js": "b933897716c416f640aa43ead1425d813111c708fcd27d096bb02ccd6e1fc311",
  "database/migrations/034_api_abuse_shield.sql": "d9ed96c73bbaf6d01ff8463a333cee774eb689e5d5ac48b7be9221d40b706906"
});
for (const [relative, expected] of Object.entries(API_ABUSE_SHIELD_LOCK)) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) { fail(`API ABUSE SHIELD LOCK: file hilang: ${relative}`); continue; }
  const actual = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  if (actual !== expected) fail(`API ABUSE SHIELD LOCK: ${relative} berubah. Build diblokir agar anti-clone/quota tidak tertimpa.`);
}

const packageJson = json("package.json");
const version = String(packageJson.version || "");
const vercel = json("vercel.json");
const routeManifest = json("route-manifest.json");
const moduleManifest = json("assets/module-manifest.json");
let projectConfig = null;
try { projectConfig = require(path.join(root, "assets/config.js")); }
catch (error) { fail(`assets/config.js gagal dimuat (${error.message})`); }

const configTools = ["downloader", "maker", "tools", "vault", "external"].flatMap((category) =>
  (Array.isArray(projectConfig?.tools?.[category]) ? projectConfig.tools[category] : []).map((tool) => ({ ...tool, category }))
);
const configIds = configTools.map((tool) => tool.id);
if (projectConfig?.version !== version) fail(`Versi config ${projectConfig?.version || "kosong"} tidak sama dengan package ${version}.`);
if (!configIds.length || new Set(configIds).size !== configIds.length) fail("ID tool pada assets/config.js kosong atau duplikat.");
for (const tool of configTools) {
  if (!tool.id || !tool.name || !tool.description || !tool.runtime || !tool.health) fail(`Konfigurasi tool tidak lengkap: ${tool.id || "(tanpa id)"}.`);
  if (tool.runtime?.module && !projectConfig.modules?.[tool.runtime.module]) fail(`Modul ${tool.runtime.module} untuk ${tool.id} belum didefinisikan.`);
}

const required = [
  "index.html", "about.html", "feedback.html", "favicon.svg", "README.md", "CHANGELOG.md",
  "docs/SECURITY_AUDIT.md", "serve-local.js", "middleware.js", "vercel.json", "route-manifest.json",
  "assets/config.js", "assets/module-manifest.json", "assets/js/core/tool-registry.js", "assets/js/core/app.js",
  "api/health.js", "api/feedback.js", "api/audit.js", "api/tool-health.js",
  "lib/database.js", "lib/memory-store.js", "lib/tool-health.js", "lib/vdeploy.js",
  "lib/gemini-config.js",
  "lib/request-security.js", "lib/server-access-policy.js", "lib/api-abuse-shield.js", "scripts/audit-public-build.js",
  "lib/text-to-pdf.js",
  "lib/freeconvert-vectorizer.js", "lib/sitegrabber-proxy.js",
  "lib/downloader-service.js", "database/schema.sql"
];
for (const relative of required) if (!fs.existsSync(path.join(root, relative))) fail(`File wajib hilang: ${relative}`);

function walk(directory) {
  const output = [];
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "public", ".git"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute));
    else output.push(absolute);
  }
  return output;
}

const middlewareFile = path.join(root, "middleware.js");
const javascriptFiles = walk(root).filter((file) => /\.js$/i.test(file) && file !== middlewareFile);
for (const file of javascriptFiles) {
  try { new vm.Script(fs.readFileSync(file, "utf8"), { filename: path.relative(root, file) }); }
  catch (error) { fail(`Sintaks JavaScript gagal: ${path.relative(root, file)} (${error.message})`); }
}


const routingMiddleware = read("middleware.js");
try {
  const parseableMiddleware = routingMiddleware.replace(
    /export\s+default\s+async\s+function\s+middleware/,
    "async function middleware"
  );
  new vm.Script(parseableMiddleware, { filename: "middleware.js" });
} catch (error) {
  fail(`middleware.js sintaks tidak valid (${error.message})`);
}
for (const token of [
  "PUBLIC_ACCESS_LOCKED",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "app_settings?select=value&key=eq.control_plane",
  'path.startsWith("/admin/")',
  'path.startsWith("/api/admin/")',
  "isAllowedStaticAsset",
  "/assets/apps/",
  "/assets/comic-reader/",
  "/assets/visuals/demos/",
  "SAFE_STATIC_ASSET_EXTENSIONS",
  "status: 503",
  "fail-closed"
]) {
  if (!routingMiddleware.includes(token)) fail(`Routing Middleware kehilangan global PUBLIC_ACCESS_LOCKED contract: ${token}`);
}

if (/path\.startsWith\(["']\/assets\/["']\)\s*\|\|/.test(routingMiddleware)) {
  fail("Routing Middleware V5 masih membypass seluruh /assets/ tanpa klasifikasi.");
}

for (const relative of ["index.html", "about.html", "feedback.html", "admin/index.html", "admin/login.html"]) {
  const html = read(relative);
  if (!/<\/body>\s*<\/html>\s*$/i.test(html)) fail(`${relative}: penutup body/html tidak lengkap.`);
}

for (const relative of ["index.html", "admin/index.html", "admin/login.html"]) {
  const html = read(relative);
  for (const match of html.matchAll(/(?:src|href)=["']([^"']*assets\/[^"']+)["']/gi)) {
    if (!match[1].includes(`?v=${version}`)) fail(`${relative}: asset tanpa versi ${version}: ${match[1]}`);
  }
}

let registry = null;
try {
  const sandbox = { window: { dispatchEvent() {} }, CustomEvent: function CustomEvent() {} };
  vm.runInNewContext(read("assets/config.js"), sandbox, { filename: "config.js" });
  vm.runInNewContext(read("assets/js/core/tool-registry.js"), sandbox, { filename: "tool-registry.js" });
  registry = sandbox.window.NexoraToolRegistry;
} catch (error) { fail(`Tool registry tidak dapat dievaluasi: ${error.message}`); }

const registryRows = registry?.list?.() || [];
const registryIds = registryRows.map((tool) => tool.id);
if (registry?.version !== version) fail(`Versi registry ${registry?.version || "kosong"} tidak sama dengan package ${version}.`);
if (!registryIds.length || new Set(registryIds).size !== registryIds.length) fail("ID tool registry kosong atau duplikat.");
if (!sameSet(configIds, registryIds)) fail(`Katalog config tidak sama dengan registry (${configIds.length}/${registryIds.length}).`);

try {
  const healthIds = require(path.join(root, "lib/tool-health.js")).TOOL_CATALOG.map((tool) => tool.id);
  if (!sameSet(registryIds, healthIds)) fail(`Katalog health tidak sama dengan registry (${healthIds.length}/${registryIds.length}).`);
} catch (error) { fail(`Katalog health gagal dimuat: ${error.message}`); }

const schema = read("database/schema.sql");
const seedBlock = schema.match(/insert into public\.tools[\s\S]*?on conflict \(id\) do nothing;/i)?.[0] || "";
const seedIds = [...seedBlock.matchAll(/^\s*\('([a-z0-9_-]+)'/gm)].map((match) => match[1]);
const databaseOptionalIds = new Set(["aisong", "aivideo", "smartcutout", "placeholderstudio"]);
const databaseBackedRegistryIds = registryIds.filter((id) => !databaseOptionalIds.has(id));
const unknownSeedIds = seedIds.filter((id) => !databaseBackedRegistryIds.includes(id));
if (unknownSeedIds.length) fail(`Seed database memiliki tool yang tidak dikenal: ${unknownSeedIds.join(", ")}.`);

const moduleTools = Object.keys(moduleManifest.tools || {});
const expectedModuleTools = registryRows.filter((tool) => tool.module).map((tool) => tool.id);
if (!sameSet(moduleTools, expectedModuleTools)) fail("Pemetaan tools pada module-manifest tidak sama dengan registry.");
for (const [name, module] of Object.entries(moduleManifest.modules || {})) {
  for (const relative of [...(module.css || []), ...(module.js || [])]) {
    if (!fs.existsSync(path.join(root, relative))) fail(`Asset modul ${name} hilang: ${relative}`);
  }
}

for (const removed of [
  "assets/js/core/cursor-red.js", "assets/css/cursor-red.css",
  "assets/js/features/nexora-ai.js", "assets/css/features/nexora-ai.css",
  "assets/js/features/pix-vault.js", "assets/css/features/pix-vault.css",
  "assets/js/features/big-image.js", "assets/css/features/big-image.css",
  "lib/bigjpg-upscaler.js"
]) if (fs.existsSync(path.join(root, removed))) fail(`Modul mati/berisiko masih tersimpan: ${removed}`);

const embeddedFrames = [
  "assets/js/features/imported-tools.js",
  "assets/js/features/tiktok-quote.js", "assets/js/features/virus-scan.js"
];
for (const relative of embeddedFrames) {
  const source = read(relative);
  if (!/<iframe[^>]+sandbox=/i.test(source)) fail(`${relative}: iframe srcdoc belum diberi sandbox.`);
  if (/allow-same-origin/i.test(source)) fail(`${relative}: sandbox srcdoc masih memiliki allow-same-origin.`);
}
const standaloneApps = [
  ["assets/js/features/imported-tools.js", ["/assets/apps/ml-tools/index.html?v=standalone-v1", "/assets/apps/prompt-generator/index.html?v=standalone-v1", "/assets/apps/quote-generator/index.html?v=standalone-v1", "/assets/apps/cari-fakta/index.html?v=standalone-v1"]],
  ["assets/js/features/tiktok-quote.js", ["/assets/apps/tiktok-quote/index.html?v=standalone-v1"]],
  ["assets/js/features/virus-scan.js", ["/assets/apps/virus-scan/index.html?v=standalone-v1"]],
  ["assets/js/features/unban-whatsapp.js", ["/assets/apps/unban-whatsapp/index.html?v=standalone-v1"]],
  ["assets/js/features/deploy-center.js", ["/assets/apps/deploy-center/index.html?v=standalone-v1"]]
];
for (const [relative, urls] of standaloneApps) {
  const source = read(relative);
  if (/(?:_B64\b|srcdoc\s*=|decodeUtf8Base64|decodeBase64|decodeVirusApp|URL\.createObjectURL\(new Blob)/.test(source)) fail(`${relative}: legacy embedded payload kembali terdeteksi.`);
  for (const url of urls) if (!source.includes(url)) fail(`${relative}: URL canonical hilang: ${url}`);
}
for (const relative of [
  "assets/apps/ml-tools/index.html", "assets/apps/prompt-generator/index.html",
  "assets/apps/quote-generator/index.html", "assets/apps/cari-fakta/index.html", "assets/apps/tiktok-quote/index.html",
  "assets/apps/unban-whatsapp/index.html", "assets/apps/virus-scan/index.html", "assets/apps/deploy-center/index.html",
  "assets/apps/manifest.json"
]) if (!fs.existsSync(path.join(root, relative))) fail(`Standalone canonical asset hilang: ${relative}`);

const comicShell = read("assets/js/features/comic-reader.js");
if (!/COMIC_APP_URL\s*=\s*["']\/assets\/comic-reader\/index\.html\?v=standalone-v1["']/.test(comicShell)) fail("Comic Reader tidak memakai app standalone canonical.");
if (/COMIC_READER_APP_B64|srcdoc|nxComicApiBridgeHandler|nx-comic-api-request/.test(comicShell)) fail("Comic Reader legacy Base64/srcdoc/bridge kembali terdeteksi.");
for (const relative of ["assets/comic-reader/index.html", "assets/comic-reader/app.css", "assets/comic-reader/app.js"]) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Comic Reader standalone asset hilang: ${relative}`);
}
const index = read("index.html");
if (index.indexOf("assets/config.js") < 0 || index.indexOf("assets/config.js") > index.indexOf("assets/js/core/app.js")) fail("assets/config.js harus dimuat sebelum app.js.");
if (/cursor-red\.(?:js|css)/.test(index)) fail("Efek cursor lama masih dimuat pada halaman publik.");
if (/id=["']nxUnbanFrame["'][^>]*allow-same-origin/i.test(index)) fail("Iframe Unban masih memiliki allow-same-origin.");
const app = read("assets/js/core/app.js");
if (!/event\.source\s*!==\s*sourceFrame\.contentWindow/.test(app)) fail("Handler postMessage iframe belum memvalidasi event.source.");
const deployCenter = read("assets/js/features/deploy-center.js");
const deployStandalone = read("assets/apps/deploy-center/index.html");
if (!/jszip\.min\.js[^\n]+integrity="sha512-/.test(deployStandalone)) fail("JSZip Deploy Center standalone belum dikunci dengan Subresource Integrity.");
const globalHeaders = (vercel.headers || []).find((entry) => entry.source === "/(.*)")?.headers || [];
const csp = globalHeaders.find((entry) => String(entry.key).toLowerCase() === "content-security-policy")?.value || "";
for (const directive of ["script-src 'self'", "connect-src 'self'", "frame-src 'self'", "object-src 'none'"]) {
  if (!csp.includes(directive)) fail(`Directive CSP hilang: ${directive}`);
}
for (const property of ["og:title", "og:description", "og:image"]) {
  if (!new RegExp(`property=["']${property}["']`, "i").test(index)) fail(`Metadata sosial hilang: ${property}`);
}

const apiFiles = walk(path.join(root, "api")).filter((file) => /\.js$/i.test(file));
if (apiFiles.length > 12) fail(`Vercel Function melebihi batas paket: ${apiFiles.length}/12.`);

try {
  const localRoutes = Object.keys(require(path.join(root, "serve-local.js")).API_ROUTES);
  const declaredRoutes = routeManifest.apiRoutes || [];
  if (!sameSet(localRoutes, declaredRoutes)) fail(`Rute server lokal tidak sama dengan route-manifest (${localRoutes.length}/${declaredRoutes.length}).`);
  const { isStaticPathAllowed } = require(path.join(root, "serve-local.js"));
  for (const unsafe of ["/.env", "/package.json", "/database/schema.sql", "/lib/database.js", "/scripts/build.js"]) {
    if (isStaticPathAllowed(unsafe)) fail(`Server lokal mengekspos file privat: ${unsafe}`);
  }
} catch (error) { fail(`Server lokal gagal divalidasi: ${error.message}`); }

for (const rewrite of vercel.rewrites || []) {
  if (!routeManifest.apiRoutes?.includes(rewrite.source)) fail(`Rewrite tidak tercatat di route-manifest: ${rewrite.source}`);
}

const productionTextFiles = [
  ...walk(path.join(root, "api")), ...walk(path.join(root, "lib")), ...walk(path.join(root, "assets")),
  path.join(root, "index.html"), path.join(root, "about.html"), path.join(root, "feedback.html")
].filter((file) => /\.(?:js|css|html|json)$/i.test(file));
const secretPatterns = [
  /AIza[0-9A-Za-z_-]{30,}/g,
  /gh[opusr]_[0-9A-Za-z]{30,}/g,
  /\bsk-(?:live|test|proj)-[0-9A-Za-z_-]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
  /Authorization\s*:\s*["']Bearer\s+[0-9A-Za-z._-]{16,}["']/g,
  /\b(?:api[_-]?key|secret|accessToken)\s*[:=]\s*["'][^"']{16,}["']/gi,
  /["']x-api-key["']\s*:\s*["'][^"']{16,}["']/gi
];
for (const file of productionTextFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) fail(`Kemungkinan secret hardcoded: ${path.relative(root, file)}`);
  }
}

for (const file of productionTextFiles.filter((item) => /assets[\\/]js[\\/].*\.js$/i.test(item))) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/["']([A-Za-z0-9+/]{1000,}={0,2})["']/g)) {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const printable = (decoded.match(/[\x09\x0a\x0d\x20-\x7e]/g) || []).length / Math.max(1, decoded.length);
    if (printable < 0.55) continue;
    for (const pattern of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(decoded)) fail(`Kemungkinan secret dalam payload base64: ${path.relative(root, file)}`);
    }
  }
}

const rootFiles = fs.readdirSync(root);
for (const filename of rootFiles) {
  if (/^(?:PATCH_NOTES|V\d.*VALIDATION).*\.md$/i.test(filename)) fail(`Dokumen historis belum dibersihkan: ${filename}`);
}

if (failures.length) {
  console.error(`Audit proyek gagal (${failures.length}):`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log(`Audit proyek lulus: ${registryIds.length} tool, ${javascriptFiles.length} file JavaScript valid, ${apiFiles.length}/12 Vercel Functions, katalog/seed/rute sinkron, iframe dan server lokal terisolasi.`);

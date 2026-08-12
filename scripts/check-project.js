"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const failures = [];
const fail = (message) => failures.push(message);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => {
  try { return JSON.parse(read(relative)); }
  catch (error) { fail(`${relative}: JSON tidak valid (${error.message})`); return {}; }
};
const sameSet = (left, right) => left.length === right.length && left.every((item) => right.includes(item));

const packageJson = json("package.json");
const version = String(packageJson.version || "");
const vercel = json("vercel.json");
const routeManifest = json("route-manifest.json");
const moduleManifest = json("assets/module-manifest.json");

const required = [
  "index.html", "about.html", "feedback.html", "favicon.svg", "README.md", "CHANGELOG.md",
  "docs/SECURITY_AUDIT.md", "serve-local.js", "vercel.json", "route-manifest.json",
  "assets/module-manifest.json", "assets/js/core/tool-registry.js", "assets/js/core/app.js",
  "api/health.js", "api/feedback.js", "api/audit.js", "api/tool-health.js",
  "lib/database.js", "lib/memory-store.js", "lib/tool-health.js", "lib/vdeploy.js",
  "lib/freeconvert-vectorizer.js", "lib/sitegrabber-proxy.js", "database/schema.sql"
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

const javascriptFiles = walk(root).filter((file) => /\.js$/i.test(file));
for (const file of javascriptFiles) {
  try { new vm.Script(fs.readFileSync(file, "utf8"), { filename: path.relative(root, file) }); }
  catch (error) { fail(`Sintaks JavaScript gagal: ${path.relative(root, file)} (${error.message})`); }
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
  vm.runInNewContext(read("assets/js/core/tool-registry.js"), sandbox, { filename: "tool-registry.js" });
  registry = sandbox.window.NexoraToolRegistry;
} catch (error) { fail(`Tool registry tidak dapat dievaluasi: ${error.message}`); }

const registryRows = registry?.list?.() || [];
const registryIds = registryRows.map((tool) => tool.id);
if (registry?.version !== version) fail(`Versi registry ${registry?.version || "kosong"} tidak sama dengan package ${version}.`);
if (!registryIds.length || new Set(registryIds).size !== registryIds.length) fail("ID tool registry kosong atau duplikat.");

try {
  const healthIds = require(path.join(root, "lib/tool-health.js")).TOOL_CATALOG.map((tool) => tool.id);
  if (!sameSet(registryIds, healthIds)) fail(`Katalog health tidak sama dengan registry (${healthIds.length}/${registryIds.length}).`);
} catch (error) { fail(`Katalog health gagal dimuat: ${error.message}`); }

const schema = read("database/schema.sql");
const seedBlock = schema.match(/insert into public\.tools[\s\S]*?on conflict \(id\) do nothing;/i)?.[0] || "";
const seedIds = [...seedBlock.matchAll(/^\s*\('([a-z0-9_-]+)'/gm)].map((match) => match[1]);
if (!sameSet(registryIds, seedIds)) fail(`Seed database tidak sama dengan registry (${seedIds.length}/${registryIds.length}).`);

const moduleTools = Object.keys(moduleManifest.tools || {});
const expectedModuleTools = registryRows.filter((tool) => tool.module).map((tool) => tool.id);
if (!sameSet(moduleTools, expectedModuleTools)) fail("Pemetaan tools pada module-manifest tidak sama dengan registry.");
for (const [name, module] of Object.entries(moduleManifest.modules || {})) {
  for (const relative of [...(module.css || []), ...(module.js || [])]) {
    if (!fs.existsSync(path.join(root, relative))) fail(`Asset modul ${name} hilang: ${relative}`);
  }
}

for (const removed of [
  "assets/js/features/nexus-ai.js", "assets/css/features/nexus-ai.css",
  "assets/js/features/pix-vault.js", "assets/css/features/pix-vault.css"
]) if (fs.existsSync(path.join(root, removed))) fail(`Modul mati/berisiko masih tersimpan: ${removed}`);

const embeddedFrames = [
  "assets/js/features/imported-tools.js", "assets/js/features/comic-reader.js",
  "assets/js/features/tiktok-quote.js", "assets/js/features/virus-scan.js"
];
for (const relative of embeddedFrames) {
  const source = read(relative);
  if (!/<iframe[^>]+sandbox=/i.test(source)) fail(`${relative}: iframe srcdoc belum diberi sandbox.`);
  if (/allow-same-origin/i.test(source)) fail(`${relative}: sandbox srcdoc masih memiliki allow-same-origin.`);
}
const index = read("index.html");
if (/id=["']nxUnbanFrame["'][^>]*allow-same-origin/i.test(index)) fail("Iframe Unban masih memiliki allow-same-origin.");
const app = read("assets/js/core/app.js");
if (!/event\.source\s*!==\s*sourceFrame\.contentWindow/.test(app)) fail("Handler postMessage iframe belum memvalidasi event.source.");
const deployCenter = read("assets/js/features/deploy-center.js");
if (!/jszip\.min\.js[^\n]+integrity=\\?"sha512-/.test(deployCenter)) fail("JSZip Deploy Center belum dikunci dengan Subresource Integrity.");
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

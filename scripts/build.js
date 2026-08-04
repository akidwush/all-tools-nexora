const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");
const required = [
  "index.html", "about.html", "feedback.html", "favicon.svg", "vercel.json",
  "assets/css/core.css", "assets/css/components.css",
  "assets/js/core/app.js", "assets/js/core/shell.js", "assets/js/core/tool-health.js", "assets/js/core/lazy-loader.js",
  "assets/module-manifest.json",
  "api/health.js", "api/feedback.js", "api/database.js", "api/audit.js", "api/tool-health.js",
  "api/admin/auth.js", "api/admin/dashboard.js", "api/admin/tools.js", "api/admin/visual.js",
  "lib/database.js", "lib/audit.js", "lib/tool-health.js", "lib/admin-auth.js",
  "admin/index.html", "admin/login.html", "assets/css/admin.css", "assets/css/visual-qa.css", "assets/js/admin/login.js", "assets/js/admin/dashboard.js", "assets/js/admin/visual-qa.js", "assets/js/core/runtime-observer.js",
  "database/schema.sql", "database/migrations/002_tool_health.sql", "database/migrations/003_admin_dashboard.sql", "database/migrations/004_analytics_feedback_audit.sql", "database/migrations/005_visual_runtime_validation.sql", "database/setup-first-admin.sql"
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Build gagal. File hilang: ${missing.join(", ")}`);
  process.exit(1);
}
for (const filename of ["package.json", "vercel.json", "route-manifest.json", "assets/module-manifest.json"]) {
  try { JSON.parse(fs.readFileSync(path.join(root, filename), "utf8")); }
  catch (error) { console.error(`Build gagal. ${filename} bukan JSON valid: ${error.message}`); process.exit(1); }
}
const audit = spawnSync(process.execPath, [path.join(root, "scripts/check-project.js")], { stdio: "inherit" });
if (audit.status !== 0) process.exit(audit.status || 1);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const filename of ["index.html", "about.html", "feedback.html", "favicon.svg", "route-manifest.json"]) {
  fs.copyFileSync(path.join(root, filename), path.join(output, filename));
}
fs.cpSync(path.join(root, "assets"), path.join(output, "assets"), { recursive: true, force: true });
fs.cpSync(path.join(root, "admin"), path.join(output, "admin"), { recursive: true, force: true });
const generated = [
  "public/index.html", "public/admin/index.html", "public/admin/login.html", "public/assets/css/admin.css",
  "public/assets/js/admin/dashboard.js", "public/assets/js/admin/visual-qa.js", "public/assets/css/visual-qa.css", "public/assets/js/core/runtime-observer.js", "public/assets/js/core/lazy-loader.js", "public/assets/js/core/tool-health.js", "public/assets/js/core/analytics.js", "public/assets/module-manifest.json"
];
const failed = generated.filter((file) => !fs.existsSync(path.join(root, file)));
if (failed.length) { console.error(`Build gagal membuat output: ${failed.join(", ")}`); process.exit(1); }
const before = 3917113;
const after = fs.statSync(path.join(root, "index.html")).size;
console.log(`Build selesai: public/ dibuat. index.html ${after.toLocaleString()} byte (turun ${Math.max(0, Math.round((1-after/before)*100))}%).`);
console.log("Feature payload besar dimuat saat tool dibuka; Runtime JS test, screenshot, visual baseline, analytics, feedback, audit log, login, dan dashboard admin v6.0 tersedia di /admin.");

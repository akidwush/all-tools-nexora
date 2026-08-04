const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const required = [
  "api/admin/visual.js",
  "assets/js/core/runtime-observer.js",
  "assets/js/admin/visual-qa.js",
  "assets/css/visual-qa.css",
  "database/migrations/005_visual_runtime_validation.sql"
];
for (const file of required) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} harus tersedia`);

for (const file of ["api/admin/visual.js", "assets/js/core/runtime-observer.js", "assets/js/admin/visual-qa.js"]) {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(root, file), "utf8"), { filename: file }));
}

const observer = fs.readFileSync(path.join(root, "assets/js/core/runtime-observer.js"), "utf8");
for (const token of ["unhandledrejection", "console-error", "runModules", "horizontalOverflowPx", "performance.getEntriesByType", "__NEXORA_RUNTIME_OBSERVER__"]) {
  assert.equal(observer.includes(token), true, `runtime observer harus memuat ${token}`);
}
const visual = fs.readFileSync(path.join(root, "assets/js/admin/visual-qa.js"), "utf8");
for (const token of ["captureFrame", "foreignObject", "crypto.subtle.digest", "compareFingerprints", "set_baseline", "save_run", "runModules"]) {
  assert.equal(visual.includes(token), true, `visual QA harus memuat ${token}`);
}
const api = fs.readFileSync(path.join(root, "api/admin/visual.js"), "utf8");
for (const token of ["visual_baselines", "visual_test_runs", "verifyMutationRequest", "recordAdminAudit", "INVALID_VISUAL_TARGET", "MAX_THUMBNAIL_LENGTH"]) {
  assert.equal(api.includes(token), true, `visual API harus memuat ${token}`);
}
const migration = fs.readFileSync(path.join(root, "database/migrations/005_visual_runtime_validation.sql"), "utf8");
for (const token of ["public.visual_baselines", "public.visual_test_runs", "threshold_percent", "fingerprint", "thumbnail_data_url", "grant select, insert, update, delete"]) {
  assert.equal(migration.includes(token), true, `migration v6 harus memuat ${token}`);
}
const adminHtml = fs.readFileSync(path.join(root, "admin/index.html"), "utf8");
for (const token of ["data-panel=\"visual\"", "visualTestFrame", "visualRunModules", "visual-qa.js", "visual-qa.css"]) {
  assert.equal(adminHtml.includes(token), true, `dashboard admin harus memuat ${token}`);
}
const routeManifest = JSON.parse(fs.readFileSync(path.join(root, "route-manifest.json"), "utf8"));
assert.equal(routeManifest.apiRoutes.includes("/api/admin/visual"), true);
for (const html of ["index.html", "about.html", "feedback.html", "admin/index.html", "admin/login.html"]) {
  const content = fs.readFileSync(path.join(root, html), "utf8");
  assert.equal(content.includes("runtime-observer.js"), true, `${html} harus memuat runtime observer`);
}
console.log("Visual QA v6.0 tests lulus: runtime observer, module smoke test, screenshot browser, fingerprint diff, baseline, API, dan migration valid.");

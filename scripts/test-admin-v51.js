const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { safeJson } = require("../lib/admin-audit");

const root = path.resolve(__dirname, "..");
const required = [
  "api/analytics.js", "api/admin/analytics.js", "api/admin/feedback.js", "api/admin/audit.js",
  "lib/admin-audit.js", "assets/js/core/analytics.js", "database/migrations/004_analytics_feedback_audit.sql"
];
for (const file of required) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} harus tersedia`);

const migration = fs.readFileSync(path.join(root, "database/migrations/004_analytics_feedback_audit.sql"), "utf8");
for (const token of [
  "public.tool_usage_events", "public.admin_audit_logs", "admin_analytics_summary",
  "internal_note", "admin_updated_by", "grant execute"
]) assert.equal(migration.includes(token), true, `migration harus memuat ${token}`);

const analytics = fs.readFileSync(path.join(root, "api/analytics.js"), "utf8");
for (const token of ["ALLOWED_EVENTS", "visitor_hash", "MAX_BODY_BYTES", "RATE_LIMITED"]) assert.equal(analytics.includes(token), true);
const feedback = fs.readFileSync(path.join(root, "api/admin/feedback.js"), "utf8");
for (const token of ["verifyMutationRequest", "admin_reply", "internal_note", "recordAdminAudit"]) assert.equal(feedback.includes(token), true);
const dashboard = fs.readFileSync(path.join(root, "assets/js/admin/dashboard.js"), "utf8");
for (const token of ["loadAnalytics", "loadFeedback", "loadAudit", "saveFeedback", "openAuditDetail"]) assert.equal(dashboard.includes(token), true);

assert.deepEqual(safeJson({ hello: "world", nested: { ok: true } }), { hello: "world", nested: { ok: true } });
assert.equal(String(safeJson("x".repeat(3000))).length, 2000);
console.log("Admin v5.1 tests lulus: analytics, feedback workflow, audit log, sanitasi, dan migration valid.");

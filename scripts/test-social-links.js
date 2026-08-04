const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const required = [
  "api/admin/socials.js",
  "assets/js/core/social-links.js",
  "database/migrations/006_social_links.sql",
  "V6_1_VALIDATION.md"
];
for (const file of required) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} harus tersedia`);

const migration = fs.readFileSync(path.join(root, "database/migrations/006_social_links.sql"), "utf8");
for (const token of ["public.social_links", "public read active social links", "on conflict (key) do nothing", "grant select, insert, update, delete"]) {
  assert.equal(migration.includes(token), true, `migration sosial harus memuat ${token}`);
}

const api = fs.readFileSync(path.join(root, "api/admin/socials.js"), "utf8");
for (const token of ["requireAdmin", "verifyMutationRequest", "recordAdminAudit", "INVALID_SOCIAL_URL", "ACTIVE_SOCIAL_REQUIRES_URL"]) {
  assert.equal(api.includes(token), true, `API sosial harus memuat ${token}`);
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const shell = fs.readFileSync(path.join(root, "assets/js/core/shell.js"), "utf8");
assert.equal(index.includes("assets/js/core/social-links.js"), true);
for (const secretDestination of ["0029Vb7yYjE8PgsKrQ5ghQ3s", "6285196639720"]) {
  assert.equal(index.includes(secretDestination), false, `index.html masih memuat tujuan sosial ${secretDestination}`);
  assert.equal(shell.includes(secretDestination), false, `shell.js masih memuat tujuan sosial ${secretDestination}`);
}

const dashboard = fs.readFileSync(path.join(root, "assets/js/admin/dashboard.js"), "utf8");
for (const token of ["renderSocials", "openSocialEditor", "saveSocial", "/api/admin/socials"]) assert.equal(dashboard.includes(token), true);

console.log("Nexora v6.1 tests lulus: social links database-driven, admin-protected, dan tidak hard-coded di HTML/shell.");

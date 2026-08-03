const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { databaseHeaders } = require("../lib/database");
const {
  parseCookies,
  roleCanEdit,
  roleCanManageAdmins,
  setSessionCookies,
  verifyMutationRequest
} = require("../lib/admin-auth");

function mockResponse() {
  const headers = new Map();
  return {
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    headers
  };
}

assert.equal(databaseHeaders("sb_secret_test").Authorization, undefined);
assert.equal(databaseHeaders("sb_secret_test").apikey, "sb_secret_test");
assert.equal(databaseHeaders("legacy.jwt").Authorization, "Bearer legacy.jwt");
assert.equal(roleCanEdit("super_admin"), true);
assert.equal(roleCanEdit("admin"), true);
assert.equal(roleCanEdit("viewer"), false);
assert.equal(roleCanManageAdmins("super_admin"), true);
assert.equal(roleCanManageAdmins("admin"), false);
assert.deepEqual(parseCookies({ headers: { cookie: "a=1; hello=world%20ok" } }), { a: "1", hello: "world ok" });

const request = {
  headers: {
    host: "all-tools-nexora.vercel.app",
    "x-forwarded-proto": "https"
  }
};
const response = mockResponse();
setSessionCookies(request, response, {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: 3600
});
const cookies = response.getHeader("Set-Cookie");
assert.equal(Array.isArray(cookies), true);
assert.equal(cookies.some((cookie) => cookie.includes("nx_admin_access=") && cookie.includes("HttpOnly") && cookie.includes("Secure")), true);
assert.equal(cookies.some((cookie) => cookie.includes("nx_admin_csrf=") && !cookie.includes("HttpOnly")), true);

const csrf = "csrf-token-123";
assert.equal(verifyMutationRequest({
  headers: {
    cookie: `nx_admin_csrf=${csrf}`,
    "x-csrf-token": csrf,
    origin: "https://all-tools-nexora.vercel.app",
    host: "all-tools-nexora.vercel.app",
    "x-forwarded-proto": "https",
    "sec-fetch-site": "same-origin"
  }
}), true);
assert.equal(verifyMutationRequest({
  headers: {
    cookie: `nx_admin_csrf=${csrf}`,
    "x-csrf-token": "wrong",
    origin: "https://all-tools-nexora.vercel.app",
    host: "all-tools-nexora.vercel.app",
    "x-forwarded-proto": "https"
  }
}), false);

const root = path.resolve(__dirname, "..");
for (const file of [
  "admin/index.html", "admin/login.html", "assets/css/admin.css",
  "assets/js/admin/login.js", "assets/js/admin/dashboard.js",
  "api/admin/auth.js", "api/admin/dashboard.js", "api/admin/tools.js",
  "database/migrations/003_admin_dashboard.sql", "database/setup-first-admin.sql"
]) {
  assert.equal(fs.existsSync(path.join(root, file)), true, `${file} harus tersedia`);
}
const authApi = fs.readFileSync(path.join(root, "api/admin/auth.js"), "utf8");
for (const token of ["signInWithPassword", "ADMIN_NOT_ALLOWED", "LOGIN_RATE_LIMITED", "setSessionCookies"]) assert.equal(authApi.includes(token), true);
const toolsApi = fs.readFileSync(path.join(root, "api/admin/tools.js"), "utf8");
for (const token of ["requireAdmin", "verifyMutationRequest", "INVALID_EXTERNAL_URL", "is_active"]) assert.equal(toolsApi.includes(token), true);
const migration = fs.readFileSync(path.join(root, "database/migrations/003_admin_dashboard.sql"), "utf8");
for (const token of ["public.admin_users", "references auth.users", "grant select, insert, update, delete", "on conflict (id) do nothing"]) assert.equal(migration.includes(token), true);
console.log("Admin v5.0 tests lulus: cookie HttpOnly, CSRF, role, API login, dashboard, dan migration valid.");

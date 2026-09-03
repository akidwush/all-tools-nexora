"use strict";

const assert = require("node:assert/strict");

function responseMock() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
    end(payload) { this.ended = payload; return payload; }
  };
}

(async () => {
  const databasePath = require.resolve("../lib/database");
  const membershipPath = require.resolve("../lib/account-membership");
  const database = require(databasePath);
  const originalDatabaseRequest = database.databaseRequest;

  database.databaseRequest = async () => [{ access_level: "free" }];
  delete require.cache[membershipPath];
  let membership = require(membershipPath);
  let response = responseMock();
  assert.equal(await membership.authorizeTool({ method: "GET", headers: { host: "nexora.test" }, socket: {} }, response, "webintel"), false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.error, "FIRST_PARTY_PROOF_REQUIRED");

  response = responseMock();
  assert.equal(await membership.authorizeTool({ method: "GET", headers: { host: "nexora.test", origin: "https://nexora.test", "sec-fetch-site": "same-origin", "user-agent": "NexoraFunctionalityTest/1", "x-forwarded-for": "203.0.113.22" }, socket: {} }, response, "webintel"), true);

  response = responseMock();
  assert.equal(await membership.authorizeTool({ method: "GET", headers: {}, socket: {} }, response, "calc"), false);
  assert.equal(response.statusCode, 403, "tool frontend harus default-deny jika dipanggil sebagai permission server");

  database.databaseRequest = async () => [{ access_level: "vvip" }];
  delete require.cache[membershipPath];
  membership = require(membershipPath);
  response = responseMock();
  assert.equal(await membership.authorizeTool({ method: "GET", headers: {}, socket: {} }, response, "webintel"), false);
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.error, "VVIP_LOGIN_REQUIRED");

  database.databaseRequest = async () => { throw Object.assign(new Error("offline"), { code: "DATABASE_UNREACHABLE" }); };
  delete require.cache[membershipPath];
  membership = require(membershipPath);
  response = responseMock();
  assert.equal(await membership.authorizeTool({ method: "GET", headers: {}, socket: {} }, response, "webintel"), false);
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.error, "MEMBERSHIP_UNAVAILABLE");

  const fs = require("node:fs");
  const accountSource = fs.readFileSync(require.resolve("../lib/account-membership"), "utf8");
  const accountUiSource = fs.readFileSync(require.resolve("../assets/js/core/account.js"), "utf8");
  const coreAppSource = fs.readFileSync(require.resolve("../assets/js/core/app.js"), "utf8");
  assert.match(accountSource, /safeAccountMessage/);
  assert.equal((accountUiSource.match(/class="nx-account-primary" type="submit"/g) || []).length, 2, "account forms must expose explicit submit buttons so busy-state works");
  assert.doesNotMatch(coreAppSource, /console\.warn\('\[Nexora Country\]/, "handled geolocation fallbacks must not pollute production console");
  for (const sourcePath of ["../lib/public-database", "../api/admin/tools", "../api/admin/dashboard"]) {
    assert.match(fs.readFileSync(require.resolve(sourcePath), "utf8"), /RETIRED_TOOL_IDS[\s\S]*?bigimage/, `${sourcePath} must suppress retired database rows`);
  }

  database.databaseRequest = originalDatabaseRequest;
  delete require.cache[membershipPath];

  const toolHealthPath = require.resolve("../api/tool-health");
  delete require.cache[toolHealthPath];
  const toolHealth = require(toolHealthPath);
  assert.equal(toolHealth.protectedToolId("downloader", { body: { provider: "spotify" } }, new URL("https://nexora.test/api/downloader")), "spotify");
  assert.equal(toolHealth.protectedToolId("sitegrabber", { body: {} }, new URL("https://nexora.test/api/sitegrabber")), "getcode");
  assert.equal(toolHealth.protectedToolId("media-download", { body: {} }, new URL("https://nexora.test/api/media-download?url=https%3A%2F%2Fcdn.tiktokcdn.com%2Fvideo.mp4")), "tiktok");
  assert.equal(toolHealth.protectedToolId("media-download", { body: {} }, new URL("https://nexora.test/api/media-download?tool=terabox&url=https%3A%2F%2Fapi.nexray.eu.cc%2Ffile.bin")), "terabox");
  assert.equal(toolHealth.publicHealthOnly("alight-premium", { method: "GET" }, new URL("https://nexora.test/api/alight-premium?health=1&action=magic-link&email=a%40b.test")), false, "premium actions must never bypass membership through a health flag");
  assert.equal(toolHealth.publicHealthOnly("alight-premium", { method: "GET" }, new URL("https://nexora.test/api/alight-premium")), true);
  assert.equal(toolHealth.publicHealthOnly("crypto-market", { method: "GET" }, new URL("https://nexora.test/api/crypto-market?health=1")), false, "data endpoints must not inherit generic health bypasses");
  const toolHealthCatalog = require("../lib/tool-health").TOOL_CATALOG;
  const alightHealth = toolHealthCatalog.find((item) => item.id === "alightpremium");
  assert.equal(alightHealth.target.method, "HEAD");
  const healthSource = fs.readFileSync(require.resolve("../lib/tool-health"), "utf8");
  assert.match(healthSource, /rows\.filter\(\(row\) => catalogIds\.has\(row\.tool_id\)\)/);

  const originalGetDatabaseConfig = database.getDatabaseConfig;
  database.getDatabaseConfig = () => ({ configured: true });
  database.databaseRequest = async (_resource, options = {}) => options.method === "POST" ? null : [
    { id: "bigimage", name: "Retired", is_active: false },
    { id: "calc", name: "Calculator", is_active: true }
  ];
  const publicDatabasePath = require.resolve("../lib/public-database");
  delete require.cache[publicDatabasePath];
  const publicDatabase = require(publicDatabasePath);
  response = responseMock();
  await publicDatabase({ method: "GET", url: "/api/database?resource=tools", headers: { host: "nexora.test" } }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.data.map((item) => item.id), ["calc"]);
  assert.equal(response.payload.count, 1);
  database.getDatabaseConfig = originalGetDatabaseConfig;
  database.databaseRequest = originalDatabaseRequest;

  const adminAuthPath = require.resolve("../lib/admin-auth");
  const adminAuditPath = require.resolve("../lib/admin-audit");
  const adminToolsPath = require.resolve("../api/admin/tools");
  const adminAuth = require(adminAuthPath);
  const adminAudit = require(adminAuditPath);
  const originals = {
    requireAdmin: adminAuth.requireAdmin,
    verifyMutationRequest: adminAuth.verifyMutationRequest,
    recordAdminAudit: adminAudit.recordAdminAudit
  };
  let subscription = null;
  const calls = [];
  database.databaseRequest = async (resource, options = {}) => {
    calls.push({ resource, options });
    if (resource.startsWith("profiles?select=")) return [{ id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", display_name: "Member", role: "free", account_status: "active" }];
    if (resource.startsWith("subscriptions?select=")) return subscription ? [subscription] : [];
    if (resource === "subscriptions?on_conflict=user_id") {
      subscription = { id: "sub-1", ...JSON.parse(options.body) };
      return null;
    }
    if (resource.startsWith("profiles?id=eq.")) return null;
    throw new Error(`Unexpected database call: ${resource}`);
  };
  adminAuth.requireAdmin = async () => ({ user: { id: "admin", email: "admin@example.com" }, admin: { role: "admin" } });
  adminAuth.verifyMutationRequest = () => true;
  adminAudit.recordAdminAudit = async () => true;
  delete require.cache[adminToolsPath];
  const adminTools = require(adminToolsPath);
  const request = {
    method: "PATCH",
    url: "/api/admin/tools?resource=members",
    headers: { host: "localhost" },
    body: { userId: "11111111-1111-4111-8111-111111111111", action: "activate", days: 30 }
  };
  response = responseMock();
  await adminTools(request, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.ok(calls.some((call) => call.resource === "subscriptions?on_conflict=user_id" && call.options.method === "POST"), "aktivasi VVIP harus upsert subscription");
  assert.equal(subscription.plan, "vvip");
  assert.equal(subscription.status, "active");

  request.body = { ...request.body, expiresAt: "2020-01-01T00:00:00.000Z" };
  response = responseMock();
  await adminTools(request, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.error, "INVALID_EXPIRY_DATE");

  database.databaseRequest = originalDatabaseRequest;
  adminAuth.requireAdmin = originals.requireAdmin;
  adminAuth.verifyMutationRequest = originals.verifyMutationRequest;
  adminAudit.recordAdminAudit = originals.recordAdminAudit;
  delete require.cache[adminToolsPath];
  delete require.cache[membershipPath];

  console.log("Functionality audit tests passed: VVIP fail-closed, provider-specific API guards, and membership upsert persistence are verified.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

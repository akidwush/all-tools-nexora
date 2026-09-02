"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

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

function request(overrides = {}) {
  return {
    method: "POST",
    url: "/api/ai/song",
    headers: { host: "nexora.test", origin: "https://nexora.test", "sec-fetch-site": "same-origin" },
    socket: {},
    body: {},
    ...overrides
  };
}

(async () => {
  const policy = require("../lib/server-access-policy");
  const requestSecurity = require("../lib/request-security");
  const dispatcher = read("api/tool-health.js");
  const healthDispatcher = read("api/health.js");
  const adminToolsSource = read("api/admin/tools.js");
  const accountSource = read("lib/account-membership.js");
  const adminAuthSource = read("lib/admin-auth.js");

  // Every routed provider service resolves to an authoritative server tool ID.
  assert.equal(policy.toolHealthToolId("", request(), new URL("https://nexora.test/api/tool-health?_service=danbooru-search")), "danbooru");
  assert.equal(policy.toolHealthToolId("", request(), new URL("https://nexora.test/api/tool-health?_service=anime-to-real")), "animetoreal");
  assert.equal(policy.toolHealthToolId("", request(), new URL("https://nexora.test/api/tool-health?_service=ai-song")), "aisong");
  assert.equal(policy.toolHealthToolId("", request(), new URL("https://nexora.test/api/tool-health?_service=hd4-enhancer")), "enhancer");
  assert.equal(policy.healthToolId("document-ai"), "documentai");
  assert.equal(policy.healthToolId("comic-reader"), "comicreader");
  assert.equal(policy.healthToolId("text-to-pdf"), "autopdf");
  assert.equal(policy.toolHealthToolId("genmail", request(), new URL("https://nexora.test/api/tool-health?mode=genmail")), "genmail");
  assert.equal(policy.toolHealthToolId("aio-download", request(), new URL("https://nexora.test/api/tool-health?mode=aio-download")), "aiodownloader");
  assert.ok(dispatcher.indexOf("const protectedIds") < dispatcher.indexOf('if (service === "danbooru-search")'), "authorization must run before _service handlers");
  assert.match(healthDispatcher, /healthToolId\(mode\)/);

  // A Nexray media URL is not allowed to downgrade its access by changing the
  // browser-supplied tool query. Both possible server tools are checked.
  const nexrayUrl = new URL("https://nexora.test/api/media-download?tool=instagram&url=https%3A%2F%2Fapi.nexray.eu.cc%2Ffile.mp4");
  assert.deepEqual(policy.toolHealthToolIds("media-download", request(), nexrayUrl), ["instagram", "terabox"]);

  assert.equal(requestSecurity.verifySameOriginRequest(request()), true);
  assert.equal(requestSecurity.verifySameOriginRequest(request({ headers: { host: "nexora.test", origin: "https://clone.example", "sec-fetch-site": "cross-site" } })), false);
  assert.equal(requestSecurity.verifySameOriginRequest(request({ headers: { host: "preview.vercel.app", origin: "https://preview.vercel.app", "sec-fetch-site": "same-origin" } })), true);

  const databasePath = require.resolve("../lib/database");
  const membershipPath = require.resolve("../lib/account-membership");
  const adminAuthPath = require.resolve("../lib/admin-auth");
  const database = require(databasePath);
  const adminAuth = require(adminAuthPath);
  const originalDatabaseRequest = database.databaseRequest;
  const originalGetDatabaseConfig = database.getDatabaseConfig;
  const originalGetAuthUser = adminAuth.getAuthUser;
  const originalRequireAdmin = adminAuth.requireAdmin;
  const originalVerifyMutationRequest = adminAuth.verifyMutationRequest;

  // Client flags never grant access: without a verified cookie session a VVIP
  // endpoint remains 401 even when body.vip/role/isAdmin are forged.
  database.databaseRequest = async () => [{ access_level: "vvip" }];
  delete require.cache[membershipPath];
  let membership = require(membershipPath);
  let response = responseMock();
  assert.equal(await membership.authorizeTool(request({ body: { vip: true, isVip: true, role: "admin", credits: 999999 } }), response, "aisong"), false);
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.error, "VVIP_LOGIN_REQUIRED");

  // Clone-origin JavaScript is rejected before it can consume even a free
  // server-backed provider route.
  response = responseMock();
  assert.equal(await membership.authorizeTool(request({ headers: { host: "nexora.test", origin: "https://clone.example", "sec-fetch-site": "cross-site" } }), response, "aisong"), false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.error, "ORIGIN_NOT_ALLOWED");

  // Public-JavaScript tools are default-deny when accidentally used as a
  // server permission. Their UI can be copied, their nonexistent privilege cannot.
  response = responseMock();
  assert.equal(await membership.authorizeTool(request(), response, "calc"), false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.error, "SERVER_PERMISSION_UNAVAILABLE");

  async function sessionDatabase(resource) {
    if (resource.startsWith("tools?select=")) return [{ access_level: "vvip" }];
    if (resource.startsWith("profiles?on_conflict=") || resource.startsWith("subscriptions?on_conflict=")) return null;
    if (resource.startsWith("profiles?select=")) return [{ id: "user-1", email: "user@example.test", display_name: "User", role: "free", account_status: "active" }];
    if (resource.startsWith("subscriptions?select=")) return sessionDatabase.subscription ? [sessionDatabase.subscription] : [];
    if (resource.startsWith("admin_users?select=")) return [];
    throw new Error(`Unexpected database request: ${resource}`);
  }
  adminAuth.getAuthUser = async () => ({ id: "user-1", email: "user@example.test", user_metadata: {} });
  database.databaseRequest = sessionDatabase;
  delete require.cache[membershipPath];
  membership = require(membershipPath);

  const cookieRequest = request({ headers: { host: "nexora.test", origin: "https://nexora.test", "sec-fetch-site": "same-origin", cookie: "nx_account_access=verified-access" } });
  response = responseMock();
  assert.equal(await membership.authorizeTool(cookieRequest, response, "aisong"), false);
  assert.equal(response.statusCode, 403, "verified non-VVIP account must remain forbidden");
  assert.equal(response.payload.error, "VVIP_REQUIRED");

  sessionDatabase.subscription = { plan: "vvip", status: "active", expires_at: new Date(Date.now() + 86_400_000).toISOString() };
  response = responseMock();
  assert.equal(await membership.authorizeTool(cookieRequest, response, "aisong"), true, "active unexpired VVIP session should pass");

  // Public database output refuses to advertise an unenforceable VVIP lock.
  database.getDatabaseConfig = () => ({ configured: true });
  database.databaseRequest = async (_resource, options = {}) => options.method === "POST" ? null : [{ id: "calc", name: "Calculator", access_level: "vvip" }];
  const publicDatabasePath = require.resolve("../lib/public-database");
  delete require.cache[publicDatabasePath];
  const publicDatabase = require(publicDatabasePath);
  response = responseMock();
  await publicDatabase({ method: "GET", url: "/api/database?resource=tools", headers: { host: "nexora.test" }, socket: {} }, response);
  assert.equal(response.payload.data[0].access_level, "free");
  assert.equal(response.payload.data[0].vip_eligible, false);

  // The server, not the disabled select option, rejects a custom/external VVIP
  // request even from a valid admin session.
  const adminAudit = require("../lib/admin-audit");
  const originalRecordAdminAudit = adminAudit.recordAdminAudit;
  adminAuth.requireAdmin = async () => ({ user: { id: "admin-1", email: "admin@example.test" }, admin: { role: "admin" } });
  adminAuth.verifyMutationRequest = () => true;
  adminAudit.recordAdminAudit = async () => true;
  database.databaseRequest = async (resource) => resource.startsWith("tools?select=") ? [] : null;
  const adminToolsPath = require.resolve("../api/admin/tools");
  delete require.cache[adminToolsPath];
  const adminTools = require(adminToolsPath);
  response = responseMock();
  await adminTools(request({
    method: "POST",
    url: "/api/admin/tools",
    body: {
      id: "externalclone",
      name: "External Clone",
      category: "external",
      icon: "fa-solid fa-link",
      externalUrl: "https://example.test/tool",
      accessLevel: "vvip",
      isActive: true
    }
  }), response);
  assert.equal(response.statusCode, 422);
  assert.equal(response.payload.error, "VIP_REQUIRES_SERVER_GATE");

  database.databaseRequest = originalDatabaseRequest;
  database.getDatabaseConfig = originalGetDatabaseConfig;
  adminAuth.getAuthUser = originalGetAuthUser;
  adminAuth.requireAdmin = originalRequireAdmin;
  adminAuth.verifyMutationRequest = originalVerifyMutationRequest;
  adminAudit.recordAdminAudit = originalRecordAdminAudit;
  delete require.cache[membershipPath];
  delete require.cache[publicDatabasePath];
  delete require.cache[adminToolsPath];

  assert.match(adminToolsSource, /VIP_REQUIRES_SERVER_GATE/);
  assert.match(adminToolsSource, /requireAdmin\(request, response, \{ edit: true \}\)/);
  assert.match(adminAuthSource, /verifySameOriginRequest\(request\)/);
  assert.match(accountSource, /requireAuthenticatedUser/);
  assert.match(accountSource, /requireEntitlement/);
  assert.match(accountSource, /requirePermission/);
  assert.doesNotMatch(accountSource, /body\.(?:vip|role|isVip|isAdmin|credits|quota)/);

  const migrationIds = [...read("database/migrations/033_server_authorization_hardening.sql").matchAll(/^\s*'([a-z0-9_-]+)',?$/gm)].map((match) => match[1]);
  assert.deepEqual(new Set(migrationIds), new Set(policy.SERVER_AUTHORIZED_TOOL_IDS), "SQL cleanup and server policy must stay synchronized");

  const vercel = JSON.parse(read("vercel.json"));
  const headers = (vercel.headers || []).flatMap((row) => row.headers || []);
  assert.equal(headers.some((row) => String(row.key).toLowerCase() === "access-control-allow-origin" && row.value === "*"), false);
  assert.ok(headers.some((row) => row.key === "Cross-Origin-Resource-Policy" && row.value === "same-site"));
  assert.match(headers.find((row) => row.key === "Content-Security-Policy").value, /base-uri 'self'; form-action 'self'; frame-ancestors 'self'/);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-public-audit-"));
  try {
    fs.writeFileSync(path.join(temporary, "app.js"), "window.Nexora = true;\n");
    const { auditPublicBuild } = require("./audit-public-build");
    assert.equal(auditPublicBuild(temporary).files, 1);
    fs.writeFileSync(path.join(temporary, "app.js.map"), "{}\n");
    assert.throws(() => auditPublicBuild(temporary), /source map production/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }

  console.log("Security authorization v7 lulus: clone/origin, spoofed VIP/admin, 401/403, dispatcher order, server-only eligibility, migration sync, headers, dan public bundle guard tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
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

function request(headers = {}) {
  return {
    method: "POST",
    url: "/api/ai/song",
    headers: {
      host: "nexora.test",
      "x-forwarded-proto": "https",
      "x-forwarded-for": "203.0.113.50",
      "user-agent": "NexoraShieldTest/1",
      ...headers
    },
    socket: {},
    body: {}
  };
}

(async () => {
  process.env.NEXORA_ABUSE_SHIELD_SECRET = "test-only-nexora-abuse-shield-secret-0123456789";
  process.env.NEXORA_TEST_DURABLE_QUOTA = "1";

  const shield = require("../lib/api-abuse-shield");
  shield.resetApiAbuseShieldState();

  assert.equal(shield.hasFirstPartyBrowserSignal(request()), false, "server-to-server request must not count as first-party browser runtime");
  assert.equal(shield.hasFirstPartyBrowserSignal(request({ origin: "https://nexora.test", "sec-fetch-site": "same-origin" })), true);
  assert.equal(shield.hasFirstPartyBrowserSignal(request({ origin: "https://clone.test", "sec-fetch-site": "cross-site" })), false);

  let response = responseMock();
  let allowed = await shield.enforceApiAbuseShield(request(), response, "aisong", {
    tier: "free",
    databaseRequestImpl: async () => ({ allowed: true, remaining: 35 })
  });
  assert.equal(allowed, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.error, "FIRST_PARTY_PROOF_REQUIRED");

  response = responseMock();
  const firstParty = request({ origin: "https://nexora.test", "sec-fetch-site": "same-origin" });
  allowed = await shield.enforceApiAbuseShield(firstParty, response, "aisong", {
    tier: "free",
    databaseRequestImpl: async (resource, options) => {
      assert.equal(resource, "rpc/nexora_consume_api_quota");
      const body = JSON.parse(options.body);
      assert.equal(body.p_tool_id, "aisong");
      assert.equal(body.p_tier, "free");
      assert.equal(body.p_window_seconds, 3600);
      assert.ok(body.p_limit >= 1);
      assert.match(body.p_bucket_hash, /^[A-Za-z0-9_-]{40,}$/);
      return { allowed: true, remaining: 35, reset_at: new Date(Date.now() + 3600_000).toISOString() };
    }
  });
  assert.equal(allowed, true);
  assert.match(String(response.headers["Set-Cookie"]), /nx_api_shield=/);
  assert.match(String(response.headers["Set-Cookie"]), /HttpOnly/);
  assert.match(String(response.headers["Set-Cookie"]), /SameSite=Strict/);
  assert.equal(response.headers["X-Nexora-Abuse-Quota"], "durable");

  shield.resetApiAbuseShieldState();
  response = responseMock();
  allowed = await shield.enforceApiAbuseShield(request({ origin: "https://nexora.test", "sec-fetch-site": "same-origin" }), response, "aisong", {
    tier: "free",
    databaseRequestImpl: async () => ({ allowed: false, remaining: 0, reset_at: new Date(Date.now() + 3600_000).toISOString() })
  });
  assert.equal(allowed, false);
  assert.equal(response.statusCode, 429);
  assert.equal(response.payload.error, "API_HOURLY_LIMITED");

  const migration = read("database/migrations/034_api_abuse_shield.sql");
  assert.match(migration, /create table if not exists public\.api_usage_windows/i);
  assert.match(migration, /create or replace function public\.nexora_consume_api_quota/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /revoke all on table public\.api_usage_windows from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.nexora_consume_api_quota[^;]+service_role/i);
  assert.doesNotMatch(migration, /ip_address|raw_ip/i);

  const account = read("lib/account-membership.js");
  assert.match(account, /enforceApiAbuseShield/);
  assert.match(account, /tier: "free"/);
  assert.match(account, /tier: "vvip"/);

  delete process.env.NEXORA_ABUSE_SHIELD_SECRET;
  delete process.env.NEXORA_TEST_DURABLE_QUOTA;
  console.log("API Abuse Shield lulus: no-origin server clone diblokir, first-party bootstrap, signed HttpOnly cookie, burst guard, durable HMAC quota, dan migration 034 tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

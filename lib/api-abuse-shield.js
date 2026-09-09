"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { databaseRequest, getDatabaseConfig } = require("./database");
const { takeFixedWindow } = require("./memory-store");
const { requestOrigin, timingSafeEqual, verifySameOriginRequest } = require("./request-security");

const SHIELD_COOKIE = "nx_api_shield";
const SHIELD_VERSION = 1;
const SHIELD_TTL_SECONDS = 15 * 60;
const SHIELD_STATE = Symbol.for("nexora.apiAbuseShield");
const burstBuckets = new Map();
const processSecret = crypto.randomBytes(32).toString("base64url");

const TOOL_LIMITS = Object.freeze({
  aiodownloader: { burst: 90, free: 900, vvip: 4_000 },
  alightpremium: { burst: 20, free: 120, vvip: 600 },
  aisong: { burst: 12, free: 36, vvip: 360 },
  animetoreal: { burst: 15, free: 60, vvip: 600 },
  autopdf: { burst: 40, free: 360, vvip: 1_800 },
  bmkg: { burst: 90, free: 1_200, vvip: 4_000 },
  comicreader: { burst: 420, free: 12_000, vvip: 40_000 },
  cryptomarket: { burst: 90, free: 1_200, vvip: 4_000 },
  danbooru: { burst: 100, free: 1_200, vvip: 5_000 },
  documentai: { burst: 15, free: 60, vvip: 600 },
  elevenlabs: { burst: 20, free: 90, vvip: 900 },
  enhancer: { burst: 15, free: 60, vvip: 600 },
  genmail: { burst: 45, free: 500, vvip: 2_000 },
  getcode: { burst: 30, free: 240, vvip: 1_200 },
  imagevectorizer: { burst: 35, free: 300, vvip: 1_500 },
  instagram: { burst: 90, free: 900, vvip: 4_000 },
  ipintel: { burst: 90, free: 1_000, vvip: 4_000 },
  multiai: { burst: 16, free: 60, vvip: 300 },
  novelcover: { burst: 12, free: 36, vvip: 360 },
  ocrintel: { burst: 30, free: 240, vvip: 1_200 },
  promptgenerate: { burst: 30, free: 240, vvip: 1_200 },
  spaceexplorer: { burst: 90, free: 1_000, vvip: 4_000 },
  spotify: { burst: 90, free: 900, vvip: 4_000 },
  svgalight: { burst: 45, free: 500, vvip: 2_000 },
  terabox: { burst: 90, free: 900, vvip: 4_000 },
  tiktok: { burst: 90, free: 900, vvip: 4_000 },
  vdeploy: { burst: 15, free: 60, vvip: 300 },
  webintel: { burst: 30, free: 240, vvip: 1_200 },
  youtube: { burst: 90, free: 900, vvip: 4_000 }
});

function firstHeader(value) {
  return String(value || "").split(",")[0].trim();
}

function clean(value, maximum = 240) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function parseCookies(request) {
  const raw = String(request?.headers?.cookie || "");
  const output = {};
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try { output[name] = decodeURIComponent(part.slice(index + 1).trim()); }
    catch { output[name] = part.slice(index + 1).trim(); }
  }
  return output;
}

function appendCookie(response, value) {
  const existing = response.getHeader?.("Set-Cookie");
  response.setHeader("Set-Cookie", [
    ...(Array.isArray(existing) ? existing : existing ? [String(existing)] : []),
    value
  ]);
}

function requestIsSecure(request) {
  const forwarded = firstHeader(request?.headers?.["x-forwarded-proto"]);
  if (forwarded) return forwarded === "https";
  const host = firstHeader(request?.headers?.host);
  return !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

function shieldSecret() {
  const configured = clean(process.env.NEXORA_ABUSE_SHIELD_SECRET, 4096);
  if (configured.length >= 32) return configured;
  const elevated = clean(getDatabaseConfig().elevatedKey, 4096);
  if (elevated.length >= 32) {
    return crypto.createHash("sha256").update(`nexora-abuse-shield-v1:${elevated}`).digest("base64url");
  }
  return processSecret;
}

function hmac(value) {
  return crypto.createHmac("sha256", shieldSecret()).update(String(value || "")).digest("base64url");
}

function hashShort(value) {
  return hmac(value).slice(0, 24);
}

function clientIp(request) {
  return firstHeader(request?.headers?.["x-forwarded-for"])
    || clean(request?.socket?.remoteAddress, 120)
    || "unknown";
}

function networkKey(request) {
  const value = clientIp(request).replace(/^::ffff:/, "");
  if (net.isIP(value) === 4) return value;
  if (net.isIP(value) === 6) return value.split(":").slice(0, 4).join(":") || value;
  return value.slice(0, 120) || "unknown";
}

function userAgentKey(request) {
  return hashShort(clean(request?.headers?.["user-agent"], 300) || "no-user-agent");
}

function exactOrigin(value) {
  const text = clean(value, 500);
  if (!text || text === "null") return "";
  try { return new URL(text).origin; }
  catch { return "!invalid"; }
}

function refererOrigin(value) {
  const text = clean(value, 1000);
  if (!text) return "";
  try { return new URL(text).origin; }
  catch { return "!invalid"; }
}

function hasFirstPartyBrowserSignal(request) {
  if (!verifySameOriginRequest(request)) return false;
  const expected = requestOrigin(request);
  if (!expected) return false;
  const fetchSite = firstHeader(request?.headers?.["sec-fetch-site"]).toLowerCase();
  if (fetchSite === "same-origin") return true;
  const suppliedOrigin = exactOrigin(request?.headers?.origin);
  if (suppliedOrigin && suppliedOrigin !== "!invalid" && suppliedOrigin === expected) return true;
  if (!fetchSite) {
    const suppliedReferer = refererOrigin(request?.headers?.referer);
    if (suppliedReferer && suppliedReferer !== "!invalid" && suppliedReferer === expected) return true;
  }
  return false;
}

function internalBypass(request) {
  const expected = clean(process.env.NEXORA_INTERNAL_API_TOKEN, 2048);
  if (expected.length < 24) return false;
  const provided = clean(request?.headers?.["x-nexora-internal-token"], 2048);
  return timingSafeEqual(expected, provided);
}

function tokenPayload(request, now = Date.now()) {
  return {
    v: SHIELD_VERSION,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SHIELD_TTL_SECONDS,
    net: hashShort(networkKey(request)),
    ua: userAgentKey(request),
    nonce: crypto.randomBytes(12).toString("base64url")
  };
}

function encodeToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

function decodeToken(token) {
  const text = clean(token, 4096);
  const dot = text.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = text.slice(0, dot);
  const signature = text.slice(dot + 1);
  if (!timingSafeEqual(hmac(body), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload && typeof payload === "object" ? payload : null;
  } catch { return null; }
}

function validToken(request, token, now = Date.now()) {
  const payload = decodeToken(token);
  if (!payload || payload.v !== SHIELD_VERSION) return false;
  const seconds = Math.floor(now / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= seconds || payload.iat > seconds + 30) return false;
  if (!timingSafeEqual(payload.net, hashShort(networkKey(request)))) return false;
  if (!timingSafeEqual(payload.ua, userAgentKey(request))) return false;
  return true;
}

function issueToken(request, response, now = Date.now()) {
  const token = encodeToken(tokenPayload(request, now));
  const secure = requestIsSecure(request) ? "; Secure" : "";
  appendCookie(response, `${SHIELD_COOKIE}=${encodeURIComponent(token)}; Path=/api; Max-Age=${SHIELD_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure}`);
  return token;
}

function limitsFor(toolId, tier) {
  const row = TOOL_LIMITS[String(toolId || "").toLowerCase()] || { burst: 60, free: 600, vvip: 3_000 };
  return {
    burst: Math.max(10, Number(row.burst || 60)),
    hourly: Math.max(30, Number(tier === "vvip" ? row.vvip : row.free))
  };
}

function bucketHash(request, toolId, tier, userId) {
  const actor = userId ? `user:${clean(userId, 160)}` : `network:${networkKey(request)}`;
  return hmac(`${tier}:${toolId}:${actor}`).slice(0, 64);
}

async function durableQuota({ bucket, toolId, tier, limit, databaseRequestImpl = databaseRequest }) {
  if (process.env.NODE_ENV === "test" && process.env.NEXORA_TEST_DURABLE_QUOTA !== "1") {
    return { allowed: true, remaining: limit, durable: false, skipped: "test" };
  }
  try {
    const result = await databaseRequestImpl("rpc/nexora_consume_api_quota", {
      method: "POST",
      body: JSON.stringify({
        p_bucket_hash: bucket,
        p_tool_id: String(toolId || "").toLowerCase(),
        p_tier: tier,
        p_window_seconds: 3600,
        p_limit: limit
      })
    });
    const row = Array.isArray(result) ? result[0] : result;
    if (!row || typeof row !== "object") throw Object.assign(new Error("Quota RPC returned no result."), { code: "ABUSE_QUOTA_INVALID" });
    return {
      allowed: row.allowed !== false,
      remaining: Math.max(0, Number(row.remaining ?? 0)),
      resetAt: row.reset_at || null,
      durable: true
    };
  } catch (error) {
    const strict = String(process.env.NEXORA_ABUSE_SHIELD_REQUIRE_DURABLE || "").trim() === "1";
    if (strict) throw Object.assign(new Error("Durable abuse quota is unavailable."), { code: "ABUSE_QUOTA_UNAVAILABLE", status: 503, cause: error?.code });
    return { allowed: true, remaining: limit, durable: false, errorCode: error?.postgresCode || error?.code || "UNAVAILABLE" };
  }
}

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status);
  return response.json(payload);
}

async function enforceApiAbuseShield(request, response, toolId, options = {}) {
  const method = String(request?.method || "GET").toUpperCase();
  if (method === "OPTIONS") return true;
  if (request?.[SHIELD_STATE]?.passed) return true;

  response.setHeader("Vary", "Origin, Sec-Fetch-Site, Cookie");
  response.setHeader("X-Nexora-Abuse-Shield", "v1");

  const bypass = internalBypass(request);
  const firstParty = hasFirstPartyBrowserSignal(request);
  if (!bypass && !firstParty) {
    send(response, 403, {
      ok: false,
      error: "FIRST_PARTY_PROOF_REQUIRED",
      message: "Permintaan API harus berasal dari runtime Nexora resmi."
    });
    return false;
  }

  if (!bypass) {
    const cookies = parseCookies(request);
    if (!validToken(request, cookies[SHIELD_COOKIE])) issueToken(request, response);
  }

  const tier = options.tier === "vvip" ? "vvip" : "free";
  const limits = limitsFor(toolId, tier);
  const bucket = bucketHash(request, toolId, tier, options.userId);
  const burst = takeFixedWindow(burstBuckets, bucket, {
    windowMs: 60_000,
    limit: limits.burst,
    maxEntries: 10_000
  });
  response.setHeader("X-RateLimit-Limit", String(burst.limit));
  response.setHeader("X-RateLimit-Remaining", String(burst.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(burst.resetAt / 1000)));
  if (!burst.allowed) {
    send(response, 429, {
      ok: false,
      error: "API_BURST_LIMITED",
      message: "Terlalu banyak permintaan dalam waktu singkat. Tunggu sebentar.",
      retryAfter: burst.retryAfter
    });
    return false;
  }

  let durable;
  try {
    durable = await durableQuota({ bucket, toolId, tier, limit: limits.hourly, databaseRequestImpl: options.databaseRequestImpl || databaseRequest });
  } catch (error) {
    send(response, Number(error.status || 503), {
      ok: false,
      error: error.code || "ABUSE_QUOTA_UNAVAILABLE",
      message: "API Abuse Shield belum dapat memverifikasi kuota."
    });
    return false;
  }

  response.setHeader("X-Nexora-Abuse-Quota", durable.durable ? "durable" : "memory-fallback");
  if (durable.durable) {
    response.setHeader("X-Nexora-Hourly-Limit", String(limits.hourly));
    response.setHeader("X-Nexora-Hourly-Remaining", String(durable.remaining));
  }
  if (!durable.allowed) {
    send(response, 429, {
      ok: false,
      error: "API_HOURLY_LIMITED",
      message: "Batas penggunaan API per jam tercapai. Coba lagi setelah jendela kuota berikutnya."
    });
    return false;
  }

  request[SHIELD_STATE] = { passed: true, toolId: String(toolId || ""), tier, durable: durable.durable };
  return true;
}

function resetApiAbuseShieldState() {
  burstBuckets.clear();
}

module.exports = {
  SHIELD_COOKIE,
  SHIELD_TTL_SECONDS,
  TOOL_LIMITS,
  bucketHash,
  durableQuota,
  enforceApiAbuseShield,
  hasFirstPartyBrowserSignal,
  resetApiAbuseShieldState,
  validToken
};

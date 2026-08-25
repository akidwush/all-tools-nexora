const { auditBatch } = require("../lib/audit");
const { handleWebIntelligence } = require("../lib/web-intelligence");
const { authorizeTool } = require("../lib/account-membership");
const { takeFixedWindow } = require("../lib/memory-store");
const { sendJson: send } = require("../lib/http-response");

const MAX_BODY_BYTES = 220_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestBuckets = new Map();

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || request.socket?.remoteAddress || "unknown").slice(0, 80);
}

function rateLimit(request) {
  return takeFixedWindow(requestBuckets, clientIp(request), {
    windowMs: WINDOW_MS,
    limit: MAX_REQUESTS_PER_WINDOW,
    maxEntries: 2_000
  });
}

async function readBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > MAX_BODY_BYTES) throw Object.assign(new Error("Payload terlalu besar."), { code: "PAYLOAD_TOO_LARGE", status: 413 });
    return JSON.parse(request.body || "{}");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Payload terlalu besar."), { code: "PAYLOAD_TOO_LARGE", status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(request, response) {
  const requestUrl = new URL(request.url || "/api/audit", "http://localhost");
  if (requestUrl.searchParams.get("mode") === "web-intelligence") {
    const healthOnly = request.method === "GET" && requestUrl.searchParams.get("health") === "1";
    if (!healthOnly && !(await authorizeTool(request, response, "webintel"))) return;
    return handleWebIntelligence(request, response, requestUrl);
  }
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.setHeader("Cache-Control", "no-store, max-age=0");
    return response.status(204).end();
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  if (!(await authorizeTool(request, response, "getcode"))) return;

  const limit = rateLimit(request);
  response.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
  response.setHeader("X-RateLimit-Remaining", String(limit.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(limit.resetAt / 1000)));
  if (!limit.allowed) {
    return send(response, 429, {
      ok: false,
      error: "AUDIT_RATE_LIMITED",
      message: "Terlalu banyak audit dalam satu menit. Coba lagi sesaat." 
    });
  }

  try {
    const payload = await readBody(request);
    if (!payload || !payload.target || !Array.isArray(payload.items) || payload.items.length === 0) {
      return send(response, 400, {
        ok: false,
        error: "INVALID_AUDIT_PAYLOAD",
        message: "Target dan daftar resource wajib diisi."
      });
    }
    const audit = await auditBatch(payload);
    return send(response, 200, { ok: true, audit });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    const code = error.code || (error instanceof SyntaxError ? "INVALID_JSON" : "AUDIT_FAILED");
    console.error("[live-audit]", code, error.message);
    return send(response, status, {
      ok: false,
      error: code,
      message: status >= 500 ? "Live audit belum dapat diselesaikan." : error.message
    });
  }
};

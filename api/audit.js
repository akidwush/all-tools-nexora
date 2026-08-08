const { auditBatch } = require("../lib/audit");

const MAX_BODY_BYTES = 220_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestBuckets = new Map();

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
}

function rateLimit(request) {
  const now = Date.now();
  const key = clientIp(request);
  const current = requestBuckets.get(key);
  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetAt: now + WINDOW_MS };
  }
  current.count += 1;
  requestBuckets.set(key, current);
  return {
    allowed: current.count <= MAX_REQUESTS_PER_WINDOW,
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - current.count),
    resetAt: current.resetAt
  };
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
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.setHeader("Cache-Control", "no-store, max-age=0");
    return response.status(204).end();
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

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

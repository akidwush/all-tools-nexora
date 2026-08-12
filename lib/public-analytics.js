const { anonymousHash, databaseRequest, getDatabaseConfig } = require("./database");
const { takeFixedWindow } = require("./memory-store");

const recent = new Map();
const MAX_BODY_BYTES = 8_192;
const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 40;
const ALLOWED_EVENTS = new Set(["page_view", "tool_open", "external_open", "tool_error"]);

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function clean(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function bodyBytes(request) {
  const length = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(length) && length > 0) return length;
  try { return Buffer.byteLength(JSON.stringify(request.body || {})); }
  catch { return MAX_BODY_BYTES + 1; }
}

function clientIp(request) {
  return clean(String(request.headers["x-forwarded-for"] || "").split(",")[0] || request.socket?.remoteAddress || "unknown", 120);
}

function allow(key) {
  return takeFixedWindow(recent, key, {
    windowMs: WINDOW_MS,
    limit: MAX_EVENTS_PER_WINDOW,
    maxEntries: 2_000
  }).allowed;
}

function referrerHost(value) {
  const text = clean(value, 500);
  if (!text) return null;
  try { return new URL(text).hostname.slice(0, 180) || null; }
  catch { return null; }
}

function cleanMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(["module", "source", "outcome", "reason"]);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) continue;
    if (!["string", "number", "boolean"].includes(typeof item)) continue;
    result[key] = typeof item === "string" ? clean(item, 160) : item;
  }
  return result;
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    return response.status(204).end();
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  if (bodyBytes(request) > MAX_BODY_BYTES) return send(response, 413, { ok: false, error: "PAYLOAD_TOO_LARGE" });
  if (!getDatabaseConfig().configured) return send(response, 202, { ok: true, stored: false });

  const body = request.body && typeof request.body === "object" ? request.body : {};
  const eventType = clean(body.eventType, 40).toLowerCase();
  const toolId = clean(body.toolId, 80).toLowerCase() || null;
  if (!ALLOWED_EVENTS.has(eventType)) return send(response, 400, { ok: false, error: "INVALID_EVENT" });
  if (toolId && !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(toolId)) return send(response, 400, { ok: false, error: "INVALID_TOOL_ID" });
  if (eventType !== "page_view" && !toolId) return send(response, 400, { ok: false, error: "TOOL_ID_REQUIRED" });

  const visitorToken = clean(body.visitorId, 160) || "anonymous";
  const sessionToken = clean(body.sessionId, 160) || "session";
  const visitorHash = anonymousHash(`${clientIp(request)}:${visitorToken}`);
  if (!allow(visitorHash)) return send(response, 202, { ok: true, stored: false, reason: "RATE_LIMITED" });

  const payload = {
    tool_id: toolId,
    event_type: eventType,
    visitor_hash: visitorHash,
    session_hash: anonymousHash(`session:${sessionToken}`),
    path: clean(body.path, 300) || "/",
    referrer_host: referrerHost(body.referrer),
    country_code: clean(body.countryCode, 8).toUpperCase() || null,
    device_type: clean(body.deviceType, 40).toLowerCase() || null,
    browser: clean(body.browser, 60) || null,
    metadata: cleanMetadata(body.metadata)
  };

  try {
    await databaseRequest("tool_usage_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([payload])
    });
    return send(response, 202, { ok: true, stored: true });
  } catch (error) {
    console.error("[analytics]", error.code || "ANALYTICS_SAVE_FAILED");
    return send(response, 202, { ok: true, stored: false });
  }
};

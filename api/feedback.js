const publicAnalyticsHandler = require("../lib/public-analytics");
const { anonymousHash, databaseRequest, getDatabaseConfig } = require("../lib/database");
const { pruneMap, setBounded } = require("../lib/memory-store");
const { sendJson } = require("../lib/http-response");

const recentRequests = new Map();
const WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 8_192;

const send = (response, status, payload) => sendJson(response, status, payload, { cacheControl: "no-store" });

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || request.socket?.remoteAddress || "unknown").slice(0, 80);
}

function clean(value, maxLength) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function bodyBytes(request) {
  const declared = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > 0) return declared;
  try { return Buffer.byteLength(JSON.stringify(request.body || {})); }
  catch { return MAX_BODY_BYTES + 1; }
}

module.exports = async function handler(request, response) {
  const requestUrl = new URL(request.url || "/api/feedback", `http://${request.headers.host || "localhost"}`);
  if (requestUrl.searchParams.get("mode") === "analytics") {
    return publicAnalyticsHandler(request, response);
  }
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return response.status(204).end();
  }

  if (request.method === "GET") {
    const id = clean(request.query?.id, 80);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return send(response, 400, { ok: false, error: "INVALID_FEEDBACK_ID" });
    try {
      const rows = await databaseRequest(`feedback?select=id,name,category,message,status,admin_reply,replied_at,resolved_at,created_at,updated_at&id=eq.${encodeURIComponent(id)}&limit=1`, { method: "GET" });
      const item = Array.isArray(rows) ? rows[0] : null;
      if (!item) return send(response, 404, { ok: false, error: "FEEDBACK_NOT_FOUND" });
      return send(response, 200, { ok: true, data: item });
    } catch (error) {
      console.error("[feedback-status]", error.code || "UNKNOWN_ERROR");
      return send(response, 503, { ok: false, error: "FEEDBACK_STATUS_FAILED", message: "Status laporan belum dapat diperiksa." });
    }
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  if (bodyBytes(request) > MAX_BODY_BYTES) {
    return send(response, 413, { ok: false, error: "PAYLOAD_TOO_LARGE", message: "Payload feedback terlalu besar." });
  }

  if (!getDatabaseConfig().configured) {
    return send(response, 503, {
      ok: false,
      error: "DATABASE_NOT_CONFIGURED",
      message: "Database belum diaktifkan. Pesan dapat disimpan sementara di perangkat."
    });
  }

  const body = request.body && typeof request.body === "object" ? request.body : {};
  if (clean(body.website, 120)) return send(response, 202, { ok: true });

  const name = clean(body.name, 40);
  const message = clean(body.message, 1000);
  const category = clean(body.category, 20).toLowerCase();
  const allowedCategories = new Set(["bug", "suggestion", "idea", "other"]);

  if (name.length < 3 || message.length < 5 || !allowedCategories.has(category)) {
    return send(response, 400, {
      ok: false,
      error: "INVALID_INPUT",
      message: "Nama, kategori, atau isi laporan belum valid."
    });
  }

  const ipHash = anonymousHash(clientIp(request));
  const lastRequest = recentRequests.get(ipHash) || 0;
  if (Date.now() - lastRequest < WINDOW_MS) {
    return send(response, 429, {
      ok: false,
      error: "RATE_LIMITED",
      message: "Tunggu satu menit sebelum mengirim laporan berikutnya."
    });
  }
  const now = Date.now();
  setBounded(recentRequests, ipHash, now, {
    maxEntries: 2_000,
    now,
    isExpired: (savedAt) => now - savedAt >= WINDOW_MS
  });

  try {
    const rows = await databaseRequest("feedback", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name, message, category, ip_hash: ipHash, source: "website" }])
    });
    const item = Array.isArray(rows) ? rows[0] : null;
    return send(response, 201, { ok: true, id: item?.id || null, status: item?.status || "new" });
  } catch (error) {
    console.error("[feedback]", error.code || "UNKNOWN_ERROR");
    return send(response, 500, {
      ok: false,
      error: "FEEDBACK_SAVE_FAILED",
      message: "Laporan belum dapat disimpan. Coba lagi nanti."
    });
  }
};

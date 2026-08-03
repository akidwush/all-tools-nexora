const { anonymousHash, databaseRequest, getDatabaseConfig } = require("../lib/database");

const recentRequests = new Map();
const WINDOW_MS = 60_000;

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
}

function clean(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
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
  recentRequests.set(ipHash, Date.now());

  try {
    const rows = await databaseRequest("feedback", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name, message, category, ip_hash: ipHash, source: "website" }])
    });
    const item = Array.isArray(rows) ? rows[0] : null;
    return send(response, 201, { ok: true, id: item?.id || null });
  } catch (error) {
    console.error("[feedback]", error.code || "UNKNOWN_ERROR");
    return send(response, 500, {
      ok: false,
      error: "FEEDBACK_SAVE_FAILED",
      message: "Laporan belum dapat disimpan. Coba lagi nanti."
    });
  }
};

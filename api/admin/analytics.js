const { databaseRequest } = require("../../lib/database");
const { requireAdmin } = require("../../lib/admin-auth");
const { sendJson: send } = require("../../lib/http-response");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  try {
    await requireAdmin(request, response);
    const requested = Number(request.query?.days || 30);
    const days = [7, 30, 90].includes(requested) ? requested : 30;
    const data = await databaseRequest("rpc/admin_analytics_summary", {
      method: "POST",
      body: JSON.stringify({ p_days: days })
    });
    return send(response, 200, { ok: true, data: data && typeof data === "object" ? data : {} });
  } catch (error) {
    const status = Number(error.status || 500);
    console.error("[admin-analytics]", error.code || "UNKNOWN_ERROR");
    return send(response, status, {
      ok: false,
      error: error.code || "ADMIN_ANALYTICS_FAILED",
      message: status === 401 ? "Sesi admin berakhir." : "Analytics belum dapat dimuat. Pastikan migration v5.1 sudah dijalankan."
    });
  }
};

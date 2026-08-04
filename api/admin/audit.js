const { databaseRequest } = require("../../lib/database");
const { requireAdmin } = require("../../lib/admin-auth");

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}
function clean(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  try {
    await requireAdmin(request, response);
    const limit = Math.max(10, Math.min(100, Math.trunc(Number(request.query?.limit || 50)) || 50));
    const action = clean(request.query?.action, 80);
    const entityType = clean(request.query?.entityType, 80);
    const parts = ["select=id,admin_user_id,admin_email,action,entity_type,entity_id,summary,before_data,after_data,created_at", "order=created_at.desc", `limit=${limit}`];
    if (action && action !== "all") parts.push(`action=eq.${encodeURIComponent(action)}`);
    if (entityType && entityType !== "all") parts.push(`entity_type=eq.${encodeURIComponent(entityType)}`);
    const rows = await databaseRequest(`admin_audit_logs?${parts.join("&")}`, { method: "GET" });
    return send(response, 200, { ok: true, data: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    const status = Number(error.status || 500);
    console.error("[admin-audit-list]", error.code || "UNKNOWN_ERROR");
    return send(response, status, {
      ok: false,
      error: error.code || "ADMIN_AUDIT_FAILED",
      message: status === 401 ? "Sesi admin berakhir." : "Audit log belum dapat dimuat."
    });
  }
};

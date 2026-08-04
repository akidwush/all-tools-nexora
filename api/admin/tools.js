const { databaseRequest } = require("../../lib/database");
const { requireAdmin, verifyMutationRequest } = require("../../lib/admin-auth");
const { recordAdminAudit } = require("../../lib/admin-audit");

const ALLOWED_CATEGORIES = new Set(["downloader", "maker", "tools", "vault", "external"]);

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function clean(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function externalUrl(value) {
  const text = clean(value, 500);
  if (!text) return null;
  const parsed = new URL(text);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("INVALID_EXTERNAL_URL");
  return parsed.toString();
}

function auditShape(item) {
  if (!item) return null;
  return {
    name: item.name,
    description: item.description,
    category: item.category,
    badge: item.badge,
    icon: item.icon,
    externalUrl: item.external_url,
    isActive: item.is_active,
    sortOrder: item.sort_order
  };
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return response.status(204).end();
  }

  try {
    if (request.method === "GET") {
      await requireAdmin(request, response);
      const rows = await databaseRequest(
        "tools?select=id,name,description,category,badge,icon,external_url,is_active,sort_order,metadata,created_at,updated_at&order=sort_order.asc,name.asc",
        { method: "GET" }
      );
      return send(response, 200, { ok: true, data: Array.isArray(rows) ? rows : [] });
    }

    if (request.method === "PATCH") {
      const session = await requireAdmin(request, response, { edit: true });
      if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const id = clean(body.id, 80).toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(id)) return send(response, 400, { ok: false, error: "INVALID_TOOL_ID" });

      const category = clean(body.category, 30).toLowerCase();
      if (category && !ALLOWED_CATEGORIES.has(category)) return send(response, 400, { ok: false, error: "INVALID_CATEGORY" });
      let url = null;
      try { url = externalUrl(body.externalUrl); }
      catch { return send(response, 400, { ok: false, error: "INVALID_EXTERNAL_URL", message: "URL eksternal harus memakai http atau https." }); }

      const payload = {
        name: clean(body.name, 80),
        description: clean(body.description, 240),
        category: category || "tools",
        badge: clean(body.badge, 30) || null,
        icon: clean(body.icon, 100) || null,
        external_url: url,
        is_active: Boolean(body.isActive),
        sort_order: Math.max(-10000, Math.min(10000, Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0)),
        updated_at: new Date().toISOString()
      };
      if (payload.name.length < 2) return send(response, 400, { ok: false, error: "INVALID_NAME" });

      const currentRows = await databaseRequest(`tools?select=id,name,description,category,badge,icon,external_url,is_active,sort_order&id=eq.${encodeURIComponent(id)}&limit=1`, { method: "GET" });
      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!current) return send(response, 404, { ok: false, error: "TOOL_NOT_FOUND" });

      const rows = await databaseRequest(`tools?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
      const item = Array.isArray(rows) ? rows[0] : null;
      if (!item) return send(response, 404, { ok: false, error: "TOOL_NOT_FOUND" });

      const auditLogged = await recordAdminAudit({
        request,
        session,
        action: "tool.update",
        entityType: "tool",
        entityId: id,
        summary: `Tool ${item.name} diperbarui`,
        before: auditShape(current),
        after: auditShape(item)
      });

      return send(response, 200, {
        ok: true,
        data: item,
        auditLogged,
        updatedBy: session.user.email || session.user.id
      });
    }

    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const status = Number(error.status || 500);
    console.error("[admin-tools]", error.code || "UNKNOWN_ERROR");
    return send(response, status, {
      ok: false,
      error: error.code || "ADMIN_TOOLS_FAILED",
      message: status === 401 ? "Sesi admin berakhir." : status === 403 ? "Akses ditolak." : "Data tools belum dapat diproses."
    });
  }
};

const { databaseRequest } = require("../../lib/database");
const { requireAdmin, verifyMutationRequest } = require("../../lib/admin-auth");
const { recordAdminAudit } = require("../../lib/admin-audit");
const { sendJson: send } = require("../../lib/http-response");

const STATUSES = new Set(["new", "reviewing", "resolved", "rejected"]);
const CATEGORIES = new Set(["bug", "suggestion", "idea", "other"]);

function clean(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function counts(rows) {
  const result = { total: rows.length, new: 0, reviewing: 0, resolved: 0, rejected: 0 };
  for (const row of rows) if (Object.hasOwn(result, row.status)) result[row.status] += 1;
  return result;
}

async function allFeedback() {
  const rows = await databaseRequest("feedback?select=id,name,category,message,status,source,admin_reply,internal_note,admin_updated_by,replied_at,resolved_at,created_at,updated_at&order=created_at.desc&limit=1000", { method: "GET" });
  return Array.isArray(rows) ? rows : [];
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return response.status(204).end();
  }
  try {
    if (request.method === "GET") {
      await requireAdmin(request, response);
      const rows = await allFeedback();
      const query = clean(request.query?.q, 120).toLowerCase();
      const status = clean(request.query?.status, 20).toLowerCase();
      const category = clean(request.query?.category, 20).toLowerCase();
      const page = Math.max(1, Math.trunc(Number(request.query?.page || 1)) || 1);
      const pageSize = Math.max(10, Math.min(100, Math.trunc(Number(request.query?.pageSize || 30)) || 30));
      const filtered = rows.filter((item) =>
        (!query || `${item.name} ${item.message} ${item.admin_reply || ""} ${item.internal_note || ""}`.toLowerCase().includes(query)) &&
        (!status || status === "all" || item.status === status) &&
        (!category || category === "all" || item.category === category)
      );
      const start = (page - 1) * pageSize;
      return send(response, 200, {
        ok: true,
        data: filtered.slice(start, start + pageSize),
        pagination: { page, pageSize, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / pageSize)) },
        counts: counts(rows)
      });
    }

    if (request.method === "PATCH") {
      const session = await requireAdmin(request, response, { edit: true });
      if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const id = clean(body.id, 80);
      const status = clean(body.status, 20).toLowerCase();
      const adminReply = clean(body.adminReply, 1_500) || null;
      const internalNote = clean(body.internalNote, 1_500) || null;
      if (!/^[0-9a-f-]{36}$/i.test(id)) return send(response, 400, { ok: false, error: "INVALID_FEEDBACK_ID" });
      if (!STATUSES.has(status)) return send(response, 400, { ok: false, error: "INVALID_STATUS" });

      const currentRows = await databaseRequest(`feedback?select=id,name,category,message,status,admin_reply,internal_note,replied_at,resolved_at,created_at,updated_at&id=eq.${encodeURIComponent(id)}&limit=1`, { method: "GET" });
      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!current) return send(response, 404, { ok: false, error: "FEEDBACK_NOT_FOUND" });

      const now = new Date().toISOString();
      const payload = {
        status,
        admin_reply: adminReply,
        internal_note: internalNote,
        admin_updated_by: session.user.id,
        replied_at: adminReply ? (current.replied_at || now) : null,
        resolved_at: status === "resolved" ? (current.resolved_at || now) : null,
        updated_at: now
      };
      const rows = await databaseRequest(`feedback?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
      const item = Array.isArray(rows) ? rows[0] : null;
      const auditLogged = await recordAdminAudit({
        request,
        session,
        action: "feedback.update",
        entityType: "feedback",
        entityId: id,
        summary: `Feedback ${current.name} diubah menjadi ${status}`,
        before: { status: current.status, adminReply: current.admin_reply, internalNote: current.internal_note },
        after: { status: item?.status, adminReply: item?.admin_reply, internalNote: item?.internal_note }
      });
      return send(response, 200, { ok: true, data: item, auditLogged });
    }

    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const status = Number(error.status || 500);
    console.error("[admin-feedback]", error.code || "UNKNOWN_ERROR");
    return send(response, status, {
      ok: false,
      error: error.code || "ADMIN_FEEDBACK_FAILED",
      message: status === 401 ? "Sesi admin berakhir." : status === 403 ? "Akses ditolak." : "Feedback belum dapat diproses."
    });
  }
};

const { databaseRequest } = require("../../lib/database");
const { requireAdmin, verifyMutationRequest } = require("../../lib/admin-auth");
const { recordAdminAudit } = require("../../lib/admin-audit");
const { sendJson: send } = require("../../lib/http-response");

function clean(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function socialUrl(value) {
  const text = clean(value, 500);
  if (!text) return "";
  const parsed = new URL(text);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("INVALID_SOCIAL_URL");
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

function iconClass(value) {
  const icon = clean(value, 100) || "fa-solid fa-link";
  if (!/^[a-z0-9 _-]+$/i.test(icon)) throw new Error("INVALID_ICON");
  return icon;
}

function accentColor(value) {
  const color = clean(value, 7).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error("INVALID_ACCENT_COLOR");
  return color;
}

function auditShape(item) {
  if (!item) return null;
  return {
    platform: item.platform,
    label: item.label,
    description: item.description,
    url: item.url,
    icon: item.icon,
    accentColor: item.accent_color,
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
        "social_links?select=key,platform,label,description,url,icon,accent_color,is_active,sort_order,metadata,created_at,updated_at&order=sort_order.asc,label.asc",
        { method: "GET" }
      );
      return send(response, 200, { ok: true, data: Array.isArray(rows) ? rows : [] });
    }

    if (request.method === "PATCH") {
      const session = await requireAdmin(request, response, { edit: true });
      if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });

      const body = request.body && typeof request.body === "object" ? request.body : {};
      const key = clean(body.key, 80).toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(key)) return send(response, 400, { ok: false, error: "INVALID_SOCIAL_KEY" });

      let url;
      let icon;
      let color;
      try {
        url = socialUrl(body.url);
        icon = iconClass(body.icon);
        color = accentColor(body.accentColor);
      } catch (error) {
        const messages = {
          INVALID_SOCIAL_URL: "URL sosial harus memakai http atau https.",
          INVALID_ICON: "Class icon hanya boleh berisi huruf, angka, spasi, garis bawah, dan tanda hubung.",
          INVALID_ACCENT_COLOR: "Warna harus berformat HEX 6 digit, misalnya #25d366."
        };
        return send(response, 400, { ok: false, error: error.message, message: messages[error.message] || "Data sosial tidak valid." });
      }

      const isActive = Boolean(body.isActive);
      if (isActive && !url) return send(response, 400, { ok: false, error: "ACTIVE_SOCIAL_REQUIRES_URL", message: "Isi URL sebelum mengaktifkan link sosial." });

      const payload = {
        platform: clean(body.platform, 40).toLowerCase(),
        label: clean(body.label, 80),
        description: clean(body.description, 240),
        url,
        icon,
        accent_color: color,
        is_active: isActive,
        sort_order: Math.max(-10000, Math.min(10000, Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0)),
        updated_at: new Date().toISOString()
      };
      if (payload.platform.length < 2) return send(response, 400, { ok: false, error: "INVALID_PLATFORM" });
      if (payload.label.length < 2) return send(response, 400, { ok: false, error: "INVALID_LABEL" });

      const currentRows = await databaseRequest(
        `social_links?select=key,platform,label,description,url,icon,accent_color,is_active,sort_order&key=eq.${encodeURIComponent(key)}&limit=1`,
        { method: "GET" }
      );
      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!current) return send(response, 404, { ok: false, error: "SOCIAL_LINK_NOT_FOUND" });

      const rows = await databaseRequest(`social_links?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
      const item = Array.isArray(rows) ? rows[0] : null;
      if (!item) return send(response, 404, { ok: false, error: "SOCIAL_LINK_NOT_FOUND" });

      const auditLogged = await recordAdminAudit({
        request,
        session,
        action: "social_link.update",
        entityType: "social_link",
        entityId: key,
        summary: `Link ${item.label} diperbarui`,
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
    console.error("[admin-socials]", error.code || "UNKNOWN_ERROR");
    return send(response, status, {
      ok: false,
      error: error.code || "ADMIN_SOCIALS_FAILED",
      message: status === 401 ? "Sesi admin berakhir." : status === 403 ? "Akses ditolak." : "Link sosial belum dapat diproses."
    });
  }
};

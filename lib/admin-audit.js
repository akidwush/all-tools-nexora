const { anonymousHash, databaseRequest } = require("./database");

function clean(value, maxLength = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function clientIp(request) {
  return clean(String(request?.headers?.["x-forwarded-for"] || "").split(",")[0] || request?.socket?.remoteAddress || "unknown", 120);
}

function safeJson(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return typeof value === "string" ? clean(value, 2_000) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeJson(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, item]) => [clean(key, 120), safeJson(item, depth + 1)]));
  }
  return clean(value, 500);
}

async function recordAdminAudit({ request, session, action, entityType, entityId, summary, before, after }) {
  const actor = session?.user || {};
  const payload = {
    admin_user_id: actor.id || null,
    admin_email: clean(actor.email, 254) || null,
    action: clean(action, 80),
    entity_type: clean(entityType, 80),
    entity_id: clean(entityId, 160) || null,
    summary: clean(summary, 500) || null,
    before_data: before === undefined ? null : safeJson(before),
    after_data: after === undefined ? null : safeJson(after),
    ip_hash: anonymousHash(clientIp(request)),
    user_agent: clean(request?.headers?.["user-agent"], 500) || null
  };

  if (!payload.action || !payload.entity_type) return false;
  try {
    await databaseRequest("admin_audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([payload])
    });
    return true;
  } catch (error) {
    console.error("[admin-audit]", error.code || "AUDIT_WRITE_FAILED");
    return false;
  }
}

module.exports = { recordAdminAudit, safeJson };

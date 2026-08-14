const { databaseRequest } = require("../../lib/database");
const { publicSession, requireAdmin, verifyMutationRequest } = require("../../lib/admin-auth");
const { recordAdminAudit } = require("../../lib/admin-audit");
const { TOOL_CATALOG, normalizeCachedRows, summarizeHealth } = require("../../lib/tool-health");

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function booleanValue(value, fallback = true) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function heroVideoUrl(value) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 1000);
  if (!text) return null;
  if (/^\/(?!\/)/.test(text)) return text;
  let parsed;
  try { parsed = new URL(text); }
  catch { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  return parsed.toString();
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function updateHeroVideo(request, response) {
  const session = await requireAdmin(request, response, { edit: true });
  if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
  const body = objectValue(request.body);
  if (body.key !== "site" || !body.heroVideo || typeof body.heroVideo !== "object" || Array.isArray(body.heroVideo)) {
    return send(response, 400, { ok: false, error: "INVALID_SETTINGS_PAYLOAD", message: "Payload pengaturan video tidak valid." });
  }

  const currentRows = await databaseRequest("app_settings?select=key,value,is_public,updated_at&key=eq.site&limit=1", { method: "GET" });
  const current = Array.isArray(currentRows) ? currentRows[0] || null : null;
  const currentValue = objectValue(current && current.value);
  const previousHero = objectValue(currentValue.heroVideo);
  const enabled = booleanValue(body.heroVideo.enabled, previousHero.enabled !== false);
  const url = heroVideoUrl(body.heroVideo.url);
  if (enabled && !url) {
    return send(response, 400, { ok: false, error: "INVALID_HERO_VIDEO_URL", message: "Video aktif wajib memakai URL HTTPS langsung yang valid." });
  }

  const nextHero = { enabled, url: url || String(previousHero.url || "") };
  const nextValue = { ...currentValue, heroVideo: nextHero };
  const rows = await databaseRequest("app_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key: "site", value: nextValue, is_public: true, updated_at: new Date().toISOString() })
  });
  const item = Array.isArray(rows) ? rows[0] || null : null;
  if (!item) return send(response, 500, { ok: false, error: "SETTINGS_UPDATE_FAILED" });

  const auditLogged = await recordAdminAudit({
    request,
    session,
    action: "settings.hero_video.update",
    entityType: "app_setting",
    entityId: "site",
    summary: "Video header publik diperbarui",
    before: { heroVideo: previousHero },
    after: { heroVideo: nextHero }
  });
  return send(response, 200, { ok: true, data: item, auditLogged });
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return response.status(204).end();
  }
  if (request.method === "PATCH") {
    try { return await updateHeroVideo(request, response); }
    catch (error) {
      const status = Number(error.status || 500);
      console.error("[admin-dashboard-settings]", error.code || "UNKNOWN_ERROR");
      return send(response, status, {
        ok: false,
        error: error.code || "ADMIN_SETTINGS_FAILED",
        message: status === 401 ? "Sesi admin berakhir." : status === 403 ? "Akses ditolak." : "Pengaturan video belum dapat disimpan."
      });
    }
  }
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const session = await requireAdmin(request, response);
    const [tools, feedbackRows, recentFeedback, healthRows, settings] = await Promise.all([
      databaseRequest("tools?select=id,name,description,category,badge,icon,external_url,is_active,sort_order,updated_at&order=sort_order.asc,name.asc", { method: "GET" }),
      databaseRequest("feedback?select=id,status&limit=500", { method: "GET" }),
      databaseRequest("feedback?select=id,name,category,message,status,admin_reply,created_at,updated_at&order=created_at.desc&limit=8", { method: "GET" }),
      databaseRequest("tool_health?select=tool_id,tool_name,category,status,target_type,http_status,latency_ms,success_rate,total_checks,successful_checks,consecutive_failures,last_error,last_checked_at,last_success_at,metadata,updated_at&order=tool_name.asc", { method: "GET" }),
      databaseRequest("app_settings?select=key,value,is_public,updated_at&order=key.asc", { method: "GET" })
    ]);

    const feedback = Array.isArray(feedbackRows) ? feedbackRows : [];
    const feedbackCounts = { new: 0, reviewing: 0, resolved: 0, rejected: 0 };
    for (const item of feedback) {
      if (Object.hasOwn(feedbackCounts, item.status)) feedbackCounts[item.status] += 1;
    }
    const toolRows = Array.isArray(tools) ? tools : [];
    const cachedHealth = normalizeCachedRows(healthRows);
    const healthById = new Map(cachedHealth.map((item) => [item.toolId, item]));
    const normalizedHealth = TOOL_CATALOG.map((tool) => healthById.get(tool.id) || ({
      toolId: tool.id,
      name: tool.name,
      category: tool.category,
      status: "unknown",
      targetType: tool.target.type,
      httpStatus: null,
      latencyMs: null,
      successRate: 0,
      totalChecks: 0,
      successfulChecks: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastCheckedAt: null,
      lastSuccessAt: null,
      metadata: {}
    }));

    return send(response, 200, {
      ok: true,
      session: publicSession(session),
      summary: {
        tools: {
          total: toolRows.length,
          active: toolRows.filter((tool) => tool.is_active).length,
          inactive: toolRows.filter((tool) => !tool.is_active).length
        },
        feedback: {
          total: feedback.length,
          counts: feedbackCounts
        },
        health: summarizeHealth(normalizedHealth)
      },
      recentFeedback: Array.isArray(recentFeedback) ? recentFeedback : [],
      health: normalizedHealth,
      settings: Array.isArray(settings) ? settings : []
    });
  } catch (error) {
    const status = Number(error.status || 500);
    console.error("[admin-dashboard]", error.code || "UNKNOWN_ERROR");
    return send(response, status, {
      ok: false,
      error: error.code || "ADMIN_DASHBOARD_FAILED",
      message: status === 401 ? "Sesi admin berakhir." : "Dashboard belum dapat dimuat."
    });
  }
};

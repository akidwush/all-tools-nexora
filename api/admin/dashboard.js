const { databaseRequest } = require("../../lib/database");
const { publicSession, requireAdmin } = require("../../lib/admin-auth");
const { TOOL_CATALOG, normalizeCachedRows, summarizeHealth } = require("../../lib/tool-health");

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
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

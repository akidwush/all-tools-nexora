const { databaseRequest } = require("../../lib/database");
const { publicSession, requireAdmin, verifyMutationRequest } = require("../../lib/admin-auth");
const { recordAdminAudit } = require("../../lib/admin-audit");
const { TOOL_CATALOG, normalizeCachedRows, summarizeHealth } = require("../../lib/tool-health");
const RETIRED_TOOL_IDS = new Set(["bigimage"]);
const handleAdminPersonalAi = require("../../lib/admin-personal-ai-http");
const { sendJson: send } = require("../../lib/http-response");

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

function safeText(value, max, fallback = "") {
  return String(value == null ? fallback : value).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function safeExternalUrl(value) {
  const text = safeText(value, 1000);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : "";
  } catch { return ""; }
}

function safeIcon(value) {
  const icon = safeText(value, 100, "fa-solid fa-circle");
  return /^[a-z0-9 _-]+$/i.test(icon) ? icon : "fa-solid fa-circle";
}

function safeProfileItems(value, type) {
  const rows = Array.isArray(value) ? value.slice(0, 30) : [];
  return rows.map((row, index) => {
    const item = objectValue(row);
    const base = { id: safeText(item.id, 80, `${type}-${index + 1}`).replace(/[^a-z0-9_-]/gi, "-") || `${type}-${index + 1}`, isVisible: booleanValue(item.isVisible, true), sortOrder: Math.max(-10000, Math.min(10000, Number(item.sortOrder) || (index + 1) * 10)) };
    if (type === "skills") return { ...base, icon: safeIcon(item.icon), title: safeText(item.title, 80), description: safeText(item.description, 360) };
    if (type === "projects") return { ...base, title: safeText(item.title, 100), description: safeText(item.description, 500), imageUrl: safeExternalUrl(item.imageUrl), url: safeExternalUrl(item.url) };
    return { ...base, platform: safeText(item.platform, 60), icon: safeIcon(item.icon), url: safeExternalUrl(item.url) };
  }).filter((item) => type === "skills" ? item.title : type === "projects" ? item.title : item.platform && item.url);
}

function normalizeDeveloperProfile(value) {
  const profile = objectValue(value);
  return {
    name: safeText(profile.name, 80, "Dika") || "Dika",
    label: safeText(profile.label, 80, "All Tools Nexora") || "All Tools Nexora",
    role: safeText(profile.role, 100), headline: safeText(profile.headline, 140), bio: safeText(profile.bio, 1600),
    avatarUrl: safeExternalUrl(profile.avatarUrl), avatarAlt: safeText(profile.avatarAlt, 160, "Avatar developer"),
    statusOnline: booleanValue(profile.statusOnline, true), statusLabel: safeText(profile.statusLabel, 80, "System online") || "System online",
    footer: safeText(profile.footer, 240), skills: safeProfileItems(profile.skills, "skills"),
    projects: safeProfileItems(profile.projects, "projects"), socials: safeProfileItems(profile.socials, "socials")
  };
}

async function updateDeveloperProfile(request, response) {
  const session = await requireAdmin(request, response, { edit: true });
  if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
  const body = objectValue(request.body);
  if (body.key !== "developer_profile" || !body.profile || typeof body.profile !== "object" || Array.isArray(body.profile)) return send(response, 400, { ok: false, error: "INVALID_DEVELOPER_PROFILE" });
  const currentRows = await databaseRequest("developer_profiles?select=id,data,is_published&id=eq.primary&limit=1", { method: "GET" });
  const current = Array.isArray(currentRows) ? currentRows[0] || null : null;
  const data = normalizeDeveloperProfile(body.profile);
  const isPublished = booleanValue(body.isPublished, current ? current.is_published : true);
  const rows = await databaseRequest("developer_profiles?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ id: "primary", data, is_published: isPublished }) });
  const item = Array.isArray(rows) ? rows[0] || null : null;
  if (!item) return send(response, 500, { ok: false, error: "DEVELOPER_PROFILE_SAVE_FAILED" });
  const auditLogged = await recordAdminAudit({ request, session, action: "developer_profile.update", entityType: "developer_profile", entityId: "primary", summary: "Profil About Developer diperbarui", before: current ? { isPublished: current.is_published } : {}, after: { isPublished } });
  return send(response, 200, { ok: true, data: item, auditLogged });
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
  const requestUrl = new URL(request.url || "/api/admin/dashboard", `http://${request.headers.host || "localhost"}`);
  if (requestUrl.searchParams.get("mode") === "personal-ai") return handleAdminPersonalAi(request, response);
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return response.status(204).end();
  }
  if (request.method === "PATCH") {
    try {
      const body = objectValue(request.body);
      if (body.key === "developer_profile") return await updateDeveloperProfile(request, response);
      return await updateHeroVideo(request, response);
    }
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
    const [tools, feedbackRows, recentFeedback, healthRows, settings, developerProfile, profiles, subscriptions, recentActivity] = await Promise.all([
      databaseRequest("tools?select=id,name,description,category,badge,icon,external_url,is_active,access_level,sort_order,updated_at&order=sort_order.asc,name.asc", { method: "GET" }),
      databaseRequest("feedback?select=id,status&limit=500", { method: "GET" }),
      databaseRequest("feedback?select=id,name,category,message,status,admin_reply,created_at,updated_at&order=created_at.desc&limit=8", { method: "GET" }),
      databaseRequest("tool_health?select=tool_id,tool_name,category,status,target_type,http_status,latency_ms,success_rate,total_checks,successful_checks,consecutive_failures,last_error,last_checked_at,last_success_at,metadata,updated_at&order=tool_name.asc", { method: "GET" }),
      databaseRequest("app_settings?select=key,value,is_public,updated_at&order=key.asc", { method: "GET" }),
      databaseRequest("developer_profiles?select=id,data,is_published,updated_at&id=eq.primary&limit=1", { method: "GET" }),
      databaseRequest("profiles?select=id,account_status,created_at&limit=5000", { method: "GET" }),
      databaseRequest("subscriptions?select=user_id,plan,status,expires_at&limit=5000", { method: "GET" }),
      databaseRequest("admin_audit_logs?select=id,action,entity_type,entity_id,summary,admin_email,created_at&order=created_at.desc&limit=8", { method: "GET" })
    ]);

    const feedback = Array.isArray(feedbackRows) ? feedbackRows : [];
    const feedbackCounts = { new: 0, reviewing: 0, resolved: 0, rejected: 0 };
    for (const item of feedback) {
      if (Object.hasOwn(feedbackCounts, item.status)) feedbackCounts[item.status] += 1;
    }
    const toolRows = (Array.isArray(tools) ? tools : []).filter((item) => !RETIRED_TOOL_IDS.has(item.id));
    const storedToolIds = new Set(toolRows.map((item) => item.id));
    const missingBuiltinTools = TOOL_CATALOG.filter((item) => !storedToolIds.has(item.id)).length;
    const profileRows = Array.isArray(profiles) ? profiles : [];
    const subscriptionRows = Array.isArray(subscriptions) ? subscriptions : [];
    const now = Date.now();
    const suspendedIds = new Set(profileRows.filter((item) => item.account_status === "suspended").map((item) => item.id));
    const activeVvip = subscriptionRows.filter((item) => item.plan === "vvip" && item.status === "active" && !suspendedIds.has(item.user_id) && item.expires_at && new Date(item.expires_at).getTime() > now).length;
    const expiredVvip = subscriptionRows.filter((item) => item.plan === "vvip" && item.expires_at && new Date(item.expires_at).getTime() <= now).length;
    const suspendedUsers = profileRows.filter((item) => item.account_status === "suspended").length;
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
        members: {
          total: profileRows.length,
          activeVvip,
          expiredVvip,
          suspended: suspendedUsers,
          free: Math.max(0, profileRows.length - activeVvip)
        },
        tools: {
          total: toolRows.length + missingBuiltinTools,
          active: toolRows.filter((tool) => tool.is_active).length + missingBuiltinTools,
          inactive: toolRows.filter((tool) => !tool.is_active).length
        },
        feedback: {
          total: feedback.length,
          counts: feedbackCounts
        },
        health: summarizeHealth(normalizedHealth)
      },
      recentFeedback: Array.isArray(recentFeedback) ? recentFeedback : [],
      recentActivity: Array.isArray(recentActivity) ? recentActivity : [],
      health: normalizedHealth,
      settings: Array.isArray(settings) ? settings : [],
      developerProfile: Array.isArray(developerProfile) ? developerProfile[0] || null : null
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

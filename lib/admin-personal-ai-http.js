"use strict";

const { databaseRequest } = require("./database");
const { requireAdmin, verifyMutationRequest } = require("./admin-auth");
const { recordAdminAudit } = require("./admin-audit");
const { ALLOWED_MODELS, DEFAULT_SETTINGS, generateGeminiReply, normalizeSettings, readSettingsRow, settingsFromRow, settingsToRow } = require("./personal-ai");
const { resolveGeminiApiKey } = require("./gemini-config");
const { sendJson: send } = require("./http-response");

function bodyObject(request) { return request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body) ? request.body : {}; }
function adminShape(row) {
  const published = row ? settingsFromRow(row) : DEFAULT_SETTINGS;
  let draft = published;
  if (row && row.draft_data && typeof row.draft_data === "object") { try { draft = normalizeSettings(row.draft_data); } catch { draft = published; } }
  return { published, draft, status: { apiConfigured: resolveGeminiApiKey().configured, published: Boolean(row && row.published_at), enabled: Boolean(row && row.published_at && row.enabled), publishedAt: row?.published_at || null, updatedAt: row?.updated_at || null }, allowedModels: ALLOWED_MODELS };
}
async function upsert(payload) {
  const rows = await databaseRequest("ai_settings?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify([payload]) });
  return Array.isArray(rows) ? rows[0] || null : null;
}

module.exports = async function handleAdminPersonalAi(request, response) {
  if (request.method === "OPTIONS") { response.setHeader("Allow", "GET, POST, PATCH, OPTIONS"); return response.status(204).end(); }
  try {
    if (request.method === "GET") { await requireAdmin(request, response); return send(response, 200, { ok: true, data: adminShape(await readSettingsRow()) }); }
    if (!["POST", "PATCH"].includes(request.method)) { response.setHeader("Allow", "GET, POST, PATCH, OPTIONS"); return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" }); }
    const session = await requireAdmin(request, response, { edit: true });
    if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED", message: "Permintaan ditolak. Muat ulang dashboard." });
    const body = bodyObject(request), action = String(body.action || "").trim().toLowerCase();
    if (request.method === "POST") {
      if (action !== "test") return send(response, 400, { ok: false, error: "INVALID_AI_ACTION" });
      if (!resolveGeminiApiKey().configured) return send(response, 503, { ok: false, error: "GEMINI_NOT_CONFIGURED", message: "Nexora AI belum dikonfigurasi." });
      const message = String(body.message || "").trim();
      if (!message || message.length > 4000) return send(response, 400, { ok: false, error: "INVALID_TEST_MESSAGE", message: "Pesan pengujian wajib diisi dan maksimal 4.000 karakter." });
      const settings = normalizeSettings(body.settings || DEFAULT_SETTINGS);
      const result = await generateGeminiReply({ settings, message, history: [] });
      return send(response, 200, { ok: true, reply: result.text, model: result.model, status: "connected" });
    }

    const current = await readSettingsRow();
    const settings = action === "reset" ? normalizeSettings(DEFAULT_SETTINGS) : normalizeSettings(body.settings || {});
    const now = new Date().toISOString();
    const common = { id: "primary", draft_data: settings, updated_at: now, updated_by: session.user.id };
    let payload = common;
    if (action === "publish") payload = settingsToRow(settings, { ...common, published_at: now });
    else if (!["draft", "reset"].includes(action)) return send(response, 400, { ok: false, error: "INVALID_AI_ACTION", message: "Aksi pengaturan AI tidak valid." });
    const saved = await upsert(payload);
    if (!saved) throw Object.assign(new Error("Pengaturan AI tidak tersimpan."), { code: "AI_SETTINGS_WRITE_FAILED", status: 502 });
    await recordAdminAudit({ request, session, action: `personal_ai.${action}`, entityType: "ai_settings", entityId: "primary", summary: action === "publish" ? "Pengaturan Personal AI dipublikasikan" : action === "reset" ? "Draft Personal AI direset" : "Draft Personal AI disimpan", before: current ? { enabled: current.enabled, assistantName: current.assistant_name, publishedAt: current.published_at } : null, after: { enabled: settings.enabled, assistantName: settings.assistantName, publishedAt: saved.published_at || null } });
    return send(response, 200, { ok: true, data: adminShape(saved), action });
  } catch (error) {
    const status = Number(error.status || 500);
    console.error("[admin-personal-ai]", error.code || "ADMIN_AI_FAILED");
    let message = "Pengaturan Personal AI belum dapat diproses.";
    if (status === 401) message = "Sesi admin berakhir."; else if (status === 403) message = "Akses ditolak."; else if (error.code === "GEMINI_NOT_CONFIGURED") message = "Nexora AI belum dikonfigurasi."; else if (status === 400) message = error.message; else if (error.code === "DATABASE_REQUEST_FAILED" && error.postgresCode === "42P01") message = "Jalankan migration 018_personal_ai.sql terlebih dahulu.";
    return send(response, status >= 400 && status < 600 ? status : 500, { ok: false, error: error.code || "ADMIN_AI_FAILED", message });
  }
};

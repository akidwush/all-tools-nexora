"use strict";

const { databaseRequest } = require("./database");
const { requireAdmin, verifyMutationRequest } = require("./admin-auth");
const { recordAdminAudit } = require("./admin-audit");
const { sendJson: send } = require("./http-response");
const { PUBLIC_PROVIDER_IDS } = require("./kuroneko-multiai");
const { clearMultiAiSettingsCache, normalizeMultiAiSettings } = require("./kuroneko-multiai-settings");

module.exports = async function updateMultiAiSettings(request, response) {
  const session = await requireAdmin(request, response, { edit: true });
  if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
  const raw = request.body?.value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return send(response, 400, { ok: false, error: "INVALID_MULTI_AI_SETTINGS", message: "Pengaturan Multi-AI tidak valid." });
  }
  const allowed = new Set(PUBLIC_PROVIDER_IDS);
  if (raw.providers && Object.keys(raw.providers).some((id) => !allowed.has(id))) {
    return send(response, 400, { ok: false, error: "INVALID_MULTI_AI_PROVIDER", message: "Provider tidak dikenal." });
  }
  const value = normalizeMultiAiSettings(raw);
  const rows = await databaseRequest("app_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key: "multi_ai", value, is_public: false, updated_at: new Date().toISOString() })
  });
  if (!rows?.[0]) return send(response, 503, { ok: false, error: "SETTINGS_UNAVAILABLE" });
  clearMultiAiSettingsCache();
  const auditLogged = await recordAdminAudit({
    request, session, action: "settings.multi_ai.update", entityType: "app_setting", entityId: "multi_ai",
    summary: "Pengaturan provider Nexora Multi-AI diperbarui", after: value
  });
  return send(response, 200, { ok: true, data: rows[0], auditLogged });
};

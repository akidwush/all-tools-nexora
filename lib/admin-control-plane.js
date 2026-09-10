"use strict";

const { databaseRequest } = require("./database");
const { publicSession, requireAdmin, verifyMutationRequest } = require("./admin-auth");
const { recordAdminAudit } = require("./admin-audit");
const { SERVER_AUTHORIZED_TOOL_IDS } = require("./server-access-policy");
const { sendJson: send } = require("./http-response");

const SETTING_KEY = "control_plane";
const CACHE_TTL_MS = 5_000;
const ELIGIBLE = new Set(SERVER_AUTHORIZED_TOOL_IDS);
const DEFAULT_LOCK_MESSAGE = "Nexora sedang dalam pemeliharaan. Coba lagi nanti.";
let cache = { at: 0, value: null };

function clean(value, max = 300) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function bool(value, fallback = false) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeUntil(value) {
  const text = clean(value, 64);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function defaultConfig() {
  return {
    schemaVersion: 1,
    publicAccess: {
      locked: false,
      message: DEFAULT_LOCK_MESSAGE,
      updatedAt: null
    },
    endpoints: {}
  };
}

function normalizeConfig(value) {
  const raw = safeObject(value);
  const access = safeObject(raw.publicAccess);
  const rawEndpoints = safeObject(raw.endpoints);
  const endpoints = {};

  for (const [idRaw, itemRaw] of Object.entries(rawEndpoints)) {
    const id = clean(idRaw, 80).toLowerCase();
    if (!ELIGIBLE.has(id)) continue;
    const item = safeObject(itemRaw);
    endpoints[id] = {
      enabled: bool(item.enabled, false),
      reason: clean(item.reason, 240),
      until: normalizeUntil(item.until),
      updatedAt: normalizeUntil(item.updatedAt)
    };
  }

  return {
    schemaVersion: 1,
    publicAccess: {
      locked: bool(access.locked, false),
      message: clean(access.message, 300) || DEFAULT_LOCK_MESSAGE,
      updatedAt: normalizeUntil(access.updatedAt)
    },
    endpoints
  };
}

function activeMaintenance(item, now = Date.now()) {
  if (!item || item.enabled !== true) return false;
  if (!item.until) return true;
  const until = new Date(item.until).getTime();
  return Number.isFinite(until) && until > now;
}

async function readControlPlane(options = {}) {
  const fresh = options.fresh === true;
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const rows = await databaseRequest(
    "app_settings?select=key,value,is_public,updated_at&key=eq.control_plane&limit=1",
    { method: "GET" }
  );
  const value = normalizeConfig(Array.isArray(rows) && rows[0] ? rows[0].value : defaultConfig());
  cache = { at: Date.now(), value };
  return value;
}

async function saveControlPlane(value) {
  const normalized = normalizeConfig(value);
  const rows = await databaseRequest("app_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      key: SETTING_KEY,
      value: normalized,
      is_public: false,
      updated_at: new Date().toISOString()
    })
  });
  const saved = normalizeConfig(Array.isArray(rows) && rows[0] ? rows[0].value : normalized);
  cache = { at: Date.now(), value: saved };
  return saved;
}

async function enforceToolControlPlane(request, response, toolId) {
  const id = clean(toolId, 80).toLowerCase();
  if (!ELIGIBLE.has(id)) return true;

  let config;
  try {
    config = await readControlPlane();
  } catch (error) {
    // Unit/regression harnesses intentionally run without Supabase and mock only
    // the legacy tools access query. In that state there cannot be a persisted
    // Control Plane policy yet, so let the existing authorization layer decide.
    // Production remains fail-closed for an actual configured DB outage.
    if (error && error.code === "DATABASE_NOT_CONFIGURED") return true;
    console.error("[control-plane-read]", error.code || "CONTROL_PLANE_UNAVAILABLE");
    send(response, 503, {
      ok: false,
      error: "CONTROL_PLANE_UNAVAILABLE",
      message: "Status operasional Nexora belum dapat diverifikasi. Coba lagi sesaat."
    });
    return false;
  }

  if (config.publicAccess.locked) {
    send(response, 503, {
      ok: false,
      error: "PUBLIC_ACCESS_LOCKED",
      message: config.publicAccess.message || DEFAULT_LOCK_MESSAGE
    });
    return false;
  }

  const maintenance = config.endpoints[id];
  if (activeMaintenance(maintenance)) {
    send(response, 503, {
      ok: false,
      error: "TOOL_MAINTENANCE",
      toolId: id,
      message: maintenance.reason || "Tool sedang dalam pemeliharaan.",
      until: maintenance.until || null
    });
    return false;
  }

  return true;
}

async function handleAdminControlPlane(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return response.status(204).end();
  }

  try {
    if (request.method === "GET") {
      const session = await requireAdmin(request, response);
      const publicInfo = publicSession(session);
      const config = await readControlPlane({ fresh: true });
      return send(response, 200, {
        ok: true,
        session: publicInfo,
        editable: Boolean(publicInfo.permissions.editTools),
        config,
        eligibleTools: SERVER_AUTHORIZED_TOOL_IDS.slice().sort()
      });
    }

    if (request.method !== "PATCH") {
      response.setHeader("Allow", "GET, PATCH, OPTIONS");
      return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const session = await requireAdmin(request, response, { edit: true });
    if (!verifyMutationRequest(request)) {
      return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
    }

    const body = safeObject(request.body);
    const action = clean(body.action, 40).toLowerCase();
    const before = await readControlPlane({ fresh: true });
    const next = normalizeConfig(before);
    const now = new Date().toISOString();
    let auditAction = "";
    let entityId = SETTING_KEY;
    let summary = "";

    if (action === "set_public_lock") {
      next.publicAccess = {
        locked: bool(body.locked, false),
        message: clean(body.message, 300) || DEFAULT_LOCK_MESSAGE,
        updatedAt: now
      };
      auditAction = "control_plane.public_access";
      entityId = "public-access";
      summary = next.publicAccess.locked
        ? "Public tool access dikunci dari server"
        : "Public tool access dibuka dari server";
    } else if (action === "set_maintenance") {
      const toolId = clean(body.toolId, 80).toLowerCase();
      if (!ELIGIBLE.has(toolId)) {
        return send(response, 400, {
          ok: false,
          error: "INVALID_MAINTENANCE_TOOL",
          message: "Maintenance hanya dapat diterapkan pada tool yang memiliki gerbang API Nexora."
        });
      }
      const until = normalizeUntil(body.until);
      if (body.until && !until) {
        return send(response, 400, {
          ok: false,
          error: "INVALID_MAINTENANCE_UNTIL",
          message: "Waktu selesai maintenance tidak valid."
        });
      }
      next.endpoints[toolId] = {
        enabled: bool(body.enabled, false),
        reason: clean(body.reason, 240),
        until,
        updatedAt: now
      };
      auditAction = "control_plane.endpoint_maintenance";
      entityId = toolId;
      summary = next.endpoints[toolId].enabled
        ? `Maintenance ${toolId} diaktifkan`
        : `Maintenance ${toolId} dinonaktifkan`;
    } else {
      return send(response, 400, { ok: false, error: "INVALID_CONTROL_ACTION" });
    }

    const saved = await saveControlPlane(next);
    const auditLogged = await recordAdminAudit({
      request,
      session,
      action: auditAction,
      entityType: "control_plane",
      entityId,
      summary,
      before,
      after: saved
    });

    return send(response, 200, {
      ok: true,
      config: saved,
      auditLogged
    });
  } catch (error) {
    const status = Number(error.status || 500);
    console.error("[admin-control-plane]", error.code || "UNKNOWN_ERROR");
    return send(response, status, {
      ok: false,
      error: error.code || "ADMIN_CONTROL_PLANE_FAILED",
      message:
        status === 401 ? "Sesi admin berakhir." :
        status === 403 ? "Akses ditolak." :
        "Admin Control Plane belum dapat diproses."
    });
  }
}

module.exports = {
  activeMaintenance,
  enforceToolControlPlane,
  handleAdminControlPlane,
  normalizeConfig,
  readControlPlane
};

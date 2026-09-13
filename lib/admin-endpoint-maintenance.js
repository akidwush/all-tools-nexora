"use strict";

const { publicSession, requireAdmin, verifyMutationRequest } = require("./admin-auth");
const { recordAdminAudit } = require("./admin-audit");
const { sendJson: send } = require("./http-response");
const { takeFixedWindow } = require("./memory-store");
const {
  MAX_HISTORY,
  compactOverride,
  credentialStatus,
  defaultConfig,
  effectiveFromStore,
  endpointError,
  invalidateEndpointConfigCache,
  newHistoryEntry,
  normalizeCandidate,
  readEndpointStore,
  testCandidate,
  validateNetworkTarget,
  writeEndpointStore
} = require("./provider-endpoints");
const { endpointRegistry, listEndpointDefinitions } = require("./endpoint-maintenance-registry");

const rateBuckets = new Map();
const lastProbe = new Map();

function clean(value, max = 500) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function requestKey(request) {
  return clean(String(request.headers?.["x-forwarded-for"] || request.headers?.["x-real-ip"] || request.socket?.remoteAddress || "unknown").split(",")[0], 100);
}
function rateLimit(request, action) {
  const isTest = action.startsWith("test");
  const result = takeFixedWindow(rateBuckets, `${requestKey(request)}:${isTest ? "test" : "mutate"}`, {
    windowMs: 60_000,
    limit: isTest ? 15 : 30,
    maxEntries: 1_000
  });
  if (!result.allowed) throw endpointError("ENDPOINT_ADMIN_RATE_LIMITED", "Terlalu banyak operasi Endpoint Maintenance. Coba lagi sebentar.", 429, { retryAfter: result.retryAfter });
}

function fallbackOptions(definition, registry) {
  if (definition.group !== "ai") return [];
  return [...registry.values()]
    .filter((candidate) => candidate.group === "ai" && candidate.id !== definition.id && candidate.category === definition.category)
    .map((candidate) => ({ id: candidate.id, label: candidate.label }));
}

function validateFallback(definition, candidate, store, registry) {
  const fallback = clean(candidate.fallbackProvider, 120).toLowerCase();
  if (!fallback) return;
  if (definition.group !== "ai") throw endpointError("ENDPOINT_FALLBACK_NOT_SUPPORTED", "Fallback hanya tersedia untuk AI provider.");
  const target = registry.get(fallback);
  if (!target || target.group !== "ai" || target.category !== definition.category) {
    throw endpointError("ENDPOINT_FALLBACK_INCOMPATIBLE", "Fallback harus memakai provider AI dengan capability utama yang kompatibel.");
  }

  const overrideMap = { ...objectValue(store.overrides), [definition.id]: { ...objectValue(store.overrides?.[definition.id]), ...candidate } };
  const seen = new Set();
  let current = definition.id;
  while (current) {
    if (seen.has(current)) throw endpointError("ENDPOINT_FALLBACK_CYCLE", "Fallback provider membentuk siklus.");
    seen.add(current);
    const def = registry.get(current);
    if (!def) break;
    const effective = effectiveFromStore(def, { ...store, overrides: overrideMap });
    current = clean(effective.fallbackProvider, 120).toLowerCase();
  }
}

function publicProvider(definition, store) {
  const effective = effectiveFromStore(definition, store);
  const override = objectValue(store.overrides)[definition.id] || null;
  const history = (Array.isArray(store.history) ? store.history : [])
    .filter((item) => item?.providerId === definition.id)
    .slice(-10).reverse()
    .map((item) => ({
      id: clean(item.id, 100),
      action: clean(item.action, 80),
      changedAt: item.changedAt || null,
      changedBy: clean(item.changedBy, 254) || null,
      reason: clean(item.reason, 500),
      before: item.before || null,
      after: item.after || null
    }));
  const probe = lastProbe.get(definition.id) || null;
  return {
    id: definition.id,
    group: definition.group,
    label: definition.label,
    category: definition.category || null,
    availability: definition.healthUnsupported === true ? "unsupported" : "supported",
    activationSupported: definition.activationSupported !== false,
    unsupportedReason: clean(definition.unsupportedReason, 500) || null,
    capabilities: Array.isArray(definition.capabilities) ? definition.capabilities : [],
    editableFields: ["mode", ...(definition.editableFields || [])],
    allowedHosts: Array.isArray(definition.allowedHosts) ? definition.allowedHosts : [],
    timeoutRange: { min: definition.minTimeoutMs || 1_000, max: definition.maxTimeoutMs || 60_000 },
    default: defaultConfig(definition),
    override,
    effective,
    source: override ? "OVERRIDE" : "DEFAULT",
    credential: credentialStatus(definition),
    fallbackOptions: fallbackOptions(definition, endpointRegistry()),
    lastCheck: probe,
    history
  };
}

async function catalogResponse(session) {
  const store = await readEndpointStore({ fresh: true, strict: false });
  const definitions = listEndpointDefinitions();
  return {
    session: publicSession(session),
    providers: definitions.map((definition) => publicProvider(definition, store)),
    groups: [
      { id: "comic", label: "COMIC SOURCES" },
      { id: "experimental-comic", label: "EXPERIMENTAL COMIC SOURCES" },
      { id: "ai", label: "AI PROVIDERS" },
      { id: "utility", label: "EXTERNAL UTILITIES" }
    ],
    storage: { type: "app_settings", key: "endpoint_maintenance_v1", secretValuesStored: false }
  };
}

function actor(session) {
  return clean(session?.user?.email || session?.user?.id, 254) || "admin";
}

async function persistChange({ request, session, definition, store, nextOverride, reason, action }) {
  const before = objectValue(store.overrides)[definition.id] || null;
  const next = {
    ...store,
    overrides: { ...objectValue(store.overrides) },
    history: Array.isArray(store.history) ? store.history.slice(-MAX_HISTORY + 1) : []
  };
  if (nextOverride && Object.keys(nextOverride).length) next.overrides[definition.id] = nextOverride;
  else delete next.overrides[definition.id];

  const entry = newHistoryEntry({
    providerId: definition.id,
    before,
    after: nextOverride && Object.keys(nextOverride).length ? nextOverride : null,
    changedBy: actor(session),
    reason,
    action
  });
  next.history.push(entry);
  const saved = await writeEndpointStore(next);
  invalidateEndpointConfigCache();

  await recordAdminAudit({
    request,
    session,
    action,
    entityType: "endpoint_config",
    entityId: definition.id,
    summary: `${definition.label}: ${action}`,
    before,
    after: nextOverride || null
  });
  return { saved, entry };
}

async function handleAdminEndpointMaintenance(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return response.status(204).end();
  }

  try {
    if (request.method === "GET") {
      const session = await requireAdmin(request, response);
      const result = await catalogResponse(session);
      return send(response, 200, {
        ok: true,
        editable: Boolean(result.session.permissions.editTools),
        ...result
      });
    }

    if (request.method !== "PATCH") {
      response.setHeader("Allow", "GET, PATCH, OPTIONS");
      return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const session = await requireAdmin(request, response, { edit: true });
    if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });

    const body = objectValue(request.body);
    const action = clean(body.action, 60).toLowerCase();
    rateLimit(request, action);

    const registry = endpointRegistry();
    const providerId = clean(body.providerId, 120).toLowerCase();
    const definition = registry.get(providerId);
    if (!definition) return send(response, 400, { ok: false, error: "ENDPOINT_PROVIDER_UNKNOWN", message: "Provider tidak dikenal." });

    const store = await readEndpointStore({ fresh: true, strict: true });

    if (action === "test_candidate" || action === "test_current") {
      const candidate = action === "test_current"
        ? effectiveFromStore(definition, store)
        : normalizeCandidate(definition, objectValue(body.candidate), { baseConfig: effectiveFromStore(definition, store) });

      validateFallback(definition, candidate, store, registry);
      try {
        const result = await testCandidate(definition, candidate);
        lastProbe.set(definition.id, result);
        await recordAdminAudit({
          request,
          session,
          action: "endpoint.test",
          entityType: "endpoint_config",
          entityId: definition.id,
          summary: `${definition.label} candidate diuji: ${result.status}`,
          before: null,
          after: { status: result.status, httpStatus: result.httpStatus, latencyMs: result.latencyMs, resolvedHost: result.resolvedHost }
        });
        return send(response, 200, { ok: true, result });
      } catch (error) {
        const result = {
          providerId: definition.id,
          status: "unavailable",
          httpStatus: Number(error.httpStatus || 0) || null,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
          resolvedHost: null,
          error: clean(error.publicMessage || error.message, 300)
        };
        lastProbe.set(definition.id, result);
        await recordAdminAudit({
          request,
          session,
          action: "endpoint.test_failed",
          entityType: "endpoint_config",
          entityId: definition.id,
          summary: `${definition.label} candidate test gagal`,
          before: null,
          after: result
        });
        return send(response, Number(error.status || 502), { ok: false, error: error.code || "ENDPOINT_TEST_FAILED", message: result.error, result });
      }
    }

    if (action === "save") {
      const effective = effectiveFromStore(definition, store);
      const candidate = normalizeCandidate(definition, objectValue(body.candidate), { baseConfig: effective });
      validateFallback(definition, candidate, store, registry);
      if (candidate.mode === "active") await validateNetworkTarget(definition, candidate);

      if (body.tested !== true && body.confirmDegraded !== true) {
        return send(response, 409, {
          ok: false,
          error: "ENDPOINT_CANDIDATE_TEST_REQUIRED",
          message: "Test Candidate terlebih dahulu, atau konfirmasi penyimpanan tanpa hasil test."
        });
      }

      const override = compactOverride(definition, candidate);
      const previousMode = effective.mode;
      let auditAction = "endpoint.updated";
      if (candidate.mode === "disabled" && previousMode !== "disabled") auditAction = "endpoint.disabled";
      else if (candidate.mode === "maintenance" && previousMode !== "maintenance") auditAction = "endpoint.maintenance";
      else if (candidate.mode === "active" && previousMode !== "active") auditAction = "endpoint.enabled";

      await persistChange({
        request,
        session,
        definition,
        store,
        nextOverride: override,
        reason: clean(body.reason, 500),
        action: auditAction
      });
      return send(response, 200, { ok: true, ...(await catalogResponse(session)) });
    }

    if (action === "reset_default") {
      await persistChange({
        request,
        session,
        definition,
        store,
        nextOverride: null,
        reason: clean(body.reason, 500) || "Reset to code default",
        action: "endpoint.reset_default"
      });
      return send(response, 200, { ok: true, ...(await catalogResponse(session)) });
    }

    if (action === "rollback") {
      const historyId = clean(body.historyId, 100);
      const row = (Array.isArray(store.history) ? store.history : []).find((item) => item?.id === historyId && item?.providerId === definition.id);
      if (!row) return send(response, 404, { ok: false, error: "ENDPOINT_HISTORY_NOT_FOUND", message: "Riwayat endpoint tidak ditemukan." });

      let target = row.before;
      if (target) {
        const candidate = normalizeCandidate(definition, target);
        validateFallback(definition, candidate, store, registry);
        if (candidate.mode === "active") await validateNetworkTarget(definition, candidate);
        target = compactOverride(definition, candidate);
      }

      await persistChange({
        request,
        session,
        definition,
        store,
        nextOverride: target,
        reason: clean(body.reason, 500) || `Rollback ${historyId}`,
        action: "endpoint.rollback"
      });
      return send(response, 200, { ok: true, ...(await catalogResponse(session)) });
    }

    return send(response, 400, { ok: false, error: "ENDPOINT_ACTION_INVALID", message: "Aksi Endpoint Maintenance tidak dikenal." });
  } catch (error) {
    const status = Math.max(400, Math.min(599, Number(error.status || 500)));
    console.error("[admin-endpoint-maintenance]", error.code || "UNKNOWN_ERROR");
    return send(response, status, {
      ok: false,
      error: error.code || "ENDPOINT_MAINTENANCE_FAILED",
      message: status === 401 ? "Sesi admin berakhir." : status === 403 ? "Akses ditolak." : (error.publicMessage || "Endpoint Maintenance belum dapat diproses.")
    });
  }
}

module.exports = { handleAdminEndpointMaintenance, validateFallback };

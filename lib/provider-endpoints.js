"use strict";

const https = require("node:https");
const crypto = require("node:crypto");
const { databaseRequest } = require("./database");
const { assertPublicUrl } = require("./audit");

const SETTING_KEY = "endpoint_maintenance_v1";
const CACHE_TTL_MS = 5_000;
const MAX_HISTORY = 80;
const MODES = new Set(["active", "maintenance", "disabled"]);
let cache = { at: 0, value: null };

function endpointError(code, message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { code, status, publicMessage: message, ...extra });
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/\.$/, ""); }
  catch { return ""; }
}

function allowedHosts(definition) {
  return new Set((Array.isArray(definition.allowedHosts) ? definition.allowedHosts : [])
    .map((item) => clean(item, 253).toLowerCase().replace(/\.$/, "")).filter(Boolean));
}

function normalizeBaseUrl(value, definition) {
  const raw = clean(value || definition.defaultBaseUrl, 2_000);
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw endpointError("ENDPOINT_URL_INVALID", "Base URL tidak valid."); }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw endpointError("ENDPOINT_PROTOCOL_INVALID", "Endpoint provider wajib HTTPS tanpa credential pada URL.");
  }
  if (parsed.port && parsed.port !== "443") {
    throw endpointError("ENDPOINT_PORT_NOT_ALLOWED", "Port endpoint provider tidak diizinkan.");
  }
  if (!allowedHosts(definition).has(host)) {
    throw endpointError("ENDPOINT_HOST_NOT_ALLOWED", `Host ${host || "(kosong)"} belum ada di allowlist provider.`);
  }
  if (parsed.search || parsed.hash) {
    throw endpointError("ENDPOINT_BASE_URL_INVALID", "Base URL tidak boleh memiliki query atau fragment.");
  }
  parsed.hostname = host;
  return parsed.toString();
}

function normalizeRelativePath(value, fallback = "") {
  const raw = clean(value == null ? fallback : value, 1_500);
  if (!raw) return "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /%(?:2e|2f|5c)/i.test(raw)) {
    throw endpointError("ENDPOINT_PATH_INVALID", "Path provider harus path relatif absolut yang aman.");
  }
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { throw endpointError("ENDPOINT_PATH_INVALID", "Path provider tidak valid."); }
  if (decoded.split(/[/?#]/).some((segment) => segment === ".." || segment === ".")) {
    throw endpointError("ENDPOINT_PATH_TRAVERSAL", "Path traversal tidak diizinkan.");
  }
  const parsed = new URL(raw, "https://endpoint.invalid");
  if (parsed.origin !== "https://endpoint.invalid" || parsed.hash) {
    throw endpointError("ENDPOINT_PATH_INVALID", "Path provider tidak valid.");
  }
  return `${parsed.pathname}${parsed.search}`;
}

function timeoutRange(definition) {
  const min = Math.max(1_000, Number(definition.minTimeoutMs) || 1_000);
  const max = Math.max(min, Number(definition.maxTimeoutMs) || 60_000);
  return { min, max };
}

function codeDefaultTimeout(definition) {
  const range = timeoutRange(definition);
  const envName = clean(definition.timeoutEnv, 120);
  const envValue = envName ? Number(process.env[envName]) : NaN;
  const fallback = Number(definition.defaultTimeoutMs) || 10_000;
  const value = Number.isFinite(envValue) && envValue > 0 ? envValue : fallback;
  return Math.max(range.min, Math.min(range.max, Math.round(value)));
}

function defaultConfig(definition) {
  return {
    providerId: definition.id,
    group: definition.group,
    label: definition.label,
    mode: "active",
    baseUrl: normalizeBaseUrl(definition.defaultBaseUrl, definition),
    path: definition.defaultPath ? normalizeRelativePath(definition.defaultPath) : "",
    apiVersion: clean(definition.defaultApiVersion, 80) || "",
    timeoutMs: codeDefaultTimeout(definition),
    healthPath: normalizeRelativePath(definition.healthPath || definition.defaultPath || "/"),
    fallbackProvider: "",
    credentialRef: clean(definition.credentialRef, 120) || "",
    source: "DEFAULT"
  };
}

function validateEditableField(definition, field, value) {
  const editable = new Set(["mode", ...(definition.editableFields || [])]);
  if (!editable.has(field) && value != null && value !== "") {
    throw endpointError("ENDPOINT_FIELD_NOT_EDITABLE", `${field} tidak dapat diubah untuk provider ini.`);
  }
}

function normalizeCandidate(definition, rawCandidate = {}, options = {}) {
  const raw = objectValue(rawCandidate);
  const base = options.baseConfig || defaultConfig(definition);
  const recognized = new Set(["mode", "enabled", "baseUrl", "path", "apiVersion", "timeoutMs", "healthPath", "fallbackProvider", "providerId", "group", "label", "credentialRef", "source"]);
  for (const key of Object.keys(raw)) {
    if (!recognized.has(key)) throw endpointError("ENDPOINT_FIELD_UNSUPPORTED", `Field ${clean(key, 80)} tidak didukung.`);
  }

  const modeRaw = raw.mode || (raw.enabled === false ? "disabled" : raw.enabled === true ? "active" : base.mode);
  const mode = clean(modeRaw, 24).toLowerCase();
  if (!MODES.has(mode)) throw endpointError("ENDPOINT_MODE_INVALID", "Mode provider tidak valid.");

  validateEditableField(definition, "baseUrl", raw.baseUrl);
  validateEditableField(definition, "path", raw.path);
  validateEditableField(definition, "apiVersion", raw.apiVersion);
  validateEditableField(definition, "timeoutMs", raw.timeoutMs);
  validateEditableField(definition, "healthPath", raw.healthPath);
  validateEditableField(definition, "fallbackProvider", raw.fallbackProvider);

  const range = timeoutRange(definition);
  const timeoutValue = raw.timeoutMs == null || raw.timeoutMs === "" ? base.timeoutMs : Number(raw.timeoutMs);
  if (!Number.isFinite(timeoutValue) || timeoutValue < range.min || timeoutValue > range.max) {
    throw endpointError("ENDPOINT_TIMEOUT_INVALID", `Timeout harus ${range.min}–${range.max} ms.`);
  }

  const fallbackProvider = clean(raw.fallbackProvider == null ? base.fallbackProvider : raw.fallbackProvider, 120).toLowerCase();

  return {
    mode,
    baseUrl: normalizeBaseUrl(raw.baseUrl || base.baseUrl, definition),
    path: definition.defaultPath || raw.path || base.path
      ? normalizeRelativePath(raw.path == null ? base.path : raw.path, definition.defaultPath || "")
      : "",
    apiVersion: clean(raw.apiVersion == null ? base.apiVersion : raw.apiVersion, 80),
    timeoutMs: Math.round(timeoutValue),
    healthPath: normalizeRelativePath(raw.healthPath == null ? base.healthPath : raw.healthPath, definition.healthPath || definition.defaultPath || "/"),
    fallbackProvider
  };
}

function normalizeStoredOverride(definition, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    return normalizeCandidate(definition, raw);
  } catch {
    return null;
  }
}

function createEmptyStore() {
  return { schemaVersion: 1, overrides: {}, history: [] };
}

function normalizeStore(value) {
  const raw = objectValue(value);
  return {
    schemaVersion: 1,
    overrides: objectValue(raw.overrides),
    history: Array.isArray(raw.history) ? raw.history.slice(-MAX_HISTORY) : []
  };
}

async function readEndpointStore(options = {}) {
  const fresh = options.fresh === true;
  const strict = options.strict === true;
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const rows = await databaseRequest(
      `app_settings?select=key,value,is_public,updated_at&key=eq.${SETTING_KEY}&limit=1`,
      { method: "GET" }
    );
    const value = normalizeStore(Array.isArray(rows) && rows[0] ? rows[0].value : createEmptyStore());
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    if (strict) throw error;
    return createEmptyStore();
  }
}

async function writeEndpointStore(value) {
  const normalized = normalizeStore(value);
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
  const saved = normalizeStore(Array.isArray(rows) && rows[0] ? rows[0].value : normalized);
  cache = { at: Date.now(), value: saved };
  return saved;
}

function invalidateEndpointConfigCache() {
  cache = { at: 0, value: null };
}

function effectiveFromStore(definition, store) {
  const base = defaultConfig(definition);
  const override = normalizeStoredOverride(definition, objectValue(store).overrides?.[definition.id]);
  if (!override) return base;
  return { ...base, ...override, source: "OVERRIDE" };
}

async function resolveProviderConfig(definition, options = {}) {
  const store = options.store || await readEndpointStore({ fresh: options.fresh === true });
  const effective = effectiveFromStore(definition, store);
  if (options.allowUnavailable !== true && effective.mode !== "active") {
    const code = clean(definition.unavailableCode, 120) || (effective.mode === "disabled" ? "PROVIDER_DISABLED" : "PROVIDER_MAINTENANCE");
    const message = effective.mode === "disabled"
      ? `${definition.label} dinonaktifkan oleh administrator.`
      : `${definition.label} sedang dalam maintenance.`;
    throw endpointError(code, message, 503, { providerId: definition.id, providerMode: effective.mode });
  }
  return effective;
}

function compactOverride(definition, candidate) {
  const defaults = defaultConfig(definition);
  const normalized = normalizeCandidate(definition, candidate, { baseConfig: defaults });
  const override = {};
  for (const key of ["mode", "baseUrl", "path", "apiVersion", "timeoutMs", "healthPath", "fallbackProvider"]) {
    const baseline = defaults[key] == null ? "" : defaults[key];
    const current = normalized[key] == null ? "" : normalized[key];
    if (current !== baseline) override[key] = current;
  }
  return override;
}

function credentialStatus(definition) {
  const ref = clean(definition.credentialRef, 120);
  return { ref: ref || null, configured: ref ? Boolean(clean(process.env[ref], 10_000)) : null };
}

function assertHostAllowed(url, definition) {
  const parsed = url instanceof URL ? url : new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!allowedHosts(definition).has(host)) {
    throw endpointError("ENDPOINT_HOST_NOT_ALLOWED", `Host ${host} belum ada di allowlist provider.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw endpointError("ENDPOINT_PROTOCOL_INVALID", "Endpoint provider wajib HTTPS.");
  }
  return parsed;
}

async function validateNetworkTarget(definition, effective, options = {}) {
  const base = assertHostAllowed(effective.baseUrl, definition);
  const baseChecked = await assertPublicUrl(base.toString(), options.lookup ? { lookup: options.lookup } : {});
  const target = new URL(effective.healthPath || effective.path || "/", baseChecked);
  assertHostAllowed(target, definition);
  return assertPublicUrl(target.toString(), options.lookup ? { lookup: options.lookup } : {});
}

function pinnedRequest(parsed, method, timeoutMs) {
  const addresses = Array.isArray(parsed.auditAddresses) ? parsed.auditAddresses : [];
  const lookup = (_hostname, options, callback) => {
    const rows = addresses.length ? addresses : [{ address: parsed.hostname, family: 4 }];
    if (options?.all) return callback(null, rows.map((row) => ({ address: row.address, family: row.family || 4 })));
    return callback(null, rows[0].address, rows[0].family || 4);
  };
  return new Promise((resolve, reject) => {
    const request = https.request(parsed, {
      method,
      lookup,
      servername: parsed.hostname,
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": "Nexora-Endpoint-Maintenance/1.0"
      }
    }, (response) => {
      response.resume();
      response.on("end", () => resolve({
        status: Number(response.statusCode || 0),
        location: clean(response.headers.location, 2_000)
      }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(endpointError("ENDPOINT_TEST_TIMEOUT", "Health probe melewati batas waktu.", 504)));
    request.on("error", reject);
    request.end();
  });
}

function normalizeProbeStatus(httpStatus) {
  if (httpStatus >= 200 && httpStatus < 400) return "online";
  if ([400, 401, 403, 405, 409, 422, 429].includes(httpStatus)) return "degraded";
  return "unavailable";
}

async function testCandidate(definition, rawCandidate, runtime = {}) {
  const candidate = normalizeCandidate(definition, rawCandidate);
  const started = Date.now();
  let current = await validateNetworkTarget(definition, candidate, runtime);
  if (runtime.probe) {
    const mocked = await runtime.probe(current, candidate);
    return {
      providerId: definition.id,
      status: mocked.status || normalizeProbeStatus(Number(mocked.httpStatus || 0)),
      httpStatus: Number(mocked.httpStatus || 0) || null,
      latencyMs: Number(mocked.latencyMs || (Date.now() - started)),
      checkedAt: new Date().toISOString(),
      resolvedHost: current.hostname,
      finalUrl: current.toString(),
      error: clean(mocked.error, 300) || null
    };
  }

  const maxRedirects = 3;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const result = await pinnedRequest(current, definition.healthMethod === "GET" ? "GET" : "HEAD", Math.min(candidate.timeoutMs, 12_000));
    if (result.status >= 300 && result.status < 400 && result.location) {
      if (redirects >= maxRedirects) throw endpointError("ENDPOINT_REDIRECT_LIMIT", "Health probe terlalu banyak redirect.", 502);
      const next = new URL(result.location, current);
      assertHostAllowed(next, definition);
      current = await assertPublicUrl(next.toString());
      continue;
    }
    return {
      providerId: definition.id,
      status: normalizeProbeStatus(result.status),
      httpStatus: result.status || null,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      resolvedHost: current.hostname,
      finalUrl: current.toString(),
      error: result.status >= 500 ? `HTTP ${result.status}` : null
    };
  }
  throw endpointError("ENDPOINT_TEST_FAILED", "Health probe gagal.", 502);
}

function newHistoryEntry({ providerId, before, after, changedBy, reason, action }) {
  return {
    id: crypto.randomUUID(),
    providerId: clean(providerId, 120),
    before: before || null,
    after: after || null,
    changedBy: clean(changedBy, 254) || null,
    changedAt: new Date().toISOString(),
    reason: clean(reason, 500),
    action: clean(action, 80)
  };
}

module.exports = {
  SETTING_KEY,
  MAX_HISTORY,
  compactOverride,
  credentialStatus,
  createEmptyStore,
  defaultConfig,
  effectiveFromStore,
  endpointError,
  hostOf,
  invalidateEndpointConfigCache,
  newHistoryEntry,
  normalizeBaseUrl,
  normalizeCandidate,
  normalizeRelativePath,
  normalizeStore,
  readEndpointStore,
  resolveProviderConfig,
  testCandidate,
  validateNetworkTarget,
  writeEndpointStore
};

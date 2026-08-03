const crypto = require("node:crypto");

const DEFAULT_TIMEOUT_MS = 8_000;

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function firstConfigured(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function isModernApiKey(value) {
  return /^sb_(?:secret|publishable)_/i.test(String(value || ""));
}

function getDatabaseConfig() {
  const url = normalizeUrl(process.env.SUPABASE_URL);
  const elevatedKey = firstConfigured(process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const publicKey = firstConfigured(process.env.SUPABASE_PUBLISHABLE_KEY, process.env.SUPABASE_ANON_KEY);
  const authApiKey = publicKey || elevatedKey;
  const timeoutMs = positiveInteger(process.env.DATABASE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  let validUrl = false;
  try {
    const parsed = new URL(url);
    validUrl = parsed.protocol === "https:" || parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {}

  return {
    url,
    elevatedKey,
    serviceRoleKey: elevatedKey,
    publicKey,
    authApiKey,
    timeoutMs,
    configured: Boolean(validUrl && elevatedKey),
    urlConfigured: Boolean(url),
    keyConfigured: Boolean(elevatedKey),
    publicKeyConfigured: Boolean(publicKey),
    validUrl,
    keyType: elevatedKey.startsWith("sb_secret_") ? "secret" : elevatedKey ? "legacy-service-role" : "missing"
  };
}

function createDatabaseError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function databaseHeaders(key, additional = {}) {
  const headers = {
    apikey: key,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (key && !isModernApiKey(key)) headers.Authorization = `Bearer ${key}`;
  return { ...headers, ...additional };
}

async function databaseRequest(resource, options = {}) {
  const config = getDatabaseConfig();
  if (!config.configured) {
    throw createDatabaseError("Database belum dikonfigurasi dengan benar.", "DATABASE_NOT_CONFIGURED", {
      configured: false
    });
  }

  const timeoutMs = positiveInteger(options.timeoutMs, config.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const resourcePath = String(resource || "").replace(/^\/+/, "");

  try {
    const response = await fetch(`${config.url}/rest/v1/${resourcePath}`, {
      ...options,
      timeoutMs: undefined,
      signal: options.signal || controller.signal,
      headers: databaseHeaders(config.elevatedKey, options.headers)
    });

    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }

    if (!response.ok) {
      const postgresCode = data && typeof data === "object" ? data.code : null;
      throw createDatabaseError("Operasi database gagal.", "DATABASE_REQUEST_FAILED", {
        status: response.status,
        postgresCode,
        cause: data
      });
    }

    return data;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw createDatabaseError("Koneksi database melewati batas waktu.", "DATABASE_TIMEOUT", {
        status: 504,
        timeoutMs
      });
    }
    if (error && error.code) throw error;
    throw createDatabaseError("Database tidak dapat dijangkau.", "DATABASE_UNREACHABLE", {
      status: 503,
      cause: error && error.message ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function pingDatabase() {
  const config = getDatabaseConfig();
  const startedAt = Date.now();

  if (!config.configured) {
    return {
      configured: false,
      connected: false,
      schemaReady: false,
      latencyMs: null,
      status: "not-configured",
      errorCode: "DATABASE_NOT_CONFIGURED"
    };
  }

  try {
    await databaseRequest("app_settings?select=key&limit=1", {
      method: "GET",
      headers: { Prefer: "count=none" },
      timeoutMs: Math.min(config.timeoutMs, 6_000)
    });
    return {
      configured: true,
      connected: true,
      schemaReady: true,
      latencyMs: Date.now() - startedAt,
      status: "ready",
      errorCode: null
    };
  } catch (error) {
    const missingTable = error.postgresCode === "42P01" || error.status === 404;
    return {
      configured: true,
      connected: !["DATABASE_TIMEOUT", "DATABASE_UNREACHABLE"].includes(error.code),
      schemaReady: false,
      latencyMs: Date.now() - startedAt,
      status: missingTable ? "schema-missing" : "error",
      errorCode: missingTable ? "DATABASE_SCHEMA_MISSING" : (error.code || "DATABASE_CHECK_FAILED"),
      httpStatus: error.status || null
    };
  }
}

function anonymousHash(value) {
  const configuredSalt = String(process.env.FEEDBACK_HASH_SALT || "").trim();
  const salt = configuredSalt || "all-tools-nexora-local-fallback";
  return crypto.createHash("sha256").update(`${salt}:${value || "unknown"}`).digest("hex");
}

module.exports = {
  anonymousHash,
  databaseHeaders,
  databaseRequest,
  getDatabaseConfig,
  isModernApiKey,
  pingDatabase
};

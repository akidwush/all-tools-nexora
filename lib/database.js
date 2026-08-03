const crypto = require("node:crypto");

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getDatabaseConfig() {
  const url = normalizeUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, serviceRoleKey, configured: Boolean(url && serviceRoleKey) };
}

async function databaseRequest(resource, options = {}) {
  const config = getDatabaseConfig();
  if (!config.configured) {
    const error = new Error("Database belum dikonfigurasi.");
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(`${config.url}/rest/v1/${resource}`, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }

  if (!response.ok) {
    const error = new Error("Operasi database gagal.");
    error.code = "DATABASE_REQUEST_FAILED";
    error.status = response.status;
    error.cause = data;
    throw error;
  }

  return data;
}

function anonymousHash(value) {
  const salt = String(process.env.FEEDBACK_HASH_SALT || "all-tools-nexora");
  return crypto.createHash("sha256").update(`${salt}:${value || "unknown"}`).digest("hex");
}

module.exports = { anonymousHash, databaseRequest, getDatabaseConfig };

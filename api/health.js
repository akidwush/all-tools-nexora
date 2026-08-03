const { getDatabaseConfig, pingDatabase } = require("../lib/database");
const { readCachedToolHealth, normalizeCachedRows, summarizeHealth } = require("../lib/tool-health");

function send(response, status, payload, headOnly) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status);
  if (headOnly) return response.end();
  return response.json(payload);
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" }, false);
  }

  const config = getDatabaseConfig();
  const database = await pingDatabase();
  let toolHealth = summarizeHealth([]);
  let toolHealthAvailable = false;
  try {
    const rows = normalizeCachedRows(await readCachedToolHealth());
    toolHealth = summarizeHealth(rows);
    toolHealthAvailable = rows.length > 0;
  } catch {}

  const appHealthy = !database.configured || database.status === "ready";
  const httpStatus = database.configured && database.status !== "ready" ? 503 : 200;
  const serviceStatus = !appHealthy
    ? "degraded"
    : toolHealthAvailable && toolHealth.status !== "operational"
      ? "healthy-with-tool-warnings"
      : database.status === "ready"
        ? "healthy"
        : "healthy-without-database";

  return send(response, httpStatus, {
    ok: appHealthy,
    status: serviceStatus,
    app: "All Tools Nexora",
    developer: "Dika",
    version: "5.0.0",
    database: {
      configured: database.configured,
      connected: database.connected,
      schemaReady: database.schemaReady,
      status: database.status,
      latencyMs: database.latencyMs,
      errorCode: database.errorCode,
      urlConfigured: config.urlConfigured,
      keyConfigured: config.keyConfigured,
      validUrl: config.validUrl
    },
    toolHealth: {
      available: toolHealthAvailable,
      ...toolHealth
    },
    time: new Date().toISOString()
  }, request.method === "HEAD");
};

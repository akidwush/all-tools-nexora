const { getDatabaseConfig, pingDatabase } = require("../lib/database");

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
  const appHealthy = !database.configured || database.status === "ready";
  const status = database.configured && database.status !== "ready" ? 503 : 200;

  return send(response, status, {
    ok: appHealthy,
    status: database.status === "ready" ? "healthy" : database.configured ? "degraded" : "healthy-without-database",
    app: "All Tools Nexora",
    developer: "Dika",
    version: "4.1.0",
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
    time: new Date().toISOString()
  }, request.method === "HEAD");
};

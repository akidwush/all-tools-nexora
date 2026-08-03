const { getDatabaseConfig } = require("../lib/database");

module.exports = function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const database = getDatabaseConfig();
  response.setHeader("Cache-Control", "no-store");
  return response.status(200).json({
    ok: true,
    app: "All Tools Nexora",
    developer: "Dika",
    database: database.configured ? "configured" : "optional-not-configured",
    time: new Date().toISOString()
  });
};

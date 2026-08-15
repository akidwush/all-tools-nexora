const { databaseRequest, getDatabaseConfig, pingDatabase } = require("./database");

const RESOURCES = {
  tools: {
    path: "tools?select=id,name,description,category,badge,icon,external_url,sort_order,metadata&is_active=eq.true&order=sort_order.asc,name.asc",
    cache: "public, max-age=60, stale-while-revalidate=300"
  },
  settings: {
    path: "app_settings?select=key,value,updated_at&is_public=eq.true&order=key.asc",
    cache: "public, max-age=60, stale-while-revalidate=300"
  },
  socials: {
    path: "social_links?select=key,platform,label,description,url,icon,accent_color,is_active,sort_order,metadata&is_active=eq.true&url=neq.&order=sort_order.asc,label.asc",
    cache: "public, max-age=30, stale-while-revalidate=120"
  },
  developer_profile: {
    path: "developer_profiles?select=id,data,is_published,updated_at&id=eq.primary&is_published=eq.true&limit=1",
    cache: "public, max-age=30, stale-while-revalidate=60"
  }
};

function send(response, status, payload, cache = "no-store") {
  response.setHeader("Cache-Control", cache);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const url = new URL(request.url || "/api/database", `http://${request.headers.host || "localhost"}`);
  const resource = String(url.searchParams.get("resource") || "status").toLowerCase();

  if (resource === "status") {
    const database = await pingDatabase();
    return send(response, database.configured && database.status !== "ready" ? 503 : 200, {
      ok: !database.configured || database.status === "ready",
      resource: "status",
      database
    });
  }

  const definition = RESOURCES[resource];
  if (!definition) {
    return send(response, 400, {
      ok: false,
      error: "UNSUPPORTED_RESOURCE",
      allowed: ["status", ...Object.keys(RESOURCES)]
    });
  }

  if (!getDatabaseConfig().configured) {
    return send(response, 503, {
      ok: false,
      error: "DATABASE_NOT_CONFIGURED",
      message: "Database belum diaktifkan pada environment deployment."
    });
  }

  try {
    const data = await databaseRequest(definition.path, { method: "GET" });
    return send(response, 200, {
      ok: true,
      resource,
      count: Array.isArray(data) ? data.length : 0,
      data: Array.isArray(data) ? data : []
    }, definition.cache);
  } catch (error) {
    console.error("[database-api]", resource, error.code || "UNKNOWN_ERROR");
    return send(response, error.status === 504 ? 504 : 502, {
      ok: false,
      error: error.code || "DATABASE_READ_FAILED",
      message: "Data belum dapat dibaca dari database."
    });
  }
};

const { handleVDeploy } = require("../lib/vdeploy");
const publicDatabaseHandler = require("../lib/public-database");
const { getDatabaseConfig, pingDatabase } = require("../lib/database");
const { readCachedToolHealth, normalizeCachedRows, summarizeHealth } = require("../lib/tool-health");
const handlePersonalAi = require("../lib/personal-ai-http");
const { handleDocumentAi } = require("../lib/document-ai");
const { handlePromptGenerator } = require("../lib/prompt-generator");
const { handleComicReader } = require("../lib/comic-reader");
const { handleNovelCover } = require("../lib/ai-cover/http");
const { handleElevenLabs } = require("../lib/elevenlabs-studio");
const { handleTextToPdf } = require("../lib/text-to-pdf");
const { handleMultiAi } = require("../lib/kuroneko-multiai");
const { handleAnimeGallery } = require("../lib/anime-gallery");
const { authorizeTool } = require("../lib/account-membership");
const { healthToolId } = require("../lib/server-access-policy");
const { verifySameOriginRequest } = require("../lib/request-security");

function publicMetadataRequest(mode, request, requestUrl) {
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method)) return false;
  if (mode === "comic-reader") return !requestUrl.searchParams.get("action");
  if (mode === "multi-ai") return true;
  if (mode === "anime-gallery") return true;
  return new Set([
    "document-ai",
    "prompt-generator",
    "novel-cover",
    "elevenlabs",
    "text-to-pdf"
  ]).has(mode);
}

function send(response, status, payload, headOnly) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status);
  if (headOnly) return response.end();
  return response.json(payload);
}

module.exports = async function handler(request, response) {
  const requestUrl = new URL(request.url || "/api/health", `http://${request.headers.host || "localhost"}`);
  const mode = String(requestUrl.searchParams.get("mode") || "").toLowerCase();
  if (mode === "ai-chat") return handlePersonalAi(request, response);

  const protectedId = healthToolId(mode);
  if (protectedId && !verifySameOriginRequest(request)) {
    return send(response, 403, { ok: false, error: "ORIGIN_NOT_ALLOWED", message: "Permintaan lintas situs ditolak." });
  }
  if (protectedId && !publicMetadataRequest(mode, request, requestUrl) && !(await authorizeTool(request, response, protectedId))) return;

  if (mode === "document-ai") return handleDocumentAi(request, response);
  if (mode === "prompt-generator") return handlePromptGenerator(request, response);
  if (mode === "comic-reader") return handleComicReader(request, response);
  if (mode === "novel-cover") return handleNovelCover(request, response);
  if (mode === "elevenlabs") return handleElevenLabs(request, response);
  if (mode === "text-to-pdf") return handleTextToPdf(request, response);
  if (mode === "multi-ai") return handleMultiAi(request, response);
  if (mode === "anime-gallery") return handleAnimeGallery(request, response);
  if (mode === "database") {
    return publicDatabaseHandler(request, response);
  }
  if (mode === "vdeploy") return handleVDeploy(request, response);
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
    version: "6.4.0",
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

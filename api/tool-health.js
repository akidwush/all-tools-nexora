const crypto = require("node:crypto");
const { handleMediaDownload, mediaProvider } = require("../lib/media-download");
const { handleDownloader } = require("../lib/downloader-service");
const { handleSiteGrabber } = require("../lib/sitegrabber-proxy");
const { handleCryptoMarket } = require("../lib/crypto-market");
const { handleSpaceExplorer } = require("../lib/space-explorer");
const { handleOcrIntelligence } = require("../lib/ocr-intelligence");
const { handleSvgToXml } = require("../lib/svgtoxml-proxy");
const { handleAlightPremium } = require("../lib/alight-premium-proxy");
const { handleFreeConvertVectorizer } = require("../lib/freeconvert-vectorizer");
const { handleIpIntelligence } = require("../lib/ipinfo-intelligence");
const { handleBmkgOpenData } = require("../lib/bmkg-open-data");
const { handleGenMail } = require("../lib/genmail");
const { handleAioDownload } = require("../lib/kuroneko-aio");
const { handleDanbooruSearch } = require("../lib/kuroneko-danbooru");
const { handleAnimeToReal } = require("../lib/kuroneko-anime-to-real");
const { handleAiSong } = require("../lib/kuroneko-ai-song");
const { handleHD4 } = require("../lib/kuroneko-hd4");
const { authorizeTool, handleAccount } = require("../lib/account-membership");
const { sendJson: send } = require("../lib/http-response");
const {
  TOOL_CATALOG,
  getHealthConfig,
  isHealthCacheStale,
  normalizeCachedRows,
  readCachedToolHealth,
  runToolHealthChecks,
  summarizeHealth
} = require("../lib/tool-health");

let activeRun = null;
let lastPublicRunAt = 0;
const DOWNLOADER_TOOL_IDS = new Set(["terabox", "instagram", "tiktok", "youtube", "spotify"]);

function protectedToolId(mode, request, url) {
  if (mode === "downloader") {
    const provider = String(request.body?.provider || url.searchParams.get("provider") || "").toLowerCase();
    return DOWNLOADER_TOOL_IDS.has(provider) ? provider : "";
  }
  if (mode === "media-download") {
    let detected = "";
    try { detected = mediaProvider(new URL(String(url.searchParams.get("url") || "")).hostname); } catch {}
    const requested = String(url.searchParams.get("tool") || "").toLowerCase();
    if (["tiktok", "instagram", "terabox"].includes(detected)) return detected;
    if (detected === "nexray" && ["instagram", "terabox"].includes(requested)) return requested;
    return "";
  }
  return ({
    sitegrabber: "getcode",
    "crypto-market": "cryptomarket",
    "space-explorer": "spaceexplorer",
    "ocr-intelligence": "ocrintel",
    "svg-alight": "svgalight",
    "alight-premium": "alightpremium",
    "image-vectorizer": "imagevectorizer",
    "ip-intelligence": "ipintel",
    "bmkg-open-data": "bmkg"
  })[mode] || "";
}

function publicHealthOnly(mode, request, url) {
  if (request.method !== "GET") return false;
  if (mode === "alight-premium") return !url.searchParams.get("action");
  if (mode === "sitegrabber") return String(url.searchParams.get("action") || "health").toLowerCase() === "health";
  if (mode === "svg-alight") return true;
  return new Set([
    "downloader",
    "space-explorer",
    "ocr-intelligence",
    "image-vectorizer",
    "ip-intelligence",
    "bmkg-open-data"
  ]).has(mode) && url.searchParams.get("health") === "1";
}

function requestOrigin(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();
  if (!host || /[\s/\\]/.test(host)) throw new Error("INVALID_REQUEST_HOST");
  const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol = forwardedProto === "https" ? "https" : forwardedProto === "http" ? "http" : (request.socket?.encrypted ? "https" : localHost ? "http" : "https");
  return `${protocol}://${host}`;
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function authorized(request) {
  const expected = String(process.env.HEALTH_CHECK_TOKEN || "").trim();
  if (!expected) return false;
  const authorization = String(request.headers.authorization || "");
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const header = String(request.headers["x-health-token"] || "").trim();
  return timingSafeEqualText(bearer || header, expected);
}

async function executeRun(origin, persist = true) {
  if (!activeRun) {
    activeRun = runToolHealthChecks({ origin, persist }).finally(() => { activeRun = null; });
  }
  return activeRun;
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
    return response.status(204).end();
  }

  let origin;
  try { origin = requestOrigin(request); }
  catch { return send(response, 400, { ok: false, error: "INVALID_REQUEST_HOST" }); }

  const url = new URL(request.url || "/api/tool-health", origin);
  if (url.searchParams.get("_service") === "danbooru-search") {
    return handleDanbooruSearch(request, response, url);
  }
  if (url.searchParams.get("_service") === "anime-to-real") {
    return handleAnimeToReal(request, response, url);
  }
  if (url.searchParams.get("_service") === "ai-song") {
    return handleAiSong(request, response, url);
  }
  if (url.searchParams.get("_service") === "hd4-enhancer") {
    return handleHD4(request, response, url);
  }
  const mode = url.searchParams.get("mode");
  if (mode === "account") return handleAccount(request, response);
  const protectedId = protectedToolId(mode, request, url);
  const healthOnly = publicHealthOnly(mode, request, url);
  if (protectedId && !healthOnly && !(await authorizeTool(request, response, protectedId))) return;
  if (url.searchParams.get("mode") === "media-download") {
    return handleMediaDownload(request, response, url);
  }
  if (url.searchParams.get("mode") === "downloader") {
    return handleDownloader(request, response, url);
  }
  if (url.searchParams.get("mode") === "sitegrabber") {
    return handleSiteGrabber(request, response, url);
  }
  if (url.searchParams.get("mode") === "crypto-market") {
    return handleCryptoMarket(request, response, url);
  }
  if (url.searchParams.get("mode") === "space-explorer") {
    return handleSpaceExplorer(request, response, url);
  }
  if (url.searchParams.get("mode") === "ocr-intelligence") {
    return handleOcrIntelligence(request, response, url);
  }
  if (url.searchParams.get("mode") === "svg-alight") {
    return handleSvgToXml(request, response, url);
  }
  if (url.searchParams.get("mode") === "alight-premium") {
    return handleAlightPremium(request, response, url);
  }

  if (url.searchParams.get("mode") === "image-vectorizer") {
    return handleFreeConvertVectorizer(request, response, url);
  }

  if (url.searchParams.get("mode") === "ip-intelligence") {
    return handleIpIntelligence(request, response, url);
  }
  if (url.searchParams.get("mode") === "bmkg-open-data") {
    return handleBmkgOpenData(request, response, url);
  }
  if (url.searchParams.get("mode") === "genmail") {
    return handleGenMail(request, response, url);
  }
  if (url.searchParams.get("mode") === "aio-download") {
    return handleAioDownload(request, response, url);
  }

  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const config = getHealthConfig();
  const refresh = String(url.searchParams.get("refresh") || "auto").toLowerCase();

  if (request.method === "POST" || refresh === "force" || refresh === "1") {
    if (!config.tokenConfigured) {
      return send(response, 503, {
        ok: false,
        error: "HEALTH_TOKEN_NOT_CONFIGURED",
        message: "Tambahkan HEALTH_CHECK_TOKEN untuk menjalankan pemeriksaan paksa."
      });
    }
    if (!authorized(request)) return send(response, 401, { ok: false, error: "UNAUTHORIZED" });
    const run = await executeRun(origin, true);
    return send(response, 200, {
      ok: true,
      source: run.persistence.persisted ? "live-and-persisted" : "live",
      persistence: run.persistence,
      summary: summarizeHealth(run.results),
      data: run.results
    });
  }

  let cached = [];
  let cacheError = null;
  try { cached = normalizeCachedRows(await readCachedToolHealth()); }
  catch (error) { cacheError = error.code || "HEALTH_CACHE_UNAVAILABLE"; }

  const stale = isHealthCacheStale(cached, config.staleMs);
  const publicCooldown = Math.max(60_000, Math.min(config.staleMs, 5 * 60_000));
  const shouldAutoRefresh = refresh !== "0" && (stale || cached.length < TOOL_CATALOG.length) && Date.now() - lastPublicRunAt >= publicCooldown;

  if (shouldAutoRefresh) {
    lastPublicRunAt = Date.now();
    const run = await executeRun(origin, true);
    const rows = run.results;
    return send(response, 200, {
      ok: true,
      source: run.persistence.persisted ? "live-and-persisted" : "live",
      stale: false,
      persistence: run.persistence,
      summary: summarizeHealth(rows),
      data: rows
    });
  }

  const rows = cached.length ? cached : TOOL_CATALOG.map((tool) => ({
    toolId: tool.id,
    name: tool.name,
    category: tool.category,
    status: "unknown",
    targetType: tool.target.type,
    httpStatus: null,
    latencyMs: null,
    successRate: 0,
    totalChecks: 0,
    successfulChecks: 0,
    consecutiveFailures: 0,
    lastError: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    metadata: {}
  }));

  return send(response, 200, {
    ok: true,
    source: cached.length ? "cache" : "catalog",
    stale,
    cacheError,
    summary: summarizeHealth(rows),
    data: rows
  });
};

module.exports.protectedToolId = protectedToolId;
module.exports.publicHealthOnly = publicHealthOnly;

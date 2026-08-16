const { databaseRequest, getDatabaseConfig } = require("./database");

const DEFAULT_TIMEOUT_MS = 4_500;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_STALE_MS = 15 * 60 * 1000;
const DEFAULT_DEGRADED_LATENCY_MS = 2_500;

function positiveInteger(value, fallback, max = 120_000) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), max) : fallback;
}

function safeText(value, maxLength = 300) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function getHealthConfig() {
  return {
    timeoutMs: positiveInteger(process.env.HEALTH_CHECK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 15_000),
    concurrency: positiveInteger(process.env.HEALTH_CHECK_CONCURRENCY, DEFAULT_CONCURRENCY, 12),
    staleMs: positiveInteger(process.env.HEALTH_STALE_MS, DEFAULT_STALE_MS, 24 * 60 * 60 * 1000),
    degradedLatencyMs: positiveInteger(process.env.HEALTH_DEGRADED_LATENCY_MS, DEFAULT_DEGRADED_LATENCY_MS, 30_000),
    tokenConfigured: Boolean(String(process.env.HEALTH_CHECK_TOKEN || "").trim())
  };
}

const TOOL_CATALOG = Object.freeze([
  { id: "terabox", name: "Terabox Downloader", category: "downloader", target: { key: "downloader-terabox", type: "module", path: "/api/downloader?health=1&provider=terabox", method: "HEAD", strict: true } },
  { id: "instagram", name: "Instagram", category: "downloader", target: { key: "downloader-instagram", type: "module", path: "/api/downloader?health=1&provider=instagram", method: "HEAD", strict: true } },
  { id: "tiktok", name: "TikTok Downloader", category: "downloader", target: { key: "downloader-tiktok", type: "module", path: "/api/downloader?health=1&provider=tiktok", method: "HEAD", strict: true } },
  { id: "youtube", name: "YouTube Metadata", category: "downloader", target: { key: "downloader-youtube", type: "module", path: "/api/downloader?health=1&provider=youtube", method: "HEAD", strict: true, forcedStatus: "degraded" } },
  { id: "spotify", name: "Spotify Downloader", category: "downloader", target: { key: "downloader-spotify", type: "module", path: "/api/downloader?health=1&provider=spotify", method: "HEAD", strict: true } },
  { id: "fakebankjago", name: "Fake Bank Jago", category: "maker", target: { key: "nexray-api", type: "external-api", url: "https://api.nexray.eu.cc/", method: "HEAD" } },
  { id: "brat", name: "BRAT Generator", category: "maker", target: { key: "siputzx-api", type: "external-api", url: "https://api.siputzx.my.id/", method: "HEAD" } },
  { id: "iqc", name: "IQC Generator", category: "maker", target: { key: "nexray-api", type: "external-api", url: "https://api.nexray.eu.cc/", method: "HEAD" } },
  { id: "sertifikat", name: "Sertifikat Custom", category: "maker", target: { key: "siputzx-api", type: "external-api", url: "https://api.siputzx.my.id/", method: "HEAD" } },
  { id: "ektp", name: "E-KTP Generator", category: "maker", target: { key: "core-app", type: "module", path: "/assets/js/core/app.js", method: "HEAD", strict: true } },
  { id: "fakedana", name: "Fake Dana", category: "maker", target: { key: "nexray-api", type: "external-api", url: "https://api.nexray.eu.cc/", method: "HEAD" } },
  { id: "fakedev", name: "FakeDev", category: "maker", target: { key: "ikyyxd-api", type: "external-api", url: "https://api.ikyyxd.my.id/", method: "HEAD" } },
  { id: "fakelobby", name: "Fake Lobby", category: "maker", target: { key: "nexray-api", type: "external-api", url: "https://api.nexray.eu.cc/", method: "HEAD" } },
  { id: "winquotes", name: "Windows Quotes", category: "maker", target: { key: "nexadev-api", type: "external-api", url: "https://apii.nexadev.my.id/", method: "HEAD" } },
  { id: "nokiamsg", name: "Nokia Message", category: "maker", target: { key: "nexadev-api", type: "external-api", url: "https://apii.nexadev.my.id/", method: "HEAD" } },
  { id: "tanyaustadz", name: "Tanya Ustadz", category: "maker", target: { key: "core-app", type: "module", path: "/assets/js/core/app.js", method: "HEAD", strict: true } },
  { id: "mltools", name: "ML Tools", category: "tools", target: { key: "module-imported", type: "module", path: "/assets/js/features/imported-tools.js", method: "HEAD", strict: true } },
  { id: "comicreader", name: "Baca Komik Full", category: "tools", target: { key: "module-comic-reader", type: "module", path: "/assets/js/features/comic-reader.js", method: "HEAD", strict: true } },
  { id: "promptgenerate", name: "Prompt Generator", category: "tools", target: { key: "module-imported", type: "module", path: "/assets/js/features/imported-tools.js", method: "HEAD", strict: true } },
  { id: "fakeovo", name: "Fake OVO", category: "tools", target: { key: "module-imported", type: "module", path: "/assets/js/features/imported-tools.js", method: "HEAD", strict: true } },
  { id: "quotegenerator", name: "Quote Generator", category: "tools", target: { key: "module-imported", type: "module", path: "/assets/js/features/imported-tools.js", method: "HEAD", strict: true } },
  { id: "carifakta", name: "CariFakta", category: "tools", target: { key: "module-imported", type: "module", path: "/assets/js/features/imported-tools.js", method: "HEAD", strict: true } },
  { id: "virusscan", name: "Virus Scan", category: "tools", target: { key: "module-virus-scan", type: "module", path: "/assets/js/features/virus-scan.js", method: "HEAD", strict: true } },
  { id: "cryptomarket", name: "Crypto Market Scanner", category: "tools", target: { key: "crypto-market-api", type: "internal-api", path: "/api/crypto-market?currency=usd&limit=10", method: "GET", strict: true } },
  { id: "webintel", name: "Nexora Web Intelligence", category: "tools", target: { key: "web-intelligence-api", type: "internal-api", path: "/api/web-intelligence?health=1", method: "GET", strict: true } },
  { id: "ipintel", name: "IP & ASN Intelligence", category: "tools", target: { key: "ip-intelligence-api", type: "internal-api", path: "/api/ip-intelligence?health=1", method: "GET", strict: true } },
  { id: "bmkg", name: "BMKG Indonesia", category: "tools", target: { key: "bmkg-open-data-api", type: "internal-api", path: "/api/bmkg?health=1", method: "GET", strict: true } },
  { id: "spaceexplorer", name: "Space Explorer", category: "tools", target: { key: "space-explorer-api", type: "internal-api", path: "/api/space-explorer?health=1", method: "GET", strict: true } },
  { id: "ocrintel", name: "Nexora OCR Intelligence", category: "tools", target: { key: "ocr-intelligence-api", type: "internal-api", path: "/api/ocr-intelligence?health=1", method: "GET", strict: true } },
  { id: "svgalight", name: "SVG → Alight XML", category: "tools", target: { key: "svg-alight-api", type: "internal-api", path: "/api/svg-alight", method: "GET", strict: true } },
  { id: "imagevectorizer", name: "Nexora Image Vectorizer", category: "tools", target: { key: "module-image-vectorizer", type: "module", path: "/assets/js/features/image-vectorizer.js", method: "HEAD", strict: true } },
  { id: "bigimage", name: "Big Image", category: "tools", target: { key: "module-big-image", type: "module", path: "/assets/js/features/big-image.js", method: "HEAD", strict: true } },
  { id: "calc", name: "Calculator", category: "tools", target: { key: "core-app", type: "module", path: "/assets/js/core/app.js", method: "HEAD", strict: true } },
  { id: "pwgen", name: "Password Gen", category: "tools", target: { key: "core-app", type: "module", path: "/assets/js/core/app.js", method: "HEAD", strict: true } },
  { id: "morse", name: "Morse Code", category: "tools", target: { key: "core-app", type: "module", path: "/assets/js/core/app.js", method: "HEAD", strict: true } },
  { id: "removebg", name: "Remove BG", category: "tools", target: { key: "core-app", type: "module", path: "/assets/js/core/app.js", method: "HEAD", strict: true } },
  { id: "enhancer", name: "Image Enhancer", category: "tools", target: { key: "core-app", type: "module", path: "/assets/js/core/app.js", method: "HEAD", strict: true } },
  { id: "ttquote", name: "Quote TikTok Nexus", category: "vault", target: { key: "module-tiktok-quote", type: "module", path: "/assets/js/features/tiktok-quote.js", method: "HEAD", strict: true } },
  { id: "qrgen", name: "QR Generator", category: "vault", target: { key: "core-app", type: "module", path: "/assets/js/core/app.js", method: "HEAD", strict: true } },
  { id: "tiktokhd", name: "Upload TikTok HD", category: "external", target: { key: "core-shell", type: "module", path: "/assets/js/core/shell.js", method: "HEAD", strict: true } },
  { id: "getcode", name: "Get Code HTML", category: "external", target: { key: "module-get-code", type: "module", path: "/assets/js/features/get-code.js", method: "HEAD", strict: true } },
  { id: "vdeploy", name: "Deploy & Update Web", category: "external", target: { key: "module-deploy-center", type: "module", path: "/assets/js/features/deploy-center.js", method: "HEAD", strict: true } },
  { id: "zxvai", name: "ZxVAI", category: "external", target: { key: "zxvai-app", type: "external-app", url: "https://zxvaiapk.netlify.app/", method: "HEAD" } },
  { id: "fotolink", name: "Foto To Link", category: "external", target: { key: "pixvault-app", type: "external-app", url: "https://pixvault-bykz.netlify.app/", method: "HEAD" } },
  { id: "webencryption", name: "Web Encryption", category: "external", target: { key: "module-web-encryption", type: "module", path: "/assets/js/features/web-encryption.js", method: "HEAD", strict: true } },
  { id: "unbanwa", name: "Unban WhatsApp", category: "external", target: { key: "module-unban", type: "module", path: "/assets/js/features/unban-whatsapp.js", method: "HEAD", strict: true } }
]);

function targetUrl(target, origin) {
  if (target.url) return target.url;
  const base = new URL(origin);
  return new URL(target.path || "/", base).toString();
}

async function fetchProbe(url, method, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    let response = await fetch(url, {
      method,
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "*/*",
        "User-Agent": "All-Tools-Nexora-Health/6.3.18",
        ...(method === "GET" ? { Range: "bytes=0-0" } : {})
      }
    });

    if (method === "HEAD" && [405, 501].includes(response.status)) {
      try { await response.body?.cancel(); } catch {}
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "*/*",
          Range: "bytes=0-0",
          "User-Agent": "All-Tools-Nexora-Health/6.3.18"
        }
      });
    }

    const result = {
      ok: response.ok,
      statusCode: response.status,
      latencyMs: Date.now() - startedAt,
      finalUrl: response.url || url,
      contentType: safeText(response.headers.get("content-type"), 120),
      errorCode: null,
      errorMessage: null
    };
    try { await response.body?.cancel(); } catch {}
    return result;
  } catch (error) {
    const timeout = error && error.name === "AbortError";
    return {
      ok: false,
      statusCode: null,
      latencyMs: Date.now() - startedAt,
      finalUrl: url,
      contentType: "",
      errorCode: timeout ? "HEALTH_TIMEOUT" : "HEALTH_UNREACHABLE",
      errorMessage: timeout ? `Melewati batas waktu ${timeoutMs} ms.` : safeText(error && error.message ? error.message : error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function classifyProbe(probe, target, config = getHealthConfig()) {
  if (probe.errorCode) {
    return { status: "offline", reason: probe.errorCode, message: probe.errorMessage || "Target tidak dapat dijangkau." };
  }

  const code = Number(probe.statusCode || 0);
  const strict = Boolean(target.strict);
  const acceptable = strict ? code >= 200 && code < 400 : code >= 200 && code < 500;
  if (!acceptable || code >= 500) {
    return { status: "offline", reason: `HTTP_${code || "UNKNOWN"}`, message: `Target merespons HTTP ${code || "tidak diketahui"}.` };
  }

  if (!strict && code >= 400) {
    return { status: "degraded", reason: `HTTP_${code}`, message: `Server terjangkau, tetapi merespons HTTP ${code}.` };
  }

  if (probe.latencyMs > config.degradedLatencyMs) {
    return { status: "degraded", reason: "HIGH_LATENCY", message: `Latensi tinggi: ${probe.latencyMs} ms.` };
  }

  if (target.forcedStatus === "degraded") {
    return { status: "degraded", reason: "LIMITED_CAPABILITY", message: "Hanya metadata dan tautan resmi yang tersedia." };
  }

  return { status: "operational", reason: null, message: null };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
  return results;
}

async function readCachedToolHealth() {
  if (!getDatabaseConfig().configured) return [];
  const rows = await databaseRequest(
    "tool_health?select=tool_id,tool_name,category,status,target_type,http_status,latency_ms,success_rate,total_checks,successful_checks,consecutive_failures,last_error,last_checked_at,last_success_at,metadata,updated_at&order=tool_name.asc",
    { method: "GET" }
  );
  return Array.isArray(rows) ? rows : [];
}

function normalizeCachedRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    toolId: row.tool_id,
    name: row.tool_name,
    category: row.category,
    status: row.status,
    targetType: row.target_type,
    httpStatus: row.http_status,
    latencyMs: row.latency_ms,
    successRate: Number(row.success_rate || 0),
    totalChecks: Number(row.total_checks || 0),
    successfulChecks: Number(row.successful_checks || 0),
    consecutiveFailures: Number(row.consecutive_failures || 0),
    lastError: row.last_error || null,
    lastCheckedAt: row.last_checked_at || null,
    lastSuccessAt: row.last_success_at || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  }));
}

function isHealthCacheStale(rows, staleMs = getHealthConfig().staleMs) {
  if (!Array.isArray(rows) || rows.length < TOOL_CATALOG.length) return true;
  const timestamps = rows.map((row) => Date.parse(row.last_checked_at || row.lastCheckedAt || "")).filter(Number.isFinite);
  if (timestamps.length < TOOL_CATALOG.length) return true;
  return Date.now() - Math.min(...timestamps) >= staleMs;
}

async function persistHealthResults(results, previousRows = []) {
  if (!getDatabaseConfig().configured) return { persisted: false, reason: "DATABASE_NOT_CONFIGURED" };
  const previous = new Map((previousRows || []).map((row) => [row.tool_id || row.toolId, row]));
  const now = new Date().toISOString();
  const rows = results.map((result) => {
    const old = previous.get(result.toolId) || {};
    const totalChecks = Number(old.total_checks || old.totalChecks || 0) + 1;
    const wasSuccessful = result.status === "operational" || result.status === "degraded";
    const successfulChecks = Number(old.successful_checks || old.successfulChecks || 0) + (wasSuccessful ? 1 : 0);
    const consecutiveFailures = result.status === "offline" ? Number(old.consecutive_failures || old.consecutiveFailures || 0) + 1 : 0;
    return {
      tool_id: result.toolId,
      tool_name: result.name,
      category: result.category,
      status: result.status,
      target_type: result.targetType,
      health_url: result.healthUrl,
      http_status: result.httpStatus,
      latency_ms: result.latencyMs,
      success_rate: Number(((successfulChecks / totalChecks) * 100).toFixed(2)),
      total_checks: totalChecks,
      successful_checks: successfulChecks,
      consecutive_failures: consecutiveFailures,
      last_error: result.status === "operational" ? null : safeText(result.message || result.reason, 300),
      last_checked_at: now,
      last_success_at: wasSuccessful ? now : (old.last_success_at || old.lastSuccessAt || null),
      metadata: {
        reason: result.reason,
        contentType: result.contentType || null,
        finalHost: (() => { try { return new URL(result.finalUrl).hostname; } catch { return null; } })()
      },
      updated_at: now
    };
  });

  await databaseRequest("tool_health?on_conflict=tool_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
  return { persisted: true, count: rows.length };
}

async function runToolHealthChecks({ origin, targets = TOOL_CATALOG, persist = true } = {}) {
  if (!origin) throw new Error("Origin wajib tersedia untuk pemeriksaan health internal.");
  const config = getHealthConfig();
  let previousRows = [];
  try { previousRows = await readCachedToolHealth(); } catch {}

  const uniqueTargets = new Map();
  for (const tool of targets) {
    const url = targetUrl(tool.target, origin);
    const key = `${tool.target.key}|${tool.target.method || "HEAD"}|${url}`;
    if (!uniqueTargets.has(key)) uniqueTargets.set(key, { ...tool.target, url, key });
  }

  const probes = await mapLimit([...uniqueTargets.values()], config.concurrency, async (target) => {
    const probe = await fetchProbe(target.url, target.method || "HEAD", config.timeoutMs);
    return { key: target.key, target, probe, classification: classifyProbe(probe, target, config) };
  });
  const probeMap = new Map(probes.map((item) => [item.key, item]));

  const checkedAt = new Date().toISOString();
  const results = targets.map((tool) => {
    const url = targetUrl(tool.target, origin);
    const key = `${tool.target.key}|${tool.target.method || "HEAD"}|${url}`;
    const item = probeMap.get(key);
    return {
      toolId: tool.id,
      name: tool.name,
      category: tool.category,
      status: item.classification.status,
      targetType: tool.target.type,
      healthUrl: url,
      httpStatus: item.probe.statusCode,
      latencyMs: item.probe.latencyMs,
      contentType: item.probe.contentType,
      finalUrl: item.probe.finalUrl,
      reason: item.classification.reason,
      message: item.classification.message,
      checkedAt
    };
  });

  let persistence = { persisted: false, reason: persist ? "NOT_ATTEMPTED" : "DISABLED" };
  if (persist) {
    try { persistence = await persistHealthResults(results, previousRows); }
    catch (error) {
      persistence = { persisted: false, reason: error.code || "HEALTH_PERSIST_FAILED" };
    }
  }

  let rows = results;
  if (persistence.persisted) {
    try { rows = normalizeCachedRows(await readCachedToolHealth()); } catch {}
  }
  return { results: rows, persistence, checkedAt };
}

function summarizeHealth(rows) {
  const normalized = Array.isArray(rows) ? rows : [];
  const counts = { operational: 0, degraded: 0, offline: 0, unknown: 0 };
  for (const row of normalized) {
    const status = Object.hasOwn(counts, row.status) ? row.status : "unknown";
    counts[status] += 1;
  }
  let status = "unknown";
  if (normalized.length) {
    if (counts.unknown === normalized.length) status = "unknown";
    else if (counts.operational === normalized.length) status = "operational";
    else if (counts.operational === 0 && counts.degraded === 0 && counts.offline > 0) status = "offline";
    else status = "degraded";
  }
  const lastCheckedValues = normalized
    .map((row) => Date.parse(row.lastCheckedAt || row.last_checked_at || row.checkedAt || ""))
    .filter(Number.isFinite);
  return {
    status,
    total: normalized.length,
    counts,
    lastCheckedAt: lastCheckedValues.length ? new Date(Math.max(...lastCheckedValues)).toISOString() : null
  };
}

module.exports = {
  TOOL_CATALOG,
  classifyProbe,
  fetchProbe,
  getHealthConfig,
  isHealthCacheStale,
  normalizeCachedRows,
  readCachedToolHealth,
  runToolHealthChecks,
  summarizeHealth
};

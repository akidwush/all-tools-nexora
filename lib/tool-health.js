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

const NEXORA_CONFIG = require("../assets/config.js");
const TOOL_CATEGORIES = ["downloader", "maker", "tools", "vault", "external"];
const TOOL_CATALOG = Object.freeze(TOOL_CATEGORIES.flatMap((category) =>
  (Array.isArray(NEXORA_CONFIG.tools[category]) ? NEXORA_CONFIG.tools[category] : [])
    .filter((tool) => tool && tool.id && tool.health)
    .map((tool) => Object.freeze({
      id: tool.id,
      name: tool.name,
      category,
      target: tool.health
    }))
));

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
        "User-Agent": "All-Tools-Nexora-Health/6.4.0",
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
          "User-Agent": "All-Tools-Nexora-Health/6.4.0"
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
    // A timeout on a non-strict external API is inconclusive, not proof that
    // the whole Nexora tool is offline. Several tools have runtime fallbacks
    // (proxy/alternate provider) that the single health probe does not test.
    const softExternalTimeout = probe.errorCode === "HEALTH_TIMEOUT" && target?.type === "external-api" && !target?.strict;
    return {
      status: softExternalTimeout ? "degraded" : "offline",
      reason: probe.errorCode,
      message: probe.errorMessage || "Target tidak dapat dijangkau."
    };
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
  const catalogIds = new Set(TOOL_CATALOG.map((tool) => tool.id));
  return Array.isArray(rows) ? rows.filter((row) => catalogIds.has(row.tool_id)) : [];
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

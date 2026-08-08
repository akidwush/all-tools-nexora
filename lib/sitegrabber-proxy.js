"use strict";

const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const JSON_TIMEOUT_MS = 22_000;
const HEALTH_TIMEOUT_MS = 9_000;
const DOWNLOAD_TIMEOUT_MS = 75_000;
const CAPTURE_WINDOW_MS = 10 * 60_000;
const MAX_CAPTURES_PER_WINDOW = 4;
const MAX_READS_PER_WINDOW = 220;
const buckets = new Map();

function sendJson(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.statusCode = status;
  return response.end(JSON.stringify(payload));
}

function config() {
  const rawBase = String(process.env.SITEGRABBER_API_BASE_URL || "").trim();
  const apiKey = String(process.env.SITEGRABBER_API_KEY || "").trim();
  if (!rawBase) return { configured: false, reason: "SITEGRABBER_API_BASE_URL_MISSING" };
  let parsed;
  try { parsed = new URL(rawBase); }
  catch { return { configured: false, reason: "SITEGRABBER_API_BASE_URL_INVALID" }; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return { configured: false, reason: "SITEGRABBER_API_BASE_URL_UNSAFE" };
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return {
    configured: Boolean(apiKey),
    baseUrl: parsed.toString().replace(/\/$/, ""),
    apiKey,
    reason: apiKey ? "" : "SITEGRABBER_API_KEY_MISSING"
  };
}

function clientIp(request) {
  const forwarded = String(request.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
}

function takeRateSlot(request, capture) {
  const now = Date.now();
  const key = `${clientIp(request)}:${capture ? "capture" : "read"}`;
  const limit = capture ? MAX_CAPTURES_PER_WINDOW : MAX_READS_PER_WINDOW;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + CAPTURE_WINDOW_MS });
    return { allowed: true, limit, remaining: limit - 1, resetAt: now + CAPTURE_WINDOW_MS };
  }
  current.count += 1;
  buckets.set(key, current);
  return { allowed: current.count <= limit, limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

function safeJobId(value) {
  const id = String(value || "").trim();
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5a-f0-9][a-f0-9]{3}-[89ab0-9a-f][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) ? id : "";
}

function validateTargetUrl(raw) {
  let parsed;
  try { parsed = new URL(String(raw || "").trim()); }
  catch { throw Object.assign(new Error("URL target tidak valid."), { status: 400, code: "INVALID_TARGET_URL" }); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw Object.assign(new Error("Target harus memakai HTTP/HTTPS tanpa kredensial URL."), { status: 400, code: "UNSAFE_TARGET_URL" });
  }
  parsed.hash = "";
  return parsed.toString();
}

function parseBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return Promise.resolve(request.body);
  if (typeof request.body === "string") {
    try { return Promise.resolve(JSON.parse(request.body)); } catch { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let raw = "";
    request.on?.("data", (chunk) => {
      raw += chunk;
      if (raw.length > 131_072) request.destroy?.();
    });
    request.on?.("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    request.on?.("error", () => resolve({}));
  });
}

function upstreamHeaders(cfg, json) {
  return {
    Accept: json ? "application/json" : "*/*",
    Authorization: `Bearer ${cfg.apiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store", redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonResponse(upstream) {
  const text = await upstream.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { success: false, error: text.slice(0, 400) || `HTTP ${upstream.status}` }; }
  if (!upstream.ok) {
    const message = String(data.error || data.message || `SiteGrabber merespons HTTP ${upstream.status}.`);
    const error = new Error(message);
    error.status = upstream.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function setRateHeaders(response, rate) {
  response.setHeader("X-Nexora-SGX-RateLimit-Limit", String(rate.limit));
  response.setHeader("X-Nexora-SGX-RateLimit-Remaining", String(rate.remaining));
  response.setHeader("X-Nexora-SGX-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
}

async function streamArchive(request, response, cfg, endpoint, fallbackName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const abort = () => controller.abort();
  request.once?.("aborted", abort);
  response.once?.("close", abort);
  try {
    const upstream = await fetch(`${cfg.baseUrl}${endpoint}`, {
      method: "GET",
      headers: upstreamHeaders(cfg, false),
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow"
    });
    if (!upstream.ok) {
      const payload = await readJsonResponse(upstream).catch((error) => { throw error; });
      return sendJson(response, upstream.status, payload);
    }
    response.statusCode = 200;
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/zip");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.setHeader("Content-Disposition", upstream.headers.get("content-disposition") || `attachment; filename="${fallbackName}"`);
    const length = upstream.headers.get("content-length");
    if (length) response.setHeader("Content-Length", length);
    if (!upstream.body) return response.end();
    await pipeline(Readable.fromWeb(upstream.body), response);
    return;
  } catch (error) {
    if (response.headersSent) {
      if (!response.destroyed) response.destroy();
      return;
    }
    const timeout = error?.name === "AbortError";
    return sendJson(response, timeout ? 504 : (error.status || 502), {
      ok: false,
      error: timeout ? "SITEGRABBER_DOWNLOAD_TIMEOUT" : "SITEGRABBER_DOWNLOAD_FAILED",
      message: timeout ? "Download SiteGrabber melewati batas waktu." : (error.message || "Download SiteGrabber gagal.")
    });
  } finally {
    clearTimeout(timer);
    request.removeListener?.("aborted", abort);
    response.removeListener?.("close", abort);
  }
}

async function handleSiteGrabber(request, response, requestUrl) {
  const cfg = config();
  const action = String(requestUrl.searchParams.get("action") || "health").toLowerCase();

  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
    return response.status(204).end();
  }

  if (!cfg.baseUrl) {
    return sendJson(response, 503, { ok: false, configured: false, error: cfg.reason, message: "SITEGRABBER_API_BASE_URL belum dikonfigurasi di Vercel." });
  }

  if (action === "health" && request.method === "GET") {
    try {
      const upstream = await fetchWithTimeout(`${cfg.baseUrl}/api/v1/health`, { method: "GET", headers: { Accept: "application/json" } }, HEALTH_TIMEOUT_MS);
      const data = await readJsonResponse(upstream);
      return sendJson(response, 200, { ok: true, configured: cfg.configured, upstream: data });
    } catch (error) {
      return sendJson(response, error?.name === "AbortError" ? 504 : (error.status || 502), {
        ok: false,
        configured: cfg.configured,
        error: "SITEGRABBER_HEALTH_FAILED",
        message: error?.name === "AbortError" ? "Health check SiteGrabber timeout." : (error.message || "SiteGrabber tidak dapat dihubungi.")
      });
    }
  }

  if (!cfg.configured) {
    return sendJson(response, 503, { ok: false, configured: false, error: cfg.reason, message: "SITEGRABBER_API_KEY belum dikonfigurasi di Vercel." });
  }

  const captureAction = action === "capture";
  const rate = takeRateSlot(request, captureAction);
  setRateHeaders(response, rate);
  if (!rate.allowed) {
    return sendJson(response, 429, { ok: false, error: "SITEGRABBER_RATE_LIMITED", message: "Batas penggunaan SiteGrabber dari perangkat ini tercapai. Coba lagi nanti." });
  }

  try {
    if (action === "usage" && request.method === "GET") {
      const upstream = await fetchWithTimeout(`${cfg.baseUrl}/api/v1/account/usage`, { method: "GET", headers: upstreamHeaders(cfg, true) }, JSON_TIMEOUT_MS);
      return sendJson(response, 200, { ok: true, data: await readJsonResponse(upstream) });
    }

    if (action === "capture" && request.method === "POST") {
      const body = await parseBody(request);
      if (body?.consent !== true) return sendJson(response, 422, { ok: false, error: "CAPTURE_CONSENT_REQUIRED", message: "Konfirmasi izin capture diperlukan." });
      const url = validateTargetUrl(body?.url);
      const allowedModes = new Set(["single-page", "full-website", "asset-collector"]);
      const mode = allowedModes.has(String(body?.mode || "")) ? String(body.mode) : "single-page";
      const upstream = await fetchWithTimeout(`${cfg.baseUrl}/api/v1/capture`, {
        method: "POST",
        headers: upstreamHeaders(cfg, true),
        body: JSON.stringify({ url, mode, consent: true })
      }, JSON_TIMEOUT_MS);
      const data = await readJsonResponse(upstream);
      return sendJson(response, 202, { ok: true, job: data.job || null });
    }

    const jobId = safeJobId(requestUrl.searchParams.get("id"));
    if (["job", "report", "download", "report-download", "cancel"].includes(action) && !jobId) {
      return sendJson(response, 400, { ok: false, error: "INVALID_SITEGRABBER_JOB_ID", message: "Job ID SiteGrabber tidak valid." });
    }

    if (action === "job" && request.method === "GET") {
      const upstream = await fetchWithTimeout(`${cfg.baseUrl}/api/v1/jobs/${jobId}`, { method: "GET", headers: upstreamHeaders(cfg, true) }, JSON_TIMEOUT_MS);
      return sendJson(response, 200, { ok: true, data: await readJsonResponse(upstream) });
    }

    if (action === "report" && request.method === "GET") {
      const upstream = await fetchWithTimeout(`${cfg.baseUrl}/api/v1/jobs/${jobId}/report`, { method: "GET", headers: upstreamHeaders(cfg, true) }, JSON_TIMEOUT_MS);
      return sendJson(response, 200, { ok: true, data: await readJsonResponse(upstream) });
    }

    if (action === "download" && request.method === "GET") {
      return streamArchive(request, response, cfg, `/api/v1/jobs/${jobId}/download`, `sitegrabber-${jobId}.zip`);
    }

    if (action === "report-download" && request.method === "GET") {
      return streamArchive(request, response, cfg, `/api/v1/jobs/${jobId}/report-download`, `sitegrabber-${jobId}-reports.zip`);
    }

    if (action === "cancel" && request.method === "DELETE") {
      const upstream = await fetchWithTimeout(`${cfg.baseUrl}/api/v1/jobs/${jobId}`, { method: "DELETE", headers: upstreamHeaders(cfg, true) }, JSON_TIMEOUT_MS);
      return sendJson(response, 200, { ok: true, data: await readJsonResponse(upstream) });
    }

    response.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
    return sendJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const timeout = error?.name === "AbortError";
    return sendJson(response, timeout ? 504 : (error.status || 502), {
      ok: false,
      error: timeout ? "SITEGRABBER_TIMEOUT" : "SITEGRABBER_UPSTREAM_FAILED",
      message: timeout ? "SiteGrabber melewati batas waktu." : (error.message || "SiteGrabber gagal merespons."),
      details: error.payload?.details || undefined
    });
  }
}

module.exports = { handleSiteGrabber, validateTargetUrl, safeJobId };

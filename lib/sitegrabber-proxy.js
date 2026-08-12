"use strict";

const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { takeFixedWindow } = require("./memory-store");

const JSON_TIMEOUT_MS = 22_000;
const HEALTH_TIMEOUT_MS = 9_000;
const DOWNLOAD_TIMEOUT_MS = 75_000;
const CAPTURE_WINDOW_MS = 10 * 60_000;
const MAX_CAPTURES_PER_WINDOW = 4;
const MAX_READS_PER_WINDOW = 220;
const MAX_JSON_RESPONSE_BYTES = 1_000_000;
const MAX_ARCHIVE_BYTES = 4_000_000;
const MAX_REDIRECTS = 3;
const responseCleanup = Symbol("sitegrabber-response-cleanup");
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
  return (forwarded || request.socket?.remoteAddress || "unknown").slice(0, 80);
}

function takeRateSlot(request, capture) {
  const key = `${clientIp(request)}:${capture ? "capture" : "read"}`;
  const limit = capture ? MAX_CAPTURES_PER_WINDOW : MAX_READS_PER_WINDOW;
  return takeFixedWindow(buckets, key, {
    windowMs: CAPTURE_WINDOW_MS,
    limit,
    maxEntries: 2_000
  });
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

function redirectError(message, code) {
  return Object.assign(new Error(message), { status: 502, code });
}

async function fetchWithSafeRedirects(url, init = {}, options = {}) {
  const start = new URL(url);
  let current = start;
  const method = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const upstream = await fetch(current, {
      ...init,
      method,
      headers,
      signal: options.signal || init.signal,
      cache: "no-store",
      redirect: "manual"
    });
    if (![301, 302, 303, 307, 308].includes(upstream.status)) return upstream;
    const location = upstream.headers.get("location");
    await upstream.body?.cancel().catch(() => {});
    if (!location) throw redirectError("Redirect SiteGrabber tidak memiliki tujuan.", "SITEGRABBER_REDIRECT_INVALID");
    if (!["GET", "HEAD"].includes(method)) {
      throw redirectError("Redirect untuk operasi mutasi SiteGrabber ditolak.", "SITEGRABBER_REDIRECT_BLOCKED");
    }
    if (attempt === MAX_REDIRECTS) throw redirectError("Redirect SiteGrabber terlalu banyak.", "SITEGRABBER_REDIRECT_LIMIT");
    const next = new URL(location, current);
    if (next.protocol !== "https:" || next.username || next.password) {
      throw redirectError("Tujuan redirect SiteGrabber tidak aman.", "SITEGRABBER_REDIRECT_UNSAFE");
    }
    if (next.origin !== start.origin) {
      if (!options.allowCrossOrigin) {
        throw redirectError("Redirect lintas origin SiteGrabber ditolak.", "SITEGRABBER_REDIRECT_BLOCKED");
      }
      headers.delete("authorization");
      headers.delete("cookie");
    }
    current = next;
  }
  throw redirectError("Redirect SiteGrabber gagal.", "SITEGRABBER_REDIRECT_FAILED");
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithSafeRedirects(url, init, { signal: controller.signal });
    Object.defineProperty(response, responseCleanup, {
      configurable: true,
      value: () => clearTimeout(timer)
    });
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

async function readJsonResponse(upstream) {
  try {
    const declaredSize = Number(upstream.headers.get("content-length") || 0);
    if (declaredSize > MAX_JSON_RESPONSE_BYTES) {
      await upstream.body?.cancel().catch(() => {});
      throw redirectError("Respons JSON SiteGrabber terlalu besar.", "SITEGRABBER_RESPONSE_TOO_LARGE");
    }
    const chunks = [];
    let total = 0;
    if (upstream.body) {
      for await (const chunk of Readable.fromWeb(upstream.body)) {
        total += chunk.length;
        if (total > MAX_JSON_RESPONSE_BYTES) throw redirectError("Respons JSON SiteGrabber terlalu besar.", "SITEGRABBER_RESPONSE_TOO_LARGE");
        chunks.push(chunk);
      }
    }
    const text = Buffer.concat(chunks).toString("utf8");
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
  } finally {
    upstream[responseCleanup]?.();
  }
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
    const upstream = await fetchWithSafeRedirects(`${cfg.baseUrl}${endpoint}`, {
      method: "GET",
      headers: upstreamHeaders(cfg, false),
      signal: controller.signal
    }, { signal: controller.signal, allowCrossOrigin: true });
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
    if (Number(length || 0) > MAX_ARCHIVE_BYTES) {
      await upstream.body?.cancel().catch(() => {});
      return sendJson(response, 413, {
        ok: false,
        error: "SITEGRABBER_ARCHIVE_TOO_LARGE",
        message: "Arsip SiteGrabber melebihi batas proxy 4 MB. Unduh dari layanan sumber."
      });
    }
    if (length) response.setHeader("Content-Length", length);
    if (!upstream.body) return response.end();
    let streamed = 0;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        streamed += chunk.length;
        if (streamed > MAX_ARCHIVE_BYTES) return callback(redirectError("Arsip SiteGrabber melebihi batas proxy 4 MB.", "SITEGRABBER_ARCHIVE_TOO_LARGE"));
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(upstream.body), limiter, response);
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

module.exports = {
  MAX_ARCHIVE_BYTES,
  fetchWithSafeRedirects,
  handleSiteGrabber,
  validateTargetUrl,
  safeJobId
};

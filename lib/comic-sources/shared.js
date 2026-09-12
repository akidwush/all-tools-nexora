"use strict";

const { text } = require("./normalizer");

const responseCache = new Map();
const MAX_CACHE_ENTRIES = 220;
const RETRYABLE = new Set([502, 503, 504]);

function error(message, code = "COMIC_SOURCE_FAILED", status = 502, extra = {}) {
  return Object.assign(new Error(message), { code, status, ...extra });
}

function token(value, label = "ID", maximum = 220) {
  const out = text(value, maximum);
  if (!out || !/^[A-Za-z0-9][A-Za-z0-9._:@~-]{0,259}$/.test(out)) throw error(`${label} tidak valid.`, "COMIC_ID_INVALID", 400);
  return out;
}

function slug(value, label = "Slug", maximum = 220) {
  const out = text(value, maximum);
  if (!out || !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,259}$/.test(out)) throw error(`${label} tidak valid.`, "COMIC_SLUG_INVALID", 400);
  return out;
}

function positiveInt(value, { min = 1, max = 100, fallback = 1 } = {}) {
  const n = Number.parseInt(String(value == null ? "" : value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cacheGet(key) {
  const row = responseCache.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) { responseCache.delete(key); return null; }
  responseCache.delete(key); responseCache.set(key, row);
  return row.value;
}

function cacheSet(key, value, ttlMs) {
  responseCache.delete(key);
  responseCache.set(key, { value, expiresAt: Date.now() + Math.max(0, Number(ttlMs) || 0) });
  while (responseCache.size > MAX_CACHE_ENTRIES) responseCache.delete(responseCache.keys().next().value);
  return value;
}

function retryAfterMs(headers) {
  const raw = text(headers?.get?.("retry-after"), 80);
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.min(30_000, Math.ceil(Number(raw) * 1000));
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.min(30_000, Math.max(0, at - Date.now())) : 0;
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (!ms || signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); signal?.removeEventListener?.("abort", done); resolve(); }
    signal?.addEventListener?.("abort", done, { once: true });
  });
}

function buildUrl(base, pathname, params) {
  const baseUrl = new URL(base);
  if (baseUrl.protocol !== "https:") throw error("Provider harus memakai HTTPS.", "COMIC_SOURCE_PROTOCOL_INVALID", 500);
  const url = new URL(pathname, baseUrl);
  if (url.origin !== baseUrl.origin) throw error("Tujuan provider tidak valid.", "COMIC_SOURCE_ORIGIN_INVALID", 500);
  if (params) for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) value.forEach((row) => url.searchParams.append(key, String(row)));
    else url.searchParams.set(key, String(value));
  }
  return url;
}

async function readJson(response, maximumBytes) {
  if (typeof response.text === "function") {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > maximumBytes) throw error("Respons provider terlalu besar.", "COMIC_SOURCE_RESPONSE_TOO_LARGE", 502);
    try { return JSON.parse(raw); } catch { throw error("Respons provider bukan JSON valid.", "COMIC_SOURCE_INVALID_JSON", 502); }
  }
  const payload = await response.json();
  return payload;
}

async function requestJson({
  base,
  path,
  params,
  headers = {},
  cacheMs = 0,
  timeoutMs = 10_000,
  fetchImpl = globalThis.fetch,
  provider = "source",
  signal,
  retries = 2,
  maxBytes = 4_000_000
}) {
  if (typeof fetchImpl !== "function") throw error("HTTP client tidak tersedia.", "COMIC_FETCH_UNAVAILABLE", 503);
  const url = buildUrl(base, path, params);
  const cacheKey = `${provider}:${url}`;
  const cached = cacheMs > 0 ? cacheGet(cacheKey) : null;
  if (cached) return cached;

  let lastError = null;
  for (let attempt = 0; attempt <= Math.max(0, Math.min(2, retries)); attempt += 1) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener?.("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, Math.min(20_000, timeoutMs)));
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Nexora-Multi-Source-Comic-Reader/1.0 (+https://all-tools-nexora.vercel.app)",
          ...headers
        }
      });
      if (!response?.ok) {
        const status = Number(response?.status || 502);
        const retryMs = status === 429 ? retryAfterMs(response?.headers) : 0;
        const upstreamError = error(`${provider} merespons HTTP ${status}.`, status === 429 ? "COMIC_RATE_LIMITED" : "COMIC_UPSTREAM_HTTP", status === 429 ? 429 : (status === 404 ? 404 : 502), { upstreamStatus: status, retryAfterMs: retryMs });
        const retryable = RETRYABLE.has(status) || (status === 429 && retryMs > 0);
        if (!retryable || attempt >= retries) throw upstreamError;
        await sleep(status === 429 ? Math.min(retryMs, 8_000) : Math.min(1_600, 250 * (2 ** attempt)), signal);
        lastError = upstreamError;
        continue;
      }
      const payload = await readJson(response, maxBytes);
      if (!payload || typeof payload !== "object") throw error("Respons provider kosong.", "COMIC_SOURCE_INVALID_JSON", 502);
      return cacheMs > 0 ? cacheSet(cacheKey, payload, cacheMs) : payload;
    } catch (caught) {
      if (caught?.code) {
        lastError = caught;
        const upstreamStatus = Number(caught.upstreamStatus || 0);
        const explicitlyRetryable = upstreamStatus
          ? RETRYABLE.has(upstreamStatus) || (upstreamStatus === 429 && Number(caught.retryAfterMs) > 0)
          : [502, 503, 504].includes(Number(caught.status));
        if (attempt >= retries || !explicitlyRetryable) throw caught;
      } else if (caught?.name === "AbortError") {
        if (signal?.aborted) throw error("Permintaan dibatalkan.", "COMIC_ABORTED", 499);
        lastError = error(`${provider} melewati batas waktu.`, "COMIC_TIMEOUT", 504);
        if (attempt >= retries) throw lastError;
      } else {
        lastError = error(`${provider} gagal dihubungi.`, "COMIC_UPSTREAM_FAILED", 502);
        if (attempt >= retries) throw lastError;
      }
      await sleep(Math.min(1_600, 250 * (2 ** attempt)), signal);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
    }
  }
  throw lastError || error(`${provider} tidak tersedia.`, "COMIC_SOURCE_FAILED", 502);
}

function clearSourceCache() { responseCache.clear(); }

module.exports = { buildUrl, clearSourceCache, error, positiveInt, requestJson, slug, token };

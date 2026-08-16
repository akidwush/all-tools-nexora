"use strict";

const net = require("node:net");

const IPINFO_LITE_BASE = "https://api.ipinfo.io/lite";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 128;

const cache = new Map();
const inflight = new Map();

function positiveInteger(value, fallback, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), max) : fallback;
}

function safeText(value, maximum = 300) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function token() {
  return safeText(process.env.IPINFO_TOKEN || process.env.IPINFO_API_KEY, 512);
}

function config() {
  return {
    configured: Boolean(token()),
    timeoutMs: positiveInteger(process.env.IPINFO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 20_000),
    cacheMs: positiveInteger(process.env.IPINFO_CACHE_MS, DEFAULT_CACHE_MS, 24 * 60 * 60 * 1000)
  };
}

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function stripMappedIpv4(value) {
  const text = safeText(value, 96).replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(text);
  return mapped ? mapped[1] : text;
}

function normalizedIp(value) {
  const text = stripMappedIpv4(value);
  return net.isIP(text) ? text : "";
}

function headerValues(request, key) {
  return safeText(request.headers?.[key], 512).split(",").map((part) => normalizedIp(part.trim())).filter(Boolean);
}

function requestIp(request) {
  const candidates = [
    ...headerValues(request, "x-forwarded-for"),
    ...headerValues(request, "x-real-ip"),
    normalizedIp(request.socket?.remoteAddress)
  ].filter(Boolean);
  return candidates[0] || "";
}

function normalizePayload(payload, requestedIp) {
  const ip = normalizedIp(payload?.ip || requestedIp);
  const bogon = payload?.bogon === true;
  return {
    ip: ip || safeText(payload?.ip || requestedIp, 96),
    version: ip ? `IPv${net.isIP(ip)}` : null,
    bogon,
    asn: safeText(payload?.asn, 48) || null,
    asName: safeText(payload?.as_name, 180) || null,
    asDomain: safeText(payload?.as_domain, 180) || null,
    countryCode: safeText(payload?.country_code, 8).toUpperCase() || null,
    country: safeText(payload?.country, 120) || null,
    continentCode: safeText(payload?.continent_code, 8).toUpperCase() || null,
    continent: safeText(payload?.continent, 120) || null,
    routable: !bogon,
    provider: "IPinfo Lite"
  };
}

function pruneCache() {
  const now = Date.now();
  for (const [key, row] of cache) if (!row || row.expiresAt <= now) cache.delete(key);
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

async function fetchJson(ip, runtimeConfig) {
  pruneCache();
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };
  if (inflight.has(ip)) return inflight.get(ip);

  const run = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), runtimeConfig.timeoutMs);
    try {
      const response = await fetch(`${IPINFO_LITE_BASE}/${encodeURIComponent(ip)}`, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token()}`,
          "User-Agent": "All-Tools-Nexora-IP-Intelligence/1.0"
        }
      });
      const raw = await response.text();
      let payload = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }

      if (!response.ok) {
        const error = new Error(safeText(payload?.error?.message || payload?.error || payload?.message || `IPinfo HTTP ${response.status}`, 240));
        error.code = response.status === 401 || response.status === 403 || response.status === 406 ? "IPINFO_AUTH_FAILED" : response.status === 429 ? "IPINFO_RATE_LIMITED" : "IPINFO_UPSTREAM_ERROR";
        error.status = response.status;
        throw error;
      }

      const value = normalizePayload(payload, ip);
      cache.set(ip, { value, expiresAt: Date.now() + runtimeConfig.cacheMs });
      return { ...value, cached: false };
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("IPinfo tidak merespons sebelum batas waktu.");
        timeoutError.code = "IPINFO_TIMEOUT";
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })();

  inflight.set(ip, run);
  try { return await run; }
  finally { inflight.delete(ip); }
}

function errorStatus(error) {
  if (error?.status && Number.isFinite(Number(error.status))) {
    const status = Number(error.status);
    if (status >= 400 && status <= 599) return status;
  }
  return error?.code === "IPINFO_TIMEOUT" ? 504 : 502;
}

async function handleIpIntelligence(request, response, url) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    return response.status(204).end();
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const runtimeConfig = config();
  if (url.searchParams.get("health") === "1") {
    const payload = {
      ok: runtimeConfig.configured,
      service: "ip-intelligence-ipinfo-lite",
      provider: "IPinfo Lite",
      configured: runtimeConfig.configured,
      tokenConfigured: runtimeConfig.configured,
      supports: ["ipv4", "ipv6", "country", "continent", "asn", "organization", "domain", "bogon"],
      cacheMs: runtimeConfig.cacheMs
    };
    if (request.method === "HEAD") return response.status(payload.ok ? 200 : 503).end();
    return send(response, payload.ok ? 200 : 503, payload);
  }

  if (!runtimeConfig.configured) {
    return send(response, 503, {
      ok: false,
      error: "IPINFO_TOKEN_NOT_CONFIGURED",
      message: "Tambahkan IPINFO_TOKEN di Environment Variables Vercel lalu redeploy."
    });
  }

  let ip = normalizedIp(url.searchParams.get("ip"));
  const self = url.searchParams.get("self") === "1";
  if (!ip && self) ip = requestIp(request);
  if (!ip) {
    return send(response, 400, {
      ok: false,
      error: self ? "CLIENT_IP_UNAVAILABLE" : "INVALID_IP",
      message: self ? "IP publik pengunjung tidak tersedia pada request ini." : "Masukkan alamat IPv4 atau IPv6 yang valid."
    });
  }

  try {
    const data = await fetchJson(ip, runtimeConfig);
    if (request.method === "HEAD") return response.status(200).end();
    return send(response, 200, { ok: true, data, meta: { provider: "IPinfo Lite", cached: Boolean(data.cached) } });
  } catch (error) {
    return send(response, errorStatus(error), {
      ok: false,
      error: safeText(error?.code || "IPINFO_LOOKUP_FAILED", 80),
      message: safeText(error?.message || "Lookup IP gagal.", 240)
    });
  }
}

module.exports = {
  handleIpIntelligence,
  normalizePayload,
  normalizedIp,
  requestIp,
  config
};

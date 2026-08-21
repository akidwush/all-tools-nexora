"use strict";

const DEFAULT_BASE_URL = "https://api.kyzznekoo.my.id";
const DEFAULT_TIMEOUT_MS = 20000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const rateBuckets = new Map();

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function cleanText(value, maxLength = 4096) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Email Alight Motion tidak valid."), { status: 400, code: "INVALID_EMAIL" });
  }
  return email;
}

function normalizeMagicLink(value) {
  const link = cleanText(value, 4096);
  if (!link) throw Object.assign(new Error("Magic link wajib diisi."), { status: 400, code: "EMPTY_MAGIC_LINK" });
  if (/\s/.test(link)) throw Object.assign(new Error("Magic link tidak valid."), { status: 400, code: "INVALID_MAGIC_LINK" });
  return link;
}

function getConfig() {
  const baseUrl = cleanText(process.env.ALIGHT_PREMIUM_API_BASE_URL || DEFAULT_BASE_URL, 500).replace(/\/+$/, "");
  if (!/^https:\/\//i.test(baseUrl) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(baseUrl)) {
    throw Object.assign(new Error("ALIGHT_PREMIUM_API_BASE_URL harus HTTPS."), { status: 500, code: "INVALID_ALIGHT_BASE_URL" });
  }
  return {
    baseUrl,
    timeoutMs: Math.max(3000, Math.min(60000, Number(process.env.ALIGHT_PREMIUM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)),
    magicLinkPath: cleanText(process.env.ALIGHT_PREMIUM_MAGIC_LINK_PATH || "/api/alightmotion/v1/magic-link", 200),
    applyPremiumPath: cleanText(process.env.ALIGHT_PREMIUM_APPLY_PATH || "/api/alightmotion/v1/applyPremium", 200)
  };
}

function clientIp(request) {
  return cleanText(String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown").split(",")[0], 100) || "unknown";
}

function enforceRateLimit(request) {
  const now = Date.now();
  const key = clientIp(request);
  const previous = rateBuckets.get(key);
  if (!previous || now - previous.startedAt >= WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  previous.count += 1;
  if (previous.count > MAX_REQUESTS_PER_WINDOW) {
    throw Object.assign(new Error("Terlalu banyak request. Coba lagi sebentar."), { status: 429, code: "RATE_LIMITED" });
  }
  if (rateBuckets.size > 500) {
    for (const [bucketKey, bucket] of rateBuckets) if (now - bucket.startedAt >= WINDOW_MS) rateBuckets.delete(bucketKey);
  }
}

function redactPayload(value, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactPayload(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" ? cleanText(value, 4000) : value;
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    if (/(?:api.?key|authorization|password|secret|access.?token|refresh.?token)/i.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = redactPayload(item, depth + 1);
  }
  return output;
}

function providerMessage(data, fallback) {
  const candidates = [data?.message, data?.msg, data?.status, data?.result?.message, data?.data?.message, data?.error?.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return cleanText(candidate, 800);
  }
  return fallback;
}

async function callProvider({ action, email, link, config }) {
  const path = action === "magic-link" ? config.magicLinkPath : config.applyPremiumPath;
  const url = new URL(path.startsWith("/") ? config.baseUrl + path : config.baseUrl + "/" + path);
  url.searchParams.set("email", email);
  if (action === "apply-premium") url.searchParams.set("link", link);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "All-Tools-Nexora-Alight/1.1"
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal
    });
    const text = await upstream.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { data = { message: cleanText(text, 4000) }; }

    if (!upstream.ok) {
      const message = providerMessage(data, `Provider mengembalikan HTTP ${upstream.status}.`);
      const error = new Error(message);
      error.status = upstream.status === 429 ? 429 : 502;
      error.code = upstream.status === 429 ? "PROVIDER_RATE_LIMITED" : `ALIGHT_PROVIDER_${upstream.status}`;
      throw error;
    }

    return {
      providerStatus: upstream.status,
      message: providerMessage(data, action === "magic-link" ? "Magic link berhasil diminta." : "Premium berhasil diproses."),
      data: redactPayload(data)
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("Provider Alight Motion timeout."), { status: 504, code: "ALIGHT_PROVIDER_TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function handleAlightPremium(request, response) {
  if (request.method === "GET" || request.method === "HEAD") {
    try {
      getConfig();
      const payload = {
        ok: true,
        service: "alight-motion-premium",
        configured: true,
        authRequired: false,
        upstreamMethod: "GET",
        actions: ["magic-link", "apply-premium"]
      };
      if (request.method === "HEAD") return response.status(200).end();
      return send(response, 200, payload);
    } catch (error) {
      if (request.method === "HEAD") return response.status(Number(error?.status) || 500).end();
      return send(response, Number(error?.status) || 500, { ok: false, error: error?.code || "ALIGHT_CONFIG_FAILED", message: error?.message || "Konfigurasi Alight Premium tidak valid." });
    }
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    enforceRateLimit(request);
    const config = getConfig();
    const action = cleanText(request.body?.action, 40).toLowerCase();
    if (!["magic-link", "apply-premium"].includes(action)) {
      throw Object.assign(new Error("Action tidak dikenal."), { status: 400, code: "INVALID_ACTION" });
    }
    const email = normalizeEmail(request.body?.email);
    const link = action === "apply-premium" ? normalizeMagicLink(request.body?.link) : "";
    const result = await callProvider({ action, email, link, config });
    return send(response, 200, { ok: true, action, message: result.message, providerStatus: result.providerStatus, data: result.data });
  } catch (error) {
    console.error("[alight-premium]", error?.code || error?.message || error);
    return send(response, Number(error?.status) || 500, {
      ok: false,
      error: error?.code || "ALIGHT_PREMIUM_FAILED",
      message: error?.message || "Request Alight Motion Premium gagal."
    });
  }
}

module.exports = {
  handleAlightPremium,
  normalizeEmail,
  normalizeMagicLink,
  redactPayload,
  getConfig
};

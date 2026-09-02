"use strict";

const https = require("node:https");
const { sendJson: send } = require("./http-response");
const { takeFixedWindow } = require("./memory-store");

const DEFAULT_BASE_URL = "https://api.kyzznekoo.my.id";
const MAX_MAGIC_LINK_LENGTH = 8192;
const MAX_RESPONSE_BYTES = 256 * 1024;
const requestBuckets = new Map();

function clientIp(request) {
  return (String(request.headers?.["x-forwarded-for"] || "").split(",")[0].trim()
    || request.socket?.remoteAddress
    || "unknown").slice(0, 80);
}

function cleanText(value, maxLength = 4096) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  const email = String(value || "").trim();
  const separator = email.lastIndexOf("@");
  const local = separator > 0 ? email.slice(0, separator) : "";
  const domain = separator > 0 ? email.slice(separator + 1).toLowerCase() : "";
  const validLocal = local.length > 0 && local.length <= 64 && !/^\.|\.$|\.\./.test(local) && /^[^\s@\u0000-\u001f\u007f]+$/.test(local);
  const validDomain = /^(?=.{1,189}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(domain);
  if (email.length > 254 || separator !== email.indexOf("@") || !validLocal || !validDomain) {
    throw Object.assign(new Error("Masukkan alamat email yang valid."), { status: 400, code: "INVALID_EMAIL" });
  }
  return `${local}@${domain}`;
}

function normalizeMagicLink(value) {
  const raw = String(value || "").trim();
  if (!raw) throw Object.assign(new Error("Magic link wajib diisi."), { status: 400, code: "EMPTY_MAGIC_LINK" });
  if (raw.length > MAX_MAGIC_LINK_LENGTH) throw Object.assign(new Error("Magic link terlalu panjang."), { status: 400, code: "MAGIC_LINK_TOO_LONG" });
  if (/[\u0000-\u0020\u007f]/.test(raw)) throw Object.assign(new Error("Magic link mengandung karakter yang tidak valid."), { status: 400, code: "INVALID_MAGIC_LINK" });
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw Object.assign(new Error("Magic link tidak valid."), { status: 400, code: "INVALID_MAGIC_LINK" }); }
  if (parsed.protocol !== "https:") throw Object.assign(new Error("Magic link harus menggunakan HTTPS."), { status: 400, code: "INVALID_MAGIC_LINK_PROTOCOL" });
  return raw;
}

function getConfig() {
  const baseUrl = cleanText(process.env.ALIGHT_PREMIUM_API_BASE_URL || DEFAULT_BASE_URL, 500).replace(/\/+$/, "");
  if (!/^https:\/\//i.test(baseUrl)) {
    throw Object.assign(new Error("ALIGHT_PREMIUM_API_BASE_URL harus HTTPS."), { status: 500, code: "INVALID_ALIGHT_BASE_URL" });
  }
  return {
    baseUrl,
    magicLinkPath: cleanText(process.env.ALIGHT_PREMIUM_MAGIC_LINK_PATH || "/api/alightmotion/v1/magic-link", 200),
    applyPremiumPath: cleanText(process.env.ALIGHT_PREMIUM_APPLY_PATH || "/api/alightmotion/v1/applyPremium", 200)
  };
}

function providerMessage(data, fallback) {
  const candidates = [data?.message, data?.msg, data?.data?.message, data?.result?.message, data?.error?.message];
  for (const candidate of candidates) if (typeof candidate === "string" && candidate.trim()) return cleanText(candidate, 800);
  return fallback;
}

function providerRejected(data) {
  return data?.status === false || data?.ok === false || data?.success === false;
}

function requestHttps(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(Object.assign(new Error("Terlalu banyak redirect provider."), { code: "ALIGHT_PROVIDER_REDIRECT" }));
    const request = https.request(url, {
      method: "GET",
      family: 4,
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; Nexora/6.3; +https://vercel.app)",
        Connection: "close"
      }
    }, (response) => {
      const status = Number(response.statusCode || 0);
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        return resolve(requestHttps(new URL(location, url), redirects + 1));
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(Object.assign(new Error("Respons provider terlalu besar."), { code: "ALIGHT_PROVIDER_RESPONSE_TOO_LARGE" }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => resolve({ status, headers: response.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
}

async function callProvider(action, email, link, config) {
  const path = action === "magic-link" ? config.magicLinkPath : config.applyPremiumPath;
  const url = new URL(path.startsWith("/") ? config.baseUrl + path : config.baseUrl + "/" + path);
  url.searchParams.set("email", email);
  if (action === "apply-premium") url.searchParams.set("link", link);

  const startedAt = Date.now();
  const upstream = await requestHttps(url);
  const durationMs = Date.now() - startedAt;
  let data;
  try { data = upstream.text ? JSON.parse(upstream.text) : {}; }
  catch { data = { message: cleanText(upstream.text, 4000) }; }

  if (upstream.status < 200 || upstream.status >= 300 || providerRejected(data)) {
    const error = new Error(providerMessage(data, `Provider mengembalikan HTTP ${upstream.status}.`));
    error.status = upstream.status === 429 ? 429 : 502;
    error.code = upstream.status === 429 ? "PROVIDER_RATE_LIMITED" : "ALIGHT_PROVIDER_REJECTED";
    error.providerStatus = upstream.status;
    error.durationMs = durationMs;
    error.providerData = data;
    throw error;
  }

  return {
    providerStatus: upstream.status,
    durationMs,
    message: providerMessage(data, action === "magic-link" ? "Magic Link berhasil dikirim." : "Premium berhasil diproses."),
    data
  };
}

async function handleAlightPremium(request, response, requestUrl) {
  if (request.method === "HEAD") return response.status(200).end();
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Gunakan endpoint GET Alight Premium." });
  }

  try {
    const config = getConfig();
    const url = requestUrl instanceof URL ? requestUrl : new URL(request.url || "/api/alight-premium", "http://localhost");
    const action = cleanText(url.searchParams.get("action"), 40).toLowerCase();
    if (!action) {
      return send(response, 200, {
        ok: true,
        service: "alight-motion-premium",
        configured: true,
        authRequired: true,
        productionTransport: "protected-server-route",
        upstreamMethod: "GET",
        actions: ["magic-link", "apply-premium"]
      });
    }
    if (!["magic-link", "apply-premium"].includes(action)) {
      throw Object.assign(new Error("Action tidak dikenal."), { status: 400, code: "INVALID_ACTION" });
    }
    const rate = takeFixedWindow(requestBuckets, clientIp(request), {
      windowMs: 10 * 60_000,
      limit: 8,
      maxEntries: 2_000
    });
    if (!rate.allowed) {
      response.setHeader("Retry-After", String(Math.max(1, rate.retryAfter)));
      return send(response, 429, { ok: false, error: "ALIGHT_RATE_LIMITED", message: "Batas penggunaan sementara tercapai. Coba lagi nanti." });
    }
    const email = normalizeEmail(url.searchParams.get("email"));
    const link = action === "apply-premium" ? normalizeMagicLink(url.searchParams.get("link")) : "";
    const result = await callProvider(action, email, link, config);
    return send(response, 200, {
      ok: true,
      action,
      message: result.message,
      providerStatus: result.providerStatus,
      providerDurationMs: result.durationMs,
      data: result.data
    });
  } catch (error) {
    return send(response, Number(error?.status) || 502, {
      ok: false,
      error: error?.code || "ALIGHT_PREMIUM_FAILED",
      message: error?.message || "Request Alight Motion Premium gagal.",
      providerStatus: error?.providerStatus || null,
      providerDurationMs: Number(error?.durationMs) || null
    });
  }
}

module.exports = { handleAlightPremium, normalizeEmail, normalizeMagicLink, getConfig, providerRejected, requestHttps };

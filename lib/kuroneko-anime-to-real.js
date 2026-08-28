"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { assertCapacity, takeFixedWindow } = require("./memory-store");
const { sendJson: send } = require("./http-response");

const UPSTREAM_URL = "https://sylvatica.my.id/api/ai/animetoreal";
const ALLOWED_QUERY = new Set(["_service", "url"]);
const TIMEOUT_MS = 55_000;
const MAX_INPUT_LENGTH = 4_096;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 6;
const MAX_INFLIGHT = 12;

const inflight = new Map();
const rateBuckets = new Map();

function safeText(value, maximum = 500) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function normalizedKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPrivateIp(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (net.isIPv4(host)) {
    const parts = host.split(".").map(Number);
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
  }
  if (net.isIPv6(host)) {
    const clean = host.replace(/^\[|\]$/g, "");
    return clean === "::" || clean === "::1" || /^f[cd]/i.test(clean) || /^fe[89ab]/i.test(clean);
  }
  return false;
}

function isUnsafeHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return !host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || host === "metadata.google.internal" || isPrivateIp(host);
}

function normalizeInputUrl(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) throw Object.assign(new Error("ANIME_REAL_URL_REQUIRED"), { code: "ANIME_REAL_URL_REQUIRED", status: 400 });
  if (raw.length > MAX_INPUT_LENGTH) throw Object.assign(new Error("ANIME_REAL_URL_TOO_LONG"), { code: "ANIME_REAL_URL_TOO_LONG", status: 400 });
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw Object.assign(new Error("ANIME_REAL_URL_INVALID"), { code: "ANIME_REAL_URL_INVALID", status: 400 }); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) {
    throw Object.assign(new Error("ANIME_REAL_URL_INVALID"), { code: "ANIME_REAL_URL_INVALID", status: 400 });
  }
  parsed.hash = "";
  return parsed.toString();
}

function safeExternalUrl(value, secret = "") {
  const raw = String(value == null ? "" : value).trim();
  if (!raw || raw.length > 8_192 || (secret && raw.includes(secret))) return "";
  let parsed;
  try { parsed = new URL(raw.startsWith("//") ? `https:${raw}` : raw); }
  catch { return ""; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) return "";
  parsed.hash = "";
  return parsed.toString();
}

function firstOwn(object, aliases) {
  if (!isObject(object)) return undefined;
  const values = new Map();
  for (const [key, value] of Object.entries(object)) values.set(normalizedKey(key), value);
  for (const alias of aliases) {
    const value = values.get(normalizedKey(alias));
    if (value != null) return value;
  }
  return undefined;
}

function unwrapPayload(payload) {
  let current = payload;
  const seen = new Set();
  while (isObject(current) && !seen.has(current)) {
    seen.add(current);
    const next = firstOwn(current, ["result", "data", "payload", "response"]);
    if (next == null) break;
    current = next;
  }
  return current;
}

const PRIORITY_KEYS = new Map([
  ["transformedimageurl", 1], ["transformedurl", 2], ["transformedimage", 3],
  ["realisticimageurl", 4], ["realisticurl", 5], ["realisticimage", 6],
  ["generatedimageurl", 7], ["generatedurl", 8], ["generatedimage", 9],
  ["outputimageurl", 10], ["outputurl", 11], ["outputimage", 12], ["output", 13],
  ["resultimageurl", 14], ["resulturl", 15], ["resultimage", 16], ["result", 17],
  ["imageurl", 30], ["image", 31], ["fileurl", 40], ["file", 41],
  ["downloadurl", 50], ["download", 51], ["url", 60], ["link", 61], ["src", 62]
]);
const ENVELOPE_KEYS = new Set(["result", "data", "payload", "response", "output", "outputs", "images", "items"]);
const REJECTED_KEYS = new Set(["input", "inputurl", "source", "sourceurl", "original", "originalurl", "thumbnail", "preview"]);

function collectImageUrls(value, secret, inputUrl, output = [], depth = 0, parentKey = "", seen = new Set()) {
  if (value == null || depth > 8 || output.length >= 40) return output;
  const parent = normalizedKey(parentKey);
  if (typeof value === "string") {
    const priority = PRIORITY_KEYS.get(parent);
    if (depth === 0 || priority != null || ENVELOPE_KEYS.has(parent)) {
      const url = safeExternalUrl(value, secret);
      if (url && url !== inputUrl) output.push({ url, priority: priority ?? 80, depth });
    }
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, secret, inputUrl, output, depth + 1, parentKey || "items", seen));
    return output;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (REJECTED_KEYS.has(normalized)) continue;
    if (typeof item === "string" && PRIORITY_KEYS.has(normalized)) {
      const url = safeExternalUrl(item, secret);
      if (url && url !== inputUrl) output.push({ url, priority: PRIORITY_KEYS.get(normalized), depth });
      continue;
    }
    if (typeof item === "object") collectImageUrls(item, secret, inputUrl, output, depth + 1, key, seen);
  }
  return output;
}

function normalizeAnimeToRealResponse(payload, secret = "", inputUrl = "") {
  const normalizedInput = safeExternalUrl(inputUrl, secret) || inputUrl;
  const unwrapped = unwrapPayload(payload);
  const source = unwrapped == null ? payload : unwrapped;
  const candidates = collectImageUrls(source, secret, normalizedInput).sort((left, right) => left.priority - right.priority || left.depth - right.depth);
  return { imageUrl: candidates[0]?.url || null };
}

function responseShape(payload, secret = "") {
  const typeOf = (value) => Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  const safeKey = (key) => {
    const value = safeText(key, 80);
    return secret && value.includes(secret) ? "[redacted]" : value;
  };
  const rootKeys = isObject(payload) ? Object.keys(payload).slice(0, 20).map(safeKey) : [];
  const unwrapped = unwrapPayload(payload);
  const unwrappedKeys = isObject(unwrapped) ? Object.keys(unwrapped).slice(0, 20).map(safeKey) : [];
  return { rootType: typeOf(payload), rootKeys, unwrappedType: typeOf(unwrapped), unwrappedKeys };
}

function providerError(status, payload) {
  const hint = safeText(payload?.message || payload?.error?.message || payload?.error, 300).toLowerCase();
  const error = new Error("ANIME_REAL_UPSTREAM_FAILED");
  if (status === 429 || /rate|limit|quota|too many/.test(hint)) error.code = "ANIME_REAL_RATE_LIMITED";
  else if ([401, 403].includes(status) || /api.?key|unauthor|forbidden|revoked/.test(hint)) error.code = "ANIME_REAL_CONFIGURATION_ERROR";
  else if (status === 404 || /not found|tidak ditemukan/.test(hint)) error.code = "ANIME_REAL_NOT_FOUND";
  else if ([400, 408, 413, 415, 422].includes(status) || /unsupported|invalid|tidak valid|cannot|gagal|image|gambar/.test(hint)) error.code = "ANIME_REAL_PROVIDER_REJECTED";
  else error.code = "ANIME_REAL_UPSTREAM_ERROR";
  return error;
}

function publicError(error) {
  if (["ANIME_REAL_URL_REQUIRED", "ANIME_REAL_URL_INVALID"].includes(error?.code)) return "URL gambar tidak valid. Gunakan link dengan awalan http:// atau https://.";
  if (error?.code === "ANIME_REAL_URL_TOO_LONG") return "URL gambar terlalu panjang.";
  if (error?.code === "ANIME_REAL_RATE_LIMITED") return "Batas request sementara tercapai. Coba lagi nanti.";
  if (error?.code === "ANIME_REAL_TIMEOUT") return "Proses terlalu lama. Coba lagi sebentar.";
  if (error?.code === "ANIME_REAL_NOT_FOUND") return "Gambar tidak ditemukan atau tidak dapat diakses.";
  if (error?.code === "ANIME_REAL_PROVIDER_REJECTED") return "Gambar tidak dapat diproses. Coba gambar anime lain.";
  if (error?.code === "ANIME_REAL_CONFIGURATION_ERROR") return "Anime to Real belum siap. Hubungi pengelola Nexora.";
  if (error?.code === "ANIME_REAL_EMPTY_RESULT") return "Proses selesai, tetapi gambar hasil belum tersedia.";
  if (error?.code === "ANIME_REAL_INVALID_RESPONSE") return "Server AI mengirim respons yang tidak dapat dibaca. Coba lagi.";
  return "Anime to Real sedang tidak tersedia. Coba lagi nanti.";
}

function statusForError(error) {
  if (Number.isInteger(error?.status)) return error.status;
  if (error?.code === "ANIME_REAL_RATE_LIMITED") return 429;
  if (error?.code === "ANIME_REAL_TIMEOUT") return 504;
  if (error?.code === "ANIME_REAL_NOT_FOUND") return 404;
  if (error?.code === "ANIME_REAL_PROVIDER_REJECTED") return 400;
  if (error?.code === "ANIME_REAL_CONFIGURATION_ERROR") return 503;
  if (error?.code === "ANIME_REAL_EMPTY_RESULT") return 422;
  return 502;
}

function requestKey(request) {
  const forwarded = safeText(request.headers?.["x-forwarded-for"], 200).split(",")[0].trim();
  return forwarded || safeText(request.headers?.["x-real-ip"], 100) || "anonymous";
}

function enforceRateLimit(request) {
  const result = takeFixedWindow(rateBuckets, requestKey(request), {
    windowMs: RATE_WINDOW_MS,
    limit: RATE_LIMIT,
    maxEntries: 2_000
  });
  if (!result.allowed) {
    const error = Object.assign(new Error("ANIME_REAL_RATE_LIMITED"), { code: "ANIME_REAL_RATE_LIMITED" });
    error.retryAfter = result.retryAfter;
    throw error;
  }
}

async function upstreamRequest(inputUrl, runtime = {}) {
  const apiKey = safeText(process.env.KURONEKO_API_KEY, 1_024);
  if (!apiKey) throw Object.assign(new Error("ANIME_REAL_CONFIGURATION_ERROR"), { code: "ANIME_REAL_CONFIGURATION_ERROR" });
  const target = new URL(UPSTREAM_URL);
  target.search = new URLSearchParams({ url: inputUrl, apikey: apiKey }).toString();
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(runtime.timeoutMs) || TIMEOUT_MS, 1), TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = runtime.fetch || fetch;
    const upstream = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "All-Tools-Nexora-AnimeToReal/1.0" }
    });
    const declared = Number(upstream.headers?.get?.("content-length") || 0);
    if (declared > MAX_RESPONSE_BYTES) throw Object.assign(new Error("ANIME_REAL_INVALID_RESPONSE"), { code: "ANIME_REAL_INVALID_RESPONSE" });
    const raw = await upstream.text();
    if (!raw || Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) throw Object.assign(new Error("ANIME_REAL_INVALID_RESPONSE"), { code: "ANIME_REAL_INVALID_RESPONSE" });
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw Object.assign(new Error("ANIME_REAL_INVALID_RESPONSE"), { code: "ANIME_REAL_INVALID_RESPONSE" }); }
    if (!upstream.ok || payload?.status === false || payload?.success === false || payload?.ok === false) throw providerError(upstream.status, payload);
    const normalized = normalizeAnimeToRealResponse(payload, apiKey, inputUrl);
    if (!normalized.imageUrl) {
      console.warn("[anime-to-real] unsupported response schema", responseShape(payload, apiKey));
      throw Object.assign(new Error("ANIME_REAL_EMPTY_RESULT"), { code: "ANIME_REAL_EMPTY_RESULT" });
    }
    return normalized;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("ANIME_REAL_TIMEOUT"), { code: "ANIME_REAL_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function runDeduplicated(inputUrl, runtime) {
  const key = crypto.createHash("sha256").update(inputUrl).digest("hex");
  if (inflight.has(key)) return inflight.get(key);
  assertCapacity(inflight, MAX_INFLIGHT, "ANIME_REAL_BUSY");
  const task = upstreamRequest(inputUrl, runtime).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

async function handleAnimeToReal(request, response, url, runtime = {}) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Anime to Real hanya menerima permintaan GET." });
  }
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY.has(key)) return send(response, 400, { ok: false, error: "UNSUPPORTED_PARAMETER", message: "Permintaan konversi tidak valid." });
  }
  if (url.searchParams.get("_service") !== "anime-to-real") {
    return send(response, 400, { ok: false, error: "INVALID_ROUTE", message: "Permintaan konversi tidak valid." });
  }
  try {
    enforceRateLimit(request);
    const inputUrl = normalizeInputUrl(url.searchParams.get("url"));
    const data = await runDeduplicated(inputUrl, runtime);
    return send(response, 200, { ok: true, data });
  } catch (error) {
    if (error?.retryAfter) response.setHeader("Retry-After", String(error.retryAfter));
    const code = safeText(error?.code || "ANIME_REAL_UPSTREAM_ERROR", 80);
    return send(response, statusForError(error), { ok: false, error: code, message: publicError(error) });
  }
}

function resetAnimeToRealState() {
  inflight.clear();
  rateBuckets.clear();
}

module.exports = {
  UPSTREAM_URL,
  ALLOWED_QUERY,
  handleAnimeToReal,
  normalizeAnimeToRealResponse,
  normalizeInputUrl,
  safeExternalUrl,
  responseShape,
  resetAnimeToRealState
};

"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { assertCapacity, takeFixedWindow } = require("./memory-store");
const { sendJson: send } = require("./http-response");

const UPSTREAM_URL = "https://sylvatica.my.id/api/download/aio";
const ALLOWED_QUERY = new Set(["mode", "url"]);
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_INPUT_LENGTH = 4_096;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const MAX_INFLIGHT = 32;

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

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), maximum) : fallback;
}

function isPrivateIp(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (net.isIPv4(host)) {
    const parts = host.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] >= 224);
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
  if (!raw) throw Object.assign(new Error("INVALID_URL"), { code: "INVALID_URL", status: 400 });
  if (raw.length > MAX_INPUT_LENGTH) throw Object.assign(new Error("URL_TOO_LONG"), { code: "URL_TOO_LONG", status: 400 });
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw Object.assign(new Error("INVALID_URL"), { code: "INVALID_URL", status: 400 }); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) {
    throw Object.assign(new Error("UNSAFE_URL"), { code: "UNSAFE_URL", status: 400 });
  }
  parsed.hash = "";
  return parsed.toString();
}

function safeExternalUrl(value, secret = "", options = {}) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw || raw.length > 8_192 || (secret && raw.includes(secret))) return "";
  let parsed;
  try { parsed = new URL(raw.startsWith("//") ? `https:${raw}` : raw); }
  catch { return ""; }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) return "";
  if (!options.allowHttp && parsed.protocol !== "https:") return "";
  parsed.hash = "";
  return parsed.toString();
}

function walk(value, visit, depth = 0, seen = new Set(), parentKey = "") {
  if (value == null || depth > 8 || (typeof value === "object" && seen.has(value))) return;
  if (typeof value === "object") seen.add(value);
  visit(value, parentKey, depth);
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit, depth + 1, seen, parentKey));
  } else if (isObject(value)) {
    Object.entries(value).forEach(([key, item]) => walk(item, visit, depth + 1, seen, key));
  }
}

function unwrapPayload(payload) {
  let current = payload;
  const seen = new Set();
  while (isObject(current) && !seen.has(current)) {
    seen.add(current);
    const key = Object.keys(current).find((name) => ["result", "data", "payload", "response"].includes(normalizedKey(name)) && current[name] != null);
    if (!key) break;
    current = current[key];
  }
  return current;
}

function firstField(value, aliases, maximum = 500) {
  const keys = new Set(aliases.map(normalizedKey));
  let found = "";
  walk(value, (node) => {
    if (found || !isObject(node)) return;
    for (const [key, item] of Object.entries(node)) {
      if (!keys.has(normalizedKey(key)) || item == null || typeof item === "object") continue;
      const text = safeText(item, maximum);
      if (text) { found = text; break; }
    }
  });
  return found;
}

function firstUrl(value, aliases, secret, options = {}) {
  const keys = new Set(aliases.map(normalizedKey));
  let found = "";
  walk(value, (node) => {
    if (found || !isObject(node)) return;
    for (const [key, item] of Object.entries(node)) {
      if (!keys.has(normalizedKey(key)) || typeof item !== "string") continue;
      const url = safeExternalUrl(item, secret, options);
      if (url) { found = url; break; }
    }
  });
  return found;
}

const URL_KEYS = new Set([
  "url", "link", "download", "downloadurl", "downloadlink", "directurl", "directlink", "mediaurl",
  "videourl", "audiourl", "imageurl", "video", "audio", "image", "playurl", "streamurl", "src", "href"
]);
const CONTAINER_KEYS = new Set([
  "result", "data", "payload", "response", "download", "downloads", "media", "items", "links", "urls",
  "formats", "resources", "videos", "audios", "images", "files", "list"
]);
const PREVIEW_KEYS = new Set(["thumbnail", "thumb", "cover", "poster", "preview", "avatar"]);

function urlFromObject(object, secret) {
  if (!isObject(object)) return "";
  for (const [key, value] of Object.entries(object)) {
    const normalized = normalizedKey(key);
    if (!URL_KEYS.has(normalized) || PREVIEW_KEYS.has(normalized) || typeof value !== "string") continue;
    const url = safeExternalUrl(value, secret, { allowHttp: true });
    if (url) return url;
  }
  return "";
}

function collectCandidates(value, secret, output = [], depth = 0, seen = new Set(), parentKey = "") {
  if (value == null || depth > 8 || output.length >= 100) return output;
  if (typeof value === "string") {
    if (depth === 0 || CONTAINER_KEYS.has(normalizedKey(parentKey)) || URL_KEYS.has(normalizedKey(parentKey))) {
      const url = safeExternalUrl(value, secret, { allowHttp: true });
      if (url) output.push({ url });
    }
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectCandidates(item, secret, output, depth + 1, seen, parentKey || "items"));
    return output;
  }
  const ownUrl = urlFromObject(value, secret);
  if (ownUrl) output.push(value);
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (!CONTAINER_KEYS.has(normalized) && !URL_KEYS.has(normalized)) continue;
    collectCandidates(item, secret, output, depth + 1, seen, key);
  }
  return output;
}

function fieldFromItem(item, aliases, maximum) {
  if (!isObject(item)) return "";
  const keys = new Set(aliases.map(normalizedKey));
  for (const [key, value] of Object.entries(item)) {
    if (!keys.has(normalizedKey(key)) || value == null || typeof value === "object") continue;
    const text = safeText(value, maximum);
    if (text) return text;
  }
  return "";
}

function normalizeItem(item, secret, index) {
  const source = isObject(item) ? item : { url: item?.url || item };
  const url = safeExternalUrl(source.url, secret, { allowHttp: true }) || urlFromObject(source, secret);
  if (!url) return null;
  const output = { id: `media-${index + 1}`, url };
  const fields = {
    label: ["label", "name", "title"],
    quality: ["quality", "resolution", "height"],
    format: ["format", "extension", "ext", "mime", "mimeType"],
    size: ["size", "fileSize", "filesize", "sizeFormatted"],
    type: ["type", "mediaType", "kind"],
    filename: ["filename", "fileName"]
  };
  for (const [name, aliases] of Object.entries(fields)) {
    const value = fieldFromItem(source, aliases, name === "filename" ? 180 : 80);
    if (value) output[name] = value;
  }
  return output;
}

function normalizeAioDownloadResponse(payload, secret = "") {
  const content = unwrapPayload(payload);
  const source = content == null ? payload : content;
  const rawItems = collectCandidates(source, secret);
  const seen = new Set();
  const items = rawItems.map((item, index) => normalizeItem(item, secret, index)).filter((item) => {
    if (!item || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 40);
  const result = { items };
  const title = firstField(source, ["title", "mediaTitle", "name"], 500);
  const author = firstField(source, ["author", "uploader", "username", "channel", "owner"], 320);
  const platform = firstField(source, ["platform", "source", "site", "service"], 100);
  const duration = firstField(source, ["duration", "length"], 100);
  const thumbnail = firstUrl(source, ["thumbnail", "thumbnailUrl", "thumb", "cover", "image", "poster"], secret);
  if (title) result.title = title;
  if (author) result.author = author;
  if (platform) result.platform = platform;
  if (duration) result.duration = duration;
  if (thumbnail) result.thumbnail = thumbnail;
  return result;
}

function providerError(status, payload) {
  const hint = safeText(payload?.message || payload?.error?.message || payload?.error, 300).toLowerCase();
  const error = new Error("AIO_UPSTREAM_FAILED");
  if (status === 429 || /rate|limit|quota|too many/.test(hint)) error.code = "AIO_RATE_LIMITED";
  else if ([401, 403].includes(status) || /api.?key|unauthor|forbidden|revoked/.test(hint)) error.code = "AIO_CONFIGURATION_ERROR";
  else if (status === 404 || /not found|tidak ditemukan/.test(hint)) error.code = "AIO_NOT_FOUND";
  else if ([400, 408, 422].includes(status) || /unsupported|tidak didukung|invalid|gagal|cannot|could not/.test(hint)) error.code = "AIO_PROVIDER_REJECTED";
  else error.code = "AIO_UPSTREAM_ERROR";
  return error;
}

function publicError(error) {
  if (error?.code === "INVALID_URL" || error?.code === "UNSAFE_URL") return "Masukkan URL media yang valid dengan awalan http:// atau https://.";
  if (error?.code === "URL_TOO_LONG") return "URL media terlalu panjang.";
  if (error?.code === "AIO_RATE_LIMITED") return "Batas request sementara tercapai. Coba lagi nanti.";
  if (error?.code === "AIO_TIMEOUT") return "Server downloader terlalu lama merespons. Coba lagi.";
  if (error?.code === "AIO_NOT_FOUND") return "Media tidak ditemukan.";
  if (error?.code === "AIO_PROVIDER_REJECTED") return "Link tidak dapat diproses. Platform atau URL ini mungkin belum didukung.";
  if (error?.code === "AIO_CONFIGURATION_ERROR") return "All In One Downloader belum siap. Hubungi pengelola Nexora.";
  if (error?.code === "AIO_EMPTY_RESULT") return "Media ditemukan, tetapi belum ada link download yang tersedia.";
  if (error?.code === "AIO_INVALID_RESPONSE") return "Server downloader mengirim respons yang tidak dapat dibaca. Coba lagi.";
  return "Server downloader sedang bermasalah. Coba lagi.";
}

function statusForError(error) {
  if (Number.isInteger(error?.status)) return error.status;
  if (error?.code === "AIO_RATE_LIMITED") return 429;
  if (error?.code === "AIO_TIMEOUT") return 504;
  if (error?.code === "AIO_NOT_FOUND") return 404;
  if (error?.code === "AIO_PROVIDER_REJECTED") return 400;
  if (error?.code === "AIO_CONFIGURATION_ERROR") return 503;
  if (error?.code === "AIO_EMPTY_RESULT") return 422;
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
    const error = Object.assign(new Error("AIO_RATE_LIMITED"), { code: "AIO_RATE_LIMITED" });
    error.retryAfter = result.retryAfter;
    throw error;
  }
}

async function upstreamRequest(inputUrl, runtime = {}) {
  const apiKey = safeText(process.env.KURONEKO_API_KEY, 1_024);
  if (!apiKey) throw Object.assign(new Error("AIO_CONFIGURATION_ERROR"), { code: "AIO_CONFIGURATION_ERROR" });
  const target = new URL(UPSTREAM_URL);
  target.search = new URLSearchParams({ url: inputUrl, apikey: apiKey }).toString();
  const controller = new AbortController();
  const timeoutMs = positiveInteger(process.env.KURONEKO_AIO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = runtime.fetch || fetch;
    const upstream = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "All-Tools-Nexora-AIO/1.0" }
    });
    const declared = Number(upstream.headers?.get?.("content-length") || 0);
    if (declared > MAX_RESPONSE_BYTES) throw Object.assign(new Error("AIO_INVALID_RESPONSE"), { code: "AIO_INVALID_RESPONSE" });
    const raw = await upstream.text();
    if (!raw || Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) throw Object.assign(new Error("AIO_INVALID_RESPONSE"), { code: "AIO_INVALID_RESPONSE" });
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw Object.assign(new Error("AIO_INVALID_RESPONSE"), { code: "AIO_INVALID_RESPONSE" }); }
    if (!upstream.ok || payload?.status === false || payload?.success === false || payload?.ok === false) throw providerError(upstream.status, payload);
    const normalized = normalizeAioDownloadResponse(payload, apiKey);
    if (!normalized.items.length) throw Object.assign(new Error("AIO_EMPTY_RESULT"), { code: "AIO_EMPTY_RESULT" });
    return normalized;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("AIO_TIMEOUT"), { code: "AIO_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function runDeduplicated(inputUrl, runtime) {
  const key = crypto.createHash("sha256").update(inputUrl).digest("hex");
  if (inflight.has(key)) return inflight.get(key);
  assertCapacity(inflight, MAX_INFLIGHT, "AIO_BUSY");
  const task = upstreamRequest(inputUrl, runtime).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

async function handleAioDownload(request, response, url, runtime = {}) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Downloader hanya menerima permintaan GET." });
  }
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY.has(key)) return send(response, 400, { ok: false, error: "UNSUPPORTED_PARAMETER", message: "Permintaan downloader tidak valid." });
  }
  try {
    enforceRateLimit(request);
    const inputUrl = normalizeInputUrl(url.searchParams.get("url"));
    const data = await runDeduplicated(inputUrl, runtime);
    return send(response, 200, { ok: true, data, meta: { itemCount: data.items.length } });
  } catch (error) {
    if (error?.retryAfter) response.setHeader("Retry-After", String(error.retryAfter));
    const code = safeText(error?.code || "AIO_UPSTREAM_ERROR", 80);
    return send(response, statusForError(error), { ok: false, error: code, message: publicError(error) });
  }
}

function resetAioState() {
  inflight.clear();
  rateBuckets.clear();
}

module.exports = {
  UPSTREAM_URL,
  ALLOWED_QUERY,
  handleAioDownload,
  normalizeAioDownloadResponse,
  normalizeInputUrl,
  safeExternalUrl,
  resetAioState
};

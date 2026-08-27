"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { assertCapacity, takeFixedWindow } = require("./memory-store");
const { sendJson: send } = require("./http-response");

const UPSTREAM_URL = "https://sylvatica.my.id/api/search/danbooru";
const ALLOWED_QUERY = new Set(["_service", "q", "mode"]);
const ALLOWED_MODES = new Set(["safe", "nsfw"]);
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_QUERY_LENGTH = 200;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RESULTS = 80;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;
const MAX_INFLIGHT = 24;

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

function normalizeQuery(value) {
  const raw = safeText(value, MAX_QUERY_LENGTH + 1).replace(/\s+/g, " ");
  if (!raw) throw Object.assign(new Error("DANBOORU_QUERY_REQUIRED"), { code: "DANBOORU_QUERY_REQUIRED", status: 400 });
  if (raw.length > MAX_QUERY_LENGTH) throw Object.assign(new Error("DANBOORU_QUERY_TOO_LONG"), { code: "DANBOORU_QUERY_TOO_LONG", status: 400 });
  const simplePhrase = /^[\p{L}\p{N}._-]+(?:\s+[\p{L}\p{N}._-]+)+$/u.test(raw);
  return simplePhrase ? raw.replace(/\s+/g, "_") : raw;
}

function normalizeMode(value) {
  const mode = safeText(value || "safe", 20).toLowerCase();
  if (!ALLOWED_MODES.has(mode)) throw Object.assign(new Error("DANBOORU_MODE_INVALID"), { code: "DANBOORU_MODE_INVALID", status: 400 });
  return mode;
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

function safeExternalUrl(value, secret = "") {
  const raw = String(value == null ? "" : value).trim();
  if (!raw || raw.length > 8_192 || (secret && raw.includes(secret))) return "";
  let parsed;
  try { parsed = new URL(raw.startsWith("//") ? `https:${raw}` : raw); }
  catch { return ""; }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !host || host === "localhost" ||
      host.endsWith(".local") || host.endsWith(".internal") || isPrivateIp(host)) return "";
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

const COLLECTION_KEYS = new Set(["posts", "items", "images", "results", "list", "media"]);
const IMAGE_KEYS = ["file_url", "fileUrl", "image_url", "imageUrl", "original_url", "originalUrl", "original", "file", "image", "url"];
const THUMBNAIL_KEYS = ["preview_url", "previewUrl", "thumbnail_url", "thumbnailUrl", "sample_url", "sampleUrl", "thumbnail", "thumb", "preview"];
const SOURCE_KEYS = ["source_url", "sourceUrl", "post_url", "postUrl", "source"];

function hasImageCandidate(object) {
  return IMAGE_KEYS.some((key) => typeof firstOwn(object, [key]) === "string") ||
    THUMBNAIL_KEYS.some((key) => typeof firstOwn(object, [key]) === "string");
}

function collectRecords(value, output = [], depth = 0, seen = new Set()) {
  if (value == null || depth > 7 || output.length >= MAX_RESULTS * 2) return output;
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (isObject(item) && hasImageCandidate(item)) output.push(item);
      else collectRecords(item, output, depth + 1, seen);
    });
    return output;
  }
  if (hasImageCandidate(value)) output.push(value);
  for (const [key, item] of Object.entries(value)) {
    if (COLLECTION_KEYS.has(normalizedKey(key)) || ["result", "data", "payload", "response"].includes(normalizedKey(key))) {
      collectRecords(item, output, depth + 1, seen);
    }
  }
  return output;
}

function fieldUrl(object, aliases, secret) {
  const value = firstOwn(object, aliases);
  return typeof value === "string" ? safeExternalUrl(value, secret) : "";
}

function positiveDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 100_000 ? Math.round(number) : null;
}

function normalizeTags(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\s+/) : [];
  const seen = new Set();
  return values.map((item) => safeText(item, 100)).filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 80);
}

function normalizeRecord(record, secret) {
  const imageUrl = fieldUrl(record, IMAGE_KEYS, secret);
  const thumbnail = fieldUrl(record, THUMBNAIL_KEYS, secret);
  if (!imageUrl && !thumbnail) return null;
  const item = {};
  const id = safeText(firstOwn(record, ["id", "post_id", "postId"]), 120);
  const sourceUrl = fieldUrl(record, SOURCE_KEYS, secret);
  const tags = normalizeTags(firstOwn(record, ["tags", "tag_string", "tagString", "tag_string_general", "tagStringGeneral"]));
  const width = positiveDimension(firstOwn(record, ["width", "image_width", "imageWidth"]));
  const height = positiveDimension(firstOwn(record, ["height", "image_height", "imageHeight"]));
  const rating = safeText(firstOwn(record, ["rating"]), 40);
  if (id) item.id = id;
  if (thumbnail) item.thumbnail = thumbnail;
  if (imageUrl) item.imageUrl = imageUrl;
  if (sourceUrl) item.sourceUrl = sourceUrl;
  if (tags.length) item.tags = tags;
  if (width) item.width = width;
  if (height) item.height = height;
  if (rating) item.rating = rating;
  return item;
}

function hasRecognizedCollection(value, depth = 0, seen = new Set()) {
  if (Array.isArray(value)) return true;
  if (!isObject(value) || depth > 7 || seen.has(value)) return false;
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (COLLECTION_KEYS.has(normalizedKey(key)) && Array.isArray(item)) return true;
    if (["result", "data", "payload", "response"].includes(normalizedKey(key)) && hasRecognizedCollection(item, depth + 1, seen)) return true;
  }
  return false;
}

function normalizeDanbooruResponse(payload, secret = "") {
  const source = unwrapPayload(payload);
  const records = collectRecords(source == null ? payload : source);
  const seen = new Set();
  const items = records.map((record) => normalizeRecord(record, secret)).filter((item) => {
    if (!item) return false;
    const key = item.imageUrl || item.thumbnail;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_RESULTS);
  return { items };
}

function providerError(status, payload) {
  const hint = safeText(payload?.message || payload?.error?.message || payload?.error, 300).toLowerCase();
  const error = new Error("DANBOORU_UPSTREAM_FAILED");
  if (status === 429 || /rate|limit|quota|too many/.test(hint)) error.code = "DANBOORU_RATE_LIMITED";
  else if ([401, 403].includes(status) || /api.?key|unauthor|forbidden|revoked/.test(hint)) error.code = "DANBOORU_CONFIGURATION_ERROR";
  else if (status === 404 || /not found|tidak ditemukan/.test(hint)) error.code = "DANBOORU_NOT_FOUND";
  else if ([400, 408, 422].includes(status) || /invalid|tidak valid|wajib|gagal/.test(hint)) error.code = "DANBOORU_PROVIDER_REJECTED";
  else error.code = "DANBOORU_UPSTREAM_ERROR";
  return error;
}

function publicError(error) {
  if (error?.code === "DANBOORU_QUERY_REQUIRED") return "Masukkan tag atau kata kunci terlebih dahulu.";
  if (error?.code === "DANBOORU_QUERY_TOO_LONG") return "Kata kunci terlalu panjang.";
  if (error?.code === "DANBOORU_MODE_INVALID") return "Mode pencarian tidak valid.";
  if (error?.code === "DANBOORU_RATE_LIMITED") return "Batas request sementara tercapai. Coba lagi nanti.";
  if (error?.code === "DANBOORU_TIMEOUT") return "Danbooru Search terlalu lama merespons. Coba lagi.";
  if (error?.code === "DANBOORU_NOT_FOUND" || error?.code === "DANBOORU_EMPTY_RESULT") return "Tidak ada gambar yang ditemukan.";
  if (error?.code === "DANBOORU_PROVIDER_REJECTED") return "Pencarian tidak dapat diproses. Periksa tag lalu coba lagi.";
  if (error?.code === "DANBOORU_CONFIGURATION_ERROR") return "Danbooru Search belum siap. Hubungi pengelola Nexora.";
  if (error?.code === "DANBOORU_INVALID_RESPONSE") return "Danbooru Search mengirim respons yang tidak dapat dibaca. Coba lagi.";
  return "Danbooru Search sedang tidak tersedia. Coba lagi nanti.";
}

function statusForError(error) {
  if (Number.isInteger(error?.status)) return error.status;
  if (error?.code === "DANBOORU_RATE_LIMITED") return 429;
  if (error?.code === "DANBOORU_TIMEOUT") return 504;
  if (error?.code === "DANBOORU_NOT_FOUND") return 404;
  if (error?.code === "DANBOORU_PROVIDER_REJECTED") return 400;
  if (error?.code === "DANBOORU_CONFIGURATION_ERROR") return 503;
  if (error?.code === "DANBOORU_EMPTY_RESULT") return 422;
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
    const error = Object.assign(new Error("DANBOORU_RATE_LIMITED"), { code: "DANBOORU_RATE_LIMITED" });
    error.retryAfter = result.retryAfter;
    throw error;
  }
}

async function upstreamRequest(query, mode, runtime = {}) {
  const apiKey = safeText(process.env.KURONEKO_API_KEY, 1_024);
  if (!apiKey) throw Object.assign(new Error("DANBOORU_CONFIGURATION_ERROR"), { code: "DANBOORU_CONFIGURATION_ERROR" });
  const target = new URL(UPSTREAM_URL);
  target.search = new URLSearchParams({ q: query, mode, apikey: apiKey }).toString();
  const controller = new AbortController();
  const configured = positiveInteger(process.env.KURONEKO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const timeoutMs = runtime.timeoutMs || Math.max(15_000, configured);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = runtime.fetch || fetch;
    const upstream = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "All-Tools-Nexora-Danbooru/1.0" }
    });
    const declared = Number(upstream.headers?.get?.("content-length") || 0);
    if (declared > MAX_RESPONSE_BYTES) throw Object.assign(new Error("DANBOORU_INVALID_RESPONSE"), { code: "DANBOORU_INVALID_RESPONSE" });
    const raw = await upstream.text();
    if (!raw || Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) throw Object.assign(new Error("DANBOORU_INVALID_RESPONSE"), { code: "DANBOORU_INVALID_RESPONSE" });
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw Object.assign(new Error("DANBOORU_INVALID_RESPONSE"), { code: "DANBOORU_INVALID_RESPONSE" }); }
    if (!upstream.ok || payload?.status === false || payload?.success === false || payload?.ok === false) throw providerError(upstream.status, payload);
    const normalized = normalizeDanbooruResponse(payload, apiKey);
    if (!normalized.items.length && !hasRecognizedCollection(payload)) {
      throw Object.assign(new Error("DANBOORU_EMPTY_RESULT"), { code: "DANBOORU_EMPTY_RESULT" });
    }
    return normalized;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("DANBOORU_TIMEOUT"), { code: "DANBOORU_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function runDeduplicated(query, mode, runtime) {
  const key = crypto.createHash("sha256").update(`${mode}\n${query}`).digest("hex");
  if (inflight.has(key)) return inflight.get(key);
  assertCapacity(inflight, MAX_INFLIGHT, "DANBOORU_BUSY");
  const task = upstreamRequest(query, mode, runtime).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

async function handleDanbooruSearch(request, response, url, runtime = {}) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Pencarian hanya menerima permintaan GET." });
  }
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY.has(key)) return send(response, 400, { ok: false, error: "UNSUPPORTED_PARAMETER", message: "Permintaan pencarian tidak valid." });
  }
  if (url.searchParams.get("_service") !== "danbooru-search") {
    return send(response, 400, { ok: false, error: "INVALID_ROUTE", message: "Permintaan pencarian tidak valid." });
  }
  try {
    enforceRateLimit(request);
    const query = normalizeQuery(url.searchParams.get("q"));
    const mode = normalizeMode(url.searchParams.get("mode"));
    const data = await runDeduplicated(query, mode, runtime);
    return send(response, 200, { ok: true, data, meta: { query, mode, itemCount: data.items.length } });
  } catch (error) {
    if (error?.retryAfter) response.setHeader("Retry-After", String(error.retryAfter));
    const code = safeText(error?.code || "DANBOORU_UPSTREAM_ERROR", 80);
    return send(response, statusForError(error), { ok: false, error: code, message: publicError(error) });
  }
}

function resetDanbooruState() {
  inflight.clear();
  rateBuckets.clear();
}

module.exports = {
  UPSTREAM_URL,
  ALLOWED_QUERY,
  ALLOWED_MODES,
  handleDanbooruSearch,
  normalizeDanbooruResponse,
  normalizeQuery,
  safeExternalUrl,
  resetDanbooruState
};

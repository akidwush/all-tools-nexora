"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { assertCapacity, takeFixedWindow } = require("./memory-store");
const { sendJson: send } = require("./http-response");
const { decodeUploadImage, uploadTemporaryImage } = require("./kuroneko-anime-to-real");

const UPSTREAM_URL = "https://sylvatica.my.id/api/tools/hd4";
const ALLOWED_QUERY = new Set(["_service", "url"]);
const TIMEOUT_MS = 55_000;
const MAX_INPUT_LENGTH = 4_096;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
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

function inputError(code) {
  return Object.assign(new Error(code), { code, status: 400 });
}

function normalizeInputUrl(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) throw inputError("HD4_URL_REQUIRED");
  if (raw.length > MAX_INPUT_LENGTH) throw inputError("HD4_URL_TOO_LONG");
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw inputError("HD4_URL_INVALID"); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) {
    throw inputError("HD4_URL_INVALID");
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
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) return "";
  parsed.hash = "";
  return parsed.toString();
}

const URL_PRIORITIES = new Map([
  ["enhancedimageurl", 1], ["enhancedurl", 2], ["enhancedimage", 3],
  ["upscaledimageurl", 4], ["upscaledurl", 5], ["upscaledimage", 6],
  ["outputimageurl", 8], ["outputurl", 9], ["outputimage", 10], ["output", 11],
  ["resultimageurl", 12], ["resulturl", 13], ["resultimage", 14], ["result", 15],
  ["imageurl", 20], ["image", 21], ["fileurl", 30], ["downloadurl", 40],
  ["download", 41], ["url", 50], ["link", 51], ["src", 52], ["data", 60]
]);
const ENVELOPE_KEYS = new Set(["result", "data", "payload", "response", "output", "images", "items"]);
const REJECTED_KEYS = new Set(["input", "inputurl", "source", "sourceurl", "original", "originalurl", "thumbnail", "preview"]);

function collectImageUrls(value, secret, inputUrl, output = [], depth = 0, parentKey = "", seen = new Set()) {
  if (value == null || depth > 8 || output.length >= 40) return output;
  const parent = normalizedKey(parentKey);
  if (typeof value === "string") {
    const priority = URL_PRIORITIES.get(parent);
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
    if (typeof item === "string" && URL_PRIORITIES.has(normalized)) {
      const url = safeExternalUrl(item, secret);
      if (url && url !== inputUrl) output.push({ url, priority: URL_PRIORITIES.get(normalized), depth });
    } else if (typeof item === "object") {
      collectImageUrls(item, secret, inputUrl, output, depth + 1, key, seen);
    }
  }
  return output;
}

function normalizeHD4Response(payload, secret = "", inputUrl = "") {
  const normalizedInput = safeExternalUrl(inputUrl, secret) || inputUrl;
  const candidates = collectImageUrls(payload, secret, normalizedInput)
    .sort((left, right) => left.priority - right.priority || left.depth - right.depth);
  return { imageUrl: candidates[0]?.url || null };
}

function responseShape(payload, secret = "") {
  const typeOf = (value) => Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  const safeKey = (key) => {
    const value = safeText(key, 80);
    return secret && value.includes(secret) ? "[redacted]" : value;
  };
  return {
    rootType: typeOf(payload),
    rootKeys: isObject(payload) ? Object.keys(payload).slice(0, 20).map(safeKey) : []
  };
}

function providerError(status, payload) {
  const hint = safeText(payload?.message || payload?.error?.message || payload?.error, 300).toLowerCase();
  const error = new Error("HD4_UPSTREAM_FAILED");
  if (status === 429 || /rate|limit|quota|too many/.test(hint)) error.code = "HD4_RATE_LIMITED";
  else if ([401, 403].includes(status) || /api.?key|unauthor|forbidden|revoked/.test(hint)) error.code = "HD4_CONFIGURATION_ERROR";
  else if (status === 404 || /not found|tidak ditemukan/.test(hint)) error.code = "HD4_NOT_FOUND";
  else if ([400, 408, 413, 415, 422].includes(status) || /unsupported|invalid|tidak valid|cannot|gagal|image|gambar/.test(hint)) error.code = "HD4_PROVIDER_REJECTED";
  else error.code = "HD4_UPSTREAM_ERROR";
  return error;
}

function publicError(error) {
  if (error?.code === "HD4_URL_REQUIRED") return "Masukkan URL gambar terlebih dahulu.";
  if (error?.code === "HD4_URL_INVALID") return "URL gambar tidak valid.";
  if (error?.code === "HD4_URL_TOO_LONG") return "URL gambar terlalu panjang.";
  if (error?.code === "HD4_UPLOAD_REQUIRED") return "Pilih gambar terlebih dahulu.";
  if (error?.code === "HD4_UPLOAD_TOO_LARGE") return "Ukuran gambar terlalu besar. Pilih gambar lain.";
  if (error?.code === "HD4_UPLOAD_INVALID") return "File harus berupa gambar JPG, PNG, atau WebP yang valid.";
  if (error?.code === "HD4_UPLOAD_TIMEOUT") return "Upload gambar terlalu lama. Periksa koneksi lalu coba lagi.";
  if (error?.code === "HD4_UPLOAD_FAILED") return "Gambar gagal disiapkan untuk enhancer. Coba lagi.";
  if (error?.code === "HD4_BUSY") return "Server enhancer sedang sibuk. Coba lagi sebentar.";
  if (error?.code === "HD4_RATE_LIMITED") return "Batas request sementara tercapai.";
  if (error?.code === "HD4_TIMEOUT") return "Proses enhancement terlalu lama. Coba lagi.";
  if (error?.code === "HD4_NOT_FOUND") return "Gambar tidak ditemukan atau tidak dapat diakses.";
  if (error?.code === "HD4_PROVIDER_REJECTED") return "Gambar tidak dapat diproses.";
  if (error?.code === "HD4_CONFIGURATION_ERROR") return "Image HD Enhancer belum siap. Hubungi pengelola Nexora.";
  if (error?.code === "HD4_EMPTY_RESULT") return "Proses selesai, tetapi gambar hasil belum tersedia.";
  if (error?.code === "HD4_RESPONSE_TOO_LARGE") return "Ukuran hasil gambar terlalu besar untuk diproses.";
  if (error?.code === "HD4_INVALID_RESPONSE") return "Server enhancer mengirim respons yang tidak dapat dibaca.";
  return "Image HD Enhancer sedang tidak tersedia.";
}

function statusForError(error) {
  if (Number.isInteger(error?.status)) return error.status;
  if (error?.code === "HD4_RATE_LIMITED") return 429;
  if (error?.code === "HD4_UPLOAD_TOO_LARGE") return 413;
  if (error?.code === "HD4_UPLOAD_INVALID") return 415;
  if (error?.code === "HD4_UPLOAD_TIMEOUT") return 504;
  if (error?.code === "HD4_TIMEOUT") return 504;
  if (error?.code === "HD4_NOT_FOUND") return 404;
  if (error?.code === "HD4_PROVIDER_REJECTED") return 400;
  if (error?.code === "HD4_CONFIGURATION_ERROR") return 503;
  if (error?.code === "HD4_EMPTY_RESULT") return 422;
  if (error?.code === "HD4_RESPONSE_TOO_LARGE") return 502;
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
    const error = Object.assign(new Error("HD4_RATE_LIMITED"), { code: "HD4_RATE_LIMITED" });
    error.retryAfter = result.retryAfter;
    throw error;
  }
}

function sniffImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return "";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "image/gif";
  return "";
}

async function readLimitedBuffer(upstream, maximum) {
  const declared = Number(upstream.headers?.get?.("content-length") || 0);
  if (declared > maximum) throw Object.assign(new Error("HD4_RESPONSE_TOO_LARGE"), { code: "HD4_RESPONSE_TOO_LARGE" });
  const buffer = Buffer.from(await upstream.arrayBuffer());
  if (!buffer.length) throw Object.assign(new Error("HD4_INVALID_RESPONSE"), { code: "HD4_INVALID_RESPONSE" });
  if (buffer.length > maximum) throw Object.assign(new Error("HD4_RESPONSE_TOO_LARGE"), { code: "HD4_RESPONSE_TOO_LARGE" });
  return buffer;
}

async function upstreamRequest(inputUrl, runtime = {}) {
  const apiKey = safeText(process.env.KURONEKO_API_KEY, 1_024);
  if (!apiKey) throw Object.assign(new Error("HD4_CONFIGURATION_ERROR"), { code: "HD4_CONFIGURATION_ERROR" });
  const target = new URL(UPSTREAM_URL);
  target.search = new URLSearchParams({ url: inputUrl, apikey: apiKey }).toString();
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(runtime.timeoutMs) || TIMEOUT_MS, 1), TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const fetchImpl = runtime.fetch || fetch;
    const upstream = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,application/json;q=0.9,*/*;q=0.5", "User-Agent": "All-Tools-Nexora-HD4/1.0" }
    });
    const location = upstream.headers?.get?.("location") || "";
    if (upstream.status >= 300 && upstream.status < 400 && location) {
      const imageUrl = safeExternalUrl(new URL(location, UPSTREAM_URL).toString(), apiKey);
      if (!imageUrl) throw Object.assign(new Error("HD4_INVALID_RESPONSE"), { code: "HD4_INVALID_RESPONSE" });
      console.info("[hd4] request completed", { status: upstream.status, resultType: "redirect", durationMs: Date.now() - startedAt });
      return { kind: "json", data: { imageUrl } };
    }

    const contentType = String(upstream.headers?.get?.("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (upstream.ok && /^image\/(?:avif|gif|jpe?g|png|webp)$/.test(contentType)) {
      const buffer = await readLimitedBuffer(upstream, MAX_IMAGE_BYTES);
      const safeContentType = contentType === "image/jpg" ? "image/jpeg" : contentType;
      console.info("[hd4] request completed", { status: upstream.status, resultType: "image", contentType: safeContentType, bytes: buffer.length, durationMs: Date.now() - startedAt });
      return { kind: "image", contentType: safeContentType, buffer };
    }
    if (upstream.ok && contentType === "application/octet-stream") {
      const buffer = await readLimitedBuffer(upstream, MAX_IMAGE_BYTES);
      const detectedType = sniffImageMime(buffer);
      if (!detectedType) throw Object.assign(new Error("HD4_INVALID_RESPONSE"), { code: "HD4_INVALID_RESPONSE" });
      console.info("[hd4] request completed", { status: upstream.status, resultType: "binary-image", contentType: detectedType, bytes: buffer.length, durationMs: Date.now() - startedAt });
      return { kind: "image", contentType: detectedType, buffer };
    }

    const rawBuffer = await readLimitedBuffer(upstream, MAX_JSON_BYTES);
    const raw = rawBuffer.toString("utf8").trim();
    let payload;
    try { payload = JSON.parse(raw); }
    catch {
      const direct = safeExternalUrl(raw, apiKey);
      if (upstream.ok && direct) return { kind: "json", data: { imageUrl: direct } };
      throw Object.assign(new Error("HD4_INVALID_RESPONSE"), { code: "HD4_INVALID_RESPONSE" });
    }
    if (!upstream.ok || payload?.status === false || payload?.success === false || payload?.ok === false) {
      const rejection = providerError(upstream.status, payload);
      console.warn("[hd4] upstream rejected request", { status: upstream.status, category: rejection.code, durationMs: Date.now() - startedAt, shape: responseShape(payload, apiKey) });
      throw rejection;
    }
    const data = normalizeHD4Response(payload, apiKey, inputUrl);
    if (!data.imageUrl) {
      console.warn("[hd4] unsupported response schema", responseShape(payload, apiKey));
      throw Object.assign(new Error("HD4_EMPTY_RESULT"), { code: "HD4_EMPTY_RESULT" });
    }
    console.info("[hd4] request completed", { status: upstream.status, resultType: "json-url", durationMs: Date.now() - startedAt });
    return { kind: "json", data };
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("HD4_TIMEOUT"), { code: "HD4_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function runDeduplicated(inputUrl, runtime) {
  const key = crypto.createHash("sha256").update(inputUrl).digest("hex");
  if (inflight.has(key)) return inflight.get(key);
  assertCapacity(inflight, MAX_INFLIGHT, "HD4_BUSY");
  const task = upstreamRequest(inputUrl, runtime).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

function mapUploadError(error) {
  const mapping = {
    ANIME_REAL_UPLOAD_REQUIRED: "HD4_UPLOAD_REQUIRED",
    ANIME_REAL_UPLOAD_TOO_LARGE: "HD4_UPLOAD_TOO_LARGE",
    ANIME_REAL_UPLOAD_INVALID: "HD4_UPLOAD_INVALID",
    ANIME_REAL_UPLOAD_TIMEOUT: "HD4_UPLOAD_TIMEOUT",
    ANIME_REAL_UPLOAD_FAILED: "HD4_UPLOAD_FAILED"
  };
  const code = mapping[error?.code] || "HD4_UPLOAD_FAILED";
  return Object.assign(new Error(code), { code, status: Number.isInteger(error?.status) ? error.status : undefined });
}

function decodeHD4Upload(body) {
  try {
    return decodeUploadImage(body);
  } catch (error) {
    throw mapUploadError(error);
  }
}

function runUploadedDeduplicated(image, runtime = {}) {
  const key = "upload:" + crypto.createHash("sha256").update(image.buffer).digest("hex");
  if (inflight.has(key)) return inflight.get(key);
  assertCapacity(inflight, MAX_INFLIGHT, "HD4_BUSY");
  const uploadRuntime = { ...runtime, fetch: runtime.uploadFetch || runtime.fetch };
  const task = uploadTemporaryImage(image, uploadRuntime)
    .catch((error) => { throw mapUploadError(error); })
    .then((temporaryUrl) => upstreamRequest(temporaryUrl, runtime))
    .finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

function sendImage(response, result) {
  response.statusCode = 200;
  response.setHeader("Content-Type", result.contentType);
  response.setHeader("Content-Length", String(result.buffer.length));
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.end(result.buffer);
}

async function handleHD4(request, response, url, runtime = {}) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Metode permintaan enhancer tidak didukung." });
  }
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY.has(key)) return send(response, 400, { ok: false, error: "UNSUPPORTED_PARAMETER", message: "Permintaan enhancement tidak valid." });
  }
  if (url.searchParams.get("_service") !== "hd4-enhancer") {
    return send(response, 400, { ok: false, error: "INVALID_ROUTE", message: "Permintaan enhancement tidak valid." });
  }
  try {
    enforceRateLimit(request);
    let result;
    if (request.method === "POST") {
      if (url.searchParams.has("url")) throw Object.assign(new Error("UNSUPPORTED_PARAMETER"), { code: "UNSUPPORTED_PARAMETER", status: 400 });
      const contentType = String(request.headers?.["content-type"] || "").toLowerCase();
      if (contentType && !/^application\/json(?:;|$)/.test(contentType)) {
        throw Object.assign(new Error("HD4_UPLOAD_INVALID"), { code: "HD4_UPLOAD_INVALID", status: 415 });
      }
      result = await runUploadedDeduplicated(decodeHD4Upload(request.body), runtime);
    } else {
      const inputUrl = normalizeInputUrl(url.searchParams.get("url"));
      result = await runDeduplicated(inputUrl, runtime);
    }
    if (result.kind === "image") return sendImage(response, result);
    return send(response, 200, { ok: true, data: result.data });
  } catch (error) {
    if (error?.retryAfter) response.setHeader("Retry-After", String(error.retryAfter));
    const code = safeText(error?.code || "HD4_UPSTREAM_ERROR", 80);
    return send(response, statusForError(error), { ok: false, error: code, message: publicError(error) });
  }
}

function resetHD4State() {
  inflight.clear();
  rateBuckets.clear();
}

module.exports = {
  UPSTREAM_URL,
  ALLOWED_QUERY,
  handleHD4,
  decodeHD4Upload,
  normalizeHD4Response,
  normalizeInputUrl,
  safeExternalUrl,
  sniffImageMime,
  responseShape,
  resetHD4State
};

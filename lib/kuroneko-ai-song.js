"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { assertCapacity, takeFixedWindow } = require("./memory-store");
const { sendJson: send } = require("./http-response");

const UPSTREAM_URL = "https://sylvatica.my.id/api/ai/aisong";
const ALLOWED_QUERY = new Set(["_service", "prompt", "title", "tags"]);
const TIMEOUT_MS = 110_000;
const MAX_PROMPT_LENGTH = 1_500;
const MAX_TITLE_LENGTH = 160;
const MAX_TAGS_LENGTH = 300;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 4;
const MAX_INFLIGHT = 10;

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

function inputError(code) {
  return Object.assign(new Error(code), { code, status: 400 });
}

function normalizeRequiredPrompt(value) {
  const raw = String(value == null ? "" : value).trim().replace(/\r\n?/g, "\n");
  if (!raw) throw inputError("AI_SONG_PROMPT_REQUIRED");
  if (raw.length > MAX_PROMPT_LENGTH) throw inputError("AI_SONG_PROMPT_TOO_LONG");
  return raw;
}

function normalizeOptionalText(value, maximum, code) {
  const raw = String(value == null ? "" : value).trim().replace(/\s+/g, " ");
  if (raw.length > maximum) throw inputError(code);
  return raw;
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

const AUDIO_KEYS = ["audio_url", "audioUrl", "audio", "song_url", "songUrl", "song", "music_url", "musicUrl", "music", "file_url", "fileUrl", "download_url", "downloadUrl", "url"];
const COVER_KEYS = ["cover_url", "coverUrl", "cover", "image_url", "imageUrl", "image", "thumbnail_url", "thumbnailUrl", "thumbnail", "artwork_url", "artworkUrl", "artwork"];

function findUrlByKey(value, aliases, secret, depth = 0, seen = new Set()) {
  if (value == null || depth > 7 || seen.has(value)) return "";
  if (typeof value === "string") return depth === 0 ? safeExternalUrl(value, secret) : "";
  if (typeof value !== "object") return "";
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrlByKey(item, aliases, secret, depth + 1, seen);
      if (found) return found;
    }
    return "";
  }
  const direct = firstOwn(value, aliases);
  if (typeof direct === "string") {
    const found = safeExternalUrl(direct, secret);
    if (found) return found;
  }
  for (const item of Object.values(value)) {
    if (item && typeof item === "object") {
      const found = findUrlByKey(item, aliases, secret, depth + 1, seen);
      if (found) return found;
    }
  }
  return "";
}

function findMetadata(value, aliases, maximum, depth = 0, seen = new Set()) {
  if (!isObject(value) || depth > 7 || seen.has(value)) return "";
  seen.add(value);
  const direct = firstOwn(value, aliases);
  if (["string", "number"].includes(typeof direct)) {
    const normalized = safeText(direct, maximum);
    if (normalized) return normalized;
  }
  for (const item of Object.values(value)) {
    if (isObject(item)) {
      const found = findMetadata(item, aliases, maximum, depth + 1, seen);
      if (found) return found;
    }
  }
  return "";
}

function normalizeAISongResponse(payload, secret = "") {
  const source = unwrapPayload(payload);
  const searchable = source == null ? payload : source;
  return {
    title: findMetadata(searchable, ["title", "song_title", "songTitle", "name"], MAX_TITLE_LENGTH) || null,
    audioUrl: findUrlByKey(searchable, AUDIO_KEYS, secret) || null,
    coverUrl: typeof searchable === "string" ? null : (findUrlByKey(searchable, COVER_KEYS, secret) || null),
    duration: findMetadata(searchable, ["duration", "duration_seconds", "durationSeconds", "length"], 80) || null,
    lyrics: findMetadata(searchable, ["lyrics", "lyric", "text"], 20_000) || null,
    status: findMetadata(payload, ["status", "state"], 80) || null
  };
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
  const error = new Error("AI_SONG_UPSTREAM_FAILED");
  if (status === 429 || /rate|limit|quota|too many/.test(hint)) error.code = "AI_SONG_RATE_LIMITED";
  else if ([401, 403].includes(status) || /api.?key|unauthor|forbidden|revoked/.test(hint)) error.code = "AI_SONG_CONFIGURATION_ERROR";
  else if ([400, 404, 408, 413, 422].includes(status) || /invalid|tidak valid|required|wajib|failed|gagal|prompt/.test(hint)) error.code = "AI_SONG_PROVIDER_REJECTED";
  else error.code = "AI_SONG_UPSTREAM_ERROR";
  return error;
}

function publicError(error) {
  if (error?.code === "AI_SONG_PROMPT_REQUIRED") return "Tulis deskripsi lagu terlebih dahulu.";
  if (error?.code === "AI_SONG_PROMPT_TOO_LONG") return "Deskripsi lagu terlalu panjang. Maksimal 1.500 karakter.";
  if (error?.code === "AI_SONG_TITLE_TOO_LONG") return "Judul lagu terlalu panjang. Maksimal 160 karakter.";
  if (error?.code === "AI_SONG_TAGS_TOO_LONG") return "Style atau genre terlalu panjang. Maksimal 300 karakter.";
  if (error?.code === "AI_SONG_BUSY") return "AI Song sedang sibuk. Coba lagi sebentar.";
  if (error?.code === "AI_SONG_RATE_LIMITED") return "Batas request sementara tercapai. Coba lagi nanti.";
  if (error?.code === "AI_SONG_TIMEOUT") return "Pembuatan lagu terlalu lama. Silakan coba lagi.";
  if (error?.code === "AI_SONG_PROVIDER_REJECTED") return "Prompt lagu tidak valid atau tidak dapat diproses.";
  if (error?.code === "AI_SONG_CONFIGURATION_ERROR") return "Nexora AI Song Generator belum siap. Hubungi pengelola Nexora.";
  if (error?.code === "AI_SONG_EMPTY_RESULT") return "Lagu gagal dibuat. Hasil audio belum tersedia.";
  if (error?.code === "AI_SONG_INVALID_RESPONSE") return "Server AI Song mengirim respons yang tidak dapat dibaca.";
  return "Server AI Song sedang tidak tersedia. Coba lagi nanti.";
}

function statusForError(error) {
  if (Number.isInteger(error?.status)) return error.status;
  if (error?.code === "AI_SONG_RATE_LIMITED") return 429;
  if (error?.code === "AI_SONG_TIMEOUT") return 504;
  if (error?.code === "AI_SONG_PROVIDER_REJECTED") return 400;
  if (error?.code === "AI_SONG_CONFIGURATION_ERROR") return 503;
  if (error?.code === "AI_SONG_EMPTY_RESULT") return 422;
  if (error?.code === "AI_SONG_BUSY") return 503;
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
    const error = Object.assign(new Error("AI_SONG_RATE_LIMITED"), { code: "AI_SONG_RATE_LIMITED" });
    error.retryAfter = result.retryAfter;
    throw error;
  }
}

async function upstreamRequest(input, runtime = {}) {
  const apiKey = safeText(process.env.KURONEKO_API_KEY, 1_024);
  if (!apiKey) throw Object.assign(new Error("AI_SONG_CONFIGURATION_ERROR"), { code: "AI_SONG_CONFIGURATION_ERROR" });
  const target = new URL(UPSTREAM_URL);
  target.search = new URLSearchParams({
    prompt: input.prompt,
    title: input.title,
    tags: input.tags,
    apikey: apiKey
  }).toString();
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(runtime.timeoutMs) || TIMEOUT_MS, 1), TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const fetchImpl = runtime.fetch || fetch;
    const upstream = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "All-Tools-Nexora-AISong/1.0" }
    });
    const declared = Number(upstream.headers?.get?.("content-length") || 0);
    if (declared > MAX_RESPONSE_BYTES) throw Object.assign(new Error("AI_SONG_INVALID_RESPONSE"), { code: "AI_SONG_INVALID_RESPONSE" });
    const raw = await upstream.text();
    if (!raw || Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) throw Object.assign(new Error("AI_SONG_INVALID_RESPONSE"), { code: "AI_SONG_INVALID_RESPONSE" });
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw Object.assign(new Error("AI_SONG_INVALID_RESPONSE"), { code: "AI_SONG_INVALID_RESPONSE" }); }
    if (!upstream.ok || payload?.status === false || payload?.success === false || payload?.ok === false) throw providerError(upstream.status, payload);
    const normalized = normalizeAISongResponse(payload, apiKey);
    if (!normalized.audioUrl) {
      console.warn("[ai-song] unsupported response schema", responseShape(payload, apiKey));
      throw Object.assign(new Error("AI_SONG_EMPTY_RESULT"), { code: "AI_SONG_EMPTY_RESULT" });
    }
    console.info("[ai-song] request completed", { status: upstream.status, durationMs: Date.now() - startedAt });
    return normalized;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("AI_SONG_TIMEOUT"), { code: "AI_SONG_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function runDeduplicated(input, runtime) {
  const key = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  if (inflight.has(key)) return inflight.get(key);
  assertCapacity(inflight, MAX_INFLIGHT, "AI_SONG_BUSY");
  const task = upstreamRequest(input, runtime).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

async function handleAiSong(request, response, url, runtime = {}) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Metode permintaan AI Song tidak didukung." });
  }
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY.has(key)) return send(response, 400, { ok: false, error: "UNSUPPORTED_PARAMETER", message: "Permintaan pembuatan lagu tidak valid." });
  }
  if (url.searchParams.get("_service") !== "ai-song") {
    return send(response, 400, { ok: false, error: "INVALID_ROUTE", message: "Permintaan pembuatan lagu tidak valid." });
  }
  try {
    const input = {
      prompt: normalizeRequiredPrompt(url.searchParams.get("prompt")),
      title: normalizeOptionalText(url.searchParams.get("title"), MAX_TITLE_LENGTH, "AI_SONG_TITLE_TOO_LONG"),
      tags: normalizeOptionalText(url.searchParams.get("tags"), MAX_TAGS_LENGTH, "AI_SONG_TAGS_TOO_LONG")
    };
    enforceRateLimit(request);
    const data = await runDeduplicated(input, runtime);
    return send(response, 200, { ok: true, data });
  } catch (error) {
    if (error?.retryAfter) response.setHeader("Retry-After", String(error.retryAfter));
    const code = safeText(error?.code || "AI_SONG_UPSTREAM_ERROR", 80);
    return send(response, statusForError(error), { ok: false, error: code, message: publicError(error) });
  }
}

function resetAiSongState() {
  inflight.clear();
  rateBuckets.clear();
}

module.exports = {
  UPSTREAM_URL,
  ALLOWED_QUERY,
  TIMEOUT_MS,
  MAX_PROMPT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TAGS_LENGTH,
  handleAiSong,
  normalizeAISongResponse,
  responseShape,
  safeExternalUrl,
  resetAiSongState
};

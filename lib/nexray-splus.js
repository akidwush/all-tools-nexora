"use strict";

const net = require("node:net");
const { takeFixedWindow } = require("./memory-store");
const { sendJson: send } = require("./http-response");
const { decodeUploadImage, uploadTemporaryImage } = require("./kuroneko-anime-to-real");

const BASE_URL = "https://api.nexray.eu.cc";
const ACTIONS = Object.freeze(["suno", "veo3", "image-edit"]);
const IMAGE_ENGINES = Object.freeze(["auto", "nanobanana", "gptimage"]);
const MAX_PROMPT = 2500;
const MAX_PARAM = 2500;
const MAX_URL = 4096;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const TIMEOUTS = Object.freeze({ suno: 95_000, veo3: 180_000, "image-edit": 110_000 });
const RATE_LIMITS = Object.freeze({ suno: 4, veo3: 3, "image-edit": 6 });
const rateBuckets = new Map();

function clean(value, maximum = 500) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function error(code, status = 400, message = code) {
  return Object.assign(new Error(message), { code, status });
}

function isPrivateIp(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (net.isIPv4(host)) {
    const p = host.split(".").map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || p[0] >= 224;
  }
  if (net.isIPv6(host)) {
    const h = host.replace(/^\[|\]$/g, "");
    return h === "::" || h === "::1" || /^f[cd]/i.test(h) || /^fe[89ab]/i.test(h);
  }
  return false;
}

function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_URL) return "";
  let parsed;
  try { parsed = new URL(raw.startsWith("//") ? `https:${raw}` : raw); }
  catch { return ""; }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !host || host === "localhost" ||
      host.endsWith(".local") || host.endsWith(".internal") || isPrivateIp(host)) return "";
  parsed.hash = "";
  return parsed.toString();
}

function requestIp(request) {
  return clean(request.headers?.["x-forwarded-for"], 200).split(",")[0].trim() || clean(request.headers?.["x-real-ip"], 100) || "anonymous";
}

function limit(request, action) {
  const bucket = takeFixedWindow(rateBuckets, `${action}:${requestIp(request)}`, {
    windowMs: 10 * 60_000,
    limit: RATE_LIMITS[action] || 3,
    maxEntries: 5000
  });
  if (!bucket.allowed) {
    const e = error("NEXRAY_SPLUS_RATE_LIMITED", 429, "Terlalu banyak permintaan S+. Tunggu sebentar.");
    e.retryAfter = bucket.retryAfter;
    throw e;
  }
}

function normalizeText(value, maximum, code, required = true) {
  const result = String(value == null ? "" : value).trim().replace(/\r\n?/g, "\n");
  if (required && !result) throw error(code, 400);
  if (result.length > maximum) throw error(`${code}_TOO_LONG`, 400);
  return result;
}

function parseBody(request) {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return {};
  return request.body;
}

function normalizedKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectUrls(value, out = [], depth = 0, parent = "", seen = new Set()) {
  if (value == null || depth > 8 || out.length >= 60) return out;
  if (typeof value === "string") {
    const url = safeUrl(value);
    if (url) out.push({ url, key: normalizedKey(parent), depth });
    return out;
  }
  if (typeof value !== "object" || seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, out, depth + 1, parent || "items", seen));
    return out;
  }
  for (const [key, item] of Object.entries(value)) collectUrls(item, out, depth + 1, key, seen);
  return out;
}

function rankUrl(item, kind) {
  const key = item.key;
  const href = item.url.toLowerCase();
  const ext = href.split("?")[0];
  const words = {
    audio: ["audio", "song", "music", "mp3", "download"],
    video: ["video", "mp4", "output", "result", "download"],
    image: ["image", "img", "photo", "output", "result", "generated", "download"]
  }[kind] || [];
  let score = item.depth * 3;
  if (words.some((word) => key.includes(word))) score -= 25;
  if (kind === "audio" && /\.(?:mp3|m4a|wav|ogg|aac)(?:$|\?)/i.test(ext)) score -= 30;
  if (kind === "video" && /\.(?:mp4|webm|mov)(?:$|\?)/i.test(ext)) score -= 30;
  if (kind === "image" && /\.(?:png|jpe?g|webp|avif)(?:$|\?)/i.test(ext)) score -= 30;
  return score;
}

function findUrl(payload, kind) {
  return collectUrls(payload).sort((a, b) => rankUrl(a, kind) - rankUrl(b, kind))[0]?.url || "";
}

function findText(payload, keys, maximum = 500, depth = 0, seen = new Set()) {
  if (!payload || typeof payload !== "object" || depth > 7 || seen.has(payload)) return "";
  seen.add(payload);
  for (const [key, value] of Object.entries(payload)) {
    if (keys.includes(normalizedKey(key)) && ["string", "number"].includes(typeof value)) {
      const out = clean(value, maximum);
      if (out && !safeUrl(out)) return out;
    }
  }
  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const out = findText(value, keys, maximum, depth + 1, seen);
      if (out) return out;
    }
  }
  return "";
}

async function fetchPayload(target, init, runtime, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = runtime.fetch || fetch;
    const response = await fetchImpl(target, { ...init, redirect: "error", cache: "no-store", signal: controller.signal });
    const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
    const declared = Number(response.headers?.get?.("content-length") || 0);
    if (declared > MAX_JSON_BYTES) throw error("NEXRAY_SPLUS_RESPONSE_TOO_LARGE", 502);
    if (/^(image|audio|video)\//.test(contentType)) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok || !bytes.length || bytes.length > MAX_JSON_BYTES) throw error("NEXRAY_SPLUS_UPSTREAM_FAILED", 502);
      return { directDataUrl: `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`, contentType };
    }
    const raw = await response.text();
    if (!raw || Buffer.byteLength(raw) > MAX_JSON_BYTES) throw error("NEXRAY_SPLUS_INVALID_RESPONSE", 502);
    let payload;
    try { payload = JSON.parse(raw); }
    catch {
      const url = safeUrl(raw);
      if (url) payload = { url };
      else throw error("NEXRAY_SPLUS_INVALID_RESPONSE", 502);
    }
    if (!response.ok || payload?.success === false || payload?.status === false || payload?.ok === false) {
      const hint = clean(payload?.message || payload?.error?.message || payload?.error, 240);
      const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 422;
      throw error(response.status === 429 ? "NEXRAY_SPLUS_RATE_LIMITED" : "NEXRAY_SPLUS_UPSTREAM_REJECTED", status, hint || "Provider Nexray menolak permintaan.");
    }
    return payload;
  } catch (e) {
    if (e?.name === "AbortError") throw error("NEXRAY_SPLUS_TIMEOUT", 504, "Provider Nexray melewati batas waktu.");
    throw e;
  } finally { clearTimeout(timer); }
}

async function suno(input, runtime) {
  const prompt = normalizeText(input.prompt, MAX_PROMPT, "NEXRAY_SPLUS_PROMPT_REQUIRED");
  const target = new URL("/ai/suno", BASE_URL);
  target.searchParams.set("prompt", prompt);
  const payload = await fetchPayload(target.toString(), { method: "GET", headers: { Accept: "application/json" } }, runtime, TIMEOUTS.suno);
  const audioUrl = payload.directDataUrl || findUrl(payload, "audio");
  if (!audioUrl) throw error("NEXRAY_SPLUS_EMPTY_RESULT", 502, "Suno tidak mengembalikan audio yang dapat dipakai.");
  return {
    provider: "Nexray Suno",
    audioUrl,
    title: findText(payload, ["title", "name", "songtitle"], 160) || "Nexora Suno Result",
    coverUrl: findUrl(payload, "image") || null,
    duration: findText(payload, ["duration", "length"], 80) || null,
    rawStatus: findText(payload, ["status", "state"], 80) || null
  };
}

async function veo3(input, runtime) {
  const prompt = normalizeText(input.prompt, MAX_PROMPT, "NEXRAY_SPLUS_PROMPT_REQUIRED");
  let imageUrl = safeUrl(input.imageUrl);
  if (!imageUrl && input.imageData) {
    const decoded = decodeUploadImage({ imageData: input.imageData });
    imageUrl = await uploadTemporaryImage(decoded, runtime);
  }
  if (!imageUrl) throw error("NEXRAY_SPLUS_IMAGE_REQUIRED", 400, "Tambahkan gambar referensi untuk Veo3.");
  const target = new URL("/ai/veo3", BASE_URL);
  target.searchParams.set("prompt", prompt);
  target.searchParams.set("image_url", imageUrl);
  const payload = await fetchPayload(target.toString(), { method: "GET", headers: { Accept: "application/json" } }, runtime, TIMEOUTS.veo3);
  const videoUrl = payload.directDataUrl || findUrl(payload, "video");
  if (!videoUrl) throw error("NEXRAY_SPLUS_EMPTY_RESULT", 502, "Veo3 belum mengembalikan video yang dapat diputar.");
  return { provider: "Nexray Veo3", videoUrl, inputImageUrl: imageUrl };
}

async function editWith(engine, input, runtime) {
  const param = normalizeText(input.param, MAX_PARAM, "NEXRAY_SPLUS_EDIT_PROMPT_REQUIRED");
  const decoded = decodeUploadImage({ imageData: input.imageData });
  const endpoint = engine === "gptimage" ? "/ai/gptimage" : "/ai/nanobanana";
  const form = new FormData();
  const ext = decoded.mime === "image/png" ? "png" : decoded.mime === "image/webp" ? "webp" : "jpg";
  form.append("image", new Blob([decoded.buffer], { type: decoded.mime }), `nexora-splus.${ext}`);
  form.append("param", param);
  const payload = await fetchPayload(new URL(endpoint, BASE_URL).toString(), {
    method: "POST",
    headers: { Accept: "application/json,image/*" },
    body: form
  }, runtime, TIMEOUTS["image-edit"]);
  const imageUrl = payload.directDataUrl || findUrl(payload, "image");
  if (!imageUrl) throw error("NEXRAY_SPLUS_EMPTY_RESULT", 502, `${engine} tidak mengembalikan gambar hasil.`);
  return { provider: engine === "gptimage" ? "Nexray GPT Image" : "Nexray Nano Banana", engine, imageUrl };
}

async function imageEdit(input, runtime) {
  const requested = IMAGE_ENGINES.includes(String(input.engine || "").toLowerCase()) ? String(input.engine).toLowerCase() : "auto";
  if (!input.imageData) throw error("NEXRAY_SPLUS_IMAGE_REQUIRED", 400, "Pilih gambar yang ingin diedit.");
  if (requested !== "auto") return editWith(requested, input, runtime);
  const attempts = [];
  for (const engine of ["nanobanana", "gptimage"]) {
    try { return { ...(await editWith(engine, input, runtime)), attempts: [...attempts, engine] }; }
    catch (e) {
      attempts.push(engine);
      if ([400, 413, 415].includes(Number(e?.status))) throw e;
    }
  }
  throw Object.assign(error("NEXRAY_SPLUS_ALL_EDITORS_FAILED", 502, "Nano Banana dan GPT Image sedang tidak tersedia."), { attempts });
}

async function handleNexraySPlus(request, response, url, runtime = {}) {
  if (request.method === "HEAD") return response.status(200).end();
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, HEAD, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Gunakan POST untuk Creative AI S+." });
  }
  const action = clean(url.searchParams.get("action"), 30).toLowerCase();
  if (!ACTIONS.includes(action)) return send(response, 400, { ok: false, error: "NEXRAY_SPLUS_ACTION_INVALID" });
  try {
    limit(request, action);
    const body = parseBody(request);
    let data;
    if (action === "suno") data = await suno(body, runtime);
    else if (action === "veo3") data = await veo3(body, runtime);
    else data = await imageEdit(body, runtime);
    return send(response, 200, { ok: true, action, data });
  } catch (e) {
    if (e?.retryAfter) response.setHeader("Retry-After", String(e.retryAfter));
    return send(response, Math.max(400, Math.min(599, Number(e?.status || 502))), {
      ok: false,
      error: clean(e?.code || "NEXRAY_SPLUS_FAILED", 80),
      message: clean(e?.message || "Creative AI S+ sedang tidak tersedia.", 300),
      attempts: Array.isArray(e?.attempts) ? e.attempts : undefined
    });
  }
}

function resetNexraySPlusState() { rateBuckets.clear(); }

module.exports = {
  BASE_URL,
  ACTIONS,
  IMAGE_ENGINES,
  handleNexraySPlus,
  suno,
  veo3,
  imageEdit,
  findUrl,
  safeUrl,
  resetNexraySPlusState
};

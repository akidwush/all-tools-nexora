"use strict";

const net = require("node:net");
const { sendJson: send } = require("./http-response");
const { readMultiAiSettings } = require("./kuroneko-multiai-settings");

const API_ORIGIN = "https://sylvatica.my.id";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const HEALTH_TTL_MS = 30 * 60_000;
const health = new Map();

const PROVIDERS = Object.freeze({
  aiart: p("AI Art Generator", "/api/ai/aiart", "image", [f("q", "Prompt", "textarea", true, 1500)]),
  aifilter: p("AI Filter", "/api/ai/aifilter", "image-transform", [f("url", "Image URL", "url", true, 4096)]),
  aiseek: p("AI Seek", "/api/ai/aiseek", "chat", [f("prompt", "Prompt", "textarea", true, 8000), f("model", "Model", "select", false, 100, ["deepseek/deepseek-chat", "google/gemini-2.5-flash-lite", "qwen/qwen-coder-32b"]), f("session_id", "Session ID", "hidden", false, 300)], { multiChat: true, defaultSelected: false, supportsHistory: true, capabilities: ["chat", "image"], variants: { image: { fixed: { action: "image" }, kind: "image" } } }),
  aisong: p("AI Song Generator", "/api/ai/aisong", "audio", [f("prompt", "Deskripsi lagu", "textarea", true, 1500), f("title", "Judul", "text", false, 160), f("tags", "Style / genre", "text", false, 300)], { timeoutMs: 110000 }),
  animetoreal: p("Anime to Real", "/api/ai/animetoreal", "image-transform", [f("url", "Image URL", "url", true, 4096)]),
  bypassai: p("Rewrite Text", "/api/ai/bypassai", "utility", [f("q", "Teks", "textarea", true, 12000)], { technicalName: "Bypass AI Detection" }),
  chatgpt: p("ChatGPT", "/api/ai/chatgpt", "chat", [f("prompt", "Prompt", "textarea", true, 8000), f("chat_id", "Chat ID", "hidden", false, 300), f("auth", "Auth context", "hidden", false, 2500)], { multiChat: true, defaultSelected: true, supportsHistory: true }),
  deepai: p("DeepAI", "/api/ai/deepai", "chat", [f("q", "Prompt", "textarea", true, 8000), f("model", "Model ID", "text", false, 120)], { multiChat: true, defaultSelected: true }),
  deepseek: p("DeepSeek AI", "/api/ai/deepsek", "chat", [f("q", "Prompt", "textarea", true, 8000)], { multiChat: true, defaultSelected: true }),
  feelbetter: p("Feel Better Bot", "/api/ai/feeb", "chat", [f("q", "Pesan", "textarea", true, 8000), f("session", "Session", "hidden", false, 300)], { multiChat: true, defaultSelected: false, supportsHistory: true, specialized: true }),
  gpt5: p("GPT-5", "/api/ai/gpt5", "chat", [f("q", "Prompt", "textarea", true, 8000)], { multiChat: true, defaultSelected: true }),
  gptanon: p("GPTAnon AI", "/api/ai/gptanon", "chat", [f("q", "Prompt", "textarea", true, 8000), f("session", "Session", "hidden", false, 300)], { multiChat: true, defaultSelected: true, supportsHistory: true }),
  detectai: p("Grammarly AI Detector", "/api/ai/detectai", "detection", [f("q", "Teks yang dianalisis", "textarea", true, 12000)]),
  imagenai: p("Imagen AI Generator", "/api/ai/imagenai", "image", [f("q", "Prompt", "textarea", true, 1500), f("style", "Style", "select", false, 30, ["default", "realistic", "anime", "3d", "ghibli"])]),
  img2prompt: p("Image to Prompt", "/api/ai/img2prompt", "utility", [f("url", "Image URL", "url", true, 4096)]),
  kuroneko: p("KuroNeko Assistant", "/api/ai/kuroneko", "chat", [f("q", "Prompt", "textarea", true, 8000), f("session", "Session", "hidden", false, 300)], { multiChat: true, defaultSelected: true, supportsHistory: true }),
  mistral: p("Mistral AI", "/api/ai/mistral", "chat", [f("query", "Prompt", "textarea", true, 8000)], { multiChat: true, defaultSelected: true }),
  nanobanana: p("Nano Banana Image Editor", "/api/ai/nanobanana", "image-transform", [f("url", "Image URL", "url", true, 4096), f("prompt", "Instruksi edit", "textarea", true, 1500)]),
  notrack: p("NoTrack AI", "/api/ai/notrack", "chat", [f("q", "Prompt", "textarea", true, 8000), f("persona", "Persona", "select", false, 30, ["normal", "concise", "detailed", "creative"])], { multiChat: true, defaultSelected: true }),
  nova: p("Nova AI", "/api/ai/nova", "chat", [f("q", "Prompt", "textarea", true, 8000)], { multiChat: true, defaultSelected: true }),
  perplexity: p("Perplexity", "/api/ai/perplexity", "chat", [f("query", "Prompt", "textarea", true, 8000)], { multiChat: true, defaultSelected: true }),
  qwen: p("Qwen AI", "/api/ai/qwen", "chat", [f("q", "Prompt", "textarea", true, 8000)], { multiChat: true, defaultSelected: true }),
  qwen3: p("Qwen3 AI", "/api/ai/qwen3", "chat", [f("q", "Prompt", "textarea", true, 8000)], { multiChat: true, defaultSelected: true }),
  txt2img: p("Text to Image", "/api/ai/txt2img", "image", [f("prompt", "Prompt", "textarea", true, 1500), f("ratio", "Aspect ratio", "select", false, 20, ["1:1", "16:9", "9:16"])]),
  tts: p("Text to Speech", "/api/ai/tts", "audio", [f("text", "Teks", "textarea", true, 5000), f("model", "Voice model", "text", true, 80, null, "miku")], { timeoutMs: 60000 }),
  text2vid: p("Text to Video", "/api/ai/text2vid", "utility", [f("prompt", "Prompt video", "textarea", true, 1500), f("ratio", "Aspect ratio", "select", false, 20, ["auto", "1:1", "16:9", "9:16"]), f("sound", "Sound", "boolean", false, 5)], { resultKind: "video", timeoutMs: 110000 }),
  toonmix: p("Toonmix AI", "/api/ai/toonmix", "image", [f("q", "Prompt", "textarea", true, 1500), f("image", "Image URL (optional I2I)", "url", false, 4096)], { method: "POST", capabilities: ["image", "image-transform"] })
});

const PUBLIC_PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

function f(name, label, type, required, maxLength, options, defaultValue) {
  return Object.freeze({ name, label, type, required, maxLength, options: options || undefined, defaultValue: defaultValue || undefined });
}
function p(name, path, category, fields, options = {}) {
  return Object.freeze({ id: path.split("/").pop(), name, path, category, fields: Object.freeze(fields), method: options.method || "GET", capabilities: Object.freeze(options.capabilities || [category]), multiChat: Boolean(options.multiChat), defaultSelected: Boolean(options.defaultSelected), supportsHistory: Boolean(options.supportsHistory), specialized: Boolean(options.specialized), technicalName: options.technicalName, variants: options.variants || {}, resultKind: options.resultKind || category, timeoutMs: options.timeoutMs || (category === "chat" ? 45000 : 70000) });
}
function clean(value, max = 500) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max); }
function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function inputError(code, message) { return Object.assign(new Error(code), { code, status: 400, publicMessage: message }); }

function safeUrl(value) {
  const raw = clean(value, 8192);
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || !host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || net.isIP(host)) return "";
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}

function publicProvider(provider, enabled, providerHealth) {
  return {
    id: provider.id === "deepsek" ? "deepseek" : Object.entries(PROVIDERS).find(([, value]) => value === provider)?.[0],
    name: provider.name,
    technicalName: provider.technicalName || undefined,
    category: provider.category,
    capabilities: provider.capabilities,
    fields: provider.fields.filter((field) => field.type !== "hidden"),
    multiChat: provider.multiChat,
    defaultSelected: provider.defaultSelected,
    supportsHistory: provider.supportsHistory,
    specialized: provider.specialized,
    enabled,
    status: providerHealth?.status || "unknown",
    latencyMs: providerHealth?.latencyMs || null,
    checkedAt: providerHealth?.checkedAt || null
  };
}

async function publicRegistry() {
  const settings = await readMultiAiSettings();
  const now = Date.now();
  const providers = PUBLIC_PROVIDER_IDS.map((id) => {
    const item = health.get(id);
    const current = item && now - item.time <= HEALTH_TTL_MS ? item : null;
    return publicProvider(PROVIDERS[id], settings.providers[id] !== false, current);
  });
  return { configured: Boolean(clean(process.env.KURONEKO_API_KEY, 2048)), enabled: settings.enabled, maxConcurrentAi: settings.maxConcurrentAi, maxProviders: 12, providers };
}

function validateInput(provider, rawInput, variantName) {
  if (!isObject(rawInput)) throw inputError("INVALID_INPUT", "Input provider tidak valid.");
  const variant = clean(variantName, 30);
  if (variant && !Object.hasOwn(provider.variants, variant)) throw inputError("INVALID_VARIANT", "Mode provider tidak didukung.");
  const allowed = new Set(provider.fields.map((field) => field.name));
  if (Object.keys(rawInput).some((key) => !allowed.has(key))) throw inputError("UNSUPPORTED_PARAMETER", "Parameter provider tidak didukung.");
  const output = {};
  for (const field of provider.fields) {
    let value = rawInput[field.name];
    if (field.type === "boolean") {
      if (value == null || value === "") continue;
      if (typeof value !== "boolean") throw inputError("INVALID_BOOLEAN", `${field.label} tidak valid.`);
      output[field.name] = String(value);
      continue;
    }
    value = clean(value, field.maxLength + 1);
    if (field.required && !value) throw inputError("REQUIRED_PARAMETER", `${field.label} wajib diisi.`);
    if (!value) continue;
    if (value.length > field.maxLength) throw inputError("INPUT_TOO_LONG", `${field.label} terlalu panjang.`);
    if (field.type === "url" && !safeUrl(value)) throw inputError("INVALID_URL", `${field.label} harus URL HTTPS publik.`);
    if (field.options && !field.options.includes(value)) throw inputError("INVALID_OPTION", `${field.label} tidak didukung.`);
    output[field.name] = value;
  }
  return { ...output, ...(variant ? provider.variants[variant].fixed : {}) };
}

function unwrap(payload) {
  let value = payload;
  const seen = new Set();
  while (isObject(value) && !seen.has(value)) {
    seen.add(value);
    const next = value.result ?? value.data ?? value.response ?? value.payload;
    if (next == null || next === value) break;
    value = next;
  }
  return value;
}
function deepFind(value, predicate, depth = 0, seen = new Set()) {
  if (value == null || depth > 7 || (typeof value === "object" && seen.has(value))) return undefined;
  if (typeof value === "object") seen.add(value);
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) if (predicate(key, item)) return item;
    for (const item of Object.values(value)) { const found = deepFind(item, predicate, depth + 1, seen); if (found !== undefined) return found; }
  } else if (Array.isArray(value)) {
    for (const item of value) { const found = deepFind(item, predicate, depth + 1, seen); if (found !== undefined) return found; }
  }
  return undefined;
}
function textFrom(payload) {
  const source = unwrap(payload);
  if (typeof source === "string") return clean(source, 50000);
  const aliases = /^(text|answer|message|content|reply|response|output|generated_text|prompt)$/i;
  const value = deepFind(source, (key, item) => aliases.test(key) && typeof item === "string");
  return clean(value, 50000);
}
function urlsFrom(payload, kind) {
  const keys = kind === "audio" ? /(audio|song|music|file|download).*url|^(audio|song|music)$/i : kind === "video" ? /(video|file|download).*url|^video$/i : /(image|file|download|output).*url|^(url|image)$/i;
  const urls = [];
  const visit = (value, depth = 0, seen = new Set()) => {
    if (value == null || depth > 7 || (typeof value === "object" && seen.has(value))) return;
    if (typeof value === "object") seen.add(value);
    if (isObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (typeof item === "string" && keys.test(key)) { const url = safeUrl(item); if (url && !urls.includes(url)) urls.push(url); }
        else visit(item, depth + 1, seen);
      }
    } else if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1, seen));
    else if (typeof value === "string" && /^https:\/\//i.test(value)) { const url = safeUrl(value); if (url && !urls.includes(url)) urls.push(url); }
  };
  visit(unwrap(payload));
  return urls.slice(0, 8);
}
function safeResult(value, depth = 0) {
  if (depth > 4 || value == null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return typeof value === "string" ? clean(value, 12000) : value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeResult(item, depth + 1));
  if (!isObject(value)) return null;
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    if (/key|token|secret|auth/i.test(key)) continue;
    result[clean(key, 80)] = safeResult(item, depth + 1);
  }
  return result;
}
function sessionFrom(payload) {
  const output = {};
  for (const key of ["session", "session_id", "chat_id", "auth"]) {
    const value = deepFind(payload, (candidate, item) => candidate.toLowerCase() === key && (["string", "number"].includes(typeof item) || (key === "auth" && isObject(item))));
    if (value != null) output[key] = clean(key === "auth" && isObject(value) ? JSON.stringify(safeResult(value)) : value, key === "auth" ? 2500 : 300);
  }
  return output;
}

function normalizeResponse(provider, payload, variant) {
  const kind = variant && provider.variants[variant]?.kind || provider.resultKind;
  if (kind === "chat") {
    const text = textFrom(payload);
    if (!text) throw Object.assign(new Error("EMPTY_RESULT"), { code: "EMPTY_RESULT", status: 502 });
    return { kind, text, context: provider.supportsHistory ? sessionFrom(payload) : undefined };
  }
  if (["image", "image-transform"].includes(kind)) {
    const images = urlsFrom(payload, "image").map((url) => ({ url }));
    if (!images.length) throw Object.assign(new Error("EMPTY_RESULT"), { code: "EMPTY_RESULT", status: 502 });
    return { kind, images, text: textFrom(payload) || undefined };
  }
  if (kind === "audio") {
    const audioUrl = urlsFrom(payload, "audio")[0];
    if (!audioUrl) throw Object.assign(new Error("EMPTY_RESULT"), { code: "EMPTY_RESULT", status: 502 });
    return { kind, audioUrl, coverUrl: urlsFrom(payload, "image")[0] || undefined, metadata: safeResult(unwrap(payload)) };
  }
  if (kind === "video") {
    const videoUrl = urlsFrom(payload, "video")[0];
    if (!videoUrl) throw Object.assign(new Error("EMPTY_RESULT"), { code: "EMPTY_RESULT", status: 502 });
    return { kind, videoUrl, metadata: safeResult(unwrap(payload)) };
  }
  if (kind === "detection") return { kind, result: safeResult(unwrap(payload)), text: textFrom(payload) || undefined };
  return { kind: "utility", text: textFrom(payload) || undefined, result: safeResult(unwrap(payload)) };
}

function upstreamError(status, payload) {
  const message = clean(payload?.message || payload?.error?.message || payload?.error, 300).toLowerCase();
  if (status === 429 || /rate|limit|quota|too many/.test(message)) return Object.assign(new Error("RATE_LIMITED"), { code: "RATE_LIMITED", status: 429 });
  if ([401, 403].includes(status) || /api.?key|unauthor|forbidden/.test(message)) return Object.assign(new Error("NOT_CONFIGURED"), { code: "NOT_CONFIGURED", status: 503 });
  if (status === 404) return Object.assign(new Error("PROVIDER_UNAVAILABLE"), { code: "PROVIDER_UNAVAILABLE", status: 503 });
  return Object.assign(new Error("UPSTREAM_FAILED"), { code: "UPSTREAM_FAILED", status: status >= 500 ? 503 : 422 });
}
function publicError(error) {
  if (error.code === "NOT_CONFIGURED") return "Nexora Multi-AI belum dikonfigurasi oleh admin.";
  if (error.code === "RATE_LIMITED") return "Batas provider sementara tercapai.";
  if (error.code === "TIMEOUT") return "Provider melewati batas waktu.";
  if (error.code === "PROVIDER_DISABLED") return "Provider sedang dinonaktifkan.";
  if (error.code === "PROVIDER_UNAVAILABLE" || error.code === "UPSTREAM_FAILED" || error.code === "EMPTY_RESULT") return "Provider sedang tidak tersedia.";
  return error.publicMessage || "Permintaan AI belum dapat diproses.";
}

async function invokeProvider(providerId, rawInput, variant, runtime = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw inputError("UNKNOWN_PROVIDER", "Provider tidak dikenal.");
  const input = validateInput(provider, rawInput, variant);
  const apiKey = clean(runtime.apiKey ?? process.env.KURONEKO_API_KEY, 2048);
  if (!apiKey) throw Object.assign(new Error("NOT_CONFIGURED"), { code: "NOT_CONFIGURED", status: 503 });
  const target = new URL(provider.path, API_ORIGIN);
  for (const [key, value] of Object.entries(input)) target.searchParams.set(key, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(provider.timeoutMs, Number(runtime.timeoutMs) || provider.timeoutMs));
  const started = Date.now();
  try {
    const result = await (runtime.fetch || fetch)(target, {
      method: provider.method,
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "X-API-Key": apiKey, "User-Agent": "Nexora-Multi-AI/1.0" }
    });
    const declared = Number(result.headers?.get?.("content-length") || 0);
    if (declared > MAX_RESPONSE_BYTES) throw Object.assign(new Error("INVALID_RESPONSE"), { code: "INVALID_RESPONSE", status: 502 });
    const raw = await result.text();
    if (!raw || Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) throw Object.assign(new Error("INVALID_RESPONSE"), { code: "INVALID_RESPONSE", status: 502 });
    let payload;
    try { payload = JSON.parse(raw); } catch { throw Object.assign(new Error("INVALID_RESPONSE"), { code: "INVALID_RESPONSE", status: 502 }); }
    if (!result.ok || payload?.status === false || payload?.success === false || payload?.ok === false) throw upstreamError(result.status, payload);
    const data = normalizeResponse(provider, payload, clean(variant, 30));
    const latencyMs = Date.now() - started;
    health.set(providerId, { status: "online", latencyMs, checkedAt: new Date().toISOString(), time: Date.now(), failures: 0 });
    return { provider: providerId, name: provider.name, ok: true, latencyMs, ...data };
  } catch (error) {
    const normalized = error?.name === "AbortError" ? Object.assign(new Error("TIMEOUT"), { code: "TIMEOUT", status: 504 }) : error;
    const previous = health.get(providerId);
    const failures = Number(previous?.failures || 0) + 1;
    health.set(providerId, { status: failures >= 3 ? "offline" : "degraded", latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), time: Date.now(), failures });
    throw normalized;
  } finally { clearTimeout(timer); }
}

async function handleMultiAi(request, response, runtime = {}) {
  if (request.method === "GET") return send(response, 200, { ok: true, ...(await publicRegistry()) });
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Metode tidak didukung." });
  }
  if (!String(request.headers?.["content-type"] || "").toLowerCase().includes("application/json")) return send(response, 415, { ok: false, error: "UNSUPPORTED_CONTENT_TYPE" });
  const body = isObject(request.body) ? request.body : {};
  if (Object.keys(body).some((key) => !["provider", "input", "variant"].includes(key))) return send(response, 400, { ok: false, error: "UNSUPPORTED_PARAMETER", message: "Payload tidak valid." });
  const providerId = clean(body.provider, 40).toLowerCase();
  try {
    const settings = await readMultiAiSettings();
    if (!settings.enabled || settings.providers[providerId] === false) throw Object.assign(new Error("PROVIDER_DISABLED"), { code: "PROVIDER_DISABLED", status: 503 });
    return send(response, 200, await invokeProvider(providerId, body.input, body.variant, runtime));
  } catch (error) {
    const status = Math.max(400, Math.min(599, Number(error.status || 502)));
    console.warn("[multi-ai] provider request failed", { provider: PUBLIC_PROVIDER_IDS.includes(providerId) ? providerId : "unknown", code: error.code || "FAILED", status });
    return send(response, status, { ok: false, provider: providerId, error: error.code || "PROVIDER_FAILED", message: publicError(error) });
  }
}

module.exports = { API_ORIGIN, PROVIDERS, PUBLIC_PROVIDER_IDS, handleMultiAi, invokeProvider, normalizeResponse, publicRegistry, validateInput };

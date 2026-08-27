"use strict";

const { sendJson: send } = require("./http-response");

const UPSTREAM_URL = "https://sylvatica.my.id/api/tools/genmail";
const ACTIONS = new Set(["domains", "generate", "inbox", "message"]);
const ALLOWED_QUERY = new Set(["mode", "action", "username", "domain", "email", "link"]);
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_DOMAIN_CACHE_MS = 10 * 60 * 1000;
const MAX_RESPONSE_BYTES = 768 * 1024;

let domainCache = null;
let domainInflight = null;

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), maximum) : fallback;
}

function safeText(value, maximum = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function normalizedKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function walk(value, visit, depth = 0, seen = new Set(), parentKey = "") {
  if (value == null || depth > 8 || (typeof value === "object" && seen.has(value))) return;
  if (typeof value === "object") seen.add(value);
  visit(value, parentKey, depth);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1, seen, parentKey);
  } else if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) walk(item, visit, depth + 1, seen, key);
  }
}

function firstByKeys(value, aliases, maximum = 20_000) {
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

function firstArray(value, aliases) {
  const keys = new Set(aliases.map(normalizedKey));
  let found = null;
  walk(value, (node) => {
    if (found || !isObject(node)) return;
    for (const [key, item] of Object.entries(node)) {
      if (keys.has(normalizedKey(key)) && Array.isArray(item)) { found = item; break; }
    }
  });
  if (found) return found;
  if (Array.isArray(value)) return value;
  const unwrapped = unwrapPayload(value);
  if (Array.isArray(unwrapped)) return unwrapped;
  walk(unwrapped, (node) => { if (!found && Array.isArray(node)) found = node; });
  return found || [];
}

function unwrapPayload(payload) {
  let value = payload;
  const seen = new Set();
  while (isObject(value) && !seen.has(value)) {
    seen.add(value);
    const key = Object.keys(value).find((name) => ["result", "data", "payload", "response"].includes(normalizedKey(name)));
    if (!key || value[key] == null) break;
    value = value[key];
  }
  return value;
}

function normalizeDomain(value) {
  let text = safeText(value, 253).replace(/^@+/, "").toLowerCase();
  if (text.includes("@")) text = text.split("@").pop();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(text)) return "";
  return text;
}

function normalizeDomains(payload) {
  const output = [];
  const seen = new Set();
  const add = (value) => {
    const domain = normalizeDomain(value);
    if (domain && !seen.has(domain)) { seen.add(domain); output.push(domain); }
  };
  const base = unwrapPayload(payload);
  const arrays = [];
  walk(base, (node, parentKey) => {
    if (Array.isArray(node) && (!parentKey || /domain|list|item|result|data/i.test(parentKey))) arrays.push(node);
  });
  if (Array.isArray(base)) arrays.unshift(base);
  for (const rows of arrays) {
    for (const row of rows) {
      if (typeof row === "string") add(row);
      else if (isObject(row)) add(firstByKeys(row, ["domain", "name", "value", "host"], 253));
    }
  }
  if (!output.length && isObject(base)) add(firstByKeys(base, ["domain"], 253));
  return output;
}

function normalizeEmail(value) {
  const email = safeText(value, 254);
  if (!/^[^\s@]{1,64}@[^\s@]{1,189}$/.test(email)) return "";
  const separator = email.lastIndexOf("@");
  const domain = normalizeDomain(email.slice(separator + 1));
  return domain ? email.slice(0, separator) + "@" + domain : "";
}

function normalizeGeneratedEmail(payload) {
  const base = unwrapPayload(payload);
  if (typeof base === "string") return normalizeEmail(base);
  const direct = firstByKeys(base, ["email", "address", "mail", "emailAddress"], 254);
  if (normalizeEmail(direct)) return normalizeEmail(direct);
  let found = "";
  walk(base, (node) => {
    if (found || typeof node !== "string") return;
    const match = node.match(/[^\s<>"']+@[^\s<>"']+/);
    if (match) found = normalizeEmail(match[0]);
  });
  return found;
}

function stringField(object, aliases, maximum = 500) {
  if (!isObject(object)) return "";
  const keys = new Set(aliases.map(normalizedKey));
  for (const [key, value] of Object.entries(object)) {
    if (!keys.has(normalizedKey(key)) || value == null || typeof value === "object") continue;
    const text = safeText(value, maximum);
    if (text) return text;
  }
  return firstByKeys(object, aliases, maximum);
}

function normalizeMessageItem(row, index) {
  if (!isObject(row)) return null;
  const sender = stringField(row, ["sender", "from", "fromAddress", "senderEmail", "fromEmail"], 320);
  const subject = stringField(row, ["subject", "title"], 500);
  const time = stringField(row, ["date", "time", "datetime", "timestamp", "createdAt", "created_at", "receivedAt", "received_at"], 120);
  const preview = stringField(row, ["preview", "snippet", "summary", "excerpt", "text"], 500);
  const refAliases = ["link", "messageLink", "message_link", "url", "messageId", "message_id", "id", "identifier", "path"];
  const ref = stringField(row, refAliases, 2048);
  if (!sender && !subject && !time && !preview && !ref) return null;
  const item = { index };
  if (sender) item.sender = sender;
  if (subject) item.subject = subject;
  if (time) item.time = time;
  if (preview) item.preview = preview;
  if (ref) item.ref = ref;
  return item;
}

function normalizeInbox(payload) {
  const base = unwrapPayload(payload);
  const rows = firstArray(base, ["messages", "inbox", "emails", "items", "list", "mails"]);
  return rows.map(normalizeMessageItem).filter(Boolean).slice(0, 100);
}

function coarseSanitizeHtml(value) {
  return safeText(value, 100_000)
    .replace(/<\s*(script|iframe|object|embed|style|svg|math|form|base|meta|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|style|svg|math|form|base|meta|link)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript|data):[\s\S]*?\2/gi, " $1=\"#\"");
}

function extractLinks(value) {
  const links = [];
  const seen = new Set();
  const add = (candidate) => {
    const text = safeText(candidate, 2048);
    if (!/^(?:https?:\/\/|mailto:)/i.test(text) || seen.has(text)) return;
    seen.add(text); links.push(text);
  };
  const explicit = firstArray(value, ["links", "urls"]);
  for (const item of explicit) {
    if (typeof item === "string") add(item);
    else if (isObject(item)) add(stringField(item, ["url", "href", "link"], 2048));
  }
  const html = firstByKeys(value, ["html", "htmlBody", "bodyHtml", "contentHtml"], 100_000);
  for (const match of String(html).matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  return links.slice(0, 30);
}

function normalizeMessage(payload) {
  const base = unwrapPayload(payload);
  const source = isObject(base) ? base : payload;
  const sender = firstByKeys(source, ["sender", "from", "fromAddress", "senderEmail", "fromEmail"], 320);
  const subject = firstByKeys(source, ["subject", "title"], 500);
  const time = firstByKeys(source, ["date", "time", "datetime", "timestamp", "createdAt", "created_at", "receivedAt", "received_at"], 120);
  let html = firstByKeys(source, ["html", "htmlBody", "bodyHtml", "contentHtml"], 100_000);
  let text = typeof base === "string" ? safeText(base, 100_000) : firstByKeys(source, ["text", "textBody", "bodyText", "plain", "plainText", "message", "content", "body"], 100_000);
  if (!html && text && /<\/?[a-z][\s\S]*>/i.test(text)) { html = text; text = ""; }
  const output = {};
  if (sender) output.sender = sender;
  if (subject) output.subject = subject;
  if (time) output.time = time;
  if (text) output.text = text;
  if (html) output.html = coarseSanitizeHtml(html);
  const links = extractLinks(source);
  if (links.length) output.links = links;
  return output;
}

function validateInput(action, url) {
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY.has(key)) return { error: "UNSUPPORTED_PARAMETER", message: "Permintaan GenMail tidak valid." };
  }
  if (!ACTIONS.has(action)) return { error: "INVALID_ACTION", message: "Permintaan GenMail tidak dikenali." };
  const username = safeText(url.searchParams.get("username"), 65);
  const domain = normalizeDomain(url.searchParams.get("domain"));
  const email = normalizeEmail(url.searchParams.get("email"));
  const link = safeText(url.searchParams.get("link"), 2049);
  if (url.searchParams.get("username") && (!username || username.length > 64 || !/^[a-z0-9._-]+$/i.test(username))) {
    return { error: "INVALID_USERNAME", message: "Username hanya boleh memakai huruf, angka, titik, garis bawah, atau tanda minus." };
  }
  if (action === "generate" && !domain) return { error: "INVALID_DOMAIN", message: "Pilih domain yang tersedia." };
  if ((action === "inbox" || action === "message") && !email) return { error: "INVALID_EMAIL", message: "Alamat email tidak valid." };
  if (action === "message" && (!link || link.length > 2048)) return { error: "INVALID_MESSAGE_REFERENCE", message: "Pesan ini tidak memiliki informasi pembuka yang valid." };
  return { username, domain, email, link };
}

function errorStatus(error) {
  if (error?.code === "GENMAIL_TIMEOUT") return 504;
  if (error?.code === "GENMAIL_RATE_LIMITED") return 429;
  if (error?.code === "GENMAIL_NOT_FOUND") return 404;
  if (error?.code === "GENMAIL_CONFIGURATION_ERROR") return 503;
  if (error?.code === "GENMAIL_PROVIDER_REJECTED") return 400;
  return 502;
}

function publicError(error) {
  if (error?.code === "GENMAIL_TIMEOUT") return "Layanan email sementara terlalu lama merespons. Coba lagi sebentar.";
  if (error?.code === "GENMAIL_RATE_LIMITED") return "Batas request sementara tercapai. Coba lagi nanti.";
  if (error?.code === "GENMAIL_NOT_FOUND") return "Pesan yang dipilih sudah tidak tersedia.";
  if (error?.code === "GENMAIL_CONFIGURATION_ERROR") return "Layanan GenMail belum siap. Hubungi pengelola Nexora.";
  if (error?.code === "GENMAIL_PROVIDER_REJECTED") return "Data email ditolak layanan. Periksa username dan domain lalu coba lagi.";
  if (error?.code === "GENMAIL_INVALID_RESPONSE") return "Layanan email mengirim respons yang tidak dapat dibaca. Coba lagi sebentar.";
  return "Layanan email sementara sedang bermasalah. Coba lagi sebentar.";
}

function providerError(status, payload) {
  const hint = safeText(payload?.message || payload?.error?.message || payload?.error, 300).toLowerCase();
  const error = new Error("GENMAIL_UPSTREAM_FAILED");
  if (status === 429 || /rate|limit|quota|too many/.test(hint)) error.code = "GENMAIL_RATE_LIMITED";
  else if (status === 404 || /not found|tidak ditemukan/.test(hint)) error.code = "GENMAIL_NOT_FOUND";
  else if ([401, 403].includes(status) || /api.?key|unauthor|forbidden|revoked/.test(hint)) error.code = "GENMAIL_CONFIGURATION_ERROR";
  else if (status === 400) error.code = "GENMAIL_PROVIDER_REJECTED";
  else error.code = "GENMAIL_UPSTREAM_ERROR";
  return error;
}

async function upstreamRequest(action, input, runtime = {}) {
  const apiKey = safeText(process.env.KURONEKO_API_KEY, 1024);
  if (!apiKey) {
    const error = new Error("GENMAIL_CONFIGURATION_ERROR");
    error.code = "GENMAIL_CONFIGURATION_ERROR";
    throw error;
  }
  const target = new URL(UPSTREAM_URL);
  target.searchParams.set("action", action);
  for (const key of ["username", "domain", "email", "link"]) if (input[key]) target.searchParams.set(key, input[key]);
  target.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timeoutMs = positiveInteger(process.env.KURONEKO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 30_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = runtime.fetch || fetch;
    const response = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "All-Tools-Nexora-GenMail/1.0" }
    });
    const declaredLength = Number(response.headers?.get?.("content-length") || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw Object.assign(new Error("GENMAIL_INVALID_RESPONSE"), { code: "GENMAIL_INVALID_RESPONSE" });
    const raw = await response.text();
    if (!raw || Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) throw Object.assign(new Error("GENMAIL_INVALID_RESPONSE"), { code: "GENMAIL_INVALID_RESPONSE" });
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw Object.assign(new Error("GENMAIL_INVALID_RESPONSE"), { code: "GENMAIL_INVALID_RESPONSE" }); }
    if (!response.ok || payload?.status === false || payload?.success === false || payload?.ok === false) throw providerError(response.status, payload);
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("GENMAIL_TIMEOUT"), { code: "GENMAIL_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadDomains(input, runtime) {
  const cacheMs = positiveInteger(process.env.KURONEKO_DOMAIN_CACHE_MS, DEFAULT_DOMAIN_CACHE_MS, 24 * 60 * 60 * 1000);
  if (domainCache?.expiresAt > Date.now()) return { domains: domainCache.domains.slice(), cached: true };
  if (!domainInflight) {
    domainInflight = (async () => {
      const payload = await upstreamRequest("domains", input, runtime);
      const domains = normalizeDomains(payload);
      if (!domains.length) throw Object.assign(new Error("GENMAIL_INVALID_RESPONSE"), { code: "GENMAIL_INVALID_RESPONSE" });
      domainCache = { domains, expiresAt: Date.now() + cacheMs };
      return domains;
    })().finally(() => { domainInflight = null; });
  }
  return { domains: (await domainInflight).slice(), cached: false };
}

async function handleGenMail(request, response, url, runtime = {}) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "GenMail hanya menerima permintaan baca." });
  }
  const action = safeText(url.searchParams.get("action"), 24).toLowerCase();
  const input = validateInput(action, url);
  if (input.error) return send(response, 400, { ok: false, error: input.error, message: input.message });

  try {
    if (action === "domains") {
      const result = await loadDomains(input, runtime);
      return send(response, 200, { ok: true, data: { domains: result.domains }, meta: { provider: "KuroNeko", cached: result.cached } }, { cacheControl: "private, max-age=300" });
    }
    const payload = await upstreamRequest(action, input, runtime);
    if (action === "generate") {
      const email = normalizeGeneratedEmail(payload);
      if (!email) throw Object.assign(new Error("GENMAIL_INVALID_RESPONSE"), { code: "GENMAIL_INVALID_RESPONSE" });
      return send(response, 200, { ok: true, data: { email }, meta: { provider: "KuroNeko" } });
    }
    if (action === "inbox") {
      return send(response, 200, { ok: true, data: { messages: normalizeInbox(payload) }, meta: { provider: "KuroNeko" } });
    }
    const message = normalizeMessage(payload);
    if (!Object.keys(message).length) throw Object.assign(new Error("GENMAIL_INVALID_RESPONSE"), { code: "GENMAIL_INVALID_RESPONSE" });
    return send(response, 200, { ok: true, data: { message }, meta: { provider: "KuroNeko" } });
  } catch (error) {
    const code = safeText(error?.code || "GENMAIL_UPSTREAM_ERROR", 80);
    return send(response, errorStatus(error), { ok: false, error: code, message: publicError(error) });
  }
}

function resetGenMailCache() {
  domainCache = null;
  domainInflight = null;
}

module.exports = {
  ACTIONS,
  UPSTREAM_URL,
  handleGenMail,
  normalizeDomains,
  normalizeGeneratedEmail,
  normalizeInbox,
  normalizeMessage,
  normalizeEmail,
  normalizeDomain,
  coarseSanitizeHtml,
  validateInput,
  resetGenMailCache
};

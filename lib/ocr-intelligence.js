"use strict";

const crypto = require("node:crypto");

const MAX_FILE_BYTES = 1_048_576;
const MAX_BODY_BYTES = 1_550_000;
const MAX_RESPONSE_BYTES = 4_000_000;
const DEFAULT_TIMEOUT_MS = 45_000;
const MINUTE_WINDOW_MS = 60_000;
const DAY_WINDOW_MS = 24 * 60 * 60_000;
const MINUTE_LIMIT = 6;
const DAY_LIMIT = 50;
const ALLOWED_ENGINES = new Set([1, 2, 3]);
const ALLOWED_LANGUAGES = new Set([
  "auto", "ara", "bul", "chs", "cht", "hrv", "cze", "dan", "dut", "eng", "fin", "fre",
  "ger", "gre", "hun", "kor", "ita", "jpn", "pol", "por", "rus", "slv", "spa", "swe",
  "tha", "tur", "ukr", "vnm"
]);

const visitors = new Map();
const inFlight = new Map();

function positiveInteger(value, fallback, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), maximum) : fallback;
}

function safeSingleLine(value, maximum = 300) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function safeMultiline(value, maximum = 120_000) {
  return String(value == null ? "" : value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, maximum)
    .trim();
}

function errorMessage(value) {
  const rows = Array.isArray(value) ? value : [value];
  return rows.map((item) => safeSingleLine(item, 260)).filter(Boolean).join(" · ").slice(0, 500);
}

function ocrConfig(options = {}) {
  const apiKey = safeSingleLine(options.apiKey || process.env.OCR_SPACE_API_KEY, 240);
  const rawEndpoint = String(options.endpoint || process.env.OCR_SPACE_API_ENDPOINT || "https://api.ocr.space/parse/image").trim();
  let endpoint;
  try {
    const parsed = new URL(rawEndpoint);
    if (parsed.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
    endpoint = parsed.toString();
  } catch {
    endpoint = "https://api.ocr.space/parse/image";
  }
  return { apiKey, keyConfigured: Boolean(apiKey), endpoint };
}

function clientIp(request) {
  return String(request.headers?.["x-forwarded-for"] || request.headers?.["x-real-ip"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0].trim().slice(0, 80);
}

function checkRateLimit(request, now = Date.now()) {
  const key = clientIp(request);
  let row = visitors.get(key);
  if (!row || row.dayResetAt <= now) {
    row = { minuteStartedAt: now, minuteCount: 0, dayResetAt: now + DAY_WINDOW_MS, dayCount: 0 };
  }
  if (now - row.minuteStartedAt >= MINUTE_WINDOW_MS) {
    row.minuteStartedAt = now;
    row.minuteCount = 0;
  }
  row.minuteCount += 1;
  row.dayCount += 1;
  visitors.set(key, row);
  if (visitors.size > 2_000) {
    for (const [ip, entry] of visitors) if (entry.dayResetAt <= now) visitors.delete(ip);
  }
  const minuteAllowed = row.minuteCount <= MINUTE_LIMIT;
  const dayAllowed = row.dayCount <= DAY_LIMIT;
  return {
    allowed: minuteAllowed && dayAllowed,
    scope: dayAllowed ? "minute" : "day",
    retryAfter: dayAllowed
      ? Math.max(1, Math.ceil((MINUTE_WINDOW_MS - (now - row.minuteStartedAt)) / 1000))
      : Math.max(1, Math.ceil((row.dayResetAt - now) / 1000)),
    remainingMinute: Math.max(0, MINUTE_LIMIT - row.minuteCount),
    remainingDay: Math.max(0, DAY_LIMIT - row.dayCount)
  };
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > MAX_BODY_BYTES) throw Object.assign(new Error("Dokumen melewati batas payload."), { status: 413, code: "OCR_BODY_TOO_LARGE" });
    return JSON.parse(request.body || "{}");
  }
  if (Buffer.isBuffer(request.body)) {
    if (request.body.length > MAX_BODY_BYTES) throw Object.assign(new Error("Dokumen melewati batas payload."), { status: 413, code: "OCR_BODY_TOO_LARGE" });
    return JSON.parse(request.body.toString("utf8") || "{}");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Dokumen melewati batas payload."), { status: 413, code: "OCR_BODY_TOO_LARGE" });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sniffFile(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return { mime: "application/pdf", filetype: "PDF", extension: "pdf" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", filetype: "PNG", extension: "png" };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: "image/jpeg", filetype: "JPG", extension: "jpg" };
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("ascii"))) return { mime: "image/gif", filetype: "GIF", extension: "gif" };
  if (buffer.length >= 2 && buffer.subarray(0, 2).toString("ascii") === "BM") return { mime: "image/bmp", filetype: "BMP", extension: "bmp" };
  if (buffer.length >= 4) {
    const marker = buffer.subarray(0, 4).toString("hex");
    if (marker === "49492a00" || marker === "4d4d002a") return { mime: "image/tiff", filetype: "TIF", extension: "tif" };
  }
  throw Object.assign(new Error("Format belum didukung. Gunakan JPG, PNG, GIF, BMP, TIFF, atau PDF."), { status: 415, code: "OCR_FILE_TYPE_UNSUPPORTED" });
}

function decodeFile(payload) {
  const source = String(payload?.fileData || "");
  const match = source.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw Object.assign(new Error("Data file tidak valid."), { status: 400, code: "OCR_FILE_INVALID" });
  const encoded = match[2].replace(/\s+/g, "");
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 8) {
    throw Object.assign(new Error("Ukuran file maksimal 1 MB pada OCR.Space Free API."), { status: 413, code: "OCR_FILE_TOO_LARGE" });
  }
  const buffer = Buffer.from(encoded, "base64");
  const canonical = buffer.toString("base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES || canonical !== encoded) {
    if (buffer.length && buffer.length <= MAX_FILE_BYTES) throw Object.assign(new Error("Data file base64 tidak valid."), { status: 400, code: "OCR_FILE_INVALID" });
    throw Object.assign(new Error("Ukuran file maksimal 1 MB pada OCR.Space Free API."), { status: 413, code: "OCR_FILE_TOO_LARGE" });
  }
  const detected = sniffFile(buffer);
  return {
    buffer,
    ...detected,
    fileName: safeSingleLine(payload.fileName, 100) || `document.${detected.extension}`
  };
}

function normalizeOptions(payload) {
  const engine = Number(payload?.engine || 2);
  if (!ALLOWED_ENGINES.has(engine)) throw Object.assign(new Error("OCR Engine tidak valid."), { status: 400, code: "OCR_ENGINE_INVALID" });
  let language = safeSingleLine(payload?.language || "auto", 10).toLowerCase();
  if (!ALLOWED_LANGUAGES.has(language)) throw Object.assign(new Error("Bahasa OCR tidak didukung."), { status: 400, code: "OCR_LANGUAGE_INVALID" });
  if (engine === 1 && language === "auto") language = "eng";
  const searchablePdf = payload?.searchablePdf !== false;
  if (engine === 3 && searchablePdf) {
    throw Object.assign(new Error("Searchable PDF belum didukung OCR Engine 3. Gunakan Engine 2 atau nonaktifkan PDF."), { status: 400, code: "OCR_ENGINE_3_PDF_UNSUPPORTED" });
  }
  return {
    engine,
    language,
    searchablePdf,
    hideTextLayer: payload?.hideTextLayer !== false,
    tableMode: payload?.tableMode === true,
    scale: payload?.scale !== false
  };
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function tokenize(text) {
  return text.toLocaleLowerCase("und").match(/[\p{L}\p{M}][\p{L}\p{M}'’\-]*/gu) || [];
}

const LANGUAGE_WORDS = Object.freeze({
  id: new Set(["yang", "dan", "untuk", "dengan", "dari", "ini", "itu", "pada", "tidak", "adalah", "dalam", "akan", "atau", "juga", "sebagai", "karena", "saya", "kami", "anda"]),
  en: new Set(["the", "and", "for", "with", "from", "this", "that", "not", "are", "is", "was", "will", "have", "has", "your", "you", "our", "can", "into"]),
  es: new Set(["que", "para", "con", "una", "por", "los", "las", "del", "como", "esta", "este", "pero", "más", "sus", "son"]),
  fr: new Set(["les", "des", "une", "pour", "avec", "dans", "que", "est", "sont", "sur", "pas", "vous", "nous", "par"]),
  de: new Set(["der", "die", "das", "und", "für", "mit", "von", "ist", "sind", "nicht", "auf", "ein", "eine", "den"]),
  pt: new Set(["que", "para", "com", "uma", "por", "dos", "das", "não", "está", "são", "como", "mais", "seu"]),
  nl: new Set(["het", "een", "van", "voor", "met", "dat", "die", "niet", "zijn", "wordt", "deze", "maar", "ook"]),
  tr: new Set(["ve", "bir", "için", "ile", "bu", "değil", "olan", "olarak", "daha", "veya", "çok", "var"])
});

const LANGUAGE_LABELS = Object.freeze({ id: "Indonesia", en: "English", es: "Español", fr: "Français", de: "Deutsch", pt: "Português", nl: "Nederlands", tr: "Türkçe", ru: "Cyrillic / Russian", ar: "Arabic", zh: "Chinese", ja: "Japanese", ko: "Korean", th: "Thai", unknown: "Belum terdeteksi" });

function detectLanguage(text) {
  const source = String(text || "");
  const scripted = [
    ["ja", /[\u3040-\u30ff]/u], ["ko", /[\uac00-\ud7af]/u], ["th", /[\u0e00-\u0e7f]/u],
    ["ar", /[\u0600-\u06ff]/u], ["ru", /[\u0400-\u04ff]/u], ["zh", /[\u3400-\u9fff]/u]
  ].find((row) => row[1].test(source));
  if (scripted) return { code: scripted[0], label: LANGUAGE_LABELS[scripted[0]], confidence: "high", method: "local-script" };
  const words = tokenize(source).slice(0, 1_500);
  const scores = Object.entries(LANGUAGE_WORDS).map(([code, dictionary]) => ({ code, score: words.reduce((total, word) => total + (dictionary.has(word) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
  const best = scores[0] || { code: "unknown", score: 0 };
  if (best.score < 2) return { code: "unknown", label: LANGUAGE_LABELS.unknown, confidence: "low", method: "local-heuristic" };
  return { code: best.code, label: LANGUAGE_LABELS[best.code], confidence: best.score >= 6 ? "high" : "medium", method: "local-heuristic" };
}

const STOP_WORDS = new Set(["yang", "dan", "untuk", "dengan", "dari", "ini", "itu", "pada", "atau", "the", "and", "for", "with", "from", "this", "that", "are", "was", "have", "has", "que", "para", "avec", "pour", "der", "die", "das"]);

function documentStats(text, pages) {
  const source = String(text || "");
  const words = tokenize(source);
  const lines = source ? source.split(/\n/).filter((line) => line.trim()).length : 0;
  const paragraphs = source ? source.split(/\n\s*\n/).filter((row) => row.trim()).length : 0;
  const sentences = source ? source.split(/[.!?…]+(?:\s|$)/).filter((row) => row.trim()).length : 0;
  const frequencies = new Map();
  words.forEach((word) => {
    if (word.length < 4 || STOP_WORDS.has(word)) return;
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  });
  const topKeywords = [...frequencies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([word, count]) => ({ word, count }));
  return {
    pages,
    characters: source.length,
    charactersNoSpaces: source.replace(/\s/g, "").length,
    words: words.length,
    uniqueWords: new Set(words).size,
    lines,
    paragraphs,
    sentences,
    numericTokens: (source.match(/\b\d+(?:[.,]\d+)*\b/g) || []).length,
    readingTimeMinutes: words.length ? Math.max(1, Math.ceil(words.length / 200)) : 0,
    topKeywords
  };
}

async function callOcrSpace(file, options, runtime = {}) {
  const config = ocrConfig(runtime);
  if (!config.keyConfigured) throw Object.assign(new Error("OCR_SPACE_API_KEY belum dipasang di environment Vercel."), { status: 503, code: "OCR_API_KEY_MISSING" });
  const form = new FormData();
  form.append("base64Image", `data:${file.mime};base64,${file.buffer.toString("base64")}`);
  form.append("language", options.language);
  form.append("OCREngine", String(options.engine));
  form.append("filetype", file.filetype);
  form.append("detectOrientation", "true");
  form.append("scale", String(options.scale));
  form.append("isTable", String(options.tableMode));
  form.append("isOverlayRequired", "false");
  form.append("isCreateSearchablePdf", String(options.searchablePdf));
  form.append("isSearchablePdfHideTextLayer", String(options.hideTextLayer));

  const controller = new AbortController();
  const timeoutMs = positiveInteger(runtime.timeoutMs || process.env.OCR_SPACE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 55_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = runtime.fetchImpl || fetch;
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: { apikey: config.apiKey, Accept: "application/json", "User-Agent": "Nexora-OCR-Intelligence/1.0" },
      body: form,
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      const limited = response.status === 429;
      throw Object.assign(new Error(limited ? "Kuota OCR.Space sedang habis. Coba kembali setelah limit provider di-reset." : `OCR.Space merespons HTTP ${response.status}.`), { status: limited ? 429 : 502, code: limited ? "OCR_PROVIDER_LIMIT" : `OCR_UPSTREAM_${response.status}` });
    }
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw Object.assign(new Error("Respons OCR terlalu besar."), { status: 502, code: "OCR_RESPONSE_TOO_LARGE" });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_RESPONSE_BYTES) throw Object.assign(new Error("Respons OCR terlalu besar."), { status: 502, code: "OCR_RESPONSE_TOO_LARGE" });
    const payload = JSON.parse(bytes.toString("utf8") || "{}");
    const upstreamMessage = errorMessage(payload?.ErrorMessage) || errorMessage(payload?.ErrorDetails);
    if (payload?.IsErroredOnProcessing || !Array.isArray(payload?.ParsedResults)) {
      const quota = /limit|quota|maximum/i.test(upstreamMessage);
      throw Object.assign(new Error(quota ? "Kuota OCR.Space sedang habis. Coba kembali setelah limit provider di-reset." : upstreamMessage || "OCR.Space belum dapat membaca dokumen."), { status: quota ? 429 : 502, code: quota ? "OCR_PROVIDER_LIMIT" : "OCR_PROCESSING_FAILED" });
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("Proses OCR melewati batas waktu. Coba file lebih kecil atau nonaktifkan searchable PDF."), { status: 504, code: "OCR_UPSTREAM_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeResult(payload, file, options) {
  const pages = payload.ParsedResults.slice(0, 3).map((row, index) => ({
    page: index + 1,
    text: safeMultiline(row?.ParsedText),
    orientation: Number.isFinite(Number(row?.TextOrientation)) ? Number(row.TextOrientation) : 0,
    exitCode: Number.isFinite(Number(row?.FileParseExitCode)) ? Number(row.FileParseExitCode) : null,
    error: errorMessage(row?.ErrorMessage) || null
  }));
  const text = pages.map((page) => page.text).filter(Boolean).join("\n\n").slice(0, 300_000);
  if (!text) throw Object.assign(new Error("Tidak ada teks yang berhasil dikenali."), { status: 422, code: "OCR_TEXT_EMPTY" });
  const pdfUrl = options.searchablePdf ? safeHttpsUrl(payload?.SearchablePDFURL) : null;
  return {
    ok: true,
    source: "ocr-space",
    processedAt: new Date().toISOString(),
    file: { name: file.fileName, mime: file.mime, size: file.buffer.length, type: file.filetype },
    options,
    pages,
    text,
    language: detectLanguage(text),
    stats: documentStats(text, pages.length),
    searchablePdf: { requested: options.searchablePdf, available: Boolean(pdfUrl), url: pdfUrl, watermarked: Boolean(pdfUrl), textLayerHidden: options.hideTextLayer },
    processingTimeMs: Number.isFinite(Number(payload?.ProcessingTimeInMilliseconds)) ? Number(payload.ProcessingTimeInMilliseconds) : null,
    provider: { name: "OCR.Space Free API", keyConfigured: true, freeFileLimitBytes: MAX_FILE_BYTES, freePdfPageLimit: 3 }
  };
}

async function processDocument(payload, runtime = {}) {
  const file = decodeFile(payload);
  const options = normalizeOptions(payload);
  const hash = crypto.createHash("sha256").update(file.buffer).update(file.fileName).update(JSON.stringify(options)).digest("hex");
  if (!inFlight.has(hash)) {
    inFlight.set(hash, callOcrSpace(file, options, runtime).then((result) => normalizeResult(result, file, options)).finally(() => inFlight.delete(hash)));
  }
  return inFlight.get(hash);
}

function send(response, status, payload, headOnly = false) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status);
  return headOnly ? response.end() : response.json(payload);
}

async function handleOcrIntelligence(request, response, url, runtime = {}) {
  if (request.method === "GET" || request.method === "HEAD") {
    if (url.searchParams.get("health") !== "1") return send(response, 400, { ok: false, error: "OCR_HEALTH_PARAMETER_REQUIRED" }, request.method === "HEAD");
    const config = ocrConfig(runtime);
    return send(response, config.keyConfigured ? 200 : 503, {
      ok: true,
      service: "nexora-ocr-intelligence",
      configured: config.keyConfigured,
      status: config.keyConfigured ? "ready" : "configuration-required",
      provider: { name: "OCR.Space", freeFileLimitBytes: MAX_FILE_BYTES, freePdfPageLimit: 3, searchablePdf: true },
      privacy: "Uploads are proxied and not persisted by Nexora."
    }, request.method === "HEAD");
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const rate = checkRateLimit(request);
  response.setHeader("X-RateLimit-Limit", String(MINUTE_LIMIT));
  response.setHeader("X-RateLimit-Remaining", String(rate.remainingMinute));
  response.setHeader("X-RateLimit-Daily-Remaining", String(rate.remainingDay));
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    return send(response, 429, { ok: false, error: "OCR_RATE_LIMITED", scope: rate.scope, retryAfter: rate.retryAfter, message: rate.scope === "day" ? "Batas OCR harian Nexora tercapai." : "Terlalu banyak proses OCR dalam satu menit." });
  }

  try {
    const body = await readJsonBody(request);
    const result = await processDocument(body, runtime);
    return send(response, 200, result);
  } catch (error) {
    const syntax = error instanceof SyntaxError;
    const status = Number(error?.status) || (syntax ? 400 : 500);
    const code = error?.code || (syntax ? "OCR_INVALID_JSON" : "OCR_FAILED");
    if (status >= 500) console.error("[ocr-intelligence]", code, safeSingleLine(error?.message, 200));
    return send(response, status, {
      ok: false,
      error: code,
      message: status >= 500 && code === "OCR_FAILED" ? "OCR belum dapat diselesaikan." : safeSingleLine(error?.message, 500) || "OCR belum dapat diselesaikan."
    });
  }
}

function resetOcrIntelligenceState() {
  visitors.clear();
  inFlight.clear();
}

module.exports = {
  MAX_FILE_BYTES,
  callOcrSpace,
  decodeFile,
  detectLanguage,
  documentStats,
  handleOcrIntelligence,
  normalizeOptions,
  normalizeResult,
  ocrConfig,
  processDocument,
  resetOcrIntelligenceState,
  sniffFile
};

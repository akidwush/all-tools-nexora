"use strict";

const DEFAULT_TIMEOUT_MS = 70_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_SECTIONS = 5;
const MAX_TEXT_CHARS = 220_000;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

function sendJson(response, status, payload, headOnly = false) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status);
  if (headOnly) return response.end();
  return response.json(payload);
}

function finiteNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function safeFilename(value) {
  const clean = String(value || "nexora-document").trim()
    .replace(/\.pdf$/i, "")
    .normalize("NFKD")
    .replace(/[^a-z0-9 _-]+/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
  return clean || "nexora-document";
}

function normalizePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Payload JSON wajib berupa object."), { status: 400, code: "INVALID_PAYLOAD" });
  }

  if (!Array.isArray(body.sections) || body.sections.length < 1 || body.sections.length > MAX_SECTIONS) {
    throw Object.assign(new Error(`Dokumen wajib memiliki 1-${MAX_SECTIONS} bagian.`), { status: 400, code: "INVALID_SECTIONS" });
  }

  let totalChars = 0;
  const sections = body.sections.map((section, index) => {
    const title = String(section && section.title || "").trim().slice(0, 180);
    const content = String(section && section.content || "").replace(/\r\n?/g, "\n").trim();
    totalChars += title.length + content.length;
    if (content.length > 80_000) {
      throw Object.assign(new Error(`Isi bagian ${index + 1} terlalu panjang.`), { status: 413, code: "SECTION_TOO_LARGE" });
    }
    return { title, content };
  });

  if (!sections.some((section) => section.title || section.content)) {
    throw Object.assign(new Error("Masukkan judul atau isi dokumen terlebih dahulu."), { status: 400, code: "EMPTY_DOCUMENT" });
  }
  if (totalChars > MAX_TEXT_CHARS) {
    throw Object.assign(new Error("Total isi dokumen terlalu panjang."), { status: 413, code: "DOCUMENT_TOO_LARGE" });
  }

  const inputSettings = body.settings && typeof body.settings === "object" ? body.settings : {};
  const settings = {
    paperSize: ["A5", "A4"].includes(inputSettings.paperSize) ? inputSettings.paperSize : "A5",
    fontFamily: ["Helvetica", "Times-Roman"].includes(inputSettings.fontFamily) ? inputSettings.fontFamily : "Helvetica",
    fontSize: finiteNumber(inputSettings.fontSize, 11, 8, 18),
    lineHeight: finiteNumber(inputSettings.lineHeight, 1.5, 1.1, 2.2),
    margin: finiteNumber(inputSettings.margin, 42, 20, 90),
    startEachSectionOnNewPage: inputSettings.startEachSectionOnNewPage !== false
  };

  return { sections, settings, filename: safeFilename(body.filename) };
}

function getConfig() {
  const rawUrl = String(process.env.NEXORA_PDF_API_URL || "").trim();
  const apiKey = String(process.env.NEXORA_PDF_API_KEY || "").trim();
  let url = null;
  try {
    url = new URL(rawUrl);
    const localDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localDevelopment) url = null;
  } catch { url = null; }
  return {
    configured: Boolean(url && apiKey),
    url,
    apiKey,
    timeoutMs: Math.min(MAX_TIMEOUT_MS, Math.max(10_000, Number(process.env.NEXORA_PDF_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS))
  };
}

async function readLimited(response, limit) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw Object.assign(new Error("Respons PDF terlalu besar."), { code: "PDF_TOO_LARGE" });
  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > limit) throw Object.assign(new Error("Respons PDF terlalu besar."), { code: "PDF_TOO_LARGE" });
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = Buffer.from(result.value);
      size += chunk.length;
      if (size > limit) throw Object.assign(new Error("Respons PDF terlalu besar."), { code: "PDF_TOO_LARGE" });
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return Buffer.concat(chunks, size);
}

function safeProviderMessage(buffer, fallback) {
  const text = buffer.toString("utf8").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return String(parsed.message || parsed.error || fallback).slice(0, 220);
  } catch { return text.slice(0, 220); }
}

function safeDisposition(value, filename) {
  const clean = String(value || "").replace(/[\r\n]/g, "").trim();
  if (/^(?:attachment|inline)\s*;/i.test(clean) && clean.length <= 220) return clean;
  return `attachment; filename="${filename}.pdf"`;
}

async function handleTextToPdf(request, response) {
  const config = getConfig();
  const headOnly = request.method === "HEAD";
  if (request.method === "GET" || headOnly) {
    return sendJson(response, config.configured ? 200 : 503, {
      ok: config.configured,
      configured: config.configured,
      service: "nexora-auto-pdf"
    }, headOnly);
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, HEAD, POST");
    return sendJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Gunakan metode POST." });
  }
  if (!config.configured) {
    return sendJson(response, 503, { ok: false, error: "PDF_API_NOT_CONFIGURED", message: "Nexora Auto PDF belum dikonfigurasi di server." });
  }

  let payload;
  try { payload = normalizePayload(request.body); }
  catch (error) {
    return sendJson(response, error.status || 400, { ok: false, error: error.code || "INVALID_PAYLOAD", message: error.message });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const upstream = await fetch(config.url, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
        Accept: "application/pdf"
      },
      body: JSON.stringify(payload)
    });

    if (!upstream.ok) {
      const errorBody = await readLimited(upstream, 32 * 1024);
      const status = [400, 401, 403, 413, 422, 429].includes(upstream.status) ? upstream.status : 502;
      return sendJson(response, status, {
        ok: false,
        error: upstream.status === 429 ? "PDF_RATE_LIMITED" : "PDF_PROVIDER_ERROR",
        message: safeProviderMessage(errorBody, "Engine PDF menolak permintaan.")
      });
    }

    const pdf = await readLimited(upstream, MAX_PDF_BYTES);
    const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/pdf") || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return sendJson(response, 502, { ok: false, error: "INVALID_PDF_RESPONSE", message: "Engine tidak mengembalikan file PDF yang valid." });
    }

    const rawPages = String(upstream.headers.get("x-pdf-pages") || "").trim();
    const pages = /^\d{1,4}$/.test(rawPages) ? rawPages : "unknown";
    response.status(200);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", safeDisposition(upstream.headers.get("content-disposition"), payload.filename));
    response.setHeader("X-PDF-Pages", pages);
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.setHeader("Content-Length", String(pdf.length));
    return response.send(pdf);
  } catch (error) {
    const timeout = error && error.name === "AbortError";
    return sendJson(response, timeout ? 504 : 502, {
      ok: false,
      error: timeout ? "PDF_TIMEOUT" : error.code === "PDF_TOO_LARGE" ? "PDF_TOO_LARGE" : "PDF_UNAVAILABLE",
      message: timeout ? "Pembuatan PDF melewati batas waktu. Coba lagi." : error.code === "PDF_TOO_LARGE" ? error.message : "Engine PDF sedang tidak dapat dijangkau."
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { handleTextToPdf, normalizePayload, safeFilename, getConfig };

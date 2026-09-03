"use strict";

const { assertPublicUrl } = require("./audit");
const { sendJson } = require("./http-response");

const MAX_BYTES = 12 * 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 24_000;
const FINANCIAL_TOOLS = new Set(["fakebankjago", "fakedana", "fakeovo"]);
const ALLOWED_TOOLS = new Set([
  "brat",
  "iqc",
  "fakebankjago",
  "fakedana",
  "fakeovo",
  "fakedev",
  "sertifikat",
  "tanyaustadz"
]);

function clean(value, maximum = 180) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function numberText(value, fallback, { min = 0, max = 999_999_999_999 } = {}) {
  const normalized = String(value ?? "").replace(/[^0-9]/g, "");
  const number = Number(normalized || fallback);
  if (!Number.isFinite(number)) return String(fallback);
  return String(Math.max(min, Math.min(max, Math.floor(number))));
}

function normalizeClock(value) {
  const input = clean(value, 10);
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input)) return input;
  const hour = Math.max(0, Math.min(23, Number.parseInt(input, 10) || 12));
  return `${String(hour).padStart(2, "0")}:00`;
}

function boolText(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase()) ? "true" : "false";
}

function makeError(message, code = "MAKER_UPSTREAM_FAILED", status = 502) {
  return Object.assign(new Error(message), { code, status });
}

function providerUrl(base, pathname, params) {
  const url = new URL(pathname, base);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  }
  return url.href;
}

function providerCandidates(tool, url) {
  const text = clean(url.searchParams.get("text"), 500);
  const nominal = numberText(url.searchParams.get("nominal"), "100000", { max: 999_999_999_999 });
  const name = clean(url.searchParams.get("name") || url.searchParams.get("nama"), 80) || "Nexora User";
  const image = clean(url.searchParams.get("image"), 1000);

  if (tool === "brat") {
    if (!text) throw makeError("Teks BRAT wajib diisi.", "MAKER_INPUT_INVALID", 400);
    const hd = String(url.searchParams.get("style") || "").toLowerCase() === "hd";
    return [
      { provider: "Keyra", url: providerUrl("https://www.keyrafara.com", hd ? "/maker/brat-hd" : "/maker/brat", { text }) },
      { provider: "Nexray", url: providerUrl("https://api.nexray.eu.cc", "/maker/brat", { text }) }
    ];
  }

  if (tool === "iqc") {
    if (!text) throw makeError("Teks IQC wajib diisi.", "MAKER_INPUT_INVALID", 400);
    const style = String(url.searchParams.get("style") || "v1").toLowerCase();
    if (style === "simple") {
      return [
        { provider: "Keyra", url: providerUrl("https://www.keyrafara.com", "/maker/iqc", { text }) },
        { provider: "Nexray", url: providerUrl("https://api.nexray.eu.cc", "/maker/iqc", { text }) }
      ];
    }
    const provider = clean(url.searchParams.get("provider"), 24).toUpperCase() || "INDOSAT";
    const jam = normalizeClock(url.searchParams.get("jam"));
    const baterai = numberText(url.searchParams.get("baterai"), "50", { max: 100 });
    return [
      { provider: "Keyra", url: providerUrl("https://www.keyrafara.com", "/maker/iqcv1", { text, provider, jam, baterai }) },
      { provider: "Nexray", url: providerUrl("https://api.nexray.eu.cc", "/maker/v1/iqc", { text, provider, jam, baterai }) }
    ];
  }

  if (tool === "fakebankjago") {
    const saldo = numberText(url.searchParams.get("saldo") || nominal, "100000");
    return [
      { provider: "Keyra", url: providerUrl("https://www.keyrafara.com", "/maker/fakebank-jago", { nama: name, saldo }) },
      { provider: "Nexray", url: providerUrl("https://api.nexray.eu.cc", "/maker/fakebank-jago", { nama: name, saldo }) }
    ];
  }

  if (tool === "fakedana") {
    return [
      { provider: "Keyra", url: providerUrl("https://www.keyrafara.com", "/maker/fake-dana", { nominal }) },
      { provider: "Nexray", url: providerUrl("https://api.nexray.eu.cc", "/maker/fakedana", { nominal }) }
    ];
  }

  if (tool === "fakeovo") {
    return [
      { provider: "Keyra", url: providerUrl("https://www.keyrafara.com", "/maker/fake-ovo", { nominal }) }
    ];
  }

  if (tool === "fakedev") {
    if (!image || !/^https:\/\//i.test(image)) throw makeError("FakeDev membutuhkan URL foto HTTPS publik.", "MAKER_INPUT_INVALID", 400);
    return [
      { provider: "Keyra", url: providerUrl("https://www.keyrafara.com", "/maker/fakedev", { name, image, verified: boolText(url.searchParams.get("verified")) }) }
    ];
  }

  if (tool === "sertifikat") {
    const certificateText = text || name;
    if (!certificateText) throw makeError("Nama/teks sertifikat wajib diisi.", "MAKER_INPUT_INVALID", 400);
    return [
      { provider: "SiputZX", url: providerUrl("https://api.siputzx.my.id", "/api/canvas/sertifikat-tolol", { text: certificateText }) }
    ];
  }

  if (tool === "tanyaustadz") {
    if (!text) throw makeError("Pertanyaan wajib diisi.", "MAKER_INPUT_INVALID", 400);
    return [
      { provider: "Nexray", url: providerUrl("https://api.nexray.eu.cc", "/maker/ustadz", { text }) }
    ];
  }

  throw makeError("Maker tidak didukung.", "MAKER_TOOL_INVALID", 400);
}

function extractMediaUrl(value, depth = 0) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") {
    const text = value.trim();
    if (/^https:\/\//i.test(text)) return text;
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractMediaUrl(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["url", "image", "imageUrl", "image_url", "result", "data", "output", "media", "file"]) {
    if (!(key in value)) continue;
    const found = extractMediaUrl(value[key], depth + 1);
    if (found) return found;
  }
  for (const item of Object.values(value)) {
    const found = extractMediaUrl(item, depth + 1);
    if (found) return found;
  }
  return "";
}

function extractDataImage(value, depth = 0) {
  if (depth > 5 || value == null) return null;
  if (typeof value === "string") {
    const match = value.trim().match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) return null;
    const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    if (!buffer.length || buffer.length > MAX_BYTES) return null;
    return { buffer, contentType: match[1].replace("jpg", "jpeg").toLowerCase() };
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractDataImage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  for (const item of Object.values(value)) {
    const found = extractDataImage(item, depth + 1);
    if (found) return found;
  }
  return null;
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs = PROVIDER_TIMEOUT_MS, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "GET",
      redirect: options.redirect || "follow",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,application/json;q=0.9,*/*;q=0.7", ...(options.headers || {}) },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBytes(response) {
  const length = Number(response.headers?.get?.("content-length") || 0);
  if (length > MAX_BYTES) throw makeError("Hasil maker terlalu besar.", "MAKER_RESPONSE_TOO_LARGE", 502);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw makeError("Provider mengembalikan hasil kosong.");
  if (buffer.length > MAX_BYTES) throw makeError("Hasil maker terlalu besar.", "MAKER_RESPONSE_TOO_LARGE", 502);
  return buffer;
}

async function fetchPublicMedia(url, dependencies) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const assertPublicUrlImpl = dependencies.assertPublicUrlImpl || assertPublicUrl;
  let current = String(url || "");
  for (let i = 0; i < 4; i += 1) {
    const parsed = await assertPublicUrlImpl(current);
    const response = await fetchWithTimeout(fetchImpl, parsed.href, dependencies.timeoutMs, { redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      if (!next) throw makeError("Redirect media tidak valid.");
      current = new URL(next, parsed.href).href;
      continue;
    }
    if (!response.ok) throw makeError(`Media provider merespons HTTP ${response.status}.`);
    const type = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(?:png|jpeg|jpg|webp|gif|avif)$/.test(type)) throw makeError("Hasil provider bukan gambar.", "MAKER_INVALID_MEDIA", 502);
    return { buffer: await readResponseBytes(response), contentType: type.replace("image/jpg", "image/jpeg") };
  }
  throw makeError("Terlalu banyak redirect media.", "MAKER_REDIRECT_LIMIT", 502);
}

async function providerResult(candidate, dependencies) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const response = await fetchWithTimeout(fetchImpl, candidate.url, dependencies.timeoutMs);
  if (!response.ok) throw makeError(`${candidate.provider} merespons HTTP ${response.status}.`);
  const type = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (/^image\/(?:png|jpeg|jpg|webp|gif|avif)$/.test(type)) {
    return { buffer: await readResponseBytes(response), contentType: type.replace("image/jpg", "image/jpeg"), provider: candidate.provider };
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw makeError(`${candidate.provider} tidak mengembalikan gambar/JSON yang valid.`); }
  const dataImage = extractDataImage(payload);
  if (dataImage) return { ...dataImage, provider: candidate.provider };
  const mediaUrl = extractMediaUrl(payload);
  if (!mediaUrl) {
    const message = clean(payload?.error?.message || payload?.message || payload?.error, 240);
    throw makeError(message || `${candidate.provider} tidak memberikan URL gambar.`);
  }
  const media = await fetchPublicMedia(mediaUrl, dependencies);
  return { ...media, provider: candidate.provider };
}

function safeXmlText(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
}

function financialSimulationSvg(result, tool) {
  const mime = /^image\//.test(result.contentType) ? result.contentType : "image/png";
  const data = `data:${mime};base64,${result.buffer.toString("base64")}`;
  const label = tool === "fakebankjago" ? "BANK JAGO" : tool === "fakedana" ? "DANA" : "OVO";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><image href="${safeXmlText(data)}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid meet"/><g transform="rotate(-24 540 960)" opacity="0.88"><rect x="-180" y="825" width="1440" height="270" rx="28" fill="#0b0b10"/><text x="540" y="925" text-anchor="middle" font-family="Arial,sans-serif" font-size="92" font-weight="900" fill="#fff">SIMULASI / PRANK</text><text x="540" y="1025" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#fff">${label} · BUKAN BUKTI TRANSAKSI</text></g></svg>`;
  return { buffer: Buffer.from(svg), contentType: "image/svg+xml; charset=utf-8" };
}

function sendImage(response, result, { headOnly = false, tool = "" } = {}) {
  const output = FINANCIAL_TOOLS.has(tool) ? financialSimulationSvg(result, tool) : result;
  response.setHeader("Content-Type", output.contentType || "image/png");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Disposition", "inline");
  response.setHeader("X-Nexora-Maker-Provider", result.provider || "unknown");
  response.setHeader("X-Nexora-Maker-Original", "1");
  if (FINANCIAL_TOOLS.has(tool)) response.setHeader("X-Nexora-Simulation-Watermark", "required");
  response.setHeader("Content-Length", String(output.buffer.length));
  response.status(200);
  if (headOnly) return response.end();
  return typeof response.send === "function" ? response.send(output.buffer) : response.end(output.buffer);
}

async function handleMakerOriginal(request, response, requestUrl, dependencies = {}) {
  if (!requestUrl) {
    const origin = `https://${String(request?.headers?.host || "localhost")}`;
    requestUrl = new URL(request?.url || "/api/tool-health?mode=maker-original", origin);
  }
  if (!['GET', 'HEAD'].includes(String(request.method || 'GET').toUpperCase())) {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    return sendJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Gunakan GET." });
  }
  const tool = clean(requestUrl.searchParams.get("tool"), 40).toLowerCase();
  if (!ALLOWED_TOOLS.has(tool)) return sendJson(response, 400, { ok: false, error: "MAKER_TOOL_INVALID", message: "Maker tidak didukung." });
  try {
    const candidates = providerCandidates(tool, requestUrl);
    const failures = [];
    for (const candidate of candidates) {
      try {
        const result = await providerResult(candidate, dependencies);
        return sendImage(response, result, { headOnly: String(request.method).toUpperCase() === "HEAD", tool });
      } catch (error) {
        failures.push(`${candidate.provider}: ${clean(error.message, 160)}`);
      }
    }
    const special = tool === "sertifikat"
      ? "Sumber sertifikat original sedang offline. Nexora tidak mengganti hasil dengan template lokal palsu."
      : "Semua provider original sedang gagal. Nexora tidak membuat hasil lokal pengganti yang menyerupai sukses.";
    return sendJson(response, 502, { ok: false, error: "MAKER_UPSTREAM_FAILED", message: special, providers: failures });
  } catch (error) {
    return sendJson(response, Math.max(400, Math.min(599, Number(error.status || 500))), {
      ok: false,
      error: error.code || "MAKER_FAILED",
      message: error.message || "Maker gagal diproses."
    });
  }
}

module.exports = {
  ALLOWED_TOOLS,
  FINANCIAL_TOOLS,
  extractDataImage,
  extractMediaUrl,
  financialSimulationSvg,
  handleMakerOriginal,
  normalizeClock,
  providerCandidates,
  providerResult
};

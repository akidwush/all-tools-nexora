"use strict";

const { assertPublicUrl } = require("./audit");
const { sendJson } = require("./http-response");

const MAX_BYTES = 12 * 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 24_000;
const FINANCIAL_TOOLS = new Set(["fakeovo"]);
const ALLOWED_TOOLS = new Set(["fakeovo", "sertifikat"]);

function clean(value, maximum = 180) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}
function numberText(value, fallback, { min = 0, max = 999_999_999_999 } = {}) {
  const normalized = String(value ?? "").replace(/[^0-9]/g, "");
  const number = Number(normalized || fallback);
  if (!Number.isFinite(number)) return String(fallback);
  return String(Math.max(min, Math.min(max, Math.floor(number))));
}
function makeError(message, code = "MAKER_UPSTREAM_FAILED", status = 502) { return Object.assign(new Error(message), { code, status }); }
function providerUrl(base, pathname, params) {
  const url = new URL(pathname, base);
  for (const [key, value] of Object.entries(params || {})) if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  return url.href;
}
function providerCandidates(tool, url) {
  const text = clean(url.searchParams.get("text"), 500);
  if (tool === "fakeovo") {
    const nominal = numberText(url.searchParams.get("nominal"), "100000");
    return [{ provider: "Keyra", url: providerUrl("https://www.keyrafara.com", "/maker/fake-ovo", { nominal }) }];
  }
  if (tool === "sertifikat") {
    const certificateText = text || clean(url.searchParams.get("name") || url.searchParams.get("nama"), 180);
    if (!certificateText) throw makeError("Nama/teks sertifikat wajib diisi.", "MAKER_INPUT_INVALID", 400);
    return [{ provider: "SiputZX", url: providerUrl("https://api.siputzx.my.id", "/api/canvas/sertifikat-tolol", { text: certificateText }) }];
  }
  throw makeError("Maker tidak didukung.", "MAKER_TOOL_INVALID", 400);
}
function extractMediaUrl(value, depth = 0) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") return /^https:\/\//i.test(value.trim()) ? value.trim() : "";
  if (Array.isArray(value)) { for (const item of value) { const found = extractMediaUrl(item, depth + 1); if (found) return found; } return ""; }
  if (typeof value !== "object") return "";
  for (const key of ["url","image","imageUrl","image_url","result","data","output","media","file"]) if (key in value) { const found = extractMediaUrl(value[key], depth + 1); if (found) return found; }
  for (const item of Object.values(value)) { const found = extractMediaUrl(item, depth + 1); if (found) return found; }
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
  if (Array.isArray(value)) { for (const item of value) { const found = extractDataImage(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== "object") return null;
  for (const item of Object.values(value)) { const found = extractDataImage(item, depth + 1); if (found) return found; }
  return null;
}
async function fetchWithTimeout(fetchImpl, url, timeoutMs = PROVIDER_TIMEOUT_MS, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { method: "GET", redirect: options.redirect || "follow", headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,application/json;q=0.9,*/*;q=0.7", ...(options.headers || {}) }, signal: controller.signal }); }
  finally { clearTimeout(timer); }
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
    if ([301,302,303,307,308].includes(response.status)) { const next = response.headers.get("location"); if (!next) throw makeError("Redirect media tidak valid."); current = new URL(next, parsed.href).href; continue; }
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
  if (/^image\/(?:png|jpeg|jpg|webp|gif|avif)$/.test(type)) return { buffer: await readResponseBytes(response), contentType: type.replace("image/jpg", "image/jpeg"), provider: candidate.provider };
  let payload; try { payload = await response.json(); } catch { throw makeError(`${candidate.provider} tidak mengembalikan gambar/JSON yang valid.`); }
  const dataImage = extractDataImage(payload); if (dataImage) return { ...dataImage, provider: candidate.provider };
  const mediaUrl = extractMediaUrl(payload); if (!mediaUrl) throw makeError(clean(payload?.error?.message || payload?.message || payload?.error, 240) || `${candidate.provider} tidak memberikan URL gambar.`);
  const media = await fetchPublicMedia(mediaUrl, dependencies); return { ...media, provider: candidate.provider };
}
function safeXmlText(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c])); }
function financialSimulationSvg(result) {
  const mime = /^image\//.test(result.contentType) ? result.contentType : "image/png";
  const data = `data:${mime};base64,${result.buffer.toString("base64")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><image href="${safeXmlText(data)}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid meet"/><g opacity="0.72"><rect x="830" y="1834" width="210" height="52" rx="18" fill="#0b0b10"/><text x="935" y="1868" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="800" fill="#fff">SIMULASI</text></g></svg>`;
  return { buffer: Buffer.from(svg), contentType: "image/svg+xml; charset=utf-8" };
}
function sendImage(response, result, { headOnly = false, tool = "" } = {}) {
  const output = FINANCIAL_TOOLS.has(tool) ? financialSimulationSvg(result) : result;
  response.setHeader("Content-Type", output.contentType || "image/png");
  response.setHeader("Cache-Control", "no-store, max-age=0"); response.setHeader("Content-Disposition", "inline");
  response.setHeader("X-Nexora-Maker-Provider", result.provider || "unknown"); response.setHeader("X-Nexora-Maker-Original", "1");
  if (FINANCIAL_TOOLS.has(tool)) response.setHeader("X-Nexora-Simulation-Watermark", "minimal");
  response.setHeader("Content-Length", String(output.buffer.length)); response.status(200);
  if (headOnly) return response.end(); return typeof response.send === "function" ? response.send(output.buffer) : response.end(output.buffer);
}
async function handleMakerOriginal(request, response, requestUrl, dependencies = {}) {
  if (!requestUrl) requestUrl = new URL(request?.url || "/api/tool-health?mode=maker-original", `https://${String(request?.headers?.host || "localhost")}`);
  if (!["GET","HEAD"].includes(String(request.method || "GET").toUpperCase())) { response.setHeader("Allow", "GET, HEAD, OPTIONS"); return sendJson(response, 405, { ok:false,error:"METHOD_NOT_ALLOWED",message:"Gunakan GET." }); }
  const tool = clean(requestUrl.searchParams.get("tool"), 40).toLowerCase();
  if (!ALLOWED_TOOLS.has(tool)) return sendJson(response, 400, { ok:false,error:"MAKER_TOOL_INVALID",message:"Maker tidak didukung." });
  try {
    const candidates = providerCandidates(tool, requestUrl), failures = [];
    for (const candidate of candidates) { try { const result = await providerResult(candidate, dependencies); return sendImage(response, result, { headOnly:String(request.method).toUpperCase()==="HEAD", tool }); } catch (error) { failures.push(`${candidate.provider}: ${clean(error.message,160)}`); } }
    const special = tool === "sertifikat" ? "Sumber sertifikat original sedang offline. Nexora tidak mengganti hasil dengan template lokal palsu." : "Provider Fake OVO sedang tidak tersedia.";
    return sendJson(response, 502, { ok:false,error:"MAKER_UPSTREAM_FAILED",message:special,providers:failures });
  } catch (error) { return sendJson(response, Math.max(400,Math.min(599,Number(error.status||500))), { ok:false,error:error.code||"MAKER_FAILED",message:error.message||"Maker gagal diproses." }); }
}
module.exports = { ALLOWED_TOOLS, FINANCIAL_TOOLS, extractDataImage, extractMediaUrl, financialSimulationSvg, handleMakerOriginal, providerCandidates, providerResult };

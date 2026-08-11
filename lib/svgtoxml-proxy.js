const DEFAULT_BASE = "https://svgtoxml.vercel.app";
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 30000;

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function getConfig() {
  return {
    apiKey: String(process.env.SVGTOXML_API_KEY || "").trim(),
    baseUrl: String(process.env.SVGTOXML_API_BASE_URL || DEFAULT_BASE).trim().replace(/\/+$/, "")
  };
}

function safeSvg(value) {
  const svg = String(value || "");
  const bytes = Buffer.byteLength(svg, "utf8");
  if (!svg.trim()) throw Object.assign(new Error("SVG kosong."), { status: 400, code: "EMPTY_SVG" });
  if (bytes > MAX_SVG_BYTES) throw Object.assign(new Error("SVG maksimal 2 MB."), { status: 413, code: "SVG_TOO_LARGE" });
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg)) throw Object.assign(new Error("Input bukan dokumen SVG valid."), { status: 400, code: "INVALID_SVG" });
  return svg;
}

async function requestUpstream(path, init = {}) {
  const { apiKey, baseUrl } = getConfig();
  if (!apiKey) throw Object.assign(new Error("SVGTOXML_API_KEY belum dikonfigurasi di Vercel."), { status: 503, code: "SVGTOXML_NOT_CONFIGURED" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.SVGTOXML_TIMEOUT_MS) || TIMEOUT_MS);
  try {
    const response = await fetch(baseUrl + path, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...(init.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `SVG→XML API HTTP ${response.status}`);
      error.status = response.status === 401 || response.status === 403 ? 502 : response.status;
      error.code = data?.code || `SVGTOXML_${response.status}`;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("SVG→XML API timeout."), { status: 504, code: "SVGTOXML_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractXml(data) {
  const candidates = [data?.xml, data?.result?.xml, data?.data?.xml, data?.output, data?.result, data?.data];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().startsWith("<")) return value;
  }
  return null;
}

async function handleSvgToXml(request, response) {
  if (request.method === "GET") {
    const { apiKey, baseUrl } = getConfig();
    return send(response, 200, { ok: true, configured: Boolean(apiKey), service: "svgtoxml-alight", baseUrl });
  }
  if (request.method !== "POST") return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  try {
    const svg = safeSvg(request.body?.svg);
    const options = { quality: "lossless", ...(request.body?.options && typeof request.body.options === "object" ? request.body.options : {}) };
    // Public API docs explicitly demonstrate quality=lossless. Unknown options are not invented here.
    const data = await requestUpstream("/api/v1/convert", {
      method: "POST",
      body: JSON.stringify({ svg, options })
    });
    const xml = extractXml(data);
    if (!xml) throw Object.assign(new Error("API tidak mengembalikan XML yang dapat dibaca Nexora."), { status: 502, code: "XML_MISSING" });
    return send(response, 200, { ok: true, xml, meta: data?.meta || data?.stats || null });
  } catch (error) {
    console.error("[svgtoxml-proxy]", error?.code || error?.message || error);
    return send(response, Number(error?.status) || 500, { ok: false, error: error?.code || "SVGTOXML_FAILED", message: error?.message || "Konversi SVG ke XML gagal." });
  }
}

module.exports = { handleSvgToXml, extractXml, safeSvg };

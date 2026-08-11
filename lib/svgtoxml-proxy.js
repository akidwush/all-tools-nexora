const DEFAULT_BASE = "https://svgtoxml.vercel.app";
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 30000;
const QUALITY_MODES = new Set(["lossless", "accurate", "balanced", "lightweight"]);

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function getConfig() {
  return {
    apiKey: String(process.env.SVGTOXML_API_KEY || "").trim(),
    baseUrl: String(process.env.SVGTOXML_API_BASE_URL || process.env.SVGTOXML_ENGINE_URL || DEFAULT_BASE).trim().replace(/\/+$/, "")
  };
}

function safeSvg(value) {
  const svg = String(value || "");
  const size = Buffer.byteLength(svg, "utf8");
  if (!svg.trim()) throw Object.assign(new Error("SVG kosong."), { status: 400, code: "EMPTY_SVG" });
  if (size > MAX_SVG_BYTES) throw Object.assign(new Error("SVG maksimal 2 MB."), { status: 413, code: "SVG_TOO_LARGE" });
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg)) throw Object.assign(new Error("Input bukan dokumen SVG valid."), { status: 400, code: "INVALID_SVG" });
  return svg;
}

function numberOption(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function normalizeOptions(input) {
  const raw = input && typeof input === "object" ? input : {};
  const quality = QUALITY_MODES.has(String(raw.quality || "").toLowerCase()) ? String(raw.quality).toLowerCase() : "lossless";

  if (quality === "lossless") {
    return { ...raw, quality:"lossless", maxShapes:5000, minAreaPercent:0, precision:8, nodeReduction:0, groupByColor:false, removeStrokes:false, validateBounds:true };
  }

  const defaults = {
    accurate:{maxShapes:5000,minAreaPercent:0,precision:5,nodeReduction:35},
    balanced:{maxShapes:2500,minAreaPercent:0.0002,precision:4,nodeReduction:50},
    lightweight:{maxShapes:1000,minAreaPercent:0.001,precision:3,nodeReduction:65}
  }[quality];

  return {
    ...raw,
    quality,
    maxShapes:Math.round(numberOption(raw.maxShapes,defaults.maxShapes,1,5000)),
    minAreaPercent:numberOption(raw.minAreaPercent,defaults.minAreaPercent,0,5),
    precision:Math.round(numberOption(raw.precision,defaults.precision,0,8)),
    nodeReduction:Math.round(numberOption(raw.nodeReduction,defaults.nodeReduction,0,80)),
    groupByColor:true,
    removeStrokes:true,
    validateBounds:Boolean(raw.validateBounds)
  };
}

async function requestUpstream(path, init = {}) {
  const { apiKey, baseUrl } = getConfig();
  if (!apiKey) throw Object.assign(new Error("SVGTOXML_API_KEY belum dikonfigurasi di Vercel."), { status:503, code:"SVGTOXML_NOT_CONFIGURED" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.SVGTOXML_TIMEOUT_MS) || TIMEOUT_MS);
  try {
    const response = await fetch(baseUrl + path, {
      ...init,
      headers:{ Accept:"application/json","Content-Type":"application/json","x-api-key":apiKey,...(init.headers||{}) },
      signal:controller.signal
    });
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `SVG→XML API HTTP ${response.status}`);
      error.status = response.status === 401 || response.status === 403 ? 502 : response.status;
      error.code = data?.code || `SVGTOXML_${response.status}`;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("SVG→XML API timeout."), { status:504, code:"SVGTOXML_TIMEOUT" });
    throw error;
  } finally { clearTimeout(timer); }
}

function extractXml(data) {
  const candidates=[data?.xml,data?.result?.xml,data?.data?.xml,data?.output,data?.result,data?.data];
  for(const value of candidates) if(typeof value==="string"&&value.trim().startsWith("<")) return value;
  return null;
}

async function handleSvgToXml(request, response) {
  if (request.method === "GET") {
    const { apiKey, baseUrl } = getConfig();
    return send(response,200,{ok:true,configured:Boolean(apiKey),service:"svgtoxml-alight",baseUrl,modes:["lossless","accurate","balanced","lightweight"]});
  }
  if (request.method !== "POST") return send(response,405,{ok:false,error:"METHOD_NOT_ALLOWED"});

  try {
    const svg=safeSvg(request.body?.svg);
    const options=normalizeOptions(request.body?.options);
    const data=await requestUpstream("/api/v1/convert",{method:"POST",body:JSON.stringify({svg,options})});
    const xml=extractXml(data);
    if(!xml) throw Object.assign(new Error("API tidak mengembalikan XML yang dapat dibaca Nexora."),{status:502,code:"XML_MISSING"});
    return send(response,200,{
      ok:true,
      xml,
      profile:data?.profile||{quality:options.quality},
      stats:data?.stats||data?.meta||null,
      validation:data?.validation||null,
      warnings:Array.isArray(data?.warnings)?data.warnings:[],
      options
    });
  } catch(error) {
    console.error("[svgtoxml-proxy]",error?.code||error?.message||error);
    return send(response,Number(error?.status)||500,{ok:false,error:error?.code||"SVGTOXML_FAILED",message:error?.message||"Konversi SVG ke XML gagal."});
  }
}

module.exports={handleSvgToXml,extractXml,safeSvg,normalizeOptions};
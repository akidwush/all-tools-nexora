const DEFAULT_BASE = "https://svgtoxml.vercel.app";
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 30000;
const QUALITY_MODES = new Set(["optimized", "lossless", "accurate", "balanced", "lightweight"]);

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function getConfig() {
  const engineKey = String(process.env.SVGTOXML_ENGINE_KEY || "").trim();
  const legacyKey = String(process.env.SVGTOXML_API_KEY || "").trim();
  const config = {
    apiKey: engineKey || legacyKey,
    keyVariable: engineKey ? "SVGTOXML_ENGINE_KEY" : (legacyKey ? "SVGTOXML_API_KEY" : null),
    baseUrl: String(process.env.SVGTOXML_API_BASE_URL || process.env.SVGTOXML_ENGINE_URL || DEFAULT_BASE).trim().replace(/\/+$/, "")
  };
  if (!/^https:\/\//i.test(config.baseUrl)) {
    throw Object.assign(new Error("SVGTOXML_API_BASE_URL harus menggunakan HTTPS."), { status: 500, code: "SVGTOXML_INVALID_BASE_URL" });
  }
  return config;
}

function stripSvgPreamble(value) {
  let source = String(value || "").replace(/^\uFEFF/, "");
  let changed = true;
  while (changed) {
    changed = false;
    source = source.replace(/^\s+/, "");
    const declaration = source.match(/^<\?xml[\s\S]*?\?>/i);
    if (declaration) {
      source = source.slice(declaration[0].length);
      changed = true;
      continue;
    }
    const comment = source.match(/^<!--[\s\S]*?-->/);
    if (comment) {
      source = source.slice(comment[0].length);
      changed = true;
      continue;
    }
    if (/^<!doctype\b/i.test(source)) {
      let quote = "";
      let subsetDepth = 0;
      let end = -1;
      for (let index = 9; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
          if (char === quote) quote = "";
          continue;
        }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === "[") { subsetDepth += 1; continue; }
        if (char === "]" && subsetDepth > 0) { subsetDepth -= 1; continue; }
        if (char === ">" && subsetDepth === 0) { end = index + 1; break; }
      }
      if (end < 0) return "";
      source = source.slice(end);
      changed = true;
    }
  }
  return source.trimStart();
}

function safeSvg(value) {
  const svg = String(value || "");
  const size = Buffer.byteLength(svg, "utf8");
  if (!svg.trim()) throw Object.assign(new Error("SVG kosong."), { status: 400, code: "EMPTY_SVG" });
  if (size > MAX_SVG_BYTES) throw Object.assign(new Error("SVG maksimal 2 MB."), { status: 413, code: "SVG_TOO_LARGE" });
  if (/<!ENTITY\b/i.test(svg)) throw Object.assign(new Error("Deklarasi ENTITY pada SVG tidak diizinkan."), { status: 400, code: "UNSAFE_SVG_ENTITY" });
  const normalized = stripSvgPreamble(svg);
  if (!/^<svg\b/i.test(normalized)) throw Object.assign(new Error("Input bukan dokumen SVG valid."), { status: 400, code: "INVALID_SVG" });
  return normalized;
}

function numberOption(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function normalizeOptions(input) {
  const raw = input && typeof input === "object" ? input : {};
  const quality = QUALITY_MODES.has(String(raw.quality || "").toLowerCase()) ? String(raw.quality).toLowerCase() : "optimized";

  if (quality === "lossless") {
    return { ...raw, quality:"lossless", maxShapes:5000, minAreaPercent:0, precision:8, nodeReduction:0, microDetailPercent:0, maxOutputGroups:1200, groupByColor:false, removeStrokes:false, validateBounds:true };
  }

  if (quality === "optimized") {
    return {
      ...raw,
      quality:"optimized",
      maxShapes:Math.round(numberOption(raw.maxShapes,3000,1,5000)),
      minAreaPercent:numberOption(raw.minAreaPercent,0.0004,0,5),
      precision:Math.round(numberOption(raw.precision,4,3,8)),
      nodeReduction:Math.round(numberOption(raw.nodeReduction,38,0,80)),
      microDetailPercent:numberOption(raw.microDetailPercent,0.0015,0,0.25),
      maxOutputGroups:Math.round(numberOption(raw.maxOutputGroups,320,20,1200)),
      groupByColor:true,
      removeStrokes:false,
      validateBounds:false
    };
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
    microDetailPercent:0,
    maxOutputGroups:1200,
    groupByColor:true,
    removeStrokes:true,
    validateBounds:Boolean(raw.validateBounds)
  };
}

async function requestUpstream(path, init = {}) {
  const { apiKey, baseUrl } = getConfig();
  if (!apiKey) throw Object.assign(new Error("SVGTOXML_ENGINE_KEY belum dikonfigurasi di Vercel."), { status:503, code:"SVGTOXML_NOT_CONFIGURED" });
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

async function handleSvgToXml(request, response, requestUrl) {
  if (request.method === "GET") {
    try {
      const { apiKey, baseUrl, keyVariable } = getConfig();
      const url = requestUrl instanceof URL ? requestUrl : new URL(request.url || "/api/svg-alight", "http://localhost");
      const verify = url.searchParams.get("verify") === "1";
      if (!apiKey || !verify) {
        return send(response,200,{ok:true,configured:Boolean(apiKey),authorized:null,keyVariable,service:"svgtoxml-alight",baseUrl,modes:["optimized","lossless","accurate","balanced","lightweight"]});
      }
      const auth = await requestUpstream("/api/v1/auth",{method:"GET"});
      return send(response,200,{ok:true,configured:true,authorized:auth?.ok !== false,keyVariable,service:"svgtoxml-alight",baseUrl,modes:["optimized","lossless","accurate","balanced","lightweight"]});
    } catch(error) {
      return send(response,Number(error?.status)||502,{ok:false,configured:true,authorized:false,error:error?.code||"SVGTOXML_AUTH_FAILED",message:error?.message||"Verifikasi API key SVG→XML gagal."});
    }
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
      width:Number(data?.width)||null,
      height:Number(data?.height)||null,
      fidelity:data?.fidelity||null,
      validation:data?.validation||null,
      warnings:Array.isArray(data?.warnings)?data.warnings:[],
      options
    });
  } catch(error) {
    console.error("[svgtoxml-proxy]",error?.code||error?.message||error);
    return send(response,Number(error?.status)||500,{ok:false,error:error?.code||"SVGTOXML_FAILED",message:error?.message||"Konversi SVG ke XML gagal."});
  }
}

module.exports={handleSvgToXml,extractXml,safeSvg,stripSvgPreamble,normalizeOptions};

const API_BASE = "https://api.freeconvert.com/v1";
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20000;

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function cleanName(value, fallback = "image") {
  const name = String(value || fallback).replace(/[\\/\0]/g, "-").replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 100);
  return name || fallback;
}

function normalizeFormat(value) {
  const fmt = String(value || "").toLowerCase().replace("jpeg", "jpg");
  return fmt === "png" || fmt === "jpg" ? fmt : null;
}

function apiKey() { return String(process.env.FREECONVERT_API_KEY || "").trim(); }

async function freeConvert(path, options = {}) {
  const key = apiKey();
  if (!key) {
    const error = new Error("FREECONVERT_API_KEY belum dikonfigurasi di Vercel.");
    error.code = "FREECONVERT_NOT_CONFIGURED";
    error.status = 503;
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.FREECONVERT_TIMEOUT_MS) || REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!response.ok) {
      const error = new Error(data?.message || data?.msg || `FreeConvert HTTP ${response.status}`);
      error.code = data?.error || data?.code || `FREECONVERT_${response.status}`;
      error.status = response.status === 401 ? 502 : response.status === 402 ? 429 : response.status === 429 ? 429 : 502;
      error.upstreamStatus = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("FreeConvert tidak merespons tepat waktu.");
      timeout.code = "FREECONVERT_TIMEOUT";
      timeout.status = 504;
      throw timeout;
    }
    throw error;
  } finally { clearTimeout(timer); }
}

function taskId(task) { return String(task?.id || task?._id || task?.task_id || ""); }
function taskStatus(task) { return String(task?.status || "").toLowerCase(); }
function taskError(task) { return task?.result?.msg || task?.result?.message || task?.message || "Proses FreeConvert gagal."; }

function findUploadForm(task) {
  const form = task?.result?.form;
  if (!form?.url || !form?.parameters) return null;
  return { url: String(form.url), parameters: form.parameters };
}

function findExportUrl(value, depth = 0) {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string" && /^https:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findExportUrl(item, depth + 1); if (found) return found; }
    return null;
  }
  if (typeof value === "object") {
    for (const key of ["url", "download_url", "downloadUrl"]) {
      if (typeof value[key] === "string" && /^https:\/\//i.test(value[key])) return value[key];
    }
    for (const key of Object.keys(value)) { const found = findExportUrl(value[key], depth + 1); if (found) return found; }
  }
  return null;
}

async function prepareUpload(body) {
  const format = normalizeFormat(body?.format);
  const size = Number(body?.size || 0);
  if (!format) throw Object.assign(new Error("Format hanya PNG atau JPG."), { status: 400, code: "INVALID_FORMAT" });
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) throw Object.assign(new Error("Ukuran file harus 1 byte sampai 12 MB."), { status: 400, code: "INVALID_FILE_SIZE" });
  const task = await freeConvert("/process/import/upload", { method: "POST", body: JSON.stringify({}) });
  const form = findUploadForm(task);
  const id = taskId(task);
  if (!form || !id) throw Object.assign(new Error("FreeConvert tidak mengembalikan form upload yang valid."), { status: 502, code: "INVALID_UPLOAD_FORM" });
  return { taskId: id, upload: form, format, filename: cleanName(body?.filename, `image.${format}`) };
}

async function getConvertOptionCatalog(format) {
  const query = `/query/options/convert?input_format=${encodeURIComponent(format)}&output_format=svg`;
  try {
    const data = await freeConvert(query, { method: "GET" });
    return Array.isArray(data?.options) ? data.options : [];
  } catch (error) {
    console.warn("[freeconvert-vectorizer] advanced options unavailable", error?.code || error?.message || error);
    return [];
  }
}

function optionNameByIntent(catalog, intent) {
  const rows = Array.isArray(catalog) ? catalog : [];
  const tests = intent === "colors"
    ? [/number.*color/i, /color.*count/i, /colors?$/i, /max.*colors?/i]
    : [/smooth/i, /smoothing/i];
  for (const test of tests) {
    const row = rows.find((item) => test.test(String(item?.name || "")) || test.test(String(item?.hint || "")));
    if (row?.name) return String(row.name);
  }
  return null;
}

function coerceOptionValue(meta, value) {
  if (!meta) return value;
  const type = String(meta.data_type || "").toLowerCase();
  if (type === "integer" || type === "int") return Math.round(Number(value));
  if (type === "number" || type === "float" || type === "double") return Number(value);
  if (type === "boolean") return Boolean(value);
  return String(value);
}

function buildAdvancedOptions(catalog, tuning) {
  const options = {};
  const colorName = optionNameByIntent(catalog, "colors");
  const smoothName = optionNameByIntent(catalog, "smoothness");
  if (colorName && Number.isFinite(Number(tuning?.colorCount))) {
    const meta = catalog.find((item) => item?.name === colorName);
    options[colorName] = coerceOptionValue(meta, Math.max(2, Math.min(256, Number(tuning.colorCount))));
  }
  if (smoothName && Number.isFinite(Number(tuning?.smoothness))) {
    const meta = catalog.find((item) => item?.name === smoothName);
    options[smoothName] = coerceOptionValue(meta, Math.max(0, Math.min(100, Number(tuning.smoothness))));
  }
  return options;
}

async function startConversion(body) {
  const importTaskId = String(body?.importTaskId || "").trim();
  const format = normalizeFormat(body?.format);
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(importTaskId) || !format) throw Object.assign(new Error("Task upload atau format tidak valid."), { status: 400, code: "INVALID_TASK" });
  const baseName = cleanName(body?.filename, "image").replace(/\.[^.]+$/, "") || "image";
  const catalog = await getConvertOptionCatalog(format);
  const options = buildAdvancedOptions(catalog, body?.tuning);
  const convertPayload = { input: importTaskId, input_format: format, output_format: "svg" };
  if (Object.keys(options).length) convertPayload.options = options;
  const convert = await freeConvert("/process/convert", {
    method: "POST",
    body: JSON.stringify(convertPayload)
  });
  const convertId = taskId(convert);
  if (!convertId) throw Object.assign(new Error("Task konversi tidak dibuat."), { status: 502, code: "CONVERT_TASK_MISSING" });
  const exported = await freeConvert("/process/export/url", {
    method: "POST",
    body: JSON.stringify({ input: [convertId], filename: `${baseName}-nexora.svg`, archive_multiple_files: false })
  });
  const exportId = taskId(exported);
  if (!exportId) throw Object.assign(new Error("Task export tidak dibuat."), { status: 502, code: "EXPORT_TASK_MISSING" });
  return { convertTaskId: convertId, exportTaskId: exportId };
}

async function fetchResult(taskIdValue) {
  const id = String(taskIdValue || "").trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw Object.assign(new Error("Task ID tidak valid."), { status: 400, code: "INVALID_TASK" });
  const task = await freeConvert(`/process/tasks/${encodeURIComponent(id)}`, { method: "GET" });
  const status = taskStatus(task);
  if (["failed", "error", "canceled", "cancelled", "deleted"].includes(status)) {
    return { status: "failed", message: taskError(task), errorCode: task?.result?.errorCode || null };
  }
  const url = findExportUrl(task?.result);
  if (!url) return { status: status || "processing" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new Error(`SVG download HTTP ${response.status}`);
    const svg = await response.text();
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg)) throw new Error("Output FreeConvert bukan SVG valid.");
    if (Buffer.byteLength(svg, "utf8") > 8 * 1024 * 1024) throw new Error("SVG hasil terlalu besar untuk preview.");
    return { status: "success", svg };
  } finally { clearTimeout(timer); }
}

async function handleFreeConvertVectorizer(request, response) {
  if (request.method === "GET" && String(request.query?.health || "") === "1") {
    return send(response, 200, { ok: true, configured: Boolean(apiKey()), service: "freeconvert-png-svg" });
  }
  if (request.method !== "POST") return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  try {
    const action = String(request.body?.action || "");
    if (action === "prepare") return send(response, 200, { ok: true, ...(await prepareUpload(request.body)) });
    if (action === "start") return send(response, 200, { ok: true, ...(await startConversion(request.body)) });
    if (action === "result") return send(response, 200, { ok: true, ...(await fetchResult(request.body?.taskId)) });
    return send(response, 400, { ok: false, error: "INVALID_ACTION", message: "Action harus prepare, start, atau result." });
  } catch (error) {
    console.error("[freeconvert-vectorizer]", error?.code || error?.message || error);
    return send(response, Number(error?.status) || 500, { ok: false, error: error?.code || "VECTOR_API_FAILED", message: error?.message || "Konversi gagal." });
  }
}

module.exports = { handleFreeConvertVectorizer, normalizeFormat, findExportUrl };

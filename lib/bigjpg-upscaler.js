"use strict";

const crypto = require("node:crypto");
const { assertPublicUrl } = require("./audit");
const { anonymousHash, databaseHeaders, databaseRequest, getDatabaseConfig } = require("./database");
const { takeFixedWindow } = require("./memory-store");

const API_BASE = "https://bigjpg.com/api";
const STORAGE_BUCKET = "big-image-inputs";
const MAX_UPLOAD_BYTES = 4_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
const JOB_TOKEN_TTL_SECONDS = 26 * 60 * 60;
const SOURCE_URL_TTL_SECONDS = 24 * 60 * 60;
const STALE_SOURCE_MS = 26 * 60 * 60 * 1000;
const rateBuckets = new Map();

function createError(message, code, status = 500, details = {}) {
  return Object.assign(new Error(message), { code, status, ...details });
}

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function cleanText(value, maxLength = 180) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function cleanFileName(value, fallback = "big-image.jpg") {
  const cleaned = cleanText(value, 120)
    .replace(/[\\/\0]/g, "-")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned || fallback;
}

function headerValue(request, name) {
  const value = request?.headers?.[name] ?? request?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function positiveInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function apiKey() {
  return String(process.env.BIGJPG_API_KEY || "").trim();
}

function timeoutMs() {
  return positiveInteger(process.env.BIGJPG_TIMEOUT_MS, REQUEST_TIMEOUT_MS, 3_000, 60_000);
}

function validTaskId(value) {
  const id = cleanText(value, 160);
  return /^[a-zA-Z0-9_-]{6,160}$/.test(id) ? id : null;
}

function normalizeOptions(value = {}) {
  const style = String(value.style || "art").toLowerCase();
  const noise = String(value.noise === "" || value.noise == null ? "1" : value.noise);
  const scaleValue = value.scale === "" || value.scale == null ? value.x2 : value.scale;
  const scale = String(scaleValue === "" || scaleValue == null ? "1" : scaleValue);
  if (!new Set(["art", "photo"]).has(style)) throw createError("Tipe gambar harus ilustrasi atau foto.", "BIGJPG_STYLE_INVALID", 400);
  if (!new Set(["-1", "0", "1", "2", "3"]).has(noise)) throw createError("Tingkat noise tidak valid.", "BIGJPG_NOISE_INVALID", 400);
  if (!new Set(["1", "2", "3", "4"]).has(scale)) throw createError("Skala upscale tidak valid.", "BIGJPG_SCALE_INVALID", 400);
  return { style, noise, scale };
}

function sniffRaster(buffer, mimeHint = "") {
  const mime = String(mimeHint || "").split(";")[0].trim().toLowerCase();
  const png = buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (png && (!mime || ["image/png", "application/octet-stream"].includes(mime))) return { mime: "image/png", extension: "png" };
  if (jpeg && (!mime || ["image/jpeg", "image/jpg", "application/octet-stream"].includes(mime))) return { mime: "image/jpeg", extension: "jpg" };
  throw createError("File harus berupa PNG atau JPG yang valid.", "BIGJPG_FILE_TYPE_INVALID", 415);
}

async function readRawBody(request) {
  if (Buffer.isBuffer(request?.body)) return request.body;
  if (request?.body instanceof Uint8Array) return Buffer.from(request.body);
  if (request?.body instanceof ArrayBuffer) return Buffer.from(request.body);
  if (typeof request?.body === "string") return Buffer.from(request.body, "binary");
  if (request?.body && typeof request.body === "object") {
    throw createError("Body upload tidak tersedia sebagai data biner.", "BIGJPG_UPLOAD_BODY_INVALID", 400);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_UPLOAD_BYTES) throw createError("Upload Big Image maksimal 4 MB.", "BIGJPG_FILE_TOO_LARGE", 413);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function storageObjectPath(path) {
  return String(path || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function storageRequest(resource, options = {}) {
  const config = getDatabaseConfig();
  if (!config.configured) throw createError("Supabase server belum dikonfigurasi.", "BIGJPG_STORAGE_NOT_CONFIGURED", 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs || 8_000, 15_000));
  try {
    const response = await fetch(`${config.url}/storage/v1/${String(resource).replace(/^\/+/, "")}`, {
      ...options,
      signal: controller.signal,
      headers: databaseHeaders(config.elevatedKey, options.headers || {})
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!response.ok) {
      throw createError("Penyimpanan sementara Big Image belum siap.", "BIGJPG_STORAGE_FAILED", response.status === 404 ? 503 : 502, {
        upstreamStatus: response.status,
        storageCause: typeof data === "string" ? data.slice(0, 180) : data
      });
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw createError("Supabase Storage timeout.", "BIGJPG_STORAGE_TIMEOUT", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function checkStorageReady() {
  try {
    await storageRequest(`bucket/${encodeURIComponent(STORAGE_BUCKET)}`, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

async function checkJobsReady() {
  try {
    await databaseRequest("big_image_jobs?select=id&limit=1", { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

async function ensureInfrastructure({ storage = false } = {}) {
  if (!getDatabaseConfig().configured) {
    throw createError("Supabase server belum dikonfigurasi.", "BIGJPG_STORAGE_NOT_CONFIGURED", 503);
  }
  const [jobsReady, storageReady] = await Promise.all([
    checkJobsReady(),
    storage ? checkStorageReady() : Promise.resolve(true)
  ]);
  if (!jobsReady) throw createError("Database Big Image belum siap. Jalankan migration 015.", "BIGJPG_DATABASE_NOT_READY", 503);
  if (!storageReady) throw createError("Bucket privat Big Image belum siap. Jalankan migration 015.", "BIGJPG_STORAGE_NOT_READY", 503);
}

async function uploadPrivateSource(buffer, raster) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const path = `temporary/${day}/${crypto.randomUUID()}.${raster.extension}`;
  await storageRequest(`object/${encodeURIComponent(STORAGE_BUCKET)}/${storageObjectPath(path)}`, {
    method: "POST",
    headers: { "Content-Type": raster.mime, "x-upsert": "false", "Cache-Control": "no-store" },
    body: buffer
  });
  const signed = await storageRequest(`object/sign/${encodeURIComponent(STORAGE_BUCKET)}/${storageObjectPath(path)}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn: SOURCE_URL_TTL_SECONDS })
  });
  const rawUrl = signed?.signedURL || signed?.signedUrl || signed?.signed_url;
  if (!rawUrl) {
    await deletePrivateSources([path]).catch(() => {});
    throw createError("Supabase tidak mengembalikan URL unggah bertanda tangan.", "BIGJPG_SIGNED_URL_MISSING", 502);
  }
  const config = getDatabaseConfig();
  return { path, url: new URL(String(rawUrl), `${config.url}/`).toString() };
}

async function deletePrivateSources(paths) {
  const cleanPaths = [...new Set((paths || []).map((path) => String(path || "")).filter((path) => /^temporary\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{30,50}\.(?:png|jpg)$/.test(path)))];
  if (!cleanPaths.length) return false;
  await storageRequest(`object/${encodeURIComponent(STORAGE_BUCKET)}`, {
    method: "DELETE",
    body: JSON.stringify({ prefixes: cleanPaths })
  });
  return true;
}

function clientIp(request) {
  return cleanText(String(request.headers?.["x-forwarded-for"] || "").split(",")[0] || request.socket?.remoteAddress || "unknown", 120);
}

async function enforceRateLimit(request) {
  const clientHash = anonymousHash(`big-image:${clientIp(request)}`);
  const hourlyLimit = positiveInteger(process.env.BIGJPG_HOURLY_IP_LIMIT, 2, 1, 20);
  const dailyLimit = positiveInteger(process.env.BIGJPG_DAILY_TASK_LIMIT, 20, 1, 10_000);
  const memory = takeFixedWindow(rateBuckets, clientHash, { windowMs: 60 * 60 * 1000, limit: hourlyLimit, maxEntries: 3_000 });
  if (!memory.allowed) throw createError(`Batas ${hourlyLimit} proses per jam untuk perangkat ini tercapai.`, "BIGJPG_RATE_LIMITED", 429, { retryAfterMs: memory.retryAfterMs });

  const now = Date.now();
  const hour = new Date(now - 60 * 60 * 1000).toISOString();
  const day = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const [hourRows, dayRows] = await Promise.all([
    databaseRequest(`big_image_jobs?select=id&client_hash=eq.${clientHash}&created_at=gte.${encodeURIComponent(hour)}&limit=${hourlyLimit}`, { method: "GET" }),
    databaseRequest(`big_image_jobs?select=id&created_at=gte.${encodeURIComponent(day)}&limit=${dailyLimit}`, { method: "GET" })
  ]);
  if (Array.isArray(hourRows) && hourRows.length >= hourlyLimit) throw createError(`Batas ${hourlyLimit} proses per jam untuk perangkat ini tercapai.`, "BIGJPG_RATE_LIMITED", 429);
  if (Array.isArray(dayRows) && dayRows.length >= dailyLimit) throw createError(`Batas layanan harian ${dailyLimit} proses telah tercapai.`, "BIGJPG_DAILY_LIMIT", 429);
  return clientHash;
}

function jobSecret() {
  const explicit = String(process.env.BIGJPG_JOB_SECRET || "").trim();
  if (explicit) return explicit;
  const config = getDatabaseConfig();
  return crypto.createHash("sha256").update(`${apiKey()}:${config.elevatedKey || "nexora"}:big-image`).digest("hex");
}

function createJobToken(taskId, sourcePath = "") {
  const payload = Buffer.from(JSON.stringify({ taskId, sourcePath, exp: Math.floor(Date.now() / 1000) + JOB_TOKEN_TTL_SECONDS })).toString("base64url");
  const signature = crypto.createHmac("sha256", jobSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyJobToken(value, expectedTaskId) {
  if (!value || String(value).length > 2_000) throw createError("Token proses Big Image tidak valid.", "BIGJPG_JOB_TOKEN_INVALID", 403);
  const [payload, signature, extra] = String(value || "").split(".");
  if (!payload || !signature || extra) throw createError("Token proses Big Image tidak valid.", "BIGJPG_JOB_TOKEN_INVALID", 403);
  const expected = crypto.createHmac("sha256", jobSecret()).update(payload).digest();
  let supplied;
  try { supplied = Buffer.from(signature, "base64url"); } catch { supplied = Buffer.alloc(0); }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw createError("Token proses Big Image tidak valid.", "BIGJPG_JOB_TOKEN_INVALID", 403);
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw createError("Token proses Big Image rusak.", "BIGJPG_JOB_TOKEN_INVALID", 403); }
  if (data.exp < Math.floor(Date.now() / 1000)) throw createError("Token proses Big Image telah kedaluwarsa.", "BIGJPG_JOB_TOKEN_EXPIRED", 410);
  if (data.taskId !== expectedTaskId) throw createError("Task ID tidak sesuai token.", "BIGJPG_JOB_TOKEN_MISMATCH", 403);
  if (data.sourcePath && !/^temporary\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{30,50}\.(?:png|jpg)$/.test(data.sourcePath)) throw createError("Path sumber dalam token tidak valid.", "BIGJPG_JOB_TOKEN_INVALID", 403);
  return data;
}

async function bigjpgRequest(path, options = {}) {
  const key = apiKey();
  if (!key) throw createError("BIGJPG_API_KEY belum dikonfigurasi di Vercel.", "BIGJPG_NOT_CONFIGURED", 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(`${API_BASE}/${String(path).replace(/^\/+/, "")}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-API-KEY": key,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
    if (!response.ok) throw createError(`Bigjpg HTTP ${response.status}.`, `BIGJPG_HTTP_${response.status}`, response.status === 401 || response.status === 403 ? response.status : response.status === 429 ? 429 : 502, { provider: data });
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw createError("Bigjpg tidak merespons tepat waktu.", "BIGJPG_TIMEOUT", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function unwrapProvider(value) {
  if (Array.isArray(value)) return value[0] || {};
  if (value?.data && Array.isArray(value.data)) return value.data[0] || {};
  if (value?.data && typeof value.data === "object") return value.data;
  return value && typeof value === "object" ? value : {};
}

function providerCode(value) {
  const item = unwrapProvider(value);
  return cleanText(item.error || item.error_code || item.code || item.status || value?.status || "provider_error", 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}

function classifyProviderError(value) {
  const code = providerCode(value);
  if (/(?:requires_vip|vip|premium|paid|upgrade)/.test(code)) return "plan";
  if (/(?:quota|limit|balance|credit|payment|plan|subscribe)/.test(code)) return "quota";
  if (/(?:auth|api_key|token|login|permission|forbidden)/.test(code)) return "auth";
  if (/(?:param|style|noise|scale|x2)/.test(code)) return "parameter";
  if (/(?:download|input|url|fetch)/.test(code)) return "input";
  if (/timeout/.test(code)) return "timeout";
  return "provider";
}

function taskIdFrom(value) {
  const item = unwrapProvider(value);
  return validTaskId(item.tid || item.task_id || item.taskId || item.id || value?.tid || value?.task_id);
}

async function validateInputUrl(value) {
  let parsed;
  try { parsed = await assertPublicUrl(cleanText(value, 2_000)); }
  catch { throw createError("URL gambar harus HTTPS dan dapat diakses publik.", "BIGJPG_INPUT_URL_INVALID", 400); }
  if (parsed.protocol !== "https:") throw createError("URL gambar wajib menggunakan HTTPS.", "BIGJPG_INPUT_URL_INVALID", 400);
  return parsed.toString();
}

async function startProviderTask({ inputUrl, filename, options }) {
  const payload = {
    style: options.style,
    noise: options.noise,
    x2: options.scale,
    file_name: cleanFileName(filename),
    input: inputUrl
  };
  const data = await bigjpgRequest("task/", { method: "POST", body: JSON.stringify(payload) });
  const taskId = taskIdFrom(data);
  const status = providerCode(data);
  if (!taskId || ["error", "failed", "param_error", "auth_error"].includes(status)) {
    const category = classifyProviderError(data);
    const message = category === "plan"
      ? "Akun Bigjpg memerlukan paket VIP untuk menjalankan task API."
      : `Bigjpg menolak tugas (${status || "invalid_response"}).`;
    throw createError(message, status ? `BIGJPG_${status.toUpperCase()}` : "BIGJPG_TASK_INVALID", category === "plan" ? 402 : category === "quota" ? 429 : category === "auth" ? 403 : 422, { category, provider: data });
  }
  return { taskId, providerStatus: status || "submitted" };
}

async function recordJob(job) {
  await databaseRequest("big_image_jobs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([job])
  });
}

async function updateJob(taskId, patch) {
  try {
    await databaseRequest(`big_image_jobs?provider_task_id=eq.${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
    });
  } catch (error) {
    console.error("[big-image-job-update]", error?.code || error?.message || error);
  }
}

async function cleanupStaleSources() {
  try {
    const cutoff = new Date(Date.now() - STALE_SOURCE_MS).toISOString();
    const rows = await databaseRequest(`big_image_jobs?select=provider_task_id,source_path&source_path=not.is.null&created_at=lt.${encodeURIComponent(cutoff)}&limit=20`, { method: "GET" });
    if (!Array.isArray(rows) || !rows.length) return;
    const paths = rows.map((row) => row.source_path).filter(Boolean);
    if (paths.length) await deletePrivateSources(paths);
    for (const row of rows) await updateJob(row.provider_task_id, { source_path: null, status: "expired", completed_at: new Date().toISOString() });
  } catch (error) {
    console.error("[big-image-cleanup]", error?.code || error?.message || error);
  }
}

async function submitJob({ request, inputUrl, sourcePath = "", filename, options }) {
  let clientHash;
  try {
    clientHash = await enforceRateLimit(request);
  } catch (error) {
    if (sourcePath) await deletePrivateSources([sourcePath]).catch(() => {});
    throw error;
  }
  cleanupStaleSources().catch(() => {});
  let started;
  try {
    started = await startProviderTask({ inputUrl, filename, options });
  } catch (error) {
    if (sourcePath) await deletePrivateSources([sourcePath]).catch(() => {});
    throw error;
  }
  const token = createJobToken(started.taskId, sourcePath);
  try {
    await recordJob({
      provider_task_id: started.taskId,
      client_hash: clientHash,
      source_path: sourcePath || null,
      source_kind: sourcePath ? "upload" : "url",
      file_name: cleanFileName(filename),
      style: options.style,
      noise: options.noise,
      scale_code: options.scale,
      status: "processing"
    });
  } catch (error) {
    if (sourcePath) await deletePrivateSources([sourcePath]).catch(() => {});
    throw createError("Database Big Image belum siap. Jalankan migration 015.", "BIGJPG_DATABASE_NOT_READY", 503);
  }
  return { taskId: started.taskId, jobToken: token, status: "processing", providerStatus: started.providerStatus };
}

async function startUpload(request) {
  await ensureInfrastructure({ storage: true });
  const declared = Number(headerValue(request, "content-length") || 0);
  if (declared > MAX_UPLOAD_BYTES) throw createError("Upload Big Image maksimal 4 MB.", "BIGJPG_FILE_TOO_LARGE", 413);
  const buffer = await readRawBody(request);
  if (!buffer.length) throw createError("File upload kosong.", "BIGJPG_FILE_EMPTY", 400);
  if (buffer.length > MAX_UPLOAD_BYTES) throw createError("Upload Big Image maksimal 4 MB.", "BIGJPG_FILE_TOO_LARGE", 413);
  const raster = sniffRaster(buffer, headerValue(request, "content-type"));
  const options = normalizeOptions({
    style: headerValue(request, "x-nexora-style"),
    noise: headerValue(request, "x-nexora-noise"),
    scale: headerValue(request, "x-nexora-scale")
  });
  const filename = cleanFileName(decodeURIComponent(headerValue(request, "x-nexora-filename") || `big-image.${raster.extension}`));
  const source = await uploadPrivateSource(buffer, raster);
  return submitJob({ request, inputUrl: source.url, sourcePath: source.path, filename, options });
}

async function startUrl(request, body) {
  await ensureInfrastructure();
  const options = normalizeOptions(body);
  const inputUrl = await validateInputUrl(body?.inputUrl);
  let filename = cleanFileName(body?.filename || new URL(inputUrl).pathname.split("/").pop() || "big-image.jpg");
  if (!/\.(?:png|jpe?g)$/i.test(filename)) filename += ".jpg";
  return submitJob({ request, inputUrl, filename, options });
}

async function fetchTaskResult(taskIdValue, tokenValue) {
  const taskId = validTaskId(taskIdValue);
  if (!taskId) throw createError("Task ID Bigjpg tidak valid.", "BIGJPG_TASK_ID_INVALID", 400);
  const token = verifyJobToken(tokenValue, taskId);
  const data = await bigjpgRequest(`task/${encodeURIComponent(taskId)}`, { method: "GET" });
  const item = unwrapProvider(data);
  const providerStatus = providerCode(item);
  const rawUrl = cleanText(item.url || item.output || item.result_url || item.download_url, 2_000);
  const failed = /(?:error|fail|cancel|delete|param|auth|quota|limit)/.test(providerStatus);
  if (failed) {
    const category = classifyProviderError(item);
    if (token.sourcePath) await deletePrivateSources([token.sourcePath]).catch(() => {});
    await updateJob(taskId, { status: "failed", error_code: providerStatus, source_path: null, completed_at: new Date().toISOString() });
    return { status: "failed", errorCode: providerStatus, errorCategory: category, message: cleanText(item.message || item.msg || `Bigjpg gagal (${providerStatus}).`, 240) };
  }
  if (rawUrl) {
    const resultUrl = await validateInputUrl(rawUrl);
    if (token.sourcePath) await deletePrivateSources([token.sourcePath]).catch(() => {});
    await updateJob(taskId, { status: "success", output_url: resultUrl, source_path: null, completed_at: new Date().toISOString() });
    return { status: "success", ready: true, url: resultUrl };
  }
  await updateJob(taskId, { status: "processing" });
  return { status: "processing", ready: false, providerStatus, progress: Number(item.progress || item.percent || 0) || null };
}

async function cleanupJob(taskIdValue, tokenValue) {
  const taskId = validTaskId(taskIdValue);
  if (!taskId) throw createError("Task ID Bigjpg tidak valid.", "BIGJPG_TASK_ID_INVALID", 400);
  const token = verifyJobToken(tokenValue, taskId);
  if (token.sourcePath) await deletePrivateSources([token.sourcePath]).catch(() => {});
  await updateJob(taskId, { status: "expired", source_path: null, completed_at: new Date().toISOString() });
  return { cleaned: true };
}

async function healthStatus() {
  const keyConfigured = Boolean(apiKey());
  const databaseConfigured = getDatabaseConfig().configured;
  const [storageReady, jobsReady] = databaseConfigured ? await Promise.all([checkStorageReady(), checkJobsReady()]) : [false, false];
  return {
    ok: keyConfigured && databaseConfigured && storageReady && jobsReady,
    configured: keyConfigured && databaseConfigured && storageReady && jobsReady,
    service: "big-image-bigjpg",
    provider: "bigjpg",
    providerTaskAccess: "unverified",
    providerCapabilityVerified: false,
    providerCapabilityNote: "Kesiapan task baru dapat dipastikan dari respons submit Bigjpg; akun dapat mengembalikan requires_vip.",
    keyConfigured,
    databaseConfigured,
    storageReady,
    jobsReady,
    uploadLimitBytes: MAX_UPLOAD_BYTES,
    supported: { styles: ["art", "photo"], noise: ["-1", "0", "1", "2", "3"], scales: ["1", "2", "3", "4"] }
  };
}

async function handleBigImage(request, response) {
  try {
    if (request.method === "OPTIONS") {
      response.setHeader("Allow", "GET, POST, OPTIONS");
      return response.status(204).end();
    }
    if (request.method === "GET" && String(request.query?.health || "") === "1") {
      const health = await healthStatus();
      return send(response, health.ok ? 200 : 503, health);
    }
    if (request.method !== "POST") return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    if (!apiKey()) throw createError("BIGJPG_API_KEY belum dikonfigurasi di Vercel.", "BIGJPG_NOT_CONFIGURED", 503);
    if (String(request.query?.upload || "") === "1") return send(response, 202, { ok: true, ...(await startUpload(request)) });
    const body = request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body) ? request.body : {};
    const action = cleanText(body.action, 40).toLowerCase();
    if (action === "start-url") return send(response, 202, { ok: true, ...(await startUrl(request, body)) });
    if (action === "result") return send(response, 200, { ok: true, ...(await fetchTaskResult(body.taskId, body.jobToken)) });
    if (action === "cleanup") return send(response, 200, { ok: true, ...(await cleanupJob(body.taskId, body.jobToken)) });
    return send(response, 400, { ok: false, error: "INVALID_ACTION", message: "Action harus start-url, result, atau cleanup." });
  } catch (error) {
    console.error("[big-image]", error?.code || error?.message || error);
    return send(response, Number(error?.status) || 500, {
      ok: false,
      error: error?.code || "BIGJPG_FAILED",
      category: error?.category || null,
      message: error?.message || "Big Image gagal memproses gambar.",
      retryAfterMs: error?.retryAfterMs || null
    });
  }
}

module.exports = {
  MAX_UPLOAD_BYTES,
  STORAGE_BUCKET,
  classifyProviderError,
  cleanupJob,
  createJobToken,
  fetchTaskResult,
  handleBigImage,
  healthStatus,
  normalizeOptions,
  sniffRaster,
  validTaskId,
  verifyJobToken
};

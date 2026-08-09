"use strict";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_MS = 15 * 60_000;
const STALE_CACHE_MS = 24 * 60 * 60_000;
const MAX_JSON_BYTES = 2_500_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const APOD_FIRST_DATE = "1995-06-16";
const WEATHER_WINDOWS = new Set([3, 7, 14, 30]);
const MARS_MISSIONS = Object.freeze({
  perseverance: "Perseverance rover Mars",
  curiosity: "Curiosity rover Mars",
  ingenuity: "Ingenuity helicopter Mars",
  orbiter: "Mars Reconnaissance Orbiter"
});

const responseCache = new Map();
const inFlight = new Map();
const visitors = new Map();

function positiveInteger(value, fallback, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), maximum) : fallback;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeText(value, maximum = 2_000) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function safeUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol === "http:" && /(?:^|\.)nasa\.gov$/i.test(parsed.hostname)) parsed.protocol = "https:";
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value) {
  const raw = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
}

function utcDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function dateMinus(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function validateApodDate(value) {
  const date = isoDate(value || utcDate());
  if (!date || date < APOD_FIRST_DATE || date > utcDate()) {
    throw Object.assign(new Error(`Tanggal APOD harus antara ${APOD_FIRST_DATE} dan ${utcDate()}.`), { status: 400, code: "INVALID_APOD_DATE" });
  }
  return date;
}

function validateAsteroidDate(value) {
  const date = isoDate(value || utcDate());
  if (!date || date < APOD_FIRST_DATE || date > utcDate(7)) {
    throw Object.assign(new Error(`Tanggal asteroid harus antara ${APOD_FIRST_DATE} dan ${utcDate(7)}.`), { status: 400, code: "INVALID_ASTEROID_DATE" });
  }
  return date;
}

function nasaConfig(options = {}) {
  const configured = String(options.apiKey || process.env.NASA_API_KEY || "").trim();
  return { key: configured || "DEMO_KEY", keyConfigured: Boolean(configured), keyMode: configured ? "personal" : "demo" };
}

async function fetchJson(input, options = {}) {
  const url = input instanceof URL ? new URL(input) : new URL(String(input));
  const nasa = nasaConfig(options);
  if (options.withNasaKey !== false && url.hostname === "api.nasa.gov" && !url.searchParams.has("api_key")) {
    url.searchParams.set("api_key", nasa.key);
  }
  const timeoutMs = positiveInteger(options.timeoutMs || process.env.NASA_API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 20_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Nexora-Space-Explorer/1.0" }
    });
    if (!response.ok) {
      const error = new Error(`NASA_UPSTREAM_${response.status}`);
      error.code = `NASA_UPSTREAM_${response.status}`;
      error.statusCode = response.status;
      throw error;
    }
    const declaredLength = finite(response.headers?.get?.("content-length"));
    if (declaredLength !== null && declaredLength > MAX_JSON_BYTES) throw Object.assign(new Error("NASA_RESPONSE_TOO_LARGE"), { code: "NASA_RESPONSE_TOO_LARGE" });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_JSON_BYTES) throw Object.assign(new Error("NASA_RESPONSE_TOO_LARGE"), { code: "NASA_RESPONSE_TOO_LARGE" });
    return {
      data: JSON.parse(buffer.toString("utf8") || "null"),
      rate: {
        limit: finite(response.headers?.get?.("x-ratelimit-limit")),
        remaining: finite(response.headers?.get?.("x-ratelimit-remaining"))
      }
    };
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("NASA_UPSTREAM_TIMEOUT"), { code: "NASA_UPSTREAM_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function provider(rate, options = {}) {
  const config = nasaConfig(options);
  return {
    name: "NASA Open APIs",
    keyConfigured: config.keyConfigured,
    keyMode: config.keyMode,
    hourlyLimit: rate?.limit,
    remaining: rate?.remaining
  };
}

function normalizeApod(row) {
  const mediaType = row?.media_type === "video" ? "video" : "image";
  return {
    date: isoDate(row?.date),
    title: safeText(row?.title, 300) || "Astronomy Picture of the Day",
    explanation: safeText(row?.explanation, 8_000),
    copyright: safeText(row?.copyright, 300) || null,
    mediaType,
    image: safeUrl(mediaType === "image" ? row?.url : row?.thumbnail_url),
    hdImage: safeUrl(row?.hdurl),
    videoUrl: mediaType === "video" ? safeUrl(row?.url) : null,
    serviceVersion: safeText(row?.service_version, 30) || null
  };
}

async function readApod(params = {}, options = {}) {
  const date = params.date ? validateApodDate(params.date) : null;
  const url = new URL("https://api.nasa.gov/planetary/apod");
  if (date) url.searchParams.set("date", date);
  url.searchParams.set("thumbs", "true");
  let result;
  let latestFallback = false;
  try {
    result = await fetchJson(url, options);
  } catch (error) {
    if (date === utcDate() && error?.statusCode === 404) {
      url.searchParams.delete("date");
      result = await fetchJson(url, options);
      latestFallback = true;
    } else throw error;
  }
  const item = normalizeApod(result.data);
  if (!item.date || !item.title) throw Object.assign(new Error("APOD_EMPTY"), { code: "APOD_EMPTY" });
  return { ok: true, section: "apod", fetchedAt: new Date().toISOString(), provider: provider(result.rate, options), warning: latestFallback ? "APOD untuk tanggal hari ini belum diterbitkan; menampilkan edisi terbaru NASA." : null, item };
}

function normalizeMarsItem(row) {
  const data = Array.isArray(row?.data) ? row.data[0] : null;
  if (!data) return null;
  const preview = (Array.isArray(row?.links) ? row.links : []).find((link) => link?.rel === "preview" && link?.render === "image");
  const nasaId = safeText(data.nasa_id, 160);
  const image = safeUrl(preview?.href);
  if (!nasaId || !image) return null;
  return {
    nasaId,
    title: safeText(data.title, 400) || "Mars mission image",
    description: safeText(data.description_508 || data.description, 3_000),
    dateCreated: safeText(data.date_created, 50) || null,
    center: safeText(data.center, 80) || null,
    photographer: safeText(data.photographer || data.secondary_creator, 160) || null,
    keywords: (Array.isArray(data.keywords) ? data.keywords : []).slice(0, 8).map((value) => safeText(value, 80)).filter(Boolean),
    image,
    detailsUrl: safeUrl(`https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`)
  };
}

async function readMars(params = {}, options = {}) {
  const mission = Object.prototype.hasOwnProperty.call(MARS_MISSIONS, params.mission) ? params.mission : "perseverance";
  const page = positiveInteger(params.page, 1, 10);
  const url = new URL("https://images-api.nasa.gov/search");
  url.searchParams.set("q", MARS_MISSIONS[mission]);
  url.searchParams.set("media_type", "image");
  url.searchParams.set("page_size", "24");
  url.searchParams.set("page", String(page));
  const result = await fetchJson(url, { ...options, withNasaKey: false });
  const collection = result.data?.collection || {};
  const items = (Array.isArray(collection.items) ? collection.items : []).map(normalizeMarsItem).filter(Boolean).slice(0, 24);
  return {
    ok: true,
    section: "mars",
    fetchedAt: new Date().toISOString(),
    provider: { name: "NASA Image and Video Library", keyConfigured: false, keyMode: "not-required" },
    mission,
    page,
    total: finite(collection.metadata?.total_hits) || items.length,
    sourceNote: "Mars Rover Photos API telah diarsipkan; galeri memakai NASA Image and Video Library resmi.",
    items
  };
}

function normalizeAsteroid(row) {
  const approach = Array.isArray(row?.close_approach_data) ? row.close_approach_data[0] : null;
  const diameter = row?.estimated_diameter?.kilometers || {};
  return {
    id: safeText(row?.neo_reference_id || row?.id, 80),
    name: safeText(row?.name, 200).replace(/^\(|\)$/g, "") || "Near-Earth Object",
    hazardous: row?.is_potentially_hazardous_asteroid === true,
    sentry: row?.is_sentry_object === true,
    absoluteMagnitude: finite(row?.absolute_magnitude_h),
    diameterKm: { min: finite(diameter.estimated_diameter_min), max: finite(diameter.estimated_diameter_max) },
    approachDate: isoDate(approach?.close_approach_date),
    approachTime: safeText(approach?.close_approach_date_full, 80) || null,
    velocityKph: finite(approach?.relative_velocity?.kilometers_per_hour),
    missDistanceKm: finite(approach?.miss_distance?.kilometers),
    lunarDistance: finite(approach?.miss_distance?.lunar),
    orbitingBody: safeText(approach?.orbiting_body, 50) || "Earth",
    detailsUrl: safeUrl(row?.nasa_jpl_url)
  };
}

async function readAsteroids(params = {}, options = {}) {
  const date = validateAsteroidDate(params.date);
  const url = new URL("https://api.nasa.gov/neo/rest/v1/feed");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  const result = await fetchJson(url, options);
  const items = (Array.isArray(result.data?.near_earth_objects?.[date]) ? result.data.near_earth_objects[date] : [])
    .map(normalizeAsteroid)
    .filter((item) => item.id)
    .sort((left, right) => (left.missDistanceKm ?? Infinity) - (right.missDistanceKm ?? Infinity));
  const hazardous = items.filter((item) => item.hazardous).length;
  const fastest = items.reduce((best, item) => (item.velocityKph || 0) > (best?.velocityKph || 0) ? item : best, null);
  return {
    ok: true,
    section: "asteroids",
    fetchedAt: new Date().toISOString(),
    provider: provider(result.rate, options),
    date,
    summary: { total: items.length, hazardous, closest: items[0] || null, fastest },
    items
  };
}

const WEATHER_LABELS = Object.freeze({
  CME: "Coronal Mass Ejection", FLR: "Solar Flare", GST: "Geomagnetic Storm", SEP: "Solar Energetic Particle",
  MPC: "Magnetopause Crossing", RBE: "Radiation Belt Enhancement", HSS: "High Speed Stream", IPS: "Interplanetary Shock", report: "Space Weather Report"
});

function weatherSeverity(type, body) {
  const source = String(body || "").toUpperCase();
  if (/\bX\d|KP\s*(?:=|OF)?\s*[789]|SEVERE|EXTREME/.test(source)) return "high";
  if (/\bM\d|KP\s*(?:=|OF)?\s*[56]|WARNING/.test(source) || ["CME", "GST", "SEP"].includes(type)) return "medium";
  return "low";
}

function normalizeNotification(row) {
  const type = safeText(row?.messageType, 20) || "report";
  const body = safeText(row?.messageBody, 1_200);
  return {
    id: safeText(row?.messageID, 160) || `${type}-${safeText(row?.messageIssueTime, 50)}`,
    type,
    label: WEATHER_LABELS[type] || safeText(type, 80),
    issuedAt: safeText(row?.messageIssueTime, 50) || null,
    severity: weatherSeverity(type, body),
    summary: body,
    sourceUrl: safeUrl(row?.messageURL)
  };
}

function normalizeStructuredWeather(type, row) {
  if (type === "CME") {
    const speed = finite(row?.cmeAnalyses?.[0]?.speed);
    const summary = `CME dimulai ${safeText(row?.startTime, 50) || "tanpa waktu"}${speed ? ` dengan estimasi kecepatan ${Math.round(speed)} km/s` : ""}. ${safeText(row?.note, 1_500)}`;
    return { id: safeText(row?.activityID, 160), type, label: WEATHER_LABELS[type], issuedAt: safeText(row?.startTime, 50), severity: speed && speed >= 1200 ? "high" : "medium", summary: safeText(summary, 2_000), sourceUrl: safeUrl(row?.link) };
  }
  if (type === "GST") {
    const kp = Math.max(0, ...(Array.isArray(row?.allKpIndex) ? row.allKpIndex.map((item) => finite(item?.kpIndex) || 0) : [0]));
    return { id: safeText(row?.gstID, 160), type, label: WEATHER_LABELS[type], issuedAt: safeText(row?.startTime, 50), severity: kp >= 7 ? "high" : "medium", summary: `Badai geomagnetik terdeteksi dengan puncak indeks Kp ${kp || "belum tersedia"}.`, sourceUrl: safeUrl(row?.link) };
  }
  const flareClass = safeText(row?.classType, 30);
  return { id: safeText(row?.flrID, 160), type: "FLR", label: WEATHER_LABELS.FLR, issuedAt: safeText(row?.beginTime || row?.peakTime, 50), severity: /^X/i.test(flareClass) ? "high" : /^M/i.test(flareClass) ? "medium" : "low", summary: `Solar flare ${flareClass || "tanpa kelas"} dari ${safeText(row?.sourceLocation, 80) || "lokasi Matahari yang belum ditentukan"}.`, sourceUrl: safeUrl(row?.link) };
}

async function weatherFallback(startDate, endDate, options, originalError) {
  const endpoints = ["CME", "GST", "FLR"];
  const settled = await Promise.allSettled(endpoints.map(async (type) => {
    const url = new URL(`https://api.nasa.gov/DONKI/${type}`);
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    const result = await fetchJson(url, options);
    return { type, result };
  }));
  const items = [];
  let rate = null;
  for (const row of settled) {
    if (row.status !== "fulfilled") continue;
    rate = rate || row.value.result.rate;
    for (const item of Array.isArray(row.value.result.data) ? row.value.result.data : []) items.push(normalizeStructuredWeather(row.value.type, item));
  }
  if (!items.length) throw originalError;
  return { items, rate, fallback: true };
}

async function readWeather(params = {}, options = {}) {
  const days = WEATHER_WINDOWS.has(Number(params.days)) ? Number(params.days) : 7;
  const startDate = dateMinus(days - 1);
  const endDate = utcDate();
  let result;
  try {
    const url = new URL("https://api.nasa.gov/DONKI/notifications");
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    url.searchParams.set("type", "all");
    const response = await fetchJson(url, options);
    result = { items: (Array.isArray(response.data) ? response.data : []).map(normalizeNotification), rate: response.rate, fallback: false };
  } catch (error) {
    result = await weatherFallback(startDate, endDate, options, error);
  }
  const items = result.items.filter((item) => item.id).sort((left, right) => Date.parse(right.issuedAt || 0) - Date.parse(left.issuedAt || 0)).slice(0, 60);
  const byType = {};
  for (const item of items) byType[item.type] = (byType[item.type] || 0) + 1;
  return {
    ok: true,
    section: "weather",
    fetchedAt: new Date().toISOString(),
    provider: provider(result.rate, options),
    startDate,
    endDate,
    days,
    fallback: result.fallback,
    summary: { total: items.length, high: items.filter((item) => item.severity === "high").length, medium: items.filter((item) => item.severity === "medium").length, byType },
    items
  };
}

async function loadSpaceSection(section, params = {}, options = {}) {
  if (section === "apod") return readApod(params, options);
  if (section === "mars") return readMars(params, options);
  if (section === "asteroids") return readAsteroids(params, options);
  if (section === "weather") return readWeather(params, options);
  throw Object.assign(new Error("Bagian Space Explorer tidak dikenal."), { status: 400, code: "INVALID_SPACE_SECTION" });
}

function clientIp(request) {
  return String(request.headers?.["x-forwarded-for"] || request.headers?.["x-real-ip"] || request.socket?.remoteAddress || "unknown").split(",")[0].trim().slice(0, 80);
}

function takeRateSlot(request) {
  const now = Date.now();
  const key = clientIp(request);
  const row = visitors.get(key);
  if (!row || now - row.startedAt >= RATE_WINDOW_MS) {
    visitors.set(key, { startedAt: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT - 1, retryAfter: 0 };
  }
  row.count += 1;
  if (visitors.size > 2_000) for (const [ip, entry] of visitors) if (now - entry.startedAt >= RATE_WINDOW_MS) visitors.delete(ip);
  return { allowed: row.count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - row.count), retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - row.startedAt)) / 1_000)) };
}

function send(response, status, payload, headOnly = false) {
  response.setHeader("Cache-Control", status === 200 ? "public, max-age=30, s-maxage=300, stale-while-revalidate=3600" : "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status);
  return headOnly ? response.end() : response.json(payload);
}

function requestParams(url) {
  return {
    date: url.searchParams.get("date") || undefined,
    mission: String(url.searchParams.get("mission") || "perseverance").toLowerCase(),
    page: positiveInteger(url.searchParams.get("page"), 1, 10),
    days: positiveInteger(url.searchParams.get("days"), 7, 30)
  };
}

async function handleSpaceExplorer(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  if (url.searchParams.get("health") === "1") {
    const config = nasaConfig();
    return send(response, 200, {
      ok: true,
      status: "ready",
      engine: "nexora-space-explorer",
      engineVersion: "1.0.0",
      nasaKeyConfigured: config.keyConfigured,
      keyMode: config.keyMode,
      capabilities: ["apod", "mars-library", "near-earth-objects", "donki-space-weather"],
      marsSource: "nasa-image-library"
    }, request.method === "HEAD");
  }

  const rate = takeRateSlot(request);
  response.setHeader("X-RateLimit-Limit", String(RATE_LIMIT));
  response.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    return send(response, 429, { ok: false, error: "SPACE_EXPLORER_RATE_LIMITED", message: "Terlalu banyak permintaan eksplorasi. Coba lagi sesaat.", retryAfter: rate.retryAfter }, request.method === "HEAD");
  }

  const section = String(url.searchParams.get("section") || "apod").toLowerCase();
  const params = requestParams(url);
  let normalizedParams;
  try {
    if (section === "apod") normalizedParams = { date: params.date ? validateApodDate(params.date) : null };
    else if (section === "asteroids") normalizedParams = { date: validateAsteroidDate(params.date) };
    else if (section === "mars") normalizedParams = { mission: MARS_MISSIONS[params.mission] ? params.mission : "perseverance", page: params.page };
    else if (section === "weather") normalizedParams = { days: WEATHER_WINDOWS.has(params.days) ? params.days : 7 };
    else throw Object.assign(new Error("Bagian Space Explorer tidak dikenal."), { status: 400, code: "INVALID_SPACE_SECTION" });
  } catch (error) {
    return send(response, error.status || 400, { ok: false, error: error.code || "INVALID_SPACE_REQUEST", message: safeText(error.message, 300) }, request.method === "HEAD");
  }

  const cacheKey = `${section}:${JSON.stringify(normalizedParams)}`;
  const cacheMs = positiveInteger(process.env.NASA_API_CACHE_MS, DEFAULT_CACHE_MS, 6 * 60 * 60_000);
  const cached = responseCache.get(cacheKey);
  const age = cached ? Date.now() - cached.savedAt : Infinity;
  const force = url.searchParams.get("refresh") === "1";
  if (!force && cached && age < cacheMs) return send(response, 200, { ...cached.payload, cache: { hit: true, stale: false, ageMs: age, ttlMs: cacheMs } }, request.method === "HEAD");

  try {
    if (!inFlight.has(cacheKey)) inFlight.set(cacheKey, loadSpaceSection(section, normalizedParams).finally(() => inFlight.delete(cacheKey)));
    const payload = await inFlight.get(cacheKey);
    responseCache.set(cacheKey, { payload, savedAt: Date.now() });
    return send(response, 200, { ...payload, cache: { hit: false, stale: false, ageMs: 0, ttlMs: cacheMs } }, request.method === "HEAD");
  } catch (error) {
    if (cached && age < STALE_CACHE_MS) {
      return send(response, 200, { ...cached.payload, warning: "NASA sedang tidak tersedia. Menampilkan cache terakhir yang tersimpan.", cache: { hit: true, stale: true, ageMs: age, ttlMs: cacheMs } }, request.method === "HEAD");
    }
    const code = safeText(error?.code || "NASA_DATA_UNAVAILABLE", 80);
    console.error("[space-explorer]", code);
    return send(response, 503, { ok: false, error: "SPACE_DATA_UNAVAILABLE", upstreamCode: code, message: "Data NASA sedang tidak dapat diambil. Coba lagi beberapa saat." }, request.method === "HEAD");
  }
}

function resetSpaceExplorerState() {
  responseCache.clear();
  inFlight.clear();
  visitors.clear();
}

module.exports = {
  handleSpaceExplorer,
  loadSpaceSection,
  normalizeApod,
  normalizeAsteroid,
  normalizeMarsItem,
  normalizeNotification,
  resetSpaceExplorerState
};

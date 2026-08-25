"use strict";

const { sendJson: send } = require("./http-response");

const BMKG = Object.freeze({
  latest: "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json",
  recent: "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json",
  felt: "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json",
  weather: "https://api.bmkg.go.id/publik/prakiraan-cuaca",
  alerts: "https://www.bmkg.go.id/alerts/nowcast/id",
  openData: "https://data.bmkg.go.id/",
  quakeDocs: "https://data.bmkg.go.id/gempabumi/",
  weatherDocs: "https://data.bmkg.go.id/prakiraan-cuaca/",
  alertDocs: "https://data.bmkg.go.id/peringatan-dini-cuaca/"
});

const cache = new Map();
const inflight = new Map();
const MAX_CACHE_ENTRIES = 80;

function positiveInteger(value, fallback, max = 600_000) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), max) : fallback;
}

function config() {
  return {
    timeoutMs: positiveInteger(process.env.BMKG_TIMEOUT_MS, 9_000, 20_000),
    quakeCacheMs: positiveInteger(process.env.BMKG_QUAKE_CACHE_MS, 60_000, 10 * 60_000),
    weatherCacheMs: positiveInteger(process.env.BMKG_WEATHER_CACHE_MS, 10 * 60_000, 30 * 60_000),
    alertCacheMs: positiveInteger(process.env.BMKG_ALERT_CACHE_MS, 2 * 60_000, 10 * 60_000)
  };
}

function safeText(value, maxLength = 1000) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function decodeXml(value) {
  return safeText(String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code) || 32)), 2500);
}

function validAdm4(value) {
  const normalized = safeText(value, 32);
  return /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(normalized) ? normalized : "";
}

function coordinates(value) {
  const parts = String(value || "").split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return { lat: null, lon: null };
  return { lat: parts[0], lon: parts[1] };
}

function normalizeQuake(row) {
  const item = row && typeof row === "object" ? row : {};
  const point = coordinates(item.Coordinates);
  const shake = safeText(item.Shakemap, 180);
  return {
    date: safeText(item.Tanggal, 80),
    time: safeText(item.Jam, 80),
    dateTime: safeText(item.DateTime, 80),
    coordinates: safeText(item.Coordinates, 80),
    latitude: safeText(item.Lintang, 80),
    longitude: safeText(item.Bujur, 80),
    lat: point.lat,
    lon: point.lon,
    magnitude: Number.isFinite(Number(item.Magnitude)) ? Number(item.Magnitude) : null,
    depth: safeText(item.Kedalaman, 80),
    region: safeText(item.Wilayah, 700),
    potential: safeText(item.Potensi, 500),
    felt: safeText(item.Dirasakan, 1200),
    shakemap: shake ? `https://static.bmkg.go.id/${encodeURIComponent(shake).replace(/%2F/gi, "/")}` : ""
  };
}

function flattenForecast(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenForecast(item, rows);
    return rows;
  }
  if (!value || typeof value !== "object") return rows;
  if (value.local_datetime || value.utc_datetime || value.weather_desc || value.t !== undefined) rows.push(value);
  return rows;
}

function normalizeWeather(payload) {
  const rootLocation = payload?.lokasi && typeof payload.lokasi === "object" ? payload.lokasi : {};
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const first = data[0] && typeof data[0] === "object" ? data[0] : {};
  const location = Object.keys(first.lokasi || {}).length ? first.lokasi : rootLocation;
  const forecasts = flattenForecast(first.cuaca || data.map((row) => row?.cuaca || []))
    .slice(0, 32)
    .map((item) => ({
      utcDateTime: safeText(item.utc_datetime, 80),
      localDateTime: safeText(item.local_datetime, 80),
      temperatureC: Number.isFinite(Number(item.t)) ? Number(item.t) : null,
      humidityPct: Number.isFinite(Number(item.hu)) ? Number(item.hu) : null,
      weather: safeText(item.weather_desc, 160),
      weatherEn: safeText(item.weather_desc_en, 160),
      windKmh: Number.isFinite(Number(item.ws)) ? Number(item.ws) : null,
      windDirection: safeText(item.wd, 80),
      cloudPct: Number.isFinite(Number(item.tcc)) ? Number(item.tcc) : null,
      visibility: safeText(item.vs_text, 80),
      precipitationMm: Number.isFinite(Number(item.tp)) ? Number(item.tp) : null,
      analysisDate: safeText(item.analysis_date, 80),
      image: safeText(item.image, 400)
    }));

  return {
    location: {
      adm1: safeText(location.adm1, 32),
      province: safeText(location.provinsi, 120),
      adm2: safeText(location.adm2, 32),
      city: safeText(location.kotkab, 160),
      adm3: safeText(location.adm3, 32),
      district: safeText(location.kecamatan, 160),
      adm4: safeText(location.adm4, 32),
      village: safeText(location.desa, 160),
      longitude: Number.isFinite(Number(location.lon)) ? Number(location.lon) : null,
      latitude: Number.isFinite(Number(location.lat)) ? Number(location.lat) : null,
      timezone: safeText(location.timezone, 32)
    },
    forecasts
  };
}

function xmlTag(block, tag) {
  const escaped = String(tag).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(block || "").match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function normalizeAlerts(xml) {
  const source = String(xml || "");
  const items = [...source.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, 80).map((match) => {
    const block = match[1];
    return {
      title: xmlTag(block, "title"),
      link: xmlTag(block, "link"),
      description: xmlTag(block, "description"),
      author: xmlTag(block, "author") || xmlTag(block, "dc:creator"),
      publishedAt: xmlTag(block, "pubDate"),
      guid: xmlTag(block, "guid")
    };
  }).filter((item) => item.title || item.description);

  return {
    title: xmlTag(source, "title") || "Peringatan Dini Cuaca BMKG",
    lastBuildDate: xmlTag(source, "lastBuildDate"),
    alerts: items
  };
}

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache) if (!entry || entry.expiresAt <= now) cache.delete(key);
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

async function fetchUpstream(url, { ttlMs, type = "json", timeoutMs }) {
  pruneCache();
  const key = `${type}:${url}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { value: cached.value, cached: true };
  if (inflight.has(key)) return inflight.get(key);

  const run = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: type === "json" ? "application/json" : "application/xml,text/xml;q=0.9,*/*;q=0.5",
          "User-Agent": "All-Tools-Nexora-BMKG-Open-Data/1.0"
        }
      });
      const raw = await response.text();
      if (!response.ok) {
        const error = new Error(response.status === 429 ? "Batas akses BMKG sedang tercapai. Tunggu sebentar lalu coba lagi." : `BMKG merespons HTTP ${response.status}.`);
        error.code = response.status === 429 ? "BMKG_RATE_LIMITED" : "BMKG_UPSTREAM_ERROR";
        error.status = response.status === 429 ? 429 : 502;
        throw error;
      }
      let value;
      if (type === "json") {
        try { value = raw ? JSON.parse(raw) : {}; }
        catch {
          const error = new Error("Respons JSON BMKG tidak valid.");
          error.code = "BMKG_INVALID_JSON";
          error.status = 502;
          throw error;
        }
      } else value = raw;
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return { value, cached: false };
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("Server BMKG tidak merespons sebelum batas waktu.");
        timeoutError.code = "BMKG_TIMEOUT";
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })();

  inflight.set(key, run);
  try { return await run; }
  finally { inflight.delete(key); }
}

function meta(sourceUrl, cached) {
  return {
    provider: "BMKG",
    source: "BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)",
    sourceUrl,
    accessedAt: new Date().toISOString(),
    cached: Boolean(cached),
    apiKeyRequired: false,
    publicRateLimit: "60 permintaan/menit/IP",
    attribution: "Sumber: BMKG"
  };
}

async function quake(section, runtimeConfig) {
  const endpoint = BMKG[section] || BMKG.latest;
  const result = await fetchUpstream(endpoint, { ttlMs: runtimeConfig.quakeCacheMs, timeoutMs: runtimeConfig.timeoutMs });
  const root = result.value?.Infogempa?.gempa;
  const rows = (Array.isArray(root) ? root : root ? [root] : []).map(normalizeQuake);
  return {
    ok: true,
    section,
    quakes: rows,
    meta: meta(section === "latest" ? BMKG.quakeDocs : endpoint, result.cached)
  };
}

async function weather(adm4, runtimeConfig) {
  const code = validAdm4(adm4);
  if (!code) {
    const error = new Error("Kode wilayah ADM4 wajib berformat XX.XX.XX.XXXX, contoh 31.71.03.1001.");
    error.code = "INVALID_ADM4";
    error.status = 400;
    throw error;
  }
  const endpoint = `${BMKG.weather}?adm4=${encodeURIComponent(code)}`;
  const result = await fetchUpstream(endpoint, { ttlMs: runtimeConfig.weatherCacheMs, timeoutMs: runtimeConfig.timeoutMs });
  const normalized = normalizeWeather(result.value);
  if (!normalized.forecasts.length) {
    const error = new Error("Prakiraan tidak ditemukan untuk kode ADM4 tersebut.");
    error.code = "BMKG_WEATHER_EMPTY";
    error.status = 404;
    throw error;
  }
  return { ok: true, section: "weather", ...normalized, meta: meta(BMKG.weatherDocs, result.cached) };
}

async function alerts(runtimeConfig) {
  const result = await fetchUpstream(BMKG.alerts, { ttlMs: runtimeConfig.alertCacheMs, timeoutMs: runtimeConfig.timeoutMs, type: "xml" });
  return { ok: true, section: "alerts", ...normalizeAlerts(result.value), meta: meta(BMKG.alertDocs, result.cached) };
}

async function handleBmkgOpenData(request, response, url) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    return response.status(204).end();
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const runtimeConfig = config();
  if (url.searchParams.get("health") === "1") {
    const payload = {
      ok: true,
      service: "bmkg-open-data",
      provider: "BMKG",
      configured: true,
      apiKeyRequired: false,
      supports: ["earthquake-latest", "earthquake-m5", "earthquake-felt", "weather-3-day", "weather-nowcast-alerts"],
      publicRateLimit: "60 requests/minute/IP",
      attributionRequired: true
    };
    if (request.method === "HEAD") return response.status(200).end();
    return send(response, 200, payload);
  }

  const section = safeText(url.searchParams.get("section") || "latest", 32).toLowerCase();
  try {
    let payload;
    if (["latest", "recent", "felt"].includes(section)) payload = await quake(section, runtimeConfig);
    else if (section === "weather") payload = await weather(url.searchParams.get("adm4"), runtimeConfig);
    else if (section === "alerts") payload = await alerts(runtimeConfig);
    else return send(response, 400, { ok: false, error: "UNSUPPORTED_SECTION", allowed: ["latest", "recent", "felt", "weather", "alerts"] });
    if (request.method === "HEAD") return response.status(200).end();
    return send(response, 200, payload);
  } catch (error) {
    return send(response, Number(error?.status) || 502, {
      ok: false,
      error: safeText(error?.code || "BMKG_REQUEST_FAILED", 80),
      message: safeText(error?.message || "Data BMKG belum dapat diambil.", 300)
    });
  }
}

module.exports = {
  BMKG,
  alerts,
  config,
  handleBmkgOpenData,
  normalizeAlerts,
  normalizeQuake,
  normalizeWeather,
  validAdm4,
  weather
};

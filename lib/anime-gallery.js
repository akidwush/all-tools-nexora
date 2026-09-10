"use strict";

const NEKOSBEST_BASE = "https://nekos.best/api/v2";
const NEKOSBEST_USER_AGENT = "Nexora Anime Gallery (https://all-tools-nexora.vercel.app)";
const ENDPOINT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 45 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_SEARCH_CACHE = 40;

const endpointCache = { value: null, expiresAt: 0, pending: null };
const searchCache = new Map();

function cleanText(value, maxLength = 100) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function positiveInteger(value, fallback, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? Math.min(number, max) : fallback;
}

function responseRateLimit(headers) {
  return {
    limit: cleanText(headers?.get?.("x-rate-limit-limit"), 30) || null,
    remaining: cleanText(headers?.get?.("x-rate-limit-remaining"), 30) || null,
    reset: cleanText(headers?.get?.("x-rate-limit-reset"), 80) || null
  };
}

async function fetchNekosBest(pathname, searchParams = null) {
  const url = new URL(`${NEKOSBEST_BASE}/${pathname.replace(/^\/+/, "")}`);
  if (searchParams) {
    for (const [key, value] of searchParams.entries()) url.searchParams.append(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": NEKOSBEST_USER_AGENT
      }
    });
    const rateLimit = responseRateLimit(upstream.headers);
    let payload = null;
    try { payload = await upstream.json(); } catch {}

    if (!upstream.ok) {
      const error = new Error(upstream.status === 429 ? "Batas request reaction gallery tercapai. Coba lagi sebentar." : "NEKOSBEST sedang tidak tersedia.");
      error.status = upstream.status === 429 ? 429 : 502;
      error.code = upstream.status === 429 ? "NEKOSBEST_RATE_LIMITED" : "NEKOSBEST_UNAVAILABLE";
      error.rateLimit = rateLimit;
      throw error;
    }
    return { payload, rateLimit };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("NEKOSBEST melewati batas waktu.");
      timeout.status = 504;
      timeout.code = "NEKOSBEST_TIMEOUT";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeEndpointMap(payload) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const categories = [];
  for (const [rawName, rawMeta] of Object.entries(source)) {
    const name = cleanText(rawName, 40).toLowerCase();
    const format = cleanText(rawMeta?.format, 8).toLowerCase();
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(name) || !["png", "gif"].includes(format)) continue;
    categories.push({ name, format, type: format === "gif" ? "reaction" : "image" });
  }
  return categories.sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name));
}

async function getEndpointCategories() {
  const now = Date.now();
  if (endpointCache.value && endpointCache.expiresAt > now) {
    return { categories: endpointCache.value, cached: true, rateLimit: null };
  }
  if (endpointCache.pending) return endpointCache.pending;

  endpointCache.pending = (async () => {
    const result = await fetchNekosBest("endpoints");
    const categories = normalizeEndpointMap(result.payload);
    if (!categories.length) {
      const error = new Error("Daftar kategori NEKOSBEST kosong.");
      error.status = 502;
      error.code = "NEKOSBEST_INVALID_RESPONSE";
      throw error;
    }
    endpointCache.value = categories;
    endpointCache.expiresAt = Date.now() + ENDPOINT_CACHE_TTL_MS;
    return { categories, cached: false, rateLimit: result.rateLimit };
  })();

  try { return await endpointCache.pending; }
  finally { endpointCache.pending = null; }
}

function categoryFromAssetUrl(value) {
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    const apiIndex = parts.findIndex((part, index) => part === "v2" && index > 0);
    return apiIndex >= 0 ? cleanText(parts[apiIndex + 1], 40).toLowerCase() : "";
  } catch {
    return "";
  }
}

function assetId(value, index) {
  try {
    const filename = new URL(value).pathname.split("/").pop() || "";
    return filename.replace(/\.[a-z0-9]+$/i, "") || `asset-${index + 1}`;
  } catch {
    return `asset-${index + 1}`;
  }
}

function normalizeAsset(item, index, requestedCategory = "", requestedType = "") {
  const url = safeExternalUrl(item?.url);
  if (!url || !url.startsWith(`${NEKOSBEST_BASE}/`)) return null;
  const category = requestedCategory || categoryFromAssetUrl(url);
  const animated = /\.gif(?:$|\?)/i.test(url) || requestedType === "reaction";
  const width = positiveInteger(item?.dimensions?.width, 0, 20_000);
  const height = positiveInteger(item?.dimensions?.height, 0, 20_000);
  return {
    id: `nekosbest:${category || "asset"}:${assetId(url, index)}`,
    provider: "nekosbest",
    type: animated ? "gif" : "image",
    mediaType: "image",
    url,
    width: width || null,
    height: height || null,
    extension: animated ? "gif" : (url.match(/\.([a-z0-9]+)(?:$|\?)/i)?.[1]?.toLowerCase() || null),
    animated,
    artistName: cleanText(item?.artist_name, 120) || null,
    artistUrl: safeExternalUrl(item?.artist_href) || null,
    animeName: cleanText(item?.anime_name, 160) || null,
    sourceUrl: safeExternalUrl(item?.source_url) || null,
    tags: [],
    dominantColor: null,
    category: category || null,
    isNsfw: false
  };
}

function normalizeAssets(payload, category = "", type = "") {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.map((item, index) => normalizeAsset(item, index, category, type)).filter(Boolean);
}

function pruneSearchCache() {
  const now = Date.now();
  for (const [key, entry] of searchCache) if (entry.expiresAt <= now) searchCache.delete(key);
  while (searchCache.size > MAX_SEARCH_CACHE) searchCache.delete(searchCache.keys().next().value);
}

function send(response, status, payload, headOnly = false, cacheControl = "no-store, max-age=0") {
  response.setHeader("Cache-Control", cacheControl);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Vary", "Accept-Encoding");
  response.status(status);
  if (headOnly) return response.end();
  return response.json(payload);
}

async function handleAnimeGallery(request, response) {
  const method = String(request.method || "GET").toUpperCase();
  const headOnly = method === "HEAD";
  if (!["GET", "HEAD"].includes(method)) {
    response.setHeader("Allow", "GET, HEAD");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" }, false);
  }

  const requestUrl = new URL(request.url || "/api/health", `http://${request.headers.host || "localhost"}`);
  const provider = cleanText(requestUrl.searchParams.get("provider"), 30).toLowerCase();
  const action = cleanText(requestUrl.searchParams.get("action"), 30).toLowerCase();
  if (provider !== "nekosbest" || !["endpoints", "category", "search"].includes(action)) {
    return send(response, 400, {
      ok: false,
      error: "INVALID_ANIME_GALLERY_REQUEST",
      message: "Provider atau action anime gallery tidak didukung."
    }, headOnly);
  }
  const allowedParameters = new Set(
    action === "endpoints"
      ? ["mode", "provider", "action"]
      : action === "category"
        ? ["mode", "provider", "action", "category", "amount"]
        : ["mode", "provider", "action", "query", "type", "category", "amount"]
  );
  const unsupported = Array.from(requestUrl.searchParams.keys()).filter((key) => !allowedParameters.has(key));
  if (unsupported.length) {
    return send(response, 400, {
      ok: false,
      error: "UNSUPPORTED_PARAMETER",
      message: "Parameter anime gallery tidak didukung."
    }, headOnly);
  }

  try {
    if (action === "endpoints") {
      const result = await getEndpointCategories();
      return send(response, 200, {
        ok: true,
        provider,
        action,
        categories: result.categories,
        cached: result.cached,
        cacheTtlSeconds: Math.round(ENDPOINT_CACHE_TTL_MS / 1000),
        rateLimit: result.rateLimit
      }, headOnly, "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400");
    }

    const endpointResult = await getEndpointCategories();
    const endpointMap = new Map(endpointResult.categories.map((item) => [item.name, item]));
    const category = cleanText(requestUrl.searchParams.get("category"), 40).toLowerCase();
    if (category && !endpointMap.has(category)) {
      return send(response, 400, { ok: false, error: "INVALID_CATEGORY", message: "Kategori NEKOSBEST tidak tersedia." }, headOnly);
    }

    if (action === "category") {
      if (!category) return send(response, 400, { ok: false, error: "CATEGORY_REQUIRED", message: "Kategori wajib dipilih." }, headOnly);
      const amount = positiveInteger(requestUrl.searchParams.get("amount"), 12, 20);
      const params = new URLSearchParams({ amount: String(amount) });
      const result = await fetchNekosBest(category, params);
      const endpoint = endpointMap.get(category);
      return send(response, 200, {
        ok: true,
        provider,
        action,
        category,
        items: normalizeAssets(result.payload, category, endpoint?.type || ""),
        rateLimit: result.rateLimit
      }, headOnly);
    }

    const query = cleanText(requestUrl.searchParams.get("query"), 80);
    if (query.length < 2) {
      return send(response, 400, { ok: false, error: "QUERY_REQUIRED", message: "Pencarian membutuhkan minimal 2 karakter." }, headOnly);
    }
    const type = cleanText(requestUrl.searchParams.get("type"), 2);
    if (!["1", "2"].includes(type)) {
      return send(response, 400, { ok: false, error: "INVALID_SEARCH_TYPE", message: "Type pencarian harus 1 (image) atau 2 (GIF)." }, headOnly);
    }
    if (category && ((type === "1" && endpointMap.get(category)?.format !== "png") || (type === "2" && endpointMap.get(category)?.format !== "gif"))) {
      return send(response, 400, { ok: false, error: "CATEGORY_TYPE_MISMATCH", message: "Kategori tidak cocok dengan jenis media." }, headOnly);
    }
    const amount = positiveInteger(requestUrl.searchParams.get("amount"), 20, 20);
    const cacheKey = JSON.stringify({ query: query.toLowerCase(), type, category, amount });
    pruneSearchCache();
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return send(response, 200, { ...cached.payload, cached: true }, headOnly);
    }

    const params = new URLSearchParams({ query, type, amount: String(amount) });
    if (category) params.set("category", category);
    const result = await fetchNekosBest("search", params);
    const payload = {
      ok: true,
      provider,
      action,
      query,
      category: category || null,
      items: normalizeAssets(result.payload, category, type === "2" ? "reaction" : "image"),
      rateLimit: result.rateLimit,
      cached: false
    };
    searchCache.set(cacheKey, { payload, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
    pruneSearchCache();
    return send(response, 200, payload, headOnly);
  } catch (error) {
    const status = Number(error?.status) || 502;
    return send(response, status, {
      ok: false,
      error: cleanText(error?.code, 80) || "ANIME_GALLERY_UPSTREAM_ERROR",
      message: cleanText(error?.message, 240) || "Anime gallery sedang tidak tersedia.",
      rateLimit: error?.rateLimit || null
    }, headOnly);
  }
}

function resetAnimeGalleryState() {
  endpointCache.value = null;
  endpointCache.expiresAt = 0;
  endpointCache.pending = null;
  searchCache.clear();
}

module.exports = {
  ENDPOINT_CACHE_TTL_MS,
  NEKOSBEST_BASE,
  NEKOSBEST_USER_AGENT,
  SEARCH_CACHE_TTL_MS,
  handleAnimeGallery,
  normalizeAsset,
  normalizeAssets,
  normalizeEndpointMap,
  resetAnimeGalleryState,
  safeExternalUrl
};

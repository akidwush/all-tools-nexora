"use strict";

const { providerError } = require("./shared");
const { normalizeManga, normalizeChapter } = require("./normalizer");
const { resolveProviderConfig, clean } = require("../provider-endpoints");
function firstDefined(...args) { return args.find(a => a !== undefined && a !== null && a !== ""); }
function arrayFrom(val) { return Array.isArray(val) ? val : []; }
async function requestJson({ path, params, fetchImpl, timeoutMs, signal, cacheMs = 15_000 }) {
  if (typeof fetchImpl !== "function") throw providerError("Fetch provider ManhwaLand tidak tersedia.", "FETCH_UNAVAILABLE", 503);
  const config = await resolveProviderConfig(endpointDefinition, { fetchImpl, timeoutMs, cacheMs, signal });
  if (config.mode !== "active") throw providerError("Endpoint ManhwaLand sedang dimatikan.", "PROVIDER_DISABLED", 503);

  const qs = new URLSearchParams(params || {});
  qs.set("apikey", config.credentialRef || "test");
  const url = new URL(config.baseUrl + path + "?" + qs.toString());

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { "Accept": "application/json", "User-Agent": "Nexora/6.0 (Adult Source)" },
    timeout: config.timeoutMs,
    signal
  });

  if (!response.ok) throw providerError("ManhwaLand upstream error", "UPSTREAM_ERROR", response.status);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw providerError("ManhwaLand response invalid JSON", "INVALID_JSON", 502);
  }
}


const API_BASE = "https://sylvatica.my.id/api/nsfw";

const endpointDefinition = Object.freeze({
  id: "experimental-comic:manhwaland",
  group: "experimental-comic",
  label: "ManhwaLand",
  category: "adult-experimental",
  defaultMode: "active",
  networkSupported: true,
  healthUnsupported: false,
  activationSupported: true,

  allowedHosts: [
    "sylvatica.my.id"
  ],

  defaultBaseUrl: API_BASE,
  defaultTimeoutMs: 12_000,
  defaultCacheMs: 60_000,

  healthPath: "/manhwaland-latest?page=1",
  healthMethod: "GET",

  editableFields: [
    "baseUrl",
    "timeoutMs",
    "healthPath"
  ],

  unavailableCode: "PROVIDER_UNAVAILABLE"
});

const definition = {
  id: "manhwaland",
  name: "ManhwaLand",
  adult: true,
  experimental: true,
  defaultEnabled: false,
  optInRequired: true,

  participatesInSearch: false,
  participatesInFallback: false,
  participatesInExperimentalSearch: true,
  availability: "degraded",
  languages: ["id"],

  capabilities: {
    search: true,
    detail: true,
    chapters: true,
    pages: true,
    experimentalSearch: true,
    translationCompatible: false
  },

  imageHostSuffixes: ["manhwaland.land"],
  endpointId: endpointDefinition.id,
  attribution: "sylvatica/manhwaland"
};

function extractResponseData(payload) {
  if (payload && typeof payload === "object") {
    let data = payload.data !== undefined && payload.data !== null ? payload.data : (payload.result !== undefined && payload.result !== null ? payload.result : payload);

    if (Array.isArray(data) && payload.chapter_images) {
      return { _pages: payload.chapter_images };
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
        return {
            ...data,
            chapters: payload.chapter_list || data.chapter_list || data.chapters,
            _pages: payload.chapter_images || data.chapter_images || payload._pages || data._pages || payload.images || data.images || payload.pages || data.pages || payload.image_list || data.image_list
        }
    }
    return data;
  }
  return payload;
}

function mapManga(row) {
  if (!row || typeof row !== "object") return null;

  const id = String(firstDefined(row?.id, row?.manga_id, row?.mangaId, row?.manga_slug, row?.slug) || "").trim();
  const slug = String(firstDefined(row?.slug, row?.manga_slug, row?.url_slug, row?.id) || "").trim();

  if (!id && !slug) return null;
  const canonicalId = id || slug;
  const canonicalSlug = slug || id;

  const title = String(firstDefined(row?.title, row?.name, row?.manga_title, row?.judul) || "Untitled").trim();
  const coverUrl = String(firstDefined(row?.cover, row?.cover_url, row?.image, row?.thumb) || "").trim();
  const description = String(firstDefined(row?.description, row?.synopsis, row?.desc) || "").trim();

  let authors = [];
  if (Array.isArray(row.authors)) authors = row.authors.map(String);
  else if (typeof row.author === "string") authors = row.author.split(",").map(a => a.trim());

  let genres = [];
  if (Array.isArray(row.genres)) genres = row.genres.map(String);
  else if (typeof row.genre === "string") genres = row.genre.split(",").map(a => a.trim());

  return normalizeManga(definition.id, {
    id: canonicalId,
    title,
    coverUrl,
    description,
    authors,
    genres,
    language: "id"
  });
}

function mapChapter(row, mangaId) {
  if (!row || typeof row !== "object") return null;

  const cId = String(firstDefined(row?.id, row?.chapter_id, row?.chapter_slug, row?.slug) || "").trim();
  if (!cId) return null;

  const numberStr = String(firstDefined(row?.chapter_number, row?.number, row?.chapter) || "").trim();
  const title = String(firstDefined(row?.title, row?.chapter_title, row?.name) || "").trim();

  return normalizeChapter(definition.id, {
    id: cId,
    mangaId,
    number: numberStr,
    title,
    language: "id"
  });
}

async function search({ query, page, fetchImpl, timeoutMs, signal }) {
  const q = String(query || "").trim();
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const size = 20;

  let payload;
  if (q) {
      payload = await requestJson({
        path: "/manhwaland-search",
        params: { query: q },
        fetchImpl, timeoutMs, signal, cacheMs: 60_000
      });
  } else {
      payload = await requestJson({
        path: "/manhwaland-latest",
        params: { page: currentPage },
        fetchImpl, timeoutMs, signal, cacheMs: 60_000
      });
  }

  const data = extractResponseData(payload);
  const rows = arrayFrom(data);
  const items = rows.map(mapManga).filter(Boolean).slice(0, size);

  return {
    items,
    pagination: {
      hasMore: items.length >= size,
      nextPage: items.length >= size ? currentPage + 1 : null
    }
  };
}

async function getManga({ id, slug, fetchImpl, timeoutMs, signal }) {
  const identifier = String(slug || id || "").trim();
  if (!identifier) {
    throw providerError("ID komik ManhwaLand kosong.", "INVALID_COMIC_ID", 400);
  }

  const payload = await requestJson({
    path: `/manhwaland-manga`,
    params: { slug: identifier },
    fetchImpl, timeoutMs, signal, cacheMs: 30_000
  });

  const data = extractResponseData(payload);
  const manga = mapManga(data);
  if (!manga) {
    throw providerError("Detail komik ManhwaLand tidak ditemukan.", "UPSTREAM_NOT_FOUND", 404);
  }
  return manga;
}

async function getChapters({ mangaId, fetchImpl, timeoutMs, signal }) {
  const identifier = String(mangaId || "").trim();
  const payload = await requestJson({
    path: `/manhwaland-manga`,
    params: { slug: identifier },
    fetchImpl, timeoutMs, signal, cacheMs: 30_000
  });

  const data = extractResponseData(payload);
  const rows = arrayFrom(firstDefined(data?.chapters, data?.chapter_list, data?.list));
  const chapters = rows.map((row) => mapChapter(row, identifier)).filter(Boolean);

  return {
    chapters,
    languages: ["id"]
  };
}

async function getPages({ mangaId, chapterId, fetchImpl, timeoutMs, signal }) {
  const cId = String(chapterId || "").trim();
  const mId = String(mangaId || "").trim();

  if (!cId) {
    throw providerError("ID chapter ManhwaLand kosong.", "INVALID_CHAPTER_ID", 400);
  }

  const payload = await requestJson({
    path: `/manhwaland-chapter`,
    params: { slug: mId, number: cId },
    fetchImpl, timeoutMs, signal, cacheMs: 30_000
  });

  const data = extractResponseData(payload);
  const rows = Array.isArray(data) && data.length > 0 && typeof data[0] === "string" ? data : arrayFrom(firstDefined(data?._pages, data?.chapter_images, data?.images, data?.pages, data?.image_list));

  return rows.map((img) => {
      const url = typeof img === 'string' ? img : firstDefined(img?.url, img?.src, img?.link);
      return { url: url, refererRequired: true }
  }).filter(p => Boolean(p.url));
}

async function isHealthy({ fetchImpl, timeoutMs, signal }) {
  const started = Date.now();
  try {
    await requestJson({
      path: "/manhwaland-latest",
      params: { page: 1 },
      fetchImpl, timeoutMs, signal, cacheMs: 10_000
    });
    return { status: "active", httpStatus: 200, latencyMs: Date.now() - started };
  } catch (error) {
    return { status: "degraded", httpStatus: error?.status || 503, latencyMs: Date.now() - started, error: error?.message || "Unknown error" };
  }
}

module.exports = {
  definition,
  endpointDefinition,
  search,
  getManga,
  getChapters,
  getPages,
  isHealthy
};

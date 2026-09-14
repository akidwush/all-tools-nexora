"use strict";

const { normalizeChapter, normalizeManga, normalizePage, text } = require("./normalizer");
const { buildUrl, error, positiveInt, slug: safeSlug } = require("./shared");
const { resolveProviderConfig } = require("../provider-endpoints");

const SITE_ORIGIN = "https://doujin.desu.xxx/";
const htmlCache = new Map();
const MAX_HTML_BYTES = 2_000_000;

const definition = Object.freeze({
  id: "doujindesu",
  label: "DoujinDesu",
  category: "adult-experimental",
  adult: true,
  experimental: true,
  defaultEnabled: false,
  optInRequired: true,
  participatesInSearch: false,
  participatesInFallback: false,
  participatesInExperimentalSearch: true,
  availability: "degraded",
  languages: ["id"],
  capabilities: Object.freeze({
    search: true,
    detail: true,
    chapters: true,
    pages: false,
    experimentalSearch: true,
    languageFilter: false,
    pagination: true,
    translationCompatible: false
  }),
  imageHostSuffixes: ["doujin.desu.xxx"]
});

const endpointDefinition = Object.freeze({
  id: "experimental-comic:doujindesu",
  group: "experimental-comic",
  label: "DoujinDesu",
  category: "adult-experimental",
  defaultMode: "active",
  networkSupported: true,
  healthUnsupported: false,
  activationSupported: true,
  allowedHosts: ["doujin.desu.xxx"],
  defaultBaseUrl: SITE_ORIGIN,
  defaultTimeoutMs: 12_000,
  minTimeoutMs: 2_000,
  maxTimeoutMs: 20_000,
  healthPath: "/",
  healthMethod: "GET",
  editableFields: ["baseUrl", "timeoutMs", "healthPath"],
  unavailableCode: "PROVIDER_UNAVAILABLE"
});

function providerError(message, code = "PROVIDER_UNAVAILABLE", status = 502, extra = {}) {
  return Object.assign(new Error(message), { code, status, publicMessage: message, ...extra });
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Math.max(0, Math.min(0x10ffff, Number(n) || 0))))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(Math.max(0, Math.min(0x10ffff, Number.parseInt(n, 16) || 0))));
}

function stripTags(value) {
  return text(decodeEntities(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")), 12_000);
}

function attr(tag, name) {
  const safe = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag || "").match(new RegExp(`\\b${safe}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeEntities(match ? (match[1] ?? match[2] ?? match[3] ?? "") : "");
}

function parseUrl(value, base = SITE_ORIGIN) {
  try {
    const url = new URL(decodeEntities(value), base);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isSiteUrl(url) {
  return Boolean(url && url.protocol === "https:" && url.hostname.toLowerCase() === "doujin.desu.xxx");
}

function sameOriginAsset(value, base) {
  const url = parseUrl(value, base);
  return isSiteUrl(url) ? url.toString() : null;
}

function mangaSlugFromUrl(value, base) {
  const url = parseUrl(value, base);
  if (!isSiteUrl(url)) return null;
  const match = url.pathname.match(/^\/manga\/([a-z0-9][a-z0-9._~-]{0,219})\/?$/i);
  return match ? match[1] : null;
}

function challengeDetected(html) {
  const raw = String(html || "");
  return /cf-chl-|challenge-platform|just a moment|cloudflare ray id/i.test(raw);
}

function ensureNormalHtml(html, context, { allowEmpty = false } = {}) {
  const raw = String(html || "");
  if (challengeDetected(raw)) throw providerError(`${definition.label} menolak request server normal.`, "PROVIDER_UNAVAILABLE", 503);
  if (!allowEmpty && raw.length < 200) throw providerError(`Struktur ${context} ${definition.label} tidak dikenali.`, "UPSTREAM_CHANGED", 502);
  return raw;
}

function imageFromInner(inner, baseUrl) {
  const img = String(inner || "").match(/<img\b[^>]*>/i)?.[0] || "";
  const raw = attr(img, "data-lazy-src") || attr(img, "data-src") || attr(img, "data-original") || attr(img, "src");
  return sameOriginAsset(raw, baseUrl);
}

function parseMangaAnchors(html, baseUrl, query = "") {
  const q = text(query, 120).toLowerCase();
  const rows = [];
  const seen = new Set();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    const href = attr(attrs, "href");
    const slug = mangaSlugFromUrl(href, baseUrl);
    if (!slug || seen.has(slug)) continue;
    const title = text(attr(attrs, "title") || stripTags(inner), 500);
    if (!title || (q && !title.toLowerCase().includes(q))) continue;
    const url = new URL(`/manga/${slug}`, baseUrl).toString();
    const coverUrl = imageFromInner(inner, baseUrl);
    rows.push(normalizeManga(definition.id, {
      id: slug,
      slug,
      title,
      coverUrl,
      language: "id",
      url,
      metadata: { mediaType: "Komik", experimental: true }
    }));
    seen.add(slug);
  }
  return rows;
}

function metaContent(html, key) {
  const re = /<meta\b[^>]*>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const tag = match[0];
    const property = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
    if (property === key.toLowerCase()) return attr(tag, "content");
  }
  return "";
}

function firstHeading(html) {
  const preferred = String(html || "").match(/<h1\b[^>]*class=(?:"[^"]*\btitle\b[^"]*"|'[^']*\btitle\b[^']*')[^>]*>([\s\S]*?)<\/h1>/i);
  if (preferred) return stripTags(preferred[1]);
  const any = String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return any ? stripTags(any[1]) : "";
}

function collectTaxonomy(html, segment) {
  const values = [];
  const seen = new Set();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const href = attr(match[1], "href");
    const url = parseUrl(href, SITE_ORIGIN);
    if (!isSiteUrl(url) || !url.pathname.includes(`/${segment}/`)) continue;
    const label = stripTags(match[2]);
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      values.push(label);
    }
  }
  return values.slice(0, 30);
}

function parseDetailHtml(html, mangaSlug, baseUrl = SITE_ORIGIN) {
  ensureNormalHtml(html, "detail");
  const title = firstHeading(html) || text(metaContent(html, "og:title"), 500);
  if (!title) throw providerError("Struktur detail DoujinDesu berubah.", "UPSTREAM_CHANGED", 502);
  const rawCover = metaContent(html, "og:image");
  const coverUrl = sameOriginAsset(rawCover, baseUrl);
  const description = text(metaContent(html, "og:description"), 12_000) || null;
  const authors = [...collectTaxonomy(html, "author"), ...collectTaxonomy(html, "artist")].slice(0, 30);
  const genres = collectTaxonomy(html, "genre");
  return normalizeManga(definition.id, {
    id: mangaSlug,
    slug: mangaSlug,
    title,
    coverUrl,
    description,
    authors,
    artists: [],
    genres,
    status: null,
    language: "id",
    url: new URL(`/manga/${mangaSlug}`, baseUrl).toString(),
    metadata: { mediaType: "Komik", experimental: true }
  });
}

function chapterScope(html) {
  const raw = String(html || "");
  const index = raw.search(/id=(?:"chapter_list"|'chapter_list')/i);
  if (index < 0) return "";
  const tail = raw.slice(index, index + 400_000);
  const end = tail.search(/<\/(?:section|article)>/i);
  return end > 0 ? tail.slice(0, end) : tail;
}

function encodeChapterPath(pathname) {
  return `path:${Buffer.from(String(pathname || ""), "utf8").toString("base64url")}`;
}

function decodeChapterPath(id) {
  const raw = text(id, 260);
  if (!raw.startsWith("path:")) throw error("ID chapter DoujinDesu tidak valid.", "COMIC_ID_INVALID", 400);
  let pathname = "";
  try { pathname = Buffer.from(raw.slice(5), "base64url").toString("utf8"); }
  catch { throw error("ID chapter DoujinDesu tidak valid.", "COMIC_ID_INVALID", 400); }
  if (!pathname.startsWith("/") || pathname.includes("..") || pathname.length > 500) throw error("Path chapter DoujinDesu tidak valid.", "COMIC_ID_INVALID", 400);
  return pathname;
}

function parseChaptersHtml(html, mangaId, baseUrl = SITE_ORIGIN) {
  ensureNormalHtml(html, "chapter list");
  const scope = chapterScope(html);
  if (!scope) throw providerError("Chapter list DoujinDesu tidak ditemukan.", "UPSTREAM_CHANGED", 502);
  const rows = [];
  const seen = new Set();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(scope))) {
    const href = attr(match[1], "href");
    const url = parseUrl(href, baseUrl);
    if (!isSiteUrl(url) || /^\/manga\//i.test(url.pathname) || seen.has(url.pathname)) continue;
    const title = stripTags(match[2]);
    if (!title) continue;
    const numberMatch = title.match(/(?:chapter|ch\.?|bab)\s*([0-9]+(?:\.[0-9]+)?)/i);
    rows.push(normalizeChapter(definition.id, {
      id: encodeChapterPath(url.pathname),
      mangaId,
      title,
      number: numberMatch ? numberMatch[1] : null,
      language: "id",
      metadata: { path: url.pathname, experimental: true }
    }));
    seen.add(url.pathname);
  }
  if (!rows.length) throw providerError("Struktur chapter DoujinDesu berubah.", "UPSTREAM_CHANGED", 502);
  return rows;
}

function parseStaticPageUrls(html, chapterId, baseUrl = SITE_ORIGIN) {
  ensureNormalHtml(html, "reader page");
  const urls = [];
  const seen = new Set();

  const imageArrays = String(html || "").match(/["']images["']\s*:\s*\[[\s\S]*?\]/gi) || [];
  for (const block of imageArrays) {
    const strings = block.match(/["']https?:\/\/[^"'\\]+["']/gi) || [];
    for (const token of strings) {
      const raw = token.slice(1, -1).replace(/\\\//g, "/");
      const url = sameOriginAsset(raw, baseUrl);
      if (url && !seen.has(url)) { seen.add(url); urls.push(url); }
    }
  }

  const imgRe = /<img\b[^>]*>/gi;
  let match;
  while ((match = imgRe.exec(String(html || "")))) {
    const tag = match[0];
    const raw = attr(tag, "data-lazy-src") || attr(tag, "data-src") || attr(tag, "data-original") || attr(tag, "src");
    const url = sameOriginAsset(raw, baseUrl);
    if (!url || /logo|avatar|icon|banner/i.test(url) || seen.has(url)) continue;
    seen.add(url); urls.push(url);
  }

  return urls.map((url, index) => normalizePage(definition.id, {
    chapterId,
    index,
    url,
    refererRequired: true,
    metadata: { referer: SITE_ORIGIN, experimental: true }
  }));
}

function cacheGet(key) {
  const row = htmlCache.get(key);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) htmlCache.delete(key);
    return null;
  }
  return row.value;
}

function cacheSet(key, value, ttlMs) {
  htmlCache.set(key, { value, expiresAt: Date.now() + Math.max(0, Number(ttlMs) || 0) });
  while (htmlCache.size > 80) htmlCache.delete(htmlCache.keys().next().value);
  return value;
}

function retryAfterMs(headers) {
  const raw = text(headers?.get?.("retry-after"), 80);
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.min(5_000, Math.ceil(Number(raw) * 1000));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.min(5_000, Math.max(0, date - Date.now())) : 0;
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (!ms || signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

async function requestHtml({ path = "/", params, fetchImpl = globalThis.fetch, timeoutMs, signal, cacheMs = 0, retries = 1 }) {
  if (typeof fetchImpl !== "function") throw providerError("HTTP client tidak tersedia.", "COMIC_FETCH_UNAVAILABLE", 503);
  const endpoint = await resolveProviderConfig(endpointDefinition);
  const requested = Number(timeoutMs);
  const effectiveTimeout = Number.isFinite(requested) && requested > 0 ? Math.min(requested, endpoint.timeoutMs) : endpoint.timeoutMs;
  const url = buildUrl(endpoint.baseUrl, path, params);
  const cacheKey = url.toString();
  const cached = cacheMs ? cacheGet(cacheKey) : null;
  if (cached != null) return cached;

  let lastError;
  for (let attempt = 0; attempt <= Math.min(1, Math.max(0, retries)); attempt += 1) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener?.("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.max(2_000, Math.min(20_000, effectiveTimeout)));
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "User-Agent": "Nexora-Experimental-Comic/1.0 (+https://all-tools-nexora.vercel.app)"
        }
      });
      if (!response?.ok) {
        const status = Number(response?.status || 502);
        const retryMs = status === 429 ? retryAfterMs(response?.headers) : 0;
        const retryable = [502, 503, 504].includes(status) || (status === 429 && retryMs > 0);
        const code = status === 429 ? "COMIC_RATE_LIMITED" : (status === 404 ? "COMIC_NOT_FOUND" : "PROVIDER_UNAVAILABLE");
        const err = providerError(`${definition.label} merespons HTTP ${status}.`, code, status === 404 ? 404 : (status === 429 ? 429 : 502), { upstreamStatus: status });
        if (!retryable || attempt >= 1) throw err;
        lastError = err;
        await sleep(status === 429 ? retryMs : 350, signal);
        continue;
      }
      const contentType = text(response.headers?.get?.("content-type"), 120).toLowerCase();
      if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        throw providerError("DoujinDesu tidak mengembalikan HTML publik yang diharapkan.", "UPSTREAM_CHANGED", 502);
      }
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_HTML_BYTES) throw providerError("Respons DoujinDesu terlalu besar.", "COMIC_SOURCE_RESPONSE_TOO_LARGE", 502);
      ensureNormalHtml(raw, "HTML", { allowEmpty: false });
      return cacheMs ? cacheSet(cacheKey, raw, cacheMs) : raw;
    } catch (caught) {
      if (caught?.code) throw caught;
      if (caught?.name === "AbortError") {
        if (signal?.aborted) throw providerError("Permintaan dibatalkan.", "COMIC_ABORTED", 499);
        lastError = providerError("DoujinDesu melewati batas waktu.", "COMIC_TIMEOUT", 504);
      } else {
        lastError = providerError("DoujinDesu gagal dihubungi melalui normal HTTP flow.", "PROVIDER_UNAVAILABLE", 502);
      }
      if (attempt >= 1) throw lastError;
      await sleep(350, signal);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
    }
  }
  throw lastError || providerError("DoujinDesu tidak tersedia.", "PROVIDER_UNAVAILABLE", 502);
}

async function health({ fetchImpl = globalThis.fetch, timeoutMs = 8_000, signal } = {}) {
  const started = Date.now();
  try {
    const endpoint = await resolveProviderConfig(endpointDefinition);
    const url = buildUrl(endpoint.baseUrl, endpoint.healthPath || "/manga/");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener?.("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.max(2_000, Math.min(10_000, Number(timeoutMs) || endpoint.timeoutMs)));
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "User-Agent": "Nexora-Experimental-Comic/1.0 (+https://all-tools-nexora.vercel.app)"
        }
      });
      const httpStatus = Number(response?.status || 0);
      // Health only needs headers/status. Cancel the body immediately so this
      // does not download catalog/media or behave like a crawler.
      try { await response?.body?.cancel?.(); } catch {}
      return {
        status: response?.ok ? "active" : ([403, 429].includes(httpStatus) ? "degraded" : "unavailable"),
        httpStatus,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
        reason: response?.ok ? null : `HTTP ${httpStatus || "error"}`
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
    }
  } catch (caught) {
    return {
      status: "unavailable",
      httpStatus: Number(caught?.upstreamStatus || 0) || null,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      reason: caught?.code || "PROVIDER_UNAVAILABLE"
    };
  }
}

async function search({ query = "", page = 1, limit = 24, fetchImpl, timeoutMs, signal }) {
  const q = text(query, 120);
  const currentPage = positiveInt(page, { min: 1, max: 100, fallback: 1 });
  const size = positiveInt(limit, { min: 1, max: 50, fallback: 24 });
  if (q.length < 2) return { items: [], hasMore: false, page: currentPage };

  const params = { s: q };
  if (currentPage > 1) params.paged = currentPage;
  const html = await requestHtml({ path: "/", params, fetchImpl, timeoutMs, signal, cacheMs: 60_000, retries: 1 });
  const rows = parseMangaAnchors(html, SITE_ORIGIN, q);
  if (!rows.length) {
    const plain = stripTags(html).toLowerCase();
    if (/no results|tidak ditemukan|nothing found|hasil pencarian tidak ditemukan/.test(plain)) {
      return { items: [], hasMore: false, page: currentPage };
    }
    if (!/doujin|manga|komik/i.test(plain)) throw providerError("Struktur pencarian DoujinDesu berubah.", "UPSTREAM_CHANGED", 502);
  }
  return { items: rows.slice(0, size), hasMore: rows.length > size, page: currentPage };
}

async function getManga({ id, slug, fetchImpl, timeoutMs, signal }) {
  const mangaSlug = safeSlug(slug || id, "Slug manga", 220);
  const html = await requestHtml({ path: `/manga/${encodeURIComponent(mangaSlug)}`, fetchImpl, timeoutMs, signal, cacheMs: 180_000, retries: 1 });
  return parseDetailHtml(html, mangaSlug, SITE_ORIGIN);
}

async function getChapters({ mangaId, slug, fetchImpl, timeoutMs, signal }) {
  const mangaSlug = safeSlug(slug || mangaId, "Slug manga", 220);
  const html = await requestHtml({ path: `/manga/${encodeURIComponent(mangaSlug)}`, fetchImpl, timeoutMs, signal, cacheMs: 180_000, retries: 1 });
  return parseChaptersHtml(html, mangaSlug, SITE_ORIGIN);
}

async function getPages({ chapterId, fetchImpl, timeoutMs, signal }) {
  const pathname = decodeChapterPath(chapterId);
  const html = await requestHtml({ path: pathname, fetchImpl, timeoutMs, signal, cacheMs: 120_000, retries: 1 });
  const pages = parseStaticPageUrls(html, chapterId, SITE_ORIGIN);
  if (!pages.length) {
    throw providerError(
      "Reader pages DoujinDesu membutuhkan client-side/protected flow yang belum didukung tanpa browser automation atau bypass.",
      "UNSUPPORTED_CAPABILITY",
      501
    );
  }
  return pages;
}

module.exports = {
  definition,
  endpointDefinition,
  getChapters,
  getManga,
  getPages,
  health,
  search,
  _test: {
    parseMangaAnchors,
    parseDetailHtml,
    parseChaptersHtml,
    parseStaticPageUrls,
    decodeChapterPath,
    encodeChapterPath
  }
};

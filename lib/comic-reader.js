"use strict";

const https = require("node:https");
const net = require("node:net");
const { takeFixedWindow } = require("./memory-store");
const { clearSourceCache } = require("./comic-sources/shared");
const { createComicSourceRegistry, isAllowedImageHost, publicSourceRegistry, recordSourceHealth, resetSourceHealth } = require("./comic-sources/registry");

const MANGADEX_API = "https://api.mangadex.org";
const MANGADEX_UPLOADS = "https://uploads.mangadex.org";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_RATINGS = Object.freeze(["safe", "suggestive"]);
const requestBuckets = new Map();
const responseCache = new Map();
const dnsCache = new Map();
const MAX_CACHE_ENTRIES = 180;

function clean(value, maximum = 160) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function inputError(message, code = "COMIC_INVALID_REQUEST", status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function send(response, status, payload, headOnly = false) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status);
  return headOnly ? response.end() : response.json(payload);
}

function requestIp(request) {
  return clean(String(request.headers?.["x-forwarded-for"] || request.headers?.["x-real-ip"] || request.socket?.remoteAddress || "unknown").split(",")[0], 100);
}

function queryValue(requestUrl, name, maximum = 160) {
  return clean(requestUrl.searchParams.get(name), maximum);
}

function requireUuid(value, label) {
  const id = clean(value, 80);
  if (!UUID_PATTERN.test(id)) throw inputError(`${label} tidak valid.`, "COMIC_ID_INVALID");
  return id;
}

function appendMany(params, name, values) {
  for (const value of values) params.append(name, value);
}

function cacheGet(key) {
  const row = responseCache.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  responseCache.delete(key);
  responseCache.set(key, row);
  return row.value;
}

function cacheSet(key, value, ttlMs) {
  responseCache.delete(key);
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (responseCache.size > MAX_CACHE_ENTRIES) responseCache.delete(responseCache.keys().next().value);
  return value;
}

function isPublicIpv4(value) {
  if (net.isIP(value) !== 4) return false;
  const octets = value.split(".").map(Number);
  return !(octets[0] === 10 || octets[0] === 127 || octets[0] === 0 ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 0 && octets[2] === 0) ||
    (octets[0] === 192 && octets[1] === 0 && octets[2] === 2) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19)) ||
    (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) ||
    (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) ||
    (octets[0] >= 224));
}

async function resolveWithSecureDns(hostname, timeoutMs = 5000) {
  const cached = dnsCache.get(hostname);
  if (cached?.expiresAt > Date.now()) return cached.addresses;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
    const response = await globalThis.fetch(endpoint, { signal: controller.signal, headers: { Accept: "application/dns-json" } });
    if (!response.ok) throw new Error("Secure DNS gagal");
    const payload = await response.json();
    const addresses = [...new Set((Array.isArray(payload.Answer) ? payload.Answer : []).filter((row) => Number(row?.type) === 1).map((row) => clean(row?.data, 80)).filter(isPublicIpv4))];
    if (!addresses.length) throw new Error("Secure DNS kosong");
    dnsCache.set(hostname, { addresses, expiresAt: Date.now() + 300_000 });
    return addresses;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithPinnedDns(url, timeoutMs) {
  const addresses = await resolveWithSecureDns(url.hostname, Math.min(5000, timeoutMs));
  return new Promise((resolve, reject) => {
    const lookup = (_hostname, options, callback) => {
      if (options?.all) return callback(null, addresses.map((address) => ({ address, family: 4 })));
      return callback(null, addresses[0], 4);
    };
    const request = https.request(url, {
      method: "GET",
      lookup,
      servername: url.hostname,
      headers: {
        Accept: "application/json",
        "User-Agent": "All-Tools-Nexora-Comic-Reader/1.0 (+https://all-tools-nexora.vercel.app)"
      }
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 8_000_000) {
          request.destroy(Object.assign(new Error("Respons MangaDex terlalu besar."), { code: "COMIC_RESPONSE_TOO_LARGE", status: 502 }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => {
        if (response.statusCode === 429) return reject(Object.assign(new Error("MangaDex sedang membatasi permintaan. Coba lagi sebentar."), { code: "COMIC_RATE_LIMITED", status: 429 }));
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(Object.assign(new Error(`MangaDex merespons HTTP ${response.statusCode}.`), { code: "COMIC_UPSTREAM_HTTP", status: 502 }));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(Object.assign(new Error("Respons MangaDex tidak valid."), { code: "COMIC_UPSTREAM_INVALID", status: 502 })); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error("MangaDex melewati batas waktu."), { code: "COMIC_TIMEOUT", status: 504 })));
    request.on("error", reject);
    request.end();
  });
}

async function fetchMangaDex(path, { fetchImpl = globalThis.fetch, timeoutMs = 14_000, cacheMs = 60_000 } = {}) {
  if (typeof fetchImpl !== "function") throw Object.assign(new Error("HTTP client tidak tersedia."), { code: "COMIC_FETCH_UNAVAILABLE", status: 503 });
  const url = new URL(path, MANGADEX_API);
  if (url.origin !== MANGADEX_API) throw inputError("Tujuan MangaDex tidak valid.", "COMIC_UPSTREAM_INVALID");
  const cacheKey = url.toString();
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "All-Tools-Nexora-Comic-Reader/1.0 (+https://all-tools-nexora.vercel.app)"
      }
    });
    if (!response?.ok) {
      const retryAfter = clean(response?.headers?.get?.("x-ratelimit-retry-after") || response?.headers?.get?.("retry-after"), 80);
      if (response?.status === 429) throw Object.assign(new Error("MangaDex sedang membatasi permintaan. Coba lagi sebentar."), { code: "COMIC_RATE_LIMITED", status: 429, retryAfter });
      throw Object.assign(new Error(`MangaDex merespons HTTP ${Number(response?.status || 502)}.`), { code: "COMIC_UPSTREAM_HTTP", status: 502 });
    }
    const payload = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("Respons MangaDex tidak valid.");
    return cacheSet(cacheKey, payload, cacheMs);
  } catch (error) {
    if (error?.code) throw error;
    if (error?.name === "AbortError") throw Object.assign(new Error("MangaDex melewati batas waktu. Coba lagi."), { code: "COMIC_TIMEOUT", status: 504 });
    try {
      const payload = await fetchJsonWithPinnedDns(url, timeoutMs);
      return cacheSet(cacheKey, payload, cacheMs);
    } catch (fallbackError) {
      if (fallbackError?.code) throw fallbackError;
      throw Object.assign(new Error("MangaDex belum dapat dihubungi dari server Nexora."), { code: "COMIC_UPSTREAM_FAILED", status: 502 });
    }
  } finally {
    clearTimeout(timer);
  }
}

function localizedText(value, preferred = ["id", "en", "ja-ro", "ja"]) {
  if (!value || typeof value !== "object") return "";
  for (const language of preferred) {
    const row = clean(value[language], 12_000);
    if (row) return row;
  }
  return clean(Object.values(value).find((row) => typeof row === "string"), 12_000);
}

function relationship(item, type) {
  return (Array.isArray(item?.relationships) ? item.relationships : []).find((row) => row?.type === type);
}

function coverUrl(item) {
  const cover = relationship(item, "cover_art");
  const fileName = clean(cover?.attributes?.fileName, 300);
  return fileName ? `/api/comics?action=cover&id=${encodeURIComponent(item.id)}&file=${encodeURIComponent(fileName)}` : "";
}

function comicType(language) {
  if (language === "ja") return "Manga";
  if (language === "ko") return "Manhwa";
  if (["zh", "zh-hk"].includes(language)) return "Manhua";
  return "Komik";
}

function statusLabel(status) {
  return ({ ongoing: "Ongoing", completed: "Tamat", cancelled: "Dibatalkan", hiatus: "Hiatus" })[status] || clean(status, 40) || "-";
}

function mapListItem(item) {
  const attributes = item?.attributes || {};
  return {
    id: clean(item?.id, 80),
    title: localizedText(attributes.title) || "Tanpa judul",
    cover: coverUrl(item),
    type: comicType(clean(attributes.originalLanguage, 20)),
    language: clean(attributes.originalLanguage, 20) || null,
    status: clean(attributes.status, 30)
  };
}

function baseListParams({ page, query, type, tab }) {
  const limit = 24;
  const params = new URLSearchParams({ limit: String(limit), offset: String((page - 1) * limit), hasAvailableChapters: "true" });
  params.append("includes[]", "cover_art");
  appendMany(params, "contentRating[]", CONTENT_RATINGS);
  if (query) {
    params.set("title", query);
    params.set("order[relevance]", "desc");
  } else if (tab === "popular") {
    params.set("order[followedCount]", "desc");
  } else {
    params.set("order[latestUploadedChapter]", "desc");
  }
  const languages = { manga: ["ja"], manhwa: ["ko"], manhua: ["zh", "zh-hk"] }[type] || [];
  appendMany(params, "originalLanguage[]", languages);
  return { params, limit };
}

async function listComics(requestUrl, dependencies) {
  const query = queryValue(requestUrl, "q", 120);
  const type = queryValue(requestUrl, "type", 20).toLowerCase();
  const tab = queryValue(requestUrl, "tab", 20).toLowerCase() === "popular" ? "popular" : "latest";
  const page = Math.max(1, Math.min(100, Number.parseInt(queryValue(requestUrl, "page", 4), 10) || 1));
  const { params, limit } = baseListParams({ page, query, type, tab });
  const payload = await fetchMangaDex(`/manga?${params}`, { ...dependencies, cacheMs: query ? 45_000 : 90_000 });
  const items = (Array.isArray(payload.data) ? payload.data : []).map(mapListItem).filter((item) => UUID_PATTERN.test(item.id));
  const offset = Number(payload.offset || (page - 1) * limit);
  const total = Number(payload.total || items.length);
  return { items, hasMore: offset + Number(payload.limit || limit) < total, page, total, source: "MangaDex" };
}

async function comicDetail(requestUrl, dependencies) {
  const id = requireUuid(requestUrl.searchParams.get("id"), "ID komik");
  const params = new URLSearchParams();
  appendMany(params, "includes[]", ["cover_art", "author", "artist"]);
  const payload = await fetchMangaDex(`/manga/${encodeURIComponent(id)}?${params}`, { ...dependencies, cacheMs: 300_000 });
  const item = payload.data;
  if (!item) throw Object.assign(new Error("Detail komik tidak ditemukan."), { code: "COMIC_NOT_FOUND", status: 404 });
  const attributes = item.attributes || {};
  const author = relationship(item, "author");
  return {
    data: {
      id,
      title: localizedText(attributes.title) || "Tanpa judul",
      cover: coverUrl(item),
      type: comicType(clean(attributes.originalLanguage, 20)),
      language: clean(attributes.originalLanguage, 20) || null,
      desc: localizedText(attributes.description, ["id", "en"]) || "Belum ada sinopsis untuk komik ini.",
      status: statusLabel(clean(attributes.status, 30)),
      year: Number(attributes.year) || "-",
      author: clean(author?.attributes?.name, 200) || null,
      genres: (Array.isArray(attributes.tags) ? attributes.tags : []).map((tag) => localizedText(tag?.attributes?.name, ["id", "en"])).filter(Boolean).slice(0, 20)
    },
    source: "MangaDex"
  };
}

function chapterGroup(chapter) {
  const group = relationship(chapter, "scanlation_group");
  return clean(group?.attributes?.name, 180);
}

async function comicChapters(requestUrl, dependencies) {
  const id = requireUuid(requestUrl.searchParams.get("id"), "ID komik");
  const language = queryValue(requestUrl, "lang", 12).toLowerCase();
  let offset = 0;
  const limit = 100;
  const rows = [];
  for (let page = 0; page < 3; page += 1) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset), includeFutureUpdates: "0" });
    params.set("order[publishAt]", "desc");
    params.append("includes[]", "scanlation_group");
    appendMany(params, "contentRating[]", CONTENT_RATINGS);
    if (language) params.append("translatedLanguage[]", language);
    const payload = await fetchMangaDex(`/manga/${encodeURIComponent(id)}/feed?${params}`, { ...dependencies, cacheMs: 120_000 });
    const batch = Array.isArray(payload.data) ? payload.data : [];
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < limit || offset >= Number(payload.total || 0)) break;
  }

  const languages = [...new Set(rows.map((row) => clean(row?.attributes?.translatedLanguage, 12)).filter(Boolean))].sort();
  const seen = new Set();
  const chapters = rows.filter((row) => {
    const attributes = row?.attributes || {};
    const key = [attributes.translatedLanguage, attributes.chapter, attributes.volume, attributes.title].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return UUID_PATTERN.test(clean(row?.id, 80));
  }).map((row) => {
    const attributes = row.attributes || {};
    const title = clean(attributes.title, 220);
    const group = chapterGroup(row);
    return {
      id: clean(row.id, 80),
      name: `Chapter ${clean(attributes.chapter, 30) || "?"}`,
      title: title || null,
      number: clean(attributes.chapter, 30) || null,
      volume: clean(attributes.volume, 30) || null,
      extra: [title ? ` — ${title}` : "", group ? ` · ${group}` : ""].join(""),
      lang: clean(attributes.translatedLanguage, 12),
      group,
      publishedAt: attributes.publishAt || null,
      date: attributes.publishAt ? new Date(attributes.publishAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : ""
    };
  });
  return { data: chapters, languages, source: "MangaDex" };
}

async function chapterImageManifest(id, quality, dependencies) {
  const payload = await fetchMangaDex(`/at-home/server/${encodeURIComponent(id)}`, { ...dependencies, cacheMs: 600_000 });
  const baseUrl = clean(payload.baseUrl, 1000);
  const chapter = payload.chapter || {};
  const hash = clean(chapter.hash, 200);
  const full = Array.isArray(chapter.data) ? chapter.data.map((file) => clean(file, 300)).filter(Boolean) : [];
  const saver = Array.isArray(chapter.dataSaver) ? chapter.dataSaver.map((file) => clean(file, 300)).filter(Boolean) : [];
  const useFull = quality === "full" && full.length;
  const files = useFull ? full : saver.length ? saver : full;
  const folder = useFull ? "data" : saver.length ? "data-saver" : "data";
  if (!/^https:\/\//i.test(baseUrl) || !hash || !files.length) throw Object.assign(new Error("Halaman chapter belum tersedia."), { code: "COMIC_PAGES_EMPTY", status: 404 });
  const images = files.map((file) => `${baseUrl}/${folder}/${hash}/${encodeURIComponent(file)}`);
  for (const image of images) {
    const target = new URL(image);
    if (target.protocol !== "https:" || !(target.hostname.endsWith(".mangadex.network") || target.hostname.endsWith(".mangadex.org"))) {
      throw Object.assign(new Error("Host halaman MangaDex tidak valid."), { code: "COMIC_PAGE_HOST_INVALID", status: 502 });
    }
  }
  return { images, quality: useFull ? "full" : "saver" };
}

async function comicPages(requestUrl, dependencies) {
  const id = requireUuid(requestUrl.searchParams.get("id"), "ID chapter");
  const requestedQuality = queryValue(requestUrl, "quality", 12) === "full" ? "full" : "saver";
  const manifest = await chapterImageManifest(id, requestedQuality, dependencies);
  const proxyImages = manifest.images.map((_image, index) => `/api/comics?action=page-image&id=${encodeURIComponent(id)}&quality=${manifest.quality}&index=${index}`);
  return { data: { image: proxyImages, quality: manifest.quality, pageCount: proxyImages.length }, source: "MangaDex" };
}

function httpsBufferWithPinnedDns(url, timeoutMs = 14_000, options = {}) {
  const maximumBytes = Math.max(100_000, Math.min(8_000_000, Number(options.maxBytes) || 3_000_000));
  const label = clean(options.label, 40) || "Sampul";
  const notFoundCode = clean(options.notFoundCode, 80) || "COMIC_COVER_NOT_FOUND";
  return resolveWithSecureDns(url.hostname, Math.min(5000, timeoutMs)).then((addresses) => new Promise((resolve, reject) => {
    const lookup = (_hostname, options, callback) => options?.all
      ? callback(null, addresses.map((address) => ({ address, family: 4 })))
      : callback(null, addresses[0], 4);
    const request = https.request(url, { method: "GET", lookup, servername: url.hostname, headers: { Accept: "image/avif,image/webp,image/jpeg,image/*", "User-Agent": "All-Tools-Nexora-Comic-Reader/1.0 (+https://all-tools-nexora.vercel.app)", ...(options.headers || {}) } }, (upstream) => {
      const chunks = [];
      let bytes = 0;
      upstream.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maximumBytes) return request.destroy(Object.assign(new Error(`${label} terlalu besar.`), { code: `${notFoundCode}_TOO_LARGE`, status: 502 }));
        chunks.push(Buffer.from(chunk));
      });
      upstream.on("end", () => {
        if (upstream.statusCode < 200 || upstream.statusCode >= 300) return reject(Object.assign(new Error(`${label} tidak ditemukan.`), { code: notFoundCode, status: label === "Sampul" ? 404 : 502 }));
        resolve({ buffer: Buffer.concat(chunks), contentType: clean(upstream.headers["content-type"], 100) || "image/jpeg" });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error(`${label} melewati batas waktu.`), { code: "COMIC_TIMEOUT", status: 504 })));
    request.on("error", reject);
    request.end();
  }));
}

async function comicPageImage(requestUrl, dependencies = {}) {
  const id = requireUuid(requestUrl.searchParams.get("id"), "ID chapter");
  const quality = queryValue(requestUrl, "quality", 12) === "full" ? "full" : "saver";
  const index = Number.parseInt(queryValue(requestUrl, "index", 5), 10);
  if (!Number.isInteger(index) || index < 0 || index > 400) throw inputError("Nomor halaman tidak valid.", "COMIC_PAGE_INDEX_INVALID");
  const manifest = await chapterImageManifest(id, quality, dependencies);
  const rawUrl = manifest.images[index];
  if (!rawUrl) throw Object.assign(new Error("Halaman komik tidak ditemukan."), { code: "COMIC_PAGE_NOT_FOUND", status: 404 });
  const url = new URL(rawUrl);
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const upstream = await fetchImpl(url, {
        signal: controller.signal,
        redirect: "error",
        headers: { Accept: "image/avif,image/webp,image/jpeg,image/*", "User-Agent": "All-Tools-Nexora-Comic-Reader/1.0 (+https://all-tools-nexora.vercel.app)" }
      });
      if (!upstream.ok) throw Object.assign(new Error("Halaman gambar gagal dimuat."), { code: "COMIC_PAGE_UPSTREAM_FAILED", status: 502 });
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (!buffer.length || buffer.length > 8_000_000) throw Object.assign(new Error("Ukuran halaman gambar tidak valid."), { code: "COMIC_PAGE_SIZE_INVALID", status: 502 });
      return { buffer, contentType: clean(upstream.headers?.get?.("content-type"), 100) || "image/jpeg" };
    } finally { clearTimeout(timer); }
  } catch (error) {
    if (error?.code && !["COMIC_PAGE_UPSTREAM_FAILED"].includes(error.code)) throw error;
    return httpsBufferWithPinnedDns(url, 20_000, { maxBytes: 8_000_000, label: "Halaman", notFoundCode: "COMIC_PAGE_UPSTREAM_FAILED" });
  }
}

async function comicCover(requestUrl, dependencies = {}) {
  const id = requireUuid(requestUrl.searchParams.get("id"), "ID komik");
  const fileName = queryValue(requestUrl, "file", 300);
  if (!/^[a-z0-9][a-z0-9._-]{2,299}$/i.test(fileName) || fileName.includes("..")) throw inputError("Nama sampul tidak valid.", "COMIC_COVER_INVALID");
  const url = new URL(`/covers/${encodeURIComponent(id)}/${encodeURIComponent(fileName)}.512.jpg`, MANGADEX_UPLOADS);
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14_000);
    try {
      const upstream = await fetchImpl(url, { signal: controller.signal, redirect: "error", headers: { Accept: "image/avif,image/webp,image/jpeg,image/*" } });
      if (!upstream.ok) throw Object.assign(new Error("Sampul tidak ditemukan."), { code: "COMIC_COVER_NOT_FOUND", status: 404 });
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (!buffer.length || buffer.length > 3_000_000) throw Object.assign(new Error("Sampul tidak valid."), { code: "COMIC_COVER_INVALID", status: 502 });
      return { buffer, contentType: clean(upstream.headers?.get?.("content-type"), 100) || "image/jpeg" };
    } finally { clearTimeout(timer); }
  } catch (error) {
    if (error?.code && error.code !== "COMIC_COVER_NOT_FOUND") throw error;
    return httpsBufferWithPinnedDns(url);
  }
}


let comicSourceRegistry = null;
function getComicSourceRegistry() {
  if (!comicSourceRegistry) {
    comicSourceRegistry = createComicSourceRegistry({
      list: listComics,
      detail: comicDetail,
      chapters: comicChapters,
      manifest: chapterImageManifest
    });
  }
  return comicSourceRegistry;
}

function genericId(requestUrl, name = "id", maximum = 260) {
  const value = queryValue(requestUrl, name, maximum);
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:@~-]{0,259}$/.test(value)) throw inputError(`${name === "id" ? "ID" : name} tidak valid.`, "COMIC_ID_INVALID");
  return value;
}

function pageProxyUrl({ source, mangaId, chapterId, index, quality }) {
  const params = new URLSearchParams({ action: "page-image", source, id: chapterId, index: String(index) });
  if (mangaId) params.set("mangaId", mangaId);
  if (quality) params.set("quality", quality);
  return `/api/comics?${params}`;
}

async function sourcePagesResult(adapter, requestUrl, dependencies) {
  const source = adapter.definition.id;
  const chapterId = source === "mangadex" ? requireUuid(requestUrl.searchParams.get("id"), "ID chapter") : genericId(requestUrl, "id");
  const mangaId = queryValue(requestUrl, "mangaId", 260) || null;
  const quality = queryValue(requestUrl, "quality", 12) === "full" ? "full" : "saver";
  const pages = await adapter.getPages({ requestUrl, dependencies, mangaId, chapterId, quality, fetchImpl: dependencies.fetchImpl, timeoutMs: dependencies.timeoutMs, signal: dependencies.signal });
  const exposed = pages.map((page, index) => {
    const needsProxy = source === "mangadex" || page.refererRequired;
    return { ...page, url: needsProxy ? pageProxyUrl({ source, mangaId, chapterId, index, quality }) : page.url };
  });
  return { data: { pages: exposed, image: exposed.map((page) => page.url), quality, pageCount: exposed.length }, source, provider: adapter.definition.label, capabilities: adapter.definition.capabilities };
}

async function comicSourcePageImage(adapter, requestUrl, dependencies = {}) {
  const source = adapter.definition.id;
  const chapterId = genericId(requestUrl, "id");
  const mangaId = queryValue(requestUrl, "mangaId", 260) || null;
  const quality = queryValue(requestUrl, "quality", 12) === "full" ? "full" : "saver";
  const index = Number.parseInt(queryValue(requestUrl, "index", 5), 10);
  if (!Number.isInteger(index) || index < 0 || index > 400) throw inputError("Nomor halaman tidak valid.", "COMIC_PAGE_INDEX_INVALID");
  const pages = await adapter.getPages({ requestUrl, dependencies, mangaId, chapterId, quality, fetchImpl: dependencies.fetchImpl, timeoutMs: dependencies.timeoutMs, signal: dependencies.signal });
  const page = pages[index];
  if (!page) throw Object.assign(new Error("Halaman komik tidak ditemukan."), { code: "COMIC_PAGE_NOT_FOUND", status: 404 });
  const url = new URL(page.url);
  if (url.protocol !== "https:" || !isAllowedImageHost(adapter.definition, url.hostname)) throw Object.assign(new Error("Host gambar provider tidak diizinkan."), { code: "COMIC_PAGE_HOST_INVALID", status: 502 });
  const referer = clean(page.metadata?.referer, 2000);
  const headers = referer ? { Referer: referer, Origin: new URL(referer).origin } : {};
  return httpsBufferWithPinnedDns(url, 20_000, { maxBytes: 8_000_000, label: "Halaman", notFoundCode: "COMIC_PAGE_UPSTREAM_FAILED", headers });
}

async function dispatchSourceAction(adapter, action, requestUrl, dependencies) {
  const source = adapter.definition.id;
  if (["list", "search"].includes(action)) {
    if (!adapter.definition.capabilities.search) throw inputError("Source tidak mendukung pencarian.", "COMIC_SOURCE_ACTION_UNSUPPORTED", 400);
    const page = Math.max(1, Math.min(1000, Number.parseInt(queryValue(requestUrl, "page", 5), 10) || 1));
    const limit = Math.max(1, Math.min(50, Number.parseInt(queryValue(requestUrl, "limit", 3), 10) || 24));
    if (source === "mangadex") {
      const result = await adapter.search({ requestUrl, dependencies, page, limit });
      return { ...result, source, provider: adapter.definition.label, capabilities: adapter.definition.capabilities };
    }
    const result = await adapter.search({ query: queryValue(requestUrl, "q", 120), page, limit, fetchImpl: dependencies.fetchImpl, timeoutMs: dependencies.timeoutMs, signal: dependencies.signal });
    return { ...result, source, provider: adapter.definition.label, capabilities: adapter.definition.capabilities };
  }
  if (action === "detail") {
    const id = source === "mangadex" ? requireUuid(requestUrl.searchParams.get("id"), "ID komik") : genericId(requestUrl, "id");
    const data = await adapter.getManga({ requestUrl, dependencies, id, slug: queryValue(requestUrl, "slug", 220), titleHint: queryValue(requestUrl, "title", 500), fetchImpl: dependencies.fetchImpl, timeoutMs: dependencies.timeoutMs, signal: dependencies.signal });
    return { data, source, provider: adapter.definition.label, capabilities: adapter.definition.capabilities };
  }
  if (action === "chapters") {
    const mangaId = source === "mangadex" ? requireUuid(requestUrl.searchParams.get("id"), "ID komik") : genericId(requestUrl, "id");
    if (source === "mangadex") {
      const result = await adapter.getChapters({ requestUrl, dependencies, mangaId });
      return { data: result.chapters, languages: result.languages, source, provider: adapter.definition.label, capabilities: adapter.definition.capabilities };
    }
    const language = queryValue(requestUrl, "lang", 20).toLowerCase();
    const chapters = await adapter.getChapters({ mangaId, language, page: 1, limit: 100, fetchImpl: dependencies.fetchImpl, timeoutMs: dependencies.timeoutMs, signal: dependencies.signal });
    const languages = [...new Set(chapters.map((chapter) => chapter.language).filter(Boolean))].sort();
    return { data: chapters, languages, source, provider: adapter.definition.label, capabilities: adapter.definition.capabilities };
  }
  if (action === "pages") return sourcePagesResult(adapter, requestUrl, dependencies);
  throw inputError("Aksi komik tidak dikenal.", "COMIC_ACTION_INVALID");
}

async function handleComicReader(request, response, dependencies = {}) {
  const comicRequestOrigin = String(request.headers?.origin || "");
  if (comicRequestOrigin === "null") {
    response.setHeader("Access-Control-Allow-Origin", "null");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    return response.status(204).end();
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    return send(response, 405, { success: false, error: "METHOD_NOT_ALLOWED", message: "Gunakan metode GET." });
  }
  let source = "mangadex";
  let action = "";
  let started = Date.now();
  try {
    const requestUrl = new URL(request.url || "/api/comics", `http://${request.headers?.host || "localhost"}`);
    action = queryValue(requestUrl, "action", 30).toLowerCase();
    source = queryValue(requestUrl, "source", 40).toLowerCase() || "mangadex";
    const registry = getComicSourceRegistry();
    if (!action) return send(response, 200, { success: true, status: "ready", provider: "MangaDex", source: "mangadex", sources: publicSourceRegistry(registry), privacy: "no-account-required" }, request.method === "HEAD");
    if (action === "sources") return send(response, 200, { success: true, sources: publicSourceRegistry(registry) }, request.method === "HEAD");
    const adapter = registry.get(source);
    if (!adapter) throw inputError("Source komik tidak dikenal.", "COMIC_SOURCE_INVALID");
    const bucket = takeFixedWindow(requestBuckets, requestIp(request), { windowMs: 60_000, limit: 300, maxEntries: 5000 });
    if (!bucket.allowed) {
      response.setHeader("Retry-After", String(bucket.retryAfter));
      return send(response, 429, { success: false, error: "COMIC_RATE_LIMITED", message: "Terlalu banyak permintaan komik. Tunggu sebentar." });
    }
    if (action === "cover") {
      if (source !== "mangadex") throw inputError("Proxy sampul hanya tersedia untuk MangaDex.", "COMIC_SOURCE_ACTION_UNSUPPORTED");
      const cover = await comicCover(requestUrl, dependencies);
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      response.setHeader("Content-Type", /^image\/(?:jpeg|png|webp|avif)$/i.test(cover.contentType) ? cover.contentType : "image/jpeg");
      response.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      response.setHeader("Content-Length", String(cover.buffer.length));
      response.status(200);
      recordSourceHealth(source, { ok: true, status: 200, latency: Date.now() - started });
      if (request.method === "HEAD") return response.end();
      return typeof response.send === "function" ? response.send(cover.buffer) : response.end(cover.buffer);
    }
    if (action === "page-image") {
      const pageImage = source === "mangadex" ? await comicPageImage(requestUrl, dependencies) : await comicSourcePageImage(adapter, requestUrl, dependencies);
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      response.setHeader("Content-Type", /^image\/(?:jpeg|png|webp|avif)$/i.test(pageImage.contentType) ? pageImage.contentType : "image/jpeg");
      response.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      response.setHeader("Content-Length", String(pageImage.buffer.length));
      response.setHeader("Content-Disposition", "inline");
      response.status(200);
      recordSourceHealth(source, { ok: true, status: 200, latency: Date.now() - started });
      if (request.method === "HEAD") return response.end();
      return typeof response.send === "function" ? response.send(pageImage.buffer) : response.end(pageImage.buffer);
    }
    const result = await dispatchSourceAction(adapter, action, requestUrl, dependencies);
    recordSourceHealth(source, { ok: true, status: 200, latency: Date.now() - started });
    if (process.env.NODE_ENV !== "test") console.info(`[comic-source] provider=${source} action=${action} status=200 latency=${Date.now() - started}ms`);
    return send(response, 200, { success: true, ...result }, request.method === "HEAD");
  } catch (error) {
    const status = Math.max(400, Math.min(599, Number(error?.status || 500)));
    if (source && (status === 429 || status >= 500)) recordSourceHealth(source, { ok: false, status, latency: Date.now() - started });
    if (process.env.NODE_ENV !== "test") console.warn(`[comic-source] provider=${source || "unknown"} action=${action || "unknown"} status=${status} latency=${Date.now() - started}ms`);
    return send(response, status, { success: false, error: error?.code || "COMIC_FAILED", message: error?.message || "Fitur komik mengalami gangguan.", source }, request.method === "HEAD");
  }
}

function resetComicReaderState() {
  requestBuckets.clear();
  responseCache.clear();
  dnsCache.clear();
  clearSourceCache();
  resetSourceHealth();
}

module.exports = {
  CONTENT_RATINGS,
  MANGADEX_API,
  comicChapters,
  comicCover,
  comicDetail,
  comicPages,
  comicPageImage,
  fetchMangaDex,
  getComicSourceRegistry,
  handleComicReader,
  isPublicIpv4,
  listComics,
  resetComicReaderState
};

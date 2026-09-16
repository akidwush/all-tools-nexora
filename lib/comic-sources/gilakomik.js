"use strict";

const { normalizeChapter, normalizeManga, normalizePage, text } = require("./normalizer");
const { absoluteHttpsUrl, positiveInt, requestJson, token } = require("./shared");

const definition = Object.freeze({
  id: "gilakomik", label: "GilaKomik", apiBase: "https://api-md.gilakomik.id/api", languages: ["id"],
  capabilities: { search: true, detail: true, chapters: true, pages: true, languageFilter: false, pagination: true, translationCompatible: false },
  policy: "standard", imageHostSuffixes: [".gilakomik.id"]
});

const endpointDefinition = Object.freeze({
  id: "comic:gilakomik", group: "comic", label: "GilaKomik", category: "comic",
  allowedHosts: ["api-md.gilakomik.id"], defaultBaseUrl: definition.apiBase,
  defaultTimeoutMs: 12_000, minTimeoutMs: 1_000, maxTimeoutMs: 60_000,
  healthPath: "/manga/latest?page=1", healthMethod: "GET",
  editableFields: ["baseUrl", "timeoutMs", "healthPath"]
});

function dataOf(payload) { return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload; }
function slugOf(row) { return row?.slug || row?.manga_slug || row?.series_slug || null; }
function coverOf(row) { return absoluteHttpsUrl(row?.cover_url || row?.cover || row?.thumbnail || row?.poster); }

function mapManga(row) {
  if (!row) return null;
  return normalizeManga(definition.id, {
    id: row.slug || row.id,
    slug: slugOf(row),
    title: row.title || row.name,
    coverUrl: coverOf(row),
    description: row.description || row.synopsis,
    authors: Array.isArray(row.author) ? row.author : (typeof row.author === "string" ? row.author.split(",").map(s => s.trim()) : undefined),
    artists: Array.isArray(row.artist) ? row.artist : (typeof row.artist === "string" ? row.artist.split(",").map(s => s.trim()) : undefined),
    genres: Array.isArray(row.genres) ? row.genres : (typeof row.genre === "string" ? row.genre.split(",").map(s => s.trim()) : undefined),
    status: row.status,
    language: "id",
    url: row.url || null,
    metadata: { mediaType: row.type || "Komik" }
  });
}

async function listPage({ path, page = 1, fetchImpl, timeoutMs, signal }) {
  const params = { page: positiveInt(page, { max: 1000 }) };
  const payload = await requestJson({ endpointDefinition, base: definition.apiBase, path, params, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 60_000 });
  const rows = dataOf(payload);
  return Array.isArray(rows) ? rows : (Array.isArray(payload) ? payload : []);
}

async function search({ query = "", page = 1, fetchImpl, timeoutMs, signal }) {
  const q = text(query, 120);
  let rows;
  if (q) {
      const payload = await requestJson({ endpointDefinition, base: definition.apiBase, path: `/manga/search/${encodeURIComponent(q)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
      rows = dataOf(payload);
      if (!Array.isArray(rows)) rows = Array.isArray(payload) ? payload : [];
  } else {
      rows = await listPage({ path: "/manga/latest", page, fetchImpl, timeoutMs, signal });
  }

  const items = rows.map(mapManga).filter(Boolean);
  return { items, hasMore: items.length >= 20, page }; // Fallback hasMore as we don't have metadata structure
}

async function getManga({ id, slug, titleHint, fetchImpl, timeoutMs, signal }) {
  const detailKey = text(slug, 220) || token(id, "ID manga");
  const fallback = normalizeManga(definition.id, { id: detailKey, slug: detailKey, title: titleHint || null, language: "id", metadata: { mediaType: "Komik" } });

  try {
    const payload = await requestJson({ endpointDefinition, base: definition.apiBase, path: `/manga/${encodeURIComponent(detailKey)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
    return mapManga(dataOf(payload) || payload || {}) || fallback;
  } catch (error) {
    if (titleHint) return fallback;
    throw error;
  }
}

async function getChapters({ mangaId, slug, fetchImpl, timeoutMs, signal }) {
  const detailKey = text(slug, 220) || token(mangaId, "ID manga");
  const payload = await requestJson({ endpointDefinition, base: definition.apiBase, path: `/manga/${encodeURIComponent(detailKey)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
  const body = dataOf(payload) || payload || {};
  const rows = Array.isArray(body.chapter_list) ? body.chapter_list : (Array.isArray(body.chapters) ? body.chapters : []);

  return rows.map(row => normalizeChapter(definition.id, {
      id: row.slug || row.id,
      mangaId: detailKey,
      title: row.title || row.chapter_title || null,
      number: row.chapter_number || row.number,
      language: "id",
      publishedAt: row.release_date || row.created_at || null,
      metadata: {}
  })).filter(Boolean);
}

async function getPages({ chapterId, fetchImpl, timeoutMs, signal }) {
  const id = token(chapterId, "ID chapter", 260);
  const payload = await requestJson({ endpointDefinition, base: definition.apiBase, path: `/manga/chapter/${encodeURIComponent(id)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
  const body = dataOf(payload) || payload || {};

  const files = Array.isArray(body.chapter_image) ? body.chapter_image : (Array.isArray(body.images) ? body.images : (Array.isArray(body.pages) ? body.pages : []));

  return files.map((file, index) => normalizePage(definition.id, {
      chapterId: id,
      index,
      url: typeof file === 'string' ? file : file.url || file.src,
      refererRequired: true,
      metadata: { referer: "https://gilakomik.id/" }
  })).filter(p => Boolean(p.url));
}

module.exports = { definition, endpointDefinition, getChapters, getManga, getPages, search };

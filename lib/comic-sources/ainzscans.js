"use strict";
const { normalizeChapter, normalizeManga, normalizePage, text } = require("./normalizer");
const { absoluteHttpsUrl, positiveInt, requestJson, slug } = require("./shared");
const definition = Object.freeze({
  id: "ainzscans", label: "Ainzscans", apiBase: "https://api.ainzscans01.com/api/", website: "https://v3.ainzscans01.com", languages: ["id"],
  capabilities: { search: true, detail: true, chapters: true, pages: true, languageFilter: false, pagination: true, translationCompatible: false },
  policy: "experimental", imageHostSuffixes: [".ainzscans01.com"]
});
function dataOf(value) { return value?.data ?? value; }
function cleanTitle(title) { return text(title, 500).replace(/\s+Bahasa\s+Indonesia\s*$/i, "").trim(); }
function mapManga(row = {}) {
  const id = row.slug || row.id;
  return normalizeManga(definition.id, { id, slug: id, title: cleanTitle(row.title || row.name), altTitles: row.alternative_titles || row.alt_titles, coverUrl: absoluteHttpsUrl(row.poster_image_url || row.cover || row.cover_url || row.thumbnail || row.image, definition.apiBase), description: row.description || row.synopsis, authors: row.authors || (row.author_name ? [row.author_name] : (row.author ? [row.author] : [])), artists: row.artists || (row.artist_name ? [row.artist_name] : (row.artist ? [row.artist] : [])), genres: row.genres, status: row.comic_status || row.status, language: "id", url: id ? `${definition.website}/comic/${encodeURIComponent(id)}` : null, metadata: { mediaType: row.type || "Komik" } });
}
async function listPage({ page = 1, limit = 24, query = "", fetchImpl, timeoutMs, signal }) {
  const params = { type: "COMIC", limit: positiveInt(limit, { min: 1, max: 50, fallback: 24 }), page: positiveInt(page, { max: 1000 }), sort: "latest", order: "desc" };
  const q = text(query, 120); if (q) params.q = q;
  const payload = await requestJson({ base: definition.apiBase, path: "./search", params, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
  const rows = dataOf(payload);
  return Array.isArray(rows) ? rows : [];
}
async function search({ query = "", page = 1, limit = 24, fetchImpl, timeoutMs, signal }) {
  const requestedLimit = Math.min(50, Math.max(1, limit));
  const rows = await listPage({ page, limit: requestedLimit, query, fetchImpl, timeoutMs, signal });
  return { items: rows.map(mapManga).slice(0, limit), hasMore: rows.length >= requestedLimit, page };
}
async function getManga({ id, fetchImpl, timeoutMs, signal }) {
  const safe = slug(id, "Slug manga");
  const payload = await requestJson({ base: definition.apiBase, path: `./series/comic/${encodeURIComponent(safe)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
  return mapManga(payload || {});
}
async function getChapters({ mangaId, fetchImpl, timeoutMs, signal }) {
  const safe = slug(mangaId, "Slug manga");
  const payload = await requestJson({ base: definition.apiBase, path: `./series/comic/${encodeURIComponent(safe)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
  const rows = Array.isArray(payload?.units) ? payload.units : [];
  return rows.slice().sort((a, b) => Number.parseFloat(b?.sort_number || b?.number || 0) - Number.parseFloat(a?.sort_number || a?.number || 0)).map((row) => normalizeChapter(definition.id, { id: row?.slug, mangaId: safe, title: null, number: row?.number, language: "id", metadata: {} }));
}
async function getPages({ mangaId, chapterId, fetchImpl, timeoutMs, signal }) {
  const manga = slug(mangaId, "Slug manga"); const chapter = slug(chapterId, "Slug chapter", 260);
  const payload = await requestJson({ base: definition.apiBase, path: `./series/comic/${encodeURIComponent(manga)}/chapter/${encodeURIComponent(chapter)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
  const pages = Array.isArray(payload?.chapter?.pages) ? payload.chapter.pages : [];
  return pages.map((row, index) => normalizePage(definition.id, { chapterId: chapter, index, url: new URL(row?.image_url, definition.apiBase).toString(), refererRequired: false }));
}
module.exports = { definition, getChapters, getManga, getPages, search };

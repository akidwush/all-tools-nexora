"use strict";
const { normalizeChapter, normalizeManga, normalizePage, text } = require("./normalizer");
const { positiveInt, requestJson, slug } = require("./shared");

const definition = Object.freeze({
  id: "voratoon", label: "Voratoon", apiBase: "https://api.voratoon.com/series/", website: "https://v2.voratoon.com", languages: ["id"],
  capabilities: { search: true, detail: true, chapters: true, pages: true, languageFilter: false, pagination: true, translationCompatible: false },
  policy: "experimental", imageHostSuffixes: [".voratoon.com"]
});
function dataOf(value) { return value?.data ?? value; }
function unwrap(row) { return row?.data && typeof row.data === "object" ? row.data : row; }
function headers() { return { Referer: `${definition.website}/`, Origin: definition.website }; }
function mapManga(raw) {
  const row = unwrap(raw) || {};
  const slugValue = row.slug || row.id;
  return normalizeManga(definition.id, {
    id: slugValue,
    slug: slugValue,
    title: row.title || row.name,
    altTitles: row.alternative_titles || row.alt_titles,
    coverUrl: row.cover || row.cover_url || row.thumbnail || row.image,
    description: row.description || row.synopsis,
    authors: row.authors || (row.author ? [row.author] : []), artists: row.artists || (row.artist ? [row.artist] : []), genres: row.genres,
    status: row.status, language: "id", url: slugValue ? `${definition.website}/series/${encodeURIComponent(slugValue)}` : null,
    metadata: { mediaType: row.type || row.format || "Komik" }
  });
}
async function listPage({ page = 1, limit = 24, fetchImpl, timeoutMs, signal }) {
  const take = positiveInt(limit, { min: 1, max: 50, fallback: 24 });
  const payload = await requestJson({ base: definition.apiBase, path: "./", params: { take, page: positiveInt(page, { max: 1000 }) }, headers: headers(), provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
  const rows = dataOf(payload);
  return Array.isArray(rows) ? rows : [];
}
async function search({ query = "", page = 1, limit = 24, fetchImpl, timeoutMs, signal }) {
  const q = text(query, 120).toLowerCase(); const out = [];
  for (let offset = 0; offset < (q ? 3 : 1) && out.length < limit; offset += 1) {
    const rows = await listPage({ page: page + offset, limit: Math.min(50, Math.max(24, limit)), fetchImpl, timeoutMs, signal });
    out.push(...rows.map(mapManga).filter((m) => !q || [m.title, ...m.altTitles].some((name) => String(name || "").toLowerCase().includes(q))));
    if (rows.length < Math.min(50, Math.max(24, limit))) break;
  }
  return { items: out.slice(0, limit), hasMore: out.length >= limit, page };
}
async function getManga({ id, fetchImpl, timeoutMs, signal }) {
  const safe = slug(id, "Slug manga");
  const payload = await requestJson({ base: definition.apiBase, path: `./${encodeURIComponent(safe)}`, headers: headers(), provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
  return mapManga(dataOf(payload));
}
async function getChapters({ mangaId, fetchImpl, timeoutMs, signal }) {
  const safe = slug(mangaId, "Slug manga");
  const payload = await requestJson({ base: definition.apiBase, path: `./${encodeURIComponent(safe)}/chapters`, headers: headers(), provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
  const rows = dataOf(payload);
  return (Array.isArray(rows) ? rows : []).map((raw) => { const row = unwrap(raw) || {}; return normalizeChapter(definition.id, { id: String(row.index), mangaId: safe, title: row.title || null, number: row.index, language: "id", metadata: {} }); });
}
async function getPages({ mangaId, chapterId, fetchImpl, timeoutMs, signal }) {
  const manga = slug(mangaId, "Slug manga");
  const chapter = text(chapterId, 80);
  if (!/^\d+(?:\.\d+)?$/.test(chapter)) throw Object.assign(new Error("ID chapter tidak valid."), { code: "COMIC_ID_INVALID", status: 400 });
  const payload = await requestJson({ base: definition.apiBase, path: `./${encodeURIComponent(manga)}/chapters/${encodeURIComponent(chapter)}`, headers: headers(), provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
  const row = unwrap(dataOf(payload)) || {};
  const images = Array.isArray(row.images) ? row.images : [];
  return images.map((image, index) => normalizePage(definition.id, { chapterId: chapter, index, url: image, refererRequired: true, metadata: { referer: `${definition.website}/` } }));
}
module.exports = { definition, getChapters, getManga, getPages, search };

"use strict";
const { normalizeChapter, normalizeManga, normalizePage, text } = require("./normalizer");
const { positiveInt, requestJson, token } = require("./shared");

const definition = Object.freeze({
  id: "shinigami", label: "Shinigami ID", apiBase: "https://api.shngm.io/v1/", languages: ["id"],
  capabilities: { search: true, detail: true, chapters: true, pages: true, languageFilter: false, pagination: true, translationCompatible: false },
  policy: "experimental", imageHostSuffixes: [".shngm.io", ".shinigami.asia"]
});

function dataOf(payload) { return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload; }
function coverOf(row) { return row?.cover_url || row?.cover || row?.thumbnail || row?.poster || null; }
function slugOf(row) { return row?.slug || row?.manga_slug || row?.series_slug || null; }

function mapManga(row) {
  return normalizeManga(definition.id, {
    id: row?.manga_id || row?.id,
    slug: slugOf(row),
    title: row?.title || row?.name,
    coverUrl: coverOf(row),
    description: row?.description || row?.synopsis,
    authors: row?.author ? [row.author] : row?.authors,
    artists: row?.artist ? [row.artist] : row?.artists,
    genres: row?.genres || row?.genre,
    status: row?.status,
    language: "id",
    url: /^https:\/\//i.test(String(row?.url || "")) ? row.url : null,
    metadata: { mediaType: row?.type || "Komik" }
  });
}

async function listPage({ page = 1, limit = 50, fetchImpl, timeoutMs, signal }) {
  const payload = await requestJson({ base: definition.apiBase, path: "./manga/list", params: { page: positiveInt(page, { max: 1000 }), page_size: positiveInt(limit, { min: 1, max: 50, fallback: 24 }) }, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
  const rows = dataOf(payload);
  return Array.isArray(rows) ? rows : [];
}

async function search({ query = "", page = 1, limit = 24, fetchImpl, timeoutMs, signal }) {
  const q = text(query, 120).toLowerCase();
  const maxPages = q ? 3 : 1;
  const collected = [];
  for (let offset = 0; offset < maxPages && collected.length < limit; offset += 1) {
    const rows = await listPage({ page: page + offset, limit: Math.min(50, Math.max(limit, 24)), fetchImpl, timeoutMs, signal });
    const mapped = rows.map(mapManga).filter((m) => !q || [m.title, ...m.altTitles].some((title) => String(title || "").toLowerCase().includes(q)));
    collected.push(...mapped);
    if (rows.length < Math.min(50, Math.max(limit, 24))) break;
  }
  return { items: collected.slice(0, limit), hasMore: collected.length >= limit, page };
}

async function getManga({ id, slug, titleHint, fetchImpl, timeoutMs, signal }) {
  const fallback = normalizeManga(definition.id, { id: token(id, "ID manga"), slug: slug || null, title: titleHint || null, language: "id", metadata: { mediaType: "Komik" } });
  const safeSlug = text(slug, 220);
  if (!safeSlug || !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,219}$/.test(safeSlug)) return fallback;
  try {
    const payload = await requestJson({ base: definition.apiBase, path: `./manga/detail/${encodeURIComponent(safeSlug)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
    return mapManga(dataOf(payload) || {});
  } catch (error) {
    if (titleHint) return fallback;
    throw error;
  }
}

async function getChapters({ mangaId, page = 1, limit = 100, fetchImpl, timeoutMs, signal }) {
  const id = token(mangaId, "ID manga");
  const payload = await requestJson({ base: definition.apiBase, path: `./chapter/${encodeURIComponent(id)}/list`, params: { page: positiveInt(page, { max: 1000 }), page_size: positiveInt(limit, { min: 1, max: 100, fallback: 100 }) }, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
  const rows = dataOf(payload);
  return (Array.isArray(rows) ? rows : []).map((row) => normalizeChapter(definition.id, { id: row?.chapter_id || row?.id, mangaId: id, title: row?.chapter_title || null, number: row?.chapter_number, language: "id", metadata: {} }));
}

async function getPages({ chapterId, fetchImpl, timeoutMs, signal }) {
  const id = token(chapterId, "ID chapter", 260);
  const payload = await requestJson({ base: definition.apiBase, path: `./chapter/detail/${encodeURIComponent(id)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
  const body = dataOf(payload) || {};
  const base = text(body.base_url, 2000);
  const path = text(body.chapter?.path, 1000);
  const files = Array.isArray(body.chapter?.data) ? body.chapter.data : [];
  if (!/^https:\/\//i.test(base) || !files.length) return [];
  return files.map((file, index) => normalizePage(definition.id, { chapterId: id, index, url: new URL(`${path}${text(file, 500)}`, base).toString(), refererRequired: false }));
}

module.exports = { definition, getChapters, getManga, getPages, search };

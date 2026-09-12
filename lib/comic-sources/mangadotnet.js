"use strict";
const { normalizeChapter, normalizeManga, normalizePage, text } = require("./normalizer");
const { absoluteHttpsUrl, positiveInt, requestJson, token } = require("./shared");
const definition = Object.freeze({
  id: "mangadotnet", label: "MangaDotNet", apiBase: "https://mangadot.net/api/", website: "https://mangadot.net", languages: ["multi", "id"],
  capabilities: { search: true, detail: true, chapters: true, pages: true, languageFilter: true, pagination: true, translationCompatible: false },
  policy: "experimental", imageHostSuffixes: ["mangadot.net"]
});
function mapManga(row = {}) {
  return normalizeManga(definition.id, { id: row.id, title: row.title || row.name, altTitles: row.alt_titles || row.altTitles, coverUrl: absoluteHttpsUrl(row.photo || row.cover || row.cover_url || row.thumbnail || row.image, definition.website), description: row.description || row.synopsis, authors: row.authors || (row.author ? [row.author] : []), artists: row.artists || (row.artist ? [row.artist] : []), genres: row.genres, status: row.status, language: row.language || null, url: row.id != null ? `${definition.website}/manga/${encodeURIComponent(row.id)}` : null, metadata: { mediaType: row.type || "Komik" } });
}
async function listPage({ page = 1, limit = 24, query = "", fetchImpl, timeoutMs, signal }) {
  const q = text(query, 120);
  const params = {
    search: q,
    sortBy: q ? "relevance" : "latest",
    sortOrder: "desc",
    page: positiveInt(page, { max: 2000 }),
    limit: positiveInt(limit, { min: 1, max: 50, fallback: 24 })
  };
  const payload = await requestJson({ base: definition.apiBase, path: "./search", params, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
  return { rows: Array.isArray(payload?.manga_list) ? payload.manga_list : [], pagination: payload?.pagination && typeof payload.pagination === "object" ? payload.pagination : {} };
}
async function search({ query = "", page = 1, limit = 24, fetchImpl, timeoutMs, signal }) {
  const requestedLimit = Math.min(50, Math.max(1, limit));
  const { rows, pagination } = await listPage({ page, limit: requestedLimit, query, fetchImpl, timeoutMs, signal });
  const current = Number(pagination.current_page || pagination.currentPage || page) || page;
  const totalPages = Number(pagination.total_pages || pagination.totalPages || 0);
  return { items: rows.map(mapManga).slice(0, limit), hasMore: totalPages ? current < totalPages : rows.length >= requestedLimit, page };
}
async function getManga({ id, titleHint }) {
  const safe = token(id, "ID manga", 80);
  return normalizeManga(definition.id, { id: safe, title: titleHint || null, url: `${definition.website}/manga/${encodeURIComponent(safe)}`, metadata: { mediaType: "Komik" } });
}
async function getChapters({ mangaId, language, fetchImpl, timeoutMs, signal }) {
  const manga = token(mangaId, "ID manga", 80);
  const [chaptersPayload, volumesPayload] = await Promise.all([
    requestJson({ base: definition.apiBase, path: `./manga/${encodeURIComponent(manga)}/chapters/list`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 }),
    requestJson({ base: definition.apiBase, path: `./manga/${encodeURIComponent(manga)}/volumes`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 }).catch(() => [])
  ]);
  const chapters = (Array.isArray(chaptersPayload) ? chaptersPayload : []).filter((row) => !language || String(row?.language || "").toLowerCase() === String(language).toLowerCase()).map((row) => normalizeChapter(definition.id, { id: `${row?.source === "user" ? "upload" : "chapter"}:${row?.id}`, mangaId: manga, title: null, number: row?.chapter_number, language: row?.language || null, publishedAt: row?.date_added || null, group: row?.scanlator_name || row?.group_name || null, metadata: { pageCount: row?.page_count || null } }));
  const volumes = (Array.isArray(volumesPayload) ? volumesPayload : []).map((row) => normalizeChapter(definition.id, { id: `upload:${row?.id}`, mangaId: manga, title: `Volume ${row?.volume_number}`, volume: row?.volume_number, language: null, metadata: { volume: true } }));
  return [...chapters, ...volumes];
}
async function getPages({ chapterId, fetchImpl, timeoutMs, signal }) {
  const raw = token(chapterId, "ID chapter", 120); const match = raw.match(/^(chapter|upload):(\d+)$/);
  if (!match) throw Object.assign(new Error("ID chapter tidak valid."), { code: "COMIC_ID_INVALID", status: 400 });
  const path = match[1] === "upload" ? `./uploads/${match[2]}/images` : `./chapters/${match[2]}/images`;
  const payload = await requestJson({ base: definition.apiBase, path, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
  const rows = Array.isArray(payload?.images) ? payload.images : [];
  return rows.map((row, index) => normalizePage(definition.id, { chapterId: raw, index, url: new URL(row?.url, definition.website).toString(), width: row?.w || row?.width, height: row?.h || row?.height, refererRequired: true, metadata: { referer: `${definition.website}/` } }));
}
module.exports = { definition, getChapters, getManga, getPages, search };

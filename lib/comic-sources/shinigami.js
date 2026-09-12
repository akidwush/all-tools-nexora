"use strict";
const { normalizeChapter, normalizeManga, normalizePage, text } = require("./normalizer");
const { absoluteHttpsUrl, positiveInt, requestJson, token } = require("./shared");

const definition = Object.freeze({
  id: "shinigami", label: "Shinigami ID", apiBase: "https://api.shngm.io/v1/", languages: ["id"],
  capabilities: { search: true, detail: true, chapters: true, pages: true, languageFilter: false, pagination: true, translationCompatible: false },
  policy: "experimental", imageHostSuffixes: [".shngm.io", ".shngm.id", ".shinigami.asia"]
});

function dataOf(payload) { return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload; }
function coverOf(row) { return absoluteHttpsUrl(row?.cover_portrait_url || row?.cover_image_url || row?.cover_url || row?.cover || row?.thumbnail || row?.poster, "https://storage.shngm.id/"); }
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

async function listPage({ page = 1, limit = 50, query = "", fetchImpl, timeoutMs, signal }) {
  const params = {
    page: positiveInt(page, { max: 1000 }),
    page_size: positiveInt(limit, { min: 1, max: 50, fallback: 24 }),
    type: "project",
    is_update: "true",
    sort: "latest",
    sort_order: "desc"
  };
  const q = text(query, 120);
  if (q) params.q = q;
  const payload = await requestJson({ base: definition.apiBase, path: "./manga/list", params, headers: { Origin: "https://app.shinigami.asia", Referer: "https://app.shinigami.asia/" }, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000 });
  const rows = dataOf(payload);
  return { rows: Array.isArray(rows) ? rows : [], meta: payload?.meta && typeof payload.meta === "object" ? payload.meta : {} };
}

async function search({ query = "", page = 1, limit = 24, fetchImpl, timeoutMs, signal }) {
  const q = text(query, 120);
  const { rows, meta } = await listPage({ page, limit: Math.min(50, Math.max(limit, 24)), query: q, fetchImpl, timeoutMs, signal });
  const items = rows.map(mapManga);
  const current = Number(meta.page || page) || page;
  const totalPages = Number(meta.total_page || meta.total_pages || 0);
  return { items: items.slice(0, limit), hasMore: totalPages ? current < totalPages : rows.length >= Math.min(50, Math.max(limit, 24)), page };
}

async function getManga({ id, slug, titleHint, fetchImpl, timeoutMs, signal }) {
  const safeId = token(id, "ID manga");
  const fallback = normalizeManga(definition.id, { id: safeId, slug: slug || null, title: titleHint || null, language: "id", metadata: { mediaType: "Komik" } });
  const detailKey = text(slug, 220) || safeId;
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,219}$/.test(detailKey)) return fallback;
  try {
    const payload = await requestJson({ base: definition.apiBase, path: `./manga/detail/${encodeURIComponent(detailKey)}`, headers: { Origin: "https://app.shinigami.asia", Referer: "https://app.shinigami.asia/" }, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
    return mapManga(dataOf(payload) || {});
  } catch (error) {
    if (titleHint) return fallback;
    throw error;
  }
}

async function getChapters({ mangaId, fetchImpl, timeoutMs, signal }) {
  const id = token(mangaId, "ID manga");
  const pageSize = 100;
  const maxPages = 50;
  const chapters = [];
  const seen = new Set();
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await requestJson({
      base: definition.apiBase,
      path: `./chapter/${encodeURIComponent(id)}/list`,
      params: { page, page_size: pageSize, sort_by: "chapter_number", sort_order: "desc" },
      headers: { Origin: "https://app.shinigami.asia", Referer: "https://app.shinigami.asia/" },
      provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 120_000
    });
    const rows = dataOf(payload);
    const batch = Array.isArray(rows) ? rows : [];
    for (const row of batch) {
      const chapter = normalizeChapter(definition.id, { id: row?.chapter_id || row?.id, mangaId: id, title: row?.chapter_title || null, number: row?.chapter_number, language: "id", publishedAt: row?.release_date || row?.created_at || null, metadata: {} });
      if (!seen.has(chapter.id)) { seen.add(chapter.id); chapters.push(chapter); }
    }
    const meta = payload?.meta && typeof payload.meta === "object" ? payload.meta : {};
    const current = Number(meta.page || page) || page;
    const totalPages = Number(meta.total_page || meta.total_pages || 0);
    if ((totalPages && current >= totalPages) || batch.length < pageSize || !batch.length) break;
  }
  return chapters;
}

async function getPages({ chapterId, fetchImpl, timeoutMs, signal }) {
  const id = token(chapterId, "ID chapter", 260);
  const payload = await requestJson({ base: definition.apiBase, path: `./chapter/detail/${encodeURIComponent(id)}`, provider: definition.label, fetchImpl, timeoutMs, signal, cacheMs: 300_000 });
  const body = dataOf(payload) || {};
  const base = text(body.base_url, 2000);
  const path = text(body.chapter?.path, 1000);
  const files = Array.isArray(body.chapter?.data) ? body.chapter.data : [];
  if (!/^https:\/\//i.test(base) || !files.length) return [];
  return files.map((file, index) => normalizePage(definition.id, { chapterId: id, index, url: new URL(`${path}${text(file, 500)}`, base).toString(), refererRequired: true, metadata: { referer: "https://app.shinigami.asia/" } }));
}

module.exports = { definition, getChapters, getManga, getPages, search };

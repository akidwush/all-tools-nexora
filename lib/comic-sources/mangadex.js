"use strict";
const { normalizeChapter, normalizeManga, normalizePage, mediaTypeFromLanguage } = require("./normalizer");

const definition = Object.freeze({
  id: "mangadex", label: "MangaDex", apiBase: "https://api.mangadex.org", website: "https://mangadex.org", languages: ["multi"],
  capabilities: { search: true, detail: true, chapters: true, pages: true, languageFilter: true, pagination: true, translationCompatible: true },
  policy: "active", imageHostSuffixes: [".mangadex.network", ".mangadex.org"]
});

function createMangaDexAdapter(legacy) {
  return {
    definition,
    async search(context) {
      const result = await legacy.list(context.requestUrl, context.dependencies);
      return {
        ...result,
        items: result.items.map((item) => normalizeManga(definition.id, { id: item.id, title: item.title, coverUrl: item.cover, status: item.status, language: item.language || null, url: `${definition.website}/title/${item.id}`, metadata: { mediaType: item.type || mediaTypeFromLanguage(item.language) } }))
      };
    },
    async getManga(context) {
      const result = await legacy.detail(context.requestUrl, context.dependencies);
      const row = result.data;
      return normalizeManga(definition.id, { id: row.id, title: row.title, coverUrl: row.cover, description: row.desc, authors: row.author ? [row.author] : [], genres: row.genres, status: row.status, language: row.language || null, url: `${definition.website}/title/${row.id}`, metadata: { mediaType: row.type, year: row.year } });
    },
    async getChapters(context) {
      const result = await legacy.chapters(context.requestUrl, context.dependencies);
      return {
        languages: result.languages || [],
        chapters: result.data.map((row) => normalizeChapter(definition.id, { id: row.id, mangaId: context.mangaId, title: row.title || row.extra || null, number: row.number || String(row.name || "").replace(/^Chapter\s*/i, "") || null, volume: row.volume || null, language: row.lang || null, publishedAt: row.publishedAt || null, group: row.group || null, metadata: { displayName: row.name || null, displayExtra: row.extra || null, displayDate: row.date || null } }))
      };
    },
    async getPages(context) {
      const manifest = await legacy.manifest(context.chapterId, context.quality, context.dependencies);
      return manifest.images.map((url, index) => normalizePage(definition.id, { chapterId: context.chapterId, index, url, refererRequired: false, metadata: { quality: manifest.quality } }));
    }
  };
}
module.exports = { createMangaDexAdapter, definition };

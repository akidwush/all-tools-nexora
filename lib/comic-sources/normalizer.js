"use strict";

function text(value, maximum = 12000) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function stringList(value, maximum = 60) {
  const rows = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(rows.map((row) => text(row, 400)).filter(Boolean))].slice(0, maximum);
}

function plainMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, row] of Object.entries(value)) {
    const safeKey = text(key, 80);
    if (!safeKey) continue;
    if (row == null || ["string", "number", "boolean"].includes(typeof row)) out[safeKey] = row;
  }
  return out;
}

function normalizeManga(source, value = {}) {
  const id = text(value.id, 220);
  if (!id) throw new Error(`Normalized Manga ${source} membutuhkan id.`);
  const title = text(value.title, 500) || null;
  return {
    source: text(source, 40),
    id,
    slug: text(value.slug, 220) || null,
    title,
    altTitles: stringList(value.altTitles, 40),
    coverUrl: text(value.coverUrl, 2000) || null,
    description: text(value.description, 12000) || null,
    authors: stringList(value.authors, 30),
    artists: stringList(value.artists, 30),
    genres: stringList(value.genres, 40),
    status: text(value.status, 80) || null,
    language: text(value.language, 40) || null,
    url: /^https:\/\//i.test(String(value.url || "")) ? text(value.url, 2000) : null,
    metadata: plainMetadata(value.metadata)
  };
}

function normalizeChapter(source, value = {}) {
  const id = text(value.id, 260);
  if (!id) throw new Error(`Normalized Chapter ${source} membutuhkan id.`);
  return {
    source: text(source, 40),
    id,
    mangaId: text(value.mangaId, 220) || null,
    title: text(value.title, 500) || null,
    number: value.number == null || value.number === "" ? null : text(value.number, 80),
    volume: value.volume == null || value.volume === "" ? null : text(value.volume, 80),
    language: text(value.language, 40) || null,
    publishedAt: value.publishedAt ? text(value.publishedAt, 80) : null,
    group: text(value.group, 300) || null,
    metadata: plainMetadata(value.metadata)
  };
}

function normalizePage(source, value = {}) {
  const url = text(value.url, 3000);
  if (!/^https:\/\//i.test(url)) throw new Error(`Normalized Page ${source} membutuhkan URL HTTPS.`);
  return {
    source: text(source, 40),
    chapterId: text(value.chapterId, 260) || null,
    index: Math.max(0, Number.isInteger(Number(value.index)) ? Number(value.index) : 0),
    url,
    width: Number.isFinite(Number(value.width)) && Number(value.width) > 0 ? Number(value.width) : null,
    height: Number.isFinite(Number(value.height)) && Number(value.height) > 0 ? Number(value.height) : null,
    refererRequired: Boolean(value.refererRequired),
    metadata: plainMetadata(value.metadata)
  };
}

function mediaTypeFromLanguage(language) {
  const lang = text(language, 20).toLowerCase();
  if (lang === "ja") return "Manga";
  if (lang === "ko") return "Manhwa";
  if (["zh", "zh-hk", "zh-cn"].includes(lang)) return "Manhua";
  return "Komik";
}

module.exports = { mediaTypeFromLanguage, normalizeChapter, normalizeManga, normalizePage, plainMetadata, stringList, text };

"use strict";

const { databaseRequest } = require("./database");

const CACHE_TTL_MS = 30_000;
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  maxConcurrentAi: 4,
  providers: Object.freeze({})
});
let cached = null;

function boolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalize(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const providerSource = source.providers && typeof source.providers === "object" && !Array.isArray(source.providers)
    ? source.providers : {};
  const providers = {};
  for (const [id, enabled] of Object.entries(providerSource)) {
    if (/^[a-z0-9-]{2,40}$/.test(id) && typeof enabled === "boolean") providers[id] = enabled;
  }
  return {
    enabled: boolean(source.enabled, DEFAULT_SETTINGS.enabled),
    maxConcurrentAi: Math.max(1, Math.min(5, Number(source.maxConcurrentAi) || DEFAULT_SETTINGS.maxConcurrentAi)),
    providers
  };
}

async function readMultiAiSettings(options = {}) {
  const now = Date.now();
  if (!options.fresh && cached && cached.expiresAt > now) return cached.value;
  try {
    const rows = await (options.databaseRequest || databaseRequest)("app_settings?select=value&key=eq.multi_ai&limit=1", { method: "GET" });
    const value = normalize(rows?.[0]?.value);
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    const value = normalize(DEFAULT_SETTINGS);
    cached = { value, expiresAt: now + 5_000 };
    return value;
  }
}

function clearMultiAiSettingsCache() { cached = null; }

module.exports = { DEFAULT_SETTINGS, clearMultiAiSettingsCache, normalizeMultiAiSettings: normalize, readMultiAiSettings };

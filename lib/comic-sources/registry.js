"use strict";
const { createMangaDexAdapter, definition: mangadexDefinition } = require("./mangadex");
const shinigami = require("./shinigami");
const voratoon = require("./voratoon");
const ainzscans = require("./ainzscans");
const mangadotnet = require("./mangadotnet");

const health = new Map();
function createComicSourceRegistry(legacy) {
  const adapters = [createMangaDexAdapter(legacy), shinigami, voratoon, ainzscans, mangadotnet];
  return new Map(adapters.map((adapter) => [adapter.definition.id, adapter]));
}
function recordSourceHealth(id, { ok, status, latency }) {
  const previous = health.get(id) || { recent: [] };
  const recent = [...previous.recent, { ok: Boolean(ok), status: Number(status || (ok ? 200 : 502)), latency: Math.max(0, Math.round(Number(latency) || 0)), at: Date.now() }].slice(-20);
  health.set(id, { recent });
}
function sourceHealth(id) {
  const rows = health.get(id)?.recent || [];
  if (!rows.length) return { status: "unchecked", lastCheckedAt: null, latency: null, requestCount: 0, errorRate: null };
  const last = rows[rows.length - 1];
  const errors = rows.filter((row) => !row.ok).length;
  const errorRate = errors / rows.length;
  let status = "active";
  if (!last.ok && rows.slice(-3).every((row) => !row.ok)) status = "unavailable";
  else if (!last.ok || errorRate >= 0.35) status = "degraded";
  return { status, lastCheckedAt: new Date(last.at).toISOString(), latency: last.latency, requestCount: rows.length, errorRate: Number(errorRate.toFixed(3)) };
}
function publicSourceRegistry(registry) {
  return [...registry.values()].map((adapter) => {
    const currentHealth = sourceHealth(adapter.definition.id);
    return { ...adapter.definition, status: currentHealth.status, health: currentHealth };
  });
}
function isAllowedImageHost(definition, hostname) {
  const host = String(hostname || "").toLowerCase();
  return (definition.imageHostSuffixes || []).some((suffix) => {
    const value = String(suffix).toLowerCase();
    return value.startsWith(".") ? host === value.slice(1) || host.endsWith(value) : host === value || host.endsWith(`.${value}`);
  });
}
function resetSourceHealth() { health.clear(); }
module.exports = { createComicSourceRegistry, isAllowedImageHost, mangadexDefinition, publicSourceRegistry, recordSourceHealth, resetSourceHealth, sourceHealth };

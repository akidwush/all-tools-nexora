"use strict";

const DEFAULT_MAX_ENTRIES = 2_000;

function normalizedLimit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function pruneMap(store, options = {}) {
  if (!(store instanceof Map)) throw new TypeError("store harus berupa Map");
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const maxEntries = normalizedLimit(options.maxEntries, DEFAULT_MAX_ENTRIES);
  const isExpired = typeof options.isExpired === "function" ? options.isExpired : null;

  if (isExpired) {
    for (const [key, value] of store) {
      if (isExpired(value, key, now)) store.delete(key);
    }
  }

  let overflow = store.size - maxEntries;
  if (overflow > 0) {
    for (const key of store.keys()) {
      store.delete(key);
      overflow -= 1;
      if (overflow <= 0) break;
    }
  }
  return store.size;
}

function setBounded(store, key, value, options = {}) {
  if (store.has(key)) store.delete(key);
  store.set(key, value);
  pruneMap(store, options);
  return value;
}

function takeFixedWindow(store, key, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const windowMs = normalizedLimit(options.windowMs, 60_000);
  const limit = normalizedLimit(options.limit, 1);
  let item = store.get(key);

  if (!item || !Number.isFinite(item.resetAt) || item.resetAt <= now) {
    item = { count: 1, resetAt: now + windowMs };
  } else {
    item.count = normalizedLimit(item.count, 0) + 1;
  }

  setBounded(store, key, item, {
    now,
    maxEntries: options.maxEntries,
    isExpired: (entry) => !entry || entry.resetAt <= now
  });

  return {
    allowed: item.count <= limit,
    count: item.count,
    limit,
    remaining: Math.max(0, limit - item.count),
    resetAt: item.resetAt,
    retryAfter: Math.max(1, Math.ceil((item.resetAt - now) / 1_000))
  };
}

function assertCapacity(store, maxEntries, code = "SERVER_BUSY") {
  const limit = normalizedLimit(maxEntries, 32);
  if (store.size < limit) return;
  const error = new Error("Terlalu banyak proses aktif. Coba lagi sesaat.");
  error.code = code;
  error.status = 503;
  throw error;
}

module.exports = {
  DEFAULT_MAX_ENTRIES,
  assertCapacity,
  pruneMap,
  setBounded,
  takeFixedWindow
};

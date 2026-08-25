"use strict";

const { sendJson: send } = require("./http-response");

const { takeFixedWindow } = require("./memory-store");
const { getDatabaseConfig } = require("./database");
const { DEFAULT_SETTINGS, generateGeminiReply, publicSettings, readPublishedSettings } = require("./personal-ai");

const minuteBuckets = new Map();
const hourBuckets = new Map();

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || request.headers["x-real-ip"] || "").split(",")[0].trim();
  return (forwarded || request.socket?.remoteAddress || "unknown").slice(0, 100);
}

function rateLimit(request) {
  const key = clientIp(request);
  const minute = takeFixedWindow(minuteBuckets, key, { windowMs: 60_000, limit: 10, maxEntries: 3000 });
  const hour = takeFixedWindow(hourBuckets, key, { windowMs: 3_600_000, limit: 80, maxEntries: 3000 });
  return { allowed: minute.allowed && hour.allowed, remaining: Math.min(minute.remaining, hour.remaining), retryAfter: Math.max(minute.retryAfter, hour.retryAfter) };
}

function bodyObject(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return {};
}

module.exports = async function handlePersonalAi(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return response.status(204).end();
  }
  if (request.method === "GET") {
    try {
      if (!getDatabaseConfig().configured) return send(response, 200, { ok: true, config: publicSettings(DEFAULT_SETTINGS, { published: false }), state: "offline" });
      const published = await readPublishedSettings();
      if (!published) return send(response, 200, { ok: true, config: publicSettings(DEFAULT_SETTINGS, { published: false }), state: "unpublished" });
      return send(response, 200, { ok: true, config: publicSettings(published.settings, { published: true, updatedAt: published.row.updated_at }), state: published.settings.enabled ? "ready" : "disabled" });
    } catch (error) {
      console.error("[personal-ai-config]", error.code || "CONFIG_READ_FAILED");
      return send(response, 200, { ok: true, config: publicSettings(DEFAULT_SETTINGS, { published: false }), state: "offline" });
    }
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const limit = rateLimit(request);
  response.setHeader("X-RateLimit-Remaining", String(limit.remaining));
  if (!limit.allowed) {
    response.setHeader("Retry-After", String(limit.retryAfter));
    return send(response, 429, { ok: false, error: "AI_RATE_LIMITED", message: "Terlalu banyak pesan. Tunggu sebentar lalu coba lagi.", retryAfter: limit.retryAfter });
  }

  try {
    const body = bodyObject(request);
    const message = String(body.message || "").trim();
    if (!message) return send(response, 400, { ok: false, error: "EMPTY_AI_MESSAGE", message: "Tulis pesan terlebih dahulu." });
    if (message.length > 4000) return send(response, 413, { ok: false, error: "AI_MESSAGE_TOO_LONG", message: "Pesan maksimal 4.000 karakter." });
    if (!getDatabaseConfig().configured) return send(response, 503, { ok: false, error: "AI_CONFIG_UNAVAILABLE", message: DEFAULT_SETTINGS.errorMessage });
    const published = await readPublishedSettings();
    if (!published) return send(response, 503, { ok: false, error: "AI_CONFIG_UNAVAILABLE", message: DEFAULT_SETTINGS.errorMessage });
    if (!published.settings.enabled) return send(response, 403, { ok: false, error: "AI_DISABLED", message: published.settings.disabledMessage });
    const result = await generateGeminiReply({ settings: published.settings, message, history: body.history });
    return send(response, 200, { ok: true, reply: result.text, meta: { model: result.model } });
  } catch (error) {
    const code = error.code || "AI_CHAT_FAILED";
    const status = Number(error.status || 500);
    console.error("[personal-ai-chat]", code);
    const publicMessage = code === "GEMINI_TIMEOUT" ? "Respons Personal AI melewati batas waktu. Coba lagi." : code === "GEMINI_RATE_LIMITED" ? "Layanan AI sedang sibuk. Coba lagi sesaat." : DEFAULT_SETTINGS.errorMessage;
    return send(response, status >= 400 && status < 600 ? status : 500, { ok: false, error: code, message: publicMessage });
  }
};

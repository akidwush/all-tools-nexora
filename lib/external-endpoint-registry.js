"use strict";

const HOST = "sylvatica.my.id";
const BASE = "https://sylvatica.my.id";

const DEFINITIONS = Object.freeze({
  "utility:aio": utility("utility:aio", "AIO Downloader", "/api/download/aio", 25_000, {
    timeoutEnv: "KURONEKO_AIO_TIMEOUT_MS", unavailableCode: "AIO_CONFIGURATION_ERROR"
  }),
  "utility:danbooru": utility("utility:danbooru", "Danbooru Search", "/api/search/danbooru", 20_000, {
    timeoutEnv: "KURONEKO_TIMEOUT_MS", unavailableCode: "DANBOORU_CONFIGURATION_ERROR"
  }),
  "utility:animetoreal": utility("utility:animetoreal", "Anime to Real", "/api/ai/animetoreal", 50_000, {
    unavailableCode: "ANIME_REAL_CONFIGURATION_ERROR"
  }),
  "utility:aisong": utility("utility:aisong", "AI Song", "/api/ai/aisong", 110_000, {
    maxTimeoutMs: 120_000, unavailableCode: "AI_SONG_CONFIGURATION_ERROR"
  }),
  "utility:hd4": utility("utility:hd4", "HD4 Enhancer", "/api/tools/hd4", 55_000, {
    unavailableCode: "HD4_CONFIGURATION_ERROR"
  }),
  "utility:genmail": utility("utility:genmail", "GenMail", "/api/tools/genmail", 12_000, {
    timeoutEnv: "KURONEKO_TIMEOUT_MS", unavailableCode: "GENMAIL_CONFIGURATION_ERROR"
  })
});

function utility(id, label, path, timeoutMs, options = {}) {
  return Object.freeze({
    id,
    group: "utility",
    label,
    category: "external-utility",
    allowedHosts: [HOST],
    defaultBaseUrl: BASE,
    defaultPath: path,
    defaultTimeoutMs: timeoutMs,
    minTimeoutMs: 1_000,
    maxTimeoutMs: options.maxTimeoutMs || 60_000,
    healthPath: path,
    healthMethod: "HEAD",
    credentialRef: "KURONEKO_API_KEY",
    timeoutEnv: options.timeoutEnv || "",
    unavailableCode: options.unavailableCode || "PROVIDER_CONFIGURATION_ERROR",
    editableFields: ["baseUrl", "path", "timeoutMs", "healthPath"]
  });
}

function getUtilityEndpointDefinition(id) {
  return DEFINITIONS[id] || null;
}

function listUtilityEndpointDefinitions() {
  return Object.values(DEFINITIONS);
}

module.exports = { getUtilityEndpointDefinition, listUtilityEndpointDefinitions };

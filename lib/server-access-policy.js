"use strict";

const { mediaProvider } = require("./media-download");

// Only these tools keep their privileged operation behind a Nexora API route.
// Tools that run entirely in public JavaScript or open a third-party URL cannot
// honestly be secured as VVIP and are rejected by the admin API.
const SERVER_AUTHORIZED_TOOL_IDS = Object.freeze([
  "aiodownloader",
  "aisong",
  "aivideo",
  "aiimage",
  "alightpremium",
  "animetoreal",
  "autopdf",
  "bmkg",
  "comicreader",
  "cryptomarket",
  "danbooru",
  "documentai",
  "elevenlabs",
  "enhancer",
  "fakeovo",
  "genmail",
  "getcode",
  "imagevectorizer",
  "instagram",
  "ipintel",
  "multiai",
  "novelcover",
  "ocrintel",
  "promptgenerate",
  "sertifikat",
  "spaceexplorer",
  "spotify",
  "svgalight",
  "terabox",
  "tiktok",
  "vdeploy",
  "webintel",
  "youtube"
]);

const serverAuthorizedTools = new Set(SERVER_AUTHORIZED_TOOL_IDS);
const downloaderTools = new Set(["terabox", "instagram", "tiktok", "youtube", "spotify"]);
const makerOriginalTools = new Set(["fakeovo", "sertifikat"]);

const HEALTH_MODE_TO_TOOL = Object.freeze({
  "document-ai": "documentai",
  "prompt-generator": "promptgenerate",
  "comic-reader": "comicreader",
  "novel-cover": "novelcover",
  elevenlabs: "elevenlabs",
  "text-to-pdf": "autopdf",
  "multi-ai": "multiai",
  vdeploy: "vdeploy"
});

const TOOL_HEALTH_MODE_TO_TOOL = Object.freeze({
  sitegrabber: "getcode",
  "crypto-market": "cryptomarket",
  "space-explorer": "spaceexplorer",
  "ocr-intelligence": "ocrintel",
  "svg-alight": "svgalight",
  "alight-premium": "alightpremium",
  "image-vectorizer": "imagevectorizer",
  "ip-intelligence": "ipintel",
  "bmkg-open-data": "bmkg",
  genmail: "genmail",
  "aio-download": "aiodownloader"
});

const SERVICE_TO_TOOL = Object.freeze({
  "danbooru-search": "danbooru",
  "anime-to-real": "animetoreal",
  "ai-song": "aisong",
  "hd4-enhancer": "enhancer"
});

function isServerAuthorizedTool(toolId) {
  return serverAuthorizedTools.has(String(toolId || "").trim().toLowerCase());
}

function healthToolId(mode) {
  return HEALTH_MODE_TO_TOOL[String(mode || "").toLowerCase()] || "";
}

function toolHealthToolIds(mode, request, url) {
  const service = String(url?.searchParams?.get("_service") || "").toLowerCase();
  if (service) return SERVICE_TO_TOOL[service] ? [SERVICE_TO_TOOL[service]] : [];

  const normalizedMode = String(mode || "").toLowerCase();
  if (normalizedMode === "nexray-splus") {
    const action = String(url?.searchParams?.get("action") || "").toLowerCase();
    if (action === "suno") return ["aisong"];
    if (action === "veo3") return ["aivideo"];
    if (action === "image-edit") return ["aiimage"];
    return [];
  }
  if (normalizedMode === "maker-original") {
    const requested = String(url?.searchParams?.get("tool") || "").toLowerCase();
    return makerOriginalTools.has(requested) ? [requested] : [];
  }
  if (normalizedMode === "downloader") {
    const provider = String(request?.body?.provider || url?.searchParams?.get("provider") || "").toLowerCase();
    return downloaderTools.has(provider) ? [provider] : [];
  }
  if (normalizedMode === "media-download") {
    let detected = "";
    try { detected = mediaProvider(new URL(String(url?.searchParams?.get("url") || "")).hostname); }
    catch {}
    const requested = String(url?.searchParams?.get("tool") || "").toLowerCase();
    if (["tiktok", "instagram", "terabox"].includes(detected)) return [detected];
    if (detected === "nexray") {
      const candidates = ["instagram", "terabox"];
      return candidates.includes(requested)
        ? [requested, ...candidates.filter((item) => item !== requested)]
        : candidates;
    }
    return [];
  }
  return TOOL_HEALTH_MODE_TO_TOOL[normalizedMode] ? [TOOL_HEALTH_MODE_TO_TOOL[normalizedMode]] : [];
}

function toolHealthToolId(mode, request, url) {
  return toolHealthToolIds(mode, request, url)[0] || "";
}

function publicToolHealthProbe(mode, request, url) {
  if (!["GET", "HEAD"].includes(String(request?.method || "GET").toUpperCase())) return false;
  const normalizedMode = String(mode || "").toLowerCase();
  if (normalizedMode === "alight-premium") return !url.searchParams.get("action");
  if (normalizedMode === "sitegrabber") return String(url.searchParams.get("action") || "health").toLowerCase() === "health";
  if (normalizedMode === "svg-alight") return true;
  return new Set([
    "downloader",
    "space-explorer",
    "ocr-intelligence",
    "image-vectorizer",
    "ip-intelligence",
    "bmkg-open-data"
  ]).has(normalizedMode) && url.searchParams.get("health") === "1";
}

module.exports = {
  HEALTH_MODE_TO_TOOL,
  SERVER_AUTHORIZED_TOOL_IDS,
  SERVICE_TO_TOOL,
  TOOL_HEALTH_MODE_TO_TOOL,
  healthToolId,
  isServerAuthorizedTool,
  publicToolHealthProbe,
  toolHealthToolId,
  toolHealthToolIds
};

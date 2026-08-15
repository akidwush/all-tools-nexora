"use strict";

const net = require("node:net");
const { takeFixedWindow } = require("./memory-store");

const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 2;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 24;
const buckets = new Map();

const PROVIDERS = Object.freeze({
  terabox: {
    inputHosts: [
      "terabox.com", "terabox.app", "teraboxapp.com", "1024tera.com", "1024terabox.com",
      "dubox.com", "teraboxlink.com", "freeterabox.com", "terafileshare.com",
      "4funbox.com", "mirrobox.com", "nephobox.com"
    ],
    upstreamHosts: ["api.nexray.eu.cc"],
    endpoint: (url) => `https://api.nexray.eu.cc/downloader/terabox?url=${encodeURIComponent(url)}`,
    capability: "download",
    formats: ["FILE"]
  },
  instagram: {
    inputHosts: ["instagram.com", "instagr.am"],
    upstreamHosts: ["api.nexray.eu.cc"],
    endpoint: (url) => `https://api.nexray.eu.cc/downloader/instagram?url=${encodeURIComponent(url)}`,
    capability: "download",
    formats: ["MP4", "JPG"]
  },
  tiktok: {
    inputHosts: ["tiktok.com"],
    upstreamHosts: ["tikwm.com"],
    endpoint: (url) => `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
    capability: "download",
    formats: ["MP4", "MP3", "JPG"]
  },
  youtube: {
    inputHosts: ["youtube.com", "youtu.be"],
    upstreamHosts: ["youtube.com"],
    endpoint: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    capability: "metadata-official-link",
    formats: []
  },
  spotify: {
    inputHosts: ["spotify.com", "spotify.link"],
    upstreamHosts: ["spotify.com"],
    endpoint: (url) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
    capability: "metadata-official-link",
    formats: []
  }
});

function cleanText(value, max = 500) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function hostMatches(hostname, suffixes) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || net.isIP(host) || host === "localhost" || host.endsWith(".localhost")) return false;
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function validateProviderUrl(provider, rawUrl) {
  const config = PROVIDERS[provider];
  if (!config) throw Object.assign(new Error("Downloader tidak dikenal."), { status: 400, code: "UNKNOWN_DOWNLOADER" });
  let parsed;
  try { parsed = new URL(cleanText(rawUrl, 2_000)); }
  catch { throw Object.assign(new Error("URL tidak valid."), { status: 400, code: "INVALID_URL" }); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    throw Object.assign(new Error("Gunakan URL HTTPS publik tanpa kredensial atau port khusus."), { status: 400, code: "UNSAFE_URL" });
  }
  if (!hostMatches(parsed.hostname, config.inputHosts)) {
    throw Object.assign(new Error(`URL bukan link ${provider} yang didukung.`), { status: 400, code: "URL_HOST_NOT_ALLOWED" });
  }
  parsed.hash = "";
  return parsed.toString();
}

function publicHttpsUrl(value) {
  let parsed;
  const raw = String(value || "").trim();
  try { parsed = new URL(raw.startsWith("//") ? `https:${raw}` : raw); } catch { return ""; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !hostMatches(parsed.hostname, [parsed.hostname])) return "";
  parsed.hash = "";
  return parsed.toString();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function arrayCandidate(value) {
  return Array.isArray(value) ? value : [];
}

function linkOf(item) {
  if (!item || typeof item !== "object") return "";
  for (const key of ["download_url", "downloadUrl", "dlink", "fast_download", "fastlink", "fast_link", "direct_link", "directLink", "stream_url", "streamUrl", "playUrl", "play_url", "video_url", "image_url", "download", "video", "image", "url", "link"]) {
    const url = publicHttpsUrl(item[key]);
    if (url) return url;
  }
  return "";
}

function collectDownloadItems(value, output = [], depth = 0, seen = new Set()) {
  if (!value || depth > 5 || output.length >= 100 || seen.has(value)) return output;
  if (typeof value === "string") {
    const url = publicHttpsUrl(value);
    if (url) output.push({ url });
    return output;
  }
  if (typeof value !== "object") return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectDownloadItems(item, output, depth + 1, seen);
    return output;
  }
  if (linkOf(value)) output.push(value);
  for (const key of ["media", "items", "files", "file", "list", "results", "result", "data", "images", "resources"]) {
    if (value[key] && typeof value[key] === "object") collectDownloadItems(value[key], output, depth + 1, seen);
  }
  return output;
}

function metadataSource(payload) {
  return [payload?.data?.data, payload?.result?.data, payload?.data, payload?.result, payload]
    .find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function normalizeTerabox(payload, officialUrl) {
  const raw = collectDownloadItems(payload);
  const seenUrls = new Set();
  const media = raw.slice(0, 100).map((item, index) => ({
    id: `file-${index + 1}`,
    type: "FILE",
    url: linkOf(item),
    filename: cleanText(item?.filename || item?.name || item?.title || item?.file_name || `terabox_file_${index + 1}`, 120),
    size: cleanText(item?.size_formatted || item?.sizeFormatted || item?.size || item?.file_size || item?.fileSize, 80),
    thumbnail: publicHttpsUrl(item?.thumbnail || item?.thumb || item?.image || item?.cover),
    quality: cleanText(item?.quality, 40),
    duration: cleanText(item?.duration, 40)
  })).filter((item) => item.url && !seenUrls.has(item.url) && seenUrls.add(item.url));
  if (!media.length) throw Object.assign(new Error("Provider tidak mengembalikan file yang dapat diunduh."), { status: 422, code: "EMPTY_PROVIDER_RESULT" });
  return { title: "File Terabox", author: "", caption: "", thumbnail: media[0].thumbnail, duration: 0, stats: {}, media, officialUrl };
}

function normalizeInstagram(payload, officialUrl) {
  const meta = metadataSource(payload);
  const raw = collectDownloadItems(payload);
  const seenUrls = new Set();
  const media = raw.slice(0, 30).map((item, index) => {
    const video = publicHttpsUrl(item?.video || item?.video_url);
    const image = publicHttpsUrl(item?.image || item?.image_url);
    const url = video || image || linkOf(item);
    const type = video || String(item?.type || "").toLowerCase().includes("video") || /\.mp4(?:\?|$)/i.test(url) ? "MP4" : "JPG";
    return { id: `media-${index + 1}`, type, url, filename: `instagram_${index + 1}.${type === "MP4" ? "mp4" : "jpg"}`, size: numberValue(item?.size), thumbnail: image || publicHttpsUrl(item?.thumbnail || item?.thumb), quality: cleanText(item?.quality, 40) };
  }).filter((item) => item.url && !seenUrls.has(item.url) && seenUrls.add(item.url));
  if (!media.length) throw Object.assign(new Error("Media Instagram tidak ditemukan atau posting bersifat privat."), { status: 422, code: "EMPTY_PROVIDER_RESULT" });
  return {
    title: cleanText(meta?.title || meta?.caption || payload?.title || payload?.caption || "Instagram Media"),
    author: cleanText(meta?.username || meta?.owner || meta?.author || payload?.username || payload?.owner),
    caption: cleanText(meta?.caption || payload?.caption, 2_000),
    thumbnail: media[0].thumbnail,
    duration: 0,
    stats: { likes: numberValue(payload?.likes || payload?.like_count), comments: numberValue(payload?.comments || payload?.comment_count) },
    media,
    officialUrl
  };
}

function collectPhotoUrls(value, output = []) {
  if (!value || output.length >= 20) return output;
  if (typeof value === "string") { const url = publicHttpsUrl(value); if (url) output.push(url); return output; }
  if (Array.isArray(value)) { value.forEach((item) => collectPhotoUrls(item, output)); return output; }
  if (typeof value === "object") {
    for (const key of ["url_list", "image_url", "display_image", "url", "image"]) if (value[key]) collectPhotoUrls(value[key], output);
  }
  return output;
}

function normalizeTikTok(payload, officialUrl) {
  const data = payload?.data?.data || payload?.result?.data || payload?.data || payload?.result;
  if (!data || typeof data !== "object") throw Object.assign(new Error("Data TikTok tidak ditemukan."), { status: 422, code: "EMPTY_PROVIDER_RESULT" });
  const media = [];
  const add = (id, type, value, filename, quality, size, previewUrl) => {
    const url = publicHttpsUrl(value);
    if (url && !media.some((item) => item.url === url && item.type === type)) media.push({ id, type, url, filename, quality, size: numberValue(size), previewUrl: publicHttpsUrl(previewUrl) || url });
  };
  const standard = publicHttpsUrl(data.play);
  add("hd", "MP4", data.hdplay || data.play, "tiktok_hd.mp4", "HD", data.size, standard);
  add("standard", "MP4", data.play, "tiktok_standard.mp4", "Standard", data.size, standard);
  add("watermark", "MP4", data.wmplay || data.wm_video, "tiktok_watermark.mp4", "Watermark", data.wm_size, data.wmplay || data.wm_video);
  add("audio", "MP3", data.music, "tiktok_audio.mp3", "Audio", 0, standard || data.cover);
  const photos = [...new Set(collectPhotoUrls(data.images).concat(collectPhotoUrls(data.image_post_info?.images)))];
  photos.forEach((url, index) => add(`photo-${index + 1}`, "JPG", url, `tiktok_foto_${index + 1}.jpg`, `Foto ${index + 1}`, 0, url));
  if (!media.length) throw Object.assign(new Error("Provider tidak mengembalikan media TikTok yang valid."), { status: 422, code: "EMPTY_PROVIDER_RESULT" });
  const author = data.author || {};
  return {
    title: cleanText(data.title || "TikTok Media", 2_000),
    author: cleanText(author.nickname || author.unique_id),
    authorId: cleanText(author.unique_id),
    avatar: publicHttpsUrl(author.avatar),
    caption: cleanText(data.title, 2_000),
    thumbnail: publicHttpsUrl(data.cover || data.origin_cover),
    duration: numberValue(data.duration),
    stats: { plays: numberValue(data.play_count), likes: numberValue(data.digg_count), comments: numberValue(data.comment_count), shares: numberValue(data.share_count) },
    media,
    officialUrl
  };
}

function normalizeOfficialMetadata(provider, payload, officialUrl) {
  return {
    title: cleanText(payload?.title || `${provider} media`),
    author: cleanText(payload?.author_name),
    caption: "",
    thumbnail: publicHttpsUrl(payload?.thumbnail_url),
    duration: 0,
    stats: {},
    media: [],
    officialUrl,
    notice: provider === "youtube"
      ? "Nexora hanya menampilkan metadata dan tautan resmi YouTube; konversi MP4/MP3 tidak disediakan."
      : "Nexora hanya menampilkan metadata dan tautan resmi Spotify; ekstraksi atau konversi MP3 tidak disediakan."
  };
}

function normalizeProvider(provider, payload, officialUrl) {
  if (provider === "terabox") return normalizeTerabox(payload, officialUrl);
  if (provider === "instagram") return normalizeInstagram(payload, officialUrl);
  if (provider === "tiktok") return normalizeTikTok(payload, officialUrl);
  return normalizeOfficialMetadata(provider, payload, officialUrl);
}

async function readJsonLimited(response) {
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (declared > RESPONSE_LIMIT_BYTES) throw Object.assign(new Error("Respons provider terlalu besar."), { status: 502, code: "UPSTREAM_RESPONSE_TOO_LARGE" });
  let text = "";
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_LIMIT_BYTES) { await reader.cancel(); throw Object.assign(new Error("Respons provider terlalu besar."), { status: 502, code: "UPSTREAM_RESPONSE_TOO_LARGE" }); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } else {
    text = await response.text();
    if (Buffer.byteLength(text) > RESPONSE_LIMIT_BYTES) throw Object.assign(new Error("Respons provider terlalu besar."), { status: 502, code: "UPSTREAM_RESPONSE_TOO_LARGE" });
  }
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error("Provider mengembalikan respons non-JSON."), { status: 502, code: "UPSTREAM_INVALID_JSON" }); }
}

async function fetchProviderJson(provider, inputUrl, options = {}) {
  const config = PROVIDERS[provider];
  let current = new URL(config.endpoint(inputUrl));
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
    try {
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        if (!hostMatches(current.hostname, config.upstreamHosts) || current.protocol !== "https:") throw Object.assign(new Error("Redirect provider diblokir."), { status: 502, code: "UPSTREAM_REDIRECT_BLOCKED" });
        const response = await (options.fetch || fetch)(current, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "All-Tools-Nexora/6.3.18" } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          try { await response.body?.cancel(); } catch {}
          if (!location || redirects === MAX_REDIRECTS) throw Object.assign(new Error("Redirect provider tidak valid."), { status: 502, code: "UPSTREAM_REDIRECT_LIMIT" });
          current = new URL(location, current);
          continue;
        }
        if (!response.ok) {
          try { await response.body?.cancel(); } catch {}
          const retryable = response.status === 429 || response.status >= 500;
          const error = Object.assign(new Error(`Provider merespons HTTP ${response.status}.`), { status: response.status === 429 ? 429 : 502, code: `UPSTREAM_HTTP_${response.status}`, retryable });
          throw error;
        }
        return await readJsonLimited(response);
      }
    } catch (error) {
      lastError = error;
      if (error?.name === "AbortError") throw Object.assign(new Error("Provider melewati batas waktu."), { status: 504, code: "UPSTREAM_TIMEOUT" });
      if (!error.retryable || attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally { clearTimeout(timeout); }
  }
  throw lastError || Object.assign(new Error("Provider gagal dihubungi."), { status: 502, code: "UPSTREAM_FAILED" });
}

function clientIp(request) {
  return cleanText(String(request.headers?.["x-forwarded-for"] || "").split(",")[0] || request.socket?.remoteAddress || "unknown", 80);
}

function send(response, status, payload, headOnly = false) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.statusCode = status;
  return response.end(headOnly ? undefined : JSON.stringify(payload));
}

async function providerHealth(provider) {
  const config = PROVIDERS[provider];
  const probeInput = `https://${config.inputHosts[0]}/nexora-health-check`;
  const target = new URL(config.endpoint(probeInput));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(target, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", Range: "bytes=0-2047" } });
    try { await response.body?.cancel(); } catch {}
    return response.status > 0 && response.status < 500 && ![401, 403, 429].includes(response.status);
  } catch { return false; }
  finally { clearTimeout(timeout); }
}

async function handleDownloader(request, response, requestUrl) {
  const provider = cleanText(requestUrl.searchParams.get("provider") || request.body?.provider, 30).toLowerCase();
  if (!PROVIDERS[provider]) return send(response, 400, { ok: false, error: "UNKNOWN_DOWNLOADER", message: "Downloader tidak dikenal." });

  if ((request.method === "GET" || request.method === "HEAD") && requestUrl.searchParams.get("health") === "1") {
    const available = await providerHealth(provider);
    return send(response, available ? 200 : 503, { ok: available, provider, capability: PROVIDERS[provider].capability, formats: PROVIDERS[provider].formats }, request.method === "HEAD");
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Gunakan POST untuk memproses URL." });
  }

  const rate = takeFixedWindow(buckets, `${clientIp(request)}:${provider}`, { windowMs: RATE_WINDOW_MS, limit: RATE_LIMIT, maxEntries: 2_000 });
  response.setHeader("X-RateLimit-Limit", String(rate.limit));
  response.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
  if (!rate.allowed) return send(response, 429, { ok: false, error: "DOWNLOADER_RATE_LIMITED", message: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi." });

  let inputUrl;
  try { inputUrl = validateProviderUrl(provider, request.body?.url); }
  catch (error) { return send(response, error.status || 400, { ok: false, error: error.code || "INVALID_URL", message: error.message }); }

  try {
    const payload = await fetchProviderJson(provider, inputUrl);
    if (payload?.success === false || payload?.status === false) throw Object.assign(new Error(cleanText(payload.message || "Provider menolak URL.")), { status: 422, code: "UPSTREAM_REJECTED" });
    const data = normalizeProvider(provider, payload, inputUrl);
    return send(response, 200, { ok: true, provider, capability: PROVIDERS[provider].capability, formats: PROVIDERS[provider].formats, data });
  } catch (error) {
    const status = Number(error.status) || 502;
    if (status >= 500) console.warn(`[Downloader:${provider}] ${cleanText(error.code || "UPSTREAM_FAILED", 80)}`);
    return send(response, status, { ok: false, error: cleanText(error.code || "DOWNLOADER_FAILED", 80), message: cleanText(error.message || "Downloader gagal memproses URL.") });
  }
}

module.exports = { PROVIDERS, RESPONSE_LIMIT_BYTES, collectDownloadItems, fetchProviderJson, handleDownloader, hostMatches, normalizeProvider, validateProviderUrl };

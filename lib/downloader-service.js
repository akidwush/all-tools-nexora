"use strict";

const net = require("node:net");
const { takeFixedWindow } = require("./memory-store");

const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 9_000;
const MAX_REDIRECTS = 2;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 24;
const buckets = new Map();
const responseCache = new Map();
const sourceFailures = new Map();
const RESPONSE_CACHE_TTL_MS = 2 * 60_000;
const RESPONSE_CACHE_MAX = 200;
const CIRCUIT_FAILURE_LIMIT = 2;
const CIRCUIT_OPEN_MS = 45_000;

const PROVIDERS = Object.freeze({
  terabox: {
    inputHosts: [
      "terabox.com", "terabox.app", "teraboxapp.com", "1024tera.com", "1024terabox.com",
      "dubox.com", "teraboxlink.com", "freeterabox.com", "terafileshare.com",
      "4funbox.com", "mirrobox.com", "nephobox.com"
    ],
    healthInput: "https://www.terabox.com/",
    sources: [
      { id: "nexray-terabox", hosts: ["api.nexray.eu.cc"], timeoutMs: 8_000, endpoint: (url, context) => `https://api.nexray.eu.cc/downloader/terabox?url=${encodeURIComponent(url)}${context.password ? `&pwd=${encodeURIComponent(context.password)}` : ""}` },
      { id: "terabox-public", hosts: ["terabox.com"], timeoutMs: 10_000, endpoint: (url, context) => teraboxPublicEndpoint(url, context.password) }
    ],
    healthTargets: ["https://www.terabox.com/"],
    capability: "download",
    formats: ["FILE"]
  },
  instagram: {
    inputHosts: ["instagram.com", "instagr.am"],
    sources: [
      { id: "nexray-instagram", hosts: ["api.nexray.eu.cc"], timeoutMs: 10_000, endpoint: (url) => `https://api.nexray.eu.cc/downloader/instagram?url=${encodeURIComponent(url)}` },
      { id: "siputzx-instagram", hosts: ["api.siputzx.my.id"], timeoutMs: 7_000, endpoint: (url) => `https://api.siputzx.my.id/api/d/igram?url=${encodeURIComponent(url)}` }
    ],
    healthInput: "https://www.instagram.com/instagram/",
    healthTargets: ["https://api.nexray.eu.cc/", "https://api.siputzx.my.id/"],
    capability: "download",
    formats: ["MP4", "JPG"]
  },
  tiktok: {
    inputHosts: ["tiktok.com"],
    sources: [{ id: "tikwm", hosts: ["tikwm.com"], timeoutMs: 10_000, endpoint: (url) => `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1` }],
    healthInput: "https://www.tiktok.com/@tiktok",
    healthTargets: ["https://www.tikwm.com/"],
    capability: "download",
    formats: ["MP4", "MP3", "JPG"]
  },
  youtube: {
    inputHosts: ["youtube.com", "youtu.be"],
    sources: [{ id: "youtube-oembed", hosts: ["youtube.com"], timeoutMs: 8_000, endpoint: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}` }],
    healthInput: "https://youtu.be/dQw4w9WgXcQ",
    healthTargets: ["https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ"],
    capability: "metadata-official-link",
    formats: []
  },
  spotify: {
    inputHosts: ["spotify.com", "spotify.link"],
    sources: [
      { id: "siputzx-spotify", hosts: ["api.siputzx.my.id"], timeoutMs: 7_000, endpoint: (url) => `https://api.siputzx.my.id/api/d/spotifyv2?url=${encodeURIComponent(url)}` },
      { id: "spotify-oembed", hosts: ["spotify.com"], timeoutMs: 8_000, endpoint: (url) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}` }
    ],
    healthInput: "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl",
    healthTargets: ["https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F11dFghVXANMlKmJXsNCbNl"],
    capability: "best-effort-download",
    formats: ["MP3"]
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

function extractTeraboxShareId(rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || "")); } catch { return ""; }
  const pathMatch = parsed.pathname.match(/^\/s\/1([A-Za-z0-9_-]{5,})/);
  if (pathMatch) return pathMatch[1];
  const queryValue = String(parsed.searchParams.get("surl") || "").trim();
  return /^[A-Za-z0-9_-]{5,}$/.test(queryValue) ? queryValue : "";
}

function teraboxPublicEndpoint(inputUrl, password) {
  const shareId = extractTeraboxShareId(inputUrl);
  if (!shareId) throw Object.assign(new Error("Format link share Terabox tidak dikenali."), { status: 400, code: "INVALID_TERABOX_SHARE" });
  const target = new URL("https://www.terabox.com/share/list");
  target.searchParams.set("app_id", "250528");
  target.searchParams.set("shorturl", shareId);
  target.searchParams.set("root", "1");
  if (password) target.searchParams.set("pwd", password);
  return target.toString();
}

function environmentSources(provider) {
  const upper = String(provider || "").toUpperCase();
  const read = (name, position) => String(process.env[name] || "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 2).map((template, index) => {
    let parsed;
    try {
      const preview = template.replaceAll("{url}", encodeURIComponent("https://example.com/")).replaceAll("{password}", "");
      parsed = new URL(preview);
    } catch { return null; }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !hostMatches(parsed.hostname, [parsed.hostname])) return null;
    return {
      id: `env-${provider}-${position}-${index + 1}`,
      hosts: [parsed.hostname.toLowerCase()],
      timeoutMs: 8_000,
      endpoint: (url, context) => {
        let output = template.replaceAll("{url}", encodeURIComponent(url)).replaceAll("{password}", encodeURIComponent(context.password || ""));
        if (!template.includes("{url}")) {
          const endpoint = new URL(output);
          endpoint.searchParams.set("url", url);
          output = endpoint.toString();
        }
        return output;
      }
    };
  }).filter(Boolean);
  return {
    primary: read(`DOWNLOADER_${upper}_PRIMARY_URL`, "primary"),
    fallback: read(`DOWNLOADER_${upper}_FALLBACK_URLS`, "fallback")
  };
}

function providerSources(provider) {
  const configured = environmentSources(provider);
  return configured.primary.concat(PROVIDERS[provider]?.sources || [], configured.fallback);
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

function collectTeraboxItems(value, output = [], depth = 0, seen = new Set()) {
  if (!value || depth > 6 || output.length >= 200) return output;
  if (typeof value === "string") {
    const url = publicHttpsUrl(value);
    if (url) output.push({ url });
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectTeraboxItems(item, output, depth + 1, seen);
    return output;
  }
  const filename = cleanText(value.filename || value.name || value.title || value.file_name || value.server_filename, 160);
  const hasContainer = ["media", "items", "files", "file", "list", "results", "result", "data", "resources"].some((key) => value[key] && typeof value[key] === "object");
  if (linkOf(value) || value.fs_id != null || (filename && !hasContainer)) output.push(value);
  for (const key of ["media", "items", "files", "file", "list", "results", "result", "data", "resources"]) {
    if (value[key] && typeof value[key] === "object") collectTeraboxItems(value[key], output, depth + 1, seen);
  }
  return output;
}

function metadataSource(payload) {
  return [payload?.data?.data, payload?.result?.data, payload?.data, payload?.result, payload]
    .find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function normalizeTerabox(payload, officialUrl) {
  const raw = collectTeraboxItems(payload);
  const seenItems = new Set();
  const media = raw.slice(0, 100).map((item, index) => {
    const url = linkOf(item);
    const filename = cleanText(item?.filename || item?.name || item?.title || item?.file_name || item?.server_filename || `terabox_file_${index + 1}`, 120);
    return {
    id: `file-${index + 1}`,
    type: "FILE",
    url,
    officialUrl,
    downloadable: Boolean(url),
    isDirectory: String(item?.isdir || "0") === "1",
    filename,
    size: cleanText(item?.size_formatted || item?.sizeFormatted || item?.size || item?.file_size || item?.fileSize, 80),
    thumbnail: publicHttpsUrl(item?.thumbnail || item?.thumb || item?.image || item?.cover || item?.thumbs?.url3 || item?.thumbs?.url2),
    quality: cleanText(item?.quality, 40),
    duration: cleanText(item?.duration, 40)
  }; }).filter((item) => {
    const identity = item.url || `${item.filename}:${item.size}:${item.isDirectory}`;
    return identity && !seenItems.has(identity) && seenItems.add(identity);
  });
  if (!media.length) throw Object.assign(new Error("Provider tidak mengembalikan file yang dapat diunduh."), { status: 422, code: "EMPTY_PROVIDER_RESULT" });
  const directCount = media.filter((item) => item.downloadable).length;
  return {
    title: cleanText(payload?.title || payload?.data?.title || "File Terabox"),
    author: "",
    caption: "",
    thumbnail: media.find((item) => item.thumbnail)?.thumbnail || "",
    duration: 0,
    stats: {},
    media,
    officialUrl,
    notice: directCount ? "Link download langsung tersedia." : "Daftar file ditemukan melalui Terabox resmi, tetapi provider direct-link sedang tidak tersedia. Gunakan tombol Buka Terabox."
  };
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

function spotifyAudioUrl(item) {
  if (!item || typeof item !== "object") return "";
  for (const key of ["download_url", "downloadUrl", "download", "audio_url", "audioUrl", "audio", "mp3", "file"]) {
    const url = publicHttpsUrl(item[key]);
    if (url && !hostMatches(new URL(url).hostname, ["spotify.com", "spotifycdn.com", "scdn.co"])) return url;
  }
  const type = cleanText(item.type || item.format || item.mime || item.mimeType, 80).toLowerCase();
  for (const key of ["link", "url"]) {
    const url = publicHttpsUrl(item[key]);
    if (!url) continue;
    const host = new URL(url).hostname;
    if (hostMatches(host, ["spotify.com", "spotifycdn.com", "scdn.co"])) continue;
    if (/audio|mp3|m4a|mpeg|aac/.test(type) || /\.(?:mp3|m4a|aac|ogg|opus)(?:\?|$)/i.test(url)) return url;
  }
  return "";
}

function collectSpotifyAudio(value, output = [], depth = 0, seen = new Set()) {
  if (!value || depth > 6 || output.length >= 20 || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectSpotifyAudio(item, output, depth + 1, seen);
    return output;
  }
  const url = spotifyAudioUrl(value);
  if (url) output.push({ item: value, url });
  for (const nested of Object.values(value)) if (nested && typeof nested === "object") collectSpotifyAudio(nested, output, depth + 1, seen);
  return output;
}

function normalizeSpotify(payload, officialUrl) {
  const meta = metadataSource(payload);
  const seenUrls = new Set();
  const media = collectSpotifyAudio(payload).filter(({ url }) => !seenUrls.has(url) && seenUrls.add(url)).map(({ item, url }, index) => ({
    id: `audio-${index + 1}`,
    type: "MP3",
    url,
    filename: (() => {
      const base = cleanText(item.filename || item.file_name || item.title || meta.title || payload?.title || `spotify_track_${index + 1}`, 100).replace(/[^\p{L}\p{N}._ -]+/gu, "_").trim();
      return /\.mp3$/i.test(base) ? base : `${base || `spotify_track_${index + 1}`}.mp3`;
    })(),
    quality: cleanText(item.quality || item.bitrate || "Audio", 40),
    size: numberValue(item.size || item.file_size),
    thumbnail: publicHttpsUrl(item.thumbnail || item.cover || meta.thumbnail || meta.thumbnail_url || payload?.thumbnail_url)
  }));
  if (!media.length) return normalizeOfficialMetadata("spotify", payload, officialUrl);
  return {
    title: cleanText(meta.title || meta.name || payload?.title || "Spotify Track"),
    author: cleanText(meta.artist || meta.author || meta.author_name || payload?.artist || payload?.author_name),
    caption: "",
    thumbnail: media.find((item) => item.thumbnail)?.thumbnail || publicHttpsUrl(meta.thumbnail || meta.thumbnail_url || payload?.thumbnail_url),
    duration: numberValue(meta.duration || payload?.duration),
    stats: {},
    media,
    officialUrl,
    notice: "Audio disediakan oleh provider pihak ketiga. Jika provider gagal, Nexora otomatis kembali ke metadata dan tautan Spotify resmi."
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
  if (provider === "spotify") return normalizeSpotify(payload, officialUrl);
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

async function fetchSourceJson(provider, source, inputUrl, context = {}, options = {}) {
  if (!source || typeof source.endpoint !== "function") throw Object.assign(new Error("Konfigurasi provider tidak valid."), { status: 500, code: "PROVIDER_CONFIG_INVALID" });
  let current = new URL(source.endpoint(inputUrl, context));
  let lastError;
  const attempts = Math.max(1, Math.min(2, Number(options.attempts) || 2));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || source.timeoutMs || REQUEST_TIMEOUT_MS);
    try {
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        if (!hostMatches(current.hostname, source.hosts || []) || current.protocol !== "https:" || current.username || current.password || current.port) {
          throw Object.assign(new Error("Redirect provider diblokir."), { status: 502, code: "UPSTREAM_REDIRECT_BLOCKED" });
        }
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
          throw Object.assign(new Error(`Provider merespons HTTP ${response.status}.`), { status: response.status === 429 ? 429 : 502, code: `UPSTREAM_HTTP_${response.status}`, retryable });
        }
        return await readJsonLimited(response);
      }
    } catch (error) {
      lastError = error;
      if (error?.name === "AbortError") throw Object.assign(new Error("Provider melewati batas waktu."), { status: 504, code: "UPSTREAM_TIMEOUT" });
      if (!error.retryable || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally { clearTimeout(timeout); }
  }
  throw lastError || Object.assign(new Error("Provider gagal dihubungi."), { status: 502, code: "UPSTREAM_FAILED" });
}

async function fetchProviderJson(provider, inputUrl, options = {}) {
  return fetchSourceJson(provider, providerSources(provider)[0], inputUrl, options.context || {}, options);
}

function sourceKey(provider, source) {
  return `${provider}:${source.id}`;
}

function isCircuitOpen(provider, source, now = Date.now()) {
  const state = sourceFailures.get(sourceKey(provider, source));
  return Boolean(state && state.failures >= CIRCUIT_FAILURE_LIMIT && state.openUntil > now);
}

function markSourceSuccess(provider, source) {
  sourceFailures.delete(sourceKey(provider, source));
}

function markSourceFailure(provider, source) {
  const key = sourceKey(provider, source);
  const previous = sourceFailures.get(key) || { failures: 0, openUntil: 0 };
  const failures = previous.failures + 1;
  sourceFailures.set(key, { failures, openUntil: failures >= CIRCUIT_FAILURE_LIMIT ? Date.now() + CIRCUIT_OPEN_MS : 0 });
}

function providerRejectedPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  return payload.success === false || payload.status === false || Number(payload.code) >= 400 || (payload.errno != null && Number(payload.errno) !== 0);
}

function responseCacheKey(provider, inputUrl, context) {
  return context.password ? "" : `${provider}:${inputUrl}`;
}

function cachedResponse(key) {
  if (!key) return null;
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheResponse(key, value, ttlMs = RESPONSE_CACHE_TTL_MS) {
  if (!key) return;
  if (responseCache.size >= RESPONSE_CACHE_MAX) responseCache.delete(responseCache.keys().next().value);
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function resolveProvider(provider, inputUrl, context = {}, options = {}) {
  const key = responseCacheKey(provider, inputUrl, context);
  const cached = options.cache === false ? null : cachedResponse(key);
  if (cached) return { ...cached, cache: "hit" };

  const sources = Array.isArray(options.sources) && options.sources.length ? options.sources : providerSources(provider);
  const failures = [];
  for (const source of sources) {
    if (!options.ignoreCircuit && isCircuitOpen(provider, source)) {
      failures.push({ source: source.id, code: "CIRCUIT_OPEN" });
      continue;
    }
    try {
      const payload = await fetchSourceJson(provider, source, inputUrl, context, { ...options, attempts: options.sourceAttempts || 1 });
      if (providerRejectedPayload(payload)) {
        const message = cleanText(payload.message || payload.msg || payload.errmsg || "Provider menolak URL.");
        const passwordRequired = provider === "terabox" && /password|pwd|sandi|kode/i.test(message);
        throw Object.assign(new Error(passwordRequired ? "Link Terabox memerlukan kode ekstraksi." : message), {
          status: passwordRequired ? 400 : 422,
          code: passwordRequired ? "TERABOX_PASSWORD_REQUIRED" : "UPSTREAM_REJECTED"
        });
      }
      const data = normalizeProvider(provider, payload, inputUrl);
      markSourceSuccess(provider, source);
      const result = { data, source: source.id, attempts: failures.length + 1, cache: "miss" };
      cacheResponse(key, result, provider === "spotify" && !data.media.length ? 20_000 : RESPONSE_CACHE_TTL_MS);
      return result;
    } catch (error) {
      failures.push({ source: source.id, code: cleanText(error.code || "UPSTREAM_FAILED", 80) });
      if (Number(error.status) >= 500 || error.code === "EMPTY_PROVIDER_RESULT" || error.code === "UPSTREAM_REJECTED") markSourceFailure(provider, source);
    }
  }

  if (provider === "terabox" && failures.some((item) => item.code === "TERABOX_PASSWORD_REQUIRED")) {
    throw Object.assign(new Error("Link Terabox memerlukan kode ekstraksi yang benar."), { status: 400, code: "TERABOX_PASSWORD_REQUIRED", failures });
  }
  const timedOut = failures.some((item) => item.code === "UPSTREAM_TIMEOUT");
  throw Object.assign(new Error(timedOut ? "Semua provider melewati batas waktu. Coba lagi beberapa saat." : "Semua provider sedang gagal atau tidak menemukan media publik."), {
    status: timedOut ? 504 : 502,
    code: "UPSTREAM_ALL_FAILED",
    failures
  });
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
  // Probe the API contract first. Several providers return 403 on their home
  // page while the JSON endpoint is healthy, which previously painted working
  // Instagram/TikTok cards as "Gangguan".
  const sourceTargets = providerSources(provider).flatMap((source) => {
    if (!config.healthInput || typeof source.endpoint !== "function") return [];
    try { return [source.endpoint(config.healthInput, {})]; } catch { return []; }
  });
  const targets = [...new Set(sourceTargets.concat(arrayCandidate(config.healthTargets)))].slice(0, 4);
  const probes = targets.map(async (value) => {
    const target = new URL(value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const result = await fetch(target, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", Range: "bytes=0-2047", "User-Agent": "All-Tools-Nexora/6.3.18" } });
      try { await result.body?.cancel(); } catch {}
      return result.status > 0 && result.status < 500 && ![401, 403, 429].includes(result.status);
    } catch { return false; }
    finally { clearTimeout(timeout); }
  });
  return (await Promise.all(probes)).some(Boolean);
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
  const password = cleanText(request.body?.password, 64);

  try {
    const result = await resolveProvider(provider, inputUrl, { password });
    const downloadable = result.data.media.filter((item) => item.downloadable !== false && item.url);
    const capability = downloadable.length ? "download" : "metadata-official-link";
    const formats = [...new Set(downloadable.map((item) => cleanText(item.type, 12)).filter(Boolean))];
    return send(response, 200, { ok: true, provider, capability, formats, source: result.source, attempts: result.attempts, cache: result.cache, data: result.data });
  } catch (error) {
    const status = Number(error.status) || 502;
    if (status >= 500) console.warn(`[Downloader:${provider}] ${cleanText(error.code || "UPSTREAM_FAILED", 80)}`);
    return send(response, status, { ok: false, error: cleanText(error.code || "DOWNLOADER_FAILED", 80), message: cleanText(error.message || "Downloader gagal memproses URL.") });
  }
}

module.exports = {
  PROVIDERS,
  RESPONSE_LIMIT_BYTES,
  collectDownloadItems,
  extractTeraboxShareId,
  fetchProviderJson,
  handleDownloader,
  hostMatches,
  normalizeProvider,
  providerHealth,
  resolveProvider,
  validateProviderUrl
};

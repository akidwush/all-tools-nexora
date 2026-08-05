"use strict";

const net = require("node:net");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const MAX_REDIRECTS = 4;
const PROBE_TIMEOUT_MS = 18_000;
const STREAM_TIMEOUT_MS = 55_000;
const RATE_WINDOW_MS = 60_000;
const MAX_PROBES_PER_WINDOW = 30;
const MAX_DOWNLOADS_PER_WINDOW = 12;
const buckets = new Map();

const ALLOWED_HOST_SUFFIXES = Object.freeze([
  "tikwm.com",
  "tiktok.com",
  "tiktokv.com",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "muscdn.com",
  "byteoversea.com",
  "ibytedtos.com",
  "akamaized.net"
]);

function sendJson(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.statusCode = status;
  return response.end(JSON.stringify(payload));
}

function clientIp(request) {
  const forwarded = String(request.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
}

function takeRateSlot(request, probe) {
  const now = Date.now();
  const key = `${clientIp(request)}:${probe ? "probe" : "download"}`;
  const limit = probe ? MAX_PROBES_PER_WINDOW : MAX_DOWNLOADS_PER_WINDOW;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: limit - 1, resetAt: now + RATE_WINDOW_MS, limit };
  }
  current.count += 1;
  buckets.set(key, current);
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    limit
  };
}

function isAllowedHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || net.isIP(host)) return false;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function validateMediaUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || "")); }
  catch { throw Object.assign(new Error("URL media tidak valid."), { status: 400, code: "INVALID_MEDIA_URL" }); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    throw Object.assign(new Error("URL media harus HTTPS tanpa kredensial atau port khusus."), { status: 400, code: "UNSAFE_MEDIA_URL" });
  }
  if (!isAllowedHost(parsed.hostname)) {
    throw Object.assign(new Error("Host media tidak termasuk sumber TikTok yang diizinkan."), { status: 400, code: "MEDIA_HOST_NOT_ALLOWED" });
  }
  parsed.hash = "";
  return parsed;
}

function sanitizeFilename(value, expectedType) {
  const fallbackExt = expectedType === "MP3" ? "mp3" : expectedType === "JPG" ? "jpg" : "mp4";
  let filename = String(value || `tiktok_media.${fallbackExt}`)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!filename) filename = `tiktok_media.${fallbackExt}`;
  if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename += `.${fallbackExt}`;
  return filename;
}

function asciiFilename(filename) {
  return filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "tiktok_media";
}

function expectedContentType(type) {
  return type === "MP3" ? "audio/mpeg" : type === "JPG" ? "image/jpeg" : "video/mp4";
}

function isInvalidMediaType(contentType) {
  return /^(?:text\/html|text\/plain|application\/(?:json|problem\+json))/i.test(String(contentType || "").trim());
}

async function fetchAllowed(rawUrl, init, controller) {
  let current = validateMediaUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const upstream = await fetch(current, {
      ...init,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal
    });
    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get("location");
      try { await upstream.body?.cancel(); } catch {}
      if (!location) throw Object.assign(new Error("Redirect media tidak memiliki tujuan."), { status: 502, code: "INVALID_MEDIA_REDIRECT" });
      current = validateMediaUrl(new URL(location, current).toString());
      continue;
    }
    return { upstream, finalUrl: current.toString() };
  }
  throw Object.assign(new Error("Redirect media terlalu banyak."), { status: 502, code: "TOO_MANY_MEDIA_REDIRECTS" });
}

function upstreamHeaders(request, probe) {
  const range = probe ? "bytes=0-0" : String(request.headers?.range || "").trim();
  return {
    Accept: "*/*",
    "Accept-Encoding": "identity",
    "User-Agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/136 Mobile Safari/537.36 All-Tools-Nexora/6.3.9",
    Referer: "https://www.tiktok.com/",
    ...(range ? { Range: range } : {})
  };
}

async function handleMediaDownload(request, response, requestUrl) {
  const probe = requestUrl.searchParams.get("probe") === "1";
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return sendJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const rate = takeRateSlot(request, probe);
  response.setHeader("X-RateLimit-Limit", String(rate.limit));
  response.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
  if (!rate.allowed) {
    return sendJson(response, 429, {
      ok: false,
      error: "MEDIA_RATE_LIMITED",
      message: "Terlalu banyak permintaan media. Tunggu sebentar lalu coba lagi."
    });
  }

  const type = String(requestUrl.searchParams.get("type") || "MP4").toUpperCase();
  const normalizedType = type === "MP3" || type === "JPG" ? type : "MP4";
  const filename = sanitizeFilename(requestUrl.searchParams.get("filename"), normalizedType);
  let mediaUrl;
  try { mediaUrl = validateMediaUrl(requestUrl.searchParams.get("url")); }
  catch (error) {
    return sendJson(response, error.status || 400, { ok: false, error: error.code || "INVALID_MEDIA_URL", message: error.message });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), probe ? PROBE_TIMEOUT_MS : STREAM_TIMEOUT_MS);
  const abortUpstream = () => controller.abort();
  request.once?.("aborted", abortUpstream);
  response.once?.("close", abortUpstream);

  try {
    const result = await fetchAllowed(mediaUrl, {
      method: "GET",
      headers: upstreamHeaders(request, probe)
    }, controller);
    const upstream = result.upstream;
    const contentType = String(upstream.headers.get("content-type") || expectedContentType(normalizedType));
    const contentLength = upstream.headers.get("content-length");

    if (!(upstream.ok || upstream.status === 206)) {
      try { await upstream.body?.cancel(); } catch {}
      return sendJson(response, 502, {
        ok: false,
        error: "MEDIA_UPSTREAM_FAILED",
        message: `Server media merespons HTTP ${upstream.status}.`
      });
    }
    if (isInvalidMediaType(contentType)) {
      try { await upstream.body?.cancel(); } catch {}
      return sendJson(response, 422, {
        ok: false,
        error: "MEDIA_RESPONSE_INVALID",
        message: "Sumber mengembalikan halaman atau JSON, bukan file media."
      });
    }

    if (probe || request.method === "HEAD") {
      try { await upstream.body?.cancel(); } catch {}
      return sendJson(response, 200, {
        ok: true,
        ready: true,
        filename,
        type: normalizedType,
        contentType,
        contentLength: contentLength ? Number(contentLength) || null : null,
        finalHost: new URL(result.finalUrl).hostname
      });
    }

    response.statusCode = upstream.status === 206 ? 206 : 200;
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("Content-Type", contentType || expectedContentType(normalizedType));
    response.setHeader("Content-Disposition", `attachment; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox");
    for (const header of ["content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
      const value = upstream.headers.get(header);
      if (value) response.setHeader(header, value);
    }

    if (!upstream.body) return response.end();
    const stream = Readable.fromWeb(upstream.body);
    await pipeline(stream, response);
    return;
  } catch (error) {
    if (response.headersSent) {
      if (!response.destroyed) response.destroy();
      return;
    }
    const timeoutError = error?.name === "AbortError";
    return sendJson(response, timeoutError ? 504 : (error.status || 502), {
      ok: false,
      error: timeoutError ? "MEDIA_TIMEOUT" : (error.code || "MEDIA_DOWNLOAD_FAILED"),
      message: timeoutError ? "Server media melewati batas waktu." : (error.message || "Download media gagal.")
    });
  } finally {
    clearTimeout(timeout);
    request.removeListener?.("aborted", abortUpstream);
    response.removeListener?.("close", abortUpstream);
  }
}

module.exports = {
  ALLOWED_HOST_SUFFIXES,
  handleMediaDownload,
  isAllowedHost,
  sanitizeFilename,
  validateMediaUrl
};

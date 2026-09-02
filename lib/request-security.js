"use strict";

const crypto = require("node:crypto");

function firstHeader(value) {
  return String(value || "").split(",")[0].trim();
}

function requestOrigin(request) {
  const host = firstHeader(request?.headers?.["x-forwarded-host"] || request?.headers?.host);
  if (!host || /[\s/\\]/.test(host)) return "";
  const forwarded = firstHeader(request?.headers?.["x-forwarded-proto"]);
  const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol = forwarded === "https" || forwarded === "http"
    ? forwarded
    : request?.socket?.encrypted
      ? "https"
      : local
        ? "http"
        : "https";
  try { return new URL(`${protocol}://${host}`).origin; }
  catch { return ""; }
}

function configuredOrigins() {
  return String(process.env.NEXORA_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        const parsed = new URL(value);
        return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === value.replace(/\/$/, "")
          ? parsed.origin
          : "";
      } catch { return ""; }
    })
    .filter(Boolean);
}

function normalizeSuppliedOrigin(value) {
  const supplied = String(value || "").trim();
  if (!supplied || supplied === "null") return "";
  try { return new URL(supplied).origin; }
  catch { return "!invalid"; }
}

/**
 * Browser-origin defense is intentionally an additional layer. Authentication
 * and server-side authorization remain authoritative. Requests without browser
 * origin metadata are allowed so same-origin server clients and health probes
 * keep working; browsers cannot forge Origin/Sec-Fetch-Site from JavaScript.
 */
function verifySameOriginRequest(request) {
  const fetchSite = firstHeader(request?.headers?.["sec-fetch-site"]).toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;

  const supplied = normalizeSuppliedOrigin(request?.headers?.origin);
  if (!supplied) return true;
  if (supplied === "!invalid") return false;

  const expected = requestOrigin(request);
  const allowed = new Set([expected, ...configuredOrigins()].filter(Boolean));
  return allowed.has(supplied);
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyCsrfRequest(request, cookieName, parseCookies) {
  const cookies = typeof parseCookies === "function" ? parseCookies(request) : {};
  return timingSafeEqual(cookies?.[cookieName], request?.headers?.["x-csrf-token"])
    && verifySameOriginRequest(request);
}

module.exports = {
  configuredOrigins,
  requestOrigin,
  timingSafeEqual,
  verifyCsrfRequest,
  verifySameOriginRequest
};

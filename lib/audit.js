const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_REDIRECTS = 4;
const DEFAULT_CONCURRENCY = 6;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan"
];
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
  "host.docker.internal"
]);

function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(max, Math.floor(number))
    : fallback;
}

function createAuditError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function ipv4ToNumber(address) {
  const parts = String(address).split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function ipv4InRange(address, base, bits) {
  const value = ipv4ToNumber(address);
  const start = ipv4ToNumber(base);
  if (value === null || start === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (start & mask);
}

function isBlockedIpv4(address) {
  const ranges = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4]
  ];
  return ranges.some(([base, bits]) => ipv4InRange(address, base, bits));
}

function normalizedIpv6(address) {
  return String(address || "").toLowerCase().split("%")[0];
}

function mappedIpv4(address) {
  const normalized = normalizedIpv6(address);
  const dotted = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = normalized.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isBlockedIpv6(address) {
  const normalized = normalizedIpv6(address);
  const mapped = mappedIpv4(normalized);
  if (mapped) return isBlockedIpv4(mapped);
  return normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("100:") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2001:10:") ||
    normalized.startsWith("64:ff9b:");
}

function isBlockedIp(address) {
  const family = net.isIP(String(address || ""));
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

function createPinnedLookup(records) {
  const addresses = (Array.isArray(records) ? records : [records])
    .map((record) => {
      const address = String(record && record.address || "").trim();
      const detectedFamily = net.isIP(address);
      const declaredFamily = record && (record.family === "IPv4" ? 4 : record.family === "IPv6" ? 6 : Number(record.family));
      return {
        address,
        family: declaredFamily === detectedFamily ? declaredFamily : detectedFamily
      };
    })
    .filter((record) => (record.family === 4 || record.family === 6) && !isBlockedIp(record.address));

  if (!addresses.length) {
    throw createAuditError("Alamat tujuan tidak lolos validasi publik.", "PINNED_ADDRESS_INVALID");
  }

  return function pinnedLookup(_hostname, lookupOptions, callback) {
    let options = lookupOptions;
    let done = callback;
    if (typeof lookupOptions === "function") {
      done = lookupOptions;
      options = {};
    }

    const requestedFamily = options && (options.family === 4 || options.family === 6)
      ? Number(options.family)
      : 0;
    const matching = requestedFamily
      ? addresses.filter((record) => record.family === requestedFamily)
      : addresses;
    const selected = matching.length ? matching : addresses;

    if (options && options.all === true) {
      done(null, selected.map((record) => ({ ...record })));
      return;
    }
    done(null, selected[0].address, selected[0].family);
  };
}

function normalizeHostname(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

function validateUrlSyntax(rawValue, baseUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawValue || ""), baseUrl || undefined);
  } catch {
    throw createAuditError("URL tidak valid.", "INVALID_URL");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw createAuditError("Hanya protokol HTTP dan HTTPS yang dapat diaudit.", "UNSUPPORTED_PROTOCOL", {
      protocol: parsed.protocol
    });
  }
  if (parsed.username || parsed.password) {
    throw createAuditError("URL dengan kredensial tidak diizinkan.", "URL_CREDENTIALS_BLOCKED");
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw createAuditError("Port URL tidak diizinkan untuk audit publik.", "PORT_BLOCKED", {
      port: parsed.port
    });
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw createAuditError("Host lokal atau internal diblokir.", "HOST_BLOCKED");
  }
  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    throw createAuditError("Alamat IP privat atau reserved diblokir.", "PRIVATE_IP_BLOCKED", {
      address: hostname
    });
  }
  parsed.hash = "";
  return parsed;
}

async function assertPublicUrl(rawValue, options = {}) {
  const parsed = validateUrlSyntax(rawValue, options.baseUrl);
  const hostname = normalizeHostname(parsed.hostname);
  let records;
  if (net.isIP(hostname)) {
    records = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      records = await (options.lookup || dns.lookup)(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw createAuditError("DNS host tidak dapat di-resolve.", "DNS_LOOKUP_FAILED", {
        cause: error && error.code ? error.code : String(error)
      });
    }
    if (!Array.isArray(records) || records.length === 0) {
      throw createAuditError("DNS host tidak memiliki alamat publik.", "DNS_EMPTY");
    }
    const blocked = records.find((record) => isBlockedIp(record.address));
    if (blocked) {
      throw createAuditError("Host mengarah ke alamat privat atau reserved.", "PRIVATE_DNS_TARGET_BLOCKED", {
        address: blocked.address
      });
    }
  }
  Object.defineProperty(parsed, "auditAddresses", {
    value: records.map((record) => ({ address: record.address, family: record.family || net.isIP(record.address) })),
    enumerable: false
  });
  return parsed;
}

function expectedMimeFor(item, url) {
  const kind = String(item.kind || "").toLowerCase();
  const pathname = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch { return ""; }
  })();
  if (["script", "module-script"].includes(kind)) return ["javascript", "ecmascript"];
  if (["stylesheet", "css-import"].includes(kind)) return ["text/css"];
  if (["image", "responsive-image", "poster", "icon", "apple-touch-icon", "shortcut"].includes(kind)) return ["image/"];
  if (kind === "audio") return ["audio/"];
  if (kind === "video") return ["video/"];
  if (kind === "manifest") return ["application/manifest+json", "application/json"];
  if (/\.(?:css)(?:$|\?)/.test(pathname)) return ["text/css"];
  if (/\.(?:m?js|cjs)(?:$|\?)/.test(pathname)) return ["javascript", "ecmascript"];
  if (/\.(?:png|jpe?g|gif|webp|avif|svg|ico)(?:$|\?)/.test(pathname)) return ["image/"];
  if (/\.(?:woff2?|ttf|otf|eot)(?:$|\?)/.test(pathname)) return ["font/", "application/font", "application/vnd.ms-fontobject", "application/octet-stream"];
  if (/\.(?:mp4|webm|mov|m4v)(?:$|\?)/.test(pathname)) return ["video/"];
  if (/\.(?:mp3|wav|ogg|m4a|aac)(?:$|\?)/.test(pathname)) return ["audio/"];
  return [];
}

function mimeMatches(contentType, expected) {
  const actual = String(contentType || "").toLowerCase().split(";")[0].trim();
  if (!actual || !expected.length) return null;
  return expected.some((token) => actual.includes(token));
}

function corsRelevance(item) {
  if (item.type === "endpoint") return true;
  const kind = String(item.kind || "").toLowerCase();
  if (kind === "module-script") return true;
  const url = String(item.url || "").toLowerCase();
  return ["font", "css-url"].includes(kind) && /\.(?:woff2?|ttf|otf|eot)(?:$|\?)/.test(url);
}

function analyzeCors(headers, item, pageOrigin, finalUrl) {
  let external = false;
  try { external = new URL(finalUrl).origin !== pageOrigin; } catch {}
  const relevant = external && corsRelevance(item);
  const allowOrigin = String(headers.get("access-control-allow-origin") || "").trim();
  const allowed = !relevant || allowOrigin === "*" || allowOrigin === pageOrigin;
  return {
    checked: external,
    relevant,
    allowed,
    allowOrigin: allowOrigin || null,
    reason: !external
      ? "same-origin"
      : !relevant
        ? "not-required-for-this-resource"
        : allowed
          ? "allowed"
          : "origin-not-allowed"
  };
}

function stateFromResponse(status, issues) {
  if (status === 401 || status === 403) return "auth";
  if (status === 404 || status === 410) return "missing";
  if (status >= 500) return "error";
  if (status >= 400) return "warning";
  if (issues.length) return "warning";
  return "ok";
}

function resultFromError(item, error, startedAt) {
  const code = error && error.code ? error.code : "NETWORK_ERROR";
  const state = code === "AUDIT_TIMEOUT"
    ? "timeout"
    : /BLOCKED|PRIVATE|PORT/.test(code)
      ? "blocked"
      : /UNSUPPORTED|INVALID/.test(code)
        ? "skipped"
        : "error";
  return {
    id: item.id,
    type: item.type,
    kind: item.kind || null,
    method: item.method || null,
    requestedUrl: item.url,
    state,
    reachable: false,
    httpStatus: null,
    statusText: null,
    methodUsed: null,
    latencyMs: Date.now() - startedAt,
    finalUrl: null,
    redirects: [],
    contentType: null,
    contentLength: null,
    cors: null,
    mime: null,
    issues: [code],
    errorCode: code,
    message: error && error.message ? error.message : "Audit gagal."
  };
}

function nodeHeaders(rawHeaders) {
  const values = {};
  for (const [name, value] of Object.entries(rawHeaders || {})) {
    if (Array.isArray(value)) values[name] = value.join(", ");
    else if (value !== undefined) values[name] = String(value);
  }
  return new Headers(values);
}

function requestPinned(parsedUrl, requestOptions = {}) {
  const address = parsedUrl.auditAddresses && parsedUrl.auditAddresses[0];
  if (!address || isBlockedIp(address.address)) {
    return Promise.reject(createAuditError("Alamat tujuan tidak lolos validasi publik.", "PINNED_ADDRESS_INVALID"));
  }
  const transport = parsedUrl.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = transport.request(parsedUrl, {
      method: requestOptions.method || "HEAD",
      headers: requestOptions.headers || {},
      signal: requestOptions.signal,
      servername: net.isIP(parsedUrl.hostname) ? undefined : parsedUrl.hostname,
      autoSelectFamily: false,
      lookup: createPinnedLookup([address])
    }, (response) => {
      if (settled) return response.destroy();
      settled = true;
      const status = response.statusCode || 0;
      resolve({
        status,
        ok: status >= 200 && status < 300,
        statusText: response.statusMessage || "",
        headers: nodeHeaders(response.headers),
        body: null
      });
      response.destroy();
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.end();
  });
}

async function requestHeaders(parsedUrl, requestOptions, options) {
  if (options.fetchImpl) {
    const response = await options.fetchImpl(parsedUrl.href, {
      ...requestOptions,
      redirect: "manual"
    });
    if (response.body && typeof response.body.cancel === "function") {
      Promise.resolve(response.body.cancel()).catch(() => {});
    }
    return response;
  }
  return requestPinned(parsedUrl, requestOptions);
}

async function readHeadersWithRedirects(startUrl, requestOptions, options = {}) {
  const maxRedirects = positiveInteger(options.maxRedirects, DEFAULT_MAX_REDIRECTS, 8);
  const redirects = [];
  let currentUrl = String(startUrl);

  for (let index = 0; index <= maxRedirects; index += 1) {
    const safeUrl = await assertPublicUrl(currentUrl, options);
    const response = await requestHeaders(safeUrl, requestOptions, options);
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: safeUrl.href, redirects };
    }
    const location = response.headers.get("location");
    if (!location) return { response, finalUrl: safeUrl.href, redirects };
    if (index === maxRedirects) {
      throw createAuditError("Redirect melebihi batas aman.", "TOO_MANY_REDIRECTS");
    }
    const nextUrl = new URL(location, safeUrl.href).href;
    redirects.push({ status: response.status, from: safeUrl.href, to: nextUrl });
    currentUrl = nextUrl;
  }
  throw createAuditError("Redirect tidak dapat diselesaikan.", "REDIRECT_FAILED");
}

async function auditResource(item, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 12_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const target = validateUrlSyntax(options.target || item.url);
  const pageOrigin = target.origin;
  const normalizedItem = {
    id: String(item.id || ""),
    type: item.type === "endpoint" ? "endpoint" : "asset",
    kind: String(item.kind || "resource"),
    method: String(item.method || "GET").toUpperCase(),
    url: String(item.url || "")
  };

  try {
    const parsed = await assertPublicUrl(normalizedItem.url, options);
    const endpointUnsafe = normalizedItem.type === "endpoint" && !["GET", "HEAD", "OPTIONS"].includes(normalizedItem.method);
    const method = endpointUnsafe ? "OPTIONS" : "HEAD";
    const headers = {
      Accept: "*/*",
      Origin: pageOrigin,
      "User-Agent": "Nexora-Live-Audit/4.1 (+public-resource-check)"
    };
    const requestOptions = { method, headers, signal: controller.signal };
    let probe = await readHeadersWithRedirects(parsed.href, requestOptions, options);
    let methodUsed = method;

    if (!endpointUnsafe && [405, 501].includes(probe.response.status)) {
      methodUsed = "GET";
      probe = await readHeadersWithRedirects(parsed.href, {
        method: "GET",
        headers: { ...headers, Range: "bytes=0-2047" },
        signal: controller.signal
      }, options);
    }

    const { response, finalUrl, redirects } = probe;
    const contentType = response.headers.get("content-type") || null;
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader && /^\d+$/.test(contentLengthHeader) ? Number(contentLengthHeader) : null;
    const expectedMime = normalizedItem.type === "asset" ? expectedMimeFor(normalizedItem, finalUrl) : [];
    const matchesMime = mimeMatches(contentType, expectedMime);
    const cors = analyzeCors(response.headers, normalizedItem, pageOrigin, finalUrl);
    const issues = [];
    if (redirects.length) issues.push("REDIRECTED");
    if (matchesMime === false) issues.push("MIME_MISMATCH");
    if (cors.relevant && !cors.allowed) issues.push("CORS_RISK");
    if (endpointUnsafe) issues.push("NON_DESTRUCTIVE_OPTIONS_PROBE");
    if (response.status === 401 || response.status === 403) issues.push("AUTH_REQUIRED");
    if (response.status === 404 || response.status === 410) issues.push("NOT_FOUND");
    if (response.status >= 500) issues.push("UPSTREAM_SERVER_ERROR");
    if (response.status >= 400 && !issues.length) issues.push("HTTP_ERROR");

    return {
      id: normalizedItem.id,
      type: normalizedItem.type,
      kind: normalizedItem.kind,
      method: normalizedItem.method,
      requestedUrl: normalizedItem.url,
      state: stateFromResponse(response.status, issues),
      reachable: response.status > 0 && response.status < 500,
      httpStatus: response.status,
      statusText: response.statusText || null,
      methodUsed,
      latencyMs: Date.now() - startedAt,
      finalUrl,
      redirects,
      contentType,
      contentLength,
      cors,
      mime: {
        expected: expectedMime,
        matches: matchesMime
      },
      issues,
      errorCode: null,
      message: response.ok ? "Resource merespons." : `HTTP ${response.status}`
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      return resultFromError(normalizedItem, createAuditError("Audit melewati batas waktu.", "AUDIT_TIMEOUT"), startedAt);
    }
    return resultFromError(normalizedItem, error, startedAt);
  } finally {
    clearTimeout(timeout);
  }
}

function scoreWeight(state) {
  if (state === "ok") return 1;
  if (state === "warning") return 0.7;
  if (state === "auth") return 0.4;
  return 0;
}

function summarizeResults(results) {
  const summary = {
    total: results.length,
    reachable: 0,
    issues: 0,
    corsRisk: 0,
    mimeMismatch: 0,
    redirected: 0,
    authRequired: 0,
    states: {}
  };
  for (const result of results) {
    summary.states[result.state] = (summary.states[result.state] || 0) + 1;
    if (result.reachable) summary.reachable += 1;
    if (result.state !== "ok") summary.issues += 1;
    if (result.issues.includes("CORS_RISK")) summary.corsRisk += 1;
    if (result.issues.includes("MIME_MISMATCH")) summary.mimeMismatch += 1;
    if (result.issues.includes("REDIRECTED")) summary.redirected += 1;
    if (result.issues.includes("AUTH_REQUIRED")) summary.authRequired += 1;
  }
  const scorable = results.filter((result) => result.state !== "skipped");
  summary.score = scorable.length
    ? Math.round((scorable.reduce((total, result) => total + scoreWeight(result.state), 0) / scorable.length) * 100)
    : null;
  return summary;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, run));
  return results;
}

async function auditBatch(payload, options = {}) {
  const target = validateUrlSyntax(payload && payload.target).href;
  const maxItems = positiveInteger(options.maxItems || process.env.AUDIT_MAX_ITEMS, 16, 24);
  const concurrency = positiveInteger(options.concurrency || process.env.AUDIT_CONCURRENCY, DEFAULT_CONCURRENCY, 10);
  const timeoutMs = positiveInteger(options.timeoutMs || process.env.AUDIT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 12_000);
  const rawItems = Array.isArray(payload && payload.items) ? payload.items : [];
  const items = rawItems.slice(0, maxItems).map((item, index) => ({
    id: String(item && item.id || `item-${index}`),
    type: item && item.type === "endpoint" ? "endpoint" : "asset",
    kind: String(item && item.kind || "resource").slice(0, 60),
    method: String(item && item.method || "GET").slice(0, 16).toUpperCase(),
    url: String(item && item.url || "").slice(0, 4_096),
    scope: String(item && item.scope || "").slice(0, 24),
    source: String(item && item.source || "").slice(0, 80)
  }));
  const startedAt = Date.now();
  const results = await mapWithConcurrency(items, concurrency, (item) => auditResource(item, {
    ...options,
    target,
    timeoutMs
  }));
  return {
    version: 1,
    target,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    accepted: items.length,
    truncated: rawItems.length > items.length,
    summary: summarizeResults(results),
    results
  };
}

module.exports = {
  assertPublicUrl,
  auditBatch,
  auditResource,
  createPinnedLookup,
  createAuditError,
  isBlockedIp,
  requestPinned,
  summarizeResults,
  validateUrlSyntax
};

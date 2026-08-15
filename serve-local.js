"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const defaultPort = Number(process.env.PORT || 4173);
const defaultHost = process.env.HOST || "127.0.0.1";
const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://esm.sh; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://freeconvert.com https://*.freeconvert.com https://api-nanzz.my.id https://api.allorigins.win https://api.country.is https://api.ikyyxd.my.id https://api.mangadex.org https://api.microlink.io https://api.nexadev.my.id https://api.nexray.eu.cc https://api.qrserver.com https://api.resellergaming.my.id https://api.siputzx.my.id https://apii.nexadev.my.id https://api.groq.com https://carifakta-tnz.vercel.app https://cors-anyway.huskymobile.com https://corsproxy.io https://eu.r.jina.ai https://images.weserv.nl https://ipapi.co https://ipwho.is https://kaze-extract.netlify.app https://kyzznekoo.zone.id https://nexus-tools.my.id https://proxy.corsfix.com https://r.jina.ai https://raw.githubusercontent.com https://staticimgly.com https://sylvatica.my.id https://test.cors.workers.dev https://tikwm.com https://uploads.mangadex.org https://wsrv.nl https://www.tikwm.com https://zxvaiapk.netlify.app https://cdn.jsdelivr.net https://esm.sh https://c.termai.cc; frame-src 'self' blob: data: https://kaze-extract.netlify.app; worker-src 'self' blob:; object-src 'none'; base-uri 'self' https:; form-action 'self' https:; frame-ancestors 'self'; manifest-src 'self'; upgrade-insecure-requests";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".wasm": "application/wasm"
};

const cleanRoutes = {
  "/": "index.html",
  "/index.html": "index.html",
  "/about": "about.html",
  "/about.html": "about.html",
  "/feedback": "feedback.html",
  "/feedback.html": "feedback.html",
  "/admin": "admin/index.html",
  "/admin/": "admin/index.html",
  "/admin/index.html": "admin/index.html",
  "/admin/login": "admin/login.html",
  "/admin/login.html": "admin/login.html",
  "/favicon.svg": "favicon.svg"
};

const API_ROUTES = Object.freeze({
  "/api/health": { file: "api/health.js" },
  "/api/database": { file: "api/health.js", mode: "database" },
  "/api/feedback": { file: "api/feedback.js" },
  "/api/analytics": { file: "api/feedback.js", mode: "analytics" },
  "/api/audit": { file: "api/audit.js" },
  "/api/web-intelligence": { file: "api/audit.js", mode: "web-intelligence" },
  "/api/tool-health": { file: "api/tool-health.js" },
  "/api/media-download": { file: "api/tool-health.js", mode: "media-download" },
  "/api/downloader": { file: "api/tool-health.js", mode: "downloader" },
  "/api/sitegrabber": { file: "api/tool-health.js", mode: "sitegrabber" },
  "/api/crypto-market": { file: "api/tool-health.js", mode: "crypto-market" },
  "/api/space-explorer": { file: "api/tool-health.js", mode: "space-explorer" },
  "/api/ocr-intelligence": { file: "api/tool-health.js", mode: "ocr-intelligence" },
  "/api/svg-alight": { file: "api/tool-health.js", mode: "svg-alight" },
  "/api/big-image": { file: "api/tool-health.js", mode: "big-image" },
  "/api/vdeploy": { file: "api/health.js", mode: "vdeploy" },
  "/api/ai/chat": { file: "api/health.js", mode: "ai-chat" },
  "/api/admin/auth": { file: "api/admin/auth.js" },
  "/api/admin/dashboard": { file: "api/admin/dashboard.js" },
  "/api/admin/tools": { file: "api/admin/tools.js" },
  "/api/admin/analytics": { file: "api/admin/analytics.js" },
  "/api/admin/feedback": { file: "api/admin/feedback.js" },
  "/api/admin/audit": { file: "api/admin/audit.js" },
  "/api/admin/visual": { file: "api/admin/visual.js" },
  "/api/admin/socials": { file: "api/admin/socials.js" },
  "/api/admin/ai": { file: "api/admin/dashboard.js", mode: "personal-ai" }
});

function normalizeApiPath(pathname) {
  const clean = pathname.endsWith(".js") ? pathname.slice(0, -3) : pathname;
  return Object.hasOwn(API_ROUTES, clean) ? clean : "";
}

function bodyLimit(pathname, requestUrl) {
  const mode = requestUrl.searchParams.get("mode") || API_ROUTES[pathname]?.mode || "";
  if (pathname === "/api/vdeploy") return 4_400_000;
  if (pathname === "/api/ocr-intelligence" || mode === "ocr-intelligence") return 1_600_000;
  if (mode === "image-vectorizer" || mode === "big-image") return 4_200_000;
  if (pathname === "/api/audit") return 230_000;
  if (pathname === "/api/ai/chat" || pathname === "/api/admin/ai") return 80_000;
  return 550_000;
}

function decorateResponse(response) {
  response.status = (statusCode) => { response.statusCode = statusCode; return response; };
  response.json = (payload) => {
    if (!response.hasHeader("Content-Type")) response.setHeader("Content-Type", "application/json; charset=utf-8");
    return response.end(JSON.stringify(payload));
  };
  response.send = (payload) => {
    if (Buffer.isBuffer(payload) || typeof payload === "string") return response.end(payload);
    return response.json(payload);
  };
  return response;
}

async function readBody(request, limit) {
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > limit) throw Object.assign(new Error("Payload terlalu besar."), { status: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Payload terlalu besar."), { status: 413 });
    chunks.push(Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const body = Buffer.concat(chunks);
  const type = String(request.headers["content-type"] || "").toLowerCase();
  if (!/(?:application\/json|\+json)(?:;|$)/.test(type)) return body;
  try { return JSON.parse(body.toString("utf8")); }
  catch { throw Object.assign(new Error("JSON tidak valid."), { status: 400 }); }
}

async function runApi(route, request, response, requestUrl) {
  try {
    if (route.mode) requestUrl.searchParams.set("mode", route.mode);
    request.url = `${requestUrl.pathname}${requestUrl.search}`;
    request.query = Object.fromEntries(requestUrl.searchParams.entries());
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method || "GET")) {
      request.body = await readBody(request, bodyLimit(normalizeApiPath(requestUrl.pathname), requestUrl));
    }
    const handler = require(path.join(root, route.file));
    await handler(request, decorateResponse(response));
  } catch (error) {
    if (response.headersSent) {
      if (!response.writableEnded) response.end();
      return;
    }
    response.statusCode = error.status || 500;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      ok: false,
      error: error.status === 413 ? "PAYLOAD_TOO_LARGE" : error.status === 400 ? "INVALID_JSON" : "LOCAL_API_ERROR",
      message: error.message
    }));
  }
}

function hasUnsafeSegment(pathname) {
  return pathname.includes("\0") || pathname.split("/").some((segment) => segment === ".." || segment.startsWith("."));
}

function isStaticPathAllowed(pathname) {
  if (hasUnsafeSegment(pathname)) return false;
  if (Object.hasOwn(cleanRoutes, pathname)) return true;
  return pathname.startsWith("/assets/") && pathname.length > "/assets/".length;
}

function existingPublicFile(pathname) {
  if (!isStaticPathAllowed(pathname)) return null;
  const relative = cleanRoutes[pathname] || pathname.slice(1);
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null;
  try { return fs.statSync(file).isFile() ? file : null; }
  catch { return null; }
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
}

function createLocalServer() {
  return http.createServer(async (request, response) => {
    applySecurityHeaders(response);
    let requestUrl;
    let pathname;
    try {
      requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }

    const apiPath = normalizeApiPath(pathname);
    if (apiPath) {
      requestUrl.pathname = apiPath;
      return runApi(API_ROUTES[apiPath], request, response, requestUrl);
    }
    if (pathname.startsWith("/api/")) {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ ok: false, error: "API_ROUTE_NOT_FOUND" }));
      return;
    }
    if (!["GET", "HEAD"].includes(request.method || "GET")) {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }

    let file = existingPublicFile(pathname);
    const navigation = /text\/html/i.test(request.headers.accept || "") && !path.extname(pathname) && !hasUnsafeSegment(pathname);
    if (!file && navigation) file = existingPublicFile("/");
    if (!file) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const stat = fs.statSync(file);
    const extension = path.extname(file).toLowerCase();
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Content-Length": String(stat.size),
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600"
    });
    if (request.method === "HEAD") return response.end();
    fs.createReadStream(file).on("error", () => response.destroy()).pipe(response);
  });
}

if (require.main === module) {
  const server = createLocalServer();
  server.listen(defaultPort, defaultHost, () => {
    const address = server.address();
    const activePort = typeof address === "object" && address ? address.port : defaultPort;
    console.log(`All Tools Nexora: http://${defaultHost}:${activePort}`);
  });
}

module.exports = { API_ROUTES, CONTENT_SECURITY_POLICY, createLocalServer, isStaticPathAllowed };

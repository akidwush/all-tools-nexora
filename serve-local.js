const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".xml": "application/xml"
};
const assetExtension = /\.(?:css|m?js|cjs|map|json|xml|txt|csv|png|jpe?g|gif|webp|avif|svg|ico|woff3?|eot|ttf|otf|mp3|wav|ogg|m4a|flac|mp4|webm|mov|m4v|3gp|wasm|webmanifest|pdf)$/i;

function existing(relative) {
  let file = path.resolve(root, String(relative || "index.html").replace(/^\/+/, ""));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    return fs.statSync(file).isFile() ? file : null;
  } catch { return null; }
}

function decorateResponse(response) {
  response.status = (statusCode) => { response.statusCode = statusCode; return response; };
  response.json = (payload) => response.end(JSON.stringify(payload));
  return response;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error("Payload terlalu besar."), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON tidak valid."), { status: 400 }); }
}

async function runApi(modulePath, request, response) {
  try {
    if (request.method === "POST") request.body = await readJson(request);
    const handler = require(modulePath);
    await handler(request, decorateResponse(response));
  } catch (error) {
    if (response.headersSent) return response.end();
    response.statusCode = error.status || 500;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ ok: false, error: "LOCAL_API_ERROR", message: error.message }));
  }
}

http.createServer(async (request, response) => {
  const securityHeaders = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN"
  };
  for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);

  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname); }
  catch { response.writeHead(400); return response.end("Bad request"); }

  if (pathname === "/api/health" || pathname === "/api/health.js") {
    return runApi(path.join(root, "api", "health.js"), request, response);
  }
  if (pathname === "/api/feedback" || pathname === "/api/feedback.js") {
    return runApi(path.join(root, "api", "feedback.js"), request, response);
  }
  if (pathname === "/api/database" || pathname === "/api/database.js") {
    return runApi(path.join(root, "api", "database.js"), request, response);
  }

  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end("Method not allowed");
  }

  const cleanRoutes = { "/about": "/about.html", "/feedback": "/feedback.html" };
  const relative = cleanRoutes[pathname] || pathname;
  let file = existing(relative);
  const navigation = !assetExtension.test(pathname) && /text\/html/i.test(request.headers.accept || "");
  if (!file && navigation) file = existing("index.html");
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Not found");
  }

  const stat = fs.statSync(file);
  response.writeHead(200, {
    "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": String(stat.size),
    "Cache-Control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=3600"
  });
  if (request.method === "HEAD") return response.end();
  fs.createReadStream(file).on("error", () => response.destroy()).pipe(response);
}).listen(port, host, () => {
  console.log(`All Tools Nexora: http://${host}:${port}`);
});

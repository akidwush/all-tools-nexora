"use strict";

const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const zlib = require("node:zlib");
const { assertPublicUrl, isBlockedIp, validateUrlSyntax } = require("./audit");

const MAX_HTML_BYTES = 900_000;
const MAX_BODY_BYTES = 16_384;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_CACHE_MS = 5 * 60_000;
const MAX_REDIRECTS = 5;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const cache = new Map();
const inFlight = new Map();
const visitors = new Map();

function positiveInteger(value, fallback, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), maximum) : fallback;
}

function safeText(value, maximum = 500) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeInput(value) {
  let input = String(value || "").trim();
  if (input.length > 2_048) throw Object.assign(new Error("URL terlalu panjang."), { status: 400, code: "URL_TOO_LONG" });
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input) && /^[a-z0-9.-]+(?::\d+)?(?:\/|$)/i.test(input)) input = `https://${input}`;
  return validateUrlSyntax(input).href;
}

function responseHeaders(raw) {
  const rows = {};
  if (!raw) return rows;
  if (typeof raw.forEach === "function") raw.forEach((value, key) => { rows[String(key).toLowerCase()] = String(value); });
  else for (const [key, value] of Object.entries(raw)) rows[String(key).toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  return rows;
}

function tlsDetails(socket) {
  if (!socket || typeof socket.getPeerCertificate !== "function") return null;
  try {
    const certificate = socket.getPeerCertificate();
    if (!certificate || !Object.keys(certificate).length) return null;
    return {
      authorized: socket.authorized === true,
      protocol: safeText(socket.getProtocol?.(), 30) || null,
      subject: safeText(certificate.subject?.CN, 200) || null,
      issuer: safeText(certificate.issuer?.CN || certificate.issuer?.O, 200) || null,
      validFrom: certificate.valid_from || null,
      validTo: certificate.valid_to || null,
      daysRemaining: certificate.valid_to ? Math.ceil((Date.parse(certificate.valid_to) - Date.now()) / 86_400_000) : null
    };
  } catch { return null; }
}

function decodePageBuffer(buffer, encoding) {
  const type = String(encoding || "").toLowerCase().trim();
  if (!type || type === "identity") return buffer;
  const options = { maxOutputLength: MAX_HTML_BYTES * 2 };
  if (type.includes("br")) return zlib.brotliDecompressSync(buffer, options);
  if (type.includes("gzip")) return zlib.gunzipSync(buffer, options);
  if (type.includes("deflate")) return zlib.inflateSync(buffer, options);
  throw Object.assign(new Error("Encoding respons website tidak didukung."), { status: 422, code: "UNSUPPORTED_CONTENT_ENCODING" });
}

function requestPinnedPage(parsed, options = {}) {
  const address = parsed.auditAddresses?.[0];
  if (!address || isBlockedIp(address.address)) return Promise.reject(Object.assign(new Error("Alamat tujuan tidak lolos validasi publik."), { code: "PINNED_ADDRESS_INVALID" }));
  const transport = parsed.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;
    let truncated = false;
    const chunks = [];
    const request = transport.request(parsed, {
      method: "GET",
      signal: options.signal,
      servername: net.isIP(parsed.hostname) ? undefined : parsed.hostname,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
        "Accept-Encoding": "identity",
        "User-Agent": "Nexora-Web-Intelligence/1.0 (+public-site-audit)"
      },
      lookup(_hostname, _lookupOptions, callback) { callback(null, address.address, address.family); }
    }, (response) => {
      const finish = () => {
        if (settled) return;
        let decoded;
        try { decoded = decodePageBuffer(Buffer.concat(chunks), response.headers["content-encoding"]); }
        catch (error) { settled = true; reject(error); return; }
        const decodedTruncated = decoded.length > MAX_HTML_BYTES;
        settled = true;
        resolve({
          status: response.statusCode || 0,
          statusText: response.statusMessage || "",
          headers: responseHeaders(response.headers),
          rawSetCookie: Array.isArray(response.headers["set-cookie"]) ? response.headers["set-cookie"] : (response.headers["set-cookie"] ? [String(response.headers["set-cookie"])] : []),
          body: decoded.subarray(0, MAX_HTML_BYTES).toString("utf8"),
          bytes: decoded.length,
          truncated: truncated || decodedTruncated,
          tls: tlsDetails(response.socket),
          addresses: parsed.auditAddresses.slice(0, 4)
        });
      };
      response.on("data", (chunk) => {
        if (truncated) return;
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_HTML_BYTES) {
          const allowed = Math.max(0, MAX_HTML_BYTES - (size - buffer.length));
          if (allowed) chunks.push(buffer.subarray(0, allowed));
          truncated = true;
          response.destroy();
          finish();
          return;
        }
        chunks.push(buffer);
      });
      response.once("end", finish);
      response.once("close", finish);
      response.once("error", (error) => { if (!settled) { settled = true; reject(error); } });
    });
    request.once("error", (error) => { if (!settled) { settled = true; reject(error); } });
    request.end();
  });
}

async function requestPage(parsed, options = {}) {
  if (!options.fetchImpl) return requestPinnedPage(parsed, options);
  const response = await options.fetchImpl(parsed.href, {
    method: "GET",
    redirect: "manual",
    signal: options.signal,
    headers: { Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity", "User-Agent": "Nexora-Web-Intelligence-Test/1.0" }
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    statusText: response.statusText || "",
    headers: responseHeaders(response.headers),
    rawSetCookie: typeof response.headers?.getSetCookie === "function" ? response.headers.getSetCookie() : [],
    body: buffer.subarray(0, MAX_HTML_BYTES).toString("utf8"),
    bytes: buffer.length,
    truncated: buffer.length > MAX_HTML_BYTES,
    tls: options.tls || null,
    addresses: parsed.auditAddresses?.slice(0, 4) || []
  };
}

async function readSafePage(startUrl, options = {}) {
  const timeoutMs = positiveInteger(options.timeoutMs || process.env.WEB_INTEL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 20_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let current = startUrl;
  const redirects = [];
  const startedAt = Date.now();
  try {
    for (let index = 0; index <= MAX_REDIRECTS; index += 1) {
      const parsed = await assertPublicUrl(current, options);
      const page = await requestPage(parsed, { ...options, signal: controller.signal });
      if (![301, 302, 303, 307, 308].includes(page.status)) {
        return { ...page, finalUrl: parsed.href, redirects, responseTimeMs: Date.now() - startedAt };
      }
      const location = page.headers.location;
      if (!location) return { ...page, finalUrl: parsed.href, redirects, responseTimeMs: Date.now() - startedAt };
      if (index === MAX_REDIRECTS) throw Object.assign(new Error("Redirect melebihi batas aman."), { code: "TOO_MANY_REDIRECTS" });
      const next = new URL(location, parsed.href).href;
      redirects.push({ status: page.status, from: parsed.href, to: next });
      current = next;
    }
    throw Object.assign(new Error("Redirect tidak dapat diselesaikan."), { code: "REDIRECT_FAILED" });
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("Pemindaian website melewati batas waktu."), { status: 504, code: "WEB_SCAN_TIMEOUT" });
    throw error;
  } finally { clearTimeout(timer); }
}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function stripMarkup(value, maximum = 500) {
  return safeText(decodeEntities(String(value || "").replace(/<[^>]*>/g, " ")), maximum);
}

function attributes(tag) {
  const result = {};
  const expression = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = expression.exec(String(tag || "")))) {
    const name = match[1].toLowerCase();
    if (!name.startsWith("<") && !(name in result)) result[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function tags(html, name, maximum = 5_000) {
  const rows = [];
  const expression = new RegExp(`<${name}\\b[^>]*>`, "gi");
  let match;
  while (rows.length < maximum && (match = expression.exec(html))) rows.push({ raw: match[0], attrs: attributes(match[0]), index: match.index });
  return rows;
}

function metaValue(metaTags, names) {
  const wanted = names.map((name) => name.toLowerCase());
  const row = metaTags.find((item) => wanted.includes(String(item.attrs.name || item.attrs.property || item.attrs["http-equiv"] || "").toLowerCase()));
  return row ? safeText(row.attrs.content, 800) : "";
}

function tagText(html, name, maximum = 500) {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\/${name}>`, "i").exec(html);
  return match ? stripMarkup(match[1], maximum) : "";
}

function safeResolve(raw, base) {
  try {
    const url = new URL(String(raw || ""), base);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function analyzeLinks(html, finalUrl) {
  const origin = new URL(finalUrl).origin;
  const anchorTags = tags(html, "a");
  const domains = new Map();
  let internal = 0, external = 0, mailto = 0, telephone = 0, fragments = 0, unsafeBlank = 0;
  for (const row of anchorTags) {
    const href = String(row.attrs.href || "").trim();
    if (!href) continue;
    if (href.startsWith("#")) { fragments += 1; continue; }
    if (/^mailto:/i.test(href)) { mailto += 1; continue; }
    if (/^tel:/i.test(href)) { telephone += 1; continue; }
    const resolved = safeResolve(href, finalUrl);
    if (!resolved) continue;
    if (resolved.origin === origin) internal += 1;
    else {
      external += 1;
      domains.set(resolved.hostname, (domains.get(resolved.hostname) || 0) + 1);
      if (String(row.attrs.target || "").toLowerCase() === "_blank" && !/\bnoopener\b/i.test(row.attrs.rel || "")) unsafeBlank += 1;
    }
  }
  return {
    total: anchorTags.length, internal, external, mailto, telephone, fragments, unsafeBlank,
    topExternalDomains: [...domains].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([domain, count]) => ({ domain, count }))
  };
}

function detectTechnologies(html, headers) {
  const source = html.toLowerCase();
  const server = String(headers.server || "").toLowerCase();
  const powered = String(headers["x-powered-by"] || "").toLowerCase();
  const rows = [];
  const add = (name, category, evidence) => { if (!rows.some((row) => row.name === name)) rows.push({ name, category, evidence }); };
  if (/__next_data__|\/_next\//.test(source) || powered.includes("next.js")) add("Next.js", "Framework", "Next runtime signature");
  if (/data-reactroot|react-dom|__react/.test(source)) add("React", "JavaScript", "React runtime signature");
  if (/__nuxt__|\/_nuxt\//.test(source)) add("Nuxt", "Framework", "Nuxt runtime signature");
  if (/data-v-[a-f0-9]|__vue__/.test(source)) add("Vue.js", "JavaScript", "Vue runtime signature");
  if (/ng-version=|ng-app=/.test(source)) add("Angular", "JavaScript", "Angular DOM signature");
  if (/astro-island|astro:page-load/.test(source)) add("Astro", "Framework", "Astro island signature");
  if (/__svelte|sveltekit/.test(source)) add("Svelte", "Framework", "Svelte runtime signature");
  if (/\/wp-content\/|wordpress/.test(source)) add("WordPress", "CMS", "WordPress asset signature");
  if (/cdn\.shopify\.com|shopify-section/.test(source)) add("Shopify", "Commerce", "Shopify asset signature");
  if (/jquery(?:\.min)?\.js|jquery-\d/.test(source)) add("jQuery", "JavaScript", "jQuery asset signature");
  if (/bootstrap(?:\.min)?\.(?:css|js)/.test(source)) add("Bootstrap", "UI", "Bootstrap asset signature");
  if (headers["x-vercel-id"] || server.includes("vercel")) add("Vercel", "Hosting", "Vercel response header");
  if (headers["x-nf-request-id"]) add("Netlify", "Hosting", "Netlify response header");
  if (headers["cf-ray"] || server.includes("cloudflare")) add("Cloudflare", "CDN", "Cloudflare response header");
  if (server.includes("nginx")) add("Nginx", "Server", "Server response header");
  if (server.includes("apache")) add("Apache", "Server", "Server response header");
  return rows.slice(0, 16);
}

function detectTrackers(html) {
  const source = html.toLowerCase();
  const signatures = [
    ["Google Analytics", /google-analytics\.com|googletagmanager\.com|gtag\(/],
    ["Meta Pixel", /connect\.facebook\.net|fbq\(/],
    ["Microsoft Clarity", /clarity\.ms|clarity\(/],
    ["Hotjar", /static\.hotjar\.com|hj\(/],
    ["TikTok Pixel", /analytics\.tiktok\.com|ttq\./],
    ["Google AdSense", /pagead2\.googlesyndication\.com|adsbygoogle/],
    ["LinkedIn Insight", /snap\.licdn\.com|linkedin_insight/]
  ];
  return signatures.filter(([, expression]) => expression.test(source)).map(([name]) => ({ name, detected: true }));
}

function analyzeHtml(html, finalUrl, page) {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = headEnd >= 0 ? html.slice(0, headEnd + 7) : html.slice(0, Math.min(html.length, 200_000));
  const metaTags = tags(head, "meta");
  const linkTags = tags(head, "link");
  const scriptTags = tags(html, "script");
  const styleTags = tags(html, "style");
  const imageTags = tags(html, "img");
  const formTags = tags(html, "form");
  const inputTags = tags(html, "input").concat(tags(html, "textarea"), tags(html, "select"));
  const labelsFor = new Set(tags(html, "label").map((row) => String(row.attrs.for || "")).filter(Boolean));
  const accessibleInputs = inputTags.filter((row) => row.attrs["aria-label"] || row.attrs["aria-labelledby"] || row.attrs.title || (row.attrs.id && labelsFor.has(row.attrs.id))).length;
  const buttonTags = tags(html, "button");
  const namedButtons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].filter((match) => {
    const attrs = attributes(`<button ${match[1] || ""}>`);
    return attrs["aria-label"] || attrs["aria-labelledby"] || attrs.title || stripMarkup(match[2], 100);
  }).length;
  const title = tagText(head, "title", 300);
  const description = metaValue(metaTags, ["description"]);
  const canonicalRow = linkTags.find((row) => /\bcanonical\b/i.test(row.attrs.rel || ""));
  const canonical = canonicalRow ? safeResolve(canonicalRow.attrs.href, finalUrl)?.href || "" : "";
  const robots = metaValue(metaTags, ["robots", "googlebot"]);
  const lang = safeText((/<html\b[^>]*>/i.exec(html) || [""])[0] ? attributes((/<html\b[^>]*>/i.exec(html) || [""])[0]).lang : "", 30);
  const charset = safeText(metaTags.find((row) => row.attrs.charset)?.attrs.charset || metaValue(metaTags, ["content-type"]), 80);
  const viewport = metaValue(metaTags, ["viewport"]);
  const favicon = linkTags.some((row) => /(?:^|\s)(?:icon|shortcut icon)(?:\s|$)/i.test(row.attrs.rel || ""));
  const h1 = tags(html, "h1").length;
  const headingCounts = {};
  for (let level = 1; level <= 6; level += 1) headingCounts[`h${level}`] = tags(html, `h${level}`).length;
  const imagesWithAlt = imageTags.filter((row) => Object.hasOwn(row.attrs, "alt")).length;
  const lazyImages = imageTags.filter((row) => String(row.attrs.loading || "").toLowerCase() === "lazy").length;
  const headScripts = scriptTags.filter((row) => row.index < head.length);
  const renderBlocking = headScripts.filter((row) => !row.attrs.async && !row.attrs.defer && String(row.attrs.type || "").toLowerCase() !== "module" && row.attrs.src).length;
  const inlineScriptBytes = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].reduce((sum, match) => sum + Buffer.byteLength(match[1] || ""), 0);
  const inlineStyleBytes = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].reduce((sum, match) => sum + Buffer.byteLength(match[1] || ""), 0);
  const stylesheets = linkTags.filter((row) => /\bstylesheet\b/i.test(row.attrs.rel || "")).length;
  const domNodes = (html.match(/<[a-z][^!/?][^>]*>/gi) || []).length;
  const mixedContent = page.finalUrl.startsWith("https:") ? (html.match(/(?:src|href|action)\s*=\s*["']http:\/\//gi) || []).length : 0;
  const insecureForms = formTags.filter((row) => String(row.attrs.action || "").toLowerCase().startsWith("http://") && page.finalUrl.startsWith("https:")).length;
  const jsonLd = scriptTags.filter((row) => String(row.attrs.type || "").toLowerCase() === "application/ld+json").length;
  const skipLink = /<a\b[^>]*href=["']#(?:main|content|main-content)["']/i.test(html);
  const deprecatedTags = (html.match(/<(?:font|marquee|center)\b/gi) || []).length;
  const links = analyzeLinks(html, finalUrl);
  return {
    page: {
      title, description, canonical, robots, lang, charset, viewport,
      ogTitle: metaValue(metaTags, ["og:title"]), ogDescription: metaValue(metaTags, ["og:description"]), ogImage: metaValue(metaTags, ["og:image"]),
      twitterCard: metaValue(metaTags, ["twitter:card"]), favicon, jsonLd
    },
    metrics: {
      htmlBytes: page.bytes, htmlTruncated: page.truncated, domNodes, scripts: scriptTags.length,
      stylesheets, images: imageTags.length, imagesWithAlt, lazyImages, renderBlockingScripts: renderBlocking,
      inlineScriptBytes, inlineStyleBytes, forms: formTags.length, formControls: inputTags.length,
      labeledControls: accessibleInputs, buttons: buttonTags.length, namedButtons, h1, headingCounts,
      mixedContent, insecureForms, deprecatedTags, skipLink
    },
    links,
    technologies: detectTechnologies(html, page.headers),
    trackers: detectTrackers(html)
  };
}

function check(id, category, title, status, weight, evidence, fix) {
  return { id, category, title, status, weight, evidence: safeText(evidence, 350), fix: safeText(fix, 500) };
}

function buildChecks(context) {
  const { page, data } = context;
  const meta = data.page, metrics = data.metrics, headers = page.headers;
  const ratio = (part, total) => total ? part / total : 1;
  const titleLength = meta.title.length, descriptionLength = meta.description.length;
  const csp = headers["content-security-policy"] || "";
  const hsts = headers["strict-transport-security"] || "";
  const cookieRows = Array.isArray(page.rawSetCookie) ? page.rawSetCookie : [];
  const cookiesGood = cookieRows.length ? cookieRows.every((row) => /;\s*secure\b/i.test(row) && /;\s*httponly\b/i.test(row) && /;\s*samesite=/i.test(row)) : true;
  const imageAltRatio = ratio(metrics.imagesWithAlt, metrics.images);
  const labelRatio = ratio(metrics.labeledControls, metrics.formControls);
  const buttonRatio = ratio(metrics.namedButtons, metrics.buttons);
  const lazyRatio = ratio(metrics.lazyImages, metrics.images);
  const canonicalUrl = safeResolve(meta.canonical, page.finalUrl);
  const rows = [
    check("seo-status", "seo", "Halaman dapat diindeks", page.status >= 200 && page.status < 300 ? "pass" : page.status < 500 ? "warn" : "fail", 12, `HTTP ${page.status}`, "Pastikan URL utama merespons HTTP 200."),
    check("seo-title", "seo", "Judul halaman", titleLength >= 30 && titleLength <= 60 ? "pass" : titleLength ? "warn" : "fail", 15, titleLength ? `${titleLength} karakter` : "Title tidak ditemukan", "Gunakan title unik dan deskriptif sekitar 30–60 karakter."),
    check("seo-description", "seo", "Meta description", descriptionLength >= 70 && descriptionLength <= 160 ? "pass" : descriptionLength ? "warn" : "fail", 15, descriptionLength ? `${descriptionLength} karakter` : "Description tidak ditemukan", "Tambahkan meta description unik sekitar 70–160 karakter."),
    check("seo-canonical", "seo", "Canonical URL", meta.canonical ? (canonicalUrl ? "pass" : "warn") : "warn", 8, meta.canonical || "Canonical tidak ditemukan", "Tambahkan link rel=canonical yang valid."),
    check("seo-robots", "seo", "Kebijakan index", /\bnoindex\b/i.test(meta.robots) ? "fail" : "pass", 10, meta.robots || "Index diperbolehkan secara default", "Hapus noindex bila halaman memang harus muncul di mesin pencari."),
    check("seo-h1", "seo", "Struktur H1", metrics.h1 === 1 ? "pass" : metrics.h1 > 1 ? "warn" : "fail", 12, `${metrics.h1} elemen H1`, "Gunakan satu H1 utama yang menjelaskan isi halaman."),
    check("seo-social", "seo", "Metadata social sharing", meta.ogTitle && meta.ogImage ? "pass" : meta.ogTitle || meta.ogImage ? "warn" : "fail", 10, meta.ogTitle && meta.ogImage ? "Open Graph lengkap" : "Open Graph belum lengkap", "Tambahkan og:title, og:description, dan og:image."),
    check("seo-structured", "seo", "Structured data", meta.jsonLd > 0 ? "pass" : "warn", 8, `${meta.jsonLd} blok JSON-LD`, "Tambahkan schema.org JSON-LD yang sesuai jenis halaman."),
    check("seo-https", "seo", "HTTPS", page.finalUrl.startsWith("https:") ? "pass" : "fail", 10, new URL(page.finalUrl).protocol.toUpperCase(), "Alihkan seluruh trafik ke HTTPS."),

    check("sec-csp", "security", "Content Security Policy", csp ? (/unsafe-eval/i.test(csp) ? "warn" : "pass") : "fail", 16, csp ? (csp.includes("unsafe-eval") ? "CSP memakai unsafe-eval" : "CSP aktif") : "Header CSP tidak ada", "Pasang CSP yang membatasi script, frame, object, dan koneksi eksternal."),
    check("sec-hsts", "security", "HTTP Strict Transport Security", page.finalUrl.startsWith("https:") ? (hsts && !/max-age=0/i.test(hsts) ? "pass" : "fail") : "fail", 12, hsts || "HSTS tidak ada", "Pasang Strict-Transport-Security dengan max-age yang sesuai pada HTTPS."),
    check("sec-nosniff", "security", "MIME sniffing protection", /nosniff/i.test(headers["x-content-type-options"] || "") ? "pass" : "fail", 9, headers["x-content-type-options"] || "Header tidak ada", "Pasang X-Content-Type-Options: nosniff."),
    check("sec-frame", "security", "Clickjacking protection", headers["x-frame-options"] || /frame-ancestors/i.test(csp) ? "pass" : "fail", 11, headers["x-frame-options"] || (/frame-ancestors/i.test(csp) ? "CSP frame-ancestors aktif" : "Proteksi frame tidak ditemukan"), "Pasang CSP frame-ancestors atau X-Frame-Options."),
    check("sec-referrer", "security", "Referrer Policy", headers["referrer-policy"] && !/unsafe-url/i.test(headers["referrer-policy"]) ? "pass" : headers["referrer-policy"] ? "warn" : "fail", 8, headers["referrer-policy"] || "Header tidak ada", "Gunakan Referrer-Policy seperti strict-origin-when-cross-origin."),
    check("sec-permissions", "security", "Permissions Policy", headers["permissions-policy"] ? "pass" : "warn", 7, headers["permissions-policy"] ? "Policy aktif" : "Header tidak ada", "Batasi kamera, mikrofon, geolocation, dan fitur sensitif lain."),
    check("sec-mixed", "security", "Mixed content", metrics.mixedContent === 0 ? "pass" : "fail", 12, `${metrics.mixedContent} referensi HTTP pada halaman HTTPS`, "Ubah seluruh asset dan action menjadi HTTPS."),
    check("sec-cookies", "security", "Cookie flags", cookiesGood ? "pass" : "warn", 9, cookieRows.length ? `${cookieRows.length} cookie diperiksa tanpa membuka nilainya` : "Tidak ada Set-Cookie pada respons", "Cookie sesi sebaiknya memakai Secure, HttpOnly, dan SameSite."),
    check("sec-coop", "security", "Cross-origin isolation", headers["cross-origin-opener-policy"] ? "pass" : "warn", 6, headers["cross-origin-opener-policy"] || "COOP tidak ada", "Pertimbangkan Cross-Origin-Opener-Policy untuk membatasi kontrol window lintas origin."),

    check("perf-latency", "performance", "Waktu respons server", page.responseTimeMs <= 800 ? "pass" : page.responseTimeMs <= 2_000 ? "warn" : "fail", 20, `${page.responseTimeMs} ms`, "Optimalkan TTFB, cache, database, dan lokasi server."),
    check("perf-html", "performance", "Ukuran dokumen HTML", metrics.htmlBytes <= 200_000 ? "pass" : metrics.htmlBytes <= 500_000 ? "warn" : "fail", 15, `${Math.round(metrics.htmlBytes / 1024)} KB${metrics.htmlTruncated ? "+ (dipotong untuk keamanan)" : ""}`, "Kurangi markup, data inline, dan payload HTML awal."),
    check("perf-dom", "performance", "Kompleksitas DOM", metrics.domNodes <= 1_200 ? "pass" : metrics.domNodes <= 2_500 ? "warn" : "fail", 12, `${metrics.domNodes} node`, "Pecah komponen besar dan hapus wrapper/elemen yang tidak diperlukan."),
    check("perf-script", "performance", "Jumlah script", metrics.scripts <= 15 ? "pass" : metrics.scripts <= 30 ? "warn" : "fail", 12, `${metrics.scripts} script`, "Gabungkan atau lazy-load script non-kritis."),
    check("perf-blocking", "performance", "Render-blocking script", metrics.renderBlockingScripts === 0 ? "pass" : metrics.renderBlockingScripts <= 2 ? "warn" : "fail", 15, `${metrics.renderBlockingScripts} script blocking`, "Gunakan defer, async, module, atau pindahkan script non-kritis."),
    check("perf-style", "performance", "Stylesheet request", metrics.stylesheets <= 8 ? "pass" : metrics.stylesheets <= 16 ? "warn" : "fail", 10, `${metrics.stylesheets} stylesheet`, "Kurangi chain CSS dan muat CSS non-kritis secara bertahap."),
    check("perf-lazy", "performance", "Lazy loading gambar", metrics.images <= 2 || lazyRatio >= 0.6 ? "pass" : lazyRatio >= 0.25 ? "warn" : "fail", 10, `${metrics.lazyImages}/${metrics.images} gambar lazy`, "Tambahkan loading=lazy pada gambar di bawah fold."),
    check("perf-inline", "performance", "Payload inline", metrics.inlineScriptBytes + metrics.inlineStyleBytes <= 50_000 ? "pass" : metrics.inlineScriptBytes + metrics.inlineStyleBytes <= 150_000 ? "warn" : "fail", 6, `${Math.round((metrics.inlineScriptBytes + metrics.inlineStyleBytes) / 1024)} KB inline`, "Pindahkan kode inline besar ke asset cacheable."),

    check("a11y-lang", "accessibility", "Bahasa dokumen", meta.lang ? "pass" : "fail", 15, meta.lang || "Atribut lang tidak ada", "Tambahkan atribut lang pada elemen html."),
    check("a11y-viewport", "accessibility", "Mobile viewport", /width\s*=\s*device-width/i.test(meta.viewport) ? "pass" : meta.viewport ? "warn" : "fail", 12, meta.viewport || "Viewport tidak ada", "Gunakan meta viewport width=device-width, initial-scale=1."),
    check("a11y-alt", "accessibility", "Alternatif teks gambar", imageAltRatio >= 0.95 ? "pass" : imageAltRatio >= 0.7 ? "warn" : "fail", 22, `${metrics.imagesWithAlt}/${metrics.images} gambar memiliki alt`, "Tambahkan alt informatif atau alt kosong untuk gambar dekoratif."),
    check("a11y-label", "accessibility", "Label kontrol form", labelRatio >= 0.95 ? "pass" : labelRatio >= 0.7 ? "warn" : "fail", 22, `${metrics.labeledControls}/${metrics.formControls} kontrol terlabel`, "Hubungkan label dengan for/id atau gunakan aria-label yang bermakna."),
    check("a11y-button", "accessibility", "Nama tombol", buttonRatio >= 0.95 ? "pass" : buttonRatio >= 0.7 ? "warn" : "fail", 18, `${metrics.namedButtons}/${metrics.buttons} tombol memiliki nama`, "Pastikan tombol ikon memiliki aria-label."),
    check("a11y-heading", "accessibility", "Hierarki heading", metrics.h1 >= 1 && Object.values(metrics.headingCounts).reduce((sum, value) => sum + value, 0) >= 2 ? "pass" : "warn", 7, Object.entries(metrics.headingCounts).map(([key, value]) => `${key.toUpperCase()}:${value}`).join(" · "), "Gunakan urutan heading yang menjelaskan struktur konten."),
    check("a11y-skip", "accessibility", "Skip navigation", metrics.skipLink ? "pass" : "warn", 4, metrics.skipLink ? "Skip link terdeteksi" : "Skip link tidak terdeteksi", "Tambahkan link lompat ke konten utama untuk pengguna keyboard."),

    check("bp-redirect", "bestPractices", "Redirect chain", page.redirects.length === 0 ? "pass" : page.redirects.length <= 1 ? "warn" : "fail", 15, `${page.redirects.length} redirect`, "Arahkan link langsung ke URL final."),
    check("bp-charset", "bestPractices", "Character encoding", /utf-?8/i.test(meta.charset) ? "pass" : meta.charset ? "warn" : "fail", 12, meta.charset || "Charset tidak ditemukan", "Deklarasikan UTF-8 di awal head dan Content-Type."),
    check("bp-favicon", "bestPractices", "Favicon", meta.favicon ? "pass" : "warn", 8, meta.favicon ? "Icon terdeteksi" : "Icon tidak terdeteksi", "Tambahkan link rel=icon."),
    check("bp-external", "bestPractices", "External tab isolation", data.links.unsafeBlank === 0 ? "pass" : "warn", 12, `${data.links.unsafeBlank} link target=_blank tanpa noopener`, "Tambahkan rel=noopener pada link target=_blank."),
    check("bp-form", "bestPractices", "Form transport", metrics.insecureForms === 0 ? "pass" : "fail", 15, `${metrics.insecureForms} form action tidak aman`, "Kirim form sensitif hanya melalui HTTPS."),
    check("bp-deprecated", "bestPractices", "HTML modern", metrics.deprecatedTags === 0 ? "pass" : "warn", 10, `${metrics.deprecatedTags} tag deprecated`, "Ganti tag presentasional lama dengan HTML semantik dan CSS."),
    check("bp-content-type", "bestPractices", "Content type", /text\/html|application\/xhtml\+xml/i.test(headers["content-type"] || "") ? "pass" : "warn", 13, headers["content-type"] || "Content-Type tidak ada", "Kirim dokumen dengan Content-Type HTML dan charset yang benar."),
    check("bp-server", "bestPractices", "Server disclosure", headers["x-powered-by"] ? "warn" : "pass", 8, headers["x-powered-by"] ? "X-Powered-By terekspos" : "Tidak ada X-Powered-By", "Hapus header yang membuka detail runtime bila tidak diperlukan."),
    check("bp-truncate", "bestPractices", "Kelengkapan scan HTML", page.truncated ? "warn" : "pass", 7, page.truncated ? `Analisis dibatasi ${MAX_HTML_BYTES / 1000} KB` : "Dokumen dianalisis penuh", "Kurangi ukuran HTML bila dokumen melampaui batas scanner.")
  ];
  if (page.tls) {
    const tlsDays = finite(page.tls.daysRemaining);
    rows.push(check("sec-tls-expiry", "security", "TLS certificate lifetime", page.tls.authorized === false || (tlsDays !== null && tlsDays <= 0) ? "fail" : tlsDays !== null && tlsDays < 30 ? "warn" : "pass", 10, tlsDays !== null ? `${tlsDays} hari tersisa · ${page.tls.protocol || "TLS"}` : (page.tls.protocol || "TLS certificate terdeteksi"), "Perbarui sertifikat sebelum kedaluwarsa dan gunakan konfigurasi TLS modern."));
  }
  return rows;
}

function scoreChecks(checks) {
  const factor = { pass: 1, warn: 0.5, fail: 0 };
  const categoryNames = ["seo", "security", "performance", "accessibility", "bestPractices"];
  const scores = {};
  for (const category of categoryNames) {
    const rows = checks.filter((row) => row.category === category);
    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    scores[category] = total ? Math.round(rows.reduce((sum, row) => sum + row.weight * factor[row.status], 0) / total * 100) : null;
  }
  scores.overall = Math.round(scores.seo * 0.2 + scores.security * 0.3 + scores.performance * 0.2 + scores.accessibility * 0.18 + scores.bestPractices * 0.12);
  scores.grade = scores.overall >= 95 ? "A+" : scores.overall >= 90 ? "A" : scores.overall >= 82 ? "B+" : scores.overall >= 75 ? "B" : scores.overall >= 65 ? "C" : scores.overall >= 50 ? "D" : "F";
  return scores;
}

function securityHeaders(headers) {
  const names = ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy"];
  return names.map((name) => ({ name, present: Boolean(headers[name]), value: headers[name] ? safeText(headers[name], 350) : null }));
}

function recommendations(checks) {
  const priority = { fail: 0, warn: 1, pass: 2 };
  return checks.filter((row) => row.status !== "pass").sort((a, b) => priority[a.status] - priority[b.status] || (b.weight - a.weight)).slice(0, 14).map((row) => ({
    id: row.id, category: row.category, priority: row.status === "fail" ? (row.category === "security" ? "critical" : "high") : "medium",
    title: row.title, evidence: row.evidence, action: row.fix
  }));
}

async function fixedJsonFetch(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store", redirect: "follow" });
    if (!response.ok) throw Object.assign(new Error(`HTTP_${response.status}`), { code: `HTTP_${response.status}` });
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function readPageSpeed(target) {
  const key = String(process.env.GOOGLE_PAGESPEED_API_KEY || "").trim();
  const url = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
  url.searchParams.set("url", target);
  url.searchParams.set("strategy", "mobile");
  url.searchParams.set("locale", "id");
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) url.searchParams.append("category", category);
  if (key) url.searchParams.set("key", key);
  try {
    const payload = await fixedJsonFetch(url, { method: "GET", headers: { Accept: "application/json", "User-Agent": "Nexora-Web-Intelligence/1.0" } }, 28_000);
    const result = payload?.lighthouseResult || {};
    const categories = result.categories || {};
    const audits = result.audits || {};
    const categoryScore = (name) => finite(categories[name]?.score) === null ? null : Math.round(Number(categories[name].score) * 100);
    const metric = (name) => ({ value: finite(audits[name]?.numericValue), display: safeText(audits[name]?.displayValue, 100) || null });
    const opportunities = Object.values(audits).filter((audit) => finite(audit?.score) !== null && audit.score < 0.9 && !["manual", "notApplicable", "informative"].includes(audit.scoreDisplayMode)).sort((a, b) => (finite(a.score) ?? 1) - (finite(b.score) ?? 1)).slice(0, 8).map((audit) => ({ title: safeText(audit.title, 180), display: safeText(audit.displayValue || audit.explanation, 240), score: Math.round(Number(audit.score) * 100) }));
    return {
      available: true, keyConfigured: Boolean(key), strategy: "mobile", version: safeText(result.lighthouseVersion, 40), fetchedAt: result.fetchTime || payload.analysisUTCTimestamp || null,
      scores: { performance: categoryScore("performance"), accessibility: categoryScore("accessibility"), bestPractices: categoryScore("best-practices"), seo: categoryScore("seo") },
      metrics: { fcp: metric("first-contentful-paint"), lcp: metric("largest-contentful-paint"), speedIndex: metric("speed-index"), tbt: metric("total-blocking-time"), cls: metric("cumulative-layout-shift") },
      opportunities
    };
  } catch (error) {
    return { available: false, keyConfigured: Boolean(key), error: "PAGESPEED_UNAVAILABLE", reason: safeText(error?.code || error?.name || "REQUEST_FAILED", 60) };
  }
}

async function readSafeBrowsing(target) {
  const key = String(process.env.GOOGLE_SAFE_BROWSING_API_KEY || "").trim();
  if (!key) return { configured: false, status: "not-configured", matches: [] };
  const url = new URL("https://safebrowsing.googleapis.com/v4/threatMatches:find");
  url.searchParams.set("key", key);
  try {
    const payload = await fixedJsonFetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Nexora-Web-Intelligence/1.0" },
      body: JSON.stringify({ client: { clientId: "nexora-web-intelligence", clientVersion: "1.0" }, threatInfo: { threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"], platformTypes: ["ANY_PLATFORM"], threatEntryTypes: ["URL"], threatEntries: [{ url: target }] } })
    }, 9_000);
    const matches = (Array.isArray(payload?.matches) ? payload.matches : []).map((row) => safeText(row?.threatType, 80)).filter(Boolean);
    return { configured: true, status: matches.length ? "flagged" : "no-match", matches: [...new Set(matches)] };
  } catch (error) {
    return { configured: true, status: "unavailable", matches: [], error: safeText(error?.code || error?.name || "REQUEST_FAILED", 60) };
  }
}

async function scanWebsite(target, mode = "standard", options = {}) {
  const normalized = normalizeInput(target);
  await assertPublicUrl(normalized, options);
  const deepPromise = mode === "deep" ? Promise.all([readPageSpeed(normalized), readSafeBrowsing(normalized)]) : Promise.resolve([null, null]);
  const page = await readSafePage(normalized, options);
  const contentType = page.headers["content-type"] || "";
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) throw Object.assign(new Error("Target tidak mengembalikan dokumen HTML."), { status: 422, code: "TARGET_NOT_HTML" });
  const data = analyzeHtml(page.body, page.finalUrl, page);
  const checks = buildChecks({ page, data });
  const [lighthouse, reputation] = await deepPromise;
  if (reputation?.configured) {
    checks.push(check("sec-reputation", "security", "Threat-list reputation", reputation.status === "flagged" ? "fail" : reputation.status === "no-match" ? "pass" : "warn", 20, reputation.status === "flagged" ? `Google Safe Browsing match: ${reputation.matches.join(", ")}` : reputation.status === "no-match" ? "Tidak ada match pada daftar ancaman saat scan" : "Provider reputasi sedang tidak tersedia", "Jika terdeteksi, hentikan distribusi URL, audit source/dependency, bersihkan kompromi, lalu ajukan review keamanan."));
  }
  const scores = scoreChecks(checks);
  const failed = checks.filter((row) => row.status === "fail").length;
  const warnings = checks.filter((row) => row.status === "warn").length;
  return {
    ok: true,
    version: 1,
    mode,
    requestedUrl: normalized,
    finalUrl: page.finalUrl,
    host: new URL(page.finalUrl).hostname,
    scannedAt: new Date().toISOString(),
    response: { status: page.status, statusText: safeText(page.statusText, 80), responseTimeMs: page.responseTimeMs, redirects: page.redirects, contentType: safeText(contentType, 160), htmlBytes: page.bytes, truncated: page.truncated },
    scores,
    verdict: { level: scores.overall >= 85 ? "strong" : scores.overall >= 70 ? "good" : scores.overall >= 50 ? "needs-work" : "high-risk", passed: checks.length - failed - warnings, warnings, failed },
    page: data.page,
    metrics: data.metrics,
    links: data.links,
    technologies: data.technologies,
    trackers: data.trackers,
    security: { headers: securityHeaders(page.headers), tls: page.tls, dns: page.addresses, reputation },
    checks,
    recommendations: recommendations(checks),
    lighthouse
  };
}

async function readBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > MAX_BODY_BYTES) throw Object.assign(new Error("Payload terlalu besar."), { status: 413, code: "PAYLOAD_TOO_LARGE" });
    return JSON.parse(request.body || "{}");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Payload terlalu besar."), { status: 413, code: "PAYLOAD_TOO_LARGE" });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function clientIp(request) {
  return String(request.headers?.["x-forwarded-for"] || request.headers?.["x-real-ip"] || request.socket?.remoteAddress || "unknown").split(",")[0].trim().slice(0, 80);
}

function takeRateSlot(request) {
  const now = Date.now();
  const key = clientIp(request);
  const row = visitors.get(key);
  if (!row || now - row.startedAt >= RATE_WINDOW_MS) { visitors.set(key, { startedAt: now, count: 1 }); return { allowed: true, remaining: RATE_LIMIT - 1, retryAfter: 0 }; }
  row.count += 1;
  return { allowed: row.count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - row.count), retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - row.startedAt)) / 1000)) };
}

function send(response, status, payload, headOnly = false) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status);
  return headOnly ? response.end() : response.json(payload);
}

async function handleWebIntelligence(request, response, requestUrl) {
  if ((request.method === "GET" || request.method === "HEAD") && requestUrl.searchParams.get("health") === "1") {
    return send(response, 200, { ok: true, status: "ready", engine: "nexora-web-intelligence", deepScan: true, pageSpeedKeyConfigured: Boolean(String(process.env.GOOGLE_PAGESPEED_API_KEY || "").trim()), safeBrowsingKeyConfigured: Boolean(String(process.env.GOOGLE_SAFE_BROWSING_API_KEY || "").trim()) }, request.method === "HEAD");
  }
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
    return response.status(204).end();
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  const rate = takeRateSlot(request);
  response.setHeader("X-RateLimit-Limit", String(RATE_LIMIT));
  response.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    return send(response, 429, { ok: false, error: "WEB_INTEL_RATE_LIMITED", message: "Batas scan perangkat ini tercapai. Coba lagi sebentar.", retryAfter: rate.retryAfter });
  }
  try {
    const body = await readBody(request);
    const mode = body?.mode === "deep" ? "deep" : "standard";
    const normalized = normalizeInput(body?.url);
    const cacheKey = `${mode}:${normalized}`;
    const cacheMs = positiveInteger(process.env.WEB_INTEL_CACHE_MS, DEFAULT_CACHE_MS, 15 * 60_000);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < cacheMs) return send(response, 200, { ...cached.payload, cache: { hit: true, ttlMs: cacheMs } });
    if (!inFlight.has(cacheKey)) inFlight.set(cacheKey, scanWebsite(normalized, mode).finally(() => inFlight.delete(cacheKey)));
    const payload = await inFlight.get(cacheKey);
    cache.set(cacheKey, { payload, savedAt: Date.now() });
    return send(response, 200, { ...payload, cache: { hit: false, ttlMs: cacheMs } });
  } catch (error) {
    const code = error?.code || (error instanceof SyntaxError ? "INVALID_JSON" : "WEB_INTELLIGENCE_FAILED");
    const clientError = /INVALID|UNSUPPORTED|BLOCKED|PRIVATE|PORT|URL_TOO_LONG/.test(code);
    const status = error?.status || (error instanceof SyntaxError || clientError ? 400 : 502);
    if (status >= 500) console.error("[web-intelligence]", code);
    return send(response, status, { ok: false, error: code, message: status >= 500 ? "Website belum dapat dianalisis. Periksa URL atau coba kembali." : safeText(error?.message || "Permintaan tidak valid.", 300) });
  }
}

function resetWebIntelligenceState() { cache.clear(); inFlight.clear(); visitors.clear(); }

module.exports = { analyzeHtml, buildChecks, handleWebIntelligence, normalizeInput, readSafePage, resetWebIntelligenceState, scanWebsite, scoreChecks };

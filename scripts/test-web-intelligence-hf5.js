const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  analyzeHtml,
  normalizeInput,
  resetWebIntelligenceState,
  scanWebsite
} = require("../lib/web-intelligence");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function responseCapture() {
  const captured = { headers: {} };
  return {
    captured,
    response: {
      setHeader(name, value) { captured.headers[name] = value; },
      status(code) { captured.status = code; return this; },
      json(payload) { captured.payload = payload; return payload; },
      end() { captured.ended = true; }
    }
  };
}

async function main() {
  resetWebIntelligenceState();
  assert.equal(normalizeInput("example.com/path"), "https://example.com/path");
  assert.throws(() => normalizeInput("http://127.0.0.1/admin"), /privat|reserved/i);
  assert.throws(() => normalizeInput("file:///etc/passwd"), /HTTP dan HTTPS/i);

  const html = `<!doctype html>
  <html lang="id"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Nexora Intelligence Sample Website Report</title>
    <meta name="description" content="Website contoh untuk menguji audit SEO, keamanan, performa, aksesibilitas, teknologi, dan kualitas halaman secara menyeluruh.">
    <meta property="og:title" content="Nexora Sample"><meta property="og:image" content="https://example.com/cover.jpg">
    <link rel="canonical" href="https://www.example.com/final"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/style.css">
    <script id="__NEXT_DATA__" type="application/json">{}</script><script src="/_next/app.js" defer></script>
    <script async src="https://www.googletagmanager.com/gtag/js"></script><script type="application/ld+json">{"@type":"WebSite"}</script>
  </head><body><a href="#main">Skip</a><main id="main"><h1>Nexora Sample</h1><h2>Audit</h2>
    <img src="/cover.jpg" alt="Cover Nexora"><img src="/detail.jpg" alt="" loading="lazy">
    <form action="/search"><label for="q">Cari</label><input id="q"><button type="submit">Cari website</button></form>
    <a href="/about">About</a><a href="https://github.com/nexora" target="_blank" rel="noopener">GitHub</a>
  </main></body></html>`;

  const calls = [];
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    if (url === "https://example.com/") return new Response("", { status: 301, headers: { location: "https://www.example.com/final" } });
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "camera=(), microphone=(), geolocation=()",
        "cross-origin-opener-policy": "same-origin",
        "x-vercel-id": "sin1::test",
        "set-cookie": "session=test; Secure; HttpOnly; SameSite=Lax"
      }
    });
  };

  const scan = await scanWebsite("https://example.com", "standard", {
    lookup,
    fetchImpl,
    timeoutMs: 2_000,
    tls: { authorized: true, protocol: "TLSv1.3", subject: "www.example.com", issuer: "Test CA", validTo: "Dec 31 2030 GMT", daysRemaining: 1000 }
  });
  assert.equal(scan.ok, true);
  assert.equal(scan.finalUrl, "https://www.example.com/final");
  assert.equal(scan.response.redirects.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(scan.page.lang, "id");
  assert.equal(scan.page.jsonLd, 1);
  assert.equal(scan.metrics.imagesWithAlt, 2);
  assert.equal(scan.links.internal, 1);
  assert.equal(scan.links.external, 1);
  assert.ok(scan.technologies.some((row) => row.name === "Next.js"));
  assert.ok(scan.technologies.some((row) => row.name === "Vercel"));
  assert.ok(scan.trackers.some((row) => row.name === "Google Analytics"));
  assert.equal(scan.checks.find((row) => row.id === "sec-csp").status, "pass");
  assert.equal(scan.checks.find((row) => row.id === "sec-hsts").status, "pass");
  assert.ok(scan.scores.overall >= 70 && scan.scores.overall <= 100);
  assert.ok(Array.isArray(scan.recommendations));

  const originalGlobalFetch = global.fetch;
  const originalPageSpeedKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const originalSafeBrowsingKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  try {
    process.env.GOOGLE_PAGESPEED_API_KEY = "psi_test_secret";
    process.env.GOOGLE_SAFE_BROWSING_API_KEY = "safe_test_secret";
    global.fetch = async (input, options) => {
      const url = new URL(String(input));
      if (url.hostname === "pagespeedonline.googleapis.com") {
        assert.equal(url.searchParams.get("key"), "psi_test_secret");
        assert.equal(url.searchParams.get("strategy"), "mobile");
        return new Response(JSON.stringify({ lighthouseResult: {
          lighthouseVersion: "12.8.0", fetchTime: new Date().toISOString(),
          categories: { performance: { score: 0.82 }, accessibility: { score: 0.91 }, "best-practices": { score: 0.79 }, seo: { score: 0.94 } },
          audits: { "first-contentful-paint": { numericValue: 1200, displayValue: "1.2 s", score: 0.9 }, "largest-contentful-paint": { numericValue: 2500, displayValue: "2.5 s", score: 0.7 }, "total-blocking-time": { numericValue: 150, displayValue: "150 ms", score: 0.85 } }
        } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.hostname === "safebrowsing.googleapis.com") {
        assert.equal(url.searchParams.get("key"), "safe_test_secret");
        assert.equal(options.method, "POST");
        return new Response(JSON.stringify({ matches: [{ threatType: "MALWARE" }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("Unexpected fixed provider " + url.hostname);
    };
    const deep = await scanWebsite("https://example.com", "deep", { lookup, fetchImpl, timeoutMs: 2_000 });
    assert.equal(deep.lighthouse.available, true);
    assert.equal(deep.lighthouse.scores.performance, 82);
    assert.equal(deep.security.reputation.status, "flagged");
    assert.equal(deep.checks.find((row) => row.id === "sec-reputation").status, "fail");
    assert.ok(deep.scores.security < scan.scores.security, "Threat match harus menurunkan security score");
    assert.ok(!JSON.stringify(deep).includes("psi_test_secret"));
    assert.ok(!JSON.stringify(deep).includes("safe_test_secret"));
  } finally {
    global.fetch = originalGlobalFetch;
    if (originalPageSpeedKey === undefined) delete process.env.GOOGLE_PAGESPEED_API_KEY; else process.env.GOOGLE_PAGESPEED_API_KEY = originalPageSpeedKey;
    if (originalSafeBrowsingKey === undefined) delete process.env.GOOGLE_SAFE_BROWSING_API_KEY; else process.env.GOOGLE_SAFE_BROWSING_API_KEY = originalSafeBrowsingKey;
  }

  const rawAnalysis = analyzeHtml('<html><head><title>X</title></head><body><img src="x"><a target="_blank" href="https://outside.example/x">X</a></body></html>', "https://example.com", {
    finalUrl: "https://example.com", bytes: 120, truncated: false, headers: {}
  });
  assert.equal(rawAnalysis.metrics.imagesWithAlt, 0);
  assert.equal(rawAnalysis.links.unsafeBlank, 1);

  const database = require("../lib/database");
  const originalDatabaseRequest = database.databaseRequest;
  database.databaseRequest = async (resource, options) => resource.startsWith("tools?select=access_level")
    ? [{ access_level: "free" }]
    : originalDatabaseRequest(resource, options);
  delete require.cache[require.resolve("../lib/account-membership")];
  delete require.cache[require.resolve("../api/audit")];
  const handler = require("../api/audit");
  const health = responseCapture();
  await handler({ method: "GET", url: "/api/audit?mode=web-intelligence&health=1", headers: {}, socket: {} }, health.response);
  assert.equal(health.captured.status, 200);
  assert.equal(health.captured.payload.engine, "nexora-web-intelligence");
  assert.equal(health.captured.payload.engineVersion, "1.0.1");

  const invalid = responseCapture();
  await handler({ method: "POST", url: "/api/audit?mode=web-intelligence", headers: { "x-forwarded-for": "203.0.113.77" }, body: { url: "http://127.0.0.1", mode: "standard" }, socket: {} }, invalid.response);
  database.databaseRequest = originalDatabaseRequest;
  assert.equal(invalid.captured.status, 400);
  assert.match(invalid.captured.payload.error, /PRIVATE_IP_BLOCKED/);

  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some((row) => row.source === "/api/web-intelligence" && row.destination.includes("mode=web-intelligence")));
  const routeManifest = JSON.parse(read("route-manifest.json"));
  assert.ok(routeManifest.apiRoutes.includes("/api/web-intelligence"));
  const moduleManifest = JSON.parse(read("assets/module-manifest.json"));
  assert.equal(moduleManifest.tools.webintel, "web-intelligence");
  for (const asset of [...moduleManifest.modules["web-intelligence"].css, ...moduleManifest.modules["web-intelligence"].js]) assert.ok(fs.existsSync(path.join(root, asset)));
  const ui = read("assets/js/features/web-intelligence.js");
  for (const token of ["renderWebIntelligence", "Evidence Scoring", "/api/web-intelligence", "drawRadar", "htmlReport", "Deep Intelligence", "body.__nxCleanup"]) assert.ok(ui.includes(token), `UI kehilangan ${token}`);
  const css = read("assets/css/features/web-intelligence.css");
  for (const token of ["nwi-score-ring", "nwi-radar-wrap", "@media(max-width:480px)", "prefers-reduced-motion"]) assert.ok(css.includes(token));
  const backend = read("lib/web-intelligence.js");
  for (const token of ["assertPublicUrl", "requestPinnedPage", "createPinnedLookup", "autoSelectFamily: false", "GOOGLE_PAGESPEED_API_KEY", "GOOGLE_SAFE_BROWSING_API_KEY", "MAX_HTML_BYTES"]) assert.ok(backend.includes(token));
  assert.ok(!ui.includes("GOOGLE_PAGESPEED_API_KEY"), "Nama/konfigurasi key tidak boleh diperlukan browser");
  assert.ok(read("database/migrations/009_nexora_web_intelligence.sql").includes("on conflict (id) do update"));

  const serverless = [];
  (function walk(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const target = path.join(directory, entry.name); if (entry.isDirectory()) walk(target); else if (target.endsWith(".js")) serverless.push(target); } })(path.join(root, "api"));
  assert.equal(serverless.length, 12);

  resetWebIntelligenceState();
  console.log("Web Intelligence HF5 tests lulus: SSRF/DNS pinning, redirect, evidence scoring, stack/tracker, security matrix, UI report, migration, dan 12-function limit aman.");
}

main().catch((error) => { console.error(error); process.exit(1); });

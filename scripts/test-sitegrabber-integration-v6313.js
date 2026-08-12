const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));
const vercel = JSON.parse(read("vercel.json"));
const api = read("api/tool-health.js");
const proxy = read("lib/sitegrabber-proxy.js");
const getCode = read("assets/js/features/get-code.js");
const css = read("assets/css/features/get-code.css");
const env = read(".env.example");

assert.equal(pkg.version, "6.3.17");
assert.ok(vercel.rewrites.some((r) => r.source === "/api/sitegrabber" && /mode=sitegrabber/.test(r.destination)));
assert.match(api, /handleSiteGrabber/);
assert.match(proxy, /SITEGRABBER_API_BASE_URL/);
assert.match(proxy, /SITEGRABBER_API_KEY/);
assert.match(proxy, /Authorization: `Bearer \$\{cfg\.apiKey\}`/);
assert.match(proxy, /CAPTURE_CONSENT_REQUIRED/);
assert.match(proxy, /full-website/);
assert.match(proxy, /asset-collector/);
assert.match(proxy, /MAX_CAPTURES_PER_WINDOW/);
assert.match(getCode, /SITEGRABBER_ENDPOINT="\/api\/sitegrabber"/);
assert.match(getCode, /Capture via SiteGrabber X/);
assert.match(getCode, /siteGrabberJobId/);
assert.match(getCode, /action=job/);
assert.match(getCode, /action=report/);
assert.match(getCode, /report-download/);
assert.match(css, /\.nxgc-sgx/);
assert.match(env, /SITEGRABBER_API_BASE_URL=/);
assert.match(env, /SITEGRABBER_API_KEY=sgx_live_your_server_only_key/);

for (const file of ["index.html", "assets/js/features/get-code.js", "assets/css/features/get-code.css", "assets/js/core/app.js"]) {
  const source = read(file);
  assert.equal(/sgx_live_(?!your_server_only_key)[A-Za-z0-9_-]{10,}/.test(source), false, `${file} must not expose a raw SiteGrabber API key`);
}

console.log("Nexora v6.3.17 tests lulus: SiteGrabber-X API key server-side, capture polling, report, dan ZIP download aktif.");

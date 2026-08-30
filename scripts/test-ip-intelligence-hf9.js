"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { getTool } = require("./config-test-helpers.js");

function text(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }

const feature = text("assets/js/features/ip-intelligence.js");
const css = text("assets/css/features/ip-intelligence.css");
const app = text("assets/js/core/app.js");
const shell = text("assets/js/core/shell.js");
const vercel = JSON.parse(text("vercel.json"));
const modules = JSON.parse(text("assets/module-manifest.json"));
const routes = JSON.parse(text("route-manifest.json"));

assert.match(feature, /window\.renderIpIntelligence\s*=/);
assert.match(feature, /\/api\/ip-intelligence\?/);
assert.match(feature, /IPINFO LITE/);
assert.ok(css.includes(".nip-hero"));
assert.ok(app.includes("case 'ipintel': renderIpIntelligence(body); break;"));
assert.ok(shell.includes("ipintel:{renderer:'renderIpIntelligence'"));
assert.equal(getTool("ipintel").name, "IP & ASN Intelligence");
assert.equal(getTool("ipintel").runtime.module, "ip-intelligence");
assert.equal(modules.tools.ipintel, "ip-intelligence");
assert.deepEqual(modules.modules["ip-intelligence"].js, ["assets/js/features/ip-intelligence.js"]);
assert.ok(routes.apiRoutes.includes("/api/ip-intelligence"));
assert.ok(vercel.rewrites.some((row) => row.source === "/api/ip-intelligence" && /mode=ip-intelligence/.test(row.destination)));
assert.match(text(".env.example"), /^IPINFO_TOKEN=/m);
assert.match(text("api/tool-health.js"), /handleIpIntelligence/);
assert.equal(getTool("ipintel").health.path, "/api/ip-intelligence?health=1");
assert.match(text("lib/public-database.js"), /BUILTIN_TOOL_SEEDS/);
assert.match(text("lib/public-database.js"), /resolution=ignore-duplicates/);
assert.match(text("database/migrations/019_ipinfo_intelligence.sql"), /'ipintel'/);

const lib = require(path.join(root, "lib/ipinfo-intelligence.js"));
assert.equal(lib.normalizedIp("8.8.8.8"), "8.8.8.8");
assert.equal(lib.normalizedIp("2001:4860:4860::8888"), "2001:4860:4860::8888");
assert.equal(lib.normalizedIp("not-an-ip"), "");
assert.equal(lib.normalizedIp("::ffff:8.8.4.4"), "8.8.4.4");
assert.deepEqual(lib.normalizePayload({
  ip: "8.8.8.8", asn: "AS15169", as_name: "Google LLC", as_domain: "google.com",
  country_code: "US", country: "United States", continent_code: "NA", continent: "North America"
}, "8.8.8.8"), {
  ip: "8.8.8.8", version: "IPv4", bogon: false, asn: "AS15169", asName: "Google LLC",
  asDomain: "google.com", countryCode: "US", country: "United States", continentCode: "NA",
  continent: "North America", routable: true, provider: "IPinfo Lite"
});

const previousFetch = global.fetch;
const previousToken = process.env.IPINFO_TOKEN;
process.env.IPINFO_TOKEN = "test_token_123";
let seenAuth = "";
global.fetch = async (url, options) => {
  seenAuth = options.headers.Authorization;
  assert.equal(url, "https://api.ipinfo.io/lite/1.1.1.1");
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ip:"1.1.1.1",asn:"AS13335",as_name:"Cloudflare, Inc.",as_domain:"cloudflare.com",country_code:"AU",country:"Australia",continent_code:"OC",continent:"Oceania"})
  };
};

function mockResponse() {
  return {
    statusCode: 0, payload: null, headers: {},
    setHeader(k,v){ this.headers[k]=v; },
    status(code){ this.statusCode=code; return this; },
    json(payload){ this.payload=payload; return this; },
    end(){ return this; }
  };
}

(async () => {
  const response = mockResponse();
  await lib.handleIpIntelligence({method:"GET",headers:{},socket:{remoteAddress:"127.0.0.1"}}, response, new URL("https://nexora.test/api/ip-intelligence?ip=1.1.1.1"));
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.data.asn, "AS13335");
  assert.equal(seenAuth, "Bearer test_token_123");

  const invalid = mockResponse();
  await lib.handleIpIntelligence({method:"GET",headers:{},socket:{}}, invalid, new URL("https://nexora.test/api/ip-intelligence?ip=hello"));
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.payload.error, "INVALID_IP");

  global.fetch = previousFetch;
  if (previousToken === undefined) delete process.env.IPINFO_TOKEN; else process.env.IPINFO_TOKEN = previousToken;
  console.log("IP & ASN Intelligence HF9 regression: OK");
})().catch((error) => {
  global.fetch = previousFetch;
  if (previousToken === undefined) delete process.env.IPINFO_TOKEN; else process.env.IPINFO_TOKEN = previousToken;
  console.error(error);
  process.exit(1);
});

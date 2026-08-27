"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const genmail = require(path.join(root, "lib/genmail.js"));

function responsePayload(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[String(name).toLowerCase()] || null; } },
    text: async () => typeof payload === "string" ? payload : JSON.stringify(payload)
  };
}

function mockResponse() {
  return {
    statusCode: 0, payload: null, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; }
  };
}

async function invoke(query, fetchImpl, method = "GET") {
  const response = mockResponse();
  const url = new URL("https://nexora.test/api/genmail?mode=genmail&" + query);
  await genmail.handleGenMail({ method, headers: {} }, response, url, { fetch: fetchImpl });
  return response;
}

const frontend = read("assets/js/features/genmail.js");
const css = read("assets/css/features/genmail.css");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const registry = read("assets/js/core/tool-registry.js");
const proxyEntry = read("api/tool-health.js");
const envExample = read(".env.example");
const readme = read("README.md");
const manifest = JSON.parse(read("assets/module-manifest.json"));
const routes = JSON.parse(read("route-manifest.json"));
const vercel = JSON.parse(read("vercel.json"));

assert.equal(genmail.UPSTREAM_URL, "https://sylvatica.my.id/api/tools/genmail");
assert.deepEqual([...genmail.ACTIONS], ["domains", "generate", "inbox", "message"]);
assert.deepEqual(manifest.modules.genmail, { css: ["assets/css/features/genmail.css"], js: ["assets/js/features/genmail.js"] });
assert.equal(manifest.tools.genmail, "genmail");
assert.ok(routes.apiRoutes.includes("/api/genmail"));
assert.ok(vercel.rewrites.some((row) => row.source === "/api/genmail" && row.destination === "/api/tool-health?mode=genmail"));
assert.match(proxyEntry, /handleGenMail/);
assert.match(app, /case 'genmail': renderGenMail\(body\); break;/);
assert.match(shell, /genmail:\{renderer:'renderGenMail'/);
assert.match(lazy, /genmail:'genmail'/);
assert.match(registry, /\["genmail","GenMail","api","genmail","renderGenMail"/);
assert.match(read("lib/tool-health.js"), /id: "genmail"/);
assert.match(read("database/schema.sql"), /'genmail'/);
assert.match(read("database/migrations/028_genmail.sql"), /'genmail'/);
assert.match(envExample, /^KURONEKO_API_KEY=$/m);
assert.match(readme, /https:\/\/all-tools-nexora\.vercel\.app\/#tool-genmail/);

assert.match(frontend, /window\.renderGenMail\s*=/);
assert.match(frontend, /new AbortController\(\)/);
assert.match(frontend, /visibilitychange/);
assert.match(frontend, /body\.__nxCleanup/);
assert.match(frontend, /sanitizeEmailHtml/);
assert.match(frontend, /script,iframe,object,embed/);
assert.doesNotMatch(frontend, /sylvatica\.my\.id|KURONEKO_API_KEY|localStorage|sessionStorage|setInterval\s*\(/i);
assert.doesNotMatch(css, /position\s*:\s*fixed|backdrop-filter/i);
assert.match(css, /max-width:520px/);
assert.match(css, /min-height:48px/);

assert.deepEqual(genmail.normalizeDomains({ status: true, result: { data: { domains: ["mail.one", { domain: "mail.two" }, "@MAIL.ONE"] } } }), ["mail.one", "mail.two"]);
assert.equal(genmail.normalizeGeneratedEmail({ status: true, data: { result: { address: "User@Mail.One" } } }), "User@mail.one");
assert.deepEqual(genmail.normalizeInbox({ result: { data: { messages: [{ from: "sender@example.com", title: "Kode masuk", created_at: "2026-08-27T10:00:00Z", snippet: "Kode kamu", id: "real-provider-id" }] } } }), [{ index: 0, sender: "sender@example.com", subject: "Kode masuk", time: "2026-08-27T10:00:00Z", preview: "Kode kamu", ref: "real-provider-id" }]);
const normalizedMessage = genmail.normalizeMessage({ data: { result: { from: "sender@example.com", subject: "Halo", html: '<p onclick="bad()">Buka <a href="javascript:bad()">ini</a></p><script>alert(1)</script>' } } });
assert.equal(normalizedMessage.sender, "sender@example.com");
assert.doesNotMatch(normalizedMessage.html, /script|onclick|javascript:/i);

const oldKey = process.env.KURONEKO_API_KEY;
const oldTimeout = process.env.KURONEKO_TIMEOUT_MS;
process.env.KURONEKO_API_KEY = "test_key_not_a_secret";

(async () => {
  genmail.resetGenMailCache();
  let domainCalls = 0;
  const domainFetch = async (url) => {
    domainCalls += 1;
    const target = new URL(url);
    assert.equal(target.origin + target.pathname, genmail.UPSTREAM_URL);
    assert.equal(target.searchParams.get("action"), "domains");
    assert.equal(target.searchParams.get("apikey"), "test_key_not_a_secret");
    assert.equal(target.searchParams.has("url"), false);
    return responsePayload({ status: true, result: { domains: ["mail.one", "mail.two"] } });
  };
  const domains = await invoke("action=domains", domainFetch);
  assert.equal(domains.statusCode, 200);
  assert.deepEqual(domains.payload.data.domains, ["mail.one", "mail.two"]);
  const cachedDomains = await invoke("action=domains", domainFetch);
  assert.equal(domainCalls, 1, "Daftar domain harus memakai cache sementara");
  assert.equal(cachedDomains.payload.meta.cached, true);

  genmail.resetGenMailCache();
  let generatedUrl = null;
  const generated = await invoke("action=generate&domain=mail.one", async (url) => {
    generatedUrl = new URL(url);
    return responsePayload({ status: true, data: { result: { email: "random@mail.one" } } });
  });
  assert.equal(generated.statusCode, 200);
  assert.equal(generated.payload.data.email, "random@mail.one");
  assert.equal(generatedUrl.searchParams.has("username"), false, "Username kosong tidak boleh diubah menjadi data palsu");

  const invalidDomain = await invoke("action=generate&domain=not-a-domain", async () => responsePayload({}));
  assert.equal(invalidDomain.statusCode, 400);
  assert.equal(invalidDomain.payload.error, "INVALID_DOMAIN");
  const invalidEmail = await invoke("action=inbox&email=wrong", async () => responsePayload({}));
  assert.equal(invalidEmail.statusCode, 400);
  const unknownAction = await invoke("action=delete&email=a@mail.one", async () => responsePayload({}));
  assert.equal(unknownAction.statusCode, 400);
  const injectedParam = await invoke("action=domains&url=https%3A%2F%2Fevil.example", async () => responsePayload({}));
  assert.equal(injectedParam.statusCode, 400);
  assert.equal(injectedParam.payload.error, "UNSUPPORTED_PARAMETER");
  const clientKey = await invoke("action=domains&apikey=stolen", async () => responsePayload({}));
  assert.equal(clientKey.statusCode, 400, "Browser tidak boleh memasukkan apikey sendiri");

  const emptyInbox = await invoke("action=inbox&email=random%40mail.one", async () => responsePayload({ status: true, result: { inbox: [] } }));
  assert.equal(emptyInbox.statusCode, 200);
  assert.deepEqual(emptyInbox.payload.data.messages, []);

  let messageUrl = null;
  const message = await invoke("action=message&email=random%40mail.one&link=provider-id-7", async (url) => {
    messageUrl = new URL(url);
    return responsePayload({ status: true, result: { data: { sender: "sender@example.com", subject: "Kode", text: "Kode asli 123", links: ["https://example.com/verify"] } } });
  });
  assert.equal(message.statusCode, 200);
  assert.equal(messageUrl.searchParams.get("link"), "provider-id-7");
  assert.equal(message.payload.data.message.text, "Kode asli 123");
  assert.deepEqual(message.payload.data.message.links, ["https://example.com/verify"]);

  const missingMessage = await invoke("action=message&email=random%40mail.one&link=gone", async () => responsePayload({ status: false, message: "not found" }, 404));
  assert.equal(missingMessage.statusCode, 404);
  assert.equal(missingMessage.payload.message, "Pesan yang dipilih sudah tidak tersedia.");

  const rateLimited = await invoke("action=inbox&email=random%40mail.one", async () => responsePayload({ status: false, message: "Daily limit reached" }, 429));
  assert.equal(rateLimited.statusCode, 429);
  assert.equal(rateLimited.payload.message, "Batas request sementara tercapai. Coba lagi nanti.");

  const badKey = await invoke("action=inbox&email=random%40mail.one", async () => responsePayload({ status: false, message: "invalid apikey secret-provider-detail" }, 403));
  assert.equal(badKey.statusCode, 503);
  assert.equal(badKey.payload.error, "GENMAIL_CONFIGURATION_ERROR");
  assert.doesNotMatch(JSON.stringify(badKey.payload), /secret-provider-detail|test_key_not_a_secret/);

  const invalidJson = await invoke("action=inbox&email=random%40mail.one", async () => responsePayload("<html>offline</html>"));
  assert.equal(invalidJson.statusCode, 502);
  assert.equal(invalidJson.payload.error, "GENMAIL_INVALID_RESPONSE");

  const rejected = await invoke("action=generate&domain=mail.one", async () => responsePayload({ status: false, message: "invalid input detail" }, 400));
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.payload.error, "GENMAIL_PROVIDER_REJECTED");
  assert.doesNotMatch(JSON.stringify(rejected.payload), /invalid input detail/);

  const network = await invoke("action=inbox&email=random%40mail.one", async () => { throw new Error("connect ECONNREFUSED internal-host"); });
  assert.equal(network.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(network.payload), /ECONNREFUSED|internal-host/);

  process.env.KURONEKO_TIMEOUT_MS = "5";
  const timeout = await invoke("action=inbox&email=random%40mail.one", (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.payload.error, "GENMAIL_TIMEOUT");

  const post = await invoke("action=domains", async () => responsePayload({}), "POST");
  assert.equal(post.statusCode, 405);

  console.log("GenMail HF29 lulus: proxy server-only, parser toleran, cache, flow, sanitasi, timeout, error aman, mobile UI, dan 12-Function routing tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (oldKey === undefined) delete process.env.KURONEKO_API_KEY; else process.env.KURONEKO_API_KEY = oldKey;
  if (oldTimeout === undefined) delete process.env.KURONEKO_TIMEOUT_MS; else process.env.KURONEKO_TIMEOUT_MS = oldTimeout;
});

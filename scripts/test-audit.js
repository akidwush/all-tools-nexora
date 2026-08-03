const assert = require("node:assert/strict");
const {
  auditBatch,
  auditResource,
  isBlockedIp,
  validateUrlSyntax
} = require("../lib/audit");

function headers(values) {
  return new Headers(values);
}

async function main() {
  assert.equal(isBlockedIp("127.0.0.1"), true);
  assert.equal(isBlockedIp("10.10.10.10"), true);
  assert.equal(isBlockedIp("169.254.169.254"), true);
  assert.equal(isBlockedIp("93.184.216.34"), false);
  assert.equal(isBlockedIp("::1"), true);
  assert.equal(validateUrlSyntax("https://example.com/path#hash").href, "https://example.com/path");
  assert.throws(() => validateUrlSyntax("file:///etc/passwd"), /HTTP dan HTTPS/);
  assert.throws(() => validateUrlSyntax("https://localhost/admin"), /lokal atau internal/);

  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const calls = [];
  const redirectFetch = async (url, options) => {
    calls.push({ url, method: options.method });
    if (url === "https://cdn.example.com/app.js") {
      return new Response(null, {
        status: 302,
        headers: { location: "/assets/app.js" }
      });
    }
    return new Response(null, {
      status: 200,
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "content-length": "3210",
        "access-control-allow-origin": "https://example.com"
      }
    });
  };

  const redirected = await auditResource({
    id: "asset-0",
    type: "asset",
    kind: "script",
    method: "HEAD",
    url: "https://cdn.example.com/app.js"
  }, {
    target: "https://example.com/page",
    lookup,
    fetchImpl: redirectFetch,
    timeoutMs: 1000
  });
  assert.equal(redirected.reachable, true);
  assert.equal(redirected.httpStatus, 200);
  assert.equal(redirected.redirects.length, 1);
  assert.equal(redirected.mime.matches, true);
  assert.equal(redirected.state, "warning");
  assert.ok(redirected.issues.includes("REDIRECTED"));
  assert.equal(calls.length, 2);

  const unsafeMethods = [];
  const optionsFetch = async (url, options) => {
    unsafeMethods.push(options.method);
    return new Response(null, {
      status: 204,
      headers: { "access-control-allow-origin": "*" }
    });
  };
  const endpoint = await auditResource({
    id: "endpoint-0",
    type: "endpoint",
    kind: "form",
    method: "POST",
    url: "https://api.example.com/submit"
  }, {
    target: "https://example.com/page",
    lookup,
    fetchImpl: optionsFetch,
    timeoutMs: 1000
  });
  assert.deepEqual(unsafeMethods, ["OPTIONS"]);
  assert.equal(endpoint.reachable, true);
  assert.equal(endpoint.methodUsed, "OPTIONS");
  assert.ok(endpoint.issues.includes("NON_DESTRUCTIVE_OPTIONS_PROBE"));

  const privateResult = await auditResource({
    id: "asset-private",
    type: "asset",
    kind: "image",
    url: "http://127.0.0.1/secret.png"
  }, {
    target: "https://example.com/",
    lookup,
    fetchImpl: async () => { throw new Error("fetch tidak boleh dipanggil"); }
  });
  assert.equal(privateResult.state, "blocked");
  assert.equal(privateResult.errorCode, "PRIVATE_IP_BLOCKED");

  const batch = await auditBatch({
    target: "https://example.com/",
    items: [
      { id: "a", type: "asset", kind: "script", url: "https://cdn.example.com/assets/app.js" },
      { id: "b", type: "endpoint", kind: "fetch", method: "GET", url: "https://api.example.com/status" }
    ]
  }, {
    lookup,
    fetchImpl: async (url) => new Response(null, {
      status: url.includes("status") ? 403 : 200,
      headers: {
        "content-type": url.includes("status") ? "application/json" : "text/javascript",
        "access-control-allow-origin": "https://example.com"
      }
    }),
    timeoutMs: 1000,
    concurrency: 2
  });
  assert.equal(batch.results.length, 2);
  assert.equal(batch.summary.reachable, 2);
  assert.equal(batch.summary.authRequired, 1);
  assert.ok(batch.summary.score < 100);


  const auditHandler = require("../api/audit");
  const captured = {};
  const apiResponse = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { captured.status = code; return this; },
    json(payload) { captured.payload = payload; return payload; }
  };
  await auditHandler({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9" },
    body: {
      target: "https://example.com/",
      items: [{ id: "private", type: "asset", kind: "image", url: "http://127.0.0.1/private.png" }]
    }
  }, apiResponse);
  assert.equal(captured.status, 200);
  assert.equal(captured.payload.ok, true);
  assert.equal(captured.payload.audit.results[0].state, "blocked");

  console.log("Live audit tests lulus: SSRF guard, redirect, MIME, CORS, safe method, dan scoring valid.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

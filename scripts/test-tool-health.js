const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const {
  classifyProbe,
  fetchProbe,
  runToolHealthChecks,
  summarizeHealth
} = require("../lib/tool-health");

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url === "/ok") {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      return response.end(request.method === "HEAD" ? undefined : '{"ok":true}');
    }
    if (request.url === "/fallback") {
      if (request.method === "HEAD") {
        response.statusCode = 405;
        return response.end();
      }
      response.statusCode = 206;
      response.setHeader("Content-Type", "text/plain");
      return response.end("x");
    }
    if (request.url === "/slow") {
      return setTimeout(() => {
        response.statusCode = 200;
        response.end("ok");
      }, 80);
    }
    response.statusCode = 503;
    response.end("offline");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  const okProbe = await fetchProbe(`${origin}/ok`, "HEAD", 1_000);
  assert.equal(okProbe.statusCode, 200);
  assert.equal(classifyProbe(okProbe, { strict: true }, { degradedLatencyMs: 500 }).status, "operational");

  const fallbackProbe = await fetchProbe(`${origin}/fallback`, "HEAD", 1_000);
  assert.equal(fallbackProbe.statusCode, 206);
  assert.equal(classifyProbe(fallbackProbe, { strict: true }, { degradedLatencyMs: 500 }).status, "operational");

  const errorProbe = await fetchProbe(`${origin}/error`, "HEAD", 1_000);
  assert.equal(classifyProbe(errorProbe, { strict: true }, { degradedLatencyMs: 500 }).status, "offline");

  const slowProbe = await fetchProbe(`${origin}/slow`, "HEAD", 1_000);
  assert.equal(classifyProbe(slowProbe, { strict: true }, { degradedLatencyMs: 20 }).status, "degraded");
  assert.equal(classifyProbe({ statusCode: 403, latencyMs: 10 }, { strict: false }, { degradedLatencyMs: 500 }).status, "degraded");
  assert.equal(classifyProbe({ statusCode: 405, latencyMs: 10 }, { strict: false }, { degradedLatencyMs: 500 }).status, "degraded");

  const run = await runToolHealthChecks({
    origin,
    persist: false,
    targets: [
      { id: "ok", name: "OK", category: "test", target: { key: "ok", type: "module", path: "/ok", method: "HEAD", strict: true } },
      { id: "offline", name: "Offline", category: "test", target: { key: "offline", type: "module", path: "/error", method: "HEAD", strict: true } }
    ]
  });
  assert.equal(run.results.length, 2);
  assert.equal(run.results.find((item) => item.toolId === "ok").status, "operational");
  assert.equal(run.results.find((item) => item.toolId === "offline").status, "offline");
  const summary = summarizeHealth(run.results);
  assert.equal(summary.status, "degraded");
  assert.equal(summary.counts.offline, 1);

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.HEALTH_CHECK_TOKEN;
  const handler = require("../api/tool-health");
  const captured = {};
  const apiResponse = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { captured.status = code; return this; },
    json(payload) { captured.payload = payload; return payload; },
    end() { captured.ended = true; }
  };
  await handler({ method: "GET", url: "/api/tool-health?refresh=0", headers: { host: `127.0.0.1:${port}` }, socket: {} }, apiResponse);
  assert.equal(captured.status, 200);
  assert.equal(captured.payload.source, "catalog");
  assert.equal(captured.payload.data.length, 39);

  const protectedResponse = {
    setHeader() {}, status(code) { captured.protectedStatus = code; return this; },
    json(payload) { captured.protectedPayload = payload; return payload; }, end() {}
  };
  await handler({ method: "POST", url: "/api/tool-health", headers: { host: `127.0.0.1:${port}` }, socket: {} }, protectedResponse);
  assert.equal(captured.protectedStatus, 503);
  assert.equal(captured.protectedPayload.error, "HEALTH_TOKEN_NOT_CONFIGURED");

  await new Promise((resolve) => server.close(resolve));
  console.log("Tool health tests lulus: probe, HEAD fallback, klasifikasi, concurrency, dan ringkasan valid.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

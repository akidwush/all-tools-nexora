const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url.startsWith("/rest/v1/app_settings")) return response.end('[{"key":"site"}]');
    if (request.url.startsWith("/rest/v1/tools")) return response.end('[{"id":"getcode","name":"Get Code HTML"}]');
    response.statusCode = 404;
    response.end('{"code":"42P01"}');
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.DATABASE_TIMEOUT_MS = "2000";

  const { databaseRequest, pingDatabase } = require("../lib/database");
  const ping = await pingDatabase();
  assert.equal(ping.status, "ready");
  assert.equal(ping.connected, true);
  assert.equal(ping.schemaReady, true);

  const tools = await databaseRequest("tools?select=id,name", { method: "GET" });
  assert.equal(tools[0].id, "getcode");

  const healthHandler = require("../api/health");
  const captured = {};
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { captured.status = code; return this; },
    json(payload) { captured.payload = payload; return payload; },
    end() { captured.ended = true; }
  };
  await healthHandler({ method: "GET", headers: { host: "localhost" } }, response);
  assert.equal(captured.status, 200);
  assert.equal(captured.payload.database.status, "ready");

  await new Promise((resolve) => server.close(resolve));
  console.log("API tests lulus: database request, ping nyata, dan health response valid.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

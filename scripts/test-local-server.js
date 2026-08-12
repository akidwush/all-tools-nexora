"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const { API_ROUTES, createLocalServer, isStaticPathAllowed } = require("../serve-local");
const routeManifest = require("../route-manifest.json");

async function main() {
  assert.deepEqual(new Set(Object.keys(API_ROUTES)), new Set(routeManifest.apiRoutes));
  for (const pathname of ["/.env", "/package.json", "/database/schema.sql", "/lib/database.js", "/scripts/build.js"]) {
    assert.equal(isStaticPathAllowed(pathname), false, `${pathname} tidak boleh menjadi static asset`);
  }

  const server = createLocalServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  try {
    const homepage = await fetch(`${origin}/`, { headers: { Accept: "text/html" } });
    assert.equal(homepage.status, 200);
    assert.match(homepage.headers.get("content-type") || "", /text\/html/);

    const asset = await fetch(`${origin}/assets/module-manifest.json`);
    assert.equal(asset.status, 200);

    for (const pathname of ["/.env", "/package.json", "/database/schema.sql", "/lib/database.js", "/scripts/build.js"]) {
      const response = await fetch(`${origin}${pathname}`, { headers: { Accept: "text/plain" } });
      assert.equal(response.status, 404, `${pathname} bocor dari server lokal`);
    }

    const health = await fetch(`${origin}/api/health`);
    assert.notEqual(health.status, 404);
    assert.equal((await health.json()).app, "All Tools Nexora");

    const webIntel = await fetch(`${origin}/api/web-intelligence?health=1`);
    assert.notEqual(webIntel.status, 404);
    assert.equal((await webIntel.json()).engine, "nexora-web-intelligence");

    const unknown = await fetch(`${origin}/api/not-real`);
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error, "API_ROUTE_NOT_FOUND");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("Server lokal lulus: rewrite aktif dan file konfigurasi/source tidak terekspos.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

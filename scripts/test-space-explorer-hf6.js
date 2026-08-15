const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  loadSpaceSection,
  normalizeApod,
  normalizeAsteroid,
  resetSpaceExplorerState
} = require("../lib/space-explorer");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders }
  });
}

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
  resetSpaceExplorerState();
  const currentDate = new Date().toISOString().slice(0, 10);
  const originalKey = process.env.NASA_API_KEY;
  process.env.NASA_API_KEY = "NASA_TEST_SECRET";
  const calls = [];

  try {
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname === "/planetary/apod") {
        assert.equal(url.searchParams.get("api_key"), "NASA_TEST_SECRET");
        assert.equal(url.searchParams.get("thumbs"), "true");
        return jsonResponse({
          date: currentDate,
          title: "The Nexora Nebula",
          explanation: "A detailed scientific explanation of a distant nebula.",
          media_type: "image",
          url: "https://apod.nasa.gov/apod/image/test.jpg",
          hdurl: "https://apod.nasa.gov/apod/image/test-hd.jpg",
          service_version: "v1"
        }, 200, { "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "998" });
      }
      if (url.hostname === "images-api.nasa.gov") {
        assert.equal(url.searchParams.has("api_key"), false);
        assert.equal(url.searchParams.get("media_type"), "image");
        return jsonResponse({ collection: { metadata: { total_hits: 2 }, items: [{
          data: [{ nasa_id: "PIA-NEXORA-1", title: "Perseverance at Jezero", description: "Mars surface panorama", center: "JPL", date_created: "2025-01-02T00:00:00Z", keywords: ["Mars", "Perseverance"] }],
          links: [{ href: "https://images-assets.nasa.gov/image/PIA-NEXORA-1/preview.jpg", rel: "preview", render: "image" }]
        }] } });
      }
      if (url.pathname === "/neo/rest/v1/feed") {
        assert.equal(url.searchParams.get("api_key"), "NASA_TEST_SECRET");
        return jsonResponse({ near_earth_objects: { [currentDate]: [
          { neo_reference_id: "2", name: "(Far Object)", is_potentially_hazardous_asteroid: false, estimated_diameter: { kilometers: { estimated_diameter_min: 0.2, estimated_diameter_max: 0.4 } }, close_approach_data: [{ close_approach_date: currentDate, relative_velocity: { kilometers_per_hour: "12000" }, miss_distance: { kilometers: "900000", lunar: "2.34" }, orbiting_body: "Earth" }], nasa_jpl_url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=2" },
          { neo_reference_id: "1", name: "(Close Object)", is_potentially_hazardous_asteroid: true, estimated_diameter: { kilometers: { estimated_diameter_min: 0.05, estimated_diameter_max: 0.12 } }, close_approach_data: [{ close_approach_date: currentDate, relative_velocity: { kilometers_per_hour: "48000" }, miss_distance: { kilometers: "250000", lunar: "0.65" }, orbiting_body: "Earth" }], nasa_jpl_url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=1" }
        ] } });
      }
      if (url.pathname === "/DONKI/notifications") {
        assert.equal(url.searchParams.get("type"), "all");
        return jsonResponse([{ messageID: "20260809-AL-001", messageType: "FLR", messageIssueTime: "2026-08-09T01:00:00Z", messageBody: "X1 solar flare observed by NASA mission.", messageURL: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/FLR/1" }]);
      }
      throw new Error(`Unexpected NASA test URL: ${url}`);
    };

    const apod = await loadSpaceSection("apod", { date: currentDate }, { fetchImpl });
    assert.equal(apod.item.title, "The Nexora Nebula");
    assert.equal(apod.provider.keyMode, "personal");
    assert.equal(apod.provider.hourlyLimit, 1000);
    assert.ok(!JSON.stringify(apod).includes("NASA_TEST_SECRET"));

    const mars = await loadSpaceSection("mars", { mission: "perseverance", page: 1 }, { fetchImpl });
    assert.equal(mars.items.length, 1);
    assert.equal(mars.items[0].nasaId, "PIA-NEXORA-1");
    assert.equal(mars.provider.keyMode, "not-required");
    assert.match(mars.sourceNote, /diarsipkan/i);

    const asteroids = await loadSpaceSection("asteroids", { date: currentDate }, { fetchImpl });
    assert.equal(asteroids.summary.total, 2);
    assert.equal(asteroids.summary.hazardous, 1);
    assert.equal(asteroids.items[0].name, "Close Object");
    assert.equal(asteroids.summary.fastest.id, "1");

    const weather = await loadSpaceSection("weather", { days: 7 }, { fetchImpl });
    assert.equal(weather.items.length, 1);
    assert.equal(weather.items[0].type, "FLR");
    assert.equal(weather.items[0].severity, "high");

    const fallbackCalls = [];
    const fallbackWeather = await loadSpaceSection("weather", { days: 3 }, { fetchImpl: async (input) => {
      const url = new URL(String(input));
      fallbackCalls.push(url.pathname);
      if (url.pathname.endsWith("/notifications")) return jsonResponse({ error: "temporary" }, 503);
      if (url.pathname.endsWith("/CME")) return jsonResponse([{ activityID: "CME-1", startTime: "2026-08-08T04:00:00Z", note: "Fast halo CME", cmeAnalyses: [{ speed: 1500 }], link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/CME/1" }]);
      return jsonResponse([]);
    } });
    assert.equal(fallbackWeather.fallback, true);
    assert.equal(fallbackWeather.items[0].type, "CME");
    assert.equal(fallbackWeather.items[0].severity, "high");
    assert.deepEqual(new Set(fallbackCalls), new Set(["/DONKI/notifications", "/DONKI/CME", "/DONKI/GST", "/DONKI/FLR"]));

    assert.equal(normalizeApod({ media_type: "image", url: "javascript:alert(1)" }).image, null);
    const normalized = normalizeAsteroid({ neo_reference_id: "x", name: "(Safe)", close_approach_data: [] });
    assert.equal(normalized.name, "Safe");
  } finally {
    if (originalKey === undefined) delete process.env.NASA_API_KEY; else process.env.NASA_API_KEY = originalKey;
  }

  delete process.env.NASA_API_KEY;
  const demoCalls = [];
  await loadSpaceSection("apod", { date: currentDate }, { fetchImpl: async (input) => {
    const url = new URL(String(input));
    demoCalls.push(url);
    return jsonResponse({ date: currentDate, title: "Demo APOD", explanation: "Demo mode", media_type: "image", url: "https://apod.nasa.gov/demo.jpg" });
  } });
  assert.equal(demoCalls[0].searchParams.get("api_key"), "DEMO_KEY");
  if (originalKey !== undefined) process.env.NASA_API_KEY = originalKey;

  const apiHandler = require("../api/tool-health");
  const health = responseCapture();
  await apiHandler({ method: "GET", url: "/api/tool-health?mode=space-explorer&health=1", headers: { host: "nexora.test" }, socket: {} }, health.response);
  assert.equal(health.captured.status, 200);
  assert.equal(health.captured.payload.engine, "nexora-space-explorer");
  assert.equal(health.captured.payload.engineVersion, "1.0.0");
  assert.equal(health.captured.payload.marsSource, "nasa-image-library");

  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some((row) => row.source === "/api/space-explorer" && row.destination.includes("mode=space-explorer")));
  const routeManifest = JSON.parse(read("route-manifest.json"));
  assert.ok(routeManifest.apiRoutes.includes("/api/space-explorer"));
  const manifest = JSON.parse(read("assets/module-manifest.json"));
  assert.equal(manifest.tools.spaceexplorer, "space-explorer");
  for (const asset of [...manifest.modules["space-explorer"].css, ...manifest.modules["space-explorer"].js]) assert.ok(fs.existsSync(path.join(root, asset)));

  const ui = read("assets/js/features/space-explorer.js");
  for (const token of ["renderSpaceExplorer", "/api/space-explorer", "drawRadar", "Mars Rover Photos API yang sudah diarsipkan", "body.__nxCleanup"]) assert.ok(ui.includes(token));
  assert.ok(!ui.includes("NASA_API_KEY"));
  assert.ok(!ui.includes("DEMO_KEY"));
  assert.match(ui, /function closeModal\(\)\{[\s\S]*?document\.body\.style\.overflow='';\}/, "menutup modal harus membuka kembali scroll halaman");
  const css = read("assets/css/features/space-explorer.css");
  for (const token of ["nse-orbit-scene", "nse-radar-layout", "@media(max-width:430px)", "prefers-reduced-motion"]) assert.ok(css.includes(token));
  assert.ok(read("database/migrations/010_nasa_space_explorer.sql").includes("on conflict (id) do update"));

  const serverless = [];
  (function walk(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const target = path.join(directory, entry.name); if (entry.isDirectory()) walk(target); else if (target.endsWith(".js")) serverless.push(target); } })(path.join(root, "api"));
  assert.equal(serverless.length, 12);

  resetSpaceExplorerState();
  console.log("Space Explorer HF6 tests lulus: APOD, Mars Library fallback, NEO radar, DONKI weather fallback, key secrecy, mobile UI, migration, dan 12-function limit aman.");
}

main().catch((error) => { console.error(error); process.exit(1); });

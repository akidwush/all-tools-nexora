"use strict";

const { handleComicReader, resetComicReaderState } = require("../lib/comic-reader");

if (process.env.COMIC_LIVE_TESTS !== "1") {
  console.log("Comic source live tests: SKIPPED (set COMIC_LIVE_TESTS=1 to make one small runtime request per provider).");
  process.exit(0);
}

function capture() {
  const out = { headers: {} };
  return {
    out,
    response: {
      setHeader(name, value) { out.headers[String(name).toLowerCase()] = value; },
      status(value) { out.status = value; return this; },
      json(value) { out.payload = value; return value; },
      end(value) { out.body = value; },
      send(value) { out.body = value; return value; }
    }
  };
}

async function one(source) {
  const { out, response } = capture();
  await handleComicReader({
    method: "GET",
    url: `/api/comics?action=list&source=${encodeURIComponent(source)}&page=1&limit=2`,
    headers: { host: "localhost", "x-forwarded-for": "8.8.8.8" },
    socket: {}
  }, response, { timeoutMs: 12_000 });
  const ok = out.status === 200 && Array.isArray(out.payload?.items);
  return { source, result: ok ? "PASS" : (out.status >= 500 ? "UNAVAILABLE" : "FAIL"), status: out.status, count: out.payload?.items?.length || 0, error: out.payload?.error || null };
}

(async () => {
  resetComicReaderState();
  const rows = [];
  for (const source of ["mangadex", "shinigami", "voratoon", "ainzscans", "mangadotnet"]) {
    try { rows.push(await one(source)); }
    catch (error) { rows.push({ source, result: "UNAVAILABLE", status: 0, count: 0, error: error?.code || error?.message || "request failed" }); }
  }
  for (const row of rows) console.log(`${row.source}: ${row.result} HTTP=${row.status || "-"} items=${row.count}${row.error ? ` error=${row.error}` : ""}`);
  if (process.env.COMIC_LIVE_STRICT === "1" && rows.some((row) => row.result !== "PASS")) process.exitCode = 1;
})();

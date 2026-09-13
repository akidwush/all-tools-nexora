"use strict";

const adapter = require("../lib/comic-sources/doujindesu");

if (process.env.COMIC_DOUJIN_LIVE !== "1") {
  console.log("DoujinDesu live test: SKIPPED (set COMIC_DOUJIN_LIVE=1).");
  process.exit(0);
}

async function main() {
  const result = {
    health: "SKIPPED",
    search: "SKIPPED",
    detail: "SKIPPED",
    chapters: "SKIPPED",
    pages: "SKIPPED"
  };

  let liveReachable = false;

  const health = await adapter.health({ timeoutMs: 10_000 });
  result.health = `${String(health.status).toUpperCase()} HTTP=${health.httpStatus || "-"} ${health.latencyMs}ms`;
  if (health.status === "active" || health.status === "degraded") liveReachable = true;

  let search;
  try {
    // One controlled normal-HTTP search even when health is inconclusive.
    // This distinguishes "health path does not answer" from "provider flow unavailable".
    search = await adapter.search({ query: "My Land Lady", page: 1, limit: 5, timeoutMs: 12_000 });
    result.search = `PASS count=${search.items.length}`;
    liveReachable = true;
  } catch (error) {
    result.search = `UNAVAILABLE ${error.code || error.message}`;
  }

  if (search?.items?.[0]) {
    try {
      const candidate = search.items[0];
      const detail = await adapter.getManga({
        id: candidate.id,
        slug: candidate.slug || candidate.id,
        timeoutMs: 12_000
      });
      result.detail = detail && detail.id ? "PASS" : "FAIL";

      try {
        const chapters = await adapter.getChapters({
          mangaId: detail.slug || detail.id,
          slug: detail.slug || detail.id,
          timeoutMs: 12_000
        });
        result.chapters = `PASS count=${chapters.length}`;

        if (process.env.DOUJINDESU_PROBE_PAGES === "1" && chapters[0]) {
          try {
            const pages = await adapter.getPages({ chapterId: chapters[0].id, timeoutMs: 12_000 });
            result.pages = `STATIC_HTML_WORKS count=${pages.length}`;
          } catch (error) {
            result.pages = `UNAVAILABLE ${error.code || error.message}`;
          }
        } else {
          result.pages = "SKIPPED capability=false (no protected API/decryption/browser automation)";
        }
      } catch (error) {
        result.chapters = `UNAVAILABLE ${error.code || error.message}`;
      }
    } catch (error) {
      result.detail = `UNAVAILABLE ${error.code || error.message}`;
    }
  } else if (search) {
    // No result is not a provider failure.
    result.detail = "SKIPPED no search result";
    result.chapters = "SKIPPED no search result";
    result.pages = "SKIPPED capability=false";
  }

  console.log(JSON.stringify(result, null, 2));

  if (!liveReachable) {
    console.log("DoujinDesu live verification: upstream unavailable through normal HTTP from this network/runtime.");
    console.log("No bypass attempted. Adapter remains DEGRADED and runtime health/search will report unavailable.");
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`DoujinDesu live verification error: ${error.code || error.message}`);
  process.exitCode = 2;
});

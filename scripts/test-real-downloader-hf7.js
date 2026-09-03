"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const downloader = require("../lib/downloader-service");
const media = require("../lib/media-download");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
function jsonResponse(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }

async function main() {
  assert.equal(downloader.PROVIDERS.youtube.capability, "best-effort-download");
  assert.deepEqual(downloader.PROVIDERS.youtube.formats, ["MP4", "MP3"]);
  assert.ok(downloader.PROVIDERS.youtube.sources.some((source) => source.mediaType === "MP4" && /ytmp4/.test(source.endpoint("https://youtu.be/demo"))));
  assert.ok(downloader.PROVIDERS.youtube.sources.some((source) => source.mediaType === "MP3" && /ytmp3/.test(source.endpoint("https://youtu.be/demo"))));

  const yt4 = downloader.normalizeProvider("youtube", { status: true, data: { title: "Demo Video", dl: "https://cdn.example.com/demo.mp4", thumbnail: "https://i.ytimg.com/demo.jpg" } }, "https://youtu.be/demo", { mediaType: "MP4" });
  assert.equal(yt4.media[0].type, "MP4");
  assert.match(yt4.media[0].filename, /\.mp4$/);
  const yt3 = downloader.normalizeProvider("youtube", { status: true, data: { title: "Demo Audio", dl: "https://cdn.example.com/demo.mp3" } }, "https://youtu.be/demo", { mediaType: "MP3" });
  assert.equal(yt3.media[0].type, "MP3");
  assert.match(yt3.media[0].filename, /\.mp3$/);

  const sources = [
    { id: "test-mp4", hosts: ["provider.example"], timeoutMs: 1000, mediaType: "MP4", endpoint: () => "https://provider.example/mp4" },
    { id: "test-mp3", hosts: ["provider.example"], timeoutMs: 1000, mediaType: "MP3", endpoint: () => "https://provider.example/mp3" }
  ];
  const result = await downloader.resolveProvider("youtube", "https://youtu.be/demo", {}, {
    cache: false,
    ignoreCircuit: true,
    sourceAttempts: 1,
    sources,
    fetch: async (url) => jsonResponse({ status: true, data: { title: "Demo", dl: String(url).endsWith("mp3") ? "https://cdn.example.com/a.mp3" : "https://cdn.example.com/v.mp4" } })
  });
  assert.deepEqual(result.data.media.map((item) => item.type).sort(), ["MP3", "MP4"]);

  const service = read("lib/downloader-service.js");
  const renderer = read("assets/js/core/downloader-renderers.js");
  const app = read("assets/js/core/app.js");
  const config = read("assets/config.js");
  assert.match(service, /handleDownloaderFile/);
  assert.match(service, /publicDownloaderData/);
  assert.match(service, /handleResolvedMedia/);
  assert.match(renderer, /YouTube Downloader/);
  assert.match(renderer, /Ambil MP4 \/ MP3/);
  assert.match(renderer, /data-real-media/);
  assert.match(app, /providerFileRoute/);
  assert.match(app, /probe=1/);
  assert.match(config, /"name": "YouTube Downloader"/);
  assert.equal(typeof media.handleResolvedMedia, "function");
  console.log("Real Downloader HF7 lulus: YouTube MP4/MP3, Spotify MP3, same-origin stream route, probe, fallback, dan parser tervalidasi.");
}

main().catch((error) => { console.error(error); process.exit(1); });

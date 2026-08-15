"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const downloader = require("../lib/downloader-service");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

async function main() {
  const calls = [];
  const sources = [
    { id: "hf6-primary", hosts: ["provider.example"], endpoint: () => "https://provider.example/primary" },
    { id: "hf6-fallback", hosts: ["fallback.example"], endpoint: () => "https://fallback.example/media" }
  ];
  const result = await downloader.resolveProvider("instagram", "https://www.instagram.com/reel/demo/", {}, {
    cache: false,
    ignoreCircuit: true,
    sourceAttempts: 1,
    sources,
    fetch: async (url) => {
      calls.push(new URL(url).hostname);
      if (calls.length === 1) return jsonResponse({ message: "provider down" }, 503);
      return jsonResponse({ result: { media: [{ video_url: "https://d.rapidcdn.app/demo.mp4" }] } });
    }
  });
  assert.deepEqual(calls, ["provider.example", "fallback.example"]);
  assert.equal(result.source, "hf6-fallback");
  assert.equal(result.attempts, 2);
  assert.equal(result.data.media[0].type, "MP4");

  const tera = downloader.normalizeProvider("terabox", {
    errno: 0,
    list: [{ server_filename: "arsip.zip", size: 2048, fs_id: 99, isdir: 0, thumbs: { url3: "https://www.terabox.com/thumb.jpg" } }]
  }, "https://www.terabox.com/s/1AbCdEf");
  assert.equal(tera.media.length, 1);
  assert.equal(tera.media[0].downloadable, false);
  assert.equal(tera.media[0].officialUrl, "https://www.terabox.com/s/1AbCdEf");
  assert.match(tera.notice, /Terabox resmi/);
  assert.equal(downloader.extractTeraboxShareId("https://www.terabox.com/s/1AbCdEf"), "AbCdEf");

  const spotifyAudio = downloader.normalizeProvider("spotify", {
    data: { title: "Demo Song", artist: "Demo Artist", download_url: "https://audio.example/demo.mp3" }
  }, "https://open.spotify.com/track/demo");
  assert.equal(spotifyAudio.media.length, 1);
  assert.equal(spotifyAudio.media[0].filename, "Demo Song.mp3");

  const spotifyOfficial = downloader.normalizeProvider("spotify", {
    title: "Official Song", author_name: "Official Artist", thumbnail_url: "https://i.scdn.co/image/demo"
  }, "https://open.spotify.com/track/demo");
  assert.equal(spotifyOfficial.media.length, 0);
  assert.match(spotifyOfficial.notice, /tautan resmi Spotify/);

  const service = read("lib/downloader-service.js");
  const client = read("assets/js/core/downloader-client.js");
  const renderers = read("assets/js/core/downloader-renderers.js");
  const sourceFeatures = read("assets/js/features/source-features.js");
  const app = read("assets/js/core/app.js");
  const health = read("lib/tool-health.js");
  assert.match(service, /CIRCUIT_FAILURE_LIMIT/);
  assert.match(service, /DOWNLOADER_\$\{upper\}_FALLBACK_URLS/);
  assert.doesNotMatch(service, /\/nexora-health-check/);
  assert.match(client, /nexoraTimeoutMs:30000/);
  assert.match(client, /payload\.password=password/);
  assert.match(renderers, /NexoraDownloaderRenderSpotify/);
  assert.match(renderers, /data-spotify-media/);
  assert.doesNotMatch(sourceFeatures + app, /api\.ikyyxd\.my\.id\/download\/spotifydl/);
  assert.doesNotMatch(health, /Spotify Metadata[\s\S]{0,200}forcedStatus/);

  console.log("Downloader HF6 lulus: cascade, circuit/cache, Terabox official fallback, Spotify MP3/fallback, health nyata, dan UI canonical tervalidasi.");
}

main().catch((error) => { console.error(error); process.exit(1); });

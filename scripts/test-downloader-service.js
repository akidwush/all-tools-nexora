"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  RESPONSE_LIMIT_BYTES,
  fetchProviderJson,
  normalizeProvider,
  validateProviderUrl
} = require("../lib/downloader-service");

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
}

async function main() {
  assert.match(validateProviderUrl("terabox", "https://www.terabox.com/s/abc"), /terabox\.com/);
  assert.match(validateProviderUrl("terabox", "https://terabox.app/s/abc"), /terabox\.app/);
  assert.match(validateProviderUrl("terabox", "https://www.1024terabox.com/s/abc"), /1024terabox\.com/);
  assert.match(validateProviderUrl("instagram", "https://instagr.am/p/abc"), /instagr\.am/);
  assert.match(validateProviderUrl("tiktok", "https://vm.tiktok.com/abc"), /vm\.tiktok\.com/);
  assert.match(validateProviderUrl("youtube", "https://youtu.be/abc"), /youtu\.be/);
  assert.match(validateProviderUrl("spotify", "https://spotify.link/abc"), /spotify\.link/);
  assert.throws(() => validateProviderUrl("instagram", "https://127.0.0.1/post"), /bukan link/);
  assert.throws(() => validateProviderUrl("youtube", "http://youtube.com/watch?v=x"), /HTTPS/);
  assert.throws(() => validateProviderUrl("terabox", "https://evil.example/?url=terabox.com"), /bukan link/);

  const terabox = normalizeProvider("terabox", { result: { files: [{ filename: "arsip.zip", download_url: "https://cdn.example.net/arsip.zip", size: "2 MB" }] } }, "https://terabox.com/s/x");
  assert.equal(terabox.media[0].type, "FILE");
  const instagram = normalizeProvider("instagram", { result: { media: [{ video: "https://cdn.example.net/reel.mp4" }] }, caption: "aman" }, "https://instagram.com/reel/x");
  assert.equal(instagram.media[0].type, "MP4");
  const tiktok = normalizeProvider("tiktok", { data: { title: "demo", play: "https://v16.tiktokcdn.com/a.mp4", music: "https://sf16.tiktokcdn.com/a.mp3", images: ["https://p16.tiktokcdn.com/a.jpg"] } }, "https://vm.tiktok.com/x");
  assert.deepEqual([...new Set(tiktok.media.map((item) => item.type))].sort(), ["JPG", "MP3", "MP4"]);
  const youtube = normalizeProvider("youtube", { title: "Video", author_name: "Channel" }, "https://youtu.be/x");
  assert.equal(youtube.media.length, 0);
  assert.match(youtube.notice, /tidak disediakan/);
  assert.throws(() => normalizeProvider("instagram", { result: [] }, "https://instagram.com/p/x"), /tidak ditemukan/);

  let calls = 0;
  const retry = await fetchProviderJson("instagram", "https://instagram.com/p/x", {
    fetch: async () => { calls += 1; return calls === 1 ? jsonResponse({ error: true }, 503) : jsonResponse({ result: [] }); }
  });
  assert.deepEqual(retry, { result: [] });
  assert.equal(calls, 2);

  await assert.rejects(fetchProviderJson("instagram", "https://instagram.com/p/x", {
    fetch: async () => new Response("<html>error</html>", { status: 200, headers: { "content-type": "text/html" } })
  }), (error) => error.code === "UPSTREAM_INVALID_JSON");
  await assert.rejects(fetchProviderJson("instagram", "https://instagram.com/p/x", {
    fetch: async () => jsonResponse({ ok: true }, 200, { "content-length": String(RESPONSE_LIMIT_BYTES + 1) })
  }), (error) => error.code === "UPSTREAM_RESPONSE_TOO_LARGE");
  await assert.rejects(fetchProviderJson("instagram", "https://instagram.com/p/x", {
    timeoutMs: 10,
    fetch: async (_url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); }, { once: true }))
  }), (error) => error.code === "UPSTREAM_TIMEOUT");
  await assert.rejects(fetchProviderJson("instagram", "https://instagram.com/p/x", {
    fetch: async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } })
  }), (error) => error.code === "UPSTREAM_REDIRECT_BLOCKED");

  const source = fs.readFileSync(path.join(__dirname, "../assets/js/core/downloader-client.js"), "utf8");
  let first = true;
  const sandbox = { URL, AbortController, Object, JSON, Error, Promise, window: {} };
  sandbox.window.NexoraFetchJson = (_url, init) => {
    if (first) {
      first = false;
      return new Promise((resolve, reject) => init.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); }, { once: true }));
    }
    return Promise.resolve({ ok: true, data: { media: [] } });
  };
  vm.runInNewContext(source, sandbox, { filename: "downloader-client.js" });
  const earlier = sandbox.window.NexoraDownloader.request("instagram", "https://instagram.com/p/one");
  const latest = sandbox.window.NexoraDownloader.request("instagram", "https://instagram.com/p/two");
  const settled = await Promise.allSettled([earlier, latest]);
  assert.equal(settled[0].status, "rejected");
  assert.equal(settled[0].reason.name, "AbortError");
  assert.equal(settled[1].status, "fulfilled");

  console.log("Downloader tests lulus: validator/short-link, normalizer, empty result, retry, HTTP, non-JSON, size limit, timeout, redirect SSRF, dan cancel submit.");
}

main().catch((error) => { console.error(error); process.exit(1); });

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { Writable } = require("node:stream");
const downloader = require("../lib/downloader-service");
const media = require("../lib/media-download");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

class FakeRequest extends EventEmitter {
  constructor() {
    super();
    this.method = "GET";
    this.headers = { host: "localhost:4173", "x-forwarded-for": "203.0.113.51" };
    this.socket = { remoteAddress: "203.0.113.51" };
  }
}

class FakeResponse extends Writable {
  constructor() {
    super();
    this.headers = new Map();
    this.statusCode = 200;
    this.chunks = [];
  }
  _write(chunk, _encoding, callback) { this.chunks.push(Buffer.from(chunk)); callback(); }
  setHeader(name, value) { this.headers.set(String(name).toLowerCase(), String(value)); }
  bodyText() { return Buffer.concat(this.chunks).toString("utf8"); }
}

async function main() {
  const tera = downloader.normalizeProvider("terabox", {
    data: { result: { files: [
      "https://api.nexray.eu.cc/files/one.bin",
      { fast_download: "//api.nexray.eu.cc/files/two.bin", file_name: "two.bin" },
      { url: "https://api.nexray.eu.cc/files/one.bin" }
    ] } }
  }, "https://terabox.com/s/demo");
  assert.equal(tera.media.length, 2, "nested/string provider items must be normalized and deduplicated");
  assert.equal(tera.media[1].url, "https://api.nexray.eu.cc/files/two.bin");

  const instagram = downloader.normalizeProvider("instagram", {
    result: { data: { caption: "Nested post", media: [
      { video_url: "https://api.nexray.eu.cc/media/post.mp4" },
      { image_url: "https://api.nexray.eu.cc/media/post.jpg" }
    ] } }
  }, "https://instagram.com/p/demo");
  assert.equal(instagram.media.length, 2);
  assert.deepEqual(instagram.media.map((item) => item.type), ["MP4", "JPG"]);

  assert.equal(media.isAllowedHost("api.nexray.eu.cc"), true);
  const originalFetch = global.fetch;
  const methods = [];
  try {
    global.fetch = async (_url, init) => {
      methods.push({ method: init.method, range: init.headers.Range || "" });
      if (init.method === "HEAD") return new Response("", { status: 405, headers: { "content-type": "text/html" } });
      return new Response(Uint8Array.from([1]), {
        status: 206,
        headers: { "content-type": "video/mp4", "content-range": "bytes 0-0/4567", "content-length": "1" }
      });
    };
    const response = new FakeResponse();
    const requestUrl = new URL("http://localhost/api/media-download?probe=1&type=MP4&filename=post.mp4&url=" + encodeURIComponent("https://api.nexray.eu.cc/media/post.mp4"));
    await media.handleMediaDownload(new FakeRequest(), response, requestUrl);
    const payload = JSON.parse(response.bodyText());
    assert.equal(payload.ready, true);
    assert.equal(payload.contentLength, 4567);
    assert.deepEqual(methods, [{ method: "HEAD", range: "" }, { method: "GET", range: "bytes=0-0" }]);
  } finally {
    global.fetch = originalFetch;
  }

  const index = read("index.html");
  const appIndex = index.lastIndexOf("assets/js/core/app.js?v=6.3.18-lr4-hf5-download1");
  const renderersIndex = index.indexOf("assets/js/core/downloader-renderers.js?v=6.3.18-hf5-download1");
  const shellIndex = index.indexOf("assets/js/core/shell.js?v=6.3.18-hf11.1-no-wa-notif");
  assert.ok(appIndex > 0 && renderersIndex > appIndex && shellIndex > renderersIndex, "canonical downloader renderers must load after legacy app and before shell");
  assert.match(index, /viewport-fit=cover/);

  const css = read("assets/css/core.css") + read("assets/css/components.css");
  assert.doesNotMatch(css, /--nx-vv-(?:width|height|left|top)/);
  assert.match(css, /#nxUniversalRoom[\s\S]*inset:0!important/);
  assert.match(css, /overflow-x:\s*clip/);

  const stability = read("assets/js/core/stability.js");
  assert.match(stability, /visualViewport\.addEventListener\(["']resize["']/);
  assert.match(stability, /NexoraViewportRecovery/);
  assert.doesNotMatch(stability, /safeReload|nxSafeReload|nx_reload/);
  assert.doesNotMatch(stability, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);

  const lazy = read("assets/js/core/lazy-loader.js");
  const shell = read("assets/js/core/shell.js");
  assert.match(lazy, /function restoreRoute\(\)/);
  assert.match(lazy, /pageshow/);
  assert.match(shell, /restoreBodyOverflow/);
  assert.match(shell, /nxUniversalTool/);

  const dashboard = read("assets/js/admin/dashboard.js");
  const login = read("assets/js/admin/login.js");
  assert.match(dashboard, /Server dashboard melewati batas waktu/);
  assert.match(dashboard, /Dashboard belum dapat dimuat/);
  assert.doesNotMatch(dashboard, /catch\(error\)\{console\.error\(error\);location\.replace\("\/admin\/login"\)/);
  assert.match(login, /controller\.abort\(\)/);

  console.log("Nexora full recovery lulus: viewport Android, downloader provider/proxy, status publik, dan recovery admin tervalidasi tanpa tombol refresh tambahan.");
}

main().catch((error) => { console.error(error); process.exit(1); });

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));
const tiktok = read("assets/js/features/tiktok.js");
const toolHealthApi = read("api/tool-health.js");
const media = read("lib/media-download.js");
const vercel = JSON.parse(read("vercel.json"));
const routes = JSON.parse(read("route-manifest.json"));
const { API_ROUTES } = require("../serve-local");

assert.equal(pkg.version, "6.3.16");
assert.match(tiktok, /\/api\/media-download\?/);
assert.match(tiktok, /probeDownload\(choice\)/);
assert.match(tiktok, /triggerStreamDownload\(choice\)/);
assert.match(tiktok, /Tidak ada history palsu yang dibuat/);
assert.match(tiktok, /releaseMedia\(pb\)/);
assert.match(tiktok, /window\.nxEnhanceTiktokPreviewControls/);
assert.doesNotMatch(tiktok, /response\.blob\(\)/);
assert.doesNotMatch(tiktok, /URL\.createObjectURL/);
assert.doesNotMatch(tiktok, /document\.createElement\(['"]iframe['"]\)/);
assert.doesNotMatch(tiktok, /new MutationObserver/);
assert.doesNotMatch(tiktok, /crossorigin=["']anonymous["']/i);

assert.match(toolHealthApi, /handleMediaDownload/);
assert.match(toolHealthApi, /mode"\) === "media-download"/);
assert.match(media, /Readable\.fromWeb\(upstream\.body\)/);
assert.match(media, /MEDIA_HOST_NOT_ALLOWED/);
assert.match(media, /Content-Disposition/);
assert.match(media, /MAX_DOWNLOADS_PER_WINDOW/);
assert.ok(vercel.rewrites.some((item) => item.source === "/api/media-download" && /mode=media-download/.test(item.destination)));
assert.ok(routes.apiRoutes.includes("/api/media-download"));
assert.equal(API_ROUTES["/api/media-download"].mode, "media-download");

const mediaModule = require(path.join(root, "lib/media-download.js"));
assert.equal(mediaModule.isAllowedHost("v16m-default.akamaized.net"), true);
assert.equal(mediaModule.isAllowedHost("p16-sign.tiktokcdn-us.com"), true);
assert.equal(mediaModule.isAllowedHost("example.com"), false);
assert.throws(() => mediaModule.validateMediaUrl("http://tikwm.com/a.mp4"), /HTTPS/);
assert.throws(() => mediaModule.validateMediaUrl("https://127.0.0.1/a.mp4"), /tidak termasuk/);
assert.equal(mediaModule.sanitizeFilename("../../video:aneh?.mp4", "MP4").includes("/"), false);

const { EventEmitter } = require("node:events");
const { Writable } = require("node:stream");

class FakeRequest extends EventEmitter {
  constructor() {
    super();
    this.method = "GET";
    this.headers = { host: "localhost:4173", "x-forwarded-for": "203.0.113.9" };
    this.socket = { remoteAddress: "203.0.113.9" };
  }
}

class FakeResponse extends Writable {
  constructor() {
    super();
    this.headers = new Map();
    this.statusCode = 200;
    this.chunks = [];
  }
  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
  setHeader(name, value) { this.headers.set(String(name).toLowerCase(), String(value)); }
  getHeader(name) { return this.headers.get(String(name).toLowerCase()); }
  bodyText() { return Buffer.concat(this.chunks).toString("utf8"); }
}

(async () => {
  const nativeFetch = global.fetch;
  try {
    global.fetch = async () => new Response(Uint8Array.from([7]), {
      status: 206,
      headers: {
        "content-type": "video/mp4",
        "content-length": "1",
        "content-range": "bytes 0-0/4096",
        "accept-ranges": "bytes"
      }
    });

    const probeRequest = new FakeRequest();
    const probeResponse = new FakeResponse();
    const probeUrl = new URL("http://localhost/api/media-download?probe=1&type=MP4&filename=test.mp4&url=" + encodeURIComponent("https://v16m-default.akamaized.net/media.mp4"));
    await mediaModule.handleMediaDownload(probeRequest, probeResponse, probeUrl);
    const probePayload = JSON.parse(probeResponse.bodyText());
    assert.equal(probeResponse.statusCode, 200);
    assert.equal(probePayload.ok, true);
    assert.equal(probePayload.ready, true);
    assert.equal(probePayload.contentType, "video/mp4");

    global.fetch = async () => new Response(Uint8Array.from([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "video/mp4", "content-length": "4" }
    });
    const streamRequest = new FakeRequest();
    streamRequest.headers["x-forwarded-for"] = "203.0.113.10";
    const streamResponse = new FakeResponse();
    const streamUrl = new URL("http://localhost/api/media-download?type=MP4&filename=video.mp4&url=" + encodeURIComponent("https://p16-sign.tiktokcdn-us.com/video.mp4"));
    await mediaModule.handleMediaDownload(streamRequest, streamResponse, streamUrl);
    assert.deepEqual(Buffer.concat(streamResponse.chunks), Buffer.from([1, 2, 3, 4]));
    assert.match(streamResponse.getHeader("content-disposition"), /attachment/);
    assert.equal(streamResponse.getHeader("content-type"), "video/mp4");

    let fetched = false;
    global.fetch = async () => { fetched = true; throw new Error("should not fetch"); };
    const blockedRequest = new FakeRequest();
    blockedRequest.headers["x-forwarded-for"] = "203.0.113.11";
    const blockedResponse = new FakeResponse();
    const blockedUrl = new URL("http://localhost/api/media-download?probe=1&url=" + encodeURIComponent("https://example.com/file.mp4"));
    await mediaModule.handleMediaDownload(blockedRequest, blockedResponse, blockedUrl);
    assert.equal(blockedResponse.statusCode, 400);
    assert.equal(fetched, false);

    console.log("TikTok tahap 2 lulus: streaming proxy, SSRF guard, truthful history, cleanup format, single preview controller, dan handler runtime.");
  } finally {
    global.fetch = nativeFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

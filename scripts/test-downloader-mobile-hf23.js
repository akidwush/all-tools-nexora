"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { Writable } = require("node:stream");
const media = require("../lib/media-download");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

class FakeRequest extends EventEmitter {
  constructor(ip) {
    super();
    this.method = "GET";
    this.headers = { host: "localhost:4173", "x-forwarded-for": ip };
    this.socket = { remoteAddress: ip };
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
  assert.equal(media.isAllowedHost("d.rapidcdn.app"), true);
  assert.equal(media.isAllowedHost("scontent.cdninstagram.com"), true);
  assert.equal(media.isAllowedHost("d.terabox.app"), true);
  assert.equal(media.isAllowedHost("d.pcs.baidu.com"), true);
  assert.equal(media.isAllowedHost("pcs.baidu.com.evil.example"), false);
  assert.equal(media.isAllowedHost("127.0.0.1"), false);
  assert.equal(media.sanitizeFilename("dokumen penting.pdf", "FILE"), "dokumen penting.pdf");
  assert.equal(media.sanitizeFilename("", "FILE"), "nexora_download.bin");

  const nativeFetch = global.fetch;
  let capturedReferer = "";
  try {
    global.fetch = async (_url, init) => {
      capturedReferer = init.headers.Referer;
      return new Response(Uint8Array.from([1]), {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-length": "1",
          "content-range": "bytes 0-0/987654"
        }
      });
    };
    const request = new FakeRequest("203.0.113.23");
    const response = new FakeResponse();
    const url = new URL("http://localhost/api/media-download?probe=1&type=MP4&filename=instagram.mp4&url=" + encodeURIComponent("https://d.rapidcdn.app/media/demo.mp4"));
    await media.handleMediaDownload(request, response, url);
    const payload = JSON.parse(response.bodyText());
    assert.equal(response.statusCode, 200);
    assert.equal(payload.ready, true);
    assert.equal(payload.contentLength, 987654);
    assert.equal(payload.finalHost, "d.rapidcdn.app");
    assert.equal(capturedReferer, "https://www.instagram.com/");
  } finally {
    global.fetch = nativeFetch;
  }

  const app = read("assets/js/core/app.js");
  const downloadFlow = app.slice(app.indexOf("function nxMediaDownloadEndpoint"), app.indexOf("function nxShowCanvas"));
  assert.match(downloadFlow, /\/api\/media-download\?/);
  assert.match(downloadFlow, /params\.set\('probe', '1'\)/);
  assert.ok(downloadFlow.indexOf("await request") < downloadFlow.lastIndexOf("recordDownload("));
  assert.doesNotMatch(downloadFlow, /response\.blob\(/);

  const renderers = read("assets/js/core/downloader-renderers.js");
  const pack = read("assets/js/features/download-pack.js");
  assert.match(renderers, /await trigger\(item\.url,item\.filename/);
  assert.match(pack, /await downloadUrl\(/);

  const apiFiles = walk(path.join(root, "api")).filter((file) => file.endsWith(".js"));
  assert.equal(apiFiles.length, 12);
  assert.equal(fs.existsSync(path.join(root, "api/media-download.js")), false);
  assert.equal(fs.existsSync(path.join(root, "api/downloader-file.js")), false);

  console.log("Downloader mobile HF2.3 lulus: proxy Instagram/Terabox, FILE, probe, host guard, history jujur, dan 12/12 fungsi Vercel.");
}

main().catch((error) => { console.error(error); process.exit(1); });

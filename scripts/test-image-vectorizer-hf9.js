const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const digest = (file) => crypto.createHash("sha256").update(read(file, null)).digest("hex");

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}

function testPng() {
  const width = 32;
  const height = 32;
  const scanlines = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const inside = (x - 16) ** 2 + (y - 16) ** 2 < 115;
      const offset = 1 + x * 4;
      row[offset] = inside ? 13 : 8;
      row[offset + 1] = inside ? 148 : 20;
      row[offset + 2] = inside ? 136 : 28;
      row[offset + 3] = 255;
    }
    scanlines.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(Buffer.concat(scanlines))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

async function smokeWorker() {
  const messages = [];
  let resolveResult;
  let resultTimer;
  const resultPromise = new Promise((resolve) => { resolveResult = resolve; });
  const sandbox = {
    Blob,
    Error,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    WebAssembly,
    performance,
    setTimeout,
    clearTimeout,
    console
  };
  sandbox.self = sandbox;
  sandbox.postMessage = (message) => {
    messages.push(message);
    if (["result", "error", "fatal"].includes(message.type)) {
      clearTimeout(resultTimer);
      resolveResult(message);
    }
  };
  sandbox.XMLHttpRequest = class LocalWasmRequest {
    open(_method, url) { this.url = url; }
    send() {
      const wasm = read("assets/vendor/vtracer/vtracer_wasm_bg.wasm", null);
      this.status = 200;
      this.response = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
    }
  };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = () => vm.runInContext(read("assets/vendor/vtracer/vtracer_wasm.js"), context, { filename: "vtracer_wasm.js" });
  vm.runInContext(read("assets/js/workers/vtracer-worker.js"), context, { filename: "vtracer-worker.js" });
  assert.equal(messages[0]?.type, "ready", "Worker VTracer harus boot sebelum menerima gambar");
  assert.equal(messages[0]?.engineVersion, "1.0.0-alpha.3");

  const source = testPng();
  const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  sandbox.onmessage({ data: {
    type: "vectorize",
    requestId: "hf9-smoke",
    buffer,
    mime: "image/png",
    width: 32,
    height: 32,
    maxPixels: 1_000_000,
    maxSide: 1200,
    options: { preset: "poster", clustering: "color-cluster", hierarchical: "cutout", mode: "spline", maxColors: 4, optimize: 2 }
  } });
  resultTimer = setTimeout(() => resolveResult({ type: "timeout" }), 20_000);
  const result = await resultPromise;
  assert.equal(result.type, "result", result.message || "Worker VTracer timeout");
  assert.match(result.svg, /<svg[\s>]/i);
  assert.ok(result.svg.includes("<path"), "SVG smoke test harus berisi path vektor nyata");
  assert.ok(result.bytes > 100);
  assert.ok(messages.some((message) => message.type === "progress" && message.value >= 48));
}

async function main() {
  const ui = read("assets/js/features/image-vectorizer.js");
  const worker = read("assets/js/workers/vtracer-worker.js");
  const css = read("assets/css/features/image-vectorizer.css");
  const manifest = JSON.parse(read("assets/module-manifest.json"));
  const registry = read("assets/js/core/tool-registry.js");
  const migration = read("database/migrations/012_nexora_image_vectorizer.sql");

  for (const token of ["renderImageVectorizer", "new Worker", "Vectorize image", "Download SVG", "Copy SVG code", "12*1024*1024", "sanitizeSvg", "deviceProfile"]) assert.ok(ui.includes(token), `UI HF9 belum lengkap: ${token}`);
  for (const token of ["importScripts", "vectorize_rgba", "vectorize_bytes", "OffscreenCanvas", "createImageBitmap", "1.0.0-alpha.3", "VTRACER_MODULE_NOT_ALLOWED"]) assert.ok(worker.includes(token), `Worker HF9 belum lengkap: ${token}`);
  for (const token of ["overflow-x:clip", "100dvh", "safe-area-inset-bottom", "@media(max-width:720px)", "@media(max-width:430px)", "min-height:44px"]) assert.ok(css.includes(token), `CSS mobile HF9 belum lengkap: ${token}`);
  assert.ok(!ui.includes("fetch("), "Image Vectorizer tidak boleh mengunggah gambar ke server");
  assert.ok(!worker.includes("https://") && !worker.includes("http://"), "Worker hanya boleh memuat aset lokal");
  assert.equal(manifest.tools.imagevectorizer, "image-vectorizer");
  assert.deepEqual(manifest.modules["image-vectorizer"].js, ["assets/js/features/image-vectorizer.js"]);
  assert.ok(registry.includes('["imagevectorizer","Nexora Image Vectorizer","module","image-vectorizer"'));
  assert.ok(migration.includes("'localOnly':") === false, "Metadata SQL harus berupa JSON valid, bukan sintaks object JS");
  assert.ok(migration.includes('"localOnly":true'));
  assert.equal(digest("assets/vendor/vtracer/vtracer_wasm.js"), "e1855e9bb29d785344f672abdc692ca90ffa7ed863b9186b51c4e95a2a7dc17d");
  assert.equal(digest("assets/vendor/vtracer/vtracer_wasm_bg.wasm"), "8037898af5acac5a98856b40675f54aa98c0e5d94cc47d4752740cf452fc1420");
  assert.ok(read("assets/vendor/vtracer/LICENSE").includes("Permission is hereby granted"));
  assert.ok(read("assets/vendor/vtracer/VERSION.txt").includes("@visioncortex/vtracer 1.0.0-alpha.3"));
  await smokeWorker();
  console.log("Image Vectorizer HF9 tests lulus: official WASM checksum, local worker, vectorization nyata, UI, keamanan SVG, export, dan layout mobile valid.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

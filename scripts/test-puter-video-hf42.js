"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const feature = read("assets/js/features/puter-video.js");
const runtime = read("assets/js/features/puter-runtime.js");
const css = read("assets/css/features/puter-video.css");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const registry = read("assets/js/core/tool-registry.js");
const health = read("lib/tool-health.js");
const index = read("index.html");
const readme = read("README.md");
const routeManifest = JSON.parse(read("route-manifest.json"));
const moduleManifest = JSON.parse(read("assets/module-manifest.json"));

assert.deepEqual(moduleManifest.modules["puter-video"], {
  css: ["assets/css/features/puter-video.css"],
  js: ["assets/js/features/puter-runtime.js", "assets/js/features/puter-video.js"]
});
assert.equal(moduleManifest.tools.aivideo, "puter-video");
assert.match(app, /id: 'aivideo'.+Nexora AI Video Generator/);
assert.match(app, /case 'aivideo': renderPuterVideo\(body\); break;/);
assert.match(shell, /aivideo:\{renderer:'renderPuterVideo'/);
assert.match(registry, /\["aivideo","Nexora AI Video Generator","module","puter-video","renderPuterVideo",null\]/);
assert.match(health, /id: "aivideo", name: "Nexora AI Video Generator"/);
assert.match(lazy, /aivideo:'puter-video'/);
assert.match(lazy, /puter-video-hf43/);
assert.match(lazy, /'puter-video':'Nexora AI Video Generator'/);
assert.match(index, /hf43-puter-video1/);
assert.match(readme, /#tool-aivideo/);
assert.match(readme, /60 tool/);

assert.equal(routeManifest.apiRoutes.some((route) => /ai-video|aivideo/.test(route)), false, "AI Video tidak boleh menambah backend route");
assert.doesNotMatch([feature, runtime, css].join("\n"), /supabase|api[_-]?key|openai[_-]?api|google[_-]?api/i);
assert.doesNotMatch(feature, /fetch\s*\(/, "AI Video tidak boleh memakai backend/provider fetch sendiri");
assert.match(runtime, /https:\/\/js\.puter\.com\/v2\//);
assert.match(feature, /sdk\.ai\.txt2vid\(params\.prompt, options\)/);
assert.match(feature, /normalizePuterVideoResult/);
assert.match(feature, /input_reference/);
assert.match(feature, /controls playsinline preload="metadata"/);
assert.doesNotMatch(feature, /autoplay/i);
assert.match(feature, /if \(busy\) return;/);
assert.match(feature, /body\.__nxCleanup/);
assert.match(feature, /URL\.revokeObjectURL/);
assert.match(feature, /generationToken \+= 1/);
assert.match(feature, /video\.style\.aspectRatio/);
assert.match(feature, /MAX_IMAGE_BYTES = 10 \* 1024 \* 1024/);
assert.match(feature, /image\/jpeg.+image\/png.+image\/webp/);
assert.match(css, /@media\(max-width:390px\)/);
assert.match(css, /max-width:100%/);
assert.match(css, /min-height:4[48]px/);
assert.match(css, /overflow-x:clip/);

for (const token of [
  'id: "sora-2"',
  'id: "sora-2-pro"',
  'id: "veo-3.1-fast-generate-preview"',
  'id: "veo-3.1-generate-preview"',
  'durations: Object.freeze([4, 8, 12])',
  'durations: Object.freeze([4, 6, 8])',
  '"9:16": "720x1280"',
  '"16:9": "1280x720"'
]) assert.ok(feature.includes(token), `Kontrak model hilang: ${token}`);

const instrumented = feature.replace(
  /window\.normalizePuterVideoResult = normalizePuterVideoResult;[\s\S]*?\}\)\(\);\s*$/,
  "window.__puterVideoTest={models:videoModels,normalize:normalizePuterVideoResult,buildOptions:buildVideoOptions,errorMessage:videoErrorMessage,validateImage:validateReferenceImage};})();"
);
const revoked = [];
const sandbox = {
  window: {
    URL: { revokeObjectURL(value) { revoked.push(value); } },
    NexoraPuterRuntime: {
      errorDetails(error) {
        return {
          code: String(error && error.code || error && error.message || "").toLowerCase(),
          status: Number(error && error.status || 0),
          message: String(error && error.message || "")
        };
      }
    }
  },
  URL: { createObjectURL() { return "blob:nexora-video-test"; } },
  Blob,
  ArrayBuffer,
  HTMLVideoElement: undefined,
  FileReader: function FileReader() {},
  Uint8Array,
  Promise,
  Number,
  String,
  Object,
  Array,
  console,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(instrumented, sandbox, { filename: "puter-video.js" });
const helpers = sandbox.window.__puterVideoTest;
assert.ok(helpers, "Helper AI Video gagal diekspos untuk regresi");
assert.equal(helpers.models.length, 4);
assert.equal(helpers.models.every((model) => model.supportsImageInput), true);

const sora = helpers.models[0];
assert.deepEqual(
  JSON.parse(JSON.stringify(helpers.buildOptions(sora, 8, "16:9", null))),
  { model: "sora-2", seconds: 8, size: "1280x720" }
);
const reference = { name: "reference.png" };
assert.equal(helpers.buildOptions(sora, 99, "invalid", reference).input_reference, reference);
assert.equal(helpers.buildOptions(sora, 99, "invalid", reference).seconds, 4);
assert.equal(helpers.buildOptions(sora, 99, "invalid", reference).size, "720x1280");

assert.match(helpers.errorMessage({ status: 401, message: "Unauthorized" }), /Login Puter/);
assert.match(helpers.errorMessage({ status: 402, message: "Allowance exhausted" }), /Allowance/);
assert.match(helpers.errorMessage({ status: 429, message: "Too many requests" }), /terlalu banyak/);
assert.match(helpers.errorMessage(new Error("PUTER_VIDEO_TIMEOUT")), /batas waktu/);
assert.match(helpers.errorMessage(new Error("PUTER_VIDEO_IMAGE_UNSUPPORTED")), /tidak didukung/);
assert.match(helpers.errorMessage(new Error("PUTER_VIDEO_INVALID_RESULT")), /tidak dapat dibaca/);

async function verifyImageValidation() {
  const png = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
  assert.equal(await helpers.validateImage(png), png);
  const fake = new Blob(["not an image"], { type: "image/png" });
  await assert.rejects(() => helpers.validateImage(fake), /PUTER_VIDEO_IMAGE_INVALID/);
}

async function verifyMediaNormalization() {
  const elementResult = await helpers.normalize({
    tagName: "VIDEO",
    src: "https://assets.puter.site/video.mp4",
    getAttribute() { return ""; },
    querySelector() { return null; }
  });
  assert.equal(elementResult.videoUrl, "https://assets.puter.site/video.mp4");
  assert.equal(elementResult.metadata.sourceType, "HTMLVideoElement");

  const genericMimeElement = await helpers.normalize({
    tagName: "VIDEO",
    src: "data:application/octet-stream;base64,AAAA",
    getAttribute(name) { return name === "data-mime-type" ? "video/mp4" : ""; },
    querySelector() { return null; }
  });
  assert.match(genericMimeElement.videoUrl, /^data:application\/octet-stream/);

  const sourceChild = await helpers.normalize({
    tagName: "VIDEO",
    src: "",
    getAttribute() { return ""; },
    querySelector() { return { src: "https://assets.puter.site/source-child.mp4" }; }
  });
  assert.match(sourceChild.videoUrl, /source-child\.mp4$/);

  const blobResult = await helpers.normalize(new Blob(["video"], { type: "video/mp4" }));
  assert.equal(blobResult.videoUrl, "blob:nexora-video-test");
  assert.equal(blobResult.metadata.ownsObjectUrl, true);

  const arrayBufferResult = await helpers.normalize(Uint8Array.from([0, 1, 2]).buffer);
  assert.equal(arrayBufferResult.metadata.sourceType, "ArrayBuffer");
  assert.equal(arrayBufferResult.metadata.ownsObjectUrl, true);

  const responseResult = await helpers.normalize({
    type: "application/octet-stream",
    headers: { get() { return "video/mp4"; } },
    async arrayBuffer() { return Uint8Array.from([0, 1, 2]).buffer; }
  });
  assert.equal(responseResult.metadata.sourceType, "Response");
  assert.equal(responseResult.blob.type, "video/mp4");

  const nestedResult = await helpers.normalize({ result: { output: { video_url: "https://assets.puter.site/nested.mp4" } } });
  assert.match(nestedResult.videoUrl, /nested\.mp4$/);
  const scalarEnvelope = await helpers.normalize({ result: "https://assets.puter.site/scalar.mp4" });
  assert.match(scalarEnvelope.videoUrl, /scalar\.mp4$/);
  const arrayEnvelope = await helpers.normalize([{ href: "https://assets.puter.site/array.mp4" }]);
  assert.match(arrayEnvelope.videoUrl, /array\.mp4$/);
  await assert.rejects(() => helpers.normalize({ result: "missing" }), /PUTER_VIDEO_INVALID_RESULT/);
}

Promise.all([verifyImageValidation(), verifyMediaNormalization()]).then(() => {
  console.log("Nexora AI Video HF43 lulus: hasil Puter DOM/Blob/ArrayBuffer/Response/nested, MIME generik Android, model resmi, auth, player, download, cleanup, mobile, dan zero-backend tervalidasi.");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

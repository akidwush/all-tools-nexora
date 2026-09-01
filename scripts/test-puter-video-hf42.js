"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { getTool } = require("./config-test-helpers.js");
const feature = read("assets/js/features/puter-video.js");
const runtime = read("assets/js/features/puter-runtime.js");
const css = read("assets/css/features/puter-video.css");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const index = read("index.html");
const readme = read("README.md");
const routeManifest = JSON.parse(read("route-manifest.json"));
const moduleManifest = JSON.parse(read("assets/module-manifest.json"));

assert.deepEqual(moduleManifest.modules["puter-video"], {
  css: ["assets/css/features/puter-video.css"],
  js: ["assets/js/features/puter-runtime.js", "assets/js/features/puter-video.js"]
});
assert.equal(moduleManifest.tools.aivideo, "puter-video");
assert.equal(getTool("aivideo").name, "Nexora AI Video Generator");
assert.equal(getTool("aivideo").runtime.mode, "module");
assert.equal(getTool("aivideo").runtime.module, "puter-video");
assert.equal(getTool("aivideo").runtime.handler, "renderPuterVideo");
assert.match(app, /case 'aivideo': renderPuterVideo\(body\); break;/);
assert.match(shell, /aivideo:\{renderer:'renderPuterVideo'/);
assert.equal(getTool("aivideo").health.path, "/assets/js/features/puter-video.js");
assert.match(lazy, /puter-video-hf47/);
assert.match(index, /hf47-puter-video1/);
assert.match(readme, /#tool-aivideo/);
assert.match(readme, /64 tool/);

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
assert.match(feature, /accountVerified = false/);
assert.match(feature, /id="nvgAuthRetry"/);
assert.match(feature, /referenceDataUrl = preparedDataUrl/);
assert.match(feature, /getUser\(\)/);
assert.match(feature, /Sesi perlu dihubungkan ulang/);
assert.match(feature, /var puter = window\.puter;[\s\S]*?puter\.auth\.signIn\(\{ request_auth: true \}\)/);
const connectHelper = feature.match(/async function connectPuter\(\) \{[\s\S]*?\n    \}/)[0];
assert.doesNotMatch(connectHelper, /runtime\.loadSdk/);
assert.match(connectHelper, /var puter = window\.puter;[\s\S]*?await puter\.auth\.signIn/);
const generationHelper = feature.match(/function generateVideoWithPuter\(params\) \{[\s\S]*?\n  \}/)[0];
assert.doesNotMatch(generationHelper, /\bawait\b|loadSdk\(/);
assert.match(generationHelper, /var request = sdk\.ai\.txt2vid\(params\.prompt, options\)/);
assert.match(generationHelper, /options\.puter_output_path = outputPath/);
assert.match(feature, /sdk\.fs\.read\(outputPath\)/);
assert.match(feature, /sdk\.fs\.delete\(outputPath\)/);
assert.match(feature, /id="nvgCost"/);
assert.match(feature, /Perkiraan biaya/);
assert.match(feature, /video\.onloadedmetadata = reportActualDuration/);
assert.match(feature, /diminta " \+ requestedSeconds \+ "s · hasil " \+ actualSeconds/);
assert.match(feature, /penyesuaian allowance/);
assert.match(css, /\.nvg-cost/);
assert.match(css, /\.nvg-message\.is-warning/);
assert.match(css, /\.nvg-auth-retry/);
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
  "window.__puterVideoTest={models:videoModels,normalize:normalizePuterVideoResult,generate:generateVideoWithPuter,buildOptions:buildVideoOptions,errorMessage:videoErrorMessage,validateImage:validateReferenceImage,cost:estimatedVideoCost};})();"
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
assert.equal(helpers.cost(helpers.models[0], 8), 0.8);
assert.equal(helpers.cost(helpers.models[1], 8), 2.4);
assert.equal(helpers.cost(helpers.models[2], 8), 1.2);
assert.equal(helpers.cost(helpers.models[3], 8), 3.2);

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

  const callOrder = [];
  sandbox.window.puter = {
    ai: {
      txt2vid(prompt, options) {
        callOrder.push({ prompt, options });
        return Promise.resolve({ asset_url: "https://assets.puter.site/direct-tap.mp4" });
      }
    },
    fs: {
      read() { throw new Error("fallback tidak seharusnya dipakai"); },
      delete() { return Promise.resolve(); }
    }
  };
  const generation = helpers.generate({ prompt: "Direct tap", modelId: "sora-2", duration: 4, aspect: "9:16", mode: "text" });
  assert.equal(callOrder.length, 1, "txt2vid harus terpanggil sinkron sebelum promise ditunggu");
  assert.equal(callOrder[0].prompt, "Direct tap");
  assert.match(callOrder[0].options.puter_output_path, /^nexora-ai-video-\d+\.mp4$/);
  const generated = await generation;
  assert.match(generated.videoUrl, /direct-tap\.mp4$/);

  let fallbackRead = 0;
  let temporaryDeleted = 0;
  sandbox.window.puter = {
    ai: {
      txt2vid() { return Promise.resolve({ success: true, result: { unknown_media: true } }); }
    },
    fs: {
      read(path) {
        fallbackRead += 1;
        assert.match(path, /^nexora-ai-video-\d+\.mp4$/);
        return Promise.resolve(new Blob(["recovered video"], { type: "video/mp4" }));
      },
      delete(path) {
        temporaryDeleted += 1;
        assert.match(path, /^nexora-ai-video-\d+\.mp4$/);
        return Promise.resolve();
      }
    }
  };
  const recovered = await helpers.generate({ prompt: "Recover file", modelId: "sora-2", duration: 4, aspect: "9:16", mode: "text" });
  assert.equal(recovered.metadata.sourceType, "PuterFS");
  assert.equal(recovered.blob.type, "video/mp4");
  assert.equal(fallbackRead, 1);
  assert.equal(temporaryDeleted, 1);
}

Promise.all([verifyImageValidation(), verifyMediaNormalization()]).then(() => {
  console.log("Nexora AI Video HF47 lulus: biaya sebelum generate, durasi diminta vs aktual, allowance warning, Blob recovery, mobile, dan zero-backend tervalidasi.");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

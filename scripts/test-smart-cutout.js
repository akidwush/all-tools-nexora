"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const Core = require(path.join(root, "assets/js/features/smart-cutout-core.js"));
const config = require(path.join(root, "assets/config.js"));

const tool = config.tools.tools.find((item) => item.id === "smartcutout");
assert.ok(tool, "Smart Cutout wajib ada di katalog Image/Tools");
assert.equal(tool.name, "Nexora Smart Cutout");
assert.equal(tool.runtime.module, "smart-cutout");
assert.equal(tool.runtime.handler, "renderNexoraSmartCutout");
assert.equal(config.modules["smart-cutout"].js.length, 2, "Core harus dimuat sebelum UI");

const main = read("assets/js/features/smart-cutout.js");
const css = read("assets/css/features/smart-cutout.css");
const shell = read("assets/js/core/shell.js");
const lazy = read("assets/js/core/lazy-loader.js");
const app = read("assets/js/core/app.js");
const vercel = JSON.parse(read("vercel.json"));

for (const token of [
  "image/jpeg", "image/png", "image/webp", "MAX_FILE_BYTES", "Select +", "Remove −", "nscUndo", "nscReset",
  "Crop to Object", "Extract Object", "Download PNG", "Mask PNG", "URL.revokeObjectURL", "createImageBitmap",
  "pointerdown", "pointermove", "destination-in", "image/png", "navigator.deviceMemory"
]) assert.ok(main.includes(token), `UI Smart Cutout belum memuat ${token}`);

for (const token of [
  "vision_bundle.mjs?v=0.10.22-nexora1", "FilesetResolver.forVisionTasks", "InteractiveSegmenter.createFromOptions",
  "magic_touch.tflite", "getAsFloat32Array", "getAsUint8Array", "outputConfidenceMasks:true", "outputCategoryMask:true", "delegate:'CPU'", "nextFrame",
  "new Float32Array", "new Uint8Array", "positive", "negative", "pointMasks", "MAX_POINTS=8", "result.close", "releaseInference", "closeModel"
]) assert.ok(main.includes(token), `Runtime MagicTouch belum memuat ${token}`);

assert.doesNotMatch(main, /new Worker\(/, "Runtime final tidak boleh kembali memuat worker SlimSAM lama");
assert.doesNotMatch(main, /SLIMSAM|slimsam-77-uniform|transformers\.min/i, "Brand/runtime SlimSAM lama harus hilang dari jalur aktif");
assert.match(main, /var maxSide=memory<=3\?512:640/, "Inference mobile harus dibatasi ke 512/640px");
assert.match(main, /positive\[m\]-\(negative\?negative\[m\]:0\)/, "Titik Remove harus mengurangi mask positive");
assert.ok(lazy.includes("smart-cutout-v3"), "Cache key Smart Cutout harus diperbarui");
assert.ok(css.includes(".nsc-stage-empty[hidden]{display:none!important}"), "Overlay loading harus benar-benar hilang setelah model siap");
assert.ok(main.includes("decodeSelection(true)"), "Titik yang gagal harus di-rollback agar batas refine tidak habis");

const localAssets = {
  "assets/vendor/mediapipe/vision_bundle.mjs": 137809,
  "assets/vendor/mediapipe/wasm/vision_wasm_internal.js": 204284,
  "assets/vendor/mediapipe/wasm/vision_wasm_internal.wasm": 9574032,
  "assets/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js": 204137,
  "assets/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm": 9448638,
  "assets/models/mediapipe/magic_touch.tflite": 6227884
};
for (const [file, size] of Object.entries(localAssets)) {
  assert.equal(fs.statSync(path.join(root, file)).size, size, `${file} hilang atau unduhannya tidak lengkap`);
}
assert.ok(read("assets/vendor/mediapipe/LICENSE.md").includes("Apache License"));
assert.ok(read("assets/models/mediapipe/LICENSE.md").includes("magic_touch.tflite"));

for (const forbidden of ["supabase", "api external", "base64 image", "pixel log"]) {
  assert.equal(main.toLowerCase().includes(forbidden), false, `Inference lokal tidak boleh memuat ${forbidden}`);
}

assert.ok(shell.includes("smartcutout:{renderer:'renderNexoraSmartCutout'"), "Universal room belum mendaftarkan Smart Cutout");
assert.ok(shell.includes("MagicTouch · Local AI"), "Badge katalog belum memakai engine final");
assert.ok(app.includes("case 'smartcutout': renderNexoraSmartCutout(body)"), "Dispatcher belum mendaftarkan Smart Cutout");
assert.match(css, /@media\(max-width:390px\)/, "Layout 390px belum diaudit");
assert.match(css, /min-height:44px/, "Target sentuh minimal 44px belum diterapkan");
assert.match(css, /touch-action:none/, "Canvas belum mengendalikan gesture sentuh");

const fit4k = Core.fitSize(3840, 2160, 640);
assert.deepEqual(fit4k, { width: 640, height: 360, scale: 640 / 3840 });
const point = Core.pointFromRect(195, 300, { left: 15, top: 105, width: 360, height: 390 });
assert.equal(point.x, 0.5);
assert.equal(point.y, 0.5);

const mask = new Uint8Array(10 * 8);
for (let y = 2; y <= 5; y++) for (let x = 3; x <= 7; x++) mask[y * 10 + x] = 255;
assert.deepEqual(Core.boundingBox(mask, 10, 8), { x: 3, y: 2, width: 5, height: 4 });
const plan = Core.cropPlan(Core.boundingBox(mask, 10, 8), 10, 8, 1000, 800, true, 0.03);
assert.ok(plan.width > 500 && plan.height >= 400 && plan.width <= 1000 && plan.height <= 800);
assert.equal(Core.outputSize(3840, 2160, 12000000).downscaled, false, "4K harus tetap full resolution pada profil mobile");
assert.equal(Core.outputSize(8000, 6000, 12000000).downscaled, true, "Gambar ekstrem harus memakai memory guard");

const modelHeaders = vercel.headers.find((item) => item.source === "/assets/models/(.*)");
const runtimeHeaders = vercel.headers.find((item) => item.source === "/assets/vendor/mediapipe/(.*)");
assert.ok(modelHeaders && runtimeHeaders, "Model dan runtime lokal harus memiliki cache header khusus");
for (const group of [modelHeaders, runtimeHeaders]) assert.ok(group.headers.some((item) => item.key === "Cache-Control" && item.value.includes("immutable")), "Asset AI lokal harus dicache browser");

console.log("Smart Cutout lulus: MediaPipe MagicTouch lokal, WASM SIMD/fallback, point refine, crop/export, cleanup, cache, dan mobile geometry tervalidasi.");

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
const worker = read("assets/js/workers/smart-cutout.worker.js");
const css = read("assets/css/features/smart-cutout.css");
const shell = read("assets/js/core/shell.js");
const app = read("assets/js/core/app.js");
const vercel = JSON.parse(read("vercel.json"));

for (const token of [
  "image/jpeg", "image/png", "image/webp", "MAX_FILE_BYTES", "Select +", "Remove −", "nscUndo", "nscReset",
  "Crop to Object", "Extract Object", "Download PNG", "Mask PNG", "URL.revokeObjectURL", "createImageBitmap",
  "pointerdown", "pointermove", "destination-in", "image/png", "navigator.deviceMemory"
]) assert.ok(main.includes(token), `UI Smart Cutout belum memuat ${token}`);

for (const token of [
  "Xenova/slimsam-77-uniform", "@huggingface/transformers@3.5.0", "get_image_embeddings", "input_points",
  "input_labels", "post_process_masks", "webgpu", "fp16", "wasm", "q8", "useBrowserCache", "useWasmCache",
  "dispose", "reset-image"
]) assert.ok(worker.includes(token), `Worker Smart Cutout belum memuat ${token}`);

assert.doesNotMatch(worker, /device\s*:\s*['"]wasm['"]/, "Transformers.js 3.5 memilih WASM saat opsi device tidak diberikan");
assert.match(worker, /if\(device==='webgpu'\)options\.device='webgpu'/, "Hanya backend WebGPU yang boleh dikirim sebagai opsi device");
assert.match(worker, /wasm\.numThreads=1/, "Fallback mobile harus membatasi WASM ke satu thread");
assert.ok(main.includes("smart-cutout2"), "Versi worker harus berubah agar browser tidak memakai runtime lama dari cache");

for (const forbidden of ["supabase", "api external", "base64 image", "pixel log"]) {
  assert.equal((main + worker).toLowerCase().includes(forbidden), false, `Inference lokal tidak boleh memuat ${forbidden}`);
}

assert.ok(shell.includes("smartcutout:{renderer:'renderNexoraSmartCutout'"), "Universal room belum mendaftarkan Smart Cutout");
assert.ok(app.includes("case 'smartcutout': renderNexoraSmartCutout(body)"), "Dispatcher belum mendaftarkan Smart Cutout");
assert.match(css, /@media\(max-width:390px\)/, "Layout 390px belum diaudit");
assert.match(css, /min-height:44px/, "Target sentuh minimal 44px belum diterapkan");
assert.match(css, /touch-action:none/, "Canvas belum mengendalikan gesture sentuh");

const fit4k = Core.fitSize(3840, 2160, 1024);
assert.deepEqual(fit4k, { width: 1024, height: 576, scale: 1024 / 3840 });
const point = Core.pointFromRect(195, 300, { left: 15, top: 105, width: 360, height: 390 });
assert.equal(point.x, 0.5);
assert.equal(point.y, 0.5);
assert.equal(Core.bestMaskIndex([0.4, 0.91, 0.7]), 1);

const mask = new Uint8Array(10 * 8);
for (let y = 2; y <= 5; y++) for (let x = 3; x <= 7; x++) mask[y * 10 + x] = 255;
assert.deepEqual(Core.boundingBox(mask, 10, 8), { x: 3, y: 2, width: 5, height: 4 });
const plan = Core.cropPlan(Core.boundingBox(mask, 10, 8), 10, 8, 1000, 800, true, 0.03);
assert.ok(plan.width > 500 && plan.height >= 400 && plan.width <= 1000 && plan.height <= 800);
assert.equal(Core.outputSize(3840, 2160, 12000000).downscaled, false, "4K harus tetap full resolution pada profil mobile");
assert.equal(Core.outputSize(8000, 6000, 12000000).downscaled, true, "Gambar ekstrem harus memakai memory guard");

const csp = vercel.headers[0].headers.find((item) => item.key === "Content-Security-Policy").value;
for (const host of ["https://cdn.jsdelivr.net", "https://huggingface.co", "https://*.hf.co"]) assert.ok(csp.includes(host), `CSP belum mengizinkan ${host}`);
assert.ok(csp.includes("worker-src 'self' blob:"), "CSP harus mengizinkan worker lokal");

console.log("Smart Cutout lulus: registry, SlimSAM worker, WebGPU/WASM, point refine, crop/export, cleanup, CSP, dan mobile geometry tervalidasi.");

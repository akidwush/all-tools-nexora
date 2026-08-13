"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const vendorRoot = path.join(root, "assets", "vendor");

const ASSETS = [
  {
    relative: "tfjs/tf.min.js",
    minBytes: 500000,
    urls: [
      "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
      "https://unpkg.com/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
    ],
  },
  {
    relative: "upscaler/upscaler.min.js",
    minBytes: 10000,
    urls: [
      "https://cdn.jsdelivr.net/npm/upscaler@1.0.0/dist/browser/umd/upscaler.min.js",
      "https://unpkg.com/upscaler@1.0.0/dist/browser/umd/upscaler.min.js",
    ],
  },
  {
    relative: "esrgan-slim/x2/model.json",
    minBytes: 5000,
    urls: [
      "https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0-beta.10/models/x2/model.json",
      "https://unpkg.com/@upscalerjs/esrgan-slim@1.0.0-beta.10/models/x2/model.json",
    ],
  },
  {
    relative: "esrgan-slim/x2/group1-shard1of1.bin",
    minBytes: 800000,
    urls: [
      "https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0-beta.10/models/x2/group1-shard1of1.bin",
      "https://unpkg.com/@upscalerjs/esrgan-slim@1.0.0-beta.10/models/x2/group1-shard1of1.bin",
    ],
  },
];

function looksLikeHtml(buffer) {
  const head = buffer.subarray(0, Math.min(buffer.length, 2048)).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head") || head.startsWith("<body");
}

function validateBuffer(asset, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < asset.minBytes) {
    throw new Error(`${asset.relative} terlalu kecil (${buffer?.length || 0} byte)`);
  }
  if (/\.(?:js|json)$/i.test(asset.relative) && looksLikeHtml(buffer)) {
    throw new Error(`${asset.relative} berisi HTML, bukan aset vendor`);
  }
  if (asset.relative.endsWith("model.json")) {
    const model = JSON.parse(buffer.toString("utf8"));
    if (!model || !model.modelTopology || !Array.isArray(model.weightsManifest)) {
      throw new Error("model.json ESRGAN tidak valid");
    }
    const paths = model.weightsManifest.flatMap((entry) => Array.isArray(entry.paths) ? entry.paths : []);
    if (!paths.includes("group1-shard1of1.bin")) {
      throw new Error("weightsManifest ESRGAN tidak menunjuk shard yang diharapkan");
    }
  }
}

function validateExisting(asset) {
  const filename = path.join(vendorRoot, asset.relative);
  if (!fs.existsSync(filename)) return false;
  try {
    validateBuffer(asset, fs.readFileSync(filename));
    return true;
  } catch {
    return false;
  }
}

async function fetchBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { "user-agent": "Nexora-Build/6.3.18-hf2" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function ensureAsset(asset) {
  const filename = path.join(vendorRoot, asset.relative);
  if (validateExisting(asset)) {
    console.log(`[AI vendor] OK ${asset.relative}`);
    return;
  }

  fs.mkdirSync(path.dirname(filename), { recursive: true });
  let lastError = null;
  for (const url of asset.urls) {
    try {
      console.log(`[AI vendor] Fetch ${asset.relative} <- ${url}`);
      const buffer = await fetchBuffer(url);
      validateBuffer(asset, buffer);
      const tmp = `${filename}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, filename);
      console.log(`[AI vendor] Ready ${asset.relative} (${buffer.length} byte)`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[AI vendor] gagal dari ${url}: ${error.message}`);
    }
  }
  throw new Error(`Gagal menyiapkan ${asset.relative}: ${lastError?.message || "semua sumber gagal"}`);
}

(async () => {
  if (typeof fetch !== "function") throw new Error("Node.js 18+ diperlukan karena build memakai fetch().");
  for (const asset of ASSETS) await ensureAsset(asset);
  console.log("AI vendor siap untuk build: TensorFlow.js + UpscalerJS + ESRGAN Slim 2x.");
})().catch((error) => {
  console.error(`AI vendor build gagal: ${error.stack || error.message}`);
  process.exit(1);
});

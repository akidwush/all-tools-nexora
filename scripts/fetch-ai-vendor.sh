#!/data/data/com.termux/files/usr/bin/sh
set -eu

ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd -P)
VENDOR="$ROOT/assets/vendor"
TMP="$ROOT/.nexora-ai-vendor-tmp-$$"
mkdir -p "$TMP" "$VENDOR/tfjs" "$VENDOR/upscaler" "$VENDOR/esrgan-slim/x2" "$VENDOR/licenses"
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

validate_vendor_dir() {
  target=$1
  node - "$target" <<'NODE' >/dev/null 2>&1
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const files = [
  ['tfjs/tf.min.js', 500000],
  ['upscaler/upscaler.min.js', 10000],
  ['esrgan-slim/x2/model.json', 5000],
  ['esrgan-slim/x2/group1-shard1of1.bin', 800000],
];
for (const [name, min] of files) {
  const p = path.join(root, name);
  if (!fs.existsSync(p) || fs.statSync(p).size < min) process.exit(1);
}
const model = JSON.parse(fs.readFileSync(path.join(root, 'esrgan-slim/x2/model.json'), 'utf8'));
if (!model.modelTopology || !Array.isArray(model.weightsManifest)) process.exit(1);
const paths = model.weightsManifest.flatMap(row => row.paths || []);
if (!paths.includes('group1-shard1of1.bin')) process.exit(1);
NODE
}

if validate_vendor_dir "$VENDOR"; then
  printf '%s\n' 'Vendor AI pinned sudah tersedia; download dilewati.'
  exit 0
fi

fetch() {
  url=$1
  output=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --retry-delay 1 --connect-timeout 20 --max-time 180 "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$output" "$url"
  else
    printf '%s\n' 'ERROR: curl atau wget diperlukan untuk mengambil aset AI vendor.' >&2
    exit 1
  fi
}

TF_URL='https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'
UPSCALER_URL='https://cdn.jsdelivr.net/npm/upscaler@1.0.0/dist/browser/umd/upscaler.min.js'
MODEL_URL='https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0-beta.10/models/x2/model.json'
WEIGHTS_URL='https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0-beta.10/models/x2/group1-shard1of1.bin'

printf '%s\n' 'Mengambil vendor AI pinned untuk Local ESRGAN WebGL...'
fetch "$TF_URL" "$TMP/tf.min.js"
fetch "$UPSCALER_URL" "$TMP/upscaler.min.js"
fetch "$MODEL_URL" "$TMP/model.json"
fetch "$WEIGHTS_URL" "$TMP/group1-shard1of1.bin"

node - "$TMP" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const checks = [
  ['tf.min.js', 500000],
  ['upscaler.min.js', 10000],
  ['model.json', 5000],
  ['group1-shard1of1.bin', 800000],
];
for (const [name, min] of checks) {
  const p = path.join(root, name);
  const stat = fs.statSync(p);
  if (stat.size < min) throw new Error(`${name} terlalu kecil: ${stat.size}`);
}
const model = JSON.parse(fs.readFileSync(path.join(root, 'model.json'), 'utf8'));
if (!model.modelTopology || !Array.isArray(model.weightsManifest)) throw new Error('model.json ESRGAN tidak valid');
const paths = model.weightsManifest.flatMap(row => row.paths || []);
if (!paths.includes('group1-shard1of1.bin')) throw new Error('weightsManifest ESRGAN tidak menunjuk group1-shard1of1.bin');
NODE

mv "$TMP/tf.min.js" "$VENDOR/tfjs/tf.min.js"
mv "$TMP/upscaler.min.js" "$VENDOR/upscaler/upscaler.min.js"
mv "$TMP/model.json" "$VENDOR/esrgan-slim/x2/model.json"
mv "$TMP/group1-shard1of1.bin" "$VENDOR/esrgan-slim/x2/group1-shard1of1.bin"

printf '%s\n' 'Vendor AI siap: TensorFlow.js 4.22.0 + UpscalerJS 1.0.0 + ESRGAN Slim 2× beta.10.'

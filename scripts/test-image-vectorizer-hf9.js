const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const root = path.resolve(__dirname, "..");

const ui = fs.readFileSync(path.join(root, "assets/js/features/image-vectorizer.js"), "utf8");
const apiRoute = fs.readFileSync(path.join(root, "api/tool-health.js"), "utf8");
const backend = fs.readFileSync(path.join(root, "lib/freeconvert-vectorizer.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/features/image-vectorizer.css"), "utf8");
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");

for (const token of [
  "/api/tool-health?mode=image-vectorizer",
  "uploadDirect",
  "pollResult",
  "action:'prepare'",
  "action:'start'",
  "action:'result'",
  "sanitizeSvg",
  "preserveAspectRatio",
  "fit 100%",
  "FreeConvert"
]) {
  assert.ok(ui.includes(token), `Frontend missing: ${token}`);
}

assert.ok(!ui.includes("vtracer-worker"), "Frontend still references VTracer worker");
assert.ok(!ui.includes("FREECONVERT_API_KEY"), "API key leaked into frontend");

assert.ok(
  apiRoute.includes('mode") === "image-vectorizer"'),
  "Image Vectorizer mode route missing"
);

assert.ok(
  apiRoute.includes("handleFreeConvertVectorizer"),
  "FreeConvert handler not wired"
);

for (const token of [
  "FREECONVERT_API_KEY",
  "/process/import/upload",
  "/process/convert",
  "/process/export/url",
  "prepareUpload",
  "startConversion",
  "fetchResult",
  "handleFreeConvertVectorizer"
]) {
  assert.ok(backend.includes(token), `Backend missing: ${token}`);
}

assert.ok(
  envExample.includes("FREECONVERT_API_KEY="),
  "FREECONVERT_API_KEY missing from env example"
);

assert.ok(
  !envExample.includes("NEXT_PUBLIC_FREECONVERT_API_KEY"),
  "FreeConvert API key must not be public"
);

for (const token of [
  "overflow-x:clip",
  "100dvh",
  "@media(max-width:720px)",
  "@media(max-width:430px)",
  "width:auto!important",
  "max-height:min(68dvh,720px)"
]) {
  assert.ok(css.includes(token), `CSS missing: ${token}`);
}

console.log(
  "Image Vectorizer FreeConvert regression test lulus: server-only API key, signed direct upload, convert/export polling, SVG sanitization, route wiring, dan fit-safe mobile preview valid."
);

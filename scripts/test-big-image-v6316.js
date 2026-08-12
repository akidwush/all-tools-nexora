"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const {
  MAX_UPLOAD_BYTES,
  STORAGE_BUCKET,
  classifyProviderError,
  createJobToken,
  normalizeOptions,
  sniffRaster,
  validTaskId,
  verifyJobToken
} = require("../lib/bigjpg-upscaler");

assert.equal(MAX_UPLOAD_BYTES, 4_000_000);
assert.equal(STORAGE_BUCKET, "big-image-inputs");
assert.deepEqual(normalizeOptions({ style: "art", noise: "3", scale: "4" }), { style: "art", noise: "3", scale: "4" });
assert.deepEqual(normalizeOptions({}), { style: "art", noise: "1", scale: "1" });
assert.throws(() => normalizeOptions({ style: "vector" }), (error) => error.code === "BIGJPG_STYLE_INVALID");
assert.throws(() => normalizeOptions({ noise: "9" }), (error) => error.code === "BIGJPG_NOISE_INVALID");
assert.throws(() => normalizeOptions({ scale: "16" }), (error) => error.code === "BIGJPG_SCALE_INVALID");

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
const jpg = Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0,0]);
assert.deepEqual(sniffRaster(png, "image/png"), { mime: "image/png", extension: "png" });
assert.deepEqual(sniffRaster(jpg, "image/jpeg"), { mime: "image/jpeg", extension: "jpg" });
assert.throws(() => sniffRaster(Buffer.from("not-an-image"), "image/png"), (error) => error.code === "BIGJPG_FILE_TYPE_INVALID");
assert.equal(validTaskId("task_12345678"), "task_12345678");
assert.equal(validTaskId("../private"), null);

assert.equal(classifyProviderError({ status: "param_error" }), "parameter");
assert.equal(classifyProviderError({ status: "quota_limit" }), "quota");
assert.equal(classifyProviderError({ status: "api_key_error" }), "auth");
assert.equal(classifyProviderError({ status: "input_download_error" }), "input");

const previousKey = process.env.BIGJPG_API_KEY;
const previousSecret = process.env.BIGJPG_JOB_SECRET;
process.env.BIGJPG_API_KEY = "BIGJPG_TEST_KEY";
process.env.BIGJPG_JOB_SECRET = "BIGJPG_TEST_JOB_SECRET_WITH_AT_LEAST_32_BYTES";
try {
  const token = createJobToken("task_12345678", "temporary/2026-08-12/123e4567-e89b-12d3-a456-426614174000.png");
  const verified = verifyJobToken(token, "task_12345678");
  assert.equal(verified.taskId, "task_12345678");
  assert.match(verified.sourcePath, /^temporary\//);
  assert.throws(() => verifyJobToken(token, "task_87654321"), (error) => error.code === "BIGJPG_JOB_TOKEN_MISMATCH");
  assert.throws(() => verifyJobToken(token.slice(0, -2) + "aa", "task_12345678"), (error) => error.code === "BIGJPG_JOB_TOKEN_INVALID");
} finally {
  if (previousKey === undefined) delete process.env.BIGJPG_API_KEY; else process.env.BIGJPG_API_KEY = previousKey;
  if (previousSecret === undefined) delete process.env.BIGJPG_JOB_SECRET; else process.env.BIGJPG_JOB_SECRET = previousSecret;
}

const ui = read("assets/js/features/big-image.js");
for (const token of [
  "renderBigImage", "/api/big-image", "upload=1", "start-url", "jobToken", "pollTask",
  "action:\"cleanup\"", "Before vs After", "body.__nxCleanup"
]) assert.ok(ui.includes(token), `Frontend Big Image kehilangan ${token}`);
assert.doesNotMatch(ui, /BIGJPG_API_KEY/);

const css = read("assets/css/features/big-image.css");
for (const token of ["overflow-x:clip", "100dvh", "object-fit:contain!important", "@media(max-width:620px)", "@media(max-width:430px)", "prefers-reduced-motion"]) {
  assert.ok(css.includes(token), `CSS Big Image kehilangan ${token}`);
}

const backend = read("lib/bigjpg-upscaler.js");
for (const token of [
  "BIGJPG_API_KEY", "X-API-KEY", "https://bigjpg.com/api", "assertPublicUrl", "anonymousHash",
  "BIGJPG_HOURLY_IP_LIMIT", "BIGJPG_DAILY_TASK_LIMIT", "createHmac", "deletePrivateSources",
  "big_image_jobs", "big-image-inputs"
]) assert.ok(backend.includes(token), `Backend Big Image kehilangan ${token}`);

const apiRoute = read("api/tool-health.js");
assert.ok(apiRoute.includes("handleBigImage"));
assert.ok(apiRoute.includes('mode") === "big-image"'));
const server = read("serve-local.js");
assert.ok(server.includes('mode === "big-image"'));
assert.ok(server.includes('"/api/big-image": { file: "api/tool-health.js", mode: "big-image" }'));

const vercel = JSON.parse(read("vercel.json"));
assert.ok(vercel.rewrites.some((row) => row.source === "/api/big-image" && row.destination.includes("mode=big-image")));
assert.ok(JSON.parse(read("route-manifest.json")).apiRoutes.includes("/api/big-image"));

const manifest = JSON.parse(read("assets/module-manifest.json"));
assert.equal(manifest.tools.bigimage, "big-image");
for (const asset of [...manifest.modules["big-image"].css, ...manifest.modules["big-image"].js]) assert.ok(fs.existsSync(path.join(root, asset)));

const migration = read("database/migrations/015_big_image_bigjpg.sql");
for (const token of ["create table if not exists public.big_image_jobs", "insert into storage.buckets", "public = false", "'bigimage'", "on conflict (id) do update"]) {
  assert.ok(migration.includes(token), `Migration Big Image kehilangan ${token}`);
}
assert.ok(read(".env.example").includes("BIGJPG_API_KEY="));
assert.ok(read(".env.example").includes("BIGJPG_JOB_SECRET="));
assert.ok(read("README.md").includes("database/migrations/015_big_image_bigjpg.sql"));

const apiFiles = [];
(function walk(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())walk(target); else if(target.endsWith(".js"))apiFiles.push(target);
  }
})(path.join(root,"api"));
assert.equal(apiFiles.length,12);

console.log("Big Image v6.3.16 tests lulus: Bigjpg server-only, private signed upload, HMAC job, rate limit, cleanup, polling, mobile preview, migration, dan 12-function limit aman.");

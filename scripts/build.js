"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");

function run(script) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run("check-project.js");
if (process.env.VERCEL === "1") {
  // The complete regression suite is enforced before push and in GitHub Actions.
  // Keep Vercel's build process small so its runner cannot terminate the nested
  // 114-process suite midway without a useful test failure.
  for (const script of [
    "test-multi-ai.js",
    "test-elevenlabs-studio.js",
    "test-elevenlabs-local.js",
    "test-security-authorization-v7.js",
    "test-serverless-limit.js"
  ]) run(script);
  console.log("Vercel deployment gate lulus: Multi-AI, ElevenLabs Studio, authorization, dan batas Functions tervalidasi.");
} else {
  run("run-tests.js");
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const filename of ["index.html", "about.html", "feedback.html", "anime-gallery.html", "avatar-studio.html", "favicon.svg", "route-manifest.json"]) {
  fs.copyFileSync(path.join(root, filename), path.join(output, filename));
}
fs.cpSync(path.join(root, "assets"), path.join(output, "assets"), { recursive: true, force: true });
fs.cpSync(path.join(root, "admin"), path.join(output, "admin"), { recursive: true, force: true });

try { require("./audit-public-build.js").auditPublicBuild(output); }
catch (error) {
  console.error(error.message || "Audit keamanan bundle publik gagal.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets/module-manifest.json"), "utf8"));
const expected = [
  "public/index.html", "public/about.html", "public/feedback.html", "public/anime-gallery.html", "public/avatar-studio.html", "public/favicon.svg",
  "public/admin/index.html", "public/admin/login.html", "public/assets/js/core/app.js",
  "public/assets/config.js", "public/assets/js/core/tool-registry.js", "public/assets/module-manifest.json",
  ...Object.values(manifest.modules || {}).flatMap((module) => [...(module.css || []), ...(module.js || [])].map((file) => `public/${file}`))
];
const missing = [...new Set(expected)].filter((relative) => !fs.existsSync(path.join(root, relative)));
if (missing.length) {
  console.error(`Build gagal membuat ${missing.length} file: ${missing.join(", ")}`);
  process.exit(1);
}

const files = (function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
})(output);
const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);
console.log(`Build selesai: public/ berisi ${files.length} file (${(bytes / 1024 / 1024).toFixed(2)} MB).`);

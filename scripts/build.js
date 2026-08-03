const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const required = ["index.html", "about.html", "feedback.html", "vercel.json", "api/health.js", "api/feedback.js"];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));

if (missing.length) {
  console.error(`Build gagal. File hilang: ${missing.join(", ")}`);
  process.exit(1);
}

for (const filename of ["package.json", "vercel.json", "route-manifest.json"]) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, filename), "utf8"));
  } catch (error) {
    console.error(`Build gagal. ${filename} bukan JSON valid: ${error.message}`);
    process.exit(1);
  }
}

console.log("Build check selesai: proyek statis + serverless siap untuk Vercel.");

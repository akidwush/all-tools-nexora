const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");

const required = [
  "index.html",
  "about.html",
  "feedback.html",
  "favicon.svg",
  "assets/branding.js",
  "vercel.json",
  "api/health.js",
  "api/feedback.js",
  "api/database.js",
  "lib/database.js",
  "database/schema.sql",
];

const missing = required.filter(
  (file) => !fs.existsSync(path.join(root, file))
);

if (missing.length) {
  console.error(
    `Build gagal. File hilang: ${missing.join(", ")}`
  );
  process.exit(1);
}

for (const filename of [
  "package.json",
  "vercel.json",
  "route-manifest.json",
]) {
  try {
    JSON.parse(
      fs.readFileSync(path.join(root, filename), "utf8")
    );
  } catch (error) {
    console.error(
      `Build gagal. ${filename} bukan JSON valid: ${error.message}`
    );
    process.exit(1);
  }
}

fs.rmSync(output, {
  recursive: true,
  force: true,
});

fs.mkdirSync(output, {
  recursive: true,
});

for (const filename of [
  "index.html",
  "about.html",
  "feedback.html",
  "favicon.svg",
]) {
  fs.copyFileSync(
    path.join(root, filename),
    path.join(output, filename)
  );
}

fs.cpSync(
  path.join(root, "assets"),
  path.join(output, "assets"),
  {
    recursive: true,
    force: true,
  }
);

const generated = [
  "public/index.html",
  "public/about.html",
  "public/feedback.html",
  "public/favicon.svg",
  "public/assets/branding.js",
];

const failed = generated.filter(
  (file) => !fs.existsSync(path.join(root, file))
);

if (failed.length) {
  console.error(
    `Build gagal membuat output: ${failed.join(", ")}`
  );
  process.exit(1);
}

console.log(
  "Build selesai: output statis dibuat di public/ dan API serverless tetap berada di api/."
);
